// demo/app_template.html + kod + veri -> demo/greenmatch_taksi_app.html
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..'), rd = f => fs.readFileSync(path.join(root, f), 'utf8');
const G = require(path.join(root, 'grid.js'));
const graph = JSON.parse(rd('data/porto_graph.json')); delete graph.edgeObs;
const rows = {};
for (const l of rd('data/elev_rows_data.txt').trim().split('\n')) { const [cy, v] = l.split(':'); rows[+cy] = v.split(',').map(s => (s === 'null' || s === '' ? null : +s)); }
const elevGrid = [];
for (let cy = 0; cy < G.NY; cy++) for (let cx = 0; cx < G.NX; cx++) { let h; if (rows[cy]) h = rows[cy][cx]; else { const a = rows[cy - 1]?.[cx] ?? null, b = rows[cy + 1]?.[cx] ?? null; h = a == null && b == null ? null : a == null ? b : b == null ? a : (a + b) / 2; } elevGrid.push(h == null ? -999 : Math.round(h)); }
const summary = rd('results/summary.jsonl').trim().split('\n').map(JSON.parse).map(({ byPowertrain, fleetByPowertrain, ...r }) => r);
const data = { graph, calib: JSON.parse(rd('data/calibration.json')), vehicles: JSON.parse(rd('data/vehicles.json')), elevGrid, summary };
const code = ['grid.js', 'emission.js', 'router.js'].map(rd).join('\n');
const html = fs.readFileSync(path.join(__dirname, 'app_template.html'), 'utf8').replace('/*__CODE__*/', () => code).replace('/*__DATA__*/', () => JSON.stringify(data));
fs.writeFileSync(path.join(__dirname, 'greenmatch_taksi_app.html'), html);
console.log('greenmatch_taksi_app.html', (html.length / 1e6).toFixed(2), 'MB');
