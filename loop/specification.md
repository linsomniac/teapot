# Specification — "Teapot": a browser-based game inspired by Tempest

Status: revised draft, review round 3
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
- **Winding convention:** geometry data is authored with a consistent winding such
  that increasing lane index reads clockwise on screen for closed wells and
  left-to-right for open wells. Wherever this spec says "clockwise", it means
  **toward increasing lane index** (wrapping mod 16 on closed wells).
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
  on open wells. Firing, enemy-shot lethality, rim contact (Flipper and Fuseball),
  Pulsar lane kills, and warp spike collision all use this single rule.

## 5. The player (Blaster)

- Lives at the rim at a continuous rim position; renders as the claw-shaped
  Tempest cursor spanning its current lane (per the player-lane rule, §4).
- **Movement (keyboard, primary):** left/right arrows (and A/D) move the player
  along the rim at `rimSpeed` (§8.3). Open wells clamp at the end lanes.
- **Movement (mouse, optional):** mouse control uses the **Pointer Lock API
  exclusively**. Clicking the canvas during PLAYING requests pointer lock (that
  click is consumed by the input layer — it does not fire); once locked,
  horizontal movement deltas map to rim movement via `mouseSensitivity` (§8.3).
  Losing pointer lock for any reason (Escape, focus loss, rejection) auto-pauses
  the game via the `pointerlockchange`/`pointerlockerror` events — never by
  assuming the Escape keydown is delivered. Resuming mouse control requires a
  click, which re-requests the lock and is likewise consumed (not fired); P
  resumes the game on keyboard control without re-locking. If a lock request
  rejects (e.g. Chromium's ~1.25 s post-Escape cooldown), the game stays paused
  and shows a hint. Keyboard control is always available regardless of lock
  state. Held mouse buttons register only from their next mousedown after a
  consumed click.
- **Firing:** space / left mouse button (when pointer-locked). Shots spawn at the
  player's current depth (0 during play; the Blaster's current depth during warp)
  on the player's lane and travel down it at `shotSpeed`. Maximum **8 player
  shots** in flight; firing is capped at one shot per `fireInterval`. Holding
  fire auto-fires at that cap.
- **Superzapper:** the player has **two uses per level**, forming a state machine
  `FULL(2) → PARTIAL(1) → EMPTY(0)` shown as HUD pips:
  - Use 1 (from FULL): destroys **all enemies currently on the well**. Tankers
    are destroyed outright — they do **not** split. Enemy shots and spikes are
    unaffected.
  - Use 2 (from PARTIAL): destroys **one** random on-well enemy (Tankers again
    destroyed without splitting).
  - Further presses (EMPTY): no effect.
  - Activating with zero enemies on the well still consumes the use.
  - Accepted only during PLAYING (not during WARP or the get-ready pause).
  - Superzapper kills award no points. State resets to FULL at the start of
    every level. Uses consumed are **not** restored by death — the state
    persists as-is through death within a level.
  - Bound to Z / right mouse button (the canvas suppresses the context menu).
- **Death conditions:** the player dies when
  (a) an enemy shot crosses depth 0 on the player's lane;
  (b) the player's lane equals a rim-resident Flipper's or Fuseball's lane —
      **symmetric contact**, regardless of which entity moved (for flipping
      enemies, see the flip-occupancy rule, §6: a flip is lethal only on
      completion);
  (c) a Pulsar's lane is electrified (§6.5) while it is the player's lane — for
      the **entire** pulse duration, including moving onto it mid-pulse;
  (d) the Blaster collides with a spike during warp descent (§9).
- **After death (lives remaining):** all on-well enemies retreat into the well
  bottom and are **returned to the wave's remaining spawn budget by type** — they
  re-emerge when play resumes, so a wave always requires destroying its full
  complement. (Flippers released by Tanker splits return to the Flipper budget,
  which may therefore exceed the level's authored Flipper count — intended.) The
  wave-completion check (§8.4) is suspended from the moment of death until play
  resumes. In-flight enemy shots and player shots are cleared. Spikes, score,
  and Superzapper state persist. A short "get ready" pause (§8.3) precedes
  resumed play; no invulnerability window is needed because the well is clear of
  enemies at resume.
- **Lives:** start with 3. Bonus life every 20,000 points. Lives shown in the HUD.

## 6. Enemies

All enemies spawn at the well bottom (depth 1) from a per-level, per-type **spawn
budget** and climb toward the rim. Enemy motion is lane-based. Numeric parameters
come from the difficulty model (§8). Global combat rules:

- **Spawning:** a spawn attempt occurs every `SpawnInt` seconds, the first one
  `SpawnInt` after the level begins (and after each death-resume). If the on-well
  enemy count is below `MaxOnWell` and budget remains, one enemy spawns: its type
  is drawn from the types with remaining budget, weighted by remaining count, and
  its lane is drawn uniformly from the 16 lanes — both via the sim RNG. Tanker
  splits ignore `MaxOnWell` (it gates spawns only).
- **Enemy firing:** Flippers, Tankers, and Pulsars fire. Each eligible enemy
  independently draws its next-shot delay uniformly from `[0.5, 1.5] × FireInt`
  via the sim RNG (drawn on spawn and after each shot or suppressed attempt).
  When the timer fires: if the enemy is ineligible (depth < 0.2, rim-resident, or
  `MaxShots` enemy shots already in flight) the shot is suppressed and a new
  delay is drawn; otherwise it fires. **Minimum firing depth:** enemies fire
  only at depth ≥ 0.2; rim-resident enemies never fire.
- **Flip occupancy rule:** a flipping enemy occupies its source lane for the
  first half of the flip animation and its destination lane for the second half
  (it can be shot in either during the corresponding half). A rim flip becomes
  lethal contact only when the flip **completes** onto the player's lane — which
  is what makes the classic point-blank save possible (§6.1).
- **Shot consumption:** a player shot is consumed by the first thing it hits —
  enemy, enemy shot, or spike trim. It never pierces.
- **Tick resolution order:** within a sim tick, player-shot collisions resolve
  **before** contact-death and enemy-shot-lethality checks, so a shot that
  connects on the same tick an enemy would kill saves the player.

### 6.1 Flipper (from level 1)
- Climbs its lane; every `FlipInt` seconds it **flips** to an adjacent lane,
  rotating about the shared edge (the signature animation, duration
  `flipAnimTime`). **Mid-well flip direction:** one lane toward the player's
  current lane via the shortest arc, evaluated when the flip starts (ties broken
  clockwise); a Flipper already on the player's lane does not flip, it climbs.
  In the end lane of an open well the shortest arc is always inward.
- On reaching the rim it stays there and flips lane-to-lane along the rim toward
  the player every `rimFlipInterval` (= 0.5 × FlipInt — the rim chase is faster
  than the climb), choosing the shortest arc re-evaluated before each rim flip
  (ties broken clockwise). Open-well ends bound the chase. Rim contact is
  symmetric per §5(b); a completed rim flip onto the player's lane kills, and
  the player can shoot a Flipper mid-flip before it lands — the classic close
  call.
- Dies to one shot. Score: 150.

### 6.2 Tanker (from level 3)
- Climbs its spawn lane slowly; never changes lanes; fires per §6.
- When shot, or upon reaching the rim, it splits into **two Flippers** flipping
  away in opposite directions (at the rim: both land on the adjacent lanes and
  begin rim behavior; their landing flips are ordinary rim flips for lethality).
  The Tanker itself is never lethal — reaching the rim on the player's lane just
  splits. In an end lane of an open well, both released Flippers flip in the
  single available direction, staggered by half a flip. Superzapper destruction
  does not split (§5).
- Dies to one shot (splitting). Score: 100 (released Flippers score separately).

### 6.3 Spiker (from level 4)
- Climbs its lane while extending a **spike** occupying depth `[1 − h, 1]` where
  `h` is the spike's height above the well bottom. The Spiker's climb raises `h`
  up to the per-level maximum `SpikeH` (i.e. it reverses at depth `1 − SpikeH`),
  then descends and re-emerges up a uniformly random **different** lane (sim
  RNG), extending that lane's spike. **Spikes never shrink except by trimming:**
  a lane's spike top is the higher of its existing top and its resident Spiker's
  highest reach; a Spiker in a lane whose spike is already at `SpikeH` climbs to
  the reversal depth and reverses as usual. Does not fire. Spikes never harm the
  player during normal play — they matter during warp descent (§9).
- **Spike/shot interaction:** a player shot that reaches a spike's top while the
  Spiker is at or above that point kills the Spiker (the Spiker has hit
  priority); otherwise the shot trims the spike's height by `spikeTrim` and is
  consumed (one trim per shot). Consequently, enemies below a lane's spike top
  are shielded from player shots until the spike is trimmed down or they climb
  above it. Enemy shots pass through spikes freely. Spikes persist after their
  Spiker dies, across player deaths, and into the warp descent.
- Spiker dies to one shot. Score: 50. Spike trim: 1 point per hit (bounded by
  fire rate at ~10 points/s — negligible against play scoring; see
  `loop/spec-rejected-concerns.md` R3).

### 6.4 Fuseball (from level 11)
- A jittering ball of line-sparks that climbs its lane with erratic, varying
  speed (random walk between 0.3× and 1.5× its base speed, sim RNG); does not
  fire; never changes lanes while climbing. (The original's lane-edge riding is
  simplified to lane-based movement — spec-decisions D15.)
- On reaching the rim it becomes rim-resident **temporarily**: it crawls along
  the rim at `fuseballRimSpeed` toward the player (shortest arc at arrival,
  ties clockwise; open-well ends force reversal) for `fuseballRimTime`, then
  descends back into the well and resumes its erratic climb — repeating until
  destroyed. Its rim lane uses the same rounding rule as the player.
- Rim contact is symmetric and lethal per §5(b). Destroyed only by player shots
  or the Superzapper (the §6 tick order makes an exact-tick shot save the
  player). Score scales with kill depth — the closer to the rim, the higher:
  depth > 2/3 → 250; 1/3–2/3 → 500; < 1/3 → 750.

### 6.5 Pulsar (from level 17)
- Moves like a Flipper (climb + lane flips, same targeting rule) but never
  occupies the rim: at depth 0.15 it reverses and descends; at the bottom
  (depth 1) it reverses again and climbs — oscillating for the rest of the wave.
  It never despawns: the wave cannot complete until every Pulsar is destroyed.
- Pulses on a global pulse clock with period `pulseCycle`: a visible charge-up
  telegraph for the final 0.5 s of each cycle, then a pulse lasting
  `pulseDuration` during which the Pulsar's lane is **electrified along its full
  length and lethal to the player for the entire duration** (entering the lane
  mid-pulse also kills; §5(c)). Pulsars begin no flips from telegraph start
  through pulse end (a flip already in progress completes — within
  `flipAnimTime`, well before the pulse — so the electrified lane is stable for
  at least the telegraph's final half). The pulse affects only the player:
  player shots pass through an electrified lane unharmed and can destroy the
  Pulsar at any time, including mid-pulse.
- Fires shots per §6. Dies to one shot. Score: 200.

### 6.6 Enemy shots
- Enemy shots travel up their lane at `enemyShotSpeed`. A shot crossing depth 0
  on the player's lane kills the player; on any other lane it disappears at the
  rim.
- Player shots destroy enemy shots on collision. Score: 0 points (deliberate:
  any positive value makes farming the last enemy's shots a dominant high-score
  strategy — spec-decisions D14).

### 6.7 Collision model
- Collision is per-lane and swept: two entities on the same lane collide if
  their depth intervals — each entity's `[prevDepth, currDepth]` span for the
  tick, inflated by its collision half-extent — overlap at any point during the
  tick (segment overlap, not point sampling; per-tick closing speeds up to
  ~0.033 depth would tunnel through point tests).
- Collision half-extents (§8.3): enemies 0.02, shots 0.01, spike top 0 (the trim
  point), rim-resident entities are hittable at depth 0 by freshly spawned
  shots (a shot spawns at the player's depth and overlaps depth-0 entities on
  its first tick).

## 7. Scoring

| Event | Points |
|---|---|
| Flipper destroyed | 150 |
| Tanker destroyed | 100 |
| Spiker destroyed | 50 |
| Fuseball destroyed (by kill depth: > 2/3, 1/3–2/3, < 1/3) | 250 / 500 / 750 |
| Pulsar destroyed | 200 |
| Enemy shot destroyed | 0 |
| Spike trimmed (per hit) | 1 |
| Superzapper kill | 0 |
| Level-clear bonus (at wave completion) | 100 × min(level, 96) |

The level-clear bonus freezes at the difficulty tail (level 96 — §8.1) so
bonus-life income cannot outgrow the frozen difficulty and trend toward
immortality. Bonus life every 20,000 points. Score, high score, level, lives, and
Superzapper pips are always visible in the HUD. These values are this spec's
canon (inspired by, not copied from, the arcade tables); they live in one data
module so tuning is a one-file change.

## 8. Levels and difficulty

### 8.1 Level definition
Level N uses well geometry `(N−1) mod 16` and the color band of §4. Difficulty
parameters are produced by one deterministic function of N: **linear
interpolation between the anchor rows below**, with integer columns rounded to
nearest, values held flat beyond the last anchor (the endless tail), per-type
budgets forced to 0 before that enemy's introduction level (Flippers 1+,
Tankers 3+, Spikers 4+, Fuseballs 11+, Pulsars 17+), and a "—" cell treated as
the column's first defined value for interpolation purposes (the parameter is
unused below the enemy's introduction level anyway).

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

Column notes: Flip/Tank/Spik/Fuse/Puls = per-type spawn budgets (initial values
per level; death-returns may raise the remaining Flipper budget above the
authored value, §5). Climb = base climb speed (per-type multipliers in §8.3).
FlipInt = seconds between mid-well lane flips for Flippers/Pulsars (rim flips
use `rimFlipInterval` = 0.5 × FlipInt). FireInt = mean seconds between shots per
eligible enemy (§6 scheduler). MaxShots = max simultaneous enemy shots.
SpikeH = max spike height **measured up from the well bottom** (spike occupies
depth [1 − SpikeH, 1]; larger = taller = harder, preserving difficulty
monotonicity). Pulse = pulseCycle. SpawnInt = interval between spawn attempts
(§6).

### 8.3 Tuning constants (initial values; one data module)

| Constant | Value |
|---|---|
| rimSpeed (keyboard) | 14 lanes/s |
| mouseSensitivity (pointer-locked) | 50 px per lane |
| shotSpeed (player) | 1.5 depth/s |
| fireInterval (player) | 0.1 s |
| max player shots | 8 |
| enemyShotSpeed | 0.5 depth/s |
| flipAnimTime | 0.25 s |
| rimFlipInterval | 0.5 × FlipInt |
| climb multipliers (× Climb) | Flipper 1.0, Tanker 0.6, Spiker 0.8, Fuseball 0.5, Pulsar 0.9 |
| fuseballRimSpeed | 2 lanes/s |
| fuseballRimTime | 3.0 s |
| pulseDuration | 0.4 s |
| pulse telegraph | 0.5 s |
| Pulsar reversal depth | 0.15 |
| minimum enemy firing depth | 0.2 |
| spikeTrim (per shot) | 0.05 depth |
| descent speed (warp) | 0.4 depth/s (~2.5 s) |
| collision half-extents | enemies 0.02, shots 0.01 |
| starting lives | 3 |
| bonus life interval | 20,000 points |
| level-clear bonus cap | level 96 |
| get-ready pause | 1.5 s |

### 8.4 Wave completion
The level ends when the spawn budget is exhausted **and** no enemies remain on
the well. Enemy shots in flight are cancelled; spikes remain. The level-clear
bonus is awarded at this moment (before the warp). The completion check never
fires during the death/respawn sequence (§5).

### 8.5 Starting level
The player may start at any level from 1 to `max(9, maxLevelReached)`.
`maxLevelReached` is recorded when a level **begins play** (PLAYING entered at
level N sets `maxLevelReached = max(old, N)`); it is stored locally (§12.4).
Chosen via a selector on the level-select screen (left/right + fire to confirm).

## 9. Warp descent (between levels)

- After wave completion the Blaster flies down the well at the descent speed
  (§8.3), passing any remaining spikes. "AVOID SPIKES" flashes at descent start
  if spikes remain.
- During descent the player can still move between lanes and fire; shots trim
  spikes per §6.3 (shots spawn at the Blaster's current depth). Colliding with a
  spike (player-lane rule, §4) kills the player: a life is lost, but the level
  still counts as complete (its bonus was already awarded) — if lives remain,
  the next level begins normally (the descent is **not** replayed; a deliberate
  inspired-by deviation, spec-decisions D16). If it was the last life, the game
  ends (WARP → GAME_OVER).
- **Descent fairness invariant:** holding fire down one lane from descent start
  must fully trim a maximum-height spike before the Blaster reaches it. This is
  a property of the §8.2/§8.3 constants and must be verified by a §13 test that
  **simulates the actual descent** (worst-case SpikeH across all anchor rows,
  scripted hold-fire, shots travelling at shotSpeed from the moving Blaster,
  trims applied on arrival) — not by closed-form rate arithmetic, which ignores
  shot transport delay. Any retuning must keep this test passing.
- On reaching the bottom, the next level fades in (new well geometry, level
  banner, Superzapper reset to FULL).

## 10. Screens and game states

**Sim-owned state machine** (lives in `sim/`, driven only by tick inputs):

```
TITLE → LEVEL_SELECT            (fire/confirm)
LEVEL_SELECT → TITLE            (back)
LEVEL_SELECT → PLAYING          (confirm)
PLAYING → WARP                  (wave complete)
WARP → PLAYING                  (descent complete)
PLAYING → GAME_OVER             (death, no lives left)
WARP → GAME_OVER                (spike death, no lives left)
GAME_OVER → HIGH_SCORE_ENTRY    (score in top 10)
GAME_OVER → TITLE               (otherwise)
HIGH_SCORE_ENTRY → TITLE        (initials confirmed)
```

**Pause is an app-layer overlay, not a sim state** (spec-decisions D19): while
paused, the app stops calling `tick()` entirely and the sim state is frozen;
pause and resume never pass through the sim, and replays are pause-agnostic.
Pause is available while the sim is in PLAYING or WARP, via P or Escape, or
**auto-pause** on any of: document visibility loss, window blur, or pointer-lock
exit (§5). The overlay dims the game. Resume: P (keyboard) or click (also
re-requests pointer lock if mouse control was in use; the click is consumed).

- **Title:** game name, "press fire or click to start" (reserved keys — M, P,
  Escape, F3 — keep their global functions and do not start the game), top-10
  high-score table, control summary, mute indicator. No AI demo game.
- **Level select:** starting-level selector (§8.5); Escape backs out to TITLE
  (Escape's pause role applies only during PLAYING/WARP).
- **Playing:** the game. HUD: score (top left), high score (top center), lives
  and Superzapper pips, level number.
- **Game over:** "GAME OVER" over the final well; after a beat, transitions to
  high-score entry if the score makes the top 10, else title. The final score
  counts wherever death occurred, including during WARP.
- **High-score entry:** 3-initial arcade entry (rotate letters with left/right
  or mouse movement, confirm with fire). Stored locally.

## 11. Presentation

### 11.1 Rendering
- HTML5 Canvas 2D, single full-viewport canvas, letterboxed 4:3 playfield,
  `devicePixelRatio`-aware backing store **capped at DPR 2**.
- Pure line rendering: strokes on black. Neon glow via layered strokes (a wide
  low-alpha pass under a thin bright core) — **not** `shadowBlur` (too slow).
- **The player's current lane is rendered highlighted** (brighter rim-to-bottom
  outline, the classic yellow-sector cue) — it is the primary aiming feedback
  for lane-based combat.
- 3D→2D: perspective projection of `(lane, depth)` positions; the vanishing
  point sits slightly off-center per level (data-authored). Projection is pure
  math in `sim/` (§12.2).
- Explosions: short line-burst particle effects; player death gets a bigger,
  distinct burst. Particle randomness uses a render-side RNG stream, separate
  from the sim RNG, so visuals never affect sim determinism.
- **Text is canvas-drawn stroke lettering** (Hershey/Vectrex-style segment data
  authored as a static module — no font files, no async font loading,
  consistent with zero-asset line art).
- Rendering interpolates entity positions between the previous and current sim
  ticks (§12.3); allocation in hot render paths is avoided by reusing buffers
  (the per-tick sim event list is fine).

### 11.2 Audio
- Web Audio API, all sounds synthesized (oscillators/noise + envelopes). No
  assets, no music. Distinct SFX for: player shot, enemy shot, enemy death,
  player death, Flipper flip, Superzapper, warp descent, spike hit, Pulsar pulse
  telegraph, bonus life, high-score jingle, UI move/confirm.
- The AudioContext is created/resumed on first user gesture (autoplay policy).
  On every resume-from-pause gesture and on the context's `statechange` event,
  if `context.state !== 'running'`, call `resume()` (covers Safari's
  'interrupted' re-suspension).
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
  math**; entity state and updates; the spawn and enemy-fire schedulers (§6);
  swept collision (§6.7); scoring; level/wave progression; the sim-owned state
  machine (§10); the **fixed-timestep stepper as a pure function** (elapsed
  time in → tick count + interpolation alpha out, with clamping); the seeded
  sim RNG (e.g. mulberry32 — every gameplay random draw goes through it). The
  sim emits a per-tick event list (kills, shots, pulses, state changes)
  consumed by audio/particles, keeping the sim pure.
- `persist/` — pure encode/decode/validate for the saved-data schema (§12.4).
  No browser APIs; `app/` owns the actual localStorage I/O.
- `render/` — canvas renderer: draws well/entities/particles/HUD/screens from
  sim state (plus previous-tick positions for interpolation). Never mutates sim
  state. Uses `sim/`'s projection functions.
- `audio/` — synthesized SFX triggered by sim events.
- `input/` — keyboard/mouse/pointer-lock capture, normalized into the per-tick
  input snapshot the sim consumes; consumes lock-acquisition/unpause clicks
  (§5).
- `app/` — bootstrapping, the game loop (driving the pure stepper), the pause
  overlay (§10), localStorage adapter, focus/visibility/pointer-lock-loss
  handling, bench mode (§12.6).

### 12.3 Game loop and determinism
- Fixed-timestep simulation at 60 Hz with an accumulator driven by
  `requestAnimationFrame`. The accumulator/stepper logic is the pure `sim/`
  function above: it clamps accumulated time (max 250 ms) against
  spiral-of-death and yields the interpolation alpha ∈ [0, 1). While paused,
  the app does not call it and elapsed pause time is discarded (no time leaks
  across a pause).
- The renderer runs every rAF and **interpolates** between each entity's
  previous and current tick positions by the alpha, so motion is smooth on
  60/90/120/144 Hz displays alike. Entities expose prev/curr positions.
- **Determinism contract:** the sim advances only via `tick(inputSnapshot)`
  where the snapshot carries movement delta (fractional lanes), fire/zap button
  states, and UI-confirm inputs — nothing else; the sim never reads wall-clock
  time, `Math.random`, or any browser API. Given the same seed and the same
  snapshot sequence, a run is bit-identical **on the same JS engine/build**
  (cross-browser floating-point identity is not claimed; spec-decisions D17).
  Pauses do not exist in the snapshot stream (D19).

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
- `?bench=1` query parameter: loads a deterministic worst-case scenario pinned
  to the difficulty table's endless-tail cap row (level-96 anchors: 12 on-well
  enemies, 8 enemy shots, 8 player shots, continuous particle bursts), runs it
  seeded and scripted for 60 s in a focused foreground tab, and reports:
  - **work time** per frame — `performance.now()` measured around the sim
    tick(s) + render + audio dispatch inside each rAF callback (the primary,
    refresh-rate-independent metric for AC 15.7), and
  - dropped-frame percentage against the detected display refresh interval,
    with raw rAF-interval stats as secondary informational output.
  Results render on screen and log to the console as JSON.
- F3 toggles a frame-time overlay during normal play.

## 13. Testing and quality

- **Unit tests (Vitest)** over the pure modules (`sim/`, `persist/`), covering
  at minimum:
  - Lane math on open/closed wells: wrapping, clamping, adjacency, the
    player-lane rule (§4) at boundaries; the winding/"clockwise" convention.
  - Projection math invariants (depth-0 maps to rim polyline; deeper is closer
    to the vanishing point; all 16 geometries).
  - Collision (§6.7): swept segment overlap incl. the fast-crossing
    shot-vs-shot case; trim-vs-kill priority (§6.3); rim contact at depth 0;
    warp spike collision; tick resolution order (shot saves player on the same
    tick).
  - Spawner (§6): initial per-type budgets match the difficulty table
    (death-return may raise the remaining Flipper budget by on-well released
    Flippers); introduction-level gating; MaxOnWell and SpawnInt behavior incl.
    first-spawn timing; weighted type draw and uniform lane draw through the
    sim RNG; difficulty interpolation between anchors incl. "—" cells;
    monotonic non-decreasing difficulty; tail behavior at levels 200/500
    (all parameters exactly equal to the level-96 anchor values).
  - Enemy fire scheduler (§6): delays drawn within [0.5, 1.5] × FireInt;
    MaxShots cap never exceeded; suppression redraws; eligibility (depth ≥
    0.2, non-rim, firing types only).
  - Scoring: per-event values incl. Fuseball depth bands; level-clear bonus at
    wave completion and its level-96 cap; bonus-life thresholds (including
    multiple thresholds in one wave).
  - Superzapper: FULL/PARTIAL/EMPTY transitions, no-split Tanker kills, no-op
    at EMPTY, consume-on-empty-well, PLAYING-only acceptance, persistence
    through death, reset at level start.
  - Death/respawn: on-well enemies return to budget by type; wave-completion
    check suspended during the death sequence; a death with exhausted budget
    does **not** complete the wave; shots cleared; spikes/score persist.
  - Per-enemy behavior: Flipper mid-well player-seeking flips (incl. ties and
    end lanes) and rim shortest-arc chase at rimFlipInterval; flip-occupancy
    halves; symmetric rim contact (player moving onto a rim Flipper/Fuseball
    dies); Tanker split directions incl. end-lane and rim cases, splits
    ignoring MaxOnWell, non-lethal Tanker; Spiker build/reverse/re-emerge,
    never-shrink rule (re-emergence under a taller existing spike), trim
    accounting; Fuseball speed-jitter bounds, rim-crawl direction, temporary
    rim residency (descends after fuseballRimTime), depth-banded scoring;
    Pulsar oscillation (never rim, never despawn), flip freeze during
    telegraph/pulse, full-duration lane lethality incl. entering mid-pulse,
    shots passing through pulses.
  - Player firing: 8-shot cap, fireInterval cap, auto-fire, shot spawn depth
    (0 in play, Blaster depth in warp).
  - Warp: the descent fairness invariant test **simulating the actual descent**
    per §9; spike death during warp decrements a life, keeps the level, does
    not replay the descent; WARP → GAME_OVER on last life.
  - Sim state machine: every transition in §10's sim-owned diagram and no
    others (pause is app-layer and excluded; D19).
  - Stepper: tick counts under long/jittery/normal frame patterns; 250 ms
    clamp; alpha ∈ [0, 1); no time leak across a pause (discarded elapsed
    time).
  - Persistence: round-trip, corrupt JSON, wrong-shape data, unknown fields,
    storage-throwing adapter; maxLevelReached round-trip.
- **Determinism/replay test:** with a fixed seed, a **frozen snapshot of the
  difficulty/scoring parameters** (checked into the test, independent of the
  live tuning module), and a scripted input-snapshot sequence, a multi-level
  sim run reproduces an exact expected final state (score, level, entity
  census). Because the parameters are frozen, live tuning does not invalidate
  the golden state; the golden is re-recorded only for intentional rule
  changes, with the diff reviewed. A companion test asserts self-consistency:
  two runs of the same seed + script produce identical per-tick state hashes
  (valid across any tuning).
- **Static checks:** `tsc --noEmit` (strict) and lint pass clean; scripts:
  `npm test`, `npm run typecheck`, `npm run lint`.
- **Manual test checklist** maintained in the implementation guide, covering
  (a) feel/audio/visual judgments and (b) **functional browser-integration
  behaviors** that unit tests cannot reach, enumerated explicitly: each
  pointer-lock loss path (Escape, blur, rejection), lock-request rejection
  hint, visibility/blur auto-pause in PLAYING and WARP, click-to-resume incl.
  the Chromium re-lock cooldown, consumed clicks not firing, private-mode/
  quota storage degradation, AudioContext recovery after interruption —
  each run per supported browser (§12.5).

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

The project is done when all of the following hold. "Plays" in criterion 1 means
the §13 manual checklist's smoke pass completes in that browser.

1. `npm run build` produces a static bundle that plays in the supported browsers
   (§12.5); `npm run dev` works for development; zero runtime dependencies.
2. All 16 well geometries appear across levels 1–16 with correct open/closed
   movement behavior, every well has exactly 16 lanes, and the §4 color-band
   formula holds across at least levels 1–112 (spot-checked at each boundary).
3. All five enemy types exhibit the behaviors in §6 — including player-seeking
   flips, the minimum-firing-depth, flip-occupancy, symmetric-rim-contact,
   shot-consumption, and tick-order rules; Tanker splits per §6.2; Spiker
   never-shrink spikes with kill-vs-trim priority per §6.3; Fuseball temporary
   rim residency and depth-banded scoring per §6.4; Pulsar telegraph-frozen
   flips, full-duration lane lethality, oscillation, and never-despawning per
   §6.5.
4. The rules, state machines, and invariants of §5–§9 hold exactly as specified
   (Superzapper two-use machine incl. consume-on-empty and death persistence;
   death/respawn budget-return; warp descent with the simulated fairness
   invariant; lives and bonus lives; level-clear bonus with its cap). Numeric
   parameters may be the data module's values at acceptance time, provided all
   documented invariants (descent fairness, difficulty monotonicity) still
   pass.
5. Player controls behave per §5: keyboard movement at rimSpeed with open-well
   clamping; pointer-lock mouse control with auto-pause on lock loss,
   click-to-resume, and consumed (non-firing) lock/unpause clicks; 8-shot cap;
   hold-to-auto-fire.
6. Starting-level selection offers 1..max(9, maxLevelReached); high scores,
   mute state, and maxLevelReached survive reload; corrupt or unavailable
   storage neither crashes the game nor surfaces errors to the player.
7. **Performance:** on a 2020-class x86 laptop with integrated graphics (no
   discrete GPU), in the latest Chrome and Firefox, the `?bench=1` run (§12.6)
   reports mean per-frame **work time** ≤ 12 ms and p95 ≤ 16 ms, with dropped
   frames < 2% against the detected refresh rate.
8. HUD, title (reserved-key rule), level select (incl. Escape-to-title), the
   app-layer pause overlay (manual from PLAYING and WARP; auto-pause on
   visibility loss, blur, and pointer-lock exit; no sim time leak), game over
   (including from WARP), and high-score entry all function per §10.
9. Every SFX listed in §11.2 fires on its event (verified per-event from the
   checklist; distinctness confirmed once at sign-off); M mutes/unmutes
   everywhere and persists; audio recovers after context interruption.
10. `npm test`, `npm run typecheck`, and `npm run lint` pass; every §13 test
    area has tests; the frozen-parameter replay test and the per-tick
    self-consistency test exist and pass.
11. The game letterboxes and remains playable at ≥ 1024×768 CSS pixels; smaller
    windows do not crash; the backing store respects the DPR-2 cap.
12. **Visual identity checklist** (each item verifiable from a screenshot or
    short capture): (a) the well is glowing wireframe line art on black;
    (b) the player is a claw-shaped rim cursor; (c) the player's current lane
    is highlighted; (d) Flippers visibly rotate lane-over-lane when flipping;
    (e) color bands change at 16-level boundaries; (f) all gameplay entities
    and text are stroked line art — no filled sprites, bitmaps, or font files;
    (g) wave completion triggers a down-the-well warp zoom.
