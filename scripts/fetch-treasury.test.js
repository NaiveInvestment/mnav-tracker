const test = require('node:test');
const assert = require('node:assert/strict');
const {
  parseKoreanCount,
  parseParataxisHoldings,
  parseSharpLinkHoldings,
  rssDate,
} = require('./fetch-treasury');
const { parsePayload, renderPayload } = require('./treasury-utils');

test('Korean 만-unit holdings are parsed exactly', () => {
  assert.equal(parseKoreanCount('1만449'), 10449);
  assert.equal(parseKoreanCount('9,399'), 9399);
});

test('Parataxis parser takes the new total, not the transaction amount', () => {
  assert.equal(
    parseParataxisHoldings('이더리움 1050개를 추가 매입하며 총보유량이 1만449개로 늘어났다고 밝혔다.'),
    10449,
  );
  assert.equal(
    parseParataxisHoldings('이더리움 총 보유량은 기존 10,449개에서 9,000개로 감소했다.'),
    9000,
  );
});

test('Sharplink SEC disclosure parser reads date and aggregate ETH', () => {
  assert.deepEqual(
    parseSharpLinkHoldings('As of June 28, 2026, substantially all assets were staked. As of June 28, 2026, the Company’s aggregate ETH Holdings were 886,725 of which 632,719 were native ETH.'),
    { asOf: '2026-06-28', coins: 886725 },
  );
});

test('Newswire RFC date keeps the Korean calendar date', () => {
  assert.equal(rssDate('Wed, 08 Jul 2026 09:43:30 +0900'), '2026-07-08');
});

test('generated payload round-trips source errors containing semicolons', () => {
  const payload = { schemaVersion: 2, _meta: { sources: { test: { error: '403; retry later' } } } };
  assert.deepEqual(parsePayload(renderPayload(payload)), payload);
});
