# Rejected Implementation-Guide / Checklist Review Concerns

Concerns raised during review of `loop/implementation-guide.md` and
`loop/checklist.md` that were considered and **rejected**, with rationale.
Reviewers (human, codex, internal): read this before reviewing and do not
re-raise these unless new information changes the picture.

(This file also collects concerns rejected during the build phase per
`loop/prompt-3-build` / decision I13.)

## B1. "Rebuild the tracked dist bundle" (codex, Task 12.5 review, 2026-07-06)

Codex asked for `dist/` to be regenerated and committed after the Task 12.5
tuning change so "the shipped runtime matches the live config". **Rejected:
`dist/` is not tracked** — it is in `.gitignore` (Task 0.1) and
`git ls-files dist/` is empty; the stale bundle codex saw was a local build
artifact. Nothing ships from the repo; `npm run build` regenerates `dist/`
from source on demand (§12.1). The local artifact was refreshed anyway.
