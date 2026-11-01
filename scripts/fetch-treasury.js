// Build the browser treasury override from official company and SEC sources.
// A transient source failure keeps the last deployed value, while the validator
// enforces freshness so a broken updater cannot remain invisible indefinitely.
const { latestHoldingDate, readPayload, upsertPoint, writePayload } = require('./treasury-utils');
const { fetchHyperliquid } = require('./fetch-hyperliquid');

const STRATEGY_ASSETS_URL = 'https://www.strategy.com/assets';
const STRATEGY_SHARES_URL = 'https://www.strategy.com/shares';
const BITMINE_LIST_URL = 'https://www.prnewswire.com/news/bitmine-immersion-technologies%2C-inc./';
const BITMINE_SUBMISSIONS_URL = 'https://data.sec.gov/submissions/CIK0001829311.json';
const SHARPLINK_SUBMISSIONS_URL = 'https://data.sec.gov/submissions/CIK0001981535.json';
const PARATAXIS_RSS_URL = 'https://www.newswire.co.kr/companyNews?content=rss&no=50194';
const DART_BASE_URL = 'https://dart.fss.or.kr';
const KR_DART_COMPANIES = {
  '377030': { corpCode: '01409095', asset: 'BTC', name: 'Bitmax' },
  '049470': { corpCode: '00351579', asset: 'BTC', name: 'BitPlanet' },
  '288330': { corpCode: '01227039', asset: 'BTC', name: 'Parataxis Korea' },
};
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
    shares: 603226394,
    sharesAsOf: '2026-07-09',
    assumedDilutedShares: 622491223,
    dilutedAsOf: '잠재증권 2026-05-31 · 기본주식 2026-07-09',
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
    sharesSource: 'https://www.sec.gov/Archives/edgar/data/1829311/000162828026048157/bmnr-20260531.htm',
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
  PURR: {
    shares: 300770000, commonShares: 274182353, preferredConversion: 26587647,
    sharesAsOf: '2026-10-22', sharesLabel: '보통주+전환우선주',
    holdings: [{ asset: 'HYPE', coins: 38850000, asOf: '2026-10-22' }],
    capital: { debt: 0, preferred: 0, cash: 245350000, cashAsOf: '2026-10-22', debtAsOf: '2026-06-30' },
    warrants: [{ shares: 640000, strike: 6.25 }, { shares: 600000, strike: 6.25 }, { shares: 9130000, strike: 9.38 }, { shares: 9130000, strike: 12.5 }, { shares: 9130000, strike: 18.75 }],
    source: 'https://hypestrat.xyz/dashboard', sharesSource: 'https://hypestrat.xyz/dashboard',
    updateMode: 'auto', verifiedAt: '2026-11-01',
  },
  KR: {
    '377030': {
      holdings: [{ asset: 'BTC', coins: 551.504, asOf: '2026-06-30' }],
      capital: { debt: 75750000000, preferred: 0, cash: 8512686084, asOf: '2026-06-30' },
      dilution: { cbShares: 25043129, optionShares: 0, asOf: '2026-06-30' },
      source: 'https://dart.fss.or.kr/dsaf001/main.do?rcpNo=20260814003195',
      updateMode: 'auto-quarterly',
      verifiedAt: '2026-08-24',
    },
    '049470': {
      holdings: [{ asset: 'BTC', coins: 300, asOf: '2026-06-30' }],
      capital: { debt: 7000000000, preferred: 0, cash: 13290550919, asOf: '2026-06-30' },
      dilution: { cbShares: 1841315, optionShares: 353173, asOf: '2026-06-30' },
      source: 'https://dart.fss.or.kr/dsaf001/main.do?rcpNo=20260814003703',
      updateMode: 'auto-quarterly',
      verifiedAt: '2026-08-24',
    },
    '290560': {
      holdings: [{ asset: 'ETH', coins: 10449, asOf: '2026-07-08' }],
      capital: { debt: 6000000000, preferred: 0, cash: 2253892824, asOf: '2026-06-30' },
      dilution: { cbShares: 3896100, optionShares: 346850, asOf: '2026-06-30' },
      source: 'https://www.newswire.co.kr/newsRead.php?no=1038133',
      updateMode: 'auto',
      verifiedAt: '2026-07-15',
    },
    '288330': {
      holdings: [{ asset: 'BTC', coins: 224.7149, asOf: '2026-06-30' }],
      source: 'https://dart.fss.or.kr/dsaf001/main.do?rcpNo=20260814004297',
      updateMode: 'auto-quarterly',
      verifiedAt: '2026-08-24',
    },
  },
  _history: {
    MSTR: { coins: [['2026-07-13', 843775]], shares: [['2026-07-12', 406099000]] },
    BMNR: { coins: [['2026-07-12', 5770038]], shares: [['2026-07-09', 603226394]] },
    SBET: { coins: [['2026-06-28', 886725]], shares: [['2026-06-26', 205091990]] },
    PURR: { coins: [['2026-10-22', 38850000]], shares: [['2026-10-22', 300770000]] },
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

function parseSecOutstandingShares(text) {
  const normalized = htmlToText(text);
  const match = normalized.match(/number of shares outstanding[^.]{0,180}?as of ([A-Z][a-z]+\s+\d{1,2},\s+\d{4}) was ([\d,]+) shares/i);
  if (!match) return null;
  return { sharesAsOf: isoDate(match[1]), shares: numberValue(match[2], 'SEC basic shares') };
}

async function fetchBitMineShares() {
  const submissions = await fetchJson(BITMINE_SUBMISSIONS_URL, SEC_HEADERS);
  const recent = submissions.filings?.recent;
  if (!recent) throw new Error('BitMine SEC recent filings missing');
  for (let i = 0; i < recent.form.length; i += 1) {
    if (!['10-Q', '10-K'].includes(recent.form[i]) || !recent.primaryDocument[i]) continue;
    const accession = recent.accessionNumber[i].replace(/-/g, '');
    const source = `https://www.sec.gov/Archives/edgar/data/1829311/${accession}/${recent.primaryDocument[i]}`;
    const html = await fetchText(source, SEC_HEADERS);
    const parsed = parseSecOutstandingShares(html);
    if (parsed && Number.isSafeInteger(parsed.shares) && parsed.shares >= 100000000) {
      return { ...parsed, sharesSource: source, source, fetchedAt: new Date().toISOString() };
    }
  }
  throw new Error('BitMine basic shares not found in latest SEC periodic filings');
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
  // The issuer now updates its dashboard weekly instead of issuing weekly 8-Ks.
  try {
    const data = await fetchJson('https://www.sharplink.com/api/dashboard/impact3-data', BROWSER_HEADERS);
    return { holdings: [parseSharpLinkDashboard(data)], source: 'https://www.sharplink.com/dashboard', updateMode: 'auto-holdings', fetchedAt: new Date().toISOString() };
  } catch (error) { console.warn(`Sharplink dashboard: ${error.message}; trying SEC`); }
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

function parseSharpLinkDashboard(data) {
  const rows = (data.total_eth_holdings || []).map(row => ({ asset: 'ETH', coins: Number(row['Total ETH Holdings']), asOf: isoDate(row.Date) }))
    .filter(row => row.coins >= 100000 && row.coins <= 10000000).sort((a, b) => b.asOf.localeCompare(a.asOf));
  if (!rows.length) throw new Error('Sharplink dashboard holdings missing');
  return rows[0];
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
  const exact = text.match(/총\s*보유량(?:은|이|는|가|:)?\s*([\d,]+(?:\.\d+)?)\s*개/i);
  if (exact) return numberValue(exact[1], 'Parataxis ETH');
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
  try {
    const rows = await fetchJson('https://parataxis-eth-85b85.ondigitalocean.app/api/v2/ParataxisPressv2/GetAll?', BROWSER_HEADERS);
    const reports = rows.filter(row => row.isActive).sort((a, b) => b.publishDate.localeCompare(a.publishDate));
    for (const row of reports) {
      const data = JSON.parse(row.data);
      const text = htmlToText(data.koreanDescription || data.fullDescription || '');
      const coins = parseParataxisHoldings(text);
      if (coins == null) continue;
      return { holdings: [{ asset: 'ETH', coins, asOf: row.publishDate.slice(0, 10) }], source: `https://parataxiseth.co.kr/press-details?id=${row.id}`, updateMode: 'auto', fetchedAt: new Date().toISOString() };
    }
    throw new Error('Parataxis official press holdings missing');
  } catch (error) { console.warn(`Parataxis official press: ${error.message}; trying Newswire`); }
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

function parseDartRss(xml) {
  return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/gi)]
    .map(match => match[1])
    .map(item => {
      const title = htmlToText(xmlValue(item, 'title') || '');
      const source = xmlValue(item, 'link');
      const pubDate = xmlValue(item, 'pubDate');
      const rcpNo = source?.match(/[?&]rcpNo=(\d{14})/)?.[1] || null;
      return { title, source, pubDate, rcpNo };
    })
    .filter(item => item.source && item.rcpNo && /(사업보고서|반기보고서|분기보고서)/.test(item.title))
    .sort((a, b) => (Date.parse(b.pubDate) || 0) - (Date.parse(a.pubDate) || 0));
}

function dartNode(mainHtml, textPattern) {
  const blocks = [...mainHtml.matchAll(/var node1 = \{\};([\s\S]*?)treeData\.push\(node1\);/g)];
  for (const match of blocks) {
    const block = match[1];
    const text = block.match(/node1\['text'\] = "([^"]+)"/)?.[1] || '';
    if (!textPattern.test(text)) continue;
    const field = name => block.match(new RegExp(`node1\\['${name}'\\] = "([^"]+)"`))?.[1];
    const node = {
      text,
      dcmNo: field('dcmNo'),
      eleId: field('eleId'),
      offset: field('offset'),
      length: field('length'),
      dtd: field('dtd') || 'dart4.xsd',
    };
    if (Object.values(node).some(value => !value)) throw new Error(`incomplete DART node: ${text}`);
    return node;
  }
  throw new Error(`DART node not found: ${textPattern}`);
}

function dartViewerUrl(rcpNo, node) {
  const params = new URLSearchParams({
    rcpNo,
    dcmNo: node.dcmNo,
    eleId: node.eleId,
    offset: node.offset,
    length: node.length,
    dtd: node.dtd,
  });
  return `${DART_BASE_URL}/report/viewer.do?${params}`;
}

function dartTableRows(html) {
  return [...html.matchAll(/<table\b[^>]*>([\s\S]*?)<\/table>/gi)]
    .map(table => [...table[1].matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)]
      .map(row => [...row[1].matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)]
        .map(cell => htmlToText(cell[1]))
        .filter(Boolean))
      .filter(row => row.length));
}

function dartNumber(value) {
  const compact = String(value || '').replace(/[\s,]/g, '');
  if (!compact || compact === '-' || compact === '–') return null;
  const signed = /^\((.+)\)$/.test(compact) ? `-${compact.slice(1, -1)}` : compact;
  const number = Number(signed);
  return Number.isFinite(number) ? number : null;
}

function parseDartHolding(code, financialHtml) {
  const tables = dartTableRows(financialHtml);
  const tableText = rows => rows.flat().join(' ');
  let coins = null;

  if (code === '377030') {
    for (const rows of tables) {
      const text = tableText(rows);
      if (!/당반기말/.test(text) || !/공정가치/.test(text)) continue;
      const row = rows.find(cells => /^Bitcoin$/i.test(cells[0] || ''));
      if (row) coins = dartNumber(row.at(-2));
      if (coins != null) break;
    }
  } else if (code === '049470') {
    for (const rows of tables) {
      if (!/기초/.test(tableText(rows)) || !/기말/.test(tableText(rows))) continue;
      const row = rows.find(cells => /비트코인\s*\(BTC\)/i.test(cells[0] || ''));
      if (row) coins = dartNumber(row.at(-2));
      if (coins != null) break;
    }
  } else if (code === '288330') {
    for (const rows of tables) {
      if (!/가상자산명칭/.test(tableText(rows)) || !/당반기말/.test(tableText(rows))) continue;
      const row = rows.find(cells => /^BTC(?:\W|$)/i.test(cells[0] || ''));
      const numbers = row?.slice(1).map(dartNumber).filter(value => value != null) || [];
      if (numbers.length >= 4) coins = numbers[3];
      if (coins != null) break;
    }
  }

  if (!Number.isFinite(coins) || coins <= 0 || coins > 100000) {
    throw new Error(`${code}: DART BTC holding not found or outside bounds (${coins})`);
  }
  return coins;
}

function parseDartCapital(code, financialHtml) {
  if (!['377030', '049470', '290560'].includes(code)) return null;
  const tables = dartTableRows(financialHtml);
  const summary = tables.find(rows => rows.some(cells => /^자산총계/.test(cells[0] || ''))
    && rows.some(cells => /^현금및현금성자산/.test(cells[0] || '')));
  const cashRow = summary?.find(cells => /^현금및현금성자산/.test(cells[0] || ''));
  const cash = dartNumber(cashRow?.[1]);

  const cbTable = tables.find(rows => rows[0]?.some(cell => /권면\(전자등록\)총액/.test(cell))
    && rows[1]?.some(cell => /전환가능주식수/.test(cell)));
  const cbTotal = cbTable?.find(cells => /^합\s*계$/.test(cells[0] || ''));
  let debt = dartNumber(cbTotal?.at(-3));
  const cbShares = dartNumber(cbTotal?.at(-2));
  if (debt != null && debt < 100000000) debt *= 1000000; // DART tables disclosed in KRW million

  let optionShares = 0;
  if (code === '377030') {
    const debtTable = tables.find(rows => rows.some(cells => /^전환사채$/.test(cells[0] || ''))
      && rows.some(cells => /^사채$/.test(cells[0] || ''))
      && rows.some(cells => cells.some(cell => /^구분$/.test(cell))));
    const bondRow = debtTable?.find(cells => /^사채$/.test(cells[0] || ''));
    const otherDebt = dartNumber(bondRow?.[3]);
    if (otherDebt != null) debt += otherDebt;
  } else if (code === '049470') {
    const optionTable = tables.find(rows => rows.some(cells => /^당반기말 잔여주$/.test(cells[0] || '')));
    optionShares = dartNumber(optionTable?.find(cells => /^당반기말 잔여주$/.test(cells[0] || ''))?.[1]) || 0;
  } else if (code === '290560') {
    const optionTable = tables.find(rows => rows[0]?.some(cell => /잔여부여수량/.test(cell)));
    optionShares = (optionTable || []).slice(1)
      .filter(cells => /주식매수선택권/.test(cells[0] || ''))
      .reduce((sum, cells) => sum + (dartNumber(cells.at(-1)) || 0), 0);
  }

  if (![cash, debt, cbShares, optionShares].every(Number.isFinite) || cash < 0 || debt < 0 || cbShares < 0 || optionShares < 0) {
    throw new Error(`${code}: DART capital or dilution data missing`);
  }
  return {
    capital: { debt, preferred: 0, cash },
    dilution: { cbShares, optionShares },
  };
}

function dartReportAsOf(title, financialHtml) {
  const period = title.match(/\((\d{4})\.(\d{1,2})\)/);
  if (period) {
    const year = Number(period[1]);
    const month = Number(period[2]);
    return new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
  }
  const text = htmlToText(financialHtml);
  const date = text.match(/(20\d{2})년\s*(\d{1,2})월\s*(\d{1,2})일\s*현재/);
  if (!date) throw new Error(`DART report period not found: ${title}`);
  return `${date[1]}-${date[2].padStart(2, '0')}-${date[3].padStart(2, '0')}`;
}

async function fetchDartReport(code, report) {
  const mainUrl = `${DART_BASE_URL}/dsaf001/main.do?rcpNo=${report.rcpNo}`;
  const mainHtml = await fetchText(mainUrl, BROWSER_HEADERS);
  const financialNode = dartNode(mainHtml, /^III\. 재무에 관한 사항$/);
  const financialHtml = await fetchText(dartViewerUrl(report.rcpNo, financialNode), BROWSER_HEADERS, 30000);
  const config = KR_DART_COMPANIES[code];
  const asOf = dartReportAsOf(report.title, financialHtml);
  const structure = parseDartCapital(code, financialHtml);
  return {
    holdings: [{ asset: config.asset, coins: parseDartHolding(code, financialHtml), asOf }],
    ...(structure ? {
      capital: { ...structure.capital, asOf },
      dilution: { ...structure.dilution, asOf },
    } : {}),
    source: mainUrl,
    updateMode: 'auto-quarterly',
    scope: config.scope,
    verifiedAt: new Date().toISOString().slice(0, 10),
    fetchedAt: new Date().toISOString(),
  };
}

async function fetchDartHolding(code, current) {
  const config = KR_DART_COMPANIES[code];
  if (!config) throw new Error(`unsupported DART company: ${code}`);
  const rssUrl = `${DART_BASE_URL}/api/companyRSS.xml?crpCd=${config.corpCode}`;
  const xml = await fetchText(rssUrl, { ...DEFAULT_HEADERS, Accept: 'application/xml,text/xml' });
  const currentDate = latestHoldingDate(current);
  for (const report of parseDartRss(xml)) {
    const candidate = await fetchDartReport(code, report);
    if (!currentDate || latestHoldingDate(candidate) >= currentDate) return candidate;
  }
  return {
    ...clone(current),
    updateMode: 'auto-quarterly',
    fetchedAt: new Date().toISOString(),
    checkedRss: rssUrl,
  };
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
  payload._meta.sources = Object.fromEntries(Object.entries(clone(previous._meta?.sources || {}))
    .filter(([key]) => !key.startsWith('dart-') || Object.hasOwn(KR_DART_COMPANIES, key.slice(5))));
  carryHistory(payload, previous);
  if (latestHoldingDate(previous.PURR) >= latestHoldingDate(payload.PURR)) {
    payload.PURR = { ...payload.PURR, ...previous.PURR };
  }

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
  for (const code of Object.keys(KR_DART_COMPANIES)) {
    const previousDate = latestHoldingDate(previous.KR?.[code]);
    if (previousDate && previousDate >= latestHoldingDate(payload.KR[code])) {
      payload.KR[code] = { ...payload.KR[code], ...previous.KR[code] };
    }
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
    runSource(payload, 'hyperliquid', fetchHyperliquid, data => {
      requireCurrentOrNewer(payload.PURR, data, 'Hyperliquid Strategies');
      const { history, ...record } = data;
      payload.PURR = record;
      for (const field of ['coins', 'shares']) {
        for (const [date, value] of history[field]) upsertPoint(payload._history.PURR[field], date, value);
      }
    }),
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
    runSource(payload, 'bitmine-shares', fetchBitMineShares, data => {
      if (data.sharesAsOf < payload.BMNR.sharesAsOf) throw new Error(`BitMine shares regressed to ${data.sharesAsOf}`);
      payload.BMNR = { ...payload.BMNR, ...data };
      upsertPoint(payload._history.BMNR.shares, data.sharesAsOf, data.shares);
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
    ...Object.keys(KR_DART_COMPANIES).map(code => runSource(payload, `dart-${code}`, () => fetchDartHolding(code, payload.KR[code]), data => {
      requireCurrentOrNewer(payload.KR[code], data, KR_DART_COMPANIES[code].name);
      payload.KR[code] = { ...payload.KR[code], ...data };
    })),
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
  fetchBitMineShares,
  fetchParataxis,
  fetchSharpLink,
  fetchStrategy,
  fetchDartReport,
  parseDartHolding,
  parseDartCapital,
  parseDartRss,
  dartReportAsOf,
  dartNode,
  dartTableRows,
  dartViewerUrl,
  parseKoreanCount,
  parseParataxisHoldings,
  parseSecOutstandingShares,
  parseSharpLinkHoldings,
  parseSharpLinkDashboard,
  rssDate,
};
