/*
 * GreenMatch Porto - Adım 2: hız histogramlarından yönlü yol grafı.
 *  - Bir kenar (hücre A -> komşu hücre B) en az MIN_OBS geçişle gözlenmişse tutulur (tek yönlü sokaklar korunur).
 *  - Her saat dilimi için medyan hız; o dilimde az gözlem varsa tüm gün medyanı kullanılır.
 *  - Sadece en büyük güçlü bağlı bileşen tutulur (her düğümden her düğüme gidilebilsin).
 * Kullanım: node graph_pass2.js <pass1_klasörü> <çıktı.json>
 */
const fs = require('fs');
const path = require('path');
const G = require('./grid.js');
const [,, DIR, OUT] = process.argv;
const MIN_OBS = 20, MIN_BUCKET_OBS = 8;
const NB = G.BUCKETS.length, NBIN = G.SPEED_BINS;
const hist = new Uint32Array(fs.readFileSync(path.join(DIR, 'pass1_hist.u32')).buffer.slice(0));
const visit = new Uint32Array(fs.readFileSync(path.join(DIR, 'pass1_visit.u32')).buffer.slice(0));
const pace = new Float64Array(fs.readFileSync(path.join(DIR, 'pass1_pace.f64')).buffer.slice(0));
const pcnt = new Uint32Array(fs.readFileSync(path.join(DIR, 'pass1_pacecnt.u32')).buffer.slice(0));
const stop = new Float64Array(fs.readFileSync(path.join(DIR, 'pass1_stop.f64')).buffer.slice(0));
const pass = new Uint32Array(fs.readFileSync(path.join(DIR, 'pass1_pass.u32')).buffer.slice(0));

function median(h, off) {           // h[off .. off+NBIN)
  let tot = 0;
  for (let i = 0; i < NBIN; i++) tot += h[off + i];
  if (!tot) return [0, 0];
  let acc = 0;
  for (let i = 0; i < NBIN; i++) { acc += h[off + i]; if (acc >= tot / 2) return [i * 2 + 1, tot]; }
  return [NBIN * 2 - 1, tot];
}

const edges = [];
const all = new Uint32Array(NBIN);
for (let c = 0; c < G.NCELL; c++) for (let d = 0; d < 8; d++) {
  const base = (c * 8 + d) * NB * NBIN;
  all.fill(0);
  let tot = 0;
  for (let b = 0; b < NB; b++) for (let i = 0; i < NBIN; i++) { all[i] += hist[base + b * NBIN + i]; tot += hist[base + b * NBIN + i]; }
  if (tot < MIN_OBS) continue;
  const [vAll] = median(all, 0);
  const v = [], n = [], hv = [];
  let pS = 0, pN = 0;
  for (let b = 0; b < NB; b++) { pS += pace[(c * 8 + d) * NB + b]; pN += pcnt[(c * 8 + d) * NB + b]; }
  const hAll = pN ? 3.6 / (pS / pN) : vAll;   // harmonik ortalama hız (km/sa) = 1 / ortalama "pace"
  for (let b = 0; b < NB; b++) {
    const [vb, nb] = median(hist, base + b * NBIN);
    v.push(nb >= MIN_BUCKET_OBS ? vb : vAll); n.push(nb);
    const k = (c * 8 + d) * NB + b;
    hv.push(pcnt[k] >= MIN_BUCKET_OBS ? +(3.6 / (pace[k] / pcnt[k])).toFixed(1) : +hAll.toFixed(1));
  }
  const to = G.neighbor(c, d);
  edges.push({ a: c, b: to, d, v, n, tot, vAll, hv });
}

// --- en büyük güçlü bağlı bileşen (iteratif Kosaraju)
const out = new Map(), inn = new Map();
for (const e of edges) {
  if (!out.has(e.a)) out.set(e.a, []); out.get(e.a).push(e.b);
  if (!inn.has(e.b)) inn.set(e.b, []); inn.get(e.b).push(e.a);
}
const nodes = [...new Set(edges.flatMap(e => [e.a, e.b]))];
const seen = new Set(), order = [];
for (const s of nodes) {
  if (seen.has(s)) continue;
  const stack = [[s, 0]]; seen.add(s);
  while (stack.length) {
    const top = stack[stack.length - 1];
    const nb = out.get(top[0]) || [];
    if (top[1] < nb.length) { const w = nb[top[1]++]; if (!seen.has(w)) { seen.add(w); stack.push([w, 0]); } }
    else { order.push(top[0]); stack.pop(); }
  }
}
const comp = new Map(); let nc = 0;
for (let i = order.length - 1; i >= 0; i--) {
  const s = order[i]; if (comp.has(s)) continue;
  const st = [s]; comp.set(s, nc);
  while (st.length) { const u = st.pop(); for (const w of inn.get(u) || []) if (!comp.has(w)) { comp.set(w, nc); st.push(w); } }
  nc++;
}
const size = new Array(nc).fill(0); for (const c of comp.values()) size[c]++;
const big = size.indexOf(Math.max(...size));
const keep = nodes.filter(n => comp.get(n) === big).sort((a, b) => a - b);
const idx = new Map(keep.map((c, i) => [c, i]));
const kept = edges.filter(e => idx.has(e.a) && idx.has(e.b));

const graph = {
  meta: {
    source: 'Porto taksi GPS izleri (ECML/PKDD 2015, UCI), 2013-07 .. 2014-06, sadece hafta içi',
    cell_m: G.CELL, grid: { LAT0: G.LAT0, LON0: G.LON0, XMIN: G.XMIN, YMIN: G.YMIN, NX: G.NX, NY: G.NY },
    buckets: G.BUCKETS, min_obs: MIN_OBS, min_bucket_obs: MIN_BUCKET_OBS,
    edges_candidate: edges.length, nodes_candidate: nodes.length, components: nc,
    nodes: keep.length, edges: kept.length,
    transitions_used: kept.reduce((a, e) => a + e.tot, 0),
  },
  cells: keep,                                           // hücre numaraları
  visits: keep.map(c => visit[c]),
  edges: kept.map(e => [idx.get(e.a), idx.get(e.b), ...e.v, ...e.hv]),   // [from, to, medyan hız x5, harmonik ort. hız x5] (km/sa)
  // hücreye her girişte ortalama duraklama (sn): ışık/kavşak/trafik; yolcu alma-bırakma duruşları hariç
  delay: keep.map(c => G.BUCKETS.map((_, b) => { const p = pass[c * NB + b]; return p >= 20 ? +(stop[c * NB + b] / p).toFixed(1) : null; })),
  edgeObs: kept.map(e => e.tot),
};
fs.writeFileSync(OUT, JSON.stringify(graph));
console.log(JSON.stringify(graph.meta, null, 1));
const vs = kept.map(e => e.vAll).sort((a, b) => a - b);
console.log('kenar medyan hız dağılımı p10/p50/p90:', vs[Math.floor(vs.length * .1)], vs[Math.floor(vs.length * .5)], vs[Math.floor(vs.length * .9)]);
for (let b = 0; b < NB; b++) { const s = kept.map(e => e.v[b]).sort((a, c) => a - c); console.log(G.BUCKETS[b][2], 'medyan', s[Math.floor(s.length / 2)], 'km/sa, gözlemli kenar oranı', (kept.filter(e => e.n[b] >= MIN_BUCKET_OBS).length / kept.length).toFixed(2)); }
