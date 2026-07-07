// PURE snapshot construction + multi-tick apportionment (§12.2/§12.3).
// No browser APIs here (lint-gated): capture.ts owns the DOM and mutates an
// InputState; this module drains it into per-tick InputSnapshots.

import { TICK_SEC } from '../sim/types';
import type { InputSnapshot } from '../sim/types';
import { clampRimDelta } from '../sim/well';
import type { Tuning } from '../sim/config';

// Held keys, pending one-shot edges, and the mouse-delta accumulator.
export interface InputState {
  left: boolean;
  right: boolean;
  fire: boolean; // held (space / locked LMB)
  zapPressed: boolean; // one-shot edges: consumed by the next snapshot
  confirmPressed: boolean;
  backPressed: boolean;
  quitPressed: boolean;
  mouseDeltaPx: number; // pending pointer-locked movement (px)
}

export function createInputState(): InputState {
  return {
    left: false,
    right: false,
    fire: false,
    zapPressed: false,
    confirmPressed: false,
    backPressed: false,
    quitPressed: false,
    mouseDeltaPx: 0,
  };
}

// Build ONE fresh snapshot for ONE tick (§12.3): never reuse a snapshot
// across ticks. Keyboard contributes rimSpeed×TICK_SEC; the mouse
// accumulator drains at most what fits under the per-tick clamp (keyboard
// and mouse are SUMMED, then re-clamped) and carries the remainder to the
// next tick — a frame that steps 0 ticks only accrues; a frame that steps
// N ticks calls this N times, apportioning the swipe across them. Edge
// intents (zap/confirm/back/quit) fire on the first snapshot after the
// press and are consumed.
export function buildSnapshot(st: InputState, tuning: Tuning): InputSnapshot {
  const clamp = tuning.perTickClamp;
  const kbClamped = clampRimDelta(
    ((st.right ? 1 : 0) - (st.left ? 1 : 0)) * tuning.rimSpeed * TICK_SEC,
    clamp,
  );
  // THIS tick's mouse share is at most one clamp's worth of the pending
  // swipe — capped BEFORE it participates in the sum, so a long swipe can
  // neither move nor drain more than one tick of input at a time.
  const mouseSlice = clampRimDelta(
    st.mouseDeltaPx / tuning.mouseSensitivity,
    clamp,
  );

  const move = clampRimDelta(kbClamped + mouseSlice, clamp);

  // Drain what the move actually reflected of the slice — bounded by the
  // slice itself so an over-clamp keyboard never synthesizes phantom mouse
  // movement in either direction.
  let consumed = move - kbClamped;
  if (mouseSlice >= 0) {
    consumed = Math.min(Math.max(consumed, 0), mouseSlice);
  } else {
    consumed = Math.max(Math.min(consumed, 0), mouseSlice);
  }
  st.mouseDeltaPx -= consumed * tuning.mouseSensitivity;

  const snapshot: InputSnapshot = {
    move,
    fire: st.fire,
    zap: st.zapPressed,
    confirm: st.confirmPressed,
    back: st.backPressed,
    quit: st.quitPressed,
  };
  st.zapPressed = false;
  st.confirmPressed = false;
  st.backPressed = false;
  st.quitPressed = false;
  return snapshot;
}

// Cleared on pause AND on resume (§5/§12.2) so movement during a pause
// never burst-spins the player.
export function clearMouseAccumulator(st: InputState): void {
  st.mouseDeltaPx = 0;
}
