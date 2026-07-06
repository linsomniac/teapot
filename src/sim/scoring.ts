// Scoring + bonus-life rule (§7, §6 step 6). All values come from the
// injected Scoring config — no literals here.

import type { Depth, EnemyKind, SimEvent } from './types';
import type { GameConfig, Scoring } from './config';
import type { SimState } from './state';

// §7 kill points. Fuseballs score by KILL DEPTH band (pinned boundaries):
// depth < 1/3 → near value (richest), 1/3 ≤ depth ≤ 2/3 → mid, > 2/3 → far.
// Zero-point cases (Tanker rim self-split §6.2, Superzapper kills §5, enemy
// shots §7) are decided at the call sites — they pass or award 0 directly.
export function pointsForKill(
  kind: EnemyKind,
  depth: Depth,
  sc: Scoring,
): number {
  switch (kind) {
    case 'flipper':
      return sc.flipper;
    case 'tanker':
      return sc.tanker; // by player shot; rim self-split scores 0 (§6.2)
    case 'spiker':
      return sc.spiker;
    case 'pulsar':
      return sc.pulsar;
    case 'fuseball': {
      const [far, mid, near] = sc.fuseballBands;
      if (depth < 1 / 3) return near;
      if (depth <= 2 / 3) return mid; // inclusive at BOTH boundaries
      return far;
    }
  }
}

// §7: level-clear bonus freezes at the difficulty tail (level cap).
export function levelClearBonus(level: number, sc: Scoring): number {
  return sc.clearBonusPerLevel * Math.min(level, sc.clearBonusCapLevel);
}

// Bonus-life rule (§6/§7): the player is owed floor(score/interval) lives in
// total; grant any newly-owed lives when score increases — EXCEPT on a tick
// the player died, where crossed thresholds are forfeited outright (a bonus
// life and a death on the same tick net zero). livesGranted still advances on
// the death tick so a deferred grant can never sneak in later.
export function applyScore(
  s: SimState,
  points: number,
  cfg: GameConfig,
  playerDiedThisTick: boolean,
  events: SimEvent[],
): void {
  s.score += points;
  const owed = Math.floor(s.score / cfg.scoring.bonusLifeInterval);
  if (owed > s.livesGranted) {
    if (!playerDiedThisTick) {
      for (let i = s.livesGranted; i < owed; i++) {
        events.push({ type: 'bonusLife' });
      }
      s.lives += owed - s.livesGranted;
    }
    s.livesGranted = owed;
  }
}
