const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');

const { readPayload } = require('./treasury-utils');

function loadDashboard() {
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  const scripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)]
    .map(match => match[1])
    .filter(source => source.trim());
  assert.equal(scripts.length, 1, 'expected one inline dashboard script');

  const bootMarker = '// 캐시가 있으면';
  const definitionSource = scripts[0].slice(0, scripts[0].indexOf(bootMarker));
  assert.ok(definitionSource.length > 0, 'dashboard boot marker missing');

  const krTable = { innerHTML: '' };
  const context = {
    LATEST_TREASURY: readPayload(),
    TREASURY: {},
    localStorage: { getItem: () => null, setItem: () => {} },
    location: { hostname: 'localhost', search: '' },
    document: { querySelector: selector => selector === '#krt' ? krTable : null },
    window: { addEventListener: () => {} },
    setTimeout: () => 0,
    clearTimeout: () => {},
    URL,
    Date,
    console,
    AbortController,
  };
  vm.runInNewContext(
    `${definitionSource}\nglobalThis.__dashboard = { state, buildRows, renderKrTable };`,
    context,
    { filename: 'index.html:inline' },
  );
  return { ...context.__dashboard, krTable };
}

test('Korean rows keep simple mNAV, enterprise mNAV, and dilution separate', () => {
  const { state, buildRows, renderKrTable, krTable } = loadDashboard();
  const parataxisValue = readPayload().KR['290560'].holdings[0].coins * 3_000_000;
  state.crypto = {
    BTC_KRW: { price: 100_000_000 },
    ETH_KRW: { price: 3_000_000 },
  };
  state.kr = {
    '377030': { price: 1_000, marketCap: 55_150_400_000, changePct: 0 },
    '049470': { price: 1_000, marketCap: 30_000_000_000, changePct: 0 },
    '290560': { price: 1_000, marketCap: parataxisValue, changePct: 0 },
    '288330': { price: 1_000, marketCap: 22_471_490_000, changePct: 0 },
  };

  const rows = buildRows();
  const krRows = rows.filter(row => row.market === 'KR');
  assert.equal(krRows.length, 4);
  for (const row of krRows) assert.ok(Math.abs(row.equityMnav - 1) < 1e-12, row.key);
  const bitmax = krRows.find(row => row.key === '377030');
  const bitplanet = krRows.find(row => row.key === '049470');
  const parataxisEth = krRows.find(row => row.key === '290560');
  assert.ok(Math.abs(bitmax.enterpriseMnav - ((55_150_400_000 + 75_750_000_000 - 8_512_686_084) / 55_150_400_000)) < 1e-12);
  assert.ok(Math.abs(bitplanet.enterpriseMnav - ((30_000_000_000 + 7_000_000_000 - 13_290_550_919) / 30_000_000_000)) < 1e-12);
  assert.ok(Math.abs(parataxisEth.enterpriseMnav - ((parataxisValue + 6_000_000_000 - 2_253_892_824) / parataxisValue)) < 1e-12);
  assert.equal(bitmax.potentialShares, 25_043_129);
  assert.equal(bitplanet.potentialShares, 2_194_488);
  assert.equal(parataxisEth.potentialShares, 4_242_950);
  assert.equal(parataxisEth.mergerMnav, undefined, 'withdrawn merger must not be valued');

  renderKrTable(rows);
  assert.match(krTable.innerHTML, /단순 mNAV/);
  assert.match(krTable.innerHTML, /Enterprise mNAV/);
  assert.match(krTable.innerHTML, /잠재 희석/);
  assert.doesNotMatch(krTable.innerHTML, /합병가정/);
  assert.equal((krTable.innerHTML.match(/1\.00×/g) || []).length, 4);
  assert.equal((krTable.innerHTML.match(/공시 자동/g) || []).length, 3);
  assert.doesNotMatch(krTable.innerHTML, /위메이드|네오위즈홀딩스/);
});

test('PURR uses HYPE and includes converted preferred shares once, with warrants separate', () => {
  const { state, buildRows } = loadDashboard();
  state.crypto = { HYPE_USD: { price: 50, supply: 300000000 } };
  state.us = { PURR: { price: 10, prevClose: 8 } };
  const row = buildRows().find(r => r.key === 'PURR');
  const record = readPayload().PURR;
  assert.equal(row.holdings[0].asset, 'HYPE');
  assert.equal(row.shares, record.commonShares + record.preferredConversion);
  assert.equal(row.coinValue, record.holdings[0].coins * 50);
  assert.equal(row.mcap, 10 * record.shares);
  assert.equal(row.mnav, (10 * record.shares + record.capital.debt - record.capital.cash) / row.coinValue);
  const expectedDilution = record.warrants.reduce((sum, w) => sum + Math.max(0, 1 - w.strike / 10) * w.shares, 0);
  assert.equal(row.dilutedShares, record.shares + expectedDilution);
  assert.equal(row.perShareDiluted, row.coinValue / row.dilutedShares);
  delete state.crypto.HYPE_USD;
  assert.equal(buildRows().find(r => r.key === 'PURR').mnav, null, 'missing HYPE must not become zero or a BTC valuation');
});
