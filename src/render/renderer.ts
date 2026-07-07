// Frame renderer (§11.1): draws a SimState (+ previous-tick positions,
// interpolated by alpha) into the letterboxed playfield. Reads sim state;
// NEVER mutates it. Stateful render-side effects (particles, Superzapper
// FX, shimmer clocks) live in the createRenderer closure with their own
// RNG stream — sim determinism is untouched.

import type { GameConfig } from '../sim/config';
import type { SimState } from '../sim/state';
import type { SimEvent } from '../sim/types';
import { interpRim, playerLane } from '../sim/well';
import { project, type Viewport } from '../sim/projection';
import { paramsForLevel, type LevelParams } from '../sim/difficultyCurve';
import { pulsePhase } from '../sim/enemies/pulsar';
import type { CanvasView } from './canvas';
import { bandColors, CLAW_COLOR } from './palette';
import { drawClaw, drawLaneHighlight, drawWell } from './well';
import { drawHud } from './hud';
import {
  drawAvoidSpikes,
  drawGameOver,
  drawGetReady,
  drawHighScoreEntry,
  drawLevelSelect,
  drawTitle,
} from './screens';
import {
  drawEnemy,
  drawShots,
  drawSpikes,
  ENEMY_COLORS,
  type EnemyDrawContext,
} from './entities';
import { createParticleSystem, type ParticleSystem } from './particles';
import { strokeWithGlow } from './glow';

export interface RenderOptions {
  lowGlow: boolean;
}

export interface Renderer {
  // Consume this tick's sim events (bursts, Superzapper FX). Call once per
  // sim tick, before the frame is drawn.
  onEvents(
    events: readonly SimEvent[],
    s: Readonly<SimState>,
    view: CanvasView,
  ): void;
  // Draw one frame; dtSec is the wall-clock frame delta for render-side FX;
  // muted drives the title-screen mute indicator (§10).
  frame(
    view: CanvasView,
    s: Readonly<SimState>,
    alpha: number,
    dtSec: number,
    muted: boolean,
  ): void;
  particles(): ParticleSystem;
}

const IN_WELL_PHASES = new Set(['PLAYING', 'GET_READY', 'WARP', 'GAME_OVER']);
const SUPERZAP_FX_TIME = 0.45; // seconds

export function createRenderer(cfg: GameConfig, opts: RenderOptions): Renderer {
  const particles = createParticleSystem(cfg.tuning.particlePoolCap);
  const vp: Viewport = { width: 0, height: 0 }; // reused every frame
  const dc: EnemyDrawContext = { frame: 0, pulsarFlash: 0 };
  // Last drawn player position (canvas coords): resolveDeath may have
  // already advanced levels by the time playerDied is consumed (WARP spike
  // deaths), so bursts anchor to where the player was last DRAWN.
  const lastPlayerPos = { x: 0, y: 0, valid: false };
  let superzapFx = 0; // seconds remaining
  let cachedLevel = -1;
  let cachedParams: LevelParams | null = null;

  function params(s: Readonly<SimState>): LevelParams {
    if (s.level !== cachedLevel) {
      cachedParams = paramsForLevel(s.level, cfg.difficulty);
      cachedLevel = s.level;
    }
    return cachedParams!;
  }

  function playfieldVp(view: CanvasView): Viewport {
    vp.width = view.playfield.width;
    vp.height = view.playfield.height;
    return vp;
  }

  return {
    onEvents(events, s, view): void {
      const g = cfg.geometries[s.geometryIndex]!;
      const pvp = playfieldVp(view);
      for (const ev of events) {
        switch (ev.type) {
          case 'enemyKilled': {
            const p = project(ev.lane, ev.depth, g, pvp);
            const color =
              ev.kind === 'fuseball' ? '#ffd23b' : ENEMY_COLORS[ev.kind];
            particles.burst(
              view.playfield.x + p.x,
              view.playfield.y + p.y,
              color,
              18,
              170,
            );
            break;
          }
          case 'playerDied': {
            if (lastPlayerPos.valid) {
              particles.playerDeathBurst(lastPlayerPos.x, lastPlayerPos.y);
            } else {
              const rim = project(
                playerLane(s.rimPos, s.closed),
                s.warpDepth,
                g,
                pvp,
              );
              particles.playerDeathBurst(
                view.playfield.x + rim.x,
                view.playfield.y + rim.y,
              );
            }
            break;
          }
          case 'superzap':
            superzapFx = SUPERZAP_FX_TIME;
            break;
          default:
            break; // audio-only events
        }
      }
    },

    frame(view, s, alpha, dtSec, muted): void {
      const { ctx, playfield } = view;
      dc.frame++;
      particles.update(dtSec);
      if (superzapFx > 0) superzapFx = Math.max(0, superzapFx - dtSec);

      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, view.cssWidth, view.cssHeight);

      ctx.save();
      ctx.translate(playfield.x, playfield.y);
      const pvp = playfieldVp(view);
      const colors = bandColors(s.paletteIndex);

      if (IN_WELL_PHASES.has(s.phase)) {
        const g = cfg.geometries[s.geometryIndex]!;
        const wd = s.prevWarpDepth + (s.warpDepth - s.prevWarpDepth) * alpha;

        // Warp zoom (§11.1, criterion 12(g)): scale the whole well toward
        // the vanishing point as warpDepth advances — the rim shrinks into
        // the screen and the descent reads as flying down the tube.
        let zoomK = 1;
        let zoomVanX = 0;
        let zoomVanY = 0;
        if (s.phase === 'WARP') {
          const vs = Math.min(pvp.width / 1440, pvp.height / 1080);
          zoomVanX = pvp.width / 2 + g.vanishing.x * vs;
          zoomVanY = pvp.height / 2 + g.vanishing.y * vs;
          zoomK = 1 - 0.55 * wd;
          ctx.translate(zoomVanX, zoomVanY);
          ctx.scale(zoomK, zoomK);
          ctx.translate(-zoomVanX, -zoomVanY);
        }

        drawWell(ctx, g, pvp, colors.well, opts.lowGlow);
        drawSpikes(ctx, s.spikes, g, pvp, opts.lowGlow);

        if (
          s.phase === 'PLAYING' ||
          s.phase === 'GET_READY' ||
          s.phase === 'WARP'
        ) {
          const lane = playerLane(s.rimPos, s.closed);
          drawLaneHighlight(ctx, g, pvp, lane, colors.highlight, opts.lowGlow);
          const rim = interpRim(s.prevRimPos, s.rimPos, alpha, s.closed);
          drawClaw(ctx, g, pvp, rim, wd, CLAW_COLOR, opts.lowGlow);
          // Cache where the claw was actually DRAWN — through the warp
          // zoom transform when active — for death-burst anchoring.
          const clawPoint = project(rim, wd, g, pvp);
          const drawnX = zoomVanX + (clawPoint.x - zoomVanX) * zoomK;
          const drawnY = zoomVanY + (clawPoint.y - zoomVanY) * zoomK;
          lastPlayerPos.x = playfield.x + drawnX;
          lastPlayerPos.y = playfield.y + drawnY;
          lastPlayerPos.valid = true;
        }

        // Pulsar telegraph flash (participating Pulsars only, applied per
        // enemy in drawEnemy) and electrified lanes during the pulse.
        const phase = pulsePhase(s.pulseClock, params(s).pulse, cfg.tuning);
        dc.pulsarFlash =
          phase === 'telegraph' ? (dc.frame % 8 < 4 ? 0.85 : 0.3) : 0;
        if (phase === 'pulse') {
          for (const e of s.enemies) {
            if (e.kind === 'pulsar' && e.pulseJoined === true) {
              drawLaneHighlight(ctx, g, pvp, e.lane, '#d9fbff', opts.lowGlow);
            }
          }
        }

        for (const e of s.enemies) {
          drawEnemy(ctx, e, g, pvp, alpha, dc, opts.lowGlow);
        }
        drawShots(
          ctx,
          s.playerShots,
          s.enemyShots,
          g,
          pvp,
          alpha,
          opts.lowGlow,
        );
      }

      ctx.restore();

      // HUD + screens draw un-zoomed, over the well (§10/§11.1).
      switch (s.phase) {
        case 'TITLE':
          drawTitle(ctx, playfield, s, colors, muted, opts.lowGlow);
          break;
        case 'LEVEL_SELECT':
          drawLevelSelect(ctx, playfield, s, colors, opts.lowGlow);
          break;
        case 'HIGH_SCORE_ENTRY':
          drawHighScoreEntry(ctx, playfield, s, colors, dc.frame, opts.lowGlow);
          break;
        case 'GET_READY':
          drawHud(ctx, playfield, s, colors, opts.lowGlow);
          drawGetReady(ctx, playfield, opts.lowGlow);
          break;
        case 'GAME_OVER':
          drawHud(ctx, playfield, s, colors, opts.lowGlow);
          drawGameOver(ctx, playfield, opts.lowGlow);
          break;
        case 'WARP':
          drawHud(ctx, playfield, s, colors, opts.lowGlow);
          // Flashes at descent start while spikes remain (§9).
          if (s.spikes.length > 0 && s.warpDepth < 0.35) {
            drawAvoidSpikes(ctx, playfield, dc.frame, opts.lowGlow);
          }
          break;
        case 'PLAYING':
          drawHud(ctx, playfield, s, colors, opts.lowGlow);
          break;
      }

      // Particles live in canvas coordinates (they outlive well transforms).
      particles.draw(ctx, opts.lowGlow);

      // Superzapper full-screen effect: screen-wide flash + expanding line
      // burst (§11.1).
      if (superzapFx > 0) {
        const t = 1 - superzapFx / SUPERZAP_FX_TIME; // 0 → 1
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 0.35 * (1 - t);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, view.cssWidth, view.cssHeight);
        ctx.globalAlpha = 1;
        const cx = playfield.x + playfield.width / 2;
        const cy = playfield.y + playfield.height / 2;
        const r0 = t * playfield.width * 0.55;
        const r1 = r0 + playfield.width * 0.08 * (1 - t);
        ctx.beginPath();
        for (let i = 0; i < 24; i++) {
          const ang = (i / 24) * 2 * Math.PI;
          ctx.moveTo(cx + Math.cos(ang) * r0, cy + Math.sin(ang) * r0);
          ctx.lineTo(cx + Math.cos(ang) * r1, cy + Math.sin(ang) * r1);
        }
        strokeWithGlow(ctx, '#ffffff', 2, opts.lowGlow);
        ctx.restore();
      }
    },

    particles: () => particles,
  };
}
