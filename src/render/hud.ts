// HUD (§10/§11.1): score (top left), high score (top center), lives and
// Superzapper pips, level number — always visible during play.

import type { SimState } from '../sim/state';
import type { PlayfieldRect } from './canvas';
import { pathText } from './font';
import { strokeWithGlow } from './glow';
import type { BandColors } from './palette';

export function drawHud(
  ctx: CanvasRenderingContext2D,
  pf: PlayfieldRect,
  s: Readonly<SimState>,
  colors: BandColors,
  lowGlow: boolean,
): void {
  const size = Math.max(12, pf.height * 0.032);
  const top = pf.y + size * 0.6;
  const hi = s.highScores.length > 0 ? s.highScores[0]!.score : 0;

  // ONE stroke pass for the whole HUD (text + life chevrons + zapper
  // pips): each extra wide-bbox 'lighter' pass costs a full composite on
  // CPU-raster engines. The claw-yellow accents move to the band text
  // color — identity carried by shape and position.
  ctx.beginPath();
  pathText(ctx, String(s.score), pf.x + size, top, size, 'left');
  pathText(
    ctx,
    `HI ${Math.max(hi, s.score)}`,
    pf.x + pf.width / 2,
    top,
    size,
    'center',
  );
  pathText(ctx, `LVL ${s.level}`, pf.x + pf.width - size, top, size, 'right');

  // Lives: one small chevron per remaining life (left, under the score).
  const y2 = top + size * 1.6;
  const chev = size * 0.5;
  for (let i = 0; i < s.lives; i++) {
    const x = pf.x + size + i * chev * 2.2;
    ctx.moveTo(x, y2);
    ctx.lineTo(x + chev * 0.7, y2 + chev);
    ctx.lineTo(x + chev * 1.4, y2);
  }

  // Superzapper pips: one diamond per remaining use (right, under level).
  for (let i = 0; i < s.superzapper; i++) {
    const x = pf.x + pf.width - size - i * chev * 2.2;
    const cy = y2 + chev / 2;
    ctx.moveTo(x, cy - chev * 0.6);
    ctx.lineTo(x + chev * 0.5, cy);
    ctx.lineTo(x, cy + chev * 0.6);
    ctx.lineTo(x - chev * 0.5, cy);
    ctx.lineTo(x, cy - chev * 0.6);
  }
  strokeWithGlow(ctx, colors.text, 1.5, lowGlow);
}
