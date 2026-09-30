#!/usr/bin/env node
// 의존성 없는 정적 서버 (Range 요청 지원 → 오디오 seek 정상 동작)
//   node scripts/serve.mjs [dir=.] [port=5173]    예) npm run serve / npm run serve:dist
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dir = path.resolve(ROOT, process.argv[2] || '.');
const port = Number(process.argv[3] || process.env.PORT || 5173);
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon',
};

// dist 가 아니라 프로젝트 루트를 서빙할 때는 public/ 을 루트에 겹쳐서 제공 (Vite dev 와 동일한 동작)
const roots = dir === ROOT ? [dir, path.join(ROOT, 'public')] : [dir];

function resolveFile(urlPath) {
  const clean = path.normalize(decodeURIComponent(urlPath)).replace(/^([/\\])+/, '');
  for (const r of roots) {
    const f = path.join(r, clean || 'index.html');
    if (!f.startsWith(r)) continue;
    if (fs.existsSync(f) && fs.statSync(f).isFile()) return f;
    const idx = path.join(f, 'index.html');
    if (fs.existsSync(idx)) return idx;
  }
  return null;
}

http
  .createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    const file = resolveFile(url.pathname);
    if (!file || /(^|[/\\])(\.env|node_modules|\.cache)([/\\]|$)/.test(file.replace(ROOT, ''))) {
      res.writeHead(404, { 'content-type': 'text/plain' });
      return res.end('404');
    }
    const stat = fs.statSync(file);
    const type = TYPES[path.extname(file)] || 'application/octet-stream';
    const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || '');
    const base = { 'content-type': type, 'accept-ranges': 'bytes', 'cache-control': 'no-cache' };
    if (range) {
      let start = range[1] === '' ? stat.size - Number(range[2]) : Number(range[1]);
      let end = range[1] !== '' && range[2] !== '' ? Number(range[2]) : stat.size - 1;
      end = Math.min(end, stat.size - 1);
      if (!(start >= 0) || start > end) {
        res.writeHead(416, { 'content-range': `bytes */${stat.size}` });
        return res.end();
      }
      res.writeHead(206, { ...base, 'content-range': `bytes ${start}-${end}/${stat.size}`, 'content-length': end - start + 1 });
      return fs.createReadStream(file, { start, end }).pipe(res);
    }
    res.writeHead(200, { ...base, 'content-length': stat.size });
    fs.createReadStream(file).pipe(res);
  })
  .listen(port, () => console.log(`π motion → http://localhost:${port}  (${path.relative(ROOT, dir) || '.'})`));
