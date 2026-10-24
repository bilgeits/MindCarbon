/*
 * GreenMatch - bölge tabanlı ayrık zamanlı simülasyon motoru (demo)
 *
 * Tarayıcıda (window.GreenSim) ve Node'da (require('./sim.js')) çalışır.
 *
 * Model:
 *  - Konumlar TLC taksi bölgeleri. Araç her an bir bölgede ya da iki bölge arasında yolda.
 *  - Talepler gerçek HVFHV kayıtlarından gelir (request_datetime, PU, DO, trip_time, trip_miles).
 *  - Her `batchSec` saniyede bir: müsaitleşen araçlar serbest kalır, yeni talepler kuyruğa girer,
 *    `maxWaitSec` süresini aşan talepler iptal sayılır, seçilen algoritma atama yapar.
 *  - Boş (yolcuya gidiş) süresi/mesafesi bölge-bölge medyan matrisinden, dolu yolculuk ise
 *    kaydın kendi trip_time / trip_miles değerinden alınır.
 *  - Araç başına aynı anda tek yolculuk; paylaşım yok, yeniden konumlandırma yok.
 */
(function (root) {
  'use strict';

  // Varsayılan emisyon faktörleri (g CO2e / km, kuyudan tekerleğe). DEMO VARSAYIMLARI:
  //  benzinli: 8 L/100 km x (2.31 egzoz + 0.60 üretim) kg/L  ~ 233
  //  hibrit:   5 L/100 km x 2.91 kg/L                          ~ 146
  //  elektrik: 0.20 kWh/km (şarj kaybı dahil) x 0.26 kg/kWh    ~  52
  const EMISSION_G_PER_KM = { ice: 233, hybrid: 146, ev: 52 };
  const KM_PER_MILE = 1.609344;
  const BIG = 1e9;

  const DEFAULTS = {
    algo: 'green',        // 'nearest' | 'batch_eta' | 'green'
    fleet: 400,
    sample: 0.10,         // gerçek taleplerin ne kadarı simüle edilecek
    seed: 42,
    mix: { ice: 0.4, hybrid: 0.4, ev: 0.2 },
    maxWaitSec: 600,      // yolcu en fazla 10 dk bekler
    batchSec: 30,
    lambdaMinPerKg: 6,    // GreenMatch: 1 kg CO2e = kaç dakika bekleme değerinde
    candidatesPerRequest: 12,
    rebalance: true,
    emission: EMISSION_G_PER_KM,
  };

  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // Dikdörtgen Macar algoritması (n satır <= m sütun), toplam maliyeti en küçükler.
  // Dönüş: rowToCol dizisi.
  function hungarian(cost, n, m) {
    const u = new Float64Array(n + 1), v = new Float64Array(m + 1);
    const p = new Int32Array(m + 1), way = new Int32Array(m + 1);
    for (let i = 1; i <= n; i++) {
      p[0] = i;
      let j0 = 0;
      const minv = new Float64Array(m + 1).fill(Infinity);
      const used = new Uint8Array(m + 1);
      do {
        used[j0] = 1;
        const i0 = p[j0];
        let delta = Infinity, j1 = 0;
        const row = cost[i0 - 1];
        for (let j = 1; j <= m; j++) {
          if (used[j]) continue;
          const cur = row[j - 1] - u[i0] - v[j];
          if (cur < minv[j]) { minv[j] = cur; way[j] = j0; }
          if (minv[j] < delta) { delta = minv[j]; j1 = j; }
        }
        for (let j = 0; j <= m; j++) {
          if (used[j]) { u[p[j]] += delta; v[j] -= delta; } else minv[j] -= delta;
        }
        j0 = j1;
      } while (p[j0] !== 0);
      do { const j1 = way[j0]; p[j0] = p[j1]; j0 = j1; } while (j0);
    }
    const rowToCol = new Int32Array(n).fill(-1);
    for (let j = 1; j <= m; j++) if (p[j]) rowToCol[p[j] - 1] = j - 1;
    return rowToCol;
  }

  function createSim(data, userCfg) {
    const cfg = Object.assign({}, DEFAULTS, userCfg || {});
    cfg.mix = Object.assign({}, DEFAULTS.mix, (userCfg || {}).mix);
    cfg.emission = Object.assign({}, EMISSION_G_PER_KM, (userCfg || {}).emission);

    const ids = data.od.ids;
    const idx = new Map(ids.map((id, i) => [id, i]));
    const T = data.od.t, D = data.od.d;

    // --- talepler (aynı seed ile her algoritmada aynı örneklem)
    const rngReq = mulberry32(cfg.seed * 7919 + 1);
    const requests = [];
    for (const r of data.requests) {
      if (rngReq() >= cfg.sample) continue;
      requests.push({
        id: requests.length, t: r[0], pu: idx.get(r[1]), do: idx.get(r[2]),
        tripSec: r[3], tripKm: r[4] * KM_PER_MILE, realWait: r[5],
        status: 'pending', vehicle: -1, assignT: -1, pickupT: -1,
      });
    }

    // --- filo: başlangıç konumu ilk 30 dk talebinin dağılımına göre
    const rngFleet = mulberry32(cfg.seed * 104729 + 3);
    const early = requests.filter(r => r.t < 1800);
    const pool = early.length ? early : requests;
    const types = [];
    const nIce = Math.round(cfg.fleet * cfg.mix.ice), nHyb = Math.round(cfg.fleet * cfg.mix.hybrid);
    for (let i = 0; i < cfg.fleet; i++) types.push(i < nIce ? 'ice' : i < nIce + nHyb ? 'hybrid' : 'ev');
    for (let i = types.length - 1; i > 0; i--) { const j = Math.floor(rngFleet() * (i + 1)); [types[i], types[j]] = [types[j], types[i]]; }
    const vehicles = types.map((type, i) => {
      const z = pool[Math.floor(rngFleet() * pool.length)].pu;
      return {
        id: i, type, zone: z, state: 'idle', freeAt: 0,
        legFrom: z, legTo: z, legStart: 0, legEnd: 0, pickupZone: z, pickupT: 0,
        jx: (rngFleet() - 0.5) * 14, jy: (rngFleet() - 0.5) * 14,
        trips: 0, emptyKm: 0, repoKm: 0, occKm: 0, co2g: 0,
      };
    });

    const s = {
      cfg, requests, vehicles, now: 0, next: 0, queue: [],
      endT: (data.meta.window[1] - data.meta.window[0]) * 3600,
      log: [], matchMs: 0, batches: 0,
    };

    function release(t) {
      for (const v of vehicles) {
        if (v.state === 'pickup' && t >= v.pickupT) { v.state = 'trip'; v.legFrom = v.pickupZone; v.legTo = v.zone; v.legStart = v.pickupT; v.legEnd = v.freeAt; }
        if ((v.state === 'trip' || v.state === 'reposition') && t >= v.freeAt) { v.state = 'idle'; v.legFrom = v.legTo = v.zone; }
      }
    }

    function assign(v, r, t, eta) {
      const emptyKm = D[v.zone][r.pu] * KM_PER_MILE;
      const g = (emptyKm + r.tripKm) * cfg.emission[v.type];
      r.status = 'assigned'; r.vehicle = v.id; r.assignT = t; r.pickupT = t + eta;
      v.legFrom = v.zone; v.legTo = r.pu; v.legStart = t; v.legEnd = t + eta;
      v.pickupZone = r.pu; v.pickupT = t + eta; v.zone = r.do; v.freeAt = t + eta + r.tripSec;
      v.state = 'pickup';
      v.trips++; v.emptyKm += emptyKm; v.occKm += r.tripKm; v.co2g += g;
      if (s.log.length > 200) s.log.shift();
      s.log.push({ t, req: r.id, veh: v.id, type: v.type, eta, emptyKm, co2g: g, from: ids[r.pu], to: ids[r.do] });
    }

    function pairCost(v, r, t) {
      const eta = T[v.zone][r.pu];
      const waitSec = t - r.t + eta;
      if (waitSec > cfg.maxWaitSec) return null;
      const kg = (D[v.zone][r.pu] * KM_PER_MILE + r.tripKm) * cfg.emission[v.type] / 1000;
      const c = cfg.algo === 'green' ? waitSec / 60 + cfg.lambdaMinPerKg * kg : waitSec / 60;
      return { eta, c };
    }

    function match(t) {
      const idle = vehicles.filter(v => v.state === 'idle');
      if (!idle.length || !s.queue.length) return;

      if (cfg.algo === 'nearest') {
        // Geliş sırasıyla, her talebe o an en yakın boş araç.
        const free = new Set(idle);
        for (const r of s.queue) {
          let best = null, bestEta = Infinity;
          for (const v of free) { const eta = T[v.zone][r.pu]; if (eta < bestEta) { bestEta = eta; best = v; } }
          if (best && t - r.t + bestEta <= cfg.maxWaitSec) { assign(best, r, t, bestEta); free.delete(best); }
          if (!free.size) break;
        }
        return;
      }

      // Toplu atama: her talep için en iyi k aday araç, sonra Macar algoritması.
      const cand = new Map();
      for (const r of s.queue) {
        const opts = [];
        for (const v of idle) { const pc = pairCost(v, r, t); if (pc) opts.push([pc.c, v]); }
        opts.sort((a, b) => a[0] - b[0]);
        for (const [, v] of opts.slice(0, cfg.candidatesPerRequest)) cand.set(v.id, v);
      }
      const cols = [...cand.values()];
      const rows = s.queue;
      if (!cols.length) return;
      const transpose = rows.length > cols.length;
      const nR = transpose ? cols.length : rows.length, nC = transpose ? rows.length : cols.length;
      const cost = Array.from({ length: nR }, () => new Float64Array(nC));
      const info = rows.map(r => cols.map(v => pairCost(v, r, t)));
      for (let i = 0; i < rows.length; i++) for (let j = 0; j < cols.length; j++) {
        const c = info[i][j] ? info[i][j].c : BIG;
        if (transpose) cost[j][i] = c; else cost[i][j] = c;
      }
      const res = hungarian(cost, nR, nC);
      for (let a = 0; a < nR; a++) {
        const b = res[a];
        if (b < 0) continue;
        const i = transpose ? b : a, j = transpose ? a : b;
        if (info[i][j]) assign(cols[j], rows[i], t, info[i][j].eta);
      }
    }

    // Basit yeniden konumlandırma (bütün algoritmalarda aynı): her 5 dk'da bir,
    // en az 5 dk boş bekleyen araçlar son 15 dk talebine göre araç açığı olan en yakın bölgeye gider.
    const recent = [];
    function rebalance(t) {
      while (recent.length && recent[0].t < t - 900) recent.shift();
      const need = new Float64Array(ids.length);
      for (const r of recent) need[r.pu] += 1;
      const scaleNeed = 0.5; // 15 dk'lık talebin yarısı kadar boş araç hedefi
      for (let i = 0; i < need.length; i++) need[i] *= scaleNeed;
      for (const v of vehicles) if (v.state === 'idle' || v.state === 'reposition') need[v.zone] -= 1;
      const movable = vehicles.filter(v => v.state === 'idle' && t - v.freeAt >= 300 && need[v.zone] < 0);
      for (const v of movable) {
        let best = -1, bestT = Infinity;
        for (let z = 0; z < ids.length; z++) if (need[z] >= 1 && T[v.zone][z] < bestT && T[v.zone][z] <= 900) { bestT = T[v.zone][z]; best = z; }
        if (best < 0) continue;
        const km = D[v.zone][best] * KM_PER_MILE, g = km * cfg.emission[v.type];
        need[v.zone] += 1; need[best] -= 1;
        v.legFrom = v.zone; v.legTo = best; v.legStart = t; v.legEnd = t + bestT;
        v.zone = best; v.freeAt = t + bestT; v.state = 'reposition';
        v.emptyKm += km; v.repoKm += km; v.co2g += g;
      }
    }

    function tick() {
      const t = s.now;
      release(t);
      if (cfg.rebalance && t % 300 === 0) rebalance(t);
      while (s.next < requests.length && requests[s.next].t <= t) { s.queue.push(requests[s.next]); recent.push(requests[s.next]); s.next++; }
      for (const r of s.queue) if (r.status === 'pending' && t - r.t > cfg.maxWaitSec) r.status = 'expired';
      s.queue = s.queue.filter(r => r.status === 'pending');
      const t0 = (typeof performance !== 'undefined' ? performance : Date).now();
      match(t);
      s.matchMs += (typeof performance !== 'undefined' ? performance : Date).now() - t0;
      s.batches++;
      s.queue = s.queue.filter(r => r.status === 'pending');
    }

    // simülasyonu `untilT` saniyesine kadar ilerletir
    s.advanceTo = function (untilT) {
      untilT = Math.min(untilT, s.endT);
      while (s.now + cfg.batchSec <= untilT) { s.now += cfg.batchSec; tick(); }
      s.clock = Math.max(s.now, untilT);
      release(s.clock);
    };
    s.done = () => s.now + cfg.batchSec > s.endT;
    s.runAll = () => { s.advanceTo(s.endT); return metrics(s); };
    s.metrics = () => metrics(s);
    s.ids = ids;
    s.clock = 0;
    return s;
  }

  function quantile(sorted, q) {
    if (!sorted.length) return NaN;
    const pos = (sorted.length - 1) * q, lo = Math.floor(pos), hi = Math.ceil(pos);
    return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
  }

  function metrics(s) {
    // Yalnızca şu ana kadar ortaya çıkmış talepler
    const seen = s.requests.slice(0, s.next);
    const served = seen.filter(r => r.status === 'assigned');
    const expired = seen.filter(r => r.status === 'expired').length;
    const waits = served.map(r => r.pickupT - r.t).sort((a, b) => a - b);
    const realWaits = seen.map(r => r.realWait).filter(w => w >= 0 && w < 3600).sort((a, b) => a - b);
    let emptyKm = 0, repoKm = 0, occKm = 0, co2g = 0;
    const byType = { ice: { trips: 0, co2g: 0 }, hybrid: { trips: 0, co2g: 0 }, ev: { trips: 0, co2g: 0 } };
    const tripsPerVeh = [];
    for (const v of s.vehicles) {
      emptyKm += v.emptyKm; repoKm += v.repoKm; occKm += v.occKm; co2g += v.co2g;
      byType[v.type].trips += v.trips; byType[v.type].co2g += v.co2g;
      tripsPerVeh.push(v.trips);
    }
    const mean = tripsPerVeh.reduce((a, b) => a + b, 0) / tripsPerVeh.length;
    const sd = Math.sqrt(tripsPerVeh.reduce((a, b) => a + (b - mean) ** 2, 0) / tripsPerVeh.length);
    const busy = s.vehicles.filter(v => v.state !== 'idle').length;
    return {
      algo: s.cfg.algo, time: s.clock,
      requests: seen.length, served: served.length, expired, waiting: s.queue.length,
      serviceRate: seen.length ? served.length / (served.length + expired) || 0 : 0,
      waitMeanMin: waits.length ? waits.reduce((a, b) => a + b, 0) / waits.length / 60 : NaN,
      waitP95Min: quantile(waits, 0.95) / 60,
      realWaitMedianMin: quantile(realWaits, 0.5) / 60,
      emptyKm, repoKm, occKm, emptyShare: emptyKm / (emptyKm + occKm || 1),
      co2kg: co2g / 1000, co2PerTripG: served.length ? co2g / served.length : NaN,
      byType, tripsPerVehMean: mean, tripsPerVehCV: mean ? sd / mean : 0,
      busyVehicles: busy, idleVehicles: s.vehicles.length - busy,
      matchMs: s.matchMs, batches: s.batches,
    };
  }

  const api = { createSim, hungarian, DEFAULTS, EMISSION_G_PER_KM };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.GreenSim = api;
})(typeof window !== 'undefined' ? window : globalThis);
