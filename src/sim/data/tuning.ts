// §8.3 tuning constants (initial values; one data module).
// AIDEV-NOTE: live tuning data — exact values are asserted only by the frozen
// golden-replay fixture (§13 test-value policy).

import type { Tuning } from '../config';

export const TUNING: Tuning = Object.freeze({
  rimSpeed: 14, // lanes/s (keyboard)
  mouseSensitivity: 50, // px per lane (pointer-locked)
  perTickClamp: 0.45, // lanes/tick; must stay < 0.5 (§4)
  shotSpeed: 1.5, // depth/s (player)
  fireInterval: 0.18, // s; must stay > D40 floor (~0.162 s) — validateConfig
  maxPlayerShots: 8,
  flipAnimTime: 0.25, // s
  rimFlipFactor: 0.5, // rimFlipInterval = 0.5 × FlipInt
  climbMul: Object.freeze({
    flipper: 1.0,
    tanker: 0.6,
    spiker: 0.8,
    fuseball: 0.5,
    pulsar: 0.9,
  }),
  fuseballRimSpeed: 2, // lanes/s
  fuseballRimTime: 3.0, // s
  fuseballJitter: Object.freeze({ min: 0.3, max: 1.5, redrawInterval: 0.5 }),
  fuseballDescentRange: Object.freeze({ min: 0.6, max: 1.0 }),
  pulseDuration: 0.4, // s
  pulseTelegraph: 0.5, // s; pulseCycle ≥ telegraph + duration — validateConfig
  pulsarReversalDepth: 0.15,
  minFireDepth: 0.2, // minimum enemy firing depth
  spikeTrimDepth: 0.08, // depth removed per trimming shot
  descentSpeed: 0.4, // depth/s (warp, ~2.5 s)
  halfExtents: Object.freeze({
    enemy: 0.02,
    shot: 0.01,
    spikeTop: 0,
    blaster: 0,
  }),
  startingLives: 3,
  getReadyDuration: 1.5, // s
  gameOverBeat: 2.0, // s
  flipSeekBias: 0.5, // fraction of mid-well flips that seek the player
  uiStepInterval: 0.15, // s; max one selector step per interval (§8.3)
  particlePoolCap: 256, // render-side max live particles (§12.6 bench census)
});
