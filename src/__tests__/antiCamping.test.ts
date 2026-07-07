import { describe, expect, it } from 'vitest';
import { createSim, type SimState } from '../sim/sim';
import { beginLevel, enterPlaying } from '../sim/state';
import { makeLiveConfig } from './fixtures/liveConfig';
import { makeInput } from './fixtures/input';

// Anti-camping (Task 12.5, §13/D39/D44): stationary hold-fire lane-camping
// must NOT be a viable strategy — the flipSeekBias random fraction sends
// enemies to the rim on other lanes, and rim chases + D40's fire-interval
// floor make the camp lethal. Runs against the LIVE tuning: retuning
// flipSeekBias/fireInterval must keep this green.
//
// Seeds are the fixed integers 1..10 — not hand-picked.

const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
const MAX_TICKS = 120 * 60; // 120 s hard bound
const MEDIAN_BOUND_TICKS = 60 * 60; // median time-to-death < 60 s

interface CampResult {
  deathTick: number | null; // first playerDied
  clearedBeforeDeath: boolean;
}

function campRun(
  level: number,
  seed: number,
  campEndLane: boolean,
): CampResult {
  const cfg = makeLiveConfig();
  const sim = createSim(cfg, seed);
  const s = sim.getState() as SimState;
  s.lives = 3;
  s.score = 0;
  s.livesGranted = 0;
  beginLevel(s, level, cfg);
  enterPlaying(s, cfg);

  let cleared = false;
  for (let tick = 0; tick < MAX_TICKS; tick++) {
    // Walk to the open well's end lane first (if requested), then camp:
    // stationary + hold fire.
    const walking = campEndLane && s.rimPos > 0;
    const input = makeInput({ move: walking ? -0.45 : 0, fire: true });
    const { events } = sim.tick(input);
    for (const ev of events) {
      if (ev.type === 'warpStart') cleared = true;
      if (ev.type === 'playerDied') {
        return { deathTick: tick, clearedBeforeDeath: cleared };
      }
    }
  }
  return { deathTick: null, clearedBeforeDeath: cleared };
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)]!;
}

function assertCampFails(
  level: number,
  campEndLane: boolean,
  label: string,
): void {
  const deaths: number[] = [];
  for (const seed of SEEDS) {
    const r = campRun(level, seed, campEndLane);
    expect(
      r.deathTick,
      `${label} seed ${seed}: must die within 120 s`,
    ).not.toBeNull();
    expect(
      r.clearedBeforeDeath,
      `${label} seed ${seed}: camping must not clear the wave`,
    ).toBe(false);
    deaths.push(r.deathTick!);
  }
  expect(median(deaths), `${label}: median time-to-death (ticks)`).toBeLessThan(
    MEDIAN_BOUND_TICKS,
  );
}

describe('anti-camping (§13/D39/D44)', () => {
  it('mid-rim camping on the closed level-1 well dies fast, never clears', () => {
    assertCampFails(1, false, 'closed/mid-rim');
  });

  it('end-lane camping on the open level-9 well dies fast, never clears', () => {
    assertCampFails(9, true, 'open/end-lane');
  });
});
