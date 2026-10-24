/*
 * GreenMatch Porto - Adım 3: hücre yükseklikleri ve kenar eğimleri.
 * Kaynak: EU-DEM v1.1 (25 m), OpenTopoData API (api.opentopodata.org/v1/eudem25m).
 * Her çift hücre satırı için batı-doğu doğrusu boyunca 90 örnek alındı (= her hücre merkezi).
 * Tek satırlar komşu iki satırın ortalaması. Deniz (null) = 0 m.
 * Çıktı: data/porto_graph.json içine `elev` (m) eklenir.
 */
const fs = require('fs');
const G = require('./grid.js');
const rows = {};
for (const line of fs.readFileSync('data/elev_rows_data.txt', 'utf8').trim().split('\n')) {
  const [cy, vals] = line.split(':');
  const v = vals.split(',').map(s => (s === 'null' || s === '' ? null : Number(s)));
  if (v.length !== 90) throw new Error('satır ' + cy + ' eksik');
  rows[Number(cy)] = v;
}
const H = new Float32Array(G.NCELL);
for (let cy = 0; cy < G.NY; cy++) for (let cx = 0; cx < G.NX; cx++) {
  let h;
  if (rows[cy]) h = rows[cy][cx];
  else { const a = rows[cy - 1] ? rows[cy - 1][cx] : null, b = rows[cy + 1] ? rows[cy + 1][cx] : null;
    h = a == null && b == null ? null : a == null ? b : b == null ? a : (a + b) / 2; }
  H[cy * G.NX + cx] = h == null ? 0 : h;
}
// satır sırası tutarlılık kontrolü: komşu satırlar arası ortalama mutlak fark
let diffs = [];
for (let cy = 0; cy + 2 < G.NY; cy += 2) { let s = 0, n = 0; for (let cx = 0; cx < 90; cx++) { const a = rows[cy][cx], b = rows[cy + 2][cx]; if (a != null && b != null) { s += Math.abs(a - b); n++; } } diffs.push([cy, +(s / n).toFixed(1)]); }
console.log('komşu satır ort. |fark| (m):', diffs.map(d => d.join(':')).join(' '));
const g = JSON.parse(fs.readFileSync('data/porto_graph.json', 'utf8'));
g.elev = g.cells.map(c => Math.round(H[c] * 10) / 10);
g.meta.elevation = 'EU-DEM v1.1 25 m (OpenTopoData), 400 m satır aralığı, 200 m sütun aralığı; tek satırlar enterpolasyon';
fs.writeFileSync('data/porto_graph.json', JSON.stringify(g));
// eğim dağılımı
const gr = [];
for (const e of g.edges) { const [a, b] = e; const ca = G.cellCenter(g.cells[a]), cb = G.cellCenter(g.cells[b]); const d = Math.hypot(ca[0] - cb[0], ca[1] - cb[1]); gr.push((g.elev[b] - g.elev[a]) / d * 100); }
gr.sort((a, b) => a - b);
const q = p => gr[Math.floor(gr.length * p)].toFixed(1);
console.log('kenar eğimi % (merkezler arası) p5/p25/p50/p75/p95:', q(.05), q(.25), q(.5), q(.75), q(.95), ' |eğim|>5% oranı', (gr.filter(x => Math.abs(x) > 5).length / gr.length).toFixed(2));
const sel = [[41.1406, -8.6110, 'Ribeira'], [41.1496, -8.6109, 'Aliados'], [41.1579, -8.6291, 'Boavista'], [41.2370, -8.6700, 'Havalimanı']];
for (const [la, lo, n] of sel) console.log(n, H[G.cellOf([lo, la])].toFixed(1), 'm');
