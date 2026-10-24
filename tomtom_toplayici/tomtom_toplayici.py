#!/usr/bin/env python3
"""
GreenMatch - TomTom trafik hızı toplayıcı (İstanbul, 25 nokta, 15 dakikada bir).

Sadece Python 3 standart kütüphanesi kullanır; ek paket kurmaya gerek yok.
Claude'un açık kalması gerekmez: bilgisayar açık ve internete bağlı olduğu sürece çalışır.

Kullanım (Windows'ta Komut İstemi / PowerShell, Mac'te Terminal):
    python tomtom_toplayici.py --key SENIN_ANAHTARIN --ad merve

Çıktı: aynı klasörde  tomtom_istanbul_<ad>.csv  (her 15 dakikada 25 satır eklenir)
       tomtom_log_<ad>.txt  (hatalar ve durum)
Durdurmak için: Ctrl + C. Yeniden başlatınca kaldığı yerden devam eder (dosyaya ekler).

Kota: TomTom ücretsiz hesap ayda 20.000 istek. 25 nokta x 96 tur/gün x 7 gün = 16.800.
Program ay içinde 19.000 isteğe ulaşırsa kendini durdurur (hesap aşılmasın diye).
Her kişi KENDİ anahtarını kullanmalı; iki kişi aynı anahtarı kullanırsa kota iki kat hızlı biter.
"""
import argparse, csv, json, os, sys, time, urllib.request, urllib.error
from datetime import datetime, timezone, timedelta

# 25 izleme noktası (enlem, boylam). TomTom noktaya en yakın yol parçasını döndürür;
# döndürülen parçanın koordinatları da kaydedilir, böylece hangi yolun ölçüldüğü sonradan doğrulanır.
NOKTALAR = [
    ("buyukdere_mecidiyekoy", 41.0675, 28.9940),
    ("buyukdere_levent",      41.0790, 29.0110),
    ("o1_zincirlikuyu",       41.0680, 29.0130),
    ("halaskargazi_sisli",    41.0590, 28.9870),
    ("cumhuriyet_taksim",     41.0410, 28.9870),
    ("tarlabasi_bulvari",     41.0360, 28.9790),
    ("dolmabahce_cd",         41.0390, 28.9970),
    ("barbaros_bulvari",      41.0480, 29.0080),
    ("ciragan_cd_besiktas",   41.0440, 29.0150),
    ("muallim_naci_ortakoy",  41.0520, 29.0300),
    ("15temmuz_koprusu",      41.0452, 29.0340),
    ("galata_koprusu",        41.0200, 28.9730),
    ("unkapani_koprusu",      41.0250, 28.9620),
    ("kennedy_sarayburnu",    41.0150, 28.9850),
    ("kennedy_kumkapi",       41.0045, 28.9650),
    ("vatan_cd",              41.0180, 28.9330),
    ("millet_cd",             41.0110, 28.9300),
    ("aksaray_ataturk_blv",   41.0130, 28.9520),
    ("pasalimani_uskudar",    41.0300, 29.0180),
    ("o1_altunizade",         41.0230, 29.0450),
    ("rihtim_kadikoy",        40.9920, 29.0230),
    ("sogutlucesme_cd",       40.9910, 29.0370),
    ("d100_uzuncayir",        40.9970, 29.0560),
    ("d100_kozyatagi",        40.9790, 29.0920),
    ("bagdat_cd_suadiye",     40.9650, 29.0820),
]

URL = "https://api.tomtom.com/traffic/services/4/flowSegmentData/absolute/10/json?point={lat},{lon}&unit=KMPH&key={key}"
ARALIK_DK = 15
AYLIK_SINIR = 19000
ISTANBUL = timezone(timedelta(hours=3))
ALANLAR = ["zaman_utc", "zaman_istanbul", "toplayici", "nokta", "istek_enlem", "istek_boylam",
           "frc", "currentSpeed", "freeFlowSpeed", "currentTravelTime", "freeFlowTravelTime",
           "confidence", "roadClosure", "parca_bas_enlem", "parca_bas_boylam", "parca_son_enlem", "parca_son_boylam",
           "parca_nokta_sayisi", "hata"]


def log(dosya, mesaj):
    satir = f"{datetime.now(ISTANBUL):%Y-%m-%d %H:%M:%S}  {mesaj}"
    print(satir, flush=True)
    with open(dosya, "a", encoding="utf-8") as f:
        f.write(satir + "\n")


def istek(key, lat, lon):
    url = URL.format(lat=lat, lon=lon, key=key)
    son_hata = ""
    for deneme in range(3):
        try:
            with urllib.request.urlopen(url, timeout=20) as r:
                return json.loads(r.read().decode("utf-8")), ""
        except urllib.error.HTTPError as e:
            son_hata = f"HTTP {e.code}"
            if e.code in (401, 403):          # anahtar geçersiz / yetki yok: tekrar denemenin anlamı yok
                return None, son_hata
        except Exception as e:                # internet kesintisi vb.
            son_hata = type(e).__name__
        time.sleep(5 * (deneme + 1))
    return None, son_hata


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--key", required=True, help="TomTom API anahtarı")
    p.add_argument("--ad", required=True, help="toplayıcı adı, ör. merve veya kutay")
    p.add_argument("--gun", type=float, default=7.0, help="kaç gün çalışsın (varsayılan 7)")
    a = p.parse_args()

    klasor = os.path.dirname(os.path.abspath(__file__))
    csv_yolu = os.path.join(klasor, f"tomtom_istanbul_{a.ad}.csv")
    log_yolu = os.path.join(klasor, f"tomtom_log_{a.ad}.txt")
    sayac_yolu = os.path.join(klasor, f"tomtom_sayac_{a.ad}.json")

    sayac = {}
    if os.path.exists(sayac_yolu):
        with open(sayac_yolu, encoding="utf-8") as f:
            sayac = json.load(f)
    yeni = not os.path.exists(csv_yolu)
    bitis = time.time() + a.gun * 86400
    log(log_yolu, f"Başladı. {len(NOKTALAR)} nokta, {ARALIK_DK} dakikada bir, {a.gun} gün. Çıktı: {csv_yolu}")

    while time.time() < bitis:
        ay = datetime.now(timezone.utc).strftime("%Y-%m")
        if sayac.get(ay, 0) + len(NOKTALAR) > AYLIK_SINIR:
            log(log_yolu, f"Aylık sınıra ({AYLIK_SINIR}) ulaşıldı, durduruldu.")
            break
        simdi = datetime.now(timezone.utc)
        satirlar, hatalar = [], 0
        for ad, lat, lon in NOKTALAR:
            veri, hata = istek(a.key, lat, lon)
            sayac[ay] = sayac.get(ay, 0) + 1
            s = {"zaman_utc": simdi.strftime("%Y-%m-%dT%H:%M:%SZ"),
                 "zaman_istanbul": simdi.astimezone(ISTANBUL).strftime("%Y-%m-%d %H:%M"),
                 "toplayici": a.ad, "nokta": ad, "istek_enlem": lat, "istek_boylam": lon, "hata": hata}
            if veri and "flowSegmentData" in veri:
                d = veri["flowSegmentData"]
                k = d.get("coordinates", {}).get("coordinate", [])
                s.update({"frc": d.get("frc"), "currentSpeed": d.get("currentSpeed"), "freeFlowSpeed": d.get("freeFlowSpeed"),
                          "currentTravelTime": d.get("currentTravelTime"), "freeFlowTravelTime": d.get("freeFlowTravelTime"),
                          "confidence": d.get("confidence"), "roadClosure": d.get("roadClosure"),
                          "parca_nokta_sayisi": len(k)})
                if k:
                    s.update({"parca_bas_enlem": k[0]["latitude"], "parca_bas_boylam": k[0]["longitude"],
                              "parca_son_enlem": k[-1]["latitude"], "parca_son_boylam": k[-1]["longitude"]})
            else:
                hatalar += 1
                if hata in ("HTTP 401", "HTTP 403"):
                    log(log_yolu, f"Anahtar reddedildi ({hata}). Anahtarı ve Traffic API yetkisini kontrol et. Durduruldu.")
                    return
            satirlar.append(s)
            time.sleep(0.3)
        with open(csv_yolu, "a", newline="", encoding="utf-8") as f:
            w = csv.DictWriter(f, fieldnames=ALANLAR)
            if yeni:
                w.writeheader(); yeni = False
            w.writerows(satirlar)
        with open(sayac_yolu, "w", encoding="utf-8") as f:
            json.dump(sayac, f)
        log(log_yolu, f"Tur tamam: {len(satirlar) - hatalar}/{len(satirlar)} başarılı. Bu ay toplam istek: {sayac[ay]}")
        # bir sonraki 15 dakikalık dilime kadar bekle (ör. 10:00, 10:15, 10:30 ...)
        simdi_s = time.time()
        sonraki = (int(simdi_s // (ARALIK_DK * 60)) + 1) * ARALIK_DK * 60
        time.sleep(max(1, sonraki - simdi_s))
    log(log_yolu, "Bitti.")


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\nDurduruldu (Ctrl + C). Tekrar çalıştırınca kaldığı yerden devam eder.")
