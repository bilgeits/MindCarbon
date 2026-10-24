# TomTom İstanbul trafik hızı toplayıcı – kurulum

Merve ve Kutay için. Her biri kendi bilgisayarında, **kendi TomTom anahtarıyla** çalıştırır.

## 1. Python var mı?
Komut İstemi'ni (Windows: Başlat → "cmd") aç ve yaz:
```
python --version
```
"Python 3.x" çıkıyorsa tamam. Çıkmıyorsa python.org/downloads adresinden kur; kurulumda **"Add Python to PATH"** kutusunu işaretle.

## 2. Anahtarını test et
Tarayıcıya yapıştır (sondaki ANAHTARIN yerine kendi anahtarın):
```
https://api.tomtom.com/traffic/services/4/flowSegmentData/absolute/10/json?point=41.0438,29.0094&key=ANAHTARIN
```
`currentSpeed` görüyorsan hazırsın.

## 3. Çalıştır
`tomtom_toplayici.py` dosyasını bir klasöre koy (ör. Masaüstü\tomtom). Komut İstemi'nde:
```
cd Desktop\tomtom
python tomtom_toplayici.py --key ANAHTARIN --ad merve
```
(Kutay `--ad kutay` yazar.) Pencere açık kalmalı; her 15 dakikada "Tur tamam: 25/25 başarılı" yazar.

## 4. Bilgisayar 7 gün uyumasın
- Windows: Ayarlar → Sistem → Güç → "Prize takılıyken uyku: Hiçbir zaman", ekran kapanabilir.
- Mac: Terminal'de `caffeinate -i python3 tomtom_toplayici.py --key ... --ad ...`
- Şarj kablosu takılı, Wi-Fi bağlı kalsın. Windows Update'in yeniden başlatmasını 1 hafta ertele.

## 5. Kapanırsa
Aynı komutu tekrar çalıştır; dosyaya eklemeye devam eder. Boşluk olan saatler diğer kişinin verisinden tamamlanır.

## 6. Bitince
`tomtom_istanbul_<ad>.csv` ve `tomtom_log_<ad>.txt` dosyalarını Bilge'ye gönder (Drive / WhatsApp / e-posta).

## Kota
25 nokta × 96 tur/gün × 7 gün = 16.800 istek (ücretsiz kota ayda 20.000). Program 19.000'de kendini durdurur.
