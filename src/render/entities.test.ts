import { describe, expect, it } from 'vitest';
import { GEOMETRIES } from '../sim/data/geometries';
import { TUNING } from '../sim/data/tuning';
import { project, type Viewport } from '../sim/projection';
import type { Enemy } from '../sim/types';
import { drawEnemies } from './entities';

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

function flipperAtRim(lane: number): Enemy {
  const depth = TUNING.flipperHalfHeight;
  return {
    kind: 'flipper',
    lane,
    depth,
    prevLane: lane,
    prevDepth: depth,
    flip: null,
    flipTimer: 1,
    fireTimer: 1,
  };
}

describe('Flipper render geometry', () => {
  it('puts both rim-facing corners on the local rim chord on every lane and well', () => {
    const vp: Viewport = { width: 1440, height: 1080 };
    for (const geometry of GEOMETRIES) {
      for (let lane = 0; lane < 16; lane++) {
        const moves: Point[] = [];
        drawEnemies(
          recordingContext(moves),
          [flipperAtRim(lane)],
          geometry,
          vp,
          1,
          { frame: 0, pulsarFlash: 0 },
          true,
          TUNING.flipperHalfHeight,
        );

        // pathBowtie begins each half at its rim-facing corner. The affine
        // chord/lane basis should place those at the two lane boundaries,
        // even where the lane ray meets the rim at an oblique angle.
        expect(moves).toHaveLength(2);
        const left = project(lane - 0.5, 0, geometry, vp);
        const right = project(lane + 0.5, 0, geometry, vp);
        expect(
          moves[0]!.x,
          `geometry ${geometry.index}, lane ${lane}, left x`,
        ).toBeCloseTo(left.x, 8);
        expect(
          moves[0]!.y,
          `geometry ${geometry.index}, lane ${lane}, left y`,
        ).toBeCloseTo(left.y, 8);
        expect(
          moves[1]!.x,
          `geometry ${geometry.index}, lane ${lane}, right x`,
        ).toBeCloseTo(right.x, 8);
        expect(
          moves[1]!.y,
          `geometry ${geometry.index}, lane ${lane}, right y`,
        ).toBeCloseTo(right.y, 8);
      }
    }
  });
});
