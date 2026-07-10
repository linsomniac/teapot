import { describe, expect, it } from 'vitest';
import type { Sim, SimState } from './sim';
import { TICK_SEC } from './types';
import { levelClearBonus } from './scoring';
import { makeLiveConfig } from '../__tests__/fixtures/liveConfig';
import { makeInput } from '../__tests__/fixtures/input';
import { playingSim } from '../__tests__/fixtures/playing';

// Task 5.2 — warp descent (§9). §13 warp area.

const cfg = makeLiveConfig();

// A sim at the moment of wave completion, one tick into WARP-hood: complete
// a wave for real so the §8.4 path (bonus + enterWarp) is exercised.
function warpingSim(level: number, seed = 1): { sim: Sim; s: SimState } {
  const { sim, s } = playingSim(cfg, level, seed);
  s.budget = { flipper: 0, tanker: 0, spiker: 0, fuseball: 0, pulsar: 0 };
  sim.tick(makeInput());
  expect(s.phase).toBe('WARP');
  return { sim, s };
}

describe('warp descent (§9)', () => {
  it('the Blaster descends at descentSpeed, interpolation prevs tracked', () => {
    const { sim, s } = warpingSim(5);
    sim.tick(makeInput());
    expect(s.warpDepth).toBeCloseTo(cfg.tuning.descentSpeed * TICK_SEC, 12);
    expect(s.prevWarpDepth).toBe(0);
    sim.tick(makeInput());
    expect(s.prevWarpDepth).toBeCloseTo(cfg.tuning.descentSpeed * TICK_SEC, 12);
  });

  it('the cleared shot pool allows fire on the first descent tick', () => {
    const { sim, s } = warpingSim(5);
    expect(s.playerShots).toHaveLength(0);
    const { events } = sim.tick(makeInput({ fire: true }));
    expect(events).toContainEqual({ type: 'playerShot' });
  });

  it('the player can still move between lanes during the descent', () => {
    const { sim, s } = warpingSim(5);
    sim.tick(makeInput({ move: 0.4 }));
    expect(s.rimPos).toBeCloseTo(8.4, 12);
  });

  it('shots trim spikes during the descent (spawned at the Blaster’s depth)', () => {
    const { sim, s } = warpingSim(5);
    s.spikes = [{ lane: 8, topDepth: 0.6 }];
    s.warpDepth = 0.55;
    // The shot spawns at ~0.55 and needs two ticks to sweep onto the tip.
    const all = [
      ...sim.tick(makeInput({ fire: true })).events,
      ...sim.tick(makeInput()).events,
    ];
    expect(all).toContainEqual({ type: 'spikeHit' });
    expect(s.spikes[0]!.topDepth).toBeCloseTo(0.68, 12);
  });

  it('reaching the bottom begins the next level (WARP → PLAYING via beginLevel)', () => {
    const { sim, s } = warpingSim(5);
    s.spikes = [{ lane: 2, topDepth: 0.5 }]; // off the player's lane
    const scoreAfterBonus = s.score;
    let guard = 0;
    while (s.phase === 'WARP' && guard++ < 400) sim.tick(makeInput());
    expect(s.phase).toBe('PLAYING');
    expect(s.level).toBe(6);
    expect(s.maxLevelReached).toBe(6); // recorded at the PLAYING entry (§8.5)
    expect(s.spikes).toEqual([]); // cleared by beginLevel — spikes are per-level
    expect(s.score).toBe(scoreAfterBonus); // no extra award on arrival
    expect(s.warpDepth).toBe(0);
    expect(s.superzapper).toBe(2);
  });

  it('raises maxLevelReached when the next level is a new best (§8.5)', () => {
    const { sim, s } = warpingSim(9);
    s.maxLevelReached = 9;
    let guard = 0;
    while (s.phase === 'WARP' && guard++ < 400) sim.tick(makeInput());
    expect(s.level).toBe(10);
    expect(s.maxLevelReached).toBe(10); // recorded at PLAYING entry
  });
});

describe('warp spike death (§9)', () => {
  it('a spike collision kills: life lost, next level begins, descent NOT replayed', () => {
    const { sim, s } = warpingSim(5);
    s.spikes = [{ lane: 8, topDepth: 0.3 }]; // on the player's lane
    const livesBefore = s.lives;
    let died = false;
    let guard = 0;
    while (s.phase === 'WARP' && guard++ < 400) {
      const { events } = sim.tick(makeInput());
      if (events.some((ev) => ev.type === 'playerDied')) died = true;
    }
    expect(died).toBe(true);
    expect(s.lives).toBe(livesBefore - 1);
    expect(s.phase).toBe('EXPLODING');
    while (s.phase === 'EXPLODING' && guard++ < 500) sim.tick(makeInput());
    expect(s.phase).toBe('PLAYING'); // explosion ends, descent is not replayed
    expect(s.level).toBe(6); // the level still counted as complete
  });

  it('last-life spike death ends the game without advancing maxLevelReached', () => {
    const { sim, s } = warpingSim(9);
    s.maxLevelReached = 9;
    s.lives = 1;
    s.spikes = [{ lane: 8, topDepth: 0.3 }];
    let guard = 0;
    while (s.phase === 'WARP' && guard++ < 400) sim.tick(makeInput());
    expect(s.phase).toBe('EXPLODING');
    while (s.phase === 'EXPLODING' && guard++ < 500) sim.tick(makeInput());
    expect(s.phase).toBe('GAME_OVER');
    expect(s.lives).toBe(0);
    expect(s.level).toBe(9); // never began the next level
    expect(s.maxLevelReached).toBe(9); // §8.5: records only at PLAYING entry
  });

  it('same-tick trim-save: a trim that clears the path this tick saves the Blaster', () => {
    const { sim, s } = warpingSim(5);
    // The Blaster sweeps 0.44 → ~0.4467 this tick; the tip at 0.445 would
    // kill, but the scripted shot trims it to 0.525 in step 3 first.
    s.warpDepth = 0.44;
    s.prevWarpDepth = 0.44;
    s.spikes = [{ lane: 8, topDepth: 0.445 }];
    s.playerShots = [{ lane: 8, depth: 0.42, prevDepth: 0.42 }];
    const { events } = sim.tick(makeInput());
    expect(events).toContainEqual({ type: 'spikeHit' });
    expect(events.some((ev) => ev.type === 'playerDied')).toBe(false); // saved
    expect(s.phase).toBe('WARP'); // descent continues
  });

  it('co-located control: without the trimming shot, the identical setup kills', () => {
    const { sim, s } = warpingSim(5);
    s.warpDepth = 0.44;
    s.prevWarpDepth = 0.44;
    s.spikes = [{ lane: 8, topDepth: 0.445 }];
    const { events } = sim.tick(makeInput());
    expect(events).toContainEqual({ type: 'playerDied' });
  });

  it('a spike on another lane is harmless', () => {
    const { sim, s } = warpingSim(5);
    s.spikes = [{ lane: 3, topDepth: 0.2 }];
    let died = false;
    let guard = 0;
    while (s.phase === 'WARP' && guard++ < 400) {
      const { events } = sim.tick(makeInput());
      if (events.some((ev) => ev.type === 'playerDied')) died = true;
    }
    expect(died).toBe(false);
    expect(s.phase).toBe('PLAYING');
  });

  it('level-clear bonus was already awarded before the fatal descent (no double count)', () => {
    const { sim, s } = warpingSim(5);
    expect(s.score).toBe(levelClearBonus(5, cfg.scoring)); // awarded at completion
    s.spikes = [{ lane: 8, topDepth: 0.3 }];
    let guard = 0;
    while (s.phase === 'WARP' && guard++ < 400) sim.tick(makeInput());
    expect(s.score).toBe(levelClearBonus(5, cfg.scoring)); // unchanged by the death
  });
});
