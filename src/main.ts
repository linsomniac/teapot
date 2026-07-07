// Bootstrap: the only DOM entry point (§12.1).
import { startApp } from './app/app';
import { runBench } from './app/bench';

const canvas = document.querySelector<HTMLCanvasElement>('#game');
if (!canvas) {
  throw new Error('Canvas #game not found');
}

if (new URLSearchParams(window.location.search).get('bench') === '1') {
  runBench(canvas); // §12.6 benchmark harness
} else {
  startApp(canvas);
}
