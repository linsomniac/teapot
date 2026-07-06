# Table of Contents — `loop/` planning documents

The "Teapot" project: a browser-based game inspired by the arcade game Tempest.
Planning docs live here; the game itself lives at the repository root (D12).

## Core project documents

- **`description`** — The project's anchor: the one-sentence goal ("build a
  browser-based game inspired by the arcade game Tempest") every other document
  must not drift from.
- **`specification.md`** — The approved behavioral specification (status:
  APPROVED, codex + internal review clear at medium+). Canonical source for
  every rule and number: the well and lane math (§4), player (§5), enemies and
  tick order (§6), scoring (§7), difficulty model (§8), warp (§9), state
  machine and screens (§10), presentation (§11), technical design and
  determinism (§12), test contract (§13), non-goals (§14), and acceptance
  criteria (§15). When any other document disagrees with it, the spec wins.
- **`implementation-guide.md`** — Task-by-task build plan for agentic workers:
  13 phases (scaffold → pure sim → enemies → progression → state machine →
  persistence → render → audio → input → app wiring → integration →
  acceptance), each task with files, produced interfaces, TDD test list, and a
  Definition of Done. Cites the spec (§N) for all behavior.
- **`checklist.md`** — Status tracker for the guide's tasks (`[ ]`/`[~]`/`[x]`,
  checked off in the same commit that completes a task), plus a §13
  test-area → task traceability index. This is the build loop's work queue.

## Decision and review logs

- **`spec-decisions`** — Decisions D1–D45 made while writing the specification
  (scope, stack, gameplay rulings, review-round refinements), each with options
  considered and rationale.
- **`spec-rejected-concerns.md`** — Review concerns against the spec that were
  considered and rejected (R1–R5), with rationale; reviewers must read it and
  not re-raise them.
- **`impl-decisions`** — Implementation-level decisions I1–I16 made while
  writing the guide/checklist (test layout, Node pin, config injection, RNG,
  state-machine shape, commit granularity, …). I2's Node pin is amended by C5.
- **`impl-review-rejected.md`** — Rejected review concerns against the guide/
  checklist (none yet); also collects concerns rejected during the build phase.
- **`impl-clarifying.md`** — Pre-build clarifying questions on the
  implementation guide and their resolutions (C1–C9): v1 browsers narrowed to
  Chrome+Firefox, the bench reference machine, human-sign-off handling, ESLint
  flat config, Node 24, direct-to-master commits, no hosted CI, Playwright as
  dev tooling, Vite base path. Includes the review-sweep log.
- **`impl-checklist.md`** — Per-item review of every checklist entry against
  spec + guide + description, with clarifications found (C10: menu states act
  on the edge-triggered `confirm` intent) and per-item OK notes on deliberate
  implementer freedoms.

## Process prompts

- **`prompt`** — Copy of `description` (the original project request).
- **`prompt-1-design`** — Instructions for the design phase: create the
  specification, then the implementation guide + checklist, looping through
  codex + internal review (with clarifying questions and decision/rejection
  logs) until no medium+ concerns remain.
- **`prompt-2-implguide`** — Instructions for the pre-build clarification pass:
  review the guide, then every checklist item, asking/answering clarifying
  questions (producing `impl-clarifying.md`, `impl-checklist.md`, and this
  `toc.md`).
- **`prompt-3-build`** — Instructions for the build loop: implement the next
  checklist item, review with codex + internal review until clean, commit, and
  repeat until the checklist is done.

## Created during the build

- **`acceptance-results.md`** — (Does not exist yet.) Task 13.1 records the §15
  acceptance walk here: smoke-pass results per browser, `?bench=1` numbers +
  machine/display, the manual browser-integration and visual-identity
  checklists, and any items pending human sign-off (decision C3).
