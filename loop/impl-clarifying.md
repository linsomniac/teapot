# Implementation-Guide Clarifying Questions & Decisions

Questions raised while reviewing `loop/implementation-guide.md` against
`loop/specification.md` and `loop/description` (per `loop/prompt`), before the
build begins. Questions with an obviously good recommendation were selected
directly; the rest were put to the developer on 2026-07-06 and answered.
Where a decision changed a document, the change location is noted.

Numbering is C1… to stay distinct from spec decisions (D1…) and
implementation decisions (I1…).

---

## Asked of the developer (answered 2026-07-06)

### C1. Browser acceptance matrix: v1 narrows to Chrome + Firefox

- **Question:** The spec required a smoke pass in Chrome, Firefox, Edge, and
  Safari, but the Linux build machine has only Chrome and Firefox (no Safari on
  Linux; Edge not installed). How should Edge/Safari acceptance be handled?
- **Options:** defer Edge/Safari to manual later verification; add a Playwright
  WebKit proxy; narrow v1 support to Chrome + Firefox; block until all four pass.
- **Decision (developer):** **Narrow v1 to Chrome + Firefox.** Edge/Safari are
  expected to work (Edge shares Blink/V8; Safari-defensive code paths — AudioContext
  'interrupted' recovery, pointer-lock fallbacks — are kept) but are not
  acceptance-gated; verifying them is future work.
- **Changes:** spec §12.5 (supported browsers), §14.11 (new non-goal),
  §15.7 (parenthetical); guide Global Constraints, Task 13.1, manual
  browser-integration checklist header; checklist item 13.1.

### C2. Performance-gate reference machine: this dev machine

- **Question:** §15.7 requires the `?bench=1` gate on a "2020-class x86 laptop
  with integrated graphics, recorded in the acceptance notes". Should the build
  machine (Intel i7-10750H — a 2020 laptop CPU) serve as the recorded reference?
- **Decision (developer):** **Yes.** Run the bench in Chrome + Firefox on this
  machine and record the actual CPU, GPU in use, browser, and display in
  `loop/acceptance-results.md`. If a discrete GPU turns out to be active during
  the run, note it — the spec's recorded-machine clause covers this.
- **Changes:** spec §15.7; guide Task 13.1; checklist item 13.1.

### C3. Human-judgment acceptance items: automate + pending sign-off

- **Question:** Task 13.1 includes items an autonomous builder can only
  partially verify (per-SFX audible distinctness, game feel, final visual
  sign-off). Do they block the project's Definition of Done?
- **Decision (developer):** **Automate what a driven browser can verify**
  (scripted smoke run, §15.12 screenshots via Playwright) and record the
  remaining judgment items in `loop/acceptance-results.md` as **"pending human
  sign-off"** with exact reproduction steps. The build is code-complete with
  those items so recorded; the developer does a final play/listen pass at
  leisure.
- **Changes:** guide Task 13.1 + manual-checklist header; checklist item 13.1.

---

## Selected directly (obvious recommendation)

### C4. ESLint 9 flat config (`eslint.config.js`)

The guide named `.eslintrc.cjs`, which is the legacy config format; ESLint 9
(current in 2026) uses flat config by default and `typescript-eslint` v8+ is
built around it. Chose **flat config** so the toolchain is stock-modern; both
purity rules (`no-restricted-properties` / `no-restricted-globals`, Task 0.1)
express identically in flat config. Changed: guide repo layout + Task 0.1;
checklist item 0.1.

### C5. Node pin moved 22 → 24

I2 pinned Node 22 ("active LTS as of 2026"), but Node 24 is the current active
LTS and is what the build machine runs (v24.16.0); obtaining 22 on this NixOS
host is avoidable friction with no benefit — the golden replay needs *a* pinned
engine, not a specific one, and it will be recorded on 24. `.nvmrc` = `24`,
`engines.node` = `>=24`. Changed: guide repo layout + Tasks 0.1/12.2; checklist
item 0.1; I2 amended in `loop/impl-decisions`.

### C6. Commits go directly to `master`

The repo's only branch is `master` and `loop/prompt-3-build` says to commit at
every step. No feature branches or PRs during the build; one conventional
commit per completed task (I12) straight to `master`. Changed: guide
Conventions ("Commits").

### C7. No hosted CI for now; `npm run check` is the gate

The repo has **no git remote**, so a GitHub-Actions-style workflow would be
dead configuration. The quality gate is local: `npm run check` (typecheck +
lint + test) per task DoD, with the Node version pinned by `.nvmrc`/`engines`
(C5). If the repo later gains a remote, add a CI workflow running
`npm run check` on the pinned Node. Changed: spec §13 (golden-replay
re-record note); guide Task 12.2.

### C8. Playwright is permitted as dev-only tooling

The zero-dependency rule (§12.1) is about the *runtime* bundle; dev-only
dependencies are explicitly fine. Playwright (Chromium + Firefox already cached
on this machine) may be added as a devDependency to drive the automated smoke
runs and capture the §15.12 screenshots (C3). Nothing from it ships in `dist/`.
Changed: guide Task 13.1 (referenced).

### C9. Minor guide clarification: Vite `base: './'`

The "relative asset paths so `dist/` is portable" requirement (§12.1) is
achieved with Vite's `base: './'`; spelled out in guide Task 0.1 so the
implementer doesn't rediscover it at acceptance time.

---

## Review sweeps

- **Sweep 1 (2026-07-06):** full read of description, spec, guide, checklist,
  and both decision/rejection logs; environment facts verified on the build
  machine (installed browsers, Node version, CPU, git remote). Findings: C1–C9
  above. Gameplay-rule ambiguities: none found — the spec/guide review rounds
  (D1–D45, I1–I16) have pinned behavior tightly; remaining implementer freedoms
  (exact geometry vertex coordinates, palette/enemy hex color values, stroke
  silhouette shapes, SFX synthesis parameters, particle pool cap value) are
  **deliberate** per spec §1/§4/§11 ("final shapes are the implementer's
  choice provided each passes validation") and are validated by tests or the
  C3 sign-off process rather than by pinning numbers here.
- **Sweep 2 (2026-07-06, post-edit):** re-read the guide end-to-end with C1–C9
  applied, checking cross-references (§ numbers, task IDs, decision IDs) and
  that no instruction still assumes four browsers, Node 22, `.eslintrc.cjs`,
  or hosted CI. No further points needing clarification found. **Loop closed.**
- The subsequent per-item checklist review continues the C-numbering in
  `loop/impl-checklist.md` (C10: menus act on the edge-triggered `confirm`
  intent).
