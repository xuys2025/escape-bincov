// Static server for the assembled Pages tree (ES modules and WebGL textures do not load from file://).
//
//   node scripts/site/serve.mjs [--dir=pages] [--port=5180]
import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep } from 'node:path';

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.woff2': 'font/woff2', '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml',
};

/** Serves `dir` like GitHub Pages does: directory URLs load their index.html, a directory without a slash redirects. */
export function serve(dir, port = 0) {
  const base = resolve(dir);
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    let path = normalize(join(base, decodeURIComponent(url.pathname)));
    if (path !== base && !path.startsWith(base + sep)) { res.writeHead(403).end(); return; }
    try {
      if ((await stat(path)).isDirectory()) {
        if (!url.pathname.endsWith('/')) { res.writeHead(301, { location: url.pathname + '/' + url.search }).end(); return; }
        path = join(path, 'index.html');
      }
      const body = await readFile(path);
      res.writeHead(200, { 'content-type': TYPES[extname(path)] ?? 'application/octet-stream', 'cache-control': 'no-store' });
      res.end(body);
    } catch {
      res.writeHead(404, { 'content-type': 'text/plain' }).end('not found');
    }
  });
  return new Promise(done => server.listen(port, '127.0.0.1', () => done(server)));
}

if (import.meta.main ?? process.argv[1] === import.meta.filename) {
  const arg = name => process.argv.find(a => a.startsWith(`--${name}=`))?.slice(name.length + 3);
  const server = await serve(arg('dir') ?? 'pages', Number(arg('port') ?? 5180));
  console.log(`http://127.0.0.1:${server.address().port}/`);
}
