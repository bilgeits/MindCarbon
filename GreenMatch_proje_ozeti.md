# GreenMatch – Proje Sohbet Özeti ve Devir Dosyası

**Proje:** GreenMatch: Emission-Aware Multi-Objective Driver–Passenger Matching for Ride-Hailing
**Ders:** COMP 491 Senior Design Project (MEF Üniversitesi, Bilgisayar Mühendisliği), danışman: Tuna Hoca
**Ekip:** Bilge, Merve, Kutay
**Son güncelleme:** 24 Ekim 2026
**Sıradaki sunum:** 13 Kasım 2026 (ara sunum)

Bu dosya, Claude ile yapılan sohbetin tamamının detaylı özetidir. Başka bir proje klasörüne/sohbete taşımak için hazırlandı: alınan kararlar, kaynaklar, kod, sonuçlar, açık işler.

---

## İçindekiler

1. [Proposal ve zaman çizelgesi](#1-proposal-ve-zaman-çizelgesi)
2. [Bilimsel dayanaklar (CO₂, boş km)](#2-bilimsel-dayanaklar)
3. [Projede tespit edilen mantık sorunları](#3-projede-tespit-edilen-mantık-sorunları)
4. [Proje hedefleri: doğru anlaşılması gerekenler](#4-proje-hedefleri)
5. [İstanbul verisi araştırması (ilk tur)](#5-i̇stanbul-verisi-araştırması-ilk-tur)
6. [Arayüz tasarımları (yolcu, şoför, müdür)](#6-arayüz-tasarımları)
7. [Porto eko-rota + eşleştirme algoritması (ana iş)](#7-porto-eko-rota--eşleştirme-algoritması)
8. [Taksi uygulaması prototipi](#8-taksi-uygulaması-prototipi)
9. [Araç verisi: kaynaklar, tahminler ve EEA](#9-araç-verisi-kaynaklar-tahminler-ve-eea)
10. [İstanbul'a geçiş araştırması (Görkem Hoca'nın önerileri)](#10-i̇stanbula-geçiş-araştırması)
11. [Literatür (açık kodlu benzer çalışmalar dahil)](#11-literatür)
12. [Görev dağılımı ve takvim](#12-görev-dağılımı-ve-takvim)
13. [Açık işler / bekleyenler](#13-açık-işler)
14. [Dosyalar ve linkler](#14-dosyalar-ve-linkler)
15. [Terimler sözlüğü](#15-terimler-sözlüğü)

---

## 1. Proposal ve zaman çizelgesi

**Proposal dosyası:** `SDP_Proposal_GreenMatch_TASLAK.docx` (İngilizce). Zaman çizelgesi tablosu ve Gantt şeması yeniden yapıldı.

**Kararlar:**
- Güz döneminde önce **arayüzler** (web + mobil) yapılacak; Ocak ara raporunda bunlar gösterilecek. Algoritmalar bahara.
- Bahar dönemi Mayıs'ta erken bitiyor. Akademik takvimden: derslerin son günü **22 Nisan 2027**, proje/sunum dönemi **26 Nisan – 14 Mayıs 2027**.
- (Not: akademik takvimde "Tek Ders başvuruları 26-27 Haziran 2026" yazıyor, muhtemelen 2027 olacak; çizelgeyi etkilemiyor.)

**Yeni zaman çizelgesi:**

| Görev | Başlangıç | Bitiş |
|---|---|---|
| Literatür, gereksinimler, UI tasarımı (wireframe) | 06/10/2026 | 25/10/2026 |
| Backend iskeleti ve veri modeli (FastAPI, PostGIS, Redis, Docker) | 19/10/2026 | 15/11/2026 |
| Yolcu ve şoför mobil uygulamaları (Flutter) | 02/11/2026 | 20/12/2026 |
| Web dashboard (React + MapLibre) | 16/11/2026 | 27/12/2026 |
| Entegrasyon ve uçtan uca test (geçici "en yakın araç" eşleştirici) | 14/12/2026 | 08/01/2027 |
| Ara rapor ve demo | 11/01/2027 | 18/01/2027 |
| (Yarıyıl tatili) | 19/01/2027 | 14/02/2027 |
| Veri hattı ve şehir simülatörü | 15/02/2027 | 07/03/2027 |
| ETA, emisyon ve talep modülleri | 22/02/2027 | 14/03/2027 |
| Eşleştirme motoru v1 | 08/03/2027 | 28/03/2027 |
| Gelecek talep değeri (v2) + entegrasyon | 22/03/2027 | 04/04/2027 |
| Deneyler ve ablasyon | 29/03/2027 | 18/04/2027 |
| Final rapor, demo videosu, poster | 05/04/2027 | 22/04/2027 |
| Final sunum ve demo | 26/04/2027 | 14/05/2027 |

Varsayımlar: ara rapor 11–18 Ocak (taslaktan korundu), yarıyıl tatili 19 Ocak – 14 Şubat, bahar başlangıcı 15 Şubat.

---

## 2. Bilimsel dayanaklar

### Daha fazla yakıt = daha fazla CO₂ mi?
**Evet, kesin ve doğrusal.** Yanmada yakıttaki karbon oksijenle CO₂ olur.
- Benzin: 8.887 g CO₂/galon ≈ **2,35 kg/L** (EPA)
- Dizel: 10.180 g CO₂/galon ≈ **2,69 kg/L** (EPA)
- COPERT de CO₂'yi doğrudan yakıt tüketiminden hesaplar; tüketim katsayıları hıza bağlıdır (trafik/rölanti → km başına daha çok yakıt).
- "Benzin kaybı" buharlaşma anlamındaysa: o CO₂ değil, VOC (uçucu organik bileşik) salar; CO₂e hesabımızın dışında.

### Proposal'daki iki istatistik ve kaynakları (ikisi de gerekli, her biri ayrı iddia)

**1) Boş km %39 (aslında %38,5) – CARB raporu**
California Air Resources Board, *SB 1014 Clean Miles Standard: 2018 Base-year Emissions Inventory Report*, Aralık 2019.
- s.4: *"The TNC trip data shows that approximately 38.5 percent of TNC's total VMT are deadhead miles."*
- s.38: *"Approximately 28 percent, 11 percent, and 61 percent of the total VMT are attributed to P1, P2, and P3 periods, respectively."* ve *"Deadhead miles refers to the sum of period 1 and period 2 VMT."*
- s.11–12: P1 = uygulamaya girmiş ama eşleşmemiş (boşta dolaşma, **%28**); P2 = eşleşti, yolcuya gidiyor (**%11**); P3 = yolcu araçta (**%61**).

IEEE: [1] California Air Resources Board, "SB 1014 Clean Miles Standard: 2018 Base-year Emissions Inventory Report," Sacramento, CA, USA, Dec. 2019. https://ww2.arb.ca.gov/sites/default/files/2019-12/SB%201014%20-%20Base%20year%20Emissions%20Inventory_December_2019.pdf

**GreenMatch'le ilişkisi:** Eşleştirme algoritması **%11**'lik kısmı (yolcuya boş gidiş), gelecek talep tahmini **%28**'lik kısmı (iki yolcu arası boş dolaşma) hedefliyor. %61'lik yolculuğun kendisi kısaltılamaz; sadece daha temiz araçla yaptırılabilir.

**2) %69 daha fazla emisyon – UCS raporu**
D. Anair, J. Martin, M. C. Pinto de Moura, J. Goldman, *Ride-Hailing's Climate Risks*, Union of Concerned Scientists, Şubat 2020.
- s.1: *"Ride-hailing trips today result in an estimated 69 percent more climate pollution on average than the trips they displace."*
- s.1–2: farkın asıl nedeni *"deadheading"*; ayrıca toplu taşıma/yürüme yerine araç çağırma.
- Not: Hakemli dergi değil (bilim kuruluşu raporu); "estimated" kelimesi cümlede kalmalı. %69'un bir kısmı (mod değişimi) algoritmanın kontrolünde değil.

IEEE: [2] D. Anair, J. Martin, M. C. Pinto de Moura, and J. Goldman, "Ride-Hailing's Climate Risks: Steering a Growing Industry Toward a Clean Transportation Future," Union of Concerned Scientists, Cambridge, MA, USA, Feb. 2020. https://www.ucs.org/resources/ride-hailing-climate-risks

---

## 3. Projede tespit edilen mantık sorunları

1. **Veri uyuşmazlığı (en ciddi):** Proposal'da talep NYC'den, yol ağı/trafik/filo İstanbul'dan. NYC yolculuğu İstanbul ağında rotalanamaz. → Ekip **İstanbul'da kalmaya** karar verdi (talep sentetik/İBB verisiyle). Ara sunum için Porto kavram kanıtı olarak kullanıldı.
2. **Well-to-wheel tutarsızlığı:** COPERT sadece egzoz (tank-to-wheel) verir; EV şebeke faktörü üretimi içerir. → Benzin/LPG için kuyudan-tanka (WTT) faktörü eklendi (Porto modelinde uygulandı).
3. **Maliyette aynı şey iki kez:** Aynı yakıt türünde CO₂e ve enerji maliyeti aynı şeyle orantılı; ağırlıklar açıklanmalı.
4. **%10 hedefinin kaynağı:** Yolculuğun km'si değişmez; kazanç (a) yolcuya boş gidiş, (b) araç türü seçimi, (c) yolculuk sonrası boş dolaşmadan gelir. Karma filoda büyük kısım araç seçiminden gelir. Ekip kararı: filo karma olacak (benzin, dizel, LPG, hibrit, elektrikli).
5. **"3 algoritma" yanlış anlaşılması:** Proposal'daki 3 algoritma **bizim tasarladıklarımız değil**, karşılaştırma için kullanılan bilinen yöntemler: en yakın araç, en kısa ETA, Batched ETA. Bizim algoritmamız tek: GreenMatch (v1/v2). AI kısmı: talep tahmini (LightGBM) ve ETA tahmini; eşleştirmenin kendisi optimizasyon (Macar algoritması).

---

## 4. Proje hedefleri

1. Yolcu uygulaması, şoför uygulaması, müdür paneli.
2. GreenMatch eşleştirme algoritması: yakınlık + emisyon (araç türü dahil) + boş km + trafik + bırakış bölgesindeki gelecek talep.
3. Şehir simülasyonu: bütün algoritmaları aynı sanal günde adil karşılaştırmak için.
4. Hedef: Batched ETA'ya göre yolcu-km başına **≥ %10 daha az CO₂**, ortalama bekleme **≤ %10 artış**, sürücü geliri Gini artışı **≤ 0,02**.

**Simülasyon nasıl çalışır (basit anlatım):** Ekransız Python/Node programı. Her birkaç saniyede: yeni talepler eklenir → eşleştirme çalışır → araçlar "rota süresi sonunda" varmış sayılır → boş km, bekleme, CO₂ kaydedilir. Harita (OSM/OSRM) sadece mesafe-süre hesap makinesi.

---

## 5. İstanbul verisi araştırması (ilk tur)

- İstanbul'da açık **taksi yolculuk verisi yok** (NYC TLC'nin karşılığı yok).
- **İBB Ulaşım Modeli** (data.ibb.gov.tr): 2020 ve 2040 OD matrisleri, yol ağı; sadece sabah zirvesi (07–08). XLSX/KMZ.
- **İBB Saatlik Trafik Yoğunluk Verisi** (2020–2025, aylık CSV): `DATE_TIME, LATITUDE, LONGITUDE, GEOHASH (6), MINIMUM_SPEED, MAXIMUM_SPEED, AVERAGE_SPEED, NUMBER_OF_VEHICLES`.
- **İBB Saatlik Toplu Taşıma (İstanbulkart):** saat, ilçe, ulaşım türüne göre yolcu sayısı.
- **İBB Taksi Durakları** ve **Taksi Dolmuş Durakları** (GeoJSON, Haziran 2025).
- **OpenStreetMap** (Geofabrik Türkiye, osmium ile kırpma, OSRM).
- **EY İstanbul Taksi Ekosistemi raporu (2025):** 20.311 taksi, araç başına günde 36 yolculuk → ~730 bin yolculuk/gün; 1.000 kişiye 1,3 taksi.

**Sentetik talep yöntemi:** OD matrisi → bölgeden bölgeye olasılık (akşam için ters matris); saatlik trafik + İstanbulkart ile 24 saat profili; ~730 bin/gün'e ölçekleme; Poisson süreciyle zaman damgalı talepler (alış noktaları taksi duraklarına ağırlıklı); OSRM'de İBB geohash hızlarıyla segment hız güncellemesi; EY rakamıyla doğrulama.

---

## 6. Arayüz tasarımları

Claude Design tuvalinde "GreenMatch Arayüzleri" (link aşağıda). Türkçe, örnek veri.
- **Yolcu – Araç seçimi:** Green Choice (elektrikli, 0,41 kg CO₂e, Eco Skor 94, +3 dk) vs Normal (LPG, 1,01 kg, Eco Skor 58). Etkileşimli seçim.
- **Yolcu – Yolculuk özeti:** önlenen CO₂, karşılaştırma çubukları, Eco Skor +3, aylık tasarruf.
- **Şoför – Gelen talep:** yolcuya boş km, yolculuk km, batarya, "Neden sen?" açıklaması; kabul/ret akışı.
- **Şoför – Günlük özet:** kazanç, boş km %26, saatlik dolu/boş km grafiği, talep önerisi, gelir dengesi %96.
- **Müdür paneli:** CO₂e, g/yolcu-km, boş km oranı, bekleme, Green Choice payı; talep tahmini haritası; emisyon–bekleme dengesi grafiği (hedef bölge taralı); saatlik CO₂e; yakıt türüne göre filo tablosu; uyarılar; "neden bu araç?" atama kayıtları.

---

## 7. Porto eko-rota + eşleştirme algoritması

13 Kasım sunumu için geliştirildi. Kod: `Desktop/GreenMatch-Demo/porto_eco/` (Node.js, ek paket yok). Klasörde ayrıca daha önceki NYC/Manhattan demosu (`sim.js`, `demo.html`) var.

### Kullanıcının verdiği kararlar
| Karar | Seçim |
|---|---|
| Yol ağı ve hız kaynağı | Porto GPS izlerinden (internet gerekmeden) |
| Araç emisyon kaynağı | AB resmi WLTP değerleri |
| En az karbon + en kısa yol birleşimi | Ağırlıklı toplam, λ ayarlı |
| 13 Kasım kapsamı | Rota + eşleştirme + demo |
| Filo dağılımı | 15 model eşit olasılıkla rastgele (filonun ~1/3'ü elektrikli) |
| Adalet | Adalet terimi ekle (μ) |

### Veri hattı
1. **Yol ağı:** ECML/PKDD 2015 Porto taksi verisi (`train.csv`, 1.710.670 yolculuk, Temmuz 2013 – Haziran 2014, 15 sn GPS, 448 taksi). Şehir 200 m hücrelere bölündü (90×100). Komşu hücre geçişlerinden yönlü kenarlar; 36,3 milyon geçiş (hafta içi). En az 20 gözlem, en büyük güçlü bağlı bileşen → **4.649 düğüm, 13.860 yönlü kenar**. 5 saat dilimi (gece 0–7, sabah zirvesi 7–10, gün içi 10–16, akşam zirvesi 16–20, akşam 20–24): kenar başına harmonik ortalama hız + hücre başına ortalama duraklama (ışık/kavşak; yolcu alma-bırakma hariç).
2. **Eğim:** EU-DEM v1.1 (25 m), OpenTopoData API. 400 m satır aralığı, satır boyunca 90 örnek (her hücre merkezi). Ribeira ~1 m, Aliados ~94 m. Kenarların %21'inde eğim > %5. Eğim ±%15 ile sınırlı.
3. **ETA kalibrasyonu:** Doğrulama yolculukları (TRIP_ID mod 50 = 0, hız hesabına hiç girmedi), yarısıyla kalibrasyon, yarısında test. Dolambaç katsayısı 1,049; sabit 120 sn (alma/bırakma); saat dilimi katsayıları 0,951 / 1,021 / 1,089 / 1,156 / 1,038.
   - **ETA MAPE %25,3** (medyan %19,2) – hedef %25'in hemen üstünde. Kuş uçuşu tahmin: %36,7. Mesafe MAPE %18,5.

### Emisyon modeli (fizik + WLTP kalibrasyonu)
```
F      = m·g·(Cr·cosθ + sinθ) + ½·ρ·CdA·v²        (Cr=0,011, ρ=1,2)
PKE(v) = 0,10 + 0,5 / v                           (dur-kalk, m/s²)
E_net  = [max(F,0) + m·PKE]·d − r·[max(−F,0) + m·PKE]·d
yakıtlı: g CO₂ = κ·max(E_net,0) + I·(WLTP/m)·t
EV:      Wh    = κ·E_net + I·(WLTP/m)·t
CO₂e   = egzoz × (1 + WTT)   veya   kWh × şebeke faktörü
```
- κ her araç için WLTP sınıf 3 çevriminin 4 fazında (düz yol) resmi değeri tutturacak şekilde çözülür.
- PKE, r ve I gerçek araçların **WLTP faz değerlerine** uyduruldu (`fit_phase.js`): benzinli Octavia 1.5 TSI (düşük/orta/yüksek/çok yüksek = 1,32/1,02/0,87/0,98 × birleşik), dizel Octavia 2.0 TDI (1,45/0,99/0,83/0,97), hibrit Corolla 1.8 (0,89/0,80/0,87/1,26), elektrikli Model 3 (EVDB şehir 0,80, otoyol 1,22).
- Sonuç parametreler: r (rejeneratif) hibrit 0,70, EV 0,70; I benzin/LPG 3,6, dizel 4,3, hibrit 1,1, EV 0.
- CdA gövde tipine göre (sedan 0,60 … SUV 0,78 m²) – modelleme parametresi.
- Yük: sürücü + yük 100 kg; yolcu varken +75 kg.

### Rota algoritması
- Dijkstra, **maliyet = süre [dk] + λ × CO₂e [kg]**. λ=0 en hızlı; λ=6 → 1 kg CO₂ için en fazla 6 dk daha uzun yol.
- EV'ler yokuş aşağı enerji geri kazandığı için bazı kenarlar negatif → **Johnson yeniden ağırlıklandırma**: c'(u,v) = c(u,v) + k·(h_u − h_v). En iyi rota değişmez, kenarlar ≥ 0. (2 milyon kenar-durumundan 100'ünde küçük negatif kaldı, 0'a kırpıldı.)

### Eşleştirme simülasyonu
- Gün: **12 Mart 2014 (Çarşamba)**, 4.030 gerçek talep, **415 taksi** (her biri kendi vardiyasında: ilk yolculuktan 15 dk önce – son yolculuktan 15 dk sonra).
- Algoritmalar: `nearest` (en yakın araç), `batch_eta` (30 sn'de bir Macar algoritması), `green_fast` (GreenMatch araç seçimi + en hızlı rota), `green` (araç + eko-rota).
- GreenMatch maliyeti: bekleme [dk] + eko-rotanın ek süresi [dk] + λ·(alma + yolculuk CO₂e) [kg] + μ·max(0, aracın bugünkü iş sayısı − ortalama). Varsayılan λ=6 dk/kg, μ=1 dk/iş. Yolcu en fazla 10 dk bekler.
- Yeniden konumlandırma yok (boş taksi durakta bekler).
- Yolcu-km paydası: her algoritmada en hızlı rotanın uzunluğu (adil karşılaştırma).

### Sonuçlar (v1: gerçek kullanım düzeltmesiyle, 3 tohum ortalaması)
| Algoritma | g CO₂e / yolcu-km | Toplam CO₂e | Ort. bekleme | Boş km | Gini |
|---|---|---|---|---|---|
| En yakın araç | 215,6 | — | 3,38 dk | %21,3 | 0,460 |
| Toplu ETA (referans) | 211,0 | 4.172 kg | 3,25 dk | %20,8 | 0,472 |
| GreenMatch: sadece araç seçimi | 188,5 (−%10,7) | — | 3,47 dk | %22,8 | 0,379 |
| **GreenMatch: araç + eko-rota** | **173,7 (−%17,7)** | **3.447 kg** | **3,48 dk (+%7,2)** | %23,3 | **0,381** |

- Hedefler tutuyor: ≥ −%10 emisyon, ≤ +%10 bekleme, Gini düştü (0,47 → 0,38).
- λ taraması (tohum 1, eko-rota): λ2: 199,8 g / 3,30 dk; λ3: 187,9 / 3,34; λ6: 166,6 / 3,50; λ12: 158,5 / 3,78; λ24: 141,4 / 4,09.
- Adalet terimi olmadan (μ=0) λ6: 156,5 g ama Gini 0,462.
- **Rota düzeyi (500 yolculuk, λ6):** hibritlerde −%15–17 CO₂ / +%4–6 süre; dizel/benzin/LPG −%6–7 / +%2; EV −%2–2,5 / +%0,1.
- Gözlem: GreenMatch boş km'yi biraz artırıyor (temiz araç için biraz daha uzaktaki aracı seçiyor) → bahardaki talep tahmini/yeniden konumlandırma bunu azaltmalı.

### Sonuçlar (v2: gerçek kullanım düzeltmesi SIFIR, sadece resmi WLTP) – YARIM KALDI
Kullanıcı "tahmini değer kesinlikle olmaz" dedi; `vehicles.json`'da gerçek kullanım farkı 0 yapıldı ve Octavia ağırlığı resmi değerle (1.353 kg) değiştirildi. Bitmiş çalıştırmalar (`results/summary_v2.jsonl`):
- Toplu ETA: 171,1 / 181,4 / 177,3 g (tohum 1/2/3) → ort. ~176,6
- GreenMatch araç seçimi (λ6 μ1): 156,0 / 169,4 / 168,5
- GreenMatch araç + eko-rota (λ6 μ1): tohum1 **146,2**, tohum2 **155,2** (tohum3 ve λ taraması çalıştırılmadı; kullanıcı durdurdu, EEA verisi beklenecek)
- Demo sayfaları hâlâ v1 değerlerini gösteriyor.

### Çalıştırma sırası
| Adım | Komut |
|---|---|
| 1 | `node graph_pass1.js ../data/porto/train.csv <geçici_klasör> 160` |
| 2 | `node graph_pass2.js <geçici_klasör> data/porto_graph.json` |
| 3 | `node build_elevation.js` |
| 4 | `cp <geçici>/pass1_trips.csv data/porto_trips_sample.csv` ; `node calibrate.js` |
| 5 | `node prepare_requests.js 2014-03-12` |
| 6 | `node route_eval.js` |
| 7 | `node run_batch.js batch_eta:0:0:1 green:6:1:1 ...` (`algo:λ:μ:tohum`; `OUT=` ve `TAG=` ortam değişkenleriyle çıktı dosyası seçilir) |
| 8 | `node demo/build_demo.js` ve `node demo/build_app.js` |

### Sınırlamalar (sunumda söylenmeli)
- Yol ağı 200 m hücre, sokak düzeyinde değil (mesafe hatası medyan %12,6).
- Porto verisi 2013–2014; veride araç modeli yok, 15 model rastgele atandı.
- Filonun 1/3'ü elektrikli (eşit dağılım); gerçek filoda oran düşükse tasarruf düşer.
- ETA hatası %25,3.
- Boş km GreenMatch'te %20,8 → %23,3.
- Eco Skor bizim tanımımız.

---

## 8. Taksi uygulaması prototipi

"Aynı taksi çağrısı, iki uygulama" (artifact). Porto yol ağı + emisyon modeliyle anlık hesap.
- **Sol – Klasik uygulama:** tek seçenek, en kısa sürede gelen taksi, emisyon gösterilmez (altta "perde arkasında" CO₂ notu).
- **Sağ – GreenMatch:** Hızlı / **Green Choice** (önerilen: araç + eko-rota) / Sadece elektrikli. Her seçenekte Eco Skor, varış, yolculuk süresi, CO₂, açıklama. Çağır → yolda → tamamlandı ("klasiğe göre önlenen emisyon", oturum toplamı).
- 5 hazır yolculuk, 4 saat dilimi, taksileri yeniden dağıt (Porto'da taksilerin gerçekten bulunduğu hücrelere ağırlıklı).
- "Bütün güne yayınca" kaydırıcısı: Green Choice'u seçen yolcu payına göre günlük CO₂ (uçlar simülasyon, aradaki doğrusal tahmin).
- Ücret gösterilmiyor (aynı taksimetre varsayımı).
- Örnek: Ribeira → havalimanı, akşam: klasik LPG Dacia Jogger 4.474 g; Green Choice Tesla Model 3 479 g (−%89), 2 dk daha geç.

### Eco Skor
**Eco Skor = 100 − (yolculuğun g CO₂e/km ÷ 2,5)** (alma + yolculuk birlikte). Resmi standart değil, bizim tanımımız.
- Nissan LEAF 89 puan → ~27 g/km. Hesap: 168,5 Wh/km × 1,15 (v1'deki gerçek kullanım payı) × 117,2 g/kWh ≈ 23 g/km düz yolda; boş geliş + yokuş + trafikle ~27.
- Nissan LEAF **tamamen elektrikli** (40 kWh). Klasik uygulamanın "Hızlı" aracı senaryoya göre değişir.

### WLTP ve Wh/km
- **WLTP:** AB'de resmi tüketim/CO₂ ölçümü için laboratuvar testi (~30 dk, ~23 km, ort. 46,5 km/sa; düşük/orta/yüksek/çok yüksek hız fazları). 2017'den beri zorunlu.
- **Wh/km:** elektrikli aracın 1 km için harcadığı elektrik (1000 Wh = 1 kWh). "Şebekeden, şarj kaybı dahil" = prizden çekilen enerji.

---

## 9. Araç verisi: kaynaklar, tahminler ve EEA

### Kullanılan 15 model
| Model | Tür | WLTP | Kütle | Kaynak |
|---|---|---|---|---|
| Tesla Model 3 RWD (2023-) | EV | 132 Wh/km | 1.836 | EV Database |
| Kia Niro EV 64,8 kWh | EV | 162 Wh/km | 1.757 | EV Database |
| Hyundai IONIQ 5 58 kWh RWD | EV | 165 Wh/km | 1.905 | EV Database |
| VW ID.4 Pro (2023-25) | EV | 170,5 Wh/km | 2.144 | EV Database |
| Nissan LEAF 40 kWh | EV | 168,5 Wh/km | 1.580 | EV Database |
| Toyota Corolla TS 1.8 Hybrid 140 | Hibrit | 103 g/km | 1.400 | auto-selection |
| Kia Niro 1.6 GDi Hybrid | Hibrit | 100 g/km | 1.474 | fiches-auto |
| Toyota C-HR 1.8 Hybrid | Hibrit | 108 g/km | 1.430 | ultimatespecs / fiches-auto |
| Toyota RAV4 2.5 Hybrid 2WD | Hibrit | 128,5 g/km | 1.635 | Toyota UK teknik belge |
| Mercedes E 220 d (W214) | Dizel | 125 g/km | 1.850 | encycarpedia |
| Skoda Octavia Combi 2.0 TDI 115 | Dizel | 119 g/km | 1.467 | auto-data.net |
| Peugeot 508 SW 1.5 BlueHDi 130 | Dizel | 137,5 g/km | 1.513 | auto-data.net |
| Skoda Octavia 1.5 TSI 150 | Benzin | 125,5 g/km | **1.353 (resmi, v2)** | Škoda resmi teknik veri PDF |
| Dacia Logan 1.0 TCe 90 | Benzin | 120 g/km | 1.107 | auto-data.net |
| Dacia Jogger 1.0 TCe ECO-G 100 | LPG | 119 g/km | 1.223 | auto-data.net (dacia.de ile tutarlı) |

Aralık verilen değerlerde orta nokta alındı.

### Faktörler
- Gerçek kullanım farkı (v1): benzin %21,1, dizel %17,1 (Avrupa Komisyonu, OBFCM 2022 verisi); hibrit/LPG %21 ve EV %15 **varsayımdı** → v2'de hepsi **0** (sadece resmi WLTP).
- Resmi gerçek-kullanım verisi (OBFCM) sadece benzin ve dizeli ayrı veriyor; hibrit ayrılamıyor, LPG ve elektrikli kapsanmıyor (ICCT 2024 raporu).
- WTT oranı: benzin %28, dizel %24, LPG %12 (UK DESNZ/DEFRA).
- Portekiz şebekesi: 117,2 g CO₂e/kWh (Electricity Maps 2025; 2024: 100,2).

### "Hangi marka hangi yolda ne kadar CO₂?"
**Bunu doğrudan veren resmi kaynak yok.** Resmi kaynak model başına tek sayı (WLTP birleşik) verir. Yola özel değeri biz hesaplıyoruz: hız etkisi WLTP faz değerlerinden, eğim etkisi fizikten (EU-DEM), yol hızları GPS verisinden. Kategori bazında benzer işi yapan modeller: COPERT, HBEFA, EPA MOVES; marka bazında gerçek tüketim: Spritmonitor.

### EEA CO₂ veritabanı (önerilen resmi kaynak)
https://co2cars.apps.eea.europa.eu/ – AB'de tescil edilen her yeni aracın üreticinin bildirdiği resmi test değerleri.
- Alanlar: `Mk` (marka), `Cn` (model), `Ft`/`Fm` (yakıt türü; hibrit H / şarj edilebilir P), `Ewltp` (g/km, LPG dahil), `z` (Wh/km, elektrikli), `m`/`Mt` (kütle), `Ms` (tescil ülkesi), kayıt sayısı.
- Çözdükleri: ikincil kaynaklar, Octavia ağırlığı, test değerlerinin resmi kaynağı.
- Çözmedikleri: hibrit/LPG/EV gerçek kullanım farkı; yol bazında değer.
- **Bekleyen:** Kullanıcı CSV'yi indirip `GreenMatch-Demo/data` klasörüne koyacak (Claude siteye erişemiyor). Filtre: 2023 Final, `Ms = PT` (veya İstanbul için tüm veri). Sonra: Portekiz'de en çok tescil edilen modeller seçilecek, tescil sayısıyla ağırlıklı değerler alınacak, simülasyonlar yeniden çalışacak.

---

## 10. İstanbul'a geçiş araştırması

Görkem Akyol (Araş. Gör., MEF) e-postasındaki öneriler araştırıldı.

### Görkem Hoca'nın önerileri
- **TomTom API:** anlık ortalama hız, trafik yoğunluğu.
- **İETT Sefer Gerçekleşme Web Servisi**, GTFS uyumlu otobüs hatları.
- **QGIS + QuickOSM:** yol ağı.
- Taksi verisi zor (belediye/BiTaksi paylaşmıyor): (1) İBB Toplu Ulaşım Hizmetleri Şube Müdürlüğü ve Trafik Şube Müdürlüğü'ne dilekçe; (2) literatürde kodunu/verisini paylaşan çalışma bulup sentetik ağda (Nguyen-Dupuis, Sioux Falls) kalibre edip İstanbul ölçeğinde varsayımlarla çalıştırma.
- **ÇŞB açık veri portalı:** https://ulasav.csb.gov.tr/ (hoca erişememiş).

### Bulunanlar
| Kaynak | Ne verir | Erişim |
|---|---|---|
| **TomTom Traffic Flow (Flow Segment Data)** | Nokta için currentSpeed, freeFlowSpeed, anlık/serbest seyahat süresi, confidence, roadClosure | Ücretsiz **20.000 istek/ay** (+ Routing 20.000), kredi kartı yok |
| **TomTom Traffic Stats** | Yol parçası başına geçmiş hız (ort., medyan, yüzdelikler) | 30 gün deneme, sonra ücretli |
| **MeTS-10** (Neun ve ark. 2023) | OSM yol parçası başına medyan hız + hacim, 15 dk; **İstanbul dahil**, Ocak–Haziran 2019; HERE GPS (Traffic4cast) | Akademik ücretsiz; HERE kaydı + açık kod: github.com/iarai/MeTS-10 |
| **İBB Saatlik Trafik Yoğunluk** | geohash başına saatlik hız ve araç sayısı | Açık veri (2020–2025) |
| **İBB Trafik İndeksi** | Şehir geneli günlük min/maks/ort. | Açık veri (kaba) |
| **İETT web servisleri** | HatDurakGuzergah, PlanlananSeferSaati, SeferGerceklesme, AracOzellik... | Açık (İBB dokümanı) |
| **Sentetik ağlar** | Sioux Falls, Nguyen-Dupuis vb. | tzin.bgu.ac.il/~bargera/tntp, GitHub kopyaları |
| **EU-DEM** | Türkiye'yi kapsar | OpenTopoData |

### Kritik bulgu: Türkiye şebekesi
Enerji Bakanlığı TUESEF (2021): Operating Margin **0,728**, Build Margin 0,354, Combined Margin 0,541–0,635 tCO₂/MWh. Portekiz'in ~5 katı.
Onat ve ark. (2017): İstanbul'da EV taksi **130 g/km**, LPG **123 g/km** → İstanbul'da elektriklinin avantajı Porto'daki kadar büyük olmayacak; kazanç eko-rota ve boş km'ye kayar.

### Önerilen adımlar
1. İBB'ye dilekçe: İTAKSİ anonim yolculuk kayıtları, taksi filosunun marka/model/yakıt dağılımı, trafik sensör hızları.
2. OSMnx/QuickOSM ile yol ağı (önce Avrupa yakası merkezi).
3. Hızlar: MeTS-10 (HERE kaydı) + İBB saatlik ile güncelleme + TomTom canlı doğrulama.
4. Eğim: EU-DEM.
5. Emisyon: EEA WLTP + Türkiye şebeke faktörü + filo dağılımı (İBB / EY / TÜİK).
6. Talep: sentetik (İBB OD + saatlik + İstanbulkart).
7. Doğrulama: önce Sioux Falls; ETA'yı TomTom Routing ile.
8. Kodu taşı: emisyon/rota/eşleştirme aynı; sadece ağ katmanı OSM ile değişir.

**13 Kasım önerisi:** Porto = çalışan kavram kanıtı; İstanbul = veri kaynakları + geçiş planı (bahar hedefi).

### TomTom ile İstanbul taksi uygulaması planı (BEKLİYOR)
Kullanıcı istedi: TomTom'dan hız çek, İstanbul haritası yarat, 20–30 güzergâhta taksi uygulaması.
**Engeller:** Claude'un ortamlarında internet kapalı (TomTom/OSM/İBB 403). Gerekenler:
1. **TomTom API anahtarı** (developer.tomtom.com, ücretsiz, Traffic + Routing).
2. **Claude ayarlarında ağ izni:** `api.tomtom.com`, `overpass-api.de`, `data.ibb.gov.tr`. Olmazsa: BBBike İstanbul .osm.pbf (~60 MB) elle indirilip klasöre konur; TomTom istekleri web üzerinden tek tek atılır (yavaş).

**Plan:** Bölge Beşiktaş–Şişli–Beyoğlu–Fatih–Kadıköy–Üsküdar (~15×12 km). 25 izleme noktası (Büyükdere Cd., 15 Temmuz Köprüsü, Barbaros Blv., Kennedy Cd., Tarlabaşı, Vatan Cd., D-100 Kozyatağı/Şirinevler, Kadıköy Rıhtım, Bağdat Cd., Ortaköy, Galata ve Unkapanı köprüleri, Üsküdar sahili...). Kota: 25 nokta × 15 dk × 7 gün ≈ 16.800 istek; kalan ~3.000 ETA doğrulama + canlı demo. Hemen başlanırsa veri 1–2 Kasım'da toplanmış olur; önce ilk günün verisiyle sürüm, sonra 7 günlük profil.

---

## 11. Literatür

### Bize en benzeyen (kodlu)
- **Sahebdel, Zeynali, Bashir, Shenoy, Hajiesmaili – "A Holistic Approach for Equity-aware Carbon Reduction of Ridesharing Platforms", ACM e-Energy 2024.** TORA algoritması; RideAustin verisi (44.794 yolculuk); atama + rota filo emisyonunu **−%26** (+%6,2 süre), rota tek başına −%4,2; EV önceliği eşitliği bozuyor. Kod: github.com/Mahsahebdel/e2_ridekit (Python). Veri: data.world/ride-austin. → Bizim −%17,7 sonucumuzla aynı büyüklükte; bizim farkımız adalet terimi.
- **Zeynali ve ark. 2024 – LARA**, emisyonu dikkate alan anlık atama; gerçek veride −%13,9. Kod yok.

### Açık kaynak simülatörler / modeller
- **FleetPy** (TU Münih, MIT): github.com/TUM-VT/FleetPy – toplu eşleştirme, yeniden konumlandırma, EV şarj; emisyon yok.
- **EV-Sim** (Zhang & Varma 2024): github.com/smv30/spatial_queueing – EV taksi filosu, NYC.
- **MATSim DRT + emissions (HBEFA)**.
- **MOVESTAR** – EPA MOVES tabanlı açık emisyon modeli.
- **Eco-Routing Using OSM** (Ghosh ve ark.) – OSM + OSRM + SRTM eğim; kod yok.
- **MeTS-10** – yukarıda.

### İstanbul'a özel
- Onat, Kucukvar, Toufani, Haider – *Carbon Footprint Analysis of Electric Taxis in Istanbul*, IEOM 2017.
- Utku – *Derin Öğrenme Tabanlı Trafik Yoğunluğu Tahmini: İstanbul*, Düzce Üniv. Bilim ve Teknoloji Dergisi, 2023 (İBB saatlik veri, LSTM, hız R² 0,883).
- Olug, Kaya, Tugay, Gündüz Öğüdücü – *IBB Traffic Graph Data: Benchmarking and Road Traffic Prediction Model*, IEEE CAMAD 2024 (İTÜ, 2.451 sensör; veri linki yok, yazarlara yazılabilir).
- Gümüşay, Ünal, Aydın – *Use of GIS in analyzing vehicle emissions: Istanbul*, ISPRS 2008 (saniye saniye ölçüm, eğim ve sıkışıklık).
- İstanbul ulaşım sera gazı 2050 modellemesi (2020); İBB araç emisyon envanteri (tam metinlere erişilemedi).
- **Kodunu/verisini açık paylaşan İstanbul'a özel taksi eşleştirme/emisyon çalışması bulunamadı** → özgünlük argümanı.

---

## 12. Görev dağılımı ve takvim

### Üçünün de anlaması gerekenler (hoca herkese sorabilir)
1. Problem: %38,5 boş km (CARB), %69 fazla emisyon (UCS).
2. Veri: Porto GPS → yol ağı ve saatlik hızlar; araç bilgisi yok, 15 model atandı.
3. Emisyon modeli: resmi değere kalibre, hız/eğim/dur-kalk; WTT ve şebeke faktörü.
4. Rota: süre + λ·CO₂; λ=6 anlamı; Johnson düzeltmesi.
5. Eşleştirme: 30 sn'de Macar algoritması; 3 karşılaştırma yöntemi; adalet terimi μ.
6. Sonuçlar: −%17,7 emisyon, +%7,2 bekleme, Gini 0,47 → 0,38; %11'lik kısım araç seçiminden.
7. Sınırlamalar: ETA %25,3, 1/3 EV filo, boş km artışı, 2013–14 verisi, Eco Skor tanımı.

### Görevler (24 Ekim – 13 Kasım)
**Bilge – algoritma ve sonuçlar:** `emission.js`, `router.js`, `sim_porto.js`'i anlatabilmek; yöntem sunumu; ETA'yı %25 altına indirme denemesi (mesafe aralığına göre kalibrasyon / 100 m hücre); ek senaryolar (λ, düşük EV oranı yedek slayt); sonuç tablo/grafikleri.

**Merve – veri ve doğrulama:** 15 aracı EEA veritabanından doğrulama, ikincil kaynakları resmi değerle değiştirme; Porto veri hattını anlatabilme; "veri ve kaynaklar" slaytları (CARB/UCS alıntıları); kaynak soruları için soru-cevap listesi.

**Kutay – arayüz ve demo:** taksi uygulaması + demo sayfası canlı sunum akışı; yolcu/şoför/müdür ekranlarını sonuçlarla uyumlu hale getirme; Flutter yolcu uygulaması iskeleti; yedek ekran görüntüsü/video.

**Takvim:**
- 31 Ekim'e kadar: herkes kendi bölümünü anlamış; ortak toplantıda herkes başkasının bölümünü 2 dakikada anlatır.
- 7 Kasım'a kadar: geliştirmeler/doğrulamalar biter, slaytların ilk hali.
- 8–12 Kasım: iki prova; biri hoca rolünde soru sorar.

---

## 13. Açık işler

- [ ] **EEA CSV**'si indirilip `GreenMatch-Demo/data`'ya konacak → araç değerleri güncellenecek, simülasyonlar (v2/v3) baştan çalışacak, iki demo sayfası güncellenecek.
- [ ] v2 (gerçek kullanım farkı 0) çalıştırmaları yarım: `green:6:1:3`, λ taraması (2, 3, 12, 24), `green:6:0:1` bekliyor.
- [ ] **TomTom API anahtarı** + Claude ağ izinleri (veya BBBike dosyası) → İstanbul haritası ve İstanbul taksi uygulaması.
- [ ] İBB'ye dilekçe (İTAKSİ verisi, filo dağılımı, sensör hızları).
- [ ] HERE kaydı → MeTS-10 İstanbul hızları (bahar).
- [ ] Türkiye şebeke faktörü seçimi (OM 0,728 / CM 0,541–0,635) – karar verilmeli.
- [ ] Proposal güncellemesi: İstanbul veri kaynakları, Porto kavram kanıtı, Eco Skor tanımı, %38,5 + P1/P2 kırılımı, dipnot kaynaklar.
- [ ] Sunum slaytları (13 Kasım).

---

## 14. Dosyalar ve linkler

### Bilgisayarda (`C:\Users\ASUS\Desktop\GreenMatch-Demo\`)
- `porto_eco/` – Porto eko-rota + eşleştirme kodu: `grid.js`, `emission.js`, `router.js`, `sim_porto.js`, `graph_pass1.js`, `graph_pass2.js`, `build_elevation.js`, `calibrate.js`, `fit_phase.js`, `prepare_requests.js`, `route_eval.js`, `run_batch.js`, `compare_porto.js`, `README.md`
- `porto_eco/data/` – `porto_graph.json`, `calibration.json`, `vehicles.json`, `elev_rows_data.txt`, `porto_simday.json`, `porto_trips_sample.csv`
- `porto_eco/results/` – `summary.jsonl` (v1), `summary_v2.jsonl` (v2, yarım), `route_eval.json`, loglar
- `porto_eco/demo/` – `greenmatch_porto.html` (demo), `greenmatch_taksi_app.html` (taksi uygulaması), şablonlar ve build script'leri
- `data/porto/train.csv` – Porto ham verisi (1,9 GB); `data/fhvhv_tripdata_2025-10.parquet` – NYC verisi (eski demo)
- `SDP_Proposal_GreenMatch_TASLAK.docx` – zaman çizelgesi güncellenmiş proposal (sohbette gönderildi)

### Claude artifact'leri (özel; paylaşmak için sayfanın Paylaş menüsü)
- GreenMatch Arayüzleri (tasarım tuvali): https://claude.ai/artifact/Uqmf22G8bxhz2coMgrzVdj
- GreenMatch Porto (rota gezgini + sonuçlar): https://claude.ai/artifact/PFXxoPQ96kexVeWGVk1J35
- GreenMatch Taksi Uygulaması (klasik vs GreenMatch): https://claude.ai/artifact/HjSN1VTNwTFAsEszdKPDm7

### Başlıca kaynak linkleri
- CARB SB 1014: https://ww2.arb.ca.gov/sites/default/files/2019-12/SB%201014%20-%20Base%20year%20Emissions%20Inventory_December_2019.pdf
- UCS: https://www.ucs.org/sites/default/files/2020-02/Ride-Hailing's-Climate-Risks.pdf
- EPA (galon başına CO₂): https://www.epa.gov/greenvehicles/greenhouse-gas-emissions-typical-passenger-vehicle
- EEA CO₂ cars: https://co2cars.apps.eea.europa.eu/
- EV Database: https://ev-database.org
- Avrupa Komisyonu gerçek kullanım verisi: https://climate.ec.europa.eu/news-your-voice/news/publication-real-world-co2-emissions-and-fuel-consumption-cars-and-vans-collected-2022-2024-07-26_bg
- ICCT 2024 OBFCM: https://theicct.org/wp-content/uploads/2024/01/ID-76-%E2%80%93-EU-WLTP_final.pdf
- Electricity Maps Portekiz: https://www.electricitymaps.com/grid-in-review-2025/portugal
- Enerji Bakanlığı TUESEF: https://enerji.gov.tr/Media/Dizin/EVCED/tr/%C3%87evreVe%C4%B0klim/%C4%B0klimDe%C4%9Fi%C5%9Fikli%C4%9Fi/TUESEmisyonFktr/Belgeler/TUESEF_Bilgi_Formu.pdf
- OpenTopoData EU-DEM: https://api.opentopodata.org/v1/eudem25m
- İBB Ulaşım Modeli: https://data.ibb.gov.tr/en/dataset/istanbul-ulasim-modeli
- İBB Saatlik Trafik Yoğunluk: https://data.ibb.gov.tr/en/dataset/hourly-traffic-density-data-set
- TomTom Flow Segment Data: https://docs.tomtom.com/traffic-api/documentation/traffic-flow/flow-segment-data
- TomTom fiyatlandırma: https://docs.tomtom.com/pricing
- MeTS-10: https://arxiv.org/pdf/2302.08761 · https://github.com/iarai/MeTS-10
- Sahebdel ve ark. 2024: https://arxiv.org/html/2402.01644v2 · https://github.com/Mahsahebdel/e2_ridekit
- FleetPy: https://github.com/TUM-VT/FleetPy
- Test ağları: https://tzin.bgu.ac.il/~bargera/tntp
- Onat ve ark. 2017: https://www.researchgate.net/publication/321850317_Carbon_Footprint_Analysis_of_Electric_Taxis_in_Istanbul
- Utku 2023: https://dergipark.org.tr/en/pub/dubited/issue/79166/1139534
- Olug ve ark. 2024: https://research.itu.edu.tr/tr/publications/ibb-traffic-graph-data-benchmarking-and-road-traffic-prediction-m/

---

## 15. Terimler sözlüğü

| Terim | Anlamı |
|---|---|
| **Boş km (deadhead)** | Araçta yolcu yokken yapılan km (P1 + P2) |
| **WLTP** | AB'nin resmi laboratuvar tüketim/CO₂ testi |
| **Wh/km** | Elektrikli aracın km başına elektrik tüketimi |
| **WTT / TTW / WTW** | Kuyudan tanka (yakıt üretimi) / tanktan tekerleğe (egzoz) / kuyudan tekerleğe (toplam) |
| **CO₂e** | CO₂ eşdeğeri (diğer sera gazları dahil) |
| **ETA** | Tahmini varış süresi |
| **MAPE** | Ortalama mutlak yüzde hata |
| **λ (lambda)** | Emisyon ağırlığı: 1 kg CO₂ kaç dakika bekleme/uzama değerinde |
| **μ (mu)** | Adalet terimi: ortalamadan fazla iş almış araca iş başına ek maliyet (dk) |
| **Macar algoritması** | Talepleri ve araçları toplam maliyet en az olacak şekilde eşleştiren optimizasyon |
| **Batched ETA** | Talepleri birkaç saniye biriktirip bekleme süresine göre toplu eşleştirme (referans yöntem) |
| **Johnson yeniden ağırlıklandırma** | Negatif kenarları potansiyel fonksiyonuyla ≥ 0 yapıp Dijkstra'yı geçerli kılma |
| **Gini** | Eşitsizlik ölçüsü (0 = tam eşit); burada şoförler arası iş dağılımı |
| **Eco Skor** | 100 − (g CO₂e/km ÷ 2,5); bizim tanımımız |
| **OBFCM** | Araç içi yakıt tüketimi ölçüm cihazı verisi (AB gerçek kullanım verisi) |
| **MeTS-10** | 10 şehir (İstanbul dahil) için OSM yol parçası bazında trafik hızı veriseti |
