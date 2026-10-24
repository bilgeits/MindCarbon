// demo_template.html + sim.js + data/sim_data.json -> demo.html (tek dosya, çevrimdışı açılır)
// Önce: node compare.js 500 0.1 1 2 3
const fs = require('fs');
const path = require('path');
const dir = __dirname;
const read = f => fs.readFileSync(path.join(dir, f), 'utf8');
const pre = JSON.parse(read('data/results_f500_s0.1.json')).results;
const html = read('demo_template.html')
  .replace('/*__SIM_JS__*/', () => read('sim.js'))
  .replace('/*__DATA__*/', () => read('data/sim_data.json'))
  .replace('/*__PRECOMPUTED__*/', () => JSON.stringify(pre));
fs.writeFileSync(path.join(dir, 'demo.html'), html);
console.log('demo.html', (html.length / 1e6).toFixed(2), 'MB');
