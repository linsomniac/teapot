import { describe, expect, it } from 'vitest';
import { HS_CHARSET, insertScore, qualifies, type HsEntry } from './highscore';

function table(scores: number[]): HsEntry[] {
  return scores.map((score, i) => ({ initials: 'AAA', score, level: i + 1 }));
}

describe('qualifies (§10 qualification, §13 persistence area)', () => {
  it('fewer than 10 entries: always qualifies', () => {
    expect(qualifies([], 0)).toBe(true);
    expect(qualifies(table([500, 400, 300]), 1)).toBe(true);
    expect(qualifies(table([9, 8, 7, 6, 5, 4, 3, 2, 1]), 0)).toBe(true); // 9 entries
  });

  it('full table: qualifies iff score ≥ the 10th entry', () => {
    const full = table([100, 90, 80, 70, 60, 50, 40, 30, 20, 10]);
    expect(qualifies(full, 10)).toBe(true); // equal to 10th qualifies
    expect(qualifies(full, 11)).toBe(true);
    expect(qualifies(full, 9)).toBe(false);
  });
});

describe('insertScore (§10)', () => {
  it('ranks a new entry ABOVE existing equal scores', () => {
    const t = table([300, 200, 100]);
    const out = insertScore(t, { initials: 'NEW', score: 200, level: 5 });
    expect(out.map((e) => e.initials)).toEqual(['AAA', 'NEW', 'AAA', 'AAA']);
    expect(out.map((e) => e.score)).toEqual([300, 200, 200, 100]);
  });

  it('keeps the table sorted and truncates to 10', () => {
    const full = table([100, 90, 80, 70, 60, 50, 40, 30, 20, 10]);
    const out = insertScore(full, { initials: 'NEW', score: 55, level: 3 });
    expect(out).toHaveLength(10);
    expect(out.map((e) => e.score)).toEqual([
      100, 90, 80, 70, 60, 55, 50, 40, 30, 20,
    ]);
    expect(out.some((e) => e.score === 10)).toBe(false); // old 10th fell off
  });

  it('appends when lowest and room remains; does not mutate the input', () => {
    const t = table([300, 200]);
    const out = insertScore(t, { initials: 'LOW', score: 50, level: 1 });
    expect(out.map((e) => e.score)).toEqual([300, 200, 50]);
    expect(t).toHaveLength(2); // input untouched
  });
});

describe('HS_CHARSET (§10)', () => {
  it('is the ordered 37-char set: space, A–Z, 0–9', () => {
    expect(HS_CHARSET).toHaveLength(37);
    expect(HS_CHARSET[0]).toBe(' ');
    expect(HS_CHARSET[1]).toBe('A'); // per-slot default index
    expect(HS_CHARSET[26]).toBe('Z');
    expect(HS_CHARSET[27]).toBe('0');
    expect(HS_CHARSET[36]).toBe('9');
  });
});
