// demo/template.html + kod + veri -> demo/greenmatch_porto.html (tek dosya, çevrimdışı açılır)
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
const rd = f => fs.readFileSync(path.join(root, f), 'utf8');
const G = require(path.join(root, 'grid.js'));
const graph = JSON.parse(rd('data/porto_graph.json'));
delete graph.visits; delete graph.edgeObs;
// tam yükseklik ızgarası (harita zemini için): deniz = -999
const rows = {};
for (const l of rd('data/elev_rows_data.txt').trim().split('\n')) { const [cy, v] = l.split(':'); rows[+cy] = v.split(',').map(s => (s === 'null' || s === '' ? null : +s)); }
const elevGrid = [];
for (let cy = 0; cy < G.NY; cy++) for (let cx = 0; cx < G.NX; cx++) {
  let h; if (rows[cy]) h = rows[cy][cx]; else { const a = rows[cy - 1]?.[cx] ?? null, b = rows[cy + 1]?.[cx] ?? null; h = a == null && b == null ? null : a == null ? b : b == null ? a : (a + b) / 2; }
  elevGrid.push(h == null ? -999 : Math.round(h));
}
const summary = rd('results/summary.jsonl').trim().split('\n').map(JSON.parse);
const day = JSON.parse(rd('data/porto_simday.json'));
const data = { graph, calib: JSON.parse(rd('data/calibration.json')), vehicles: JSON.parse(rd('data/vehicles.json')), elevGrid, summary,
  routeEval: JSON.parse(rd('results/route_eval.json')), simday: { requests: day.requests.length, taxis: day.shifts.length, hourly: day.hourly, active: day.activeTaxisByHour } };
const code = ['grid.js', 'emission.js', 'router.js'].map(rd).join('\n');
const html = fs.readFileSync(path.join(__dirname, 'template.html'), 'utf8').replace('/*__CODE__*/', () => code).replace('/*__DATA__*/', () => JSON.stringify(data));
fs.writeFileSync(path.join(__dirname, 'greenmatch_porto.html'), html);
console.log('greenmatch_porto.html', (html.length / 1e6).toFixed(2), 'MB');
