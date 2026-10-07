import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const types = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.svg': 'image/svg+xml' };
const port = Number(process.env.PORT) || 4173;

createServer(async (request, response) => {
  let filename;
  try {
    const address = new URL(request.url, 'http://localhost');
    filename = path.resolve(root, `.${decodeURIComponent(address.pathname === '/' ? '/index.html' : address.pathname)}`);
  } catch {
    response.writeHead(400); response.end('Bad request'); return;
  }
  const relative = path.relative(root, filename).replaceAll('\\', '/');
  if (!(relative === 'index.html' || /^(src|data)\/[^/]+\.(js|css|json)$/.test(relative))) {
    response.writeHead(403); response.end('Forbidden'); return;
  }
  try {
    const body = await readFile(filename);
    response.writeHead(200, { 'Content-Type': `${types[path.extname(filename)] || 'application/octet-stream'}; charset=utf-8`, 'X-Content-Type-Options': 'nosniff' });
    response.end(request.method === 'HEAD' ? undefined : body);
  } catch {
    response.writeHead(404); response.end('Not found');
  }
}).listen(port, '127.0.0.1', () => console.log(`Physics Map: http://localhost:${port}`));
