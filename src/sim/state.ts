// Sim-owned state machine (§10, I8): SimState shape, the pure transition
// helper, and level/state entry initializers. ALL transitions live in this
// file so the §13 "every transition and no others" test (Task 6.2) can
// target it directly. Pause is NOT here — it is an app-layer overlay (D19).

import { TICK_SEC } from './types';
import type {
  Enemy,
  EnemyKind,
  InputSnapshot,
  Phase,
  Shot,
  SimEvent,
  Spike,
} from './types';
import type { GameConfig } from './config';
import type { Rng } from './rng';
import { geometryIndexForLevel, paletteIndexForLevel } from './levels';
import { paramsForLevel } from './difficultyCurve';
import { HS_CHARSET, insertScore, qualifies, type HsEntry } from './highscore';

// Read-only snapshot the app provides from persist/ so the sim can decide
// level-select bounds (§8.5) and high-score qualification (§10) WITHOUT
// reading localStorage itself (§12.2, I14). The app persists the sim's
// updated highScores/maxLevelReached back after the game (Tasks 11.1/11.2).
export interface InitialSave {
  maxLevelReached: number;
  highScores: HsEntry[]; // sorted desc, ≤ 10
}

export interface SimState {
  phase: Phase;
  level: number;
  score: number;
  lives: number;
  livesGranted: number; // bonus-life accounting (§7): lives already granted
  rimPos: number;
  prevRimPos: number; // render interpolation only — NOT hashed
  warpDepth: number;
  prevWarpDepth: number; // render interpolation only — NOT hashed
  closed: boolean;
  geometryIndex: number;
  paletteIndex: number;
  enemies: Enemy[];
  playerShots: Shot[];
  enemyShots: Shot[];
  spikes: Spike[];
  budget: Record<EnemyKind, number>; // remaining spawn budget (§6)
  superzapper: 0 | 1 | 2; // EMPTY/PARTIAL/FULL (§5)
  spawnTimer: number;
  pulseClock: number;
  getReadyTimer: number;
  beatTimer: number; // game-over beat countdown (§8.3/§10)
  fireCooldown: number;
  maxLevelReached: number;
  selector: number; // level-select value (the chosen level)
  selectorAccum: number; // UI movement accumulator (§10, Task 6.1)
  selectorTimer: number; // UI step-rate limiter (§10, Task 6.1)
  hsInitials: number[]; // HS_CHARSET index per slot; each defaults to 'A' (=1)
  hsSlot: number; // active high-score-entry slot (0..2)
  highScores: HsEntry[]; // in-session table (seeded from InitialSave)
  rng: Rng;
}

// §8.5: highest selectable starting level.
export function maxStartLevel(s: SimState): number {
  return Math.max(9, s.maxLevelReached);
}

// Pure level (re)initializer (§4/§5/§6/§8.5): first level via
// LEVEL_SELECT→PLAYING here, every subsequent level via WARP→PLAYING (Task
// 5.2). Leaves lives/score/livesGranted alone — those persist across levels
// within a run (the once-per-game reset is in the LEVEL_SELECT→PLAYING edge).
export function beginLevel(s: SimState, level: number, cfg: GameConfig): void {
  const params = paramsForLevel(level, cfg.difficulty);
  s.level = level;
  s.geometryIndex = geometryIndexForLevel(level);
  s.paletteIndex = paletteIndexForLevel(level);
  s.closed = cfg.geometries[s.geometryIndex]!.closed;
  s.enemies = [];
  s.playerShots = [];
  s.enemyShots = [];
  s.spikes = [];
  s.budget = {
    flipper: params.flipper,
    tanker: params.tanker,
    spiker: params.spiker,
    fuseball: params.fuseball,
    pulsar: params.pulsar,
  };
  s.superzapper = 2; // FULL at the start of every level (§5)
  s.rimPos = 8; // lane-8 center at level start (§5)
  s.prevRimPos = 8;
  s.warpDepth = 0;
  s.prevWarpDepth = 0;
  s.fireCooldown = 0;
  s.maxLevelReached = Math.max(s.maxLevelReached, level); // §8.5
}

// PLAYING-entry resets (§6/§6.5): apply on EVERY entry into PLAYING
// (LEVEL_SELECT, WARP, or GET_READY) — the first spawn attempt is SpawnInt
// after entry and the pulse clock restarts. Distinct from beginLevel.
export function enterPlaying(s: SimState, cfg: GameConfig): void {
  const params = paramsForLevel(s.level, cfg.difficulty);
  s.phase = 'PLAYING';
  s.spawnTimer = params.spawnInt;
  s.pulseClock = 0;
}

function enterLevelSelect(s: SimState): void {
  s.phase = 'LEVEL_SELECT';
  s.selector = maxStartLevel(s); // opens at the highest allowed level (§10)
  s.selectorAccum = 0; // cleared on state entry (§8.3)
  s.selectorTimer = 0;
}

function enterTitle(s: SimState): void {
  s.phase = 'TITLE';
  s.selectorAccum = 0;
  s.selectorTimer = 0;
}

function enterHighScoreEntry(s: SimState): void {
  s.phase = 'HIGH_SCORE_ENTRY';
  s.hsInitials = [1, 1, 1]; // each slot defaults to 'A' (§10)
  s.hsSlot = 0;
  s.selectorAccum = 0;
  s.selectorTimer = 0;
}

// §6: all shots (both sides) are cleared on every sim state transition
// (death, wave completion, level start, game over). beginLevel covers level
// start; death/wave transitions call this directly (Tasks 5.x).
export function clearAllShots(s: SimState): void {
  s.playerShots = [];
  s.enemyShots = [];
}

export function enterGameOver(s: SimState, cfg: GameConfig): void {
  s.phase = 'GAME_OVER';
  s.beatTimer = cfg.tuning.gameOverBeat;
  clearAllShots(s);
}

// §10 transitions — step 9 of the tick order. Menu states act ONLY on the
// edge-triggered `confirm`/`back` intents, never the held `fire` gameplay
// boolean (C10). Runs once per tick; at most one transition fires.
export function transition(
  s: SimState,
  input: InputSnapshot,
  cfg: GameConfig,
  events: SimEvent[],
): void {
  switch (s.phase) {
    case 'TITLE': {
      if (input.confirm) {
        events.push({ type: 'uiConfirm' });
        enterLevelSelect(s);
      }
      break;
    }
    case 'LEVEL_SELECT': {
      if (input.back) {
        enterTitle(s);
      } else if (input.confirm) {
        events.push({ type: 'uiConfirm' });
        // Once-per-game reset (distinct from beginLevel's per-level resets).
        s.lives = cfg.tuning.startingLives;
        s.score = 0;
        s.livesGranted = 0;
        beginLevel(s, s.selector, cfg);
        enterPlaying(s, cfg);
      }
      break;
    }
    case 'PLAYING':
    case 'GET_READY':
    case 'WARP': {
      // Death/wave/warp/quit edges land in Tasks 5.x/6.x.
      break;
    }
    case 'GAME_OVER': {
      // Hold for the game-over beat; inputs are ignored until it elapses.
      s.beatTimer -= TICK_SEC;
      if (s.beatTimer <= 0) {
        if (qualifies(s.highScores, s.score)) {
          events.push({ type: 'highScoreJingle' });
          enterHighScoreEntry(s);
        } else {
          enterTitle(s);
        }
      }
      break;
    }
    case 'HIGH_SCORE_ENTRY': {
      // Slot rotation/back handling is Task 6.1; the confirm edge that locks
      // slots (and, on the third, commits the entry) lives here.
      if (input.confirm) {
        events.push({ type: 'uiConfirm' });
        if (s.hsSlot >= 2) {
          const initials = s.hsInitials
            .map((i) => HS_CHARSET[i] ?? ' ')
            .join('');
          s.highScores = insertScore(s.highScores, {
            initials,
            score: s.score,
            level: s.level,
          });
          enterTitle(s);
        } else {
          s.hsSlot += 1;
        }
      }
      break;
    }
  }
}
