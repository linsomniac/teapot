// Pulsar + pulse timeline (§6.5): moves like a Flipper (same targeting and
// flip mechanics, flips while descending too) but never reaches the rim —
// it oscillates between pulsarReversalDepth and the bottom forever. The
// per-level global pulse clock (SimState.pulseClock) runs on PLAYING sim
// time and restarts at each PLAYING entry; during the pulse each
// PARTICIPATING Pulsar's lane is electrified along its full length.

import { TICK_SEC } from '../types';
import type { Enemy } from '../types';
import type { GameConfig, Tuning } from '../config';
import type { Rng } from '../rng';
import type { LevelParams } from '../difficultyCurve';
import type { SimState } from '../state';
import { playerLane } from '../well';
import {
  advanceFlip,
  chooseMidWellFlip,
  climbSpeed,
  startFlip,
} from './flipper';

export type PulsePhase = 'quiet' | 'telegraph' | 'pulse';

// Cycle layout (§6.5): quiet (pulseCycle − telegraph − duration), then
// telegraph, then pulse. validateConfig guarantees the quiet span ≥ 0.
// AIDEV-NOTE: the clock accumulates TICK_SEC additions, so after ~126 ticks
// it reads 2.0999999999999974 against an ideal 2.1 boundary — a strict
// comparison would start every phase one tick late (codex P2). EPS absorbs
// that accumulation (drift stays ≪ 1e-9 for any realistic session length).
const BOUNDARY_EPS = 1e-9;

export function pulsePhase(
  clock: number,
  pulseCycle: number,
  tuning: Tuning,
): PulsePhase {
  // clock ≥ 0 always (PLAYING sim time).
  let t = clock % pulseCycle;
  if (t >= pulseCycle - BOUNDARY_EPS) t = 0; // tick rounding at the wrap
  const quiet = pulseCycle - tuning.pulseTelegraph - tuning.pulseDuration;
  if (t < quiet - BOUNDARY_EPS) return 'quiet';
  if (t < quiet + tuning.pulseTelegraph - BOUNDARY_EPS) return 'telegraph';
  return 'pulse';
}

// Spawn init (Phase 4 preamble): flipping + firing kind; joins the NEXT
// pulse cycle (participation is decided at telegraph start).
export function makePulsar(lane: number, lp: LevelParams, rng: Rng): Enemy {
  return {
    kind: 'pulsar',
    lane,
    depth: 1,
    prevLane: lane,
    prevDepth: 1,
    flip: null,
    flipTimer: lp.flipInt,
    fireTimer: (0.5 + rng.next()) * lp.fireInt, // §6 scheduler draw
    climbDir: 1,
    pulseJoined: false,
  };
}

export function updatePulsar(
  e: Enemy,
  s: SimState,
  lp: LevelParams,
  cfg: GameConfig,
): void {
  e.prevLane = e.lane;
  e.prevDepth = e.depth;
  const t = cfg.tuning;

  if (e.flip) {
    if (advanceFlip(e, t.flipAnimTime)) {
      e.flipTimer = lp.flipInt; // timer runs from the flip's end (§6)
    }
    return; // depth frozen during the animation
  }

  e.flipTimer -= TICK_SEC;

  // Flip freeze (§6.5): no flips begin from telegraph start through pulse
  // end; an expired timer stays armed and fires at pulse end (§6).
  const frozen = pulsePhase(s.pulseClock, lp.pulse, t) !== 'quiet';
  if (e.flipTimer <= 0 && !frozen) {
    const pl = playerLane(s.rimPos, s.closed);
    if (e.lane === pl) {
      e.flipTimer = lp.flipInt; // same skip-and-redraw rule as the Flipper
    } else {
      startFlip(e, chooseMidWellFlip(e, pl, s.closed, t.flipSeekBias, s.rng));
      return;
    }
  }

  // Oscillate: climb to pulsarReversalDepth, descend to the bottom, repeat —
  // never the rim, never despawns (§6.5).
  const step = climbSpeed('pulsar', lp, cfg) * TICK_SEC;
  if ((e.climbDir ?? 1) === 1) {
    e.depth -= step;
    if (e.depth <= t.pulsarReversalDepth) {
      e.depth = t.pulsarReversalDepth;
      e.climbDir = -1;
    }
  } else {
    e.depth += step;
    if (e.depth >= 1) {
      e.depth = 1;
      e.climbDir = 1;
    }
  }
}
