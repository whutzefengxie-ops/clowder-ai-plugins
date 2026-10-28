import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const htmlPath = path.resolve(process.argv[2], 'index.html');
const port = Number(process.argv[3]);
const server = createServer(async (request, response) => {
  const route = new URL(request.url, 'http://127.0.0.1').pathname;
  if (route !== '/') { response.writeHead(404); response.end(); return; }
  response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
  response.end(await readFile(htmlPath));
});
server.listen(port, '127.0.0.1', () => console.log(JSON.stringify({ kind: 'feedback-experience-prototype', pid: process.pid, port, dataRoot: null, remoteWrites: false })));
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close(() => process.exit(0)));
const expiry = Date.parse(process.env.CAT_CAFE_PREVIEW_EXPIRES_AT ?? '');
if (Number.isFinite(expiry)) setTimeout(() => server.close(() => process.exit(0)), Math.max(0, expiry - Date.now() - 5000));
