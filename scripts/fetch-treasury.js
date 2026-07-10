// Fetch the latest official BitMine weekly release and build the browser override.
const fs = require('fs');
const path = require('path');

const LIST_URL = 'https://www.prnewswire.com/news/bitmine-immersion-technologies%2C-inc./';
const UA = 'Mozilla/5.0 (compatible; mnav-tracker/1.0; +https://github.com/NaiveInvestment/mnav-tracker)';

async function fetchText(url) {
  const res = await fetch(url, { headers: { 'User-Agent': UA, 'Accept': 'text/html' } });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.text();
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
    .replace(/\s+/g, ' ');
}

function isoDate(englishDate) {
  const d = new Date(`${englishDate} 00:00:00 UTC`);
  if (Number.isNaN(d.getTime())) throw new Error(`invalid date: ${englishDate}`);
  return d.toISOString().slice(0, 10);
}

async function main() {
  const list = await fetchText(LIST_URL);
  const link = list.match(/href="(\/news-releases\/bitmine-immersion-technologies-bmnr-announces-eth-holdings-reach-[^"]+\.html)"/i)?.[1];
  if (!link) throw new Error('latest BitMine ETH holdings release not found');

  const source = new URL(link, LIST_URL).href;
  const text = htmlToText(await fetchText(source));
  const holdings = text.match(/As of ([A-Z][a-z]+ \d{1,2}, \d{4})[^.]{0,300}?holdings are comprised of ([\d,]+)\s+ETH[^.]{0,300}?([\d,]+)\s+Bitcoin/i);
  if (!holdings) throw new Error('BitMine holdings values not found');

  const asOf = isoDate(holdings[1]);
  const eth = Number(holdings[2].replace(/,/g, ''));
  const btc = Number(holdings[3].replace(/,/g, ''));
  const supplyMillions = Number(text.match(/ETH supply\s*\(of\s*([\d.]+)\s*million ETH\s*\)/i)?.[1]);
  if (!Number.isSafeInteger(eth) || !Number.isSafeInteger(btc) || eth < 1000000) {
    throw new Error(`invalid BitMine holdings: ETH=${eth} BTC=${btc}`);
  }

  const payload = {
    BMNR: {
      holdings: [{ asset: 'ETH', coins: eth, asOf }, { asset: 'BTC', coins: btc, asOf }],
      ethSupply: Number.isFinite(supplyMillions) ? Math.round(supplyMillions * 1000000) : null,
      source,
      fetchedAt: new Date().toISOString(),
    },
  };
  const js = `(() => {\n  const latest = ${JSON.stringify(payload)};\n  globalThis.LATEST_TREASURY = latest;\n  if (typeof TREASURY !== 'undefined' && TREASURY.BMNR) {\n    const entry = [latest.BMNR.holdings[0].asOf, latest.BMNR.holdings[0].coins];\n    const history = TREASURY.BMNR.coins;\n    const existing = history.find(x => x[0] === entry[0]);\n    if (existing) existing[1] = entry[1];\n    else if (!history.length || history[history.length - 1][0] < entry[0]) history.push(entry);\n  }\n})();\n`;
  const file = path.join(__dirname, '..', 'treasury-latest.js');
  fs.writeFileSync(file, js);
  console.log(`treasury-latest.js written: BMNR=${eth} ETH, ${btc} BTC as of ${asOf}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
