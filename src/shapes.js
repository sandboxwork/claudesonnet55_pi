// 형태(Formation) 생성 — 모두 점 배열(Float32Array [x0,y0,x1,y1…]) 로 표현해 서로 모핑 가능
import { TAU, clamp, lerp, rng, inOutCubic } from './ease.js';
import { CX, CY, R, LINE_Y, LINE_LEN, X0, ringPt, FONT } from './kit.js';

/**
 * 원이 굴러서 선으로 펴지는 형태.
 *  phi    : 굴러간 각도(0 → 2π). 굴러간 호 길이 R·phi 만큼이 기준선 위에 곧게 펴짐
 *  cxSlide: phi=0 일 때 원 중심 x (원이 왼쪽 시작점으로 미끄러질 때 사용)
 */
export function rollPts(N, phi, cxSlide = X0, r = R) {
  const out = new Float32Array((N + 1) * 2);
  const len = TAU * r;
  const laid = r * phi;
  const cxr = cxSlide + r * phi;
  const cyr = LINE_Y - r;
  for (let i = 0; i <= N; i++) {
    const s = (i / N) * len;
    let x;
    let y;
    if (s <= laid) {
      x = cxSlide + s;
      y = LINE_Y;
    } else {
      const a = (s - laid) / r;
      x = cxr + r * Math.sin(a);
      y = cyr + r * Math.cos(a);
    }
    out[i * 2] = x;
    out[i * 2 + 1] = y;
  }
  return out;
}

/** 정n각형(내접: 꼭짓점이 원 위 / 외접: 변이 원에 접함) 둘레를 N+1개 점으로 샘플 */
export function polyPts(cx, cy, r, n, N, circumscribed = false) {
  const rad = circumscribed ? r / Math.cos(Math.PI / n) : r;
  const off = circumscribed ? -Math.PI / n : 0;
  const V = [];
  for (let k = 0; k <= n; k++) V.push(ringPt(cx, cy, rad, off + (k / n) * TAU));
  const out = new Float32Array((N + 1) * 2);
  for (let i = 0; i <= N; i++) {
    const e = (i / N) * n;
    const k = Math.min(n - 1, Math.floor(e));
    const u = e - k;
    out[i * 2] = lerp(V[k][0], V[k + 1][0], u);
    out[i * 2 + 1] = lerp(V[k][1], V[k + 1][1], u);
  }
  return out;
}

export function polyVerts(cx, cy, r, n, circumscribed = false) {
  const rad = circumscribed ? r / Math.cos(Math.PI / n) : r;
  const off = circumscribed ? -Math.PI / n : 0;
  const out = [];
  for (let k = 0; k < n; k++) out.push(ringPt(cx, cy, rad, off + (k / n) * TAU));
  return out;
}

export function lerpPts(a, b, u, out) {
  const o = out || new Float32Array(a.length);
  for (let i = 0; i < a.length; i++) o[i] = a[i] + (b[i] - a[i]) * u;
  return o;
}

/** 텍스트 → 점 구름. 중심 기준 상대 좌표. 각도순으로 정렬해 원(ringPt 순서)과 1:1 대응시킴 */
export function sampleText(str, size, N, seed = 11, font = FONT.serif, weight = 700) {
  const c = document.createElement('canvas');
  const g = c.getContext('2d');
  g.font = `italic ${weight} ${size}px ${font}`;
  const w = Math.ceil(g.measureText(str).width) + 60;
  const h = Math.ceil(size * 1.5);
  c.width = w;
  c.height = h;
  g.font = `italic ${weight} ${size}px ${font}`;
  g.textBaseline = 'middle';
  g.textAlign = 'center';
  g.fillStyle = '#fff';
  g.fillText(str, w / 2, h / 2);
  const img = g.getImageData(0, 0, w, h).data;

  let step = Math.max(2, Math.round(size / 55));
  let pts = [];
  for (let tries = 0; tries < 8; tries++) {
    pts = [];
    for (let y = 0; y < h; y += step)
      for (let x = 0; x < w; x += step) if (img[(y * w + x) * 4 + 3] > 120) pts.push([x - w / 2, y - h / 2]);
    if (pts.length >= N) break;
    step = Math.max(1, step * 0.8);
  }
  const rand = rng(seed);
  // 균등 샘플링을 위해 셔플 후 N개
  for (let i = pts.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [pts[i], pts[j]] = [pts[j], pts[i]];
  }
  pts = pts.slice(0, N);
  while (pts.length < N) pts.push(pts[pts.length % Math.max(1, pts.length)] || [0, 0]);
  // 각도순 정렬 (ringPt 의 a 정의와 동일: a = atan2(dx, dy))
  const key = (p) => {
    const a = Math.atan2(p[0], p[1]);
    return a < 0 ? a + TAU : a;
  };
  pts.sort((p, q) => key(p) - key(q));
  const out = new Float32Array(N * 2);
  pts.forEach((p, i) => {
    out[i * 2] = p[0] + (rand() - 0.5) * 1.6;
    out[i * 2 + 1] = p[1] + (rand() - 0.5) * 1.6;
  });
  return { pts: out, width: w - 60, height: h };
}

/** 원 ↔ 텍스트 파티클 포메이션 (입자별 지연 + 곡선 경로로 '모프' 느낌) */
export class Formation {
  constructor(N, seed = 3) {
    this.N = N;
    const r = rng(seed);
    this.delay = Float32Array.from({ length: N }, () => r());
    this.bulge = Float32Array.from({ length: N }, () => r() - 0.5);
    this.size = Float32Array.from({ length: N }, () => 1.1 + r() * 1.5);
    this.tmp = new Float32Array(N * 2);
  }

  /** ring(cx,cy,r) → 텍스트(center,scale) 사이 e(0..1) 위치. 결과: this.tmp */
  between(ringC, ringR, text, tc, scale, u, spread = 0.55, curl = 160) {
    const N = this.N;
    const out = this.tmp;
    for (let i = 0; i < N; i++) {
      const a = (i / N) * TAU;
      const rx = ringC[0] + ringR * Math.sin(a);
      const ry = ringC[1] + ringR * Math.cos(a);
      const tx = tc[0] + text[i * 2] * scale;
      const ty = tc[1] + text[i * 2 + 1] * scale;
      const e = inOutCubic((u * (1 + spread) - this.delay[i] * spread));
      const bx = -(ty - ry);
      const by = tx - rx;
      const bl = Math.hypot(bx, by) || 1;
      const b = Math.sin(Math.PI * e) * curl * this.bulge[i];
      out[i * 2] = lerp(rx, tx, e) + (bx / bl) * b;
      out[i * 2 + 1] = lerp(ry, ty, e) + (by / bl) * b;
    }
    return out;
  }

  draw(ctx, pts, color, alpha = 1, scale = 1) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = 8;
    const N = this.N;
    for (let i = 0; i < N; i++) {
      const s = this.size[i] * scale;
      ctx.fillRect(pts[i * 2] - s / 2, pts[i * 2 + 1] - s / 2, s, s);
    }
    ctx.restore();
  }
}

export { CX, CY };
