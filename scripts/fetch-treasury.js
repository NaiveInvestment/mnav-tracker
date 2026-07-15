// Build the browser treasury override from official company and SEC sources.
// A transient source failure keeps the last deployed value, while the validator
// enforces freshness so a broken updater cannot remain invisible indefinitely.
const { latestHoldingDate, readPayload, upsertPoint, writePayload } = require('./treasury-utils');

const STRATEGY_ASSETS_URL = 'https://www.strategy.com/assets';
const STRATEGY_SHARES_URL = 'https://www.strategy.com/shares';
const BITMINE_LIST_URL = 'https://www.prnewswire.com/news/bitmine-immersion-technologies%2C-inc./';
const SHARPLINK_SUBMISSIONS_URL = 'https://data.sec.gov/submissions/CIK0001981535.json';
const PARATAXIS_RSS_URL = 'https://www.newswire.co.kr/companyNews?content=rss&no=50194';
const UA = 'mnav-tracker/2.0 (https://github.com/NaiveInvestment/mnav-tracker; naiveinvestment@users.noreply.github.com)';
const BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml',
  'Accept-Language': 'en-US,en;q=0.9',
  Referer: 'https://www.strategy.com/',
};
const DEFAULT_HEADERS = { 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml' };
const SEC_HEADERS = {
  'User-Agent': BROWSER_HEADERS['User-Agent'],
  Accept: 'application/json,text/html,application/xhtml+xml',
  'Accept-Language': 'en-US,en;q=0.9',
  From: 'naiveinvestment@users.noreply.github.com',
};
const SBET_ESTIMATED_CASH = Math.round(16875000 + 75000000 * 0.98 - 16110400 - 2132773 * 4.69);

const BASELINE = {
  schemaVersion: 2,
  generatedAt: null,
  MSTR: {
    shares: 376424000,
    sharesAsOf: '2026-07-12',
    assumedDilutedShares: 406099000,
    holdings: [{ asset: 'BTC', coins: 843775, asOf: '2026-07-13' }],
    capital: { debt: 6754000000, preferred: 15464458400, cash: 3000000000, asOf: '2026-07-13' },
    source: STRATEGY_ASSETS_URL,
    sharesSource: STRATEGY_SHARES_URL,
    updateMode: 'auto',
    verifiedAt: '2026-07-15',
  },
  BMNR: {
    shares: 569580000,
    sharesAsOf: '2026-07-02',
    holdings: [{ asset: 'ETH', coins: 5770038, asOf: '2026-07-12' }, { asset: 'BTC', coins: 206, asOf: '2026-07-12' }],
    ethSupply: 120700000,
    capital: {
      debt: 0,
      preferred: 350000000,
      preferredAsOf: '2026-06-10',
      cash: 482000000,
      cashAsOf: '2026-07-12',
    },
    source: 'https://www.prnewswire.com/news-releases/bitmine-immersion-technologies-bmnr-announces-eth-holdings-reach-5-77-million-tokens-and-total-crypto-and-total-cash-holdings-of-11-3-billion-302823523.html',
    updateMode: 'auto-holdings-cash',
    verifiedAt: '2026-07-15',
  },
  SBET: {
    shares: 205091990,
    sharesAsOf: '2026-06-26',
    holdings: [{ asset: 'ETH', coins: 886725, asOf: '2026-06-28' }],
    capital: {
      debt: 0,
      preferred: 0,
      cash: SBET_ESTIMATED_CASH,
      cashAsOf: '2026-06-28',
      estimated: true,
    },
    source: 'https://www.sec.gov/Archives/edgar/data/1981535/000149315226031202/form8-k.htm',
    sharesSource: 'https://www.sec.gov/Archives/edgar/data/1981535/000149315226029804/form8-k.htm',
    updateMode: 'auto-holdings',
    verifiedAt: '2026-07-15',
  },
  KR: {
    '377030': {
      holdings: [{ asset: 'BTC', coins: 551.238, asOf: '2026-03-31' }],
      source: 'https://kind.krx.co.kr/external/2026/05/15/001922/20260515004270/11013.htm',
      updateMode: 'quarterly',
      verifiedAt: '2026-07-15',
    },
    '049470': {
      holdings: [{ asset: 'BTC', coins: 299.999874, asOf: '2026-03-31' }],
      source: 'https://kind.krx.co.kr/external/2026/05/15/003367/20260515007717/11013.htm',
      updateMode: 'quarterly',
      verifiedAt: '2026-07-15',
    },
    '290560': {
      holdings: [{ asset: 'ETH', coins: 10449, asOf: '2026-07-08' }],
      source: 'https://www.newswire.co.kr/newsRead.php?no=1038133',
      updateMode: 'auto',
      verifiedAt: '2026-07-15',
    },
    '288330': {
      holdings: [{ asset: 'BTC', coins: 216.6092, asOf: '2026-03-31' }],
      source: 'https://kind.krx.co.kr/external/2026/05/15/001508/20260515003302/11013.htm',
      updateMode: 'quarterly',
      verifiedAt: '2026-07-15',
    },
    '112040': {
      holdings: [{ asset: 'BTC', coins: 215, asOf: '2026-03-31' }],
      source: 'https://kind.krx.co.kr/external/2026/05/15/003103/20260515007084/11013.htm',
      updateMode: 'quarterly',
      verifiedAt: '2026-07-15',
    },
    '042420': {
      holdings: [{ asset: 'BTC', coins: 78, asOf: '2026-03-31' }],
      source: 'https://kind.krx.co.kr/external/2026/05/15/001987/20260515004398/11013.htm',
      updateMode: 'quarterly',
      verifiedAt: '2026-07-15',
    },
  },
  _history: {
    MSTR: { coins: [['2026-07-13', 843775]], shares: [['2026-07-12', 406099000]] },
    BMNR: { coins: [['2026-07-12', 5770038]], shares: [] },
    SBET: { coins: [['2026-06-28', 886725]], shares: [['2026-06-26', 205091990]] },
  },
  _meta: { sources: {} },
};

async function fetchText(url, headers = DEFAULT_HEADERS, timeoutMs = 20000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { headers, signal: controller.signal });
    if (!res.ok) throw new Error(`${res.status} ${url}`);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

async function fetchJson(url, headers = SEC_HEADERS) {
  return JSON.parse(await fetchText(url, headers));
}

function htmlToText(html) {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/&rsquo;/gi, '’')
    .replace(/&ndash;|&mdash;/gi, '-')
    .replace(/\s+/g, ' ')
    .trim();
}

function isoDate(englishDate) {
  const d = new Date(`${englishDate} 00:00:00 UTC`);
  if (Number.isNaN(d.getTime())) throw new Error(`invalid date: ${englishDate}`);
  return d.toISOString().slice(0, 10);
}

function numberValue(value, label) {
  const n = Number(String(value).replace(/,/g, ''));
  if (!Number.isFinite(n)) throw new Error(`invalid ${label}: ${value}`);
  return n;
}

function usdAmount(match) {
  if (!match) return null;
  const value = numberValue(match[1], 'USD amount');
  const scale = match[2].toLowerCase() === 'billion' ? 1e9 : 1e6;
  return value * scale;
}

function nextData(html, url) {
  const raw = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/)?.[1];
  if (!raw) throw new Error(`__NEXT_DATA__ not found: ${url}`);
  return JSON.parse(raw).props?.pageProps;
}

async function fetchStrategy() {
  const [assetsHtml, sharesHtml] = await Promise.all([
    fetchText(STRATEGY_ASSETS_URL, BROWSER_HEADERS),
    fetchText(STRATEGY_SHARES_URL, BROWSER_HEADERS),
  ]);
  const statsRows = nextData(assetsHtml, STRATEGY_ASSETS_URL)?.btcTrackerData || [];
  const shareRows = nextData(sharesHtml, STRATEGY_SHARES_URL)?.shares || [];
  const stats = [...statsRows].sort((a, b) => String(b.as_of_date).localeCompare(String(a.as_of_date)))[0];
  const share = [...shareRows].sort((a, b) => String(b.date).localeCompare(String(a.date)))[0];
  if (!stats || !share) throw new Error('Strategy latest rows not found');

  const shares = numberValue(share.basic_shares_outstanding, 'Strategy basic shares') * 1000;
  const assumedDilutedShares = numberValue(share.assumed_diluted_shares_outstanding, 'Strategy diluted shares') * 1000;
  const btc = numberValue(stats.btc_holdings, 'Strategy BTC');
  const statsShares = numberValue(stats.basic_shares_outstanding, 'Strategy stats shares');
  if (!Number.isSafeInteger(shares) || shares < 100000000 || shares > 2000000000) throw new Error(`Strategy shares outside bounds: ${shares}`);
  if (!Number.isSafeInteger(btc) || btc < 100000 || btc > 5000000) throw new Error(`Strategy BTC outside bounds: ${btc}`);
  if (Math.abs(statsShares - shares) > 1000) throw new Error(`Strategy share sources disagree: ${statsShares} vs ${shares}`);
  if (assumedDilutedShares < shares) throw new Error('Strategy diluted shares below basic shares');

  return {
    shares,
    sharesAsOf: share.date,
    assumedDilutedShares,
    holdings: [{ asset: 'BTC', coins: btc, asOf: stats.as_of_date }],
    capital: {
      debt: numberValue(stats.debt, 'Strategy debt'),
      preferred: numberValue(stats.pref, 'Strategy preferred'),
      cash: numberValue(stats.cash, 'Strategy cash'),
      asOf: stats.as_of_date,
    },
    source: STRATEGY_ASSETS_URL,
    sharesSource: STRATEGY_SHARES_URL,
    updateMode: 'auto',
    fetchedAt: new Date().toISOString(),
  };
}

async function fetchBitMine() {
  const list = await fetchText(BITMINE_LIST_URL);
  const link = list.match(/href="(\/news-releases\/bitmine-immersion-technologies-bmnr-announces-eth-holdings-reach-[^"]+\.html)"/i)?.[1];
  if (!link) throw new Error('latest BitMine ETH holdings release not found');

  const source = new URL(link, BITMINE_LIST_URL).href;
  const text = htmlToText(await fetchText(source));
  const holdings = text.match(/As of ([A-Z][a-z]+ \d{1,2}, \d{4})[^.]{0,300}?holdings are comprised of ([\d,]+)\s+ETH[^.]{0,300}?([\d,]+)\s+Bitcoin/i);
  if (!holdings) throw new Error('BitMine holdings values not found');

  const asOf = isoDate(holdings[1]);
  const eth = numberValue(holdings[2], 'BitMine ETH');
  const btc = numberValue(holdings[3], 'BitMine BTC');
  const supplyMillions = Number(text.match(/ETH supply\s*\(of\s*([\d.]+)\s*million ETH\s*\)/i)?.[1]);
  const cash = usdAmount(text.match(/total cash(?:\s*(?:&|and)\s*marketable securities)?(?:\s+of)?\s*\$([\d,.]+)\s*(million|billion)/i));
  if (!Number.isSafeInteger(eth) || !Number.isSafeInteger(btc) || eth < 1000000 || cash == null) {
    throw new Error(`invalid BitMine values: ETH=${eth} BTC=${btc} cash=${cash}`);
  }

  return {
    holdings: [{ asset: 'ETH', coins: eth, asOf }, { asset: 'BTC', coins: btc, asOf }],
    ethSupply: Number.isFinite(supplyMillions) ? Math.round(supplyMillions * 1000000) : null,
    capital: { cash, cashAsOf: asOf },
    source,
    updateMode: 'auto-holdings-cash',
    fetchedAt: new Date().toISOString(),
  };
}

function parseSharpLinkHoldings(text) {
  const forward = [
    /As of ([A-Z][a-z]+ \d{1,2}, \d{4})[^.]{0,600}?aggregate ETH Holdings were ([\d,]+)/i,
    /As of ([A-Z][a-z]+ \d{1,2}, \d{4})[^.]{0,600}?ETH holdings (?:were|totaled) ([\d,]+)/i,
  ];
  for (const pattern of forward) {
    const match = text.match(pattern);
    if (match) return { asOf: isoDate(match[1]), coins: numberValue(match[2], 'Sharplink ETH') };
  }
  const reverse = text.match(/aggregate ETH Holdings (?:were|totaled) ([\d,]+)[^.]{0,300}?as of ([A-Z][a-z]+ \d{1,2}, \d{4})/i);
  if (reverse) return { asOf: isoDate(reverse[2]), coins: numberValue(reverse[1], 'Sharplink ETH') };
  return null;
}

async function fetchSharpLink() {
  const submissions = await fetchJson(SHARPLINK_SUBMISSIONS_URL);
  const recent = submissions.filings?.recent;
  if (!recent) throw new Error('Sharplink SEC recent filings missing');
  const candidates = [];
  for (let i = 0; i < recent.form.length; i += 1) {
    if (recent.form[i] !== '8-K' || !recent.primaryDocument[i]) continue;
    candidates.push({
      accession: recent.accessionNumber[i].replace(/-/g, ''),
      document: recent.primaryDocument[i],
    });
    if (candidates.length >= 20) break;
  }

  for (const candidate of candidates) {
    const source = `https://www.sec.gov/Archives/edgar/data/1981535/${candidate.accession}/${candidate.document}`;
    const text = htmlToText(await fetchText(source, SEC_HEADERS));
    const parsed = parseSharpLinkHoldings(text);
    if (parsed && parsed.coins >= 100000 && parsed.coins <= 10000000) {
      return {
        holdings: [{ asset: 'ETH', coins: parsed.coins, asOf: parsed.asOf }],
        source,
        updateMode: 'auto-holdings',
        fetchedAt: new Date().toISOString(),
      };
    }
    await new Promise(resolve => setTimeout(resolve, 120));
  }
  throw new Error('Sharplink ETH holdings not found in the latest 20 Form 8-K filings');
}

function xmlValue(block, tag) {
  const value = block.match(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`, 'i'))?.[1];
  return value
    ?.replace(/^<!\[CDATA\[|\]\]>$/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .trim();
}

function parseKoreanCount(token) {
  const compact = token.replace(/[\s,]/g, '');
  if (compact.includes('만')) {
    const [tenThousands, remainder = ''] = compact.split('만');
    return Number(tenThousands) * 10000 + Number(remainder || 0);
  }
  return Number(compact);
}

function parseParataxisHoldings(text) {
  const sentences = text.match(/[^.!?。]*(?:총\s*보유량|총보유량)[^.!?。]*/g) || [];
  for (const sentence of sentences) {
    const counts = [...sentence.matchAll(/(\d[\d,\s]*만[\d,\s]*|\d[\d,]*)\s*개/g)]
      .map(match => parseKoreanCount(match[1]))
      .filter(Number.isFinite);
    if (counts.length) return counts.at(-1);
  }
  return null;
}

function rssDate(pubDate) {
  const match = pubDate.match(/\b(\d{1,2})\s+([A-Z][a-z]{2})\s+(\d{4})\b/);
  if (!match) throw new Error(`invalid RSS date: ${pubDate}`);
  return isoDate(`${match[2]} ${match[1]}, ${match[3]}`);
}

async function fetchParataxis() {
  const xml = await fetchText(PARATAXIS_RSS_URL, { ...DEFAULT_HEADERS, Accept: 'application/xml,text/xml' });
  const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/gi)].map(match => match[1]);
  for (const item of items) {
    const description = htmlToText(xmlValue(item, 'description') || '');
    const coins = parseParataxisHoldings(description);
    if (!Number.isSafeInteger(coins) || coins < 1000 || coins > 10000000) continue;
    const source = xmlValue(item, 'link');
    const pubDate = xmlValue(item, 'pubDate');
    if (!source || !pubDate) continue;
    return {
      holdings: [{ asset: 'ETH', coins, asOf: rssDate(pubDate) }],
      source,
      updateMode: 'auto',
      fetchedAt: new Date().toISOString(),
    };
  }
  throw new Error('Parataxis Ethereum total ETH holdings not found in company RSS');
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function carryHistory(payload, previous) {
  for (const [ticker, fields] of Object.entries(previous?._history || {})) {
    if (!payload._history[ticker]) payload._history[ticker] = { coins: [], shares: [] };
    for (const field of ['coins', 'shares']) {
      for (const point of fields?.[field] || []) {
        if (Array.isArray(point) && /^\d{4}-\d{2}-\d{2}$/.test(point[0]) && Number.isFinite(point[1])) {
          upsertPoint(payload._history[ticker][field], point[0], point[1]);
        }
      }
    }
  }
}

function carryPrevious(payload, previous) {
  if (!previous) return;
  payload._meta.sources = clone(previous._meta?.sources || {});
  carryHistory(payload, previous);

  const previousMstrDate = latestHoldingDate(previous.MSTR);
  if (previousMstrDate && previousMstrDate >= latestHoldingDate(payload.MSTR)) {
    payload.MSTR = { ...payload.MSTR, ...previous.MSTR, capital: { ...payload.MSTR.capital, ...previous.MSTR.capital } };
  }
  const previousBmnrDate = latestHoldingDate(previous.BMNR);
  if (previousBmnrDate && previousBmnrDate >= latestHoldingDate(payload.BMNR)) {
    payload.BMNR = {
      ...payload.BMNR,
      holdings: previous.BMNR.holdings,
      ethSupply: previous.BMNR.ethSupply ?? payload.BMNR.ethSupply,
      capital: { ...payload.BMNR.capital, cash: previous.BMNR.capital?.cash ?? payload.BMNR.capital.cash, cashAsOf: previous.BMNR.capital?.cashAsOf || payload.BMNR.capital.cashAsOf },
      source: previous.BMNR.source || payload.BMNR.source,
      fetchedAt: previous.BMNR.fetchedAt,
    };
  }
  const previousSbetDate = latestHoldingDate(previous.SBET);
  if (previousSbetDate && previousSbetDate >= latestHoldingDate(payload.SBET)) {
    payload.SBET = {
      ...payload.SBET,
      holdings: previous.SBET.holdings,
      source: previous.SBET.source || payload.SBET.source,
      fetchedAt: previous.SBET.fetchedAt,
    };
  }
  const previousParataxisDate = latestHoldingDate(previous.KR?.['290560']);
  if (previousParataxisDate && previousParataxisDate >= latestHoldingDate(payload.KR['290560'])) {
    payload.KR['290560'] = { ...payload.KR['290560'], ...previous.KR['290560'] };
  }
}

function requireCurrentOrNewer(current, candidate, label) {
  const currentDate = latestHoldingDate(current);
  const candidateDate = latestHoldingDate(candidate);
  if (!candidateDate) throw new Error(`${label} candidate has no holdings date`);
  if (currentDate && candidateDate < currentDate) throw new Error(`${label} source regressed from ${currentDate} to ${candidateDate}`);
}

async function runSource(payload, key, fetcher, apply) {
  const attemptedAt = new Date().toISOString();
  const previousState = payload._meta.sources[key] || {};
  try {
    const value = await fetcher();
    apply(value);
    payload._meta.sources[key] = {
      status: 'ok',
      attemptedAt,
      lastSuccessAt: attemptedAt,
      source: value.source,
      error: null,
    };
  } catch (error) {
    const message = String(error?.message || error).replace(/[\r\n]+/g, ' ').slice(0, 300);
    payload._meta.sources[key] = {
      status: 'fallback',
      attemptedAt,
      lastSuccessAt: previousState.lastSuccessAt || null,
      source: previousState.source || null,
      error: message,
    };
    console.warn(`::warning title=Treasury source ${key}::${message}`);
  }
}

async function main() {
  let previous = null;
  try {
    previous = readPayload();
  } catch (error) {
    console.warn(`::warning title=Treasury previous payload::${String(error.message || error)}`);
  }

  const payload = clone(BASELINE);
  payload.generatedAt = new Date().toISOString();
  carryPrevious(payload, previous);

  await Promise.all([
    runSource(payload, 'strategy', fetchStrategy, data => {
      requireCurrentOrNewer(payload.MSTR, data, 'Strategy');
      payload.MSTR = { ...payload.MSTR, ...data, capital: { ...payload.MSTR.capital, ...data.capital } };
      upsertPoint(payload._history.MSTR.coins, data.holdings[0].asOf, data.holdings[0].coins);
      upsertPoint(payload._history.MSTR.shares, data.sharesAsOf, data.assumedDilutedShares);
    }),
    runSource(payload, 'bitmine', fetchBitMine, data => {
      requireCurrentOrNewer(payload.BMNR, data, 'BitMine');
      payload.BMNR = { ...payload.BMNR, ...data, capital: { ...payload.BMNR.capital, ...data.capital } };
      upsertPoint(payload._history.BMNR.coins, data.holdings[0].asOf, data.holdings[0].coins);
    }),
    runSource(payload, 'sharplink', fetchSharpLink, data => {
      requireCurrentOrNewer(payload.SBET, data, 'Sharplink');
      payload.SBET = { ...payload.SBET, ...data };
      upsertPoint(payload._history.SBET.coins, data.holdings[0].asOf, data.holdings[0].coins);
    }),
    runSource(payload, 'parataxis', fetchParataxis, data => {
      requireCurrentOrNewer(payload.KR['290560'], data, 'Parataxis Ethereum');
      payload.KR['290560'] = { ...payload.KR['290560'], ...data };
    }),
  ]);

  payload.generatedAt = new Date().toISOString();
  writePayload(payload);
  const status = Object.entries(payload._meta.sources).map(([key, value]) => `${key}=${value.status}`).join(', ');
  console.log(`treasury-latest.js written: MSTR=${payload.MSTR.holdings[0].coins} BTC; BMNR=${payload.BMNR.holdings[0].coins} ETH; SBET=${payload.SBET.holdings[0].coins} ETH; 290560=${payload.KR['290560'].holdings[0].coins} ETH`);
  console.log(`source status: ${status}`);
}

if (require.main === module) {
  main().catch(error => { console.error(error); process.exit(1); });
}

module.exports = {
  BASELINE,
  fetchBitMine,
  fetchParataxis,
  fetchSharpLink,
  fetchStrategy,
  parseKoreanCount,
  parseParataxisHoldings,
  parseSharpLinkHoldings,
  rssDate,
};
