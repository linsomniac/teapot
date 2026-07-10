import { describe, expect, it } from 'vitest';
import { makeRng } from './rng';
import { paramsForLevel } from './difficultyCurve';
import { makeFlipper } from './enemies/flipper';
import { makeTanker } from './enemies/tanker';
import type { Enemy } from './types';
import { createSimFromState } from './sim';
import { makeLiveConfig } from '../__tests__/fixtures/liveConfig';
import { makeInput } from '../__tests__/fixtures/input';
import { playingSim } from '../__tests__/fixtures/playing';

// Task 5.4 — Superzapper (§5). §13 Superzapper area.

const cfg = makeLiveConfig();
const lp = paramsForLevel(5, cfg.difficulty);

function parked(e: Enemy, over: Partial<Enemy> = {}): Enemy {
  return { ...e, flipTimer: 100, fireTimer: 100, ...over };
}

describe('Superzapper (§5)', () => {
  it('FULL → PARTIAL destroys ALL on-well enemies — Tankers do not split, 0 points', () => {
    const { sim, s } = playingSim(cfg, 5);
    s.enemies = [
      parked(makeFlipper(2, lp, makeRng(1)), { depth: 0.5, prevDepth: 0.5 }),
      parked(makeTanker(4, lp, makeRng(2)), { depth: 0.7, prevDepth: 0.7 }),
      parked(makeFlipper(9, lp, makeRng(3)), { depth: 0.2, prevDepth: 0.2 }),
    ];
    const { events } = sim.tick(makeInput({ zap: true }));
    expect(s.enemies).toEqual([]); // everything gone — the Tanker released nothing
    expect(s.superzapper).toBe(1);
    expect(s.score).toBe(0); // Superzapper kills award nothing
    expect(events).toContainEqual({ type: 'superzap' });
    expect(events.filter((ev) => ev.type === 'enemyKilled')).toHaveLength(3);
    expect(events.filter((ev) => ev.type === 'flip')).toHaveLength(0); // no split flips
  });

  it('enemy shots and spikes are unaffected', () => {
    const { sim, s } = playingSim(cfg, 5);
    s.enemies = [
      parked(makeFlipper(2, lp, makeRng(1)), { depth: 0.5, prevDepth: 0.5 }),
    ];
    s.enemyShots = [{ lane: 3, depth: 0.7, prevDepth: 0.7 }];
    s.spikes = [{ lane: 4, topDepth: 0.5 }];
    sim.tick(makeInput({ zap: true }));
    expect(s.enemies).toEqual([]);
    expect(s.enemyShots).toHaveLength(1); // still in flight (advanced a tick)
    expect(s.spikes).toEqual([{ lane: 4, topDepth: 0.5 }]);
  });

  it('PARTIAL → EMPTY destroys the enemy nearest the rim (ties: lowest lane index)', () => {
    const { sim, s } = playingSim(cfg, 5);
    s.superzapper = 1;
    const nearLane5 = parked(makeFlipper(5, lp, makeRng(1)), {
      depth: 0.3,
      prevDepth: 0.3,
    });
    const nearLane2 = parked(makeFlipper(2, lp, makeRng(2)), {
      depth: 0.3,
      prevDepth: 0.3,
    });
    const far = parked(makeFlipper(7, lp, makeRng(3)), {
      depth: 0.7,
      prevDepth: 0.7,
    });
    s.enemies = [far, nearLane5, nearLane2];
    const { events } = sim.tick(makeInput({ zap: true }));
    expect(s.superzapper).toBe(0);
    expect(s.enemies).toHaveLength(2);
    expect(s.enemies).not.toContain(nearLane2); // tie broken by lowest lane
    expect(events.filter((ev) => ev.type === 'enemyKilled')).toHaveLength(1);
  });

  it('a mid-flip candidate ties on its occupancy-half lane', () => {
    const { sim, s } = playingSim(cfg, 5);
    s.superzapper = 1;
    const still = parked(makeFlipper(5, lp, makeRng(1)), {
      depth: 0.3,
      prevDepth: 0.3,
    });
    // Second half of a flip from 7 to 2: occupancy lane 2 < 5 wins the tie.
    const flipping = parked(makeFlipper(7, lp, makeRng(2)), {
      depth: 0.3,
      prevDepth: 0.3,
      flip: { from: 7, to: 2, progress: 0.7 },
    });
    s.enemies = [still, flipping];
    sim.tick(makeInput({ zap: true }));
    expect(s.enemies).toHaveLength(1);
    expect(s.enemies[0]).toBe(still); // the flipping one died
  });

  it('EMPTY: further presses have no effect', () => {
    const { sim, s } = playingSim(cfg, 5);
    s.superzapper = 0;
    s.enemies = [
      parked(makeFlipper(2, lp, makeRng(1)), { depth: 0.5, prevDepth: 0.5 }),
    ];
    const { events } = sim.tick(makeInput({ zap: true }));
    expect(s.enemies).toHaveLength(1);
    expect(s.superzapper).toBe(0);
    expect(events.some((ev) => ev.type === 'superzap')).toBe(false);
  });

  it('activating with zero enemies on the well still consumes the use', () => {
    const { sim, s } = playingSim(cfg, 5);
    s.enemies = [];
    const first = sim.tick(makeInput({ zap: true }));
    expect(s.superzapper).toBe(1);
    expect(first.events).toContainEqual({ type: 'superzap' });
    const second = sim.tick(makeInput({ zap: true }));
    expect(s.superzapper).toBe(0);
    expect(second.events).toContainEqual({ type: 'superzap' });
  });

  it('is rejected outside PLAYING (WARP and GET_READY)', () => {
    const { sim, s } = playingSim(cfg, 5);
    s.phase = 'WARP';
    s.enemies = [];
    sim.tick(makeInput({ zap: true }));
    expect(s.superzapper).toBe(2); // untouched
    s.phase = 'GET_READY';
    s.getReadyTimer = 1;
    sim.tick(makeInput({ zap: true }));
    expect(s.superzapper).toBe(2);
  });

  it('benchMode holds the census: zap is a no-op (§12.6)', () => {
    const { sim: donor, s } = playingSim(cfg, 5);
    s.enemies = [
      parked(makeFlipper(2, lp, makeRng(1)), { depth: 0.5, prevDepth: 0.5 }),
    ];
    void donor;
    const bench = createSimFromState(s, cfg, true);
    bench.tick(makeInput({ zap: true }));
    expect(s.enemies).toHaveLength(1); // census held
    expect(s.superzapper).toBe(2); // use not consumed
  });

  it('resets to FULL at level start; not restored by death within a level', () => {
    // Level start reset: complete a wave partially-zapped and land on the
    // next level with FULL pips.
    const { sim, s } = playingSim(cfg, 5);
    s.enemies = [];
    sim.tick(makeInput({ zap: true })); // FULL → PARTIAL
    expect(s.superzapper).toBe(1);
    s.budget = { flipper: 0, tanker: 0, spiker: 0, fuseball: 0, pulsar: 0 };
    let guard = 0;
    while (s.phase !== 'PLAYING' || s.level !== 6) {
      sim.tick(makeInput());
      if (guard++ > 500) break;
    }
    expect(s.superzapper).toBe(2); // FULL again at the new level
    // Death persistence: use one, die, respawn — still PARTIAL.
    sim.tick(makeInput({ zap: true }));
    expect(s.superzapper).toBe(1);
    s.enemyShots = [{ lane: 8, depth: 0.005, prevDepth: 0.02 }];
    sim.tick(makeInput());
    expect(s.phase).toBe('EXPLODING');
    expect(s.superzapper).toBe(1); // not restored
  });
});
