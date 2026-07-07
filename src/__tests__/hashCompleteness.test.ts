import { describe, expect, it } from 'vitest';
import { createSim, type SimState } from '../sim/sim';
import { beginLevel, enterPlaying } from '../sim/state';
import { hashState } from '../sim/hash';
import { makeRng } from '../sim/rng';
import { paramsForLevel } from '../sim/difficultyCurve';
import { makeFlipper } from '../sim/enemies/flipper';
import { makeTanker } from '../sim/enemies/tanker';
import { makeSpiker } from '../sim/enemies/spiker';
import { makeFuseball } from '../sim/enemies/fuseball';
import { makePulsar } from '../sim/enemies/pulsar';
import type { Enemy, EnemyKind } from '../sim/types';
import { makeLiveConfig } from './fixtures/liveConfig';

// Hash-completeness (Task 12.3, §12.2/§13): the mutation set is driven
// PROGRAMMATICALLY from the SimState / Enemy / Shot / Spike field sets — a
// newly added field is covered automatically. Only the render-only
// interpolation fields are excluded (they must NOT change the hash).

const cfg = makeLiveConfig();

const RENDER_ONLY_STATE = new Set([
  'prevRimPos',
  'prevWarpDepth',
  'paletteIndex',
]);
const RENDER_ONLY_ENTITY = new Set(['prevLane', 'prevDepth']);

function richState(): SimState {
  const s = createSim(cfg, 7).getState() as SimState;
  const lp = paramsForLevel(17, cfg.difficulty);
  s.lives = 3;
  beginLevel(s, 17, cfg);
  enterPlaying(s, cfg);
  const rng = makeRng(3);
  // One of each kind; every optional field populated so each is mutated.
  const fuseball = {
    ...makeFuseball(4, cfg.tuning, rng),
    depth: 0.4,
    rimTimer: 1.2,
    rimDir: 1 as const,
    descentTarget: 0.8,
  };
  const flipper = {
    ...makeFlipper(1, lp, rng),
    depth: 0.5,
    flip: { from: 1, to: 2, progress: 0.4 },
  };
  s.enemies = [
    flipper,
    { ...makeTanker(2, lp, rng), depth: 0.7 },
    { ...makeSpiker(3, lp, rng), depth: 0.6 },
    fuseball,
    { ...makePulsar(5, lp, rng), depth: 0.5, pulseJoined: true },
  ];
  s.playerShots = [{ lane: 6, depth: 0.3, prevDepth: 0.28 }];
  s.enemyShots = [{ lane: 7, depth: 0.6, prevDepth: 0.62 }];
  s.spikes = [{ lane: 8, topDepth: 0.5 }];
  s.highScores = [{ initials: 'AAA', score: 1000, level: 3 }];
  s.score = 500;
  s.beatTimer = 0.5;
  s.getReadyTimer = 0.5;
  s.selectorAccum = 0.4;
  s.selectorTimer = 0.05;
  s.fireCooldown = 0.1;
  s.warpDepth = 0.2;
  s.prevWarpDepth = 0.18;
  s.prevRimPos = 7.9;
  return s;
}

function cloneState(s: SimState): SimState {
  const { rng, ...rest } = s;
  const copy = structuredClone(rest) as SimState;
  copy.rng = makeRng(0);
  copy.rng.setState(rng.state());
  return copy;
}

// Mutate one field of an arbitrary record; returns a description.
function mutateValue(obj: Record<string, unknown>, key: string): void {
  const v = obj[key];
  if (typeof v === 'number') obj[key] = v + 0.25;
  else if (typeof v === 'boolean') obj[key] = !v;
  else if (typeof v === 'string') obj[key] = v === 'X' ? 'Y' : 'X';
  else if (Array.isArray(v)) {
    if (v.length > 0) v.pop();
    else v.push(1);
  } else if (v === null) obj[key] = { from: 9, to: 10, progress: 0.5 };
  else if (typeof v === 'object') {
    const inner = v as Record<string, unknown>;
    const k = Object.keys(inner)[0]!;
    mutateValue(inner, k);
  }
}

describe('hash completeness (§12.2/§13)', () => {
  const base = richState();
  const baseHash = hashState(base);

  it('every SimState field is covered (or provably render-only)', () => {
    for (const key of Object.keys(base)) {
      const copy = cloneState(base);
      if (key === 'rng') {
        copy.rng.setState(base.rng.state() + 1);
      } else {
        mutateValue(copy as unknown as Record<string, unknown>, key);
      }
      const mutatedHash = hashState(copy);
      if (RENDER_ONLY_STATE.has(key)) {
        // paletteIndex is hashed (harmless, level-derived); the prevs are
        // genuinely excluded from the hash.
        if (key !== 'paletteIndex') {
          expect(mutatedHash, `${key} must be render-only`).toBe(baseHash);
        }
      } else {
        expect(mutatedHash, `${key} must be hashed`).not.toBe(baseHash);
      }
    }
  });

  it('every field of every Enemy kind is covered (except the prevs)', () => {
    for (let i = 0; i < base.enemies.length; i++) {
      const proto = base.enemies[i]!;
      for (const key of Object.keys(proto)) {
        const copy = cloneState(base);
        const target = copy.enemies[i]! as unknown as Record<string, unknown>;
        if (key === 'kind') {
          const other: EnemyKind =
            proto.kind === 'flipper' ? 'tanker' : 'flipper';
          (copy.enemies[i] as Enemy).kind = other;
        } else {
          mutateValue(target, key);
        }
        const mutatedHash = hashState(copy);
        const label = `${proto.kind}.${key}`;
        if (RENDER_ONLY_ENTITY.has(key)) {
          expect(mutatedHash, `${label} must be render-only`).toBe(baseHash);
        } else {
          expect(mutatedHash, `${label} must be hashed`).not.toBe(baseHash);
        }
      }
    }
  });

  it('flip sub-fields are each hashed', () => {
    for (const key of ['from', 'to', 'progress'] as const) {
      const copy = cloneState(base);
      const flip = copy.enemies[0]!.flip!;
      flip[key] += 0.5;
      expect(hashState(copy), `flip.${key}`).not.toBe(baseHash);
    }
  });

  it('every Shot field is covered on both sides (except prevDepth)', () => {
    for (const side of ['playerShots', 'enemyShots'] as const) {
      const proto = base[side][0]!;
      for (const key of Object.keys(proto)) {
        const copy = cloneState(base);
        mutateValue(copy[side][0]! as unknown as Record<string, unknown>, key);
        const label = `${side}.${key}`;
        if (RENDER_ONLY_ENTITY.has(key) || key === 'prevDepth') {
          expect(hashState(copy), `${label} render-only`).toBe(baseHash);
        } else {
          expect(hashState(copy), `${label} must be hashed`).not.toBe(baseHash);
        }
      }
    }
  });

  it('every Spike and HsEntry field is covered', () => {
    for (const key of Object.keys(base.spikes[0]!)) {
      const copy = cloneState(base);
      mutateValue(copy.spikes[0]! as unknown as Record<string, unknown>, key);
      expect(hashState(copy), `spike.${key}`).not.toBe(baseHash);
    }
    for (const key of Object.keys(base.highScores[0]!)) {
      const copy = cloneState(base);
      mutateValue(
        copy.highScores[0]! as unknown as Record<string, unknown>,
        key,
      );
      expect(hashState(copy), `hs.${key}`).not.toBe(baseHash);
    }
  });

  it('entity-array membership changes the hash', () => {
    for (const key of [
      'enemies',
      'playerShots',
      'enemyShots',
      'spikes',
    ] as const) {
      const copy = cloneState(base);
      copy[key].pop();
      expect(hashState(copy), `${key} length`).not.toBe(baseHash);
    }
  });

  it('hsInitials slot VALUES are hashed, not just the array length', () => {
    for (let slot = 0; slot < base.hsInitials.length; slot++) {
      const copy = cloneState(base);
      copy.hsInitials[slot] = (copy.hsInitials[slot] ?? 0) + 1;
      expect(hashState(copy), `hsInitials[${slot}]`).not.toBe(baseHash);
    }
  });

  it('every budget key is hashed individually (nested-object coverage)', () => {
    for (const kind of Object.keys(base.budget)) {
      const copy = cloneState(base);
      (copy.budget as unknown as Record<string, number>)[kind]! += 1;
      expect(hashState(copy), `budget.${kind}`).not.toBe(baseHash);
    }
  });

  it('a faithful clone hashes identically (baseline sanity)', () => {
    expect(hashState(cloneState(base))).toBe(baseHash);
  });
});
