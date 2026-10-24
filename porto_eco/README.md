# GreenMatch Porto: eko-rota + eşleştirme

En az karbon ile en kısa yolu birleştiren rota algoritması ve bunu kullanan taksi eşleştirme simülasyonu.
Veri: Porto taksi GPS izleri (`../data/porto/train.csv`), EU-DEM yükseklikleri, 15 araç modelinin WLTP değerleri.

## Çalıştırma sırası (Node.js, ek paket gerekmez)

| Adım | Komut | Ne yapar | Süre |
|---|---|---|---|
| 1 | `node graph_pass1.js ../data/porto/train.csv <geçici_klasör> 160` | GPS izlerinden hız/duraklama istatistikleri, doğrulama ve simülasyon günü yolculukları | ~1,5 dk |
| 2 | `node graph_pass2.js <geçici_klasör> data/porto_graph.json` | Yönlü yol grafı (200 m hücre), 5 saat dilimi | sn |
| 3 | `node build_elevation.js` | `data/elev_rows_data.txt` (EU-DEM, OpenTopoData) -> düğüm yükseklikleri | sn |
| 4 | `cp <geçici_klasör>/pass1_trips.csv data/porto_trips_sample.csv` ve `node calibrate.js` | ETA kalibrasyonu + doğrulama -> `data/calibration.json` | ~10 sn |
| 5 | `node prepare_requests.js 2014-03-12` | Simülasyon günü talepleri ve taksi vardiyaları | sn |
| 6 | `node route_eval.js` | Rota düzeyi etki (500 yolculuk x 15 model x 4 λ) | ~10 sn |
| 7 | `node run_batch.js batch_eta:0:0:1 green:6:1:1 ...` | Eşleştirme simülasyonu (`algo:λ:μ:tohum`) -> `results/summary.jsonl` | baz ~6 sn, green ~85 sn |
| 8 | `node demo/build_demo.js` | Tek dosyalık demo: `demo/greenmatch_porto.html` | sn |

## Dosyalar
- `grid.js` – 200 m hücre ızgarası, projeksiyon
- `emission.js` – hıza ve eğime duyarlı, WLTP kalibreli emisyon modeli (`fit_phase.js` parametre uydurması)
- `router.js` – Dijkstra; maliyet = süre + λ·CO2e; EV'lerde negatif kenarlar için Johnson potansiyeli
- `sim_porto.js` – nearest / batch_eta / green_fast / green algoritmaları, adalet terimi μ
- `data/vehicles.json` – 15 model, kaynak linkleri, gerçek kullanım farkı, WTT ve şebeke faktörleri

## Ana sonuç (12 Mart 2014, 4.030 talep, 415 taksi, 3 tohum ortalaması)
| Algoritma | g CO2e / yolcu-km | Ort. bekleme | Boş km | Gini |
|---|---|---|---|---|
| En yakın araç | 215,6 | 3,38 dk | %21,3 | 0,460 |
| Toplu ETA | 211,0 | 3,25 dk | %20,8 | 0,472 |
| GreenMatch, sadece araç seçimi | 188,5 (−%10,7) | 3,47 dk | %22,8 | 0,379 |
| GreenMatch, araç + eko-rota (λ=6, μ=1) | 173,7 (−%17,7) | 3,48 dk (+%7,2) | %23,3 | 0,381 |

ETA doğrulaması (8.705 test yolculuğu): MAPE %25,3 (kuş uçuşu tahmin: %36,7).
