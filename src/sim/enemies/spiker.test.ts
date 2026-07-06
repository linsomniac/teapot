import { describe, expect, it } from 'vitest';
import { makeSpiker, trimOrKill } from './spiker';
import { makeRng } from '../rng';
import { paramsForLevel } from '../difficultyCurve';
import { TICK_SEC } from '../types';
import type { Enemy, Spike } from '../types';
import { makeLiveConfig } from '../../__tests__/fixtures/liveConfig';
import { makeInput } from '../../__tests__/fixtures/input';
import { playingSim } from '../../__tests__/fixtures/playing';

// §13 Spiker area (Task 4.3). Level 4 = Spiker intro (spikeH defined).

const cfg = makeLiveConfig();
const lp = paramsForLevel(4, cfg.difficulty);

function spikerAt(
  lane: number,
  depth: number,
  over: Partial<Enemy> = {},
): Enemy {
  return {
    ...makeSpiker(lane, lp, makeRng(7)),
    depth,
    prevDepth: depth,
    ...over,
  };
}

describe('Spiker motion (§6.3)', () => {
  it('climbs at Climb × climbMul.spiker (wiring: modified multiplier changes it)', () => {
    const { sim, s } = playingSim(cfg, 4);
    const e = spikerAt(2, 0.9);
    s.enemies = [e];
    sim.tick(makeInput());
    expect(e.depth).toBeCloseTo(
      0.9 - lp.climb * cfg.tuning.climbMul.spiker * TICK_SEC,
      12,
    );

    const modded = makeLiveConfig();
    modded.tuning.climbMul.spiker = 1.5;
    const t2 = playingSim(modded, 4);
    const e2 = spikerAt(2, 0.9);
    t2.s.enemies = [e2];
    t2.sim.tick(makeInput());
    expect(e2.depth).toBeCloseTo(0.9 - lp.climb * 1.5 * TICK_SEC, 12);
    expect(e2.depth).not.toBeCloseTo(e.depth, 12);
  });

  it('extends the lane’s spike while climbing (top follows the Spiker)', () => {
    const { sim, s } = playingSim(cfg, 4);
    const e = spikerAt(2, 0.9);
    s.enemies = [e];
    sim.tick(makeInput());
    expect(s.spikes).toHaveLength(1);
    expect(s.spikes[0]!.lane).toBe(2);
    expect(s.spikes[0]!.topDepth).toBe(e.depth);
    sim.tick(makeInput());
    expect(s.spikes[0]!.topDepth).toBe(e.depth); // keeps following
  });

  it('reverses at depth 1 − SpikeH and descends at climb speed', () => {
    const { sim, s } = playingSim(cfg, 4);
    const reversal = 1 - lp.spikeH;
    const e = spikerAt(2, reversal + 0.001);
    s.enemies = [e];
    sim.tick(makeInput()); // crosses the reversal depth
    expect(e.depth).toBe(reversal);
    expect(e.climbDir).toBe(-1);
    expect(s.spikes[0]!.topDepth).toBe(reversal); // spike capped at SpikeH
    const before = e.depth;
    sim.tick(makeInput());
    expect(e.depth).toBeCloseTo(
      before + lp.climb * cfg.tuning.climbMul.spiker * TICK_SEC,
      12,
    );
  });

  it('at the bottom it teleports to a random lane not held by another Spiker', () => {
    for (let seed = 1; seed <= 15; seed++) {
      const { sim, s } = playingSim(cfg, 4, seed);
      const e = spikerAt(2, 0.999, { climbDir: -1 });
      const other = spikerAt(5, 0.7);
      s.enemies = [e, other];
      sim.tick(makeInput()); // reaches depth 1 and switches
      expect(e.depth).toBe(1);
      expect(e.climbDir).toBe(1); // resumes climbing
      expect(e.lane).not.toBe(2); // not its previous lane
      expect(e.lane).not.toBe(5); // not another Spiker's lane
      expect(e.prevLane).toBe(e.lane); // teleport — no render tween (§11.1)
      expect(e.prevDepth).toBe(e.depth); // both axes snap (no depth slide)
    }
  });

  it('resumes extending the NEW lane’s spike after the switch', () => {
    const { sim, s } = playingSim(cfg, 4);
    const e = spikerAt(2, 0.999, { climbDir: -1 });
    s.enemies = [e];
    sim.tick(makeInput()); // switch
    const newLane = e.lane;
    sim.tick(makeInput()); // first climb tick on the new lane
    const sp = s.spikes.find((p) => p.lane === newLane);
    expect(sp).toBeDefined();
    expect(sp!.topDepth).toBe(e.depth);
  });
});

describe('growth-only spike top (§6.3)', () => {
  it('a descending or below-top Spiker never raises the top', () => {
    const { sim, s } = playingSim(cfg, 4);
    const e = spikerAt(2, 0.7, { climbDir: -1 }); // descending
    s.enemies = [e];
    s.spikes = [{ lane: 2, topDepth: 0.5 }];
    for (let i = 0; i < 30; i++) sim.tick(makeInput());
    expect(s.spikes[0]!.topDepth).toBe(0.5); // untouched
  });

  it('a trim persists while the Spiker sits below the new top', () => {
    const { sim, s } = playingSim(cfg, 4);
    const e = spikerAt(2, 0.8, { climbDir: -1 });
    s.enemies = [e];
    s.spikes = [{ lane: 2, topDepth: 0.58 }]; // post-trim top
    for (let i = 0; i < 10; i++) sim.tick(makeInput());
    expect(s.spikes[0]!.topDepth).toBe(0.58); // never reverted
  });

  it('a climbing Spiker regrows past a trim only by climbing above it', () => {
    const { sim, s } = playingSim(cfg, 4);
    const e = spikerAt(2, 0.7, { climbDir: 1 });
    s.enemies = [e];
    s.spikes = [{ lane: 2, topDepth: 0.65 }]; // top above the spiker
    sim.tick(makeInput());
    expect(s.spikes[0]!.topDepth).toBe(0.65); // spiker still below the top
    // Climb until past 0.65 — the top follows again (normal growth).
    for (let i = 0; i < 400 && e.depth > 0.64; i++) sim.tick(makeInput());
    expect(s.spikes[0]!.topDepth).toBe(e.depth);
    expect(s.spikes[0]!.topDepth).toBeLessThan(0.65);
  });
});

describe('spike/shot interaction (§6.3, §7)', () => {
  it('a shot at the tip with the Spiker at/above kills the Spiker (no trim)', () => {
    const { sim, s } = playingSim(cfg, 4);
    const e = spikerAt(2, 0.62, { climbDir: 1 }); // climbing at the top
    s.enemies = [e];
    s.spikes = [{ lane: 2, topDepth: 0.62 }];
    s.playerShots = [{ lane: 2, depth: 0.59, prevDepth: 0.59 }];
    const { events } = sim.tick(makeInput());
    expect(s.enemies).toHaveLength(0);
    expect(s.score).toBe(cfg.scoring.spiker);
    expect(
      events.some((ev) => ev.type === 'enemyKilled' && ev.kind === 'spiker'),
    ).toBe(true);
    expect(events.some((ev) => ev.type === 'spikeHit')).toBe(false);
    // The spike itself is NOT trimmed by a kill (top follows the climb tick).
    expect(s.spikes[0]!.topDepth).toBe(e.depth);
    expect(s.playerShots).toHaveLength(0); // consumed
  });

  it('a shot at the tip with the Spiker below trims once and is consumed', () => {
    const { sim, s } = playingSim(cfg, 4);
    const e = spikerAt(2, 0.85, { climbDir: -1 }); // descending, below top
    s.enemies = [e];
    s.spikes = [{ lane: 2, topDepth: 0.6 }];
    s.playerShots = [{ lane: 2, depth: 0.57, prevDepth: 0.57 }];
    const { events } = sim.tick(makeInput());
    expect(s.enemies).toHaveLength(1); // Spiker survives (shielded below)
    expect(s.spikes[0]!.topDepth).toBeCloseTo(
      0.6 + cfg.tuning.spikeTrimDepth,
      12,
    );
    expect(s.score).toBe(cfg.scoring.spikeTrimPoints);
    expect(events).toContainEqual({ type: 'spikeHit' });
    expect(s.playerShots).toHaveLength(0);
  });

  it('enemies below the spike top are shielded from player shots', () => {
    const { sim, s } = playingSim(cfg, 4);
    const shielded = spikerAt(2, 0.9, { climbDir: -1 });
    s.enemies = [shielded];
    s.spikes = [{ lane: 2, topDepth: 0.6 }];
    // A shot swept far enough to reach the enemy still stops at the tip.
    s.playerShots = [{ lane: 2, depth: 0.59, prevDepth: 0.59 }];
    sim.tick(makeInput());
    expect(s.enemies).toHaveLength(1); // shielded
    expect(s.spikes[0]!.topDepth).toBeGreaterThan(0.6); // trimmed instead
  });

  it('a trim can cross a bonus-life threshold via the normal step-6 rule', () => {
    const { sim, s } = playingSim(cfg, 4);
    s.score = cfg.scoring.bonusLifeInterval - 1;
    s.livesGranted = 0;
    s.spikes = [{ lane: 2, topDepth: 0.6 }];
    s.playerShots = [{ lane: 2, depth: 0.57, prevDepth: 0.57 }];
    const { events } = sim.tick(makeInput());
    expect(s.score).toBe(
      cfg.scoring.bonusLifeInterval - 1 + cfg.scoring.spikeTrimPoints,
    );
    expect(events).toContainEqual({ type: 'bonusLife' });
  });

  it('a fully-trimmed spike is removed', () => {
    const { sim, s } = playingSim(cfg, 4);
    s.spikes = [{ lane: 2, topDepth: 1 - cfg.tuning.spikeTrimDepth / 2 }];
    s.playerShots = [
      {
        lane: 2,
        depth: 1 - cfg.tuning.spikeTrimDepth / 2 - 0.03,
        prevDepth: 0.9,
      },
    ];
    sim.tick(makeInput());
    expect(s.spikes).toHaveLength(0);
  });

  it('trimOrKill encodes the tip priority directly', () => {
    const spike: Spike = { lane: 3, topDepth: 0.5 };
    const spiker = spikerAt(3, 0.5);
    expect(trimOrKill(spike, spiker, 0.08)).toBe('kill');
    expect(spike.topDepth).toBe(0.5); // kill does not trim
    expect(trimOrKill(spike, null, 0.08)).toBe('trim');
    expect(spike.topDepth).toBeCloseTo(0.58, 12);
  });
});
