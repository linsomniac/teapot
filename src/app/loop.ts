// rAF game loop (§12.3): reads elapsed wall time, advances the pure
// stepper, ticks the sim 0..N times, renders with the interpolation alpha.
// While paused the sim is simply not ticked — no sim time leaks (D19) —
// but frames keep rendering so the overlay stays live.

import { advance, TICK_MS } from '../sim/stepper';

export interface LoopCallbacks {
  paused(): boolean;
  simTick(): void;
  render(alpha: number, dtSec: number): void;
}

export interface LoopHandle {
  stop(): void;
  // Discard the interval since the last frame (call on pause AND resume):
  // a pause+resume that both land between rAF callbacks — e.g. around a
  // hidden tab where rAF is suspended — must not feed the paused wall time
  // into the stepper (D19: no sim time leak).
  resetClock(): void;
}

export function startLoop(cb: LoopCallbacks): LoopHandle {
  let accumMs = 0;
  let last: number | null = null;
  let rafId = 0;
  let discardNext = false;

  function frame(now: number): void {
    let elapsed = last === null ? 0 : now - last;
    last = now;
    if (discardNext) {
      discardNext = false;
      elapsed = 0;
    }
    const dtSec = Math.min(0.1, elapsed / 1000); // render-FX delta only

    if (cb.paused()) {
      // Frozen: the accumulator neither drains nor grows.
      cb.render(accumMs / TICK_MS, dtSec);
    } else {
      const r = advance(accumMs, elapsed);
      accumMs = r.accumMs;
      for (let i = 0; i < r.ticks; i++) {
        cb.simTick();
      }
      cb.render(r.alpha, dtSec);
    }
    rafId = requestAnimationFrame(frame);
  }

  rafId = requestAnimationFrame(frame);
  return {
    stop(): void {
      cancelAnimationFrame(rafId);
    },
    resetClock(): void {
      discardNext = true;
    },
  };
}
