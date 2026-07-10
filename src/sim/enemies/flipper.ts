// Flip mechanics (shared) + Flipper update (§6/§6.1).
//
// AIDEV-NOTE: flip-timer semantics (§6 "flip mechanics"): the timer runs
// from the END of the previous flip (first period starts at spawn), so it is
// PAUSED while a flip animates and is reset to the interval at completion
// (rimFlipInterval at the rim, FlipInt mid-well). It DOES run through
// non-flip blocks (the Pulsar pulse freeze, Task 4.5); an expiry during such
// a block stays armed and fires on the first unblocked tick ("fires when the
// block ends"). The §8.2 FlipInt ≥ 2·flipAnimTime guard keeps due-times
// after animation ends under every valid config.

import { TICK_SEC } from '../types';
import type { Enemy, EnemyKind } from '../types';
import type { GameConfig } from '../config';
import type { Rng } from '../rng';
import type { LevelParams } from '../difficultyCurve';
import type { SimState } from '../state';
import { adjacentLane, playerLane, shortestArcDir } from '../well';

// A flipping enemy occupies its source lane for the first half of the
// animation and its destination lane for the second half — FOR SHOT
// COLLISION ONLY (§6). Lethal contact happens only at completion (§5(b)).
// Non-flipping lanes round like the player's (identity for integer lanes;
// a crawling Fuseball's fractional rim position rounds per §6.4/§4).
export function occupancyLane(e: Enemy, closed: boolean): number {
  if (e.flip) {
    return e.flip.progress < 0.5 ? e.flip.from : e.flip.to;
  }
  return playerLane(e.lane, closed);
}

// AIDEV-NOTE: SINGLE definition of Flipper rim arrival (§5(b)/§6.1, Task 2).
// A bowtie has a half-length along the lane (flipperHalfHeight in depth units);
// it ARRIVES at the rim when its top corners touch depth 0, i.e. when its
// CENTER is within flipperHalfHeight of the rim — not at depth 0. Used by the
// climb clamp, the post-flip re-arm ternary, and the step-5 contact filter so
// the arrival depth has ONE definition. Fuseball rim residence stays depth<=0
// (this predicate is Flipper-only; callers guard on kind).
export function flipperAtRim(e: Enemy, cfg: GameConfig): boolean {
  return e.depth <= cfg.tuning.flipperHalfHeight;
}

export function startFlip(e: Enemy, toLane: number): void {
  e.flip = { from: e.lane, to: toLane, progress: 0 };
  // Depth is frozen for the whole animation: update functions skip climb
  // while e.flip is set.
}

// Advance one tick; true exactly on the completion tick (lane commits to
// the destination). 1e-9 absorbs float accumulation at the boundary.
export function advanceFlip(e: Enemy, flipAnimTime: number): boolean {
  if (!e.flip) return false;
  e.flip.progress += TICK_SEC / flipAnimTime;
  if (e.flip.progress >= 1 - 1e-9) {
    e.lane = e.flip.to;
    // The rotation animation already covered the transit — the completion
    // frame must not re-tween from the source lane (render-only field).
    e.prevLane = e.flip.to;
    e.flip = null;
    return true;
  }
  return false;
}

// Mid-well flip targeting (§6): with probability seekBias step one lane
// toward the player via the shortest arc (ties clockwise); otherwise step to
// a uniformly random adjacent lane. At an open-well end lane the single
// interior neighbor is always taken. Caller guarantees e.lane ≠ player lane.
export function chooseMidWellFlip(
  e: Enemy,
  playerLaneIdx: number,
  closed: boolean,
  seekBias: number,
  rng: Rng,
): number {
  let dir: 1 | -1;
  if (rng.next() < seekBias) {
    const d = shortestArcDir(e.lane, playerLaneIdx, closed);
    dir = d === 0 ? 1 : d;
  } else {
    dir = rng.nextInt(2) === 0 ? -1 : 1;
  }
  const target = adjacentLane(e.lane, dir, closed);
  if (target !== null) return target;
  return adjacentLane(e.lane, -dir as 1 | -1, closed)!; // open end → inward
}

// Spawn init (Phase 4 preamble): at the well bottom, timers armed.
export function makeFlipper(lane: number, lp: LevelParams, rng: Rng): Enemy {
  return {
    kind: 'flipper',
    lane,
    depth: 1,
    prevLane: lane,
    prevDepth: 1,
    flip: null,
    flipTimer: lp.flipInt, // first period starts at spawn (§6)
    fireTimer: (0.5 + rng.next()) * lp.fireInt, // §6 scheduler draw
  };
}

export function climbSpeed(
  kind: EnemyKind,
  lp: LevelParams,
  cfg: GameConfig,
): number {
  return lp.climb * cfg.tuning.climbMul[kind];
}

export function updateFlipper(
  e: Enemy,
  s: SimState,
  lp: LevelParams,
  cfg: GameConfig,
): void {
  e.prevLane = e.lane;
  e.prevDepth = e.depth;
  const t = cfg.tuning;
  const rimInterval = t.rimFlipFactor * lp.flipInt;

  if (e.flip) {
    if (advanceFlip(e, t.flipAnimTime)) {
      // Timer runs from the end of the flip (§6); rim flips re-arm faster.
      e.flipTimer = flipperAtRim(e, cfg) ? rimInterval : lp.flipInt;
    }
    return; // depth frozen during the animation
  }

  e.flipTimer -= TICK_SEC;

  if (flipperAtRim(e, cfg)) {
    // Rim-resident: chase the player along the rim every rimFlipInterval,
    // shortest arc re-evaluated before each flip (§6.1).
    if (e.flipTimer <= 0) {
      const pl = playerLane(s.rimPos, s.closed);
      const dir = shortestArcDir(e.lane, pl, s.closed);
      if (dir === 0) {
        // Already on the player's lane — contact (step 5) resolves it.
        e.flipTimer = rimInterval;
      } else {
        const target = adjacentLane(e.lane, dir, s.closed);
        if (target === null) {
          e.flipTimer = rimInterval; // open-well end bounds the chase
        } else {
          startFlip(e, target);
        }
      }
    }
    return;
  }

  // Mid-well: a due flip takes the tick (depth frozen from flip start).
  if (e.flipTimer <= 0) {
    const pl = playerLane(s.rimPos, s.closed);
    if (e.lane === pl) {
      // Already on the player's lane: climb instead, redraw a FULL FlipInt
      // (the timer does not stay armed, §6).
      e.flipTimer = lp.flipInt;
    } else {
      startFlip(e, chooseMidWellFlip(e, pl, s.closed, t.flipSeekBias, s.rng));
      return;
    }
  }

  // Climb toward the rim (§6.1/§8.3).
  e.depth -= climbSpeed('flipper', lp, cfg) * TICK_SEC;
  if (flipperAtRim(e, cfg)) {
    // Rim arrival: the top corners reached depth 0, so clamp the CENTER to
    // its rest depth flipperHalfHeight (NOT 0 — the bowtie sits just below the
    // top line). Discard any pending mid-well timer; the first rim flip occurs
    // rimFlipInterval after arrival (§6).
    e.depth = t.flipperHalfHeight;
    e.flipTimer = rimInterval;
  }
}
