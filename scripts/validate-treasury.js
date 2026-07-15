const { latestHoldingDate, readPayload } = require('./treasury-utils');

const DAY_MS = 86400000;
const errors = [];
const warnings = [];

function check(condition, message) {
  if (!condition) errors.push(message);
}

function validIsoDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value || '') && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
}

function ageDays(value, now = Date.now()) {
  return Math.floor((now - Date.parse(`${value}T00:00:00Z`)) / DAY_MS);
}

function validateHolding(record, asset, min, max, maxAge, label) {
  const holding = record?.holdings?.find(item => item.asset === asset);
  check(Boolean(holding), `${label}: ${asset} holding missing`);
  if (!holding) return;
  check(Number.isFinite(holding.coins) && holding.coins >= min && holding.coins <= max, `${label}: ${asset} outside bounds (${holding.coins})`);
  check(validIsoDate(holding.asOf), `${label}: invalid as-of date (${holding.asOf})`);
  if (validIsoDate(holding.asOf)) {
    const age = ageDays(holding.asOf);
    check(age >= -2, `${label}: as-of date is in the future (${holding.asOf})`);
    check(age <= maxAge, `${label}: holding is ${age} days old (limit ${maxAge})`);
  }
  check(/^https:\/\//.test(record.source || ''), `${label}: official source URL missing`);
}

function validateHistory(payload, ticker, field, date, value) {
  const point = payload._history?.[ticker]?.[field]?.find(item => item[0] === date);
  check(Boolean(point), `${ticker}: ${field} history missing ${date}`);
  if (point) check(point[1] === value, `${ticker}: ${field} history value mismatch at ${date}`);
}

function main() {
  const payload = readPayload();
  check(Boolean(payload), 'treasury payload missing');
  if (!payload) throw new Error(errors.join('\n'));

  check(payload.schemaVersion === 2, `unsupported schema version ${payload.schemaVersion}`);
  const generatedAt = Date.parse(payload.generatedAt);
  check(Number.isFinite(generatedAt), 'generatedAt is invalid');
  if (Number.isFinite(generatedAt)) {
    check(Math.abs(Date.now() - generatedAt) <= DAY_MS, 'generatedAt is more than 24 hours from now');
  }

  validateHolding(payload.MSTR, 'BTC', 100000, 5000000, 21, 'MSTR');
  check(Number.isSafeInteger(payload.MSTR?.shares) && payload.MSTR.shares >= 100000000, 'MSTR: basic shares invalid');
  check(Number.isSafeInteger(payload.MSTR?.assumedDilutedShares) && payload.MSTR.assumedDilutedShares >= payload.MSTR.shares, 'MSTR: diluted shares invalid');
  for (const field of ['debt', 'preferred', 'cash']) {
    check(Number.isFinite(payload.MSTR?.capital?.[field]) && payload.MSTR.capital[field] >= 0, `MSTR: capital.${field} invalid`);
  }

  validateHolding(payload.BMNR, 'ETH', 1000000, 20000000, 21, 'BMNR');
  validateHolding(payload.BMNR, 'BTC', 0, 100000, 21, 'BMNR');
  check(Number.isFinite(payload.BMNR?.capital?.cash) && payload.BMNR.capital.cash >= 0, 'BMNR: cash invalid');

  validateHolding(payload.SBET, 'ETH', 100000, 10000000, 75, 'SBET');
  check(Number.isSafeInteger(payload.SBET?.shares) && payload.SBET.shares >= 100000000, 'SBET: basic shares invalid');

  validateHolding(payload.KR?.['290560'], 'ETH', 1000, 10000000, 75, '290560');
  for (const [code, min, max] of [
    ['377030', 1, 100000],
    ['049470', 1, 100000],
    ['288330', 1, 100000],
    ['112040', 1, 100000],
    ['042420', 1, 100000],
  ]) {
    validateHolding(payload.KR?.[code], 'BTC', min, max, 170, code);
  }

  for (const key of ['strategy', 'bitmine', 'sharplink', 'parataxis']) {
    const source = payload._meta?.sources?.[key];
    check(Boolean(source), `${key}: source attempt status missing`);
    if (source && source.status !== 'ok') warnings.push(`${key}: ${source.error || source.status}`);
  }

  const mstrHolding = payload.MSTR.holdings[0];
  validateHistory(payload, 'MSTR', 'coins', mstrHolding.asOf, mstrHolding.coins);
  validateHistory(payload, 'MSTR', 'shares', payload.MSTR.sharesAsOf, payload.MSTR.assumedDilutedShares);
  const bmnrHolding = payload.BMNR.holdings.find(item => item.asset === 'ETH');
  validateHistory(payload, 'BMNR', 'coins', bmnrHolding.asOf, bmnrHolding.coins);
  const sbetHolding = payload.SBET.holdings[0];
  validateHistory(payload, 'SBET', 'coins', sbetHolding.asOf, sbetHolding.coins);

  for (const warning of warnings) console.warn(`WARNING: ${warning}`);
  if (errors.length) {
    for (const error of errors) console.error(`ERROR: ${error}`);
    process.exitCode = 1;
    return;
  }

  const dates = ['MSTR', 'BMNR', 'SBET'].map(ticker => `${ticker}=${latestHoldingDate(payload[ticker])}`).join(', ');
  console.log(`treasury validation passed (${dates}, KR290560=${latestHoldingDate(payload.KR['290560'])})`);
}

main();
