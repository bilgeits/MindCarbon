# GreenMatch – Ortak Formatlar (Hafta 5)

Bu dosya ekipteki herkesin aynı biçimde çalışması içindir. Değişiklik gerekirse önce gruba yazılır.

## 1. Faktör tablosu – `data/factors/faktor_tablosu.csv`

Herkes bu dosyaya satır ekler. Bir satır = bir faktörün bir araç tipi ve koşul için etkisi.

| Sütun | Anlamı | Örnek |
|---|---|---|
| faktor | kısa ad, alt çizgili | sicaklik_soguk |
| tur | A = araç seçimiyle, R = rota seçimiyle, Z = zamana/koşula bağlı | Z |
| arac_tipi | petrol, diesel, lpg, hev, phev, ev, tum | hev |
| etki_min_yuzde / etki_max_yuzde | CO2 veya yakıt artışı, yüzde | 20 / 40 |
| kosul | hangi koşulda geçerli | -7C şehir içi |
| kaynak | makale/kurum (link makale kartında) | fueleconomy.gov coldweather |
| sayfa_tablo | sayının geldiği sayfa veya tablo | Tablo 3 |
| olculu_mu | evet = ölçüm, beyan = kişi/kurum beyanı, model = simülasyon | evet |
| yazan | satırı ekleyen kişi | Kutay |

Kurallar: Kaynağı olmayan sayı yazılmaz (tahmin yok). Değer bilinmiyorsa hücre boş bırakılır.
"ilk_liste" satırları araştırma dokümanından geldi; sayfa/tablo numarası "kontrol edilecek" olanları Merve (M1) doğrular.

## 2. Makale kartı – `docs/literatur/<soyad_yil>.md`

`docs/literatur/_sablon.md` dosyasını kopyalayıp doldurun. Örn. `pielecha_2025.md`.

## 3. Sonuç dosyaları – `results/hafta5/`

- Simülasyon çıktıları `.jsonl`, tablolar `.csv`, grafikler `.png`.
- Dosya adı: `<gorev>_<konu>.<uzanti>`  (örn. `b2_y1_budget.jsonl`, `k2_sicaklik_egrisi.csv`).

## 4. Sunum formatı (Pazartesi 2 Kasım)

10 dk sunum + 5 dk soru: Problem → Yöntem → Sonuç (1 tablo ya da grafik) → Öneri → Riskler.

## 5. Seçim ölçütleri (her öneri 1–5 puan)

| Ölçüt | Y1 (Bilge) | Y2 (Kutay) | Y3 (Merve) |
|---|---|---|---|
| CO2 azaltma potansiyeli | | | |
| Bekleme süresine etkisi | | | |
| Veriye dayanma (ölçülü mü?) | | | |
| Yenilik (Google Maps / LEAD'den farkı) | | | |
| 13 Kasım'a yetişir mi | | | |
| TÜBİTAK'ta anlatılabilirlik | | | |
| **Toplam** | | | |

## 6. Git kuralları

- Herkes işe başlamadan önce **Pull**, bitirince **Commit + Push** yapar.
- Commit mesajı: `[B2] dinamik lambda eklendi` gibi; köşeli parantezde görev kodu.
- API anahtarı, şifre, büyük veri dosyası (VED, eVED, TomTom CSV) repoya girmez.
