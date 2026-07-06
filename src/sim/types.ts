// Core sim types (§4–§12). Pure module: no browser APIs (§12.2).
// GameConfig lives in config.ts; SimState in state.ts.

export type Lane = number; // fractional for rimPos; integer for a resolved lane
export type Depth = number; // 0 (rim) .. 1 (bottom)

export type EnemyKind = 'flipper' | 'tanker' | 'spiker' | 'fuseball' | 'pulsar';

export type Phase =
  | 'TITLE'
  | 'LEVEL_SELECT'
  | 'PLAYING'
  | 'GET_READY'
  | 'WARP'
  | 'GAME_OVER'
  | 'HIGH_SCORE_ENTRY';

export const TICK_MS = 1000 / 60; // fixed timestep (§12.3)
export const TICK_SEC = 1 / 60; // per-tick seconds; ALL sim updates advance
// by this constant, never a passed-in dt
// (Task 2.1's stepper re-exports TICK_MS)

// §12.3 — the ONLY way the sim advances.
export interface InputSnapshot {
  move: number; // per-tick rim delta in lanes, pre-clamped by input layer
  fire: boolean;
  zap: boolean;
  confirm: boolean; // edge-triggered UI intents (menus read these, never `fire` — C10)
  back: boolean;
  quit: boolean;
}

export interface Enemy {
  kind: EnemyKind;
  lane: number;
  depth: Depth;
  prevLane: number; // for render interpolation (§12.3)
  prevDepth: Depth;
  // flip: source/dest lane + progress 0..1, or null when not flipping (§6)
  flip: { from: number; to: number; progress: number } | null;
  flipTimer: number; // seconds until next flip attempt
  fireTimer: number; // seconds until next shot attempt (firing kinds)
  climbDir?: 1 | -1; // spiker/pulsar/fuseball climb(+1)/descend(-1) phase (§6.3/6.4/6.5)
  // Per-kind fields (each Phase 4 task adds its own and hashes it):
  rimTimer?: number; // fuseball rim residency countdown (Task 4.4, §6.4)
  rimDir?: 1 | -1; // fuseball fixed rim-crawl direction until an open end (Task 4.4, §6.4)
  jitterTimer?: number; // fuseball 0.5 s speed-redraw clock (Task 4.4)
  speedMul?: number; // fuseball current jitter multiplier (Task 4.4, §6.4)
  descentTarget?: number; // fuseball post-rim descent target, redrawn at each
  // rim→descent transition, depth ∈ [0.6,1] (Task 4.4, §6.4)
  pulseJoined?: boolean; // pulsar participates in the current pulse cycle (Task 4.5, §6.5)
  // (Spiker reversal depth is 1 − LevelParams.spikeH — a per-level value, not a
  //  per-enemy field; there is deliberately no Enemy.spikeH.)
}

export interface Shot {
  lane: number;
  depth: Depth;
  prevDepth: Depth;
}

export interface Spike {
  lane: number;
  topDepth: Depth; // occupies [topDepth, 1]
}

export type SimEvent =
  | { type: 'playerShot' }
  | { type: 'enemyShot' }
  | { type: 'enemyKilled'; kind: EnemyKind; lane: number; depth: Depth } // lane for death burst
  | { type: 'playerDied' }
  | { type: 'flip' }
  | { type: 'superzap' }
  | { type: 'spikeHit' }
  | { type: 'pulseTelegraph' }
  | { type: 'bonusLife' }
  | { type: 'warpStart' }
  | { type: 'uiMove' }
  | { type: 'uiConfirm' }
  | { type: 'highScoreJingle' };

// Frozen canonical list of the five enemy kinds, for iteration and tests (§6).
export const ENEMY_KINDS: readonly EnemyKind[] = Object.freeze([
  'flipper',
  'tanker',
  'spiker',
  'fuseball',
  'pulsar',
]);
