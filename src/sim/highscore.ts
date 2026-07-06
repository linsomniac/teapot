// Sim-owned high-score predicate/insertion (§10, I14). Qualification is a
// SIM decision (the GAME_OVER → HIGH_SCORE_ENTRY edge), so this logic lives
// here; persist/ (Task 7.1) REUSES these — it does not redefine them.

export type HsEntry = { initials: string; score: number; level: number };

export const MAX_ENTRIES = 10;

// The ordered 37-char high-score-entry set (§10). SimState.hsInitials holds
// an index into it per slot; on confirm, indices map to chars to build
// HsEntry.initials. Space first, so 'A' is index 1 (§10's per-slot default).
export const HS_CHARSET = ' ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

// §10: a score qualifies if the table has fewer than 10 entries or the score
// is ≥ the 10th entry's score. `scores` is sorted descending.
export function qualifies(scores: HsEntry[], score: number): boolean {
  if (scores.length < MAX_ENTRIES) return true;
  return score >= scores[MAX_ENTRIES - 1]!.score;
}

// Insert ranking the new entry ABOVE existing entries with equal scores
// (§10); returns a new array truncated to the top 10.
export function insertScore(scores: HsEntry[], e: HsEntry): HsEntry[] {
  const out = scores.slice();
  let at = out.length;
  for (let i = 0; i < out.length; i++) {
    if (e.score >= out[i]!.score) {
      at = i;
      break;
    }
  }
  out.splice(at, 0, e);
  return out.slice(0, MAX_ENTRIES);
}
