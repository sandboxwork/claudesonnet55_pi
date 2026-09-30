// 이징 / 보간 유틸 — 모든 함수는 순수 함수 (시간 t만으로 결과가 결정됨 → seek 안전)
export const TAU = Math.PI * 2;
export const clamp = (x, a = 0, b = 1) => (x < a ? a : x > b ? b : x);
export const lerp = (a, b, u) => a + (b - a) * u;
export const invLerp = (a, b, v) => (v - a) / (b - a);
export const remap = (v, a, b, c, d) => lerp(c, d, clamp(invLerp(a, b, v)));

export const smooth = (x) => {
  x = clamp(x);
  return x * x * (3 - 2 * x);
};
export const inCubic = (x) => clamp(x) ** 3;
export const outCubic = (x) => 1 - (1 - clamp(x)) ** 3;
export const inOutCubic = (x) => {
  x = clamp(x);
  return x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2;
};
export const inOutQuart = (x) => {
  x = clamp(x);
  return x < 0.5 ? 8 * x ** 4 : 1 - (-2 * x + 2) ** 4 / 2;
};
export const inOutSine = (x) => -(Math.cos(Math.PI * clamp(x)) - 1) / 2;
export const outExpo = (x) => (x >= 1 ? 1 : 1 - 2 ** (-10 * clamp(x)));
export const outBack = (x, s = 1.70158) => {
  x = clamp(x) - 1;
  return x * x * ((s + 1) * x + s) + 1;
};
export const outElastic = (x) => {
  x = clamp(x);
  if (x === 0 || x === 1) return x;
  return 2 ** (-10 * x) * Math.sin(((x * 10 - 0.75) * TAU) / 3) + 1;
};

/** 시작 시각·지속시간 → 0..1 진행률 */
export const seg = (t, start, dur) => clamp((t - start) / Math.max(1e-6, dur));

/**
 * 큐 기반 구간: start 에서 시작해 desired 만큼 걸리되 limit(장면 끝 등)을 넘지 않게 압축.
 * 음성 길이가 예상과 달라져도 장면 끝에서 상태가 맞도록 하는 핵심 헬퍼.
 */
export const span = (t, start, desired, limit = Infinity) =>
  seg(t, start, Math.max(0.05, Math.min(desired, limit - start)));

/** 시드 고정 난수 (mulberry32) */
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const hsl = (h, s, l, a = 1) => `hsla(${h},${s}%,${l}%,${a})`;
export const rgba = (r, g, b, a = 1) => `rgba(${r},${g},${b},${a})`;
