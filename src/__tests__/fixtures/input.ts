// Shared InputSnapshot factory for sim tests.

import type { InputSnapshot } from '../../sim/types';

export function makeInput(over: Partial<InputSnapshot> = {}): InputSnapshot {
  return {
    move: 0,
    fire: false,
    zap: false,
    confirm: false,
    back: false,
    quit: false,
    ...over,
  };
}
