// The issuer's weekly inputs are in millions and lag the publication date by seven days.
const ORIGIN = 'https://hypestrat.xyz';
const SOURCE = `${ORIGIN}/dashboard`;
const DEBT_SOURCE = 'https://www.sec.gov/Archives/edgar/data/2078856/000119312526370281/purr-20260630.htm';

function inputDate(value) {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value || '');
  if (!m) throw new Error(`PURR invalid effectiveDate: ${value}`);
  const date = new Date(`${m[3]}-${m[1]}-${m[2]}T00:00:00Z`);
  if (!Number.isFinite(+date) || date.toISOString().slice(0, 10) !== `${m[3]}-${m[1]}-${m[2]}`) throw new Error('PURR invalid calendar date');
  date.setUTCDate(date.getUTCDate() - 7);
  return date.toISOString().slice(0, 10);
}

function parseInputs(inputs, preferredConversion) {
  const asOf = inputDate(inputs?.effectiveDate);
  const amount = (key, min, max) => {
    const n = inputs[key];
    if (typeof n !== 'number' || !Number.isFinite(n) || n < min || n > max) throw new Error(`PURR invalid ${key}: ${n}`);
    return Math.round(n * 1e6);
  };
  const shares = amount('basicShares', 1, 10000);
  if (!Number.isSafeInteger(preferredConversion) || preferredConversion < 0 || preferredConversion >= shares) throw new Error('PURR invalid preferred conversion');
  const warrants = (inputs.warrants || []).map(w => {
    if (!Number.isFinite(w.amount) || w.amount < 0 || !Number.isFinite(w.strike) || w.strike <= 0) throw new Error('PURR invalid warrants');
    return { shares: Math.round(w.amount * 1e6), strike: w.strike };
  });
  return {
    shares, commonShares: shares - preferredConversion, preferredConversion,
    sharesAsOf: asOf, sharesLabel: '보통주+전환우선주', warrants,
    holdings: [{ asset: 'HYPE', coins: amount('hypeHeld', 0.1, 500), asOf }],
    capital: { debt: 0, preferred: 0, cash: amount('cash', 0, 100000), cashAsOf: asOf, debtAsOf: '2026-06-30', debtSource: DEBT_SOURCE },
    source: SOURCE, sharesSource: SOURCE, publishedAt: inputs.effectiveDate,
    updateMode: 'auto', fetchedAt: new Date().toISOString(),
  };
}

function parseHistory(history, current) {
  const entries = [...(history?.snapshots || []), ...(history?.weekly || []), { inputs: current }];
  const coins = new Map(), shares = new Map();
  for (const { inputs } of entries) {
    const date = inputDate(inputs.effectiveDate);
    if (!(inputs.hypeHeld > 0) || !(inputs.basicShares > 0)) throw new Error('PURR invalid history entry');
    coins.set(date, Math.round(inputs.hypeHeld * 1e6));
    shares.set(date, Math.round(inputs.basicShares * 1e6));
  }
  const sorted = map => [...map].sort((a, b) => a[0].localeCompare(b[0]));
  return { coins: sorted(coins), shares: sorted(shares) };
}

async function request(path, json = true) {
  const res = await fetch(`${ORIGIN}${path}`, { signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`PURR ${path} HTTP ${res.status}`);
  return json ? res.json() : res.text();
}

async function fetchHyperliquid() {
  const [latest, html] = await Promise.all([request('/api/dashboard-inputs'), request('/', false)]);
  const preferred = Number(html.match(/var\s+PREFERRED_CONVERSION\s*=\s*(\d+)\s*;/)?.[1]);
  const record = parseInputs(latest.inputs, preferred);
  // Historical endpoint failure must not discard the current, validated snapshot.
  let history = { coins: [[record.holdings[0].asOf, record.holdings[0].coins]], shares: [[record.sharesAsOf, record.shares]] };
  try { history = parseHistory(await request('/api/dashboard-history'), latest.inputs); }
  catch (error) { console.warn(`PURR history: ${error.message}`); }
  return { ...record, history };
}

module.exports = { fetchHyperliquid, parseInputs, parseHistory, inputDate };
