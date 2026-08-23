const test = require('node:test');
const assert = require('node:assert/strict');
const {
  dartReportAsOf,
  parseDartHolding,
  parseDartCapital,
  parseDartRss,
  parseKoreanCount,
  parseParataxisHoldings,
  parseSharpLinkHoldings,
  parseSecOutstandingShares,
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

test('SEC cover page parser reads basic shares and date', () => {
  assert.deepEqual(
    parseSecOutstandingShares('The number of shares outstanding of the registrant’s common stock as of July 9, 2026 was 603,226,394 shares.'),
    { sharesAsOf: '2026-07-09', shares: 603226394 },
  );
});

test('Newswire RFC date keeps the Korean calendar date', () => {
  assert.equal(rssDate('Wed, 08 Jul 2026 09:43:30 +0900'), '2026-07-08');
});

test('generated payload round-trips source errors containing semicolons', () => {
  const payload = { schemaVersion: 2, _meta: { sources: { test: { error: '403; retry later' } } } };
  assert.deepEqual(parsePayload(renderPayload(payload)), payload);
});

const table = rows => `<table>${rows.map(row => `<tr>${row.map(cell => `<td>${cell}</td>`).join('')}</tr>`).join('')}</table>`;

test('DART RSS keeps periodic filings and orders them newest first', () => {
  const rss = `<rss><channel>
    <item><title><![CDATA[분기보고서 (2026.09)]]></title><link>https://dart.fss.or.kr/dsaf001/main.do?rcpNo=20261114000001</link><pubDate>Sat, 14 Nov 2026 10:00:00 +0900</pubDate></item>
    <item><title><![CDATA[주요사항보고서]]></title><link>https://dart.fss.or.kr/dsaf001/main.do?rcpNo=20261001000001</link><pubDate>Thu, 01 Oct 2026 10:00:00 +0900</pubDate></item>
    <item><title><![CDATA[반기보고서 (2026.06)]]></title><link>https://dart.fss.or.kr/dsaf001/main.do?rcpNo=20260814000001</link><pubDate>Fri, 14 Aug 2026 10:00:00 +0900</pubDate></item>
  </channel></rss>`;
  assert.deepEqual(parseDartRss(rss).map(item => item.rcpNo), ['20261114000001', '20260814000001']);
});

test('DART company parsers select each disclosed ending BTC balance', () => {
  const bitmax = table([
    ['구분', '당반기말 수량', '당반기말 공정가치', '비고'],
    ['Bitcoin', '10', '551.504', '-'],
  ]);
  const bitplanet = table([
    ['가상자산', '기초', '취득', '처분', '기말', '원화환산'],
    ['비트코인 (BTC)', '250', '50', '0', '300', '10'],
  ]);
  const parataxis = table([
    ['가상자산명칭', '기초', '증가', '감소', '당반기말', '공정가치'],
    ['BTC', '216.6092', '8.1057', '0', '224.7149', '10'],
  ]);
  assert.equal(parseDartHolding('377030', bitmax), 551.504);
  assert.equal(parseDartHolding('049470', bitplanet), 300);
  assert.equal(parseDartHolding('288330', parataxis), 224.7149);
});

test('DART capital parser keeps debt principal and potential shares separate', () => {
  const bitplanet = [
    table([
      ['제 30 기 반기말', '제 29 기말'],
      ['현금및현금성자산 (주4)', '13,290,550,919', '13,291,351,630'],
      ['자산총계', '63,497,650,739', '71,539,903,191'],
    ]),
    table([
      ['종류＼구분', '회차', '권면(전자등록)총액', '미상환사채'],
      ['전환비율 (%)', '전환가액', '권면(전자등록)총액', '전환가능주식수'],
      ['제16회', '16', '2,000', '4,365', '2,000', '458,190', '-'],
      ['합 계', '-', '-', '7,000', '-', '-', '-', '7,000', '1,841,315', '-'],
    ]),
    table([
      ['구 분', '주식매수선택권 수량', '가중평균행사가격'],
      ['당반기말 잔여주', '353,173', '3,545'],
    ]),
  ].join('');
  assert.deepEqual(parseDartCapital('049470', bitplanet), {
    capital: { debt: 7000000000, preferred: 0, cash: 13290550919 },
    dilution: { cbShares: 1841315, optionShares: 353173 },
  });
});

test('DART report date uses the filing period or statement date', () => {
  assert.equal(dartReportAsOf('반기보고서 (2026.06)', ''), '2026-06-30');
  assert.equal(dartReportAsOf('반기보고서', '<p>2026년 6월 30일 현재</p>'), '2026-06-30');
});
