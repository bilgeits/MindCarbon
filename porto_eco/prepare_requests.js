// Simülasyon günü (2014-03-12 Çarşamba) talepleri ve taksi vardiyaları.
// Porto'da Mart 2014 yaz saati öncesi: yerel saat = UTC.
const fs = require('fs');
const G = require('./grid.js');
const R = require('./router.js');
const DAY = process.argv[2] || '2014-03-12';
const graph = JSON.parse(fs.readFileSync('data/porto_graph.json', 'utf8'));
const net = R.createNetwork(graph, JSON.parse(fs.readFileSync('data/calibration.json', 'utf8')));
const lines = fs.readFileSync('data/porto_trips_sample.csv', 'utf8').trim().split('\n');
const ix = Object.fromEntries(lines[0].split(',').map((h, i) => [h, i]));
const day0 = Date.parse(DAY + 'T00:00:00Z') / 1000;
const req = [], taxis = new Map();
let dropped = { outside: 0, sameNode: 0 };
for (const l of lines.slice(1)) {
  const f = l.split(',');
  if (f[ix.role] !== 'simday' || f[ix.date] !== DAY) continue;
  const t = +f[ix.ts] - day0, dur = (+f[ix.n_points] - 1) * 15;
  const tx = f[ix.taxi_id];
  const sh = taxis.get(tx) || { start: Infinity, end: -Infinity, first: null, n: 0 };
  if (t < sh.start) { sh.start = t; sh.first = +f[ix.o_cell]; }
  sh.end = Math.max(sh.end, t + dur); sh.n++; taxis.set(tx, sh);
  const o = net.nodeOfCell(+f[ix.o_cell]), d = net.nodeOfCell(+f[ix.d_cell]);
  if (o < 0 || d < 0) { dropped.outside++; continue; }
  if (o === d) { dropped.sameNode++; continue; }
  req.push([t, o, d, dur, +(+f[ix.gps_km]).toFixed(3), f[ix.call_type]]);
}
req.sort((a, b) => a[0] - b[0]);
const shifts = [...taxis.values()].map(s => [Math.max(0, s.start - 900), Math.min(86400, s.end + 900), net.nodeOfCell(s.first), s.n]).filter(s => s[2] >= 0);
const hourly = new Array(24).fill(0); for (const r of req) hourly[Math.floor(r[0] / 3600)]++;
const active = new Array(24).fill(0); for (const s of shifts) for (let h = 0; h < 24; h++) if (s[0] < (h + 1) * 3600 && s[1] > h * 3600) active[h]++;
const out = { day: DAY, requests: req, shifts, hourly, activeTaxisByHour: active, dropped,
  note: 'requests: [t_saniye, başlangıç_düğümü, bitiş_düğümü, gerçek_süre_s, gps_km, çağrı_tipi]; shifts: [başlangıç_s, bitiş_s, ilk_düğüm, yolculuk_sayısı] (ilk yolculuktan 15 dk önce - son yolculuktan 15 dk sonra)' };
fs.writeFileSync('data/porto_simday.json', JSON.stringify(out));
console.log(DAY, 'talep', req.length, 'taksi', shifts.length, JSON.stringify(dropped));
console.log('saatlik talep', hourly.join(' '));
console.log('aktif taksi ', active.join(' '));
