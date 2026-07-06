// Spawner (§6): a spawn attempt every SpawnInt seconds of PLAYING time (the
// first one SpawnInt after entering PLAYING — enterPlaying arms the timer).
// Spawns only while the count of THREATENING on-well enemies (all kinds
// except Spikers, D32) is below MaxOnWell and budget remains. Type is drawn
// weighted by remaining budget; lane uniformly — except Spikers draw only
// from lanes without a Spiker and defer entirely if none is free.

import { TICK_SEC } from './types';
import { ENEMY_KINDS } from './types';
import type { Enemy, EnemyKind, SimEvent } from './types';
import type { GameConfig } from './config';
import type { Rng } from './rng';
import type { LevelParams } from './difficultyCurve';
import type { SimState } from './state';
import { LANES } from './well';
import { makeFlipper } from './enemies/flipper';
import { makeTanker } from './enemies/tanker';
import { makeSpiker } from './enemies/spiker';
import { makeFuseball } from './enemies/fuseball';
import { makePulsar } from './enemies/pulsar';

// Pure weighted type draw (§6): P(kind) = budget[kind] / totalBudget.
export function drawSpawnType(
  budget: Record<EnemyKind, number>,
  rng: Rng,
): EnemyKind | null {
  let total = 0;
  for (const kind of ENEMY_KINDS) total += budget[kind];
  if (total <= 0) return null;
  let r = rng.nextInt(total);
  for (const kind of ENEMY_KINDS) {
    r -= budget[kind];
    if (r < 0) return kind;
  }
  return null; // unreachable with a positive total
}

function spawnEnemy(
  kind: EnemyKind,
  lane: number,
  lp: LevelParams,
  s: SimState,
  cfg: GameConfig,
): Enemy {
  switch (kind) {
    case 'flipper':
      return makeFlipper(lane, lp, s.rng);
    case 'tanker':
      return makeTanker(lane, lp, s.rng);
    case 'spiker':
      return makeSpiker(lane, lp, s.rng);
    case 'fuseball':
      return makeFuseball(lane, cfg.tuning, s.rng);
    case 'pulsar':
      return makePulsar(lane, lp, s.rng);
  }
}

export function updateSpawner(
  s: SimState,
  lp: LevelParams,
  cfg: GameConfig,
  events: SimEvent[],
): void {
  s.spawnTimer -= TICK_SEC;
  if (s.spawnTimer > 0) return;
  s.spawnTimer = lp.spawnInt; // next attempt SpawnInt later, spawn or not

  // MaxOnWell gates spawns only; Spikers are excluded from the count (D32).
  let threatening = 0;
  for (const e of s.enemies) {
    if (e.kind !== 'spiker') threatening++;
  }
  if (threatening >= lp.maxOnWell) return;

  const kind = drawSpawnType(s.budget, s.rng);
  if (kind === null) return; // budget exhausted

  let lane: number;
  if (kind === 'spiker') {
    // At most one Spiker per lane (§6.3): draw only from free lanes; if
    // every lane holds one, DEFER the spawn (budget stays intact).
    const occupied = new Set<number>();
    for (const e of s.enemies) {
      if (e.kind === 'spiker') occupied.add(e.lane);
    }
    const free: number[] = [];
    for (let l = 0; l < LANES; l++) {
      if (!occupied.has(l)) free.push(l);
    }
    if (free.length === 0) return; // deferred to the next attempt
    lane = free[s.rng.nextInt(free.length)]!;
  } else {
    lane = s.rng.nextInt(LANES);
  }

  s.budget[kind] -= 1;
  // All make* spawn inits set prevLane=lane, prevDepth=depth — the
  // teleport-no-tween convention (§11.1).
  s.enemies.push(spawnEnemy(kind, lane, lp, s, cfg));
  void events; // no spawn SimEvent by design (§11.2 SFX list has none)
}
