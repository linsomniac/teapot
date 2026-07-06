// (lane, depth) → screen-space projection (§11.1/§4).
// AIDEV-NOTE: this is the ONLY sim/ module allowed transcendental math
// (§12.3, eslint exemption); its outputs are render-only and never feed sim
// state. The projection is an affine near→far interpolation that reads as
// perspective (adequate for line art), NOT a projective transform: the far
// rim is each rim vertex scaled toward the vanishing point by FAR_SCALE, so
// the 16 depth-1 spawn points stay separable (no collapse to a point).

import type { Depth } from './types';
import type { Geometry, Vec2 } from './config';
import { LANES } from './well';

// Rim vertices are authored in the 1440×1080 reference playfield space with
// origin at the playfield CENTER (+y down); `vanishing` is an offset in
// reference px from that center.
export const REF_WIDTH = 1440;
export const REF_HEIGHT = 1080;
export const FAR_SCALE = 0.15; // far ring is 15% size, not a point

export interface Viewport {
  width: number; // playfield px (letterboxing is the renderer's job)
  height: number;
}

function viewScale(vp: Viewport): number {
  return Math.min(vp.width / REF_WIDTH, vp.height / REF_HEIGHT);
}

// Sample the rim polyline at vertex index (lane + 0.5): an integer lane maps
// to the midpoint of rim vertices i and i+1 (the lane center, §4), and a
// fractional lane (the claw at rimPos) interpolates linearly between the two
// nearest vertices, wrapping on closed wells — deterministic claw position.
function sampleRim(g: Geometry, lane: number): Vec2 {
  const n = g.rim.length;
  let t = lane + 0.5;
  if (g.closed) {
    t = ((t % LANES) + LANES) % LANES; // n === LANES === 16
  } else {
    t = Math.min(n - 1, Math.max(0, t)); // [0, 16] on a 17-vertex open rim
  }
  const i0 = Math.floor(t);
  const i1 = g.closed ? (i0 + 1) % n : Math.min(i0 + 1, n - 1);
  const f = t - i0;
  const a = g.rim[i0]!;
  const b = g.rim[i1]!;
  return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f };
}

export function project(
  lane: number,
  depth: Depth,
  g: Geometry,
  vp: Viewport,
): Vec2 {
  const near = sampleRim(g, lane);
  // point(depth) = vanishing + (near − vanishing)·k, k: 1 at rim → FAR_SCALE
  // at the bottom. Monotone approach toward the vanishing point.
  const k = 1 - (1 - FAR_SCALE) * depth;
  const rx = g.vanishing.x + (near.x - g.vanishing.x) * k;
  const ry = g.vanishing.y + (near.y - g.vanishing.y) * k;
  const s = viewScale(vp);
  return { x: vp.width / 2 + rx * s, y: vp.height / 2 + ry * s };
}

// Minimum projected lane width at the rim (depth 0) in viewport px — the §4
// data-validation bound (≥ 24 px at 1440×1080).
export function laneWidthAtRim(g: Geometry, vp: Viewport): number {
  const s = viewScale(vp);
  const n = g.rim.length;
  let min = Infinity;
  for (let i = 0; i < LANES; i++) {
    const a = g.rim[i]!;
    const b = g.rim[(i + 1) % n]!;
    const dx = (b.x - a.x) * s;
    const dy = (b.y - a.y) * s;
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d < min) min = d;
  }
  return min;
}
