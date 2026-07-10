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

  it('TITLE → LEVEL_SELECT on confirm, selector opens at level 1', () => {
    const sim = createSim(cfg, 1);
    const { events } = sim.tick(makeInput({ confirm: true }));
    expect(sim.getState().phase).toBe('LEVEL_SELECT');
    expect(sim.getState().selector).toBe(1); // opens at 1 (§10)
    expect(events).toContainEqual({ type: 'uiConfirm' });

    // A higher maxLevelReached only raises the ceiling — the opening value
    // is still 1 (the player steps up from there).
    const returning = createSim(cfg, 1, {
      maxLevelReached: 15,
      highScores: [],
    });
    returning.tick(makeInput({ confirm: true }));
    expect(returning.getState().selector).toBe(1);
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
    expect(s.selector).toBe(1); // opens at 1 (§10)
    s.selector = 12; // player steps the selector up to 12
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
    const s = mutableState(sim);
    sim.tick(makeInput({ confirm: true })); // TITLE → LEVEL_SELECT (opens at 1)
    s.selector = 9; // player raises the selector above the old max
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

// Task 6.2 — quit-to-title + the FULL §10 transition set.
describe('quit-to-title (§10/D19)', () => {
  function inPlay(level = 5) {
    const sim = createSim(cfg, 1);
    const s = mutableState(sim);
    s.lives = cfg.tuning.startingLives;
    beginLevel(s, level, cfg);
    s.phase = 'PLAYING';
    return { sim, s };
  }

  it('quit forces GAME_OVER from PLAYING, GET_READY, and WARP', () => {
    for (const phase of ['PLAYING', 'GET_READY', 'WARP'] as const) {
      const { sim, s } = inPlay();
      s.phase = phase;
      s.getReadyTimer = 1;
      sim.tick(makeInput({ quit: true }));
      expect(s.phase, phase).toBe('GAME_OVER');
      expect(s.beatTimer).toBeGreaterThan(0);
    }
  });

  it('a quit run still reaches high-score entry when the score qualifies', () => {
    const { sim, s } = inPlay();
    s.score = 5000;
    s.highScores = [];
    sim.tick(makeInput({ quit: true }));
    let guard = 0;
    while (s.phase === 'GAME_OVER' && guard++ < 200) sim.tick(makeInput());
    expect(s.phase).toBe('HIGH_SCORE_ENTRY'); // the run's score counted
  });

  it('quit beats a same-tick lethal event — GAME_OVER, no life lost (codex P2)', () => {
    const { sim, s } = inPlay();
    const livesBefore = s.lives;
    s.enemyShots.push({ lane: 8, depth: 0.005, prevDepth: 0.02 }); // lethal
    const { events } = sim.tick(makeInput({ quit: true }));
    expect(s.phase).toBe('GAME_OVER');
    expect(s.lives).toBe(livesBefore); // the run ended before the shot landed
    expect(events.some((ev) => ev.type === 'playerDied')).toBe(false);
  });

  it('quit is ignored in menu states', () => {
    const sim = createSim(cfg, 1);
    const s = mutableState(sim);
    sim.tick(makeInput({ quit: true }));
    expect(s.phase).toBe('TITLE');
    sim.tick(makeInput({ confirm: true }));
    sim.tick(makeInput({ quit: true }));
    expect(s.phase).toBe('LEVEL_SELECT');
    s.phase = 'HIGH_SCORE_ENTRY';
    sim.tick(makeInput({ quit: true }));
    expect(s.phase).toBe('HIGH_SCORE_ENTRY');
  });
});

describe('the full §10 transition set — every edge, and no others', () => {
  function freshPlay() {
    const sim = createSim(cfg, 1);
    const s = mutableState(sim);
    s.lives = cfg.tuning.startingLives;
    s.score = 0;
    s.livesGranted = 0;
    beginLevel(s, 5, cfg);
    s.phase = 'PLAYING';
    return { sim, s };
  }
  const die = (s: SimState) =>
    s.enemyShots.push({ lane: 8, depth: 0.005, prevDepth: 0.02 });
  const emptyWave = (s: SimState) => {
    s.budget = { flipper: 0, tanker: 0, spiker: 0, fuseball: 0, pulsar: 0 };
    s.enemies = [];
  };

  it('exercises all 13 declared edges', () => {
    // 1. TITLE → LEVEL_SELECT (confirm)
    const t1 = createSim(cfg, 1);
    t1.tick(makeInput({ confirm: true }));
    expect(t1.getState().phase).toBe('LEVEL_SELECT');
    // 2. LEVEL_SELECT → TITLE (back)
    t1.tick(makeInput({ back: true }));
    expect(t1.getState().phase).toBe('TITLE');
    // 3. LEVEL_SELECT → PLAYING (confirm)
    t1.tick(makeInput({ confirm: true }));
    t1.tick(makeInput({ confirm: true }));
    expect(t1.getState().phase).toBe('PLAYING');
    // 4. PLAYING → GET_READY (death, lives remain)
    const t4 = freshPlay();
    die(t4.s);
    t4.sim.tick(makeInput());
    expect(t4.s.phase).toBe('GET_READY');
    // 5. GET_READY → PLAYING (timer elapses)
    t4.s.getReadyTimer = 0.001;
    t4.sim.tick(makeInput());
    expect(t4.s.phase).toBe('PLAYING');
    // 6. PLAYING → WARP (wave complete)
    emptyWave(t4.s);
    t4.sim.tick(makeInput());
    expect(t4.s.phase).toBe('WARP');
    // 7a. WARP → PLAYING (descent complete)
    t4.s.warpDepth = 1;
    t4.sim.tick(makeInput());
    expect(t4.s.phase).toBe('PLAYING');
    // 7b. WARP → PLAYING (spike death, lives remaining)
    const t7 = freshPlay();
    t7.s.phase = 'WARP';
    t7.s.spikes = [{ lane: 8, topDepth: 0.001 }];
    t7.sim.tick(makeInput());
    expect(t7.s.phase).toBe('PLAYING');
    expect(t7.s.level).toBe(6);
    // 8a. PLAYING → GAME_OVER (death, no lives left)
    const t8 = freshPlay();
    t8.s.lives = 1;
    die(t8.s);
    t8.sim.tick(makeInput());
    expect(t8.s.phase).toBe('GAME_OVER');
    // 8b. PLAYING → GAME_OVER (quit)
    const t8b = freshPlay();
    t8b.sim.tick(makeInput({ quit: true }));
    expect(t8b.s.phase).toBe('GAME_OVER');
    // 9. GET_READY → GAME_OVER (quit)
    const t9 = freshPlay();
    t9.s.phase = 'GET_READY';
    t9.s.getReadyTimer = 1;
    t9.sim.tick(makeInput({ quit: true }));
    expect(t9.s.phase).toBe('GAME_OVER');
    // 10a. WARP → GAME_OVER (spike death, no lives left)
    const t10 = freshPlay();
    t10.s.phase = 'WARP';
    t10.s.lives = 1;
    t10.s.spikes = [{ lane: 8, topDepth: 0.001 }];
    t10.sim.tick(makeInput());
    expect(t10.s.phase).toBe('GAME_OVER');
    // 10b. WARP → GAME_OVER (quit)
    const t10b = freshPlay();
    t10b.s.phase = 'WARP';
    t10b.sim.tick(makeInput({ quit: true }));
    expect(t10b.s.phase).toBe('GAME_OVER');
    // 11. GAME_OVER → HIGH_SCORE_ENTRY (beat elapsed, qualifies)
    const t11 = freshPlay();
    t11.s.phase = 'GAME_OVER';
    t11.s.beatTimer = 0.001;
    t11.s.score = 100;
    t11.s.highScores = [];
    t11.sim.tick(makeInput());
    expect(t11.s.phase).toBe('HIGH_SCORE_ENTRY');
    // 12. GAME_OVER → TITLE (beat elapsed, does not qualify)
    const t12 = freshPlay();
    t12.s.phase = 'GAME_OVER';
    t12.s.beatTimer = 0.001;
    t12.s.score = 0;
    t12.s.highScores = fullTable(1000);
    t12.sim.tick(makeInput());
    expect(t12.s.phase).toBe('TITLE');
    // 13. HIGH_SCORE_ENTRY → TITLE (initials confirmed)
    const t13 = freshPlay();
    t13.s.phase = 'HIGH_SCORE_ENTRY';
    t13.s.hsSlot = 2;
    t13.sim.tick(makeInput({ confirm: true }));
    expect(t13.s.phase).toBe('TITLE');
  });

  it('fires NO undeclared transitions from any state', () => {
    const noisy = [
      makeInput({ fire: true, zap: true, move: 0.45 }),
      makeInput({ confirm: true, back: true }), // menus consume these per §10 only
    ];
    // PLAYING: confirm/back/fire/zap/move never leave the state.
    const p = freshPlay();
    p.s.enemies = [];
    p.s.budget.flipper = 5; // wave incomplete
    for (const input of noisy) p.sim.tick(input);
    expect(p.s.phase).toBe('PLAYING');
    // GET_READY: only the timer or quit exit; fire/confirm/back do nothing.
    const g = freshPlay();
    g.s.phase = 'GET_READY';
    g.s.getReadyTimer = 10;
    for (const input of noisy) g.sim.tick(input);
    expect(g.s.phase).toBe('GET_READY');
    // WARP: only bottom-arrival, spike death, or quit exit.
    const w = freshPlay();
    w.s.phase = 'WARP';
    for (const input of noisy) w.sim.tick(input);
    expect(w.s.phase).toBe('WARP');
    // GAME_OVER: inputs never exit early (beat gate only).
    const o = freshPlay();
    o.s.phase = 'GAME_OVER';
    o.s.beatTimer = 10;
    for (const input of [...noisy, makeInput({ quit: true })])
      o.sim.tick(input);
    expect(o.s.phase).toBe('GAME_OVER');
    // TITLE: only confirm exits (asserted with every other input in 3.1).
    const sim = createSim(cfg, 1);
    for (const input of [
      ...noisy.slice(0, 1),
      makeInput({ back: true, quit: true }),
    ])
      sim.tick(input);
    expect(sim.getState().phase).toBe('TITLE');
    // HIGH_SCORE_ENTRY: fire/zap/move/quit never exit; back stays inside.
    const h = freshPlay();
    h.s.phase = 'HIGH_SCORE_ENTRY';
    h.s.hsSlot = 1;
    for (const input of [
      ...noisy.slice(0, 1),
      makeInput({ quit: true, back: true }),
    ])
      h.sim.tick(input);
    expect(h.s.phase).toBe('HIGH_SCORE_ENTRY');
  });
});
