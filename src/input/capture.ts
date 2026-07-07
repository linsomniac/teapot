// Keyboard/mouse/pointer-lock DOM wiring (§5/§10). Feeds the pure
// InputState (map.ts); behavior is verified via the §13 manual
// browser-integration checklist (Task 13.1).
//
// Binding table (§5/§10):
//   move    ←/→ arrows, A/D, pointer-locked mouse X
//   fire    Space, left mouse (locked)
//   zap     Z, right mouse
//   confirm Space or Enter (and a TITLE-only canvas click)
//   back    Escape (menu states only — see the single-owner rule)
//   quit    Q — app-layer at the key level; the pause overlay translates it
//           into snapshot.quit (unlike M/P/F3, which the sim never sees)

import type { Phase } from '../sim/types';
import type { InputState } from './map';

const MENU_PHASES: readonly Phase[] = [
  'TITLE',
  'LEVEL_SELECT',
  'HIGH_SCORE_ENTRY',
];
const PLAY_PHASES: readonly Phase[] = ['PLAYING', 'GET_READY', 'WARP'];

export interface CaptureHooks {
  phase(): Phase;
  paused(): boolean;
  onEscapePlay(): void; // Escape while the sim is in a play state → pause toggle
  onPauseKey(): void; // P
  onMuteKey(): void; // M
  onFpsKey(): void; // F3
  onQuitKey(): void; // Q (only the pause overlay acts on it)
  onPointerLockLost(): void; // auto-pause trigger (§5)
  onClickWhilePaused(): void; // resume-click handling (app decides; consumed)
  onGesture(): void; // any user gesture (audio unlock, §11.2)
}

export interface Capture {
  requestLock(): void;
  hasLock(): boolean;
  // Called by the app whenever the sim phase changes: exits any held lock
  // when the sim leaves PLAYING/GET_READY/WARP (§5).
  notifyPhase(phase: Phase): void;
  detach(): void;
}

export function attachCapture(
  canvas: HTMLCanvasElement,
  st: InputState,
  hooks: CaptureHooks,
): Capture {
  const hasLock = (): boolean => document.pointerLockElement === canvas;

  // Multiple bindings can hold one action (ArrowLeft + A; Space + locked
  // LMB): aggregate per source so releasing one doesn't clear the other.
  const leftHeld = new Set<string>();
  const rightHeld = new Set<string>();
  const fireHeld = new Set<string>();
  const syncHeld = (): void => {
    st.left = leftHeld.size > 0;
    st.right = rightHeld.size > 0;
    st.fire = fireHeld.size > 0;
  };

  function requestLockWith(
    options: { unadjustedMovement: boolean } | undefined,
  ): void {
    try {
      // Older engines return undefined instead of a Promise — handled
      // defensively (§5/§12.5).
      const request = canvas.requestPointerLock as (o?: unknown) => unknown;
      const ret = request.call(canvas, options);
      if (
        ret !== null &&
        typeof ret === 'object' &&
        typeof (ret as Promise<void>).then === 'function'
      ) {
        (ret as Promise<void>).catch((err: unknown) => {
          if (
            options !== undefined &&
            err instanceof Error &&
            err.name === 'NotSupportedError'
          ) {
            // unadjustedMovement unsupported → retry without it (§5).
            requestLockWith(undefined);
          }
          // Any other rejection (e.g. Chromium's post-Escape cooldown):
          // the game stays paused; the overlay shows a hint (Task 11.2).
        });
      }
    } catch {
      if (options !== undefined) requestLockWith(undefined);
    }
  }

  const requestLock = (): void => {
    requestLockWith({ unadjustedMovement: true });
  };

  function onKeyDown(e: KeyboardEvent): void {
    hooks.onGesture();
    const phase = hooks.phase();
    // While paused, only the overlay/global controls act (P/M/F3/Q, and
    // Escape's pause role); gameplay EDGES must not queue up and fire on
    // the first resumed tick. Held-state tracking continues so keys held
    // across the pause read correctly at resume.
    const paused = hooks.paused();
    switch (e.code) {
      case 'ArrowLeft':
      case 'KeyA':
        leftHeld.add(e.code);
        syncHeld();
        e.preventDefault();
        break;
      case 'ArrowRight':
      case 'KeyD':
        rightHeld.add(e.code);
        syncHeld();
        e.preventDefault();
        break;
      case 'Space':
        fireHeld.add(e.code);
        syncHeld();
        if (!e.repeat && !paused) st.confirmPressed = true; // confirm edge (C10)
        e.preventDefault();
        break;
      case 'Enter':
        if (!e.repeat && !paused) st.confirmPressed = true;
        break;
      case 'KeyZ':
        if (!e.repeat && !paused) st.zapPressed = true;
        break;
      case 'Escape':
        // Single-owner rule (§10): back in menu states, the app-layer
        // pause toggle in play states — never both on one keypress.
        if (!e.repeat) {
          if (MENU_PHASES.includes(phase)) {
            if (!paused) st.backPressed = true;
          } else if (PLAY_PHASES.includes(phase) && !paused && !hasLock()) {
            // Unlocked play only: a LOCKED Escape pauses via the
            // pointerlockchange event (§5 — the keydown may not even be
            // delivered), and a paused overlay resumes with P/click only.
            hooks.onEscapePlay();
          }
        }
        break;
      case 'KeyP':
        if (!e.repeat) hooks.onPauseKey();
        break;
      case 'KeyM':
        if (!e.repeat) hooks.onMuteKey();
        break;
      case 'F3':
        if (!e.repeat) hooks.onFpsKey();
        e.preventDefault();
        break;
      case 'KeyQ':
        if (!e.repeat) hooks.onQuitKey();
        break;
    }
  }

  function onKeyUp(e: KeyboardEvent): void {
    switch (e.code) {
      case 'ArrowLeft':
      case 'KeyA':
        leftHeld.delete(e.code);
        syncHeld();
        break;
      case 'ArrowRight':
      case 'KeyD':
        rightHeld.delete(e.code);
        syncHeld();
        break;
      case 'Space':
        fireHeld.delete(e.code);
        syncHeld();
        break;
    }
  }

  function onMouseDown(e: MouseEvent): void {
    hooks.onGesture();
    if (e.button === 2) {
      // Right mouse → Superzapper (context menu suppressed below); inert
      // while paused so the edge can't queue across the overlay.
      if (!hooks.paused()) st.zapPressed = true;
      e.preventDefault();
      return;
    }
    if (e.button !== 0) return;
    const phase = hooks.phase();
    if (hasLock() && !hooks.paused()) {
      // Locked UNPAUSED gameplay: left button IS fire. (Paused-but-still-
      // locked clicks fall through to the resume handler below.)
      fireHeld.add('Mouse0');
      syncHeld();
      e.preventDefault();
      return;
    }
    // Unlocked clicks are all CONSUMED (they never fire, §5):
    if (hooks.paused()) {
      hooks.onClickWhilePaused();
    } else if (phase === 'TITLE') {
      // Title-click carve-out (§10): confirm; never requests lock.
      st.confirmPressed = true;
    } else if (PLAY_PHASES.includes(phase)) {
      requestLock();
    }
    // Clicks on LEVEL_SELECT / HIGH_SCORE_ENTRY / GAME_OVER do nothing.
    e.preventDefault();
  }

  function onMouseUp(e: MouseEvent): void {
    if (e.button === 0) {
      fireHeld.delete('Mouse0');
      syncHeld();
    }
  }

  function onMouseMove(e: MouseEvent): void {
    if (hasLock()) {
      st.mouseDeltaPx += e.movementX;
    }
  }

  function onContextMenu(e: Event): void {
    e.preventDefault(); // right-click is the Superzapper (§5)
  }

  // Blur/visibility loss can swallow keyup events (Alt-Tab during the auto-
  // pause): drop all held state so resume never starts with a stuck key.
  function onFocusLost(): void {
    leftHeld.clear();
    rightHeld.clear();
    fireHeld.clear();
    syncHeld();
  }

  // Auto-pause only when a PREVIOUSLY-HELD lock disappears: a rejected
  // request (Firefox's unadjustedMovement NotSupportedError fires
  // pointerlockerror while the fallback is in flight; Chromium's post-
  // Escape cooldown) never held the lock, so it must not pause a normal
  // click-to-lock attempt.
  let hadLock = false;
  function onLockChange(): void {
    const now = hasLock();
    if (now && !PLAY_PHASES.includes(hooks.phase())) {
      // A lock granted AFTER the sim left the play states (the request is
      // async) must not survive onto a menu screen (§5).
      hadLock = true;
      document.exitPointerLock();
      return;
    }
    if (!now && hadLock) {
      // The locked mouse button's mouseup may have been swallowed with the
      // lock: release it so resume can't auto-fire without a fresh
      // mousedown (§5).
      fireHeld.delete('Mouse0');
      syncHeld();
      if (PLAY_PHASES.includes(hooks.phase()) && !hooks.paused()) {
        // Lock lost for ANY reason (Escape, focus loss): auto-pause via
        // the events — never by assuming the keydown arrived (§5).
        hooks.onPointerLockLost();
      }
    }
    hadLock = now;
  }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  canvas.addEventListener('mousedown', onMouseDown);
  window.addEventListener('mouseup', onMouseUp);
  window.addEventListener('mousemove', onMouseMove);
  canvas.addEventListener('contextmenu', onContextMenu);
  document.addEventListener('pointerlockchange', onLockChange);
  document.addEventListener('pointerlockerror', onLockChange);
  window.addEventListener('blur', onFocusLost);
  document.addEventListener('visibilitychange', onFocusLost);

  return {
    requestLock,
    hasLock,
    notifyPhase(phase: Phase): void {
      if (!PLAY_PHASES.includes(phase) && hasLock()) {
        document.exitPointerLock(); // §5: lock is gameplay-only
      }
    },
    detach(): void {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      canvas.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mouseup', onMouseUp);
      window.removeEventListener('mousemove', onMouseMove);
      canvas.removeEventListener('contextmenu', onContextMenu);
      document.removeEventListener('pointerlockchange', onLockChange);
      document.removeEventListener('pointerlockerror', onLockChange);
      window.removeEventListener('blur', onFocusLost);
      document.removeEventListener('visibilitychange', onFocusLost);
    },
  };
}
