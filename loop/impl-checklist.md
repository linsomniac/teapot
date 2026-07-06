# Checklist Review — Clarifying Questions & Decisions

Per-item review of `loop/checklist.md` against `loop/specification.md`,
`loop/implementation-guide.md`, and `loop/description` (per `loop/prompt`),
looking for clarification an implementer would need. Companion to
`loop/impl-clarifying.md` (guide-level review; decisions C1–C9 there also
resolve checklist items 0.1 and 13.1). Decisions found during *this* pass
continue the C-numbering (C10…).

## Decisions from this pass

### C10. Menu states act on the edge-triggered `confirm` intent, not `fire`

- **Found at:** item 6.1 (high-score entry: "fire locks+advances").
- **Question:** the `InputSnapshot` carries both a held `fire` boolean and an
  edge-triggered `confirm` intent; spec §10 says menu "confirm" *is* the fire
  button (space/Enter). Which field does the sim read in
  TITLE/LEVEL_SELECT/HIGH_SCORE_ENTRY? Reading the held `fire` would
  repeat-advance through all three initials on one press and would ignore Enter.
- **Decision (selected — obvious):** menu states read only the one-per-press
  `snapshot.confirm` edge; `snapshot.fire` is the held gameplay button, read
  only in PLAYING/WARP. Space and Enter both map to `confirm` in the input
  layer (§10/§12.3); no spec change needed.
- **Changes:** guide Task 6.1; checklist item 6.1.

## Per-item review

Legend: **OK** = fully specified by guide + spec citations; no clarification
needed. Notes record where a superficially open point is deliberately the
implementer's choice or is resolved elsewhere.

- **0.1** — OK after C4 (ESLint 9 flat config), C5 (Node 24), C9 (Vite
  `base: './'`). All resolved in `loop/impl-clarifying.md`.
- **1.1** — OK. Exact type names/fields pinned in the guide ("Produces").
- **1.2** — OK. mulberry32 source given verbatim in the guide.
- **1.3** — OK. Note: the checklist's "author live data modules" short form is
  governed by the guide's finer rule (author each module here *or* in the task
  that first consumes it, per I4; all four must exist by Task 3.1's
  `makeLiveConfig`). Not a conflict — guide wins on detail.
- **1.4** — OK. Rounding, wrap/clamp, tie-break, and the 1–112 mapping tests are
  all pinned; `interpRim` living in `sim/well.ts` and being called by the
  renderer is intentional (render may import sim; never the reverse).
- **1.5** — OK. Exact vertex coordinates are deliberately the implementer's
  choice (spec §4: "final shapes are the implementer's choice provided each
  passes validation"); the structural test defines done. Winding sign worked
  example is in the guide (avoids the classic shoelace sign error).
- **1.6** — OK. `FAR_SCALE = 0.15`, reference space (1440×1080, origin center),
  fractional-lane sampling rule, and the ≥24 px width check are all pinned.
- **2.1** — OK. Test vectors given numerically.
- **2.2** — OK. Interval formula given; boundary inclusivity pinned.
- **2.3** — OK. Which columns round, `—`-cell normalization (I15), flat tail,
  monotonic directions, and the interpolated-row guards are all enumerated.
- **3.1** — OK after I14 (InitialSave injection). The once-per-game vs per-level
  reset split, PLAYING-entry resets (spawnTimer/pulseClock), hash-as-you-go
  rule, and `createSimFromState` bench entry are all pinned.
- **3.2** — OK. prev/curr snapshot timing rule and the single step-3
  nearest-target resolution pass (built in 4.1) are explicit.
- **3.3** — OK. Band boundaries pinned at exactly 1/3 and 2/3; double-threshold
  and death-tick cases specified with anti-vacuous assertions.
- **4.1** — OK. Flip targeting, occupancy halves, timer phases, same-tick save +
  co-located control, never-pierce, climb-mul reference test — all pinned.
- **4.2** — OK. Split geometry (opposite adjacent lanes, progress 0, FlipInt
  from completion), end-lane stagger (flipAnimTime/2), MaxOnWell exemption,
  0-point non-lethal rim self-split — all pinned.
- **4.3** — OK. Growth-only top, trim-vs-kill priority, one-per-lane exclusion,
  teleport prev=lane on bottom switch, trim scoring — all pinned.
- **4.4** — OK. Jitter bounds/cadence, rim residency (crawl → timed descend to
  [0.6,1.0] target), symmetric contact, banded scoring — all pinned.
- **4.5** — OK. Oscillation bounds, pulse timeline, participation rule, flip
  freeze + deferred release, full-duration lethality, instant de-electrify,
  same-tick save + control — all pinned.
- **4.6** — OK. Eligibility list, delay draw, suppress-redraw, shot-vs-shot,
  never-pierce, same-tick save + control — all pinned.
- **4.7** — OK. The weighted-draw test design (fixed non-decremented budget,
  single-draw distribution) is specified to avoid the budget-forced-ratio trap;
  spawn teleport convention asserted here.
- **5.1** — OK. Completion gating (PLAYING-only, not on death tick,
  never-despawners must die), shot cancellation both sides, bonus + re-check.
- **5.2** — OK. Fairness test is simulation-based with a fire-disabled lethal
  control; maxLevelReached timing (WARP→PLAYING entry, not on GAME_OVER) pinned.
- **5.3** — OK. Budget-return by type (may exceed authored), persist set,
  GET_READY input rules, same-tick kill+death completing on resume.
- **5.4** — OK. All six edge behaviors enumerated (incl. empty-well consume,
  PLAYING-only acceptance, nearest-rim tie-break via occupancy-half lane).
- **6.1** — OK after C10 (edge-triggered `confirm`; see above). Selector
  accumulator semantics (reset on emit, clear on zero-cross/state entry,
  open at `max(9, maxLevelReached)`) fully pinned.
- **6.2** — OK. "Every §10 edge and no others" is a closed, testable set.
- **7.1** — OK. Reuses sim/highscore (no duplicate logic); decode-never-throws,
  forward-compat, truncation all pinned.
- **8.1** — OK. Glow technique (additive layered strokes, not shadowBlur),
  DPR-2 cap, `?lowglow=1` manual flag, and the exact glyph set are pinned.
  Verification is the §15 checklist + smoke pass by design (phase header).
- **8.2** — OK. Fractional claw vs rounded-lane highlight distinction is
  explicit; teleport/tween rules defined in sim tasks.
- **8.3** — OK. Colors are named (red/purple/green/multicolor/cyan→white) with
  exact hex values deliberately the implementer's choice (§11.1/D35 pins
  *distinctness* + the dimmed-band rule, verified visually per C3).
- **8.4** — OK. Screen inventory and warp-zoom behavior enumerated; any new
  glyph loops back to the 8.1 font module (guide note).
- **9.1** — OK. The SFX list and lifecycle rules are pinned; synthesis
  parameters are deliberately free (audible distinctness is a C3
  pending-human-sign-off item, backed by the per-SFX manual checklist).
- **10.1** — OK. Apportionment semantics (drain ≤ clamp, carry, 0-tick accrual,
  sum-then-reclamp, no snapshot reuse) fully pinned (D43).
- **10.2** — OK. Binding table + Escape single-owner rule + Q translation are
  explicit; verified via the manual browser-integration checklist (13.1).
- **11.1** — OK. Throw-through degradation pinned with a throwing-mock test.
- **11.2** — OK. Includes the startup mute-state init and immediate persist on
  M (both directions of the persistence covered).
- **11.3** — OK. Census composition, census-hold semantics, fixed 2880×2160
  backing store, metric definitions (mean/p95 nearest-rank, drop frame 1)
  all pinned. `particlePoolCap`'s exact value is a tunable in the config
  (guide suggests 256), not a spec constant — intentional.
- **12.1** — OK. Audit list mirrors §12.2; 12.3 is the automated backstop.
- **12.2** — OK after C5/C7 (Node pin wording). Level-17 start via injected
  `initialSave` + scripted select, ≥1 wave clear, event-stream coverage — all
  pinned.
- **12.3** — OK. Programmatic field enumeration with the excluded render-only
  field list spelled out; benchMode census-hold test with control.
- **12.4** — OK. Fixture-based prove-the-rules-fire procedure is explicit.
- **12.5** — OK. Seeds pinned (1..10), camp lanes pinned per topology, medians
  bounded; tuning knobs to iterate (flipSeekBias/fireInterval) named, with
  their floors/ceilings guarded elsewhere (validateConfig D40 bound; descent
  fairness 5.2).
- **13.1** — OK after C1 (Chrome+Firefox), C2 (this machine as bench
  reference), C3 (automate + pending human sign-off), C8 (Playwright dev-only).

## Review sweeps

- **Sweep 1 (2026-07-06):** all 40 items reviewed against spec + guide +
  description as above. Findings: C10 (fixed) plus confirmations that items
  0.1/13.1 are resolved by C1–C9. The checklist's traceability map (§13 test
  area → task) was spot-checked against the guide's task tests — consistent.
- **Sweep 2 (2026-07-06, post-edit):** re-read checklist end-to-end with C10
  applied; every item now has an unambiguous Definition of Done reachable from
  its guide task + spec citations, and no item depends on an unstated
  environment assumption (browsers, Node, hardware, CI — all pinned by C1–C9).
  No further points needing clarification. **Loop closed.**
