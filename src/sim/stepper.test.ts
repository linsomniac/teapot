import { describe, expect, it } from 'vitest';
import { MAX_ACCUM_MS, TICK_MS, advance } from './stepper';

describe('fixed-timestep stepper (§13 stepper area)', () => {
  it('a 16.7 ms frame produces exactly 1 tick', () => {
    const r = advance(0, 16.7);
    expect(r.ticks).toBe(1);
    expect(r.accumMs).toBeGreaterThanOrEqual(0);
    expect(r.accumMs).toBeLessThan(TICK_MS);
  });

  it('8 ms three times → 0, 0, then 1 tick (accumulator crosses on the third)', () => {
    const r1 = advance(0, 8);
    expect(r1.ticks).toBe(0);
    const r2 = advance(r1.accumMs, 8);
    expect(r2.ticks).toBe(0);
    const r3 = advance(r2.accumMs, 8);
    expect(r3.ticks).toBe(1);
    expect(r3.accumMs).toBeCloseTo(24 - TICK_MS, 9); // ~7.33 ms carries
  });

  it('a 40 ms frame → 2 ticks with ~6.67 ms carried', () => {
    const r = advance(0, 40);
    expect(r.ticks).toBe(2);
    expect(r.accumMs).toBeCloseTo(40 - 2 * TICK_MS, 9);
  });

  it('a 5000 ms frame clamps to MAX_ACCUM_MS: exactly 15 ticks, nothing carried', () => {
    const r = advance(0, 5000);
    expect(r.ticks).toBe(15);
    expect(r.ticks).toBe(Math.round(MAX_ACCUM_MS / TICK_MS));
    expect(r.accumMs).toBe(0);
    expect(r.alpha).toBe(0);
  });

  it('an exactly-250 ms total also yields 15 ticks (clamp boundary, no float loss)', () => {
    expect(advance(0, 250)).toEqual({ ticks: 15, accumMs: 0, alpha: 0 });
    expect(advance(10, 240)).toEqual({ ticks: 15, accumMs: 0, alpha: 0 });
  });

  it('alpha ∈ [0,1) and equals the carried fraction of a tick', () => {
    for (const elapsed of [0, 5, 8, 16.7, 33.4, 40, 100, 249, 250, 5000]) {
      const r = advance(0, elapsed);
      expect(r.alpha).toBeGreaterThanOrEqual(0);
      expect(r.alpha).toBeLessThan(1);
      expect(r.accumMs).toBeCloseTo(r.alpha * TICK_MS, 9);
    }
  });

  it('zero elapsed advances nothing and preserves the accumulator', () => {
    const r = advance(10, 0);
    expect(r.ticks).toBe(0);
    expect(r.accumMs).toBeCloseTo(10, 9);
  });

  it('carry chains conserve time: ticks·TICK_MS + accum = elapsed total', () => {
    let accum = 0;
    let ticks = 0;
    for (let i = 0; i < 60; i++) {
      const r = advance(accum, 10);
      accum = r.accumMs;
      ticks += r.ticks;
    }
    // 600 ms is exactly 36 ticks in rational math; float carries may leave the
    // last boundary tick pending in the accumulator, but no time is ever lost.
    expect(ticks * TICK_MS + accum).toBeCloseTo(600, 6);
    expect(Math.abs(ticks - 600 / TICK_MS)).toBeLessThanOrEqual(1);
  });
});
