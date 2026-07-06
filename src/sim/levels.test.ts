import { describe, expect, it } from 'vitest';
import { geometryIndexForLevel, paletteIndexForLevel } from './levels';

// §13 level-mapping area; §15 criterion 2. Palette order (§4):
// 0 blue, 1 red, 2 yellow, 3 cyan, 4 green, 5 magenta.
describe('level → geometry/palette mapping (§4/§8.1)', () => {
  it('geometry cycles (N−1) mod 16 across levels 1–112', () => {
    for (let level = 1; level <= 112; level++) {
      expect(geometryIndexForLevel(level)).toBe((level - 1) % 16);
    }
    expect(geometryIndexForLevel(1)).toBe(0);
    expect(geometryIndexForLevel(16)).toBe(15);
    expect(geometryIndexForLevel(17)).toBe(0);
    expect(geometryIndexForLevel(96)).toBe(15);
    expect(geometryIndexForLevel(97)).toBe(0);
    expect(geometryIndexForLevel(112)).toBe(15);
  });

  it('palette cycles floor((N−1)/16) mod 6 across levels 1–112', () => {
    for (let level = 1; level <= 112; level++) {
      expect(paletteIndexForLevel(level)).toBe(
        Math.floor((level - 1) / 16) % 6,
      );
    }
  });

  it('hits the named §4 boundary cases', () => {
    expect(paletteIndexForLevel(16)).toBe(0); // blue
    expect(paletteIndexForLevel(17)).toBe(1); // red
    expect(paletteIndexForLevel(32)).toBe(1);
    expect(paletteIndexForLevel(33)).toBe(2); // yellow
    expect(paletteIndexForLevel(49)).toBe(3); // cyan
    expect(paletteIndexForLevel(65)).toBe(4); // green
    expect(paletteIndexForLevel(81)).toBe(5); // magenta
    expect(paletteIndexForLevel(96)).toBe(5);
    expect(paletteIndexForLevel(97)).toBe(0); // blue again
    expect(paletteIndexForLevel(112)).toBe(0);
    expect(paletteIndexForLevel(113)).toBe(1); // the cycle continues forever
  });

  it('every 16-level block is one palette band', () => {
    for (let block = 0; block < 7; block++) {
      const first = block * 16 + 1;
      const band = paletteIndexForLevel(first);
      for (let level = first; level < first + 16; level++) {
        expect(paletteIndexForLevel(level)).toBe(band);
      }
      expect(geometryIndexForLevel(first)).toBe(0);
      expect(geometryIndexForLevel(first + 15)).toBe(15);
    }
  });
});
