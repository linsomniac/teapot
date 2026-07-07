// Superzapper (§5): two uses per level, FULL(2) → PARTIAL(1) → EMPTY(0).
// Use 1 destroys ALL on-well enemies; use 2 destroys the one nearest the
// rim. Kills award no points and Tankers do NOT split (this path never
// touches killEnemyByShot). Enemy shots and spikes are unaffected. State
// resets to FULL at level start (beginLevel) and persists as-is through
// death (resolveDeath leaves it alone).
//
// snapshot.zap arrives ONE TICK PER PRESS (the input layer edge-triggers
// it, Task 10.1) — a held key never drains both uses.

import type { SimEvent } from './types';
import type { SimState } from './state';
import { occupancyLane } from './enemies/flipper';

export function activateSuperzapper(s: SimState, events: SimEvent[]): void {
  if (s.superzapper === 0) {
    return; // EMPTY: further presses have no effect
  }

  if (s.superzapper === 2) {
    // FULL → PARTIAL: everything on the well dies (no splits, 0 points).
    for (const e of s.enemies) {
      events.push({
        type: 'enemyKilled',
        kind: e.kind,
        lane: occupancyLane(e, s.closed),
        depth: e.depth,
      });
    }
    s.enemies = [];
    s.superzapper = 1;
  } else {
    // PARTIAL → EMPTY: the most imminent threat dies — smallest depth,
    // ties broken by LOWEST lane index (mid-flip: its occupancy-half lane).
    let best: (typeof s.enemies)[number] | null = null;
    for (const e of s.enemies) {
      if (
        best === null ||
        e.depth < best.depth ||
        (e.depth === best.depth &&
          occupancyLane(e, s.closed) < occupancyLane(best, s.closed))
      ) {
        best = e;
      }
    }
    if (best !== null) {
      events.push({
        type: 'enemyKilled',
        kind: best.kind,
        lane: occupancyLane(best, s.closed),
        depth: best.depth,
      });
      const target = best;
      s.enemies = s.enemies.filter((e) => e !== target);
    }
    s.superzapper = 0; // an empty well still consumes the use (§5)
  }

  events.push({ type: 'superzap' });
}
