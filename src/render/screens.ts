// Screens (§10/§11.1): title, level select, GET READY, game over,
// high-score entry, and the warp "AVOID SPIKES" flash. All canvas-drawn
// stroke lettering — any glyph used here must exist in font.ts (Task 8.1).

import type { SimState } from '../sim/state';
import { HS_CHARSET } from '../sim/highscore';
import { maxStartLevel } from '../sim/state';
import type { PlayfieldRect } from './canvas';
import { pathText, textWidth } from './font';
import { strokeWithGlow } from './glow';
import type { BandColors } from './palette';
import { CLAW_COLOR } from './palette';

function line(
  ctx: CanvasRenderingContext2D,
  pf: PlayfieldRect,
  text: string,
  yFrac: number,
  size: number,
): void {
  pathText(
    ctx,
    text,
    pf.x + pf.width / 2,
    pf.y + pf.height * yFrac,
    size,
    'center',
  );
}

export function drawTitle(
  ctx: CanvasRenderingContext2D,
  pf: PlayfieldRect,
  s: Readonly<SimState>,
  colors: BandColors,
  muted: boolean,
  lowGlow: boolean,
): void {
  const big = pf.height * 0.09;
  const mid = pf.height * 0.03;
  const small = pf.height * 0.022;

  ctx.beginPath();
  line(ctx, pf, 'TEAPOT', 0.12, big);
  strokeWithGlow(ctx, CLAW_COLOR, 2.5, lowGlow);

  ctx.beginPath();
  line(ctx, pf, 'PRESS FIRE OR CLICK TO START', 0.28, mid);
  strokeWithGlow(ctx, '#ffffff', 1.5, lowGlow);

  // Top-10 high-score table.
  ctx.beginPath();
  line(ctx, pf, 'HIGH SCORES', 0.36, mid);
  const rows = s.highScores.slice(0, 10);
  for (let i = 0; i < rows.length; i++) {
    const e = rows[i]!;
    const y = 0.42 + i * 0.033;
    const text = `${e.initials.padEnd(3, ' ')}  ${String(e.score).padStart(7, ' ')}  L${e.level}`;
    line(ctx, pf, text, y, small);
  }
  if (rows.length === 0) {
    line(ctx, pf, 'NO SCORES YET', 0.44, small);
  }
  strokeWithGlow(ctx, colors.text, 1.2, lowGlow);

  // Control summary + reserved keys + mute indicator (§10).
  ctx.beginPath();
  line(
    ctx,
    pf,
    'ARROWS OR MOUSE: MOVE - SPACE: FIRE - Z: SUPERZAPPER',
    0.82,
    small,
  );
  line(ctx, pf, 'M: MUTE - P: PAUSE - ESC: BACK - F3: FPS', 0.86, small);
  if (muted) {
    line(ctx, pf, 'MUTED', 0.92, mid);
  }
  strokeWithGlow(ctx, '#9fb4c8', 1.2, lowGlow);
}

export function drawLevelSelect(
  ctx: CanvasRenderingContext2D,
  pf: PlayfieldRect,
  s: Readonly<SimState>,
  colors: BandColors,
  lowGlow: boolean,
): void {
  const big = pf.height * 0.05;
  const mid = pf.height * 0.03;
  ctx.beginPath();
  line(ctx, pf, 'SELECT STARTING LEVEL', 0.3, mid);
  strokeWithGlow(ctx, '#ffffff', 1.5, lowGlow);

  ctx.beginPath();
  line(ctx, pf, String(s.selector), 0.42, big);
  strokeWithGlow(ctx, colors.highlight, 2.5, lowGlow);

  ctx.beginPath();
  line(ctx, pf, `1 TO ${maxStartLevel(s)}`, 0.54, mid);
  line(
    ctx,
    pf,
    'LEFT-RIGHT: CHANGE - FIRE: START - ESC: BACK',
    0.64,
    mid * 0.8,
  );
  strokeWithGlow(ctx, '#9fb4c8', 1.2, lowGlow);
}

export function drawGetReady(
  ctx: CanvasRenderingContext2D,
  pf: PlayfieldRect,
  lowGlow: boolean,
): void {
  ctx.beginPath();
  line(ctx, pf, 'GET READY', 0.45, pf.height * 0.06);
  strokeWithGlow(ctx, '#ffffff', 2, lowGlow);
}

export function drawGameOver(
  ctx: CanvasRenderingContext2D,
  pf: PlayfieldRect,
  lowGlow: boolean,
): void {
  ctx.beginPath();
  line(ctx, pf, 'GAME OVER', 0.45, pf.height * 0.08);
  strokeWithGlow(ctx, '#ff4136', 2.5, lowGlow);
}

// Flashing warp warning (§9/§10): shown at descent start while spikes remain.
export function drawAvoidSpikes(
  ctx: CanvasRenderingContext2D,
  pf: PlayfieldRect,
  frame: number,
  lowGlow: boolean,
): void {
  if (frame % 30 >= 15) return; // flash
  ctx.beginPath();
  line(ctx, pf, 'AVOID SPIKES', 0.3, pf.height * 0.05);
  strokeWithGlow(ctx, '#3bef62', 2, lowGlow);
}

export function drawHighScoreEntry(
  ctx: CanvasRenderingContext2D,
  pf: PlayfieldRect,
  s: Readonly<SimState>,
  colors: BandColors,
  frame: number,
  lowGlow: boolean,
): void {
  const big = pf.height * 0.07;
  const mid = pf.height * 0.03;
  ctx.beginPath();
  line(ctx, pf, 'NEW HIGH SCORE!', 0.24, mid * 1.3);
  line(ctx, pf, String(s.score), 0.32, mid);
  line(ctx, pf, 'ENTER YOUR INITIALS', 0.42, mid);
  strokeWithGlow(ctx, colors.text, 1.5, lowGlow);

  // The three slots; the active one blinks.
  const slotW = textWidth('W', big) * 1.6;
  const cx = pf.x + pf.width / 2;
  const y = pf.y + pf.height * 0.5;
  for (let i = 0; i < 3; i++) {
    const ch = HS_CHARSET[s.hsInitials[i] ?? 1] ?? 'A';
    const x = cx + (i - 1) * slotW;
    const active = i === s.hsSlot;
    if (!active || frame % 20 < 12) {
      ctx.beginPath();
      pathText(ctx, ch, x, y, big, 'center');
      strokeWithGlow(ctx, active ? '#ffffff' : colors.text, 2, lowGlow);
    }
    ctx.beginPath();
    ctx.moveTo(x - slotW * 0.3, y + big * 1.15);
    ctx.lineTo(x + slotW * 0.3, y + big * 1.15);
    strokeWithGlow(ctx, active ? '#ffffff' : '#556575', 1.5, lowGlow);
  }

  ctx.beginPath();
  line(ctx, pf, 'LEFT-RIGHT: LETTER - FIRE: LOCK - ESC: BACK', 0.68, mid * 0.8);
  strokeWithGlow(ctx, '#9fb4c8', 1.2, lowGlow);
}
