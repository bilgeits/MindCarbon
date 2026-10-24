// Aynı talep ve filo senaryosunu üç algoritmayla çalıştırıp sonuçları karşılaştırır.
// Kullanım: node compare.js [fleet] [sample] [seed...]
const fs = require('fs');
const path = require('path');
const { createSim } = require('./sim.js');

const data = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'sim_data.json'), 'utf8'));
const fleet = Number(process.argv[2] || 400);
const sample = Number(process.argv[3] || 0.10);
const seeds = process.argv.slice(4).map(Number);
if (!seeds.length) seeds.push(1, 2, 3, 4, 5);

const algos = ['nearest', 'batch_eta', 'green'];
const keys = ['served', 'expired', 'serviceRate', 'waitMeanMin', 'waitP95Min', 'emptyShare', 'repoKm', 'co2kg', 'co2PerTripG', 'tripsPerVehCV', 'matchMs'];
const results = {};
for (const algo of algos) {
  const runs = seeds.map(seed => createSim(data, { algo, fleet, sample, seed }).runAll());
  const avg = {};
  for (const k of keys) avg[k] = runs.reduce((a, r) => a + r[k], 0) / runs.length;
  avg.evShare = runs.reduce((a, r) => a + r.byType.ev.trips / r.served, 0) / runs.length;
  avg.requests = runs[0].requests;
  results[algo] = avg;
}

const f = (x, d = 2) => (typeof x === 'number' ? x.toFixed(d) : x);
console.log(`fleet=${fleet} sample=${sample} seeds=${seeds.join(',')}  requests~${results.nearest.requests}`);
console.log(['metric', ...algos].join('\t'));
for (const k of [...keys, 'evShare']) console.log([k, ...algos.map(a => f(results[a][k]))].join('\t'));
const base = results.batch_eta.co2PerTripG;
console.log(`GreenMatch vs Toplu ETA, sefer başına CO2e: ${f((results.green.co2PerTripG / base - 1) * 100, 1)}%`);
fs.writeFileSync(path.join(__dirname, 'data', `results_f${fleet}_s${sample}.json`), JSON.stringify({ fleet, sample, seeds, results }, null, 1));
