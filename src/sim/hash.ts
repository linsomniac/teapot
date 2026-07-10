// Stable state serialization/hash (§12.2). Covers every FUTURE-AFFECTING
// field of SimState; render-only interpolation fields (prevRimPos,
// prevWarpDepth, Enemy.prevLane/prevDepth, Shot.prevDepth) are deliberately
// excluded — they never influence a later tick.
//
// AIDEV-NOTE: "add to the hash as you go" (I16): every task that adds a
// future-affecting SimState/Enemy field MUST extend serializeState in the
// same commit. Task 12.3's hash-completeness test fails if a field is
// missed.
//
// Task 12.1 audit (2026-07-06, final SimState shape): every §12.2 field is
// serialized — phase, level, score, lives, livesGranted, rimPos, warpDepth,
// closed, geometryIndex, superzapper, spawnTimer, pulseClock, deathTimer,
// deathFromWarp, getReadyTimer, beatTimer, playerFireCooldownTicks,
// maxLevelReached, selector(+accum/timer), hsSlot,
// hsInitials, all five budgets, rng.state(); per-Enemy kind/lane/depth/flip
// (from>to@progress)/flipTimer/fireTimer/climbDir/rimTimer/rimDir/
// jitterTimer/speedMul/descentTarget/pulseJoined; per-shot lane/depth on both
// sides plus the physical slot for player shots; per-spike lane/topDepth; the
// high-score table. Shot.prevDepth is
// overwritten by advanceShots before any use each tick, so between ticks it
// is render-only, like the other excluded prev* fields. paletteIndex is
// hashed but derives from level (render-only per §12.2's exclusion list —
// harmless to include).

import type { SimState } from './state';

// FNV-1a over the stable serialization.
function fnv1a(str: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function serializeState(s: SimState): string {
  const parts: (string | number)[] = [
    s.phase,
    s.level,
    s.score,
    s.lives,
    s.livesGranted,
    s.rimPos,
    s.warpDepth,
    s.closed ? 1 : 0,
    s.geometryIndex,
    s.paletteIndex,
    s.superzapper,
    s.playerFireCooldownTicks,
    s.spawnTimer,
    s.pulseClock,
    s.deathTimer,
    s.deathFromWarp ? 1 : 0,
    s.getReadyTimer,
    s.beatTimer,
    s.maxLevelReached,
    s.selector,
    s.selectorAccum,
    s.selectorTimer,
    s.hsSlot,
    s.hsInitials.join(','),
    s.budget.flipper,
    s.budget.tanker,
    s.budget.spiker,
    s.budget.fuseball,
    s.budget.pulsar,
    s.rng.state(),
  ];
  for (const e of s.enemies) {
    parts.push(
      'E',
      e.kind,
      e.lane,
      e.depth,
      e.flip ? `${e.flip.from}>${e.flip.to}@${e.flip.progress}` : '-',
      e.flipTimer,
      e.fireTimer,
      e.climbDir ?? '-',
      e.rimTimer ?? '-',
      e.rimDir ?? '-',
      e.jitterTimer ?? '-',
      e.speedMul ?? '-',
      e.descentTarget ?? '-',
      e.pulseJoined === undefined ? '-' : e.pulseJoined ? 1 : 0,
    );
  }
  for (const sh of s.playerShots) {
    parts.push('P', sh.slot ?? '-', sh.lane, sh.depth);
  }
  for (const sh of s.enemyShots) parts.push('S', sh.lane, sh.depth);
  for (const sp of s.spikes) parts.push('K', sp.lane, sp.topDepth);
  for (const h of s.highScores) parts.push('H', h.initials, h.score, h.level);
  return parts.join('|');
}

export function hashState(s: SimState): number {
  return fnv1a(serializeState(s));
}
