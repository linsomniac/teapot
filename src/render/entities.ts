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

interface Placement {
  x: number;
  y: number;
  angle: number; // silhouette roll (flip-over animation)
  size: number;
}

const placement: Placement = { x: 0, y: 0, angle: 0, size: 0 };

// Where (and how rolled) to draw an enemy: mid-flip enemies rotate about
// the shared edge between the source and destination lanes (§11.1).
function placeEnemy(
  e: Enemy,
  g: Geometry,
  vp: Viewport,
  alpha: number,
): Placement {
  const depth = e.prevDepth + (e.depth - e.prevDepth) * alpha;
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
    placement.angle = t * Math.PI; // the flip-over roll
    placement.size = sizeAt(e.flip.from, depth, g, vp);
    return placement;
  }
  // Shortest-arc lane interpolation (mod 16 on closed wells) so a Fuseball
  // crawling across the 15↔0 seam doesn't streak across the well (§11.1).
  const lane = interpRim(e.prevLane, e.lane, alpha, g.closed);
  const p = project(lane, depth, g, vp);
  placement.x = p.x;
  placement.y = p.y;
  placement.angle = 0;
  placement.size = sizeAt(e.lane, depth, g, vp);
  return placement;
}

function pathBowtie(ctx: CanvasRenderingContext2D, s: number): void {
  ctx.moveTo(-s, -s * 0.6);
  ctx.lineTo(0, 0);
  ctx.lineTo(-s, s * 0.6);
  ctx.lineTo(-s, -s * 0.6);
  ctx.moveTo(s, -s * 0.6);
  ctx.lineTo(0, 0);
  ctx.lineTo(s, s * 0.6);
  ctx.lineTo(s, -s * 0.6);
}

function pathDiamond(ctx: CanvasRenderingContext2D, s: number): void {
  ctx.moveTo(0, -s * 0.9);
  ctx.lineTo(s * 0.9, 0);
  ctx.lineTo(0, s * 0.9);
  ctx.lineTo(-s * 0.9, 0);
  ctx.lineTo(0, -s * 0.9);
  ctx.moveTo(-s * 0.45, 0);
  ctx.lineTo(s * 0.45, 0);
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
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
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
    ctx.moveTo(0, 0);
    ctx.lineTo(Math.cos(ang) * len, Math.sin(ang) * len);
  }
}

function pathZigzagCoil(ctx: CanvasRenderingContext2D, s: number): void {
  const teeth = 4;
  ctx.moveTo(-s, 0);
  for (let i = 0; i < teeth; i++) {
    const x0 = -s + ((i + 0.5) / teeth) * 2 * s;
    const x1 = -s + ((i + 1) / teeth) * 2 * s;
    ctx.lineTo(x0, i % 2 === 0 ? -s * 0.6 : s * 0.6);
    ctx.lineTo(x1, 0);
  }
}

export interface EnemyDrawContext {
  frame: number; // render frame counter (spin/shimmer clocks)
  pulsarFlash: number; // 0..1 — cyan→white mix during the telegraph
}

export function drawEnemy(
  ctx: CanvasRenderingContext2D,
  e: Enemy,
  g: Geometry,
  vp: Viewport,
  alpha: number,
  dc: EnemyDrawContext,
  lowGlow: boolean,
): void {
  const p = placeEnemy(e, g, vp, alpha);
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.rotate(p.angle);
  ctx.beginPath();
  let color: string;
  switch (e.kind) {
    case 'flipper':
      pathBowtie(ctx, p.size);
      color = ENEMY_COLORS.flipper;
      break;
    case 'tanker':
      pathDiamond(ctx, p.size);
      color = ENEMY_COLORS.tanker;
      break;
    case 'spiker':
      pathSpiral(ctx, p.size * 0.9, dc.frame * 0.15);
      color = ENEMY_COLORS.spiker;
      break;
    case 'fuseball':
      pathSparks(ctx, p.size, dc.frame * 0.21);
      color = FUSEBALL_COLORS[dc.frame % FUSEBALL_COLORS.length]!;
      break;
    case 'pulsar': {
      pathZigzagCoil(ctx, p.size);
      // Only PARTICIPATING Pulsars flash — a late spawn will not electrify
      // this cycle (§6.5), so it must not warn as if it would.
      const flash = e.pulseJoined === true ? dc.pulsarFlash : 0;
      const f = Math.round(flash * 100);
      color = `color-mix(in srgb, ${ENEMY_COLORS.pulsar}, #ffffff ${f}%)`;
      break;
    }
  }
  strokeWithGlow(ctx, color, 1.5, lowGlow);
  ctx.restore();
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
