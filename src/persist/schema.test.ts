import { describe, expect, it } from 'vitest';
import { decode, defaults, encode, type SaveData } from './schema';

// Task 7.1 — save schema (§12.4). §13 persistence area.

const sample: SaveData = {
  highScores: [
    { initials: 'AAA', score: 5000, level: 7 },
    { initials: 'BB ', score: 3000, level: 4 },
  ],
  settings: { muted: true },
  maxLevelReached: 12,
};

describe('encode/decode round-trip (§12.4)', () => {
  it('round-trips a full SaveData', () => {
    expect(decode(encode(sample))).toEqual(sample);
  });

  it('round-trips maxLevelReached and muted specifically', () => {
    const d = decode(encode(sample));
    expect(d.maxLevelReached).toBe(12);
    expect(d.settings.muted).toBe(true);
  });
});

describe('decode never throws — defaults on bad input (§12.4)', () => {
  it('decode(null) yields defaults', () => {
    expect(decode(null)).toEqual(defaults());
  });

  it('corrupt JSON yields defaults', () => {
    expect(decode('{not json!!')).toEqual(defaults());
    expect(decode('')).toEqual(defaults());
  });

  it('wrong-shaped known data yields defaults', () => {
    expect(decode('42')).toEqual(defaults());
    expect(decode('"a string"')).toEqual(defaults());
    expect(decode('[1,2,3]')).toEqual(defaults());
    expect(decode('null')).toEqual(defaults());
  });

  it('wrong-typed fields fall back individually', () => {
    const d = decode(
      JSON.stringify({
        highScores: 'nope',
        settings: { muted: 'yes' },
        maxLevelReached: 'seven',
      }),
    );
    expect(d).toEqual(defaults());
  });

  it('invalid score entries are dropped; valid ones survive', () => {
    const d = decode(
      JSON.stringify({
        highScores: [
          { initials: 'AAA', score: 100, level: 1 },
          { initials: 42, score: 100, level: 1 }, // bad initials
          { initials: 'BBB', score: 'lots', level: 1 }, // bad score
          { initials: 'CCC', score: 50 }, // missing level
          'garbage',
        ],
        settings: { muted: false },
        maxLevelReached: 3,
      }),
    );
    expect(d.highScores).toEqual([{ initials: 'AAA', score: 100, level: 1 }]);
    expect(d.maxLevelReached).toBe(3);
  });
});

describe('forward compatibility (§12.4)', () => {
  it('unknown extra fields are ignored while valid known fields still load', () => {
    const d = decode(
      JSON.stringify({
        ...sample,
        futureFeature: { blob: [1, 2, 3] },
        version: 99,
      }),
    );
    expect(d).toEqual(sample);
  });

  it('a highScores array longer than 10 is truncated on decode', () => {
    const long = Array.from({ length: 15 }, (_, i) => ({
      initials: 'AAA',
      score: 1500 - i * 100,
      level: 1,
    }));
    const d = decode(JSON.stringify({ ...defaults(), highScores: long }));
    expect(d.highScores).toHaveLength(10);
    expect(d.highScores[0]!.score).toBe(1500);
    expect(d.highScores[9]!.score).toBe(600);
  });

  it('an unsorted table is re-sorted descending on decode', () => {
    const d = decode(
      JSON.stringify({
        ...defaults(),
        highScores: [
          { initials: 'LOW', score: 10, level: 1 },
          { initials: 'TOP', score: 900, level: 2 },
        ],
      }),
    );
    expect(d.highScores.map((e) => e.initials)).toEqual(['TOP', 'LOW']);
  });

  it('overlong initials are clipped to three characters', () => {
    const d = decode(
      JSON.stringify({
        ...defaults(),
        highScores: [{ initials: 'ABCDEF', score: 5, level: 1 }],
      }),
    );
    expect(d.highScores[0]!.initials).toBe('ABC');
  });
});
