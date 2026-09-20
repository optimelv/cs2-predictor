import { createServer } from 'node:http';
import { readFile, realpath, stat } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import catalog from '../api/catalog.js';

// Local preview only: no collectors, credentials, or cloud writes.
const root = await realpath(resolve('docs'));
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2' };
const server = createServer(async (req, res) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', 'no-store');
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (value) => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(value)); };
  try {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname === '/api/catalog') {
      req.query = Object.fromEntries(url.searchParams);
      return await catalog(req, res);
    }
    if (!['GET', 'HEAD'].includes(req.method)) return res.status(405).end();
    const aliases = { '/api/predictions': '/data/predictions.json', '/api/live-snapshot': '/data/live-snapshot.json' };
    let file = resolve(root, `.${aliases[url.pathname] || decodeURIComponent(url.pathname)}`);
    if (!file.startsWith(root + sep) && file !== root) return res.status(403).end();
    if ((await stat(file)).isDirectory()) file = resolve(file, 'index.html');
    file = await realpath(file);
    if (!file.startsWith(root + sep)) return res.status(403).end();
    const body = await readFile(file);
    res.setHeader('Content-Type', types[extname(file)] || 'application/octet-stream');
    res.end(req.method === 'HEAD' ? undefined : body);
  } catch {
    res.status(404).end('Not found');
  }
});
server.listen(Number(process.env.PORT || 4173), '127.0.0.1', () => {
  console.log(`StrikeSignal preview: http://127.0.0.1:${server.address().port} (bundled snapshots; no live collection)`);
});
