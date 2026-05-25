#!/usr/bin/env python3
"""Build flights.json from flight.xls (sheet 2 = flights flown).

Each flight's Chinese airport names are mapped to an IATA code (curated table
below — IATA is unambiguous, unlike fuzzy name matching), then to coordinates
via the OpenFlights airport database. Each airport is snapped to its nearest
city in the app's cities dataset, so route arcs terminate exactly on the city
markers the rest of the app already draws ("飞过即去过": those cities also count
as visited).

Output: apps/web/public/data/flights.json
  { routes:[{a,b,n,from:[lng,lat],to:[lng,lat]}], cityIds:[...], stats:{...} }

Run validation first:  python3 tools/build_flights.py --check
Then write the file:    python3 tools/build_flights.py
"""
import csv
import json
import math
import os
import sys
from collections import Counter, defaultdict

import pandas as pd

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
XLS = os.path.join(ROOT, "flight.xls")
AIRPORTS_DAT = os.path.join(ROOT, "tools", ".cache", "airports.dat")
CITIES_JSON = os.path.join(ROOT, "apps", "web", "public", "data", "cities.json")
OUT = os.path.join(ROOT, "apps", "web", "public", "data", "flights.json")

# Chinese airport name (as it appears in the sheet) → IATA code.
AIRPORT_IATA = {
    "昆明长水": "KMG", "北京首都": "PEK", "北京大兴": "PKX", "北京南苑": "NAY",
    "天津滨海": "TSN", "悉尼金斯福德": "SYD", "成都双流": "CTU", "成都天府": "TFU",
    "首尔仁川国际": "ICN", "首尔金浦国际": "GMP", "上海浦东": "PVG", "上海虹桥": "SHA",
    "杭州萧山": "HGH", "洛杉矶国际": "LAX", "奥斯陆": "OSL", "曼谷素万那普国际": "BKK",
    "深圳宝安": "SZX", "武夷山": "WUS", "札幌新千岁": "CTS", "厦门高崎": "XMN",
    "武汉天河": "WUH", "大阪关西": "KIX", "奥克兰": "AKL", "上饶三清山": "SQD",
    "乌鲁木齐地窝堡": "URC", "乌鲁木齐天山": "URC", "东京成田": "NRT", "东京羽田": "HND",
    "大连周水子": "DLC", "重庆江北": "CKG", "海口美兰": "HAK", "凯夫拉维克": "KEF",
    "苏梅国际": "USM", "伦敦希思罗": "LHR", "青岛流亭": "TAO", "基督城国际": "CHC",
    "墨尔本": "MEL", "香港国际": "HKG", "吉隆坡国际": "KUL",
    "布拉格瓦茨拉夫哈维尔国际": "PRG", "中国台北桃园": "TPE", "多伦多皮尔逊": "YYZ",
    "布尔津喀纳斯": "KJI", "三明沙县": "SQJ", "揭阳潮汕": "SWA", "兰州中川": "LHW",
    "阿勒泰雪都": "AAT", "哈尔滨太平": "HRB", "喀什徕宁": "KHG", "贵阳龙洞堡": "KWE",
    "广州白云": "CAN", "沈阳桃仙": "SHE", "钏路": "KUH", "福州长乐": "FOC",
    "南宁吴圩": "NNG", "迪拜国际": "DXB", "惠灵顿国际": "WLG", "朗塞斯顿": "LST",
    "凯恩斯": "CNS", "珀斯": "PER", "楠迪国际": "NAN", "胡志明市新山一国际": "SGN",
    "暹粒国际": "REP", "新加坡樟宜": "SIN", "巴厘岛努拉莱伊": "DPS", "霍巴特": "HBA",
    "特罗姆瑟": "TOS", "斯德哥尔摩阿兰达": "ARN", "济州国际": "CJU",
    "莫斯科谢列梅捷沃": "SVO", "中国澳门": "MFM", "乌兰浩特义勒力特": "HLH",
    "伊春林都": "LDS", "丽江三义": "LJG", "西双版纳嘎洒": "JHG", "惠州平潭": "HUZ",
    "阜阳": "FUG", "大同云冈": "DAT", "松山": "MYJ", "佛山沙堤": "FUO", "皇后镇": "ZQN",
    "阿德莱德": "ADL", "黄金海岸": "OOL", "长沙黄花": "CSX", "无锡硕放": "WUX",
    "西沃古尔拉姆古兰爵士": "MRU", "名古屋中部国际": "NGO", "斯塔万格": "SVG",
    "科维恩伯格特": "KSU", "高雄国际": "KHH", "宁波栎社": "NGB", "赫尔辛基万塔": "HEL",
    "南京禄口": "NKG", "罗马菲乌米奇诺": "FCO", "巴黎戴高乐": "CDG",
}

# Airports missing from (or stale in) OpenFlights — explicit (lat, lng).
EXPLICIT = {
    "PKX": (39.5098, 116.4105),   # Beijing Daxing (opened 2019)
    "TFU": (30.3125, 104.4417),   # Chengdu Tianfu (opened 2021)
    "AAT": (47.7498, 88.0858),    # Altay
    "SQD": (28.3796, 118.1766),   # Shangrao Sanqingshan
    "HLH": (46.1933, 122.0083),   # Ulanhot Yilelite
    "KJI": (48.2239, 86.9959),    # Burqin Kanas
    "WUS": (27.7019, 118.0006),   # Wuyishan
}


def load_airports():
    by_iata = {}
    with open(AIRPORTS_DAT, encoding="utf-8") as f:
        for row in csv.reader(f):
            if len(row) < 8:
                continue
            iata, city, country, lat, lng = row[4], row[2], row[3], row[6], row[7]
            if iata and iata != "\\N":
                try:
                    by_iata[iata] = (float(lat), float(lng), city, country)
                except ValueError:
                    pass
    return by_iata


def haversine_km(a_lat, a_lng, b_lat, b_lng):
    R = 6371.0
    p1, p2 = math.radians(a_lat), math.radians(b_lat)
    dphi = math.radians(b_lat - a_lat)
    dl = math.radians(b_lng - a_lng)
    h = math.sin(dphi / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * R * math.asin(min(1, math.sqrt(h)))


def main():
    check = "--check" in sys.argv
    by_iata = load_airports()
    cities = json.load(open(CITIES_JSON, encoding="utf-8"))
    cities = [c for c in cities if c["id"] > 0]  # real GeoNames cities only

    df = pd.read_excel(XLS, sheet_name=1, header=0)
    df.columns = ["date", "airline", "flightno", "dep", "dep_t", "arr",
                  "arr_t", "dist", "ticket", "status"]

    names = sorted(set(df["dep"].dropna()) | set(df["arr"].dropna()))

    # resolve each airport name → coords + nearest city
    air = {}          # zh name → dict(iata, lat, lng, cityId, cityEn, cc, dist)
    problems = []
    for name in names:
        iata = AIRPORT_IATA.get(name)
        if not iata:
            problems.append(f"NO IATA mapping: {name}")
            continue
        if iata in EXPLICIT:
            lat, lng = EXPLICIT[iata]
            ofcity, ofco = "(explicit)", "China"  # all EXPLICIT airports are in China
        elif iata in by_iata:
            lat, lng, ofcity, ofco = by_iata[iata]
        else:
            problems.append(f"IATA {iata} not in OpenFlights and no EXPLICIT: {name}")
            continue
        # Snap to the MAJOR city the airport serves: the most prominent city
        # within 60km (airports sit in suburbs, so plain nearest = a village).
        # Fall back to the absolute nearest when nothing big is close.
        nearest, nd = None, 1e18
        near = []  # cities within 60km
        for c in cities:
            d = (c["lng"] - lng) ** 2 + (c["lat"] - lat) ** 2
            if d < nd:
                nd, nearest = d, c
            if haversine_km(lat, lng, c["lat"], c["lng"]) <= 60:
                near.append(c)
        # prefer same-country candidates so SZX→Shenzhen (not nearby Hong Kong)
        same = [c for c in near if c["country"] == ofco]
        pool = same or near
        best = max(pool, key=lambda c: c.get("prom", 0)) if pool else nearest
        dist = haversine_km(lat, lng, best["lat"], best["lng"])
        air[name] = {
            "iata": iata, "lat": lat, "lng": lng,
            "cityId": best["id"], "cityEn": best["en"], "cityZh": best.get("zh"),
            "cc": best["cc"], "country": best["country"], "ofcity": ofcity,
            "ofco": ofco, "dist": dist,
        }

    # build undirected routes with flight counts
    pair_n = Counter()
    for _, r in df.iterrows():
        d, a = r["dep"], r["arr"]
        if pd.isna(d) or pd.isna(a):
            continue
        if d not in air or a not in air:
            continue
        ai, bi = air[d]["cityId"], air[a]["cityId"]
        if ai == bi:
            continue  # same city (e.g. PEK↔PKX) — no visible arc
        key = (min(ai, bi), max(ai, bi))
        pair_n[key] += 1

    coord = {}
    for v in air.values():
        coord[v["cityId"]] = [round(v["lng"], 4), round(v["lat"], 4)]
    routes = [
        {"a": a, "b": b, "n": n, "from": coord[a], "to": coord[b]}
        for (a, b), n in sorted(pair_n.items(), key=lambda x: -x[1])
    ]
    city_ids = sorted({cid for pair in pair_n for cid in pair}
                      | {v["cityId"] for v in air.values()})

    total_km = 0
    for v_ in df["dist"].dropna():
        m = "".join(ch for ch in str(v_) if ch.isdigit())
        if m:
            total_km += int(m)

    if check:
        print(f"airports mapped: {len(air)}/{len(names)}")
        if problems:
            print("\n!! PROBLEMS:")
            for p in problems:
                print("  " + p)
        print("\nfar snaps (>120km airport→city):")
        for name, v in sorted(air.items(), key=lambda x: -x[1]["dist"]):
            if v["dist"] > 120:
                print(f"  {name:16s} {v['iata']}  OF={v['ofcity']}/{v['ofco']}  "
                      f"-> {v['cityEn']} ({v['country']})  {v['dist']:.0f}km")
        print("\nresolved sample (top airports):")
        topn = Counter()
        for _, r in df.iterrows():
            for x in (r["dep"], r["arr"]):
                if pd.notna(x):
                    topn[x] += 1
        for name, n in topn.most_common(18):
            v = air.get(name)
            if v:
                print(f"  {n:3d}  {name:16s} {v['iata']} -> {v['cityZh'] or v['cityEn']}"
                      f" / {v['cityEn']} ({v['country']})")
        # disambiguation aid
        for amb in ("松山", "乌鲁木齐天山"):
            rts = df[(df["dep"] == amb) | (df["arr"] == amb)]
            if len(rts):
                print(f"\nroutes touching {amb}:")
                for _, r in rts.iterrows():
                    print(f"  {r['dep']} -> {r['arr']}  ({r['airline']} {r['flightno']})")
        print(f"\nroutes: {len(routes)}  endpoint cities: {len(city_ids)}  "
              f"total km: {total_km}")
        return

    out = {
        "routes": routes,
        "cityIds": city_ids,
        "stats": {"flights": int(df.shape[0]), "km": total_km,
                  "airports": len(air), "cities": len(city_ids)},
    }
    json.dump(out, open(OUT, "w", encoding="utf-8"), ensure_ascii=False)
    print(f"wrote {OUT}: {len(routes)} routes, {len(city_ids)} cities, {total_km} km")


if __name__ == "__main__":
    main()
