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
  playerFireCooldownTicks: number; // ticks remaining before held fire may repeat
  enemyShots: Shot[];
  spikes: Spike[];
  budget: Record<EnemyKind, number>; // remaining spawn budget (§6)
  superzapper: 0 | 1 | 2; // EMPTY/PARTIAL/FULL (§5)
  spawnTimer: number;
  pulseClock: number;
  deathTimer: number;
  deathFromWarp: boolean;
  getReadyTimer: number;
  beatTimer: number; // game-over beat countdown (§8.3/§10)
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
  s.playerFireCooldownTicks = 0;
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
  s.deathTimer = 0;
  s.deathFromWarp = false;
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
  s.deathTimer = 0;
  s.deathFromWarp = false;
}

function enterLevelSelect(s: SimState): void {
  s.phase = 'LEVEL_SELECT';
  s.selector = 1; // opens at level 1; the player steps up to maxStartLevel (§10)
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
  s.playerFireCooldownTicks = 0;
  s.enemyShots = [];
}

export function enterGameOver(s: SimState, cfg: GameConfig): void {
  s.phase = 'GAME_OVER';
  s.beatTimer = cfg.tuning.gameOverBeat;
  s.deathTimer = 0;
  s.deathFromWarp = false;
  clearAllShots(s);
}

// PLAYING → WARP on wave completion (§8.4/§9): shots on both sides are
// cancelled and spikes remain. Clearing the fixed player-shot pool makes a
// shot available on the first descent tick.
export function enterWarp(s: SimState, events: SimEvent[]): void {
  s.phase = 'WARP';
  s.warpDepth = 0;
  s.prevWarpDepth = 0;
  clearAllShots(s);
  events.push({ type: 'warpStart' });
}

// Quit-to-title (§10/D19): uiQuit forces GAME_OVER from any pauseable
// state. Runs BEFORE the combat pipeline so a lethal event on the same
// tick can never outrun the player's quit (codex P2) — the run ends at the
// moment of quitting, with no life lost.
export function applyQuit(s: SimState, cfg: GameConfig): boolean {
  if (
    s.phase === 'PLAYING' ||
    s.phase === 'EXPLODING' ||
    s.phase === 'GET_READY' ||
    s.phase === 'WARP'
  ) {
    enterGameOver(s, cfg);
    return true;
  }
  return false;
}

// Death resolution (§5/§9/§10) — runs as step 9 on any tick a lethality
// step killed the player, INSTEAD of the normal transition pass.
export function resolveDeath(
  s: SimState,
  cfg: GameConfig,
  events: SimEvent[],
): void {
  if (s.phase === 'WARP') {
    // §9: the life is lost at the collision, but the level still counts as
    // complete (its bonus was already awarded) and the descent is NOT
    // replayed (D16). EXPLODING delays the next-level/game-over transition;
    // maxLevelReached changes only if beginLevel runs after the FX hold.
    s.lives -= 1;
    clearAllShots(s);
    s.phase = 'EXPLODING';
    s.deathTimer = cfg.tuning.playerExplosionDuration;
    s.deathFromWarp = true;
    return;
  }
  if (s.phase === 'PLAYING') {
    // §5 after-death: on-well enemies are removed instantly and RETURNED to
    // the wave's remaining spawn budget by type — they re-enter through the
    // normal spawner. Flippers released by Tanker splits return to the
    // Flipper budget, which may therefore exceed the level's authored count
    // (intended). Shots (both sides) are cleared; spikes, score, rim
    // position, and Superzapper state persist.
    s.lives -= 1;
    for (const e of s.enemies) {
      s.budget[e.kind] += 1;
    }
    s.enemies = [];
    clearAllShots(s);
    s.phase = 'EXPLODING';
    s.deathTimer = cfg.tuning.playerExplosionDuration;
    s.deathFromWarp = false;
  }
  void events;
}

// UI-navigation selector (§10/§8.3): the movement delta accumulates and
// emits ONE step per full ±1.0 lanes, at most one step per uiStepInterval;
// the accumulator resets on each emitted step and clears when input crosses
// zero (or on state entry) — the selector stops the moment the key is
// released, with no post-release backlog.
function uiSelectorStep(
  s: SimState,
  input: InputSnapshot,
  cfg: GameConfig,
): -1 | 0 | 1 {
  s.selectorTimer = Math.max(0, s.selectorTimer - TICK_SEC);
  const move = input.move;
  if (
    move === 0 ||
    (s.selectorAccum !== 0 && move > 0 !== s.selectorAccum > 0)
  ) {
    s.selectorAccum = 0; // zero-cross / release: immediate stop
  }
  if (move === 0) return 0;
  s.selectorAccum += move;
  if (Math.abs(s.selectorAccum) >= 1 && s.selectorTimer <= 0) {
    const step = s.selectorAccum > 0 ? 1 : -1;
    s.selectorAccum = 0; // reset on emit
    s.selectorTimer = cfg.tuning.uiStepInterval;
    return step;
  }
  return 0;
}

// §10 transitions — step 9 of the tick order. Menu states act ONLY on the
// edge-triggered `confirm`/`back` intents, never the held `fire` gameplay
// boolean (C10; the TITLE click carve-out arrives as `confirm` from the
// input layer). Runs once per tick; at most one transition fires.
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
      // §10: selector ranges 1..max(9, maxLevelReached), clamped (no wrap);
      // left decreases, right increases.
      const step = uiSelectorStep(s, input, cfg);
      if (step !== 0) {
        const next = Math.min(maxStartLevel(s), Math.max(1, s.selector + step));
        if (next !== s.selector) {
          s.selector = next;
          events.push({ type: 'uiMove' });
        }
      }
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
    case 'PLAYING': {
      // Death is handled by resolveDeath, quit by applyQuit — both run in
      // tick() around the combat pipeline.
      break;
    }
    case 'EXPLODING': {
      if (s.deathTimer <= 0) {
        if (s.lives <= 0) {
          enterGameOver(s, cfg);
        } else if (s.deathFromWarp) {
          beginLevel(s, s.level + 1, cfg);
          enterPlaying(s, cfg);
        } else {
          s.phase = 'GET_READY';
          s.deathTimer = 0;
          s.deathFromWarp = false;
          s.getReadyTimer = cfg.tuning.getReadyDuration;
        }
      }
      break;
    }
    case 'GET_READY': {
      // §10: lasts getReadyDuration, then play resumes (PLAYING-entry
      // resets restart the spawner cadence and pulse clock).
      if (s.getReadyTimer <= 0) {
        enterPlaying(s, cfg);
      }
      break;
    }
    case 'WARP': {
      // §9: on reaching the bottom the next level begins (WARP → PLAYING).
      // The level banner/fade-in are render-side with no sim effect.
      if (s.warpDepth >= 1) {
        beginLevel(s, s.level + 1, cfg);
        enterPlaying(s, cfg);
      }
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
      // §10: UI steps rotate the active slot's character over the ordered,
      // WRAPPING 37-char set (space, A–Z, 0–9).
      const step = uiSelectorStep(s, input, cfg);
      if (step !== 0) {
        const n = HS_CHARSET.length;
        s.hsInitials[s.hsSlot] =
          ((((s.hsInitials[s.hsSlot] ?? 1) + step) % n) + n) % n;
        events.push({ type: 'uiMove' });
      }
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
      } else if (input.back && s.hsSlot > 0) {
        s.hsSlot -= 1; // back returns to the previous slot; inert on the first
      }
      break;
    }
  }
}
