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
  state.crypto = {
    BTC_KRW: { price: 100_000_000 },
    ETH_KRW: { price: 3_000_000 },
  };
  state.kr = {
    '377030': { price: 1_000, marketCap: 55_150_400_000, changePct: 0 },
    '049470': { price: 1_000, marketCap: 30_000_000_000, changePct: 0 },
    '290560': { price: 1_000, marketCap: 31_347_000_000, changePct: 0 },
    '288330': { price: 1_000, marketCap: 22_471_490_000, changePct: 0 },
    '112040': { price: 1_000, marketCap: 21_500_000_000, changePct: 0 },
    '042420': { price: 1_000, marketCap: 6_400_000_000, changePct: 0 },
  };

  const rows = buildRows();
  const krRows = rows.filter(row => row.market === 'KR');
  assert.equal(krRows.length, 6);
  for (const row of krRows) assert.ok(Math.abs(row.equityMnav - 1) < 1e-12, row.key);
  const bitmax = krRows.find(row => row.key === '377030');
  const bitplanet = krRows.find(row => row.key === '049470');
  const parataxisEth = krRows.find(row => row.key === '290560');
  assert.ok(Math.abs(bitmax.enterpriseMnav - ((55_150_400_000 + 75_750_000_000 - 8_512_686_084) / 55_150_400_000)) < 1e-12);
  assert.ok(Math.abs(bitplanet.enterpriseMnav - ((30_000_000_000 + 7_000_000_000 - 13_290_550_919) / 30_000_000_000)) < 1e-12);
  assert.ok(Math.abs(parataxisEth.enterpriseMnav - ((31_347_000_000 + 6_000_000_000 - 2_253_892_824) / 31_347_000_000)) < 1e-12);
  assert.equal(bitmax.potentialShares, 25_043_129);
  assert.equal(bitplanet.potentialShares, 2_194_488);
  assert.equal(parataxisEth.potentialShares, 4_242_950);
  assert.ok(parataxisEth.mergerMnav > 0);

  renderKrTable(rows);
  assert.match(krTable.innerHTML, /단순 mNAV/);
  assert.match(krTable.innerHTML, /Enterprise mNAV/);
  assert.match(krTable.innerHTML, /잠재 희석/);
  assert.match(krTable.innerHTML, /합병가정/);
  assert.equal((krTable.innerHTML.match(/1\.00×/g) || []).length, 6);
  assert.equal((krTable.innerHTML.match(/공시 자동/g) || []).length, 5);
  assert.match(krTable.innerHTML, /별도 기준/);
  assert.match(krTable.innerHTML, /연결 기준/);
});
