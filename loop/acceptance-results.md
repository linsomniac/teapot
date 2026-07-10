# Acceptance Results — Task 13.1 (§15 walk)

Recorded 2026-07-06. Automation per decisions C1/C2/C3/C8
(`loop/impl-clarifying.md`): Playwright-driven smoke + integration runs and
benches in Chrome and Firefox; human-judgment items listed at the end as
**pending human sign-off** with exact steps. The build is code-complete with
those items so recorded (C3).

## Reference machine (C2, §15.7)

- **CPU:** Intel Core i7-10750H @ 2.60 GHz (the 2020-class laptop CPU §15.7
  names)
- **GPUs present:** Intel UHD Graphics (CometLake-H GT2, i915) +
  NVIDIA GTX 1650 Ti Mobile (nouveau, not used by browsers)
- **Display:** 3840×2160 external (DP), NixOS Linux 6.18, Wayland session
  (automated runs used X11/Xvfb — see the criterion-7 notes)
- **Browsers:** Google Chrome 149.0.7827.196 · Mozilla Firefox 152.0.2
- **Node:** v24.16.0 (pinned via `.nvmrc`/`engines`, I2/C5)

## Automated §13 smoke pass — Chrome 15/15, Firefox 15/15

`node scripts/smoke.mjs <browser> <url> <outdir>` drives the real built
bundle with trusted input events (system Chrome; nix-patched Playwright
Firefox build — same engine version line as system Firefox):

load title → start level 1 → clear a wave → warp → level 2 → stand down →
3 deaths → game over → high-score entry → title; **zero console errors**;
plus: pointer lock engages on canvas click (the click does not fire),
lock-loss auto-pause, P-resume, blur auto-pause in play / ignored on menus,
pause-overlay Q quit through the full game-over flow, mute persistence
across reload, band screenshots (16 vs 17), and a throwing-localStorage boot
(clean title, no errors). One per-browser caveat: the driven Firefox session
has **no audio backend at all** (even a raw `new AudioContext().resume()`
hangs), so its context-running check is environment-skipped → pending item 3.

Screenshots: `artifacts/chromium/` and `artifacts/firefox/`
(title, gameplay-l1, warp, post-game, band-l16, band-l17).

## §15 criteria

1. **Static bundle plays** — PASS. `npm run build` → self-contained
   relative-path `dist/` (54 kB js, gzip 18 kB, zero runtime deps);
   smoke pass completes in both v1 browsers (C1); `npm run dev` serves.
2. **Level mapping + geometry validation** — PASS (unit suites: mapping
   across 1–112, 16 geometries structurally validated, ≥24 px projected
   lane width). Band change 16→17 captured: `artifacts/*/band-l16.png`
   (blue L well) vs `band-l17.png` (red circle well).
3. **All five enemy behaviors (§6)** — PASS (per-enemy §13 suites; all five
   kinds active in the golden replay's level-17 wave; smoke pass).
4. **§5–§9 rules/invariants** — PASS except the temporarily suspended
   anti-camping balance gate (three-tick cadence playtest, D47); descent
   fairness is simulated with non-vacuous control, and difficulty monotonicity
   plus the economy invariant remain active.
5. **Player controls (§5)** — PASS (input-mapping suite + driven-browser
   lock/click/pause checks; per-tick clamp, 8-shot cap, immediate tap plus
   three-tick auto-fire cadence tested).
6. **Level select bounds + persistence** — PASS (unit suites + driven
   reload checks: mute persists; storage-throwing boot is clean).
7. **Performance (§15.7/§12.6)** — SPLIT; see below.
8. **Screens + pause + state machine (§10)** — PASS (full §10 transition
   matrix incl. quit edges; driven pause/auto-pause/quit checks).
9. **SFX per event** — event-stream coverage is unit-tested (all 13
   SimEvent types fire at their triggers in the golden replay) and Chrome's
   context runs after the start gesture; audible per-SFX distinctness →
   pending item 1.
10. **Toolchain gates** — PASS. `npm run check` green (343 tests, 37
    files); purity/engine-stability lint rules verified firing (Task 12.4);
    golden replay + per-tick self-consistency pass.
11. **Letterbox ≥1024×768, DPR-2 cap** — PASS (driven at 1280×960; layout
    unit of createCanvasView; DPR cap in code path; smaller windows render
    without errors).
12. **Visual identity** — (a) glowing wireframe on black ✓ screenshot;
    (b) claw rim cursor ✓; (c) lane highlight ✓; (d) flip rotation —
    implemented as pivoted lane-over-lane rotation, confirm in motion →
    pending item 2; (e) band change ✓ band-l16/17; (f) all stroked line
    art, no sprites/fonts ✓ screenshots; (g) warp zoom ✓ warp.png (rim
    shrinking into the screen); (h) per-type silhouettes+colors ✓
    gameplay screenshots (red bowtie / purple diamond / green spiral /
    shimmer sparks / cyan coil) — final sign-off with item 2.

## Criterion 7 — bench numbers (`?bench=1`, 60 s, 2880×2160)

Gate: mean ≤ 12 ms and p95 ≤ 16 ms **work time** per engine.

| Run | mean | p95 | verdict |
|---|---|---|---|
| Chrome 149 (full glow) | **0.26 ms** | **0.40 ms** | **PASS** (huge headroom) |
| Firefox 152, automated (full glow) | 19.3 ms | 23 ms | fail |
| Firefox 152, automated, `?lowglow=1` (§11.1 fallback) | 14.0 ms | 17 ms | fail (near) |

**Firefox caveat (why this is not final):** every automatable Firefox path
on this machine renders canvas in **software** — the nix-patched Playwright
build has no GPU at all (WebGL absent), and the system Firefox driven over
X11/xdotool measured the same (~26 ms), i.e. also unaccelerated. Firefox
rasterizes canvas strokes synchronously on the content thread when
unaccelerated, so the entire raster cost lands inside the measured work
window; Chrome defers rasterization off-thread (its 0.26 ms is the
spec-defined JS-side work). The **native-Wayland GPU session** — how the
game is actually played on this machine — could not be driven without
injecting input into the live desktop, so the representative Firefox number
needs one human run → **pending item 4**. If that run also misses the
budget, §11.1's documented degradation ladder (`?lowglow=1`, 14.0/17 in the
worst-case software environment) and a spec-level decision are the next
steps.

Perf work done during this task (kept; benefits all engines): opaque
offscreen well cache doubling as the playfield clear, per-kind batched
enemy strokes, single-pass particles, letterbox-bars-only clearing, no
round caps, opaque canvases, hoisted per-frame additive state
(software-Firefox full-glow 29 → 19 ms). Dropped-frame stats are
informational only (§12.6) — the Xvfb/software compositor depresses them.

## Manual browser-integration checklist (§13) — status per browser

Automated (A) = both Chrome and Firefox via `scripts/smoke.mjs`;
Pending (P) = human sign-off item below.

- [x] (A) Pointer lock engages on canvas click in play; the click doesn't fire
- [x] (A) Lock loss auto-pauses via the events (driven `exitPointerLock`);
      real-Escape and cooldown paths → (P) item 5
- [x] (A) Auto-pause only in play states; ignored on menus
- [ ] (P) Lock retained across PLAYING↔WARP↔GET_READY; released on leaving
      the play set (code-pathed + notifyPhase-tested; confirm by feel — item 5)
- [x] (A) P resumes on keyboard; consumed clicks don't fire; accumulator
      cleared on pause/resume (unit + driven)
- [ ] (P) Rejected lock request (Chromium post-Escape cooldown) leaves the
      game paused with the hint — item 5
- [x] (A) TITLE click starts (confirm), never requests lock; gesture unlocks
      audio (Chrome; Firefox → item 3)
- [ ] (P) AudioContext recovery after OS/tab interruption — item 3
- [x] (A) Private-mode/quota degradation: boots clean, nothing persists
- [x] (A) ≥1024×768 letterboxes and plays; smaller doesn't crash
- [ ] (P) Per-SFX audible distinctness + M everywhere — item 1

## Pending human sign-off (C3) — exact steps

1. **Per-SFX distinctness (§11.2, criterion 9).** `npm run preview` → play
   one wave in each browser. Confirm each SFX fires and is audibly
   distinct: player shot, enemy shot, enemy death, player death, flip,
   Superzapper (Z), warp descent, spike hit, pulse telegraph (level 17+),
   bonus life (30 k), high-score jingle, UI move/confirm. Toggle M on the
   title, in play, and paused; reload — it must persist.
2. **Game feel + final visual sign-off (criterion 12(d,h) in motion).**
   Play a few waves; watch a Flipper flip — it must read as a
   lane-over-lane rotation about the shared edge, not a slide; confirm the
   five silhouettes/colors read at a glance; confirm overall feel.
3. **Firefox audio.** Start a game in your normal Firefox and confirm sound
   (the automated Firefox session had no audio device at all).
4. **Firefox bench on your normal (GPU/Wayland) session.** Open
   `http://localhost:4173/?bench=1` in your regular Firefox, click once,
   wait 60 s, read the on-screen mean/p95 (also logged as console JSON).
   Gate: mean ≤ 12 ms, p95 ≤ 16 ms. If it misses, retry with
   `?bench=1&lowglow=1` (the documented §11.1 fallback) and we decide next
   steps.
5. **Pointer-lock edge feel (Chrome + Firefox).** While playing with mouse:
   press Escape (should auto-pause + unlock), click to resume (should
   re-lock; in Chrome an immediate retry may show the cooldown hint), watch
   the lock survive a warp and release at game over.
