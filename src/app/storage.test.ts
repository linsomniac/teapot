import { describe, expect, it } from 'vitest';
import { createStorage } from './storage';
import { defaults, type SaveData } from '../persist/schema';

// Task 11.1 — §13 "storage-throwing adapter" area.

const sample: SaveData = {
  highScores: [{ initials: 'ZZZ', score: 900, level: 3 }],
  settings: { muted: true },
  maxLevelReached: 7,
};

function memoryBacking(): {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
  map: Map<string, string>;
} {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
  };
}

describe('storage adapter (§12.4)', () => {
  it('round-trips SaveData through the backing store', () => {
    const backing = memoryBacking();
    const storage = createStorage(backing);
    storage.save(sample);
    expect(storage.load()).toEqual(sample);
  });

  it('builds the InitialSave the sim consumes (I14)', () => {
    const backing = memoryBacking();
    const storage = createStorage(backing);
    storage.save(sample);
    expect(storage.initialSave()).toEqual({
      maxLevelReached: 7,
      highScores: sample.highScores,
    });
  });

  it('empty backing loads defaults', () => {
    const storage = createStorage(memoryBacking());
    expect(storage.load()).toEqual(defaults());
  });

  it('a THROWING getItem degrades to defaults — never throws', () => {
    const storage = createStorage({
      getItem: () => {
        throw new Error('SecurityError: private mode');
      },
      setItem: () => {},
    });
    expect(() => storage.load()).not.toThrow();
    expect(storage.load()).toEqual(defaults());
    expect(storage.initialSave()).toEqual({
      maxLevelReached: 1,
      highScores: [],
    });
  });

  it('a THROWING setItem silently no-ops — never throws', () => {
    const backing = memoryBacking();
    const storage = createStorage({
      getItem: backing.getItem,
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
    });
    expect(() => storage.save(sample)).not.toThrow();
    expect(storage.load()).toEqual(defaults()); // nothing was written
  });

  it('corrupt stored data decodes to defaults through the adapter', () => {
    const backing = memoryBacking();
    backing.map.set('teapot.v1', '{broken!!');
    const storage = createStorage(backing);
    expect(storage.load()).toEqual(defaults());
  });
});
