// SVG 오버레이 제어 — 마스크/클립/스트로크 드로잉으로 타이포그래피 연출
// 매 프레임 begin() → 장면이 pi/formula/chapter/title 설정 → end() 에서 DOM 반영(변경된 값만 기록)
import { clamp } from './ease.js';

export function createOverlay(svg) {
  const $ = (id) => svg.querySelector('#' + id);
  const el = {
    pi: $('pi'),
    formula: $('formula'),
    fRect: $('fRect'),
    chNum: $('chNum'),
    chWord: $('chWord'),
    title: $('title'),
    tRect: $('tRect'),
  };
  const cache = new Map();
  const set = (node, name, val) => {
    const key = node.id + '|' + name;
    if (cache.get(key) === val) return;
    cache.set(key, val);
    if (name === 'text') node.textContent = val;
    else node.setAttribute(name, val);
  };

  let s = {};
  const api = {
    begin() {
      s = { pi: null, formula: null, chapter: null, title: null };
    },
    /** π 글리프: draw(외곽선 드로잉) → fill(채움) */
    pi(o) {
      s.pi = o;
    },
    /** 수식 한 줄: text, wipe(0..1), opacity */
    formula(o) {
      s.formula = o;
    },
    /** 챕터 타이틀: num, word, rise(0..1), opacity */
    chapter(o) {
      s.chapter = o;
    },
    /** 하단 타이틀: text, wipe */
    title(o) {
      s.title = o;
    },
    end() {
      // π
      if (s.pi) {
        const { draw = 1, fill = 1, opacity = 1, scale = 1, x = 960, y = 500 } = s.pi;
        set(el.pi, 'style', `font-family:'Cormorant Garamond','Noto Serif KR','Times New Roman',Georgia,serif;opacity:${opacity.toFixed(3)}`);
        set(el.pi, 'stroke-dashoffset', ((1 - clamp(draw)) * 2600).toFixed(1));
        set(el.pi, 'fill-opacity', clamp(fill).toFixed(3));
        set(el.pi, 'transform', `translate(${x} ${y}) scale(${scale.toFixed(4)}) translate(${-x} ${-y})`);
        set(el.pi, 'x', x);
        set(el.pi, 'y', y);
      } else {
        set(el.pi, 'style', "font-family:'Cormorant Garamond','Noto Serif KR','Times New Roman',Georgia,serif;opacity:0");
      }
      // 수식
      if (s.formula) {
        const { text = '', wipe = 1, opacity = 1, size = 108 } = s.formula;
        set(el.formula, 'text', text);
        set(el.formula, 'font-size', size);
        set(el.formula, 'opacity', opacity.toFixed(3));
        set(el.fRect, 'width', (1400 * (0.2 + 0.8 * clamp(wipe))).toFixed(1));
      } else {
        set(el.formula, 'opacity', 0);
        set(el.fRect, 'width', 0);
      }
      // 챕터
      if (s.chapter) {
        const { num = '', word = '', rise = 1, opacity = 1 } = s.chapter;
        const e = 1 - (1 - clamp(rise)) ** 3;
        set(el.chNum, 'text', num);
        set(el.chWord, 'text', word);
        set(el.chNum, 'opacity', (opacity * e).toFixed(3));
        set(el.chWord, 'opacity', opacity.toFixed(3));
        set(el.chNum, 'y', (90 + (1 - e) * 60).toFixed(1));
        set(el.chWord, 'y', (204 + (1 - e) * 130).toFixed(1));
      } else {
        set(el.chNum, 'opacity', 0);
        set(el.chWord, 'opacity', 0);
      }
      // 타이틀
      if (s.title) {
        const { text = '', wipe = 1, opacity = 1 } = s.title;
        set(el.title, 'text', text);
        set(el.title, 'opacity', opacity.toFixed(3));
        set(el.tRect, 'width', (1120 * (0.2 + 0.8 * clamp(wipe))).toFixed(1));
      } else {
        set(el.title, 'opacity', 0);
        set(el.tRect, 'width', 0);
      }
    },
  };
  return api;
}
