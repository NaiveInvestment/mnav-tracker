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

test('Korean rows calculate and render market-cap mNAV', () => {
  const { state, buildRows, renderKrTable, krTable } = loadDashboard();
  state.crypto = {
    BTC_KRW: { price: 100_000_000 },
    ETH_KRW: { price: 3_000_000 },
  };
  state.kr = {
    '377030': { price: 1_000, marketCap: 55_123_800_000, changePct: 0 },
    '049470': { price: 1_000, marketCap: 29_999_987_400, changePct: 0 },
    '290560': { price: 1_000, marketCap: 31_347_000_000, changePct: 0 },
    '288330': { price: 1_000, marketCap: 21_660_920_000, changePct: 0 },
    '112040': { price: 1_000, marketCap: 21_500_000_000, changePct: 0 },
    '042420': { price: 1_000, marketCap: 7_800_000_000, changePct: 0 },
  };

  const rows = buildRows();
  const krRows = rows.filter(row => row.market === 'KR');
  assert.equal(krRows.length, 6);
  for (const row of krRows) assert.ok(Math.abs(row.equityMnav - 1) < 1e-12, row.key);

  renderKrTable(rows);
  assert.match(krTable.innerHTML, /시총 mNAV/);
  assert.equal((krTable.innerHTML.match(/1\.00×/g) || []).length, 6);
});
