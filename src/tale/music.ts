import type { AudioEngine } from '../audio/engine.js';
import type { Vector3 } from '@iwsdk/core';

/**
 * The tale's sound, all synthesised (no files):
 *  - a dusk pad (four chords in D dorian, 8 beats each: a 32-beat cycle)
 *  - an ENSEMBLE: every character the reader creates joins with its own
 *    instrument and part, placed in 3D at the character, all on one clock
 *  - paper / lantern sound effects, and a small generated reverb.
 */
const NOTE = (n: number) => 440 * Math.pow(2, (n - 69) / 12);
const BPM = 66;
const BEAT = 60 / BPM;
const CYCLE = 32; // beats

const PAD_CHORDS = [
  [50, 57, 62, 65, 69], // Dm
  [46, 53, 58, 62, 65], // Bb
  [41, 53, 57, 60, 64], // F
  [48, 55, 60, 64, 67], // C
];

export type Instrument = 'flute' | 'cello' | 'clarinet' | 'oboe' | 'bassoon' | 'bells' | 'harp' | 'horn';

/** [midi, beats]; 0 = rest. Each part is exactly 32 beats (one pad cycle). */
type Part = [number, number][];
export const PARTS: Record<string, { instrument: Instrument; part: Part; level: number }> = {
  rabbit: {
    instrument: 'flute',
    level: 0.15,
    part: [[74, 1], [77, 0.5], [79, 0.5], [81, 1.5], [79, 0.5], [77, 2], [0, 2], [70, 1], [74, 0.5], [77, 0.5], [77, 1.5], [74, 0.5], [74, 2], [0, 2], [72, 1], [76, 0.5], [77, 0.5], [79, 1.5], [77, 0.5], [76, 2], [0, 2], [79, 1], [76, 0.5], [74, 0.5], [76, 1.5], [72, 0.5], [74, 2], [0, 2]],
  },
  /** the fox: a sly clarinet, low and close */
  fox: {
    instrument: 'clarinet',
    level: 0.1,
    part: [[62, 1.5], [65, 0.5], [69, 2], [67, 1], [65, 1], [62, 2], [58, 1.5], [62, 0.5], [65, 2], [62, 4], [57, 1.5], [60, 0.5], [65, 2], [64, 1], [62, 1], [60, 2], [60, 1.5], [64, 0.5], [67, 2], [64, 4]],
  },
  /** the owl: a long, watchful oboe */
  owl: {
    instrument: 'oboe',
    level: 0.09,
    part: [[81, 3], [79, 1], [77, 4], [74, 3], [77, 1], [74, 4], [72, 2], [74, 2], [76, 4], [76, 2], [79, 2], [76, 4]],
  },
  /** the snail: a slow, kind bassoon */
  snail: {
    instrument: 'bassoon',
    level: 0.13,
    part: [[38, 3], [0, 3], [45, 2], [34, 3], [0, 3], [41, 2], [41, 3], [0, 3], [45, 2], [36, 3], [0, 3], [43, 2]],
  },
  /** the little boat: a rocking harp */
  boat: {
    instrument: 'harp',
    level: 0.11,
    part: [[62, 1], [65, 1], [69, 1], [74, 1], [69, 1], [65, 1], [62, 1], [0, 1], [58, 1], [62, 1], [65, 1], [70, 1], [65, 1], [62, 1], [58, 1], [0, 1], [57, 1], [60, 1], [65, 1], [69, 1], [65, 1], [60, 1], [57, 1], [0, 1], [60, 1], [64, 1], [67, 1], [72, 1], [67, 1], [64, 1], [60, 1], [0, 1]],
  },
  /** the heron: Tomas's cello */
  heron: {
    instrument: 'cello',
    level: 0.13,
    part: [[50, 2], [57, 2], [53, 2], [57, 2], [46, 2], [53, 2], [50, 2], [53, 2], [41, 2], [48, 2], [45, 2], [48, 2], [48, 2], [55, 2], [52, 2], [55, 2]],
  },
  /** the tower: bells */
  tower: {
    instrument: 'bells',
    level: 0.09,
    part: [[86, 1], [0, 7], [82, 1], [0, 7], [81, 1], [0, 7], [84, 1], [0, 7]],
  },
  /** the Hollow, at last: a horn */
  hollow: {
    instrument: 'horn',
    level: 0.12,
    part: [[62, 6], [64, 1], [65, 1], [62, 6], [60, 1], [58, 1], [57, 6], [60, 1], [64, 1], [67, 8]],
  },
};

interface Voice {
  id: string;
  instrument: Instrument;
  part: Part;
  level: number;
  panner: PannerNode;
  gain: GainNode;
  /** next note time and index; null until it starts on a cycle boundary */
  next: number;
  step: number;
}

export class TaleMusic {
  private ctx: AudioContext;
  private out: GainNode;
  /** the ensemble, the pad (the Music slider) */
  private musicBus: GainNode;
  /** every effect, tone and tick (the Sounds slider) */
  private sfxBus: GainNode;
  /** a slider is being held while paused: let its sound be heard */
  private preview = false;
  private reverb: ConvolverNode;
  private wet: GainNode;
  private padGain: GainNode;
  private padIndex = -1;
  private padNext = 0;
  private padOn = false;
  private padLevel = 0.07;
  /** start of the shared beat clock (seconds) */
  private clock0 = 0;
  private voices = new Map<string, Voice>();
  private ensembleGain: GainNode;
  private noise: AudioBuffer;
  private muted = false;
  private quiet = false;
  readonly log: string[] = [];

  constructor(private engine: AudioEngine) {
    const ctx = (this.ctx = engine.ctx);
    this.out = ctx.createGain();
    this.out.connect(engine.master);
    this.reverb = ctx.createConvolver();
    this.reverb.buffer = impulse(ctx, 2.8, 2.2);
    this.wet = ctx.createGain();
    this.wet.gain.value = 0.35;
    this.reverb.connect(this.wet).connect(this.out);
    // two buses, each with its own (post-fader) reverb send
    this.musicBus = ctx.createGain();
    this.sfxBus = ctx.createGain();
    for (const b of [this.musicBus, this.sfxBus]) {
      b.connect(this.out);
      b.connect(this.reverb);
    }
    this.padGain = ctx.createGain();
    this.padGain.gain.value = 0;
    const padFilter = ctx.createBiquadFilter();
    padFilter.type = 'lowpass';
    padFilter.frequency.value = 1700;
    padFilter.Q.value = 0.4;
    this.padGain.connect(padFilter);
    padFilter.connect(this.musicBus);
    this.ensembleGain = ctx.createGain();
    this.ensembleGain.gain.value = 1;
    this.ensembleGain.connect(this.musicBus);
    this.noise = noiseBuffer(ctx, 2);
  }

  get time(): number {
    return this.ctx.currentTime;
  }

  /** the reader's volume sliders (gains: 1 = designed level) */
  setVolumes(all: number, music: number, sounds: number): void {
    const t = this.ctx.currentTime;
    this.engine.master.gain.setTargetAtTime(0.9 * all, t, 0.05);
    this.musicBus.gain.setTargetAtTime(music, t, 0.05);
    this.sfxBus.gain.setTargetAtTime(sounds, t, 0.05);
  }

  /** while a volume slider is held on the pause card, the ensemble plays so it can be heard */
  setPreview(on: boolean): void {
    if (on === this.preview) return;
    this.preview = on;
    if (!this.quiet) return;
    const t = this.ctx.currentTime;
    this.ensembleGain.gain.setTargetAtTime(on ? 1 : 0, t, 0.2);
    // before anyone has joined, the pad is the music you can hear while you set it
    this.padGain.gain.setTargetAtTime(on ? Math.max(this.padLevel, 0.07) : this.padLevel * 0.4, t, 0.3);
  }

  setMuted(m: boolean): void {
    this.muted = m;
    this.out.gain.setTargetAtTime(m ? 0 : 1, this.ctx.currentTime, 0.2);
  }
  get isMuted(): boolean {
    return this.muted;
  }

  private bed: { gain: GainNode; src: AudioBufferSourceNode } | null = null;
  private chirpNext = 0;
  /** the night around the book: soft page air and far crickets (so the opening is never silent) */
  ambience(on: boolean): void {
    const ctx = this.ctx;
    if (on && !this.bed) {
      const src = ctx.createBufferSource();
      src.buffer = this.noise;
      src.loop = true;
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 2400;
      bp.Q.value = 0.5;
      const gain = ctx.createGain();
      gain.gain.value = 0;
      src.connect(bp).connect(gain).connect(this.sfxBus);
      src.start();
      this.bed = { gain, src };
      this.chirpNext = ctx.currentTime + 1.5;
    }
    if (this.bed) this.bed.gain.gain.setTargetAtTime(on ? 0.012 : 0, ctx.currentTime, on ? 2 : 0.8);
    this.ambienceOn = on;
  }
  private ambienceOn = false;

  /** Fade the dusk pad in/out. Starts the shared clock the first time. */
  pad(on: boolean, level = 0.07): void {
    this.padOn = on;
    this.padLevel = level;
    this.padGain.gain.setTargetAtTime(on ? level : 0, this.ctx.currentTime, on ? 2.5 : 1.2);
    if (on && this.padNext === 0) {
      this.clock0 = this.ctx.currentTime + 0.05;
      this.padNext = this.clock0;
      this.padIndex = -1;
    }
    this.log.push(`pad:${on}`);
  }

  /** Paused: the ensemble steps back (the pad keeps breathing very softly). */
  setQuiet(q: boolean): void {
    this.quiet = q;
    this.ensembleGain.gain.setTargetAtTime(q ? 0.0 : 1, this.ctx.currentTime, 0.4);
    this.padGain.gain.setTargetAtTime(q ? this.padLevel * 0.4 : this.padOn ? this.padLevel : 0, this.ctx.currentTime, 0.6);
  }

  /** A character joins the ensemble (starts at the next bar so it lands in time). */
  join(id: string, partId = id): void {
    if (this.voices.has(id)) return;
    const def = PARTS[partId];
    if (!def) return;
    const ctx = this.ctx;
    const panner = ctx.createPanner();
    panner.panningModel = 'HRTF';
    panner.distanceModel = 'inverse';
    panner.refDistance = 0.35;
    panner.rolloffFactor = 0.8;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    gain.gain.setTargetAtTime(def.level, ctx.currentTime, 1.0);
    gain.connect(panner).connect(this.ensembleGain);
    // start on the next 8-beat bar, at the matching point of its 32-beat part
    if (!this.clock0) this.clock0 = ctx.currentTime;
    const beatsNow = (ctx.currentTime - this.clock0) / BEAT;
    const startBeat = Math.ceil((beatsNow + 0.5) / 8) * 8;
    const into = startBeat % CYCLE;
    let acc = 0;
    let step = 0;
    while (acc < into && step < def.part.length) acc += def.part[step++][1];
    this.voices.set(id, { id, instrument: def.instrument, part: def.part, level: def.level, panner, gain, next: this.clock0 + startBeat * BEAT, step });
    this.log.push(`join:${id}`);
  }

  leave(id: string): void {
    const v = this.voices.get(id);
    if (!v) return;
    v.gain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.5);
    const node = v.gain;
    window.setTimeout(() => node.disconnect(), 3000);
    this.voices.delete(id);
  }

  /** Everyone leaves (restart). */
  clear(): void {
    for (const id of [...this.voices.keys()]) this.leave(id);
  }

  has(id: string): boolean {
    return this.voices.has(id);
  }

  get members(): string[] {
    return [...this.voices.keys()];
  }

  /** The finale: everyone a little louder, the pad fuller. */
  finale(on: boolean): void {
    for (const v of this.voices.values()) v.gain.gain.setTargetAtTime(on ? v.level * 1.45 : v.level, this.ctx.currentTime, 1.5);
    this.padLevel = on ? 0.1 : 0.07;
    if (this.padOn && !this.quiet) this.padGain.gain.setTargetAtTime(this.padLevel, this.ctx.currentTime, 2);
    this.log.push(`finale:${on}`);
  }

  /** Place a character's instrument in the room (world metres). */
  place(id: string, pos: Vector3): void {
    const v = this.voices.get(id);
    if (!v) return;
    const t = this.ctx.currentTime;
    v.panner.positionX.setTargetAtTime(pos.x, t, 0.05);
    v.panner.positionY.setTargetAtTime(pos.y, t, 0.05);
    v.panner.positionZ.setTargetAtTime(pos.z, t, 0.05);
  }

  /** Call every frame: schedules pad chords and ensemble notes slightly ahead. */
  update(): void {
    if (this.ambienceOn && !this.quiet && this.ctx.currentTime > this.chirpNext) {
      const t = this.ctx.currentTime;
      // a cricket: three quick high chirps, far away
      const f = 4200 + Math.random() * 600;
      for (let k = 0; k < 3; k++) this.chirp(f, t + k * 0.07);
      this.chirpNext = t + 2.2 + Math.random() * 3.5;
    }
    if (!this.engine.running) return;
    const now = this.ctx.currentTime;
    const ahead = now + 0.3;
    // after a long silence, skip ahead to the present instead of replaying every missed chord
    if (this.padNext && this.padNext < now - 0.5) {
      const missed = Math.ceil((now - this.padNext) / (8 * BEAT));
      this.padNext += missed * 8 * BEAT;
      this.padIndex = (this.padIndex + missed) % PAD_CHORDS.length;
    }
    if (this.padOn && this.padNext && this.padNext < ahead) {
      this.padIndex = (this.padIndex + 1) % PAD_CHORDS.length;
      this.chord(PAD_CHORDS[this.padIndex], this.padNext, 8 * BEAT + 1.5);
      this.padNext += 8 * BEAT;
    }
    if (this.quiet) {
      // keep the clock moving silently so parts stay in time after a pause
      for (const v of this.voices.values()) while (v.next < ahead) this.advance(v, false);
      return;
    }
    for (const v of this.voices.values()) while (v.next < ahead) this.advance(v, true);
  }

  private advance(v: Voice, play: boolean): void {
    const [n, beats] = v.part[v.step % v.part.length];
    if (n && play && v.next > this.ctx.currentTime - 0.05) this.note(v, NOTE(n), v.next, beats * BEAT * 0.96);
    v.next += beats * BEAT;
    v.step++;
  }

  // ---- synthesis ----------------------------------------------------------------------

  private chord(notes: number[], t: number, dur: number): void {
    const ctx = this.ctx;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(1, t + 2.8);
    g.gain.setValueAtTime(1, t + dur - 2.6);
    g.gain.linearRampToValueAtTime(0, t + dur);
    g.connect(this.padGain);
    notes.forEach((n, k) => {
      for (const det of [-6, 5]) {
        const o = ctx.createOscillator();
        o.type = k === 0 ? 'sine' : 'triangle';
        o.frequency.value = NOTE(n);
        o.detune.value = det;
        const vg = ctx.createGain();
        vg.gain.value = (k === 0 ? 0.5 : 0.22) / notes.length;
        o.connect(vg).connect(g);
        o.start(t);
        o.stop(t + dur + 0.1);
      }
    });
  }

  private note(v: Voice, freq: number, t: number, dur: number): void {
    const ctx = this.ctx;
    const env = ctx.createGain();
    const end = t + dur + 0.6;
    const srcs: AudioScheduledSourceNode[] = [];
    const osc = (type: OscillatorType, f: number, level: number, dest: AudioNode) => {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.value = f;
      const g = ctx.createGain();
      g.gain.value = level;
      o.connect(g).connect(dest);
      srcs.push(o);
      return o;
    };
    const vibrato = (oscs: OscillatorNode[], rate: number, depth: number, delay: number) => {
      const l = ctx.createOscillator();
      l.frequency.value = rate;
      const lg = ctx.createGain();
      lg.gain.setValueAtTime(0, t);
      lg.gain.linearRampToValueAtTime(freq * depth, t + Math.min(delay, dur));
      l.connect(lg);
      for (const o of oscs) lg.connect(o.frequency);
      srcs.push(l);
    };
    const breath = (center: number, q: number, level: number) => {
      const n = ctx.createBufferSource();
      n.buffer = this.noise;
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = center;
      bp.Q.value = q;
      const ng = ctx.createGain();
      ng.gain.setValueAtTime(0, t);
      ng.gain.linearRampToValueAtTime(level, t + 0.04);
      ng.gain.linearRampToValueAtTime(level * 0.25, t + 0.2);
      n.connect(bp).connect(ng).connect(env);
      srcs.push(n);
    };
    const sustain = (attack: number, release: number) => {
      env.gain.setValueAtTime(0, t);
      env.gain.linearRampToValueAtTime(1, t + attack);
      env.gain.setValueAtTime(0.85, t + Math.max(attack + 0.01, dur - release));
      env.gain.linearRampToValueAtTime(0, t + dur + release);
    };
    const pluck = (decay: number) => {
      env.gain.setValueAtTime(0, t);
      env.gain.linearRampToValueAtTime(1, t + 0.005);
      env.gain.exponentialRampToValueAtTime(0.001, t + decay);
    };
    const lowpass = (f: number, q = 0.7) => {
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = f;
      lp.Q.value = q;
      lp.connect(env);
      return lp;
    };
    switch (v.instrument) {
      case 'flute': {
        sustain(0.09, 0.12);
        const a = osc('sine', freq, 1, env);
        const b = osc('sine', freq * 2, 0.12, env);
        vibrato([a, b], 5.2, 0.006, 0.6);
        breath(freq * 1.5, 1.2, 0.35);
        break;
      }
      case 'clarinet': {
        sustain(0.06, 0.14);
        const lp = lowpass(freq * 3.2, 0.9);
        const a = osc('square', freq, 0.35, lp);
        vibrato([a], 4.8, 0.004, 0.8);
        breath(freq * 2, 2, 0.08);
        break;
      }
      case 'cello': {
        sustain(0.16, 0.25);
        const lp = lowpass(Math.min(1800, freq * 6), 0.6);
        const a = osc('sawtooth', freq, 0.32, lp);
        const b = osc('sawtooth', freq * 1.003, 0.2, lp);
        vibrato([a, b], 5.5, 0.008, 0.5);
        break;
      }
      case 'oboe': {
        sustain(0.05, 0.1);
        const bp = ctx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.value = Math.max(900, freq * 2.2);
        bp.Q.value = 1.6;
        bp.connect(env);
        const a = osc('sawtooth', freq, 0.6, bp);
        vibrato([a], 5.6, 0.005, 0.5);
        break;
      }
      case 'bassoon': {
        sustain(0.07, 0.18);
        const lp = lowpass(Math.min(900, freq * 5), 1.1);
        const a = osc('sawtooth', freq, 0.45, lp);
        vibrato([a], 4.5, 0.004, 0.9);
        break;
      }
      case 'horn': {
        sustain(0.28, 0.4);
        const lp = lowpass(Math.min(1100, freq * 4), 0.6);
        const a = osc('sawtooth', freq, 0.3, lp);
        const b = osc('triangle', freq, 0.3, lp);
        vibrato([a, b], 4.6, 0.003, 1.2);
        break;
      }
      case 'harp': {
        pluck(1.6);
        osc('triangle', freq, 0.6, env);
        osc('sine', freq * 2, 0.15, env);
        break;
      }
      case 'bells': {
        pluck(3.2);
        osc('sine', freq, 0.6, env);
        osc('sine', freq * 2.76, 0.18, env);
        osc('sine', freq * 5.4, 0.06, env);
        break;
      }
    }
    env.connect(v.gain);
    for (const s of srcs) {
      s.start(t);
      s.stop(end + 2);
    }
  }

  // ---- effects (non-spatial, quiet) ---------------------------------------------------

  private fx(level: number): GainNode {
    const g = this.ctx.createGain();
    g.gain.value = level;
    g.connect(this.sfxBus);
    return g;
  }

  private noiseBurst(t: number, dur: number, freq: number, q: number, level: number, type: BiquadFilterType = 'bandpass'): void {
    const ctx = this.ctx;
    const s = ctx.createBufferSource();
    s.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(1, t + Math.min(0.02, dur * 0.2));
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    s.connect(f).connect(g).connect(this.fx(level));
    s.start(t, Math.random());
    s.stop(t + dur + 0.05);
  }

  private tone(freq: number, t: number, dur: number, level: number, type: OscillatorType = 'sine'): void {
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(1, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(this.fx(level));
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  /** the book landing on the table */
  thump(): void {
    const t = this.ctx.currentTime;
    this.noiseBurst(t, 0.18, 220, 0.8, 0.5, 'lowpass');
    this.tone(70, t, 0.25, 0.35);
    this.log.push('sfx:thump');
  }

  /** paper rustle (cover opening, pop-ups rising, a page turning) */
  rustle(len = 0.9): void {
    const t = this.ctx.currentTime;
    for (let k = 0; k < 7; k++) this.noiseBurst(t + k * (len / 8) + Math.random() * 0.05, 0.12 + Math.random() * 0.1, 2400 + Math.random() * 2600, 0.9, 0.06);
    this.log.push('sfx:rustle');
  }

  /** a page turning: a soft whoosh with a paper flick */
  pageTurn(): void {
    const t = this.ctx.currentTime;
    this.noiseBurst(t, 0.55, 1400, 0.5, 0.09, 'lowpass');
    this.noiseBurst(t + 0.42, 0.08, 3200, 1.2, 0.08);
    this.log.push('sfx:page');
  }

  /** the lantern catching */
  ignite(): void {
    const t = this.ctx.currentTime;
    this.noiseBurst(t, 0.5, 900, 0.6, 0.12, 'lowpass');
    this.tone(110, t + 0.02, 0.6, 0.06);
    for (let k = 0; k < 6; k++) this.noiseBurst(t + 0.15 + k * 0.09 + Math.random() * 0.05, 0.03, 3800, 3, 0.05);
    this.log.push('sfx:ignite');
  }

  /** a soft glimmer when a shadow is recognised */
  shimmer(): void {
    const t = this.ctx.currentTime;
    [74, 81, 86, 93].forEach((n, k) => this.tone(NOTE(n), t + k * 0.07, 1.6, 0.05));
    this.log.push('sfx:shimmer');
  }

  private chirp(f: number, t: number): void {
    const o = this.ctx.createOscillator();
    o.frequency.value = f;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.006, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
    o.connect(g).connect(this.sfxBus);
    o.start(t);
    o.stop(t + 0.06);
  }

  /** a tiny paper tap (a hop, a step) */
  tap(): void {
    this.noiseBurst(this.ctx.currentTime, 0.05, 1800, 1.5, 0.08);
  }

  /** a little shadow's footstep on your shadow: soft, pitched up the scale as it goes */
  private stepN = 0;
  step(): void {
    const t = this.ctx.currentTime;
    this.noiseBurst(t, 0.03, 2400 + (this.stepN % 4) * 300, 2, 0.035);
    this.stepN++;
  }

  /** a caught light: one bell, a step higher each time */
  private bellN = 0;
  bell(): void {
    const scale = [74, 76, 79, 81, 83, 86, 88];
    this.tone(NOTE(scale[this.bellN % scale.length]), this.ctx.currentTime, 1.4, 0.06);
    this.bellN++;
    this.log.push('sfx:bell');
  }

  /** a gust breaking on your shadow: a soft burst of air */
  puff(): void {
    const t = this.ctx.currentTime;
    this.noiseBurst(t, 0.35, 900, 0.7, 0.08);
    this.tone(NOTE(67), t, 0.25, 0.025);
    this.log.push('sfx:puff');
  }

  /** a twist lands: a held minor-second cluster that resolves, voiced where Quest 2 speakers can play it */
  twist(): void {
    const t = this.ctx.currentTime;
    this.tone(NOTE(50), t, 2.6, 0.05, 'triangle');
    this.tone(NOTE(51), t + 0.05, 2.4, 0.035, 'triangle');
    this.tone(NOTE(62), t + 0.02, 2.2, 0.03);
    this.tone(NOTE(69), t + 1.3, 2.4, 0.04);
    this.tone(NOTE(74), t + 1.45, 2.2, 0.035);
    this.noiseBurst(t, 0.6, 500, 0.6, 0.03, 'lowpass');
    this.log.push('sfx:twist');
  }

  /** a warm, happy figure (three rising bells) */
  laugh(): void {
    const t = this.ctx.currentTime;
    [77, 81, 86].forEach((n, k) => this.tone(NOTE(n), t + k * 0.12, 0.9, 0.06));
    this.log.push('sfx:laugh');
  }

  /** a low, uneasy swell (the Hollow) */
  dread(): void {
    const t = this.ctx.currentTime;
    this.tone(NOTE(38), t, 3.5, 0.08, 'sawtooth');
    this.tone(NOTE(39), t + 0.1, 3.4, 0.05, 'sawtooth');
    this.tone(NOTE(50), t, 3.5, 0.045, 'sawtooth');
    this.tone(NOTE(51), t + 0.1, 3.4, 0.03, 'sawtooth');
    this.noiseBurst(t, 2.5, 300, 0.5, 0.05, 'lowpass');
    this.log.push('sfx:dread');
  }

  // ---- the match tone: a soft voice that climbs as your shadow fits the outline ----------------
  private matchOsc: OscillatorNode | null = null;
  private matchFifth: OscillatorNode | null = null;
  private matchGain: GainNode | null = null;
  private matchFifthGain: GainNode | null = null;
  private matchLp: BiquadFilterNode | null = null;
  private matchStep = -1;
  private matchStepT = 0;
  private matchLevelNow = -1;

  /** a beat begins: the (silent) match voice wakes */
  beginMatch(): void {
    if (this.matchOsc) return;
    const ctx = this.ctx;
    this.matchOsc = ctx.createOscillator();
    this.matchOsc.type = 'triangle';
    this.matchFifth = ctx.createOscillator();
    this.matchFifth.type = 'sine';
    this.matchLp = ctx.createBiquadFilter();
    this.matchLp.type = 'lowpass';
    this.matchLp.frequency.value = 600;
    this.matchGain = ctx.createGain();
    this.matchGain.gain.value = 0;
    this.matchFifthGain = ctx.createGain();
    this.matchFifthGain.gain.value = 0;
    this.matchOsc.connect(this.matchLp);
    this.matchFifth.connect(this.matchFifthGain).connect(this.matchLp);
    this.matchLp.connect(this.matchGain);
    this.matchGain.connect(this.sfxBus);
    this.matchOsc.start();
    this.matchFifth.start();
    this.matchStep = -1;
    this.matchLevelNow = -1;
  }

  /**
   * Every frame while a beat asks: m = the match meter (0..1), enter = the bar to clear,
   * hold01 = how far the hold has got. Pitch climbs a D minor pentatonic; the top step
   * is only reached at the bar, and a fifth opens above it while you hold.
   */
  matchLevel(m: number, enter: number, hold01: number): void {
    if (!this.matchOsc || !this.matchGain || !this.matchLp || !this.matchFifthGain || !this.matchFifth) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const s = Math.min(1, Math.max(0, (m - 0.4) / (enter - 0.4)));
    const SCALE = [62, 65, 67, 69, 72, 74, 77, 79];
    const want = m < 0.25 ? -1 : Math.round(s * (SCALE.length - 1));
    if (want !== this.matchStep && t - this.matchStepT > 0.09) {
      this.matchStep = want;
      this.matchStepT = t;
      if (want >= 0) {
        const f = NOTE(SCALE[want]);
        this.matchOsc.frequency.setTargetAtTime(f, t, 0.03);
        this.matchFifth.frequency.setTargetAtTime(f * 1.5 * (1 + 0.333 * hold01), t, 0.05);
      }
    }
    const level = want < 0 || this.muted || this.quiet ? 0 : (0.018 + 0.03 * s) * (1 + 0.4 * hold01);
    if (Math.abs(level - this.matchLevelNow) > 0.002) {
      this.matchLevelNow = level;
      this.matchGain.gain.setTargetAtTime(level, t, 0.08);
      this.matchLp.frequency.setTargetAtTime(500 + 2200 * s, t, 0.08);
      this.matchFifthGain.gain.setTargetAtTime(s > 0.85 ? 0.5 * hold01 + 0.15 : 0, t, 0.1);
    }
  }

  /** the beat ends: 'lock' (a match: a paper snap and a bell) or 'cancel' */
  endMatch(how: 'lock' | 'cancel'): void {
    const t = this.ctx.currentTime;
    if (how === 'lock') {
      this.noiseBurst(t, 0.012, 4000, 2, 0.14);
      this.tone(220, t, 0.09, 0.1);
      const f = this.matchStep >= 0 ? NOTE([62, 65, 67, 69, 72, 74, 77, 79][this.matchStep]) * 2 : NOTE(86);
      this.tone(f, t + 0.02, 1.4, 0.05);
      this.log.push('sfx:lock');
    }
    const osc = this.matchOsc;
    const fifth = this.matchFifth;
    const g = this.matchGain;
    if (g) g.gain.setTargetAtTime(0, t, 0.05);
    if (osc && fifth) {
      osc.stop(t + 0.4);
      fifth.stop(t + 0.4);
    }
    this.matchOsc = this.matchFifth = null;
    this.matchGain = this.matchFifthGain = null;
    this.matchLp = null;
  }

  /** the paper mobile on the desk: one small high note per piece (a pentatonic set: any order sounds right) */
  chime(k: number): void {
    const notes = [86, 88, 91, 93, 96];
    const t = this.ctx.currentTime;
    this.tone(NOTE(notes[k % notes.length]), t, 1.8, 0.03);
    this.tone(NOTE(notes[k % notes.length] + 12), t + 0.02, 0.9, 0.012);
  }

  /** a quiet ghost-hand hint chime */
  hint(): void {
    const t = this.ctx.currentTime;
    this.tone(NOTE(69), t, 1.1, 0.03);
    this.tone(NOTE(76), t + 0.14, 1.1, 0.025);
  }
}

function noiseBuffer(ctx: AudioContext, seconds: number): AudioBuffer {
  const b = ctx.createBuffer(1, ctx.sampleRate * seconds, ctx.sampleRate);
  const d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return b;
}

function impulse(ctx: AudioContext, seconds: number, decay: number): AudioBuffer {
  const len = Math.floor(ctx.sampleRate * seconds);
  const b = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = b.getChannelData(c);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
  }
  return b;
}
