import { describe, expect, it } from 'vitest';
import { GEOMETRIES } from './data/geometries';
import { FAR_SCALE, project, type Viewport } from './projection';
import type { Vec2 } from './config';

// §13 projection area. NOTE: test code lives under src/sim/ and is NOT the
// projection module, so it must stay transcendental-free — distances below
// are compared SQUARED.

const REF_VP: Viewport = { width: 1440, height: 1080 };

function distSq(a: Vec2, b: Vec2): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}

function vanishingOnScreen(gIndex: number, vp: Viewport): Vec2 {
  const g = GEOMETRIES[gIndex]!;
  const s = Math.min(vp.width / 1440, vp.height / 1080);
  return {
    x: vp.width / 2 + g.vanishing.x * s,
    y: vp.height / 2 + g.vanishing.y * s,
  };
}

describe('project (§11.1)', () => {
  it('depth 0 maps every integer lane onto the rim polyline midpoint', () => {
    for (const g of GEOMETRIES) {
      const n = g.rim.length;
      for (let lane = 0; lane < 16; lane++) {
        const a = g.rim[lane]!;
        const b = g.rim[(lane + 1) % n]!;
        const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        const p = project(lane, 0, g, REF_VP);
        expect(p.x).toBeCloseTo(720 + mid.x, 9);
        expect(p.y).toBeCloseTo(540 + mid.y, 9);
      }
    }
  });

  it('increasing depth moves monotonically toward the vanishing point (all 16)', () => {
    const depths = [0, 0.25, 0.5, 0.75, 1];
    for (const g of GEOMETRIES) {
      const van = vanishingOnScreen(g.index, REF_VP);
      for (const lane of [0, 7, 15]) {
        let prev = Infinity;
        for (const d of depths) {
          const cur = distSq(project(lane, d, g, REF_VP), van);
          expect(
            cur,
            `geometry ${g.index} lane ${lane} depth ${d}`,
          ).toBeLessThan(prev);
          prev = cur;
        }
      }
    }
  });

  it('the far ring keeps the 16 depth-1 spawn points separable', () => {
    for (const g of GEOMETRIES) {
      const pts = Array.from({ length: 16 }, (_, lane) =>
        project(lane, 1, g, REF_VP),
      );
      for (let i = 0; i < 16; i++) {
        for (let j = i + 1; j < 16; j++) {
          expect(
            distSq(pts[i]!, pts[j]!),
            `geometry ${g.index}: ${i} vs ${j}`,
          ).toBeGreaterThan(0);
        }
      }
    }
  });

  it('is pure: identical inputs give identical outputs', () => {
    const g = GEOMETRIES[4]!;
    const p1 = project(3.25, 0.6, g, REF_VP);
    const p2 = project(3.25, 0.6, g, REF_VP);
    expect(p1).toEqual(p2);
  });

  it('fractional lanes sample the rim polyline at index rimPos + 0.5', () => {
    const g = GEOMETRIES[0]!; // circle, closed
    // lane 2.5 → polyline index 3.0 → exactly rim vertex 3.
    const p = project(2.5, 0, g, REF_VP);
    expect(p.x).toBeCloseTo(720 + g.rim[3]!.x, 9);
    expect(p.y).toBeCloseTo(540 + g.rim[3]!.y, 9);
    // closed wrap: lane 15.5 → index 16 → wraps to vertex 0.
    const w = project(15.5, 0, g, REF_VP);
    expect(w.x).toBeCloseTo(720 + g.rim[0]!.x, 9);
    expect(w.y).toBeCloseTo(540 + g.rim[0]!.y, 9);
  });

  it('open wells clamp fractional sampling at the rim ends', () => {
    const g = GEOMETRIES[8]!; // flat line, open (17 vertices)
    const pEnd = project(15.5, 0, g, REF_VP); // index 16 = last vertex
    expect(pEnd.x).toBeCloseTo(720 + g.rim[16]!.x, 9);
    const pStart = project(-0.5, 0, g, REF_VP); // index 0 = first vertex
    expect(pStart.x).toBeCloseTo(720 + g.rim[0]!.x, 9);
  });

  it('scales uniformly to the viewport (half-size viewport → half offsets)', () => {
    const g = GEOMETRIES[1]!;
    const half: Viewport = { width: 720, height: 540 };
    const ref = project(5, 0.3, g, REF_VP);
    const scaled = project(5, 0.3, g, half);
    expect(scaled.x - 360).toBeCloseTo((ref.x - 720) / 2, 9);
    expect(scaled.y - 270).toBeCloseTo((ref.y - 540) / 2, 9);
  });

  it('FAR_SCALE is 15% (the far ring is a ring, not a point)', () => {
    expect(FAR_SCALE).toBe(0.15);
    expect(FAR_SCALE).toBeGreaterThan(0);
  });
});
