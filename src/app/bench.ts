// ?bench=1 harness (§12.6): gesture-started, seeded + scripted 60 s run at
// the pinned MAX-LEGAL census on a FIXED 2880×2160 backing store (1440×1080
// reference playfield at DPR 2). benchMode census-hold: the player is
// invulnerable, nothing despawns or completes, and the census is topped
// back up after every tick — entities still move/flip/pulse, so sim and
// render do worst-case work for the full 60 s. Gate metric: mean + p95
// (nearest-rank, frame 1 dropped) WORK time; rAF/dropped-frame stats are
// informational only. Also exports the F3 frame-time overlay used in
// normal play.

import type { GameConfig } from '../sim/config';
import { createSim, createSimFromState, type SimState } from '../sim/sim';
import { beginLevel, enterPlaying } from '../sim/state';
import { paramsForLevel, type LevelParams } from '../sim/difficultyCurve';
import { makeRng, type Rng } from '../sim/rng';
import { makeFlipper } from '../sim/enemies/flipper';
import { makeTanker } from '../sim/enemies/tanker';
import { makeSpiker } from '../sim/enemies/spiker';
import { makeFuseball } from '../sim/enemies/fuseball';
import { makePulsar } from '../sim/enemies/pulsar';
import type { Enemy } from '../sim/types';
import type { CanvasView } from '../render/canvas';
import { createRenderer } from '../render/renderer';
import { isLowGlow, strokeWithGlow } from '../render/glow';
import { pathText } from '../render/font';
import { createAudioSystem } from '../audio/context';
import { createSfx } from '../audio/sfx';
import { buildLiveConfig } from './app';
import type { InputSnapshot } from '../sim/types';

export const BENCH_SEED = 0x7ea0b3;
const BENCH_SECONDS = 60;
const THREATENING = 24; // double MaxOnWell — covers a full split wave (§12.6)
const SPIKERS = 7;

// --- frame statistics (shared with the F3 overlay) ---

export interface FrameStats {
  push(sample: number): void;
  mean(): number;
  p95(): number; // nearest-rank
  count(): number;
  values(): readonly number[];
}

export function createFrameStats(): FrameStats {
  const samples: number[] = [];
  return {
    push: (v) => void samples.push(v),
    count: () => samples.length,
    mean(): number {
      if (samples.length === 0) return 0;
      let sum = 0;
      for (const v of samples) sum += v;
      return sum / samples.length;
    },
    p95(): number {
      if (samples.length === 0) return 0;
      const sorted = [...samples].sort((a, b) => a - b);
      return sorted[Math.ceil(0.95 * sorted.length) - 1]!;
    },
    values: () => samples,
  };
}

// F3 overlay (§12.6): work-time mean/p95 over a rolling window.
export function drawFrameTimeOverlay(
  view: CanvasView,
  stats: FrameStats,
  lowGlow: boolean,
): void {
  const { ctx, playfield: pf } = view;
  const size = Math.max(10, pf.height * 0.022);
  ctx.beginPath();
  pathText(
    ctx,
    `FT MEAN ${stats.mean().toFixed(2)} P95 ${stats.p95().toFixed(2)} MS`,
    pf.x + size,
    pf.y + pf.height - size * 2,
    size,
    'left',
  );
  strokeWithGlow(ctx, '#7fe0a8', 1.2, lowGlow);
}

// --- census construction + hold ---

function benchEnemy(
  kind: number,
  lane: number,
  lp: LevelParams,
  cfg: GameConfig,
  rng: Rng,
): Enemy {
  switch (kind % 4) {
    case 0:
      return { ...makeFlipper(lane, lp, rng), depth: 0.2 + rng.next() * 0.7 };
    case 1:
      return { ...makeTanker(lane, lp, rng), depth: 0.3 + rng.next() * 0.6 };
    case 2:
      return {
        ...makeFuseball(lane, cfg.tuning, rng),
        depth: 0.2 + rng.next() * 0.7,
      };
    default:
      return {
        ...makePulsar(lane, lp, rng),
        depth: 0.3 + rng.next() * 0.6,
        pulseJoined: true, // electrified lanes stay active (§12.6)
      };
  }
}

function topUpCensus(
  s: SimState,
  lp: LevelParams,
  cfg: GameConfig,
  rng: Rng,
): void {
  let threatening = 0;
  const spikerLanes = new Set<number>();
  for (const e of s.enemies) {
    if (e.kind === 'spiker') spikerLanes.add(e.lane);
    else threatening++;
  }
  let kindCursor = rng.nextInt(4);
  while (threatening < THREATENING) {
    s.enemies.push(benchEnemy(kindCursor++, rng.nextInt(16), lp, cfg, rng));
    threatening++;
  }
  for (let lane = 0; spikerLanes.size < SPIKERS && lane < 16; lane++) {
    if (!spikerLanes.has(lane)) {
      s.enemies.push({ ...makeSpiker(lane, lp, rng), depth: 0.5 });
      spikerLanes.add(lane);
    }
  }
  // Full-height spikes on all 16 lanes (§12.6) — trims are reset each tick.
  const fullTop = 1 - lp.spikeH;
  for (let lane = 0; lane < 16; lane++) {
    const spike = s.spikes.find((sp) => sp.lane === lane);
    if (spike === undefined) s.spikes.push({ lane, topDepth: fullTop });
    else spike.topDepth = fullTop;
  }
  while (s.enemyShots.length < 8) {
    const d = 0.2 + rng.next() * 0.7;
    s.enemyShots.push({ lane: rng.nextInt(16), depth: d, prevDepth: d });
  }
  while (s.playerShots.length < 8) {
    const d = 0.1 + rng.next() * 0.8;
    s.playerShots.push({ lane: rng.nextInt(16), depth: d, prevDepth: d });
  }
}

// Deterministic scripted inputs: sweep the rim back and forth, hold fire.
function scriptedInput(frame: number): InputSnapshot {
  return {
    move: (Math.floor(frame / 45) % 2 === 0 ? 1 : -1) * 0.2,
    fire: true,
    zap: false,
    confirm: false,
    back: false,
    quit: false,
  };
}

export interface BenchResult {
  meanMs: number;
  p95Ms: number;
  frames: number;
  droppedFramePct: number;
  rafMeanMs: number;
  rafP95Ms: number;
}

export function runBench(canvas: HTMLCanvasElement): void {
  // Fixed render resolution (§12.6): 1440×1080 reference playfield at DPR 2.
  canvas.width = 2880;
  canvas.height = 2160;
  const maybeCtx = canvas.getContext('2d');
  if (!maybeCtx) throw new Error('2D canvas context unavailable');
  const ctx: CanvasRenderingContext2D = maybeCtx;
  ctx.setTransform(2, 0, 0, 2, 0, 0);
  const view: CanvasView = {
    canvas,
    ctx,
    dpr: 2,
    cssWidth: 1440,
    cssHeight: 1080,
    playfield: { x: 0, y: 0, width: 1440, height: 1080 },
  };

  const cfg = buildLiveConfig();
  const lp = paramsForLevel(96, cfg.difficulty);
  const lowGlow = isLowGlow(window.location.search);
  const renderer = createRenderer(cfg, { lowGlow });
  const audio = createAudioSystem(false);
  const sfx = createSfx(audio);

  // Census state at the level-96 cap row, wrapped in census-hold mode.
  const donor = createSim(cfg, BENCH_SEED);
  const s = donor.getState() as SimState;
  s.lives = 99;
  beginLevel(s, 96, cfg);
  enterPlaying(s, cfg);
  s.budget = { flipper: 0, tanker: 0, spiker: 0, fuseball: 0, pulsar: 0 };
  // Start inside an active pulse cycle (telegraph begins immediately).
  s.pulseClock =
    lp.pulse - cfg.tuning.pulseTelegraph - cfg.tuning.pulseDuration;
  const rng = makeRng(BENCH_SEED ^ 0x5eed);
  topUpCensus(s, lp, cfg, rng);
  const sim = createSimFromState(s, cfg, true); // benchMode: census-hold

  const work = createFrameStats();
  const rafIntervals = createFrameStats();
  let frame = 0;
  let lastRaf: number | null = null;
  let elapsedMs = 0;
  let running = false;

  function drawWaiting(): void {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, 1440, 1080);
    ctx.beginPath();
    pathText(ctx, 'BENCH READY', 720, 460, 40, 'center');
    pathText(ctx, 'CLICK OR PRESS ANY KEY TO START', 720, 540, 24, 'center');
    strokeWithGlow(ctx, '#ffffff', 2, lowGlow);
  }

  function report(): BenchResult {
    const raf = rafIntervals.values();
    // Detected refresh interval: median rAF interval (informational).
    const sorted = [...raf].sort((a, b) => a - b);
    const median =
      sorted.length > 0 ? sorted[Math.floor(sorted.length / 2)]! : 16.7;
    const dropped = raf.filter((v) => v > median * 1.5).length;
    return {
      meanMs: work.mean(),
      p95Ms: work.p95(),
      frames: work.count(),
      droppedFramePct: raf.length > 0 ? (dropped / raf.length) * 100 : 0,
      rafMeanMs: rafIntervals.mean(),
      rafP95Ms: rafIntervals.p95(),
    };
  }

  function drawResults(r: BenchResult): void {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, 1440, 1080);
    const lines = [
      'BENCH COMPLETE',
      `WORK MEAN ${r.meanMs.toFixed(2)} MS`,
      `WORK P95 ${r.p95Ms.toFixed(2)} MS`,
      `FRAMES ${r.frames}`,
      `DROPPED ${r.droppedFramePct.toFixed(1)} PCT`,
      `RAF MEAN ${r.rafMeanMs.toFixed(2)} MS - P95 ${r.rafP95Ms.toFixed(2)} MS`,
    ];
    ctx.beginPath();
    lines.forEach((text, i) => {
      pathText(ctx, text, 720, 300 + i * 70, i === 0 ? 40 : 28, 'center');
    });
    strokeWithGlow(ctx, '#7fe0a8', 2, lowGlow);
  }

  function benchFrame(now: number): void {
    if (lastRaf !== null) {
      rafIntervals.push(now - lastRaf);
      elapsedMs += now - lastRaf;
    }
    lastRaf = now;
    frame++;

    const t0 = performance.now();
    // One sim tick per frame at the pinned census (scripted inputs), then
    // top the census back up so the next tick is worst-case again.
    const input = scriptedInput(frame);
    const { events } = sim.tick(input);
    topUpCensus(s, lp, cfg, rng);
    renderer.onEvents(events, s, view);
    sfx.onEvents(events);
    // Saturate the particle pool: a fresh kill-burst every tick plus a
    // standing player-death burst (§12.6).
    renderer.particles().burst(720 + (frame % 100), 540, '#ff4136', 18, 170);
    if (frame % 30 === 0) renderer.particles().playerDeathBurst(700, 500);
    renderer.frame(view, s, 0.5, 1 / 60, false);
    const workMs = performance.now() - t0;
    if (frame > 1) work.push(workMs); // frame 1 is warm-up (§12.6)

    if (elapsedMs < BENCH_SECONDS * 1000) {
      requestAnimationFrame(benchFrame);
    } else {
      const r = report();
      console.log(JSON.stringify({ bench: r }, null, 2));
      drawResults(r);
    }
  }

  function start(): void {
    if (running) return;
    running = true;
    audio.ensureRunning(); // gesture-start: context running during measurement
    window.removeEventListener('keydown', start);
    canvas.removeEventListener('mousedown', start);
    requestAnimationFrame(benchFrame);
  }

  window.addEventListener('keydown', start);
  canvas.addEventListener('mousedown', start);
  drawWaiting();
}
