import { describe, expect, it } from 'vitest';
import {
  INTRO_LEVEL,
  paramsForLevel,
  type LevelParams,
} from './difficultyCurve';
import { DIFFICULTY } from './data/difficulty';
import { TUNING } from './data/tuning';
import type { DifficultyAnchor } from './config';

// §13 difficulty area. Test-value policy (§13): assertions derive expected
// values FROM the live table rows (structure/wiring), never from hard-coded
// spec numbers, so the suite survives playtest retuning.

const anchors = (): DifficultyAnchor[] => DIFFICULTY.map((a) => ({ ...a }));

function row(level: number): DifficultyAnchor {
  return DIFFICULTY.find((a) => a.level === level)!;
}

const INT_COLS = [
  'flipper',
  'tanker',
  'spiker',
  'fuseball',
  'pulsar',
  'maxOnWell',
  'maxShots',
] as const;

describe('paramsForLevel (§8.1)', () => {
  it('reproduces exact anchor values at anchor levels', () => {
    for (const a of DIFFICULTY) {
      const p = paramsForLevel(a.level, anchors());
      expect(p.climb).toBe(a.climb);
      expect(p.flipInt).toBe(a.flipInt);
      expect(p.fireInt).toBe(a.fireInt);
      expect(p.eshot).toBe(a.eshot);
      expect(p.spawnInt).toBe(a.spawnInt);
      expect(p.maxOnWell).toBe(a.maxOnWell);
      expect(p.maxShots).toBe(a.maxShots);
      // Budgets: anchor value unless below the intro level (then forced 0).
      for (const kind of [
        'flipper',
        'tanker',
        'spiker',
        'fuseball',
        'pulsar',
      ] as const) {
        expect(p[kind]).toBe(a.level >= INTRO_LEVEL[kind] ? a[kind] : 0);
      }
      if (a.spikeH !== null) expect(p.spikeH).toBe(a.spikeH);
      if (a.pulse !== null) expect(p.pulse).toBe(a.pulse);
    }
  });

  it('interpolates linearly between anchors (level 6, midpoint of 4 and 8)', () => {
    const p = paramsForLevel(6, anchors());
    const a = row(4);
    const b = row(8);
    expect(p.climb).toBeCloseTo((a.climb + b.climb) / 2, 12);
    expect(p.fireInt).toBeCloseTo((a.fireInt + b.fireInt) / 2, 12);
    expect(p.spawnInt).toBeCloseTo((a.spawnInt + b.spawnInt) / 2, 12);
    expect(p.spikeH).toBeCloseTo((a.spikeH! + b.spikeH!) / 2, 12);
    // Integer columns: interpolate then round half-up.
    expect(p.flipper).toBe(Math.floor((a.flipper + b.flipper) / 2 + 0.5));
    expect(p.tanker).toBe(Math.floor((a.tanker + b.tanker) / 2 + 0.5));
  });

  it('integer columns round half-up; the rest stay fractional', () => {
    // Level 6 tanker sits exactly on x.5 between anchors 4 (2) and 8 (3).
    const a = row(4);
    const b = row(8);
    expect((a.tanker + b.tanker) / 2).toBe(2.5);
    expect(paramsForLevel(6, anchors()).tanker).toBe(3); // half rounds UP
    for (let level = 1; level <= 112; level++) {
      const p = paramsForLevel(level, anchors());
      for (const col of INT_COLS) {
        expect(Number.isInteger(p[col]), `level ${level} ${col}`).toBe(true);
      }
    }
    // Fractional column keeps its interpolated value (level 6 climb = 0.13-ish).
    const p6 = paramsForLevel(6, anchors());
    expect(Number.isInteger(p6.climb)).toBe(false);
  });

  it('normalizes "—" (null) cells to the column’s first defined value', () => {
    const firstSpikeH = DIFFICULTY.find((a) => a.spikeH !== null)!;
    const firstPulse = DIFFICULTY.find((a) => a.pulse !== null)!;
    for (let level = 1; level < firstSpikeH.level; level++) {
      expect(paramsForLevel(level, anchors()).spikeH).toBe(firstSpikeH.spikeH);
    }
    for (let level = 1; level < firstPulse.level; level++) {
      expect(paramsForLevel(level, anchors()).pulse).toBe(firstPulse.pulse);
    }
  });

  it('forces budgets to 0 before each introduction level', () => {
    for (let level = 1; level <= 20; level++) {
      const p = paramsForLevel(level, anchors());
      for (const kind of [
        'flipper',
        'tanker',
        'spiker',
        'fuseball',
        'pulsar',
      ] as const) {
        if (level < INTRO_LEVEL[kind]) {
          expect(p[kind], `level ${level} ${kind}`).toBe(0);
        }
      }
    }
    // Interpolation alone would give a nonzero pulsar budget at level 16
    // (between anchors 11 and 17) — the intro gate must zero it.
    expect(paramsForLevel(16, anchors()).pulsar).toBe(0);
    expect(paramsForLevel(17, anchors()).pulsar).toBe(row(17).pulsar);
  });

  it('holds the endless tail flat beyond the last anchor', () => {
    const tail = paramsForLevel(
      DIFFICULTY[DIFFICULTY.length - 1]!.level,
      anchors(),
    );
    expect(paramsForLevel(200, anchors())).toEqual(tail);
    expect(paramsForLevel(500, anchors())).toEqual(tail);
  });

  it('difficulty is monotonic at every level step (1..200)', () => {
    const nonDecreasing: (keyof LevelParams)[] = [
      'flipper',
      'tanker',
      'spiker',
      'fuseball',
      'pulsar',
      'maxOnWell',
      'climb',
      'maxShots',
      'eshot',
      'spikeH',
    ];
    const nonIncreasing: (keyof LevelParams)[] = [
      'flipInt',
      'fireInt',
      'pulse',
      'spawnInt',
    ];
    let prev = paramsForLevel(1, anchors());
    for (let level = 2; level <= 200; level++) {
      const cur = paramsForLevel(level, anchors());
      for (const col of nonDecreasing) {
        expect(cur[col], `level ${level} ${col}`).toBeGreaterThanOrEqual(
          prev[col],
        );
      }
      for (const col of nonIncreasing) {
        expect(cur[col], `level ${level} ${col}`).toBeLessThanOrEqual(
          prev[col],
        );
      }
      prev = cur;
    }
  });

  it('interpolated rows keep the tuning constraints (§13 guard, curve half)', () => {
    for (let level = 1; level <= 200; level++) {
      const p = paramsForLevel(level, anchors());
      expect(p.flipInt, `level ${level} flipInt`).toBeGreaterThanOrEqual(
        2 * TUNING.flipAnimTime,
      );
      expect(
        0.5 * p.flipInt,
        `level ${level} rimFlipInterval`,
      ).toBeGreaterThanOrEqual(TUNING.flipAnimTime);
      expect(p.pulse, `level ${level} pulse`).toBeGreaterThanOrEqual(
        TUNING.pulseTelegraph + TUNING.pulseDuration,
      );
    }
  });
});
