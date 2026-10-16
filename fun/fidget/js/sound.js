// 효과음은 오디오 파일 없이 Web Audio API로 실시간 합성
const soundCode = {
  ctx: null,
  out: null,
  noiseBuf: null,
  muted: false,
  loop: null,

  init() {
    try { this.muted = localStorage.getItem('fun-muted') === '1'; } catch (e) {}
    this.bindEvents();
    this.renderToggle();
  },

  bindEvents() {
    const unlock = () => this.unlock();
    commonCode.on(document, 'pointerdown.sound', unlock);
    commonCode.on(document, 'touchend.sound', unlock);
    commonCode.on(document, 'keydown.sound', unlock);
    commonCode.on(document.querySelector('.play__btn--sound'), 'click.sound', () => this.toggle());
    commonCode.on(document, 'visibilitychange.sound', () => {
      if (!this.ctx) return;
      if (document.hidden) this.ctx.suspend();
      else this.ctx.resume();
    });
  },

  // 브라우저 정책상 사용자 터치/클릭 안에서 오디오를 열어야 함
  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      // iOS 무음 스위치가 켜져 있어도 소리 나게 (Safari 17+)
      try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch (e) {}
      this.ctx = new AC();
      const comp = this.ctx.createDynamicsCompressor();
      comp.threshold.value = -14;
      comp.knee.value = 10;
      comp.ratio.value = 6;
      comp.attack.value = 0.002;
      comp.release.value = 0.15;
      this.out = this.ctx.createGain();
      this.out.gain.value = 0.9;
      this.out.connect(comp);
      comp.connect(this.ctx.destination);
      this.noiseBuf = this.makeNoise(2);
    }
    if (this.ctx.state === 'suspended' && !document.hidden) this.ctx.resume();
  },

  ok() {
    if (this.muted) return false;
    this.unlock();
    return !!this.ctx;
  },

  makeNoise(sec) {
    const c = this.ctx;
    const len = Math.floor(c.sampleRate * sec);
    const buf = c.createBuffer(1, len, c.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    return buf;
  },

  toggle() {
    this.muted = !this.muted;
    try { localStorage.setItem('fun-muted', this.muted ? '1' : '0'); } catch (e) {}
    if (this.muted) this.stretchStop();
    this.renderToggle();
  },

  renderToggle() {
    const btn = document.querySelector('.play__btn--sound');
    if (!btn) return;
    btn.textContent = this.muted ? '🔇' : '🔊';
    btn.setAttribute('aria-label', this.muted ? '소리 켜기' : '소리 끄기');
  },

  // ===== 기본 재료 =====
  // 필터 걸린 노이즈 한 조각
  noise({ at = 0, dur = 0.05, type = 'bandpass', freq = 1000, freqEnd = 0, q = 1, gain = 0.5, attack = 0.001 }) {
    const c = this.ctx;
    const t = c.currentTime + at;
    const src = c.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = c.createBiquadFilter();
    f.type = type;
    f.Q.value = q;
    f.frequency.setValueAtTime(freq, t);
    if (freqEnd) f.frequency.exponentialRampToValueAtTime(freqEnd, t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + Math.min(attack, dur * 0.5));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f);
    f.connect(g);
    g.connect(this.out);
    src.start(t, Math.random() * (this.noiseBuf.duration - dur - 0.1));
    src.stop(t + dur + 0.02);
  },

  // 음정 있는 짧은 소리
  tone({ at = 0, dur = 0.05, freq = 440, freqEnd = 0, type = 'sine', gain = 0.3, attack = 0.002 }) {
    const c = this.ctx;
    const t = c.currentTime + at;
    const osc = c.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (freqEnd) osc.frequency.exponentialRampToValueAtTime(freqEnd, t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + Math.min(attack, dur * 0.5));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g);
    g.connect(this.out);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  },

  // ===== 왁뿌볼 =====
  // 왁스 깨지는 바삭바삭 (power 0~1, 클수록 많이/길게 부서짐)
  crunch(power = 0.5) {
    if (!this.ok()) return;
    const r = commonCode.rand;
    this.noise({ dur: 0.014, type: 'highpass', freq: 2500, q: 0.7, gain: 0.7 + power * 0.3 });
    this.noise({ dur: 0.06 + power * 0.05, type: 'bandpass', freq: r(700, 1300), q: 1.1, gain: 0.35 + power * 0.4, attack: 0.002 });
    const n = Math.round(6 + power * 16);
    const spread = 0.04 + power * 0.16;
    for (let i = 0; i < n; i++) {
      const at = Math.pow(Math.random(), 1.7) * spread;
      this.noise({ at, dur: r(0.005, 0.02), type: 'bandpass', freq: r(1800, 8000), q: r(0.8, 2.5), gain: r(0.2, 0.75) * (1 - at / spread * 0.6) });
    }
  },

  // 떨어진 조각이 바닥에 닿는 소리
  tick() {
    if (!this.ok()) return;
    const r = commonCode.rand;
    this.noise({ dur: 0.012, type: 'bandpass', freq: r(3000, 6000), q: 3, gain: r(0.12, 0.25) });
    this.tone({ dur: 0.03, freq: r(2500, 4500), type: 'triangle', gain: 0.04 });
  },

  // 말랑이 누를 때 사각사각 (샤베트/슬러시 알갱이가 눌려 부서지는 느낌)
  // 아주 짧은 고음 알갱이 수십 개를 앞쪽에 몰아서 뿌리고, 밑에 부드러운 '슥' 바디를 깔아줌
  sherbet(strength = 1, dur = 0.35, at = 0) {
    if (!this.ok()) return;
    const r = commonCode.rand;
    const s = strength;
    this.noise({ at, dur: dur * 1.1, type: 'lowpass', freq: 1100, freqEnd: 450, q: 0.7, gain: 0.14 * s, attack: Math.min(0.05, dur * 0.2) });
    const n = Math.round(45 * s * (dur / 0.35));
    for (let i = 0; i < n; i++) {
      const t = at + Math.pow(Math.random(), 1.4) * dur;
      const fade = 1 - (t - at) / dur * 0.6;
      this.noise({ at: t, dur: r(0.004, 0.011), type: 'bandpass', freq: r(2500, 7500), q: r(1, 3), gain: r(0.07, 0.2) * s * fade });
    }
    // 조금 굵은 알갱이
    for (let i = 0; i < Math.round(8 * s); i++) {
      this.noise({ at: at + Math.random() * dur * 0.8, dur: r(0.008, 0.016), type: 'bandpass', freq: r(1000, 2200), q: 2, gain: r(0.06, 0.13) * s });
    }
  },

  // 왁뿌가 다 깨지고 말랑이가 됐을 때: 꾸욱 사각사각 → 다시 부풀며 사각
  mallang() {
    if (!this.ok()) return;
    this.sherbet(1.4, 0.5);
    this.sherbet(0.7, 0.3, 0.55);
  },

  // ===== 뽁뽁이 =====
  pop(at = 0) {
    if (!this.ok()) return;
    const r = commonCode.rand;
    const p = r(0.82, 1.2);
    this.noise({ at, dur: 0.006, type: 'highpass', freq: 1500, q: 0.7, gain: 0.9 });
    this.noise({ at, dur: r(0.04, 0.07), type: 'bandpass', freq: 2400 * p, freqEnd: 700 * p, q: 1.3, gain: 0.85 });
    this.tone({ at, dur: 0.07, freq: 240 * p, freqEnd: 60, gain: 0.55 });
  },

  swoosh() {
    if (!this.ok()) return;
    this.noise({ dur: 0.45, type: 'bandpass', freq: 300, freqEnd: 2600, q: 0.8, gain: 0.3, attack: 0.18 });
  },

  // ===== 슬라임 =====
  // 쫩: 끈적한 표면이 붙었다 떨어지는 짧은 스맥. 공진 있는 중음이 아래로 떨어지면서 묵직한 저음이 받쳐줌
  // 물소리처럼 들리는 '뽀록'(위로 올라가는 사인파)은 일부러 안 씀
  chew(strength = 1, at = 0) {
    if (!this.ok()) return;
    const r = commonCode.rand;
    const s = strength;
    const f = r(650, 1000);
    this.noise({ at, dur: 0.006, type: 'highpass', freq: 1800, q: 0.7, gain: 0.3 * s });
    this.noise({ at, dur: r(0.05, 0.08), type: 'bandpass', freq: f, freqEnd: f * 0.55, q: 4, gain: 0.6 * s, attack: 0.004 });
    this.noise({ at, dur: 0.07, type: 'lowpass', freq: 380, q: 1, gain: 0.35 * s, attack: 0.005 });
    // 쫩쫩: 가끔 한 번 더 들러붙었다 떨어짐
    if (Math.random() < 0.6) {
      const at2 = at + r(0.025, 0.045);
      this.noise({ at: at2, dur: 0.04, type: 'bandpass', freq: r(900, 1300), freqEnd: 600, q: 5, gain: 0.35 * s, attack: 0.003 });
    }
  },

  // 쩍: 손가락이 떨어질 때
  unstick(strength = 0.7, at = 0) {
    if (!this.ok()) return;
    const s = strength;
    this.noise({ at, dur: 0.004, type: 'highpass', freq: 3000, q: 0.7, gain: 0.3 * s });
    this.noise({ at, dur: 0.035, type: 'bandpass', freq: 1300, freqEnd: 2300, q: 3, gain: 0.5 * s, attack: 0.002 });
    this.noise({ at, dur: 0.05, type: 'lowpass', freq: 260, q: 1, gain: 0.3 * s, attack: 0.003 });
  },

  // 딸깍: 속에 갇힌 공기가 터지는 클리키 소리
  click(at = 0) {
    if (!this.ok()) return;
    const r = commonCode.rand;
    this.noise({ at, dur: 0.012, type: 'bandpass', freq: r(1800, 3200), q: 6, gain: r(0.25, 0.5) });
    this.noise({ at, dur: 0.003, type: 'highpass', freq: 4000, q: 0.7, gain: 0.2 });
  },

  // 바풍 부풀 때 얇게 늘어나는 막이 끼익끼익 (t: 0~1 부푼 정도)
  creak(t = 0) {
    if (!this.ok()) return;
    const r = commonCode.rand;
    this.noise({ dur: 0.05, type: 'bandpass', freq: 450 + t * 900 + r(-60, 60), q: 8, gain: 0.16 + t * 0.08, attack: 0.01 });
    if (Math.random() < 0.35) this.click(r(0, 0.03));
  },

  // 쭈우우욱: 끈적하게 늘어나는 동안 이어지는 부드러운 소리 (뚝뚝 끊기는 소리 대신 하나로 길게)
  // 공진 있는 밴드패스 노이즈 + 아주 작은 '찌익' 알갱이 질감, 많이 늘어날수록 음이 살짝 올라감
  stretchStart() {
    if (!this.ok() || this.loop) return;
    const c = this.ctx;
    const src = c.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const bp = c.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 420;
    bp.Q.value = 2.5;
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 1600;
    lp.Q.value = 0.7;
    const g = c.createGain();
    g.gain.value = 0.0001;
    src.connect(bp);
    bp.connect(lp);
    lp.connect(g);
    g.connect(this.out);
    src.start();
    this.loop = { src, bp, g, grain: 0 };
  },

  stretchUpdate(speed, tension) {
    if (!this.loop) return;
    const t = this.ctx.currentTime;
    const s = commonCode.clamp(speed / 900, 0, 1);
    this.loop.g.gain.setTargetAtTime(s * 0.38, t, 0.09);
    this.loop.bp.frequency.setTargetAtTime(380 + tension * 650 + s * 200, t, 0.15);
    // 표면이 끈적하게 떨어지는 아주 작은 질감 (작고 부드러워서 '다다닥'으로 안 들리게)
    if (Math.random() < s * 0.5) {
      this.noise({ dur: commonCode.rand(0.006, 0.014), type: 'bandpass', freq: commonCode.rand(900, 1800), q: 3, gain: 0.05 + s * 0.05 });
    }
    // 가끔 공기 딸깍
    if (Math.random() < s * 0.015) this.click();
  },

  stretchStop() {
    if (!this.loop) return;
    const { src, g } = this.loop;
    const t = this.ctx.currentTime;
    g.gain.cancelScheduledValues(t);
    g.gain.setTargetAtTime(0.0001, t, 0.06);
    src.stop(t + 0.4);
    this.loop = null;
  },

  // 바풍 팡!
  balloonPop(size = 1) {
    if (!this.ok()) return;
    const r = commonCode.rand;
    const s = 0.6 + size * 0.4;
    this.noise({ dur: 0.008, type: 'highpass', freq: 600, q: 0.7, gain: 1 });
    this.noise({ dur: 0.12, type: 'bandpass', freq: 1700 / s, freqEnd: 500, q: 0.9, gain: 0.9 * s, attack: 0.001 });
    this.tone({ dur: 0.14, freq: 150 / s, freqEnd: 45, gain: 0.7 * s });
    // 터진 막이 철썩 내려앉음
    this.chew(0.6, r(0.05, 0.08));
    for (let i = 0; i < 3; i++) this.click(r(0.06, 0.25));
  }
};

document.addEventListener('DOMContentLoaded', () => { soundCode.init(); });
