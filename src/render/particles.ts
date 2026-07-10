// Line-burst particle effects (§11.1): short stroked sparks from a fixed
// pool (I3 — no allocation after construction; the cap doubles as the bench
// census particle count, §12.6). Randomness uses a RENDER-side mulberry32
// stream, separate from the sim RNG, so visuals never affect determinism.

import { makeRng, type Rng } from '../sim/rng';

interface Particle {
  active: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number; // seconds remaining
  maxLife: number;
  color: string;
}

export interface ParticleSystem {
  burst(
    x: number,
    y: number,
    color: string,
    count: number,
    speed: number,
  ): void;
  playerDeathBurst(x: number, y: number): void;
  update(dtSec: number): void;
  draw(ctx: CanvasRenderingContext2D, lowGlow: boolean): void;
  liveCount(): number;
}

export function createParticleSystem(
  cap: number,
  seed = 0x9e3779b9,
): ParticleSystem {
  const pool: Particle[] = Array.from({ length: cap }, () => ({
    active: false,
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    life: 0,
    maxLife: 1,
    color: '#fff',
  }));
  const rng: Rng = makeRng(seed);
  const drawColors: string[] = []; // reused per frame
  let cursor = 0;

  function spawnOne(x: number, y: number, color: string, speed: number): void {
    // Reuse the oldest slot when the pool is saturated (hard cap).
    const p = pool[cursor]!;
    cursor = (cursor + 1) % cap;
    const ang = rng.next() * 2 * Math.PI;
    const v = speed * (0.35 + rng.next() * 0.65);
    p.active = true;
    p.x = x;
    p.y = y;
    p.vx = Math.cos(ang) * v;
    p.vy = Math.sin(ang) * v;
    p.maxLife = 0.35 + rng.next() * 0.4;
    p.life = p.maxLife;
    p.color = color;
  }

  return {
    burst(x, y, color, count, speed): void {
      for (let i = 0; i < count; i++) spawnOne(x, y, color, speed);
    },
    playerDeathBurst(x, y): void {
      // Layered, distinct burst (§11.1): a dense hot core plus longer red/
      // yellow fragments. The renderer adds expanding rings over this cloud.
      for (let i = 0; i < 96; i++) {
        const color =
          i % 5 === 0 ? '#ffffff' : i % 3 === 0 ? '#ff5a36' : '#ffd23b';
        const speed = i < 24 ? 150 : i < 72 ? 290 : 430;
        spawnOne(x, y, color, speed);
      }
    },
    update(dtSec): void {
      for (const p of pool) {
        if (!p.active) continue;
        p.life -= dtSec;
        if (p.life <= 0) {
          p.active = false;
          continue;
        }
        p.x += p.vx * dtSec;
        p.y += p.vy * dtSec;
        p.vx *= 0.98;
        p.vy *= 0.98;
      }
    },
    draw(ctx, lowGlow): void {
      // One stroke pass per distinct active color (a handful at most) —
      // keeps per-type burst colors without per-particle stroking.
      drawColors.length = 0;
      for (const p of pool) {
        if (p.active && !drawColors.includes(p.color)) drawColors.push(p.color);
      }
      // Sparks are tiny and numerous (the pool can hold hundreds). ONE
      // additive pass, two width groups: every extra full-canvas-bbox
      // 'lighter' stroke costs a whole composite on CPU-raster engines, so
      // burst color identity comes from the death-burst palette instead of
      // per-particle stroke passes; the glow identity lives on the
      // well/entities (§11.1).
      // The frame is already in its additive block (renderer).
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (const p of pool) {
        if (!p.active) continue;
        // Short line spark along the velocity vector, fading with life.
        const k = 0.04 * (p.life / p.maxLife) + 0.012;
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x - p.vx * k, p.y - p.vy * k);
      }
      ctx.strokeStyle = '#ffd9a0';
      ctx.stroke();
      void lowGlow;
      void drawColors;
    },
    liveCount(): number {
      let n = 0;
      for (const p of pool) if (p.active) n++;
      return n;
    },
  };
}
