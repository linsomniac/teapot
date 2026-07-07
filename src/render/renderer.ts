// Frame renderer (§11.1): draws a SimState (+ previous-tick positions,
// interpolated by alpha) into the letterboxed playfield. Reads sim state;
// NEVER mutates it. Entities are added in Task 8.3, HUD/screens in 8.4.

import type { GameConfig } from '../sim/config';
import type { SimState } from '../sim/state';
import { interpRim, playerLane } from '../sim/well';
import type { Viewport } from '../sim/projection';
import type { CanvasView } from './canvas';
import { bandColors, CLAW_COLOR } from './palette';
import { drawClaw, drawLaneHighlight, drawWell } from './well';

export interface RenderOptions {
  lowGlow: boolean;
}

const IN_WELL_PHASES = new Set(['PLAYING', 'GET_READY', 'WARP', 'GAME_OVER']);

// Reused per-frame viewport object (allocation-free hot path, §11.1).
const vp: Viewport = { width: 0, height: 0 };

export function renderFrame(
  view: CanvasView,
  s: Readonly<SimState>,
  cfg: GameConfig,
  alpha: number,
  opts: RenderOptions,
): void {
  const { ctx, playfield } = view;

  // Clear the full canvas to black (letterbox bars included).
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, view.cssWidth, view.cssHeight);

  ctx.save();
  ctx.translate(playfield.x, playfield.y);
  vp.width = playfield.width;
  vp.height = playfield.height;

  if (IN_WELL_PHASES.has(s.phase)) {
    const g = cfg.geometries[s.geometryIndex]!;
    const colors = bandColors(s.paletteIndex);
    drawWell(ctx, g, vp, colors.well, opts.lowGlow);
    if (
      s.phase === 'PLAYING' ||
      s.phase === 'GET_READY' ||
      s.phase === 'WARP'
    ) {
      const lane = playerLane(s.rimPos, s.closed);
      drawLaneHighlight(ctx, g, vp, lane, colors.highlight, opts.lowGlow);
      // The claw rides the smooth interpolated rim position (§12.3);
      // during WARP it will also descend (warp zoom lands in Task 8.4).
      const rim = interpRim(s.prevRimPos, s.rimPos, alpha, s.closed);
      drawClaw(ctx, g, vp, rim, CLAW_COLOR, opts.lowGlow);
    }
    // Entities/shots/spikes/particles: Task 8.3. HUD + screens: Task 8.4.
  }

  ctx.restore();
}
