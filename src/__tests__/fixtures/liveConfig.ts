// makeLiveConfig(): the shared Phase 3+ test config, bundling the LIVE data
// modules (§13 test-value policy). Wiring tests clone it and modify a field.
// Distinct from the FROZEN snapshot (fixtures/frozenConfig.ts, Task 12.2)
// used only for exact-value golden assertions.

import type { GameConfig } from '../../sim/config';
import { GEOMETRIES } from '../../sim/data/geometries';
import { DIFFICULTY } from '../../sim/data/difficulty';
import { TUNING } from '../../sim/data/tuning';
import { SCORING } from '../../sim/data/scoring';

export function makeLiveConfig(): GameConfig {
  return structuredClone({
    geometries: GEOMETRIES as GameConfig['geometries'],
    difficulty: DIFFICULTY as GameConfig['difficulty'],
    tuning: TUNING,
    scoring: SCORING,
  });
}
