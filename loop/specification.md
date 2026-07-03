# Specification — "Teapot": a browser-based game inspired by Tempest

Status: revised draft, review round 9
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
  time, and scales continuously up to a tuning cap (§8.1); there is no ending —
  the game is over when lives run out.

## 4. The well

- A well (also "web" or "tube") is a 3D surface defined by a **rim polyline** of
  vertices at depth 0 and an identical polyline scaled toward a vanishing point at
  depth 1. Adjacent vertex pairs define **lanes** (quadrilateral columns).
- **Every well has exactly 16 lanes.** Wells are either **closed** (16 rim vertices
  in a loop; the player can rotate continuously) or **open** (17 rim vertices; the
  rim has two ends and movement stops at the end lanes).
- **16 well geometries**, one per level, cycling every 16 levels: geometry index =
  `(N−1) mod 16` for level N. **Geometry indices 0–7 are the 8 closed wells and
  8–15 the 8 open wells** (so this mapping is deterministic and every 16-level
  block has a closed run then an open run). The indicative closed set is circle,
  square, plus/cross, triangle, pentagon, hexagon, hourglass/bowtie, diamond;
  the open set is flat line, V, wide valley, U, W, zig-zag, arc, L. (Final shapes
  are the implementer's choice provided each passes validation below; deep-spike
  shapes like sharp stars are avoided because they produce thin lanes. The
  hourglass narrows at the waist but does not cross itself.) Vertex data is
  authored as static data in one module, each geometry carrying its own
  **vanishing-point offset** (per-geometry, so the set covers endless levels). A
  §13 data-validation test enforces: exactly 16 lanes (16 or 17 rim vertices as
  above); a non-self-intersecting rim (no two rim segments cross); and a minimum
  projected lane width of 24 px at the rim at the reference playfield size of
  1440×1080.
- **Winding convention:** geometry data is authored with a consistent winding such
  that increasing lane index reads clockwise on screen for closed wells and
  left-to-right for open wells. Wherever this spec says "clockwise", it means
  **toward increasing lane index** (wrapping mod 16 on closed wells).
- **Color bands:** the palette index for level N is `floor((N−1) / 16) mod 6` into
  `[blue, red, yellow, cyan, green, magenta]`: levels 1–16 blue, 17–32 red, 33–48
  yellow, 49–64 cyan, 65–80 green, 81–96 magenta, 97–112 blue again, and so on
  forever. The band colors the well and HUD; enemies keep fixed per-type colors
  (§11.1). (The original's "invisible" black wells are deliberately omitted in
  favor of playability — an inspired-by liberty, per §1.)
- **Coordinates:** an entity's position is `(lane, depth)` with depth ∈ [0, 1],
  0 = rim (player end), 1 = well bottom (spawn end). Lane `i` is the sector
  between rim vertices `i` and `i+1`; `rimPos`/lane indices are in lane units,
  so integer `rimPos = i` places the entity at the **center** of lane `i` (the
  midpoint of vertices `i` and `i+1`). The projection (§11.1) maps lane-center
  and depth to screen space via the authored rim vertices.
- **Player-lane rule (canonical):** the player's rim position is continuous
  (fractional), but the player always occupies **exactly one lane**. `round`
  means `floor(x + 0.5)` (half rounds up, deterministic). On closed wells
  `rimPos` is normalized to `[0, 16)` each tick and `playerLane = round(rimPos)
  mod 16`; on open wells `playerLane = clamp(round(rimPos), 0, 15)`. Firing,
  enemy-shot lethality, rim contact (Flipper and Fuseball), Pulsar lane kills,
  and warp spike collision all use this single rule. To keep lane crossings
  detectable by per-tick sampling, the input layer clamps the per-tick
  rim-movement delta below 0.5 lanes (§8.3) — no input can skip a lane between
  ticks.

## 5. The player (Blaster)

- Lives at the rim at a continuous rim position; renders as the claw-shaped
  Tempest cursor spanning its current lane (per the player-lane rule, §4). At
  level start the rim position is lane 8's center; it is preserved across deaths
  within a level.
- **Movement (keyboard, primary):** left/right arrows (and A/D) move the player
  along the rim at `rimSpeed` (§8.3). "Left" decreases `rimPos` (lower lane
  index); "right" increases it. Open wells clamp at the end lanes.
- **Movement (mouse, optional):** mouse control uses the **Pointer Lock API
  exclusively**, and only for gameplay — menus are keyboard-driven (§10).
  Clicking the canvas while the sim is in PLAYING, GET_READY, or WARP requests
  pointer lock (that click is consumed by the input layer — it does not fire);
  clicks on other screens never request lock, and the app **exits any held lock
  when the sim leaves those three states**. The lock request passes
  `unadjustedMovement: true`; if it rejects with a not-supported error, it
  retries without the option. Older engines' non-Promise `requestPointerLock`
  returns are handled defensively. Once locked, horizontal movement deltas map
  to rim movement via `mouseSensitivity`, clamped per tick (§4/§8.3). (Because
  `unadjustedMovement` is unsupported on Firefox and older Safari, raw mouse
  feel varies slightly across browsers with the single fixed sensitivity; this
  is accepted for v1, where keyboard is the primary control and sensitivity is
  not configurable — §14.9.) Losing
  pointer lock for any reason (Escape, focus loss, rejection) auto-pauses the
  game via the `pointerlockchange`/`pointerlockerror` events — never by
  assuming the Escape keydown is delivered. Resuming: P resumes on keyboard; a
  click resumes and re-requests the lock **iff the lock was held when the pause
  began** (the click is consumed either way). If a lock request rejects (e.g.
  Chromium's ~1.25 s post-Escape cooldown), the game stays paused and shows a
  hint. Keyboard control is always available regardless of lock state. Held
  mouse buttons register only from their next mousedown after a consumed click.
  The pending mouse-delta accumulator (§12.2) is cleared on pause and on resume,
  so movement events during a pause never burst-spin the player on resume.
- **Firing:** space / left mouse button (when pointer-locked). Shots spawn at the
  player's current depth (0 during play; the Blaster's current depth during warp)
  on the player's lane and travel down it at `shotSpeed`. Maximum **8 player
  shots** in flight; firing is capped at one shot per `fireInterval` (0.18 s —
  longer than a flip's landing window *plus* the rim collision reach, so a
  point-blank rim save needs an aimed shot rather than falling out of auto-fire;
  see D40 and the §8.3 constraint). Holding fire auto-fires at that cap. A shot
  that reaches the well bottom (depth 1) without hitting anything despawns.
- **Superzapper:** the player has **two uses per level**, forming a state machine
  `FULL(2) → PARTIAL(1) → EMPTY(0)` shown as HUD pips:
  - Use 1 (from FULL): destroys **all enemies currently on the well**. Tankers
    are destroyed outright — they do **not** split. Enemy shots and spikes are
    unaffected.
  - Use 2 (from PARTIAL): destroys **the one on-well enemy nearest the rim**
    (smallest depth; ties broken by lowest lane index) — the most imminent
    threat, so the panic button is useful when reached for (Tankers again
    destroyed without splitting).
  - Further presses (EMPTY): no effect.
  - Activating with zero enemies on the well still consumes the use.
  - Accepted only in the PLAYING state (not GET_READY, not WARP).
  - Superzapper kills award no points. State resets to FULL at the start of
    every level. Uses consumed are **not** restored by death — the state
    persists as-is through death within a level.
  - Bound to Z / right mouse button (the canvas suppresses the context menu).
- **Death conditions:** the player dies when
  (a) an enemy shot crosses depth 0 on the player's lane;
  (b) the player's lane equals a **non-flipping** rim-resident Flipper's or
      Fuseball's lane — symmetric contact, regardless of which entity moved. A
      mid-flip rim enemy is lethal only when its flip **completes** onto the
      player's lane (§6 flip mechanics: the occupancy halves exist for shot
      collision only) — crossing a mid-flip enemy's lane is safe;
  (c) a Pulsar's lane is electrified (§6.5) while it is the player's lane — for
      the **entire** pulse duration, including moving onto it mid-pulse;
  (d) the Blaster collides with a spike during warp descent (§9).
  Death is immediate (no grab-and-carry gameplay; the renderer may show the
  classic grab/drag animation as presentation — D31).
- **After death (lives remaining):** the sim enters GET_READY (§10). All on-well
  enemies are removed instantly and **returned to the wave's remaining spawn
  budget by type** — they re-enter later through the normal spawner (SpawnInt
  cadence, MaxOnWell; §6), so a wave always requires destroying its full
  complement. (Flippers released by Tanker splits return to the Flipper budget,
  which may therefore exceed the level's authored Flipper count — intended.)
  In-flight enemy shots and player shots are cleared. Spikes, score, rim
  position, and Superzapper state persist. The wave-completion check runs only
  in PLAYING and is skipped on any tick in which the player died (§6 tick
  order). If the player killed the wave's last enemy on the same tick they
  died, the death still resolves (a life is lost) and the empty wave completes
  on the first PLAYING tick after GET_READY.
- **Lives:** start with 3. Bonus life every 30,000 points. Lives shown in the
  HUD.

## 6. Enemies

All enemies spawn at the well bottom (depth 1) from a per-level, per-type **spawn
budget** and climb toward the rim. Enemy motion is lane-based. Numeric parameters
come from the difficulty model (§8). Global combat rules:

- **Spawning:** a spawn attempt occurs every `SpawnInt` seconds of PLAYING time,
  the first one `SpawnInt` after entering PLAYING (at level start and after each
  GET_READY). If the count of **threatening** on-well enemies (all types except
  Spikers — D32) is below `MaxOnWell` and budget remains, one enemy spawns: its
  type is drawn from the types with remaining budget, weighted by remaining
  count, and its lane is drawn uniformly via the sim RNG — from all 16 lanes,
  except a Spiker's lane is drawn only from lanes not already holding a Spiker
  (at most one Spiker per lane, §6.3); if every lane already has a Spiker, the
  Spiker spawn is deferred to the next attempt. Tanker splits ignore
  `MaxOnWell` (it gates spawns only).
- **Enemy firing:** Flippers, Tankers, and Pulsars fire. Each eligible enemy
  independently draws its next-shot delay uniformly from `[0.5, 1.5] × FireInt`
  via the sim RNG (drawn on spawn and after each shot or suppressed attempt).
  When the timer fires: if the enemy is ineligible (depth < 0.2, rim-resident,
  mid-flip, or `MaxShots` enemy shots already in flight) the shot is suppressed
  and a new delay is drawn; otherwise it fires. **Minimum firing depth:**
  enemies fire only at depth ≥ 0.2; rim-resident enemies never fire.
- **Flip mechanics:** a flip is a pure lateral move: **depth is frozen during
  the flip animation**, so rim arrival and Pulsar reversal are only ever
  evaluated between flips. The flip timer runs from the end of the previous
  flip (first period starts at spawn); a timer that expires mid-animation (or
  during a Pulsar freeze, §6.5) fires when the block ends. If a mid-well flip is
  skipped because the enemy is already on the player's lane (§6.1), the timer
  redraws a full `FlipInt` (it does not stay armed). On rim arrival any pending
  mid-well timer is discarded and the first rim flip occurs `rimFlipInterval`
  after arrival. A flipping enemy occupies its source lane for the first half
  of `flipAnimTime` and its destination lane for the second half — **for shot
  collision only** (it can be shot in either half on the corresponding lane).
  Lethal contact from a flip happens only at completion (§5(b)).
- **Flip targeting (mid-well):** with probability `flipSeekBias` (§8.3) a flip
  steps one lane toward the player's current lane via the shortest arc (ties
  clockwise); otherwise it steps to a **uniformly random adjacent lane** (sim
  RNG). At an open-well end lane the only interior neighbor is always taken.
  This partial randomness is load-bearing: fully player-seeking flips would
  funnel every climbing enemy single-file into a stationary hold-fire player's
  own lane, where they die at range — making lane-camping a dominant strategy;
  the random fraction sends a share of enemies to the rim on other lanes, so
  clearing a wave requires rotating (D39). Rim-flip chasing (§6.1) stays
  fully shortest-arc — a rim enemy always pursues.
- **Shot consumption:** a player shot is consumed by the first thing it hits —
  enemy, enemy shot, or spike trim. It never pierces. All shots (both sides)
  are cleared on every sim state transition (death, wave completion, level
  start, game over).
- **Tick resolution order** (within one sim tick, in every state where combat
  runs — PLAYING and WARP alike):
  1. apply the input snapshot (movement, fire, zap);
  2. advance all entities and shots;
  3. player-shot collisions (enemies, enemy shots, spike trims);
  4. enemy-shot lethality at the rim;
  5. contact, pulse, and warp-spike lethality;
  6. bonus-life award for score gained in steps 3–5 (see the bonus-life rule
     below);
  7. spawner;
  8. wave-completion check (PLAYING only; skipped on a tick in which the
     player died) — on completion it awards the level-clear bonus and then
     runs the bonus-life rule again for that bonus;
  9. state transitions.

  **Bonus-life rule:** the player is owed `floor(score / bonusLifeInterval)`
  lives in total; whenever score increases (step 6 for kill points, step 8 for
  the level-clear bonus) any newly-owed lives are granted — **except** that if
  the player died this tick (steps 4–5), thresholds crossed by that tick's kill
  points do **not** grant a life (a bonus life and a death on the same tick net
  zero). The step-8 clear bonus is only reached when the player did not die
  (step 8 is skipped on a death tick), so its bonus life is always granted; this
  is the path the §7 economy invariant depends on.
  Because 3 precedes 4–5, a shot that connects on the same tick an enemy would
  kill saves the player — including a final spike trim on the tick the Blaster
  would have hit that spike during warp.

### 6.1 Flipper (from level 1)
- Climbs its lane; every `FlipInt` seconds it **flips** to an adjacent lane,
  rotating about the shared edge (the signature animation, duration
  `flipAnimTime`). Mid-well flips follow the flip-targeting rule (§6, partly
  player-seeking and partly random, `flipSeekBias`); a Flipper already on the
  player's lane does not flip, it climbs (and redraws its timer, §6).
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
  splits, and a rim self-split awards no points (points require a shot kill).
  In an end lane of an open well (whether the split happens mid-well or at the
  rim), both released Flippers flip in the single available inward direction,
  staggered by half a flip. Superzapper destruction does not split (§5).
- Dies to one shot (splitting). Score: 100 (released Flippers score separately).

### 6.3 Spiker (from level 4)
- Climbs its lane while extending a **spike** occupying depth `[1 − h, 1]` where
  `h` is the spike's height above the well bottom. The Spiker's climb raises `h`
  up to the per-level maximum `SpikeH` (i.e. it reverses at depth `1 − SpikeH`).
  It then **descends its lane at its climb speed** (Climb × the 0.8 Spiker
  multiplier, §8.3) to depth 1, switches instantaneously at the bottom to a
  uniformly random lane drawn from those **other than its current lane and not
  occupied by another Spiker** (sim RNG; at most one Spiker per lane — the
  spawner applies the same exclusion, §6), and begins climbing there, extending
  that lane's spike. It
  cycles like this indefinitely — Spikers never despawn and must be destroyed
  (shot, or caught by a Superzapper) for the wave to complete, but they do
  **not** count toward `MaxOnWell` (they are harmless during normal play and
  would otherwise throttle the spawner — D32). **Spikes only grow (via a climbing Spiker) or
  shrink (via trimming), never otherwise:** a lane's spike top rises to follow
  its resident Spiker only while the Spiker climbs **above** the current top; it
  never rises on its own, so a trim is never reverted (a resident Spiker
  descending or sitting below the top does not restore trimmed height). A Spiker
  in a lane whose spike is already at `SpikeH` still climbs to the reversal
  depth and reverses as usual (the top simply doesn't move). Does not fire.
  Spikes are per-level: they persist across player deaths and into the warp
  descent, and are cleared when the next level begins.
- **Spike/shot interaction:** a player shot that reaches a spike's top while the
  Spiker is at or above that point kills the Spiker (the Spiker has hit
  priority); otherwise the shot trims the spike's height by `spikeTrim` and is
  consumed (one trim per shot). Consequently, enemies below a lane's spike top
  are shielded from player shots until the spike is trimmed down or they climb
  above it. Enemy shots pass through spikes freely.
- Spiker dies to one shot. Score: 50. Spike trim: 1 point per hit (bounded by
  fire rate — negligible against play scoring; see
  `loop/spec-rejected-concerns.md` R3).

### 6.4 Fuseball (from level 11)
- A jittering ball of line-sparks that climbs its lane with erratic speed: its
  speed multiplier is redrawn uniformly from [0.3, 1.5] every 0.5 s via the sim
  RNG. Does not fire; never changes lanes while climbing.
  (The original's lane-edge riding is simplified to lane-based movement —
  spec-decisions D15.)
- On reaching the rim it becomes rim-resident **temporarily**: it crawls along
  the rim at `fuseballRimSpeed` toward the player (shortest arc at arrival,
  ties clockwise; open-well ends force reversal) for `fuseballRimTime`, then
  descends — at its base climb speed (Climb × its multiplier), no jitter — to a
  uniform random depth in [0.6, 1.0] (sim RNG), where it resumes its jittered
  climb, repeating until destroyed. Its rim lane uses the same rounding rule as
  the player.
- Rim contact is symmetric and lethal per §5(b). Destroyed only by player shots
  or the Superzapper (the §6 tick order makes an exact-tick shot save the
  player). Score scales with kill depth — the closer to the rim, the higher:
  depth > 2/3 → 250; 1/3–2/3 → 500; < 1/3 → 750.

### 6.5 Pulsar (from level 17)
- Moves like a Flipper (climb + lane flips, same targeting and flip mechanics —
  it also flips while descending) but never occupies the rim: at depth 0.15 it
  reverses and descends; at the bottom (depth 1) it reverses again and climbs —
  oscillating for the rest of the wave. It never despawns: the wave cannot
  complete until every Pulsar is destroyed. (The original's Pulsar can reach the
  rim; keeping it off the rim here is a deliberate inspired-by simplification —
  it removes an ambiguous rim-Pulsar contact case, leaving the pulse and the
  Pulsar's shots as its lethality, never rim contact.)
- **Pulse timeline:** a per-level global pulse clock runs on PLAYING sim time
  from level start (it does not advance in GET_READY, and restarts its cycle at
  each PLAYING entry). Each cycle of length `pulseCycle` is: quiet for
  `pulseCycle − 0.5 s − pulseDuration`, then a visible charge-up **telegraph**
  (0.5 s), then the **pulse** (`pulseDuration`), during which each
  participating Pulsar's lane is **electrified along its full length and lethal
  to the player for the entire duration** (entering the lane mid-pulse also
  kills; §5(c)). A Pulsar participates in a pulse only if it was on the well at
  that cycle's telegraph start; later spawns join the next cycle. Pulsars begin
  no flips from telegraph start through pulse end (a flip already in progress
  completes — within `flipAnimTime`, well before the pulse — so each
  electrified lane is stable for at least the telegraph's final half; a flip
  timer expiring during the freeze fires at pulse end, §6). The pulse affects
  only the player: player shots pass through an electrified lane unharmed and
  can destroy the Pulsar at any time, including mid-pulse — and **a lane is
  electrified while any participating Pulsar on it is alive; it de-electrifies
  the instant the last such Pulsar dies** (a same-tick shot save works here too,
  per the §6 tick order).
- Fires shots per §6. Dies to one shot. Score: 200.

### 6.6 Enemy shots
- Enemy shots travel up their lane at the per-level `EShot` speed (§8.2). A
  shot crossing depth 0 on the player's lane kills the player; on any other
  lane it disappears at the rim.
- Player shots destroy enemy shots on collision. Score: 0 points (deliberate:
  any positive value makes farming the last enemy's shots a dominant high-score
  strategy — spec-decisions D14).

### 6.7 Collision model
- Collision is per-lane and swept: two entities on the same lane collide if
  their depth intervals — each entity's `[prevDepth, currDepth]` span for the
  tick, inflated by its collision half-extent — overlap at any point during the
  tick (segment overlap, not point sampling; per-tick closing speeds up to
  ~0.04 depth would tunnel through point tests).
- Collision half-extents (§8.3): enemies 0.02, shots 0.01, spike top 0 (the
  trim point), the Blaster 0 (a point at its current depth — relevant only to
  warp spike collision, §9). Rim-resident entities are hittable at depth 0 by
  freshly spawned shots (a shot spawns at the player's depth and overlaps
  depth-0 entities on its first tick).

## 7. Scoring

| Event | Points |
|---|---|
| Flipper destroyed | 150 |
| Tanker destroyed (by player shot; rim self-splits score 0) | 100 |
| Spiker destroyed | 50 |
| Fuseball destroyed (by kill depth: > 2/3, 1/3–2/3, < 1/3) | 250 / 500 / 750 |
| Pulsar destroyed | 200 |
| Enemy shot destroyed | 0 |
| Spike trimmed (per hit) | 1 |
| Superzapper kill | 0 |
| Level-clear bonus (at wave completion) | 100 × min(level, 96) |

The level-clear bonus freezes at the difficulty tail (level 96, the last §8.2
anchor beyond which §8.1 holds parameters flat), and the
bonus-life interval (30,000) exceeds the maximum attainable tail-wave score
(§13 has a test computing that maximum — all Fuseballs at 750, split Flippers,
clear bonus — and asserting it stays below the interval), so bonus-life income
cannot outgrow the frozen difficulty and trend toward immortality (D20, D30).
Score, high score, level, lives, and Superzapper pips are always visible in the
HUD. These values are this spec's canon (inspired by, not copied from, the
arcade tables); they live in one data module so tuning is a one-file change.

## 8. Levels and difficulty

### 8.1 Level definition
Level N uses well geometry `(N−1) mod 16` and the color band of §4. Difficulty
parameters are produced by one deterministic function of N: **linear
interpolation between the anchor rows below**, with integer columns rounded
half-up (`floor(x + 0.5)`, matching §4), values held flat beyond the last
anchor (the endless tail), per-type budgets forced to 0 before that enemy's
introduction level (Flippers 1+, Tankers 3+, Spikers 4+, Fuseballs 11+,
Pulsars 17+), and a "—" cell treated as the column's first defined value for
interpolation purposes (the parameter is unused below the enemy's introduction
level anyway).

### 8.2 Difficulty anchor table (initial tuning — values may be adjusted during playtesting, structure may not)

| Level | Flip | Tank | Spik | Fuse | Puls | MaxOnWell | Climb (depth/s) | FlipInt (s) | FireInt (s) | MaxShots | EShot (depth/s) | SpikeH | Pulse (s) | SpawnInt (s) |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | 8 | 0 | 0 | 0 | 0 | 4 | 0.10 | 2.0 | 3.0 | 2 | 0.40 | — | — | 1.2 |
| 4 | 10 | 2 | 2 | 0 | 0 | 5 | 0.12 | 1.6 | 2.4 | 3 | 0.45 | 0.40 | — | 1.1 |
| 8 | 12 | 3 | 3 | 0 | 0 | 6 | 0.14 | 1.3 | 2.0 | 4 | 0.50 | 0.45 | — | 1.0 |
| 11 | 12 | 3 | 3 | 2 | 0 | 6 | 0.15 | 1.2 | 1.9 | 4 | 0.55 | 0.50 | — | 0.9 |
| 17 | 14 | 4 | 4 | 3 | 2 | 7 | 0.17 | 1.1 | 1.7 | 5 | 0.60 | 0.50 | 3.0 | 0.8 |
| 24 | 16 | 5 | 5 | 4 | 3 | 8 | 0.19 | 1.0 | 1.5 | 5 | 0.70 | 0.55 | 2.7 | 0.7 |
| 32 | 18 | 6 | 5 | 4 | 4 | 9 | 0.21 | 0.9 | 1.3 | 6 | 0.80 | 0.60 | 2.4 | 0.6 |
| 48 | 20 | 7 | 6 | 5 | 5 | 10 | 0.24 | 0.8 | 1.1 | 6 | 0.90 | 0.60 | 2.2 | 0.5 |
| 64 | 22 | 8 | 6 | 6 | 6 | 11 | 0.26 | 0.7 | 1.0 | 7 | 1.00 | 0.65 | 2.0 | 0.45 |
| 96 | 24 | 8 | 7 | 6 | 7 | 12 | 0.30 | 0.6 | 0.9 | 8 | 1.10 | 0.65 | 1.8 | 0.40 |

Column notes: Flip/Tank/Spik/Fuse/Puls = per-type spawn budgets (initial values
per level; death-returns may raise the remaining Flipper budget above the
authored value, §5). Climb = base climb speed (per-type multipliers in §8.3).
FlipInt = seconds between mid-well lane flips for Flippers/Pulsars (rim flips
use `rimFlipInterval` = 0.5 × FlipInt; the table must keep FlipInt ≥ 2 ×
flipAnimTime so a flip completes before the next is due). FireInt = mean
seconds between shots per eligible enemy (§6 scheduler). MaxShots = max
simultaneous enemy shots. EShot = enemy shot speed (scales so late-game fire
has teeth). SpikeH = max spike height **measured up from the well bottom**
(spike occupies depth [1 − SpikeH, 1]; larger = taller = harder, preserving
difficulty monotonicity). Pulse = pulseCycle. SpawnInt = interval between spawn
attempts (§6; only non-Spiker enemies count toward MaxOnWell).

### 8.3 Tuning constants (initial values; one data module)

| Constant | Value |
|---|---|
| rimSpeed (keyboard) | 14 lanes/s |
| mouseSensitivity (pointer-locked) | 50 px per lane |
| per-tick rim-movement clamp | 0.45 lanes/tick (must stay < 0.5 so lane crossings are never skipped — §4) |
| shotSpeed (player) | 1.5 depth/s |
| fireInterval (player) | 0.18 s (must stay > flipAnimTime/2 + (enemyHalfExtent + shotHalfExtent)/shotSpeed + one tick ≈ 0.125 + 0.02 + 0.017 ≈ 0.162 s, so a rim-flip landing is not auto-covered by the hold-fire stream — D40) |
| max player shots | 8 |
| flipAnimTime | 0.25 s |
| flipSeekBias | 0.5 (fraction of mid-well flips that seek the player; the rest step to a random adjacent lane — governs whether hold-fire camping is survivable; tune against the anti-camping test, §13) |
| rimFlipInterval | 0.5 × FlipInt (≥ flipAnimTime by the §8.2 table constraint) |
| climb multipliers (× Climb) | Flipper 1.0, Tanker 0.6, Spiker 0.8, Fuseball 0.5, Pulsar 0.9 |
| fuseballRimSpeed | 2 lanes/s |
| fuseballRimTime | 3.0 s |
| Fuseball speed-jitter redraw | every 0.5 s, uniform [0.3, 1.5] |
| pulseDuration | 0.4 s |
| pulse telegraph | 0.5 s (the §8.2 Pulse column must keep pulseCycle ≥ telegraph + pulseDuration so the quiet phase never goes negative — a §13 guard) |
| Pulsar reversal depth | 0.15 |
| minimum enemy firing depth | 0.2 |
| spikeTrim (per shot) | 0.08 depth |
| descent speed (warp) | 0.4 depth/s (~2.5 s) |
| collision half-extents | enemies 0.02, shots 0.01, spike top 0, Blaster 0 |
| starting lives | 3 |
| bonus life interval | 30,000 points |
| level-clear bonus cap | level 96 |
| get-ready duration | 1.5 s |
| game-over beat | 2.0 s |
| UI selector step | one step per ±1.0 accumulated lanes, max one step per 0.15 s; the accumulator resets to 0 on each emitted step and is cleared when input crosses zero, so the selector stops the moment movement input stops (no post-release backlog) |

### 8.4 Wave completion
The level ends when the spawn budget is exhausted **and** no enemies remain on
the well. The check runs only in the PLAYING state and never on a tick in which
the player died (§6 tick order step 8). All in-flight shots are cancelled;
spikes remain. The level-clear bonus is awarded at this moment (before the
warp).

### 8.5 Starting level
The player may start at any level from 1 to `max(9, maxLevelReached)`.
`maxLevelReached` is recorded when a level **begins play** (PLAYING entered at
level N sets `maxLevelReached = max(old, N)`); it is stored locally (§12.4).
Chosen via a selector on the level-select screen (§10 UI navigation).

## 9. Warp descent (between levels)

- After wave completion the Blaster flies down the well at the descent speed
  (§8.3), passing any remaining spikes. "AVOID SPIKES" flashes at descent start
  if spikes remain. The player fire cooldown is reset at WARP entry, so a shot
  can be fired on the first descent tick (the descent-fairness invariant assumes
  fire is available from descent start).
- During descent the player can still move between lanes and fire; shots trim
  spikes per §6.3 (shots spawn at the Blaster's current depth). Colliding with a
  spike — §6.7 swept rule on the player's lane, Blaster as a point — kills the
  player: the life is decremented at the moment of collision and the death
  burst plays, but the level still counts as complete (its bonus was already
  awarded) and the descent is **not** replayed (a deliberate inspired-by
  deviation, spec-decisions D16). If lives remain, the descent ends immediately
  and the next level begins normally (WARP → PLAYING); if it was the last life,
  the game ends (WARP → GAME_OVER).
- **Descent fairness invariant:** holding fire down one lane from descent start
  must fully trim a maximum-height spike before the Blaster reaches it. This is
  a property of the §8.2/§8.3 constants and must be verified by a §13 test that
  **simulates the actual descent** (worst-case SpikeH across all anchor rows,
  scripted hold-fire, shots travelling at shotSpeed from the moving Blaster,
  trims applied on arrival) — not by closed-form rate arithmetic, which ignores
  shot transport delay. Any retuning must keep this test passing.
- On reaching the bottom, the next level begins (WARP → PLAYING). The level
  banner and fade-in are render-side presentation with no sim effect; sim time
  proceeds immediately (first spawn attempt SpawnInt after PLAYING entry, §6).

## 10. Screens and game states

**Sim-owned state machine** (lives in `sim/`, driven only by tick inputs):

```
TITLE → LEVEL_SELECT            (confirm)
LEVEL_SELECT → TITLE            (back)
LEVEL_SELECT → PLAYING          (confirm)
PLAYING → GET_READY             (death, lives remain)
GET_READY → PLAYING             (get-ready timer elapses)
PLAYING → WARP                  (wave complete)
WARP → PLAYING                  (descent complete; or spike death with lives
                                 remaining — descent ends, next level begins)
PLAYING → GAME_OVER             (death, no lives left; or Quit-to-title)
GET_READY → GAME_OVER           (Quit-to-title)
WARP → GAME_OVER                (spike death, no lives left; or Quit-to-title)
GAME_OVER → HIGH_SCORE_ENTRY    (after the game-over beat, score qualifies)
GAME_OVER → TITLE               (after the game-over beat, otherwise)
HIGH_SCORE_ENTRY → TITLE        (initials confirmed)
```

- **GET_READY:** a sim state lasting the get-ready duration (§8.3): the well is
  empty of enemies and shots, "GET READY" is shown, movement input is applied
  (the player may reposition), fire and zap are ignored. Its timer, like all sim
  timing, advances only when the sim ticks.
- **Pause is an app-layer overlay, not a sim state** (spec-decisions D19): while
  paused, the app stops calling `tick()` entirely and the sim state is frozen;
  pause and resume never pass through the sim, and replays are pause-agnostic.
  Pause (manual and auto) exists only while the sim is in PLAYING, GET_READY,
  or WARP — P or Escape, or **auto-pause** on document visibility loss, window
  blur, or pointer-lock exit (§5); those triggers are ignored in other states
  (menu and game-over screens just keep ticking; a throttled background rAF is
  harmless there because the accumulator clamps, §12.3). The overlay dims the
  game. Resume: P, or a click per §5's lock-resume rule. The overlay also offers
  **Quit to title (Q)**, which ends the current game through the normal
  GAME_OVER flow (the run's score still counts and reaches high-score entry if
  it qualifies), so a run can be abandoned without losing an earned high score.
  Quit is delivered to the sim as a `uiQuit` input (§12.3), forcing
  GAME_OVER from any pauseable state (PLAYING, GET_READY, or WARP).
- **UI navigation (menus are keyboard-driven; the mouse plays no role outside
  gameplay, except the one title-click carve-out below):** in TITLE,
  LEVEL_SELECT, and HIGH_SCORE_ENTRY the sim converts the movement delta into
  discrete selector steps — the delta accumulates and emits one step per full
  ±1.0 lanes, at most one step per the UI selector-step interval (§8.3),
  resetting the accumulator on each emitted step and clearing it when input
  crosses zero or on state entry (so the selector stops immediately when the
  key is released — no backlog; §8.3). **Confirm** = the fire button
  (space / Enter, and — in TITLE only — a canvas click, see below); **back** =
  Escape (LEVEL_SELECT → TITLE; Escape's pause role applies only in the three
  play states). Confirm and back act on the key's press edge, one action per
  press.
- **Title-click carve-out:** in TITLE only, a canvas click maps to the confirm
  input (TITLE → LEVEL_SELECT); it never requests pointer lock and is consumed.
  This is the sole menu-side mouse action. Clicks on LEVEL_SELECT,
  HIGH_SCORE_ENTRY, and GAME_OVER do nothing. (Any first user gesture on the
  title — this click **or** the start keypress — unlocks the AudioContext,
  §11.2, so keyboard-primary players are not left silent.)
- **Title:** game name, "press fire or click to start" (reserved keys — M, P,
  Escape, F3 — keep their global functions and do not start the game), top-10
  high-score table, control summary, mute indicator. No AI demo game.
- **Level select:** starting-level selector (§8.5) via UI navigation; the
  selector opens at the highest allowed level (`max(9, maxLevelReached)`) so
  returning players start where they left off, and ranges down to 1. The
  selector clamps at 1 and at the maximum (it does not wrap); left decreases the
  level, right increases it.
- **Playing:** the game. HUD: score (top left), high score (top center), lives
  and Superzapper pips, level number.
- **Game over:** "GAME OVER" over the final well for the game-over beat (§8.3);
  then high-score entry if the score qualifies, else title. The final score
  counts wherever death occurred, including during WARP. **Qualification:** the
  table holds ≤ 10 entries; a score qualifies if the table has fewer than 10
  entries or the score is ≥ the 10th entry's score; a new entry ranks above
  existing entries with equal scores.
- **High-score entry:** 3-initial arcade entry over an ordered, wrapping
  character set (space, A–Z, 0–9). UI-navigation steps (§10) rotate the active
  slot's character; each slot defaults to A; **fire** locks the active slot and
  advances to the next; the third fire confirms all three and transitions to
  TITLE. **Back** (Escape) returns to the previous slot to fix a mistake (and,
  on the first slot, is inert). Stored locally.

## 11. Presentation

### 11.1 Rendering
- HTML5 Canvas 2D, single full-viewport canvas, letterboxed 4:3 playfield,
  `devicePixelRatio`-aware backing store **capped at DPR 2**.
- Pure line rendering: strokes on black. Neon glow via layered strokes (a wide
  low-alpha pass under a thin bright core) composited with `globalComposite
  Operation = 'lighter'` (additive) so overlaps brighten rather than muddy —
  **not** `shadowBlur` (too slow).
  If the bench (§12.6) misses its budget on the reference machine, the glow
  degrades gracefully to a single bright stroke (dropping the wide pass) as a
  documented last-resort fallback rather than dropping frames — still stroked
  wireframe line art (criterion 12(a/f) hold; only the soft halo is reduced).
- **The player's current lane is rendered highlighted** (brighter rim-to-bottom
  outline on the rounded `playerLane`, the classic yellow-sector cue) — it is
  the primary aiming feedback for lane-based combat. The claw cursor itself is
  drawn at the player's smooth fractional rim position (interpolated per
  §12.3), so movement reads continuously even though gameplay resolves to the
  rounded lane.
- **Per-enemy visual identity:** each enemy type has a distinct stroked
  silhouette and a fixed canonical color independent of the level band —
  Flippers red (bowtie silhouette), Tankers purple (diamond), Spikers and their
  spikes green (spinning spiral), Fuseballs multicolor shimmer (spark ball),
  Pulsars cyan flashing toward white during telegraph (zigzag coil). Enemy
  shots are small bright dashes distinct from player shots. The Superzapper has
  a distinct full-screen effect (screen-wide flash plus an expanding line
  burst). The well/HUD band is drawn as a **dimmed, desaturated** shade of its
  band color while enemies render at full brightness, so a same-hue overlap
  (e.g. red Flippers on a red level 17–32 well) still reads clearly — silhouette
  plus brightness carry type identity even within a matching band (D35).
- 3D→2D: perspective projection of `(lane, depth)` positions; each geometry's
  authored vanishing-point offset (§4) gives the classic off-center look.
  Projection is pure math in `sim/` (§12.2); its outputs never feed back into
  sim state.
- Explosions: short line-burst particle effects; player death gets a bigger,
  distinct burst. Particle randomness uses a render-side RNG stream, separate
  from the sim RNG, so visuals never affect sim determinism.
- **Text is canvas-drawn stroke lettering** (Hershey/Vectrex-style segment data
  authored as a static module — no font files, no async font loading,
  consistent with zero-asset line art).
- Rendering interpolates entity positions between the previous and current sim
  ticks (§12.3); rim positions interpolate along the shortest arc (mod 16 on
  closed wells); entities that teleport (spawn, respawn, level change, warp
  start, and a Spiker's instantaneous bottom lane-switch, §6.3) set
  prev = curr for that tick so no slide is drawn. A flipping enemy is **not**
  interpolated as a lateral slide: the sim exposes each enemy's flip phase
  (source lane, destination lane, animation progress 0→1), and the renderer
  draws the signature lane-over-lane rotation about the shared edge from it
  (criterion 12(d)). Allocation in hot render paths is avoided by reusing
  buffers (the per-tick sim event list is fine).

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
  machine (§10) including UI-navigation step accumulation; the
  **fixed-timestep stepper as a pure function** (elapsed time in → tick count +
  interpolation alpha out, with clamping); the seeded sim RNG (e.g. mulberry32
  — every gameplay random draw goes through it); and a **stable state
  serialization/hash** covering *all* state that affects future ticks — every
  entity's kind/lane/depth/flip phase/timers, all shots, spikes, the RNG
  internal state, the pulse clock, score, lives, Superzapper state, per-type
  remaining budgets, the pulse clock, timers, and the state-machine state — the
  rule is that the hash includes **every field the sim reads on a later tick**
  (the preceding list is illustrative, not exhaustive) — so the self-consistency
  and golden-replay tests cannot pass while hiding divergence in any of them. The
  sim
  is **constructed from an injected configuration** — the full sim-affecting
  tuning surface (§8.2 anchors, §8.3 constants, §7 score values, well geometry)
  plus a seed — rather than importing the live data modules directly; the app
  passes the live modules, tests pass a frozen snapshot (§13). The sim emits a
  per-tick event list (kills, shots, pulses, state changes) consumed by
  audio/particles, keeping the sim pure.
- `persist/` — pure encode/decode/validate for the saved-data schema (§12.4).
  No browser APIs; `app/` owns the actual localStorage I/O.
- `render/` — canvas renderer: draws well/entities/particles/HUD/screens from
  sim state (plus previous-tick positions for interpolation). Never mutates sim
  state. Uses `sim/`'s projection functions.
- `audio/` — synthesized SFX triggered by sim events.
- `input/` — keyboard/mouse/pointer-lock capture, normalized into the per-tick
  input snapshot via **pure, unit-tested mapping functions**. Held keys convert
  to a per-tick lane delta (rimSpeed × tick duration). Pointer-locked mouse
  movement accrues into a **pending-delta accumulator** as events arrive
  between rAF callbacks. When a rAF frame steps N sim ticks (N may be 0, 1, or
  several — §12.3), **each** tick gets its own snapshot: the keyboard
  contribution is computed per tick, the pending mouse accumulator is drained
  **at most the per-tick rim-movement clamp per tick** with the remainder
  carried to the next tick (so mouse speed is capped and never discarded, and a
  0-tick frame simply keeps accruing). Keyboard and mouse contributions are
  summed, then the total is clamped to the per-tick rim-movement clamp (§8.3).
  No snapshot is ever reused across ticks. Also consumes
  lock-acquisition/unpause and title clicks (§5, §10).
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
  previous and current tick positions by the alpha (§11.1), so motion is smooth
  on 60/90/120/144 Hz displays alike. Entities expose prev/curr positions.
- **Determinism contract:** the sim advances only via `tick(inputSnapshot)`
  where the snapshot carries movement delta (fractional lanes, pre-clamped by
  the input layer), fire/zap button states, and UI confirm/back/quit inputs —
  nothing else; the sim never reads wall-clock time, `Math.random`, or any
  browser API. Given the same seed and the same snapshot sequence, a run is
  bit-identical on the same JS engine/build (D17). **Engine-stability
  constraint:** state-affecting sim math uses only operations ECMAScript
  specifies exactly (+ − × ÷ on doubles, comparison, rounding, integer and bit
  ops, RNG draws); it avoids `Math.sqrt` and the transcendentals (sin, cos,
  pow, exp, …), which ECMAScript leaves implementation-approximated — distance
  comparisons use squared magnitudes, and those functions are permitted only in
  projection and render-facing code whose outputs never feed back into sim
  state (enforced by a lint rule, §13). This keeps the §13 golden replay stable
  across engines/Node versions. Pauses do not exist in the snapshot stream
  (D19).
- **Seed provenance:** for normal play the app draws one seed at game start
  from a browser entropy source (`Date.now()` xored with `crypto.getRandomValues`
  where available) **outside** the sim and passes it into the sim config; the
  sim itself never reads entropy. Tests and the bench supply a fixed seed.

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
- `?bench=1` query parameter: starts from a user gesture (click/keypress, so
  the AudioContext is running during measurement) and loads a deterministic
  scenario at or above the spec's **maximum legal entity load**. Since Tanker
  splits ignore `MaxOnWell` (§6.2), the worst case is not merely MaxOnWell: at
  the level-96 cap row up to 12 threatening enemies can include enough Tankers
  that simultaneous splits briefly push the count higher. The bench pins a
  census that bounds this from above — **24 threatening enemies** (double the
  MaxOnWell cap, covering a full split wave), 7 on-well Spikers, full-height
  spikes on all 16 lanes, an active Pulsar telegraph/pulse with electrified
  lanes, 8 enemy shots, 8 player shots, and the particle system saturated at
  its cap (a fresh kill-burst spawned every tick plus a standing player-death
  burst, so the live particle count sits at the pool maximum) — so a pass
  guarantees headroom for any legal in-game state. Because Canvas-2D fill
  cost (dominated by the layered glow) scales with backing-store pixels, the
  bench also pins its render resolution: it runs at the **1440×1080 reference
  playfield at DPR 2 (a 2880×2160 backing store)** regardless of actual window
  size, so criterion 7 is measured at a fixed pixel count. (Normal play above
  the reference size relies on the DPR-2 cap and the §11.1 glow-degradation
  fallback as the safety valve.) It runs seeded and scripted for 60 s in a
  focused foreground tab and reports:
  - **work time** per frame — `performance.now()` measured around the sim
    tick(s) + render + audio dispatch inside each rAF callback. The gate uses
    the arithmetic **mean** and the **95th percentile** (nearest-rank) over all
    per-frame samples collected during the 60 s window (the first frame is
    discarded as warm-up). This is the sole pass/fail metric for §15
    criterion 7 (refresh-rate-independent).
  - Informational only (not gated — they depend on the display, incl. VRR):
    dropped-frame percentage against the detected refresh interval and raw
    rAF-interval statistics.
  Results render on screen and log to the console as JSON.
- F3 toggles a frame-time overlay during normal play.

## 13. Testing and quality

- **Unit tests (Vitest)** over the pure modules (`sim/`, `persist/`, `input/`'s
  pure mapping functions), covering at minimum:
  - Well-geometry data validation for all 16 geometries: lane/vertex counts,
    open/closed flags, no rim self-intersection (segment test), minimum
    projected rim lane width ≥ 24 px at 1440×1080 (§4).
  - Level mapping: geometry index `(N−1) mod 16` and palette index
    `floor((N−1)/16) mod 6` across levels 1–112 including every 16-level
    boundary.
  - Lane math on open/closed wells: wrapping, clamping, adjacency, the
    player-lane rule (§4, half-up rounding and closed-well `[0,16)`
    normalization) at boundaries; the winding/"clockwise" convention; the
    per-tick rim-movement clamp (no lane skipping at max delta); the
    shortest-arc rim interpolation direction (mod 16 on closed wells, incl. the
    wrap case) and the teleport prev=curr cases (§11.1).
  - Projection math invariants (depth-0 maps to rim polyline; deeper is closer
    to the vanishing point; all 16 geometries).
  - Input mapping functions: key-state → lane delta, mouse delta →
    sensitivity-scaled clamped delta; multi-tick apportionment (a frame that
    steps N ticks drains the mouse accumulator ≤ clamp per tick and carries the
    remainder; a 0-tick frame accrues; no snapshot reused; summed keyboard+mouse
    re-clamped) and the per-tick clamp holds under a large single-frame mouse
    swipe.
  - Collision (§6.7): swept segment overlap incl. the fast-crossing
    shot-vs-shot case; trim-vs-kill priority (§6.3); rim contact at depth 0;
    warp spike collision with the point Blaster; tick resolution order (shot
    saves player on the same tick — both in PLAYING and against a warp spike;
    same-tick death + wave-clear per §5); shot despawn at depth 1.
  - Spawner (§6): initial per-type budgets match the difficulty table
    (death-return may raise the remaining Flipper budget by on-well released
    Flippers); introduction-level gating; MaxOnWell excludes Spikers (on-well
    Spikers never gate spawns); SpawnInt behavior incl. first-spawn timing at
    PLAYING entry; weighted type draw and uniform lane draw through the sim
    RNG; difficulty interpolation between anchors incl. "—" cells and the
    EShot column; **monotonic difficulty** in the harder direction for every
    level step (budgets, MaxOnWell, Climb, MaxShots, EShot, SpikeH
    non-decreasing; FlipInt, FireInt, Pulse, SpawnInt non-increasing); the
    pulseCycle ≥ telegraph + pulseDuration guard (§8.3); tail behavior at levels
    200/500 (all parameters exactly equal to the level-96 anchor values).
  - Enemy fire scheduler (§6): delays drawn within [0.5, 1.5] × FireInt;
    MaxShots cap never exceeded; suppression redraws; eligibility (depth ≥
    0.2, non-rim, not mid-flip, firing types only).
  - Scoring: per-event values incl. Fuseball depth bands and zero-point rim
    self-splits; level-clear bonus at wave completion and its level-96 cap;
    bonus-life thresholds (including multiple thresholds in one wave; a
    threshold crossed by the level-clear bonus at step 8 grants a life; a
    threshold crossed by kill points on a tick the player also died nets zero,
    §6); **economy invariant:** the maximum attainable tail-wave score (full
    budgets, released Flippers, all Fuseballs at 750, capped clear bonus) is
    below the bonus-life interval (§7).
  - Superzapper: FULL/PARTIAL/EMPTY transitions, no-split Tanker kills, use-2
    nearest-the-rim target (ties: lowest lane index), no-op at EMPTY,
    consume-on-empty-well, PLAYING-state-only acceptance (rejected in
    GET_READY and WARP), persistence through death, reset at level start.
  - Death/respawn: PLAYING → GET_READY with enemies returned to budget by
    type; fire/zap ignored but movement applied during GET_READY; re-entry via
    the normal spawner; no wave completion outside PLAYING or on the death
    tick; a death with exhausted budget does **not** complete the wave (and
    same-tick kill+death completes it on resume); shots cleared on every state
    transition; spikes/score/rim position persist; level-start rim position is
    lane 8's center.
  - Per-enemy behavior: Flipper mid-well flip targeting (player-seeking with
    probability `flipSeekBias`, else random adjacent; ties clockwise; inward at
    open-well ends), depth frozen during flips, flip-timer phase (runs from
    flip end, defers past animation/freeze blocks, a skipped flip on the
    player's lane redraws a full FlipInt, and rim arrival discards any pending
    mid-well timer and starts the first rim flip after rimFlipInterval), rim
    shortest-arc chase at rimFlipInterval; flip-occupancy halves are shot-only
    (crossing a mid-flip
    rim enemy's lane is safe; completion onto the player's lane kills;
    symmetric contact with non-flipping rim residents); Tanker split
    directions incl. end-lane and rim cases, splits ignoring MaxOnWell,
    non-lethal zero-point rim self-split; Spiker build/reverse/descend at climb
    speed/instant lane-switch-at-bottom/re-emerge, growth-only spike-top rule
    (a trim landed while the Spiker is resident below the top persists — it is
    not reverted), never-despawn cycling, spike clearing at level start;
    Fuseball jitter redraw cadence and bounds, rim-crawl direction, temporary
    rim residency (descends after fuseballRimTime to a depth in [0.6, 1.0],
    then climbs), depth-banded scoring; Pulsar oscillation (never rim, never
    despawn, flips while descending), pulse timeline phases
    (quiet/telegraph/pulse, clock restart at PLAYING entry), participation
    rule (on-well at telegraph start), flip freeze incl. deferred-flip release
    at pulse end, full-duration lane lethality incl. entering mid-pulse,
    de-electrification the instant the Pulsar dies (incl. the same-tick shot
    save), shots passing through pulses.
  - Player firing: 8-shot cap, fireInterval cap, auto-fire, shot spawn depth
    (0 in play, Blaster depth in warp); movement remains active during WARP.
  - **Anti-camping check:** scripted runs where the player first moves to the
    camp lane (mid-rim on the closed well; held to an end lane on the open
    well, since the level-start position is lane 8, §5) and then holds that
    position and fire, using the first 10 seeds of a fixed sequence (not
    hand-picked — the property must hold for all). Each run must, within a
    120 s sim-time bound,
    both **fail to clear the level** (a wave needs enemies destroyed on other
    lanes, which a stationary player cannot reach — §6 flip targeting) and end
    in player death. Cover **both topologies**: a closed well with the player
    mid-rim (level 1, geometry index 0) and an **open well with the player
    clamped at an end lane** (level 9, geometry index 8 — the single-direction
    funnel worst case), both pre-Fuseball so only flip-targeting anti-camping is
    exercised. This gates `flipSeekBias` and `fireInterval`: to prevent a
    vacuous pass, the **median** time-to-death across the 10 seeds must be below
    60 s (half the bound) on each topology, so a small retune cannot slip it
    from "dies comfortably" to "barely dies." The test uses the same collision
    model as play, so it reflects the real rim-flip-landing kill window (§8.3
    fireInterval constraint).
  - Warp: the descent fairness invariant test **simulating the actual descent**
    per §9; spike death during warp decrements a life, keeps the level, does
    not replay the descent, and transitions WARP → PLAYING (lives remain) or
    WARP → GAME_OVER (last life).
  - Sim state machine: every transition in §10's sim-owned diagram (including
    GET_READY entry/exit, both WARP exits, and the Quit trigger on
    PLAYING/GET_READY/WARP → GAME_OVER) and no others (pause is app-layer and
    excluded; D19); UI-navigation step accumulation (one step
    per ±1.0 lanes, rate cap, accumulator reset on emit and cleared on
    zero-cross/state entry — a long held input then release emits no post-
    release steps); the TITLE-only click-to-confirm carve-out.
  - Starting level: selector bound max(9, maxLevelReached); maxLevelReached
    updates on PLAYING entry (max(old, N)) and not on warp death before the
    next level starts.
  - Stepper: tick counts under long/jittery/normal frame patterns; 250 ms
    clamp; alpha ∈ [0, 1); no time leak across a pause (discarded elapsed
    time).
  - Persistence: round-trip, corrupt JSON, wrong-shape data, unknown fields,
    storage-throwing adapter; maxLevelReached round-trip; high-score
    qualification predicate incl. ties and the ≤ 10 bound.
  - Tuning-constraint guards: assert across the interpolated table that every
    level satisfies FlipInt ≥ 2 × flipAnimTime, rimFlipInterval ≥ flipAnimTime,
    fireInterval > the §8.3 rim-flip-landing bound, and the per-tick rim clamp
    < 0.5 lanes — so a retune that violates a stated constraint fails CI.
- **Test-value policy:** structural and invariant tests (interpolation incl.
  "—" cells, introduction gating, monotonicity, economy, descent fairness,
  anti-camping, tuning-constraint guards) run against the **live** data module;
  value-wiring tests verify plumbing by injecting a modified config and
  asserting behavior changes (not by asserting spec-canon numbers); exact-value
  assertions live only in the frozen-parameter replay test. This keeps the
  suite stable under the playtest tuning §8.2/§8.3/§7 explicitly permit.
- **Determinism/replay test:** with a fixed seed, a **frozen snapshot of the
  entire sim-affecting tuning surface** — the §8.2 anchor table, the §8.3
  constants, the §7 score values, and the well geometry data (incl. open/closed
  flags) — checked into the test independent of the live data modules, and a
  scripted input-snapshot sequence, a multi-level sim run reproduces an exact
  expected final state: the §12.2 **state hash** plus score, level, lives,
  Superzapper state, and entity census for debuggability. Because the
  parameters are frozen, live tuning does not invalidate the golden; it is
  re-recorded only for intentional rule changes (or a reviewed engine upgrade —
  CI pins the Node version), with the diff reviewed. A companion test asserts
  self-consistency: two runs of the same seed + script produce identical
  per-tick state hashes (valid across any tuning).
- **Static checks:** `tsc --noEmit` (strict) and lint pass clean. The lint
  config includes (a) a rule (e.g. `no-restricted-properties`) forbidding
  implementation-approximated `Math` functions (sqrt, sin, cos, tan, atan2,
  pow, exp, log, …) in `sim/` outside the projection module, enforcing §12.3's
  engine-stability constraint; and (b) a rule forbidding browser/DOM globals
  (`window`, `document`, `localStorage`, `performance`, `requestAnimationFrame`,
  `Math.random`, `Date`, …) in `sim/`, `persist/`, and the pure `input/`
  mapping functions, enforcing their purity (§12.2). Scripts: `npm test`,
  `npm run typecheck`, `npm run lint`.
- **Smoke pass (per supported browser):** load title → start level 1 → clear a
  wave → warp → play until game over → reach high-score entry or title; sound
  audible; no console errors. This is the meaning of "plays" in §15
  criterion 1.
- **Manual test checklist** maintained in the implementation guide, covering
  (a) feel/audio/visual judgments and (b) **functional browser-integration
  behaviors** that unit tests cannot reach, enumerated explicitly: each
  pointer-lock loss path (Escape, blur, rejection), lock exit on leaving the
  play states, lock-request rejection hint, visibility/blur auto-pause in
  PLAYING/GET_READY/WARP (and ignored elsewhere), click-to-resume incl. the
  Chromium re-lock cooldown and the lock-held-at-pause rule, consumed clicks
  not firing, private-mode/quota storage degradation, AudioContext recovery
  after interruption — each run per supported browser (§12.5).

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
the §13 smoke pass completes in that browser.

1. `npm run build` produces a static bundle that plays in the supported browsers
   (§12.5); `npm run dev` works for development; zero runtime dependencies.
2. The §13 level-mapping and geometry-validation tests pass (16 geometries,
   16 lanes each, color-band formula across levels 1–112), and the 16→17 band
   change is visually confirmed per criterion 12(e).
3. All five enemy types exhibit the behaviors in §6, appearing at their
   introduction levels, as verified by the §13 per-enemy test areas plus the
   smoke pass.
4. The rules, state machines, and invariants of §5–§9 hold as verified by the
   corresponding §13 test areas (§13 is the canonical rule→test mapping).
   Numeric parameters may be the data module's values at acceptance time,
   provided all documented invariants (descent fairness, difficulty
   monotonicity, the scoring economy invariant, anti-camping) still pass.
5. Player controls behave per §5: keyboard movement at rimSpeed with open-well
   clamping; pointer-lock mouse control with auto-pause on lock loss,
   click-to-resume, and consumed (non-firing) lock/unpause clicks; the
   per-tick movement clamp; 8-shot cap; hold-to-auto-fire.
6. Starting-level selection offers 1..max(9, maxLevelReached); high scores,
   mute state, and maxLevelReached survive reload; corrupt or unavailable
   storage neither crashes the game nor surfaces errors to the player.
7. **Performance:** on a 2020-class x86 laptop with integrated graphics (no
   discrete GPU; record the actual machine, browser, and display in the
   acceptance notes), in the latest Chrome and Firefox — the two distinct
   engines (Edge shares Chrome's Blink/V8, so Chrome stands in for it; Safari
   is covered by the smoke pass, not this timing gate) — the `?bench=1` run
   (§12.6, maximum-legal-load census at the fixed 2880×2160 backing store)
   reports mean per-frame **work time** ≤ 12 ms and p95 ≤ 16 ms. Dropped-frame
   statistics are informational only.
8. HUD, title (reserved-key rule), level select (incl. Escape-to-title and UI
   step navigation), GET_READY, the app-layer pause overlay (manual from
   PLAYING/GET_READY/WARP; auto-pause on visibility loss, blur, and
   pointer-lock exit; ignored elsewhere; no sim time leak), game over
   (including from WARP; game-over beat), and high-score entry (qualification
   rule, character set) all function per §10.
9. Every SFX listed in §11.2 fires on its event (verified per-event from the
   checklist; distinctness confirmed once at sign-off); M mutes/unmutes
   everywhere and persists; audio recovers after context interruption.
10. `npm test`, `npm run typecheck`, and `npm run lint` (incl. the sim-math
    restriction rule) pass; every §13 test area has tests; the
    frozen-parameter replay test and the per-tick self-consistency test exist
    and pass.
11. The game letterboxes and remains playable at ≥ 1024×768 CSS pixels; smaller
    windows do not crash; the backing store respects the DPR-2 cap.
12. **Visual identity checklist** (each item verifiable from a screenshot or
    short capture): (a) the well is glowing wireframe line art on black;
    (b) the player is a claw-shaped rim cursor; (c) the player's current lane
    is highlighted; (d) Flippers visibly rotate lane-over-lane when flipping;
    (e) color bands change at 16-level boundaries; (f) all gameplay entities
    and text are stroked line art — no filled sprites, bitmaps, or font files;
    (g) wave completion triggers a down-the-well warp zoom; (h) each enemy
    type is distinguishable by silhouette and color in a single screenshot.
