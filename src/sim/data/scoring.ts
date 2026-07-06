// §7 score table (this spec's canon — inspired by, not copied from, the
// arcade tables). One data module so tuning is a one-file change.
// AIDEV-NOTE: live tuning data — exact values are asserted only by the frozen
// golden-replay fixture (§13 test-value policy). The economy invariant
// (bonusLifeInterval > max tail-wave score) is tested in Task 12.5.

import type { Scoring } from '../config';

export const SCORING: Scoring = Object.freeze({
  flipper: 150,
  tanker: 100, // by player shot; rim self-splits score 0
  spiker: 50,
  fuseballBands: [250, 500, 750] as [number, number, number], // far >2/3, mid, near <1/3
  pulsar: 200,
  enemyShot: 0,
  spikeTrimPoints: 1, // POINTS per trim; distinct from tuning.spikeTrimDepth
  superzap: 0, // Superzapper kills score nothing
  clearBonusPerLevel: 100, // × min(level, cap)
  clearBonusCapLevel: 96,
  bonusLifeInterval: 30_000,
});
