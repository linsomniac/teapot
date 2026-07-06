import { describe, expect, it } from 'vitest';
import {
  LANES,
  adjacentLane,
  clampRimDelta,
  interpRim,
  normalizeRimPos,
  playerLane,
  shortestArcDir,
} from './well';

describe('normalizeRimPos (§4)', () => {
  it('closed: normalizes to [0,16) with wrap', () => {
    expect(normalizeRimPos(16, true)).toBe(0);
    expect(normalizeRimPos(16.25, true)).toBe(0.25);
    expect(normalizeRimPos(-0.5, true)).toBe(15.5);
    expect(normalizeRimPos(-16, true)).toBe(0);
    expect(normalizeRimPos(33.5, true)).toBe(1.5);
    expect(normalizeRimPos(7.75, true)).toBe(7.75);
  });

  it('open: clamps to [0,15]', () => {
    expect(normalizeRimPos(-2, false)).toBe(0);
    expect(normalizeRimPos(15.5, false)).toBe(15);
    expect(normalizeRimPos(40, false)).toBe(15);
    expect(normalizeRimPos(7.75, false)).toBe(7.75);
  });
});

describe('playerLane — the canonical player-lane rule (§4)', () => {
  it('round means floor(x+0.5): half rounds UP', () => {
    expect(playerLane(2.5, true)).toBe(3);
    expect(playerLane(2.5, false)).toBe(3);
    expect(playerLane(2.499, true)).toBe(2);
  });

  it('closed: round(rimPos) mod 16 with wrap at 15↔0', () => {
    expect(playerLane(15.6, true)).toBe(0);
    expect(playerLane(15.5, true)).toBe(0); // round(15.5)=16 → mod 16
    expect(playerLane(15.4, true)).toBe(15);
    expect(playerLane(-0.4, true)).toBe(0); // normalized 15.6 → round 16 → 0
    expect(playerLane(-0.6, true)).toBe(15);
    expect(playerLane(0, true)).toBe(0);
  });

  it('open: rimPos clamped to [0,15], lane = round → 0..15', () => {
    expect(playerLane(15.9, false)).toBe(15);
    expect(playerLane(15.5, false)).toBe(15);
    expect(playerLane(-3, false)).toBe(0);
    expect(playerLane(0.4, false)).toBe(0);
    expect(playerLane(14.5, false)).toBe(15);
  });
});

describe('adjacentLane (§4)', () => {
  it('closed: wraps 15→0 and 0→15', () => {
    expect(adjacentLane(15, 1, true)).toBe(0);
    expect(adjacentLane(0, -1, true)).toBe(15);
    expect(adjacentLane(7, 1, true)).toBe(8);
  });

  it('open: null past the end lanes', () => {
    expect(adjacentLane(15, 1, false)).toBeNull();
    expect(adjacentLane(0, -1, false)).toBeNull();
    expect(adjacentLane(14, 1, false)).toBe(15);
    expect(adjacentLane(1, -1, false)).toBe(0);
  });
});

describe('shortestArcDir (§4/§6.1)', () => {
  it('open: plain sign of (to − from)', () => {
    expect(shortestArcDir(3, 9, false)).toBe(1);
    expect(shortestArcDir(9, 3, false)).toBe(-1);
    expect(shortestArcDir(5, 5, false)).toBe(0);
    expect(shortestArcDir(0, 15, false)).toBe(1); // no wrap on open wells
  });

  it('closed: wraps mod 16 and picks the shorter way', () => {
    expect(shortestArcDir(15, 1, true)).toBe(1); // 2 cw vs 14 ccw
    expect(shortestArcDir(1, 15, true)).toBe(-1);
    expect(shortestArcDir(0, 7, true)).toBe(1);
    expect(shortestArcDir(0, 9, true)).toBe(-1); // 9 cw vs 7 ccw
    expect(shortestArcDir(4, 4, true)).toBe(0);
  });

  it('closed: exact tie (8 either way) breaks clockwise (+1)', () => {
    expect(shortestArcDir(0, 8, true)).toBe(1);
    expect(shortestArcDir(12, 4, true)).toBe(1);
  });
});

describe('clampRimDelta (§4/§8.3)', () => {
  it('never exceeds the clamp in either direction', () => {
    expect(clampRimDelta(2, 0.45)).toBe(0.45);
    expect(clampRimDelta(-2, 0.45)).toBe(-0.45);
    expect(clampRimDelta(0.3, 0.45)).toBe(0.3);
    expect(clampRimDelta(-0.1, 0.45)).toBe(-0.1);
    expect(clampRimDelta(0, 0.45)).toBe(0);
  });

  it('a max-clamped delta stays below 0.5 with the live value (no lane skip)', () => {
    expect(Math.abs(clampRimDelta(99, 0.45))).toBeLessThan(0.5);
  });
});

describe('interpRim — shortest-arc render tween (§11.1)', () => {
  it('open: plain lerp', () => {
    expect(interpRim(3, 5, 0.5, false)).toBe(4);
    expect(interpRim(5, 3, 0.25, false)).toBe(4.5);
    expect(interpRim(7, 7, 0.9, false)).toBe(7);
  });

  it('closed: tweens through the 15.5→0.5 wrap, not backward through 8', () => {
    expect(interpRim(15.5, 0.5, 0.5, true)).toBe(0); // passes through 0
    expect(interpRim(15.5, 0.5, 0.25, true)).toBe(15.75);
    expect(interpRim(15.5, 0.5, 0.75, true)).toBe(0.25);
    expect(interpRim(0.5, 15.5, 0.5, true)).toBe(0); // reverse direction too
  });

  it('closed: alpha endpoints return prev/curr (normalized)', () => {
    expect(interpRim(15.5, 0.5, 0, true)).toBe(15.5);
    expect(interpRim(15.5, 0.5, 1, true)).toBe(0.5);
  });

  it('closed: non-wrapping case is a plain lerp', () => {
    expect(interpRim(3, 5, 0.5, true)).toBe(4);
  });

  it('closed: exact opposite (8 apart) tweens clockwise', () => {
    expect(interpRim(0, 8, 0.25, true)).toBe(2); // +8 clockwise, not −8
  });
});

describe('LANES', () => {
  it('is 16 (§4: every well has exactly 16 lanes)', () => {
    expect(LANES).toBe(16);
  });
});
