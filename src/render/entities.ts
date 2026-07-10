// Per-type enemy silhouettes + fixed canonical colors (§11.1/D35), shots,
// and spikes. Colors are independent of the level band; enemies render at
// full brightness over the dimmed well. Flips draw as the signature
// lane-over-lane rotation about the shared edge from the sim's flip phase —
// never a lateral slide.

import type { Enemy, Shot, Spike } from '../sim/types';
import type { Geometry } from '../sim/config';
import { interpRim, LANES } from '../sim/well';
import { project, type Viewport } from '../sim/projection';
import { strokeWithGlow } from './glow';

export const ENEMY_COLORS = {
  flipper: '#ff4136', // red — bowtie
  tanker: '#b36bff', // purple — diamond
  spiker: '#3bef62', // green — spinning spiral (spikes share it)
  pulsar: '#3fe8ff', // cyan — zigzag coil, flashing toward white in telegraph
} as const;

// Fuseball multicolor shimmer: cycled per frame.
const FUSEBALL_COLORS = ['#ff5252', '#ffd23b', '#4dff88', '#4db8ff', '#ff6bff'];

export const PLAYER_SHOT_COLOR = '#ffffff';
export const ENEMY_SHOT_COLOR = '#ff9d2e';
export const SPIKE_COLOR = ENEMY_COLORS.spiker;

// Half the projected lane width at the entity's position — the natural
// perspective size for a silhouette.
function sizeAt(
  lane: number,
  depth: number,
  g: Geometry,
  vp: Viewport,
): number {
  const a = project(lane - 0.5, depth, g, vp);
  const b = project(lane + 0.5, depth, g, vp);
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  return Math.max(3, Math.sqrt(dx * dx + dy * dy) / 2);
}

// Screen-space angle of a lane's local chord (the segment across the lane at
// this depth): project(lane+0.5) − project(lane−0.5). The bowtie's WIDE axis
// aligns to this so it comes up "across" the lane on every geometry, never
// screen-horizontal (Task 2 point 2).
function chordAngle(
  lane: number,
  depth: number,
  g: Geometry,
  vp: Viewport,
): number {
  const a = project(lane - 0.5, depth, g, vp);
  const b = project(lane + 0.5, depth, g, vp);
  return Math.atan2(b.y - a.y, b.x - a.x);
}

// Half the projected ALONG-lane extent spanning ±flipperHalfHeight in depth
// about the entity's center (Task 2 Part B): the bowtie's rim-side corners sit
// at depth − hh, so at rest depth hh they touch the rim (depth 0) and while
// climbing they stay below it. The projection is affine in depth, so this is
// symmetric about the center. Clamped to a sane minimum like sizeAt.
function alongExtentAt(
  lane: number,
  depth: number,
  hh: number,
  g: Geometry,
  vp: Viewport,
): number {
  const near = project(lane, Math.max(0, depth - hh), g, vp);
  const far = project(lane, Math.min(1, depth + hh), g, vp);
  const dx = far.x - near.x;
  const dy = far.y - near.y;
  return Math.max(2, Math.sqrt(dx * dx + dy * dy) / 2);
}

interface Placement {
  x: number;
  y: number;
  angle: number; // silhouette base orientation + flip-over roll
  size: number; // across-lane half-width (the wide bowtie axis)
  along: number; // along-lane half-height (bowtie only; depth-coherent, Task 2)
}

const placement: Placement = { x: 0, y: 0, angle: 0, size: 0, along: 0 };

// Where (and how oriented) to draw an enemy: mid-flip enemies rotate about
// the shared edge between the source and destination lanes (§11.1). Flippers
// carry a chord-aligned base orientation (Task 2); other kinds stay upright.
// hh is flipperHalfHeight — the sim's rim arrival depth, used to size the
// bowtie's along-lane extent so lethal geometry and visuals agree.
function placeEnemy(
  e: Enemy,
  g: Geometry,
  vp: Viewport,
  alpha: number,
  hh: number,
): Placement {
  const depth = e.prevDepth + (e.depth - e.prevDepth) * alpha;
  const isFlipper = e.kind === 'flipper';
  if (e.flip) {
    const t = Math.min(1, Math.max(0, e.flip.progress));
    // Shared rim vertex between the two lanes (wrapping on closed wells):
    // for a +1 flip it is vertex (from+1) == polyline sample from+0.5.
    const forward =
      e.flip.to === (e.flip.from + 1) % LANES ||
      (!g.closed && e.flip.to === e.flip.from + 1);
    const pivotSample = forward ? e.flip.from + 0.5 : e.flip.from - 0.5;
    const pivot = project(pivotSample, depth, g, vp);
    const fromC = project(e.flip.from, depth, g, vp);
    const toC = project(e.flip.to, depth, g, vp);
    const a0 = Math.atan2(fromC.y - pivot.y, fromC.x - pivot.x);
    const a1 = Math.atan2(toC.y - pivot.y, toC.x - pivot.x);
    let da = a1 - a0;
    while (da > Math.PI) da -= 2 * Math.PI;
    while (da < -Math.PI) da += 2 * Math.PI;
    const r0 = Math.hypot(fromC.x - pivot.x, fromC.y - pivot.y);
    const r1 = Math.hypot(toC.x - pivot.x, toC.y - pivot.y);
    const ang = a0 + da * t;
    const r = r0 + (r1 - r0) * t;
    placement.x = pivot.x + Math.cos(ang) * r;
    placement.y = pivot.y + Math.sin(ang) * r;
    // Continuous orientation across the flip: the base angle interpolates the
    // source lane's chord → the destination lane's chord (shortest way) so the
    // silhouette never snaps at either end; the t·π flip-over ROLL rides on top
    // (the bowtie is symmetric under π, so chordTo+π reads as chordTo at the
    // completion frame — matching the committed non-flip draw). Other kinds
    // keep the bare roll about a screen-upright base, as before.
    if (isFlipper) {
      const cFrom = chordAngle(e.flip.from, depth, g, vp);
      const cTo = chordAngle(e.flip.to, depth, g, vp);
      let dc = cTo - cFrom;
      while (dc > Math.PI) dc -= 2 * Math.PI;
      while (dc < -Math.PI) dc += 2 * Math.PI;
      placement.angle = cFrom + dc * t + t * Math.PI;
    } else {
      placement.angle = t * Math.PI;
    }
    // Interpolate width/height across the two lanes (position already arcs via
    // the pivot) so nothing pops as the lane commits.
    const sizeFrom = sizeAt(e.flip.from, depth, g, vp);
    const sizeTo = sizeAt(e.flip.to, depth, g, vp);
    placement.size = sizeFrom + (sizeTo - sizeFrom) * t;
    if (isFlipper) {
      const alongFrom = alongExtentAt(e.flip.from, depth, hh, g, vp);
      const alongTo = alongExtentAt(e.flip.to, depth, hh, g, vp);
      placement.along = alongFrom + (alongTo - alongFrom) * t;
    } else {
      placement.along = placement.size;
    }
    return placement;
  }
  // Shortest-arc lane interpolation (mod 16 on closed wells) so a Fuseball
  // crawling across the 15↔0 seam doesn't streak across the well (§11.1).
  const lane = interpRim(e.prevLane, e.lane, alpha, g.closed);
  const p = project(lane, depth, g, vp);
  placement.x = p.x;
  placement.y = p.y;
  placement.size = sizeAt(e.lane, depth, g, vp);
  if (isFlipper) {
    placement.angle = chordAngle(lane, depth, g, vp); // wide axis across the lane
    placement.along = alongExtentAt(lane, depth, hh, g, vp);
  } else {
    placement.angle = 0;
    placement.along = placement.size;
  }
  return placement;
}

// Bowtie "><" silhouette: half-width s across the lane (the wide axis), half-
// height h along the lane. h is the depth-coherent along-extent (Task 2), so
// the rim-side corners (±s, −h) touch the rim at rest depth flipperHalfHeight.
function pathBowtie(ctx: CanvasRenderingContext2D, s: number, h: number): void {
  tMove(ctx, -s, -h);
  tLine(ctx, 0, 0);
  tLine(ctx, -s, h);
  tLine(ctx, -s, -h);
  tMove(ctx, s, -h);
  tLine(ctx, 0, 0);
  tLine(ctx, s, h);
  tLine(ctx, s, -h);
}

function pathDiamond(ctx: CanvasRenderingContext2D, s: number): void {
  tMove(ctx, 0, -s * 0.9);
  tLine(ctx, s * 0.9, 0);
  tLine(ctx, 0, s * 0.9);
  tLine(ctx, -s * 0.9, 0);
  tLine(ctx, 0, -s * 0.9);
  tMove(ctx, -s * 0.45, 0);
  tLine(ctx, s * 0.45, 0);
}

function pathSpiral(
  ctx: CanvasRenderingContext2D,
  s: number,
  spin: number,
): void {
  const turns = 2.25;
  const steps = 18;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const ang = spin + t * turns * 2 * Math.PI;
    const r = t * s;
    const x = Math.cos(ang) * r;
    const y = Math.sin(ang) * r;
    if (i === 0) tMove(ctx, x, y);
    else tLine(ctx, x, y);
  }
}

function pathSparks(
  ctx: CanvasRenderingContext2D,
  s: number,
  seed: number,
): void {
  const arms = 7;
  for (let i = 0; i < arms; i++) {
    const ang = (i / arms) * 2 * Math.PI + seed;
    const len = s * (0.5 + 0.5 * Math.abs(Math.sin(seed * 3 + i * 1.7)));
    tMove(ctx, 0, 0);
    tLine(ctx, Math.cos(ang) * len, Math.sin(ang) * len);
  }
}

function pathZigzagCoil(ctx: CanvasRenderingContext2D, s: number): void {
  const teeth = 4;
  tMove(ctx, -s, 0);
  for (let i = 0; i < teeth; i++) {
    const x0 = -s + ((i + 0.5) / teeth) * 2 * s;
    const x1 = -s + ((i + 1) / teeth) * 2 * s;
    tLine(ctx, x0, i % 2 === 0 ? -s * 0.6 : s * 0.6);
    tLine(ctx, x1, 0);
  }
}

export interface EnemyDrawContext {
  frame: number; // render frame counter (spin/shimmer clocks)
  pulsarFlash: number; // 0..1 — cyan→white mix during the telegraph
}

// Emission transform shared by the batched paths: rotate about the origin
// then translate — one path per KIND per frame (a stroke pair per kind
// instead of per enemy: per-stroke fixed cost dominates on CPU-raster
// engines, see the Task 13.1 bench bisect).
interface Xform {
  x: number;
  y: number;
  cos: number;
  sin: number;
  size: number;
  along: number; // along-lane half-height (bowtie only)
}

const xf: Xform = { x: 0, y: 0, cos: 1, sin: 0, size: 1, along: 1 };

function tMove(ctx: CanvasRenderingContext2D, px: number, py: number): void {
  ctx.moveTo(
    xf.x + px * xf.cos - py * xf.sin,
    xf.y + px * xf.sin + py * xf.cos,
  );
}
function tLine(ctx: CanvasRenderingContext2D, px: number, py: number): void {
  ctx.lineTo(
    xf.x + px * xf.cos - py * xf.sin,
    xf.y + px * xf.sin + py * xf.cos,
  );
}

function setXform(p: Placement): void {
  xf.x = p.x;
  xf.y = p.y;
  xf.cos = Math.cos(p.angle);
  xf.sin = Math.sin(p.angle);
  xf.size = p.size;
  xf.along = p.along;
}

function pathKind(
  ctx: CanvasRenderingContext2D,
  e: Enemy,
  dc: EnemyDrawContext,
): void {
  const s = xf.size;
  switch (e.kind) {
    case 'flipper':
      pathBowtie(ctx, s, xf.along);
      break;
    case 'tanker':
      pathDiamond(ctx, s);
      break;
    case 'spiker':
      pathSpiral(ctx, s * 0.9, dc.frame * 0.15);
      break;
    case 'fuseball':
      pathSparks(ctx, s, dc.frame * 0.21);
      break;
    case 'pulsar':
      pathZigzagCoil(ctx, s);
      break;
  }
}

// Draw ALL enemies in at most six stroke pairs: one per kind, plus a
// separate pass for flashing (participating) Pulsars during the telegraph.
export function drawEnemies(
  ctx: CanvasRenderingContext2D,
  enemies: readonly Enemy[],
  g: Geometry,
  vp: Viewport,
  alpha: number,
  dc: EnemyDrawContext,
  lowGlow: boolean,
  flipperHalfHeight: number, // sim rim arrival depth — bowtie along-extent (Task 2)
): void {
  const groups: {
    match(e: Enemy): boolean;
    color(): string;
  }[] = [
    { match: (e) => e.kind === 'flipper', color: () => ENEMY_COLORS.flipper },
    { match: (e) => e.kind === 'tanker', color: () => ENEMY_COLORS.tanker },
    { match: (e) => e.kind === 'spiker', color: () => ENEMY_COLORS.spiker },
    {
      match: (e) => e.kind === 'fuseball',
      color: () => FUSEBALL_COLORS[dc.frame % FUSEBALL_COLORS.length]!,
    },
    {
      // Only PARTICIPATING Pulsars flash — a late spawn will not electrify
      // this cycle (§6.5), so it must not warn as if it would.
      match: (e) => e.kind === 'pulsar' && e.pulseJoined !== true,
      color: () => ENEMY_COLORS.pulsar,
    },
    {
      match: (e) => e.kind === 'pulsar' && e.pulseJoined === true,
      color: () =>
        `color-mix(in srgb, ${ENEMY_COLORS.pulsar}, #ffffff ${Math.round(dc.pulsarFlash * 100)}%)`,
    },
  ];
  for (const group of groups) {
    let any = false;
    for (const e of enemies) {
      if (!group.match(e)) continue;
      if (!any) ctx.beginPath();
      any = true;
      setXform(placeEnemy(e, g, vp, alpha, flipperHalfHeight));
      pathKind(ctx, e, dc);
    }
    if (any) strokeWithGlow(ctx, group.color(), 1.5, lowGlow);
  }
}

// Player shots: thin bright ticks along the lane. Enemy shots: small
// bright double dashes — visually distinct (§11.1).
export function drawShots(
  ctx: CanvasRenderingContext2D,
  playerShots: readonly Shot[],
  enemyShots: readonly Shot[],
  g: Geometry,
  vp: Viewport,
  alpha: number,
  lowGlow: boolean,
): void {
  ctx.beginPath();
  for (const sh of playerShots) {
    const d = sh.prevDepth + (sh.depth - sh.prevDepth) * alpha;
    const a = project(sh.lane, Math.max(0, d - 0.015), g, vp);
    const b = project(sh.lane, Math.min(1, d + 0.015), g, vp);
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
  }
  strokeWithGlow(ctx, PLAYER_SHOT_COLOR, 2, lowGlow);

  ctx.beginPath();
  for (const sh of enemyShots) {
    const d = sh.prevDepth + (sh.depth - sh.prevDepth) * alpha;
    const p = project(sh.lane, d, g, vp);
    const r = Math.max(2, sizeAt(sh.lane, d, g, vp) * 0.35);
    ctx.moveTo(p.x - r, p.y - r * 0.5);
    ctx.lineTo(p.x + r * 0.2, p.y - r * 0.5);
    ctx.moveTo(p.x - r * 0.2, p.y + r * 0.5);
    ctx.lineTo(p.x + r, p.y + r * 0.5);
  }
  strokeWithGlow(ctx, ENEMY_SHOT_COLOR, 2, lowGlow);
}

// Spikes: a bright green line from the well bottom up to the spike top,
// with a small tip cross (§11.1).
export function drawSpikes(
  ctx: CanvasRenderingContext2D,
  spikes: readonly Spike[],
  g: Geometry,
  vp: Viewport,
  lowGlow: boolean,
): void {
  ctx.beginPath();
  for (const sp of spikes) {
    const top = project(sp.lane, sp.topDepth, g, vp);
    const bottom = project(sp.lane, 1, g, vp);
    ctx.moveTo(bottom.x, bottom.y);
    ctx.lineTo(top.x, top.y);
    const r = Math.max(2, sizeAt(sp.lane, sp.topDepth, g, vp) * 0.25);
    ctx.moveTo(top.x - r, top.y);
    ctx.lineTo(top.x + r, top.y);
  }
  strokeWithGlow(ctx, SPIKE_COLOR, 1.5, lowGlow);
}
