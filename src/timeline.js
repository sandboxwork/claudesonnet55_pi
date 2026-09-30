// manifest → 조회용 타임라인. 장면 경계와 큐(cue)는 모두 "오디오 기준 전역 초" 입니다.
export class Timeline {
  constructor(manifest) {
    this.manifest = manifest;
    this.scenes = manifest.scenes;
    this.duration = manifest.duration;
    this.byId = Object.fromEntries(this.scenes.map((s, i) => [s.id, { ...s, index: i }]));
  }

  indexAt(t) {
    const s = this.scenes;
    for (let i = s.length - 1; i >= 0; i--) if (t >= s[i].start) return i;
    return 0;
  }

  scene(id) {
    return this.byId[id];
  }

  /** 큐 시각. 없으면 장면 시작 시각으로 대체 */
  cue(id, name) {
    const s = this.byId[id];
    if (!s) return 0;
    return s.cues?.[name] ?? s.start;
  }

  /** t 시점의 자막 문장 + 활성 단어 */
  captionAt(t) {
    const sc = this.scenes[this.indexAt(t)];
    if (!sc) return null;
    for (const s of sc.sentences) {
      if (t >= s.start - 0.05 && t < s.end + 0.35) {
        const words = sc.words.filter((w) => w.start >= s.start - 0.02 && w.end <= s.end + 0.25);
        return { sentence: s, words };
      }
    }
    return null;
  }
}
