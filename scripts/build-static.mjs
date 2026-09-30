#!/usr/bin/env node
// 의존성 없는 빌드: index.html + src/ + public/ → dist/  (Vite 를 쓸 수 없는 환경용 대체 경로)
// 앱은 네이티브 ES 모듈이라 번들러 없이도 그대로 동작합니다. 압축/해시가 필요하면 `npm run build` (Vite).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'dist');
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
fs.copyFileSync(path.join(ROOT, 'index.html'), path.join(OUT, 'index.html'));
fs.cpSync(path.join(ROOT, 'src'), path.join(OUT, 'src'), { recursive: true });
if (fs.existsSync(path.join(ROOT, 'public'))) fs.cpSync(path.join(ROOT, 'public'), OUT, { recursive: true });
const size = (p) => fs.readdirSync(p, { withFileTypes: true }).reduce((a, d) => a + (d.isDirectory() ? size(path.join(p, d.name)) : fs.statSync(path.join(p, d.name)).size), 0);
console.log(`dist/ 생성 완료 (${(size(OUT) / 1e6).toFixed(1)}MB) → npm run serve:dist`);
