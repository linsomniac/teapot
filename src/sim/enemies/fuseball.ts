// Fuseball (§6.4): jittered climb, TEMPORARY rim residency (crawl toward the
// player for fuseballRimTime), then descend — base speed, no jitter — to a
// random depth in [0.6, 1.0] and repeat until destroyed. Does not fire;
// never changes lanes while climbing; removable only by shot/Superzapper.

import { TICK_SEC } from '../types';
import type { Enemy } from '../types';
import type { GameConfig, Tuning } from '../config';
import type { Rng } from '../rng';
import type { LevelParams } from '../difficultyCurve';
import type { SimState } from '../state';
import { LANES, normalizeRimPos, playerLane, shortestArcDir } from '../well';
import { climbSpeed } from './flipper';

// Spawn init (Phase 4 preamble): non-firing, non-flipping; the jitter
// multiplier is drawn immediately and redrawn every redrawInterval while
// climbing. descentTarget is drawn at each rim→descent transition.
export function makeFuseball(lane: number, tuning: Tuning, rng: Rng): Enemy {
  return {
    kind: 'fuseball',
    lane,
    depth: 1,
    prevLane: lane,
    prevDepth: 1,
    flip: null,
    flipTimer: 0, // never flips
    fireTimer: 0, // does not fire (§6.4)
    climbDir: 1,
    rimTimer: 0,
    rimDir: 1,
    jitterTimer: tuning.fuseballJitter.redrawInterval,
    speedMul: drawJitter(tuning, rng),
  };
}

function drawJitter(t: Tuning, rng: Rng): number {
  return (
    t.fuseballJitter.min +
    rng.next() * (t.fuseballJitter.max - t.fuseballJitter.min)
  );
}

export function updateFuseball(
  e: Enemy,
  s: SimState,
  lp: LevelParams,
  cfg: GameConfig,
): void {
  e.prevLane = e.lane;
  e.prevDepth = e.depth;
  const t = cfg.tuning;
  const base = climbSpeed('fuseball', lp, cfg);

  // Rim residency: crawl along the rim in the direction fixed at arrival
  // (open-well ends force reversal); the crawl position is CONTINUOUS and
  // its effective lane rounds like the player's (§6.4).
  if (e.depth <= 0 && (e.rimTimer ?? 0) > 0) {
    e.rimTimer = (e.rimTimer ?? 0) - TICK_SEC;
    let pos = e.lane + (e.rimDir ?? 1) * t.fuseballRimSpeed * TICK_SEC;
    if (s.closed) {
      pos = normalizeRimPos(pos, true);
    } else if (pos <= 0) {
      pos = 0;
      e.rimDir = 1;
    } else if (pos >= LANES - 1) {
      pos = LANES - 1;
      e.rimDir = -1;
    }
    e.lane = pos;
    if (e.rimTimer <= 0) {
      // Rim time over: descend down the (rounded) lane to a fresh random
      // target depth in [0.6, 1.0] — redrawn at EACH rim→descent transition.
      e.rimTimer = 0;
      e.climbDir = -1;
      e.lane = playerLane(e.lane, s.closed);
      const r = t.fuseballDescentRange;
      e.descentTarget = r.min + s.rng.next() * (r.max - r.min);
    }
    return;
  }

  if (e.climbDir === -1) {
    // Descend at BASE climb speed — no jitter multiplier (§6.4).
    e.depth += base * TICK_SEC;
    const target = e.descentTarget ?? 1;
    if (e.depth >= target) {
      e.depth = target;
      e.climbDir = 1; // resume the jittered climb
    }
    return;
  }

  // Jittered climb: multiplier redrawn from [min, max] every redrawInterval.
  e.jitterTimer = (e.jitterTimer ?? t.fuseballJitter.redrawInterval) - TICK_SEC;
  if (e.jitterTimer <= 0) {
    e.speedMul = drawJitter(t, s.rng);
    e.jitterTimer = t.fuseballJitter.redrawInterval;
  }
  e.depth -= base * (e.speedMul ?? 1) * TICK_SEC;
  if (e.depth <= 0) {
    // Rim arrival: residency starts; crawl direction = shortest arc toward
    // the player AT ARRIVAL (ties clockwise), fixed until an open end.
    e.depth = 0;
    e.rimTimer = t.fuseballRimTime;
    const dir = shortestArcDir(
      playerLane(e.lane, s.closed),
      playerLane(s.rimPos, s.closed),
      s.closed,
    );
    e.rimDir = dir === 0 ? 1 : dir;
  }
}
