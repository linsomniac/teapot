import { describe, expect, it } from 'vitest';
import {
  validateConfig,
  type DifficultyAnchor,
  type GameConfig,
  type Geometry,
} from './config';
import { DIFFICULTY, INTRO_LEVEL } from './data/difficulty';
import { TUNING } from './data/tuning';
import { SCORING } from './data/scoring';

// Placeholder geometries: real wells are authored in Task 1.5; validateConfig
// only counts them (structural validation is Task 1.5's validateGeometry).
function placeholderGeometries(): Geometry[] {
  return Array.from({ length: 16 }, (_, index) => ({
    index,
    closed: index < 8,
    rim: [],
    vanishing: { x: 0, y: 0 },
  }));
}

function makeConfig(): GameConfig {
  return {
    geometries: placeholderGeometries(),
    difficulty: DIFFICULTY.map((a) => ({ ...a })),
    tuning: {
      ...TUNING,
      climbMul: { ...TUNING.climbMul },
      fuseballJitter: { ...TUNING.fuseballJitter },
      fuseballDescentRange: { ...TUNING.fuseballDescentRange },
      halfExtents: { ...TUNING.halfExtents },
    },
    scoring: { ...SCORING, fuseballBands: [...SCORING.fuseballBands] },
  };
}

describe('validateConfig (§13 tuning-constraint guards, anchor half)', () => {
  it('accepts the live data modules (with placeholder geometries)', () => {
    expect(() => validateConfig(makeConfig())).not.toThrow();
  });

  it('rejects geometry count ≠ 16', () => {
    const c = makeConfig();
    c.geometries = c.geometries.slice(0, 15);
    expect(() => validateConfig(c)).toThrow(/16 geometries/);
  });

  it('rejects difficulty anchors not sorted by level', () => {
    const c = makeConfig();
    const [a, b] = [c.difficulty[0]!, c.difficulty[1]!];
    c.difficulty[0] = b;
    c.difficulty[1] = a;
    expect(() => validateConfig(c)).toThrow(/not sorted/);
  });

  it('rejects an empty anchor table', () => {
    const c = makeConfig();
    c.difficulty = [];
    expect(() => validateConfig(c)).toThrow(/empty/);
  });

  it('rejects perTickClamp ≥ 0.5 (lane crossings must never be skipped)', () => {
    const c = makeConfig();
    c.tuning.perTickClamp = 0.5;
    expect(() => validateConfig(c)).toThrow(/perTickClamp/);
  });

  it('rejects a non-positive player explosion duration', () => {
    const c = makeConfig();
    c.tuning.playerExplosionDuration = 0;
    expect(() => validateConfig(c)).toThrow(/playerExplosionDuration/);
  });

  it('rejects flipInt < 2·flipAnimTime at any anchor', () => {
    const c = makeConfig();
    c.difficulty[c.difficulty.length - 1]!.flipInt =
      2 * c.tuning.flipAnimTime - 0.01;
    expect(() => validateConfig(c)).toThrow(/flipInt/);
  });

  it('rejects pulse < telegraph + pulseDuration at any anchor', () => {
    const c = makeConfig();
    const withPulse = c.difficulty.find((a) => a.pulse !== null)!;
    withPulse.pulse = c.tuning.pulseTelegraph + c.tuning.pulseDuration - 0.01;
    expect(() => validateConfig(c)).toThrow(/pulse/);
  });

  it('ignores the pulse guard on "—" (null) cells', () => {
    const c = makeConfig();
    // Live table has nulls before Pulsar intro; already validated in accept
    // test — here assert nulls exist so that path is genuinely exercised.
    expect(c.difficulty.some((a) => a.pulse === null)).toBe(true);
    expect(c.difficulty.some((a) => a.spikeH === null)).toBe(true);
  });
});

describe('live data modules (§8.2/§8.3/§7 structure)', () => {
  it('difficulty table has the 10 anchor rows in level order', () => {
    expect(DIFFICULTY.map((a) => a.level)).toEqual([
      1, 4, 8, 11, 17, 24, 32, 48, 64, 96,
    ]);
  });

  it('"—" cells appear exactly before each enemy intro (spikeH < 4, pulse < 17)', () => {
    for (const a of DIFFICULTY) {
      expect(a.spikeH === null).toBe(a.level < INTRO_LEVEL.spiker);
      expect(a.pulse === null).toBe(a.level < INTRO_LEVEL.pulsar);
    }
  });

  it('budgets are 0 at anchors before each enemy intro level', () => {
    for (const a of DIFFICULTY) {
      if (a.level < INTRO_LEVEL.tanker) expect(a.tanker).toBe(0);
      if (a.level < INTRO_LEVEL.spiker) expect(a.spiker).toBe(0);
      if (a.level < INTRO_LEVEL.fuseball) expect(a.fuseball).toBe(0);
      if (a.level < INTRO_LEVEL.pulsar) expect(a.pulsar).toBe(0);
      expect(a.flipper).toBeGreaterThan(0); // Flippers from level 1
    }
  });

  it('anchor columns are typed/shaped as §8.2 requires', () => {
    const intCols: (keyof DifficultyAnchor)[] = [
      'flipper',
      'tanker',
      'spiker',
      'fuseball',
      'pulsar',
      'maxOnWell',
      'maxShots',
    ];
    for (const a of DIFFICULTY) {
      for (const col of intCols) {
        expect(Number.isInteger(a[col])).toBe(true);
      }
      expect(a.climb).toBeGreaterThan(0);
      expect(a.spawnInt).toBeGreaterThan(0);
    }
  });

  it('scoring: fuseball bands ascend toward the rim; economy constants present', () => {
    const [far, mid, near] = SCORING.fuseballBands;
    expect(far).toBeLessThan(mid);
    expect(mid).toBeLessThan(near);
    expect(SCORING.enemyShot).toBe(0);
    expect(SCORING.superzap).toBe(0);
    expect(SCORING.bonusLifeInterval).toBeGreaterThan(0);
    expect(SCORING.clearBonusCapLevel).toBe(
      DIFFICULTY[DIFFICULTY.length - 1]!.level,
    );
  });

  it('tuning: per-kind climb multipliers cover all five kinds', () => {
    expect(Object.keys(TUNING.climbMul).sort()).toEqual([
      'flipper',
      'fuseball',
      'pulsar',
      'spiker',
      'tanker',
    ]);
    expect(TUNING.fuseballDescentRange.min).toBeLessThan(
      TUNING.fuseballDescentRange.max,
    );
    expect(TUNING.fuseballJitter.min).toBeLessThan(TUNING.fuseballJitter.max);
  });
});
