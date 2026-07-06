// A sim forced into PLAYING at a chosen level, for combat-behavior tests.
// Level picks geometry: level 1 = closed circle, level 9 = open flat
// ((N−1) mod 16). No enemies spawn on their own unless ticked past
// spawnTimer with budget present.

import { createSim, type Sim, type SimState } from '../../sim/sim';
import { beginLevel, enterPlaying } from '../../sim/state';
import type { GameConfig } from '../../sim/config';

export function playingSim(
  cfg: GameConfig,
  level: number,
  seed = 1,
): { sim: Sim; s: SimState } {
  const sim = createSim(cfg, seed);
  const s = sim.getState() as SimState;
  s.lives = cfg.tuning.startingLives;
  s.score = 0;
  s.livesGranted = 0;
  beginLevel(s, level, cfg);
  enterPlaying(s, cfg);
  return { sim, s };
}
