"""
GreenMatch - veri hazırlama (NYC High Volume FHV, Ekim 2025)

Bütün ayı satır grupları halinde okur ve şunları üretir:
  * Aylık veri kalitesi ve talep özetleri
  * Manhattan bölgeleri arası seyahat süresi / mesafe matrisi
    (Ekim hafta içi günleri, simülasyon penceresi saatleri, simülasyon günü hariç)
  * Simülasyon günü için talep listesi (request_datetime sırasıyla)
  * Manhattan bölge çizimleri (SVG koordinatları)

Çıktı: data/sim_data.json
Çalıştırma: python prepare_data.py
"""
import json
import math
from pathlib import Path

import numpy as np
import pandas as pd
import pyarrow.parquet as pq
import shapefile  # pyshp

DATA = Path(__file__).parent / "data"
PARQUET = DATA / "fhvhv_tripdata_2025-10.parquet"
LOOKUP = DATA / "taxi_zone_lookup.csv"
SHP = DATA / "taxi_zones" / "taxi_zones" / "taxi_zones.shp"
OUT = DATA / "sim_data.json"

BOROUGH = "Manhattan"
SIM_DAY = pd.Timestamp("2025-10-15")  # Çarşamba
WIN_START_H, WIN_END_H = 7, 11        # 07:00-11:00
MONTH_START, MONTH_END = pd.Timestamp("2025-10-01"), pd.Timestamp("2025-11-01")
COLS = ["hvfhs_license_num", "request_datetime", "on_scene_datetime", "pickup_datetime",
        "dropoff_datetime", "PULocationID", "DOLocationID", "trip_miles", "trip_time",
        "shared_request_flag", "shared_match_flag"]

lookup = pd.read_csv(LOOKUP)
zone_ids = sorted(lookup.loc[lookup.Borough == BOROUGH, "LocationID"].tolist())
zone_set = set(zone_ids)
zone_names = lookup.set_index("LocationID")["Zone"].to_dict()

# ---------------------------------------------------------------- aylık tarama
q = dict(total=0, outside_month=0, shared=0, unknown_zone=0, bad_time=0,
         bad_miles=0, request_after_pickup=0, kept=0)
daily = np.zeros(31, dtype=np.int64)
hourly_wd = np.zeros(24, dtype=np.int64)
hourly_we = np.zeros(24, dtype=np.int64)
company = {}
pu_counts = np.zeros(266, dtype=np.int64)
od_parts, req_parts, wait_parts = [], [], []

pf = pq.ParquetFile(PARQUET)
for rg in range(pf.num_row_groups):
    df = pf.read_row_group(rg, columns=COLS).to_pandas()
    q["total"] += len(df)

    in_month = (df.request_datetime >= MONTH_START) & (df.request_datetime < MONTH_END)
    q["outside_month"] += int((~in_month).sum())
    df = df[in_month]

    shared = (df.shared_request_flag == "Y") | (df.shared_match_flag == "Y")
    q["shared"] += int(shared.sum())
    df = df[~shared]

    unknown = (df.PULocationID > 263) | (df.DOLocationID > 263)  # 264/265 = bilinmeyen
    q["unknown_zone"] += int(unknown.sum())
    df = df[~unknown]

    bad_time = (df.trip_time <= 0) | (df.trip_time > 4 * 3600)
    q["bad_time"] += int(bad_time.sum())
    df = df[~bad_time]

    bad_miles = (df.trip_miles <= 0) | (df.trip_miles > 100)
    q["bad_miles"] += int(bad_miles.sum())
    df = df[~bad_miles]

    q["request_after_pickup"] += int((df.request_datetime > df.pickup_datetime).sum())
    q["kept"] += len(df)

    rq = df.request_datetime
    daily += np.bincount(rq.dt.day - 1, minlength=31)[:31]
    wd = rq.dt.dayofweek < 5
    hourly_wd += np.bincount(rq[wd].dt.hour, minlength=24)
    hourly_we += np.bincount(rq[~wd].dt.hour, minlength=24)
    pu_counts += np.bincount(df.PULocationID, minlength=266)
    for k, v in df.hvfhs_license_num.value_counts().items():
        company[k] = company.get(k, 0) + int(v)

    # Manhattan içi, pencere saatlerinde
    inside = df.PULocationID.isin(zone_set) & df.DOLocationID.isin(zone_set)
    in_win = (rq.dt.hour >= WIN_START_H) & (rq.dt.hour < WIN_END_H)
    m = df[inside & in_win & wd]
    is_sim_day = m.request_datetime.dt.normalize() == SIM_DAY

    od_parts.append(m.loc[~is_sim_day, ["PULocationID", "DOLocationID", "trip_time", "trip_miles"]])
    s = m.loc[is_sim_day]
    req_parts.append(pd.DataFrame({
        "t": (s.request_datetime - (SIM_DAY + pd.Timedelta(hours=WIN_START_H))).dt.total_seconds().astype(int),
        "pu": s.PULocationID, "do": s.DOLocationID,
        "trip_time": s.trip_time, "miles": s.trip_miles,
        "real_wait": (s.on_scene_datetime - s.request_datetime).dt.total_seconds().astype(int),
    }))
    wait_parts.append((m.on_scene_datetime - m.request_datetime).dt.total_seconds())
    print(f"row group {rg + 1}/{pf.num_row_groups}  kept so far {q['kept']:,}")

# ------------------------------------------------------- seyahat süresi matrisi
od = pd.concat(od_parts)
g = od.groupby(["PULocationID", "DOLocationID"]).agg(
    t=("trip_time", "median"), d=("trip_miles", "median"), n=("trip_time", "size"))
g = g[g.n >= 5]  # az gözlemli çiftlere güvenme
speed_mph = (od.trip_miles.sum() / (od.trip_time.sum() / 3600))

# ------------------------------------------------------------- bölge geometrisi
sf = shapefile.Reader(str(SHP))
fields = [f[0] for f in sf.fields[1:]]
shapes = {}
for sr in sf.iterShapeRecords():
    rec = dict(zip(fields, sr.record))
    lid = int(rec["LocationID"])
    if lid in zone_set:
        shapes.setdefault(lid, []).append(sr.shape)

all_pts = np.vstack([np.array(s.points) for ss in shapes.values() for s in ss])
minx, miny = all_pts.min(0)
maxx, maxy = all_pts.max(0)
W = 1000.0
scale = W / max(maxx - minx, maxy - miny)
H = (maxy - miny) * scale
to_svg = lambda p: ((p[:, 0] - minx) * scale, (maxy - p[:, 1]) * scale)


def rdp(pts, eps):
    if len(pts) < 3:
        return pts
    a, b = pts[0], pts[-1]
    ab = b - a
    n = np.hypot(*ab)
    rel = pts - a
    d = (np.abs(ab[0] * rel[:, 1] - ab[1] * rel[:, 0]) / n) if n else np.hypot(rel[:, 0], rel[:, 1])
    i = int(np.argmax(d))
    if d[i] > eps:
        return np.vstack([rdp(pts[: i + 1], eps)[:-1], rdp(pts[i:], eps)])
    return np.vstack([a, b])


zones, centroids, areas = [], {}, {}
for lid in zone_ids:
    if lid not in shapes:
        continue
    path, best_area, best_c, tot_area = [], 0.0, None, 0.0
    for shp in shapes[lid]:
        parts = list(shp.parts) + [len(shp.points)]
        for i in range(len(parts) - 1):
            ring = np.array(shp.points[parts[i]:parts[i + 1]])
            x, y = to_svg(ring)
            sv = rdp(np.column_stack([x, y]), 0.6)
            if len(sv) >= 3:
                path.append("M" + "L".join(f"{px:.1f},{py:.1f}" for px, py in sv) + "Z")
            # alan ağırlıklı merkez (en büyük halka)
            xs, ys = ring[:, 0], ring[:, 1]
            cr = xs[:-1] * ys[1:] - xs[1:] * ys[:-1]
            area = cr.sum() / 2
            tot_area += abs(area)  # ft² (delikler ihmal)
            if abs(area) > best_area:
                cx = ((xs[:-1] + xs[1:]) * cr).sum() / (6 * area)
                cy = ((ys[:-1] + ys[1:]) * cr).sum() / (6 * area)
                best_area, best_c = abs(area), (cx, cy)
    centroids[lid] = best_c
    areas[lid] = tot_area
    cx, cy = to_svg(np.array([best_c]))
    zones.append({"id": lid, "name": zone_names[lid], "cx": round(float(cx[0]), 1),
                  "cy": round(float(cy[0]), 1), "path": "".join(path)})

ids = [z["id"] for z in zones]
n = len(ids)
T = np.zeros((n, n), dtype=int)
D = np.zeros((n, n))
src = np.zeros((n, n), dtype=int)  # 1 = veriden, 0 = tahmini
gd = g.to_dict("index")
for i, a in enumerate(ids):
    for j, b in enumerate(ids):
        if (a, b) in gd:
            T[i, j], D[i, j], src[i, j] = gd[(a, b)]["t"], gd[(a, b)]["d"], 1
        else:
            ax, ay = centroids[a]
            bx, by = centroids[b]
            miles = max(0.5, math.hypot(ax - bx, ay - by) / 5280 * 1.35)  # feet -> mil, dolambaç katsayısı
            D[i, j] = miles
            T[i, j] = miles / speed_mph * 3600 + 120  # +2 dk yaklaşma/park
    # Bölge içi: aynı bölgede başlayıp biten yolculuklar genelde dolambaçlı olduğundan
    # araç->yolcu süresine uygun değil. Kare bölgede iki rastgele nokta arası ortalama
    # mesafe ~0.52 x kenar; buna sabit 1 dk yaklaşma ekliyoruz.
    side_mi = math.sqrt(areas[a]) / 5280
    D[i, i] = round(0.52 * side_mi * 1.35, 2)
    T[i, i] = D[i, i] / speed_mph * 3600 + 60
    src[i, i] = 0

req = pd.concat(req_parts).sort_values("t")
req = req[req.pu.isin(ids) & req.do.isin(ids)]
waits = pd.concat(wait_parts)
waits = waits[(waits >= 0) & (waits < 3600)]

top = np.argsort(pu_counts)[::-1][:10]
out = {
    "meta": {
        "source": "NYC TLC High Volume FHV trip records, 2025-10",
        "borough": BOROUGH, "sim_day": str(SIM_DAY.date()),
        "window": [WIN_START_H, WIN_END_H],
        "svg": [round(float((maxx - minx) * scale), 1), round(float(H), 1)],
        "od_pairs_observed": int(src.sum()), "od_pairs_total": n * n,
        "od_trips_used": int(len(od)), "avg_speed_mph": round(float(speed_mph), 2),
        "real_wait_median_s": float(waits.median()), "real_wait_p95_s": float(waits.quantile(.95)),
    },
    "quality": q,
    "company": company,
    "daily": daily.tolist(),
    "hourly_weekday_avg": (hourly_wd / 23).round(0).tolist(),  # Ekim 2025: 23 hafta içi günü
    "hourly_weekend_avg": (hourly_we / 8).round(0).tolist(),   # 8 hafta sonu günü
    "top_zones": [{"id": int(i), "name": zone_names.get(int(i), "?"), "trips": int(pu_counts[i])} for i in top],
    "zones": zones,
    "od": {"ids": ids, "t": T.tolist(), "d": D.round(2).tolist()},
    "requests": req[["t", "pu", "do", "trip_time", "miles", "real_wait"]].values.tolist(),
}
OUT.write_text(json.dumps(out, separators=(",", ":")), encoding="utf-8")
print(json.dumps(out["meta"], indent=1))
print(json.dumps(q, indent=1))
print("requests:", len(req), "->", OUT, f"{OUT.stat().st_size / 1e6:.1f} MB")
