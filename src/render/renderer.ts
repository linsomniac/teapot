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
import { drawClaw, drawLaneHighlight, drawWell, pathLaneOutline } from './well';
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
  drawEnemies,
  drawShots,
  drawSpikes,
  ENEMY_COLORS,
  type EnemyDrawContext,
} from './entities';
import { createParticleSystem, type ParticleSystem } from './particles';
import { beginAdditiveFrame, endAdditiveFrame, strokeWithGlow } from './glow';

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

const IN_WELL_PHASES = new Set([
  'PLAYING',
  'EXPLODING',
  'GET_READY',
  'WARP',
  'GAME_OVER',
]);
const SUPERZAP_FX_TIME = 0.45; // seconds

export function createRenderer(cfg: GameConfig, opts: RenderOptions): Renderer {
  const particles = createParticleSystem(cfg.tuning.particlePoolCap);
  const vp: Viewport = { width: 0, height: 0 }; // reused every frame

  // Offscreen well cache: the well wireframe (rings + spokes, with its
  // glow) is static per level and is the largest stroked-pixel mass in a
  // frame. The cache is OPAQUE (black baked in) and blitted source-over
  // BEFORE the frame's additive block, so one plain copy serves as BOTH
  // the playfield clear and the well — visually identical, since the well
  // is the bottom layer over black where 'lighter' and source-over compose
  // the same (Task 13.1 bench bisect).
  const wellCache = document.createElement('canvas');
  const wellCacheCtx = wellCache.getContext('2d', { alpha: false })!;
  let wellCacheKey = '';

  function blitWell(
    view: CanvasView,
    s: Readonly<SimState>,
    pvp: Viewport,
  ): void {
    const g = cfg.geometries[s.geometryIndex]!;
    const colors = bandColors(s.paletteIndex);
    const key = `${s.geometryIndex}|${s.paletteIndex}|${pvp.width}x${pvp.height}|${view.dpr}|${opts.lowGlow}`;
    if (key !== wellCacheKey) {
      wellCacheKey = key;
      wellCache.width = Math.max(1, Math.round(pvp.width * view.dpr));
      wellCache.height = Math.max(1, Math.round(pvp.height * view.dpr));
      wellCacheCtx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
      // OPAQUE black base: the blit doubles as the playfield clear.
      wellCacheCtx.fillStyle = '#000';
      wellCacheCtx.fillRect(0, 0, pvp.width, pvp.height);
      wellCacheCtx.globalCompositeOperation = 'lighter';
      drawWell(wellCacheCtx, g, pvp, colors.well, opts.lowGlow);
      wellCacheCtx.globalCompositeOperation = 'source-over';
    }
    view.ctx.drawImage(wellCache, 0, 0, pvp.width, pvp.height);
  }
  const dc: EnemyDrawContext = { frame: 0, pulsarFlash: 0 };
  // Last drawn player position (canvas coords): EXPLODING hides the claw before
  // playerDied is consumed, so bursts anchor to where it was last DRAWN.
  const lastPlayerPos = { x: 0, y: 0, valid: false };
  const deathFx = { x: 0, y: 0, remaining: 0 };
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
              deathFx.x = lastPlayerPos.x;
              deathFx.y = lastPlayerPos.y;
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
              deathFx.x = view.playfield.x + rim.x;
              deathFx.y = view.playfield.y + rim.y;
            }
            deathFx.remaining = cfg.tuning.playerExplosionDuration;
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
      if (s.phase === 'EXPLODING') {
        // Follow sim time so pausing freezes the shock rings with the phase.
        deathFx.remaining = Math.max(0, s.deathTimer);
      } else if (deathFx.remaining > 0) {
        deathFx.remaining = Math.max(0, deathFx.remaining - dtSec);
      }
      if (superzapFx > 0) superzapFx = Math.max(0, superzapFx - dtSec);

      const inWell = IN_WELL_PHASES.has(s.phase);
      // The opaque well blit clears the playfield in non-zoomed play
      // phases; only the letterbox bars (and zoomed/off-well frames) need
      // the explicit clear.
      {
        ctx.fillStyle = '#000';
        if (!inWell || s.phase === 'WARP') {
          ctx.fillRect(0, 0, view.cssWidth, view.cssHeight);
        } else {
          const pf = playfield;
          if (pf.x > 0) {
            ctx.fillRect(0, 0, pf.x + 1, view.cssHeight);
            ctx.fillRect(pf.x + pf.width - 1, 0, view.cssWidth, view.cssHeight);
          }
          if (pf.y > 0) {
            ctx.fillRect(0, 0, view.cssWidth, pf.y + 1);
            ctx.fillRect(
              0,
              pf.y + pf.height - 1,
              view.cssWidth,
              view.cssHeight,
            );
          }
        }
      }

      ctx.save();
      ctx.translate(playfield.x, playfield.y);
      const pvp = playfieldVp(view);
      const colors = bandColors(s.paletteIndex);

      if (inWell) {
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

        // Opaque blit under source-over FIRST, then the additive block.
        blitWell(view, s, pvp);
        beginAdditiveFrame(ctx);
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
        // group in drawEnemies) and electrified lanes during the pulse.
        const phase = pulsePhase(s.pulseClock, params(s).pulse, cfg.tuning);
        dc.pulsarFlash =
          phase === 'telegraph' ? (dc.frame % 8 < 4 ? 0.85 : 0.3) : 0;
        if (phase === 'pulse') {
          // One batched stroke for ALL electrified lanes: every extra
          // large-bounding-box 'lighter' pass costs a full-canvas composite
          // on CPU-raster engines (Firefox/Linux).
          let any = false;
          for (const e of s.enemies) {
            if (e.kind === 'pulsar' && e.pulseJoined === true) {
              if (!any) ctx.beginPath();
              any = true;
              pathLaneOutline(ctx, g, pvp, e.lane);
            }
          }
          if (any) strokeWithGlow(ctx, '#d9fbff', 2.5, opts.lowGlow);
        }

        drawEnemies(
          ctx,
          s.enemies,
          g,
          pvp,
          alpha,
          dc,
          opts.lowGlow,
          cfg.tuning.flipperHalfHeight,
        );
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

      if (!inWell) beginAdditiveFrame(ctx);
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
        case 'EXPLODING':
          drawHud(ctx, playfield, s, colors, opts.lowGlow);
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

      // A brief hot flash and three expanding shock rings make player death
      // read as an animation rather than an instantaneous sprite removal.
      if (deathFx.remaining > 0) {
        const duration = cfg.tuning.playerExplosionDuration;
        const t = 1 - deathFx.remaining / duration;
        const fade = 1 - t;
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        if (t < 0.22) {
          ctx.globalAlpha = (1 - t / 0.22) * 0.75;
          ctx.fillStyle = '#fff4c2';
          ctx.beginPath();
          ctx.arc(deathFx.x, deathFx.y, 8 + t * 95, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.globalAlpha = fade;
        for (let i = 0; i < 3; i++) {
          const local = Math.max(0, t - i * 0.1);
          const radius = 12 + local * (90 + i * 28);
          ctx.beginPath();
          ctx.arc(deathFx.x, deathFx.y, radius, 0, Math.PI * 2);
          strokeWithGlow(
            ctx,
            i === 0 ? '#ffffff' : i === 1 ? '#ffd23b' : '#ff5a36',
            Math.max(1, 4 - i - t * 2),
            opts.lowGlow,
          );
        }
        ctx.restore();
      }

      // Superzapper full-screen effect: screen-wide flash + expanding line
      // burst (§11.1).
      if (superzapFx > 0) {
        const t = 1 - superzapFx / SUPERZAP_FX_TIME; // 0 → 1
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
      }

      endAdditiveFrame(ctx);
    },

    particles: () => particles,
  };
}
