// Canvas + viewport management (§11.1): single full-viewport canvas,
// letterboxed 4:3 playfield, devicePixelRatio-aware backing store CAPPED at
// DPR 2. Drawing code works in CSS pixels (the context is scaled by dpr).

export interface PlayfieldRect {
  x: number; // CSS px, canvas-relative
  y: number;
  width: number;
  height: number;
}

export interface CanvasView {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  dpr: number;
  cssWidth: number;
  cssHeight: number;
  playfield: PlayfieldRect; // largest centered 4:3 rect
}

export const PLAYFIELD_ASPECT = 4 / 3;
export const MAX_DPR = 2;

function layoutPlayfield(cssWidth: number, cssHeight: number): PlayfieldRect {
  let width = cssWidth;
  let height = width / PLAYFIELD_ASPECT;
  if (height > cssHeight) {
    height = cssHeight;
    width = height * PLAYFIELD_ASPECT;
  }
  return {
    x: (cssWidth - width) / 2,
    y: (cssHeight - height) / 2,
    width,
    height,
  };
}

// Owns backing-store sizing; call resize() on window resize (the app layer
// wires the listener, Task 11.2) and view() each frame.
export function createCanvasView(canvas: HTMLCanvasElement): {
  view(): CanvasView;
  resize(): void;
} {
  // Opaque canvas: we always paint the full black frame, and alpha-less
  // surfaces rasterize/composite faster (notably Firefox CPU canvas).
  const maybeCtx = canvas.getContext('2d', { alpha: false });
  if (!maybeCtx) {
    throw new Error('2D canvas context unavailable');
  }
  const ctx: CanvasRenderingContext2D = maybeCtx; // narrowed for the closure
  const state: CanvasView = {
    canvas,
    ctx,
    dpr: 1,
    cssWidth: 0,
    cssHeight: 0,
    playfield: { x: 0, y: 0, width: 0, height: 0 },
  };

  function resize(): void {
    const cssWidth = canvas.clientWidth;
    const cssHeight = canvas.clientHeight;
    const dpr = Math.min(MAX_DPR, window.devicePixelRatio || 1);
    canvas.width = Math.max(1, Math.round(cssWidth * dpr));
    canvas.height = Math.max(1, Math.round(cssHeight * dpr));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); // draw in CSS px
    state.dpr = dpr;
    state.cssWidth = cssWidth;
    state.cssHeight = cssHeight;
    state.playfield = layoutPlayfield(cssWidth, cssHeight);
  }

  resize();
  return { view: () => state, resize };
}
