// Birden fazla senaryoyu sırayla çalıştırır, özetleri results/summary.jsonl dosyasına ekler.
// Kullanım: node run_batch.js "algo:lambda:fair:seed" ...
const fs = require('fs');
const S = require('./sim_porto.js');
const ctx = S.prepare(JSON.parse(fs.readFileSync('data/porto_graph.json', 'utf8')), JSON.parse(fs.readFileSync('data/calibration.json', 'utf8')), JSON.parse(fs.readFileSync('data/vehicles.json', 'utf8')));
const day = JSON.parse(fs.readFileSync('data/porto_simday.json', 'utf8'));
fs.mkdirSync('results', { recursive: true });
for (const spec of process.argv.slice(2)) {
  const [algo, lambda, fair, seed] = spec.split(':');
  const t0 = Date.now();
  const res = S.run(ctx, day, { algo, lambda: +lambda, fair: +fair, seed: +seed, log: seed === '1' });
  const { log, ...m } = res; m.runSec = +((Date.now() - t0) / 1000).toFixed(1);
  fs.appendFileSync(process.env.OUT || 'results/summary.jsonl', JSON.stringify(m) + '\n');
  if (seed === '1') fs.writeFileSync(`results/${process.env.TAG || ''}log_${algo}_l${lambda}_f${fair}.json`, JSON.stringify(log));
  console.log(spec, 'gPerPkm', m.gPerPkm, 'bekleme', m.waitMeanMin, 'boş%', (m.emptyShare * 100).toFixed(1), 'gini', m.gini, m.runSec + 's');
}
