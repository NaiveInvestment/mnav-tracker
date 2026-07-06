// Build history.json: daily closes for stocks + crypto since 2020-08 (Yahoo chart API).
// Used by GitHub Actions (every deploy) and by server.js locally (daily cache).
const fs = require('fs');
const path = require('path');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';
const SYMBOLS = { MSTR: 'MSTR', BMNR: 'BMNR', SBET: 'SBET', BTC: 'BTC-USD', ETH: 'ETH-USD' };
const FROM = Math.floor(Date.parse('2020-08-01') / 1000);

async function series(yahooSym) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooSym)}?period1=${FROM}&period2=9999999999&interval=1d`;
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`${res.status} ${yahooSym}`);
  const j = await res.json();
  const r = j.chart.result[0];
  const ts = r.timestamp || [];
  const close = r.indicators.quote[0].close || [];
  const t = [], c = [];
  for (let i = 0; i < ts.length; i++) {
    if (close[i] == null) continue;
    t.push(Math.floor(ts[i] / 86400)); // epoch day
    c.push(Math.round(close[i] * 100) / 100);
  }
  return { t, c };
}

async function buildHistory() {
  const keys = Object.keys(SYMBOLS);
  const results = await Promise.all(keys.map(k => series(SYMBOLS[k])));
  const out = { asOf: new Date().toISOString() };
  keys.forEach((k, i) => { out[k] = results[i]; });
  return out;
}

async function main() {
  const out = await buildHistory();
  const file = path.join(__dirname, '..', 'history.json');
  fs.writeFileSync(file, JSON.stringify(out));
  console.log('history.json written:', Object.keys(SYMBOLS).map(k => `${k}=${out[k].t.length}`).join(' '));
}

module.exports = { buildHistory };
if (require.main === module) main().catch((e) => { console.error(e); process.exit(1); });
