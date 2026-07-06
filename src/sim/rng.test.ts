import { describe, expect, it } from 'vitest';
import { makeRng } from './rng';

describe('mulberry32 RNG (§12.3 determinism contract)', () => {
  it('same seed → identical first 100 next() values', () => {
    const a = makeRng(0xdecafbad);
    const b = makeRng(0xdecafbad);
    for (let i = 0; i < 100; i++) {
      expect(a.next()).toBe(b.next());
    }
  });

  it('different seeds → different sequences', () => {
    const a = makeRng(1);
    const b = makeRng(2);
    const seqA = Array.from({ length: 10 }, () => a.next());
    const seqB = Array.from({ length: 10 }, () => b.next());
    expect(seqA).not.toEqual(seqB);
  });

  it('next() ∈ [0, 1)', () => {
    const rng = makeRng(42);
    for (let i = 0; i < 10_000; i++) {
      const v = rng.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('nextInt(16) ∈ [0, 16) and integer', () => {
    const rng = makeRng(7);
    for (let i = 0; i < 10_000; i++) {
      const v = rng.nextInt(16);
      expect(Number.isInteger(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(16);
    }
  });

  it('setState(state()) round-trips: two RNGs diverge then converge', () => {
    const a = makeRng(123);
    const b = makeRng(456);
    // Diverged: sequences differ.
    expect(a.next()).not.toBe(b.next());
    // Converge b onto a's state: identical from here on.
    const snap = a.state();
    b.setState(snap);
    for (let i = 0; i < 50; i++) {
      expect(b.next()).toBe(a.next());
    }
    // Rewind a to the snapshot: it replays the same run.
    const replayRef = makeRng(0);
    replayRef.setState(snap);
    const fresh = makeRng(123);
    fresh.next(); // advance to where the snapshot was taken
    expect(fresh.state()).toBe(snap);
    expect(replayRef.next()).toBe(fresh.next());
  });

  it('nextInt(16) over 100k draws is roughly uniform (loose bound)', () => {
    const rng = makeRng(0x7ea907); // fixed arbitrary seed ("teapot"-ish)
    const counts = new Array<number>(16).fill(0);
    const draws = 100_000;
    for (let i = 0; i < draws; i++) {
      counts[rng.nextInt(16)]!++;
    }
    const expected = draws / 16; // 6250
    for (const c of counts) {
      // Loose ±10% bound — catches gross bias, survives seed changes.
      expect(c).toBeGreaterThan(expected * 0.9);
      expect(c).toBeLessThan(expected * 1.1);
    }
  });
});
