import { describe, expect, it } from 'vitest';
import { createSim, type Sim, type SimState } from './sim';
import { beginLevel } from './state';
import { paramsForLevel } from './difficultyCurve';
import { geometryIndexForLevel, paletteIndexForLevel } from './levels';
import { makeLiveConfig } from '../__tests__/fixtures/liveConfig';
import { makeInput } from '../__tests__/fixtures/input';
import type { HsEntry } from './highscore';

// §13 state-machine area — built incrementally; WARP/GET_READY/quit edges
// are added by Tasks 5.x/6.x tests.

const cfg = makeLiveConfig();

function mutableState(sim: Sim): SimState {
  return sim.getState() as SimState;
}

function fullTable(tenthScore: number): HsEntry[] {
  return Array.from({ length: 10 }, (_, i) => ({
    initials: 'AAA',
    score: tenthScore + (9 - i) * 100,
    level: 1,
  }));
}

describe('state machine skeleton (§10)', () => {
  it('starts in TITLE', () => {
    const sim = createSim(cfg, 1);
    expect(sim.getState().phase).toBe('TITLE');
  });

  it('TITLE → LEVEL_SELECT on confirm, selector opens at max(9, maxLevelReached)', () => {
    const sim = createSim(cfg, 1);
    const { events } = sim.tick(makeInput({ confirm: true }));
    expect(sim.getState().phase).toBe('LEVEL_SELECT');
    expect(sim.getState().selector).toBe(9); // default save: max(9, 1)
    expect(events).toContainEqual({ type: 'uiConfirm' });

    const returning = createSim(cfg, 1, {
      maxLevelReached: 15,
      highScores: [],
    });
    returning.tick(makeInput({ confirm: true }));
    expect(returning.getState().selector).toBe(15);
  });

  it('menus ignore the held fire boolean — only the confirm edge acts (C10)', () => {
    const sim = createSim(cfg, 1);
    for (let i = 0; i < 10; i++) {
      sim.tick(makeInput({ fire: true }));
    }
    expect(sim.getState().phase).toBe('TITLE');
    sim.tick(makeInput({ confirm: true }));
    expect(sim.getState().phase).toBe('LEVEL_SELECT');
    for (let i = 0; i < 10; i++) {
      sim.tick(makeInput({ fire: true }));
    }
    expect(sim.getState().phase).toBe('LEVEL_SELECT');
  });

  it('LEVEL_SELECT → TITLE on back', () => {
    const sim = createSim(cfg, 1);
    sim.tick(makeInput({ confirm: true }));
    sim.tick(makeInput({ back: true }));
    expect(sim.getState().phase).toBe('TITLE');
  });

  it('LEVEL_SELECT → PLAYING does the once-per-game reset and records maxLevelReached', () => {
    const sim = createSim(cfg, 1, { maxLevelReached: 12, highScores: [] });
    const s = mutableState(sim);
    s.score = 999; // stale values from a hypothetical prior run
    s.lives = 0;
    s.livesGranted = 3;
    sim.tick(makeInput({ confirm: true })); // TITLE → LEVEL_SELECT
    expect(s.selector).toBe(12);
    sim.tick(makeInput({ confirm: true })); // LEVEL_SELECT → PLAYING
    expect(s.phase).toBe('PLAYING');
    expect(s.level).toBe(12);
    expect(s.score).toBe(0);
    expect(s.lives).toBe(cfg.tuning.startingLives);
    expect(s.livesGranted).toBe(0);
    expect(s.maxLevelReached).toBe(12);
    // PLAYING-entry resets (§6): first spawn attempt SpawnInt after entry.
    expect(s.spawnTimer).toBe(paramsForLevel(12, cfg.difficulty).spawnInt);
    expect(s.pulseClock).toBe(0);
  });

  it('starting above the old maxLevelReached raises it (§8.5)', () => {
    const sim = createSim(cfg, 1); // default save: maxLevelReached 1
    sim.tick(makeInput({ confirm: true }));
    sim.tick(makeInput({ confirm: true })); // starts at selector 9
    expect(sim.getState().maxLevelReached).toBe(9);
  });

  it('GAME_OVER holds for the game-over beat, ignoring inputs, then exits', () => {
    const sim = createSim(cfg, 1);
    const s = mutableState(sim);
    s.phase = 'GAME_OVER';
    s.beatTimer = cfg.tuning.gameOverBeat;
    s.score = 5;
    s.highScores = fullTable(1000); // does not qualify
    const expectTicks = Math.round(cfg.tuning.gameOverBeat * 60);
    let ticks = 0;
    while (s.phase === 'GAME_OVER' && ticks < expectTicks + 5) {
      sim.tick(makeInput({ confirm: true, back: true, fire: true })); // all ignored
      ticks++;
    }
    expect(s.phase).toBe('TITLE'); // no qualification → TITLE
    expect(Math.abs(ticks - expectTicks)).toBeLessThanOrEqual(1); // float-safe
  });

  it('GAME_OVER → HIGH_SCORE_ENTRY when the score qualifies, with jingle', () => {
    const sim = createSim(cfg, 1);
    const s = mutableState(sim);
    s.phase = 'GAME_OVER';
    s.beatTimer = cfg.tuning.gameOverBeat;
    s.score = 2000;
    s.highScores = fullTable(100); // 10th is 100 → 2000 qualifies
    let jingled = false;
    for (let i = 0; i < 200 && s.phase === 'GAME_OVER'; i++) {
      const { events } = sim.tick(makeInput());
      if (events.some((e) => e.type === 'highScoreJingle')) jingled = true;
    }
    expect(s.phase).toBe('HIGH_SCORE_ENTRY');
    expect(jingled).toBe(true);
    expect(s.hsInitials).toEqual([1, 1, 1]); // slots default to 'A'
    expect(s.hsSlot).toBe(0);
  });

  it('HIGH_SCORE_ENTRY → TITLE on the third confirm, inserting the entry', () => {
    const sim = createSim(cfg, 1);
    const s = mutableState(sim);
    s.phase = 'HIGH_SCORE_ENTRY';
    s.hsInitials = [1, 2, 3]; // "ABC"
    s.hsSlot = 0;
    s.score = 4242;
    s.level = 7;
    s.highScores = [];
    sim.tick(makeInput({ confirm: true }));
    expect(s.phase).toBe('HIGH_SCORE_ENTRY');
    expect(s.hsSlot).toBe(1);
    sim.tick(makeInput({ confirm: true }));
    expect(s.hsSlot).toBe(2);
    sim.tick(makeInput({ confirm: true }));
    expect(s.phase).toBe('TITLE');
    expect(s.highScores).toContainEqual({
      initials: 'ABC',
      score: 4242,
      level: 7,
    });
  });

  it('fires no undeclared transitions', () => {
    // TITLE: everything except confirm is inert.
    const sim = createSim(cfg, 1);
    sim.tick(
      makeInput({ back: true, quit: true, zap: true, move: 0.4, fire: true }),
    );
    expect(sim.getState().phase).toBe('TITLE');
    // PLAYING: confirm/back are gameplay no-ops (quit lands in Task 6.2).
    sim.tick(makeInput({ confirm: true }));
    sim.tick(makeInput({ confirm: true }));
    expect(sim.getState().phase).toBe('PLAYING');
    sim.tick(makeInput({ confirm: true, back: true }));
    expect(sim.getState().phase).toBe('PLAYING');
    // HIGH_SCORE_ENTRY: back on the first slot is inert (§10).
    const s = mutableState(sim);
    s.phase = 'HIGH_SCORE_ENTRY';
    s.hsSlot = 0;
    sim.tick(makeInput({ back: true }));
    expect(s.phase).toBe('HIGH_SCORE_ENTRY');
    expect(s.hsSlot).toBe(0);
  });
});

describe('beginLevel (§4/§5/§6/§8.5)', () => {
  it('initializes the level: geometry, palette, budgets, superzapper, rim', () => {
    const sim = createSim(cfg, 1);
    const s = mutableState(sim);
    s.spikes = [{ lane: 3, topDepth: 0.5 }];
    s.playerShots = [{ lane: 1, depth: 0.5, prevDepth: 0.5 }];
    s.enemyShots = [{ lane: 2, depth: 0.5, prevDepth: 0.5 }];
    s.superzapper = 0;
    s.rimPos = 3.7;
    s.maxLevelReached = 30;
    beginLevel(s, 23, cfg);
    expect(s.level).toBe(23);
    expect(s.geometryIndex).toBe(geometryIndexForLevel(23));
    expect(s.paletteIndex).toBe(paletteIndexForLevel(23));
    expect(s.closed).toBe(cfg.geometries[s.geometryIndex]!.closed);
    const p = paramsForLevel(23, cfg.difficulty);
    expect(s.budget).toEqual({
      flipper: p.flipper,
      tanker: p.tanker,
      spiker: p.spiker,
      fuseball: p.fuseball,
      pulsar: p.pulsar,
    });
    expect(s.superzapper).toBe(2); // FULL at every level start
    expect(s.enemies).toEqual([]);
    expect(s.playerShots).toEqual([]);
    expect(s.enemyShots).toEqual([]);
    expect(s.spikes).toEqual([]);
    expect(s.rimPos).toBe(8); // lane-8 center (§5)
    expect(s.prevRimPos).toBe(8);
    expect(s.maxLevelReached).toBe(30); // max(30, 23) — not lowered
  });

  it('leaves lives/score/livesGranted alone (they persist across levels)', () => {
    const sim = createSim(cfg, 1);
    const s = mutableState(sim);
    s.lives = 5;
    s.score = 12345;
    s.livesGranted = 2;
    beginLevel(s, 2, cfg);
    expect(s.lives).toBe(5);
    expect(s.score).toBe(12345);
    expect(s.livesGranted).toBe(2);
  });
});
