const fs = require('fs');
const path = require('path');

const TREASURY_FILE = path.join(__dirname, '..', 'treasury-latest.js');

function parsePayload(text) {
  const marked = text.match(/\/\* TREASURY_PAYLOAD_START \*\/\s*const latest = ([^\r\n]+);\s*\/\* TREASURY_PAYLOAD_END \*\//);
  const legacy = text.match(/const latest = ([^\r\n]+);/);
  const json = marked?.[1] || legacy?.[1];
  if (!json) return null;
  return JSON.parse(json);
}

function readPayload(file = TREASURY_FILE) {
  if (!fs.existsSync(file)) return null;
  return parsePayload(fs.readFileSync(file, 'utf8'));
}

function renderPayload(payload) {
  const json = JSON.stringify(payload)
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
  return `(() => {
  /* TREASURY_PAYLOAD_START */
  const latest = ${json};
  /* TREASURY_PAYLOAD_END */
  globalThis.LATEST_TREASURY = latest;

  if (typeof TREASURY === 'undefined') return;
  const upsert = (history, entries) => {
    if (!Array.isArray(history) || !Array.isArray(entries)) return;
    for (const entry of entries) {
      if (!Array.isArray(entry) || entry.length !== 2) continue;
      const existing = history.find(point => point[0] === entry[0]);
      if (existing) existing[1] = entry[1];
      else history.push([entry[0], entry[1]]);
    }
    history.sort((a, b) => a[0].localeCompare(b[0]));
  };

  for (const [ticker, series] of Object.entries(latest._history || {})) {
    if (!TREASURY[ticker]) continue;
    upsert(TREASURY[ticker].coins, series.coins);
    upsert(TREASURY[ticker].shares, series.shares);
  }
})();
`;
}

function writePayload(payload, file = TREASURY_FILE) {
  fs.writeFileSync(file, renderPayload(payload));
}

function upsertPoint(history, date, value) {
  if (!Array.isArray(history)) throw new Error('history must be an array');
  const existing = history.find(point => point[0] === date);
  if (existing) existing[1] = value;
  else history.push([date, value]);
  history.sort((a, b) => a[0].localeCompare(b[0]));
}

function latestHoldingDate(record) {
  const dates = (record?.holdings || []).map(item => item.asOf).filter(Boolean);
  return dates.sort().at(-1) || null;
}

module.exports = {
  TREASURY_FILE,
  latestHoldingDate,
  parsePayload,
  readPayload,
  renderPayload,
  upsertPoint,
  writePayload,
};
