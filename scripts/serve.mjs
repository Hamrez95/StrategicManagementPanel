import { createServer, request as proxyRequest } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';

const [portArg, rootArg, apiPortArg] = process.argv.slice(2);
const port = Number(portArg);
const root = path.resolve(rootArg ?? 'dist');
const apiPort = apiPortArg === undefined ? null : Number(apiPortArg);
if (apiPort !== null && (!Number.isInteger(apiPort) || apiPort < 1 || apiPort > 65535)) throw new Error('Invalid local API port');
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('Usage: node scripts/serve.mjs <port> <dist-directory>');
}

const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};

const server = createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    if (pathname.startsWith('/api/')) {
      if (apiPort === null) { response.writeHead(404, { 'Cache-Control': 'no-store' }).end('API unavailable'); return; }
      const upstream = proxyRequest({ hostname: '127.0.0.1', port: apiPort, path: request.url, method: request.method, headers: request.headers }, (reply) => {
        response.writeHead(reply.statusCode, { ...reply.headers, 'Cache-Control': 'no-store, private' });
        reply.pipe(response);
      });
      upstream.setTimeout(10000, () => upstream.destroy());
      upstream.on('error', () => { if (!response.headersSent) response.writeHead(502, { 'Cache-Control': 'no-store' }).end('Local API unavailable'); else response.destroy(); });
      request.on('aborted', () => upstream.destroy());
      request.pipe(upstream);
      return;
    }
    const requestedPath = path.resolve(root, `.${pathname}`);
    if (requestedPath !== root && !requestedPath.startsWith(`${root}${path.sep}`)) {
      response.writeHead(403).end('Forbidden');
      return;
    }

    let filePath = requestedPath;
    try {
      if ((await stat(filePath)).isDirectory()) filePath = path.join(filePath, 'index.html');
    } catch {
      if (!path.extname(pathname) && !pathname.startsWith('/api/')) filePath = path.join(root, 'index.html');
      else { response.writeHead(404).end('Not found'); return; }
    }

    const body = await readFile(filePath);
    response.writeHead(200, {
      'Content-Type': mimeTypes[path.extname(filePath).toLowerCase()] ?? 'application/octet-stream',
      'Cache-Control': path.basename(filePath) === 'sw.js' ? 'no-cache' : 'no-store',
      'X-Content-Type-Options': 'nosniff',
    });
    response.end(body);
  } catch {
    response.writeHead(400).end('Bad request');
  }
});

server.listen(port, '127.0.0.1', () => {
  console.log(`Serving ${root} at http://localhost:${port}`);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
