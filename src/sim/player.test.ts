import { describe, expect, it } from 'vitest';
import { createSim, type Sim, type SimState } from './sim';
import {
  beginLevel,
  clearAllShots,
  enterGameOver,
  enterPlaying,
} from './state';
import { advanceShots } from './enemies/shots';
import { makeFlipper } from './enemies/flipper';
import { paramsForLevel } from './difficultyCurve';
import { makeRng } from './rng';
import { PLAYER_SHOT_SLOTS, TICK_SEC } from './types';
import { makeLiveConfig } from '../__tests__/fixtures/liveConfig';
import { makeInput } from '../__tests__/fixtures/input';

// §13 player-firing area (Task 3.2).

const cfg = makeLiveConfig();

// A sim forced into PLAYING at a chosen level (level 1 = closed circle,
// level 9 = open flat — geometry (N−1) mod 16).
function playingSim(level: number, seed = 1): { sim: Sim; s: SimState } {
  const sim = createSim(cfg, seed);
  const s = sim.getState() as SimState;
  s.lives = cfg.tuning.startingLives;
  s.score = 0;
  s.livesGranted = 0;
  beginLevel(s, level, cfg);
  enterPlaying(s, cfg);
  return { sim, s };
}

describe('player movement (§5/§4)', () => {
  it('applies input.move to rimPos and snapshots prevRimPos first', () => {
    const { sim, s } = playingSim(9); // open well
    sim.tick(makeInput({ move: 0.3 }));
    expect(s.rimPos).toBeCloseTo(8.3, 12);
    expect(s.prevRimPos).toBe(8); // last tick's end
    sim.tick(makeInput({ move: -0.1 }));
    expect(s.rimPos).toBeCloseTo(8.2, 12);
    expect(s.prevRimPos).toBeCloseTo(8.3, 12);
  });

  it('clamps rimPos at open-well ends', () => {
    const { sim, s } = playingSim(9);
    for (let i = 0; i < 40; i++) sim.tick(makeInput({ move: 0.45 }));
    expect(s.rimPos).toBe(15);
    for (let i = 0; i < 80; i++) sim.tick(makeInput({ move: -0.45 }));
    expect(s.rimPos).toBe(0);
  });

  it('wraps rimPos on closed wells', () => {
    const { sim, s } = playingSim(1); // closed
    for (let i = 0; i < 20; i++) sim.tick(makeInput({ move: -0.45 }));
    // 8 − 9 = −1 → wraps to 15.
    expect(s.rimPos).toBeCloseTo(15, 9);
  });

  it('re-clamps a rogue oversized delta to perTickClamp (never skips a lane)', () => {
    const { sim, s } = playingSim(9);
    sim.tick(makeInput({ move: 5 }));
    expect(s.rimPos).toBeCloseTo(8 + cfg.tuning.perTickClamp, 12);
  });
});

describe('player firing (§5)', () => {
  it('fire spawns a shot at playerLane, depth 0, emitting playerShot', () => {
    const { sim, s } = playingSim(9);
    const { events } = sim.tick(makeInput({ fire: true }));
    expect(s.playerShots).toHaveLength(1);
    const shot = s.playerShots[0]!;
    expect(shot.lane).toBe(8);
    expect(shot.slot).toBe(7); // first-free scan is physical slots 7→0
    // Spawned at depth 0 and advanced by step 2 within the same tick.
    expect(shot.prevDepth).toBe(0);
    expect(shot.depth).toBeCloseTo(cfg.tuning.shotSpeed * TICK_SEC, 12);
    expect(events).toContainEqual({ type: 'playerShot' });
  });

  it('during WARP shots spawn at the Blaster’s descent depth', () => {
    const { sim, s } = playingSim(9);
    s.phase = 'WARP';
    s.warpDepth = 0.5;
    sim.tick(makeInput({ fire: true }));
    expect(s.playerShots).toHaveLength(1);
    expect(s.playerShots[0]!.prevDepth).toBe(0.5);
  });

  it('held fire creates exactly one shot per tick until all eight slots are full', () => {
    const { sim, s } = playingSim(9);
    const allocated: number[] = [];
    for (let i = 0; i < PLAYER_SHOT_SLOTS; i++) {
      const { events } = sim.tick(makeInput({ fire: true }));
      expect(events.filter((e) => e.type === 'playerShot')).toHaveLength(1);
      allocated.push(s.playerShots[s.playerShots.length - 1]!.slot!);
    }
    expect(allocated).toEqual([7, 6, 5, 4, 3, 2, 1, 0]);
    expect(s.playerShots).toHaveLength(PLAYER_SHOT_SLOTS);

    const blocked = sim.tick(makeInput({ fire: true }));
    expect(blocked.events.filter((e) => e.type === 'playerShot')).toHaveLength(
      0,
    );
  });

  it('never exceeds the hard cap of exactly eight live player shots', () => {
    const { sim, s } = playingSim(9);
    s.playerShots = Array.from({ length: PLAYER_SHOT_SLOTS }, (_, i) => ({
      lane: i,
      depth: 0.2,
      prevDepth: 0.2,
      slot: i,
    }));
    const { events } = sim.tick(makeInput({ fire: true }));
    expect(events.filter((e) => e.type === 'playerShot')).toHaveLength(0);
    expect(s.playerShots).toHaveLength(PLAYER_SHOT_SLOTS);
  });

  it('reuses a slot on the first fire tick after its shot expires at range', () => {
    const { sim, s } = playingSim(9);
    s.playerShots = Array.from({ length: PLAYER_SHOT_SLOTS }, (_, slot) => ({
      lane: slot,
      depth: slot === 7 ? 0.99 : 0.2,
      prevDepth: slot === 7 ? 0.99 : 0.2,
      slot,
    }));

    // Fire runs before movement, so the full pool blocks this tick; range
    // expiry in the collision step then frees physical slot 7.
    const expiryTick = sim.tick(makeInput({ fire: true }));
    expect(expiryTick.events).not.toContainEqual({ type: 'playerShot' });
    expect(s.playerShots.some((shot) => shot.slot === 7)).toBe(false);

    const reuseTick = sim.tick(makeInput({ fire: true }));
    expect(reuseTick.events).toContainEqual({ type: 'playerShot' });
    expect(s.playerShots.find((shot) => shot.slot === 7)?.prevDepth).toBe(0);
  });

  it('reuses a slot on the first fire tick after impact consumes its shot', () => {
    const { sim, s } = playingSim(9);
    const params = paramsForLevel(s.level, cfg.difficulty);
    const target = makeFlipper(3, params, makeRng(23));
    target.depth = 0.5;
    target.prevDepth = 0.5;
    target.flipTimer = 100;
    s.enemies = [target];
    s.playerShots = Array.from({ length: PLAYER_SHOT_SLOTS }, (_, slot) => ({
      lane: slot === 7 ? 3 : slot + 5,
      depth: slot === 7 ? 0.47 : 0.2,
      prevDepth: slot === 7 ? 0.47 : 0.2,
      slot,
    }));

    const impactTick = sim.tick(makeInput({ fire: true }));
    expect(impactTick.events).not.toContainEqual({ type: 'playerShot' });
    expect(impactTick.events.some((e) => e.type === 'enemyKilled')).toBe(true);
    expect(s.playerShots.some((shot) => shot.slot === 7)).toBe(false);

    const reuseTick = sim.tick(makeInput({ fire: true }));
    expect(reuseTick.events).toContainEqual({ type: 'playerShot' });
    expect(s.playerShots.some((shot) => shot.slot === 7)).toBe(true);
  });

  it('a shot reaching depth 1 despawns', () => {
    const { sim, s } = playingSim(9);
    s.playerShots = [{ lane: 3, depth: 0.99, prevDepth: 0.99 }];
    sim.tick(makeInput());
    expect(s.playerShots).toHaveLength(0);
  });
});

describe('shot bookkeeping (§6)', () => {
  it('advanceShots records prevDepth and moves by speed·TICK_SEC·dir', () => {
    const shots = [{ lane: 2, depth: 0.5, prevDepth: 0.4 }];
    advanceShots(shots, 1.5, 1);
    expect(shots[0]!.prevDepth).toBe(0.5);
    expect(shots[0]!.depth).toBeCloseTo(0.5 + 1.5 * TICK_SEC, 12);
    advanceShots(shots, 0.6, -1);
    expect(shots[0]!.depth).toBeCloseTo(
      0.5 + 1.5 * TICK_SEC - 0.6 * TICK_SEC,
      12,
    );
  });

  it('enemy shots advance toward the rim each combat tick', () => {
    const { sim, s } = playingSim(9);
    s.enemyShots = [{ lane: 4, depth: 0.8, prevDepth: 0.8 }];
    sim.tick(makeInput());
    expect(s.enemyShots[0]!.depth).toBeLessThan(0.8);
    expect(s.enemyShots[0]!.prevDepth).toBe(0.8);
  });

  it('state transitions clear all shots (game over path)', () => {
    const { s } = playingSim(9);
    s.playerShots = [{ lane: 1, depth: 0.4, prevDepth: 0.4 }];
    s.enemyShots = [{ lane: 2, depth: 0.6, prevDepth: 0.6 }];
    enterGameOver(s, cfg);
    expect(s.playerShots).toEqual([]);
    expect(s.enemyShots).toEqual([]);
  });

  it('clearAllShots empties both sides', () => {
    const { s } = playingSim(1);
    s.playerShots = [{ lane: 1, depth: 0.4, prevDepth: 0.4 }];
    s.enemyShots = [{ lane: 2, depth: 0.6, prevDepth: 0.6 }];
    clearAllShots(s);
    expect(s.playerShots).toEqual([]);
    expect(s.enemyShots).toEqual([]);
  });

  it('beginLevel clears all eight physical slots for the next level', () => {
    const { sim, s } = playingSim(9);
    for (let i = 0; i < PLAYER_SHOT_SLOTS; i++) {
      sim.tick(makeInput({ fire: true }));
    }
    expect(s.playerShots).toHaveLength(PLAYER_SHOT_SLOTS);
    beginLevel(s, 10, cfg);
    expect(s.playerShots).toHaveLength(0);
    const { events } = sim.tick(makeInput({ fire: true }));
    expect(events).toContainEqual({ type: 'playerShot' });
  });
});
