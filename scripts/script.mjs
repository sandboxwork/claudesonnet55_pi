// 내레이션 대본 + 타임라인 레이아웃 (생성 스크립트와 오프라인 추정이 공유)
//
// ⟦이름⟧ 마커는 "그 마커 뒤 첫 글자가 발화되는 시각"을 큐(cue)로 기록합니다.
// TTS에는 마커가 제거된 텍스트만 전송합니다. 애니메이션은 이 큐 시각에 맞춰 시작됩니다.

export const PRE_ROLL = 0.8; // 첫 음성 전 무음(초)
export const GAP = 0.45; // 장면 사이 무음(초)
export const POST_ROLL = 2.2; // 마지막 음성 뒤 여운(초)

export const SCENES = [
  {
    id: 'intro',
    chapter: '원',
    text: '⟦circle⟧원. 가장 단순하고 완전한 도형입니다. ⟦pi⟧그 안에는 수천 년 동안 사람들을 사로잡은 하나의 숫자가 숨어 있습니다. 바로, 파이입니다.',
  },
  {
    id: 'diameter',
    chapter: '지름',
    text: '⟦d⟧원의 한가운데를 지나는 선, 지름을 재어 봅니다. ⟦unroll⟧그리고 같은 원의 둘레를, 곧게 펴 봅니다.',
  },
  {
    id: 'ratio',
    chapter: '비율',
    text: '⟦three⟧둘레는 지름의 세 배보다, ⟦rest⟧조금 더 깁니다. ⟦sizes⟧원이 크든 작든, 이 비율은 변하지 않습니다. ⟦formula⟧둘레를 지름으로 나눈 값, 그것이 원주율 파이입니다.',
  },
  {
    id: 'archimedes',
    chapter: '근사',
    text: '⟦poly⟧기원전 삼 세기, 아르키메데스는 원의 안과 밖에 다각형을 그려 파이를 붙잡으려 했습니다. ⟦double⟧육각형에서 시작해 변의 수를 두 배씩 늘려 구십육각형에 이르자, ⟦bounds⟧파이는 삼 점 일 사 영 팔과 삼 점 일 사 이 구 사이에 갇혔습니다.',
  },
  {
    id: 'digits',
    chapter: '무한',
    text: '⟦num⟧파이는 삼 점 일 사 일 오 구, ⟦stream⟧숫자가 끝없이 이어지는 무한소수입니다. ⟦never⟧반복되지 않고, 어떤 분수로도 정확히 나타낼 수 없습니다.',
  },
  {
    id: 'wave',
    chapter: '파동',
    text: '⟦turn⟧하지만 파이는 원 안에만 머물지 않습니다. 원 위의 점이 한 바퀴 돌 때, ⟦trace⟧그 그림자는 물결이 됩니다. 한 바퀴는 이 파이 라디안. ⟦world⟧소리와 빛, 계절과 심장의 박동까지, 세상의 리듬에는 파이가 숨어 있습니다.',
  },
  {
    id: 'outro',
    chapter: '회귀',
    text: '⟦back⟧선은 원이 되고, 원은 파동이 되고, 파동은 다시 원으로 돌아옵니다. ⟦end⟧파이. 끝나지 않는 숫자가, 지금도 세상을 돌고 있습니다.',
  },
];

/** 마커 파싱 → { plain, cues:[{name, charIndex}] }  (charIndex = 공백 제외 글자 수 기준) */
export function parseScene(scene) {
  let plain = '';
  let nonSpace = 0;
  const cues = [];
  const re = /⟦(\w+)⟧/g;
  let last = 0;
  let m;
  const add = (s) => {
    plain += s;
    nonSpace += s.replace(/\s/g, '').length;
  };
  while ((m = re.exec(scene.text))) {
    add(scene.text.slice(last, m.index));
    cues.push({ name: m[1], charIndex: nonSpace });
    last = m.index + m[0].length;
  }
  add(scene.text.slice(last));
  return { plain: plain.trim(), cues, total: nonSpace };
}

/** 문장 분리 (마침표·물음표·느낌표 기준) */
export function splitSentences(plain) {
  const out = [];
  let buf = '';
  for (const ch of plain) {
    buf += ch;
    if (/[.?!。]/.test(ch)) {
      if (buf.trim()) out.push(buf.trim());
      buf = '';
    }
  }
  if (buf.trim()) out.push(buf.trim());
  return out;
}

/**
 * words: [{text,start,end}] (장면 내부 상대 시간, 초)
 * 공백 제외 글자 위치 k → 시간. TTS가 텍스트를 정규화해 글자 수가 달라져도
 * 비율로 보정하므로 큐가 크게 어긋나지 않습니다.
 */
export function makeCharMapper(words, totalChars, duration) {
  const cum = [0];
  for (const w of words) cum.push(cum[cum.length - 1] + w.text.replace(/\s/g, '').length);
  const S = cum[cum.length - 1] || 1;
  return (k) => {
    if (!words.length) return (k / Math.max(1, totalChars)) * duration;
    const pos = Math.min(S, Math.max(0, (k / Math.max(1, totalChars)) * S));
    let j = 0;
    while (j < words.length - 1 && cum[j + 1] <= pos) j++;
    const w = words[j];
    const span = cum[j + 1] - cum[j] || 1;
    const f = Math.min(1, Math.max(0, (pos - cum[j]) / span));
    return w.start + (w.end - w.start) * f;
  };
}

/** 한 장면의 manifest 엔트리 생성. offset = 장면 시작(전역 초), speechStart = 장면 내 음성 시작 지연 */
export function layoutScene(scene, offset, words, speechDur, speechDelay, tailGap) {
  const { plain, cues, total } = parseScene(scene);
  const dur = speechDelay + speechDur + tailGap;
  const shifted = words.map((w) => ({ text: w.text, start: w.start + speechDelay, end: w.end + speechDelay }));
  const map = makeCharMapper(shifted, total, dur);
  const sentences = [];
  let acc = 0;
  for (const s of splitSentences(plain)) {
    const n = s.replace(/\s/g, '').length;
    sentences.push({ text: s, start: offset + map(acc), end: offset + map(acc + n) });
    acc += n;
  }
  const cueMap = {};
  for (const c of cues) cueMap[c.name] = +(offset + map(c.charIndex)).toFixed(3);
  return {
    id: scene.id,
    chapter: scene.chapter,
    text: plain,
    start: +offset.toFixed(3),
    end: +(offset + dur).toFixed(3),
    cues: cueMap,
    sentences: sentences.map((s) => ({ ...s, start: +s.start.toFixed(3), end: +s.end.toFixed(3) })),
    words: shifted.map((w) => ({
      text: w.text,
      start: +(offset + w.start).toFixed(3),
      end: +(offset + w.end).toFixed(3),
    })),
  };
}

/** API 없이 쓰는 추정 타이밍 (한국어 대략 6~7음절/초) */
export function estimateSpeech(scene) {
  const { plain, total } = parseScene(scene);
  const sentences = splitSentences(plain).length;
  const dur = total * 0.165 + sentences * 0.3;
  const toks = plain.split(/\s+/).filter(Boolean);
  const weights = toks.map((t) => t.replace(/\s/g, '').length || 1);
  const W = weights.reduce((a, b) => a + b, 0);
  let t = 0;
  const words = toks.map((text, i) => {
    const d = (weights[i] / W) * dur;
    const w = { text, start: t, end: t + d };
    t += d;
    return w;
  });
  return { words, duration: dur };
}
