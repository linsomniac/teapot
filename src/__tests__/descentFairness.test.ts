import { describe, expect, it } from 'vitest';
import type { SimState } from '../sim/sim';
import { enterWarp } from '../sim/state';
import { DIFFICULTY } from '../sim/data/difficulty';
import type { SimEvent } from '../sim/types';
import { makeLiveConfig } from './fixtures/liveConfig';
import { makeInput } from './fixtures/input';
import { playingSim } from './fixtures/playing';

// §9/§13 descent-fairness invariant: holding fire down one lane from descent
// start must fully trim a MAXIMUM-height spike before the Blaster reaches
// it. This SIMULATES the actual descent (shot transport delay included) —
// closed-form rate arithmetic is explicitly not acceptable (§9). Any §8.2/
// §8.3 retuning must keep this passing.

const cfg = makeLiveConfig();

// Worst case across ALL anchor rows: the tallest allowed spike.
const worstSpikeH = Math.max(...DIFFICULTY.map((a) => a.spikeH ?? 0));

function runDescent(fireHeld: boolean): {
  died: boolean;
  s: SimState;
  events: SimEvent[][];
} {
  const { sim, s } = playingSim(cfg, 5);
  // Maximum-height spike on the Blaster's lane (player parked on lane 8).
  s.spikes = [{ lane: 8, topDepth: 1 - worstSpikeH }];
  const events: SimEvent[][] = [];
  enterWarp(s, []); // descent start: cooldown reset, shots cleared (§9)
  let died = false;
  let guard = 0;
  while (s.phase === 'WARP' && guard++ < 1000) {
    const r = sim.tick(makeInput({ fire: fireHeld }));
    events.push(r.events);
    if (r.events.some((ev) => ev.type === 'playerDied')) died = true;
  }
  return { died, s, events };
}

describe('descent-fairness invariant (§9)', () => {
  it('scripted hold-fire fully trims a max-SpikeH spike before the Blaster arrives', () => {
    const { died, s, events } = runDescent(true);
    expect(died).toBe(false);
    expect(s.phase).toBe('PLAYING'); // clean arrival at the next level
    // The save was real work: trims actually happened along the way.
    const trims = events.flat().filter((ev) => ev.type === 'spikeHit').length;
    expect(trims).toBeGreaterThan(0);
  });

  it('control: with fire disabled, the identical descent DOES collide', () => {
    const { died } = runDescent(false);
    expect(died).toBe(true); // proves the spike was on-lane and lethal
  });

  it('the worst case is genuinely the tallest anchor value', () => {
    expect(worstSpikeH).toBeGreaterThan(0);
    for (const a of DIFFICULTY) {
      expect(a.spikeH ?? 0).toBeLessThanOrEqual(worstSpikeH);
    }
  });
});
