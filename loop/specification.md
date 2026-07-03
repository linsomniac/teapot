# Specification — "Teapot": a browser-based game inspired by Tempest

Status: draft for review
Anchor: `loop/description` — "build a browser-based game inspired by the arcade game
Tempest". Decisions and their rationale: `loop/spec-decisions`.

## 1. Overview

Teapot is a single-player, browser-based arcade shooter inspired by Atari's 1981
vector classic *Tempest*. The player controls a claw-shaped ship (the **Blaster**)
that slides around the near rim of a three-dimensional wireframe **well**, firing
shots down the well's lanes at enemies that climb up toward the rim. Clear the wave,
warp down the well to the next level, and survive as long as possible for a high
score.

This is an *inspired-by* game, not a ROM-accurate clone: it reproduces the mechanics,
enemy roster, level structure, and neon vector look that define Tempest, while
freely simplifying arcade-era details that don't serve gameplay (see §14 Non-goals
and `loop/spec-decisions`).

## 2. Goals

1. Playable in a modern desktop browser with no install: load a static page, play.
2. Recognizably Tempest: well-based lane combat, flipping enemies, Superzapper,
   warp descent between levels, neon vector aesthetic.
3. Arcade feel: 60 FPS, tight controls, escalating difficulty, short-session
   "one more game" loop with persistent local high scores.
4. Maintainable: typed code, logic separated from rendering, unit-tested game rules.

## 3. Player experience summary

- **Session shape:** title screen → starting-level select → waves of enemies of
  rising difficulty → death → high-score entry (if earned) → title.
- **Moment-to-moment:** rotate around the rim, pick lanes, fire down them, manage
  the rim (Flippers that reach the top hunt you), spend the Superzapper when
  overwhelmed, then dodge spikes during the warp descent.
- **Difficulty:** starts gentle (Flippers only), introduces one new enemy type at a
  time, and scales continuously; there is no ending — the game is over when lives
  run out.

## 4. The well

- A well (also "web" or "tube") is a 3D surface defined by a **rim polyline** of
  N vertices at depth 0 and an identical polyline scaled toward a vanishing point
  at depth 1. Adjacent vertex pairs define **lanes** (quadrilateral columns).
- Wells are either **closed** (rim is a loop; the player can rotate continuously) or
  **open** (rim has two ends; movement stops at the ends).
- **16 well geometries**, one per level, cycling every 16 levels. The set includes
  closed shapes (e.g. circle, square, plus, star, clover, figure-eight) and open
  shapes (e.g. flat line, V, steps, U). Lane counts are approximately 14–16 per
  well. Exact vertex data is implementation-defined, authored as static data, and
  must satisfy: closed wells have ≥ 12 lanes, open wells have ≥ 12 lanes, no
  self-intersecting rim, lanes wide enough that entities are visually separable.
- **Color cycling:** the well (and general palette) changes color every 16 levels:
  levels 1–16 blue, 17–32 red, 33–48 yellow, 49–64 cyan, 65–80 green, 81+ magenta,
  then the sequence repeats. (Inspired by the original's cycle; the original's
  "invisible" black wells are intentionally omitted — see spec-decisions D9 spirit:
  we favor playability over trivia.)
- Positions on the well are lane-indexed: an entity's position is `(lane, depth)`
  with depth ∈ [0, 1], 0 = rim (player end), 1 = bottom (spawn end). The player is
  effectively at depth 0; movement around the rim is continuous (fractional lane
  position) but shots and enemy occupancy resolve to integer lanes.

## 5. The player (Blaster)

- Lives at the rim, at a continuous rim position; renders as the claw-shaped
  Tempest cursor spanning its current lane.
- **Movement:** rotates around the rim. Keyboard: left/right arrows (and A/D) move
  at a fixed rim speed (lanes/second, tuned; initial value 14 lanes/s with brief
  ramp-up). Mouse: horizontal mouse movement maps to rim movement (pointer-lock
  optional; without pointer lock, mouse X within the canvas maps to rim position on
  open wells and relative movement on closed wells).
- **Firing:** space / left mouse button. Shots travel down the player's current
  lane at fixed speed. Maximum **8 player shots** in flight. Holding fire auto-fires
  at the shot-interval cap.
- **Superzapper:** one charge per level (Z / right mouse button). First use in a
  level destroys **all enemies currently on the well** (not enemy shots, not
  spikes); a second use in the same level destroys **one** enemy (random on-well).
  Recharges fully at the start of each level. Superzapper kills award no points.
- **Death:** the player dies when (a) an enemy shot reaches depth 0 on the player's
  lane, (b) a Flipper on the rim reaches the player's position (grab → dragged down
  the well), (c) contact with a Fuzzball at the rim, (d) a Pulsar pulses while on
  the player's lane with the pulse active at rim depth, or (e) colliding with a
  spike during warp descent.
- **After death:** if lives remain, on-well enemies retreat into the well bottom and
  the wave resumes with the remaining spawn budget (spikes persist, score persists,
  Superzapper is restored only if it was unused). A short "get ready" pause precedes
  resumed play. No invulnerability window is needed because the well is clear at
  resume.
- **Lives:** start with 3. Bonus life every 20,000 points. Life count displayed in
  the HUD.

## 6. Enemies

All enemies spawn at the bottom of the well (depth 1) from a per-level **spawn
budget** and climb toward the rim. Enemy motion is lane-based. Per-level parameters
(speeds, counts, rates) come from the difficulty model (§8).

### 6.1 Flipper (from level 1)
- Climbs its lane; periodically **flips** to an adjacent lane (rotating about the
  shared edge, the signature animation).
- On reaching the rim it stays there and flips lane-to-lane along the rim toward
  the player. Contact at the rim kills the player (grab). A Flipper mid-flip onto
  the player's lane can be shot at point-blank range just before it lands —
  the classic close-call.
- Dies to one shot. Score: 150.

### 6.2 Tanker (from level 3)
- Climbs its spawn lane slowly; never changes lanes.
- When shot, or upon reaching the rim, it splits into **two Flippers** that flip
  away in opposite directions (at the rim, they land on the rim).
- Dies to one shot (splitting). Score: 100 (plus whatever the released Flippers
  are later worth).

### 6.3 Spiker (from level 4)
- Climbs its lane while extending a **spike** (a bright line from the well bottom
  up to the Spiker's current depth). At a per-level maximum height it reverses,
  descends, and re-emerges on another lane to build there.
- The spike persists after the Spiker dies. Player shots hitting a spike shorten
  it (each hit trims a fixed amount; 1 point per trim hit).
- Spikes do not harm the player during normal play — they matter during the warp
  descent (§9). Enemy shots are not blocked by spikes.
- Spiker dies to one shot. Score: 50.

### 6.4 Fuzzball (from level 11)
- A jittering tumbleweed that climbs its lane slowly with erratic speed; does not
  fire. On reaching the rim it crawls along the rim (slower than a rim Flipper).
- Lethal on contact; can only be removed by shooting it. Score: 250.

### 6.5 Pulsar (from level 17)
- Moves like a Flipper (climb + lane flips) but periodically **pulses** on a global
  pulse clock (visible charge-up telegraph ≥ 0.5 s before each pulse).
- While pulsing, the Pulsar's current lane is electrified along its full length:
  if the player is on that lane during the pulse, the player dies.
- Pulsars never occupy the rim: near the top (depth < ~0.15) they reverse and
  descend, continuing to pulse. Dies to one shot. Score: 200.

### 6.6 Enemy shots
- Flippers, Tankers, and Pulsars fire shots that travel up their current lane at
  fixed speed. A shot reaching the rim (depth 0) on the player's lane kills the
  player; on any other lane it disappears.
- Player shots destroy enemy shots on collision (same lane, overlapping depth).
  Score: 25.
- Per-level caps govern fire rate and maximum simultaneous enemy shots.

## 7. Scoring

| Event | Points |
|---|---|
| Flipper destroyed | 150 |
| Tanker destroyed | 100 |
| Spiker destroyed | 50 |
| Fuzzball destroyed | 250 |
| Pulsar destroyed | 200 |
| Enemy shot destroyed | 25 |
| Spike trimmed (per hit) | 1 |
| Superzapper kill | 0 |
| Level-clear bonus | 100 × level number |

Bonus life every 20,000 points. Score, level, lives, and Superzapper state are
always visible in the HUD. These values are this spec's canon (inspired by, not
copied from, the arcade tables) and may be tuned during playtesting; the scoring
table lives in one data module so tuning is a one-file change.

## 8. Levels and difficulty

- **Level definition:** level N uses well geometry `((N−1) mod 16)` and the color
  band for its 16-level block. Difficulty parameters are computed from N by a
  deterministic function (data-driven curve tables with interpolation, not code
  branches), covering at minimum:
  - total spawn budget by enemy type (respecting the introduction levels:
    Flippers 1+, Tankers 3+, Spikers 4+, Fuzzballs 11+, Pulsars 17+),
  - max simultaneous enemies on the well,
  - enemy climb speeds, flip rates, rim-flip speed,
  - enemy fire rate and max simultaneous enemy shots,
  - Spiker max spike height, Pulsar pulse cadence.
- **Wave completion:** the level ends when the spawn budget is exhausted and no
  enemies remain on the well (enemy shots in flight are cancelled; spikes remain).
- **Endless:** parameters continue scaling past level 96 via the curve's tail
  (monotonic, asymptotic caps so the game remains technically playable).
- **Starting level:** a fresh profile may start at any level 1–9; afterwards, at
  any level up to the highest level the player has ever reached (stored locally).
  Starting level choice is a rim-style selector on the level-select screen.

## 9. Warp descent (between levels)

- After wave completion the Blaster flies down the well to the vanishing point
  (~2.5 s), passing any remaining spikes.
- During descent the player can still rotate between lanes and fire; shots trim
  spikes. Colliding with a spike kills the player: a life is lost, but the level
  still counts as complete — if lives remain, the next level begins normally
  (the descent is not replayed).
- "AVOID SPIKES" flashes at descent start if any spikes remain.
- On reaching the bottom, the next level fades in (new well geometry, brief level
  banner, Superzapper recharge).

## 10. Screens and game states

State machine: `TITLE → LEVEL_SELECT → PLAYING ⇄ PAUSED; PLAYING → WARP → PLAYING;
PLAYING → GAME_OVER → (HIGH_SCORE_ENTRY) → TITLE`.

- **Title:** game name, "press any key / click to start", top-10 high-score table,
  control summary, mute indicator. No AI demo game.
- **Level select:** choose starting level (§8) with left/right + fire to confirm.
- **Playing:** the game. HUD: score (top left), high score (top center), lives and
  Superzapper icons, level number.
- **Paused:** P or Escape toggles; overlay dims the game; any state-mutating input
  is suspended. Losing window focus auto-pauses.
- **Game over:** "GAME OVER" over the final well; after a beat, transitions to
  high-score entry if the score makes the top 10, else title.
- **High-score entry:** 3-initial arcade entry (rotate letter with left/right or
  mouse, confirm with fire). Stored locally.

## 11. Presentation

### 11.1 Rendering
- HTML5 Canvas 2D, single full-viewport canvas, letterboxed 4:3 playfield,
  `devicePixelRatio`-aware backing store.
- Pure line rendering: strokes on black. Neon glow via layered strokes (wide
  low-alpha pass under a thin bright core) — **not** `shadowBlur` (too slow).
- 3D→2D: perspective projection of `(lane, depth)` positions; the well's vanishing
  point sits slightly off-center per level (data-authored) for the classic look.
- Explosions: short line-burst particle effects; player death gets a distinct,
  bigger burst. Text in a stroked vector-style font (canvas-drawn or a bundled
  monospace with letter-spacing; implementation's choice, but it must read as
  arcade, not web page).
- Target 60 FPS on a mid-range 2020+ laptop. Entity counts are small (≤ ~64 line
  entities); no dynamic allocation in the render loop.

### 11.2 Audio
- Web Audio API, all sounds synthesized (oscillator/noise + envelopes). No assets,
  no music. Distinct SFX: player shot, enemy shot, enemy death, player death,
  Flipper flip, Superzapper, warp descent, spike hit, Pulsar pulse warning,
  high-score jingle, UI move/confirm.
- Audio context is created/resumed on first user gesture (browser autoplay policy).
- Mute toggle (M) available everywhere, state persisted.

## 12. Technical design

### 12.1 Stack and repository layout
- TypeScript (strict), Vite build, Vitest unit tests, ESLint + Prettier or
  equivalent formatting. **Zero runtime dependencies.**
- Repo root is the game project (`index.html`, `src/`, `package.json`); planning
  docs stay in `loop/`. `npm run build` emits a fully static `dist/` (relative
  asset paths) deployable to any static host; `npm run dev` serves locally.

### 12.2 Architecture
Logic and presentation are separated so game rules are unit-testable without a DOM:

- `sim/` — pure game logic, no browser APIs: well geometry & lane math, entity
  state and updates, spawner/difficulty curves, collision (lane + depth overlap),
  scoring, level/wave progression, RNG (seedable PRNG, e.g. mulberry32 — every
  gameplay random draw goes through it), the state machine.
- `render/` — canvas renderer: projection, well/entity/particle drawing, HUD,
  screen layouts. Reads sim state; never mutates it.
- `audio/` — synthesized SFX triggered by sim events (sim emits an event list per
  tick; audio and particles consume events, keeping sim pure).
- `input/` — keyboard/mouse capture normalized to logical game inputs.
- `app/` — bootstrapping, game loop, persistence, pause/focus handling.

### 12.3 Game loop
- Fixed-timestep simulation at 60 Hz with an accumulator driven by
  `requestAnimationFrame`; render once per rAF. Accumulated time is clamped
  (e.g. max 250 ms) to avoid spiral-of-death after tab suspension; on visibility
  loss the game auto-pauses.
- All sim speeds are per-tick constants derived from per-second tuning values.

### 12.4 Persistence (localStorage)
- Single namespaced key (e.g. `teapot.v1`) holding JSON:
  `{ highScores: [{initials, score, level}×≤10], settings: {muted}, maxLevelReached }`.
- Corrupt/missing data falls back to defaults; storage failures (private mode)
  degrade gracefully (game runs, nothing persists, no errors surface to player).

### 12.5 Browser support
Latest two stable versions of Chrome, Firefox, Edge, and Safari on desktop.
No polyfills; ES2020+ output. The game must not throw on smaller windows —
the playfield letterboxes down and remains playable at ≥ 1024×768 CSS pixels.

## 13. Testing and quality

- **Unit tests (Vitest)** for `sim/`: lane math on open/closed wells (wrapping,
  clamping, adjacency), projection math invariants, collision resolution, spawner
  budgets per level, difficulty curve monotonicity, scoring (including bonus-life
  thresholds), Superzapper semantics, state-machine transitions, Flipper rim
  behavior, warp/spike collision, persistence round-trip with corrupt-data cases.
- **Determinism:** with a fixed RNG seed and scripted inputs, a sim run is fully
  reproducible; at least one test replays a scripted sequence and asserts final
  state (guards refactors).
- **Static checks:** `tsc --noEmit` (strict) and lint pass clean in CI-style
  scripts: `npm test`, `npm run typecheck`, `npm run lint`.
- **Manual test checklist** maintained in the implementation guide (feel/audio/
  visual items that automation can't judge).

## 14. Non-goals (v1)

Explicitly out of scope; listed so reviews don't re-litigate them
(see `loop/spec-decisions`):

1. ROM-accurate cloning (exact arcade scoring tables, timings, "invisible" black
   levels, cabinet behaviors).
2. Two-player alternating mode; any multiplayer.
3. Mobile/touch support and responsive-to-phone layouts (future enhancement).
4. Gamepad support (future enhancement).
5. Attract-mode AI demo gameplay.
6. Tanker cargo variants (Fuzzball-/Pulsar-tankers) — v1 Tankers carry Flippers.
7. Online leaderboards, accounts, telemetry, or any network I/O.
8. Configurable key bindings (fixed map in v1).
9. Music.

## 15. Acceptance criteria

The project is done when all of the following hold:

1. `npm run build` produces a static bundle that plays in the supported browsers;
   `npm run dev` works for development. No runtime dependencies.
2. All 16 well geometries appear across levels 1–16 with correct open/closed
   movement behavior, and colors change at each 16-level boundary.
3. All five enemy types exhibit the behaviors in §6, appearing at their
   introduction levels; Tankers split; Spikers leave persistent, trimmable spikes;
   Pulsars telegraph and electrify lanes; Flippers hunt along the rim.
4. Superzapper, warp descent with spike collisions, death/respawn, lives, bonus
   lives, scoring, and level-clear bonuses behave as specified.
5. Starting-level selection reflects stored progress; high scores and mute state
   survive reload; corrupt storage doesn't crash the game.
6. HUD, title, level select, pause (incl. auto-pause on focus loss), game over,
   and high-score entry all function as specified.
7. Sustained 60 FPS on a mid-range 2020+ laptop during heavy waves.
8. `npm test`, `npm run typecheck`, and `npm run lint` pass; the deterministic
   replay test exists and passes.
9. The game is recognizably Tempest-inspired to someone who knows the original —
   neon vector well, flipping enemies, Superzapper, warp descent.
