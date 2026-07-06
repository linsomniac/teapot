import { describe, expect, it } from 'vitest';
import { drawSpawnType } from './spawner';
import { makeRng } from './rng';
import { paramsForLevel } from './difficultyCurve';
import { TICK_SEC } from './types';
import type { Enemy, EnemyKind } from './types';
import { makeFlipper } from './enemies/flipper';
import { makeSpiker } from './enemies/spiker';
import { makeLiveConfig } from '../__tests__/fixtures/liveConfig';
import { makeInput } from '../__tests__/fixtures/input';
import { playingSim } from '../__tests__/fixtures/playing';

// §13 spawner area (Task 4.7).

const cfg = makeLiveConfig();

function budgetOf(
  over: Partial<Record<EnemyKind, number>>,
): Record<EnemyKind, number> {
  return { flipper: 0, tanker: 0, spiker: 0, fuseball: 0, pulsar: 0, ...over };
}

describe('spawn cadence (§6)', () => {
  it('first attempt lands exactly SpawnInt after PLAYING entry, then every SpawnInt', () => {
    const { sim, s } = playingSim(cfg, 1);
    const lp = paramsForLevel(1, cfg.difficulty);
    const ticksPerAttempt = Math.ceil(lp.spawnInt / TICK_SEC - 1e-9);
    for (let i = 1; i < ticksPerAttempt; i++) {
      sim.tick(makeInput());
      expect(s.enemies, `tick ${i}`).toHaveLength(0);
    }
    sim.tick(makeInput());
    expect(s.enemies).toHaveLength(1); // first spawn on the SpawnInt tick
    for (let i = 1; i < ticksPerAttempt; i++) {
      sim.tick(makeInput());
      expect(s.enemies).toHaveLength(1);
    }
    sim.tick(makeInput());
    expect(s.enemies).toHaveLength(2); // second attempt one interval later
  });

  it('does not run during WARP', () => {
    const { sim, s } = playingSim(cfg, 1);
    s.phase = 'WARP';
    for (let i = 0; i < 200; i++) sim.tick(makeInput());
    expect(s.enemies).toHaveLength(0);
  });
});

describe('MaxOnWell gate (§6/D32)', () => {
  it('blocks spawns at MaxOnWell threatening enemies (budget intact)', () => {
    const { sim, s } = playingSim(cfg, 1);
    const lp = paramsForLevel(1, cfg.difficulty);
    s.enemies = Array.from({ length: lp.maxOnWell }, (_, i) => ({
      ...makeFlipper(i, lp, makeRng(i + 1)),
      depth: 0.5,
      prevDepth: 0.5,
      flipTimer: 100,
      fireTimer: 100,
    }));
    const budgetBefore = { ...s.budget };
    s.spawnTimer = TICK_SEC / 2; // attempt this tick
    sim.tick(makeInput());
    expect(s.enemies).toHaveLength(lp.maxOnWell);
    expect(s.budget).toEqual(budgetBefore);
  });

  it('Spikers do not count toward MaxOnWell', () => {
    const { sim, s } = playingSim(cfg, 4);
    const lp = paramsForLevel(4, cfg.difficulty);
    const spikers: Enemy[] = Array.from({ length: 3 }, (_, i) => ({
      ...makeSpiker(i, lp, makeRng(i + 1)),
      depth: 0.9,
      prevDepth: 0.9,
    }));
    const flippers: Enemy[] = Array.from(
      { length: lp.maxOnWell - 1 },
      (_, i) => ({
        ...makeFlipper(i + 5, lp, makeRng(i + 10)),
        depth: 0.5,
        prevDepth: 0.5,
        flipTimer: 100,
        fireTimer: 100,
      }),
    );
    s.enemies = [...spikers, ...flippers]; // threatening = maxOnWell − 1
    s.spawnTimer = TICK_SEC / 2;
    sim.tick(makeInput());
    expect(s.enemies.length).toBe(spikers.length + flippers.length + 1); // spawned
  });
});

describe('weighted type draw (§6)', () => {
  it('single-draw distribution follows the remaining budget (9:1 ≠ uniform)', () => {
    // Fixed, NON-decremented budget: spawning to exhaustion is budget-forced
    // to 9:1 regardless of weighting, so it cannot reject uniform — the
    // single-draw distribution can.
    const budget = budgetOf({ flipper: 9, tanker: 1 });
    const rng = makeRng(0xabcdef);
    let flippers = 0;
    const draws = 10_000;
    for (let i = 0; i < draws; i++) {
      if (drawSpawnType(budget, rng) === 'flipper') flippers++;
    }
    const p = flippers / draws;
    expect(p).toBeGreaterThan(0.87); // ≈ 0.9, decisively not 0.5
    expect(p).toBeLessThan(0.93);
  });

  it('returns null when every budget is exhausted', () => {
    expect(drawSpawnType(budgetOf({}), makeRng(1))).toBeNull();
  });

  it('only budgeted kinds are ever drawn', () => {
    const budget = budgetOf({ tanker: 2, pulsar: 3 });
    const rng = makeRng(7);
    for (let i = 0; i < 200; i++) {
      const kind = drawSpawnType(budget, rng);
      expect(kind === 'tanker' || kind === 'pulsar').toBe(true);
    }
  });
});

describe('lane draw + spawn init (§6/§11.1)', () => {
  it('a new enemy spawns at depth 1 with prev=curr (teleport-no-tween)', () => {
    const { sim, s } = playingSim(cfg, 1);
    s.spawnTimer = TICK_SEC / 2;
    sim.tick(makeInput());
    const e = s.enemies[0]!;
    expect(e.depth).toBe(1);
    expect(e.prevDepth).toBe(1);
    expect(e.prevLane).toBe(e.lane);
    expect(e.lane).toBeGreaterThanOrEqual(0);
    expect(e.lane).toBeLessThan(16);
  });

  it('decrements the drawn kind’s budget by one per spawn', () => {
    const { sim, s } = playingSim(cfg, 1); // level 1: flippers only
    const before = s.budget.flipper;
    s.spawnTimer = TICK_SEC / 2;
    sim.tick(makeInput());
    expect(s.budget.flipper).toBe(before - 1);
  });

  it('Spiker lanes exclude lanes already holding a Spiker', () => {
    for (let seed = 1; seed <= 10; seed++) {
      const { sim, s } = playingSim(cfg, 4, seed);
      const lp = paramsForLevel(4, cfg.difficulty);
      // Spikers on every lane except lane 9.
      s.enemies = Array.from({ length: 15 }, (_, i) => ({
        ...makeSpiker(i < 9 ? i : i + 1, lp, makeRng(i + 1)),
        depth: 0.9,
        prevDepth: 0.9,
      }));
      s.budget = budgetOf({ spiker: 2 });
      s.spawnTimer = TICK_SEC / 2;
      sim.tick(makeInput());
      const added = s.enemies[s.enemies.length - 1]!;
      expect(s.enemies).toHaveLength(16);
      expect(added.kind).toBe('spiker');
      expect(added.lane).toBe(9); // the only free lane
    }
  });

  it('defers the Spiker spawn when every lane holds one (budget intact)', () => {
    const { sim, s } = playingSim(cfg, 4);
    const lp = paramsForLevel(4, cfg.difficulty);
    s.enemies = Array.from({ length: 16 }, (_, i) => ({
      ...makeSpiker(i, lp, makeRng(i + 1)),
      depth: 0.9,
      prevDepth: 0.9,
    }));
    s.budget = budgetOf({ spiker: 3 });
    s.spawnTimer = TICK_SEC / 2;
    sim.tick(makeInput());
    expect(s.enemies).toHaveLength(16); // nothing spawned
    expect(s.budget.spiker).toBe(3); // budget untouched
    expect(s.spawnTimer).toBeGreaterThan(0); // next attempt re-armed
  });

  it('kind dispatch spawns the drawn kind with its own spawn init', () => {
    const { sim, s } = playingSim(cfg, 17);
    s.budget = budgetOf({ fuseball: 1 });
    s.spawnTimer = TICK_SEC / 2;
    sim.tick(makeInput());
    const e = s.enemies[0]!;
    expect(e.kind).toBe('fuseball');
    expect(e.speedMul).toBeGreaterThanOrEqual(cfg.tuning.fuseballJitter.min);
    expect(e.speedMul).toBeLessThanOrEqual(cfg.tuning.fuseballJitter.max);
  });
});
