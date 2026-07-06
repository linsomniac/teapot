import { describe, expect, it } from 'vitest';
import { sweptOverlap } from './collision';

describe('sweptOverlap (§13 collision area, §6.7)', () => {
  it('catches opposing fast shots that point-sampling would tunnel through', () => {
    // Player shot travels +0.025/tick (rim→bottom), enemy shot −0.018/tick,
    // extents 0.01 each. They start 0.0215 apart and END 0.0215 apart on the
    // other side — both endpoint separations exceed the summed extents
    // (0.02), so sampling prev or curr alone sees no hit; they crossed
    // mid-tick.
    const pPrev = 0.1,
      pCurr = 0.125;
    const ePrev = 0.1215,
      eCurr = 0.1035;
    expect(Math.abs(pPrev - ePrev)).toBeGreaterThan(0.02); // no hit at prev
    expect(Math.abs(pCurr - eCurr)).toBeGreaterThan(0.02); // no hit at curr
    expect(sweptOverlap(pPrev, pCurr, 0.01, ePrev, eCurr, 0.01)).toBe(true);
  });

  it('a shot spawned at depth 0 overlaps a depth-0 rim enemy on tick 1', () => {
    // Shot: prev 0 → curr 0.025 (ext 0.01); enemy parked at the rim (ext 0.02).
    expect(sweptOverlap(0, 0.025, 0.01, 0, 0, 0.02)).toBe(true);
  });

  it('returns false for non-overlapping spans', () => {
    expect(sweptOverlap(0.1, 0.2, 0.01, 0.5, 0.6, 0.01)).toBe(false);
    expect(sweptOverlap(0.9, 0.8, 0.02, 0.1, 0.15, 0.01)).toBe(false);
  });

  it('extents are inclusive at the boundary', () => {
    // A occupies [0.29, 0.31]; B occupies [0.31, 0.35] — touching counts.
    expect(sweptOverlap(0.3, 0.3, 0.01, 0.33, 0.33, 0.02)).toBe(true);
    // Move B out by any margin and it no longer touches.
    expect(sweptOverlap(0.3, 0.3, 0.01, 0.331, 0.331, 0.02)).toBe(false);
  });

  it('is direction-agnostic: prev/curr order does not matter', () => {
    expect(sweptOverlap(0.125, 0.1, 0.01, 0.1035, 0.1215, 0.01)).toBe(true);
    expect(sweptOverlap(0.2, 0.1, 0.01, 0.6, 0.5, 0.01)).toBe(false);
  });

  it('zero extents still collide on exact span overlap (spike top, Blaster)', () => {
    expect(sweptOverlap(0.4, 0.5, 0, 0.45, 0.45, 0)).toBe(true);
    expect(sweptOverlap(0.4, 0.44, 0, 0.45, 0.45, 0)).toBe(false);
  });
});
