// Lane math + player-lane rule (§4). Pure, engine-stable arithmetic only.
// AIDEV-NOTE: `round` means floor(x + 0.5) EVERYWHERE in the sim (§4) — half
// rounds up, deterministic. Do not use Math.round (ties differ for negatives).

export const LANES = 16;

function roundHalfUp(x: number): number {
  return Math.floor(x + 0.5);
}

// Closed wells: rimPos lives on a mod-16 circle, normalized to [0, 16).
// Open wells: rimPos is clamped to [0, 15] (movement stops at the end lanes).
export function normalizeRimPos(rimPos: number, closed: boolean): number {
  if (closed) {
    return ((rimPos % LANES) + LANES) % LANES;
  }
  return Math.min(LANES - 1, Math.max(0, rimPos));
}

// Player-lane rule (canonical, §4): the player always occupies exactly one
// lane. Closed: round(rimPos) mod 16; open: clamp(round(rimPos), 0, 15).
export function playerLane(rimPos: number, closed: boolean): number {
  const pos = normalizeRimPos(rimPos, closed);
  if (closed) {
    return roundHalfUp(pos) % LANES;
  }
  return Math.min(LANES - 1, Math.max(0, roundHalfUp(pos)));
}

// Neighbor lane in direction `dir`; null past an open well's end lanes.
export function adjacentLane(
  lane: number,
  dir: 1 | -1,
  closed: boolean,
): number | null {
  const next = lane + dir;
  if (closed) {
    return ((next % LANES) + LANES) % LANES;
  }
  return next >= 0 && next < LANES ? next : null;
}

// Direction of the shortest arc from `from` to `to` (§4/§6.1). On closed
// wells distances wrap mod 16 and an exact tie (8 lanes either way) breaks
// CLOCKWISE — toward increasing lane index (§4's "clockwise" convention).
export function shortestArcDir(
  from: number,
  to: number,
  closed: boolean,
): -1 | 0 | 1 {
  if (!closed) {
    if (to > from) return 1;
    if (to < from) return -1;
    return 0;
  }
  const diff = (((to - from) % LANES) + LANES) % LANES; // [0, 16)
  if (diff === 0) return 0;
  return diff <= LANES / 2 ? 1 : -1; // tie (diff === 8) → clockwise
}

// Per-tick rim-movement clamp (§4/§8.3): |delta| must stay < 0.5 lanes/tick
// so lane crossings are never skipped; the clamp value comes from config.
export function clampRimDelta(delta: number, clamp: number): number {
  return Math.min(clamp, Math.max(-clamp, delta));
}

// Render tween along the SHORTEST arc (mod 16 on closed wells, tie → clockwise);
// the renderer interpolates prev→curr by alpha with this (§11.1/§12.3).
export function interpRim(
  prev: number,
  curr: number,
  alpha: number,
  closed: boolean,
): number {
  if (!closed) {
    return prev + (curr - prev) * alpha;
  }
  const p = normalizeRimPos(prev, true);
  const c = normalizeRimPos(curr, true);
  let d = (((c - p) % LANES) + LANES) % LANES; // [0, 16)
  if (d > LANES / 2) d -= LANES; // shortest arc; d === 8 stays +8 (clockwise)
  return normalizeRimPos(p + d * alpha, true);
}
