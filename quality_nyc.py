"""
NYC HVFHV Ekim 2025 - veri kalitesi ölçümleri.
Bütün ayı satır grupları halinde tarar, sonuçları data/quality_nyc.json'a yazar.
Çalıştırma: python quality_nyc.py
"""
import json
from pathlib import Path

import numpy as np
import pandas as pd
import pyarrow.parquet as pq

DATA = Path(__file__).parent / "data"
pf = pq.ParquetFile(DATA / "fhvhv_tripdata_2025-10.parquet")

COLS = ["hvfhs_license_num", "originating_base_num", "request_datetime", "on_scene_datetime",
        "pickup_datetime", "dropoff_datetime", "PULocationID", "DOLocationID", "trip_miles",
        "trip_time", "base_passenger_fare", "driver_pay", "shared_request_flag", "shared_match_flag"]

c = {}
def add(k, v):
    c[k] = c.get(k, 0) + int(v)

wait_hist = np.zeros(61, dtype=np.int64)  # istek -> araç geldi, dakika (60+ son kutu)
tmin, tmax = None, None
for rg in range(pf.num_row_groups):
    df = pf.read_row_group(rg, columns=COLS).to_pandas()
    n = len(df)
    add("rows", n)
    for col in COLS:
        add(f"null_{col}", df[col].isna().sum())
    for lic, g in df.groupby("hvfhs_license_num"):
        add(f"rows_{lic}", len(g))
        add(f"null_on_scene_{lic}", g.on_scene_datetime.isna().sum())

    rq, os_, pu, do = df.request_datetime, df.on_scene_datetime, df.pickup_datetime, df.dropoff_datetime
    add("request_outside_oct", ((rq < "2025-10-01") | (rq >= "2025-11-01")).sum())
    add("request_after_pickup", (rq > pu).sum())
    add("request_after_pickup_gt_5min", ((rq - pu).dt.total_seconds() > 300).sum())
    add("on_scene_after_pickup", (os_ > pu).sum())
    add("on_scene_before_request", (os_ < rq).sum())
    add("dropoff_not_after_pickup", (do <= pu).sum())
    dur = (do - pu).dt.total_seconds()
    add("trip_time_mismatch_gt_60s", ((dur - df.trip_time).abs() > 60).sum())
    add("trip_time_le_0", (df.trip_time <= 0).sum())
    add("trip_time_gt_4h", (df.trip_time > 4 * 3600).sum())
    add("miles_le_0", (df.trip_miles <= 0).sum())
    add("miles_gt_100", (df.trip_miles > 100).sum())
    speed = df.trip_miles / (df.trip_time.clip(lower=1) / 3600)
    add("speed_gt_80mph", ((speed > 80) & (df.trip_time > 0)).sum())
    add("speed_lt_1mph_over_10min", ((speed < 1) & (df.trip_time > 600)).sum())
    add("pu_unknown_zone", (df.PULocationID > 263).sum())
    add("do_unknown_zone", (df.DOLocationID > 263).sum())
    add("any_unknown_zone", ((df.PULocationID > 263) | (df.DOLocationID > 263)).sum())
    add("fare_le_0", (df.base_passenger_fare <= 0).sum())
    add("driver_pay_lt_0", (df.driver_pay < 0).sum())
    add("shared_any", ((df.shared_request_flag == "Y") | (df.shared_match_flag == "Y")).sum())
    w = ((os_ - rq).dt.total_seconds() / 60).dropna()
    w = w[w >= 0]
    wait_hist += np.bincount(np.minimum(w.astype(int), 60), minlength=61)
    lo, hi = rq.min(), rq.max()
    tmin = lo if tmin is None else min(tmin, lo)
    tmax = hi if tmax is None else max(tmax, hi)
    print(f"row group {rg + 1}/{pf.num_row_groups}")

cum = np.cumsum(wait_hist) / wait_hist.sum()
c["wait_median_min"] = int(np.searchsorted(cum, 0.5))
c["wait_p95_min"] = int(np.searchsorted(cum, 0.95))
c["wait_ge_60min"] = int(wait_hist[60])
c["request_min"], c["request_max"] = str(tmin), str(tmax)
c["file_mb"] = round((DATA / "fhvhv_tripdata_2025-10.parquet").stat().st_size / 1e6, 1)
(DATA / "quality_nyc.json").write_text(json.dumps(c, indent=1), encoding="utf-8")
print(json.dumps(c, indent=1))
