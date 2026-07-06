import { describe, expect, it } from 'vitest';
import {
  advanceFlip,
  chooseMidWellFlip,
  makeFlipper,
  occupancyLane,
  startFlip,
} from './flipper';
import { makeRng } from '../rng';
import { paramsForLevel } from '../difficultyCurve';
import { TICK_SEC } from '../types';
import type { Enemy, SimEvent } from '../types';
import { makeLiveConfig } from '../../__tests__/fixtures/liveConfig';
import { makeInput } from '../../__tests__/fixtures/input';
import { playingSim } from '../../__tests__/fixtures/playing';

// §13 Flipper area (Task 4.1).

const cfg = makeLiveConfig();
const lp1 = paramsForLevel(1, cfg.difficulty);

function flipperAt(
  lane: number,
  depth: number,
  over: Partial<Enemy> = {},
): Enemy {
  return {
    ...makeFlipper(lane, lp1, makeRng(99)),
    depth,
    prevDepth: depth,
    flipTimer: 100, // parked unless a test arms it
    ...over,
  };
}

describe('flip mechanics (§6)', () => {
  it('occupancy: source lane first half, destination second half', () => {
    const e = flipperAt(3, 0.5);
    startFlip(e, 4);
    expect(occupancyLane(e)).toBe(3);
    e.flip!.progress = 0.49;
    expect(occupancyLane(e)).toBe(3);
    e.flip!.progress = 0.5;
    expect(occupancyLane(e)).toBe(4);
    e.flip = null;
    expect(occupancyLane(e)).toBe(3); // back to its own lane
  });

  it('advanceFlip completes after flipAnimTime and commits the lane', () => {
    const e = flipperAt(3, 0.5);
    startFlip(e, 4);
    const ticksNeeded = Math.round(cfg.tuning.flipAnimTime / TICK_SEC);
    for (let i = 0; i < ticksNeeded - 1; i++) {
      expect(advanceFlip(e, cfg.tuning.flipAnimTime)).toBe(false);
    }
    expect(advanceFlip(e, cfg.tuning.flipAnimTime)).toBe(true);
    expect(e.lane).toBe(4);
    expect(e.flip).toBeNull();
  });

  it('depth is frozen during the whole flip animation', () => {
    const { sim, s } = playingSim(cfg, 1);
    const e = flipperAt(2, 0.5, { flipTimer: 0.001 });
    s.enemies = [e];
    sim.tick(makeInput()); // flip starts (timer expired)
    expect(e.flip).not.toBeNull();
    for (let i = 0; i < 10; i++) sim.tick(makeInput());
    expect(e.depth).toBe(0.5); // untouched mid-animation
  });

  it('the timer re-arms from the END of the flip (full FlipInt after completion)', () => {
    const { sim, s } = playingSim(cfg, 1);
    const e = flipperAt(2, 0.5, { flipTimer: 0.001 });
    s.enemies = [e];
    sim.tick(makeInput()); // flip starts
    let guard = 0;
    while (e.flip !== null && guard++ < 100) sim.tick(makeInput());
    expect(e.flip).toBeNull();
    expect(e.flipTimer).toBe(lp1.flipInt); // reset exactly at completion
  });
});

describe('mid-well flip targeting (§6/§6.1)', () => {
  it('always seeks the player when seekBias = 1 (shortest arc)', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const e = flipperAt(2, 0.5);
      expect(chooseMidWellFlip(e, 8, true, 1, makeRng(seed))).toBe(3);
      const w = flipperAt(14, 0.5);
      expect(chooseMidWellFlip(w, 4, true, 1, makeRng(seed))).toBe(15); // wraps toward 4
    }
  });

  it('tie (8 lanes either way) breaks clockwise', () => {
    const e = flipperAt(0, 0.5);
    expect(chooseMidWellFlip(e, 8, true, 1, makeRng(1))).toBe(1);
  });

  it('random branch picks an adjacent lane, both directions occurring', () => {
    const seen = new Set<number>();
    for (let seed = 1; seed <= 40; seed++) {
      const e = flipperAt(5, 0.5);
      seen.add(chooseMidWellFlip(e, 8, true, 0, makeRng(seed)));
    }
    expect(seen).toEqual(new Set([4, 6]));
  });

  it('at an open-well end lane the single interior neighbor is always taken', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const lo = flipperAt(0, 0.5);
      expect(chooseMidWellFlip(lo, 8, false, 0, makeRng(seed))).toBe(1);
      const hi = flipperAt(15, 0.5);
      expect(chooseMidWellFlip(hi, 8, false, 0, makeRng(seed))).toBe(14);
    }
  });

  it('a Flipper already on the player’s lane does not flip — it climbs and redraws', () => {
    const { sim, s } = playingSim(cfg, 1); // player at lane 8
    const e = flipperAt(8, 0.5, { flipTimer: 0.001 });
    s.enemies = [e];
    const { events } = sim.tick(makeInput());
    expect(e.flip).toBeNull();
    expect(e.flipTimer).toBe(lp1.flipInt); // full redraw, not armed
    expect(e.depth).toBeLessThan(0.5); // climbed instead
    expect(events.some((ev) => ev.type === 'flip')).toBe(false);
  });

  it('emits the flip event when a flip starts', () => {
    const { sim, s } = playingSim(cfg, 1);
    s.enemies = [flipperAt(2, 0.5, { flipTimer: 0.001 })];
    const { events } = sim.tick(makeInput());
    expect(events).toContainEqual({ type: 'flip' });
  });
});

describe('climb + rim arrival (§6.1)', () => {
  it('climbs at Climb × climbMul.flipper per second (reference test)', () => {
    const { sim, s } = playingSim(cfg, 1);
    const e = flipperAt(2, 0.8);
    s.enemies = [e];
    sim.tick(makeInput());
    const expected = 0.8 - lp1.climb * cfg.tuning.climbMul.flipper * TICK_SEC;
    expect(e.depth).toBeCloseTo(expected, 12);
  });

  it('climb multiplier is wired (modified config changes the advance)', () => {
    const fast = makeLiveConfig();
    fast.tuning.climbMul.flipper = 2;
    const { sim, s } = playingSim(fast, 1);
    const e = flipperAt(2, 0.8);
    s.enemies = [e];
    sim.tick(makeInput());
    expect(e.depth).toBeCloseTo(0.8 - lp1.climb * 2 * TICK_SEC, 12);
  });

  it('rim arrival clamps depth to 0, discards the pending timer, arms rimFlipInterval', () => {
    const { sim, s } = playingSim(cfg, 1);
    const e = flipperAt(2, 0.001, { flipTimer: 5 }); // pending mid-well timer
    s.enemies = [e];
    sim.tick(makeInput());
    expect(e.depth).toBe(0);
    expect(e.flipTimer).toBe(cfg.tuning.rimFlipFactor * lp1.flipInt);
  });

  it('rim chase flips toward the player, shortest arc re-evaluated each flip', () => {
    const { sim, s } = playingSim(cfg, 1); // closed; player starts lane 8
    const e = flipperAt(3, 0, { flipTimer: 0.001 });
    s.enemies = [e];
    s.rimPos = 10;
    sim.tick(makeInput()); // flip starts toward +1
    expect(e.flip).not.toBeNull();
    expect(e.flip!.to).toBe(4);
    let guard = 0;
    while (e.flip !== null && guard++ < 100) sim.tick(makeInput());
    expect(e.lane).toBe(4);
    // Player moves the other way round: next flip re-evaluates.
    s.rimPos = 0;
    e.flipTimer = 0.001;
    sim.tick(makeInput());
    expect(e.flip!.to).toBe(3); // (0−4) wraps: 12 cw vs 4 ccw → −1
  });
});

describe('rim lethality (§5(b)) and the same-tick save (§6 tick order)', () => {
  it('a completed rim flip onto the player’s lane kills', () => {
    const { sim, s } = playingSim(cfg, 1); // player lane 8
    const e = flipperAt(7, 0, {
      flip: { from: 7, to: 8, progress: 0.95 },
    });
    s.enemies = [e];
    const { events } = sim.tick(makeInput()); // flip completes this tick
    expect(e.flip).toBeNull();
    expect(e.lane).toBe(8);
    expect(events).toContainEqual({ type: 'playerDied' });
  });

  it('crossing a mid-flip enemy’s lane is safe', () => {
    const { sim, s } = playingSim(cfg, 1);
    const e = flipperAt(7, 0, {
      flip: { from: 7, to: 8, progress: 0.2 }, // still animating after this tick
    });
    s.enemies = [e];
    const { events } = sim.tick(makeInput());
    expect(e.flip).not.toBeNull();
    expect(events.some((ev) => ev.type === 'playerDied')).toBe(false);
  });

  it('symmetric contact: the player sliding onto a resting rim Flipper dies', () => {
    const { sim, s } = playingSim(cfg, 1);
    s.enemies = [flipperAt(5, 0)];
    s.rimPos = 5; // player moved onto the enemy's lane
    const { events } = sim.tick(makeInput());
    expect(events).toContainEqual({ type: 'playerDied' });
  });

  it('same-tick save: a shot that kills the landing Flipper saves the player', () => {
    const { sim, s } = playingSim(cfg, 1);
    const e = flipperAt(7, 0, { flip: { from: 7, to: 8, progress: 0.95 } });
    s.enemies = [e];
    s.playerShots = [{ lane: 8, depth: 0.005, prevDepth: 0.005 }];
    const { events } = sim.tick(makeInput());
    expect(events.some((ev) => ev.type === 'playerDied')).toBe(false); // saved
    expect(s.enemies).toHaveLength(0);
    expect(events).toContainEqual({
      type: 'enemyKilled',
      kind: 'flipper',
      lane: 8,
      depth: 0,
    });
    expect(s.score).toBe(cfg.scoring.flipper);
  });

  it('co-located control: without the shot, the identical setup kills the player', () => {
    const { sim, s } = playingSim(cfg, 1);
    s.enemies = [flipperAt(7, 0, { flip: { from: 7, to: 8, progress: 0.95 } })];
    const { events } = sim.tick(makeInput());
    expect(events).toContainEqual({ type: 'playerDied' });
  });
});

describe('shot resolution (§6 never-pierces)', () => {
  it('kills only the nearest of two stacked enemies; the shot is consumed', () => {
    const { sim, s } = playingSim(cfg, 1);
    const near = flipperAt(4, 0.5);
    const far = flipperAt(4, 0.52);
    s.enemies = [far, near]; // array order must not matter
    s.playerShots = [{ lane: 4, depth: 0.47, prevDepth: 0.47 }];
    const { events } = sim.tick(makeInput());
    expect(s.enemies).toEqual([far]); // far one survives this tick
    expect(s.playerShots).toHaveLength(0); // consumed — never pierces
    expect(events.filter((ev) => ev.type === 'enemyKilled')).toHaveLength(1);
    expect(s.score).toBe(cfg.scoring.flipper);
  });

  it('mid-flip occupancy is shootable on the matching half’s lane only', () => {
    const firstHalf = () => {
      const { sim, s } = playingSim(cfg, 1);
      const e = flipperAt(3, 0.3, { flip: { from: 3, to: 4, progress: 0.2 } });
      s.enemies = [e];
      return { sim, s, e };
    };
    // Shot on the SOURCE lane connects during the first half.
    let t = firstHalf();
    t.s.playerShots = [{ lane: 3, depth: 0.27, prevDepth: 0.27 }];
    t.sim.tick(makeInput());
    expect(t.s.enemies).toHaveLength(0);
    // Shot on the DEST lane passes through during the first half.
    t = firstHalf();
    t.s.playerShots = [{ lane: 4, depth: 0.27, prevDepth: 0.27 }];
    t.sim.tick(makeInput());
    expect(t.s.enemies).toHaveLength(1);
  });

  it('second-half occupancy kills on the destination lane', () => {
    const { sim, s } = playingSim(cfg, 1);
    const e = flipperAt(3, 0.3, { flip: { from: 3, to: 4, progress: 0.6 } });
    s.enemies = [e];
    s.playerShots = [{ lane: 4, depth: 0.27, prevDepth: 0.27 }];
    const { events } = sim.tick(makeInput());
    expect(s.enemies).toHaveLength(0);
    const killed = events.find(
      (ev): ev is Extract<SimEvent, { type: 'enemyKilled' }> =>
        ev.type === 'enemyKilled',
    )!;
    expect(killed.lane).toBe(4); // death burst on the occupancy lane
  });
});

describe('spawn init (Phase 4 preamble)', () => {
  it('makeFlipper spawns at depth 1 with armed timers', () => {
    const e = makeFlipper(6, lp1, makeRng(5));
    expect(e).toMatchObject({
      kind: 'flipper',
      lane: 6,
      depth: 1,
      prevLane: 6,
      prevDepth: 1,
      flip: null,
    });
    expect(e.flipTimer).toBe(lp1.flipInt);
    expect(e.fireTimer).toBeGreaterThanOrEqual(0.5 * lp1.fireInt);
    expect(e.fireTimer).toBeLessThanOrEqual(1.5 * lp1.fireInt);
  });
});
