// Level → geometry/palette mapping (§4/§8.1). Levels are 1-based and endless.

import { LANES } from './well';

// Geometry index cycles every 16 levels: (N−1) mod 16. Indices 0–7 are the
// closed wells, 8–15 the open wells (§4; cross-checked structurally in the
// geometry validation test).
export function geometryIndexForLevel(level: number): number {
  return (level - 1) % LANES;
}

// Palette band: floor((N−1)/16) mod 6 into [blue, red, yellow, cyan, green,
// magenta] — levels 1–16 blue, …, 81–96 magenta, 97–112 blue again (§4).
export function paletteIndexForLevel(level: number): number {
  return Math.floor((level - 1) / LANES) % 6;
}
