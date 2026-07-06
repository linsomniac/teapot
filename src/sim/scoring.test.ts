import { describe, expect, it } from 'vitest';
import { applyScore, levelClearBonus, pointsForKill } from './scoring';
import { createSim, type SimState } from './sim';
import { makeLiveConfig } from '../__tests__/fixtures/liveConfig';
import type { SimEvent } from './types';

// §13 scoring area (Task 3.3). Expected values derive from the injected
// Scoring config, per the §13 test-value policy.

const cfg = makeLiveConfig();
const sc = cfg.scoring;

function freshState(): SimState {
  const s = createSim(cfg, 1).getState() as SimState;
  s.score = 0;
  s.lives = cfg.tuning.startingLives;
  s.livesGranted = 0;
  return s;
}

describe('pointsForKill (§7)', () => {
  it('scores each kind from the config table', () => {
    expect(pointsForKill('flipper', 0.5, sc)).toBe(sc.flipper);
    expect(pointsForKill('tanker', 0.5, sc)).toBe(sc.tanker);
    expect(pointsForKill('spiker', 0.5, sc)).toBe(sc.spiker);
    expect(pointsForKill('pulsar', 0.5, sc)).toBe(sc.pulsar);
  });

  it('fuseball bands by kill depth with pinned 1/3 and 2/3 boundaries', () => {
    const [far, mid, near] = sc.fuseballBands;
    expect(pointsForKill('fuseball', 0, sc)).toBe(near);
    expect(pointsForKill('fuseball', 1 / 3 - 1e-9, sc)).toBe(near); // < 1/3 → 750
    expect(pointsForKill('fuseball', 1 / 3, sc)).toBe(mid); // exactly 1/3 → 500
    expect(pointsForKill('fuseball', 0.5, sc)).toBe(mid);
    expect(pointsForKill('fuseball', 2 / 3, sc)).toBe(mid); // exactly 2/3 → 500
    expect(pointsForKill('fuseball', 2 / 3 + 1e-9, sc)).toBe(far); // > 2/3 → 250
    expect(pointsForKill('fuseball', 1, sc)).toBe(far);
  });
});

describe('levelClearBonus (§7)', () => {
  it('is clearBonusPerLevel × level below the cap', () => {
    expect(levelClearBonus(1, sc)).toBe(sc.clearBonusPerLevel);
    expect(levelClearBonus(5, sc)).toBe(5 * sc.clearBonusPerLevel);
  });

  it('freezes at the cap level (difficulty tail)', () => {
    const capped = sc.clearBonusPerLevel * sc.clearBonusCapLevel;
    expect(levelClearBonus(sc.clearBonusCapLevel, sc)).toBe(capped);
    expect(levelClearBonus(sc.clearBonusCapLevel + 1, sc)).toBe(capped);
    expect(levelClearBonus(500, sc)).toBe(capped);
  });
});

describe('applyScore + bonus-life rule (§6/§7)', () => {
  const interval = sc.bonusLifeInterval;

  it('adds points and grants a life when a threshold is crossed', () => {
    const s = freshState();
    const events: SimEvent[] = [];
    applyScore(s, interval - 50, cfg, false, events);
    expect(s.lives).toBe(cfg.tuning.startingLives);
    expect(events).toHaveLength(0);
    applyScore(s, 100, cfg, false, events); // crosses the interval
    expect(s.lives).toBe(cfg.tuning.startingLives + 1);
    expect(s.livesGranted).toBe(1);
    expect(events).toContainEqual({ type: 'bonusLife' });
  });

  it('grants floor(score/interval) − livesGranted (no double grants)', () => {
    const s = freshState();
    const events: SimEvent[] = [];
    applyScore(s, interval + 10, cfg, false, events);
    expect(s.lives).toBe(cfg.tuning.startingLives + 1);
    applyScore(s, 10, cfg, false, events); // same interval — nothing new owed
    applyScore(s, 10, cfg, false, events);
    expect(s.lives).toBe(cfg.tuning.startingLives + 1);
    expect(s.livesGranted).toBe(1);
  });

  it('a single gain crossing two thresholds grants two lives', () => {
    const s = freshState();
    const events: SimEvent[] = [];
    applyScore(s, 2 * interval, cfg, false, events);
    expect(s.lives).toBe(cfg.tuning.startingLives + 2);
    expect(s.livesGranted).toBe(2);
    expect(events.filter((e) => e.type === 'bonusLife')).toHaveLength(2);
  });

  it('a threshold crossed on a death tick nets zero — now AND later', () => {
    const s = freshState();
    const events: SimEvent[] = [];
    s.score = interval - 100;
    // Death tick: kill points cross the threshold but the player died.
    applyScore(s, 200, cfg, true, events);
    expect(s.lives).toBe(cfg.tuning.startingLives); // unchanged on the death tick
    expect(events.filter((e) => e.type === 'bonusLife')).toHaveLength(0);
    // Following tick: no deferred grant may sneak in.
    applyScore(s, 10, cfg, false, events);
    expect(s.lives).toBe(cfg.tuning.startingLives);
    expect(events.filter((e) => e.type === 'bonusLife')).toHaveLength(0);
    // The NEXT threshold still works normally.
    applyScore(s, interval, cfg, false, events);
    expect(s.lives).toBe(cfg.tuning.startingLives + 1);
  });

  it('a threshold crossed by the level-clear bonus grants a life (step-8 path)', () => {
    const s = freshState();
    const events: SimEvent[] = [];
    s.score = interval - 50;
    // Step 8 is only reached when the player did NOT die this tick.
    applyScore(s, levelClearBonus(3, sc), cfg, false, events);
    expect(s.lives).toBe(cfg.tuning.startingLives + 1);
    expect(events).toContainEqual({ type: 'bonusLife' });
  });

  it('zero-point awards (Superzapper, self-split, enemy shots) change nothing', () => {
    const s = freshState();
    s.score = 12345;
    const events: SimEvent[] = [];
    applyScore(s, 0, cfg, false, events);
    expect(s.score).toBe(12345);
    expect(s.lives).toBe(cfg.tuning.startingLives);
    expect(events).toHaveLength(0);
  });
});
