// SaveData encode/decode/validate (§12.4). Pure module: no browser APIs —
// the localStorage adapter (Task 11.1) wraps this. decode NEVER throws:
// corrupt, missing, or wrong-shaped data falls back to defaults, and
// unknown extra fields are ignored (forward compatibility).

import type { HsEntry } from '../sim/highscore';
import { MAX_ENTRIES } from '../sim/highscore';

// Qualification/insertion are NOT redefined here — they are sim-owned
// (I14); re-exported for the storage adapter's convenience.
export { insertScore, qualifies } from '../sim/highscore';

export interface SaveData {
  highScores: HsEntry[]; // reuses the sim row shape; sorted desc, ≤ 10
  settings: { muted: boolean };
  maxLevelReached: number;
}

export function defaults(): SaveData {
  return { highScores: [], settings: { muted: false }, maxLevelReached: 1 };
}

export function encode(d: SaveData): string {
  return JSON.stringify(d);
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function sanitizeEntry(v: unknown): HsEntry | null {
  if (!isRecord(v)) return null;
  const { initials, score, level } = v;
  if (typeof initials !== 'string') return null;
  if (typeof score !== 'number' || !Number.isFinite(score)) return null;
  if (typeof level !== 'number' || !Number.isFinite(level)) return null;
  return { initials: initials.slice(0, 3), score, level };
}

export function decode(raw: string | null): SaveData {
  const out = defaults();
  if (raw === null) return out;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return out;
  }
  if (!isRecord(parsed)) return out;

  if (Array.isArray(parsed.highScores)) {
    const entries: HsEntry[] = [];
    for (const item of parsed.highScores) {
      const e = sanitizeEntry(item);
      if (e !== null) entries.push(e);
    }
    entries.sort((a, b) => b.score - a.score); // defensive re-sort, stable
    out.highScores = entries.slice(0, MAX_ENTRIES);
  }

  if (isRecord(parsed.settings) && typeof parsed.settings.muted === 'boolean') {
    out.settings.muted = parsed.settings.muted;
  }

  if (
    typeof parsed.maxLevelReached === 'number' &&
    Number.isFinite(parsed.maxLevelReached) &&
    parsed.maxLevelReached >= 1
  ) {
    out.maxLevelReached = Math.floor(parsed.maxLevelReached);
  }

  return out;
}
