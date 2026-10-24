// Rota düzeyinde değerlendirme: simülasyon gününden 500 gerçek yolculuk (başlangıç-bitiş, saat),
// her araç modeli için en hızlı rota ile eko-rota (λ) karşılaştırması. Çıktı: results/route_eval.json
const fs = require('fs');
const G = require('./grid.js'), R = require('./router.js'), E = require('./emission.js');
const net = R.createNetwork(JSON.parse(fs.readFileSync('data/porto_graph.json', 'utf8')), JSON.parse(fs.readFileSync('data/calibration.json', 'utf8')));
const models = E.makeFleetModels(JSON.parse(fs.readFileSync('data/vehicles.json', 'utf8')));
const em = models.map(m => R.edgeEmissions(net, m));
const day = JSON.parse(fs.readFileSync('data/porto_simday.json', 'utf8'));
const lambdas = [2, 6, 12, 24];
const sample = day.requests.filter((_, i) => i % 8 === 0).slice(0, 500);
const out = { n: sample.length, lambdas, models: [] };
for (let k = 0; k < models.length; k++) {
  const acc = Object.fromEntries(lambdas.map(l => [l, { co2Fast: 0, co2Eco: 0, tFast: 0, tEco: 0, dFast: 0, dEco: 0, changed: 0, climbFast: 0, climbEco: 0 }]));
  for (const r of sample) {
    const b = G.bucketOf(Math.floor(r[0] / 3600));
    const f = R.route(net, r[1], r[2], b, em[k], 0, true);
    for (const l of lambdas) {
      const e = R.route(net, r[1], r[2], b, em[k], l, true), a = acc[l];
      a.co2Fast += f.co2g; a.co2Eco += e.co2g; a.tFast += f.timeS; a.tEco += e.timeS; a.dFast += f.distM; a.dEco += e.distM;
      a.climbFast += f.climbM; a.climbEco += e.climbM; if (e.edges.join() !== f.edges.join()) a.changed++;
    }
  }
  const row = { id: models[k].id, name: models[k].name, pt: models[k].pt, byLambda: {} };
  for (const l of lambdas) { const a = acc[l]; row.byLambda[l] = {
    gPerKmFast: +(a.co2Fast / a.dFast * 1000).toFixed(1), co2SavePct: +((1 - a.co2Eco / a.co2Fast) * 100).toFixed(1),
    timeAddPct: +((a.tEco / a.tFast - 1) * 100).toFixed(1), distChangePct: +((a.dEco / a.dFast - 1) * 100).toFixed(1),
    climbChangePct: +((a.climbEco / a.climbFast - 1) * 100).toFixed(1), routesChangedPct: +(a.changed / sample.length * 100).toFixed(0) }; }
  out.models.push(row);
  console.log(row.name.slice(0, 40).padEnd(41), row.pt.padEnd(7), lambdas.map(l => `λ${l}: -%${row.byLambda[l].co2SavePct} CO2 +%${row.byLambda[l].timeAddPct} süre (${row.byLambda[l].routesChangedPct}% değişti)`).join(' | '));
}
fs.writeFileSync('results/route_eval.json', JSON.stringify(out, null, 1));
