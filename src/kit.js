// 공용 상수 · 드로잉 헬퍼
import { TAU, clamp, lerp, rng } from './ease.js';

export const W = 1920;
export const H = 1080;
export const CX = 960;
export const CY = 480;
export const R = 200; // 히어로 원 반지름
export const LINE_Y = CY + R; // 원이 펴지는 기준선 y
export const LINE_LEN = TAU * R; // 원둘레 = 2πR
export const X0 = CX - Math.PI * R; // 펴진 선의 시작 x (선 중앙이 CX)
export const BAR_Y = LINE_Y + 62; // 지름 막대들의 y

export const COL = {
  ink: '#f3efe4',
  amber: '#ffb547',
  cyan: '#59e3ff',
  rose: '#ff6b95',
  violet: '#9b8cff',
  mint: '#6ff2b5',
  dim: 'rgba(243,239,228,0.42)',
  faint: 'rgba(243,239,228,0.14)',
};
export const RGB = {
  ink: [243, 239, 228],
  amber: [255, 181, 71],
  cyan: [89, 227, 255],
  rose: [255, 107, 149],
  violet: [155, 140, 255],
};
export const FONT = {
  sans: "'Pretendard','Noto Sans KR','Apple SD Gothic Neo','Malgun Gothic',system-ui,sans-serif",
  serif: "'Cormorant Garamond','Noto Serif KR','Times New Roman',Georgia,serif",
  mono: "'JetBrains Mono','SF Mono',Menlo,Consolas,'DejaVu Sans Mono',monospace",
};

export const rgbaArr = (c, a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
export const mixRgb = (a, b, u) => [lerp(a[0], b[0], u), lerp(a[1], b[1], u), lerp(a[2], b[2], u)];

/** 중심(cx,cy) 반지름 r 위의 점. a=0 이 '아래', 증가하면 오른쪽→위 (화면상 반시계) */
export const ringPt = (cx, cy, r, a) => [cx + r * Math.sin(a), cy + r * Math.cos(a)];

export function ringPts(cx, cy, r, N) {
  const out = new Float32Array((N + 1) * 2);
  for (let i = 0; i <= N; i++) {
    const a = (i / N) * TAU;
    out[i * 2] = cx + r * Math.sin(a);
    out[i * 2 + 1] = cy + r * Math.cos(a);
  }
  return out;
}

/** 점 배열의 앞 frac 만큼만 경로로 그림 (선분 보간 포함) */
export function tracePath(ctx, pts, frac = 1) {
  const n = pts.length / 2;
  if (n < 2 || frac <= 0) return false;
  const f = clamp(frac) * (n - 1);
  const k = Math.floor(f);
  ctx.beginPath();
  ctx.moveTo(pts[0], pts[1]);
  for (let i = 1; i <= k; i++) ctx.lineTo(pts[i * 2], pts[i * 2 + 1]);
  if (k < n - 1) {
    const u = f - k;
    ctx.lineTo(lerp(pts[k * 2], pts[k * 2 + 2], u), lerp(pts[k * 2 + 1], pts[k * 2 + 3], u));
  }
  return true;
}

export function tipOf(pts, frac) {
  const n = pts.length / 2;
  const f = clamp(frac) * (n - 1);
  const k = Math.min(n - 2, Math.floor(f));
  const u = f - k;
  return [lerp(pts[k * 2], pts[k * 2 + 2], u), lerp(pts[k * 2 + 1], pts[k * 2 + 3], u)];
}

/** 글로우가 있는 스트로크 */
export function glowStroke(ctx, pts, { color = COL.cyan, width = 4, blur = 18, alpha = 1, frac = 1, dash = null } = {}) {
  if (alpha <= 0.001) return;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  if (dash) ctx.setLineDash(dash);
  if (!tracePath(ctx, pts, frac)) {
    ctx.restore();
    return;
  }
  ctx.shadowColor = color;
  ctx.shadowBlur = blur;
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.globalAlpha = alpha * 0.9;
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = Math.max(1, width * 0.28);
  ctx.globalCompositeOperation = 'lighter';
  ctx.stroke();
  ctx.restore();
}

export function line(ctx, x1, y1, x2, y2, { color = COL.dim, width = 2, alpha = 1, dash = null, cap = 'round' } = {}) {
  if (alpha <= 0.001) return;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = cap;
  if (dash) ctx.setLineDash(dash);
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
  ctx.restore();
}

export function dot(ctx, x, y, r, color = COL.ink, { glow = 16, alpha = 1 } = {}) {
  if (alpha <= 0.001) return;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.shadowColor = color;
  ctx.shadowBlur = glow;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.fill();
  ctx.restore();
}

export function text(ctx, str, x, y, { size = 32, color = COL.ink, align = 'center', font = FONT.sans, alpha = 1, weight = 500, style = '', baseline = 'middle', glow = 0, spacing = 0 } = {}) {
  if (alpha <= 0.001) return;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.font = `${style} ${weight} ${size}px ${font}`.trim();
  ctx.textAlign = align;
  ctx.textBaseline = baseline;
  ctx.fillStyle = color;
  if ('letterSpacing' in ctx) ctx.letterSpacing = `${spacing}px`;
  if (glow) {
    ctx.shadowColor = color;
    ctx.shadowBlur = glow;
  }
  ctx.fillText(str, x, y);
  ctx.restore();
}

/** 원 + 눈금. frac: 그려진 비율, tick: 눈금 진행 */
export function drawCircle(ctx, { cx = CX, cy = CY, r = R, frac = 1, alpha = 1, color = COL.cyan, ticks = 0, tickAlpha = 1, width = 4 } = {}) {
  const pts = ringPts(cx, cy, r, 360);
  glowStroke(ctx, pts, { color, width, blur: 22, alpha, frac });
  if (ticks > 0) {
    const n = 72;
    for (let k = 0; k < n; k++) {
      const a = (k / n) * TAU;
      const v = clamp(ticks * 1.5 - (k / n) * 0.5);
      if (v <= 0) continue;
      const major = k % 6 === 0;
      const len = (major ? 22 : 11) * v;
      const p1 = ringPt(cx, cy, r + 14, a);
      const p2 = ringPt(cx, cy, r + 14 + len, a);
      line(ctx, p1[0], p1[1], p2[0], p2[1], { color: major ? COL.ink : COL.dim, width: major ? 2.2 : 1.4, alpha: alpha * tickAlpha * v * 0.8 });
    }
  }
}

/** 배경: 그라데이션 + 흐르는 격자 + 먼지 + 비네트. t 만의 함수 */
const DUST = (() => {
  const r = rng(7);
  return Array.from({ length: 110 }, () => ({ x: r() * W, y: r() * H, z: 0.3 + r() * 0.9, ph: r() * TAU, s: 0.6 + r() * 1.8 }));
})();

export function drawBackground(ctx, t, hue = 218) {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, `hsl(${hue},38%,6%)`);
  g.addColorStop(1, `hsl(${hue + 14},42%,10%)`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  const glow = ctx.createRadialGradient(CX, CY, 40, CX, CY, 820);
  glow.addColorStop(0, `hsla(${hue + 20},80%,45%,0.20)`);
  glow.addColorStop(0.55, `hsla(${hue},70%,30%,0.07)`);
  glow.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);

  // 격자 (천천히 흐름)
  ctx.save();
  ctx.strokeStyle = 'rgba(160,190,255,0.055)';
  ctx.lineWidth = 1;
  const step = 96;
  const ox = (t * 7) % step;
  const oy = (t * 4) % step;
  ctx.beginPath();
  for (let x = -step + ox; x < W + step; x += step) {
    ctx.moveTo(x, 0);
    ctx.lineTo(x, H);
  }
  for (let y = -step + oy; y < H + step; y += step) {
    ctx.moveTo(0, y);
    ctx.lineTo(W, y);
  }
  ctx.stroke();
  ctx.restore();

  // 먼지
  ctx.save();
  for (const d of DUST) {
    const x = (d.x + t * 6 * d.z * d.s) % W;
    const y = (d.y - t * 3 * d.z + Math.sin(t * 0.3 + d.ph) * 14 + H * 4) % H;
    const a = (0.12 + 0.22 * (0.5 + 0.5 * Math.sin(t * d.s + d.ph))) * d.z;
    ctx.fillStyle = `rgba(200,220,255,${a})`;
    ctx.beginPath();
    ctx.arc(x, y, d.z * 1.5, 0, TAU);
    ctx.fill();
  }
  ctx.restore();

  const vg = ctx.createRadialGradient(CX, CY, 380, CX, CY, 1150);
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, 'rgba(0,0,0,0.62)');
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, W, H);
}
