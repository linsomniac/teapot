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
  (~10 pts/s vs. thousands/minute from normal play), require standing on a spiked
  lane, and the wave cannot stall indefinitely for farming purposes without the
  player forgoing all meaningful scoring. Enemy-shot farming was the real exploit
  and was fixed by setting enemy-shot points to 0 (D14).
