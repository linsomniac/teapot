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
//
// AIDEV-NOTE: deliberately NO save/restore and NO composite-op write here —
// the frame renderer sets globalCompositeOperation='lighter' ONCE per frame
// (beginAdditiveFrame/endAdditiveFrame). Per-call state churn forces
// CPU-raster engines (Firefox/Linux canvas) to flush their pipeline on
// every stroke, which dominated the §12.6 bench before this was hoisted.
// Default (butt/miter) caps for the same reason: round caps are expensive
// in software rasterization and read identically at these widths.
export function strokeWithGlow(
  ctx: CanvasRenderingContext2D,
  color: string,
  coreWidth: number,
  lowGlow: boolean,
): void {
  ctx.strokeStyle = color;
  if (!lowGlow) {
    ctx.globalAlpha = GLOW_ALPHA;
    ctx.lineWidth = coreWidth * GLOW_WIDTH_MUL;
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
  ctx.lineWidth = coreWidth;
  ctx.stroke();
}

// Bracket ALL additive line-art drawing in one composite-state block per
// frame (§11.1: overlaps brighten — 'lighter').
export function beginAdditiveFrame(ctx: CanvasRenderingContext2D): void {
  ctx.globalCompositeOperation = 'lighter';
}

export function endAdditiveFrame(ctx: CanvasRenderingContext2D): void {
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
}

// ?lowglow=1 manual degradation flag (§11.1) — parsed once at startup.
export function isLowGlow(search: string): boolean {
  return new URLSearchParams(search).get('lowglow') === '1';
}
