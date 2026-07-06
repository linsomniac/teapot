import { describe, expect, it } from 'vitest';
import { makePulsar, pulsePhase } from './pulsar';
import { makeRng } from '../rng';
import { paramsForLevel } from '../difficultyCurve';
import { TICK_SEC } from '../types';
import type { Enemy } from '../types';
import { makeLiveConfig } from '../../__tests__/fixtures/liveConfig';
import { makeInput } from '../../__tests__/fixtures/input';
import { playingSim } from '../../__tests__/fixtures/playing';

// §13 Pulsar area (Task 4.5). Level 17 = Pulsar intro; geometry 0 (closed).

const cfg = makeLiveConfig();
const lp = paramsForLevel(17, cfg.difficulty);
const t = cfg.tuning;
const quietSpan = lp.pulse - t.pulseTelegraph - t.pulseDuration;

function pulsarAt(
  lane: number,
  depth: number,
  over: Partial<Enemy> = {},
): Enemy {
  return {
    ...makePulsar(lane, lp, makeRng(3)),
    depth,
    prevDepth: depth,
    flipTimer: 100, // parked unless a test arms it
    ...over,
  };
}

describe('pulsePhase (§6.5)', () => {
  it('lays the cycle out as quiet → telegraph → pulse and wraps', () => {
    // Probes sit 1e-6 outside the boundary epsilon (1e-9) by design.
    expect(pulsePhase(0, lp.pulse, t)).toBe('quiet');
    expect(pulsePhase(quietSpan - 1e-6, lp.pulse, t)).toBe('quiet');
    expect(pulsePhase(quietSpan, lp.pulse, t)).toBe('telegraph');
    expect(pulsePhase(quietSpan + t.pulseTelegraph - 1e-6, lp.pulse, t)).toBe(
      'telegraph',
    );
    expect(pulsePhase(quietSpan + t.pulseTelegraph, lp.pulse, t)).toBe('pulse');
    expect(pulsePhase(lp.pulse - 1e-6, lp.pulse, t)).toBe('pulse');
    expect(pulsePhase(lp.pulse, lp.pulse, t)).toBe('quiet'); // next cycle
    expect(pulsePhase(lp.pulse + quietSpan + 0.01, lp.pulse, t)).toBe(
      'telegraph',
    );
  });

  it('tick-accumulated clocks hit the boundaries on the exact tick (no drift)', () => {
    // Summing TICK_SEC 126 times gives 2.0999999999999974, not 2.1 — the
    // epsilon must snap that onto the telegraph boundary (codex P2).
    let clock = 0;
    const telegraphTick = Math.round((quietSpan / 1) * 60); // 126 at level 17
    const wrapTick = Math.round(lp.pulse * 60); // 180
    for (let i = 1; i <= wrapTick; i++) {
      clock += TICK_SEC;
      if (i === telegraphTick) {
        expect(pulsePhase(clock, lp.pulse, t)).toBe('telegraph');
      }
      if (i === wrapTick) {
        expect(pulsePhase(clock, lp.pulse, t)).toBe('quiet'); // wrapped
      }
    }
  });

  it('zero-quiet cycles still register the first telegraph at PLAYING entry', () => {
    // pulseCycle === telegraph + duration is legal (§8.3, ≥); codex P3.
    const zq = makeLiveConfig();
    for (const a of zq.difficulty) {
      if (a.pulse !== null) a.pulse = t.pulseTelegraph + t.pulseDuration;
    }
    const { sim, s } = playingSim(zq, 17);
    const e = pulsarAt(2, 0.5);
    s.enemies = [e];
    expect(s.pulseClock).toBe(0); // fresh PLAYING entry
    const { events } = sim.tick(makeInput());
    expect(events).toContainEqual({ type: 'pulseTelegraph' });
    expect(e.pulseJoined).toBe(true);
  });
});

describe('Pulsar motion (§6.5)', () => {
  it('climbs at Climb × climbMul.pulsar (wiring: modified multiplier changes it)', () => {
    const { sim, s } = playingSim(cfg, 17);
    const e = pulsarAt(2, 0.8);
    s.enemies = [e];
    sim.tick(makeInput());
    expect(e.depth).toBeCloseTo(
      0.8 - lp.climb * t.climbMul.pulsar * TICK_SEC,
      12,
    );

    const modded = makeLiveConfig();
    modded.tuning.climbMul.pulsar = 0.3;
    const t2 = playingSim(modded, 17);
    const e2 = pulsarAt(2, 0.8);
    t2.s.enemies = [e2];
    t2.sim.tick(makeInput());
    expect(e2.depth).toBeCloseTo(0.8 - lp.climb * 0.3 * TICK_SEC, 12);
    expect(e2.depth).not.toBeCloseTo(e.depth, 12);
  });

  it('oscillates between pulsarReversalDepth and the bottom — never the rim', () => {
    const { sim, s } = playingSim(cfg, 17);
    const e = pulsarAt(2, 0.2);
    s.enemies = [e];
    let minDepth = 1;
    let maxDepth = 0;
    let sawDescend = false;
    let sawClimbAgain = false;
    for (let i = 0; i < 1200; i++) {
      sim.tick(makeInput());
      minDepth = Math.min(minDepth, e.depth);
      maxDepth = Math.max(maxDepth, e.depth);
      if (e.climbDir === -1) sawDescend = true;
      if (sawDescend && e.climbDir === 1) sawClimbAgain = true;
    }
    expect(minDepth).toBe(t.pulsarReversalDepth);
    expect(maxDepth).toBe(1);
    expect(sawClimbAgain).toBe(true); // full oscillation cycle observed
  });

  it('flips with Flipper targeting — including while descending', () => {
    const { sim, s } = playingSim(cfg, 17); // player lane 8
    const seek = makeLiveConfig();
    seek.tuning.flipSeekBias = 1;
    const t2 = playingSim(seek, 17);
    const e = pulsarAt(2, 0.5, { climbDir: -1, flipTimer: 0.001 });
    t2.s.enemies = [e];
    t2.sim.tick(makeInput());
    expect(e.flip).not.toBeNull();
    expect(e.flip!.to).toBe(3); // toward the player
    expect(e.depth).toBe(0.5); // depth frozen during the flip
    void sim;
    void s;
  });

  it('is a firing kind: spawn draws fireTimer from [0.5,1.5]×FireInt', () => {
    for (let seed = 1; seed <= 10; seed++) {
      const e = makePulsar(3, lp, makeRng(seed));
      expect(e.fireTimer).toBeGreaterThanOrEqual(0.5 * lp.fireInt);
      expect(e.fireTimer).toBeLessThanOrEqual(1.5 * lp.fireInt);
      expect(e.pulseJoined).toBe(false); // joins at the next telegraph start
    }
  });
});

describe('pulse participation + freeze (§6.5)', () => {
  it('on-well Pulsars join at telegraph start (with the telegraph event); later spawns wait', () => {
    const { sim, s } = playingSim(cfg, 17);
    const early = pulsarAt(2, 0.5);
    s.enemies = [early];
    s.pulseClock = quietSpan - TICK_SEC / 2; // telegraph starts next tick
    const { events } = sim.tick(makeInput());
    expect(events).toContainEqual({ type: 'pulseTelegraph' });
    expect(early.pulseJoined).toBe(true);
    // A Pulsar arriving during the telegraph does not participate.
    const late = pulsarAt(5, 0.5);
    s.enemies.push(late);
    sim.tick(makeInput());
    expect(late.pulseJoined).toBe(false);
  });

  it('a participant-free telegraph emits no event (pre-Pulsar levels stay silent)', () => {
    const { sim, s } = playingSim(cfg, 4); // level 4: pulse normalized, no Pulsars
    const cycleTicks =
      Math.round(paramsForLevel(4, cfg.difficulty).pulse * 60) + 5;
    for (let i = 0; i < cycleTicks; i++) {
      const { events } = sim.tick(makeInput());
      expect(events.some((ev) => ev.type === 'pulseTelegraph')).toBe(false);
    }
    void s;
  });

  it('participation clears when the cycle wraps to quiet, rejoining next telegraph', () => {
    const { sim, s } = playingSim(cfg, 17);
    const e = pulsarAt(2, 0.5, { pulseJoined: true });
    s.enemies = [e];
    s.pulseClock = lp.pulse - TICK_SEC / 2; // cycle wraps next tick
    sim.tick(makeInput());
    expect(e.pulseJoined).toBe(false);
  });

  it('no flips begin from telegraph start through pulse end; deferred flip fires after', () => {
    const { sim, s } = playingSim(cfg, 17);
    const e = pulsarAt(2, 0.5, { flipTimer: 0.001 }); // due immediately
    s.enemies = [e];
    s.pulseClock = quietSpan + 0.01; // inside the telegraph
    const freezeTicks = Math.ceil(
      (t.pulseTelegraph + t.pulseDuration) / TICK_SEC,
    );
    for (let i = 0; i < freezeTicks - 2; i++) {
      sim.tick(makeInput());
      expect(e.flip, `tick ${i}`).toBeNull(); // frozen while telegraph/pulse
    }
    // Tick until the clock wraps to quiet — the armed timer fires then.
    let guard = 0;
    while (e.flip === null && guard++ < 10) sim.tick(makeInput());
    expect(e.flip).not.toBeNull(); // released at pulse end
  });
});

describe('pulse lethality (§6.5/§5(c)) and the same-tick save', () => {
  function pulsingSim(pulsarLane: number, joined = true) {
    const { sim, s } = playingSim(cfg, 17); // player lane 8
    const e = pulsarAt(pulsarLane, 0.5, { pulseJoined: joined });
    s.enemies = [e];
    s.pulseClock = quietSpan + t.pulseTelegraph + 0.01; // inside the pulse
    return { sim, s, e };
  }

  it('a participating Pulsar’s lane kills the player during the pulse', () => {
    const { sim } = pulsingSim(8);
    const { events } = sim.tick(makeInput());
    expect(events).toContainEqual({ type: 'playerDied' });
  });

  it('the full lane length is lethal regardless of the Pulsar’s depth', () => {
    const { sim, s } = pulsingSim(8);
    s.enemies[0]!.depth = 0.95; // deep in the well — lane still electrified
    const { events } = sim.tick(makeInput());
    expect(events).toContainEqual({ type: 'playerDied' });
  });

  it('entering the electrified lane mid-pulse also kills', () => {
    const { sim, s } = pulsingSim(6);
    s.rimPos = 5.8; // player approaches lane 6
    const { events } = sim.tick(makeInput({ move: 0.4 })); // rounds onto lane 6
    expect(events).toContainEqual({ type: 'playerDied' });
  });

  it('a non-participating Pulsar’s lane is harmless during the pulse', () => {
    const { sim } = pulsingSim(8, false);
    const { events } = sim.tick(makeInput());
    expect(events.some((ev) => ev.type === 'playerDied')).toBe(false);
  });

  it('outside the pulse the lane is harmless', () => {
    const { sim, s } = playingSim(cfg, 17);
    s.enemies = [pulsarAt(8, 0.5, { pulseJoined: true })];
    s.pulseClock = 0.1; // quiet
    const { events } = sim.tick(makeInput());
    expect(events.some((ev) => ev.type === 'playerDied')).toBe(false);
  });

  it('same-tick save: killing the last participating Pulsar de-electrifies instantly', () => {
    const { sim, s } = pulsingSim(8);
    s.playerShots = [{ lane: 8, depth: 0.46, prevDepth: 0.46 }];
    const { events } = sim.tick(makeInput());
    expect(s.enemies).toHaveLength(0);
    expect(events.some((ev) => ev.type === 'playerDied')).toBe(false); // saved
    expect(s.score).toBe(cfg.scoring.pulsar);
  });

  it('co-located control: without the shot, the identical setup kills the player', () => {
    const { sim } = pulsingSim(8);
    const { events } = sim.tick(makeInput());
    expect(events).toContainEqual({ type: 'playerDied' });
  });

  it('player shots pass through an electrified lane unharmed (mid-pulse kill works)', () => {
    const { sim, s } = pulsingSim(4); // not the player's lane
    s.playerShots = [{ lane: 4, depth: 0.46, prevDepth: 0.46 }];
    sim.tick(makeInput());
    expect(s.enemies).toHaveLength(0); // shot reached and killed the Pulsar
  });
});
