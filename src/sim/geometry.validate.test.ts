import { describe, expect, it } from 'vitest';
import { GEOMETRIES } from './data/geometries';
import { geometryIndexForLevel } from './levels';
import { laneWidthAtRim } from './projection';
import type { Vec2 } from './config';

// §13 geometry-validation area, structural half (no projection — the
// projected-lane-width ≥ 24 px check is added by Task 1.6 below in this file).

type Seg = [Vec2, Vec2];

function edgesOf(rim: Vec2[], closed: boolean): Seg[] {
  const out: Seg[] = [];
  const count = closed ? rim.length : rim.length - 1;
  for (let i = 0; i < count; i++) {
    out.push([rim[i]!, rim[(i + 1) % rim.length]!]);
  }
  return out;
}

// Shoelace signed area. In +y-DOWN screen space a CLOCKWISE-on-screen polygon
// has S > 0 (worked example in the guide: TL→TR→BR→BL gives +4).
function shoelace(rim: Vec2[]): number {
  let s = 0;
  for (let i = 0; i < rim.length; i++) {
    const a = rim[i]!;
    const b = rim[(i + 1) % rim.length]!;
    s += a.x * b.y - b.x * a.y;
  }
  return s / 2;
}

function cross(o: Vec2, a: Vec2, b: Vec2): number {
  return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
}

function onSegment(p: Vec2, q: Vec2, r: Vec2): boolean {
  return (
    Math.min(p.x, r.x) <= q.x &&
    q.x <= Math.max(p.x, r.x) &&
    Math.min(p.y, r.y) <= q.y &&
    q.y <= Math.max(p.y, r.y)
  );
}

function segmentsIntersect(p1: Vec2, p2: Vec2, p3: Vec2, p4: Vec2): boolean {
  const d1 = cross(p3, p4, p1);
  const d2 = cross(p3, p4, p2);
  const d3 = cross(p1, p2, p3);
  const d4 = cross(p1, p2, p4);
  if (d1 > 0 !== d2 > 0 && d3 > 0 !== d4 > 0 && d1 !== 0 && d2 !== 0)
    return true;
  if (d1 === 0 && onSegment(p3, p1, p4)) return true;
  if (d2 === 0 && onSegment(p3, p2, p4)) return true;
  if (d3 === 0 && onSegment(p1, p3, p2)) return true;
  if (d4 === 0 && onSegment(p1, p4, p2)) return true;
  return false;
}

function sameVec(a: Vec2, b: Vec2): boolean {
  return a.x === b.x && a.y === b.y;
}

describe('well geometry structural validation (§4)', () => {
  it('shoelace sign convention sanity: TL→TR→BR→BL is +4 (clockwise, +y down)', () => {
    const square: Vec2[] = [
      { x: -1, y: -1 },
      { x: 1, y: -1 },
      { x: 1, y: 1 },
      { x: -1, y: 1 },
    ];
    expect(shoelace(square)).toBe(4);
  });

  it('has exactly 16 geometries with matching index fields', () => {
    expect(GEOMETRIES).toHaveLength(16);
    GEOMETRIES.forEach((g, i) => expect(g.index).toBe(i));
  });

  it('indices 0–7 are closed (16 rim vertices), 8–15 open (17)', () => {
    for (const g of GEOMETRIES) {
      expect(g.closed).toBe(g.index < 8);
      expect(g.rim).toHaveLength(g.closed ? 16 : 17);
    }
  });

  it('every geometry has exactly 16 lanes', () => {
    for (const g of GEOMETRIES) {
      expect(edgesOf(g.rim, g.closed)).toHaveLength(16);
    }
  });

  it('level → geometry cross-check: levels 1–8 closed, 9–16 open, repeating', () => {
    for (let level = 1; level <= 112; level++) {
      const g = GEOMETRIES[geometryIndexForLevel(level)]!;
      expect(g.closed).toBe((level - 1) % 16 < 8);
    }
  });

  it('closed wells wind clockwise on screen (shoelace S > 0 in +y-down space)', () => {
    for (const g of GEOMETRIES.filter((g) => g.closed)) {
      expect(shoelace(g.rim), `geometry ${g.index}`).toBeGreaterThan(0);
    }
  });

  it('open wells read left-to-right: non-decreasing x along the rim', () => {
    for (const g of GEOMETRIES.filter((g) => !g.closed)) {
      for (let i = 1; i < g.rim.length; i++) {
        expect(
          g.rim[i]!.x,
          `geometry ${g.index} vertex ${i}`,
        ).toBeGreaterThanOrEqual(g.rim[i - 1]!.x);
      }
    }
  });

  it('no rim self-intersection (segment-pair cross test)', () => {
    for (const g of GEOMETRIES) {
      const segs = edgesOf(g.rim, g.closed);
      for (let i = 0; i < segs.length; i++) {
        for (let j = i + 1; j < segs.length; j++) {
          const [a1, a2] = segs[i]!;
          const [b1, b2] = segs[j]!;
          // Skip pairs sharing an endpoint (adjacent edges, incl. the wrap pair).
          if (
            sameVec(a1, b1) ||
            sameVec(a1, b2) ||
            sameVec(a2, b1) ||
            sameVec(a2, b2)
          ) {
            continue;
          }
          expect(
            segmentsIntersect(a1, a2, b1, b2),
            `geometry ${g.index}: edges ${i} and ${j} intersect`,
          ).toBe(false);
        }
      }
    }
  });

  it('every geometry carries a finite vanishing offset', () => {
    for (const g of GEOMETRIES) {
      expect(Number.isFinite(g.vanishing.x)).toBe(true);
      expect(Number.isFinite(g.vanishing.y)).toBe(true);
    }
  });

  it('rim vertices are distinct points (no duplicates)', () => {
    for (const g of GEOMETRIES) {
      const seen = new Set(g.rim.map((v) => `${v.x},${v.y}`));
      expect(seen.size, `geometry ${g.index}`).toBe(g.rim.length);
    }
  });

  // Task 1.6 extension — completes the §4 geometry-validation area.
  it('min projected rim lane width ≥ 24 px at 1440×1080 (all 16)', () => {
    for (const g of GEOMETRIES) {
      expect(
        laneWidthAtRim(g, { width: 1440, height: 1080 }),
        `geometry ${g.index}`,
      ).toBeGreaterThanOrEqual(24);
    }
  });
});
