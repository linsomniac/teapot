import { describe, expect, it } from 'vitest';
import { makeFuseball } from './fuseball';
import { makeRng } from '../rng';
import { paramsForLevel } from '../difficultyCurve';
import { TICK_SEC } from '../types';
import type { Enemy } from '../types';
import { makeLiveConfig } from '../../__tests__/fixtures/liveConfig';
import { makeInput } from '../../__tests__/fixtures/input';
import { playingSim } from '../../__tests__/fixtures/playing';

// §13 Fuseball area (Task 4.4). Manual placement, so any level works:
// level 1 = closed circle, level 9 = open flat.

const cfg = makeLiveConfig();
const lp = paramsForLevel(1, cfg.difficulty);
const jit = cfg.tuning.fuseballJitter;

function fuseballAt(
  lane: number,
  depth: number,
  over: Partial<Enemy> = {},
): Enemy {
  return {
    ...makeFuseball(lane, cfg.tuning, makeRng(11)),
    depth,
    prevDepth: depth,
    speedMul: 1, // deterministic unless a test wants jitter
    jitterTimer: 100, // no redraw unless armed
    ...over,
  };
}

describe('Fuseball climb + jitter (§6.4)', () => {
  it('base climb is Climb × climbMul.fuseball (wiring: modified multiplier changes it)', () => {
    const { sim, s } = playingSim(cfg, 1);
    const e = fuseballAt(2, 0.8);
    s.enemies = [e];
    sim.tick(makeInput());
    expect(e.depth).toBeCloseTo(
      0.8 - lp.climb * cfg.tuning.climbMul.fuseball * TICK_SEC,
      12,
    );

    const modded = makeLiveConfig();
    modded.tuning.climbMul.fuseball = 1.4;
    const t2 = playingSim(modded, 1);
    const e2 = fuseballAt(2, 0.8);
    t2.s.enemies = [e2];
    t2.sim.tick(makeInput());
    expect(e2.depth).toBeCloseTo(0.8 - lp.climb * 1.4 * TICK_SEC, 12);
    expect(e2.depth).not.toBeCloseTo(e.depth, 12);
  });

  it('the speed multiplier scales the climb and is redrawn from [0.3,1.5] every 0.5 s', () => {
    const { sim, s } = playingSim(cfg, 1);
    const slow = fuseballAt(2, 0.8, { speedMul: jit.min });
    const fast = fuseballAt(4, 0.8, { speedMul: jit.max });
    s.enemies = [slow, fast];
    sim.tick(makeInput());
    const base = lp.climb * cfg.tuning.climbMul.fuseball * TICK_SEC;
    expect(slow.depth).toBeCloseTo(0.8 - base * jit.min, 12);
    expect(fast.depth).toBeCloseTo(0.8 - base * jit.max, 12);
    // Redraw: armed clock resets and draws within bounds (seed-varied).
    const seen = new Set<number>();
    for (let seed = 1; seed <= 10; seed++) {
      const t = playingSim(cfg, 1, seed);
      const e = fuseballAt(2, 0.8, { jitterTimer: 0.001 });
      t.s.enemies = [e];
      t.sim.tick(makeInput());
      expect(e.speedMul).toBeGreaterThanOrEqual(jit.min);
      expect(e.speedMul).toBeLessThanOrEqual(jit.max);
      expect(e.jitterTimer).toBeCloseTo(jit.redrawInterval, 9);
      seen.add(e.speedMul!);
    }
    expect(seen.size).toBeGreaterThan(3); // actually random across seeds
  });

  it('never changes lanes while climbing', () => {
    const { sim, s } = playingSim(cfg, 1);
    const e = fuseballAt(2, 0.9);
    s.enemies = [e];
    for (let i = 0; i < 60; i++) sim.tick(makeInput());
    expect(e.lane).toBe(2);
  });

  it('spawn draws speedMul within the jitter bounds', () => {
    for (let seed = 1; seed <= 10; seed++) {
      const e = makeFuseball(3, cfg.tuning, makeRng(seed));
      expect(e.speedMul).toBeGreaterThanOrEqual(jit.min);
      expect(e.speedMul).toBeLessThanOrEqual(jit.max);
      expect(e.depth).toBe(1);
      expect(e.climbDir).toBe(1);
    }
  });
});

describe('Fuseball rim residency (§6.4)', () => {
  it('rim arrival starts residency: crawl toward the player, shortest arc at arrival', () => {
    const { sim, s } = playingSim(cfg, 1); // player at lane 8, closed
    const e = fuseballAt(3, 0.0005);
    s.enemies = [e];
    sim.tick(makeInput()); // arrives
    expect(e.depth).toBe(0);
    expect(e.rimTimer).toBeCloseTo(cfg.tuning.fuseballRimTime, 9);
    expect(e.rimDir).toBe(1); // 3 → 8 is +1 on the shortest arc
    const before = e.lane;
    sim.tick(makeInput()); // first crawl tick
    expect(e.lane).toBeCloseTo(
      before + cfg.tuning.fuseballRimSpeed * TICK_SEC,
      12,
    );
    expect(e.depth).toBe(0); // stays on the rim while crawling
  });

  it('open-well ends force crawl reversal', () => {
    const { sim, s } = playingSim(cfg, 9); // open
    const e = fuseballAt(0.02, 0, { rimTimer: 5, rimDir: -1 });
    s.enemies = [e];
    sim.tick(makeInput());
    expect(e.lane).toBe(0); // clamped at the end
    expect(e.rimDir).toBe(1); // reversed
    sim.tick(makeInput());
    expect(e.lane).toBeGreaterThan(0); // crawling back inward
  });

  it('symmetric rim contact: the crawler’s ROUNDED lane meeting the player kills', () => {
    const { sim, s } = playingSim(cfg, 1); // player lane 8
    const e = fuseballAt(7.6, 0, { rimTimer: 5, rimDir: 1 }); // rounds to 8
    s.enemies = [e];
    const { events } = sim.tick(makeInput());
    expect(events).toContainEqual({ type: 'playerDied' });
  });

  it('same-tick save: a shot killing the crawler on the contact tick saves the player', () => {
    const { sim, s } = playingSim(cfg, 1);
    const e = fuseballAt(7.6, 0, { rimTimer: 5, rimDir: 1 });
    s.enemies = [e];
    s.playerShots = [{ lane: 8, depth: 0.005, prevDepth: 0.005 }];
    const { events } = sim.tick(makeInput());
    expect(events.some((ev) => ev.type === 'playerDied')).toBe(false);
    expect(s.enemies).toHaveLength(0);
  });

  it('after fuseballRimTime it descends at BASE speed to a target in [0.6, 1.0]', () => {
    const { sim, s } = playingSim(cfg, 1);
    const e = fuseballAt(3, 0, {
      rimTimer: 0.001,
      rimDir: 1,
      speedMul: jit.max,
    });
    s.enemies = [e];
    sim.tick(makeInput()); // residency expires → descent begins
    expect(e.climbDir).toBe(-1);
    expect(Number.isInteger(e.lane)).toBe(true); // descends a rounded lane
    expect(e.descentTarget).toBeGreaterThanOrEqual(
      cfg.tuning.fuseballDescentRange.min,
    );
    expect(e.descentTarget).toBeLessThanOrEqual(
      cfg.tuning.fuseballDescentRange.max,
    );
    const before = e.depth;
    sim.tick(makeInput());
    // Base speed — the 1.5 speedMul must NOT apply during descent.
    expect(e.depth).toBeCloseTo(
      before + lp.climb * cfg.tuning.climbMul.fuseball * TICK_SEC,
      12,
    );
  });

  it('resumes the jittered climb at the descent target, repeating the cycle', () => {
    const { sim, s } = playingSim(cfg, 1);
    const e = fuseballAt(3, 0.62, { climbDir: -1, descentTarget: 0.63 });
    s.enemies = [e];
    let guard = 0;
    while (e.climbDir === -1 && guard++ < 100) sim.tick(makeInput());
    expect(e.depth).toBe(0.63); // clamped at the drawn target
    expect(e.climbDir).toBe(1);
    sim.tick(makeInput());
    expect(e.depth).toBeLessThan(0.63); // climbing again
  });
});

describe('Fuseball scoring (§6.4/§7)', () => {
  it('kill score is depth-banded — near the rim pays the most', () => {
    const near = playingSim(cfg, 1);
    const e1 = fuseballAt(4, 0.1);
    near.s.enemies = [e1];
    near.s.playerShots = [{ lane: 4, depth: 0.07, prevDepth: 0.07 }];
    near.sim.tick(makeInput());
    expect(near.s.score).toBe(cfg.scoring.fuseballBands[2]); // < 1/3 → 750

    const far = playingSim(cfg, 1);
    const e2 = fuseballAt(4, 0.9);
    far.s.enemies = [e2];
    far.s.playerShots = [{ lane: 4, depth: 0.87, prevDepth: 0.87 }];
    far.sim.tick(makeInput());
    expect(far.s.score).toBe(cfg.scoring.fuseballBands[0]); // > 2/3 → 250
  });
});
