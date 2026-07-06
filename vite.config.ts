import { defineConfig } from 'vite';

// base './' → relative asset paths so dist/ is portable (§12.1, decision C9).
export default defineConfig({
  base: './',
});
