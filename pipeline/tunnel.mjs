// Temporarily expose one local file at a public HTTPS URL (Cloudflare quick tunnel, no account).
// Used because Instagram-Login tokens can only publish videos from a public video_url.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { ROOT } from './util.mjs';

export async function serveFilePublicly(file) {
  const secret = crypto.randomBytes(16).toString('hex');
  const name = `/${secret}/${path.basename(file)}`;
  const size = fs.statSync(file).size;

  const server = http.createServer((req, res) => {
    if (req.url !== name) { res.writeHead(404); return res.end(); }
    const range = /bytes=(\d*)-(\d*)/.exec(req.headers.range || '');
    let start = 0, end = size - 1, code = 200;
    if (range) { start = range[1] ? +range[1] : 0; end = range[2] ? +range[2] : size - 1; code = 206; }
    res.writeHead(code, {
      'Content-Type': 'video/mp4', 'Content-Length': end - start + 1, 'Accept-Ranges': 'bytes',
      ...(code === 206 ? { 'Content-Range': `bytes ${start}-${end}/${size}` } : {}),
    });
    if (req.method === 'HEAD') return res.end();
    fs.createReadStream(file, { start, end }).pipe(res);
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;

  const bin = process.env.CLOUDFLARED_BIN || path.join(ROOT, 'tools', 'cloudflared');
  const cf = spawn(bin,
    ['tunnel', '--no-autoupdate', '--url', `http://127.0.0.1:${port}`], { stdio: ['ignore', 'pipe', 'pipe'] });
  const base = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Tunnel did not start')), 60000);
    const onData = d => {
      const m = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/.exec(String(d));
      if (m) { clearTimeout(timer); resolve(m[0]); }
    };
    cf.stdout.on('data', onData); cf.stderr.on('data', onData);
    cf.on('exit', c => reject(new Error('cloudflared exited ' + c)));
  });

  const url = base + name;
  // wait until the tunnel actually serves the file (DNS for new tunnels can take a few seconds)
  for (let i = 0; i < 30; i++) {
    try { if ((await fetch(url, { method: 'HEAD' })).ok) break; } catch {}
    await new Promise(r => setTimeout(r, 2000));
  }
  return { url, close: () => { cf.kill(); server.close(); } };
}
