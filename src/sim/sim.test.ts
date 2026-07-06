import { describe, expect, it } from 'vitest';
import { createSim, createSimFromState, type SimState } from './sim';
import { validateConfig } from './config';
import { makeLiveConfig } from '../__tests__/fixtures/liveConfig';
import { makeInput } from '../__tests__/fixtures/input';

describe('live config guard (§13)', () => {
  it('validateConfig(makeLiveConfig()) does not throw', () => {
    expect(() => validateConfig(makeLiveConfig())).not.toThrow();
  });

  it('createSim validates its injected config at construction', () => {
    const bad = makeLiveConfig();
    bad.tuning.perTickClamp = 0.7;
    expect(() => createSim(bad, 1)).toThrow(/perTickClamp/);
  });
});

describe('createSim (§12.2, I14)', () => {
  it('defaults initialSave to { maxLevelReached: 1, highScores: [] }', () => {
    const s = createSim(makeLiveConfig(), 1).getState();
    expect(s.maxLevelReached).toBe(1);
    expect(s.highScores).toEqual([]);
    expect(s.selector).toBe(9); // max(9, 1)
  });

  it('copies the injected save (no aliasing of app-owned arrays)', () => {
    const save = {
      maxLevelReached: 4,
      highScores: [{ initials: 'ZZZ', score: 100, level: 2 }],
    };
    const sim = createSim(makeLiveConfig(), 1, save);
    expect(sim.getState().highScores).toEqual(save.highScores);
    expect(sim.getState().highScores).not.toBe(save.highScores);
    expect(sim.getState().highScores[0]).not.toBe(save.highScores[0]);
  });

  it('same seed + same inputs → identical hashes (determinism)', () => {
    const cfg = makeLiveConfig();
    const a = createSim(cfg, 12345);
    const b = createSim(makeLiveConfig(), 12345);
    expect(a.hash()).toBe(b.hash());
    const script = [
      makeInput({ confirm: true }),
      makeInput(),
      makeInput({ confirm: true }),
      makeInput({ move: 0.3, fire: true }),
      makeInput({ move: -0.2 }),
    ];
    for (const input of script) {
      a.tick(input);
      b.tick(input);
      expect(a.hash()).toBe(b.hash());
    }
  });

  it('hash changes when state changes', () => {
    const sim = createSim(makeLiveConfig(), 7);
    const before = sim.hash();
    sim.tick(makeInput({ confirm: true })); // TITLE → LEVEL_SELECT
    expect(sim.hash()).not.toBe(before);
  });

  it('different seeds → different hashes (rng state is hashed)', () => {
    const a = createSim(makeLiveConfig(), 1);
    const b = createSim(makeLiveConfig(), 2);
    expect(a.hash()).not.toBe(b.hash());
  });
});

describe('createSimFromState (§12.6 bench entry)', () => {
  it('wraps a caller-supplied state without re-validating or resetting it', () => {
    const cfg = makeLiveConfig();
    const donor = createSim(cfg, 3);
    const s = donor.getState() as SimState;
    s.score = 777;
    const sim = createSimFromState(s, cfg, true);
    expect(sim.getState().score).toBe(777);
    expect(sim.hash()).toBe(donor.hash());
    sim.tick(makeInput());
    expect(sim.getState()).toBe(s); // same object, ticked in place
  });
});
