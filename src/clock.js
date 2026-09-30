/**
 * 마스터 클록
 *
 *  - AudioClock   : <audio>.currentTime 이 유일한 시간 원천 (master timeline)
 *  - VirtualClock : 음성이 없을 때(무음 모드/오류 폴백)만 사용하는 동일 인터페이스의 대체 시계
 *
 * 모든 애니메이션은 clock.time() 을 받아 render(t) 로 그려지므로 setTimeout / CSS duration 을 쓰지 않습니다.
 * 재생·일시정지·seek·replay 어느 경우에도 화면은 같은 t 에 대해 항상 같은 프레임을 그립니다.
 */

export class AudioClock {
  constructor(audio, duration) {
    this.kind = 'audio';
    this.audio = audio;
    this.duration = duration;
    // 재생 중 currentTime 이 갱신되는 단위(수~수십 ms)로 인한 프레임 떨림을 줄이기 위한 보간용 앵커.
    // 앵커는 항상 audio.currentTime 으로 재설정되므로 오디오가 여전히 master 입니다.
    this._a = { t: 0, p: performance.now() };
    this._last = 0;
  }

  get paused() {
    return this.audio.paused;
  }
  get ended() {
    return this.audio.ended || this.audio.currentTime >= this.duration - 0.02;
  }

  time() {
    const a = this.audio;
    const cur = a.currentTime;
    const now = performance.now();
    let out;
    if (a.paused || a.seeking || a.readyState < 3) {
      this._a.t = cur;
      this._a.p = now;
      out = cur;
      this._last = out;
    } else {
      if (cur !== this._a.t) {
        this._a.t = cur;
        this._a.p = now;
      }
      // 마지막 갱신 이후 경과 시간만큼 보간 (최대 60ms, 재생속도 반영)
      const dt = Math.min(0.06, ((now - this._a.p) / 1000) * a.playbackRate);
      out = cur + dt;
      // 재생 중 미세한 역행(보간 과다분)은 막고, 큰 차이(seek/루프)는 그대로 따라감
      if (out < this._last && this._last - out < 0.1) out = this._last;
      this._last = out;
    }
    return Math.min(out, this.duration);
  }

  async play() {
    if (this.ended) this.seek(0);
    await this.audio.play();
  }
  pause() {
    this.audio.pause();
  }
  seek(t) {
    const v = Math.max(0, Math.min(this.duration, t));
    this.audio.currentTime = v;
    this._a.t = v;
    this._a.p = performance.now();
    this._last = v;
  }
  destroy() {}
}

export class VirtualClock {
  constructor(duration) {
    this.kind = 'virtual';
    this.duration = duration;
    this._base = 0; // 정지 시점의 t
    this._start = 0; // 재생 시작 시각(performance.now)
    this._playing = false;
  }
  get paused() {
    return !this._playing;
  }
  get ended() {
    return this.time() >= this.duration - 0.02;
  }
  time() {
    if (!this._playing) return this._base;
    const t = this._base + (performance.now() - this._start) / 1000;
    if (t >= this.duration) {
      this._playing = false;
      this._base = this.duration;
      return this.duration;
    }
    return t;
  }
  async play() {
    if (this.ended) this._base = 0;
    if (this._playing) return;
    this._start = performance.now();
    this._playing = true;
  }
  pause() {
    this._base = this.time();
    this._playing = false;
  }
  seek(t) {
    this._base = Math.max(0, Math.min(this.duration, t));
    this._start = performance.now();
  }
  destroy() {}
}
