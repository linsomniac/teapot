// Well wireframe + player-lane highlight + claw cursor (§11.1).
// Reads sim geometry/projection; never mutates sim state.

import type { Geometry } from '../sim/config';
import { LANES } from '../sim/well';
import { project, type Viewport } from '../sim/projection';
import { strokeWithGlow } from './glow';

// Rim VERTEX i sits at polyline index i = lane (i − 0.5)'s sample point.
function vertexAt(
  ctx: CanvasRenderingContext2D,
  g: Geometry,
  vp: Viewport,
  i: number,
  depth: number,
  move: boolean,
): void {
  const p = project(i - 0.5, depth, g, vp);
  if (move) ctx.moveTo(p.x, p.y);
  else ctx.lineTo(p.x, p.y);
}

function pathRimRing(
  ctx: CanvasRenderingContext2D,
  g: Geometry,
  vp: Viewport,
  depth: number,
): void {
  const count = g.closed ? LANES : LANES + 1;
  for (let i = 0; i < count; i++) {
    vertexAt(ctx, g, vp, i, depth, i === 0);
  }
  if (g.closed) vertexAt(ctx, g, vp, 0, depth, false);
}

// The full well: near rim, far rim, and one spoke per rim vertex.
export function drawWell(
  ctx: CanvasRenderingContext2D,
  g: Geometry,
  vp: Viewport,
  wellColor: string,
  lowGlow: boolean,
): void {
  ctx.beginPath();
  pathRimRing(ctx, g, vp, 0);
  pathRimRing(ctx, g, vp, 1);
  const spokes = g.closed ? LANES : LANES + 1;
  for (let i = 0; i < spokes; i++) {
    vertexAt(ctx, g, vp, i, 0, true);
    vertexAt(ctx, g, vp, i, 1, false);
  }
  strokeWithGlow(ctx, wellColor, 1.5, lowGlow);
}

// Append one lane's rim-to-bottom quad outline to the current path.
export function pathLaneOutline(
  ctx: CanvasRenderingContext2D,
  g: Geometry,
  vp: Viewport,
  lane: number,
): void {
  vertexAt(ctx, g, vp, lane, 0, true);
  vertexAt(ctx, g, vp, lane + 1, 0, false);
  vertexAt(ctx, g, vp, lane + 1, 1, false);
  vertexAt(ctx, g, vp, lane, 1, false);
  vertexAt(ctx, g, vp, lane, 0, false);
}

// The rounded player lane's rim-to-bottom outline, drawn brighter — the
// primary aiming cue (§11.1).
export function drawLaneHighlight(
  ctx: CanvasRenderingContext2D,
  g: Geometry,
  vp: Viewport,
  lane: number,
  color: string,
  lowGlow: boolean,
): void {
  ctx.beginPath();
  pathLaneOutline(ctx, g, vp, lane);
  strokeWithGlow(ctx, color, 2.5, lowGlow);
}

// The claw cursor at the SMOOTH fractional rim position (interpolated by
// the caller via interpRim, §12.3) — movement reads continuously even
// though gameplay resolves to the rounded lane.
export function drawClaw(
  ctx: CanvasRenderingContext2D,
  g: Geometry,
  vp: Viewport,
  rimPos: number,
  depth: number, // 0 at the rim; the warp descent draws it deeper (§9)
  color: string,
  lowGlow: boolean,
): void {
  const left = project(rimPos - 0.5, depth, g, vp);
  const right = project(rimPos + 0.5, depth, g, vp);
  const outer = project(rimPos, depth - 0.045, g, vp); // just above/outside
  const innerL = project(rimPos - 0.25, depth - 0.015, g, vp);
  const innerR = project(rimPos + 0.25, depth - 0.015, g, vp);
  ctx.beginPath();
  ctx.moveTo(left.x, left.y);
  ctx.lineTo(innerL.x, innerL.y);
  ctx.lineTo(outer.x, outer.y);
  ctx.lineTo(innerR.x, innerR.y);
  ctx.lineTo(right.x, right.y);
  strokeWithGlow(ctx, color, 2, lowGlow);
}
