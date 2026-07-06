// Shared quote fetchers — used by server.js (local proxy) and scripts/fetch-quotes.js (GitHub Actions)
// Primary: Toss Invest unofficial API (실시간, 미국 주간거래 반영, 시가총액 포함)
// Fallback: Yahoo Finance (US) / Naver (KR) — 토스는 비공식이라 언제든 막힐 수 있음
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

// Toss product codes for US tickers (KR stocks are 'A' + 6-digit code)
const TOSS_US = { MSTR: 'US19980611001', BMNR: 'AMX0250605001', SBET: 'NAS0240214003' };

async function fetchJson(url) {
  const res = await fetch(url, { headers: { 'User-Agent': UA, 'Accept': 'application/json' } });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.json();
}

async function tossDetail(productCode) {
  const j = await fetchJson(`https://wts-info-api.tossinvest.com/api/v2/stock-prices/${encodeURIComponent(productCode)}`);
  if (!j.result || j.result.close == null) throw new Error('toss: empty result ' + productCode);
  return j.result;
}

// ---- US quotes ----
async function usQuoteToss(symbol) {
  const r = await tossDetail(TOSS_US[symbol]);
  return {
    symbol,
    price: r.close,
    prevClose: r.base,
    currency: r.currency,
    time: Math.floor(Date.parse(r.tradeDateTime) / 1000),
    src: 'toss',
  };
}

async function usQuoteYahoo(symbol) {
  const j = await fetchJson(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1d`);
  const m = j.chart.result[0].meta;
  return {
    symbol,
    price: m.regularMarketPrice,
    prevClose: m.chartPreviousClose ?? m.previousClose,
    currency: m.currency,
    time: m.regularMarketTime,
    src: 'yahoo',
  };
}

async function usQuote(symbol) {
  if (TOSS_US[symbol]) {
    try { return await usQuoteToss(symbol); } catch (e) { /* fall through */ }
  }
  return usQuoteYahoo(symbol);
}

// ---- KR quotes ----
async function krQuoteToss(code) {
  const r = await tossDetail('A' + code);
  return {
    code,
    price: r.close,
    changePct: r.base ? Math.round((r.close / r.base - 1) * 10000) / 100 : null,
    marketCap: r.marketCap ?? null,
    marketState: r.tradingSuspended ? 'SUSPENDED' : 'OPEN',
    src: 'toss',
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

async function krQuoteNaver(code) {
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
    src: 'naver',
  };
}

async function krQuote(code) {
  try { return await krQuoteToss(code); } catch (e) { /* fall through */ }
  return krQuoteNaver(code);
}

// ---- USD/KRW via Naver market index ----
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
