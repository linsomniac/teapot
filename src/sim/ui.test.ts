import { describe, expect, it } from 'vitest';
import { createSim, type Sim, type SimState } from './sim';
import { HS_CHARSET } from './highscore';
import { makeLiveConfig } from '../__tests__/fixtures/liveConfig';
import { makeInput } from '../__tests__/fixtures/input';

// Task 6.1 — UI navigation (§10/§8.3). §13 UI-nav area.

const cfg = makeLiveConfig();

function levelSelectSim(maxLevelReached = 15): { sim: Sim; s: SimState } {
  const sim = createSim(cfg, 1, { maxLevelReached, highScores: [] });
  const s = sim.getState() as SimState;
  sim.tick(makeInput({ confirm: true })); // TITLE → LEVEL_SELECT
  expect(s.phase).toBe('LEVEL_SELECT');
  return { sim, s };
}

function hsEntrySim(): { sim: Sim; s: SimState } {
  const sim = createSim(cfg, 1);
  const s = sim.getState() as SimState;
  s.phase = 'HIGH_SCORE_ENTRY';
  s.hsInitials = [1, 1, 1];
  s.hsSlot = 0;
  s.score = 100;
  return { sim, s };
}

describe('selector stepping (§8.3/§10)', () => {
  it('emits one step per full ±1.0 accumulated lanes', () => {
    const { sim, s } = levelSelectSim(); // opens at 15
    sim.tick(makeInput({ move: -0.4 })); // accum −0.4
    expect(s.selector).toBe(15);
    sim.tick(makeInput({ move: -0.4 })); // accum −0.8
    expect(s.selector).toBe(15);
    const { events } = sim.tick(makeInput({ move: -0.4 })); // accum −1.2 → step
    expect(s.selector).toBe(14);
    expect(events).toContainEqual({ type: 'uiMove' });
    expect(s.selectorAccum).toBe(0); // reset on emit
  });

  it('rate-limits to one step per uiStepInterval while held', () => {
    const { sim, s } = levelSelectSim();
    const changesAt: number[] = [];
    let last = s.selector;
    for (let i = 1; i <= 60; i++) {
      sim.tick(makeInput({ move: -0.45 }));
      if (s.selector !== last) {
        changesAt.push(i);
        last = s.selector;
      }
    }
    expect(changesAt.length).toBeGreaterThanOrEqual(2);
    const minGap = Math.floor(cfg.tuning.uiStepInterval * 60);
    for (let i = 1; i < changesAt.length; i++) {
      expect(changesAt[i]! - changesAt[i - 1]!).toBeGreaterThanOrEqual(minGap);
    }
  });

  it('release clears the accumulator — no post-release backlog', () => {
    const { sim, s } = levelSelectSim();
    sim.tick(makeInput({ move: -0.45 }));
    sim.tick(makeInput({ move: -0.45 })); // accum −0.9, no step yet
    for (let i = 0; i < 30; i++) sim.tick(makeInput({ move: 0 }));
    expect(s.selector).toBe(15); // nothing emitted after release
    expect(s.selectorAccum).toBe(0);
  });

  it('a direction flip clears the accumulator (zero-cross)', () => {
    const { sim, s } = levelSelectSim();
    s.selector = 10; // below the max so an upward step is visible
    sim.tick(makeInput({ move: -0.45 }));
    sim.tick(makeInput({ move: -0.45 })); // accum −0.9
    sim.tick(makeInput({ move: 0.45 })); // flip → accum becomes +0.45
    expect(s.selectorAccum).toBeCloseTo(0.45, 12);
    sim.tick(makeInput({ move: 0.45 }));
    const before = s.selector;
    sim.tick(makeInput({ move: 0.45 })); // +1.35 → step up
    expect(s.selector).toBe(before + 1);
  });

  it('clamps at 1 and at max(9, maxLevelReached) — no wrap', () => {
    const { sim, s } = levelSelectSim(9); // opens at 9 = max
    for (let i = 0; i < 20; i++) sim.tick(makeInput({ move: 0.45 }));
    expect(s.selector).toBe(9); // clamped at the top
    for (let i = 0; i < 300; i++) sim.tick(makeInput({ move: -0.45 }));
    expect(s.selector).toBe(1); // walked down and clamped at 1
    for (let i = 0; i < 20; i++) sim.tick(makeInput({ move: -0.45 }));
    expect(s.selector).toBe(1);
  });

  it('LEVEL_SELECT entry initializes selector to max(9, mlr) and clears the accumulator', () => {
    const sim = createSim(cfg, 1, { maxLevelReached: 12, highScores: [] });
    const s = sim.getState() as SimState;
    s.selectorAccum = 0.9; // stale accumulation in TITLE
    sim.tick(makeInput({ confirm: true }));
    expect(s.selector).toBe(12);
    expect(s.selectorAccum).toBe(0);
  });
});

describe('high-score entry (§10)', () => {
  it('steps rotate the active slot through the charset, wrapping both ends', () => {
    const { sim, s } = hsEntrySim();
    // Step down from 'A' (index 1) → space (0) → wraps to '9' (36).
    for (let i = 0; i < 3; i++) sim.tick(makeInput({ move: -0.4 }));
    expect(s.hsInitials[0]).toBe(0); // space
    for (let i = 0; i < 12; i++) sim.tick(makeInput({ move: 0 })); // release + rate limit
    for (let i = 0; i < 3; i++) sim.tick(makeInput({ move: -0.4 }));
    expect(s.hsInitials[0]).toBe(HS_CHARSET.length - 1); // wrapped to '9'
    for (let i = 0; i < 12; i++) sim.tick(makeInput({ move: 0 }));
    for (let i = 0; i < 3; i++) sim.tick(makeInput({ move: 0.4 }));
    expect(s.hsInitials[0]).toBe(0); // wrapped forward again
  });

  it('confirm locks the slot and advances; back returns; back is inert on slot 0', () => {
    const { sim, s } = hsEntrySim();
    sim.tick(makeInput({ back: true }));
    expect(s.hsSlot).toBe(0); // inert on the first slot
    sim.tick(makeInput({ confirm: true }));
    expect(s.hsSlot).toBe(1);
    sim.tick(makeInput({ back: true }));
    expect(s.hsSlot).toBe(0); // returned to fix a mistake
    sim.tick(makeInput({ confirm: true }));
    sim.tick(makeInput({ confirm: true }));
    expect(s.hsSlot).toBe(2);
    sim.tick(makeInput({ confirm: true })); // third slot confirmed
    expect(s.phase).toBe('TITLE');
  });

  it('steps only affect the ACTIVE slot', () => {
    const { sim, s } = hsEntrySim();
    sim.tick(makeInput({ confirm: true })); // slot 1 active
    for (let i = 0; i < 3; i++) sim.tick(makeInput({ move: 0.4 }));
    expect(s.hsInitials[0]).toBe(1); // untouched
    expect(s.hsInitials[1]).toBe(2); // 'B'
  });

  it('the committed entry uses the rotated characters', () => {
    const { sim, s } = hsEntrySim();
    for (let i = 0; i < 3; i++) sim.tick(makeInput({ move: 0.4 })); // A→B
    sim.tick(makeInput({ confirm: true }));
    sim.tick(makeInput({ confirm: true })); // slot 1 stays 'A'
    sim.tick(makeInput({ confirm: true })); // slot 2 stays 'A' → commit
    expect(s.phase).toBe('TITLE');
    expect(s.highScores[0]!.initials).toBe('BAA');
  });
});
