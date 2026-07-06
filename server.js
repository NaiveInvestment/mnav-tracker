// mNAV tracker — static file server + stock quote proxy (Node 18+, no deps)
// Crypto (Upbit/Binance) and FX (frankfurter) are fetched directly by the browser (CORS OK);
// Yahoo(US stocks) and Naver(KR stocks) block CORS, so this server proxies them.
const http = require('http');
const fs = require('fs');
const path = require('path');
const { usQuote, krQuote, fxQuote } = require('./quotes-lib');

const PORT = 8787;
const ROOT = __dirname;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const send = (status, body, type = 'application/json; charset=utf-8') => {
    res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store' });
    res.end(body);
  };
  try {
    if (url.pathname === '/api/us') {
      const symbols = (url.searchParams.get('symbols') || '').split(',').filter(Boolean);
      const results = await Promise.allSettled(symbols.map(usQuote));
      const out = {};
      results.forEach((r, i) => { out[symbols[i]] = r.status === 'fulfilled' ? r.value : { error: String(r.reason) }; });
      return send(200, JSON.stringify(out));
    }
    if (url.pathname === '/api/kr') {
      const codes = (url.searchParams.get('codes') || '').split(',').filter(Boolean);
      const results = await Promise.allSettled(codes.map(krQuote));
      const out = {};
      results.forEach((r, i) => { out[codes[i]] = r.status === 'fulfilled' ? r.value : { error: String(r.reason) }; });
      return send(200, JSON.stringify(out));
    }
    if (url.pathname === '/api/fx') {
      return send(200, JSON.stringify(await fxQuote()));
    }
    if (url.pathname === '/history.json') {
      // regenerate at most once a day
      const file = path.join(ROOT, 'history.json');
      const fresh = fs.existsSync(file) && Date.now() - fs.statSync(file).mtimeMs < 86400e3;
      if (!fresh) {
        const { buildHistory } = require('./scripts/fetch-history');
        fs.writeFileSync(file, JSON.stringify(await buildHistory()));
      }
      return send(200, fs.readFileSync(file));
    }
    // static files
    let file = url.pathname === '/' ? '/index.html' : url.pathname;
    file = path.normalize(file).replace(/^([/\\])+/, '');
    const full = path.join(ROOT, file);
    if (!full.startsWith(ROOT + path.sep) || !fs.existsSync(full) || !fs.statSync(full).isFile()) {
      return send(404, JSON.stringify({ error: 'not found' }));
    }
    return send(200, fs.readFileSync(full), MIME[path.extname(full).toLowerCase()] || 'application/octet-stream');
  } catch (e) {
    return send(500, JSON.stringify({ error: String(e) }));
  }
}).listen(PORT, '127.0.0.1', () => {
  console.log(`mNAV tracker: http://localhost:${PORT}`);
});
