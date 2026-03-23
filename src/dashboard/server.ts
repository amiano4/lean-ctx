import { createServer } from 'node:http';
import { getStoreData, getStorePath } from '../core/store.js';
import { getDashboardHtml } from './ui.js';

const PORT = parseInt(process.env.LEAN_CTX_PORT || '3333', 10);

export function startDashboard(): void {
  const server = createServer((req, res) => {
    const url = new URL(req.url || '/', `http://localhost:${PORT}`);

    if (url.pathname === '/api/stats') {
      res.writeHead(200, {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      });
      res.end(JSON.stringify(getStoreData()));
      return;
    }

    if (url.pathname === '/' || url.pathname === '/index.html') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(getDashboardHtml());
      return;
    }

    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not Found');
  });

  server.listen(PORT, () => {
    console.log(`\n  lean-ctx dashboard → http://localhost:${PORT}\n`);
    console.log(`  Stats file: ${getStorePath()}\n`);
  });
}
