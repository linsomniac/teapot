// The app conductor: wires sim + render + audio + input + persist (§12).
// The GameConfig is assembled HERE from the live data modules and injected
// into the sim (I4/D41) — the sim never imports them itself.

import type { GameConfig } from '../sim/config';
import { GEOMETRIES } from '../sim/data/geometries';
import { DIFFICULTY } from '../sim/data/difficulty';
import { TUNING } from '../sim/data/tuning';
import { SCORING } from '../sim/data/scoring';
import { createSim } from '../sim/sim';
import type { Phase } from '../sim/types';
import { createCanvasView } from '../render/canvas';
import { isLowGlow } from '../render/glow';
import { createRenderer } from '../render/renderer';
import { createAudioSystem } from '../audio/context';
import { createSfx } from '../audio/sfx';
import {
  buildSnapshot,
  clearMouseAccumulator,
  createInputState,
} from '../input/map';
import { attachCapture } from '../input/capture';
import { createStorage } from './storage';
import { createPause, drawPauseOverlay } from './pause';
import { startLoop } from './loop';
import { createFrameStats, drawFrameTimeOverlay } from './bench';

const PLAY_PHASES: readonly Phase[] = ['PLAYING', 'GET_READY', 'WARP'];

export function buildLiveConfig(): GameConfig {
  return {
    geometries: [...GEOMETRIES],
    difficulty: [...DIFFICULTY],
    tuning: TUNING,
    scoring: SCORING,
  };
}

export function startApp(canvas: HTMLCanvasElement): void {
  const cfg = buildLiveConfig();
  const storage = createStorage();
  const persisted = storage.load();

  // Startup mute state mirrors the persisted setting (§11.2/§15.6).
  const audio = createAudioSystem(persisted.settings.muted);
  const sfx = createSfx(audio);

  const view = createCanvasView(canvas);
  window.addEventListener('resize', view.resize);
  const lowGlow = isLowGlow(window.location.search);
  const renderer = createRenderer(cfg, { lowGlow });

  // Seed provenance (§12.3): wall clock ⊕ crypto entropy, chosen once at
  // game start and injected — the sim itself never reads either.
  const entropy = new Uint32Array(1);
  crypto.getRandomValues(entropy);
  const seed = (Date.now() ^ entropy[0]!) >>> 0;
  const sim = createSim(cfg, seed, storage.initialSave());

  const inputState = createInputState();
  const pause = createPause();
  let lastPhase: Phase = sim.getState().phase;
  let pendingLockResume = false;
  let fpsOverlay = false; // F3 frame-time overlay (§12.6)
  let workStats = createFrameStats(); // rolling ~2 s window
  let workStatsShown = workStats;
  let frameWorkStart: number | null = null;

  function persistNow(): void {
    const s = sim.getState();
    storage.save({
      highScores: s.highScores.map((e) => ({ ...e })),
      settings: { muted: audio.muted() },
      maxLevelReached: s.maxLevelReached,
    });
  }

  function doPauseWith(lockHeld: boolean): void {
    if (pause.paused()) return;
    if (!PLAY_PHASES.includes(sim.getState().phase)) return; // ignored elsewhere (§10)
    pause.pause(lockHeld);
    loop.resetClock(); // paused wall time never reaches the stepper (D19)
    clearMouseAccumulator(inputState); // §5: no burst-spin on resume
  }

  function doPause(): void {
    doPauseWith(capture.hasLock());
  }

  function doResume(): void {
    if (!pause.paused()) return;
    pause.resume();
    pendingLockResume = false;
    loop.resetClock();
    clearMouseAccumulator(inputState);
    audio.ensureRunning(); // every resume gesture re-checks the context (§11.2)
  }

  const capture = attachCapture(canvas, inputState, {
    phase: () => sim.getState().phase,
    paused: () => pause.paused(),
    onEscapePlay: doPause,
    onPauseKey: (): void => {
      if (pause.paused()) {
        doResume(); // P resumes on keyboard — never re-requests the lock (§5)
      } else {
        doPause();
      }
    },
    onMuteKey: (): void => {
      // M toggles everywhere and persists IMMEDIATELY (§11.2/§15.6).
      audio.setMuted(!audio.muted());
      persistNow();
    },
    onFpsKey: (): void => {
      fpsOverlay = !fpsOverlay;
    },
    onQuitKey: (): void => {
      // Q acts only from the pause overlay; the app translates it into the
      // snapshot.quit sim input (§10/§12.3).
      if (pause.paused()) {
        inputState.quitPressed = true;
        doResume();
      }
    },
    // Auto-pause from a LOST lock (§5): the lock is already gone by the
    // time the event fires, but it WAS held when this pause began — the
    // next overlay click must re-request it.
    onPointerLockLost: (): void => doPauseWith(true),
    onClickWhilePaused: (): void => {
      if (pause.lockWasHeld()) {
        // Resume iff the lock re-acquires (§5): request it and wait for
        // pointerlockchange (polled in render); a rejection (e.g.
        // Chromium's post-Escape cooldown) leaves the game paused + hint.
        pendingLockResume = true;
        capture.requestLock();
        window.setTimeout(() => {
          if (pendingLockResume) pause.setHint(true);
        }, 400);
      } else {
        doResume();
      }
    },
    onGesture: () => audio.ensureRunning(),
  });

  // Read-only debug handle for the acceptance smoke driver (Task 13.1,
  // decision C3): lets a driven browser observe sim state and the audio
  // context without touching either. Never written to by the app.
  (window as unknown as Record<string, unknown>).__teapot = {
    state: () => sim.getState(),
    audioState: () => audio.context()?.state ?? 'none',
    muted: () => audio.muted(),
    paused: () => pause.paused(),
  };

  // Auto-pause on visibility loss / window blur (§10) — doPause itself
  // ignores non-play phases.
  window.addEventListener('blur', doPause);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) doPause();
  });

  const loop = startLoop({
    paused: () => pause.paused(),
    simTick(): void {
      if (frameWorkStart === null) frameWorkStart = performance.now();
      const input = buildSnapshot(inputState, cfg.tuning);
      const { events } = sim.tick(input);
      const s = sim.getState();
      if (events.length > 0) {
        renderer.onEvents(events, s, view.view());
        sfx.onEvents(events);
      }
      if (s.phase !== lastPhase) {
        capture.notifyPhase(s.phase); // exits held pointer lock off-play (§5)
        if (
          s.phase === 'TITLE' ||
          s.phase === 'GAME_OVER' ||
          s.phase === 'PLAYING'
        ) {
          // TITLE/GAME_OVER: the run's scores land on disk. PLAYING entry:
          // §8.5 records maxLevelReached when a level BEGINS PLAY — persist
          // right away so closing the tab mid-run keeps the unlock.
          persistNow();
        }
        lastPhase = s.phase;
      }
    },
    render(alpha: number, dtSec: number): void {
      if (pendingLockResume && capture.hasLock()) {
        pause.setHint(false);
        doResume();
      }
      const t0 = frameWorkStart ?? performance.now();
      frameWorkStart = null;
      const v = view.view();
      renderer.frame(v, sim.getState(), alpha, dtSec, audio.muted());
      if (pause.paused()) {
        drawPauseOverlay(v, pause.hint(), lowGlow);
      }
      // Per-frame WORK time (ticks + render) for the F3 overlay (§12.6),
      // over a rolling ~2 s window.
      workStats.push(performance.now() - t0);
      if (workStats.count() >= 120) {
        workStatsShown = workStats;
        workStats = createFrameStats();
      }
      if (fpsOverlay) {
        drawFrameTimeOverlay(v, workStatsShown, lowGlow);
      }
    },
  });
}
