import { describe, expect, it } from 'vitest';
import { makeLiveConfig } from '../__tests__/fixtures/liveConfig';
import { createSim } from '../sim/sim';
import type { PlayfieldRect } from './canvas';
import { bandColors } from './palette';
import { drawTitle } from './screens';

interface Point {
  x: number;
  y: number;
}

function recordingContext(moves: Point[]): CanvasRenderingContext2D {
  const context = {
    strokeStyle: '',
    globalAlpha: 1,
    lineWidth: 1,
    beginPath(): void {},
    moveTo(x: number, y: number): void {
      moves.push({ x, y });
    },
    lineTo(): void {},
    stroke(): void {},
  };
  return context as unknown as CanvasRenderingContext2D;
}

const PLAYFIELD: PlayfieldRect = { x: 0, y: 0, width: 800, height: 600 };

function highScoreFieldStarts(score: number, level: number): [number, number] {
  const state = createSim(makeLiveConfig(), 1, {
    maxLevelReached: 1,
    highScores: [{ initials: 'AAA', score, level }],
  }).getState();
  const moves: Point[] = [];
  drawTitle(
    recordingContext(moves),
    PLAYFIELD,
    state,
    bandColors(0),
    false,
    true,
  );

  const rowTop = PLAYFIELD.height * 0.42;
  const rowBottom = rowTop + PLAYFIELD.height * 0.022;
  const rowMoves = moves.filter((p) => p.y >= rowTop && p.y <= rowBottom);

  // Each A starts two polylines, so the score begins after six moves.
  return [rowMoves[0]!.x, rowMoves[6]!.x];
}

describe('title high-score table', () => {
  it('keeps initials and score columns fixed across digit counts', () => {
    const shortFields = highScoreFieldStarts(1234, 99);
    const longFields = highScoreFieldStarts(123456, 100);

    expect(shortFields).toEqual(longFields);
  });
});
