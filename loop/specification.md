# Specification — "Teapot": a browser-based game inspired by Tempest

Status: revised draft, review round 2
Anchor: `loop/description` — "build a browser-based game inspired by the arcade game
Tempest". Decisions and rationale: `loop/spec-decisions`. Rejected review concerns:
`loop/spec-rejected-concerns.md`.

## 1. Overview

Teapot is a single-player, browser-based arcade shooter inspired by Atari's 1981
vector classic *Tempest*. The player controls a claw-shaped ship (the **Blaster**)
that slides around the near rim of a three-dimensional wireframe **well**, firing
shots down the well's lanes at enemies that climb up toward the rim. Clear the wave,
warp down the well to the next level, and survive as long as possible for a high
score.

This is an *inspired-by* game, not a ROM-accurate clone: it reproduces the
mechanics, enemy roster, level structure, and neon vector look that define Tempest,
while freely simplifying arcade-era details that don't serve gameplay (see §14
Non-goals and `loop/spec-decisions`).

## 2. Goals

1. Playable in a modern desktop browser with no install: load a static page, play.
2. Recognizably Tempest: well-based lane combat, flipping enemies, Superzapper,
   warp descent between levels, neon vector aesthetic.
3. Arcade feel: smooth 60 Hz gameplay, tight controls, escalating difficulty, and a
   short-session "one more game" loop with persistent local high scores.
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
  vertices at depth 0 and an identical polyline scaled toward a vanishing point at
  depth 1. Adjacent vertex pairs define **lanes** (quadrilateral columns).
- **Every well has exactly 16 lanes.** Wells are either **closed** (16 rim vertices
  in a loop; the player can rotate continuously) or **open** (17 rim vertices; the
  rim has two ends and movement stops at the end lanes).
- **16 well geometries**, one per level, cycling every 16 levels: geometry index =
  `(N−1) mod 16` for level N. The set includes closed shapes (e.g. circle, square,
  plus, hourglass/bowtie, star, clover) and open shapes (e.g. flat line, V, steps,
  U, W). Exact vertex data is authored as static data in one module and must
  satisfy: exactly 16 lanes; a non-self-intersecting rim; lanes wide enough on
  screen that entities are visually separable. (The hourglass narrows at the waist
  but does not cross itself.)
- **Color bands:** the palette index for level N is `floor((N−1) / 16) mod 6` into
  `[blue, red, yellow, cyan, green, magenta]`: levels 1–16 blue, 17–32 red, 33–48
  yellow, 49–64 cyan, 65–80 green, 81–96 magenta, 97–112 blue again, and so on
  forever. (The original's "invisible" black wells are deliberately omitted in
  favor of playability — an inspired-by liberty, per §1.)
- **Coordinates:** an entity's position is `(lane, depth)` with depth ∈ [0, 1],
  0 = rim (player end), 1 = well bottom (spawn end).
- **Player-lane rule (canonical):** the player's rim position is continuous
  (fractional), but the player always occupies **exactly one lane**:
  `playerLane = round(rimPos) mod 16` on closed wells, `clamp(round(rimPos), 0, 15)`
  on open wells. Firing, enemy-shot lethality, rim-Flipper contact, Fuseball
  contact, and Pulsar lane kills all use this single rule.

## 5. The player (Blaster)

- Lives at the rim at a continuous rim position; renders as the claw-shaped
  Tempest cursor spanning its current lane (per the player-lane rule, §4).
- **Movement (keyboard, primary):** left/right arrows (and A/D) move the player
  along the rim at `rimSpeed` (see §8.3 tuning constants). Open wells clamp at the
  end lanes.
- **Movement (mouse, optional):** mouse control uses the **Pointer Lock API
  exclusively**. Clicking the canvas during PLAYING requests pointer lock;
  horizontal movement deltas map to rim movement via `mouseSensitivity` (§8.3).
  Losing pointer lock for any reason (Escape, focus loss, rejection) auto-pauses
  the game via the `pointerlockchange`/`pointerlockerror` events — never by
  assuming the Escape keydown is delivered. Unpausing requires a click, which
  re-requests the lock (this also satisfies Chromium's ~1.25 s re-lock cooldown
  and user-gesture requirement; if the request rejects, the game stays paused and
  shows a hint). Keyboard control is always available regardless of lock state.
- **Firing:** space / left mouse button. Shots travel down the player's current
  lane at `shotSpeed`. Maximum **8 player shots** in flight; firing is capped at
  one shot per `fireInterval`. Holding fire auto-fires at that cap.
- **Superzapper:** the player has **two uses per level**, forming a state machine
  `FULL(2) → PARTIAL(1) → EMPTY(0)` shown as HUD pips:
  - Use 1 (from FULL): destroys **all enemies currently on the well**. Tankers are
    destroyed outright — they do **not** split. Enemy shots and spikes are
    unaffected.
  - Use 2 (from PARTIAL): destroys **one** random on-well enemy (Tankers again
    destroyed without splitting).
  - Further presses (EMPTY): no effect.
  - Superzapper kills award no points. State resets to FULL at the start of every
    level. Uses consumed are **not** restored by death — the state persists as-is
    through death within a level.
  - Bound to Z / right mouse button (right-click's context menu is suppressed on
    the canvas).
- **Death conditions:** the player dies when
  (a) an enemy shot crosses depth 0 on the player's lane;
  (b) a rim Flipper completes a flip onto the player's lane (grab → dragged down);
  (c) a Fuseball reaches the player's lane at the rim;
  (d) a Pulsar's pulse fires while the Pulsar is on the player's lane (§6.5);
  (e) the Blaster collides with a spike during warp descent (§9).
- **After death (lives remaining):** all on-well enemies retreat into the well
  bottom and are **returned to the wave's remaining spawn budget by type** — they
  re-emerge when play resumes, so a wave always requires destroying its full
  complement. The wave-completion check (§8) is suspended from the moment of death
  until play resumes. In-flight enemy shots and player shots are cleared. Spikes,
  score, and Superzapper state persist. A short "get ready" pause (~1.5 s)
  precedes resumed play; no invulnerability window is needed because the well is
  clear of enemies at resume.
- **Lives:** start with 3. Bonus life every 20,000 points. Lives shown in the HUD.

## 6. Enemies

All enemies spawn at the well bottom (depth 1) from a per-level, per-type **spawn
budget** and climb toward the rim. Enemy motion is lane-based. Numeric parameters
come from the difficulty model (§8). Two global combat rules:

- **Minimum firing depth:** enemies fire only while at depth ≥ 0.2. Rim-resident
  enemies never fire. (Prevents zero-reaction-time kills from shots spawned at the
  rim.)
- **Flip occupancy rule:** a flipping enemy occupies its source lane for the first
  half of the flip animation and its destination lane for the second half (it can
  be shot in either during the corresponding half). A rim flip becomes lethal
  contact only when the flip **completes** onto the player's lane — which is what
  makes the classic point-blank save possible (§6.1).

### 6.1 Flipper (from level 1)
- Climbs its lane; every `flipInterval` seconds it **flips** to an adjacent lane,
  rotating about the shared edge (the signature animation, duration
  `flipAnimTime`). In the end lane of an open well, it always flips inward.
- On reaching the rim it stays there and flips lane-to-lane along the rim toward
  the player, choosing the **shortest arc** re-evaluated before each rim flip
  (ties broken clockwise). Open-well ends simply bound the chase. A completed
  rim flip onto the player's lane kills the player (grab); the player can shoot a
  Flipper mid-flip before it lands — the classic close call.
- Dies to one shot. Score: 150.

### 6.2 Tanker (from level 3)
- Climbs its spawn lane slowly; never changes lanes; fires per §6.6.
- When shot, or upon reaching the rim, it splits into **two Flippers** flipping
  away in opposite directions (at the rim: both land on the rim and begin rim
  behavior). In an end lane of an open well, both released Flippers flip in the
  single available direction, staggered by half a flip. Superzapper destruction
  does not split (§5).
- Dies to one shot (splitting). Score: 100 (released Flippers score separately).

### 6.3 Spiker (from level 4)
- Climbs its lane while extending a **spike** from the well bottom up to its
  current depth. At the per-level `spikeMaxHeight` it reverses, descends, and
  re-emerges up a uniformly random different lane, extending that lane's spike.
  Does not fire. Spikes never harm the player during normal play — they matter
  during warp descent (§9).
- **Spike/shot interaction:** a player shot that reaches a spike's top while the
  Spiker is at or above that point kills the Spiker (the Spiker has hit priority);
  otherwise the shot trims the spike by `spikeTrim` and is consumed (one trim per
  shot). Consequently, enemies below a lane's spike top are shielded from player
  shots until the spike is trimmed down or they climb above it. Enemy shots pass
  through spikes freely. Spikes persist after their Spiker dies, across player
  deaths, and into the warp descent.
- Spiker dies to one shot. Score: 50. Spike trim: 1 point per hit (bounded in
  practice by fire rate; ~10 points/s maximum, negligible against play scoring).

### 6.4 Fuseball (from level 11)
- A jittering ball of line-sparks that climbs its lane with erratic, varying speed
  (random walk between 0.3× and 1.5× its base speed); does not fire; never
  changes lanes while climbing. (The original's lane-edge riding is simplified to
  lane-based movement — see spec-decisions D15.)
- On reaching the rim it crawls along the rim at `fuseballRimSpeed` toward the
  player via the shortest arc at the moment of arrival; the direction is fixed
  until an open-well end forces reversal (on closed wells it keeps circling in
  its chosen direction, re-evaluating shortest-arc each full lap).
- Lethal on contact at the rim (player's lane). Destroyed only by player shots or
  the Superzapper. Score: 250.

### 6.5 Pulsar (from level 17)
- Moves like a Flipper (climb + lane flips) but never occupies the rim: at depth
  0.15 it reverses and descends; at the bottom (depth 1) it reverses again and
  climbs — oscillating for the rest of the wave. It never despawns: the wave
  cannot complete until every Pulsar is destroyed.
- Pulses on a global pulse clock with period `pulseCycle`: a visible charge-up
  telegraph for the final 0.5 s of each cycle, then a pulse lasting
  `pulseDuration` during which the Pulsar's current lane is electrified along its
  full length. If the pulse fires (i.e. the telegraph completes) while the player
  is on that lane, the player dies. Fires shots per §6.6 (subject to the minimum
  firing depth).
- Dies to one shot. Score: 200.

### 6.6 Enemy shots
- Flippers, Tankers, and Pulsars fire shots (subject to the minimum firing depth,
  §6) that travel up their lane at `enemyShotSpeed`. A shot crossing depth 0 on
  the player's lane kills the player; on any other lane it disappears at the rim.
- Player shots destroy enemy shots on collision (same lane, overlapping depth).
  Score: 0 points (deliberate: any positive value makes farming the last enemy's
  shots a dominant high-score strategy — see spec-decisions D14).
- Per-level parameters cap enemy fire rate and maximum simultaneous enemy shots.

## 7. Scoring

| Event | Points |
|---|---|
| Flipper destroyed | 150 |
| Tanker destroyed | 100 |
| Spiker destroyed | 50 |
| Fuseball destroyed | 250 |
| Pulsar destroyed | 200 |
| Enemy shot destroyed | 0 |
| Spike trimmed (per hit) | 1 |
| Superzapper kill | 0 |
| Level-clear bonus (at wave completion) | 100 × level number |

Bonus life every 20,000 points. Score, high score, level, lives, and Superzapper
pips are always visible in the HUD. These values are this spec's canon (inspired
by, not copied from, the arcade tables); they live in one data module so tuning is
a one-file change.

## 8. Levels and difficulty

### 8.1 Level definition
Level N uses well geometry `(N−1) mod 16` and the color band of §4. Difficulty
parameters are produced by one deterministic function of N: **linear interpolation
between the anchor rows below**, with integer columns rounded to nearest, values
held flat beyond the last anchor (the endless tail), and per-type budgets forced
to 0 before that enemy's introduction level (Flippers 1+, Tankers 3+, Spikers 4+,
Fuseballs 11+, Pulsars 17+).

### 8.2 Difficulty anchor table (initial tuning — values may be adjusted during playtesting, structure may not)

| Level | Flip | Tank | Spik | Fuse | Puls | MaxOnWell | Climb (depth/s) | FlipInt (s) | FireInt (s) | MaxShots | SpikeH | Pulse (s) | SpawnInt (s) |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | 8 | 0 | 0 | 0 | 0 | 4 | 0.10 | 2.0 | 3.0 | 2 | — | — | 1.2 |
| 4 | 10 | 2 | 2 | 0 | 0 | 5 | 0.12 | 1.6 | 2.4 | 3 | 0.40 | — | 1.1 |
| 8 | 12 | 3 | 3 | 0 | 0 | 6 | 0.14 | 1.3 | 2.0 | 4 | 0.45 | — | 1.0 |
| 11 | 12 | 3 | 3 | 2 | 0 | 6 | 0.15 | 1.2 | 1.9 | 4 | 0.50 | — | 0.9 |
| 17 | 14 | 4 | 4 | 3 | 2 | 7 | 0.17 | 1.1 | 1.7 | 5 | 0.50 | 3.0 | 0.8 |
| 24 | 16 | 5 | 5 | 4 | 3 | 8 | 0.19 | 1.0 | 1.5 | 5 | 0.55 | 2.7 | 0.7 |
| 32 | 18 | 6 | 5 | 4 | 4 | 9 | 0.21 | 0.9 | 1.3 | 6 | 0.60 | 2.4 | 0.6 |
| 48 | 20 | 7 | 6 | 5 | 5 | 10 | 0.24 | 0.8 | 1.1 | 6 | 0.60 | 2.2 | 0.5 |
| 64 | 22 | 8 | 6 | 6 | 6 | 11 | 0.26 | 0.7 | 1.0 | 7 | 0.65 | 2.0 | 0.45 |
| 96 | 24 | 8 | 7 | 6 | 7 | 12 | 0.30 | 0.6 | 0.9 | 8 | 0.65 | 1.8 | 0.40 |

Column notes: Flip/Tank/Spik/Fuse/Puls = per-type spawn budgets. Climb = base
climb speed (per-type multipliers in §8.3). FlipInt = seconds between Flipper/
Pulsar lane flips (rim flips use the same interval). FireInt = mean seconds
between shots per eligible enemy. MaxShots = max simultaneous enemy shots.
SpikeH = max spike height as a depth fraction. Pulse = pulseCycle. SpawnInt =
interval between spawn attempts (a spawn occurs if on-well count < MaxOnWell and
budget remains).

### 8.3 Tuning constants (initial values; one data module)

| Constant | Value |
|---|---|
| rimSpeed (keyboard) | 14 lanes/s |
| mouseSensitivity (pointer-locked) | 50 px per lane (player-invisible; not a settings item) |
| shotSpeed (player) | 1.5 depth/s |
| fireInterval (player) | 0.1 s |
| max player shots | 8 |
| enemyShotSpeed | 0.5 depth/s |
| flipAnimTime | 0.25 s |
| climb multipliers (× Climb) | Flipper 1.0, Tanker 0.6, Spiker 0.8, Fuseball 0.5, Pulsar 0.9 |
| fuseballRimSpeed | 2 lanes/s |
| pulseDuration | 0.4 s |
| Pulsar reversal depth | 0.15 |
| minimum enemy firing depth | 0.2 |
| spikeTrim (per shot) | 0.05 depth |
| descent speed (warp) | 0.4 depth/s (~2.5 s) |
| starting lives | 3 |
| bonus life interval | 20,000 points |
| get-ready pause | 1.5 s |

### 8.4 Wave completion
The level ends when the spawn budget is exhausted **and** no enemies remain on the
well. Enemy shots in flight are cancelled; spikes remain. The level-clear bonus is
awarded at this moment (before the warp). The completion check never fires during
the death/respawn sequence (§5).

### 8.5 Starting level
The player may start at any level from 1 to `max(9, maxLevelReached)`.
`maxLevelReached` is recorded when a level **begins play** (PLAYING entered at
level N sets `maxLevelReached = max(old, N)`); it is stored locally (§12.4).
Chosen via a selector on the level-select screen (left/right + fire to confirm).

## 9. Warp descent (between levels)

- After wave completion the Blaster flies down the well at the descent speed
  (§8.3), passing any remaining spikes. "AVOID SPIKES" flashes at descent start if
  spikes remain.
- During descent the player can still move between lanes and fire; shots trim
  spikes per §6.3. Colliding with a spike kills the player: a life is lost, but
  the level still counts as complete (its bonus was already awarded) — if lives
  remain, the next level begins normally (the descent is **not** replayed; a
  deliberate inspired-by deviation, spec-decisions D16). If it was the last life,
  the game ends (WARP → GAME_OVER).
- **Descent fairness invariant:** with the §8.3 constants, holding fire down one
  lane from descent start must fully trim a maximum-height spike before the
  Blaster reaches it. (At `spikeTrim` 0.05 and player fire at 10 shots/s, the
  spike top recedes at ~0.5 depth/s versus the Blaster's 0.4 depth/s — the
  Blaster can never catch a spike it is firing at.) A unit test asserts this
  invariant against the actual constants (§13); any retuning must preserve it.
- On reaching the bottom, the next level fades in (new well geometry, level
  banner, Superzapper reset to FULL).

## 10. Screens and game states

State machine:

```
TITLE → LEVEL_SELECT → PLAYING
PLAYING ⇄ PAUSED          WARP ⇄ PAUSED
PLAYING → WARP → PLAYING
PLAYING → GAME_OVER       WARP → GAME_OVER
GAME_OVER → HIGH_SCORE_ENTRY → TITLE
GAME_OVER → TITLE
```

- **Title:** game name, "press fire or click to start" (reserved keys — M, P,
  Escape, F3 — keep their global functions and do not start the game), top-10
  high-score table, control summary, mute indicator. No AI demo game.
- **Level select:** starting-level selector (§8.5).
- **Playing:** the game. HUD: score (top left), high score (top center), lives
  and Superzapper pips, level number.
- **Paused:** reachable from PLAYING and WARP via P or Escape, or **auto-pause**
  on any of: document visibility loss, window blur, or pointer-lock exit (§5).
  Overlay dims the game; simulation is fully suspended. Resume: press P, or click
  (which also re-requests pointer lock if mouse control was in use).
- **Game over:** "GAME OVER" over the final well; after a beat, transitions to
  high-score entry if the score makes the top 10, else title. The final score
  counts wherever death occurred, including during WARP.
- **High-score entry:** 3-initial arcade entry (rotate letters with left/right or
  mouse movement, confirm with fire). Stored locally.

## 11. Presentation

### 11.1 Rendering
- HTML5 Canvas 2D, single full-viewport canvas, letterboxed 4:3 playfield,
  `devicePixelRatio`-aware backing store **capped at DPR 2** (backing store never
  exceeds 2× CSS pixels).
- Pure line rendering: strokes on black. Neon glow via layered strokes (a wide
  low-alpha pass under a thin bright core) — **not** `shadowBlur` (too slow).
- 3D→2D: perspective projection of `(lane, depth)` positions; the vanishing point
  sits slightly off-center per level (data-authored) for the classic look.
  Projection is pure math and lives in `sim/` (§12.2).
- Explosions: short line-burst particle effects; player death gets a bigger,
  distinct burst. Particle randomness uses a render-side RNG stream, separate
  from the sim RNG (§12.3), so visuals never affect sim determinism.
- Text in a stroked vector style (canvas-drawn strokes or a bundled font that
  reads as arcade, not web page).
- Rendering interpolates entity positions between the previous and current sim
  ticks (§12.3); allocation in hot render paths is avoided by reusing buffers
  (the per-tick sim event list is fine).

### 11.2 Audio
- Web Audio API, all sounds synthesized (oscillators/noise + envelopes). No
  assets, no music. Distinct SFX for: player shot, enemy shot, enemy death,
  player death, Flipper flip, Superzapper, warp descent, spike hit, Pulsar pulse
  telegraph, bonus life, high-score jingle, UI move/confirm.
- The AudioContext is created/resumed on first user gesture (autoplay policy).
- Mute toggle (M) available everywhere, state persisted.

## 12. Technical design

### 12.1 Stack and repository layout
- TypeScript (strict), Vite build, Vitest unit tests, formatting + linting via a
  standard setup (e.g. eslint + prettier). **Zero runtime dependencies.**
- Repo root is the game project (`index.html`, `src/`, `package.json`); planning
  docs stay in `loop/`. `npm run build` emits a fully static `dist/` (relative
  asset paths) deployable to any static host; `npm run dev` serves locally.

### 12.2 Architecture
Pure logic is separated from I/O so game rules are unit-testable without a DOM:

- `sim/` — pure, browser-API-free: well geometry, lane math, and **projection
  math**; entity state and updates; spawner and difficulty curves; collision
  (lane + depth overlap); scoring; level/wave progression; the state machine;
  the seeded sim RNG (e.g. mulberry32 — every gameplay random draw goes through
  it). The sim emits a per-tick event list (kills, shots, pulses, state changes)
  consumed by audio/particles, keeping the sim pure.
- `persist/` — pure encode/decode/validate for the saved-data schema (§12.4).
  No browser APIs; `app/` owns the actual localStorage I/O.
- `render/` — canvas renderer: draws well/entities/particles/HUD/screens from
  sim state (plus previous-tick positions for interpolation). Never mutates sim
  state. Uses `sim/`'s projection functions.
- `audio/` — synthesized SFX triggered by sim events.
- `input/` — keyboard/mouse/pointer-lock capture, normalized into the per-tick
  input snapshot the sim consumes.
- `app/` — bootstrapping, the game loop, localStorage adapter, pause/focus/
  pointer-lock-loss handling, bench mode (§12.6).

### 12.3 Game loop and determinism
- Fixed-timestep simulation at 60 Hz with an accumulator driven by
  `requestAnimationFrame`; accumulated time is clamped (max 250 ms) to avoid
  spiral-of-death; auto-pause per §10 stops the accumulator entirely.
- The renderer runs every rAF and **interpolates** between each entity's previous
  and current tick positions by the accumulator fraction, so motion is smooth on
  60/90/120/144 Hz displays alike. Entities expose prev/curr positions to
  support this.
- **Determinism contract:** the sim advances only via `tick(inputSnapshot)` where
  the snapshot carries movement delta (fractional lanes), fire/zap button states,
  and nothing else; the sim never reads wall-clock time, `Math.random`, or any
  browser API. Given the same seed and the same snapshot sequence, a run is
  bit-identical **on the same JS engine/build** (cross-browser floating-point
  identity is not claimed).

### 12.4 Persistence (localStorage)
- Single key `teapot.v1` holding JSON:
  `{ highScores: [{initials, score, level}] (≤10), settings: {muted}, maxLevelReached }`.
- `persist/` validates on load: corrupt or missing data falls back to defaults
  (unknown fields ignored); storage failures (private mode, quota) degrade
  gracefully — the game runs, nothing persists, no errors surface to the player.

### 12.5 Browser support
Latest two stable versions of Chrome, Firefox, Edge, and Safari on desktop.
No polyfills; ES2020+ output. The playfield letterboxes and remains fully
playable at window sizes ≥ 1024×768 CSS pixels; smaller windows must not crash.

### 12.6 Debug and benchmark mode
- `?bench=1` query parameter: loads a deterministic worst-case scenario (level-32
  parameters pinned to their §8.2 caps: max on-well enemies, max enemy shots,
  8 player shots, continuous particle bursts), runs it seeded and scripted for
  60 s, and reports mean and p95 frame times on screen and to the console as
  JSON. This is the measurement instrument for acceptance criterion 15.7.
- F3 toggles a frame-time overlay during normal play.

## 13. Testing and quality

- **Unit tests (Vitest)** over the pure modules (`sim/`, `persist/`), covering at
  minimum:
  - Lane math on open/closed wells: wrapping, clamping, adjacency, the
    player-lane rule (§4) at boundaries.
  - Projection math invariants (depth-0 maps to rim polyline; deeper is closer
    to the vanishing point; all 16 geometries).
  - Collision: shot/enemy, shot/enemy-shot, shot/spike trim-vs-kill priority
    (§6.3), rim contact, warp spike collision.
  - Spawner: per-type budgets honored per level; introduction-level gating;
    MaxOnWell and SpawnInt behavior; difficulty interpolation between anchors;
    monotonic non-decreasing difficulty; tail behavior at levels 200/500 (flat
    at caps, still playable parameters).
  - Scoring: per-event values, level-clear bonus at wave completion, bonus-life
    thresholds (including multiple thresholds in one wave).
  - Superzapper: FULL/PARTIAL/EMPTY transitions, no-split Tanker kills, no-op at
    EMPTY, persistence through death, reset at level start.
  - Death/respawn: on-well enemies return to budget by type; wave-completion
    check suspended during the death sequence; a death with exhausted budget
    does **not** complete the wave; shots cleared; spikes/score persist.
  - Per-enemy behavior: Flipper flip cadence, end-lane inward flips, rim
    shortest-arc chase with clockwise tie-break, flip-occupancy halves; Tanker
    split directions incl. end-lane and rim cases; Spiker build/reverse/
    re-emerge and trim accounting; Fuseball speed-jitter bounds and rim-crawl
    direction rules; Pulsar oscillation (never rim, never despawn), pulse
    telegraph/lethality window, min-firing-depth enforcement for all shooters.
  - Player firing: 8-shot cap, fireInterval cap, auto-fire.
  - Warp: descent fairness invariant (§9) against the live constants; spike
    death during warp decrements a life, keeps the level, does not replay the
    descent; WARP → GAME_OVER on last life.
  - State machine: every transition in §10 (including WARP ⇄ PAUSED and
    WARP → GAME_OVER) and no others.
  - Persistence: round-trip, corrupt JSON, wrong-shape data, unknown fields,
    storage-throwing adapter.
- **Determinism/replay test:** with a fixed seed and a scripted input-snapshot
  sequence, a multi-level sim run reproduces an exact expected final state
  (score, level, entity census). Guards refactors.
- **Static checks:** `tsc --noEmit` (strict) and lint pass clean; scripts:
  `npm test`, `npm run typecheck`, `npm run lint`.
- **Manual test checklist** maintained in the implementation guide for
  feel/audio/visual items automation can't judge.

## 14. Non-goals (v1)

Explicitly out of scope; reviews should not flag these (see `loop/spec-decisions`
and `loop/spec-rejected-concerns.md`):

1. ROM-accurate cloning (exact arcade scoring tables, timings, "invisible" black
   levels, cabinet behaviors, descent-death retry semantics).
2. Two-player alternating mode; any multiplayer.
3. Mobile/touch support and responsive-to-phone layouts (future enhancement).
4. Gamepad support (future enhancement).
5. Attract-mode AI demo gameplay.
6. Tanker cargo variants (Fuseball-/Pulsar-tankers) — v1 Tankers carry Flippers.
7. Lane-edge-riding Fuseball movement (v1 Fuseballs are lane-based; D15).
8. Online leaderboards, accounts, telemetry, or any network I/O.
9. Configurable key bindings and sensitivity settings (fixed in v1).
10. Music.

## 15. Acceptance criteria

The project is done when all of the following hold:

1. `npm run build` produces a static bundle that plays in the supported browsers
   (§12.5); `npm run dev` works for development; zero runtime dependencies.
2. All 16 well geometries appear across levels 1–16 with correct open/closed
   movement behavior, every well has exactly 16 lanes, and the §4 color-band
   formula holds across at least levels 1–112 (spot-checked at each boundary).
3. All five enemy types exhibit the behaviors in §6 (including the global
   minimum-firing-depth and flip-occupancy rules), appearing at their
   introduction levels; Tankers split per §6.2; Spikers leave persistent,
   trimmable spikes with kill-vs-trim priority per §6.3; Fuseballs crawl the rim
   per §6.4; Pulsars telegraph, electrify, oscillate, and never despawn per §6.5.
4. Superzapper (two-use state machine incl. death persistence and no-split
   kills), warp descent with spike collisions and the fairness invariant,
   death/respawn budget-return semantics, lives, bonus lives, scoring table, and
   level-clear bonuses behave exactly as specified in §5–§9.
5. Player controls behave per §5: keyboard movement at rimSpeed with open-well
   clamping, pointer-lock mouse control with auto-pause on lock loss and
   click-to-resume, 8-shot cap, and hold-to-auto-fire.
6. Starting-level selection offers 1..max(9, maxLevelReached); high scores and
   mute state survive reload; corrupt or unavailable storage neither crashes the
   game nor surfaces errors to the player.
7. **Performance:** on a 2020-class x86 laptop with integrated graphics (no
   discrete GPU), in the latest Chrome and Firefox, the `?bench=1` scenario
   (§12.6) reports mean frame time ≤ 16.7 ms and p95 ≤ 20 ms over its 60 s run.
8. HUD, title (reserved-key rule), level select, pause (manual from PLAYING and
   WARP; auto-pause on visibility loss, blur, and pointer-lock exit), game over
   (including from WARP), and high-score entry all function per §10.
9. Every SFX listed in §11.2 is audibly distinct and fires on its event; M mutes
   and unmutes everywhere and persists.
10. `npm test`, `npm run typecheck`, and `npm run lint` pass; the §13 test areas
    all have tests; the deterministic replay test exists and passes.
11. **Visual identity checklist** (each item verifiable from a screenshot or
    short capture): (a) the well is glowing wireframe line art on black;
    (b) the player is a claw-shaped rim cursor; (c) Flippers visibly rotate
    lane-over-lane when flipping; (d) color bands change at 16-level
    boundaries; (e) all gameplay entities and HUD text are stroked line art —
    no filled sprites or bitmaps; (f) wave completion triggers a down-the-well
    warp zoom.
