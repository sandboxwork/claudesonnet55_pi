// 캔버스 + SVG 오버레이 렌더러.  render(t) 는 t 만의 함수 — 이전 프레임 상태에 의존하지 않습니다.
import { W, H, drawBackground } from './kit.js';
import { createScenes } from './scenes.js';
import { createOverlay } from './overlay.js';
import { span, smooth } from './ease.js';

export function createRenderer({ canvas, svg, timeline }) {
  const ctx = canvas.getContext('2d', { alpha: false });
  const scenes = createScenes(timeline);
  const ov = createOverlay(svg);
  let scale = 1;

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const cw = canvas.clientWidth || W;
    const w = Math.max(320, Math.round(cw * dpr));
    const h = Math.round((w * H) / W);
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    scale = canvas.width / W;
  }

  function render(t) {
    const tl = timeline;
    const i = tl.indexAt(t);
    const sc = tl.scenes[i];
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.shadowBlur = 0;
    ctx.setLineDash([]);

    drawBackground(ctx, t, scenes.hue(t, i, sc.start));

    ov.begin();
    scenes.draw(i, {
      ctx,
      t,
      i,
      sc,
      start: sc.start,
      end: sc.end,
      ov,
      cue: (n) => sc.cues[n] ?? sc.start,
    });

    // 챕터 타이틀 (마스크 라이즈)
    const lt = t - sc.start;
    ov.chapter({
      num: `${String(i + 1).padStart(2, '0')} / ${String(tl.scenes.length).padStart(2, '0')}`,
      word: sc.chapter,
      rise: span(lt, 0.25, 0.9),
      opacity: 1 - smooth(span(lt, 3.6, 0.6)),
    });
    ov.end();
  }

  return {
    render,
    resize,
    prepare: () => scenes.prepare(),
  };
}
