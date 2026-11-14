import type { Matrix4 } from '@iwsdk/core';
import { optimizedUrl, type SoundSpec } from './sound.js';
import { createProcedural, type ProceduralVoice } from './procedural.js';

/**
 * Small spatial audio engine on top of Web Audio.
 *
 * Each orb gets a Voice:  source -> trim -> level (distance curve) -> panner -> bus
 * The panner only gives direction (HRTF, no built-in rolloff); loudness is
 * driven by our own curve so the orb glow can use the exact same number.
 */
export class AudioEngine {
  readonly ctx: AudioContext;
  readonly master: GainNode;
  readonly voiceBus: GainNode;
  readonly sfxBus: GainNode;
  private buffers = new Map<string, Promise<AudioBuffer>>();
  private unlocked = false;

  constructor() {
    this.ctx = new AudioContext({ latencyHint: 'interactive' });
    const limiter = this.ctx.createDynamicsCompressor();
    limiter.threshold.value = -10;
    limiter.knee.value = 6;
    limiter.ratio.value = 8;
    limiter.attack.value = 0.005;
    limiter.release.value = 0.25;
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.9;
    this.voiceBus = this.ctx.createGain();
    this.sfxBus = this.ctx.createGain();
    this.voiceBus.connect(this.master);
    this.sfxBus.connect(this.master);
    this.master.connect(limiter).connect(this.ctx.destination);

    const listener = this.ctx.listener;
    if (listener.positionX) {
      listener.positionX.value = 0;
      listener.positionY.value = 1.2;
      listener.positionZ.value = 0;
    }
  }

  /** Browsers start audio suspended until a user gesture. Safe to call often. */
  unlock(): void {
    if (this.ctx.state !== 'running') {
      void this.ctx.resume();
    }
    this.unlocked = true;
  }

  private lastResume = 0;
  /** Quest Browser can suspend the context (system menu, sleep, headset off). After the page's first
   *  gesture, resume() is allowed again without a new one. Call every frame; it tries once a second. */
  keepAlive(): void {
    // 'interrupted' too (some browsers use it while the headset's system UI is up)
    if (!this.unlocked || this.ctx.state === 'running' || this.ctx.state === 'closed') return;
    const now = performance.now();
    if (now - this.lastResume < 1000) return;
    this.lastResume = now;
    void this.ctx.resume().catch(() => {});
  }

  get running(): boolean {
    return this.unlocked && this.ctx.state === 'running';
  }

  load(url: string): Promise<AudioBuffer> {
    let p = this.buffers.get(url);
    if (!p) {
      p = fetch(url)
        .then((r) => {
          if (!r.ok) throw new Error(`${r.status} ${url}`);
          return r.arrayBuffer();
        })
        .then((data) => this.ctx.decodeAudioData(data));
      this.buffers.set(url, p);
    }
    return p;
  }

  /** Start fetching every file-based sound so the first grab is instant. */
  preload(specs: SoundSpec[]): void {
    for (const s of specs) {
      if (s.file) this.load(optimizedUrl(s.file)).catch((e) => console.warn('[audio]', e));
    }
  }

  createVoice(spec: SoundSpec): Voice {
    return new Voice(this, spec);
  }

  /** Copy the head pose (camera world matrix) into the Web Audio listener. */
  updateListener(m: Matrix4): void {
    const e = m.elements;
    const l = this.ctx.listener;
    const t = this.ctx.currentTime;
    // forward = -Z column, up = +Y column
    if (l.positionX) {
      l.positionX.setTargetAtTime(e[12], t, 0.01);
      l.positionY.setTargetAtTime(e[13], t, 0.01);
      l.positionZ.setTargetAtTime(e[14], t, 0.01);
      l.forwardX.setTargetAtTime(-e[8], t, 0.01);
      l.forwardY.setTargetAtTime(-e[9], t, 0.01);
      l.forwardZ.setTargetAtTime(-e[10], t, 0.01);
      l.upX.setTargetAtTime(e[4], t, 0.01);
      l.upY.setTargetAtTime(e[5], t, 0.01);
      l.upZ.setTargetAtTime(e[6], t, 0.01);
    } else {
      // Older API fallback
      l.setPosition(e[12], e[13], e[14]);
      l.setOrientation(-e[8], -e[9], -e[10], e[4], e[5], e[6]);
    }
  }
}

/**
 * Loudness from distance between the orb and the head (metres).
 * <= 0.25 m: full. >= 1.5 m: near silent. Smooth (no kinks) in between.
 */
export function levelForDistance(d: number): number {
  const NEAR = 0.25;
  const FAR = 1.5;
  const FLOOR = 0.02;
  const t = Math.min(1, Math.max(0, (d - NEAR) / (FAR - NEAR)));
  const s = t * t * (3 - 2 * t); // smoothstep
  const g = Math.pow(1 - s, 1.6);
  return FLOOR + (1 - FLOOR) * g;
}

export class Voice {
  private readonly engine: AudioEngine;
  private readonly trim: GainNode;
  private readonly level: GainNode;
  private readonly panner: PannerNode;
  private bufferSource?: AudioBufferSourceNode;
  private procedural?: ProceduralVoice;
  private stopped = false;

  constructor(engine: AudioEngine, spec: SoundSpec) {
    this.engine = engine;
    const ctx = engine.ctx;
    this.trim = ctx.createGain();
    this.trim.gain.value = spec.volume ?? 1;
    this.level = ctx.createGain();
    this.level.gain.value = 0;
    this.panner = new PannerNode(ctx, {
      panningModel: 'HRTF',
      distanceModel: 'linear',
      refDistance: 1,
      maxDistance: 10000,
      rolloffFactor: 0, // distance loudness is ours, the panner only does direction
    });
    // optional brightness lift (e.g. Wind = a brighter, faster Air)
    let input: AudioNode = this.trim;
    if (spec.bright) {
      const shelf = new BiquadFilterNode(ctx, { type: 'highshelf', frequency: 2500, gain: 5 });
      shelf.connect(this.trim);
      input = shelf;
    }
    this.trim.connect(this.level).connect(this.panner).connect(engine.voiceBus);

    if (spec.procedural) {
      this.procedural = createProcedural(ctx, spec.procedural);
      this.procedural.output.connect(input);
    } else if (spec.file) {
      engine
        .load(optimizedUrl(spec.file))
        .then((buffer) => {
          if (this.stopped) return;
          const src = ctx.createBufferSource();
          src.buffer = buffer;
          src.loop = true;
          src.playbackRate.value = spec.rate ?? 1;
          src.connect(input);
          // random start point so two copies of one sound never phase
          src.start(0, Math.random() * buffer.duration);
          this.bufferSource = src;
        })
        .catch((e) => console.warn('[audio]', spec.file, e));
    }
  }

  setPosition(x: number, y: number, z: number): void {
    const t = this.engine.ctx.currentTime;
    this.panner.positionX.setTargetAtTime(x, t, 0.01);
    this.panner.positionY.setTargetAtTime(y, t, 0.01);
    this.panner.positionZ.setTargetAtTime(z, t, 0.01);
  }

  /** 0..1 loudness; smoothed on the audio thread to avoid zipper noise. */
  setLevel(v: number): void {
    this.level.gain.setTargetAtTime(v, this.engine.ctx.currentTime, 0.04);
  }

  stop(fade = 0.4): void {
    if (this.stopped) return;
    this.stopped = true;
    const ctx = this.engine.ctx;
    const t = ctx.currentTime;
    this.level.gain.cancelScheduledValues(t);
    this.level.gain.setValueAtTime(this.level.gain.value, t);
    this.level.gain.linearRampToValueAtTime(0, t + fade);
    window.setTimeout(() => {
      try {
        this.bufferSource?.stop();
      } catch {
        /* already stopped */
      }
      this.procedural?.stop();
      this.panner.disconnect();
      this.level.disconnect();
      this.trim.disconnect();
    }, (fade + 0.1) * 1000);
  }
}
