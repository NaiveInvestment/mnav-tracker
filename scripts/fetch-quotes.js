// GitHub Actions: fetch stock quotes + FX and write quotes.json for the static (GitHub Pages) build.
// Symbols/codes must match the CONFIG lists in index.html.
const fs = require('fs');
const path = require('path');
const { usQuote, krQuote, fxQuote } = require('../quotes-lib');

const US_SYMBOLS = ['MSTR', 'BMNR', 'SBET'];
const KR_CODES = ['377030', '049470', '290560', '288330', '112040', '042420'];

async function main() {
  const [usR, krR, fxR] = await Promise.all([
    Promise.allSettled(US_SYMBOLS.map(usQuote)),
    Promise.allSettled(KR_CODES.map(krQuote)),
    fxQuote(),
  ]);
  const us = {};
  usR.forEach((r, i) => { if (r.status === 'fulfilled') us[US_SYMBOLS[i]] = r.value; });
  const kr = {};
  krR.forEach((r, i) => { if (r.status === 'fulfilled') kr[KR_CODES[i]] = r.value; });

  const okUs = Object.keys(us).length, okKr = Object.keys(kr).length;
  if (okUs === 0 || okKr === 0) {
    console.error(`quote fetch failed: us=${okUs}/${US_SYMBOLS.length} kr=${okKr}/${KR_CODES.length}`);
    process.exit(1); // fail the workflow → previous deployment stays live
  }
  const out = { asOf: new Date().toISOString(), fx: fxR, us, kr };
  fs.writeFileSync(path.join(__dirname, '..', 'quotes.json'), JSON.stringify(out));
  console.log(`quotes.json written: us=${okUs} kr=${okKr} usdkrw=${fxR.usdkrw}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
