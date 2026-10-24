/*
 * GreenMatch - hıza ve eğime duyarlı, WLTP ile kalibre edilmiş araç emisyon modeli.
 * Node ve tarayıcıda çalışır (window.GreenEmission).
 *
 * Bir yol parçası (kenar) için: uzunluk d [m], süre t [s] (=> ortalama hız v), eğim s = Δh/d.
 *
 *  1) Tekerlekte gereken kuvvet (fizik):
 *       F = m·g·(Cr·cosθ + sinθ) + ½·ρ·CdA·v²
 *     Dur-kalk trafiği: her metrede m·PKE(v) kadar ivmelenme enerjisi harcanır ve frenle kaybolur.
 *     PKE(v) = 0,10 + 0,5/v  [m/s²]  (yavaş, sıkışık trafikte daha çok dur-kalk)
 *       E_çekiş = max(F,0)·d + m·PKE·d
 *       E_fren  = max(-F,0)·d + m·PKE·d          (yokuş aşağı + frenleme)
 *       E_net   = E_çekiş - r·E_fren             (r: rejeneratif frenle geri kazanım oranı)
 *  2) Güç aktarma organı:
 *       Yakıtlı / hibrit:  g CO2 (egzoz) = κ·max(E_net,0) + rölanti·t
 *       Elektrikli:        Wh (şebeke)   = κ·E_net + yardımcı·t
 *     rölanti = I_pt x (aracın WLTP tüketimi / metre) [1/s]
 *  PKE katsayıları, r ve I_pt; gerçek araçların WLTP faz değerlerine (düşük/orta/yüksek/çok yüksek)
 *  uydurularak seçildi (fit_phase.js): benzin Octavia 1.5 TSI 1,32/1,02/0,87/0,98; dizel Octavia 2.0 TDI
 *  1,45/0,99/0,83/0,97; hibrit Corolla 1.8 0,89/0,80/0,87/1,26; elektrik Model 3 (EVDB şehir 0,80, otoyol 1,22).
 *  3) κ (kalibrasyon katsayısı), aracın resmi WLTP değeri x (1 + gerçek kullanım farkı) ile
 *     WLTP sınıf 3 çevriminin 4 fazında (düz yol) birebir tutturulacak şekilde çözülür.
 *  4) Kuyudan tekerleğe CO2e: yakıtlılarda egzoz x (1 + WTT oranı); elektriklilerde kWh x şebeke faktörü.
 */
(function (root) {
  'use strict';
  const g0 = 9.81, RHO = 1.2, CR = 0.011;
  const CDA = { sedan: 0.60, estate: 0.62, hatch: 0.65, crossover: 0.70, mpv: 0.75, suv: 0.78 };   // m², varsayım
  const REGEN = { petrol: 0, diesel: 0, lpg: 0, hev: 0.70, ev: 0.70 };                             // faz uydurması
  // Rölanti/yardımcı yük: aracın birleşik WLTP tüketiminin (metre başına) kaç katı / saniye (faz uydurması)
  const IDLE_FACTOR = { petrol: 3.6, lpg: 3.6, diesel: 4.3, hev: 1.1, ev: 0.0 };
  const LOAD_KG = 100;                     // sürücü + ortalama yük (kalibrasyon); yolcu varsa +75
  const WLTP = [[589, 3095], [433, 4756], [455, 7162], [323, 8254]];   // sınıf 3: [s, m] düşük/orta/yüksek/çok yüksek

  function pke(v) { return 0.10 + 0.5 / Math.max(v, 2); }

  function edgeEnergy(m, cda, r, d, t, slope) {
    const v = d / Math.max(t, 1);
    const th = Math.atan(slope);
    const F = m * g0 * (CR * Math.cos(th) + Math.sin(th)) + 0.5 * RHO * cda * v * v;
    const acc = m * pke(v) * d;
    const trac = Math.max(F, 0) * d + acc;
    const brake = Math.max(-F, 0) * d + acc;
    return trac - r * brake;
  }

  function makeVehicle(spec, factors) {
    const pt = spec.pt;
    const m0 = spec.mass_kg + LOAD_KG;
    const cda = CDA[spec.body] || 0.65;
    const r = REGEN[pt];
    const gap = factors.real_world_gap[pt];
    const isEV = pt === 'ev';
    // kalibrasyon
    let eSum = 0, tSum = 0, dSum = 0;
    for (const [t, d] of WLTP) { eSum += isEV ? edgeEnergy(m0, cda, r, d, t, 0) : Math.max(edgeEnergy(m0, cda, r, d, t, 0), 0); tSum += t; dSum += d; }
    const target = spec.wltp * (1 + gap) * dSum / 1000;   // g (yakıtlı) veya Wh (EV)
    const idle = IDLE_FACTOR[pt] * target / dSum;          // g/s veya Wh/s
    const kappa = (target - idle * tSum) / eSum;
    if (!(kappa > 0)) throw new Error('kalibrasyon başarısız: ' + spec.id);
    const wtt = isEV ? 0 : factors.wtt_ratio[pt];
    const grid = factors.grid_g_per_kwh;
    const v = {
      id: spec.id, name: spec.name, pt, isEV, m0, cda, r, kappa, idle, wtt, grid, wltp: spec.wltp, gap,
      /** kenar başına kuyudan-tekerleğe g CO2e; extraKg: yolcu vb. */
      edgeG(d, t, slope, extraKg) {
        const m = m0 + (extraKg || 0);
        let e = edgeEnergy(m, cda, r, d, t, slope);
        if (isEV) { const wh = kappa * e + idle * t; return wh / 1000 * grid; }
        return (kappa * Math.max(e, 0) + idle * t) * (1 + wtt);
      },
      /** yalnız enerji: EV için Wh, yakıtlı için egzoz g */
      edgeRaw(d, t, slope, extraKg) {
        const e = edgeEnergy(m0 + (extraKg || 0), cda, r, d, t, slope);
        return isEV ? kappa * e + idle * t : kappa * Math.max(e, 0) + idle * t;
      },
    };
    // referans değerler: düz yolda sabit hızda g CO2e/km
    v.flatGkm = kmh => v.edgeG(1000, 3600 / kmh, 0, 0);
    v.wltpWtwGkm = isEV ? spec.wltp * (1 + gap) / 1000 * grid : spec.wltp * (1 + gap) * (1 + wtt);
    return v;
  }

  function makeFleetModels(vehJson) { return vehJson.vehicles.map(s => makeVehicle(s, vehJson.factors)); }

  const api = { makeVehicle, makeFleetModels, edgeEnergy, pke, CDA, REGEN, IDLE_FACTOR, WLTP, LOAD_KG };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.GreenEmission = api;
})(typeof window !== 'undefined' ? window : globalThis);
