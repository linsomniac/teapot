import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

// AIDEV-NOTE: sim-purity + engine-stability lint gates (§12.2/§12.3, I16).
// Active from Phase 1 so they guard sim code as it is written; Task 12.4 adds
// a fixture proving they fire. Task 13.1's acceptance pass re-checks them.

// Modules that must stay browser-API-free and deterministic (§12.2).
const PURE_PATHS = [
  'src/sim/**/*.ts',
  'src/persist/**/*.ts',
  'src/input/map.ts',
];

const PURITY_GLOBALS = [
  'window',
  'document',
  'localStorage',
  'performance',
  'requestAnimationFrame',
  'Date',
].map((name) => ({
  name,
  message: `Pure module: '${name}' is a browser/nondeterminism API (spec §12.2/§12.3).`,
}));

const PURITY_PROPS = [
  {
    object: 'Math',
    property: 'random',
    message:
      'Every gameplay draw goes through the injected sim RNG (spec §12.2).',
  },
];

const ENGINE_STABLE_MATH_PROPS = [
  'sqrt',
  'sin',
  'cos',
  'tan',
  'atan2',
  'pow',
  'exp',
  'log',
].map((property) => ({
  object: 'Math',
  property,
  message:
    'Engine-stable sim math only — no transcendentals outside src/sim/projection.ts (spec §12.3).',
}));

export default tseslint.config(
  { ignores: ['dist/**', 'node_modules/**', '.remember/**', 'loop/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  prettier,
  {
    // Underscore-prefixed params mark deliberately-unused arguments (e.g. the
    // tick-pipeline step placeholders that later tasks fill in).
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
  {
    // Purity: no browser APIs / wall clock / entropy in sim, persist, input map.
    files: PURE_PATHS,
    rules: {
      'no-restricted-globals': ['error', ...PURITY_GLOBALS],
      'no-restricted-properties': ['error', ...PURITY_PROPS],
    },
  },
  {
    // Engine-stable math in sim/ (projection.ts is the one transcendental site).
    // AIDEV-NOTE: flat-config rule entries REPLACE (not merge) earlier matches,
    // so this block must re-include PURITY_PROPS or sim files would lose the
    // Math.random ban.
    files: ['src/sim/**/*.ts'],
    ignores: ['src/sim/projection.ts'],
    rules: {
      'no-restricted-properties': [
        'error',
        ...PURITY_PROPS,
        ...ENGINE_STABLE_MATH_PROPS,
      ],
    },
  },
);
