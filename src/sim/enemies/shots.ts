// Shared shot advance (§5/§6.6): moves each shot one tick along its lane and
// records prevDepth for swept collision (§6.7) and render interpolation.

import { TICK_SEC } from '../types';
import type { Shot } from '../types';

export function advanceShots(shots: Shot[], speed: number, dir: 1 | -1): void {
  for (const sh of shots) {
    sh.prevDepth = sh.depth;
    sh.depth += dir * speed * TICK_SEC;
  }
}
