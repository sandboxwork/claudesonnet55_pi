// 7개 장면. 모든 장면은 render(t) 의 순수 함수입니다 (setTimeout/CSS 애니메이션 없음).
// 장면 사이의 시각적 연속성: 원 → 선 → 다각형 → 숫자(파티클) → 파동 → 원
import {
  TAU, clamp, lerp, smooth, outCubic, inOutCubic, inOutQuart, outBack, outExpo, span, seg, rng,
} from './ease.js';
import {
  W, H, CX, CY, R, LINE_Y, LINE_LEN, X0, BAR_Y, COL, RGB, FONT,
  rgbaArr, mixRgb, ringPt, ringPts, tracePath, tipOf, glowStroke, line, dot, text,
  drawCircle, drawBackground,
} from './kit.js';
import { rollPts, polyPts, polyVerts, lerpPts, sampleText, Formation } from './shapes.js';
import { PI_DIGITS } from './pi-digits.js';

const N_FORM = 2200;
const BAR_H = 30;
const HUES = [218, 204, 192, 266, 300, 198, 224];

// ── 파동 장면 공용 파라미터 (wave / outro 가 같은 θ(t) 를 공유) ──
const UC = { x: 430, y: CY, r: 170 };
const WX0 = UC.x + UC.r + 110;
const WX1 = 1800;
const WK = (WX1 - WX0) / (4 * Math.PI);

function waveParams(tl) {
  const s = tl.scene('wave');
  const tTurn = s.cues.turn ?? s.start;
  const tTrace = s.cues.trace ?? s.start + 4;
  const tWorld = s.cues.world ?? s.start + 8;
  const dur = clamp(tWorld - tTrace + 1.0, 4.5, 7.5);
  const omega = (TAU * 2) / dur; // 4π 를 dur 초에 그림
  const tRot = tTrace - TAU / omega; // trace 큐 시점에 정확히 θ = 2π (오른쪽 끝, y = 중심)
  return { tTurn, tTrace, tWorld, omega, tRot, theta: (t) => (t < tRot ? 0 : omega * (t - tRot)) };
}

function roundRect(ctx, x, y, w, h, r) {
  const rr = Math.min(r, h / 2, w / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function bar(ctx, x, y, w, h, { label = '', alpha = 1, color = RGB.amber, textColor = '#0a0d16', size = 22 } = {}) {
  if (alpha <= 0.001 || w <= 0.5) return;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.shadowColor = rgbaArr(color, 0.8);
  ctx.shadowBlur = 16;
  ctx.fillStyle = rgbaArr(color, 0.92);
  roundRect(ctx, x, y - h / 2, w, h, 6);
  ctx.fill();
  ctx.restore();
  if (label) text(ctx, label, x + w / 2, y + 1, { size, color: textColor, font: FONT.serif, style: 'italic', weight: 700, alpha });
}

/** 숫자 문자열을 왼쪽부터 확정해 가는 스크램블 (t 의 함수이므로 seek 안전) */
function scramble(str, p, t, seed = 1) {
  const n = Math.floor(p * str.length);
  let out = '';
  for (let i = 0; i < str.length; i++) {
    const ch = str[i];
    if (i < n || ch === '.') out += ch;
    else {
      const k = Math.floor(t * 18) * 131 + i * 17 + seed * 7;
      out += String(((k * 2654435761) >>> 0) % 10);
    }
  }
  return out;
}

export function createScenes(tl) {
  const fm = new Formation(N_FORM);
  let txt = null;
  const ensureText = () => txt || (txt = sampleText('3.14159', 300, N_FORM));
  const wp = waveParams(tl);

  // ── 공용: C 라벨 ──
  const cLabel = (ctx, a) => {
    if (a <= 0.001) return;
    text(ctx, 'C', CX, LINE_Y - 52, { size: 64, color: COL.cyan, font: FONT.serif, style: 'italic', weight: 600, alpha: a, glow: 14 });
    text(ctx, '둘레', CX + 44, LINE_Y - 44, { size: 22, color: COL.dim, alpha: a });
  };

  // ════════════════════════ 0. 원 ════════════════════════
  function intro(c) {
    const { ctx, t, end, ov } = c;
    const tC = c.cue('circle');
    const tP = c.cue('pi');

    // 점 → 십자선 → 원이 그려짐
    const cross = span(t, 0.15, Math.max(0.3, tC - 0.15));
    const crossA = (1 - smooth(span(t, tC, 1.6))) * 0.5;
    if (crossA > 0) {
      const L = R * 1.35 * outCubic(cross);
      line(ctx, CX - L, CY, CX + L, CY, { color: COL.dim, width: 1.4, alpha: crossA });
      line(ctx, CX, CY - L, CX, CY + L, { color: COL.dim, width: 1.4, alpha: crossA });
    }
    dot(ctx, CX, CY, 5 + 2 * Math.sin(t * 3), COL.ink, { glow: 22, alpha: smooth(cross) * (1 - smooth(span(t, tP, 0.6)) * 0.7) });

    const drawDur = Math.max(1.0, tP - tC - 0.35);
    const p = inOutCubic(span(t, tC, drawDur, end));
    const [sx, sy] = ringPt(CX, CY, R, 0);
    dot(ctx, sx, sy, 7, COL.amber, { glow: 26, alpha: smooth(span(t, tC - 0.5, 0.5)) });
    if (p > 0) {
      const pts = ringPts(CX, CY, R, 360);
      glowStroke(ctx, pts, { color: COL.cyan, width: 4, blur: 22, frac: p });
      if (p < 1) {
        const tip = tipOf(pts, p);
        dot(ctx, tip[0], tip[1], 7, '#fff', { glow: 34 });
      }
    }
    // 눈금
    const tk = span(t, tC + drawDur * 0.92, 1.8, end);
    if (tk > 0) {
      const n = 72;
      for (let k = 0; k < n; k++) {
        const a = (k / n) * TAU;
        const v = clamp(tk * 1.5 - (k / n) * 0.5);
        if (v <= 0) continue;
        const major = k % 6 === 0;
        const p1 = ringPt(CX, CY, R + 14, a);
        const p2 = ringPt(CX, CY, R + 14 + (major ? 22 : 11) * v, a);
        line(ctx, p1[0], p1[1], p2[0], p2[1], { color: major ? COL.ink : COL.dim, width: major ? 2.2 : 1.4, alpha: v * 0.8 });
      }
    }

    // π 등장: 충격파 + 외곽선 드로잉 → 채움
    if (t >= tP) {
      const s = outExpo(span(t, tP, 1.7));
      for (let k = 0; k < 2; k++) {
        const sk = outExpo(span(t, tP + k * 0.22, 1.7));
        line(ctx, 0, 0, 0, 0, { alpha: 0 });
        ctx.save();
        ctx.globalAlpha = (1 - sk) * 0.55;
        ctx.strokeStyle = COL.amber;
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(CX, CY, R + 30 + 280 * sk, 0, TAU);
        ctx.stroke();
        ctx.restore();
      }
      ov.pi({ draw: outCubic(span(t, tP, 1.5)), fill: smooth(span(t, tP + 0.9, 0.9)), scale: 0.9 + 0.1 * outBack(span(t, tP, 1.3)), y: CY + 12 });
      void s;
    }
  }

  // ════════════════════════ 1. 지름 ════════════════════════
  function diameter(c) {
    const { ctx, t, end, start, ov } = c;
    const tD = c.cue('d');
    const tU = c.cue('unroll');

    const fade = 1 - smooth(span(t, start, 0.9));
    if (fade > 0) ov.pi({ draw: 1, fill: 1, opacity: fade, scale: 1 + 0.06 * (1 - fade), y: CY + 12 });

    const L = Math.max(1.2, end - 0.1 - tU);
    const slideD = Math.min(1.0, 0.3 * L);
    const rollD = Math.max(0.3, L - slideD);
    const ps = inOutCubic(span(t, tU, slideD));
    const pr = span(t, tU + slideD, rollD, end);
    const phi = TAU * inOutCubic(pr);
    const cxs = lerp(CX, X0, ps);

    // 눈금은 원과 함께 사라짐
    drawCircleTicks(ctx, cxs, CY, R, 1 - smooth(ps * 2));

    const hero = rollPts(480, phi, cxs);
    glowStroke(ctx, hero, { color: COL.cyan, width: 4, blur: 22 });

    // 지름
    const dp = outCubic(span(t, tD, 0.9));
    const drop = inOutCubic(span(t, tU + slideD, Math.min(1.1, rollD * 0.55), end));
    const cX = cxs + R * drop;
    const cY = lerp(CY, BAR_Y, drop);
    if (dp > 0) {
      const x1 = cX - R;
      const x2 = x1 + 2 * R * dp;
      const h = lerp(4, BAR_H, drop);
      if (drop < 0.02) {
        line(ctx, x1, cY, x2, cY, { color: COL.amber, width: 4, alpha: 1 });
        dot(ctx, x1, cY, 7, COL.amber, { glow: 20 });
        if (dp > 0.98) dot(ctx, x2, cY, 7, COL.amber, { glow: 20 });
      } else {
        bar(ctx, x1, cY, x2 - x1, h, { label: drop > 0.7 ? 'd' : '', alpha: 1, size: 24 });
        dot(ctx, x1, cY, 7, COL.amber, { glow: 20, alpha: 1 - drop });
        dot(ctx, x2, cY, 7, COL.amber, { glow: 20, alpha: 1 - drop });
      }
      // 라벨
      const la = smooth(seg(dp, 0.55, 0.45)) * (1 - drop);
      text(ctx, 'd', cX, cY - 46, { size: 72, color: COL.amber, font: FONT.serif, style: 'italic', weight: 600, alpha: la, glow: 18 });
      text(ctx, '지름 = 2r', cX, cY + 50, { size: 24, color: COL.dim, alpha: la });
      // 반지름 눈금선
      line(ctx, cxs, CY, cxs, CY - 10, { color: COL.amber, width: 2, alpha: la * 0.0 });
    }

    // 기준점(출발) & 접점 마커
    if (t >= tU) {
      dot(ctx, cxs, LINE_Y, 7, COL.amber, { glow: 22, alpha: ps });
      if (phi > 0.001 && pr < 1) {
        dot(ctx, X0 + R * phi, LINE_Y, 8, '#fff', { glow: 30 });
      }
    }
    cLabel(ctx, smooth(seg(pr, 0.86, 0.14)));
  }

  function drawCircleTicks(ctx, cx, cy, r, a) {
    if (a <= 0.01) return;
    const n = 72;
    for (let k = 0; k < n; k++) {
      const ang = (k / n) * TAU;
      const major = k % 6 === 0;
      const p1 = ringPt(cx, cy, r + 14, ang);
      const p2 = ringPt(cx, cy, r + 14 + (major ? 22 : 11), ang);
      line(ctx, p1[0], p1[1], p2[0], p2[1], { color: major ? COL.ink : COL.dim, width: major ? 2.2 : 1.4, alpha: a * 0.8 });
    }
  }

  // ════════════════════════ 2. 비율 ════════════════════════
  const SIZES = [
    { cx: 380, r: 70, col: COL.violet, hue: RGB.violet },
    { cx: 800, r: 150, col: COL.cyan, hue: RGB.cyan },
    { cx: 1410, r: 230, col: COL.rose, hue: RGB.rose },
  ];

  function ratio(c) {
    const { ctx, t, end, start, ov } = c;
    const tThree = c.cue('three');
    const tRest = c.cue('rest');
    const tSizes = c.cue('sizes');
    const tForm = c.cue('formula');
    const Lb = Math.max(1.8, tForm - tSizes);

    // 이전 장면(π)에서 넘어온 요소 없음. 선 상태에서 시작
    const revD = 0.34 * Lb;
    const rev = t >= tSizes ? span(t, tSizes, revD, end) : 0;
    const mv = inOutCubic(span(t, tSizes + revD, 0.22 * Lb, end));
    const bk = inOutCubic(span(t, tForm, 1.1, end - 0.1));
    const rolling = rev < 1;

    const barsA = 1 - smooth(span(t, tSizes, 0.2 * Lb));

    // 히어로 (선 ↔ 원)
    let heroX;
    let heroR;
    let pts;
    if (rolling) {
      pts = rollPts(480, TAU * (1 - inOutCubic(rev)), X0);
      heroX = X0;
      heroR = R;
    } else {
      heroX = lerp(lerp(X0, SIZES[1].cx, mv), CX, bk);
      heroR = lerp(lerp(R, SIZES[1].r, mv), R, bk);
      pts = ringPts(heroX, CY, heroR, 360);
    }
    glowStroke(ctx, pts, { color: COL.cyan, width: 4, blur: 22 });

    // 선 위 요소
    if (rolling) {
      dot(ctx, X0, LINE_Y, 7, COL.amber, { glow: 22 });
      cLabel(ctx, 1 - smooth(span(t, tSizes, 0.15 * Lb)));
    }

    // 지름 막대 3개 + 나머지
    if (barsA > 0.001) {
      const gap = Math.min(0.7, Math.max(0.25, (tRest - tThree) * 0.45));
      bar(ctx, X0, BAR_Y, 2 * R - 4, BAR_H, { label: 'd', alpha: barsA, size: 24 });
      for (let k = 1; k <= 2; k++) {
        const p = outBack(span(t, tThree + (k - 1) * gap, 0.7));
        const a = smooth(span(t, tThree + (k - 1) * gap, 0.35)) * barsA;
        bar(ctx, X0 + 2 * R * k, BAR_Y - (1 - p) * 110, 2 * R - 4, BAR_H, { label: 'd', alpha: a, size: 24 });
        line(ctx, X0 + 2 * R * k, LINE_Y + 6, X0 + 2 * R * k, BAR_Y - 22, { color: COL.dim, width: 1.4, dash: [4, 6], alpha: a * 0.8 });
      }
      const t3 = smooth(span(t, tThree + gap + 0.6, 0.6)) * barsA;
      text(ctx, '3d', X0 + 3 * R, BAR_Y + 50, { size: 38, color: COL.amber, font: FONT.serif, style: 'italic', weight: 600, alpha: t3 });
      line(ctx, X0 + 4, BAR_Y + 32, X0 + 6 * R - 8, BAR_Y + 32, { color: COL.amber, width: 2, alpha: t3 * 0.6 });

      // 나머지: 0.14159… d
      const x1 = X0 + 6 * R;
      const x2 = X0 + LINE_LEN;
      const rp = outCubic(span(t, tRest, 0.7));
      if (rp > 0) {
        const pulse = 0.5 + 0.5 * Math.sin((t - tRest) * 6);
        ctx.save();
        ctx.globalAlpha = barsA;
        const seg2 = new Float32Array([x1, LINE_Y, lerp(x1, x2, rp), LINE_Y]);
        glowStroke(ctx, seg2, { color: COL.amber, width: 10, blur: 18 + 12 * pulse });
        ctx.restore();
        bar(ctx, x1, BAR_Y - (1 - rp) * 90, (x2 - x1) * rp, BAR_H, { alpha: barsA * smooth(rp * 2) });
        const la = smooth(span(t, tRest + 0.3, 0.6)) * barsA;
        const mx = (x1 + x2) / 2;
        line(ctx, mx, LINE_Y - 14, mx, LINE_Y - 62, { color: COL.amber, width: 2, alpha: la });
        text(ctx, '+ 0.14159…·d', mx + 16, LINE_Y - 82, { size: 30, color: COL.amber, font: FONT.serif, style: 'italic', weight: 600, alpha: la, align: 'center' });
        // 강조 링
        ctx.save();
        ctx.globalAlpha = barsA * la * (0.5 - 0.35 * pulse);
        ctx.strokeStyle = COL.amber;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc((x1 + x2) / 2, LINE_Y, 26 + 14 * pulse, 0, TAU);
        ctx.stroke();
        ctx.restore();
      }
    }

    // 크든 작든: 세 개의 원 + 같은 비율
    if (t >= tSizes) {
      const outA = 1 - smooth(span(t, tForm, 0.6, end));
      const base = tSizes + revD + 0.15 * Lb;
      SIZES.forEach((s, j) => {
        const isHero = j === 1;
        const appear = isHero ? 1 : outBack(span(t, base + (j === 0 ? 0 : 0.1 * Lb), 0.16 * Lb));
        const a = (isHero ? 1 : appear) * (isHero ? 1 : outA);
        if (!isHero && appear > 0.01) {
          const rr = s.r * appear;
          const cp = ringPts(s.cx, CY, rr, 240);
          glowStroke(ctx, cp, { color: s.col, width: 4, blur: 20, alpha: Math.min(1, appear) * outA });
        }
        const pA = a * smooth(span(t, base + 0.1 * Lb, 0.12 * Lb)) * (isHero ? outA : 1);
        if (pA > 0.01 && !isHero) {
          const ang = (t - base) * 1.6 * (150 / s.r) * 1.2;
          const cxh = s.cx;
          const p1 = ringPt(cxh, CY, s.r, ang);
          line(ctx, cxh, CY, p1[0], p1[1], { color: s.col, width: 2, alpha: pA * 0.7 });
          dot(ctx, p1[0], p1[1], 6, '#fff', { glow: 22, alpha: pA });
          dot(ctx, cxh, CY, 4, s.col, { glow: 10, alpha: pA });
        } else if (isHero && mv > 0.5) {
          const ang = (t - base) * 1.6 * 1.2;
          const p1 = ringPt(heroX, CY, heroR, ang);
          line(ctx, heroX, CY, p1[0], p1[1], { color: COL.cyan, width: 2, alpha: outA * 0.7 * mv });
          dot(ctx, p1[0], p1[1], 6, '#fff', { glow: 22, alpha: outA * mv });
          dot(ctx, heroX, CY, 4, COL.cyan, { glow: 10, alpha: outA * mv });
        }
        // 수치
        const lp = span(t, base + (0.22 + 0.06 * j) * Lb, 0.22 * Lb);
        const la = smooth(span(t, base + 0.12 * Lb, 0.12 * Lb)) * outA;
        if (la > 0.01) {
          const d = 2 * s.r;
          text(ctx, `d = ${d}   C = ${(Math.PI * d).toFixed(1)}`, s.cx, 752, { size: 21, color: COL.dim, font: FONT.mono, alpha: la });
          text(ctx, scramble('3.14159265', lp, t, j + 1), s.cx, 802, { size: 48, color: lp >= 1 ? s.col : COL.ink, font: FONT.mono, weight: 600, alpha: la, glow: lp >= 1 ? 16 : 0 });
        }
      });
    }

    // π = C / d
    if (t >= tForm) {
      ov.formula({ text: 'π = C ⁄ d', wipe: outCubic(span(t, tForm + 0.15, 1.1)), opacity: 1 });
    }
    void start;
  }

  // ════════════════════════ 3. 아르키메데스 ════════════════════════
  const STEPS = [6, 12, 24, 48, 96];
  const PN = 384; // 6,12,24,48,96 의 공배수 → 꼭짓점이 샘플점에 정확히 놓임
  const polyCache = new Map();
  const getPoly = (n, circ) => {
    const k = n + (circ ? 'c' : 'i');
    if (!polyCache.has(k)) polyCache.set(k, polyPts(CX, CY, R, n, PN, circ));
    return polyCache.get(k);
  };
  const loOf = (n) => n * Math.sin(Math.PI / n);
  const hiOf = (n) => n * Math.tan(Math.PI / n);

  function archimedes(c) {
    const { ctx, t, end, start, ov } = c;
    const tP = c.cue('poly');
    const tD = c.cue('double');
    const tB = c.cue('bounds');

    // 이전 장면 수식 페이드아웃
    const fa = 1 - smooth(span(t, start, 0.8));
    if (fa > 0 && t < tB) ov.formula({ text: 'π = C ⁄ d', wipe: 1, opacity: fa });

    const outA = 1 - smooth(span(t, end - 0.75, 0.6));

    // 원
    glowStroke(ctx, ringPts(CX, CY, R, 360), { color: COL.cyan, width: 4, blur: 20, alpha: 0.9 });

    // 단계 계산
    const L = Math.max(1.6, tB - tD - 0.35);
    const sd = clamp(L / 4, 0.5, 1.1);
    let a = 6;
    let b = 6;
    let e = 0;
    if (t >= tD) {
      const q = t - tD;
      if (q >= 4 * sd) {
        a = 48;
        b = 96;
        e = 1;
      } else {
        const k = Math.min(3, Math.floor(q / sd));
        a = STEPS[k];
        b = STEPS[k + 1];
        e = inOutCubic((q - k * sd) / (sd * 0.72));
      }
    }

    const p1 = outCubic(span(t, tP, 1.0, end));
    const p2 = outCubic(span(t, tP + 0.5, 1.0, end));
    if (p1 > 0) {
      const ins = lerpPts(getPoly(a, false), getPoly(b, false), e);
      const cir = lerpPts(getPoly(a, true), getPoly(b, true), e);
      const fillA = smooth(span(t, tP + 1.2, 0.8)) * 0.1 * outA;
      if (fillA > 0) {
        ctx.save();
        ctx.fillStyle = rgbaArr(RGB.rose, fillA);
        tracePath(ctx, cir, 1);
        ctx.fill();
        ctx.fillStyle = rgbaArr(RGB.cyan, fillA * 1.4);
        tracePath(ctx, ins, 1);
        ctx.fill();
        ctx.restore();
      }
      glowStroke(ctx, cir, { color: COL.rose, width: 3, blur: 14, frac: p2, alpha: outA });
      glowStroke(ctx, ins, { color: COL.cyan, width: 3.4, blur: 14, frac: p1, alpha: outA });
      // 꼭짓점
      const va = (n, al) => {
        if (n > 24 || al <= 0.01) return;
        for (const v of polyVerts(CX, CY, R, n, false)) dot(ctx, v[0], v[1], 4.5, COL.ink, { glow: 10, alpha: al * p1 * outA });
      };
      va(a, 1 - e);
      va(b, e);
    }

    // HUD
    const nNow = e > 0.5 ? b : a;
    const lo = lerp(loOf(a), loOf(b), e);
    const hi = lerp(hiOf(a), hiOf(b), e);
    const hudA = smooth(span(t, tP + 1.0, 0.7)) * outA;
    if (hudA > 0.01) {
      text(ctx, '변의 수', 200, 286, { size: 24, color: COL.dim, align: 'left', alpha: hudA });
      text(ctx, `n = ${nNow}`, 196, 352, { size: 92, color: COL.ink, align: 'left', font: FONT.mono, weight: 600, alpha: hudA });
      text(ctx, '안쪽 다각형  둘레 ÷ 지름', 1290, 286, { size: 24, color: COL.cyan, align: 'left', alpha: hudA });
      text(ctx, lo.toFixed(4), 1286, 348, { size: 68, color: COL.cyan, align: 'left', font: FONT.mono, weight: 600, alpha: hudA, glow: 12 });
      text(ctx, '바깥쪽 다각형  둘레 ÷ 지름', 1290, 436, { size: 24, color: COL.rose, align: 'left', alpha: hudA });
      text(ctx, hi.toFixed(4), 1286, 498, { size: 68, color: COL.rose, align: 'left', font: FONT.mono, weight: 600, alpha: hudA, glow: 12 });
    }

    // 조여 오는 수직선: 하한 < π < 상한
    const nl = smooth(span(t, tP + 1.2, 0.8)) * outA;
    if (nl > 0.01) {
      const ARL = 223 / 71;
      const ARU = 22 / 7;
      let hw = Math.max(Math.abs(Math.PI - lo), Math.abs(hi - Math.PI)) * 1.45 + 1e-6;
      const archHW = Math.max(Math.PI - ARL, ARU - Math.PI) * 1.3;
      hw = Math.max(hw, archHW * smooth(span(t, tB, 0.9)));
      const Y = 782;
      const X = (v) => CX + ((v - Math.PI) / hw) * 560;
      line(ctx, 360, Y, 1560, Y, { color: COL.dim, width: 2, alpha: nl });
      for (let k = -2; k <= 2; k++) {
        const v = Math.PI + (k / 2) * hw;
        const x = X(v);
        line(ctx, x, Y - 8, x, Y + 8, { color: COL.dim, width: 1.6, alpha: nl });
        if (k !== 0) text(ctx, v.toFixed(5), x, Y + 28, { size: 17, color: COL.dim, font: FONT.mono, alpha: nl * 0.8 });
      }
      const tri = (x, col, up) => {
        ctx.save();
        ctx.globalAlpha = nl;
        ctx.fillStyle = col;
        ctx.shadowColor = col;
        ctx.shadowBlur = 14;
        ctx.beginPath();
        if (up) {
          ctx.moveTo(x, Y - 6);
          ctx.lineTo(x - 11, Y - 30);
          ctx.lineTo(x + 11, Y - 30);
        } else {
          ctx.moveTo(x, Y + 6);
          ctx.lineTo(x - 11, Y + 30);
          ctx.lineTo(x + 11, Y + 30);
        }
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      };
      tri(X(lo), COL.cyan, true);
      tri(X(hi), COL.rose, true);
      dot(ctx, X(Math.PI), Y, 7, COL.ink, { glow: 22, alpha: nl });
      text(ctx, 'π', X(Math.PI), Y - 38, { size: 40, font: FONT.serif, style: 'italic', weight: 600, alpha: nl });

      // 아르키메데스의 경계: 223/71 < π < 22/7
      const ba = outBack(span(t, tB, 0.8));
      const bA = smooth(span(t, tB, 0.5)) * outA;
      if (bA > 0.01) {
        for (const [v, lab, dx] of [[ARL, '223⁄71', -1], [ARU, '22⁄7', 1]]) {
          const x = X(v);
          line(ctx, x, Y - 60 * ba, x, Y + 16, { color: COL.amber, width: 3, alpha: bA });
          text(ctx, lab, x + dx * 6, Y - 76 * ba, { size: 26, color: COL.amber, font: FONT.serif, style: 'italic', weight: 700, alpha: bA, align: dx < 0 ? 'right' : 'left' });
        }
        ov.formula({ text: '3.1408 < π < 3.1429', wipe: outCubic(span(t, tB + 0.1, 1.0)), opacity: outA, size: 100 });
      }
    }
  }

  // ════════════════════════ 4. 무한소수 ════════════════════════
  const GCOLS = 42;
  const GROWS = 12;
  const GCW = 38;
  const GCH = 40;
  const GX0 = (W - GCOLS * GCW) / 2 + GCW / 2;
  const GY0 = 330;
  const RING_DIGITS = 140;
  const RING_R = 330;

  function digits(c) {
    const { ctx, t, end } = c;
    const tN = c.cue('num');
    const tS = c.cue('stream');
    const tV = c.cue('never');
    const T = ensureText();

    const uA = span(t, tN, 1.9, tS - 0.05);
    const s2 = inOutCubic(span(t, tS, 1.2));
    const back = span(t, tV, 1.5, end - 0.1);
    const uEff = uA * (1 - back);
    const tc = [CX, lerp(CY, 190, s2)];
    const sc = lerp(1, 0.42, s2);

    // 원(크리스프) → 파티클
    const strokeA = 1 - smooth(uEff * 7);
    glowStroke(ctx, ringPts(CX, CY, R, 360), { color: COL.cyan, width: 4, blur: 22, alpha: strokeA });
    const pts = fm.between([CX, CY], R, T.pts, tc, sc, uEff, 0.55, 150);
    const col = mixRgb(RGB.cyan, RGB.amber, smooth(uEff * 1.4));
    fm.draw(ctx, pts, rgbaArr(col, 1), 0.95, 1 + 0.25 * Math.sin(Math.PI * clamp(uEff)));

    // 무한대 기호
    const infP = outCubic(span(t, tS + 0.2, 1.4));
    const infA = 1 - smooth(span(t, tV, 1.0));
    if (infP > 0 && infA > 0.01) {
      const Lm = new Float32Array(2 * 181);
      for (let i = 0; i <= 180; i++) {
        const a = (i / 180) * TAU;
        const d = 1 + Math.sin(a) ** 2;
        Lm[i * 2] = 290 + (95 * Math.cos(a)) / d;
        Lm[i * 2 + 1] = 200 + (95 * Math.sin(a) * Math.cos(a)) / d;
      }
      glowStroke(ctx, Lm, { color: COL.violet, width: 4, blur: 18, frac: infP, alpha: infA });
    }

    // 자릿수 스트림
    const tau = t - (tS + 0.55);
    const count = t < tS + 0.3 ? 0 : Math.min(GCOLS * GROWS, 6 * Math.exp(1.9 * Math.max(0, tau)));
    const back2 = inOutCubic(span(t, tV, 1.6, end - 0.1));
    const rot = 0.06 * Math.max(0, t - tV);
    // 링 구간에서 이어지는 회전은 wave 장면에서도 계속되므로 tV 기준 고정
    ctx.save();
    ctx.font = `500 26px ${FONT.mono}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const START = 5; // "3.14159" 뒤의 자리부터
    for (let i = 0; i < GCOLS * GROWS; i++) {
      if (i >= count) break;
      const col0 = i % GCOLS;
      const row = Math.floor(i / GCOLS);
      const gx = GX0 + col0 * GCW;
      const gy = GY0 + row * GCH;
      const born = tau < 0 ? 0 : Math.log((i + 1) / 6) / 1.9;
      const age = Math.max(0, tau - Math.max(0, born));
      const flash = Math.exp(-age * 2.4);
      let x = gx;
      let y = gy;
      let al = clamp(age * 7) * (0.34 + 0.66 * flash);
      if (back2 > 0) {
        if (i < RING_DIGITS) {
          const ang = (i / RING_DIGITS) * TAU + rot;
          const rp = ringPt(CX, CY, RING_R, ang);
          const k = inOutCubic(clamp(back2 * 1.6 - (i / RING_DIGITS) * 0.6));
          x = lerp(gx, rp[0], k);
          y = lerp(gy, rp[1], k);
          al = Math.max(al, 0.3 * k) * 1;
        } else {
          al *= 1 - smooth(back2 * 2.2);
        }
      }
      if (al <= 0.01) continue;
      const d = PI_DIGITS[START + i] ?? '0';
      ctx.globalAlpha = al;
      ctx.fillStyle = flash > 0.35 ? COL.amber : COL.ink;
      ctx.fillText(d, x, y);
    }
    ctx.restore();

    // 분수로 나타낼 수 없다
    const na = smooth(span(t, tV + 1.0, 0.8));
    if (na > 0.01) {
      text(ctx, 'π ≠ a ⁄ b', CX, CY + 8, { size: 92, font: FONT.serif, style: 'italic', weight: 600, alpha: na, glow: 16 });
    }
  }

  // ════════════════════════ 5. 파동 ════════════════════════
  const ROWS = [
    { y: 706, label: '소리', col: COL.cyan, f: (x, tt) => 17 * Math.sin(TAU * 5 * x - 6 * tt) * (0.62 + 0.38 * Math.sin(TAU * 1.3 * x + tt * 0.6)) },
    { y: 749, label: '빛', col: COL.violet, f: (x, tt) => 11 * Math.sin(TAU * 15 * x - 13 * tt) },
    { y: 792, label: '계절', col: COL.amber, f: (x, tt) => 20 * Math.sin(TAU * 1 * x - 1.1 * tt) },
    { y: 836, label: '심장', col: COL.rose, f: (x, tt) => 25 * ecg(x * 3 - tt * 0.32) },
  ];
  function ecg(p) {
    p -= Math.floor(p);
    const g = (c, w, a) => a * Math.exp(-(((p - c) / w) ** 2));
    return g(0.14, 0.03, 0.18) + g(0.27, 0.008, -0.22) + g(0.3, 0.01, 1.0) + g(0.335, 0.01, -0.34) + g(0.56, 0.05, 0.3);
  }
  const WAVE_N = 480;
  const waveFull = (() => {
    const o = new Float32Array((WAVE_N + 1) * 2);
    for (let i = 0; i <= WAVE_N; i++) {
      const a = (i / WAVE_N) * 4 * Math.PI;
      o[i * 2] = WX0 + a * WK;
      o[i * 2 + 1] = UC.y - UC.r * Math.sin(a);
    }
    return o;
  })();

  function drawRows(ctx, t, tW, alphaAll = 1) {
    ROWS.forEach((row, j) => {
      const p = outCubic(span(t, tW + 0.35 * j, 1.1));
      if (p <= 0 || alphaAll <= 0.01) return;
      const n = 240;
      const pts = new Float32Array((n + 1) * 2);
      for (let i = 0; i <= n; i++) {
        const x = i / n;
        pts[i * 2] = WX0 + x * (WX1 - WX0);
        pts[i * 2 + 1] = row.y - row.f(x, t);
      }
      glowStroke(ctx, pts, { color: row.col, width: 2.6, blur: 10, frac: p, alpha: alphaAll * 0.95 });
      text(ctx, row.label, WX0 - 28, row.y, { size: 24, color: row.col, align: 'right', alpha: alphaAll * smooth(p * 2) });
    });
  }

  function unitCircle(ctx, t, alpha, cx, cy, r, theta) {
    glowStroke(ctx, ringPts(cx, cy, r, 360), { color: COL.cyan, width: 4, blur: 20, alpha });
    return alpha;
  }

  function wave(c) {
    const { ctx, t, end, start } = c;
    const { tTurn, tTrace, tWorld, theta } = wp;

    const u = inOutCubic(span(t, tTurn, 1.4, end));
    const cx = lerp(CX, UC.x, u);
    const cy = lerp(CY, UC.y, u);
    const r = lerp(R, UC.r, u);

    // 이전 장면 잔상: 숫자 링 / 중앙 텍스트 / 파티클 링 → 크리스프 원
    const fadeOut = 1 - smooth(span(t, start, 0.9));
    if (fadeOut > 0.01) {
      const tV = tl.cue('digits', 'never');
      const rot = 0.06 * Math.max(0, t - tV);
      ctx.save();
      ctx.font = `500 26px ${FONT.mono}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      for (let i = 0; i < RING_DIGITS; i++) {
        const rp = ringPt(CX, CY, RING_R + 70 * (1 - fadeOut), (i / RING_DIGITS) * TAU + rot);
        ctx.globalAlpha = 0.3 * fadeOut + (i % 7 === 0 ? 0.0 : 0);
        ctx.fillStyle = COL.ink;
        ctx.fillText(PI_DIGITS[5 + i] ?? '0', rp[0], rp[1]);
      }
      ctx.restore();
      text(ctx, 'π ≠ a ⁄ b', CX, CY + 8, { size: 92, font: FONT.serif, style: 'italic', weight: 600, alpha: fadeOut, glow: 16 });
    }
    const dotsA = 1 - smooth(u * 1.6);
    if (dotsA > 0.01) {
      const T = ensureText();
      const pts = fm.between([cx, cy], r, T.pts, [CX, 190], 0.42, 0, 0, 0);
      fm.draw(ctx, pts, rgbaArr(RGB.cyan, 1), 0.95 * dotsA);
    }
    glowStroke(ctx, ringPts(cx, cy, r, 360), { color: COL.cyan, width: 4, blur: 22 });

    // 축
    const axA = smooth(u);
    line(ctx, cx - r - 46, cy, cx + r + 46, cy, { color: COL.dim, width: 1.6, alpha: axA * 0.7 });
    line(ctx, cx, cy - r - 46, cx, cy + r + 46, { color: COL.dim, width: 1.6, alpha: axA * 0.7 });

    // 회전하는 점
    const th = theta(t);
    const px = cx + r * Math.cos(th);
    const py = cy - r * Math.sin(th);
    const spin = smooth(span(t, tTurn + 0.6, 0.8));
    if (spin > 0.01) {
      line(ctx, cx, cy, px, py, { color: COL.amber, width: 2.4, alpha: spin });
      // 각도 호
      const thm = th % TAU;
      if (thm > 0.02) {
        ctx.save();
        ctx.globalAlpha = spin * 0.8;
        ctx.strokeStyle = COL.amber;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(cx, cy, 44, -thm, 0);
        ctx.stroke();
        ctx.restore();
        text(ctx, 'θ', cx + 70 * Math.cos(thm / 2), cy - 70 * Math.sin(thm / 2), { size: 28, font: FONT.serif, style: 'italic', color: COL.amber, alpha: spin });
      }
      dot(ctx, px, py, 9, COL.amber, { glow: 30, alpha: spin });
    }

    // 파동
    const aEff = clamp(th - TAU, 0, 4 * Math.PI);
    if (t >= tTrace - 0.05 && aEff > 0) {
      const frac = aEff / (4 * Math.PI);
      // 기준선
      line(ctx, cx + r + 46, UC.y, WX1 + 30, UC.y, { color: COL.dim, width: 1.4, dash: [6, 8], alpha: 0.5 * smooth(frac * 8) });
      const hx = WX0 + aEff * WK;
      const hy = py;
      if (aEff < 4 * Math.PI - 0.001) line(ctx, px, py, hx, hy, { color: COL.amber, width: 1.8, dash: [5, 6], alpha: 0.85 });
      glowStroke(ctx, waveFull, { color: COL.cyan, width: 4, blur: 20, frac });
      dot(ctx, hx, UC.y - UC.r * Math.sin(aEff), 8, '#fff', { glow: 30, alpha: aEff < 4 * Math.PI - 0.001 ? 1 : 0 });
      // π 눈금
      for (let m = 0; m <= 4; m++) {
        const v = smooth(seg(aEff, m * Math.PI - 0.05, 0.3));
        if (v <= 0) continue;
        const x = WX0 + m * Math.PI * WK;
        line(ctx, x, UC.y - 9, x, UC.y + 9, { color: COL.ink, width: 2, alpha: v });
        text(ctx, m === 0 ? '0' : m === 1 ? 'π' : `${m}π`, x, UC.y + 40, { size: 28, font: FONT.serif, style: 'italic', color: m === 2 ? COL.amber : COL.ink, alpha: v * 0.9 });
      }
      // 한 주기 = 2π
      const pa = outBack(seg(aEff, TAU - 0.05, 0.9));
      if (pa > 0) {
        const xa = WX0;
        const xb = WX0 + TAU * WK;
        const yb = UC.y - UC.r - 52;
        line(ctx, xa, yb, xb, yb, { color: COL.amber, width: 2.5, alpha: clamp(pa) });
        line(ctx, xa, yb - 9, xa, yb + 9, { color: COL.amber, width: 2.5, alpha: clamp(pa) });
        line(ctx, xb, yb - 9, xb, yb + 9, { color: COL.amber, width: 2.5, alpha: clamp(pa) });
        text(ctx, '한 바퀴 = 2π', (xa + xb) / 2, yb - 30, { size: 30, color: COL.amber, alpha: clamp(pa) });
      }
      // 완성 후 흐르는 빛
      if (aEff >= 4 * Math.PI - 0.001) {
        const q = (t * 0.32) % 1;
        const a = q * 4 * Math.PI;
        dot(ctx, WX0 + a * WK, UC.y - UC.r * Math.sin(a), 8, '#fff', { glow: 34, alpha: 0.9 });
      }
    }

    // 세상의 리듬
    if (t >= tWorld) drawRows(ctx, t, tWorld, 1);
  }

  // ════════════════════════ 6. 회귀 ════════════════════════
  function outro(c) {
    const { ctx, t, end, ov } = c;
    const tB = c.cue('back');
    const tE = c.cue('end');
    const { theta, tTrace, tWorld } = wp;

    const leftA = 1 - smooth(span(t, tB, 0.9));
    const rowsA = 1 - smooth(span(t, tB, 0.7));

    // 왼쪽 단위원 + 회전점 (페이드)
    if (leftA > 0.01) {
      glowStroke(ctx, ringPts(UC.x, UC.y, UC.r, 360), { color: COL.cyan, width: 4, blur: 20, alpha: leftA });
      line(ctx, UC.x - UC.r - 46, UC.y, UC.x + UC.r + 46, UC.y, { color: COL.dim, width: 1.6, alpha: leftA * 0.7 });
      line(ctx, UC.x, UC.y - UC.r - 46, UC.x, UC.y + UC.r + 46, { color: COL.dim, width: 1.6, alpha: leftA * 0.7 });
      const th = theta(t);
      const px = UC.x + UC.r * Math.cos(th);
      const py = UC.y - UC.r * Math.sin(th);
      line(ctx, UC.x, UC.y, px, py, { color: COL.amber, width: 2.4, alpha: leftA });
      dot(ctx, px, py, 9, COL.amber, { glow: 30, alpha: leftA });
    }
    if (rowsA > 0.01) drawRows(ctx, t, tWorld, rowsA);

    // 파동 → 원 모핑
    const mu = inOutQuart(span(t, tB + 0.25, 2.2, tE - 0.15));
    const ring = ringPts(CX, CY, R, WAVE_N);
    const pts = lerpPts(waveFull, ring, mu);
    // 파동 눈금 라벨 페이드
    if (mu < 0.98) {
      for (let m = 0; m <= 4; m++) {
        const x = WX0 + m * Math.PI * WK;
        text(ctx, m === 0 ? '0' : m === 1 ? 'π' : `${m}π`, x, UC.y + 40, { size: 28, font: FONT.serif, style: 'italic', alpha: 0.9 * (1 - smooth(span(t, tB, 0.5))) });
      }
    }
    glowStroke(ctx, pts, { color: COL.cyan, width: 4, blur: 22 });
    void tTrace;

    // 원으로 돌아온 뒤: 눈금 + 궤도 위성
    const tk = span(t, tB + 2.2, 1.4, tE);
    if (tk > 0) drawCircle(ctx, { cx: CX, cy: CY, r: R, ticks: tk, alpha: 0 });

    if (t >= tE) {
      const tt = t - tE;
      for (let k = 0; k < 3; k++) {
        const sk = outExpo(span(t, tE + k * 0.25, 1.9));
        ctx.save();
        ctx.globalAlpha = (1 - sk) * 0.5;
        ctx.strokeStyle = k === 1 ? COL.cyan : COL.amber;
        ctx.lineWidth = 2.2;
        ctx.beginPath();
        ctx.arc(CX, CY, R + 30 + 330 * sk, 0, TAU);
        ctx.stroke();
        ctx.restore();
      }
      // 궤도 위성
      const sats = [
        { r: R + 62, w: 0.9, col: COL.amber },
        { r: R + 118, w: -0.6, col: COL.cyan },
        { r: R + 176, w: 0.42, col: COL.rose },
      ];
      sats.forEach((s, k) => {
        const a = smooth(span(t, tE + 0.5 + k * 0.25, 0.8));
        ctx.save();
        ctx.globalAlpha = a * 0.22;
        ctx.strokeStyle = COL.ink;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(CX, CY, s.r, 0, TAU);
        ctx.stroke();
        ctx.restore();
        const p = ringPt(CX, CY, s.r, tt * s.w + k * 2.1);
        dot(ctx, p[0], p[1], 6.5, s.col, { glow: 24, alpha: a });
      });
      ov.pi({ draw: outCubic(span(t, tE, 1.6)), fill: smooth(span(t, tE + 1.0, 0.9)), scale: 0.9 + 0.1 * outBack(span(t, tE, 1.3)), y: CY + 12 });
      ov.title({ text: '끝나지 않는 숫자', wipe: outCubic(span(t, tE + 0.9, 1.3)), opacity: 1 });

      // 흐르는 자릿수 (클리핑 마스크)
      const ta = smooth(span(t, tE + 1.6, 1.0));
      if (ta > 0.01) {
        ctx.save();
        ctx.beginPath();
        ctx.rect(300, 880, W - 600, 50);
        ctx.clip();
        const s = '3.' + PI_DIGITS.slice(0, 120);
        ctx.font = `500 28px ${FONT.mono}`;
        ctx.textBaseline = 'middle';
        ctx.textAlign = 'left';
        const off = (t - tE) * 46;
        const g = ctx.createLinearGradient(300, 0, W - 300, 0);
        g.addColorStop(0, 'rgba(243,239,228,0)');
        g.addColorStop(0.2, 'rgba(243,239,228,0.5)');
        g.addColorStop(0.8, 'rgba(243,239,228,0.5)');
        g.addColorStop(1, 'rgba(243,239,228,0)');
        ctx.fillStyle = g;
        ctx.globalAlpha = ta;
        ctx.fillText(s, 400 - off, 905);
        ctx.restore();
      }
    }
    void end;
  }

  const fns = [intro, diameter, ratio, archimedes, digits, wave, outro];

  return {
    prepare() {
      ensureText();
    },
    hue(t, i, start) {
      const prev = HUES[Math.max(0, i - 1)];
      return lerp(prev, HUES[i], smooth(span(t, start, 1.4)));
    },
    draw(i, c) {
      fns[i](c);
    },
  };
}

export { drawBackground, rng, H };
