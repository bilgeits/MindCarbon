/*
 * GreenMatch - eko-rota motoru (Node + tarayıcı: window.GreenRouter).
 *
 * Graf: Porto GPS izlerinden çıkarılan 200 m hücre ağı (porto_graph.json), yönlü kenarlar,
 * 5 saat dilimi için harmonik ortalama hız + hücre başına ortalama duraklama süresi, EU-DEM yükseklikleri.
 * Kalibrasyon (calibration.json): yol/kuş uçuşu dolambaç katsayısı ve saat dilimine göre süre katsayısı
 * (doğrulama yolculuklarından, bkz. calibrate.js).
 *
 * Rota maliyeti (ağırlıklı toplam):   C = süre [dk] + λ · CO2e [kg]
 *   λ = 0     -> en hızlı rota (klasik "en kısa yol")
 *   λ büyük   -> en az emisyonlu rota
 * Elektrikli araçlar yokuş aşağı enerji geri kazanır, yani bazı kenarlarda CO2e < 0 olabilir. Dijkstra
 * negatif kenarla doğru çalışmaz; bu yüzden yükseklik tabanlı potansiyel (Johnson yeniden ağırlıklandırma)
 * kullanılır: c'(u,v) = c(u,v) + k·(h_u - h_v). Bir yoldaki toplam ekleme yalnız başlangıç ve bitiş
 * yüksekliğine bağlı olduğundan en iyi rota değişmez, ama bütün kenar maliyetleri >= 0 olur.
 */
(function (root) {
  'use strict';
  const G = (typeof module !== 'undefined' && module.exports) ? require('./grid.js') : root.PortoGrid;

  function createNetwork(graph, calib) {
    const n = graph.cells.length, m = graph.edges.length, NB = graph.meta.buckets.length;
    const D = calib ? calib.detour : 1, TF = calib ? calib.timeFactor : new Array(NB).fill(1);
    const cellIdx = new Map(graph.cells.map((c, i) => [c, i]));
    const from = new Int32Array(m), to = new Int32Array(m), len = new Float32Array(m), slope = new Float32Array(m);
    const time = Array.from({ length: NB }, () => new Float32Array(m));
    const xy = graph.cells.map(c => G.cellCenter(c));
    for (let e = 0; e < m; e++) {
      const E = graph.edges[e];
      from[e] = E[0]; to[e] = E[1];
      const a = xy[E[0]], b = xy[E[1]];
      len[e] = Math.hypot(a[0] - b[0], a[1] - b[1]) * D;
      slope[e] = Math.max(-0.15, Math.min(0.15, (graph.elev[E[1]] - graph.elev[E[0]]) / len[e]));
      // süre = uzunluk / harmonik ortalama hız (hareket halinde) + varılan hücredeki ortalama duraklama
      for (let k = 0; k < NB; k++) {
        const dl = graph.delay ? graph.delay[E[1]][k] : 0;
        time[k][e] = (len[e] / (Math.max(E[2 + NB + k] || E[2 + k], 3) / 3.6) + Math.min(dl == null ? 0 : dl, 60)) * TF[k];
      }
    }
    // CSR komşuluk (ileri ve geri)
    function csr(src) {
      const start = new Int32Array(n + 1);
      for (let e = 0; e < m; e++) start[src[e] + 1]++;
      for (let i = 0; i < n; i++) start[i + 1] += start[i];
      const pos = start.slice(0, n), list = new Int32Array(m);
      for (let e = 0; e < m; e++) list[pos[src[e]]++] = e;
      return { start, list };
    }
    const fwd = csr(from), rev = csr(to);
    // her ızgara hücresi için en yakın graf düğümü (çok kaynaklı BFS)
    const nearest = new Int32Array(G.NCELL).fill(-1);
    let q = [];
    for (let i = 0; i < n; i++) { nearest[graph.cells[i]] = i; q.push(graph.cells[i]); }
    while (q.length) {
      const nq = [];
      for (const c of q) for (let d = 0; d < 8; d += 2) { const nb = G.neighbor(c, d); if (nb >= 0 && nearest[nb] < 0) { nearest[nb] = nearest[c]; nq.push(nb); } }
      q = nq;
    }
    return { n, m, NB, from, to, len, slope, time, fwd, rev, xy, elev: graph.elev, cells: graph.cells, cellIdx, nearest,
      nodeOfCell: c => (c >= 0 ? nearest[c] : -1), nodeOfLonLat: (lon, lat) => { const c = G.cellOf([lon, lat]); return c >= 0 ? nearest[c] : -1; },
      lonlat: i => G.lonlat(xy[i][0], xy[i][1]), D, TF };
  }

  /** Bir araç modeli için her saat diliminde kenar başına g CO2e (yolcusuz ve yolculu). */
  function edgeEmissions(net, veh) {
    const out = { empty: [], loaded: [] };
    for (let b = 0; b < net.NB; b++) {
      const a0 = new Float32Array(net.m), a1 = new Float32Array(net.m);
      for (let e = 0; e < net.m; e++) {
        a0[e] = veh.edgeG(net.len[e], net.time[b][e], net.slope[e], 0);
        a1[e] = veh.edgeG(net.len[e], net.time[b][e], net.slope[e], 75);
      }
      out.empty.push(a0); out.loaded.push(a1);
    }
    // potansiyel katsayısı k: inen kenarlarda c + k·(h_u - h_v) >= 0 olacak en küçük değer
    let k = 0;
    for (let b = 0; b < net.NB; b++) for (let e = 0; e < net.m; e++) {
      const drop = net.elev[net.from[e]] - net.elev[net.to[e]];
      for (const arr of [out.empty[b], out.loaded[b]]) if (arr[e] < 0 && drop > 0) k = Math.max(k, -arr[e] / drop);
    }
    out.k = k * 1.001;
    // kontrol: çıkan kenarlarda indirgenmiş maliyet negatife düşüyor mu?
    let bad = 0;
    for (let b = 0; b < net.NB; b++) for (let e = 0; e < net.m; e++) {
      const drop = net.elev[net.from[e]] - net.elev[net.to[e]];
      for (const arr of [out.empty[b], out.loaded[b]]) if (arr[e] + out.k * drop < -1e-9) bad++;
    }
    out.negativeReduced = bad;
    return out;
  }

  // --- ikili yığın
  function Heap(cap) { this.k = new Float64Array(cap); this.v = new Int32Array(cap); this.n = 0; }
  Heap.prototype.push = function (key, val) {
    let i = this.n++; const k = this.k, v = this.v;
    while (i > 0) { const p = (i - 1) >> 1; if (k[p] <= key) break; k[i] = k[p]; v[i] = v[p]; i = p; }
    k[i] = key; v[i] = val;
  };
  Heap.prototype.pop = function () {
    const k = this.k, v = this.v, top = v[0], key = k[0]; const n = --this.n;
    if (n > 0) {
      const lk = k[n], lv = v[n]; let i = 0;
      while (true) { let c = 2 * i + 1; if (c >= n) break; if (c + 1 < n && k[c + 1] < k[c]) c++; if (k[c] >= lk) break; k[i] = k[c]; v[i] = v[c]; i = c; }
      k[i] = lk; v[i] = lv;
    }
    this.lastKey = key; return top;
  };

  /**
   * Dijkstra. weight(e) >= 0 olmalı. reverse=true ise hedeften geriye (her düğümden hedefe maliyet).
   * Dönüş: { dist: Float64Array, prevEdge: Int32Array }
   */
  function dijkstra(net, src, weight, reverse, target) {
    const dist = new Float64Array(net.n).fill(Infinity), prev = new Int32Array(net.n).fill(-1);
    const adj = reverse ? net.rev : net.fwd, other = reverse ? net.from : net.to;
    const h = new Heap(net.m + net.n + 1);
    dist[src] = 0; h.push(0, src);
    while (h.n) {
      const u = h.pop(); const du = h.lastKey;
      if (du > dist[u]) continue;
      if (u === target) break;
      for (let p = adj.start[u]; p < adj.start[u + 1]; p++) {
        const e = adj.list[p], w = other[e], nd = du + weight(e);
        if (nd < dist[w]) { dist[w] = nd; prev[w] = e; h.push(nd, w); }
      }
    }
    return { dist, prevEdge: prev };
  }

  /** λ'ya göre maliyet fonksiyonu (dakika birimi). em: edgeEmissions çıktısı; loaded: yolcu var mı */
  function costFn(net, bucket, em, lambda, loaded) {
    const T = net.time[bucket];
    if (!em || !lambda) return e => T[e] / 60;
    const C = (loaded ? em.loaded : em.empty)[bucket], k = em.k, H = net.elev, F = net.from, To = net.to;
    return e => T[e] / 60 + lambda * Math.max(0, C[e] + k * (H[F[e]] - H[To[e]])) / 1000;
  }

  function pathEdges(net, prevEdge, src, dst) {
    const edges = [];
    let u = dst, guard = 0;
    while (u !== src) { const e = prevEdge[u]; if (e < 0 || guard++ > net.n) return null; edges.push(e); u = net.from[e]; }
    return edges.reverse();
  }

  function summarize(net, edges, bucket, em, loaded) {
    let t = 0, d = 0, g = 0, up = 0, down = 0;
    const C = em ? (loaded ? em.loaded : em.empty)[bucket] : null;
    for (const e of edges) {
      t += net.time[bucket][e]; d += net.len[e]; if (C) g += C[e];
      const dh = net.elev[net.to[e]] - net.elev[net.from[e]]; if (dh > 0) up += dh; else down -= dh;
    }
    return { timeS: t, distM: d, co2g: g, climbM: up, descentM: down, edgeCount: edges.length };
  }

  /** Tek bir rota: src -> dst */
  function route(net, src, dst, bucket, em, lambda, loaded) {
    if (src === dst) return { edges: [], timeS: 0, distM: 0, co2g: 0, climbM: 0, descentM: 0 };
    const r = dijkstra(net, src, costFn(net, bucket, em, lambda, loaded), false, dst);
    const edges = pathEdges(net, r.prevEdge, src, dst);
    if (!edges) return null;
    return Object.assign({ edges }, summarize(net, edges, bucket, em, loaded));
  }

  /** Bir rotanın düğüm listesi (harita çizimi için) */
  function routeNodes(net, edges, src) { const out = [src]; for (const e of edges) out.push(net.to[e]); return out; }

  const api = { createNetwork, edgeEmissions, dijkstra, costFn, pathEdges, summarize, route, routeNodes };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.GreenRouter = api;
})(typeof window !== 'undefined' ? window : globalThis);
