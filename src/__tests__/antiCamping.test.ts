import { describe, expect, it } from 'vitest';
import { createSim, type SimState } from '../sim/sim';
import { beginLevel, enterPlaying } from '../sim/state';
import { makeLiveConfig } from './fixtures/liveConfig';
import { makeInput } from './fixtures/input';

// Anti-camping (Task 12.5, §13/D39/D44/D46): stationary hold-fire lane-camping
// must remain risky — the flipSeekBias random fraction sends enemies to the
// rim on other lanes, where rim chases and contact geometry cost campers lives.
// The user-directed two-tick fire cadence makes the old every-seed/no-clear
// guarantee invalid, so this live-tuning gate now requires consistent deaths
// and multiple stopped clears on both topologies.
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

function assertCampIsRisky(
  level: number,
  campEndLane: boolean,
  label: string,
): void {
  const runs = SEEDS.map((seed) => campRun(level, seed, campEndLane));
  const deaths = runs.flatMap((run) =>
    run.deathTick === null ? [] : [run.deathTick],
  );
  const stoppedClears = runs.filter(
    (run) => run.deathTick !== null && !run.clearedBeforeDeath,
  ).length;

  expect(deaths.length, `${label}: deaths within 120 s`).toBeGreaterThanOrEqual(
    9,
  );
  expect(
    stoppedClears,
    `${label}: runs killed before clearing`,
  ).toBeGreaterThanOrEqual(3);
  expect(median(deaths), `${label}: median time-to-death (ticks)`).toBeLessThan(
    MEDIAN_BOUND_TICKS,
  );
}

describe('anti-camping (§13/D39/D44)', () => {
  it('mid-rim camping on the closed level-1 well is consistently risky', () => {
    assertCampIsRisky(1, false, 'closed/mid-rim');
  });

  it('end-lane camping on the open level-9 well is consistently risky', () => {
    assertCampIsRisky(9, true, 'open/end-lane');
  });
});
