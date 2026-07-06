// Difficulty interpolation (§8.1): one deterministic function of level N
// producing the resolved per-level parameters from the §8.2 anchor table.

import type { DifficultyAnchor } from './config';
import type { EnemyKind } from './types';

// Enemy introduction levels (§8.1, spec canon — structure, not tuning):
// per-type budgets are forced to 0 before that enemy's introduction level.
export const INTRO_LEVEL: Record<EnemyKind, number> = Object.freeze({
  flipper: 1,
  tanker: 3,
  spiker: 4,
  fuseball: 11,
  pulsar: 17,
});

export interface LevelParams {
  // one resolved value per §8.2 column
  flipper: number; // per-type spawn budgets
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
  spikeH: number;
  pulse: number;
  spawnInt: number;
}

// Integer columns round half-up (floor(x+0.5), matching §4); the rest stay
// fractional.
const INT_COLS = [
  'flipper',
  'tanker',
  'spiker',
  'fuseball',
  'pulsar',
  'maxOnWell',
  'maxShots',
] as const;

const NULLABLE_COLS = ['spikeH', 'pulse'] as const;
type NullableCol = (typeof NULLABLE_COLS)[number];

const PLAIN_COLS = [
  'climb',
  'flipInt',
  'fireInt',
  'eshot',
  'spawnInt',
] as const;

function roundHalfUp(x: number): number {
  return Math.floor(x + 0.5);
}

// A "—" (null) cell is treated as the column's first defined value for
// interpolation purposes (§8.1/I15) — the parameter is unused below the
// enemy's introduction level anyway.
function firstDefined(anchors: DifficultyAnchor[], col: NullableCol): number {
  for (const a of anchors) {
    const v = a[col];
    if (v !== null) return v;
  }
  return 0; // column never defined: unused everywhere
}

export function paramsForLevel(
  level: number,
  anchors: DifficultyAnchor[],
): LevelParams {
  const first = anchors[0]!;
  const last = anchors[anchors.length - 1]!;

  // Bracketing anchors; values held flat beyond the last anchor (the endless
  // tail) and below the first (levels start at the first anchor in practice).
  let lo = last;
  let hi = last;
  let t = 0;
  if (level <= first.level) {
    lo = first;
    hi = first;
  } else if (level < last.level) {
    for (let i = 0; i < anchors.length - 1; i++) {
      const a = anchors[i]!;
      const b = anchors[i + 1]!;
      if (level >= a.level && level <= b.level) {
        lo = a;
        hi = b;
        t = (level - a.level) / (b.level - a.level);
        break;
      }
    }
  }

  const lerp = (a: number, b: number): number => a + (b - a) * t;

  const p = {} as LevelParams;
  for (const col of PLAIN_COLS) {
    p[col] = lerp(lo[col], hi[col]);
  }
  for (const col of INT_COLS) {
    p[col] = roundHalfUp(lerp(lo[col], hi[col]));
  }
  for (const col of NULLABLE_COLS) {
    const fd = firstDefined(anchors, col);
    p[col] = lerp(lo[col] ?? fd, hi[col] ?? fd);
  }

  // Budgets forced to 0 before the enemy's introduction level (§8.1).
  for (const kind of Object.keys(INTRO_LEVEL) as EnemyKind[]) {
    if (level < INTRO_LEVEL[kind]) p[kind] = 0;
  }

  return p;
}
