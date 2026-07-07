// Layered-stroke additive glow (§11.1): a wide low-alpha pass under a thin
// bright core, composited with globalCompositeOperation='lighter' so
// overlaps brighten rather than muddy — NOT shadowBlur (too slow). The
// lowGlow degradation (a config/URL constant — ?lowglow=1 — not an
// auto-adaptive per-frame watchdog) drops the wide pass: still stroked
// wireframe line art, only the soft halo is reduced.

export const GLOW_WIDTH_MUL = 4;
export const GLOW_ALPHA = 0.22;

// Strokes the context's CURRENT path twice (wide halo + bright core), so
// callers build the path once — no per-call allocation.
export function strokeWithGlow(
  ctx: CanvasRenderingContext2D,
  color: string,
  coreWidth: number,
  lowGlow: boolean,
): void {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.strokeStyle = color;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  if (!lowGlow) {
    ctx.globalAlpha = GLOW_ALPHA;
    ctx.lineWidth = coreWidth * GLOW_WIDTH_MUL;
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  ctx.lineWidth = coreWidth;
  ctx.stroke();
  ctx.restore();
}

// ?lowglow=1 manual degradation flag (§11.1) — parsed once at startup.
export function isLowGlow(search: string): boolean {
  return new URLSearchParams(search).get('lowglow') === '1';
}
