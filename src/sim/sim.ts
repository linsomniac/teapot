// createSim: the tick() entry point (§12.2). The sim is constructed from an
// injected GameConfig + seed (+ optional InitialSave, I14) and advances ONLY
// via tick(inputSnapshot) — no browser APIs, no wall clock, no entropy.

import { TICK_SEC } from './types';
import type { Enemy, InputSnapshot, Shot, SimEvent, Spike } from './types';
import type { GameConfig } from './config';
import { validateConfig } from './config';
import { makeRng } from './rng';
import { geometryIndexForLevel, paletteIndexForLevel } from './levels';
import { clampRimDelta, normalizeRimPos, playerLane } from './well';
import { paramsForLevel, type LevelParams } from './difficultyCurve';
import { advanceShots, fireEnemyShots } from './enemies/shots';
import { flipperAtRim, occupancyLane, updateFlipper } from './enemies/flipper';
import { splitTanker, updateTanker } from './enemies/tanker';
import { trimOrKill, updateSpiker } from './enemies/spiker';
import { updateFuseball } from './enemies/fuseball';
import { pulsePhase, updatePulsar } from './enemies/pulsar';
import { updateSpawner } from './spawner';
import { activateSuperzapper } from './superzapper';
import { sweptOverlap } from './collision';
import { applyScore, levelClearBonus, pointsForKill } from './scoring';
import { hashState } from './hash';
import {
  applyQuit,
  enterWarp,
  resolveDeath,
  transition,
  type InitialSave,
  type SimState,
} from './state';

export type { InitialSave, SimState } from './state';

export interface Sim {
  tick(input: InputSnapshot): { events: SimEvent[] };
  getState(): Readonly<SimState>;
  hash(): number;
}

const DEFAULT_SAVE: InitialSave = { maxLevelReached: 1, highScores: [] };

function makeInitialState(
  cfg: GameConfig,
  seed: number,
  save: InitialSave,
): SimState {
  const maxLevelReached = Math.max(1, Math.floor(save.maxLevelReached));
  const geometryIndex = geometryIndexForLevel(1);
  const s: SimState = {
    phase: 'TITLE',
    level: 1,
    score: 0,
    lives: cfg.tuning.startingLives,
    livesGranted: 0,
    rimPos: 8,
    prevRimPos: 8,
    warpDepth: 0,
    prevWarpDepth: 0,
    closed: cfg.geometries[geometryIndex]!.closed,
    geometryIndex,
    paletteIndex: paletteIndexForLevel(1),
    enemies: [],
    playerShots: [],
    enemyShots: [],
    spikes: [],
    budget: { flipper: 0, tanker: 0, spiker: 0, fuseball: 0, pulsar: 0 },
    superzapper: 2,
    spawnTimer: 0,
    pulseClock: 0,
    getReadyTimer: 0,
    beatTimer: 0,
    fireCooldown: 0,
    maxLevelReached,
    selector: 1, // LEVEL_SELECT opens at level 1 (§10)
    selectorAccum: 0,
    selectorTimer: 0,
    hsInitials: [1, 1, 1],
    hsSlot: 0,
    highScores: save.highScores.map((e) => ({ ...e })),
    rng: makeRng(seed),
  };
  return s;
}

// §6 tick-resolution order for the combat states (PLAYING and WARP alike).
// Steps are ordered function calls; most are no-ops until their tasks land
// (Tasks 3.2–5.x). benchMode (census-hold, §12.6) suppresses death/despawn/
// wave-completion in the steps that consult it; it lives in the Sim closure —
// never in SimState, so it is never hashed — and is always false on the real
// play path.
function tickCombat(
  s: SimState,
  input: InputSnapshot,
  cfg: GameConfig,
  ctx: TickCtx,
  events: SimEvent[],
  benchMode: boolean,
): void {
  const params = paramsForLevel(s.level, cfg.difficulty);
  stepApplyInput(s, input, cfg, events, benchMode); // 1 (Task 3.2)
  stepAdvanceEntities(s, cfg, params, events, benchMode); // 2 (Tasks 3.2/4.x)
  stepPlayerShotCollisions(s, cfg, params, ctx, events, benchMode); // 3 (Tasks 3.2/4.x)
  stepEnemyShotLethality(s, cfg, ctx, events, benchMode); // 4 (Task 4.6)
  stepContactLethality(s, cfg, params, ctx, events, benchMode); // 5 (Tasks 4.x/5.2)
  stepBonusLife(s, cfg, ctx, events); // 6 (Task 3.3)
  stepSpawner(s, cfg, params, events); // 7 (Task 4.7)
  stepWaveCompletion(s, cfg, ctx, events, benchMode); // 8 (Task 5.1)
  // 9: state transitions — runs for every phase in tick() below.
}

interface TickCtx {
  points: number; // kill points from steps 3–5, granted in step 6
  playerDied: boolean; // set by steps 4–5
}

// Step 1 (§6): apply the input snapshot — movement, fire, zap.
function stepApplyInput(
  s: SimState,
  input: InputSnapshot,
  cfg: GameConfig,
  events: SimEvent[],
  benchMode: boolean,
): void {
  // Movement: input.move arrives pre-clamped by the input layer (§12.3);
  // re-clamp defensively so no snapshot can ever skip a lane (§4).
  const delta = clampRimDelta(input.move, cfg.tuning.perTickClamp);
  s.rimPos = normalizeRimPos(s.rimPos + delta, s.closed);

  // Firing (§5): one shot per fireInterval, ≤ maxPlayerShots in flight;
  // holding fire auto-fires at the cap. Shots spawn at the player's current
  // depth — 0 in PLAYING, the Blaster's descent depth during WARP.
  s.fireCooldown = Math.max(0, s.fireCooldown - TICK_SEC);
  if (
    input.fire &&
    s.fireCooldown <= 0 &&
    s.playerShots.length < cfg.tuning.maxPlayerShots
  ) {
    const lane = playerLane(s.rimPos, s.closed);
    const depth = s.phase === 'WARP' ? s.warpDepth : 0;
    s.playerShots.push({ lane, depth, prevDepth: depth });
    s.fireCooldown = cfg.tuning.fireInterval;
    events.push({ type: 'playerShot' });
  }

  // Superzapper (§5): accepted only in the PLAYING state — not GET_READY
  // (no combat pipeline there) and not WARP (this step runs for WARP too).
  // benchMode holds the census (§12.6): zap is a kill path, so it no-ops.
  if (input.zap && s.phase === 'PLAYING' && !benchMode) {
    activateSuperzapper(s, events);
  }
}

// Step 2 (§6): advance all entities and shots.
function stepAdvanceEntities(
  s: SimState,
  cfg: GameConfig,
  params: LevelParams,
  events: SimEvent[],
  benchMode: boolean,
): void {
  // Pulse clock (§6.5): runs on PLAYING sim time only; participation is
  // decided at each telegraph start (later spawns join the next cycle) and
  // cleared when the cycle wraps back to quiet.
  if (s.phase === 'PLAYING') {
    // Clock 0 (fresh PLAYING entry) counts as quiet even for a zero-quiet
    // cycle (pulseCycle === telegraph + duration, legal per §8.3), so the
    // first telegraph still registers as a start (codex P3).
    const prevPhase =
      s.pulseClock === 0
        ? 'quiet'
        : pulsePhase(s.pulseClock, params.pulse, cfg.tuning);
    s.pulseClock += TICK_SEC;
    const newPhase = pulsePhase(s.pulseClock, params.pulse, cfg.tuning);
    if (newPhase !== prevPhase) {
      if (newPhase === 'telegraph') {
        // The telegraph event fires only when a Pulsar actually joins —
        // params.pulse is defined (normalized) even on pre-Pulsar levels,
        // and a participant-free telegraph would be a spurious SFX cue.
        let joined = false;
        for (const e of s.enemies) {
          if (e.kind === 'pulsar') {
            e.pulseJoined = true;
            joined = true;
          }
        }
        if (joined) events.push({ type: 'pulseTelegraph' });
      } else if (newPhase === 'quiet') {
        for (const e of s.enemies) {
          if (e.kind === 'pulsar') e.pulseJoined = false;
        }
      }
    }
  }

  // Warp descent (§9): the Blaster flies down the well at descentSpeed.
  if (s.phase === 'WARP') {
    s.warpDepth = Math.min(1, s.warpDepth + cfg.tuning.descentSpeed * TICK_SEC);
  }

  advanceShots(s.playerShots, cfg.tuning.shotSpeed, 1); // rim → bottom
  advanceShots(s.enemyShots, params.eshot, -1); // bottom → rim
  let rimSplitTankers: Enemy[] | null = null;
  for (const e of s.enemies) {
    const wasFlipping = e.flip !== null;
    switch (e.kind) {
      case 'flipper':
        updateFlipper(e, s, params, cfg);
        break;
      case 'tanker':
        if (updateTanker(e, params, cfg) && !benchMode) {
          // Rim self-split (§6.2): non-lethal, scores 0. Suppressed in
          // benchMode so the census composition holds (§12.6).
          (rimSplitTankers ??= []).push(e);
        }
        break;
      case 'spiker':
        updateSpiker(e, s, params, cfg);
        break;
      case 'fuseball':
        updateFuseball(e, s, params, cfg);
        break;
      case 'pulsar':
        updatePulsar(e, s, params, cfg);
        break;
    }
    if (!wasFlipping && e.flip !== null) {
      events.push({ type: 'flip' });
    }
  }
  if (rimSplitTankers !== null) {
    const splitting = new Set(rimSplitTankers);
    s.enemies = s.enemies.filter((e) => !splitting.has(e));
    for (const t of rimSplitTankers) {
      s.enemies.push(...splitTanker(t, s, params, events));
    }
  }
  // Enemy firing (§6): after movement, so eligibility (depth, mid-flip)
  // reflects this tick's positions. Newly fired shots first advance next
  // tick (prev === curr at spawn).
  fireEnemyShots(s, params, cfg, events);
}

// Kill an enemy with a player shot (step 3): score by kill depth, emit the
// death event. Per-kind on-kill behavior (Tanker split, Task 4.2) hooks in
// here.
function killEnemyByShot(
  s: SimState,
  e: Enemy,
  cfg: GameConfig,
  params: LevelParams,
  ctx: TickCtx,
  events: SimEvent[],
): void {
  ctx.points += pointsForKill(e.kind, e.depth, cfg.scoring);
  events.push({
    type: 'enemyKilled',
    kind: e.kind,
    lane: occupancyLane(e, s.closed),
    depth: e.depth,
  });
  if (e.kind === 'tanker') {
    // Shot split (§6.2): the released Flippers join the well immediately —
    // shootable on the Tanker's lane during their first flip halves, even
    // by another shot this same tick.
    s.enemies.push(...splitTanker(e, s, params, events));
  }
}

// Step 3 (§6): player-shot collisions — the single per-shot nearest-target
// resolution pass. Each shot picks the nearest-depth target on its lane
// (enemy, enemy shot, or spike tip — Task 4.3) and is CONSUMED by it; it
// never pierces (§6). Per-enemy tasks plug their entities into this one
// pass. benchMode (census-hold, §12.6): enemies are invulnerable — the
// whole resolution is skipped.
function stepPlayerShotCollisions(
  s: SimState,
  cfg: GameConfig,
  params: LevelParams,
  ctx: TickCtx,
  events: SimEvent[],
  benchMode: boolean,
): void {
  if (!benchMode && s.playerShots.length > 0) {
    const he = cfg.tuning.halfExtents;
    const killedEnemies = new Set<Enemy>();
    const killedShots = new Set<Shot>();
    const consumed = new Set<Shot>();

    for (const shot of s.playerShots) {
      // Nearest-depth surviving enemy on the shot's occupancy lane.
      let hitEnemy: Enemy | null = null;
      for (const e of s.enemies) {
        if (killedEnemies.has(e)) continue;
        if (occupancyLane(e, s.closed) !== shot.lane) continue;
        if (
          !sweptOverlap(
            shot.prevDepth,
            shot.depth,
            he.shot,
            e.prevDepth,
            e.depth,
            he.enemy,
          )
        ) {
          continue;
        }
        if (hitEnemy === null || e.depth < hitEnemy.depth) hitEnemy = e;
      }
      // Nearest-depth surviving enemy shot on the lane (shot-vs-shot, §6.6).
      let hitShot: Shot | null = null;
      for (const es of s.enemyShots) {
        if (killedShots.has(es)) continue;
        if (es.lane !== shot.lane) continue;
        if (
          !sweptOverlap(
            shot.prevDepth,
            shot.depth,
            he.shot,
            es.prevDepth,
            es.depth,
            he.shot,
          )
        ) {
          continue;
        }
        if (hitShot === null || es.depth < hitShot.depth) hitShot = es;
      }
      // Spike tip on the lane (§6.3) — at most one spike per lane.
      let hitSpike: Spike | null = null;
      for (const sp of s.spikes) {
        if (sp.lane !== shot.lane) continue;
        if (
          sweptOverlap(
            shot.prevDepth,
            shot.depth,
            he.shot,
            sp.topDepth,
            sp.topDepth,
            he.spikeTop,
          )
        ) {
          hitSpike = sp;
        }
        break;
      }

      // First thing hit = the overlapping candidate nearest the rim (the
      // shot travels rim → bottom). Ties: enemy beats enemy shot beats
      // spike tip — a Spiker exactly at its tip has hit priority (§6.3).
      const enemyD = hitEnemy?.depth ?? Infinity;
      const shotD = hitShot?.depth ?? Infinity;
      const spikeD = hitSpike?.topDepth ?? Infinity;
      if (hitEnemy !== null && enemyD <= shotD && enemyD <= spikeD) {
        killedEnemies.add(hitEnemy);
        consumed.add(shot);
        killEnemyByShot(s, hitEnemy, cfg, params, ctx, events);
      } else if (hitShot !== null && shotD <= spikeD) {
        killedShots.add(hitShot);
        consumed.add(shot);
        ctx.points += cfg.scoring.enemyShot; // 0 by canon (§7)
      } else if (hitSpike !== null) {
        // §6.3: a Spiker at or above the tip dies instead of a trim.
        let spikerAtTip: Enemy | null = null;
        for (const e of s.enemies) {
          if (killedEnemies.has(e)) continue;
          if (e.kind !== 'spiker' || e.lane !== shot.lane) continue;
          if (e.depth <= hitSpike.topDepth) {
            spikerAtTip = e;
            break;
          }
        }
        consumed.add(shot);
        if (
          trimOrKill(hitSpike, spikerAtTip, cfg.tuning.spikeTrimDepth) ===
          'kill'
        ) {
          killedEnemies.add(spikerAtTip!);
          killEnemyByShot(s, spikerAtTip!, cfg, params, ctx, events);
        } else {
          ctx.points += cfg.scoring.spikeTrimPoints;
          events.push({ type: 'spikeHit' });
          if (hitSpike.topDepth >= 1 - 1e-9) {
            s.spikes = s.spikes.filter((sp) => sp !== hitSpike);
          }
        }
      }
    }

    if (killedEnemies.size > 0) {
      s.enemies = s.enemies.filter((e) => !killedEnemies.has(e));
    }
    if (killedShots.size > 0) {
      s.enemyShots = s.enemyShots.filter((es) => !killedShots.has(es));
    }
    if (consumed.size > 0) {
      s.playerShots = s.playerShots.filter((sh) => !consumed.has(sh));
    }
  }

  // §5: a shot that reaches depth 1 without hitting anything despawns.
  // Runs AFTER hit resolution so an exactly-at-bottom hit still lands.
  if (s.playerShots.some((sh) => sh.depth >= 1)) {
    s.playerShots = s.playerShots.filter((sh) => sh.depth < 1);
  }
}

// Shared player-death entry for lethality steps 4–5 (Task 5.3 wires the
// life decrement + transition). At most one death per tick.
function killPlayer(ctx: TickCtx, events: SimEvent[]): void {
  if (!ctx.playerDied) {
    ctx.playerDied = true;
    events.push({ type: 'playerDied' });
  }
}

// Step 4 (§6/§6.6): an enemy shot crossing depth 0 on the player's lane
// kills; on any other lane it disappears at the rim. In benchMode the
// player is invulnerable but rim-crossing shots still despawn (they are
// not part of the held census, §12.6).
function stepEnemyShotLethality(
  s: SimState,
  cfg: GameConfig,
  ctx: TickCtx,
  events: SimEvent[],
  benchMode: boolean,
): void {
  let crossed = false;
  for (const es of s.enemyShots) {
    if (es.depth <= 0) {
      crossed = true;
      break;
    }
  }
  if (!crossed) return;
  if (!benchMode) {
    const pl = playerLane(s.rimPos, s.closed);
    for (const es of s.enemyShots) {
      if (es.depth <= 0 && es.lane === pl) {
        killPlayer(ctx, events);
        break;
      }
    }
  }
  s.enemyShots = s.enemyShots.filter((es) => es.depth > 0);
  void cfg;
}

// AIDEV-TODO: each placeholder below is implemented by its named task
// (underscore params mark deliberately-unused args until then).
// Step 5 (§6): contact, pulse, and warp-spike lethality. §5(b): the player
// dies when their lane equals a NON-flipping rim-resident Flipper's (or
// Fuseball's, Task 4.4) lane — symmetric contact; a mid-flip enemy is lethal
// only once its flip completes (it is non-flipping by this step). Pulse
// lethality: Task 4.5; warp spikes: Task 5.2.
function stepContactLethality(
  s: SimState,
  cfg: GameConfig,
  params: LevelParams,
  ctx: TickCtx,
  events: SimEvent[],
  benchMode: boolean,
): void {
  if (benchMode) return; // census-hold: player is invulnerable (§12.6)
  const pl = playerLane(s.rimPos, s.closed);
  for (const e of s.enemies) {
    if (e.flip !== null) continue; // crossing a mid-flip lane is safe (§5(b))
    // Rim residents only, with kind-specific arrival depth: a Flipper arrives
    // when its top corners touch depth 0 (center ≤ flipperHalfHeight, §5(b)/
    // Task 2); a Fuseball's rim residence stays depth<=0 (§6.4).
    if (e.kind === 'flipper') {
      if (!flipperAtRim(e, cfg)) continue;
    } else if (e.kind === 'fuseball') {
      if (e.depth > 0) continue;
    } else {
      continue; // other kinds never contact-kill at the rim
    }
    // A crawling Fuseball's lane rounds like the player's (§6.4).
    if (occupancyLane(e, s.closed) === pl) {
      killPlayer(ctx, events);
      break;
    }
  }
  // Warp-spike lethality (§9): §6.7 swept rule on the player's lane —
  // the Blaster is a POINT sweeping [prevWarpDepth, warpDepth] against the
  // spike body [topDepth, 1]. A same-tick trim (step 3) that pushed the top
  // out of reach already saved the player before this runs.
  if (s.phase === 'WARP') {
    for (const sp of s.spikes) {
      if (sp.lane !== pl) continue;
      if (
        sweptOverlap(
          s.prevWarpDepth,
          s.warpDepth,
          cfg.tuning.halfExtents.blaster,
          sp.topDepth,
          1,
          0,
        )
      ) {
        killPlayer(ctx, events);
      }
      break; // at most one spike per lane
    }
  }

  // Pulse lethality (§6.5/§5(c)): during the pulse each PARTICIPATING
  // Pulsar's lane is electrified along its full length for the whole
  // duration — entering mid-pulse kills. A lane de-electrifies the instant
  // its last participating Pulsar dies (step 3 removed it before we run).
  if (
    s.phase === 'PLAYING' &&
    pulsePhase(s.pulseClock, params.pulse, cfg.tuning) === 'pulse'
  ) {
    for (const e of s.enemies) {
      if (e.kind === 'pulsar' && e.pulseJoined === true && e.lane === pl) {
        killPlayer(ctx, events);
        break;
      }
    }
  }
}

// Step 6 (§6): one bonus-life pass for the points steps 3–5 accumulated.
function stepBonusLife(
  s: SimState,
  cfg: GameConfig,
  ctx: TickCtx,
  events: SimEvent[],
): void {
  applyScore(s, ctx.points, cfg, ctx.playerDied, events);
}

// Step 7 (§6): spawn attempts run on PLAYING time only (WARP has no
// spawner — the wave is already complete).
function stepSpawner(
  s: SimState,
  cfg: GameConfig,
  params: LevelParams,
  events: SimEvent[],
): void {
  if (s.phase !== 'PLAYING') return;
  updateSpawner(s, params, cfg, events);
}
// Step 8 (§8.4): the level ends when the spawn budget is exhausted AND no
// enemies remain (never-despawning Spikers/Pulsars must be destroyed).
// Runs only in PLAYING and never on a tick the player died; awards the
// level-clear bonus (then the bonus-life rule — always a non-death tick
// here, so the grant is never forfeited: the §7 economy invariant's path).
function stepWaveCompletion(
  s: SimState,
  cfg: GameConfig,
  ctx: TickCtx,
  events: SimEvent[],
  benchMode: boolean,
): void {
  if (benchMode) return; // census-hold (§12.6)
  if (s.phase !== 'PLAYING' || ctx.playerDied) return;
  const b = s.budget;
  if (b.flipper + b.tanker + b.spiker + b.fuseball + b.pulsar > 0) return;
  if (s.enemies.length > 0) return;
  applyScore(s, levelClearBonus(s.level, cfg.scoring), cfg, false, events);
  enterWarp(s, events); // PLAYING → WARP (§10)
}

function makeSim(s: SimState, cfg: GameConfig, benchMode: boolean): Sim {
  return {
    tick(input: InputSnapshot): { events: SimEvent[] } {
      const events: SimEvent[] = [];
      // Snapshot render-interpolation prevs at tick start (§12.3); entity
      // prevs are snapshotted by their own movement in step 2.
      s.prevRimPos = s.rimPos;
      s.prevWarpDepth = s.warpDepth;
      // Per-tick transients (never hashed): kill points from steps 3–5 for
      // the single step-6 bonus-life pass, and the playerDiedThisTick flag
      // steps 4–5 set (§6).
      const ctx: TickCtx = { points: 0, playerDied: false };
      // Quit-to-title takes precedence over the whole tick (§10): a lethal
      // event this tick must never outrun the player's quit.
      if (input.quit && applyQuit(s, cfg)) {
        return { events };
      }
      if (s.phase === 'PLAYING' || s.phase === 'WARP') {
        tickCombat(s, input, cfg, ctx, events, benchMode);
      } else if (s.phase === 'GET_READY') {
        // §10: the well is empty; movement is applied (the player may
        // reposition), fire and zap are ignored; the timer advances only
        // when the sim ticks.
        const delta = clampRimDelta(input.move, cfg.tuning.perTickClamp);
        s.rimPos = normalizeRimPos(s.rimPos + delta, s.closed);
        s.getReadyTimer -= TICK_SEC;
      }
      // §6 step 9: a death tick resolves the death INSTEAD of the normal
      // transition pass.
      if (ctx.playerDied) {
        resolveDeath(s, cfg, events);
      } else {
        transition(s, input, cfg, events);
      }
      return { events };
    },
    getState(): Readonly<SimState> {
      return s;
    },
    hash(): number {
      return hashState(s);
    },
  };
}

export function createSim(
  cfg: GameConfig,
  seed: number,
  initialSave?: InitialSave,
): Sim {
  validateConfig(cfg); // guards live tuning constants at construction (§13)
  return makeSim(
    makeInitialState(cfg, seed, initialSave ?? DEFAULT_SAVE),
    cfg,
    false,
  );
}

// Debug/bench entry (§12.6, Task 11.3): wrap a caller-supplied SimState.
export function createSimFromState(
  state: SimState,
  cfg: GameConfig,
  benchMode: boolean,
): Sim {
  return makeSim(state, cfg, benchMode);
}
