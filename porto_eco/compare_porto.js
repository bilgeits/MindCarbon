// Kullanım: node compare_porto.js <algo> [lambda] [seed] [başlangıç_s] [bitiş_s] [adalet_μ]
const fs = require('fs');
const S = require('./sim_porto.js');
const graph = JSON.parse(fs.readFileSync('data/porto_graph.json', 'utf8'));
const calib = JSON.parse(fs.readFileSync('data/calibration.json', 'utf8'));
const veh = JSON.parse(fs.readFileSync('data/vehicles.json', 'utf8'));
const day = JSON.parse(fs.readFileSync('data/porto_simday.json', 'utf8'));
const [algo = 'green', lambda = '6', seed = '1', from = '0', to = '86400', fair = '0'] = process.argv.slice(2);
const t0 = Date.now();
const ctx = S.prepare(graph, calib, veh);
console.error('hazırlık', Date.now() - t0, 'ms; negatif indirgenmiş kenar:', ctx.em.map(e => e.negativeReduced).reduce((a, b) => a + b, 0));
const d = Object.assign({}, day, { requests: day.requests.filter(r => r[0] >= +from && r[0] < +to) });
const res = S.run(ctx, d, { algo, lambda: +lambda, seed: +seed, fair: +fair, log: true });
const { log, ...m } = res;
console.log(JSON.stringify(m));
fs.mkdirSync('results', { recursive: true });
fs.writeFileSync(`results/${algo}_l${lambda}_f${fair}_s${seed}_${from}-${to}.json`, JSON.stringify(res));
console.error('süre', ((Date.now() - t0) / 1000).toFixed(1), 's');
