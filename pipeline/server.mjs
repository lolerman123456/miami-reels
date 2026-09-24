// Tiny local server: serves the renderer page and receives rendered frames.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './util.mjs';

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css' };

export function startCaptureServer({ job, framesDir, port = 8080 }) {
  let resolveDone, rejectDone;
  const done = new Promise((res, rej) => { resolveDone = res; rejectDone = rej; });

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://x');
    try {
      if (url.pathname === '/api/job') return send(res, 200, JSON.stringify(job), 'application/json');
      if (req.method === 'POST' && url.pathname === '/api/frame') {
        const shot = url.searchParams.get('shot'), frame = +url.searchParams.get('frame');
        const dir = path.join(framesDir, String(shot));
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(path.join(dir, String(frame).padStart(5, '0') + '.jpg'), await body(req));
        if (frame % 60 === 0) console.log(`  shot ${shot} frame ${frame} (${new Date().toISOString().slice(11, 19)})`);
        return send(res, 200, 'ok');
      }
      if (req.method === 'POST' && url.pathname === '/api/log') { console.log('  [renderer]', (await body(req)).toString()); return send(res, 200, 'ok'); }
      if (req.method === 'POST' && url.pathname === '/api/done') { send(res, 200, 'ok'); return resolveDone(); }
      if (req.method === 'POST' && url.pathname === '/api/error') { const msg = (await body(req)).toString(); send(res, 200, 'ok'); return rejectDone(new Error('Renderer: ' + msg)); }

      // static files from capture/
      const file = path.join(ROOT, 'capture', url.pathname === '/' ? 'render.html' : path.normalize(url.pathname));
      if (!file.startsWith(path.join(ROOT, 'capture')) || !fs.existsSync(file)) return send(res, 404, 'not found');
      send(res, 200, fs.readFileSync(file), TYPES[path.extname(file)] || 'application/octet-stream');
    } catch (e) {
      send(res, 500, String(e));
    }
  });

  return new Promise(resolve => server.listen(port, () => resolve({
    url: `http://localhost:${port}/render.html`,
    done,
    close: () => new Promise(r => server.close(r)),
  })));
}

function send(res, code, data, type = 'text/plain') {
  res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(data);
}
function body(req) {
  return new Promise((res, rej) => { const c = []; req.on('data', d => c.push(d)); req.on('end', () => res(Buffer.concat(c))); req.on('error', rej); });
}
