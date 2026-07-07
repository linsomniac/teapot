// Stroke-segment lettering (§11.1, D22): Hershey/Vectrex-style glyphs
// authored as static polyline data — no font files, no async loading.
// Glyph cell: 4 wide × 6 tall (y down, baseline at 6). Covers everything the
// screens use: A–Z, 0–9, space, and ×  .  ,  :  -  !  (Task 8.4 must extend
// this module if a screen introduces a new glyph). Scores render as plain
// digit runs — no thousands separators (§ Task 8.1).

export const GLYPH_W = 4;
export const GLYPH_H = 6;
export const GLYPH_SPACING = 1.5; // cell units between glyphs

// Each glyph: a list of polylines; each polyline: [x0,y0, x1,y1, ...].
type Glyph = number[][];

export const GLYPHS: Record<string, Glyph> = {
  ' ': [],
  A: [
    [0, 6, 2, 0, 4, 6],
    [1, 4, 3, 4],
  ],
  B: [
    [0, 6, 0, 0, 3, 0, 4, 1, 4, 2, 3, 3, 0, 3],
    [3, 3, 4, 4, 4, 5, 3, 6, 0, 6],
  ],
  C: [[4, 1, 3, 0, 1, 0, 0, 1, 0, 5, 1, 6, 3, 6, 4, 5]],
  D: [[0, 0, 0, 6, 2, 6, 4, 4, 4, 2, 2, 0, 0, 0]],
  E: [
    [4, 0, 0, 0, 0, 6, 4, 6],
    [0, 3, 3, 3],
  ],
  F: [
    [4, 0, 0, 0, 0, 6],
    [0, 3, 3, 3],
  ],
  G: [[4, 1, 3, 0, 1, 0, 0, 1, 0, 5, 1, 6, 3, 6, 4, 5, 4, 3, 2, 3]],
  H: [
    [0, 0, 0, 6],
    [4, 0, 4, 6],
    [0, 3, 4, 3],
  ],
  I: [
    [1, 0, 3, 0],
    [2, 0, 2, 6],
    [1, 6, 3, 6],
  ],
  J: [[4, 0, 4, 5, 3, 6, 1, 6, 0, 5]],
  K: [
    [0, 0, 0, 6],
    [4, 0, 0, 3, 4, 6],
  ],
  L: [[0, 0, 0, 6, 4, 6]],
  M: [[0, 6, 0, 0, 2, 3, 4, 0, 4, 6]],
  N: [[0, 6, 0, 0, 4, 6, 4, 0]],
  O: [[1, 0, 3, 0, 4, 1, 4, 5, 3, 6, 1, 6, 0, 5, 0, 1, 1, 0]],
  P: [[0, 6, 0, 0, 3, 0, 4, 1, 4, 2, 3, 3, 0, 3]],
  Q: [
    [1, 0, 3, 0, 4, 1, 4, 5, 3, 6, 1, 6, 0, 5, 0, 1, 1, 0],
    [2, 4, 4, 6],
  ],
  R: [
    [0, 6, 0, 0, 3, 0, 4, 1, 4, 2, 3, 3, 0, 3],
    [2, 3, 4, 6],
  ],
  S: [[4, 1, 3, 0, 1, 0, 0, 1, 0, 2, 1, 3, 3, 3, 4, 4, 4, 5, 3, 6, 1, 6, 0, 5]],
  T: [
    [0, 0, 4, 0],
    [2, 0, 2, 6],
  ],
  U: [[0, 0, 0, 5, 1, 6, 3, 6, 4, 5, 4, 0]],
  V: [[0, 0, 2, 6, 4, 0]],
  W: [[0, 0, 1, 6, 2, 3, 3, 6, 4, 0]],
  X: [
    [0, 0, 4, 6],
    [4, 0, 0, 6],
  ],
  Y: [
    [0, 0, 2, 3, 4, 0],
    [2, 3, 2, 6],
  ],
  Z: [[0, 0, 4, 0, 0, 6, 4, 6]],
  '0': [
    [1, 0, 3, 0, 4, 1, 4, 5, 3, 6, 1, 6, 0, 5, 0, 1, 1, 0],
    [1, 4, 3, 2],
  ],
  '1': [
    [1, 1, 2, 0, 2, 6],
    [1, 6, 3, 6],
  ],
  '2': [[0, 1, 1, 0, 3, 0, 4, 1, 4, 2, 0, 6, 4, 6]],
  '3': [
    [0, 1, 1, 0, 3, 0, 4, 1, 4, 2, 3, 3, 1, 3],
    [3, 3, 4, 4, 4, 5, 3, 6, 1, 6, 0, 5],
  ],
  '4': [[3, 6, 3, 0, 0, 4, 4, 4]],
  '5': [[4, 0, 0, 0, 0, 3, 3, 3, 4, 4, 4, 5, 3, 6, 1, 6, 0, 5]],
  '6': [[4, 1, 3, 0, 1, 0, 0, 1, 0, 5, 1, 6, 3, 6, 4, 5, 4, 4, 3, 3, 0, 3]],
  '7': [[0, 0, 4, 0, 1, 6]],
  '8': [
    [1, 3, 0, 2, 0, 1, 1, 0, 3, 0, 4, 1, 4, 2, 3, 3, 1, 3],
    [1, 3, 0, 4, 0, 5, 1, 6, 3, 6, 4, 5, 4, 4, 3, 3],
  ],
  '9': [[0, 5, 1, 6, 3, 6, 4, 5, 4, 1, 3, 0, 1, 0, 0, 1, 0, 2, 1, 3, 4, 3]],
  '×': [
    [1, 2, 3, 4],
    [3, 2, 1, 4],
  ],
  '.': [[2, 5.6, 2, 6]],
  ',': [[2.2, 5.4, 1.6, 6.6]],
  ':': [
    [2, 2, 2, 2.4],
    [2, 4.6, 2, 5],
  ],
  '-': [[1, 3, 3, 3]],
  '!': [
    [2, 0, 2, 4],
    [2, 5.6, 2, 6],
  ],
};

export type TextAlign = 'left' | 'center' | 'right';

// Advance width of one glyph cell at the given size (size = glyph height px).
function advance(size: number): number {
  return ((GLYPH_W + GLYPH_SPACING) / GLYPH_H) * size;
}

export function textWidth(text: string, size: number): number {
  if (text.length === 0) return 0;
  return text.length * advance(size) - (GLYPH_SPACING / GLYPH_H) * size;
}

// Appends the text's stroke segments to the context's CURRENT path (caller
// begins the path and strokes it — typically via strokeWithGlow). x,y is the
// TOP of the text line; unknown characters render as space.
export function pathText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  size: number,
  align: TextAlign = 'left',
): void {
  const scale = size / GLYPH_H;
  let originX = x;
  if (align === 'center') originX -= textWidth(text, size) / 2;
  else if (align === 'right') originX -= textWidth(text, size);
  const step = advance(size);
  const upper = text.toUpperCase();
  for (let i = 0; i < upper.length; i++) {
    const glyph = GLYPHS[upper[i]!];
    if (glyph !== undefined) {
      const gx = originX + i * step;
      for (const line of glyph) {
        ctx.moveTo(gx + line[0]! * scale, y + line[1]! * scale);
        for (let p = 2; p < line.length; p += 2) {
          ctx.lineTo(gx + line[p]! * scale, y + line[p + 1]! * scale);
        }
      }
    }
  }
}
