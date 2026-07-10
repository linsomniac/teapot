import { describe, expect, it } from 'vitest';
import type { Sim, SimState } from './sim';
import { makeRng } from './rng';
import { paramsForLevel } from './difficultyCurve';
import { TICK_SEC } from './types';
import { makeFlipper } from './enemies/flipper';
import { makeLiveConfig } from '../__tests__/fixtures/liveConfig';
import { makeInput } from '../__tests__/fixtures/input';
import { playingSim } from '../__tests__/fixtures/playing';

// Task 5.3 — EXPLODING + GET_READY + death/respawn (§5/§10).

const cfg = makeLiveConfig();
const lp5 = paramsForLevel(5, cfg.difficulty);

// Kill the player deterministically: an enemy shot crossing depth 0 on the
// player's lane this tick.
function lethalShot(s: {
  enemyShots: { lane: number; depth: number; prevDepth: number }[];
}) {
  s.enemyShots.push({ lane: 8, depth: 0.005, prevDepth: 0.02 });
}

function finishExplosion(sim: Sim, s: SimState): number {
  let ticks = 0;
  while (s.phase === 'EXPLODING' && ticks < 100) {
    sim.tick(makeInput());
    ticks++;
  }
  return ticks;
}

describe('death → EXPLODING → GET_READY (§5/§10)', () => {
  it('decrements a life, returns on-well enemies to budget by type, clears shots', () => {
    const { sim, s } = playingSim(cfg, 5);
    s.budget = { flipper: 2, tanker: 1, spiker: 0, fuseball: 0, pulsar: 0 };
    s.enemies = [
      {
        ...makeFlipper(2, lp5, makeRng(1)),
        depth: 0.5,
        prevDepth: 0.5,
        flipTimer: 100,
        fireTimer: 100,
      },
      {
        ...makeFlipper(4, lp5, makeRng(2)),
        kind: 'tanker',
        depth: 0.7,
        prevDepth: 0.7,
        fireTimer: 100,
      },
      {
        ...makeFlipper(6, lp5, makeRng(3)),
        kind: 'spiker',
        depth: 0.8,
        prevDepth: 0.8,
        climbDir: 1,
      },
    ];
    s.playerShots = [{ lane: 1, depth: 0.4, prevDepth: 0.4 }];
    s.spikes = [{ lane: 3, topDepth: 0.5 }];
    s.score = 500;
    s.superzapper = 1;
    s.rimPos = 8.3; // fractional, still lane 8 — the lethal shot's lane
    lethalShot(s);
    const livesBefore = s.lives;
    sim.tick(makeInput());
    expect(s.phase).toBe('EXPLODING');
    expect(s.lives).toBe(livesBefore - 1);
    expect(s.enemies).toEqual([]);
    expect(s.budget).toEqual({
      flipper: 3,
      tanker: 2,
      spiker: 1,
      fuseball: 0,
      pulsar: 0,
    });
    expect(s.playerShots).toEqual([]);
    expect(s.enemyShots).toEqual([]);
    // Spikes, score, rim position, Superzapper persist (§5). (The on-well
    // Spiker grew its own lane's spike during step 2 — also persists.)
    expect(s.spikes).toContainEqual({ lane: 3, topDepth: 0.5 });
    expect(s.score).toBe(500);
    expect(s.superzapper).toBe(1);
    expect(s.rimPos).toBeCloseTo(8.3, 12);
    expect(s.deathTimer).toBe(cfg.tuning.playerExplosionDuration);
    finishExplosion(sim, s);
    expect(s.phase).toBe('GET_READY');
    expect(s.getReadyTimer).toBe(cfg.tuning.getReadyDuration);
  });

  it('split Flippers return to the FLIPPER budget, which may exceed the authored count', () => {
    const { sim, s } = playingSim(cfg, 5);
    s.budget = { flipper: 0, tanker: 0, spiker: 0, fuseball: 0, pulsar: 0 };
    // Two split-released Flippers still on the well when the player dies.
    s.enemies = [
      {
        ...makeFlipper(2, lp5, makeRng(1)),
        depth: 0.5,
        prevDepth: 0.5,
        flipTimer: 100,
        fireTimer: 100,
      },
      {
        ...makeFlipper(3, lp5, makeRng(2)),
        depth: 0.5,
        prevDepth: 0.5,
        flipTimer: 100,
        fireTimer: 100,
      },
    ];
    lethalShot(s);
    sim.tick(makeInput());
    expect(s.budget.flipper).toBe(2); // above the authored 0 — intended
  });

  it('last-life death finishes the explosion before GAME_OVER', () => {
    const { sim, s } = playingSim(cfg, 5);
    s.lives = 1;
    lethalShot(s);
    sim.tick(makeInput());
    expect(s.phase).toBe('EXPLODING');
    expect(s.lives).toBe(0);
    finishExplosion(sim, s);
    expect(s.phase).toBe('GAME_OVER');
  });

  it('holds the empty well for playerExplosionDuration and ignores input', () => {
    const { sim, s } = playingSim(cfg, 5);
    lethalShot(s);
    sim.tick(makeInput());
    const before = s.rimPos;
    const expectedTicks = Math.round(cfg.tuning.playerExplosionDuration * 60);
    let ticks = 0;
    while (s.phase === 'EXPLODING' && ticks < expectedTicks + 5) {
      const { events } = sim.tick(
        makeInput({ move: 0.4, fire: true, zap: true }),
      );
      expect(events).not.toContainEqual({ type: 'playerShot' });
      ticks++;
    }
    expect(s.phase).toBe('GET_READY');
    expect(s.rimPos).toBe(before);
    expect(Math.abs(ticks - expectedTicks)).toBeLessThanOrEqual(1);
  });
});

describe('GET_READY behavior (§10)', () => {
  function getReadySim() {
    const { sim, s } = playingSim(cfg, 5);
    lethalShot(s);
    sim.tick(makeInput());
    finishExplosion(sim, s);
    expect(s.phase).toBe('GET_READY');
    return { sim, s };
  }

  it('lasts getReadyDuration of sim time, then resumes PLAYING with entry resets', () => {
    const { sim, s } = getReadySim();
    const expectTicks = Math.round(cfg.tuning.getReadyDuration * 60);
    let ticks = 0;
    while (s.phase === 'GET_READY' && ticks < expectTicks + 5) {
      sim.tick(makeInput());
      ticks++;
    }
    expect(s.phase).toBe('PLAYING');
    expect(Math.abs(ticks - expectTicks)).toBeLessThanOrEqual(1);
    // Re-entry runs the PLAYING-entry resets: spawner cadence + pulse clock.
    expect(s.spawnTimer).toBe(lp5.spawnInt);
    expect(s.pulseClock).toBe(0); // restarted by the PLAYING entry
  });

  it('movement is applied; fire and zap are ignored', () => {
    const { sim, s } = getReadySim();
    const before = s.rimPos;
    const { events } = sim.tick(
      makeInput({ move: 0.3, fire: true, zap: true }),
    );
    expect(s.rimPos).toBeCloseTo(before + 0.3, 12);
    expect(s.playerShots).toEqual([]);
    expect(events.some((ev) => ev.type === 'playerShot')).toBe(false);
  });

  it('re-entry goes through the normal spawner (first spawn SpawnInt after resume)', () => {
    const { sim, s } = getReadySim();
    s.budget = { flipper: 3, tanker: 0, spiker: 0, fuseball: 0, pulsar: 0 };
    let guard = 0;
    while (s.phase === 'GET_READY' && guard++ < 200) sim.tick(makeInput());
    const spawnTicks = Math.ceil(lp5.spawnInt / TICK_SEC - 1e-9);
    for (let i = 1; i < spawnTicks; i++) {
      sim.tick(makeInput());
      expect(s.enemies, `tick ${i}`).toHaveLength(0);
    }
    sim.tick(makeInput());
    expect(s.enemies).toHaveLength(1);
  });

  it('same-tick last-enemy kill + death: the life is lost AND the wave completes on resume', () => {
    const { sim, s } = playingSim(cfg, 5);
    s.budget = { flipper: 0, tanker: 0, spiker: 0, fuseball: 0, pulsar: 0 };
    // The last enemy dies to a shot in step 3; an enemy shot kills the
    // player in step 4 the same tick.
    s.enemies = [
      {
        ...makeFlipper(4, lp5, makeRng(1)),
        depth: 0.5,
        prevDepth: 0.5,
        flipTimer: 100,
        fireTimer: 100,
      },
    ];
    s.playerShots = [{ lane: 4, depth: 0.47, prevDepth: 0.47 }];
    lethalShot(s);
    const livesBefore = s.lives;
    const { events } = sim.tick(makeInput());
    expect(events.some((ev) => ev.type === 'enemyKilled')).toBe(true);
    expect(events.some((ev) => ev.type === 'playerDied')).toBe(true);
    expect(s.phase).toBe('EXPLODING'); // death still resolves — life lost
    expect(s.lives).toBe(livesBefore - 1);
    finishExplosion(sim, s);
    expect(s.phase).toBe('GET_READY');
    // The empty wave completes on the first PLAYING tick after GET_READY.
    let guard = 0;
    while (s.phase === 'GET_READY' && guard++ < 200) sim.tick(makeInput());
    expect(s.phase).toBe('PLAYING');
    sim.tick(makeInput());
    expect(s.phase).toBe('WARP');
  });

  it('the wave-completion check is suspended during GET_READY', () => {
    const { sim, s } = getReadySim();
    s.budget = { flipper: 0, tanker: 0, spiker: 0, fuseball: 0, pulsar: 0 };
    for (let i = 0; i < 10; i++) {
      sim.tick(makeInput());
      expect(s.phase).toBe('GET_READY'); // no completion while waiting
    }
  });
});
