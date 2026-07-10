// GameConfig assembly types + validation (§7/§8.2/§8.3, I4).
// The sim is ALWAYS constructed from an injected GameConfig — never by
// importing the live data modules directly (§12.2, D41).

import type { EnemyKind } from './types';

export interface Vec2 {
  x: number;
  y: number;
}

export interface Geometry {
  index: number;
  closed: boolean;
  rim: Vec2[];
  vanishing: Vec2;
}

// §8.2 columns. Per-type budget fields use the full EnemyKind names so they
// line up 1:1 with SimState.budget (Record<EnemyKind>) and pointsForKill —
// no abbreviation mapping. spikeH/pulse are null for the "—" cells (before
// the enemy's intro level); paramsForLevel (Task 2.3) normalizes null to the
// column's first defined value (I15).
export interface DifficultyAnchor {
  level: number;
  flipper: number;
  tanker: number;
  spiker: number;
  fuseball: number;
  pulsar: number;
  maxOnWell: number;
  climb: number;
  flipInt: number;
  fireInt: number;
  maxShots: number;
  eshot: number;
  spikeH: number | null;
  pulse: number | null;
  spawnInt: number;
}

// Every §8.3 constant, concrete.
export interface Tuning {
  rimSpeed: number;
  mouseSensitivity: number;
  perTickClamp: number;
  shotSpeed: number;
  flipAnimTime: number;
  flipperHalfHeight: number; // bowtie half-length ALONG the lane, in depth units:
  // the rim arrival depth (top corners touch depth 0 when center ≤ this — §5(b))
  rimFlipFactor: number; // 0.5 (rimFlipInterval = ·flipInt)
  climbMul: Record<EnemyKind, number>;
  fuseballRimSpeed: number;
  fuseballRimTime: number;
  fuseballJitter: { min: number; max: number; redrawInterval: number }; // 0.3, 1.5, 0.5
  fuseballDescentRange: { min: number; max: number }; // 0.6, 1.0
  pulseDuration: number;
  pulseTelegraph: number;
  pulsarReversalDepth: number;
  minFireDepth: number;
  spikeTrimDepth: number; // 0.08 (depth per trim)
  descentSpeed: number;
  halfExtents: {
    enemy: number;
    shot: number;
    spikeTop: number;
    blaster: number;
  };
  startingLives: number;
  getReadyDuration: number;
  gameOverBeat: number;
  flipSeekBias: number;
  uiStepInterval: number;
  particlePoolCap: number; // render-side max live particles (bench census, §12.6)
}

export interface Scoring {
  flipper: number;
  tanker: number;
  spiker: number;
  fuseballBands: [number, number, number]; // by kill depth [far >2/3, mid 1/3–2/3, near <1/3]
  pulsar: number;
  enemyShot: number;
  spikeTrimPoints: number; // POINTS per trim (=1); distinct from tuning.spikeTrimDepth (=0.08 depth)
  superzap: number;
  clearBonusPerLevel: number;
  clearBonusCapLevel: number;
  bonusLifeInterval: number; // economy constants live here only (no dup in Tuning)
}

export interface GameConfig {
  geometries: Geometry[];
  difficulty: DifficultyAnchor[];
  tuning: Tuning;
  scoring: Scoring;
}

// AIDEV-NOTE: §13 "tuning-constraint guards" (anchor-level half; the
// interpolated-table guard lives in difficultyCurve, Task 2.3). Throws on the
// first violation with a message naming the constraint and value.
export function validateConfig(c: GameConfig): void {
  const { geometries, difficulty, tuning } = c;

  if (geometries.length !== 16) {
    throw new Error(`config: expected 16 geometries, got ${geometries.length}`);
  }

  if (difficulty.length === 0) {
    throw new Error('config: difficulty anchor table is empty');
  }
  for (let i = 1; i < difficulty.length; i++) {
    const prev = difficulty[i - 1]!;
    const curr = difficulty[i]!;
    if (curr.level <= prev.level) {
      throw new Error(
        `config: difficulty anchors not sorted by level (${prev.level} then ${curr.level})`,
      );
    }
  }

  // perTickClamp < 0.5 so lane crossings are never skipped (§4/§8.3).
  if (!(tuning.perTickClamp < 0.5)) {
    throw new Error(
      `config: perTickClamp must stay < 0.5 lanes/tick, got ${tuning.perTickClamp}`,
    );
  }

  for (const a of difficulty) {
    // FlipInt ≥ 2·flipAnimTime so a flip completes before the next is due (§8.2).
    if (!(a.flipInt >= 2 * tuning.flipAnimTime)) {
      throw new Error(
        `config: anchor level ${a.level}: flipInt (${a.flipInt}) must be ` +
          `≥ 2·flipAnimTime (${2 * tuning.flipAnimTime})`,
      );
    }
    // Pulse cycle ≥ telegraph + pulseDuration so the quiet phase never goes
    // negative (§8.3).
    if (
      a.pulse !== null &&
      !(a.pulse >= tuning.pulseTelegraph + tuning.pulseDuration)
    ) {
      throw new Error(
        `config: anchor level ${a.level}: pulse (${a.pulse}) must be ` +
          `≥ telegraph + pulseDuration (${tuning.pulseTelegraph + tuning.pulseDuration})`,
      );
    }
  }
}
