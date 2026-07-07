import { describe, expect, it } from 'vitest';
import {
  createSim,
  createSimFromState,
  type Sim,
  type SimState,
} from '../sim/sim';
import { beginLevel, enterPlaying } from '../sim/state';
import { makeRng } from '../sim/rng';
import { paramsForLevel } from '../sim/difficultyCurve';
import { makeFlipper } from '../sim/enemies/flipper';
import { makePulsar } from '../sim/enemies/pulsar';
import type { Enemy } from '../sim/types';
import { makeLiveConfig } from './fixtures/liveConfig';
import { makeInput } from './fixtures/input';

// benchMode census-hold (Task 12.3, §12.6): the perf gate depends on the
// player being invulnerable and nothing despawning/completing while the
// bench holds its pinned census.

const cfg = makeLiveConfig();
const CENSUS = 24;

function lethalCensusState(benchSeed: number): SimState {
  const s = createSim(cfg, benchSeed).getState() as SimState;
  const lp = paramsForLevel(17, cfg.difficulty);
  s.lives = 3;
  beginLevel(s, 17, cfg);
  enterPlaying(s, cfg);
  s.budget = { flipper: 0, tanker: 0, spiker: 0, fuseball: 0, pulsar: 0 };
  const rng = makeRng(99);
  const enemies: Enemy[] = [];
  // A pulse ON the player's lane (lane 8) — lethal on the first pulse tick.
  enemies.push({
    ...makePulsar(8, lp, rng),
    depth: 0.5,
    prevDepth: 0.5,
    pulseJoined: true,
    flipTimer: 100,
  });
  while (enemies.length < CENSUS) {
    enemies.push({
      ...makeFlipper(enemies.length % 16, lp, rng),
      depth: 0.4 + (enemies.length % 5) * 0.1,
      flipTimer: 100,
      fireTimer: 100,
    });
  }
  s.enemies = enemies;
  // Clock inside the pulse window: lethality is immediate.
  s.pulseClock = lp.pulse - cfg.tuning.pulseDuration / 2;
  return s;
}

function runTicks(sim: Sim, n: number): { diedEvents: number } {
  let diedEvents = 0;
  for (let i = 0; i < n; i++) {
    const { events } = sim.tick(makeInput());
    diedEvents += events.filter((ev) => ev.type === 'playerDied').length;
  }
  return { diedEvents };
}

describe('benchMode census-hold (§12.6)', () => {
  it('holds lives, phase, and the pinned enemy count through lethal conditions', () => {
    const s = lethalCensusState(1);
    const sim = createSimFromState(s, cfg, true); // benchMode
    for (let i = 0; i < 120; i++) {
      sim.tick(makeInput());
      expect(s.lives, `tick ${i}`).toBe(3); // invulnerable
      expect(s.phase, `tick ${i}`).toBe('PLAYING'); // no GET_READY
      expect(s.enemies.length, `tick ${i}`).toBe(CENSUS); // count held
    }
  });

  it('entities still move while the census holds (not a frozen scene)', () => {
    const s = lethalCensusState(2);
    const sim = createSimFromState(s, cfg, true);
    const depthsBefore = s.enemies.map((e) => e.depth);
    runTicks(sim, 30);
    const moved = s.enemies.filter((e, i) => e.depth !== depthsBefore[i]);
    expect(moved.length).toBeGreaterThan(CENSUS / 2);
  });

  it('control: the identical state with benchMode=false kills the player', () => {
    const s = lethalCensusState(1);
    const sim = createSimFromState(s, cfg, false);
    const { diedEvents } = runTicks(sim, 120);
    expect(diedEvents).toBeGreaterThan(0);
    expect(s.lives).toBeLessThan(3);
  });
});
