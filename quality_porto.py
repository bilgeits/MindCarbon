"""
Porto taksi verisi (UCI, ECML PKDD 2015) - veri kalitesi ölçümleri.
train.csv'yi parça parça okur, sonuçları data/quality_porto.json'a yazar.
Çalıştırma: python quality_porto.py
"""
import json
from pathlib import Path

import numpy as np
import pandas as pd

DATA = Path(__file__).parent / "data"
TRAIN = next((DATA / "porto").rglob("train.csv"))

# Porto metropol alanı için geniş bir kutu (enlem, boylam)
LAT_MIN, LAT_MAX, LON_MIN, LON_MAX = 40.9, 41.5, -8.9, -8.2
JUMP_KM = 1.0  # 15 sn'de 1 km = 240 km/sa: GPS sıçraması

c = {}
def add(k, v):
    c[k] = c.get(k, 0) + int(v)

n_points_hist = {}
dur_hist = np.zeros(241, dtype=np.int64)   # dakika, 240+ son kutu
km_hist = np.zeros(101, dtype=np.int64)    # km, 100+ son kutu
taxi_counts, day_counts, seen_ids = {}, {}, set()
dup_ids = 0
ts_min, ts_max = None, None

for chunk in pd.read_csv(TRAIN, chunksize=200_000, dtype={"ORIGIN_CALL": "float64", "ORIGIN_STAND": "float64"}):
    add("rows", len(chunk))
    for col in ["CALL_TYPE", "ORIGIN_CALL", "ORIGIN_STAND", "TAXI_ID", "TIMESTAMP", "DAY_TYPE", "MISSING_DATA", "POLYLINE"]:
        add(f"null_{col}", chunk[col].isna().sum())
    for k, v in chunk.CALL_TYPE.value_counts().items():
        add(f"call_{k}", v)
    for k, v in chunk.DAY_TYPE.value_counts().items():
        add(f"daytype_{k}", v)
    add("missing_data_true", (chunk.MISSING_DATA.astype(str) == "True").sum())
    # tutarlılık: A -> ORIGIN_CALL dolu olmalı, B -> ORIGIN_STAND dolu olmalı
    add("A_without_origin_call", ((chunk.CALL_TYPE == "A") & chunk.ORIGIN_CALL.isna()).sum())
    add("B_without_origin_stand", ((chunk.CALL_TYPE == "B") & chunk.ORIGIN_STAND.isna()).sum())
    add("notA_with_origin_call", ((chunk.CALL_TYPE != "A") & chunk.ORIGIN_CALL.notna()).sum())
    add("notB_with_origin_stand", ((chunk.CALL_TYPE != "B") & chunk.ORIGIN_STAND.notna()).sum())

    for tid in chunk.TRIP_ID.astype(str):
        if tid in seen_ids:
            dup_ids += 1
        else:
            seen_ids.add(tid)
    add("dup_taxi_timestamp", chunk.duplicated(["TAXI_ID", "TIMESTAMP"]).sum())
    for k, v in chunk.TAXI_ID.value_counts().items():
        taxi_counts[k] = taxi_counts.get(k, 0) + int(v)
    days = pd.to_datetime(chunk.TIMESTAMP, unit="s").dt.date.astype(str)
    for k, v in days.value_counts().items():
        day_counts[k] = day_counts.get(k, 0) + int(v)
    lo, hi = chunk.TIMESTAMP.min(), chunk.TIMESTAMP.max()
    ts_min = lo if ts_min is None else min(ts_min, lo)
    ts_max = hi if ts_max is None else max(ts_max, hi)

    # --- GPS güzergâhları: hepsini tek dizide vektörel işle
    polys = [json.loads(p) for p in chunk.POLYLINE]
    lens = np.array([len(p) for p in polys])
    add("polyline_empty", (lens == 0).sum())
    add("polyline_single_point", (lens == 1).sum())
    for k, v in zip(*np.unique(np.minimum(lens, 1000), return_counts=True)):
        n_points_hist[int(k)] = n_points_hist.get(int(k), 0) + int(v)
    dur_min = np.maximum(lens - 1, 0) * 15 / 60
    add("duration_gt_3h", (dur_min > 180).sum())
    dur_hist += np.bincount(np.minimum(dur_min[lens >= 2].astype(int), 240), minlength=241)

    keep = lens >= 2
    pts = np.array([q for p, ok in zip(polys, keep) if ok for q in p], dtype=float)
    kl = lens[keep]
    lon, lat = pts[:, 0], pts[:, 1]
    outside = (lat < LAT_MIN) | (lat > LAT_MAX) | (lon < LON_MIN) | (lon > LON_MAX)
    starts = np.concatenate([[0], np.cumsum(kl)[:-1]])
    add("points_total", len(pts))
    add("points_outside_area", outside.sum())
    add("trips_any_point_outside", (np.add.reduceat(outside.astype(int), starts) > 0).sum())
    # ardışık noktalar arası mesafe (haversine), yolculuk sınırlarını atla
    la, lo_ = np.radians(lat), np.radians(lon)
    dlat, dlon = np.diff(la), np.diff(lo_)
    a = np.sin(dlat / 2) ** 2 + np.cos(la[:-1]) * np.cos(la[1:]) * np.sin(dlon / 2) ** 2
    seg = 2 * 6371 * np.arcsin(np.sqrt(np.clip(a, 0, 1)))
    boundary = np.zeros(len(seg), dtype=bool)
    boundary[np.cumsum(kl)[:-1] - 1] = True  # bir yolculuğun son noktası -> sonrakinin ilki
    seg[boundary] = 0
    jump = seg > JUMP_KM
    seg_starts = starts  # her yolculuğun segmentleri starts[i] .. starts[i]+kl[i]-2
    add("segments_total", (kl - 1).sum())
    add("segments_jump", jump.sum())
    trip_jump = np.add.reduceat(jump.astype(int), seg_starts) > 0
    add("trips_with_jump", trip_jump.sum())
    seg_clean = np.where(jump, 0, seg)
    trip_km = np.add.reduceat(seg_clean, seg_starts)
    km_hist += np.bincount(np.minimum(trip_km.astype(int), 100), minlength=101)
    add("trips_zero_movement", (trip_km < 0.05).sum())
    print(f"rows so far {c['rows']:,}")

def q(hist, p):
    cum = np.cumsum(hist) / hist.sum()
    return int(np.searchsorted(cum, p))

c["dup_trip_id"] = dup_ids
c["taxis"] = len(taxi_counts)
tc = np.array(list(taxi_counts.values()))
c["trips_per_taxi_min"], c["trips_per_taxi_median"], c["trips_per_taxi_max"] = int(tc.min()), int(np.median(tc)), int(tc.max())
c["days_covered"] = len(day_counts)
dc = np.array(list(day_counts.values()))
c["trips_per_day_min"], c["trips_per_day_median"], c["trips_per_day_max"] = int(dc.min()), int(np.median(dc)), int(dc.max())
c["ts_min"] = str(pd.to_datetime(ts_min, unit="s"))
c["ts_max"] = str(pd.to_datetime(ts_max, unit="s"))
c["duration_median_min"], c["duration_p95_min"] = q(dur_hist, .5), q(dur_hist, .95)
c["km_median"], c["km_p95"] = q(km_hist, .5), q(km_hist, .95)
c["file_mb"] = round(TRAIN.stat().st_size / 1e6, 1)
(DATA / "quality_porto.json").write_text(json.dumps(c, indent=1), encoding="utf-8")
print(json.dumps(c, indent=1))
