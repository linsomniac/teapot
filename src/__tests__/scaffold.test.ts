import { describe, expect, it } from 'vitest';

// Trivial test so `vitest run` exits 0 on the empty project (Task 0.1).
describe('scaffold', () => {
  it('runs the test toolchain', () => {
    expect(1 + 1).toBe(2);
  });
});
