# Teapot Build Checklist

Status tracker for implementing `loop/implementation-guide.md` (which cites
`loop/specification.md` §N for exact behavior). Check an item off in the **same
commit** that completes it (I12). Each task's full Definition of Done is in the
guide; the short form is: tests green → `npm run check` green → `/codex-review`
medium+ addressed → box checked → commit.

**Legend:** `[ ]` todo · `[~]` in progress · `[x]` done. Numbers are guide task IDs.

---

## Phase 0 — Scaffold
- [ ] 0.1 Toolchain + static bundle skeleton (Vite/TS-strict/Vitest/ESLint/Prettier,
  npm scripts incl. `check`, `.nvmrc` 22, `index.html` canvas, black page).
  **DoD:** `npm run dev`/`build`/`check` all succeed; `dist/` self-contained.

## Phase 1 — Sim foundations (pure, no DOM)
- [ ] 1.1 Core types (`sim/types.ts`).
- [ ] 1.2 Seedable RNG mulberry32 (`sim/rng.ts`) — same-seed determinism test.
- [ ] 1.3 `GameConfig` types (spikeH/pulse `number|null` for `—` cells) +
  `validateConfig` (anchor tuning-constraint guards) + author live data modules
  (tuning/difficulty/scoring) (§8.2/§8.3/§7).
- [ ] 1.4 Lane math + player-lane rule (round=floor(x+.5), wrap/clamp, shortest-arc,
  per-tick clamp) **+ level→geometry/palette mapping** (`(N-1)mod16`,
  `floor((N-1)/16)mod6` across levels 1–112) (§4).
- [ ] 1.5 16 well geometries + **structural** validation (16 lanes, winding,
  no self-intersection; 0–7 closed, 8–15 open — no projection) (§4).
- [ ] 1.6 Projection math (depth-0→rim, monotone toward vanishing, all 16) **+
  projected-lane-width geometry check (≥24 px)** (§11.1/§4).
  **DoD (phase):** all §13 lane/level-mapping/projection/geometry/config test areas
  green.

## Phase 2 — Sim core mechanics
- [ ] 2.1 Fixed-timestep stepper (0/1/N ticks, 250 ms clamp, alpha, carry) (§12.3).
- [ ] 2.2 Swept collision (no tunneling, depth-0 rim hit, boundaries) (§6.7).
- [ ] 2.3 Difficulty interpolation (anchors, `—` cells, budgets gating, flat tail,
  monotonicity, pulse guard) (§8.1).

## Phase 3 — Sim entities & combat
- [ ] 3.1 `SimState` + `createSim` + state-machine skeleton + first transitions (§10).
- [ ] 3.2 Player movement + firing + shots (8-cap, fireInterval, auto-fire, despawn,
  clear-on-transition) (§5).
- [ ] 3.3 Scoring + bonus-life rule (bands, clear bonus + cap, floor-based lives,
  same-tick life+death nets zero) (§7).

## Phase 4 — Enemies
- [ ] 4.1 Flip mechanics + Flipper (seek/random targeting, depth-freeze, occupancy
  halves, rim chase, timer transitions) (§6/§6.1).
- [ ] 4.2 Tanker (split → 2 Flippers, end-lane stagger, ignores MaxOnWell, non-lethal
  0-pt rim self-split) (§6.2).
- [ ] 4.3 Spiker + spikes (build/reverse/descend/re-emerge, one-per-lane, growth-only
  top, trim-vs-kill priority, shielding, not counted in MaxOnWell) (§6.3).
- [ ] 4.4 Fuseball (0.3–1.5 jitter, temporary rim residency then descend to [0.6,1],
  symmetric rim contact, depth-banded score) (§6.4).
- [ ] 4.5 Pulsar + pulse clock (oscillate/never-rim/never-despawn, telegraph/pulse,
  participation, flip freeze, full-duration lethality, de-electrify on death) (§6.5).
- [ ] 4.6 Enemy fire scheduler + enemy shots (eligibility, [0.5,1.5]×FireInt, MaxShots,
  rim-kill, shot-vs-shot 0 pts) (§6.6).
- [ ] 4.7 Spawner (SpawnInt cadence, MaxOnWell excl. Spikers, weighted type, uniform
  lane w/ Spiker exclusion, budgets) (§6).

## Phase 5 — Progression, warp, Superzapper, death
- [ ] 5.1 Wave completion + level advance (PLAYING-only, not on death tick, clear
  bonus + bonus-life re-check) (§8.4).
- [ ] 5.2 Warp descent + fairness (move/fire/trim, cooldown reset, spike death rules,
  WARP→PLAYING/GAME_OVER) + **descent-fairness simulated test** (§9).
- [ ] 5.3 GET_READY + death/respawn (budget-return by type, shots cleared, persist
  spikes/score/rim, input rules, last-life→GAME_OVER, same-tick kill+death) (§5/§10).
- [ ] 5.4 Superzapper (FULL/PARTIAL/EMPTY, all-kill no-split, nearest-rim 2nd use,
  empty-well consumes, PLAYING-only, reset at level, death-persist) (§5).

## Phase 6 — State machine completion
- [ ] 6.1 Title/level-select/high-score navigation (selector steps + reset, clamp,
  default level, entry loop, click carve-out, qualification) (§10).
- [ ] 6.2 Quit-to-title + **full transition test** (every §10 edge incl. quit from
  PLAYING/GET_READY/WARP, and no others) (§10).

## Phase 7 — Persistence
- [ ] 7.1 Save schema (round-trip, corrupt/missing/wrong-shape defaults, qualification,
  top-10) (§12.4).

## Phase 8 — Rendering (verified by §15 checklist + smoke pass, not unit tests)
- [ ] 8.1 Canvas/viewport/DPR-2/letterbox + additive glow + stroke font (§11.1/D22).
- [ ] 8.2 Well + player-lane highlight + fractional claw + tween/teleport (§11.1).
- [ ] 8.3 Per-type enemy silhouettes/colors + dimmed band + flip rotation + distinct
  player/enemy shots + Superzapper full-screen FX + particles (§11.1/D35).
- [ ] 8.4 HUD + all screens + AVOID-SPIKES flash + warp zoom (§10/§11.1).

## Phase 9 — Audio
- [ ] 9.1 AudioContext lifecycle + synthesized SFX per event + mute (§11.2).

## Phase 10 — Input
- [ ] 10.1 Pure snapshot mapping + multi-tick apportionment test (§12.2/§12.3).
- [ ] 10.2 DOM capture + pointer-lock lifecycle + consumed clicks + accumulator clear
  (§5). *(browser-integration verified via manual checklist in 13.1)*

## Phase 11 — App wiring
- [ ] 11.1 localStorage adapter with graceful degradation (§12.4).
- [ ] 11.2 rAF loop + app-layer pause overlay + quit + seed provenance (§12.3/§10/D19).
- [ ] 11.3 Bench mode (fixed 2880×2160, max-legal census, mean/p95 work time) + F3
  overlay (§12.6).

## Phase 12 — Integration, determinism, lint gates
- [ ] 12.1 State hash (all future-affecting fields) (§12.2).
- [ ] 12.2 Golden replay + self-consistency (frozen config, scripted inputs) (§13).
- [ ] 12.3 Hash-completeness test (mutate each category → hash changes) + benchMode
  census-hold test (invulnerable, no despawn, count held) (§12.2/§12.6/§13).
- [ ] 12.4 ESLint sim-math + browser-API purity rules fire (§12.3/§12.2).
- [ ] 12.5 Anti-camping test (both topologies, median<60 s) + economy-invariant test
  (§13/D30/D44).

## Phase 13 — Acceptance
- [ ] 13.1 §15 criteria pass: every criterion → green test or checked manual/visual
  item; manual browser-integration checklist + visual-identity checklist per browser;
  smoke pass in Chrome/Firefox/Edge/Safari; `?bench=1` within budget on the recorded
  reference machine; final `/codex-review`; results in `loop/acceptance-results.md`.
  **PROJECT DoD:** all §15 criteria met, `npm run check` green, bench in budget,
  smoke pass clean in all four browsers.

---

## §13 test-area → task index (traceability)
lane math →1.4 · level mapping (geometry/palette) →1.4 · geometry validation
→1.5 (structural) + 1.6 (projected width) · projection →1.6 · config/tuning guards
→1.3 (anchors) + 2.3 (interpolated table) + 3.1 (live-config validate at createSim) ·
stepper →2.1 · collision →2.2 ·
tick-order same-tick save →4.1 (rim contact) + 4.5 (pulse) + 4.6 (enemy shot) + 5.2
(warp trim); same-tick kill+death (wave still completes) →5.3 · spike-trim scoring
→4.3 · never-pierces →4.1 (stacked enemies) + 4.6 (enemy shot) · climb multipliers
→4.1 (flipper) + 4.2 (tanker) + 4.3 (spiker) + 4.4 (fuseball) + 4.5 (pulsar), each a
wiring test · SimEvent emission →4.x/12.2 · difficulty/monotonicity →2.3 · spawner →4.7 ·
enemy fire →4.6 · high-score qualification/insertion →3.1 (sim-owned) ·
scoring/economy →3.3/12.5 · Superzapper →5.4 · death/respawn →5.3 · Flipper →4.1 ·
Tanker →4.2 · Spiker →4.3 · Fuseball →4.4 · Pulsar →4.5 · player firing →3.2 ·
anti-camping →12.5 · warp/fairness →5.2 · state machine →3.1/6.2 · UI nav →6.1 ·
persistence →7.1 · storage-throwing adapter →11.1 · input mapping →10.1 ·
hash/replay →12.1/12.2/12.3 · benchMode census-hold →12.3 · lint rules →12.4 ·
maxLevelReached →3.1 (beginLevel) + 5.2 (warp entry) ·
rim interpolation/teleport prev=curr →1.4 (interpRim) + 4.3 (Spiker lane-switch) +
4.7/5.1/5.2 (teleport sets) ·
beginLevel (level init) →3.1 (produced) + 5.2 (reused) ·
manual browser-integration + per-SFX + visual + smoke + bench →13.1.
