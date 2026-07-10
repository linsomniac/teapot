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

// Screen-space basis for a bowtie. Its x axis is the local lane chord at the
// rim-facing edge of the enemy; its y axis follows the actual lane toward the
// well bottom. These axes deliberately are not assumed perpendicular: on
// skew/open wells the lane ray can meet the rim chord obliquely. This affine
// basis keeps the wide edge across the lane and makes both rim-facing corners
// land exactly on the projected depth-(center - halfHeight) line.
interface BowtieBasis {
  xAngle: number;
  yAngle: number;
  halfWidth: number;
  halfHeight: number;
}

const bowtieBasis: BowtieBasis = {
  xAngle: 0,
  yAngle: Math.PI / 2,
  halfWidth: 0,
  halfHeight: 0,
};
const flipFromBasis: BowtieBasis = { ...bowtieBasis };
const flipToBasis: BowtieBasis = { ...bowtieBasis };

function basisForBowtie(
  lane: number,
  depth: number,
  hh: number,
  g: Geometry,
  vp: Viewport,
  out: BowtieBasis = bowtieBasis,
): BowtieBasis {
  const rimwardDepth = depth - hh;
  const left = project(lane - 0.5, rimwardDepth, g, vp);
  const right = project(lane + 0.5, rimwardDepth, g, vp);
  const rimwardCenter = project(lane, rimwardDepth, g, vp);
  const center = project(lane, depth, g, vp);
  const xdx = right.x - left.x;
  const xdy = right.y - left.y;
  const ydx = center.x - rimwardCenter.x;
  const ydy = center.y - rimwardCenter.y;
  out.xAngle = Math.atan2(xdy, xdx);
  out.yAngle = Math.atan2(ydy, ydx);
  out.halfWidth = Math.max(3, Math.hypot(xdx, xdy) / 2);
  out.halfHeight = Math.max(2, Math.hypot(ydx, ydy));
  return out;
}

interface Placement {
  x: number;
  y: number;
  xAngle: number; // across-lane axis (plus flip-over roll)
  yAngle: number; // along-lane axis; may be oblique to xAngle
  size: number; // across-lane half-width (the wide bowtie axis)
  along: number; // along-lane half-height (bowtie only; depth-coherent, Task 2)
}

const placement: Placement = {
  x: 0,
  y: 0,
  xAngle: 0,
  yAngle: Math.PI / 2,
  size: 0,
  along: 0,
};

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
      const from = basisForBowtie(e.flip.from, depth, hh, g, vp, flipFromBasis);
      const to = basisForBowtie(e.flip.to, depth, hh, g, vp, flipToBasis);
      let dx = to.xAngle - from.xAngle;
      while (dx > Math.PI) dx -= 2 * Math.PI;
      while (dx < -Math.PI) dx += 2 * Math.PI;
      let dy = to.yAngle - from.yAngle;
      while (dy > Math.PI) dy -= 2 * Math.PI;
      while (dy < -Math.PI) dy += 2 * Math.PI;
      placement.xAngle = from.xAngle + dx * t + t * Math.PI;
      placement.yAngle = from.yAngle + dy * t + t * Math.PI;
      placement.size = from.halfWidth + (to.halfWidth - from.halfWidth) * t;
      placement.along = from.halfHeight + (to.halfHeight - from.halfHeight) * t;
    } else {
      placement.xAngle = t * Math.PI;
      placement.yAngle = placement.xAngle + Math.PI / 2;
      const sizeFrom = sizeAt(e.flip.from, depth, g, vp);
      const sizeTo = sizeAt(e.flip.to, depth, g, vp);
      placement.size = sizeFrom + (sizeTo - sizeFrom) * t;
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
  if (isFlipper) {
    const basis = basisForBowtie(lane, depth, hh, g, vp);
    placement.xAngle = basis.xAngle;
    placement.yAngle = basis.yAngle;
    placement.size = basis.halfWidth;
    placement.along = basis.halfHeight;
  } else {
    placement.xAngle = 0;
    placement.yAngle = Math.PI / 2;
    placement.size = sizeAt(e.lane, depth, g, vp);
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
  xx: number;
  xy: number;
  yx: number;
  yy: number;
  size: number;
  along: number; // along-lane half-height (bowtie only)
}

const xf: Xform = {
  x: 0,
  y: 0,
  xx: 1,
  xy: 0,
  yx: 0,
  yy: 1,
  size: 1,
  along: 1,
};

function tMove(ctx: CanvasRenderingContext2D, px: number, py: number): void {
  ctx.moveTo(xf.x + px * xf.xx + py * xf.yx, xf.y + px * xf.xy + py * xf.yy);
}
function tLine(ctx: CanvasRenderingContext2D, px: number, py: number): void {
  ctx.lineTo(xf.x + px * xf.xx + py * xf.yx, xf.y + px * xf.xy + py * xf.yy);
}

function setXform(p: Placement): void {
  xf.x = p.x;
  xf.y = p.y;
  xf.xx = Math.cos(p.xAngle);
  xf.xy = Math.sin(p.xAngle);
  xf.yx = Math.cos(p.yAngle);
  xf.yy = Math.sin(p.yAngle);
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
