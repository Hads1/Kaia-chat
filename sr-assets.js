const fs = require('node:fs');
const path = require('node:path');
function createSRRoutes({ directory, backend }) {
  const assets = path.join(__dirname, 'vendor', 'sr', 'avatar');
  const files = new Set(fs.readdirSync(assets));
  return async (req, res, file) => {
    if (file === 'api/sr-layout' && req.method === 'POST') {
      const expected = 'http://' + req.headers.host;
      if (
        req.headers.origin !== expected ||
        req.headers['x-kaia-editor'] !== '1'
      ) {
        res.writeHead(403);
        res.end();
        return;
      }
      let body = '';
      try {
        for await (const chunk of req) {
          body += chunk;
          if (Buffer.byteLength(body) > 100000)
            throw Error('Layout muito grande.');
        }
        const saved = await backend.call('layout', JSON.parse(body));
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify(saved));
      } catch {
        if (!res.headersSent) res.writeHead(400);
        res.end();
      }
      return;
    }
    if (req.method !== 'GET' || !files.has(file)) {
      res.writeHead(404);
      res.end();
      return;
    }
    const source = file.endsWith('.json')
      ? path.join(directory, 'avatar', file)
      : path.join(assets, file);
    const fallback = path.join(assets, file);
    const ext = path.extname(file);
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader(
      'Content-Type',
      {
        '.html': 'text/html',
        '.js': 'text/javascript',
        '.json': 'application/json',
      }[ext] + '; charset=utf-8',
    );
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' https: data:; connect-src 'self'; object-src 'none'",
    );
    try {
      res.end(fs.readFileSync(fs.existsSync(source) ? source : fallback));
    } catch {
      res.writeHead(404);
      res.end();
    }
  };
}
module.exports = { createSRRoutes };
