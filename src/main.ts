// Bootstrap: the only DOM entry point (§12.1).
import { startApp } from './app/app';

const canvas = document.querySelector<HTMLCanvasElement>('#game');
if (!canvas) {
  throw new Error('Canvas #game not found');
}
startApp(canvas);
