// createSim: the tick() entry point (§12.2). The sim is constructed from an
// injected GameConfig + seed (+ optional InitialSave, I14) and advances ONLY
// via tick(inputSnapshot) — no browser APIs, no wall clock, no entropy.

import type { InputSnapshot, SimEvent } from './types';
import type { GameConfig } from './config';
import { validateConfig } from './config';
import { makeRng } from './rng';
import { geometryIndexForLevel, paletteIndexForLevel } from './levels';
import { hashState } from './hash';
import {
  maxStartLevel,
  transition,
  type InitialSave,
  type SimState,
} from './state';

export type { InitialSave, SimState } from './state';

export interface Sim {
  tick(input: InputSnapshot): { events: SimEvent[] };
  getState(): Readonly<SimState>;
  hash(): number;
}

const DEFAULT_SAVE: InitialSave = { maxLevelReached: 1, highScores: [] };

function makeInitialState(
  cfg: GameConfig,
  seed: number,
  save: InitialSave,
): SimState {
  const maxLevelReached = Math.max(1, Math.floor(save.maxLevelReached));
  const geometryIndex = geometryIndexForLevel(1);
  const s: SimState = {
    phase: 'TITLE',
    level: 1,
    score: 0,
    lives: cfg.tuning.startingLives,
    livesGranted: 0,
    rimPos: 8,
    prevRimPos: 8,
    warpDepth: 0,
    prevWarpDepth: 0,
    closed: cfg.geometries[geometryIndex]!.closed,
    geometryIndex,
    paletteIndex: paletteIndexForLevel(1),
    enemies: [],
    playerShots: [],
    enemyShots: [],
    spikes: [],
    budget: { flipper: 0, tanker: 0, spiker: 0, fuseball: 0, pulsar: 0 },
    superzapper: 2,
    spawnTimer: 0,
    pulseClock: 0,
    getReadyTimer: 0,
    beatTimer: 0,
    fireCooldown: 0,
    maxLevelReached,
    selector: 1,
    selectorAccum: 0,
    selectorTimer: 0,
    hsInitials: [1, 1, 1],
    hsSlot: 0,
    highScores: save.highScores.map((e) => ({ ...e })),
    rng: makeRng(seed),
  };
  s.selector = maxStartLevel(s);
  return s;
}

// §6 tick-resolution order for the combat states (PLAYING and WARP alike).
// Steps are ordered function calls; most are no-ops until their tasks land
// (Tasks 3.2–5.x). benchMode (census-hold, §12.6) suppresses death/despawn/
// wave-completion in the steps that consult it; it lives in the Sim closure —
// never in SimState, so it is never hashed — and is always false on the real
// play path.
function tickCombat(
  s: SimState,
  input: InputSnapshot,
  cfg: GameConfig,
  events: SimEvent[],
  benchMode: boolean,
): void {
  stepApplyInput(s, input, cfg, events); // 1 (Task 3.2)
  stepAdvanceEntities(s, cfg, events); // 2 (Tasks 3.2/4.x)
  stepPlayerShotCollisions(s, cfg, events, benchMode); // 3 (Tasks 3.2/4.x)
  stepEnemyShotLethality(s, cfg, events, benchMode); // 4 (Task 4.6)
  stepContactLethality(s, cfg, events, benchMode); // 5 (Tasks 4.x/5.2)
  stepBonusLife(s, cfg, events); // 6 (Task 3.3)
  stepSpawner(s, cfg, events); // 7 (Task 4.7)
  stepWaveCompletion(s, cfg, events, benchMode); // 8 (Task 5.1)
  // 9: state transitions — runs for every phase in tick() below.
}

/* eslint-disable @typescript-eslint/no-unused-vars */
// AIDEV-TODO: each placeholder below is implemented by its named task
// (underscore params keep noUnusedParameters quiet until then).
function stepApplyInput(
  _s: SimState,
  _input: InputSnapshot,
  _cfg: GameConfig,
  _events: SimEvent[],
): void {}
function stepAdvanceEntities(
  _s: SimState,
  _cfg: GameConfig,
  _events: SimEvent[],
): void {}
function stepPlayerShotCollisions(
  _s: SimState,
  _cfg: GameConfig,
  _events: SimEvent[],
  _benchMode: boolean,
): void {}
function stepEnemyShotLethality(
  _s: SimState,
  _cfg: GameConfig,
  _events: SimEvent[],
  _benchMode: boolean,
): void {}
function stepContactLethality(
  _s: SimState,
  _cfg: GameConfig,
  _events: SimEvent[],
  _benchMode: boolean,
): void {}
function stepBonusLife(
  _s: SimState,
  _cfg: GameConfig,
  _events: SimEvent[],
): void {}
function stepSpawner(
  _s: SimState,
  _cfg: GameConfig,
  _events: SimEvent[],
): void {}
function stepWaveCompletion(
  _s: SimState,
  _cfg: GameConfig,
  _events: SimEvent[],
  _benchMode: boolean,
): void {}
/* eslint-enable @typescript-eslint/no-unused-vars */

function makeSim(s: SimState, cfg: GameConfig, benchMode: boolean): Sim {
  return {
    tick(input: InputSnapshot): { events: SimEvent[] } {
      const events: SimEvent[] = [];
      // Snapshot render-interpolation prevs at tick start (§12.3); entity
      // prevs are snapshotted by their own movement in step 2.
      s.prevRimPos = s.rimPos;
      s.prevWarpDepth = s.warpDepth;
      if (s.phase === 'PLAYING' || s.phase === 'WARP') {
        tickCombat(s, input, cfg, events, benchMode);
      }
      transition(s, input, cfg, events); // §6 step 9
      return { events };
    },
    getState(): Readonly<SimState> {
      return s;
    },
    hash(): number {
      return hashState(s);
    },
  };
}

export function createSim(
  cfg: GameConfig,
  seed: number,
  initialSave?: InitialSave,
): Sim {
  validateConfig(cfg); // guards live tuning constants at construction (§13)
  return makeSim(
    makeInitialState(cfg, seed, initialSave ?? DEFAULT_SAVE),
    cfg,
    false,
  );
}

// Debug/bench entry (§12.6, Task 11.3): wrap a caller-supplied SimState.
export function createSimFromState(
  state: SimState,
  cfg: GameConfig,
  benchMode: boolean,
): Sim {
  return makeSim(state, cfg, benchMode);
}
