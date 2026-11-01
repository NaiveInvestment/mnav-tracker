const test = require('node:test');
const assert = require('node:assert/strict');
const { parseInputs, parseHistory, inputDate } = require('./fetch-hyperliquid');
const { parseSpotQuote } = require('../hyperliquid-lib');

const inputs = { effectiveDate: '10/29/2026', hypeHeld: 38.85, basicShares: 300.77, cash: 245.35, warrants: [{ amount: 9.13, strike: 9.38 }] };

test('issuer millions, preferred conversion, and the one-week reporting lag are applied exactly', () => {
  const r = parseInputs(inputs, 26587647);
  assert.equal(r.holdings[0].coins, 38850000);
  assert.equal(r.holdings[0].asOf, '2026-10-22');
  assert.equal(r.shares, 300770000);
  assert.equal(r.commonShares, 274182353);
  assert.equal(r.capital.cash, 245350000);
  assert.equal(r.capital.preferred, 0);
  assert.equal(r.warrants[0].shares, 9130000);
  assert.equal(inputDate('01/01/2026'), '2025-12-25');
  assert.throws(() => inputDate('02/30/2026'));
  assert.throws(() => parseInputs({ ...inputs, hypeHeld: null }, 26587647));
  assert.throws(() => parseInputs({ ...inputs, cash: -1 }, 26587647));
  assert.throws(() => parseInputs(inputs, NaN));
});

test('issuer history is chronological, deduplicated, and stops at observed snapshots', () => {
  const r = parseHistory({ snapshots: [{ inputs: { ...inputs, effectiveDate: '10/22/2026', hypeHeld: 38.83 } }], weekly: [{ inputs }] }, inputs);
  assert.deepEqual(r.coins, [['2026-10-15', 38830000], ['2026-10-22', 38850000]]);
  assert.deepEqual(r.shares, [['2026-10-15', 300770000], ['2026-10-22', 300770000]]);
});

test('HYPE spot is resolved from token metadata and never confused with the PURR token', () => {
  const data = [{ tokens: [{ name: 'USDC', index: 0 }, { name: 'PURR', index: 1 }, { name: 'HYPE', index: 150 }], universe: [{ tokens: [1, 0], index: 0 }, { tokens: [150, 0], index: 1 }] }, [{ midPx: '0.1' }, { midPx: '51', prevDayPx: '50', circulatingSupply: '301000000' }]];
  const q = parseSpotQuote(data);
  assert.equal(q.price, 51);
  assert.ok(Math.abs(q.changePct - 2) < 1e-10);
  assert.equal(q.supply, 301000000);
  data[1][1].midPx = 'NaN';
  assert.throws(() => parseSpotQuote(data));
});
