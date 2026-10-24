/*
 * GreenMatch Porto - ETA kalibrasyonu ve doğrulaması.
 * Doğrulama yolculukları: hafta içi, TRIP_ID mod 50 = 0 (hız istatistiğine hiç girmedi).
 * Yarısıyla (çift satırlar) dolambaç katsayısı ve saat dilimi süre katsayıları uydurulur,
 * diğer yarısında hata ölçülür. Karşılaştırma: kuş uçuşu mesafe / ortalama hız (naif tahmin).
 * Çıktı: data/calibration.json
 */
const fs = require('fs');
const G = require('./grid.js');
const R = require('./router.js');
const graph = JSON.parse(fs.readFileSync('data/porto_graph.json', 'utf8'));
const lines = fs.readFileSync('data/porto_trips_sample.csv', 'utf8').trim().split('\n');
const H = lines[0].split(','); const ix = Object.fromEntries(H.map((h, i) => [h, i]));
const trips = [];
for (const l of lines.slice(1)) {
  const f = l.split(',');
  if (f[ix.role] !== 'valid') continue;
  const o = { o: +f[ix.o_cell], d: +f[ix.d_cell], hour: +f[ix.hour], n: +f[ix.n_points], gpsKm: +f[ix.gps_km],
    olat: +f[ix.o_lat], olon: +f[ix.o_lon], dlat: +f[ix.d_lat], dlon: +f[ix.d_lon] };
  o.actualS = (o.n - 1) * 15;
  o.lineKm = G.distM([o.olon, o.olat], [o.dlon, o.dlat]) / 1000;
  if (o.o < 0 || o.d < 0 || o.n < 8 || o.gpsKm < 1 || o.lineKm < 0.8) continue;
  if (o.gpsKm / o.lineKm > 2.5) continue;                  // tur atan / dolaşan yolculuklar
  const v = o.gpsKm / (o.actualS / 3600); if (v < 5 || v > 100) continue;
  trips.push(o);
}
const net0 = R.createNetwork(graph, null);
for (const t of trips) {
  const a = net0.nodeOfCell(t.o), b = net0.nodeOfCell(t.d); t.a = a; t.b = b;
  t.bucket = G.bucketOf(t.hour);
  const r = R.route(net0, a, b, t.bucket, null, 0);
  t.predS0 = r ? r.timeS : NaN; t.centerKm = r ? r.distM / 1000 : NaN;
}
const ok = trips.filter(t => isFinite(t.predS0) && t.centerKm > 0.5);
const fit = ok.filter((_, i) => i % 2 === 0), test = ok.filter((_, i) => i % 2 === 1);
const med = a => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
const detour = med(fit.map(t => t.gpsKm / t.centerKm));
const NB = graph.meta.buckets.length;
// süre modeli: gerçek = sabit (yolcu alma/bırakma, park) + katsayı x graf süresi; sabit, MAPE'yi en aza indirecek şekilde aranır
const timeFactor = [];
let overheadS = 0, bestM = Infinity;
for (let a = 0; a <= 180; a += 10) {
  const tf = [];
  for (let b = 0; b < NB; b++) { const s = fit.filter(t => t.bucket === b); tf.push(med(s.map(t => (t.actualS - a) / (t.predS0 * detour)))); }
  const m = fit.reduce((s, t) => s + Math.abs(a + tf[t.bucket] * t.predS0 * detour - t.actualS) / t.actualS, 0) / fit.length;
  if (m < bestM) { bestM = m; overheadS = a; timeFactor.length = 0; tf.forEach(x => timeFactor.push(+x.toFixed(3))); }
}
// naif tahmin: kuş uçuşu x dolambaç / ortalama hız (fit kümesinden)
const naiveSpeed = fit.reduce((s, t) => s + t.lineKm, 0) / fit.reduce((s, t) => s + t.actualS, 0);
function errs(pred) {
  const ape = test.map(t => Math.abs(pred(t) - t.actualS) / t.actualS).sort((a, b) => a - b);
  const bias = test.reduce((s, t) => s + (pred(t) - t.actualS), 0) / test.reduce((s, t) => s + t.actualS, 0);
  return { MAPE: +(ape.reduce((a, b) => a + b, 0) / ape.length * 100).toFixed(1), medianAPE: +(ape[Math.floor(ape.length / 2)] * 100).toFixed(1), bias: +(bias * 100).toFixed(1) };
}
const graphErr = errs(t => overheadS + t.predS0 * detour * timeFactor[t.bucket]);
const naiveErr = errs(t => t.lineKm / naiveSpeed);
const distErr = (() => { const ape = test.map(t => Math.abs(t.centerKm * detour - t.gpsKm) / t.gpsKm).sort((a, b) => a - b); return { MAPE: +(ape.reduce((a, b) => a + b, 0) / ape.length * 100).toFixed(1), medianAPE: +(ape[Math.floor(ape.length / 2)] * 100).toFixed(1) }; })();
const out = {
  detour: +detour.toFixed(3), timeFactor, overheadS,
  validation: { trips_candidate: trips.length, trips_fit: fit.length, trips_test: test.length,
    eta_graph: graphErr, eta_naive_straightline: naiveErr, distance_graph: distErr,
    median_actual_min: +(med(test.map(t => t.actualS)) / 60).toFixed(1), median_gps_km: +med(test.map(t => t.gpsKm)).toFixed(2) },
  note: 'detour: GPS yol uzunluğu / hücre merkezleri arası rota uzunluğu (medyan). timeFactor: gerçek süre / graf süresi (medyan), saat dilimi başına; GPS hızlarına girmeyen duraklamaları (ışık, kavşak) karşılar.'
};
fs.writeFileSync('data/calibration.json', JSON.stringify(out, null, 1));
console.log(JSON.stringify(out, null, 1));
