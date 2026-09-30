#!/usr/bin/env node
/**
 * Fish Audio 내레이션 생성기
 *
 *   npm run narration            # API 호출 → public/narration/{narration.wav, manifest.json}
 *   npm run narration:offline    # API 없이 추정 타이밍 manifest만 생성 (무음 모드)
 *
 * 사용 API : POST https://api.fish.audio/v1/tts/stream/with-timestamp  (SSE)
 *   - audio_base64            : 오디오 청크 (순서대로 이어 붙임)
 *   - alignment.segments      : 청크 기준 상대 시간 → chunk_audio_offset_sec 를 더해 전체 시간
 *   - 같은 chunk_seq 의 alignment 는 누적 스냅샷이므로 "교체"
 *
 * 장면마다 1회 호출 → 장면 경계 시각과 큐(⟦마커⟧) 시각을 실제 음성 길이로 확정합니다.
 * API 키는 .env / 환경변수에서만 읽고, 브라우저 번들에는 포함되지 않습니다.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import {
  SCENES,
  PRE_ROLL,
  GAP,
  POST_ROLL,
  parseScene,
  layoutScene,
  estimateSpeech,
} from './script.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = path.join(ROOT, 'public', 'narration');
const CACHE_DIR = path.join(ROOT, '.cache', 'narration');
const ENDPOINT = process.env.FISH_ENDPOINT || 'https://api.fish.audio/v1/tts/stream/with-timestamp';
const SAMPLE_RATE = 44100;

// ---------- 인자 / 환경 ----------
const args = process.argv.slice(2);
const flag = (n) => args.includes(`--${n}`);
const opt = (n) => {
  const i = args.indexOf(`--${n}`);
  return i >= 0 ? args[i + 1] : undefined;
};

function loadEnv() {
  const p = path.join(ROOT, '.env');
  if (!fs.existsSync(p)) return;
  for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
  }
}
loadEnv();

const KEY = process.env.FISH_API_KEY;
const REFERENCE_ID = opt('voice') || process.env.FISH_REFERENCE_ID || '';
const MODELS = [opt('model') || process.env.FISH_MODEL || 's2.1-pro', 's2-pro'].filter(
  (m, i, a) => a.indexOf(m) === i,
);

const log = (...a) => console.log('[narration]', ...a);

// ---------- 오프라인(추정) ----------
function writeManifest(manifest) {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(path.join(OUT_DIR, 'manifest.json'), JSON.stringify(manifest, null, 2));
}

function buildOffline() {
  let t = 0;
  const scenes = SCENES.map((s, i) => {
    const { words, duration } = estimateSpeech(s);
    const delay = i === 0 ? PRE_ROLL : 0;
    const tail = i === SCENES.length - 1 ? POST_ROLL : GAP;
    const sc = layoutScene(s, t, words, duration, delay, tail);
    t = sc.end;
    return sc;
  });
  return {
    version: 1,
    estimated: true,
    audio: null,
    voice: null,
    model: null,
    duration: +t.toFixed(3),
    scenes,
  };
}

if (flag('offline')) {
  const m = buildOffline();
  writeManifest(m);
  log(`추정 타이밍 manifest 생성 완료 (${m.duration.toFixed(1)}s). 음성 없이 무음 모드로 재생됩니다.`);
  process.exit(0);
}

if (!KEY) {
  console.error(
    '\n  FISH_API_KEY 가 없습니다.\n  1) cp .env.example .env  2) .env 에 키를 넣고  3) npm run narration\n',
  );
  process.exit(1);
}

// ---------- Fish Audio 호출 ----------
class HttpError extends Error {
  constructor(status, body) {
    super(`HTTP ${status}: ${body.slice(0, 400)}`);
    this.status = status;
  }
}

function stripWav(buf) {
  // RIFF 청크가 붙어 오는 경우 data 부분만 추출 (스트리밍 WAV는 길이 필드가 0/0xFFFFFFFF 일 수 있음)
  if (buf.length < 12 || buf.toString('ascii', 0, 4) !== 'RIFF') return buf;
  let p = 12;
  while (p + 8 <= buf.length) {
    const id = buf.toString('ascii', p, p + 4);
    const size = buf.readUInt32LE(p + 4);
    if (id === 'data') return buf.subarray(p + 8);
    p += 8 + size;
  }
  return buf;
}

async function synth(text, model, format) {
  const body = {
    text,
    format,
    sample_rate: SAMPLE_RATE,
    latency: 'normal',
    prosody: { speed: 1.0, normalize_loudness: true },
  };
  if (REFERENCE_ID) body.reference_id = REFERENCE_ID;

  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${KEY}`,
      'Content-Type': 'application/json',
      model,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new HttpError(res.status, await res.text());

  const audio = [];
  const alignments = new Map(); // chunk_seq → { offset, segments, duration }
  let buffer = '';
  const dec = new TextDecoder();

  const handle = (payload) => {
    if (!payload || payload === '[DONE]') return;
    let ev;
    try {
      ev = JSON.parse(payload);
    } catch {
      return;
    }
    if (ev.error || (ev.status && ev.status !== 'ok' && ev.message && !ev.audio_base64)) {
      throw new Error(`스트림 오류: ${ev.error || ev.message}`);
    }
    if (ev.audio_base64) {
      let b = Buffer.from(ev.audio_base64, 'base64');
      if (format === 'wav') b = stripWav(b);
      audio.push(b);
    }
    if (ev.alignment && Array.isArray(ev.alignment.segments)) {
      const seq = ev.chunk_seq ?? 0;
      alignments.set(seq, {
        offset: ev.chunk_audio_offset_sec ?? alignments.get(seq)?.offset ?? 0,
        segments: ev.alignment.segments,
        duration: ev.alignment.audio_duration,
      });
    }
  };

  const feed = (chunk) => {
    buffer += chunk;
    let idx;
    while ((idx = buffer.search(/\r?\n\r?\n/)) >= 0) {
      const block = buffer.slice(0, idx);
      buffer = buffer.slice(idx).replace(/^\r?\n\r?\n/, '');
      const data = block
        .split(/\r?\n/)
        .filter((l) => l.startsWith('data:'))
        .map((l) => l.slice(5).trimStart())
        .join('\n');
      handle(data);
    }
  };

  for await (const chunk of res.body) feed(dec.decode(chunk, { stream: true }));
  feed(dec.decode() + '\n\n');

  const pcm = Buffer.concat(audio);
  if (!pcm.length) throw new Error('오디오가 비어 있습니다.');

  const words = [];
  [...alignments.entries()]
    .sort((a, b) => a[0] - b[0])
    .forEach(([, a]) => {
      for (const s of a.segments) {
        if (!s.text || !String(s.text).trim()) continue;
        words.push({ text: String(s.text).trim(), start: a.offset + s.start, end: a.offset + s.end });
      }
    });
  words.sort((a, b) => a.start - b.start);

  const alignTotal = words.length ? words[words.length - 1].end : 0;
  return { pcm, words, alignTotal };
}

async function synthWithRetry(text) {
  let lastErr;
  for (const model of MODELS) {
    for (const format of ['pcm', 'wav']) {
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          const r = await synth(text, model, format);
          return { ...r, model, format };
        } catch (e) {
          lastErr = e;
          if (e instanceof HttpError) {
            if (e.status === 401 || e.status === 403)
              throw new Error(`인증 실패(${e.status}) — FISH_API_KEY 를 확인하세요.\n${e.message}`);
            if (e.status === 402) throw new Error(`크레딧/결제 문제(402) — Fish Audio 계정을 확인하세요.\n${e.message}`);
            if (e.status === 429 || e.status >= 500) {
              const wait = 1000 * attempt * attempt;
              log(`  ${e.status} — ${wait}ms 후 재시도 (${attempt}/3)`);
              await new Promise((r) => setTimeout(r, wait));
              continue;
            }
            log(`  ${model}/${format} 거부: ${e.message}`);
            break; // 4xx: 다음 format/model 로
          }
          log(`  네트워크/스트림 오류: ${e.message} — 재시도 (${attempt}/3)`);
          await new Promise((r) => setTimeout(r, 800 * attempt));
        }
      }
    }
  }
  throw lastErr || new Error('합성 실패');
}

function cacheKey(text) {
  return crypto
    .createHash('sha1')
    .update(JSON.stringify([text, REFERENCE_ID, MODELS[0], SAMPLE_RATE]))
    .digest('hex')
    .slice(0, 16);
}

async function getScene(scene) {
  const { plain } = parseScene(scene);
  const key = cacheKey(plain);
  const pcmPath = path.join(CACHE_DIR, `${key}.pcm`);
  const jsonPath = path.join(CACHE_DIR, `${key}.json`);
  if (!flag('force') && fs.existsSync(pcmPath) && fs.existsSync(jsonPath)) {
    log(`  캐시 사용: ${scene.id}`);
    const meta = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
    return { pcm: fs.readFileSync(pcmPath), ...meta };
  }
  const r = await synthWithRetry(plain);
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  fs.writeFileSync(pcmPath, r.pcm);
  fs.writeFileSync(jsonPath, JSON.stringify({ words: r.words, alignTotal: r.alignTotal, model: r.model }));
  return r;
}

// ---------- WAV ----------
function wavHeader(dataLen, sr) {
  const h = Buffer.alloc(44);
  h.write('RIFF', 0);
  h.writeUInt32LE(36 + dataLen, 4);
  h.write('WAVEfmt ', 8);
  h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20); // PCM
  h.writeUInt16LE(1, 22); // mono
  h.writeUInt32LE(sr, 24);
  h.writeUInt32LE(sr * 2, 28);
  h.writeUInt16LE(2, 32);
  h.writeUInt16LE(16, 34);
  h.write('data', 36);
  h.writeUInt32LE(dataLen, 40);
  return h;
}

const silence = (sec, sr) => Buffer.alloc(Math.round(sec * sr) * 2);

// ---------- main ----------
async function main() {
  log(`모델 ${MODELS.join(' → ')} / 보이스 ${REFERENCE_ID || '(기본)'} / 장면 ${SCENES.length}개`);
  const parts = [];
  const scenes = [];
  let t = 0;
  let usedModel = MODELS[0];

  for (let i = 0; i < SCENES.length; i++) {
    const s = SCENES[i];
    log(`[${i + 1}/${SCENES.length}] ${s.id} 합성 중…`);
    const r = await getScene(s);
    usedModel = r.model || usedModel;

    // 샘플레이트 검증: 정렬(audio_duration)과 PCM 바이트 길이가 크게 다르면 실제 sr 추정
    let sr = SAMPLE_RATE;
    const pcmDur = r.pcm.length / 2 / sr;
    if (r.alignTotal > 0.5 && Math.abs(pcmDur - r.alignTotal) / r.alignTotal > 0.12) {
      const inferred = r.pcm.length / 2 / r.alignTotal;
      const std = [16000, 22050, 24000, 32000, 44100, 48000].find((x) => Math.abs(x - inferred) / x < 0.06);
      if (std && std !== SAMPLE_RATE) {
        console.warn(`  경고: PCM 길이(${pcmDur.toFixed(2)}s)와 정렬(${r.alignTotal.toFixed(2)}s) 불일치 → ${std}Hz 로 추정`);
        console.warn('  (혼합 샘플레이트는 지원하지 않습니다. 모든 장면이 같은 값이어야 합니다.)');
        sr = std;
      }
    }
    if (sr !== SAMPLE_RATE) throw new Error(`예상과 다른 샘플레이트(${sr}Hz). --force 로 다시 시도하거나 이슈를 확인하세요.`);

    const speechDur = r.pcm.length / 2 / sr;
    const delay = i === 0 ? PRE_ROLL : 0;
    const tail = i === SCENES.length - 1 ? POST_ROLL : GAP;

    if (delay) parts.push(silence(delay, sr));
    parts.push(r.pcm);
    parts.push(silence(tail, sr));

    const sc = layoutScene(s, t, r.words, speechDur, delay, tail);
    scenes.push(sc);
    log(`    ${sc.start.toFixed(2)}s → ${sc.end.toFixed(2)}s  (음성 ${speechDur.toFixed(2)}s, 단어 ${r.words.length}개)`);
    t = sc.end;
  }

  const data = Buffer.concat(parts);
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const file = 'narration.wav';
  fs.writeFileSync(path.join(OUT_DIR, file), Buffer.concat([wavHeader(data.length, SAMPLE_RATE), data]));

  const duration = data.length / 2 / SAMPLE_RATE;
  const manifest = {
    version: 1,
    estimated: false,
    audio: `narration/${file}`,
    voice: REFERENCE_ID || null,
    model: usedModel,
    duration: +duration.toFixed(3),
    scenes,
  };
  // 마지막 장면 끝을 실제 오디오 길이에 맞춤
  manifest.scenes[manifest.scenes.length - 1].end = manifest.duration;
  writeManifest(manifest);
  log(`완료 → public/narration/${file} (${(data.length / 1e6).toFixed(1)}MB, ${duration.toFixed(1)}s) + manifest.json`);
}

main().catch((e) => {
  console.error('\n[narration] 실패:', e.message);
  console.error('  (추정 타이밍으로 먼저 실행하려면: npm run narration:offline)\n');
  process.exit(1);
});
