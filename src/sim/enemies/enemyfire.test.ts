import { describe, expect, it } from 'vitest';
import { makeFlipper } from './flipper';
import { makeTanker } from './tanker';
import { makeSpiker } from './spiker';
import { makePulsar } from './pulsar';
import { makeRng } from '../rng';
import { paramsForLevel } from '../difficultyCurve';
import type { Enemy } from '../types';
import { makeLiveConfig } from '../../__tests__/fixtures/liveConfig';
import { makeInput } from '../../__tests__/fixtures/input';
import { playingSim } from '../../__tests__/fixtures/playing';

// §13 enemy-fire area (Task 4.6). Level 17 has all kinds defined.

const cfg = makeLiveConfig();
const lp = paramsForLevel(17, cfg.difficulty);

function armed(e: Enemy, over: Partial<Enemy> = {}): Enemy {
  return {
    ...e,
    depth: 0.5,
    prevDepth: 0.5,
    flipTimer: 100,
    fireTimer: 0.001,
    ...over,
  };
}

describe('enemy fire scheduler (§6)', () => {
  it('an eligible enemy fires from its depth/lane, emits enemyShot, redraws its delay', () => {
    const { sim, s } = playingSim(cfg, 17);
    const e = armed(makeFlipper(3, lp, makeRng(1)));
    s.enemies = [e];
    const { events } = sim.tick(makeInput());
    expect(s.enemyShots).toHaveLength(1);
    expect(s.enemyShots[0]!.lane).toBe(3);
    expect(s.enemyShots[0]!.depth).toBe(e.depth); // spawns at the enemy
    expect(events).toContainEqual({ type: 'enemyShot' });
    expect(e.fireTimer).toBeGreaterThanOrEqual(0.5 * lp.fireInt);
    expect(e.fireTimer).toBeLessThanOrEqual(1.5 * lp.fireInt);
  });

  it('all three firing kinds fire; Spikers and Fuseballs never do', () => {
    for (const make of [makeFlipper, makeTanker, makePulsar]) {
      const { sim, s } = playingSim(cfg, 17);
      s.enemies = [armed(make(3, lp, makeRng(1)))];
      sim.tick(makeInput());
      expect(s.enemyShots).toHaveLength(1);
    }
    const { sim, s } = playingSim(cfg, 17);
    s.enemies = [armed(makeSpiker(3, lp, makeRng(1)), { fireTimer: -5 })];
    for (let i = 0; i < 120; i++) sim.tick(makeInput());
    expect(s.enemyShots).toHaveLength(0);
  });

  it('suppresses below the minimum firing depth and for rim residents (redraws)', () => {
    const { sim, s } = playingSim(cfg, 17);
    const shallow = armed(makeFlipper(3, lp, makeRng(1)), {
      depth: cfg.tuning.minFireDepth - 0.05,
      prevDepth: cfg.tuning.minFireDepth - 0.05,
    });
    const rim = armed(makeFlipper(5, lp, makeRng(2)), {
      depth: 0,
      prevDepth: 0,
    });
    s.enemies = [shallow, rim];
    sim.tick(makeInput());
    expect(s.enemyShots).toHaveLength(0);
    expect(shallow.fireTimer).toBeGreaterThan(0); // redrawn, not armed
    expect(rim.fireTimer).toBeGreaterThan(0);
  });

  it('suppresses mid-flip', () => {
    const { sim, s } = playingSim(cfg, 17);
    const e = armed(makeFlipper(3, lp, makeRng(1)), {
      flip: { from: 3, to: 4, progress: 0.2 },
    });
    s.enemies = [e];
    sim.tick(makeInput());
    expect(s.enemyShots).toHaveLength(0);
    expect(e.fireTimer).toBeGreaterThan(0);
  });

  it('suppresses at MaxShots in-flight enemy shots', () => {
    const { sim, s } = playingSim(cfg, 17);
    s.enemyShots = Array.from({ length: lp.maxShots }, (_, i) => ({
      lane: i,
      depth: 0.6,
      prevDepth: 0.6,
    }));
    const e = armed(makeFlipper(3, lp, makeRng(1)));
    s.enemies = [e];
    sim.tick(makeInput());
    expect(s.enemyShots).toHaveLength(lp.maxShots); // none added
    expect(e.fireTimer).toBeGreaterThan(0);
  });

  it('delays are uniform in [0.5, 1.5]×FireInt and vary across draws', () => {
    const { sim, s } = playingSim(cfg, 17);
    const e = armed(makeFlipper(3, lp, makeRng(1)), {
      depth: 0.1,
      prevDepth: 0.1,
    });
    s.enemies = [e];
    const draws = new Set<number>();
    for (let i = 0; i < 20; i++) {
      e.fireTimer = 0.0001; // force an attempt (suppressed: too shallow)
      sim.tick(makeInput());
      draws.add(e.fireTimer);
      expect(e.fireTimer).toBeGreaterThanOrEqual(0.5 * lp.fireInt);
      expect(e.fireTimer).toBeLessThanOrEqual(1.5 * lp.fireInt);
    }
    expect(draws.size).toBeGreaterThan(10);
  });
});

describe('enemy shots at the rim (§6.6)', () => {
  it('crossing depth 0 on the player’s lane kills', () => {
    const { sim, s } = playingSim(cfg, 17); // player lane 8
    s.enemyShots = [{ lane: 8, depth: 0.005, prevDepth: 0.02 }];
    const { events } = sim.tick(makeInput());
    expect(events).toContainEqual({ type: 'playerDied' });
    expect(s.enemyShots).toHaveLength(0); // gone either way
  });

  it('on any other lane it disappears at the rim, harmlessly', () => {
    const { sim, s } = playingSim(cfg, 17);
    s.enemyShots = [{ lane: 3, depth: 0.005, prevDepth: 0.02 }];
    const { events } = sim.tick(makeInput());
    expect(events.some((ev) => ev.type === 'playerDied')).toBe(false);
    expect(s.enemyShots).toHaveLength(0);
  });

  it('same-tick save: a player shot intercepting the killer shot saves the player', () => {
    const { sim, s } = playingSim(cfg, 17);
    // Enemy shot crosses depth 0 this tick (0.008 − eshot·TICK_SEC < 0);
    // the player shot meets it first in step 3.
    s.enemyShots = [{ lane: 8, depth: 0.008, prevDepth: 0.008 }];
    s.playerShots = [{ lane: 8, depth: 0.002, prevDepth: 0.002 }];
    const { events } = sim.tick(makeInput());
    expect(events.some((ev) => ev.type === 'playerDied')).toBe(false); // saved
    expect(s.enemyShots).toHaveLength(0);
    expect(s.playerShots).toHaveLength(0); // consumed (0 points)
    expect(s.score).toBe(0);
  });

  it('co-located control: without the interceptor, the identical setup kills', () => {
    const { sim, s } = playingSim(cfg, 17);
    s.enemyShots = [{ lane: 8, depth: 0.008, prevDepth: 0.008 }];
    const { events } = sim.tick(makeInput());
    expect(events).toContainEqual({ type: 'playerDied' });
  });
});

describe('never-pierces (§6)', () => {
  it('a player shot consumed by an enemy shot spares the enemy behind it', () => {
    const { sim, s } = playingSim(cfg, 17);
    const behind = armed(makeFlipper(4, lp, makeRng(1)), {
      depth: 0.52,
      prevDepth: 0.52,
      fireTimer: 100,
    });
    s.enemies = [behind];
    // Enemy shot slightly nearer the rim than the Flipper on the same lane.
    s.enemyShots = [{ lane: 4, depth: 0.5, prevDepth: 0.5 }];
    s.playerShots = [{ lane: 4, depth: 0.47, prevDepth: 0.47 }];
    sim.tick(makeInput());
    expect(s.enemies).toHaveLength(1); // Flipper untouched this tick
    expect(s.enemyShots).toHaveLength(0); // enemy shot destroyed
    expect(s.playerShots).toHaveLength(0); // player shot consumed
    expect(s.score).toBe(0); // shot-vs-shot is worth nothing (§7)
  });
});
