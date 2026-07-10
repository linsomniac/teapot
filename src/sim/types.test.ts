import { describe, expect, it } from 'vitest';
import {
  ENEMY_KINDS,
  PLAYER_SHOT_SLOTS,
  TICK_MS,
  TICK_SEC,
  type Enemy,
  type EnemyKind,
  type InputSnapshot,
  type Phase,
  type Shot,
  type SimEvent,
  type Spike,
} from './types';

// Compile-time coverage: construct a literal of each exported type.
const snapshot: InputSnapshot = {
  move: 0.5,
  fire: false,
  zap: false,
  confirm: false,
  back: false,
  quit: false,
};

const enemy: Enemy = {
  kind: 'flipper',
  lane: 3,
  depth: 0.5,
  prevLane: 3,
  prevDepth: 0.55,
  flip: { from: 3, to: 4, progress: 0.25 },
  flipTimer: 1.5,
  fireTimer: 2,
};

const fuseball: Enemy = {
  kind: 'fuseball',
  lane: 7,
  depth: 0,
  prevLane: 7,
  prevDepth: 0,
  flip: null,
  flipTimer: 0,
  fireTimer: 0,
  climbDir: -1,
  rimTimer: 1,
  rimDir: 1,
  jitterTimer: 0.5,
  speedMul: 1.2,
  descentTarget: 0.8,
};

const pulsar: Enemy = {
  kind: 'pulsar',
  lane: 0,
  depth: 0.9,
  prevLane: 0,
  prevDepth: 0.9,
  flip: null,
  flipTimer: 0,
  fireTimer: 0,
  climbDir: 1,
  pulseJoined: true,
};

const shot: Shot = { lane: 2, depth: 0.1, prevDepth: 0.125, slot: 7 };
const spike: Spike = { lane: 9, topDepth: 0.4 };

const events: SimEvent[] = [
  { type: 'playerShot' },
  { type: 'enemyShot' },
  { type: 'enemyKilled', kind: 'tanker', lane: 5, depth: 0.6 },
  { type: 'playerDied' },
  { type: 'flip' },
  { type: 'superzap' },
  { type: 'spikeHit' },
  { type: 'pulseTelegraph' },
  { type: 'bonusLife' },
  { type: 'warpStart' },
  { type: 'uiMove' },
  { type: 'uiConfirm' },
  { type: 'highScoreJingle' },
];

const phases: Phase[] = [
  'TITLE',
  'LEVEL_SELECT',
  'PLAYING',
  'EXPLODING',
  'GET_READY',
  'WARP',
  'GAME_OVER',
  'HIGH_SCORE_ENTRY',
];

describe('sim core types', () => {
  it('TICK_MS is the 60 Hz fixed timestep', () => {
    expect(TICK_MS).toBeCloseTo(16.6667, 3);
    expect(TICK_MS).toBe(1000 / 60);
  });

  it('TICK_SEC × 60 spans exactly one second', () => {
    expect(TICK_SEC * 60).toBe(1);
  });

  it('owns exactly eight physical player-shot slots', () => {
    expect(PLAYER_SHOT_SLOTS).toBe(8);
  });

  it('has exactly the five enemy kinds, frozen', () => {
    expect(ENEMY_KINDS).toHaveLength(5);
    expect(new Set(ENEMY_KINDS).size).toBe(5);
    expect(Object.isFrozen(ENEMY_KINDS)).toBe(true);
    const expected: EnemyKind[] = [
      'flipper',
      'tanker',
      'spiker',
      'fuseball',
      'pulsar',
    ];
    expect([...ENEMY_KINDS]).toEqual(expected);
  });

  it('type literals construct (compile-time coverage)', () => {
    expect(snapshot.move).toBe(0.5);
    expect(enemy.flip?.to).toBe(4);
    expect(fuseball.descentTarget).toBe(0.8);
    expect(pulsar.pulseJoined).toBe(true);
    expect(shot.prevDepth).toBeGreaterThan(shot.depth);
    expect(spike.topDepth).toBe(0.4);
    expect(events).toHaveLength(13);
    expect(phases).toHaveLength(8);
  });
});
