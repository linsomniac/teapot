import { defineConfig } from 'vitest/config';

// Tests are colocated `src/**/*.test.ts` (I1); cross-module suites live in
// `src/__tests__/`, which the same glob covers. The sim is browser-API-free,
// so tests run in the plain node environment (§12.2).
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
