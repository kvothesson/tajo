import type { SfxEvent } from '../sim/types';

/** Everything you hear is synthesised at runtime. No audio files ship with this game. */
export class Sound {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private musicBus!: GainNode;
  private sfxBus!: GainNode;
  private noiseBuf!: AudioBuffer;

  private nextNote = 0;
  private step = 0;
  muted = false;

  /** Must be called from a user gesture. */
  init(): void {
    if (this.ctx) {
      void this.ctx.resume();
      return;
    }
    const Ctor: typeof AudioContext =
      window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctor();
    this.ctx = ctx;

    this.master = ctx.createGain();
    this.master.gain.value = 0.85;
    this.master.connect(ctx.destination);

    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16;
    comp.ratio.value = 8;
    comp.attack.value = 0.003;
    comp.release.value = 0.14;
    comp.connect(this.master);

    this.sfxBus = ctx.createGain();
    this.sfxBus.gain.value = 0.6;
    this.sfxBus.connect(comp);

    this.musicBus = ctx.createGain();
    this.musicBus.gain.value = 0.0;
    this.musicBus.connect(comp);

    const len = ctx.sampleRate * 1;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.noiseBuf = buf;

    this.nextNote = ctx.currentTime;
  }

  get ready(): boolean {
    return this.ctx !== null && this.ctx.state === 'running';
  }

  toggleMute(): void {
    this.muted = !this.muted;
    if (this.ctx) this.master.gain.value = this.muted ? 0 : 0.85;
  }

  // -------------------------------------------------------------- primitives

  private tone(
    type: OscillatorType,
    f0: number,
    f1: number,
    dur: number,
    gain: number,
    delay = 0,
  ): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime + delay;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.sfxBus);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  private noise(dur: number, gain: number, f0: number, f1: number, q = 1, delay = 0): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime + delay;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.Q.value = q;
    f.frequency.setValueAtTime(f0, t);
    f.frequency.exponentialRampToValueAtTime(Math.max(40, f1), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(this.sfxBus);
    src.start(t);
    src.stop(t + dur + 0.02);
  }

  // -------------------------------------------------------------- events

  play(ev: SfxEvent): void {
    if (!this.ctx) return;
    switch (ev.t) {
      case 'dash':
        this.noise(0.16, 0.45, 3200, 380, 1.6);
        this.tone('triangle', 620, 190, 0.1, 0.12);
        break;
      case 'kill': {
        const n = Math.min(ev.combo, 16);
        const f = 330 * Math.pow(2, n / 12);
        this.tone('square', f, f * 0.72, 0.075, 0.16);
        this.noise(0.07, 0.22, 2600, 900, 2);
        break;
      }
      case 'block':
        this.tone('sawtooth', 180, 130, 0.16, 0.18);
        this.noise(0.12, 0.3, 900, 300, 3);
        break;
      case 'hurt':
        this.tone('sawtooth', 150, 48, 0.4, 0.3);
        this.noise(0.3, 0.28, 700, 120, 0.8);
        break;
      case 'boom':
        this.noise(0.5, 0.5, 900, 60, 0.5);
        this.tone('sine', 120, 34, 0.45, 0.35);
        break;
      case 'shoot':
        this.tone('triangle', 400, 260, 0.09, 0.075);
        break;
      case 'wave':
        this.tone('square', 300, 300, 0.09, 0.1);
        this.tone('square', 450, 450, 0.13, 0.1, 0.11);
        break;
      case 'pickup':
        [0, 4, 7, 12].forEach((s, i) =>
          this.tone('sine', 440 * Math.pow(2, s / 12), 440 * Math.pow(2, s / 12), 0.12, 0.14, i * 0.05),
        );
        break;
      case 'overclock':
        [0, 5, 9, 14, 19].forEach((s, i) =>
          this.tone('square', 330 * Math.pow(2, s / 12), 330 * Math.pow(2, s / 12), 0.14, 0.12, i * 0.045),
        );
        break;
      case 'choose':
        this.tone('sine', 520, 780, 0.18, 0.16);
        break;
      case 'dead':
        this.tone('sawtooth', 220, 30, 1.3, 0.32);
        this.noise(1.1, 0.3, 1400, 60, 0.6);
        break;
      case 'start':
        this.tone('square', 220, 440, 0.16, 0.14);
        this.tone('square', 440, 660, 0.2, 0.12, 0.14);
        break;
    }
  }

  // -------------------------------------------------------------- music

  /** Call once per animation frame. Schedules a lookahead of pulse-driven bass. */
  tick(dt: number, playing: boolean, wave: number, danger: number): void {
    const ctx = this.ctx;
    if (!ctx) return;

    const target = playing ? 0.5 : 0.14;
    this.musicBus.gain.value += (target - this.musicBus.gain.value) * Math.min(1, dt * 2);

    const bpm = 96 + Math.min(wave, 18) * 4 + danger * 18;
    const spb = 60 / bpm / 2; // eighth notes

    const lookahead = ctx.currentTime + 0.12;
    let guard = 0;
    while (this.nextNote < lookahead && guard++ < 32) {
      this.scheduleStep(this.nextNote, wave);
      this.nextNote += spb;
      this.step = (this.step + 1) % 16;
    }
    if (this.nextNote < ctx.currentTime) this.nextNote = ctx.currentTime;
  }

  private scheduleStep(t: number, wave: number): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const s = this.step;

    // Kick on 0 and 6 and 10
    if (s === 0 || s === 6 || s === 10) {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(120, t);
      o.frequency.exponentialRampToValueAtTime(42, t + 0.11);
      g.gain.setValueAtTime(0.6, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
      o.connect(g).connect(this.musicBus);
      o.start(t);
      o.stop(t + 0.18);
    }

    // Bass pattern, minor, transposed slowly by wave
    const root = 55 * Math.pow(2, (wave % 4) / 12);
    const pat = [0, 0, 7, 0, 3, 0, 10, 0, 0, 0, 7, 5, 3, 0, 10, 12];
    if (s % 2 === 0 || s === 11) {
      const semi = pat[s]!;
      const o = ctx.createOscillator();
      const f = ctx.createBiquadFilter();
      const g = ctx.createGain();
      o.type = 'sawtooth';
      o.frequency.value = root * Math.pow(2, semi / 12);
      f.type = 'lowpass';
      f.frequency.setValueAtTime(340 + Math.min(wave, 15) * 40, t);
      f.Q.value = 6;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.16, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.19);
      o.connect(f).connect(g).connect(this.musicBus);
      o.start(t);
      o.stop(t + 0.22);
    }

    // Hat
    if (s % 2 === 1) {
      const src = ctx.createBufferSource();
      src.buffer = this.noiseBuf;
      const f = ctx.createBiquadFilter();
      f.type = 'highpass';
      f.frequency.value = 7000;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.06, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.045);
      src.connect(f).connect(g).connect(this.musicBus);
      src.start(t);
      src.stop(t + 0.06);
    }
  }
}
