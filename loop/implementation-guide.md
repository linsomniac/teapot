# Teapot Implementation Guide

> **For agentic workers:** implement this plan task-by-task. Each task ends with a
> passing test suite and a commit. Track status in `loop/checklist.md` (check the
> item off in the same commit that completes the task). The authoritative behavior
> for every rule and number is `loop/specification.md` (cited as §N below) — when
> this guide and the spec disagree, the spec wins and this guide should be fixed.

**Goal:** Build "Teapot", a single-player, browser-based arcade shooter inspired by
Tempest — a neon-vector well, flipping enemies, Superzapper, warp descent, endless
escalating levels, and local high scores — per `loop/specification.md`.

**Architecture:** Pure, browser-API-free game logic (`sim/`, `persist/`) is separated
from I/O (`render/`, `audio/`, `input/`, `app/`). The sim advances only via
`tick(inputSnapshot)` at a fixed 60 Hz; the renderer interpolates between ticks. All
game rules are unit-tested without a DOM; determinism is guarded by a seeded-replay
test. See §12.2.

**Tech Stack:** TypeScript (strict), Vite, Vitest, ESLint + Prettier, HTML5 Canvas
2D, Web Audio API. **Zero runtime dependencies.** (§12.1)

## Global Constraints

Every task inherits these (copied verbatim from the spec):

- **Zero runtime dependencies.** Dev-only deps (vite, vitest, typescript, eslint,
  prettier) are fine; nothing ships in the bundle. (§12.1)
- **`sim/`, `persist/`, and the pure `input/` mapping functions are browser-API-free**
  — no `window`, `document`, `localStorage`, `performance`, `requestAnimationFrame`,
  `Math.random`, `Date`. Enforced by an ESLint rule. (§12.2, §12.3)
- **Sim math is engine-stable:** only `+ − × ÷`, comparison, rounding, integer/bit
  ops, and RNG draws in `sim/` outside the projection module. No `Math.sqrt`, `sin`,
  `cos`, `pow`, `exp`, `log`. Distance checks use squared magnitudes. Enforced by an
  ESLint rule. (§12.3)
- **The sim never reads wall-clock time or entropy.** Seeds are injected. (§12.3, I5)
- **Fixed timestep 60 Hz** (`TICK_MS = 1000/60`), accumulator clamped at 250 ms; the
  renderer interpolates by the accumulator fraction. (§12.3)
- **Every gameplay random draw goes through the injected sim RNG.** (§12.2)
- **The sim is constructed from an injected `GameConfig`**, never by importing the
  live data modules directly. (§12.2, D41, I4)
- **`round` means `floor(x + 0.5)`** everywhere in the sim. (§4)
- **Target platforms:** latest two of Chrome, Firefox, Edge, Safari desktop; ES2020+
  output; playable and non-crashing at ≥ 1024×768 CSS px. (§12.5)

---

## Conventions

**TDD (spec §13 is the test contract).** For each task: write the failing test,
run it, see it fail for the right reason, implement minimally, run it green, commit.
Every §13 test area maps to a task below; the mapping is in `loop/checklist.md`.

**Determinism discipline.** Any new gameplay randomness draws from `sim` RNG. Any new
sim state field that affects a later tick must be added to the state hash (§12.2) —
the hash-completeness test (Task 12.3) will fail otherwise.

**Commits.** Conventional-commit style (`feat:`, `test:`, `fix:`, `chore:`),
ending with the `Co-Authored-By` trailer. One commit per completed task.

**Per-task Definition of Done.** (1) All the task's tests pass; (2) `npm run check`
(typecheck + lint + test) is green; (3) `/codex-review` (or `codex exec`) run on the
diff with medium+ findings addressed or recorded as rejected in
`loop/impl-review-rejected.md` (I13, `loop/prompt-3-build`); (4) checklist item
checked; (5) commit.

---

## Repository / File Structure

```
teapot/
  index.html                 # canvas + module entry (§12.1)
  package.json               # scripts, zero runtime deps (I10)
  tsconfig.json              # strict
  vite.config.ts
  vitest.config.ts
  .eslintrc.cjs              # incl. sim-math + browser-API restriction rules
  .nvmrc                     # Node 22 (I2)
  src/
    main.ts                  # bootstraps app/ (the only DOM entry)
    sim/                     # PURE — no browser APIs, engine-stable math
      types.ts               # Lane, Depth, EnemyKind, Enemy, Shot, Spike,
                             #   InputSnapshot, SimEvent, GameConfig, SimState
      rng.ts                 # mulberry32 (I5)
      config.ts              # GameConfig assembly types + validation
      data/
        geometries.ts        # 16 authored wells (§4)
        difficulty.ts        # §8.2 anchor table
        tuning.ts            # §8.3 constants
        scoring.ts           # §7 table
      well.ts                # lane math, player-lane rule, shortest-arc (§4)
      projection.ts          # (lane,depth)->screen; the ONLY sim/ transcendental site
      stepper.ts             # pure fixed-timestep accumulator (§12.3)
      collision.ts           # swept 1-D depth overlap (§6.7)
      difficultyCurve.ts     # interpolation of §8.2 -> per-level params (§8.1)
      spawner.ts             # spawn attempts, type/lane draw (§6)
      enemies/               # per-kind update logic (§6.1–6.5)
        flipper.ts  tanker.ts  spiker.ts  fuseball.ts  pulsar.ts  shots.ts
      superzapper.ts         # two-use state machine (§5)
      scoring.ts             # points, fuseball bands, bonus, bonus-life (§7)
      warp.ts                # descent + spike collision + fairness (§9)
      state.ts               # sim-owned state machine (§10)
      sim.ts                 # createSim(config, seed): the tick() entry + hash()
      hash.ts                # stable state serialization/hash (§12.2)
    persist/
      schema.ts              # SaveData encode/decode/validate (§12.4)
    render/
      canvas.ts              # viewport, DPR-2 cap, letterbox (§11.1)
      glow.ts                # layered-stroke additive glow helper (§11.1)
      font.ts                # Hershey/Vectrex stroke lettering (§11.1, D22)
      well.ts  entities.ts  particles.ts  hud.ts  screens.ts
      renderer.ts            # draws a SimState (+prev) each frame (§11.1)
    audio/
      context.ts             # AudioContext lifecycle (§11.2)
      sfx.ts                 # synthesized effects, event->sound (§11.2)
    input/
      map.ts                 # PURE snapshot construction + apportionment (§12.2, §12.3)
      capture.ts             # keyboard/mouse/pointer-lock DOM wiring (§5)
    app/
      loop.ts                # rAF loop driving the stepper (§12.3)
      pause.ts               # app-layer pause overlay + quit (§10, D19)
      storage.ts             # localStorage adapter around persist/ (§12.4)
      bench.ts               # ?bench=1 harness (§12.6)
      app.ts                 # wires sim+render+audio+input+persist
    __tests__/
      fixtures/frozenConfig.ts   # frozen GameConfig snapshot for golden tests (§13)
      replay.test.ts             # golden replay + self-consistency (§13)
      hashCompleteness.test.ts   # (§12.2/§13)
      antiCamping.test.ts        # (§13, D39/D44)
      descentFairness.test.ts    # (§9/§13)
      economyInvariant.test.ts   # (§7/§13)
```

---

## Phase 0 — Project scaffold

### Task 0.1: Toolchain and static bundle skeleton

**Files:** Create `package.json`, `tsconfig.json`, `vite.config.ts`,
`vitest.config.ts`, `.eslintrc.cjs`, `.prettierrc`, `.nvmrc`, `index.html`,
`src/main.ts`.

**Steps:**
- [ ] Init a Vite + TS vanilla project (no framework). `tsconfig` with
  `"strict": true`, `"noEmit"` for the typecheck script, ES2020 target/module.
- [ ] `package.json` scripts (I10): `dev`, `build`, `test`, `test:watch`,
  `typecheck`, `lint`, `check` (= `npm run typecheck && npm run lint && npm run test`).
  No `dependencies`, only `devDependencies`.
- [ ] `.nvmrc` = `22`; `engines.node` = `>=22` (I2).
- [ ] `index.html`: a single full-viewport `<canvas id="game">`, black background,
  `<script type="module" src="/src/main.ts">`. Relative asset paths so `dist/` is
  portable (§12.1).
- [ ] `src/main.ts`: for now, get the canvas and fill it black (placeholder).
- [ ] ESLint config with `@typescript-eslint`, and **activate both purity rules now**
  so they guard sim code from Phase 1 onward (Task 12.4 later adds a fixture proving
  they fire): (a) `no-restricted-properties` forbidding `Math.sqrt/sin/cos/tan/atan2/
  pow/exp/log` under `src/sim/**` except `src/sim/projection.ts`; (b)
  `no-restricted-globals`/`no-restricted-properties` forbidding `window`, `document`,
  `localStorage`, `performance`, `requestAnimationFrame`, `Math.random`, `Date` under
  `src/sim/**`, `src/persist/**`, and `src/input/map.ts` (§12.2/§12.3). Prettier wired.
- [ ] **Verify:** `npm run dev` serves a black page; `npm run build` emits static
  `dist/`; `npm run check` passes on the empty project (add one trivial passing
  test so `vitest run` exits 0).
- [ ] Commit.

**Definition of Done:** `npm run dev`, `npm run build`, `npm run check` all succeed;
`dist/` is self-contained with relative paths.

---

## Phase 1 — Sim foundations (pure, no DOM)

### Task 1.1: Core types

**Files:** Create `src/sim/types.ts`, `src/sim/types.test.ts` (type-level +
trivial runtime asserts).

**Interfaces (Produces — later tasks depend on these exact names):**
```ts
export type Lane = number;   // fractional for rimPos; integer for a resolved lane
export type Depth = number;  // 0 (rim) .. 1 (bottom)
export type EnemyKind = 'flipper' | 'tanker' | 'spiker' | 'fuseball' | 'pulsar';
export type Phase =
  | 'TITLE' | 'LEVEL_SELECT' | 'PLAYING' | 'GET_READY'
  | 'WARP' | 'GAME_OVER' | 'HIGH_SCORE_ENTRY';

export interface InputSnapshot {   // §12.3 — the ONLY way the sim advances
  move: number;      // per-tick rim delta in lanes, pre-clamped by input layer
  fire: boolean; zap: boolean;
  confirm: boolean; back: boolean; quit: boolean;  // edge-triggered UI intents
}

export interface Enemy {
  kind: EnemyKind; lane: number; depth: Depth;
  prevLane: number; prevDepth: Depth;   // for render interpolation (§12.3)
  // flip: source/dest lane + progress 0..1, or null when not flipping (§6)
  flip: { from: number; to: number; progress: number } | null;
  flipTimer: number;    // seconds until next flip attempt
  fireTimer: number;    // seconds until next shot attempt (firing kinds)
  rimTimer?: number;    // fuseball rim residency countdown (§6.4)
  climbDir?: 1 | -1;    // pulsar/spiker oscillation direction (§6.3/6.5)
  speedMul?: number;    // fuseball current jitter multiplier (§6.4)
}
export interface Shot { lane: number; depth: Depth; prevDepth: Depth; }
export interface Spike { lane: number; topDepth: Depth; }  // occupies [topDepth,1]
export type SimEvent =
  | { type: 'playerShot' } | { type: 'enemyShot' }
  | { type: 'enemyKilled'; kind: EnemyKind; lane: number; depth: Depth }  // lane for death burst
  | { type: 'playerDied' } | { type: 'flip' } | { type: 'superzap' }
  | { type: 'spikeHit' } | { type: 'pulseTelegraph' } | { type: 'bonusLife' }
  | { type: 'warpStart' } | { type: 'uiMove' } | { type: 'uiConfirm' }
  | { type: 'highScoreJingle' };
```
- [ ] Write a test that constructs each type literal (compile-time coverage) and
  asserts `EnemyKind` array length etc. Commit.

### Task 1.2: Seedable RNG (mulberry32)

**Files:** `src/sim/rng.ts`, `src/sim/rng.test.ts`.

**Interfaces (Produces):**
```ts
export interface Rng { next(): number; nextInt(n: number): number;
  state(): number; setState(s: number): void; }
export function makeRng(seed: number): Rng;
```
- [ ] **Test:** same seed → identical first 100 `next()` values; `next()` ∈ [0,1);
  `nextInt(16)` ∈ [0,16); `setState(state())` round-trips (two RNGs diverge/converge
  as expected); distribution of `nextInt(16)` over 100k draws is roughly uniform
  (loose bound). These support the determinism contract (§12.3).
- [ ] **Implement:** mulberry32.
```ts
export function makeRng(seed: number): Rng {
  let a = seed >>> 0;
  const next = () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return { next, nextInt: (n) => Math.floor(next() * n) | 0,
           state: () => a >>> 0, setState: (s) => { a = s >>> 0; } };
}
```
- [ ] Green, commit. (RNG state `a` is part of the hash — Task 12.3.)

### Task 1.3: Config types + validation

**Files:** `src/sim/config.ts`, `src/sim/config.test.ts`.

**Interfaces (Produces):**
```ts
export interface Vec2 { x: number; y: number; }
export interface Geometry { index: number; closed: boolean; rim: Vec2[]; vanishing: Vec2; }
export interface DifficultyAnchor { level: number; flip: number; tank: number;
  spik: number; fuse: number; puls: number; maxOnWell: number; climb: number;
  flipInt: number; fireInt: number; maxShots: number; eshot: number;
  spikeH: number | null; pulse: number | null; spawnInt: number; }  // §8.2 columns;
  // spikeH/pulse are null for the "—" cells (before the enemy's intro level);
  // paramsForLevel (Task 2.3) normalizes null to the column's first defined value.
export interface Tuning { /* every §8.3 timing/geometry constant, named:
  rimSpeed, mouseSensitivity, perTickClamp, shotSpeed, fireInterval, maxPlayerShots,
  flipAnimTime, rimFlipFactor (=0.5), climbMul (per kind), fuseballRimSpeed,
  fuseballRimTime, fuseballJitter (=[0.3,1.5], redraw 0.5), pulseDuration,
  pulseTelegraph, pulsarReversalDepth, minFireDepth, spikeTrimDepth (=0.08),
  descentSpeed, halfExtents {enemy,shot,spikeTop,blaster}, startingLives,
  getReadyDuration, gameOverBeat, flipSeekBias, uiStepInterval */ }
export interface Scoring { flipper: number; tanker: number; spiker: number;
  fuseballBands: [number, number, number]; pulsar: number; enemyShot: number;
  spikeTrimPoints: number;            // POINTS per trim (=1); distinct from
                                      // tuning.spikeTrimDepth (=0.08 depth)
  superzap: number; clearBonusPerLevel: number; clearBonusCapLevel: number;
  bonusLifeInterval: number; }        // economy constants live here only (no dup in Tuning)
export interface GameConfig { geometries: Geometry[]; difficulty: DifficultyAnchor[];
  tuning: Tuning; scoring: Scoring; }
export function validateConfig(c: GameConfig): void;  // throws on violation
```
- [ ] **Test:** `validateConfig` accepts a well-formed config; rejects a config
  whose difficulty anchors aren't sorted by level, whose geometry count ≠ 16, or
  whose tuning violates a stated §8.3 constraint at any anchor
  (`fireInterval > flipAnimTime/2 + extents/shotSpeed + tick`,
  `flipInt ≥ 2·flipAnimTime`, `perTickClamp < 0.5`,
  `pulse ≥ telegraph + pulseDuration`). This is part of the §13
  "tuning-constraint guards" area (the *interpolated-table* guard is in Task 2.3).
- [ ] Implement `validateConfig` from §8.2 column notes + §8.3 table. Commit.
- [ ] **Author the live data modules** here or in the task that first consumes each
  (per I4): `data/tuning.ts` (§8.3), `data/difficulty.ts` (§8.2 anchors, `—`→null),
  `data/scoring.ts` (§7). `data/geometries.ts` is authored in Task 1.5. The frozen
  test fixture (Task 12.2) snapshots all four.

### Task 1.4: Lane math + player-lane rule + level→geometry/palette mapping

**Files:** `src/sim/well.ts`, `src/sim/well.test.ts`, `src/sim/levels.ts`,
`src/sim/levels.test.ts`.

**Interfaces (Produces):**
```ts
export const LANES = 16;
export function normalizeRimPos(rimPos: number, closed: boolean): number;
export function playerLane(rimPos: number, closed: boolean): number;   // §4
export function adjacentLane(lane: number, dir: 1 | -1, closed: boolean): number | null;
export function shortestArcDir(from: number, to: number, closed: boolean): -1 | 0 | 1; // §4/§6.1
export function clampRimDelta(delta: number, clamp: number): number;   // §4/§8.3
// levels.ts (§4):
export function geometryIndexForLevel(level: number): number;  // (level-1) mod 16
export function paletteIndexForLevel(level: number): number;   // floor((level-1)/16) mod 6
```
- [ ] **Test (the §13 lane-math area):** closed `round(rimPos) mod 16` incl. wrap at
  15↔0; open `clamp(round(rimPos),0,15)` and rimPos clamped to `[0,15]`; `round` =
  `floor(x+0.5)` (test x.5 rounds up); `adjacentLane` returns `null` at open ends,
  wraps closed; `shortestArcDir` ties break clockwise (toward increasing index);
  `clampRimDelta` never exceeds the clamp (no lane skip at max delta).
- [ ] **Test (the §13 level-mapping area, and §15 criterion 2):**
  `geometryIndexForLevel` and `paletteIndexForLevel` across levels 1–112 including
  every 16-level boundary (e.g. level 16→0/blue, 17→0/red, 96→15/magenta,
  97→0/blue). `geometryIndexForLevel` maps 0–7→closed, 8–15→open (cross-checked in
  Task 1.5).
- [ ] Implement. Commit.

### Task 1.5: Well geometry data + structural validation (no projection)

**Files:** `src/sim/data/geometries.ts`, `src/sim/geometry.validate.test.ts`.

- [ ] Author 16 `Geometry` entries (§4): indices 0–7 closed (circle, square,
  plus/cross, triangle, pentagon, hexagon, hourglass/bowtie, diamond — 16 rim
  vertices each), 8–15 open (flat line, V, wide valley, U, W, zig-zag, arc, L —
  17 rim vertices each), each with a `vanishing` offset. Author winding so
  increasing lane index reads clockwise / left-to-right (§4).
- [ ] **Test (the §4 structural-validation area — no projection needed):** for all
  16 — exactly 16 lanes (16/17 vertices per closed/open); no rim self-intersection
  (segment-pair cross test); indices 0–7 `closed`, 8–15 open, matching
  `geometryIndexForLevel` (Task 1.4). (The projected-lane-width check is added in
  Task 1.6, once projection exists.)
- [ ] Implement geometries until the test passes (iterate vertex coords). Commit.

### Task 1.6: Projection math + projected-lane-width geometry check

**Files:** `src/sim/projection.ts`, `src/sim/projection.test.ts`; extend
`src/sim/geometry.validate.test.ts`.
(This is the one `sim/` module allowed transcendentals; its outputs never feed sim
state — §12.3.)

**Interfaces (Produces):**
```ts
export interface Viewport { width: number; height: number; }  // playfield px
export function project(lane: number, depth: Depth, g: Geometry, vp: Viewport): Vec2;
export function laneWidthAtRim(g: Geometry, vp: Viewport): number;  // min px, for §4 test
```
- [ ] **Test (§13 projection area):** depth 0 maps a lane center onto the rim
  polyline; increasing depth moves toward the vanishing point (monotone); holds for
  all 16 geometries; `project` is pure (same inputs → same output).
- [ ] **Test (completes the §4 geometry-validation area):** extend
  `geometry.validate.test.ts` — min projected rim lane width ≥ 24 px at 1440×1080
  for all 16 geometries (uses `laneWidthAtRim`, now available). Iterate any failing
  geometry's vertices until it passes.
- [ ] Implement as linear interpolation between the rim polygon (depth 0) and the
  rim scaled toward `vanishing` (depth 1); lane center = midpoint of rim vertices
  `i, i+1`. Commit.

---

## Phase 2 — Sim core mechanics

### Task 2.1: Fixed-timestep stepper (pure)

**Files:** `src/sim/stepper.ts`, `src/sim/stepper.test.ts`.

**Interfaces (Produces):**
```ts
export const TICK_MS = 1000 / 60;
export const MAX_ACCUM_MS = 250;
export function advance(accumMs: number, elapsedMs: number):
  { ticks: number; accumMs: number; alpha: number };   // §12.3
```
- [ ] **Test (§13 stepper area):** 16.7 ms → 1 tick; 8 ms twice → 0 then 1 tick;
  a 40 ms frame → 2 ticks; a 5000 ms frame clamps to `MAX_ACCUM_MS` (≤ 15 ticks);
  `alpha` ∈ [0,1); leftover accumulator carries; a pause is modeled by the caller
  not calling `advance` (no internal time). Commit after green.

### Task 2.2: Swept collision

**Files:** `src/sim/collision.ts`, `src/sim/collision.test.ts`.

**Interfaces (Produces):**
```ts
// same-lane 1-D swept overlap of two [prev,curr] depth spans, each inflated by extent
export function sweptOverlap(prevA: number, currA: number, extA: number,
                             prevB: number, currB: number, extB: number): boolean; // §6.7
```
- [ ] **Test (§13 collision area):** two opposing fast shots that would tunnel under
  point sampling DO overlap (player shot 0.025/tick vs enemy shot ~0.018/tick with
  extents 0.01); a shot spawned at depth 0 overlaps a depth-0 rim enemy on tick 1;
  non-overlapping spans return false; extents are inclusive at the boundary.
- [ ] Implement interval-overlap of `[min(prev,curr)-ext, max(prev,curr)+ext]` for
  A and B. Commit.

### Task 2.3: Difficulty interpolation

**Files:** `src/sim/difficultyCurve.ts`, `src/sim/difficultyCurve.test.ts`.

**Interfaces (Produces):**
```ts
export interface LevelParams { /* one resolved value per §8.2 column */ }
export function paramsForLevel(level: number, anchors: DifficultyAnchor[]): LevelParams; // §8.1
```
- [ ] **Test (§13 spawner/difficulty area):** exact anchor values at anchor levels;
  linear interpolation at a between-level (e.g. level 6); integer columns round
  half-up; `null` (`—`) cells (spikeH<4, pulse<17) normalized to the column's first
  defined value; budgets 0 before introduction level; flat tail (levels 200 and 500
  == level-96 row); **monotonic difficulty** every step
  (budgets/maxOnWell/climb/maxShots/eshot/spikeH non-decreasing;
  flipInt/fireInt/pulse/spawnInt non-increasing).
- [ ] **Test (completes the §13 tuning-constraint guards — interpolated table):**
  for every level 1..200 the resolved `LevelParams` satisfy `flipInt ≥
  2·flipAnimTime`, `rimFlipInterval (=0.5·flipInt) ≥ flipAnimTime`, and
  `pulse ≥ telegraph + pulseDuration` — so an interpolated (not just anchor) row
  can never violate a constraint. (Task 1.3 guarded the anchors; this guards the
  curve between them.)
- [ ] Implement. Commit.

---

## Phase 3 — Sim entities & combat

### Task 3.1: SimState shape + createSim skeleton + state machine

**Files:** `src/sim/state.ts`, `src/sim/sim.ts`, `src/sim/hash.ts`, tests alongside.

**Interfaces (Produces):**
```ts
// Read-only snapshot the app provides from persist/ so the sim can decide
// level-select bounds (§8.5) and high-score qualification (§10) WITHOUT reading
// localStorage itself (the sim stays pure — §12.2). The app persists the sim's
// updated highScores/maxLevelReached back after the game (Task 11.1/11.2).
export interface InitialSave {
  maxLevelReached: number;
  highScores: { initials: string; score: number; level: number }[];  // sorted desc, ≤10
}
export interface SimState {
  phase: Phase; level: number; score: number; lives: number;
  livesGranted: number;                 // for bonus-life accounting (§7)
  rimPos: number; closed: boolean; geometryIndex: number;
  enemies: Enemy[]; playerShots: Shot[]; enemyShots: Shot[]; spikes: Spike[];
  budget: Record<EnemyKind, number>;    // remaining spawn budget (§6)
  superzapper: 0 | 1 | 2;               // EMPTY/PARTIAL/FULL (§5)
  spawnTimer: number; pulseClock: number; getReadyTimer: number; warpDepth: number;
  fireCooldown: number; maxLevelReached: number;
  selector: number;                     // level-select / high-score cursor value
  selectorAccum: number;                // UI movement accumulator (§10, Task 6.1)
  selectorTimer: number;                // UI step-rate limiter (§10, Task 6.1)
  hsInitials: number[]; hsSlot: number; // high-score entry in progress (§10)
  highScores: InitialSave['highScores'];// in-session table (seeded from InitialSave)
  rng: Rng;
}
export interface Sim {
  tick(input: InputSnapshot): { events: SimEvent[] };
  getState(): Readonly<SimState>;
  hash(): number;
}
// initialSave defaults to { maxLevelReached: 1, highScores: [] } when omitted.
export function createSim(config: GameConfig, seed: number, initialSave?: InitialSave): Sim;
// pure transition helper, unit-tested directly (§10):
export function transition(s: SimState, input: InputSnapshot, cfg: GameConfig,
                           events: SimEvent[]): void;
```
- [ ] Create `src/sim/hash.ts` now with `hashState(s: SimState): number` covering
  the fields defined so far. **Every later task that adds a future-affecting field
  extends `hashState` in the same commit** ("add to the hash as you go") — the
  hash-completeness test (Task 12.3) will fail if a field is missed. Wire
  `sim.hash()` to it.
- [ ] **Test (§13 state-machine area) — build incrementally as later tasks add
  states:** start in TITLE; TITLE→LEVEL_SELECT on confirm; LEVEL_SELECT→TITLE on
  back; LEVEL_SELECT→PLAYING on confirm sets `maxLevelReached=max(old,level)` and
  seeds level-select bounds from `initialSave.maxLevelReached`;
  GAME_OVER→HIGH_SCORE_ENTRY vs TITLE decided by `qualifies(state.highScores, score)`
  (Task 7.1's predicate); HIGH_SCORE_ENTRY→TITLE on confirm inserts the entry into
  `state.highScores`. (WARP/GET_READY/quit edges added in Tasks 5.x/6.x.) Assert
  **no** undeclared transition fires.
- [ ] Implement the tick pipeline skeleton (the §6 tick-order steps as ordered
  function calls, most no-ops until their tasks land). Commit.

### Task 3.2: Player movement + firing + shots

**Files:** `src/sim/enemies/shots.ts` (shared shot advance), player logic in
`sim.ts`/`state.ts`, tests.

**Interfaces (Produces):**
```ts
export function advanceShots(shots: Shot[], speed: number, dir: 1 | -1): void; // moves + records prevDepth
```
- [ ] **Test (§13 player-firing area):** movement applies `input.move` to `rimPos`
  (keyboard delta), clamps on open wells; fire spawns a shot at `playerLane`,
  depth = 0 in PLAY / warpDepth in WARP; ≤ 8 shots in flight; `fireCooldown`
  enforces one shot per `fireInterval`; hold-fire auto-fires at the cap; a shot
  reaching depth 1 despawns; shots cleared on every state transition (§6).
- [ ] Implement in the tick pipeline (steps 1–2). Commit.

### Task 3.3: Scoring + bonus life

**Files:** `src/sim/scoring.ts`, `src/sim/scoring.test.ts`.

**Interfaces (Produces):**
```ts
export function pointsForKill(kind: EnemyKind, depth: Depth, sc: Scoring): number; // §7
export function levelClearBonus(level: number, sc: Scoring): number;   // 100*min(level,96)
export function applyScore(s: SimState, points: number, cfg: GameConfig,
                           playerDiedThisTick: boolean, events: SimEvent[]): void; // bonus-life rule §6/§7
```
- [ ] **Test (§13 scoring area):** each kind's points; fuseball bands 250/500/750 by
  kill depth; zero-point Tanker rim self-split; clear bonus and its level-96 cap;
  bonus-life rule = grant `floor(score/interval) − livesGranted`; a threshold crossed
  by the clear bonus grants a life; a threshold crossed by kill points on a tick the
  player also died nets zero.
- [ ] Implement. Commit.

---

## Phase 4 — Enemies

Each enemy task adds: spawn init, per-tick update, and its §13 behavior tests. All
motion is lane-based, depth frozen during flips (§6). Add each kind's fields to the
hash as you go.

### Task 4.1: Flip mechanics + Flipper

**Files:** `src/sim/enemies/flipper.ts`, tests. Shared flip helpers here.

**Interfaces (Produces):**
```ts
export function startFlip(e: Enemy, toLane: number): void;          // sets flip, freezes depth
export function advanceFlip(e: Enemy, dtSec: number): boolean;      // returns true on completion
export function chooseMidWellFlip(e: Enemy, playerLane: number, closed: boolean,
                                  seekBias: number, rng: Rng): number; // §6/§6.1
export function updateFlipper(e: Enemy, s: SimState, lp: LevelParams, cfg: GameConfig): void;
```
- [ ] **Test (§13 Flipper area):** mid-well flip is player-seeking with prob
  `flipSeekBias` else random adjacent (seed-controlled), ties clockwise, inward at
  open ends, no flip when already on player lane (redraws full FlipInt); depth frozen
  during flip; occupancy = source lane first half, dest lane second half (shot
  collision only); rim arrival discards pending mid-well timer, first rim flip after
  `rimFlipInterval`; rim chase = shortest arc re-evaluated each flip; a completed rim
  flip onto the player lane is lethal, crossing a mid-flip enemy's lane is safe.
- [ ] Implement. Commit.

### Task 4.2: Tanker

**Files:** `src/sim/enemies/tanker.ts`, tests.
- [ ] **Test (§13 Tanker area):** climbs slowly, never changes lanes, fires;
  shot/rim split → two Flippers created at the Tanker's depth, each starting a flip
  (progress 0) to opposite adjacent lanes, FlipInt from completion; end-lane split →
  both inward, staggered by `flipAnimTime/2`; splits ignore MaxOnWell; rim self-split
  is non-lethal and scores 0; Superzapper kill does not split (Task 6.4).
- [ ] Implement. Commit.

### Task 4.3: Spiker + spikes

**Files:** `src/sim/enemies/spiker.ts`, tests.

**Interfaces (Produces):**
```ts
export function trimOrKill(spike: Spike, spikerAtTip: Enemy | null,
                           trim: number): 'kill' | 'trim';  // §6.3 priority
export function updateSpiker(e: Enemy, s: SimState, lp: LevelParams, cfg: GameConfig): void;
```
- [ ] **Test (§13 Spiker area):** climb raises spike top to `1−SpikeH` then reverses;
  descends its lane at climb speed to depth 1, switches to a random lane that is
  **not its current lane and not occupied by another Spiker**, resumes; growth-only
  top (a trim while the Spiker is resident below the top persists — never reverted);
  shot at the tip with Spiker at/above kills the Spiker, else trims once and is
  consumed; enemies below a spike top are shielded; spikes persist across death,
  cleared at level start; Spikers don't count toward MaxOnWell.
- [ ] Implement. Commit.

### Task 4.4: Fuseball

**Files:** `src/sim/enemies/fuseball.ts`, tests.
- [ ] **Test (§13 Fuseball area):** speed multiplier redrawn from [0.3,1.5] every
  0.5 s; climbs, never changes lanes; rim residency = crawl toward player at
  `fuseballRimSpeed` shortest arc (open ends reverse) for `fuseballRimTime`, then
  descend at base speed (no jitter) to a random depth in [0.6,1.0], resume; symmetric
  rim contact lethal; depth-banded score on kill; removable only by shot/Superzapper.
- [ ] Implement. Commit.

### Task 4.5: Pulsar + pulse clock

**Files:** `src/sim/enemies/pulsar.ts`, tests.

**Interfaces (Produces):**
```ts
export type PulsePhase = 'quiet' | 'telegraph' | 'pulse';
export function pulsePhase(clock: number, pulseCycle: number, tuning: Tuning): PulsePhase; // §6.5
export function updatePulsar(e: Enemy, s: SimState, lp: LevelParams, cfg: GameConfig): void;
```
- [ ] **Test (§13 Pulsar area):** oscillates between depth 0.15 and 1, never rim,
  never despawns, flips (same targeting) incl. while descending; pulse timeline
  quiet/telegraph(0.5)/pulse(pulseDuration); clock restarts each PLAYING entry;
  participation = on-well at telegraph start; flips freeze telegraph→pulse-end,
  deferred flip releases at pulse end; a lane is lethal for the whole pulse (entering
  mid-pulse kills); de-electrifies the instant the last participating Pulsar on it
  dies; shots pass through pulses; fires shots subject to min-firing-depth.
- [ ] **Test (§13 tick-order — same-tick pulse save):** a Pulsar pulsing on the
  player's lane, with a player shot positioned to destroy it this tick; assert the
  player **survives** (step-3 kill de-electrifies before step-5 pulse lethality).
- [ ] Implement. Commit.

### Task 4.6: Enemy fire scheduler + enemy shots

**Files:** extend `src/sim/enemies/shots.ts`, `src/sim/spawner.ts` shares RNG, tests.
- [ ] **Test (§13 enemy-fire area):** eligible kinds (flipper/tanker/pulsar) draw
  next-shot delay uniform [0.5,1.5]×FireInt; ineligible when depth<0.2, rim-resident,
  mid-flip, or MaxShots reached (suppressed → redraw); enemy shot crossing depth 0 on
  the player lane kills, elsewhere despawns at rim; player shot destroys enemy shot
  (0 points).
- [ ] **Test (§13 tick-order — same-tick enemy-shot save):** an enemy shot about to
  cross depth 0 on the player's lane, with a player shot positioned to intercept it
  this tick; assert the player **survives** (step-3 shot-vs-shot resolves before
  step-4 rim lethality). Commit.

### Task 4.7: Spawner

**Files:** `src/sim/spawner.ts`, tests.
- [ ] **Test (§13 spawner area):** attempt every SpawnInt, first after PLAYING entry;
  spawn only if threatening on-well count < MaxOnWell (Spikers excluded) and budget
  remains; type drawn weighted by remaining budget; lane uniform, except Spikers
  exclude lanes already holding a Spiker (defer if none free); per-type budgets match
  the table initially. Commit.

---

## Phase 5 — Progression, warp, Superzapper, death

### Task 5.1: Wave completion + level advance

**Files:** `src/sim/state.ts` (advance logic), tests.
- [ ] **Test:** wave completes only in PLAYING, never on a death tick, when budget
  exhausted AND no enemies remain; awards clear bonus (then bonus-life re-check, §6
  step 8); PLAYING→WARP; enemy shots cancelled, spikes remain. On the next PLAYING
  entry: level increments, geometry/palette recompute (Task 1.4 helpers),
  Superzapper resets to FULL, spikes cleared, rim position resets to lane 8 center
  (§5), and `maxLevelReached = max(old, newLevel)` (§8.5). Commit.

### Task 5.2: Warp descent + fairness

**Files:** `src/sim/warp.ts`, tests + `src/__tests__/descentFairness.test.ts`.
- [ ] **Test (§13 warp area):** Blaster descends at descent speed; can move + fire;
  shots trim spikes; fire cooldown reset at WARP entry; spike collision (point
  Blaster, §6.7) kills → life lost, level still complete, descent not replayed,
  WARP→PLAYING (lives remain) or WARP→GAME_OVER (last life); level banner is
  render-only. **maxLevelReached (§8.5):** it updates on the WARP→PLAYING entry for
  the next level, and does **not** update if a warp spike-death ends the game
  (WARP→GAME_OVER) before that entry. **Same-tick trim-save (§13 tick-order):** a
  spike the Blaster would hit this tick, with a scripted shot that trims it to safety
  the same tick; assert the Blaster **survives** (step-3 trim before step-5 warp
  lethality). **Descent-fairness invariant test:** simulate the actual descent on a
  max-`SpikeH` spike with scripted hold-fire; assert no spike collision. Commit.

### Task 5.3: GET_READY + death/respawn

**Files:** `src/sim/state.ts` (death/GET_READY logic), tests.
- [ ] **Test (§13 death/respawn area):** a lethal event in PLAYING → GET_READY (if
  lives remain) after decrement; on-well enemies returned to budget by type (split
  Flippers → Flipper budget, may exceed authored); shots cleared; spikes/score/rim
  persist; GET_READY lasts `getReadyDuration`, movement applied, fire/zap ignored,
  wave check suspended; re-entry via normal spawner; last-life death → GAME_OVER;
  same-tick last-enemy-kill + death still costs the life and completes the wave on
  the resumed PLAYING tick. Commit.

### Task 5.4: Superzapper

**Files:** `src/sim/superzapper.ts`, tests.
- [ ] **Test (§13 Superzapper area):** FULL→PARTIAL destroys all on-well enemies
  (Tankers not split, 0 points); PARTIAL→EMPTY destroys the enemy nearest the rim
  (ties lowest lane index; mid-flip uses occupancy-half lane); EMPTY no-op; activating
  with empty well consumes the use; accepted only in PLAYING; resets to FULL at level
  start; not restored by death. Commit.

---

## Phase 6 — State machine completion (screens, quit, selectors)

### Task 6.1: Title / level-select / high-score-entry navigation

**Files:** `src/sim/state.ts` (UI-navigation transitions), tests.
- [ ] **Test (§13 UI-navigation area):** selector step = 1 per ±1.0 accumulated
  lanes, ≤ 1 per UI-step interval, accumulator reset on emit and cleared on
  zero-cross/state entry (held-then-release emits no backlog); level-select opens at
  `max(9,maxLevelReached)`, clamps 1..max (no wrap); high-score entry over
  space,A–Z,0–9 (default A), fire locks+advances, third fire → TITLE, back returns a
  slot; TITLE click carve-out = confirm; qualification predicate (≤10, ties rank new
  above equal). Commit.

### Task 6.2: Quit-to-title + full transition set

**Files:** `src/sim/state.ts`, `src/sim/state.test.ts`.
- [ ] **Test:** `input.quit` forces GAME_OVER from PLAYING, GET_READY, or WARP;
  final state-machine test asserts **every** §10 transition (incl. GET_READY↔,
  both WARP exits, all quit edges) and **no others**. Commit.

---

## Phase 7 — Persistence

### Task 7.1: Save schema

**Files:** `src/persist/schema.ts`, tests.

**Interfaces (Produces):**
```ts
export interface SaveData { highScores: { initials: string; score: number; level: number }[];
  settings: { muted: boolean }; maxLevelReached: number; }
export function encode(d: SaveData): string;
export function decode(raw: string | null): SaveData;   // validates, defaults
export function qualifies(scores: SaveData['highScores'], score: number): boolean;
export function insertScore(d: SaveData, e: SaveData['highScores'][number]): SaveData;
```
- [ ] **Test (§13 persistence area):** round-trip; `decode(null)`/corrupt
  JSON/wrong-shape/unknown-fields → defaults (never throws); `maxLevelReached`
  round-trip; qualification incl. ties and the ≤10 bound; top-10 truncation. Commit.

---

## Phase 8 — Rendering (Canvas 2D)

Render reads `SimState` + previous-tick positions; never mutates sim state (§11.1).
No unit tests for pixels; correctness is the §15 visual checklist + smoke pass.
Keep hot paths allocation-free (reuse buffers; I3).

### Task 8.1: Canvas + viewport + glow + stroke font
**Files:** `src/render/canvas.ts`, `glow.ts`, `font.ts`.
- [ ] Full-viewport canvas, letterboxed 4:3, DPR-2-capped backing store (§11.1).
- [ ] `glow(ctx, strokePath, color)`: additive (`globalCompositeOperation='lighter'`)
  wide low-alpha pass + thin bright core; degradation flag drops the wide pass
  (§11.1). Stroke-segment font module (D22) — no font files. Commit.

### Task 8.2: Well + player-lane highlight + interpolation
- [ ] Draw the well via `project` (§11.1); highlight the rounded `playerLane`; draw
  the claw at the fractional interpolated `rimPos`. Interpolate entity prev→curr by
  alpha along shortest arc; teleporting entities set prev=curr. Commit.

### Task 8.3: Entities (per-type silhouettes/colors) + particles
- [ ] Distinct stroked silhouettes + fixed colors (Flipper red, Tanker purple,
  Spiker/spike green, Fuseball multicolor, Pulsar cyan→white telegraph); band-colored
  well drawn dimmed/desaturated so full-brightness enemies read (§11.1/D35). Flip
  drawn as lane-over-lane rotation from `flip` phase (not a slide). Particle bursts
  use the render-side RNG. Commit.

### Task 8.4: HUD + screens
- [ ] HUD (score, high score, lives, Superzapper pips, level); title (logo, top-10,
  controls, reserved-key note, **mute indicator** §10), level-select, GET_READY,
  game-over, high-score-entry, "AVOID SPIKES" warp flash, warp zoom. Commit.

---

## Phase 9 — Audio

### Task 9.1: AudioContext lifecycle + synthesized SFX
**Files:** `src/audio/context.ts`, `src/audio/sfx.ts`.
- [ ] Create/resume on first gesture; re-`resume()` on statechange / resume-from-pause
  (Safari interrupted) (§11.2). Synth (oscillator/noise+envelope) each §11.2 SFX;
  map `SimEvent[]` → sounds; mute toggle (M) honored. Commit.

---

## Phase 10 — Input

### Task 10.1: Pure snapshot mapping + apportionment
**Files:** `src/input/map.ts`, `src/input/map.test.ts`.
- [ ] **Test (§13 input-mapping area):** key-state → per-tick lane delta
  (rimSpeed×tick); mouse-delta → sensitivity-scaled; **multi-tick apportionment** — a
  frame stepping N ticks drains the pending mouse accumulator ≤ clamp per tick,
  carries the remainder, 0-tick frames accrue, no snapshot reused; keyboard+mouse
  summed then re-clamped; a large single-frame swipe never exceeds the clamp. Commit.

### Task 10.2: DOM capture + pointer lock
**Files:** `src/input/capture.ts`.
- [ ] Keyboard; pointer-lock request on canvas click in PLAYING/GET_READY/WARP
  (`unadjustedMovement:true`, retry without on not-supported, defensive non-Promise
  return); consume lock/unpause/title clicks (not fire); clear the mouse accumulator
  on pause/resume; suppress context menu for right-click zap. (Behavior verified via
  the §13 manual browser-integration checklist.) Commit.

---

## Phase 11 — App wiring

### Task 11.1: Storage adapter
**Files:** `src/app/storage.ts`, `src/app/storage.test.ts`.
- [ ] localStorage read/write around `persist/` `encode`/`decode`; builds the
  `InitialSave` the sim consumes (Task 3.1) and persists the sim's final
  `highScores`/`maxLevelReached`/`muted` back. **Test:** a mocked `localStorage`
  whose `getItem`/`setItem` **throw** (private-mode/quota) degrades gracefully — the
  adapter returns defaults / silently no-ops, never throwing (§12.4 "storage-throwing
  adapter"). Commit.

### Task 11.2: Game loop + pause overlay
**Files:** `src/app/loop.ts`, `src/app/pause.ts`, `src/app/app.ts`, `src/main.ts`.
- [ ] rAF loop: read elapsed, `advance()` the stepper, build a snapshot per tick,
  `sim.tick()`, render with alpha, dispatch events to audio/particles (§12.3).
- [ ] App-layer pause overlay (P/Escape, auto-pause on blur/visibility/pointer-lock
  exit only in PLAYING/GET_READY/WARP; ignored elsewhere; no sim time leak); resume
  (P or click); Quit-to-title (Q → `input.quit`) (§10, D19). Seed from
  `Date.now()`⊕`crypto` at game start (§12.3). Commit.

### Task 11.3: Bench mode + frame-time overlay
**Files:** `src/app/bench.ts`.
- [ ] `?bench=1`: gesture-start, fixed 2880×2160 backing store, max-legal-load census
  (24 threatening + 7 Spikers + 16 full spikes + active pulse + 8+8 shots + saturated
  particles), seeded+scripted 60 s; report mean & p95 (nearest-rank, drop frame 1)
  **work time** + informational dropped-frame %/rAF stats as console JSON + on screen.
  F3 frame-time overlay in normal play (§12.6). Commit.

---

## Phase 12 — Integration, determinism, lint gates

### Task 12.1: State-hash audit
**Files:** `src/sim/hash.ts` (created in Task 3.1 and extended per task).
- [ ] Audit `hashState` against the final `SimState` and every entity/shot/spike
  field: confirm it hashes every future-affecting field (§12.2 list: entity
  kind/lane/depth/flip/timers, shots, spikes, RNG state, pulse clock, score, lives,
  livesGranted, budgets, phase, all timers, selector state). Add any missed field.
  (Task 12.3's completeness test is the automated backstop.) Commit.

### Task 12.2: Golden replay + self-consistency
**Files:** `src/__tests__/fixtures/frozenConfig.ts`, `src/__tests__/replay.test.ts`.
- [ ] Frozen `GameConfig` snapshot; scripted input sequence over several levels; assert
  exact final `{hash, score, level, lives, superzapper, census}`; self-consistency:
  two runs of same seed+script → identical per-tick hashes. Commit. (Re-record golden
  only on intentional rule changes / reviewed engine upgrade; CI pins Node — I2.)

### Task 12.3: Hash-completeness test
**Files:** `src/__tests__/hashCompleteness.test.ts`.
- [ ] Mutate each state category (entity field, timer, RNG state, score, budget, pulse
  clock, phase) and assert the hash changes — guards against an omitted field. Commit.

### Task 12.4: Verify the sim-purity + engine-stability lint rules fire
The rules themselves were activated in Task 0.1 and have guarded sim code all along.
- [ ] Add a deliberately-violating fixture (e.g. `Math.sqrt` in a sim file, and a
  `window` reference in a persist file) in a scratch branch/file, confirm
  `npm run lint` **fails** on each, then remove the fixtures. Confirm `npm run lint`
  is green on the real tree. Commit (the removal + a note documenting the check).

### Task 12.5: Anti-camping + economy invariant tests
**Files:** `src/__tests__/antiCamping.test.ts`, `economyInvariant.test.ts`.
- [ ] **Anti-camping (§13/D44):** first 10 fixed seeds; player scripted to the camp
  lane (mid-rim closed level 1; end-lane open level 9) then stationary+hold-fire; each
  run fails to clear AND dies within 120 s; median time-to-death < 60 s per topology.
  Tune `flipSeekBias`/`fireInterval` in `data/tuning.ts` until green.
- [ ] **Economy (§7/D30):** compute max attainable tail-wave score (full budgets,
  released Flippers, all Fuseballs at 750, capped clear bonus) < bonus-life interval.
  Commit.

---

## Phase 13 — Acceptance

### Task 13.1: Acceptance criteria pass
- [ ] Walk every §15 criterion (1–12); confirm each maps to a green test or a checked
  manual/visual item. Fill the **manual browser-integration checklist** (§13) and the
  **visual identity checklist** (§15.12) per supported browser; run the **smoke pass**
  (§13) in Chrome, Firefox, Edge, Safari; run `?bench=1` on the reference machine and
  record machine/browser/display + work-time numbers (§15.7). Record results in
  `loop/acceptance-results.md`. Commit.
- [ ] Final `/codex-review` of the whole tree; address medium+ or record rejected.
  Commit. **Definition of Done for the project:** all §15 criteria satisfied,
  `npm run check` green, bench within budget, smoke pass clean in all four browsers.

---

## Spec-coverage map (self-review)

Every spec section maps to a task: §4 well/lanes/mapping → 1.4/1.5/1.6; §5 player →
3.2/5.1/5.3/5.4; §6 enemies/tick-order/collision → 2.2/4.x/5.2/5.3; §7 scoring →
3.3/12.5; §8 difficulty/starting-level → 1.3/2.3/3.1/4.7/5.1/5.2; §9 warp → 5.2; §10
states/screens → 3.1/6.x; §11 render/audio → 8.x/9.x; §12.2 architecture → file
structure + all sim tasks; §12.3 loop/determinism → 2.1/3.1/10.1/11.2/12.1–12.4;
§12.4 persistence → 7.1/11.1; §12.6 bench → 11.3; §13 tests → the test area cited in
each task (and the checklist traceability map); §15 acceptance → 13.1. Save-data
injection (`InitialSave`) crosses 3.1 (consume) ↔ 7.1/11.1 (produce/persist).
