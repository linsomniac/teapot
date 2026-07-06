// Tanker (§6.2): climbs its spawn lane slowly, never changes lanes, fires
// per the §6 scheduler (Task 4.6). When shot or upon reaching the rim it
// splits into two Flippers; the Tanker itself is never lethal.

import { TICK_SEC } from '../types';
import type { Enemy, SimEvent } from '../types';
import type { GameConfig } from '../config';
import type { Rng } from '../rng';
import type { LevelParams } from '../difficultyCurve';
import type { SimState } from '../state';
import { adjacentLane } from '../well';
import { climbSpeed, makeFlipper } from './flipper';

// Spawn init (Phase 4 preamble): firing kind, never flips.
export function makeTanker(lane: number, lp: LevelParams, rng: Rng): Enemy {
  return {
    kind: 'tanker',
    lane,
    depth: 1,
    prevLane: lane,
    prevDepth: 1,
    flip: null,
    flipTimer: 0, // not a flipping kind
    fireTimer: (0.5 + rng.next()) * lp.fireInt, // §6 scheduler draw
  };
}

// Per-tick update; true when the Tanker reached the rim this tick (the
// caller replaces it with its split — non-lethal, 0 points, §6.2).
export function updateTanker(
  e: Enemy,
  lp: LevelParams,
  cfg: GameConfig,
): boolean {
  e.prevLane = e.lane;
  e.prevDepth = e.depth;
  e.depth -= climbSpeed('tanker', lp, cfg) * TICK_SEC;
  if (e.depth <= 0) {
    e.depth = 0;
    return true;
  }
  return false;
}

// Split (§6.2): two Flippers created at the Tanker's current depth, each
// beginning a flip (progress 0) toward an OPPOSITE adjacent lane, FlipInt
// armed from that flip's completion (updateFlipper resets it there). In an
// end lane of an open well both flip in the single inward direction,
// staggered by flipAnimTime/2 — modeled as the second starting at progress
// −0.5, which also keeps it occupying the source lane (shot collision)
// until its animation actually begins. Superzapper kills do NOT split
// (Task 5.4 uses a different kill path).
export function splitTanker(
  e: Enemy,
  s: SimState,
  lp: LevelParams,
  events: SimEvent[],
): Enemy[] {
  const left = adjacentLane(e.lane, -1, s.closed);
  const right = adjacentLane(e.lane, 1, s.closed);
  const release = (target: number, staggered: boolean): Enemy => {
    const f = makeFlipper(e.lane, lp, s.rng);
    f.depth = e.depth;
    f.prevDepth = e.depth;
    f.flip = { from: e.lane, to: target, progress: staggered ? -0.5 : 0 };
    return f;
  };
  let released: Enemy[];
  if (left !== null && right !== null) {
    released = [release(left, false), release(right, false)];
  } else {
    const inward = (left ?? right)!;
    released = [release(inward, false), release(inward, true)];
  }
  events.push({ type: 'flip' }, { type: 'flip' });
  return released;
}
