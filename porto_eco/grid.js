// Porto hücre ızgarası: ortak tanımlar (Node ve tarayıcı)
(function (root) {
  const LAT0 = 41.16, LON0 = -8.61;
  const MX = 111320 * Math.cos(LAT0 * Math.PI / 180), MY = 110574;  // metre / derece
  const CELL = 200;                                   // hücre kenarı (m)
  const XMIN = -9000, XMAX = 9000, YMIN = -9000, YMAX = 11000;  // ~41.08-41.26 K, -8.72 - -8.50 B
  const NX = (XMAX - XMIN) / CELL, NY = (YMAX - YMIN) / CELL, NCELL = NX * NY;
  // saat dilimleri: [başlangıç saati, bitiş saati)
  const BUCKETS = [[0, 7, 'gece'], [7, 10, 'sabah zirvesi'], [10, 16, 'gün içi'], [16, 20, 'akşam zirvesi'], [20, 24, 'akşam']];
  const SPEED_BINS = 60;  // 0-120 km/sa, 2'şer
  const SIM_DAYS = ['2013-11-13', '2014-02-12', '2014-03-12'];  // aday Çarşambalar
  const DX = [1, 1, 0, -1, -1, -1, 0, 1], DY = [0, 1, 1, 1, 0, -1, -1, -1];

  function xy(p) { return [(p[0] - LON0) * MX, (p[1] - LAT0) * MY]; }
  function lonlat(x, y) { return [LON0 + x / MX, LAT0 + y / MY]; }
  function cellOf(p) {
    const [x, y] = xy(p);
    if (x < XMIN || x >= XMAX || y < YMIN || y >= YMAX) return -1;
    return Math.floor((y - YMIN) / CELL) * NX + Math.floor((x - XMIN) / CELL);
  }
  function cellCenter(c) {
    const cx = c % NX, cy = Math.floor(c / NX);
    return [XMIN + (cx + 0.5) * CELL, YMIN + (cy + 0.5) * CELL];
  }
  function dirOf(a, b) {
    const dx = (b % NX) - (a % NX), dy = Math.floor(b / NX) - Math.floor(a / NX);
    for (let d = 0; d < 8; d++) if (DX[d] === dx && DY[d] === dy) return d;
    return -1;
  }
  function neighbor(a, d) {
    const cx = a % NX + DX[d], cy = Math.floor(a / NX) + DY[d];
    if (cx < 0 || cx >= NX || cy < 0 || cy >= NY) return -1;
    return cy * NX + cx;
  }
  function distM(p, q) { const a = xy(p), b = xy(q); return Math.hypot(a[0] - b[0], a[1] - b[1]); }
  function bucketOf(h) { for (let i = 0; i < BUCKETS.length; i++) if (h >= BUCKETS[i][0] && h < BUCKETS[i][1]) return i; return 0; }
  const api = { LAT0, LON0, MX, MY, CELL, XMIN, XMAX, YMIN, YMAX, NX, NY, NCELL, BUCKETS, SPEED_BINS, SIM_DAYS, DX, DY, xy, lonlat, cellOf, cellCenter, dirOf, neighbor, distM, bucketOf };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.PortoGrid = api;
})(typeof window !== 'undefined' ? window : globalThis);
