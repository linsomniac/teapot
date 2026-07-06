// Pure fixed-timestep accumulator (§12.3). The caller owns the clock: a
// pause is modeled by simply not calling advance() — there is no internal
// time source here (sim purity, §12.2).

import { TICK_MS } from './types';

export { TICK_MS } from './types';

// Accumulator clamp: at most 250 ms of pending sim time per frame (§12.3).
export const MAX_ACCUM_MS = 250;

// AIDEV-NOTE: the clamp is applied in TICK units (250 ms = exactly 15 ticks
// in rational math) so a huge frame yields exactly 15 ticks — dividing the
// clamped ms by TICK_MS in floats would give 14.999999999999998 and lose a
// tick to floor().
const MAX_ACCUM_TICKS = Math.round(MAX_ACCUM_MS / TICK_MS); // 15

// Snap totals within 1e-9 tick of an integer onto it: an exactly-250 ms
// frame (or carry chain landing on a tick boundary) divides to
// 14.999999999999998 in floats and would under-step by a full tick.
const BOUNDARY_EPS = 1e-9;

export function advance(
  accumMs: number,
  elapsedMs: number,
): { ticks: number; accumMs: number; alpha: number } {
  let totalTicks = Math.min((accumMs + elapsedMs) / TICK_MS, MAX_ACCUM_TICKS);
  const nearest = Math.round(totalTicks);
  if (Math.abs(totalTicks - nearest) < BOUNDARY_EPS) {
    totalTicks = nearest;
  }
  const ticks = Math.floor(totalTicks);
  const alpha = totalTicks - ticks; // fraction of a tick left over, ∈ [0, 1)
  return { ticks, accumMs: alpha * TICK_MS, alpha };
}
