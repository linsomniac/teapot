// Placeholder bootstrap (Task 0.1): grab the canvas and fill it black.
// Replaced by the real app wiring in Phase 11 (src/app/app.ts).
const canvas = document.querySelector<HTMLCanvasElement>('#game');
if (!canvas) {
  throw new Error('Canvas #game not found');
}
const ctx = canvas.getContext('2d');
if (!ctx) {
  throw new Error('2D canvas context unavailable');
}
canvas.width = canvas.clientWidth;
canvas.height = canvas.clientHeight;
ctx.fillStyle = '#000';
ctx.fillRect(0, 0, canvas.width, canvas.height);
