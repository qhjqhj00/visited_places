#!/usr/bin/env python3
"""Build apps/web/public/data/admin1.json — admin-1 (province/state/prefecture)
polygons for *every* country, so drilling into any country fills its visited
subdivisions (not just the 9 large countries Natural Earth's 50m set covers).

Source: Natural Earth 10m admin-1 (full world, ~4600 features, 40MB). We only
keep geometry (regions.ts discards all properties at load) and aggressively
simplify + round coordinates, since the polygons are rendered as flat fills at
country zoom — coastline detail is wasted bytes there.

Pipeline: download (cached) -> Douglas-Peucker simplify each ring -> round
coords -> drop degenerate rings -> write. iso_a2 is kept purely for debugging.

Usage: python tools/build_admin1.py
"""
import json
import math
import os
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
CACHE = os.path.join(HERE, ".cache")
SRC = os.path.join(CACHE, "ne_10m_admin1.geojson")
OUT = os.path.join(HERE, "..", "apps", "web", "public", "data", "admin1.json")
URL = "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_admin_1_states_provinces.geojson"

# Simplification tolerance in degrees (~0.01° ≈ 1.1 km). Small enough that a city
# sitting near a province border still tests inside after simplification, large
# enough to cut the point count by ~10x. Coords are then rounded to DECIMALS.
# Both are env-overridable for tuning the size/accuracy trade-off.
EPS = float(os.environ.get("ADMIN1_EPS", "0.015"))
DECIMALS = int(os.environ.get("ADMIN1_DEC", "4"))


def _perp_dist(p, a, b):
    """Perpendicular distance from point p to segment a–b (planar, deg space)."""
    (px, py), (ax, ay), (bx, by) = p, a, b
    dx, dy = bx - ax, by - ay
    if dx == 0 and dy == 0:
        return math.hypot(px - ax, py - ay)
    t = ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)
    t = max(0.0, min(1.0, t))
    return math.hypot(px - (ax + t * dx), py - (ay + t * dy))


def _dp(pts, eps):
    """Iterative Douglas-Peucker; returns the kept subset of `pts`."""
    n = len(pts)
    if n < 3:
        return pts[:]
    keep = [False] * n
    keep[0] = keep[n - 1] = True
    stack = [(0, n - 1)]
    while stack:
        lo, hi = stack.pop()
        dmax, idx = 0.0, -1
        for i in range(lo + 1, hi):
            d = _perp_dist(pts[i], pts[lo], pts[hi])
            if d > dmax:
                dmax, idx = d, i
        if idx != -1 and dmax > eps:
            keep[idx] = True
            stack.append((lo, idx))
            stack.append((idx, hi))
    return [pts[i] for i in range(n) if keep[i]]


def _ring(ring):
    """Simplify a closed ring; keep it closed. Returns None if degenerate."""
    closed = len(ring) > 1 and ring[0] == ring[-1]
    pts = ring[:-1] if closed else ring[:]
    simp = _dp(pts, EPS)
    r = math.pow(10, DECIMALS)
    simp = [[round(x * r) / r, round(y * r) / r] for x, y in simp]
    # drop consecutive dupes introduced by rounding
    out = [simp[0]] if simp else []
    for p in simp[1:]:
        if p != out[-1]:
            out.append(p)
    if len(out) < 3:
        return None
    out.append(out[0])  # re-close
    return out


def _simplify_geom(geom):
    t = geom["type"]
    if t == "Polygon":
        rings = [r for r in (_ring(rg) for rg in geom["coordinates"]) if r]
        return {"type": "Polygon", "coordinates": rings} if rings else None
    if t == "MultiPolygon":
        polys = []
        for poly in geom["coordinates"]:
            rings = [r for r in (_ring(rg) for rg in poly) if r]
            if rings:
                polys.append(rings)
        return {"type": "MultiPolygon", "coordinates": polys} if polys else None
    return None


def main():
    os.makedirs(CACHE, exist_ok=True)
    if not os.path.exists(SRC):
        print("downloading", URL)
        urllib.request.urlretrieve(URL, SRC)
    src = json.load(open(SRC))
    feats = []
    for f in src["features"]:
        g = _simplify_geom(f["geometry"])
        if not g:
            continue
        feats.append(
            {
                "type": "Feature",
                "geometry": g,
                "properties": {"iso_a2": f["properties"].get("iso_a2")},
            }
        )
    out = {"type": "FeatureCollection", "features": feats}
    with open(OUT, "w") as fh:
        json.dump(out, fh, separators=(",", ":"))
    size = os.path.getsize(OUT)
    countries = len({f["properties"]["iso_a2"] for f in feats})
    print(f"wrote {len(feats)} features / {countries} countries -> {OUT} ({size/1e6:.2f} MB)")


if __name__ == "__main__":
    main()
