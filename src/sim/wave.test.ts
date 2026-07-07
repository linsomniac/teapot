import { describe, expect, it } from 'vitest';
import { makeRng } from './rng';
import { paramsForLevel } from './difficultyCurve';
import { levelClearBonus } from './scoring';
import { makeFlipper } from './enemies/flipper';
import { makeSpiker } from './enemies/spiker';
import { makePulsar } from './enemies/pulsar';
import type { EnemyKind } from './types';
import { makeLiveConfig } from '../__tests__/fixtures/liveConfig';
import { makeInput } from '../__tests__/fixtures/input';
import { playingSim } from '../__tests__/fixtures/playing';

// Task 5.1 — wave completion + level advance (§8.4).

const cfg = makeLiveConfig();

function zeroBudget(): Record<EnemyKind, number> {
  return { flipper: 0, tanker: 0, spiker: 0, fuseball: 0, pulsar: 0 };
}

describe('wave completion (§8.4)', () => {
  it('completes when budget is exhausted and no enemies remain: bonus + WARP', () => {
    const { sim, s } = playingSim(cfg, 5);
    s.budget = zeroBudget();
    const { events } = sim.tick(makeInput());
    expect(s.phase).toBe('WARP');
    expect(s.warpDepth).toBe(0);
    expect(s.score).toBe(levelClearBonus(5, cfg.scoring));
    expect(events).toContainEqual({ type: 'warpStart' });
  });

  it('does not complete while budget remains', () => {
    const { sim, s } = playingSim(cfg, 5);
    s.budget = { ...zeroBudget(), flipper: 1 };
    for (let i = 0; i < 30; i++) sim.tick(makeInput());
    // (the spawner will eventually spawn that flipper — but the wave never
    // completed while the budget was outstanding)
    expect(s.score).toBe(0);
  });

  it('a budget-exhausted wave with a never-despawning Spiker does not complete', () => {
    const { sim, s } = playingSim(cfg, 5);
    s.budget = zeroBudget();
    const lp = paramsForLevel(5, cfg.difficulty);
    s.enemies = [
      { ...makeSpiker(3, lp, makeRng(1)), depth: 0.8, prevDepth: 0.8 },
    ];
    for (let i = 0; i < 60; i++) sim.tick(makeInput());
    expect(s.phase).toBe('PLAYING'); // held open by the Spiker
    // Destroy it — the wave completes.
    s.playerShots = [
      {
        lane: s.enemies[0]!.lane,
        depth: s.enemies[0]!.depth - 0.03,
        prevDepth: s.enemies[0]!.depth - 0.03,
      },
    ];
    sim.tick(makeInput());
    expect(s.enemies).toHaveLength(0);
    expect(s.phase).toBe('WARP');
  });

  it('a Pulsar holds the wave open the same way', () => {
    const { sim, s } = playingSim(cfg, 17);
    s.budget = zeroBudget();
    const lp = paramsForLevel(17, cfg.difficulty);
    s.enemies = [
      {
        ...makePulsar(3, lp, makeRng(1)),
        depth: 0.5,
        prevDepth: 0.5,
        flipTimer: 100,
      },
    ];
    for (let i = 0; i < 60; i++) sim.tick(makeInput());
    expect(s.phase).toBe('PLAYING');
  });

  it('never completes on a tick the player died', () => {
    const { sim, s } = playingSim(cfg, 5); // player lane 8
    s.budget = zeroBudget();
    // The well is otherwise clear, but a shot crosses depth 0 on the
    // player's lane this tick: step 4 kills, step 8 must skip.
    s.enemyShots = [{ lane: 8, depth: 0.005, prevDepth: 0.02 }];
    const { events } = sim.tick(makeInput());
    expect(events).toContainEqual({ type: 'playerDied' });
    expect(s.phase).not.toBe('WARP');
    expect(s.score).toBe(0); // no clear bonus on the death tick
  });

  it('cancels all in-flight shots on both sides; spikes remain', () => {
    const { sim, s } = playingSim(cfg, 5);
    s.budget = zeroBudget();
    s.spikes = [{ lane: 2, topDepth: 0.5 }];
    s.playerShots = [{ lane: 1, depth: 0.5, prevDepth: 0.5 }];
    s.enemyShots = [{ lane: 9, depth: 0.9, prevDepth: 0.9 }]; // harmless lane
    sim.tick(makeInput());
    expect(s.phase).toBe('WARP');
    expect(s.playerShots).toEqual([]);
    expect(s.enemyShots).toEqual([]);
    expect(s.spikes).toEqual([{ lane: 2, topDepth: 0.5 }]);
  });

  it('the clear bonus runs the bonus-life re-check (§6 step 8)', () => {
    const { sim, s } = playingSim(cfg, 5);
    s.budget = zeroBudget();
    s.score = cfg.scoring.bonusLifeInterval - 10; // bonus crosses the line
    const livesBefore = s.lives;
    const { events } = sim.tick(makeInput());
    expect(s.lives).toBe(livesBefore + 1);
    expect(events).toContainEqual({ type: 'bonusLife' });
  });

  it('a killed last enemy and completion can share a tick (kill in step 3, check in step 8)', () => {
    const { sim, s } = playingSim(cfg, 5);
    s.budget = zeroBudget();
    const lp = paramsForLevel(5, cfg.difficulty);
    s.enemies = [
      {
        ...makeFlipper(4, lp, makeRng(1)),
        depth: 0.5,
        prevDepth: 0.5,
        flipTimer: 100,
        fireTimer: 100,
      },
    ];
    s.playerShots = [{ lane: 4, depth: 0.47, prevDepth: 0.47 }];
    sim.tick(makeInput());
    expect(s.phase).toBe('WARP'); // kill resolved before the check
    expect(s.score).toBe(cfg.scoring.flipper + levelClearBonus(5, cfg.scoring));
  });
});
