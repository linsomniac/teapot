# Rejected Specification Review Concerns

Concerns raised during review of `loop/specification.md` that were considered and
**rejected**, with rationale. Reviewers (human, codex, or internal): read this file
before reviewing and do not re-raise these concerns unless new information changes
the picture.

## R1. "Spike death during warp descent should replay the descent (original behavior)"

- **Raised by:** internal review round 1 (drift dimension, low severity).
- **Rejected because:** deliberate inspired-by deviation, now recorded as decision
  D16 and spec §9/§14.1. Replaying the descent punishes a single mistake twice and
  adds a state-machine special case for marginal fidelity value. The life is still
  lost; the level was already legitimately cleared.

## R2. "Fuseballs should ride lane edges like the original"

- **Raised by:** internal review round 1 (drift dimension, low severity).
- **Partially accepted:** the enemy is renamed Fuzzball → **Fuseball** (fidelity).
- **Rejected part:** edge-riding movement. It would introduce a second positioning
  system (edges vs. lanes) for a single enemy, complicating collision, projection,
  and tests. V1 keeps lane-based movement with erratic speed (decision D15,
  non-goal §14.7).

## R3. "Spike-trim scoring (1 point/hit) enables point farming"

- **Raised by:** anticipated follow-on to the enemy-shot-farming finding (round 1,
  gameplay dimension); pre-emptively documented.
- **Rejected because:** trim points are rate-bounded by player fire rate
  (under ~6 pts/s at fireInterval 0.18 s vs. thousands/minute from normal play),
  require standing on a spiked lane, and the wave cannot stall indefinitely for farming
  purposes without the player forgoing all meaningful scoring. Enemy-shot farming
  was the real exploit and was fixed by setting enemy-shot points to 0 (D14).

## R4. "Make enemy-shot interception non-guaranteed (shots sometimes pass the player's stream)"

- **Raised by:** internal review round 3 (gameplay dimension), as sub-suggestion
  (b) of the hold-fire-camping finding.
- **Rejected because:** in 1-D lane combat a continuous stream of swept-collision
  shots necessarily intercepts anything on the lane — that is inherent to the
  geometry, matches the original (player shots destroy enemy shots), and making
  interception probabilistic would feel like random unfair deaths. Camping is
  instead broken by forcing rotation: partly-random flip targeting sends a
  share of enemies to the rim on other lanes (D39), the fireInterval was
  corrected to account for the collision extents (D40), and a §13 anti-camping
  test on both a closed and an open well asserts a stationary hold-fire run
  fails to clear and dies. The other sub-suggestions (fire-cadence change,
  anti-camping test) were accepted.

## R5. "§12.6 references a nonexistent acceptance criterion 15.7"

- **Raised by:** codex review round 3.
- **Rejected as factually incorrect:** §15 is a numbered list and item 7 is the
  performance criterion, with explicit thresholds and environment. The
  cross-reference wording was nevertheless clarified to "§15 criterion 7" to
  prevent the misread.
