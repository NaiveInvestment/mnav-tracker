// Shared quote fetchers — used by server.js (local proxy) and scripts/fetch-quotes.js (GitHub Actions)
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

async function fetchJson(url) {
  const res = await fetch(url, { headers: { 'User-Agent': UA, 'Accept': 'application/json' } });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.json();
}

// US quote via Yahoo chart API → { price, prevClose, currency, time }
async function usQuote(symbol) {
  const j = await fetchJson(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1d`);
  const m = j.chart.result[0].meta;
  return {
    symbol,
    price: m.regularMarketPrice,
    prevClose: m.chartPreviousClose ?? m.previousClose,
    currency: m.currency,
    time: m.regularMarketTime,
  };
}

// "1,821조 1,158억" → KRW number
function parseKoreanWon(s) {
  if (!s) return null;
  let v = 0;
  const jo = s.match(/([\d,]+)\s*조/);
  const eok = s.match(/([\d,]+)\s*억/);
  if (jo) v += Number(jo[1].replace(/,/g, '')) * 1e12;
  if (eok) v += Number(eok[1].replace(/,/g, '')) * 1e8;
  return v || null;
}

// KR quote via Naver mobile API (basic: price/change, integration: market cap)
async function krQuote(code) {
  const base = `https://m.stock.naver.com/api/stock/${encodeURIComponent(code)}`;
  const [b, integ] = await Promise.all([fetchJson(`${base}/basic`), fetchJson(`${base}/integration`)]);
  const num = (s) => (s == null ? null : Number(String(s).replace(/,/g, '')));
  const mv = (integ.totalInfos || []).find((x) => x.code === 'marketValue');
  return {
    code,
    name: b.stockName,
    price: num(b.closePrice),
    changePct: num(b.fluctuationsRatio),
    marketCap: mv ? parseKoreanWon(mv.value) : null,
    marketState: b.marketStatus || null,
  };
}

// USD/KRW via Naver market index
async function fxQuote() {
  const j = await fetchJson('https://m.stock.naver.com/front-api/marketIndex/prices?category=exchange&reutersCode=FX_USDKRW&page=1');
  const r = j.result[0];
  let pct = Number(String(r.fluctuationsRatio).replace(/,/g, ''));
  if (r.fluctuationsType && r.fluctuationsType.name === 'FALLING' && pct > 0) pct = -pct;
  return {
    usdkrw: Number(String(r.closePrice).replace(/,/g, '')),
    changePct: pct,
    date: r.localTradedAt,
  };
}

module.exports = { usQuote, krQuote, fxQuote, parseKoreanWon };
