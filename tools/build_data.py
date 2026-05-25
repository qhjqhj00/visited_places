#!/usr/bin/env python3
"""Build the city dataset for the visited_places dashboard.

Inputs (downloaded to .cache/ if missing):
  - GeoNames cities5000.zip   -> cities5000.txt   (pop > 5,000, ~63k places; ~39k
    after subdivision dedup — chosen over cities15000 so tourist towns like
    Queenstown NZ (~10k) are present, matching the basemap's label density)
  - GeoNames countryInfo.txt  -> country code -> name + continent

Outputs (apps/web/public/data/):
  - cities.json    list of {id,en,zh,country,cc,cont,lat,lng,pop,prom,fcode}
  - neighbors.json {id: [neighbor_id, ...]}  top-12 by prominence*exp(-dist/120) within 350km

name_zh comes from the language-tagged alternateNamesV2 file (Simplified Mandarin,
preferring short everyday names over verbose official forms), falling back to the
untagged-alternatenames `pick_zh` heuristic when no tagged zh name exists.
"""
import io
import json
import math
import os
import re
import sys
import urllib.request
import zipfile
from collections import defaultdict

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CACHE = os.path.join(ROOT, "tools", ".cache")
OUT = os.path.join(ROOT, "apps", "web", "public", "data")

CITIES_URL = "https://download.geonames.org/export/dump/cities5000.zip"
CITIES_TXT = "cities5000.txt"  # member inside the zip (pop > 5,000, ~55k places)
COUNTRY_URL = "https://download.geonames.org/export/dump/countryInfo.txt"
# Language-tagged alternate names — the accurate source for Chinese city names
# (the cities5000 alternatenames column is untagged, hence the weak pick_zh below).
ALT_URL = "https://download.geonames.org/export/dump/alternateNamesV2.zip"
ALT_TXT = "alternateNamesV2.txt"
# Simplified Mandarin only — skip zh-Hant (traditional) and dialects (yue/wuu).
ZH_LANGS = {"zh-hans": 3, "zh-cn": 2, "zh": 2, "cmn": 1}

HAN = re.compile(r"[㐀-䶿一-鿿豈-﫿]")
KANA = re.compile(r"[぀-ヿㇰ-ㇿ]")
HANGUL = re.compile(r"[가-힣ᄀ-ᇿ㄰-㆏]")
LATIN = re.compile(r"[A-Za-z]")

CONTINENTS = {
    "AF": "Africa", "AS": "Asia", "EU": "Europe", "NA": "North America",
    "SA": "South America", "OC": "Oceania", "AN": "Antarctica",
}
CAPITAL_BONUS = {"PPLC": 3.0, "PPLA": 0.8, "PPLA2": 0.4, "PPLA3": 0.2}
# Real cities/towns only. Excludes PPLX (city subdivision e.g. "Paris 15e",
# Kyoto wards), PPLL/PPLQ/PPLW/PPLH/PPLR/PPLS (localities, abandoned, historical).
KEEP_FCODES = {"PPL", "PPLA", "PPLA2", "PPLA3", "PPLA4", "PPLA5", "PPLC", "PPLG"}


def fetch(url, dest):
    if os.path.exists(dest):
        return dest
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    print(f"  downloading {url}")
    with urllib.request.urlopen(url, timeout=120) as r:
        data = r.read()
    with open(dest, "wb") as f:
        f.write(data)
    return dest


def load_cities_txt():
    zpath = fetch(CITIES_URL, os.path.join(CACHE, os.path.basename(CITIES_URL)))
    with zipfile.ZipFile(zpath) as z:
        with z.open(CITIES_TXT) as f:
            return io.TextIOWrapper(f, encoding="utf-8").read().splitlines()


def load_countries():
    path = fetch(COUNTRY_URL, os.path.join(CACHE, "countryInfo.txt"))
    out = {}
    with open(path, encoding="utf-8") as f:
        for line in f:
            if line.startswith("#") or not line.strip():
                continue
            c = line.split("\t")
            if len(c) < 9:
                continue
            iso, numeric, name, cont = c[0], c[2], c[4], c[8]
            out[iso] = (name, CONTINENTS.get(cont, cont), numeric)
    return out


def load_zh_names(geonameids):
    """geonameid -> best Simplified-Mandarin name from alternateNamesV2 (streamed
    from the zip). Ranks by preferred/short flags + language weight, prefers 2-4
    char Han names, and skips kana/hangul and historic entries."""
    zpath = fetch(ALT_URL, os.path.join(CACHE, os.path.basename(ALT_URL)))
    best = {}  # gid -> (score, name)
    with zipfile.ZipFile(zpath) as z, z.open(ALT_TXT) as raw:
        for line in io.TextIOWrapper(raw, encoding="utf-8"):
            f = line.rstrip("\n").split("\t")
            if len(f) < 4:
                continue
            try:
                gid = int(f[1])
            except ValueError:
                continue
            if gid not in geonameids:
                continue
            lw = ZH_LANGS.get(f[2].lower())
            if lw is None:
                continue
            name = f[3].strip()
            if not name or not HAN.search(name) or KANA.search(name) or HANGUL.search(name):
                continue
            pref = len(f) > 4 and f[4] == "1"
            short = len(f) > 5 and f[5] == "1"
            hist = len(f) > 7 and f[7] == "1"
            # Favor a concise everyday name over the verbose official form: the
            # "preferred" name is often e.g. 首尔特别市 / 奧克蘭都會區, while the
            # short flag / a 2-4 char length gives 首尔 / 奥克兰.
            n = len(name)
            score = lw + (3 if short else 0) + (2 if pref else 0)
            score += 2 if 2 <= n <= 4 else (-1 if n == 5 else -3 if n >= 6 else 0)
            if hist:
                score -= 4
            if best.get(gid, (-99,))[0] < score:
                best[gid] = (score, name)
    return {gid: nm for gid, (_, nm) in best.items()}


def pick_zh(alt_field):
    """Best Han-majority alternate name, excluding kana/hangul names. Prefers a
    2-4 char name (real city names) over 1-char abbreviations (沪=Shanghai,
    京=Beijing) and over very long descriptive forms."""
    cands = []
    for raw in alt_field.split(","):
        c = raw.strip()
        if not c or not HAN.search(c):
            continue
        if KANA.search(c) or HANGUL.search(c):
            continue
        # require Han to dominate (drop romaji-mixed entries like "X jiao qu")
        if len(HAN.findall(c)) < len(LATIN.findall(c)):
            continue
        cands.append(c)
    if not cands:
        return None
    # rank: length-1 worst, length>4 next, otherwise prefer shorter
    return min(cands, key=lambda c: (len(c) < 2, len(c) > 4, len(c)))


def prominence(pop, fcode):
    p = math.log10(pop + 1) if pop > 0 else 0.0
    return round(p + CAPITAL_BONUS.get(fcode, 0.0), 3)


def haversine(lat1, lng1, lat2, lng2):
    r = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lng2 - lng1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(min(1.0, math.sqrt(a)))


def drop_subdivisions(cities, ratio=3.0):
    """Remove districts/wards/arrondissements/boroughs that are really parts of
    a bigger neighbouring city. Two passes:
      1. same adm1+adm2 with a >=ratio-bigger city within 25km (districts,
         arrondissements, central wards -> e.g. Pudong, "Paris 15e", Kamigyō-ku)
      2. within 12km of any >=ratio-bigger city in the same adm1 (catches
         own-county boroughs/wards -> e.g. Brooklyn, Tokyo wards; NYC itself is
         a plain PPL so we can't require the parent be a capital/seat)
    The tight 12km in pass 2 keeps genuinely separate cities (Yokohama, Oakland)."""
    drop = set()

    by_a2 = defaultdict(list)
    by_a1 = defaultdict(list)
    for i, c in enumerate(cities):
        if c["_a2"]:
            by_a2[(c["cc"], c["_a1"], c["_a2"])].append(i)
        by_a1[(c["cc"], c["_a1"])].append(i)

    def collapse(groups, max_km, parent_seats_only):
        for idxs in groups.values():
            if len(idxs) < 2:
                continue
            for a in idxs:
                ca = cities[a]
                for b in idxs:
                    cb = cities[b]
                    if parent_seats_only and cb["fcode"] not in ("PPLC", "PPLA"):
                        continue
                    if a != b and cb["pop"] >= ratio * max(ca["pop"], 1) and \
                            haversine(ca["lat"], ca["lng"], cb["lat"], cb["lng"]) <= max_km:
                        drop.add(a)
                        break

    collapse(by_a2, 25.0, parent_seats_only=False)
    collapse(by_a1, 12.0, parent_seats_only=False)
    return [c for i, c in enumerate(cities) if i not in drop], len(drop)


def build_neighbors(cities, radius_km=350.0, k=12, decay=120.0):
    grid = defaultdict(list)
    for i, c in enumerate(cities):
        grid[(int(math.floor(c["lat"])), int(math.floor(c["lng"])))].append(i)

    neighbors = {}
    for i, c in enumerate(cities):
        lat0, lng0 = c["lat"], c["lng"]
        clat, clng = int(math.floor(lat0)), int(math.floor(lng0))
        cand = set()
        for di in range(-4, 5):
            lat_cell = clat + di
            coslat = max(0.2, math.cos(math.radians(lat_cell)))
            dlng = min(180, int(math.ceil(4.0 / coslat)))
            for dj in range(-dlng, dlng + 1):
                lng_cell = ((clng + dj + 180) % 360) - 180
                cand.update(grid.get((lat_cell, lng_cell), ()))
        scored = []
        for j in cand:
            if j == i:
                continue
            o = cities[j]
            d = haversine(lat0, lng0, o["lat"], o["lng"])
            if d > radius_km:
                continue
            scored.append((o["prom"] * math.exp(-d / decay), o["id"]))
        scored.sort(reverse=True)
        neighbors[c["id"]] = [cid for _, cid in scored[:k]]
        if (i + 1) % 5000 == 0:
            print(f"  neighbors {i + 1}/{len(cities)}")
    return neighbors


def main():
    print("Loading countryInfo ...")
    countries = load_countries()
    print(f"  {len(countries)} countries")

    print("Loading cities15000 ...")
    rows = load_cities_txt()
    cities = []
    for line in rows:
        c = line.split("\t")
        if len(c) < 19 or c[6] != "P" or c[7] not in KEEP_FCODES:
            continue
        try:
            lat, lng = round(float(c[4]), 4), round(float(c[5]), 4)
            pop = int(c[14] or 0)
        except ValueError:
            continue
        cc = c[8]
        cname, cont, ccn = countries.get(cc, (cc, "", ""))
        fcode = c[7]
        cities.append({
            "id": int(c[0]),
            "en": c[1],
            "zh": pick_zh(c[3]),
            "country": cname,
            "cc": cc,
            "ccn": ccn,
            "cont": cont,
            "lat": lat,
            "lng": lng,
            "pop": pop,
            "prom": prominence(pop, fcode),
            "fcode": fcode,
            "adm1": c[10],  # GeoNames first-level admin code = province/state identity
            "_a1": c[10],
            "_a2": c[11],
        })
    print(f"  {len(cities)} cities; {sum(1 for c in cities if c['zh'])} have zh names")

    cities, dropped = drop_subdivisions(cities)
    print(f"  dropped {dropped} subdivisions -> {len(cities)} cities")
    for c in cities:
        del c["_a1"], c["_a2"]

    print("Loading Chinese names from alternateNamesV2 ...")
    zhmap = load_zh_names({c["id"] for c in cities})
    upgraded = 0
    for c in cities:
        nm = zhmap.get(c["id"])
        if nm and nm != c["zh"]:
            c["zh"] = nm
            upgraded += 1
    print(f"  {len(zhmap)} cities have zh from alternateNamesV2 "
          f"({upgraded} changed); {sum(1 for c in cities if c['zh'])} total have zh")

    print("Building neighbors ...")
    neighbors = build_neighbors(cities)

    os.makedirs(OUT, exist_ok=True)
    with open(os.path.join(OUT, "cities.json"), "w", encoding="utf-8") as f:
        json.dump(cities, f, ensure_ascii=False, separators=(",", ":"))
    with open(os.path.join(OUT, "neighbors.json"), "w", encoding="utf-8") as f:
        json.dump(neighbors, f, ensure_ascii=False, separators=(",", ":"))

    cpath = os.path.join(OUT, "cities.json")
    npath = os.path.join(OUT, "neighbors.json")
    print(f"Wrote {cpath} ({os.path.getsize(cpath) / 1e6:.1f} MB)")
    print(f"Wrote {npath} ({os.path.getsize(npath) / 1e6:.1f} MB)")


if __name__ == "__main__":
    sys.exit(main())
