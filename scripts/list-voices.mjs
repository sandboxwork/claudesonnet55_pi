#!/usr/bin/env node
// 한국어 보이스 목록 조회 → FISH_REFERENCE_ID 로 사용할 id 고르기
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const envp = path.join(ROOT, '.env');
if (fs.existsSync(envp)) {
  for (const line of fs.readFileSync(envp, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2];
  }
}
const key = process.env.FISH_API_KEY;
if (!key) {
  console.error('FISH_API_KEY 가 필요합니다 (.env).');
  process.exit(1);
}
const lang = process.argv[2] || 'ko';
const url = `https://api.fish.audio/model?language=${lang}&sort_by=score&page_size=15&page_number=1`;
const res = await fetch(url, { headers: { Authorization: `Bearer ${key}` } });
if (!res.ok) {
  console.error(`HTTP ${res.status}`, await res.text());
  process.exit(1);
}
const data = await res.json();
for (const m of data.items || []) {
  console.log(`${m._id}\t${m.title}\t(♥ ${m.like_count ?? 0}, 사용 ${m.task_count ?? 0})`);
}
console.log('\n→ .env 의 FISH_REFERENCE_ID 에 원하는 id 를 넣으세요.');
