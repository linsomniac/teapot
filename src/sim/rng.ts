// Seedable RNG: mulberry32 (I5). The sim holds exactly ONE instance; every
// gameplay draw goes through it (§12.2). Internal state `a` is part of the
// sim hash (§12.2, Task 12.3). The renderer seeds its own separate instance
// so visuals never perturb sim determinism (§11.1).

export interface Rng {
  next(): number; // uniform in [0, 1)
  nextInt(n: number): number; // uniform integer in [0, n)
  state(): number;
  setState(s: number): void;
}

export function makeRng(seed: number): Rng {
  let a = seed >>> 0;
  const next = () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    nextInt: (n) => Math.floor(next() * n) | 0,
    state: () => a >>> 0,
    setState: (s) => {
      a = s >>> 0;
    },
  };
}
