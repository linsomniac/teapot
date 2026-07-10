import { describe, expect, it } from 'vitest';
import { FROZEN_CONFIG } from './fixtures/frozenConfig';
import { makeInput } from './fixtures/input';
import { createSim, type SimState } from '../sim/sim';
import type { GameConfig } from '../sim/config';
import type { InputSnapshot, SimEvent } from '../sim/types';
import { playerLane, shortestArcDir } from '../sim/well';
import { occupancyLane } from '../sim/enemies/flipper';

// Golden replay + self-consistency (Task 12.2, §13). Runs against the
// FROZEN config snapshot — never the live data modules.
//
// The pilot is a deterministic function of (run-local counters, sim state):
// with a deterministic sim it reproduces the same input sequence every run,
// and any sim divergence still surfaces in the per-tick hash comparison.
// The run starts at level 17 (injected maxLevelReached, §8.5) so the very
// first wave exercises all five enemy kinds — the hardest determinism cases
// — and must clear ≥1 wave (a WARP→PLAYING crossing). After the first
// clear, the runner injects a near-threshold score at a FIXED point in the
// run (the §7 bonus-life RULE is fully tested in Task 3.3 — this exercises
// the EVENT deterministically), then stops fighting so the standard death →
// GAME_OVER → HIGH_SCORE_ENTRY → TITLE tail runs.

const SEED = 20260706;
const MAX_TICKS = 200_000;

// AIDEV-NOTE: golden values — re-record ONLY on an intentional, reviewed
// rule change or engine upgrade (Node pinned via .nvmrc/engines, I2/C5/C7).
const GOLDEN = {
  hash: 3130648201,
  score: 30140,
  level: 18,
  lives: 0,
  superzapper: 2,
  census: 0, // deaths returned everything to budget before the final title
  ticks: 4369, // re-recorded for Task 2 (Flipper top-edge rim arrival at
  // flipperHalfHeight — earlier rim contact reshapes the combat timeline;
  // score/level/lives/census unchanged since Flipper scoring is depth-agnostic)
};

function freshConfig(): GameConfig {
  return structuredClone(FROZEN_CONFIG);
}

interface RunResult {
  hashes: number[];
  events: SimEvent[];
  finalHash: number;
  state: Readonly<SimState>;
  ticks: number;
}

function runGolden(): RunResult {
  const cfg = freshConfig();
  const sim = createSim(cfg, SEED, { maxLevelReached: 17, highScores: [] });
  const events: SimEvent[] = [];
  const hashes: number[] = [];

  let lsTicks = 0; // LEVEL_SELECT-local clock (uiMove exercise)
  let clearedOnce = false;
  let injected = false;
  let bonusSeen = false;
  let sawWarp = false;
  let hseTicks = 0;
  let finishedAtTitle = false;
  let tick = 0;

  for (; tick < MAX_TICKS && !finishedAtTitle; tick++) {
    const s = sim.getState();
    const input: InputSnapshot = makeInput();

    switch (s.phase) {
      case 'TITLE':
        if (sawWarp && hseTicks > 0) {
          finishedAtTitle = true; // post-game title: the run is complete
        } else if (tick % 8 === 0) {
          input.confirm = true;
        }
        break;
      case 'LEVEL_SELECT':
        // Selector opens at 1 (§10); climb to the top (uiMove) so the first
        // wave starts at the injected max level (all five enemy kinds), then
        // start. 200 up-held ticks clears the rate-limited climb to 17.
        if (lsTicks < 200) input.move = 0.45;
        else if (lsTicks === 206) input.confirm = true;
        lsTicks++;
        break;
      case 'PLAYING': {
        if (clearedOnce && !injected) {
          // Fixed-point score injection (see header comment).
          (s as SimState).score = cfg.scoring.bonusLifeInterval - 10;
          injected = true;
        }
        const fighting = !clearedOnce || (injected && !bonusSeen);
        if (fighting) {
          pilotCombat(s, input);
        }
        // else: stand down and let the wave end the run (3 deaths).
        break;
      }
      case 'HIGH_SCORE_ENTRY':
        if (hseTicks % 10 === 4) input.confirm = true;
        else if (hseTicks % 10 < 3) input.move = 0.45; // rotate letters (uiMove)
        hseTicks++;
        break;
      default:
        break; // GET_READY / WARP / GAME_OVER: no inputs
    }

    const r = sim.tick(input);
    for (const ev of r.events) {
      events.push(ev);
      if (ev.type === 'warpStart') sawWarp = true;
      if (ev.type === 'bonusLife') bonusSeen = true;
    }
    if (sawWarp && sim.getState().phase === 'PLAYING') clearedOnce = true;
    hashes.push(sim.hash());
  }

  return {
    hashes,
    events,
    finalHash: sim.hash(),
    state: sim.getState(),
    ticks: tick,
  };
}

// Deterministic combat: hold fire, chase the nearest-to-rim enemy's lane,
// step off electrified/occupied own lanes, zap when swamped.
function pilotCombat(s: Readonly<SimState>, input: InputSnapshot): void {
  input.fire = true;
  const pl = playerLane(s.rimPos, s.closed);
  let target: number | null = null;
  let bestDepth = Infinity;
  let threats = 0;
  let dangerOnLane = false;
  for (const e of s.enemies) {
    if (e.kind !== 'spiker') threats++;
    const lane = occupancyLane(e, s.closed);
    if (
      e.depth < bestDepth ||
      (e.depth === bestDepth && lane < (target ?? 99))
    ) {
      bestDepth = e.depth;
      target = lane;
    }
    if (e.depth <= 0 && lane === pl) dangerOnLane = true;
    if (e.kind === 'pulsar' && e.pulseJoined === true && e.lane === pl) {
      dangerOnLane = true;
    }
  }
  if (dangerOnLane) {
    input.move = 0.45; // step away from imminent rim contact / pulse
  } else if (target !== null && target !== pl) {
    input.move = shortestArcDir(pl, target, s.closed) * 0.4;
  }
  // One deterministic Superzapper use per run, the first time the well
  // holds 4+ threats — guarantees the superzap event in the golden stream.
  input.zap = threats >= 4 && s.superzapper === 2;
}

describe('golden replay (§13)', () => {
  it('replays the frozen run to the exact recorded outcome', () => {
    const r = runGolden();
    expect(r.ticks).toBeLessThan(MAX_TICKS); // the run actually finished
    expect(r.state.phase).toBe('TITLE');
    expect({
      hash: r.finalHash,
      score: r.state.score,
      level: r.state.level,
      lives: r.state.lives,
      superzapper: r.state.superzapper,
      census: r.state.enemies.length,
      ticks: r.ticks,
    }).toEqual(GOLDEN);
  });

  it('crosses WARP→PLAYING (the multi-level golden requirement)', () => {
    const r = runGolden();
    expect(r.events.some((ev) => ev.type === 'warpStart')).toBe(true);
    expect(r.state.level).toBeGreaterThanOrEqual(18);
  });

  it('emits every SimEvent type at its trigger (§13 emission coverage)', () => {
    const r = runGolden();
    const seen = new Set(r.events.map((ev) => ev.type));
    const expected = [
      'playerShot',
      'enemyShot',
      'enemyKilled',
      'playerDied',
      'flip',
      'superzap',
      'spikeHit',
      'pulseTelegraph',
      'bonusLife',
      'warpStart',
      'uiMove',
      'uiConfirm',
      'highScoreJingle',
    ] as const;
    for (const type of expected) {
      expect(seen.has(type), type).toBe(true);
    }
  });

  it('self-consistency: two runs produce identical per-tick hashes', () => {
    const a = runGolden();
    const b = runGolden();
    expect(a.hashes.length).toBe(b.hashes.length);
    for (let i = 0; i < a.hashes.length; i++) {
      if (a.hashes[i] !== b.hashes[i]) {
        expect.fail(`hash divergence at tick ${i}`);
      }
    }
    expect(a.events.length).toBe(b.events.length);
  });
});
