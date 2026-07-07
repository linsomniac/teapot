// App-layer pause overlay (§10, D19): pause is NOT a sim state — while
// paused the app stops calling tick() entirely and replays stay
// pause-agnostic. Exists only while the sim is in PLAYING/GET_READY/WARP.

import type { CanvasView } from '../render/canvas';
import { pathText } from '../render/font';
import { strokeWithGlow } from '../render/glow';

export interface PauseController {
  paused(): boolean;
  lockWasHeld(): boolean; // was pointer lock held when the pause began?
  pause(lockHeld: boolean): void;
  resume(): void;
  setHint(show: boolean): void; // lock-request-rejected hint (§5)
  hint(): boolean;
}

export function createPause(): PauseController {
  let isPaused = false;
  let lockHeld = false;
  let showHint = false;
  return {
    paused: () => isPaused,
    lockWasHeld: () => lockHeld,
    pause(held: boolean): void {
      isPaused = true;
      lockHeld = held;
      showHint = false;
    },
    resume(): void {
      isPaused = false;
      showHint = false;
    },
    setHint(show: boolean): void {
      showHint = show;
    },
    hint: () => showHint,
  };
}

export function drawPauseOverlay(
  view: CanvasView,
  showHint: boolean,
  lowGlow: boolean,
): void {
  const { ctx, playfield: pf } = view;
  ctx.fillStyle = 'rgba(0, 0, 0, 0.55)'; // dim the game (§10)
  ctx.fillRect(0, 0, view.cssWidth, view.cssHeight);

  const big = pf.height * 0.06;
  const mid = pf.height * 0.026;
  const cx = pf.x + pf.width / 2;

  ctx.beginPath();
  pathText(ctx, 'PAUSED', cx, pf.y + pf.height * 0.4, big, 'center');
  strokeWithGlow(ctx, '#ffffff', 2, lowGlow);

  ctx.beginPath();
  pathText(
    ctx,
    'P OR CLICK: RESUME - Q: QUIT TO TITLE',
    cx,
    pf.y + pf.height * 0.52,
    mid,
    'center',
  );
  if (showHint) {
    pathText(
      ctx,
      'MOUSE LOCK REFUSED - CLICK AGAIN TO RETRY',
      cx,
      pf.y + pf.height * 0.6,
      mid,
      'center',
    );
  }
  strokeWithGlow(ctx, '#9fb4c8', 1.2, lowGlow);
}
