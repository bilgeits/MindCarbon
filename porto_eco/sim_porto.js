/*
 * GreenMatch Porto - yol ağı üzerinde, araç modeline özel emisyonla eşleştirme simülasyonu.
 *
 * Algoritmalar (hepsi aynı talep, aynı filo, aynı vardiyalar):
 *   nearest     : En yakın araç. Talepler geliş sırasıyla, en kısa sürede varacak boş araca. En hızlı rotalar.
 *   batch_eta   : Toplu ETA. Her 30 sn'de bekleyen talepler ve boş araçlar Macar algoritmasıyla,
 *                 toplam bekleme süresi en az olacak şekilde eşleştirilir. En hızlı rotalar.
 *   green       : GreenMatch. Aynı toplu eşleştirme; maliyet = bekleme [dk] + λ·CO2e [kg].
 *                 CO2e, o aracın modeline göre hesaplanır (alma + yolculuk). Rotalar da aynı
 *                 λ ile eko-rota (süre + λ·CO2e en az) olarak seçilir.
 *                 Adalet terimi: bugün vardiyadaki ortalamadan fazla iş almış araca, fazla iş başına μ dakika ek maliyet.
 *   green_fast  : (ayrıştırma için) GreenMatch araç seçimi + en hızlı rotalar.
 * Kısıtlar: yolcu en fazla maxWaitSec bekler (aşan talep iptal); araç vardiyası dışında atanamaz.
 * Yeniden konumlandırma yok: boş taksi bulunduğu yerde (durak) bekler.
 */
const R = require('./router.js');
const E = require('./emission.js');

function mulberry32(a) { return function () { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

function hungarian(cost, n, m) {
  const u = new Float64Array(n + 1), v = new Float64Array(m + 1), p = new Int32Array(m + 1), way = new Int32Array(m + 1);
  for (let i = 1; i <= n; i++) {
    p[0] = i; let j0 = 0; const minv = new Float64Array(m + 1).fill(Infinity), used = new Uint8Array(m + 1);
    do {
      used[j0] = 1; const i0 = p[j0]; let delta = Infinity, j1 = 0; const row = cost[i0 - 1];
      for (let j = 1; j <= m; j++) { if (used[j]) continue; const cur = row[j - 1] - u[i0] - v[j]; if (cur < minv[j]) { minv[j] = cur; way[j] = j0; } if (minv[j] < delta) { delta = minv[j]; j1 = j; } }
      for (let j = 0; j <= m; j++) { if (used[j]) { u[p[j]] += delta; v[j] -= delta; } else minv[j] -= delta; }
      j0 = j1;
    } while (p[j0] !== 0);
    do { const j1 = way[j0]; p[j0] = p[j1]; j0 = j1; } while (j0);
  }
  const r = new Int32Array(n).fill(-1); for (let j = 1; j <= m; j++) if (p[j]) r[p[j] - 1] = j - 1; return r;
}

const G = require('./grid.js');

/** Ortak hazırlık: ağ, araç modelleri, kenar emisyonları (bir kez) */
function prepare(graph, calib, vehJson) {
  const net = R.createNetwork(graph, calib);
  const models = E.makeFleetModels(vehJson);
  const em = models.map(m => R.edgeEmissions(net, m));
  return { net, models, em, calib };
}

function run(ctx, day, cfg) {
  cfg = Object.assign({ algo: 'green', lambda: 6, fair: 0, batchSec: 30, maxWaitSec: 600, candidates: 15, seed: 1, mix: null, log: false }, cfg);
  const { net, models, em, calib } = ctx;
  const overhead = calib.overheadS || 0;
  const rng = mulberry32(cfg.seed * 7919 + 13);
  const ecoRoute = cfg.algo === 'green';
  const greenPick = cfg.algo === 'green' || cfg.algo === 'green_fast';
  const lam = greenPick ? cfg.lambda : 0;

  // filo: her taksiye rastgele bir model (eşit olasılık veya cfg.mix ağırlıkları)
  const weights = cfg.mix ? models.map(m => cfg.mix[m.pt] / models.filter(x => x.pt === m.pt).length) : models.map(() => 1);
  const wsum = weights.reduce((a, b) => a + b, 0);
  const vehicles = day.shifts.map((s, i) => {
    let x = rng() * wsum, k = 0; while (k < models.length - 1 && (x -= weights[k]) > 0) k++;
    return { id: i, model: k, pt: models[k].pt, node: s[2], start: s[0], end: s[1], freeAt: s[0], state: 'off',
      trips: 0, emptyM: 0, occM: 0, co2g: 0, busyS: 0 };
  });
  const requests = day.requests.map((r, i) => ({ id: i, t: r[0], o: r[1], d: r[2], status: 'pending' }));

  const tripCache = new Map();   // talep -> model -> {timeS, distM, co2g}
  function tripFor(r, k, bucket) {
    let c = tripCache.get(r.id); if (!c) { c = {}; tripCache.set(r.id, c); }
    const key = (ecoRoute ? 'e' : 'f') + k;
    if (c[key]) return c[key];
    let res;
    if (ecoRoute) res = R.route(net, r.o, r.d, bucket, em[k], cfg.lambda, true);
    else {
      if (!c.fast) c.fast = R.route(net, r.o, r.d, bucket, null, 0);
      const C = em[k].loaded[bucket]; let g = 0; for (const e of c.fast.edges) g += C[e];
      res = { timeS: c.fast.timeS, distM: c.fast.distM, co2g: g, edges: c.fast.edges };
    }
    c[key] = { timeS: res.timeS, distM: res.distM, co2g: res.co2g };
    if (!c.fastDist) { const f = c.fast || R.route(net, r.o, r.d, bucket, null, 0); c.fast = f; c.fastDist = f.distM; c.fastTime = f.timeS; }
    return c[key];
  }

  /** Talep düğümüne her düğümden alma maliyeti (geri Dijkstra), model başına (yeşil) veya süre (baz) */
  function pickupTrees(r, bucket, needModels) {
    const trees = {};
    trees.time = R.dijkstra(net, r.o, R.costFn(net, bucket, null, 0), true);
    if (ecoRoute) for (const k of needModels) trees[k] = R.dijkstra(net, r.o, R.costFn(net, bucket, em[k], cfg.lambda, false), true);
    return trees;
  }
  function walk(tree, u, target, bucket, k) {   // geri ağaçta u -> hedef yolunu izle
    let t = 0, d = 0, g = 0, guard = 0; const C = em[k].empty[bucket];
    while (u !== target) { const e = tree.prevEdge[u]; if (e < 0 || guard++ > net.n) return null; t += net.time[bucket][e]; d += net.len[e]; g += C[e]; u = net.to[e]; }
    return { timeS: t, distM: d, co2g: g };
  }
  function pickupFor(trees, v, r, bucket) {
    if (v.node === r.o) return { timeS: 0, distM: 0, co2g: 0 };
    if (ecoRoute) return walk(trees[v.model], v.node, r.o, bucket, v.model);
    return walk(trees.time, v.node, r.o, bucket, v.model);
  }

  const log = [];
  let queue = [], next = 0, matchMs = 0;
  const end = 86400 + 3600;
  for (let t = 0; t <= end; t += cfg.batchSec) {
    const bucket = G.bucketOf(Math.floor(t / 3600) % 24);
    for (const v of vehicles) { if (v.state !== 'busy' && t >= v.start && t < v.end) v.state = 'idle'; if (v.state === 'busy' && t >= v.freeAt) v.state = t < v.end ? 'idle' : 'off'; if (v.state === 'idle' && t >= v.end) v.state = 'off'; }
    while (next < requests.length && requests[next].t <= t) queue.push(requests[next++]);
    for (const r of queue) if (t - r.t > cfg.maxWaitSec) r.status = 'expired';
    queue = queue.filter(r => r.status === 'pending');
    const idle = vehicles.filter(v => v.state === 'idle');
    if (!queue.length || !idle.length) continue;
    const t0 = Date.now();
    const modelsIdle = [...new Set(idle.map(v => v.model))];
    const onShift = vehicles.filter(v => v.state !== 'off');
    const avgTrips = onShift.reduce((a, v) => a + v.trips, 0) / Math.max(1, onShift.length);
    // aday listesi: her talep için önce süreye göre en yakın 40 araç, sonra maliyete göre en iyi `candidates`
    const opts = queue.map(r => {
      const trees = pickupTrees(r, bucket, modelsIdle);
      const near = idle.map(v => [trees.time.dist[v.node], v]).filter(x => isFinite(x[0])).sort((a, b) => a[0] - b[0]).slice(0, 40);
      const list = [];
      for (const [, v] of near) {
        const pk = pickupFor(trees, v, r, bucket); if (!pk) continue;
        const wait = t - r.t + pk.timeS;
        if (wait > cfg.maxWaitSec) continue;
        if (t + pk.timeS + overhead > v.end + 1800) continue;    // vardiya sonuna çok taşmasın
        const tr = greenPick || cfg.log ? tripFor(r, v.model, bucket) : null;
        const kg = greenPick ? (pk.co2g + tr.co2g) / 1000 : 0;
        // yeşilde yolcunun yolculuk süresindeki uzama da maliyete girer (dakika)
        const extraRide = ecoRoute ? (tr.timeS - tripCache.get(r.id).fastTime) / 60 : 0;
        const fairness = greenPick ? cfg.fair * Math.max(0, v.trips - avgTrips) : 0;
        list.push({ v, pk, cost: wait / 60 + extraRide + lam * kg + fairness });
      }
      list.sort((a, b) => a.cost - b.cost);
      return { r, list: list.slice(0, cfg.candidates) };
    });
    const assignments = [];
    if (cfg.algo === 'nearest') {
      const used = new Set();
      for (const o of opts) { const c = o.list.find(c => !used.has(c.v.id)); if (c) { used.add(c.v.id); assignments.push([o.r, c]); } }
    } else {
      const cols = [...new Map(opts.flatMap(o => o.list.map(c => [c.v.id, c.v]))).values()];
      if (cols.length) {
        const colIx = new Map(cols.map((v, j) => [v.id, j]));
        const n = opts.length, m = cols.length, tr = n > m, BIG = 1e6;
        const nr = tr ? m : n, nc = tr ? n : m;
        const cost = Array.from({ length: nr }, () => new Float64Array(nc).fill(BIG));
        const cell = Array.from({ length: n }, () => new Array(m).fill(null));
        opts.forEach((o, i) => o.list.forEach(c => { const j = colIx.get(c.v.id); cell[i][j] = c; if (tr) cost[j][i] = c.cost; else cost[i][j] = c.cost; }));
        const res = hungarian(cost, nr, nc);
        for (let a = 0; a < nr; a++) { const b = res[a]; if (b < 0) continue; const i = tr ? b : a, j = tr ? a : b; if (cell[i][j]) assignments.push([opts[i].r, cell[i][j]]); }
      }
    }
    for (const [r, c] of assignments) {
      const v = c.v, tr = tripFor(r, v.model, bucket);
      r.status = 'served'; r.vehicle = v.id; r.wait = t - r.t + c.pk.timeS;
      r.rideS = tr.timeS + overhead; r.rideM = tr.distM; r.fastRideS = tripCache.get(r.id).fastTime + overhead; r.fastRideM = tripCache.get(r.id).fastDist;
      r.pickupM = c.pk.distM; r.co2g = c.pk.co2g + tr.co2g; r.pickupG = c.pk.co2g; r.model = v.model;
      v.state = 'busy'; v.freeAt = t + c.pk.timeS + overhead + tr.timeS; v.node = r.d;
      v.trips++; v.emptyM += c.pk.distM; v.occM += tr.distM; v.co2g += r.co2g; v.busyS += c.pk.timeS + overhead + tr.timeS;
      if (cfg.log && log.length < 400) log.push({ t, req: r.id, veh: v.id, model: models[v.model].name, pt: v.pt, waitS: Math.round(r.wait), pickupKm: +(c.pk.distM / 1000).toFixed(2), rideKm: +(tr.distM / 1000).toFixed(2), co2g: Math.round(r.co2g), from: r.o, to: r.d });
    }
    queue = queue.filter(r => r.status === 'pending');
    matchMs += Date.now() - t0;
  }
  for (const r of queue) r.status = 'expired';
  return metrics(requests, vehicles, models, cfg, matchMs, log);
}

function metrics(requests, vehicles, models, cfg, matchMs, log) {
  const served = requests.filter(r => r.status === 'served'), expired = requests.filter(r => r.status === 'expired').length;
  const sum = (a, f) => a.reduce((s, x) => s + f(x), 0);
  const waits = served.map(r => r.wait).sort((a, b) => a - b);
  const q = p => waits[Math.min(waits.length - 1, Math.floor(waits.length * p))];
  // yolcu-km: her algoritmada aynı ölçüt olsun diye en hızlı rotanın uzunluğu (eko-rota kısaysa payda küçülmesin)
  const co2 = sum(served, r => r.co2g), pkm = sum(served, r => r.fastRideM) / 1000, emptyKm = sum(served, r => r.pickupM) / 1000, drivenOccKm = sum(served, r => r.rideM) / 1000;
  const byPt = {}; for (const pt of ['ev', 'hev', 'diesel', 'petrol', 'lpg']) { const s = served.filter(r => models[r.model].pt === pt); byPt[pt] = { trips: s.length, share: +(s.length / served.length).toFixed(3), co2kg: +(sum(s, r => r.co2g) / 1000).toFixed(1) }; }
  const fleetPt = {}; for (const v of vehicles) fleetPt[v.pt] = (fleetPt[v.pt] || 0) + 1;
  const tpv = vehicles.map(v => v.trips), mean = sum(tpv, x => x) / tpv.length, sd = Math.sqrt(sum(tpv, x => (x - mean) ** 2) / tpv.length);
  // Gini (araç başına yolculuk sayısı ~ gelir göstergesi)
  const srt = [...tpv].sort((a, b) => a - b); let gn = 0; srt.forEach((x, i) => gn += (2 * (i + 1) - srt.length - 1) * x); const gini = gn / (srt.length * sum(srt, x => x));
  return {
    algo: cfg.algo, lambda: cfg.lambda, fair: cfg.fair, seed: cfg.seed,
    requests: requests.length, served: served.length, expired, serviceRate: +(served.length / requests.length).toFixed(4),
    waitMeanMin: +(sum(served, r => r.wait) / served.length / 60).toFixed(2), waitP95Min: +(q(0.95) / 60).toFixed(2),
    rideMeanMin: +(sum(served, r => r.rideS) / served.length / 60).toFixed(2),
    rideDetourPct: +((sum(served, r => r.rideS) / sum(served, r => r.fastRideS) - 1) * 100).toFixed(2),
    passengerKm: +pkm.toFixed(1), occupiedKmDriven: +drivenOccKm.toFixed(1), emptyKm: +emptyKm.toFixed(1), emptyShare: +(emptyKm / (emptyKm + drivenOccKm)).toFixed(4), totalKm: +(emptyKm + drivenOccKm).toFixed(1),
    co2kg: +(co2 / 1000).toFixed(1), gPerPkm: +(co2 / pkm).toFixed(1), gPerTrip: +(co2 / served.length).toFixed(0),
    pickupCo2Share: +(sum(served, r => r.pickupG) / co2).toFixed(3),
    byPowertrain: byPt, fleetByPowertrain: fleetPt, tripsPerVehicleCV: +(sd / mean).toFixed(3), gini: +gini.toFixed(3),
    matchMs, log,
  };
}

module.exports = { prepare, run, hungarian };
