// localStorage adapter around persist/ (§12.4). Storage can be missing or
// THROWING (private mode, quota): reads fall back to defaults, writes
// silently no-op — the game never breaks over persistence.

import { decode, defaults, encode, type SaveData } from '../persist/schema';
import type { InitialSave } from '../sim/state';

const KEY = 'teapot.v1'; // the single documented key (§12.4)

type StorageLike = Pick<globalThis.Storage, 'getItem' | 'setItem'>;

export interface StorageAdapter {
  load(): SaveData;
  save(data: SaveData): void;
  initialSave(): InitialSave; // the read-only snapshot createSim consumes (I14)
}

export function createStorage(backing?: StorageLike): StorageAdapter {
  let store: StorageLike | null = backing ?? null;
  if (store === null) {
    try {
      store = window.localStorage; // property access itself can throw
    } catch {
      store = null;
    }
  }

  function load(): SaveData {
    if (store === null) return defaults();
    try {
      return decode(store.getItem(KEY));
    } catch {
      return defaults(); // §12.4: a throwing getItem degrades gracefully
    }
  }

  return {
    load,
    save(data: SaveData): void {
      if (store === null) return;
      try {
        store.setItem(KEY, encode(data));
      } catch {
        // Quota/private mode: silently no-op (§12.4).
      }
    },
    initialSave(): InitialSave {
      const d = load();
      return { maxLevelReached: d.maxLevelReached, highScores: d.highScores };
    },
  };
}
