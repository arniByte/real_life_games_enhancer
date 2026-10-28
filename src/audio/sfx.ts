// Everything you hear is synthesized with WebAudio: UI blips, darts thuds, the wheel's
// ratchet, fanfares, and a slow eerie drone per world. No audio files.

import type { SceneId } from '../three/fx';

type Wave = OscillatorType;

interface ToneOpts {
  freq: number;
  type?: Wave;
  dur?: number;
  attack?: number;
  gain?: number;
  slideTo?: number;
  delay?: number;
  reverb?: number;
  detune?: number;
}

const DRONES: Record<SceneId, { root: number; scale: number[]; color: number }> = {
  hub: { root: 55, scale: [0, 3, 7, 10, 14, 15], color: 600 },
  chess: { root: 49, scale: [0, 1, 5, 7, 8, 12], color: 500 },
  darts: { root: 65.4, scale: [0, 2, 3, 7, 9, 12], color: 800 },
  durak: { root: 58.3, scale: [0, 3, 5, 6, 7, 10], color: 520 },
  pingpong: { root: 61.7, scale: [0, 2, 5, 7, 10, 12], color: 900 },
  universal: { root: 51.9, scale: [0, 4, 7, 11, 14, 18], color: 700 },
  shrine: { root: 46.2, scale: [0, 1, 4, 7, 8, 11], color: 450 },
};

class Synth {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private sfx!: GainNode;
  private music!: GainNode;
  private verb!: ConvolverNode;
  private verbSend!: GainNode;
  private drone: { nodes: AudioNode[]; gain: GainNode; timer: number } | null = null;
  private volume = 0.7;
  private musicOn = true;
  private droneId: SceneId | null = null;

  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.volume;
    this.master.connect(this.ctx.destination);
    this.sfx = this.ctx.createGain();
    this.sfx.connect(this.master);
    this.music = this.ctx.createGain();
    this.music.gain.value = this.musicOn ? 0.5 : 0;
    this.music.connect(this.master);
    this.verb = this.ctx.createConvolver();
    this.verb.buffer = this.impulse(2.8);
    this.verbSend = this.ctx.createGain();
    this.verbSend.gain.value = 0.5;
    this.verbSend.connect(this.verb);
    this.verb.connect(this.master);
    if (this.droneId) this.setDrone(this.droneId);
  }

  setVolume(v: number) {
    this.volume = v;
    if (this.ctx) this.master.gain.setTargetAtTime(v, this.ctx.currentTime, 0.05);
  }

  setMusic(on: boolean) {
    this.musicOn = on;
    if (this.ctx) this.music.gain.setTargetAtTime(on ? 0.5 : 0, this.ctx.currentTime, 0.3);
  }

  private impulse(seconds: number): AudioBuffer {
    const ctx = this.ctx!;
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
    }
    return buf;
  }

  private tone(o: ToneOpts) {
    const ctx = this.ctx;
    if (!ctx) return;
    const t0 = ctx.currentTime + (o.delay ?? 0);
    const dur = o.dur ?? 0.12;
    const osc = ctx.createOscillator();
    osc.type = o.type ?? 'square';
    osc.frequency.setValueAtTime(o.freq, t0);
    if (o.detune) osc.detune.value = o.detune;
    if (o.slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.slideTo), t0 + dur);
    const g = ctx.createGain();
    const peak = o.gain ?? 0.15;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(peak, t0 + (o.attack ?? 0.005));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g);
    g.connect(this.sfx);
    if (o.reverb) {
      const send = ctx.createGain();
      send.gain.value = o.reverb;
      g.connect(send);
      send.connect(this.verbSend);
    }
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  }

  private noise(o: { dur?: number; freq?: number; q?: number; type?: BiquadFilterType; gain?: number; slideTo?: number; delay?: number; reverb?: number }) {
    const ctx = this.ctx;
    if (!ctx) return;
    const t0 = ctx.currentTime + (o.delay ?? 0);
    const dur = o.dur ?? 0.1;
    const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const f = ctx.createBiquadFilter();
    f.type = o.type ?? 'bandpass';
    f.frequency.setValueAtTime(o.freq ?? 1000, t0);
    if (o.slideTo) f.frequency.exponentialRampToValueAtTime(o.slideTo, t0 + dur);
    f.Q.value = o.q ?? 1;
    const g = ctx.createGain();
    g.gain.setValueAtTime(o.gain ?? 0.2, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f);
    f.connect(g);
    g.connect(this.sfx);
    if (o.reverb) {
      const send = ctx.createGain();
      send.gain.value = o.reverb;
      g.connect(send);
      send.connect(this.verbSend);
    }
    src.start(t0);
  }

  private arp(notes: number[], step = 0.07, o: Partial<ToneOpts> = {}) {
    notes.forEach((freq, i) => this.tone({ freq, dur: 0.18, gain: 0.09, type: 'square', reverb: 0.3, ...o, delay: (o.delay ?? 0) + i * step }));
  }

  // ── Named sounds ─────────────────────────────────────────

  click() {
    this.tone({ freq: 880, dur: 0.05, gain: 0.07, slideTo: 660 });
  }
  hover() {
    this.tone({ freq: 1320, dur: 0.025, gain: 0.03, type: 'triangle' });
  }
  confirm() {
    this.arp([523, 784, 1046], 0.05, { gain: 0.07 });
  }
  back() {
    this.tone({ freq: 440, dur: 0.08, gain: 0.07, slideTo: 260 });
  }
  error() {
    this.tone({ freq: 140, dur: 0.22, gain: 0.12, type: 'sawtooth', slideTo: 90 });
  }
  start() {
    this.arp([262, 392, 523, 784, 1046], 0.09, { gain: 0.08, type: 'triangle', reverb: 0.8 });
    this.tone({ freq: 65, dur: 2.2, gain: 0.18, type: 'sine', reverb: 1 });
  }
  whoosh() {
    this.noise({ dur: 0.8, freq: 300, slideTo: 3000, q: 0.7, gain: 0.12, reverb: 0.5 });
  }
  dart(ring: number) {
    this.noise({ dur: 0.12, freq: 2200, slideTo: 600, gain: 0.08 });
    this.noise({ dur: 0.08, freq: 260, type: 'lowpass', gain: 0.3, delay: 0.3 });
    this.tone({ freq: 90 + ring * 30, dur: 0.12, gain: 0.12, type: 'sine', delay: 0.3 });
  }
  miss() {
    this.noise({ dur: 0.18, freq: 160, type: 'lowpass', gain: 0.25, delay: 0.3 });
  }
  bust() {
    this.tone({ freq: 220, dur: 0.6, gain: 0.12, type: 'sawtooth', slideTo: 55, reverb: 0.6 });
    this.tone({ freq: 233, dur: 0.6, gain: 0.1, type: 'sawtooth', slideTo: 58 });
  }
  fanfare() {
    this.arp([392, 523, 659, 784, 1046, 1318], 0.08, { gain: 0.09, reverb: 0.8 });
    this.tone({ freq: 131, dur: 1.2, gain: 0.12, type: 'triangle', reverb: 1 });
  }
  coin(n = 1) {
    for (let i = 0; i < Math.min(n, 6); i++) {
      this.tone({ freq: 988, dur: 0.06, gain: 0.06, delay: i * 0.08 });
      this.tone({ freq: 1319, dur: 0.18, gain: 0.06, delay: i * 0.08 + 0.05, reverb: 0.4 });
    }
  }
  spend() {
    this.tone({ freq: 660, dur: 0.12, gain: 0.07, slideTo: 330, type: 'triangle' });
  }
  tick() {
    this.noise({ dur: 0.02, freq: 3500, q: 4, gain: 0.25 });
    this.tone({ freq: 1600, dur: 0.015, gain: 0.03 });
  }
  blessing(rarity: number) {
    const base = [523, 659, 784, 1046, 1318, 1568];
    this.arp(base.slice(0, 3 + rarity), 0.07, { gain: 0.08, type: rarity >= 2 ? 'triangle' : 'square', reverb: 0.9 });
    if (rarity >= 2) this.tone({ freq: 2093, dur: 1.4, gain: 0.04, type: 'sine', reverb: 1, delay: 0.4 });
    if (rarity >= 3) this.arp([1046, 1318, 1568, 2093], 0.05, { delay: 0.6, gain: 0.06, type: 'triangle', reverb: 1 });
  }
  curse(severity: number) {
    this.tone({ freq: 110, dur: 1.2, gain: 0.14, type: 'sawtooth', slideTo: 55, reverb: 0.9 });
    this.tone({ freq: 116.5, dur: 1.2, gain: 0.1, type: 'sawtooth', slideTo: 58, reverb: 0.9 });
    if (severity >= 1) this.noise({ dur: 1.4, freq: 200, type: 'lowpass', gain: 0.2, reverb: 1 });
    if (severity >= 2) this.arp([311, 293, 277, 262], 0.15, { gain: 0.06, type: 'sawtooth', reverb: 1 });
  }
  voidHum() {
    this.tone({ freq: 70, dur: 1.4, gain: 0.12, type: 'sine', reverb: 1 });
  }
  hex() {
    this.noise({ dur: 1.2, freq: 900, slideTo: 120, q: 6, gain: 0.25, reverb: 1 });
    this.tone({ freq: 196, dur: 1, gain: 0.08, type: 'sawtooth', slideTo: 98, reverb: 0.8 });
  }
  cleanse() {
    this.noise({ dur: 1.2, freq: 1500, slideTo: 6000, q: 2, gain: 0.08, reverb: 1 });
    this.arp([784, 988, 1175, 1568], 0.1, { gain: 0.06, type: 'sine', reverb: 1 });
  }
  pact() {
    this.tone({ freq: 55, dur: 2, gain: 0.2, type: 'sine', reverb: 1 });
    this.noise({ dur: 0.4, freq: 400, gain: 0.15, reverb: 0.8 });
  }
  clock() {
    this.tone({ freq: 1800, dur: 0.03, gain: 0.08, type: 'square' });
    this.noise({ dur: 0.05, freq: 300, type: 'lowpass', gain: 0.3 });
  }
  check() {
    this.tone({ freq: 196, dur: 0.5, gain: 0.14, type: 'square', reverb: 0.7 });
    this.tone({ freq: 277, dur: 0.5, gain: 0.1, type: 'square', reverb: 0.7 });
  }
  point() {
    this.tone({ freq: 1200, dur: 0.04, gain: 0.08, type: 'square' });
    this.tone({ freq: 900, dur: 0.04, gain: 0.06, type: 'square', delay: 0.08 });
  }
  fool() {
    this.arp([392, 370, 349, 330, 311], 0.12, { gain: 0.08, type: 'sawtooth', reverb: 0.6 });
  }

  // ── Ambient drone ────────────────────────────────────────

  setDrone(id: SceneId) {
    this.droneId = id;
    const ctx = this.ctx;
    if (!ctx) return;
    const old = this.drone;
    if (old) {
      old.gain.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.6);
      window.clearInterval(old.timer);
      setTimeout(() => old.nodes.forEach((n) => (n as OscillatorNode).stop?.()), 3000);
    }
    const cfg = DRONES[id];
    const gain = ctx.createGain();
    gain.gain.value = 0.0001;
    gain.gain.setTargetAtTime(0.12, ctx.currentTime, 1.5);
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = cfg.color;
    filter.Q.value = 3;
    filter.connect(gain);
    gain.connect(this.music);
    const send = ctx.createGain();
    send.gain.value = 0.4;
    gain.connect(send);
    send.connect(this.verbSend);
    const nodes: AudioNode[] = [];
    for (const [mult, type, det] of [[1, 'sawtooth', -7], [1, 'sawtooth', 7], [1.5, 'triangle', 0], [0.5, 'sine', 0]] as [number, OscillatorType, number][]) {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.value = cfg.root * mult;
      o.detune.value = det;
      o.connect(filter);
      o.start();
      nodes.push(o);
    }
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.07;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = cfg.color * 0.6;
    lfo.connect(lfoGain);
    lfoGain.connect(filter.frequency);
    lfo.start();
    nodes.push(lfo);
    const timer = window.setInterval(() => {
      if (!this.musicOn || document.hidden) return;
      const deg = cfg.scale[Math.floor(Math.random() * cfg.scale.length)];
      const freq = cfg.root * 8 * Math.pow(2, deg / 12);
      this.toneTo(freq, this.music);
    }, 2600);
    this.drone = { nodes, gain, timer };
  }

  /** A soft bell through the music bus. */
  private toneTo(freq: number, bus: GainNode) {
    const ctx = this.ctx!;
    const t0 = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(0.05, t0 + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 3);
    o.connect(g);
    g.connect(bus);
    const send = ctx.createGain();
    send.gain.value = 0.8;
    g.connect(send);
    send.connect(this.verbSend);
    o.start(t0);
    o.stop(t0 + 3.1);
  }
}

export const sfx = new Synth();
