import { describe, it, expect } from 'vitest';
import { greatCircle, arcsFC, nodesFC } from './arcs';

describe('greatCircle', () => {
  it('starts at `from` and ends at `to`', () => {
    const pts = greatCircle([116.4, 39.9], [-118.2, 34.0], 32);
    expect(pts[0][0]).toBeCloseTo(116.4, 3);
    expect(pts[0][1]).toBeCloseTo(39.9, 3);
    expect(pts[pts.length - 1][1]).toBeCloseTo(34.0, 3);
    expect(pts.length).toBe(33);
  });

  it('unwraps longitudes across the antimeridian (no >180° jump)', () => {
    // Tokyo → Los Angeles crosses the Pacific / antimeridian
    const pts = greatCircle([139.7, 35.7], [-118.2, 34.0], 64);
    for (let i = 1; i < pts.length; i++) {
      expect(Math.abs(pts[i][0] - pts[i - 1][0])).toBeLessThan(180);
    }
  });
});

describe('arcsFC / nodesFC', () => {
  const routes = [
    { a: 1, b: 2, n: 3, from: [116, 40] as [number, number], to: [121, 31] as [number, number] },
    { a: 2, b: 3, n: 1, from: [121, 31] as [number, number], to: [139, 35] as [number, number] },
  ];
  it('arcsFC makes one LineString per route, carrying n', () => {
    const fc = arcsFC(routes);
    expect(fc.features).toHaveLength(2);
    expect(fc.features[0].geometry.type).toBe('LineString');
    expect(fc.features[0].properties.n).toBe(3);
  });
  it('nodesFC dedupes endpoints', () => {
    const fc = nodesFC(routes);
    expect(fc.features).toHaveLength(3); // [116,40] [121,31] [139,35]
  });
});
