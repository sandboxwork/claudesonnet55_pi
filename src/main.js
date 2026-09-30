import { Timeline } from './timeline.js';
import { AudioClock, VirtualClock } from './clock.js';
import { createRenderer } from './renderer.js';

const $ = (id) => document.getElementById(id);
const player = $('player');
const stage = $('stage');
const overlayEl = $('overlay');
const bigBtn = $('bigBtn');
const ovTitle = $('ovTitle');
const ovSub = $('ovSub');
const ovActions = $('ovActions');
const toastEl = $('toast');
const captionsEl = $('captions');
const progress = $('progress');

const params = new URLSearchParams(location.search);
const fmt = (s) => {
  s = Math.max(0, Math.floor(s));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

let manifest;
let tl;
let renderer;
let clock;
let audio = null;
let started = false; // 사용자가 한 번이라도 재생했는지
let overlayState = 'none';
let dirty = true;
let dragging = false;
let lastMove = performance.now();
let lastShown = -1;
let ccOn = true;
let toastUntil = 0;

/* ───────────── 오버레이 / 토스트 ───────────── */
function showOverlay({ cls = '', title = '', sub = '', button = 'play', actions = [] }) {
  overlayEl.hidden = false;
  overlayEl.className = `overlay ${cls}`;
  ovTitle.textContent = title;
  ovSub.textContent = sub;
  bigBtn.hidden = button === 'none';
  bigBtn.classList.toggle('replay', button === 'replay');
  bigBtn.setAttribute('aria-label', button === 'replay' ? '다시 재생' : '재생');
  bigBtn.innerHTML =
    button === 'replay'
      ? '<svg viewBox="0 0 24 24"><path d="M12 5V2L7 6l5 4V7a6 6 0 1 1-6 6H4a8 8 0 1 0 8-8Z"/></svg>'
      : '<svg viewBox="0 0 24 24"><path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.6-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5Z"/></svg>';
  ovActions.replaceChildren(
    ...actions.map((a) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'pill' + (a.primary ? ' primary' : '');
      b.textContent = a.label;
      b.addEventListener('click', a.onClick);
      return b;
    }),
  );
  overlayState = cls.split(' ')[0] || 'ready';
}
function hideOverlay() {
  overlayEl.hidden = true;
  overlayState = 'none';
}
function toast(msg, warn = false, ms = 4500) {
  toastEl.hidden = false;
  toastEl.textContent = msg;
  toastEl.classList.toggle('warn', warn);
  toastUntil = performance.now() + ms;
}
function showError(title, sub, actions = []) {
  showOverlay({ cls: 'error', title, sub, button: 'none', actions });
}

/* ───────────── 로딩 ───────────── */
async function loadManifest() {
  let res;
  try {
    res = await fetch('./narration/manifest.json', { cache: 'no-cache' });
  } catch (e) {
    throw new Error('manifest.json 을 불러오지 못했습니다 (네트워크 오류). file:// 이 아니라 `npm run preview` 또는 웹 서버로 열어 주세요.');
  }
  if (!res.ok) throw new Error(`manifest.json 을 찾을 수 없습니다 (HTTP ${res.status}).\n먼저 \`npm run narration\` 또는 \`npm run narration:offline\` 을 실행하세요.`);
  const m = await res.json();
  if (!m || !Array.isArray(m.scenes) || !m.scenes.length || !(m.duration > 0)) throw new Error('manifest.json 형식이 올바르지 않습니다.');
  return m;
}

const mediaErr = (e) =>
  ({ 1: '재생이 중단되었습니다.', 2: '네트워크 오류로 음성을 받지 못했습니다.', 3: '음성 파일을 디코딩할 수 없습니다.', 4: '지원하지 않는 형식이거나 파일이 없습니다.' })[e?.code] || '알 수 없는 오디오 오류';

function loadAudio(url, timeoutMs = 25000) {
  return new Promise((resolve, reject) => {
    const a = new Audio();
    a.preload = 'auto';
    const to = setTimeout(() => reject(new Error('음성 로딩 시간이 초과되었습니다.')), timeoutMs);
    const ok = () => {
      clearTimeout(to);
      resolve(a);
    };
    a.addEventListener('loadedmetadata', ok, { once: true });
    a.addEventListener('canplay', ok, { once: true });
    a.addEventListener(
      'error',
      () => {
        clearTimeout(to);
        reject(new Error(mediaErr(a.error)));
      },
      { once: true },
    );
    a.src = url;
    a.load();
  });
}

function attachAudioEvents(a) {
  a.addEventListener('waiting', () => toast('음성을 버퍼링하는 중…', false, 1500));
  a.addEventListener('ended', () => {
    dirty = true;
  });
  a.addEventListener('error', () => {
    if (!started) return;
    a.pause();
    showError('음성 재생 중 오류가 발생했습니다', mediaErr(a.error), [
      { label: '다시 시도', primary: true, onClick: () => retryAudio() },
      { label: '무음 모드로 보기', onClick: () => useVirtual('음성 없이 타이머로 재생합니다.') },
    ]);
  });
}

async function setupClock() {
  const wantSilent = params.get('silent') === '1';
  if (wantSilent || !manifest.audio) {
    useVirtual(
      manifest.audio ? null : manifest.estimated ? '내레이션 음성이 없어 무음(추정 타이밍)으로 재생됩니다 — `npm run narration` 으로 음성을 생성하세요.' : null,
      false,
    );
    return true;
  }
  try {
    const a = await loadAudio(new URL(manifest.audio, document.baseURI).href);
    audio = a;
    const dur = Number.isFinite(a.duration) && a.duration > 1 ? a.duration : manifest.duration;
    if (Math.abs(dur - manifest.duration) > 0.6) toast(`음성 길이(${dur.toFixed(1)}s)가 manifest(${manifest.duration.toFixed(1)}s)와 다릅니다. narration 을 다시 생성하세요.`, true, 7000);
    clock = new AudioClock(a, dur);
    attachAudioEvents(a);
    return true;
  } catch (e) {
    showError('내레이션 음성을 불러오지 못했습니다', `${e.message}\n(public/narration/ 폴더의 음성 파일과 manifest.json 을 확인하세요.)`, [
      { label: '다시 시도', primary: true, onClick: () => retryAudio() },
      { label: '무음 모드로 보기', onClick: () => useVirtual('음성 없이 타이머로 재생합니다.') },
    ]);
    return false;
  }
}

async function retryAudio() {
  showOverlay({ cls: 'loading', title: '음성을 다시 불러오는 중…', button: 'play' });
  const t = clock ? clock.time() : 0;
  const ok = await setupClock();
  if (ok) {
    clock.seek(t);
    afterReady();
  }
}

function useVirtual(msg, show = true) {
  if (audio) audio.pause();
  const t = clock ? clock.time() : 0;
  clock = new VirtualClock(manifest.duration);
  clock.seek(t);
  audio = null;
  if (msg && show) toast(msg, true, 6000);
  else if (msg) toast(msg, true, 9000);
  if (overlayState === 'error' || overlayState === 'loading') afterReady();
  dirty = true;
}

/* ───────────── 재생 제어 ───────────── */
async function play() {
  if (!clock) return;
  try {
    await clock.play();
    started = true;
    hideOverlay();
  } catch (e) {
    if (e?.name === 'NotAllowedError') {
      toast('브라우저가 재생을 막았습니다. 화면을 한 번 클릭한 뒤 다시 재생해 주세요.', true);
      showOverlay({ cls: 'ready', title: 'π', sub: '재생 버튼을 눌러 시작하세요.' });
    } else if (e?.name !== 'AbortError') {
      showError('재생할 수 없습니다', e?.message || String(e), [
        { label: '다시 시도', primary: true, onClick: () => play() },
        { label: '무음 모드로 보기', onClick: () => useVirtual('음성 없이 타이머로 재생합니다.') },
      ]);
    }
  }
}
function pause() {
  clock?.pause();
}
function toggle() {
  if (!clock) return;
  if (clock.ended) return replay();
  clock.paused ? play() : pause();
}
function seekTo(t) {
  if (!clock) return;
  clock.seek(t);
  lastShown = -1;
  dirty = true;
  if (overlayState === 'ended' && t < clock.duration - 0.15) hideOverlay();
}
function replay() {
  seekTo(0);
  play();
}
function jumpScene(n) {
  const s = tl.scenes[n];
  if (s) seekTo(s.start + 0.01);
}

function isFs() {
  return document.fullscreenElement === player || document.webkitFullscreenElement === player;
}
function toggleFs() {
  if (isFs()) (document.exitFullscreen || document.webkitExitFullscreen).call(document);
  else {
    const fn = player.requestFullscreen || player.webkitRequestFullscreen;
    if (!fn) return toast('이 브라우저는 전체 화면을 지원하지 않습니다.', true);
    Promise.resolve(fn.call(player)).catch(() => toast('전체 화면으로 전환할 수 없습니다.', true));
  }
}
function toggleMute() {
  if (audio) audio.muted = !audio.muted;
  else toast('무음 모드에서는 소리가 없습니다.', false, 1800);
}

/* ───────────── 자막 ───────────── */
let capKey = null;
let capStarts = [];
let capSpans = [];
function updateCaptions(t) {
  const cap = ccOn ? tl.captionAt(t) : null;
  if (!cap) {
    if (capKey !== null) {
      captionsEl.replaceChildren();
      capKey = null;
    }
    return;
  }
  const key = cap.sentence.start + '|' + cap.sentence.text;
  if (key !== capKey) {
    capKey = key;
    const tokens = cap.sentence.text.split(/\s+/).filter(Boolean);
    const s = cap.sentence;
    const total = tokens.reduce((a, w) => a + w.length, 0) || 1;
    let acc = 0;
    capStarts = tokens.map((w, j) => {
      const st = cap.words.length === tokens.length ? cap.words[j].start : s.start + (acc / total) * (s.end - s.start);
      acc += w.length;
      return st;
    });
    capSpans = tokens.map((w) => {
      const sp = document.createElement('span');
      sp.className = 'w';
      sp.textContent = w;
      return sp;
    });
    const frag = document.createDocumentFragment();
    capSpans.forEach((sp, j) => {
      if (j) frag.append(' ');
      frag.append(sp);
    });
    captionsEl.replaceChildren(frag);
  }
  let cur = -1;
  for (let j = 0; j < capStarts.length; j++) if (t >= capStarts[j]) cur = j;
  capSpans.forEach((sp, j) => {
    sp.classList.toggle('on', j <= cur);
    sp.classList.toggle('now', j === cur && t - capStarts[j] < 0.45);
  });
}

/* ───────────── 프로그레스 ───────────── */
function buildTicks() {
  const ticks = $('pTicks');
  ticks.replaceChildren(
    ...tl.scenes.slice(1).map((s) => {
      const i = document.createElement('i');
      i.style.left = (s.start / tl.duration) * 100 + '%';
      return i;
    }),
  );
}
function posToTime(ev) {
  const r = progress.getBoundingClientRect();
  return clamp01((ev.clientX - r.left) / r.width) * clock.duration;
}
const clamp01 = (x) => Math.min(1, Math.max(0, x));

function setupProgress() {
  const tip = $('pTip');
  let wasPlaying = false;
  progress.addEventListener('pointerdown', (ev) => {
    if (!clock) return;
    dragging = true;
    progress.classList.add('drag');
    progress.setPointerCapture(ev.pointerId);
    wasPlaying = !clock.paused;
    clock.pause();
    seekTo(posToTime(ev));
  });
  progress.addEventListener('pointermove', (ev) => {
    if (!clock) return;
    const t = posToTime(ev);
    const sc = tl.scenes[tl.indexAt(t)];
    tip.textContent = `${sc.chapter} · ${fmt(t)}`;
    tip.style.left = (t / clock.duration) * 100 + '%';
    if (dragging) seekTo(t);
  });
  const end = (ev) => {
    if (!dragging) return;
    dragging = false;
    progress.classList.remove('drag');
    try {
      progress.releasePointerCapture(ev.pointerId);
    } catch {}
    if (wasPlaying && !(clock.ended)) play();
  };
  progress.addEventListener('pointerup', end);
  progress.addEventListener('pointercancel', end);
  progress.addEventListener('keydown', (ev) => {
    if (!clock) return;
    const step = ev.shiftKey ? 15 : 5;
    if (ev.key === 'ArrowRight') seekTo(clock.time() + step);
    else if (ev.key === 'ArrowLeft') seekTo(clock.time() - step);
    else if (ev.key === 'Home') seekTo(0);
    else if (ev.key === 'End') seekTo(clock.duration - 0.05);
    else return;
    ev.preventDefault();
    ev.stopPropagation();
  });
}

/* ───────────── 루프 ───────────── */
const el = {
  time: $('time'),
  fill: $('pFill'),
  buf: $('pBuf'),
  thumb: $('pThumb'),
};
function frame(now) {
  requestAnimationFrame(frame);
  if (!clock) return;
  const t = clock.time();
  const playing = !clock.paused && !clock.ended;

  if (playing || dirty || t !== lastShown) {
    renderer.render(t);
    updateCaptions(t);
    lastShown = t;
    dirty = false;
  }

  // UI
  const pct = (t / clock.duration) * 100;
  el.fill.style.width = pct + '%';
  el.thumb.style.left = pct + '%';
  el.time.textContent = `${fmt(t)} / ${fmt(clock.duration)}`;
  progress.setAttribute('aria-valuenow', String(Math.round(pct)));
  progress.setAttribute('aria-valuetext', `${fmt(t)} / ${fmt(clock.duration)}`);
  if (audio && audio.buffered.length) el.buf.style.width = (audio.buffered.end(audio.buffered.length - 1) / clock.duration) * 100 + '%';
  else el.buf.style.width = '100%';
  player.classList.toggle('is-playing', playing);
  player.classList.toggle('is-muted', !!audio && audio.muted);
  player.classList.toggle('is-fs', isFs());

  // 끝 → 다시보기
  if (started && clock.ended && clock.paused && overlayState === 'none' && !dragging) {
    showOverlay({ cls: 'ended', title: '끝나지 않는 숫자, π', sub: '', button: 'replay' });
  }
  // 컨트롤 자동 숨김 (재생 중 2.6초 무입력)
  player.classList.toggle('idle', playing && !dragging && now - lastMove > 2600);
  if (toastUntil && now > toastUntil) {
    toastEl.hidden = true;
    toastUntil = 0;
  }
}

function afterReady() {
  showOverlay({
    cls: 'ready',
    title: 'π — 원주율',
    sub: clock?.kind === 'virtual' ? '무음 모드 · 타이머 기준으로 재생됩니다' : '소리를 켜고 재생하세요 · 음성이 모든 장면의 마스터 타임라인입니다',
    button: 'play',
  });
  dirty = true;
}

/* ───────────── 이벤트 ───────────── */
function bind() {
  bigBtn.addEventListener('click', () => (overlayState === 'ended' ? replay() : play()));
  $('btnPlay').addEventListener('click', toggle);
  $('btnReplay').addEventListener('click', replay);
  $('btnMute').addEventListener('click', toggleMute);
  $('btnFs').addEventListener('click', toggleFs);
  $('btnCC').addEventListener('click', () => {
    ccOn = !ccOn;
    $('btnCC').setAttribute('aria-pressed', String(ccOn));
    captionsEl.classList.toggle('off', !ccOn);
    lastShown = -1;
  });
  stage.addEventListener('click', (ev) => {
    if (ev.target.closest('button') || !started || overlayState !== 'none') return;
    toggle();
  });
  stage.addEventListener('dblclick', (ev) => {
    if (ev.target.closest('button')) return;
    toggleFs();
  });
  const poke = () => (lastMove = performance.now());
  player.addEventListener('pointermove', poke);
  player.addEventListener('pointerdown', poke);
  document.addEventListener('keydown', (ev) => {
    poke();
    if (ev.metaKey || ev.ctrlKey || ev.altKey || !clock) return;
    if ((ev.key === ' ' || ev.key === 'Enter') && ev.target.closest?.('button, [role=slider]')) return;
    switch (ev.key) {
      case ' ':
      case 'k':
        toggle();
        break;
      case 'ArrowRight':
        seekTo(clock.time() + (ev.shiftKey ? 15 : 5));
        break;
      case 'ArrowLeft':
        seekTo(clock.time() - (ev.shiftKey ? 15 : 5));
        break;
      case 'r':
      case 'R':
        replay();
        break;
      case 'f':
      case 'F':
        toggleFs();
        break;
      case 'm':
      case 'M':
        toggleMute();
        break;
      case 'c':
      case 'C':
        $('btnCC').click();
        break;
      case 'Home':
        seekTo(0);
        break;
      case 'End':
        seekTo(clock.duration - 0.05);
        break;
      default:
        if (/^[1-9]$/.test(ev.key)) jumpScene(Number(ev.key) - 1);
        else return;
    }
    ev.preventDefault();
  });
  new ResizeObserver(() => {
    renderer?.resize();
    dirty = true;
  }).observe(stage);
  document.addEventListener('fullscreenchange', () => (dirty = true));
  document.addEventListener('visibilitychange', () => (dirty = true));
  setupProgress();
}

/* ───────────── 부팅 ───────────── */
async function boot() {
  bind();
  showOverlay({ cls: 'loading', title: '불러오는 중…', button: 'play' });
  try {
    manifest = await loadManifest();
  } catch (e) {
    showError('타임라인을 불러오지 못했습니다', e.message, [{ label: '새로고침', primary: true, onClick: () => location.reload() }]);
    return;
  }
  tl = new Timeline(manifest);
  renderer = createRenderer({ canvas: $('cv'), svg: $('ov'), timeline: tl });
  try {
    await document.fonts?.ready;
  } catch {}
  renderer.resize();
  renderer.prepare();
  buildTicks();

  // 첫 프레임을 위해 임시 클록
  clock = new VirtualClock(manifest.duration);
  renderer.render(0);
  requestAnimationFrame(frame);

  const ok = await setupClock();
  if (ok) afterReady();
  const t0 = parseFloat(params.get('t'));
  if (clock && Number.isFinite(t0)) seekTo(t0);

  // 디버그/검증 훅
  window.__pi = { get clock() { return clock; }, tl, seek: seekTo, play, pause, render: (t) => { renderer.render(t); updateCaptions(t); } };
}

boot();
