import { describe, expect, it } from 'vitest';
import { buildSnapshot, clearMouseAccumulator, createInputState } from './map';
import { TICK_SEC } from '../sim/types';
import { makeLiveConfig } from '../__tests__/fixtures/liveConfig';

// Task 10.1 — §13 input-mapping area.

const tuning = makeLiveConfig().tuning;

describe('keyboard mapping (§12.3)', () => {
  it('held right/left maps to ±rimSpeed×TICK_SEC per tick', () => {
    const st = createInputState();
    st.right = true;
    expect(buildSnapshot(st, tuning).move).toBeCloseTo(
      tuning.rimSpeed * TICK_SEC,
      12,
    );
    st.right = false;
    st.left = true;
    expect(buildSnapshot(st, tuning).move).toBeCloseTo(
      -tuning.rimSpeed * TICK_SEC,
      12,
    );
    st.right = true; // both held cancel
    expect(buildSnapshot(st, tuning).move).toBe(0);
  });

  it('held fire and pending edges pass through; edges are one-shot', () => {
    const st = createInputState();
    st.fire = true;
    st.confirmPressed = true;
    st.zapPressed = true;
    st.backPressed = true;
    st.quitPressed = true;
    const first = buildSnapshot(st, tuning);
    expect(first).toMatchObject({
      fire: true,
      confirm: true,
      zap: true,
      back: true,
      quit: true,
    });
    const second = buildSnapshot(st, tuning);
    expect(second).toMatchObject({
      fire: true,
      confirm: false,
      zap: false,
      back: false,
      quit: false,
    });
  });

  it('never reuses a snapshot object', () => {
    const st = createInputState();
    expect(buildSnapshot(st, tuning)).not.toBe(buildSnapshot(st, tuning));
  });
});

describe('mouse apportionment (§12.2/§12.3)', () => {
  it('mouse deltas scale by sensitivity', () => {
    const st = createInputState();
    st.mouseDeltaPx = tuning.mouseSensitivity * 0.3; // 0.3 lanes
    expect(buildSnapshot(st, tuning).move).toBeCloseTo(0.3, 12);
    expect(st.mouseDeltaPx).toBeCloseTo(0, 12); // fully drained
  });

  it('a large single-frame swipe drains ≤ clamp per tick and carries the rest', () => {
    const st = createInputState();
    const totalLanes = 2; // 100 px at 50 px/lane
    st.mouseDeltaPx = tuning.mouseSensitivity * totalLanes;
    let moved = 0;
    let ticks = 0;
    while (st.mouseDeltaPx > 1e-9 && ticks < 20) {
      const snap = buildSnapshot(st, tuning);
      expect(Math.abs(snap.move)).toBeLessThanOrEqual(tuning.perTickClamp);
      moved += snap.move;
      ticks++;
    }
    expect(moved).toBeCloseTo(totalLanes, 9); // nothing lost, nothing invented
    expect(ticks).toBe(Math.ceil(totalLanes / tuning.perTickClamp));
  });

  it('zero-tick frames accrue (accumulation is just addition)', () => {
    const st = createInputState();
    st.mouseDeltaPx += 30;
    st.mouseDeltaPx += 25; // two capture events, no tick between
    expect(st.mouseDeltaPx).toBe(55);
  });

  it('keyboard and mouse are summed then re-clamped; the carry stays mouse-side', () => {
    const st = createInputState();
    st.right = true;
    st.mouseDeltaPx = tuning.mouseSensitivity * 1; // a full lane pending
    const kb = tuning.rimSpeed * TICK_SEC;
    const snap = buildSnapshot(st, tuning);
    expect(snap.move).toBe(tuning.perTickClamp); // clamped sum
    // Only (clamp − kb) lanes of mouse were consumed; the rest carried.
    const consumed = tuning.perTickClamp - kb;
    expect(st.mouseDeltaPx / tuning.mouseSensitivity).toBeCloseTo(
      1 - consumed,
      9,
    );
  });

  it('opposing keyboard and mouse cancel without inventing movement', () => {
    const st = createInputState();
    st.left = true; // negative keyboard
    st.mouseDeltaPx = tuning.mouseSensitivity * 0.1; // small positive mouse
    const kb = -tuning.rimSpeed * TICK_SEC;
    const snap = buildSnapshot(st, tuning);
    expect(snap.move).toBeCloseTo(kb + 0.1, 9);
    expect(st.mouseDeltaPx).toBeCloseTo(0, 9); // the mouse part was consumed
  });

  it('a keyboard-only tick never mutates the mouse accumulator', () => {
    const st = createInputState();
    st.right = true;
    st.mouseDeltaPx = -12; // pending opposite-direction mouse
    buildSnapshot(st, tuning);
    // kb (0.233) + mouse (−0.24) summed... the mouse portion consumed is
    // bounded by what the move actually reflected.
    expect(st.mouseDeltaPx).toBeGreaterThanOrEqual(-12);
    st.mouseDeltaPx = 0;
    st.right = true;
    buildSnapshot(st, tuning);
    expect(st.mouseDeltaPx).toBe(0); // nothing synthesized
  });

  it('an opposing keyboard hold never over-drains the accumulator (≤ clamp/tick)', () => {
    const st = createInputState();
    st.right = true; // keyboard pushes +
    st.mouseDeltaPx = -3 * tuning.mouseSensitivity; // big opposing swipe
    const before = st.mouseDeltaPx;
    buildSnapshot(st, tuning);
    const drainedLanes = (st.mouseDeltaPx - before) / tuning.mouseSensitivity;
    expect(Math.abs(drainedLanes)).toBeLessThanOrEqual(
      tuning.perTickClamp + 1e-9,
    );
  });

  it('clearMouseAccumulator drops pending movement (pause/resume, §5)', () => {
    const st = createInputState();
    st.mouseDeltaPx = 500;
    clearMouseAccumulator(st);
    expect(buildSnapshot(st, tuning).move).toBe(0);
  });
});
