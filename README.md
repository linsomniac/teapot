# Teapot

A browser-based arcade shooter inspired by the arcade classic
[Tempest](https://en.wikipedia.org/wiki/Tempest_(video_game)): a neon-vector
well, flipping enemies, a Superzapper, warp descents, endless escalating
levels, and local high scores.

**Play it:** https://linsomniac.github.io/teapot/

## Controls

| Input | Action |
|---|---|
| ← / → or A / D | Move along the rim |
| Mouse (click to lock) | Move; left button fires, right button zaps |
| Space | Fire (hold to auto-fire); confirm in menus |
| Z | Superzapper (two uses per level) |
| Escape | Back in menus; pause during play |
| P | Pause / resume |
| M | Mute (persists) |
| Q | Quit to title (from the pause overlay) |
| F3 | Frame-time overlay |

## Development

TypeScript (strict) + Vite + Vitest, HTML5 Canvas 2D, Web Audio — zero
runtime dependencies. The pure simulation (`src/sim/`, deterministic,
browser-API-free, lint-enforced) is separated from the I/O shell
(`src/render/`, `src/audio/`, `src/input/`, `src/app/`).

```sh
npm install
npm run dev      # dev server
npm run check    # typecheck + lint + 343 tests
npm run build    # static dist/
```

`?bench=1` runs the §12.6 performance benchmark; `?lowglow=1` drops the
glow's halo pass. Design documents (specification, implementation guide,
decision logs, acceptance results) live in `loop/`.
