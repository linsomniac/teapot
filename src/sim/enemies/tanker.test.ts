import { describe, expect, it } from 'vitest';
import { makeTanker } from './tanker';
import { makeRng } from '../rng';
import { paramsForLevel } from '../difficultyCurve';
import { TICK_SEC } from '../types';
import type { Enemy } from '../types';
import { makeLiveConfig } from '../../__tests__/fixtures/liveConfig';
import { makeInput } from '../../__tests__/fixtures/input';
import { playingSim } from '../../__tests__/fixtures/playing';

// §13 Tanker area (Task 4.2). Level 3 = Tanker intro; geometry 2 (closed).

const cfg = makeLiveConfig();
const lp = paramsForLevel(3, cfg.difficulty);

function tankerAt(
  lane: number,
  depth: number,
  over: Partial<Enemy> = {},
): Enemy {
  return {
    ...makeTanker(lane, lp, makeRng(42)),
    depth,
    prevDepth: depth,
    ...over,
  };
}

describe('Tanker motion (§6.2)', () => {
  it('climbs at Climb × climbMul.tanker (wiring test: modified multiplier changes it)', () => {
    const { sim, s } = playingSim(cfg, 3);
    const e = tankerAt(2, 0.8);
    s.enemies = [e];
    sim.tick(makeInput());
    expect(e.depth).toBeCloseTo(
      0.8 - lp.climb * cfg.tuning.climbMul.tanker * TICK_SEC,
      12,
    );

    const modded = makeLiveConfig();
    modded.tuning.climbMul.tanker = 1.2; // a swapped/defaulted multiplier must fail
    const t2 = playingSim(modded, 3);
    const e2 = tankerAt(2, 0.8);
    t2.s.enemies = [e2];
    t2.sim.tick(makeInput());
    expect(e2.depth).toBeCloseTo(0.8 - lp.climb * 1.2 * TICK_SEC, 12);
    expect(e2.depth).not.toBeCloseTo(e.depth, 12);
  });

  it('never changes lanes and never flips, even with an expired flip timer', () => {
    const { sim, s } = playingSim(cfg, 3);
    const e = tankerAt(5, 0.9, { flipTimer: -1 });
    s.enemies = [e];
    for (let i = 0; i < 30; i++) sim.tick(makeInput());
    expect(e.lane).toBe(5);
    expect(e.flip).toBeNull();
  });

  it('is a firing kind: spawn draws fireTimer from [0.5, 1.5]×FireInt', () => {
    for (let seed = 1; seed <= 10; seed++) {
      const e = makeTanker(3, lp, makeRng(seed));
      expect(e.fireTimer).toBeGreaterThanOrEqual(0.5 * lp.fireInt);
      expect(e.fireTimer).toBeLessThanOrEqual(1.5 * lp.fireInt);
    }
  });
});

describe('Tanker split by shot (§6.2)', () => {
  it('releases two Flippers at the Tanker’s depth flipping to opposite adjacent lanes', () => {
    const { sim, s } = playingSim(cfg, 3);
    const e = tankerAt(5, 0.5);
    s.enemies = [e];
    s.playerShots = [{ lane: 5, depth: 0.47, prevDepth: 0.47 }];
    const { events } = sim.tick(makeInput());
    expect(s.enemies).toHaveLength(2);
    const [a, b] = s.enemies as [Enemy, Enemy];
    expect(a.kind).toBe('flipper');
    expect(b.kind).toBe('flipper');
    expect(a.depth).toBe(e.depth); // created at the Tanker's (post-climb) depth
    expect(b.depth).toBe(e.depth);
    expect(new Set([a.flip!.to, b.flip!.to])).toEqual(new Set([4, 6]));
    expect(a.flip!.from).toBe(5);
    expect(a.flip!.progress).toBe(0);
    expect(b.flip!.progress).toBe(0);
    expect(s.score).toBe(cfg.scoring.tanker);
    expect(events).toContainEqual({
      type: 'enemyKilled',
      kind: 'tanker',
      lane: 5,
      depth: e.depth,
    });
    expect(events.filter((ev) => ev.type === 'flip')).toHaveLength(2);
    expect(s.playerShots).toHaveLength(0); // shot consumed by the Tanker
  });

  it('released Flippers arm FlipInt from their landing flip’s completion', () => {
    const { sim, s } = playingSim(cfg, 3);
    s.enemies = [tankerAt(5, 0.5)];
    s.playerShots = [{ lane: 5, depth: 0.47, prevDepth: 0.47 }];
    sim.tick(makeInput());
    const f = s.enemies[0]!;
    let guard = 0;
    while (f.flip !== null && guard++ < 100) sim.tick(makeInput());
    expect(f.flipTimer).toBe(lp.flipInt); // mid-well completion arms full FlipInt
  });

  it('released Flippers are shootable on the Tanker’s lane during the first half', () => {
    const { sim, s } = playingSim(cfg, 3);
    s.enemies = [tankerAt(5, 0.5)];
    // Two shots on the same lane: the first splits the Tanker, the second
    // hits a released Flipper (still occupying lane 5) the same tick.
    s.playerShots = [
      { lane: 5, depth: 0.47, prevDepth: 0.47 },
      { lane: 5, depth: 0.455, prevDepth: 0.455 },
    ];
    sim.tick(makeInput());
    expect(s.enemies).toHaveLength(1); // one released Flipper died immediately
    expect(s.score).toBe(cfg.scoring.tanker + cfg.scoring.flipper);
  });

  it('splits ignore MaxOnWell (it gates spawns only)', () => {
    const { sim, s } = playingSim(cfg, 3);
    const filler: Enemy[] = Array.from({ length: lp.maxOnWell }, (_, i) => ({
      ...makeTanker((i * 2) % 16, lp, makeRng(i + 1)),
      kind: 'flipper' as const,
      depth: 0.9,
      prevDepth: 0.9,
      flipTimer: 100,
    }));
    s.enemies = [...filler, tankerAt(5, 0.5)];
    s.playerShots = [{ lane: 5, depth: 0.47, prevDepth: 0.47 }];
    sim.tick(makeInput());
    // Tanker gone (−1), two Flippers added (+2) despite the well already
    // holding MaxOnWell threatening enemies.
    expect(s.enemies.length).toBe(lp.maxOnWell + 1 - 1 + 2);
  });
});

describe('Tanker rim self-split (§6.2)', () => {
  it('reaching the rim splits non-lethally for 0 points — even on the player’s lane', () => {
    const { sim, s } = playingSim(cfg, 3); // player at lane 8
    const e = tankerAt(8, 0.001);
    s.enemies = [e];
    const { events } = sim.tick(makeInput());
    expect(s.enemies).toHaveLength(2);
    expect(s.enemies.every((f) => f.kind === 'flipper')).toBe(true);
    expect(s.enemies.every((f) => f.depth === 0)).toBe(true);
    expect(s.score).toBe(0); // self-split awards nothing
    expect(events.some((ev) => ev.type === 'enemyKilled')).toBe(false);
    expect(events.some((ev) => ev.type === 'playerDied')).toBe(false); // never lethal
    expect(events.filter((ev) => ev.type === 'flip')).toHaveLength(2);
  });

  it('rim-split landing flips are ordinary rim flips (rimFlipInterval on completion)', () => {
    const { sim, s } = playingSim(cfg, 3);
    s.enemies = [tankerAt(3, 0.001)];
    sim.tick(makeInput());
    const f = s.enemies[0]!;
    let guard = 0;
    while (f.flip !== null && guard++ < 100) sim.tick(makeInput());
    expect(f.depth).toBe(0);
    expect(f.flipTimer).toBe(cfg.tuning.rimFlipFactor * lp.flipInt);
  });
});

describe('end-lane split stagger (§6.2)', () => {
  it('both Flippers flip inward, the second delayed by flipAnimTime/2', () => {
    const { sim, s } = playingSim(cfg, 9); // open well
    const e = tankerAt(0, 0.5);
    s.enemies = [e];
    s.playerShots = [{ lane: 0, depth: 0.47, prevDepth: 0.47 }];
    sim.tick(makeInput());
    expect(s.enemies).toHaveLength(2);
    const [a, b] = s.enemies as [Enemy, Enemy];
    expect(a.flip!.to).toBe(1); // single inward direction
    expect(b.flip!.to).toBe(1);
    // Stagger: progress offset of exactly half an animation.
    expect(a.flip!.progress - b.flip!.progress).toBeCloseTo(0.5, 12);
    // Both occupy the source lane until each animation's second half.
    expect(a.flip!.from).toBe(0);
    expect(b.flip!.from).toBe(0);
    // The delayed one completes ~flipAnimTime/2 later.
    let ticksA = 0;
    let guard = 0;
    while (a.flip !== null && guard++ < 200) {
      sim.tick(makeInput());
      ticksA++;
    }
    let ticksB = ticksA;
    guard = 0;
    while (b.flip !== null && guard++ < 200) {
      sim.tick(makeInput());
      ticksB++;
    }
    const halfAnimTicks = Math.round(cfg.tuning.flipAnimTime / 2 / TICK_SEC);
    expect(ticksB - ticksA).toBe(halfAnimTicks);
  });
});
