// Shared shot advance + the enemy fire scheduler (§5/§6/§6.6).

import { TICK_SEC } from '../types';
import type { EnemyKind, Shot, SimEvent } from '../types';
import type { GameConfig } from '../config';
import type { LevelParams } from '../difficultyCurve';
import type { SimState } from '../state';

export function advanceShots(shots: Shot[], speed: number, dir: 1 | -1): void {
  for (const sh of shots) {
    sh.prevDepth = sh.depth;
    sh.depth += dir * speed * TICK_SEC;
  }
}

// §6: Flippers, Tankers, and Pulsars fire.
const FIRING_KINDS: ReadonlySet<EnemyKind> = new Set([
  'flipper',
  'tanker',
  'pulsar',
]);

// Enemy fire scheduler (§6): each eligible enemy independently draws its
// next-shot delay uniformly from [0.5, 1.5] × FireInt (drawn on spawn and
// after each shot OR suppressed attempt). When a timer fires the enemy is
// ineligible — the shot is suppressed and a new delay drawn — if it is
// below the minimum firing depth (rim residents included), mid-flip, or
// MaxShots enemy shots are already in flight.
export function fireEnemyShots(
  s: SimState,
  lp: LevelParams,
  cfg: GameConfig,
  events: SimEvent[],
): void {
  for (const e of s.enemies) {
    if (!FIRING_KINDS.has(e.kind)) continue;
    e.fireTimer -= TICK_SEC;
    if (e.fireTimer > 0) continue;
    const eligible =
      e.flip === null &&
      e.depth >= cfg.tuning.minFireDepth &&
      s.enemyShots.length < lp.maxShots;
    if (eligible) {
      s.enemyShots.push({ lane: e.lane, depth: e.depth, prevDepth: e.depth });
      events.push({ type: 'enemyShot' });
    }
    e.fireTimer = (0.5 + s.rng.next()) * lp.fireInt; // redraw either way
  }
}
