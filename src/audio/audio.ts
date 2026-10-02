/**
 * Synthesised sound: no asset files. Everything routes through two gain buses
 * (sfx, music) so the settings sliders apply instantly.
 */
export class Audio {
  private ctx: AudioContext | null = null;
  private sfx!: GainNode;
  private music!: GainNode;
  private noise!: AudioBuffer;
  private musicTimer: number | null = null;
  private nextNoteAt = 0;
  private step = 0;
  private sfxVolume = 0.8;
  private musicVolume = 0.35;

  /** Must be called from a user gesture before sound can play. */
  unlock() {
    if (this.ctx) { if (this.ctx.state === 'suspended') void this.ctx.resume(); return; }
    const Ctor = window.AudioContext || (window as any).webkitAudioContext;
    if (!Ctor) return;
    this.ctx = new Ctor();
    const master = this.ctx.createDynamicsCompressor();
    master.connect(this.ctx.destination);
    this.sfx = this.ctx.createGain();
    this.music = this.ctx.createGain();
    this.sfx.connect(master);
    this.music.connect(master);
    this.setVolumes(this.sfxVolume, this.musicVolume);
    this.noise = this.ctx.createBuffer(1, this.ctx.sampleRate, this.ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }

  setVolumes(sfx: number, music: number) {
    this.sfxVolume = sfx;
    this.musicVolume = music;
    if (!this.ctx) return;
    this.sfx.gain.value = sfx;
    this.music.gain.value = music * 0.5;
  }

  private tone(freq: number, dur: number, type: OscillatorType, vol: number, at = 0, bus: GainNode = this.sfx, glide?: number) {
    const ctx = this.ctx!;
    const t = ctx.currentTime + at;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (glide) o.frequency.exponentialRampToValueAtTime(glide, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(bus);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  private noiseBurst(dur: number, vol: number, from: number, to: number, q = 1) {
    const ctx = this.ctx!;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.Q.value = q;
    f.frequency.setValueAtTime(from, t);
    f.frequency.exponentialRampToValueAtTime(to, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + dur * 0.3);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(this.sfx);
    src.start(t);
    src.stop(t + dur + 0.02);
  }

  /**
   * Retro coin pickup for a merge: two square-wave notes (B5 → E6) with a hard gate,
   * like an 8-bit console. Bigger values and longer chains climb a semitone each (capped).
   */
  coin(tier: number, chainPos: number | null) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const semis = Math.min(12, tier) + Math.min(7, Math.max(0, (chainPos ?? 1) - 1));
    const k = Math.pow(2, semis / 12);
    const t = ctx.currentTime;
    const note = (freq: number, start: number, hold: number, decay: number, vol: number) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'square';
      o.frequency.setValueAtTime(freq, t + start);
      g.gain.setValueAtTime(0, t);
      g.gain.setValueAtTime(vol, t + start);
      g.gain.setValueAtTime(vol, t + start + hold);
      g.gain.linearRampToValueAtTime(0, t + start + hold + decay);
      o.connect(g).connect(this.sfx);
      o.start(t + start);
      o.stop(t + start + hold + decay + 0.02);
    };
    note(987.77 * k, 0, 0.06, 0.01, 0.11);
    note(1318.51 * k, 0.065, 0.05, 0.3, 0.11);
  }

  ping() {
    if (!this.ctx) return;
    this.tone(1318.5, 0.35, 'sine', 0.22);
    this.tone(1760, 0.45, 'sine', 0.16, 0.09);
  }

  thud() {
    if (!this.ctx) return;
    this.tone(120, 0.12, 'sine', 0.45, 0, this.sfx, 60);
    this.noiseBurst(0.06, 0.12, 400, 200, 0.7);
  }

  /** A single sad kazoo note. */
  kazoo() {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(330, t);
    o.frequency.linearRampToValueAtTime(300, t + 0.5);
    o.frequency.linearRampToValueAtTime(220, t + 0.9);
    const lfo = ctx.createOscillator();
    const lfoGain = ctx.createGain();
    lfo.frequency.value = 6;
    lfoGain.gain.value = 7;
    lfo.connect(lfoGain).connect(o.frequency);
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 1100;
    f.Q.value = 2.5;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.4, t + 0.05);
    g.gain.setValueAtTime(0.4, t + 0.75);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.0);
    o.connect(f).connect(g).connect(this.sfx);
    o.start(t); lfo.start(t);
    o.stop(t + 1.05); lfo.stop(t + 1.05);
  }

  /** Little win jingle. */
  fanfare() {
    if (!this.ctx) return;
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => this.tone(f, 0.3, 'triangle', 0.22, i * 0.09));
  }

  /** Quiet hold music: a looping I–vi–IV–V arpeggio. */
  startMusic() {
    if (!this.ctx || this.musicTimer !== null) return;
    const chords = [[261.63, 329.63, 392], [220, 261.63, 329.63], [174.61, 220, 261.63], [196, 246.94, 293.66]];
    const beat = 60 / 84 / 2;
    this.nextNoteAt = this.ctx.currentTime + 0.1;
    const schedule = () => {
      const ctx = this.ctx!;
      while (this.nextNoteAt < ctx.currentTime + 0.3) {
        const chord = chords[Math.floor(this.step / 8) % 4];
        const pattern = [0, 1, 2, 1, 0, 2, 1, 2];
        const f = chord[pattern[this.step % 8]];
        this.tone(f, beat * 1.8, 'sine', 0.12, this.nextNoteAt - ctx.currentTime, this.music);
        if (this.step % 8 === 0) this.tone(chord[0] / 2, beat * 7, 'triangle', 0.08, this.nextNoteAt - ctx.currentTime, this.music);
        this.nextNoteAt += beat;
        this.step++;
      }
    };
    this.musicTimer = window.setInterval(schedule, 100);
    schedule();
  }

  stopMusic() {
    if (this.musicTimer !== null) window.clearInterval(this.musicTimer);
    this.musicTimer = null;
  }
}
