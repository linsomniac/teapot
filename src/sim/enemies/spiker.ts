// Spiker + spikes (§6.3): climbs its lane extending the lane's spike up to
// 1−SpikeH, reverses, descends to the bottom, teleports to a random
// unoccupied lane and cycles forever. Never despawns on its own; does not
// fire; does not count toward MaxOnWell (D32).

import { TICK_SEC } from '../types';
import type { Enemy, Spike } from '../types';
import type { GameConfig } from '../config';
import type { Rng } from '../rng';
import type { LevelParams } from '../difficultyCurve';
import type { SimState } from '../state';
import { LANES } from '../well';
import { climbSpeed } from './flipper';

// Spawn init (Phase 4 preamble): non-firing, non-flipping, climbing.
export function makeSpiker(lane: number, lp: LevelParams, rng: Rng): Enemy {
  void lp;
  void rng;
  return {
    kind: 'spiker',
    lane,
    depth: 1,
    prevLane: lane,
    prevDepth: 1,
    flip: null,
    flipTimer: 0, // never flips
    fireTimer: 0, // does not fire (§6.3)
    climbDir: 1,
  };
}

// §6.3 shot-at-tip priority: the Spiker (at or above the tip) has hit
// priority and dies; otherwise the spike is trimmed by `trim` depth (one
// trim per shot — the caller consumes the shot and removes the spike when
// fully trimmed).
export function trimOrKill(
  spike: Spike,
  spikerAtTip: Enemy | null,
  trim: number,
): 'kill' | 'trim' {
  if (spikerAtTip !== null) return 'kill';
  spike.topDepth = Math.min(1, spike.topDepth + trim);
  return 'trim';
}

export function updateSpiker(
  e: Enemy,
  s: SimState,
  lp: LevelParams,
  cfg: GameConfig,
): void {
  e.prevLane = e.lane;
  e.prevDepth = e.depth;
  const step = climbSpeed('spiker', lp, cfg) * TICK_SEC;

  if ((e.climbDir ?? 1) === 1) {
    // Climb, reversing at depth 1 − SpikeH (§6.3).
    e.depth -= step;
    const reversal = 1 - lp.spikeH;
    if (e.depth <= reversal) {
      e.depth = reversal;
      e.climbDir = -1;
    }
    // GROWTH-ONLY top: the spike follows the Spiker only while it climbs
    // above the current top — a trim is never reverted by descent/sitting.
    let spike = s.spikes.find((p) => p.lane === e.lane);
    if (spike === undefined) {
      spike = { lane: e.lane, topDepth: e.depth };
      s.spikes.push(spike);
    } else if (e.depth < spike.topDepth) {
      spike.topDepth = e.depth;
    }
    return;
  }

  // Descend at climb speed to the bottom (§6.3) — the top does not follow.
  e.depth += step;
  if (e.depth >= 1) {
    e.depth = 1;
    // Instantaneous switch to a uniformly random lane that is not the
    // current lane and holds no other Spiker (at most one per lane).
    const occupied = new Set<number>();
    for (const other of s.enemies) {
      if (other !== e && other.kind === 'spiker') occupied.add(other.lane);
    }
    const candidates: number[] = [];
    for (let lane = 0; lane < LANES; lane++) {
      if (lane !== e.lane && !occupied.has(lane)) candidates.push(lane);
    }
    if (candidates.length > 0) {
      e.lane = candidates[s.rng.nextInt(candidates.length)]!;
      // Teleport — no render tween (§11.1): prev must equal curr on BOTH
      // axes or the renderer would slide the old depth onto the new lane.
      e.prevLane = e.lane;
      e.prevDepth = e.depth;
    }
    e.climbDir = 1;
  }
}
