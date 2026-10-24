/*
 * GreenMatch Porto - Adım 1: GPS izlerinden yol ağı ve hız istatistikleri.
 *
 * train.csv'yi bayt aralıkları halinde okur (her çağrı bir parça; kaldığı yerden devam eder).
 * Şehir 200 m'lik kare hücrelere bölünür. Ardışık iki GPS noktası (15 sn arayla) arasındaki
 * doğru parçası 20 m'de bir örneklenir; araç bir hücreden komşu hücreye geçtiğinde o "kenar"
 * için segment hızı, saat dilimine göre bir hız histogramına eklenir.
 * Sadece hafta içi günler kullanılır (simülasyon günü de hafta içi).
 *
 * Kullanım: node graph_pass1.js <train.csv> <durum_klasörü> <saniye_bütçesi>
 */
const fs = require('fs');
const path = require('path');

const [,, TRAIN, OUT, BUDGET_S = '150'] = process.argv;
const G = require('./grid.js');

const NB = G.BUCKETS.length;      // saat dilimi sayısı
const NBIN = G.SPEED_BINS;        // 2 km/sa'lik hız kutuları
const SLOTS = G.NCELL * 8;        // her hücreden 8 komşu yön
const STATE = path.join(OUT, 'pass1_state.json');
const HIST = path.join(OUT, 'pass1_hist.u32');
const VISIT = path.join(OUT, 'pass1_visit.u32');
const TRIPS = path.join(OUT, 'pass1_trips.csv');
const PACE = path.join(OUT, 'pass1_pace.f64');     // kenar x dilim: Σ(1/v) [s/m] ve sayısı
const PCNT = path.join(OUT, 'pass1_pacecnt.u32');
const STOP = path.join(OUT, 'pass1_stop.f64');     // hücre x dilim: duraklama saniyesi (ilk/son 2 nokta hariç)
const PASS = path.join(OUT, 'pass1_pass.u32');     // hücre x dilim: hücreye giriş sayısı

fs.mkdirSync(OUT, { recursive: true });
let st = fs.existsSync(STATE) ? JSON.parse(fs.readFileSync(STATE, 'utf8')) : null;
const size = fs.statSync(TRAIN).size;
if (!st) {
  st = { pos: 0, rows: 0, weekdayRows: 0, segs: 0, segsJump: 0, segsStill: 0, transitions: 0, nonAdjacent: 0, outside: 0, done: false };
  fs.writeFileSync(HIST, Buffer.alloc(SLOTS * NB * NBIN * 4));
  fs.writeFileSync(VISIT, Buffer.alloc(G.NCELL * 4));
  fs.writeFileSync(PACE, Buffer.alloc(SLOTS * NB * 8)); fs.writeFileSync(PCNT, Buffer.alloc(SLOTS * NB * 4));
  fs.writeFileSync(STOP, Buffer.alloc(G.NCELL * NB * 8)); fs.writeFileSync(PASS, Buffer.alloc(G.NCELL * NB * 4));
  fs.writeFileSync(TRIPS, 'trip_id,taxi_id,call_type,ts,dow,date,hour,o_cell,d_cell,o_lat,o_lon,d_lat,d_lon,n_points,gps_km,role\n');
}
if (st.done) { console.log('zaten bitti', st); process.exit(0); }

const hist = new Uint32Array(fs.readFileSync(HIST).buffer.slice(0));
const visit = new Uint32Array(fs.readFileSync(VISIT).buffer.slice(0));
const pace = new Float64Array(fs.readFileSync(PACE).buffer.slice(0)), pcnt = new Uint32Array(fs.readFileSync(PCNT).buffer.slice(0));
const stop = new Float64Array(fs.readFileSync(STOP).buffer.slice(0)), pass = new Uint32Array(fs.readFileSync(PASS).buffer.slice(0));
const tripOut = [];

const fmt = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Lisbon', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', weekday: 'short', hour12: false });
const DOW = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 0 };

function processLine(line) {
  // "TRIP_ID","CALL_TYPE","ORIGIN_CALL","ORIGIN_STAND","TAXI_ID","TIMESTAMP","DAY_TYPE","MISSING_DATA","POLYLINE"
  const k = line.indexOf('"[');
  if (k < 0) return;
  const head = line.slice(0, k).split(',').map(s => s.replace(/"/g, ''));
  if (head[0] === 'TRIP_ID') return;
  st.rows++;
  const tripId = head[0], call = head[1], taxi = head[4], ts = Number(head[5]);
  if (head[7] === 'True') return;
  const parts = {};
  for (const p of fmt.formatToParts(new Date(ts * 1000))) parts[p.type] = p.value;
  const dow = DOW[parts.weekday];
  const date = `${parts.year}-${parts.month}-${parts.day}`;
  const hour = Number(parts.hour) % 24;
  let pts;
  try { pts = JSON.parse(line.slice(k + 1, line.lastIndexOf(']') + 1)); } catch (e) { return; }
  if (pts.length < 2) return;

  const role = G.SIM_DAYS.includes(date) ? 'simday' : (dow >= 1 && dow <= 5 && (Number(tripId.slice(-6)) % 50 === 0) ? 'valid' : '');
  // Yolculuk özeti (simülasyon günleri + doğrulama örneklemi)
  if (role) {
    let km = 0;
    for (let i = 1; i < pts.length; i++) km += G.distM(pts[i - 1], pts[i]) / 1000;
    const o = G.cellOf(pts[0]), d = G.cellOf(pts[pts.length - 1]);
    tripOut.push([tripId, taxi, call, ts, dow, date, hour, o, d, pts[0][1], pts[0][0], pts[pts.length - 1][1], pts[pts.length - 1][0], pts.length, km.toFixed(3), role].join(','));
  }
  // Hız istatistiği: hafta içi, doğrulama örneklemi ve simülasyon günleri hariç (sızıntı olmasın)
  if (!(dow >= 1 && dow <= 5) || role) return;
  st.weekdayRows++;
  for (let i = 1; i < pts.length; i++) {
    const p = pts[i - 1], q = pts[i];
    const b = G.bucketOf((hour + Math.floor((i - 1) * 15 / 3600)) % 24);
    const dm = G.distM(p, q);
    st.segs++;
    if (dm > 600) { st.segsJump++; continue; }          // 15 sn'de 600 m = 144 km/sa: GPS sıçraması
    if (dm < 5) {                                        // duruyor (ışık, kavşak, trafik): geçiş yok
      st.segsStill++;
      if (i >= 3 && i <= pts.length - 3) { const c0 = G.cellOf(p); if (c0 >= 0) stop[c0 * NB + b] += 15; }   // yolcu alma/bırakma duruşları hariç
      continue;
    }
    const kmh = dm / 15 * 3.6;
    const bin = Math.min(NBIN - 1, Math.floor(kmh / 2));
    const n = Math.max(1, Math.ceil(dm / 20));
    let prev = G.cellOf(p);
    if (prev < 0) { st.outside++; continue; }
    visit[prev]++;
    for (let s = 1; s <= n; s++) {
      const f = s / n;
      const c = G.cellOf([p[0] + (q[0] - p[0]) * f, p[1] + (q[1] - p[1]) * f]);
      if (c < 0) { st.outside++; break; }
      if (c === prev) continue;
      const dir = G.dirOf(prev, c);
      if (dir < 0) { st.nonAdjacent++; prev = c; continue; }
      hist[((prev * 8 + dir) * NB + b) * NBIN + bin]++;
      pace[(prev * 8 + dir) * NB + b] += 1 / (dm / 15); pcnt[(prev * 8 + dir) * NB + b]++;
      pass[c * NB + b]++;
      st.transitions++;
      visit[c]++;
      prev = c;
    }
  }
}

const t0 = Date.now();
const fd = fs.openSync(TRAIN, 'r');
const CH = 8 * 1024 * 1024;
const buf = Buffer.alloc(CH);
let carry = '';
let pos = st.pos;
while (Date.now() - t0 < Number(BUDGET_S) * 1000) {
  const n = fs.readSync(fd, buf, 0, CH, pos);
  if (n <= 0) { if (carry) processLine(carry); st.done = true; pos = size; break; }
  const text = carry + buf.toString('latin1', 0, n);
  const lastNl = text.lastIndexOf('\n');
  const lines = text.slice(0, lastNl).split('\n');
  carry = text.slice(lastNl + 1);
  for (const l of lines) processLine(l);
  pos += n;
}
// yarım satırı bir sonraki çağrıya bırak
st.pos = pos - Buffer.byteLength(carry, 'latin1');
if (st.done) st.pos = size;
fs.closeSync(fd);
fs.writeFileSync(HIST, Buffer.from(hist.buffer));
fs.writeFileSync(VISIT, Buffer.from(visit.buffer));
fs.writeFileSync(PACE, Buffer.from(pace.buffer)); fs.writeFileSync(PCNT, Buffer.from(pcnt.buffer));
fs.writeFileSync(STOP, Buffer.from(stop.buffer)); fs.writeFileSync(PASS, Buffer.from(pass.buffer));
if (tripOut.length) fs.appendFileSync(TRIPS, tripOut.join('\n') + '\n');
fs.writeFileSync(STATE, JSON.stringify(st));
console.log(`ilerleme %${(st.pos / size * 100).toFixed(1)}  satır ${st.rows}  ${(Date.now() - t0) / 1000}s`, JSON.stringify(st));
