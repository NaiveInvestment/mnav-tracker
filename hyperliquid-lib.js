// HYPE spot quotes from Hyperliquid, shared by the browser and quote collector.
(() => {
  const INFO_URL = 'https://api.hyperliquid.xyz/info';
  function parseSpotQuote(data) {
    const [meta, contexts] = data;
    const hype = meta.tokens.find(token => token.name === 'HYPE');
    const usdc = meta.tokens.find(token => token.name === 'USDC');
    const pair = meta.universe.find(market => market.tokens[0] === hype?.index && market.tokens[1] === usdc?.index);
    const ctx = pair && contexts[pair.index];
    const price = Number(ctx?.midPx || ctx?.markPx), prev = Number(ctx?.prevDayPx);
    const supply = Number(ctx?.circulatingSupply);
    if (!(price > 0) || !Number.isFinite(price) || !(prev > 0) || !(supply > 0)) throw new Error('HYPE/USDC spot quote missing');
    return { price, changePct: (price / prev - 1) * 100, supply, src: 'Hyperliquid spot (USDC)', asOf: new Date().toISOString() };
  }
  async function hypeQuote() {
    const res = await fetch(INFO_URL, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'spotMetaAndAssetCtxs' }), signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) throw new Error(`Hyperliquid spot HTTP ${res.status}`);
    return parseSpotQuote(await res.json());
  }
  const api = { hypeQuote, parseSpotQuote };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else globalThis.HYPERLIQUID = api;
})();
