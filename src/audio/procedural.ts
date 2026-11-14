import type { ProceduralId } from './sound.js';

/**
 * Placeholder sounds generated in code (no files).
 *  - steady textures (hiss, air, rumble) are live filter graphs: no JS per frame
 *  - event sounds (bubbles, drops, crackles, squelches) are synthesized once
 *    into a seamless looping buffer, cached and shared
 * Replace any of them with a real recording via `sound.file` in elements.ts.
 */
export interface ProceduralVoice {
  output: AudioNode;
  stop(): void;
}

const noiseBuffers = new WeakMap<BaseAudioContext, AudioBuffer>();
const eventBuffers = new WeakMap<BaseAudioContext, Map<string, AudioBuffer>>();

/** 4 s of white noise, shared by every procedural voice. */
function noise(ctx: BaseAudioContext): AudioBuffer {
  let b = noiseBuffers.get(ctx);
  if (!b) {
    b = ctx.createBuffer(1, ctx.sampleRate * 4, ctx.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    noiseBuffers.set(ctx, b);
  }
  return b;
}

function noiseSource(ctx: AudioContext, rate = 1): AudioBufferSourceNode {
  const s = ctx.createBufferSource();
  s.buffer = noise(ctx);
  s.loop = true;
  s.playbackRate.value = rate;
  return s;
}

/** Slow sine LFO added onto an AudioParam: param = base + depth * sin. */
function lfo(ctx: AudioContext, freq: number, depth: number, target: AudioParam): OscillatorNode {
  const o = ctx.createOscillator();
  o.frequency.value = freq;
  const g = ctx.createGain();
  g.gain.value = depth;
  o.connect(g).connect(target);
  return o;
}

type EventWriter = (data: Float32Array, sr: number, add: (at: number, sample: number) => void) => void;

/**
 * Synthesize a loop of `seconds` once. `add(i, v)` wraps around the end, so an
 * event near the end continues at the start: the loop is seamless.
 */
function eventLoop(ctx: AudioContext, id: string, seconds: number, write: EventWriter): AudioBufferSourceNode {
  let cache = eventBuffers.get(ctx);
  if (!cache) eventBuffers.set(ctx, (cache = new Map()));
  let buf = cache.get(id);
  if (!buf) {
    buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * seconds), ctx.sampleRate);
    const d = buf.getChannelData(0);
    const n = d.length;
    write(d, ctx.sampleRate, (i, v) => {
      d[((i % n) + n) % n] += v;
    });
    let peak = 0;
    for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(d[i]));
    if (peak > 0) for (let i = 0; i < n; i++) d[i] *= 0.9 / peak;
    cache.set(id, buf);
  }
  const s = ctx.createBufferSource();
  s.buffer = buf;
  s.loop = true;
  return s;
}

/** A decaying sine "blip" with a pitch glide: bubbles, drops, pops. */
function blip(add: (i: number, v: number) => void, sr: number, at: number, f0: number, f1: number, dur: number, amp: number) {
  const len = Math.floor(dur * sr);
  const start = Math.floor(at * sr);
  let phase = 0;
  for (let i = 0; i < len; i++) {
    const t = i / len;
    const f = f0 + (f1 - f0) * t;
    phase += (2 * Math.PI * f) / sr;
    const env = Math.min(1, i / (sr * 0.003)) * Math.pow(1 - t, 2.2);
    add(start + i, Math.sin(phase) * env * amp);
  }
}

/** A short burst of (low-passed) noise: crackles, clicks, squelch texture. */
function crackle(add: (i: number, v: number) => void, sr: number, at: number, dur: number, amp: number, smooth: number) {
  const len = Math.floor(dur * sr);
  const start = Math.floor(at * sr);
  let y = 0;
  for (let i = 0; i < len; i++) {
    const t = i / len;
    y += (Math.random() * 2 - 1 - y) * smooth; // one-pole low-pass inside the event
    add(start + i, y * Math.pow(1 - t, 3) * amp);
  }
}

export function createProcedural(ctx: AudioContext, id: ProceduralId): ProceduralVoice {
  const out = ctx.createGain();
  const sources: AudioScheduledSourceNode[] = [];
  const start = (...s: AudioScheduledSourceNode[]) => {
    const when = ctx.currentTime + Math.random() * 0.05;
    for (const n of s) {
      // buffers start at a random point so two copies never play in phase
      if (n instanceof AudioBufferSourceNode && n.buffer) n.start(when, Math.random() * n.buffer.duration);
      else n.start(when);
      sources.push(n);
    }
  };
  const filtered = (src: AudioNode, type: BiquadFilterType, frequency: number, Q: number, gain: number) => {
    const f = new BiquadFilterNode(ctx, { type, frequency, Q });
    const g = new GainNode(ctx, { gain });
    src.connect(f).connect(g).connect(out);
    return { f, g };
  };

  switch (id) {
    case 'rumble': {
      // Earth: deep, slowly moving ground rumble + faint gravel
      const n = noiseSource(ctx, 0.6);
      const low = filtered(n, 'lowpass', 140, 0.7, 0.9);
      const sub = new OscillatorNode(ctx, { type: 'sine', frequency: 46 });
      const subG = new GainNode(ctx, { gain: 0.18 });
      sub.connect(subG).connect(out);
      const gravel = eventLoop(ctx, 'gravel', 7, (_d, sr, add) => {
        for (let k = 0; k < 18; k++) crackle(add, sr, Math.random() * 7, 0.03 + Math.random() * 0.05, 0.25, 0.25);
      });
      filtered(gravel, 'bandpass', 1400, 0.8, 0.25);
      start(n, sub, gravel, lfo(ctx, 0.09, 0.35, low.g.gain), lfo(ctx, 0.05, 60, low.f.frequency));
      out.gain.value = 1;
      break;
    }
    case 'steamHiss': {
      // Steam: soft kettle hiss, gently pulsing
      const n = noiseSource(ctx, 1.05);
      const hi = filtered(n, 'highpass', 2200, 0.5, 0.22);
      const n2 = noiseSource(ctx, 0.93);
      const band = filtered(n2, 'bandpass', 5200, 0.9, 0.12);
      start(n, n2, lfo(ctx, 0.35, 0.08, hi.g.gain), lfo(ctx, 0.17, 900, band.f.frequency));
      out.gain.value = 0.9;
      break;
    }
    case 'airy': {
      // Cloud: soft, breathy air
      const n = noiseSource(ctx, 0.85);
      const a = filtered(n, 'bandpass', 800, 0.45, 0.35);
      const n2 = noiseSource(ctx, 1.2);
      const b = filtered(n2, 'bandpass', 3200, 1.2, 0.05);
      start(n, n2, lfo(ctx, 0.08, 380, a.f.frequency), lfo(ctx, 0.11, 0.14, a.g.gain), lfo(ctx, 0.07, 0.025, b.g.gain));
      out.gain.value = 0.9;
      break;
    }
    case 'lavaBubble': {
      // Lava: thick bubbles + deep rumble + a little sizzle
      const bubbles = eventLoop(ctx, 'lava', 8, (_d, sr, add) => {
        for (let k = 0; k < 26; k++) {
          const f = 60 + Math.random() * 70;
          blip(add, sr, Math.random() * 8, f, f * (2.2 + Math.random()), 0.07 + Math.random() * 0.09, 0.5 + Math.random() * 0.5);
        }
        for (let k = 0; k < 10; k++) crackle(add, sr, Math.random() * 8, 0.04, 0.15, 0.6);
      });
      filtered(bubbles, 'lowpass', 1800, 0.5, 0.9);
      const n = noiseSource(ctx, 0.5);
      const low = filtered(n, 'lowpass', 110, 0.8, 0.8);
      start(bubbles, n, lfo(ctx, 0.12, 0.3, low.g.gain));
      out.gain.value = 0.95;
      break;
    }
    case 'mudSquelch': {
      // Mud: slow squelches and soft pops
      const squelch = eventLoop(ctx, 'mud', 9, (_d, sr, add) => {
        for (let k = 0; k < 9; k++) {
          const at = Math.random() * 9;
          const f = 180 + Math.random() * 120;
          blip(add, sr, at, f, f * 0.45, 0.18 + Math.random() * 0.12, 0.7);
          crackle(add, sr, at, 0.16, 0.35, 0.08);
        }
        for (let k = 0; k < 12; k++) blip(add, sr, Math.random() * 9, 120, 320, 0.05, 0.35);
      });
      filtered(squelch, 'lowpass', 1300, 0.9, 1);
      start(squelch);
      out.gain.value = 0.9;
      break;
    }
    case 'rain':
    case 'storm': {
      // Rain: wash of noise + many tiny drops. Storm adds a low wind roar.
      const heavy = id === 'storm';
      const n = noiseSource(ctx, 1);
      const wash = filtered(n, 'bandpass', 2600, 0.35, heavy ? 0.32 : 0.22);
      const drops = eventLoop(ctx, 'drops', 6, (_d, sr, add) => {
        for (let k = 0; k < 420; k++) {
          const f = 2500 + Math.random() * 3500;
          blip(add, sr, Math.random() * 6, f, f * 0.7, 0.006 + Math.random() * 0.01, 0.15 + Math.random() * 0.35);
        }
      });
      filtered(drops, 'highpass', 1500, 0.6, heavy ? 0.55 : 0.45);
      start(n, drops, lfo(ctx, 0.13, 0.05, wash.g.gain));
      if (heavy) {
        const w = noiseSource(ctx, 0.55);
        const roar = filtered(w, 'lowpass', 320, 0.6, 0.6);
        start(w, lfo(ctx, 0.1, 0.35, roar.g.gain), lfo(ctx, 0.06, 140, roar.f.frequency));
      }
      out.gain.value = 0.95;
      break;
    }
    case 'stone': {
      // Stone: a still, low, almost silent hum (it's a stone; mostly felt)
      const o = new OscillatorNode(ctx, { type: 'sine', frequency: 73 });
      const g = new GainNode(ctx, { gain: 0.12 });
      o.connect(g).connect(out);
      const n = noiseSource(ctx, 0.4);
      filtered(n, 'lowpass', 200, 0.5, 0.25);
      start(o, n, lfo(ctx, 0.04, 0.05, g.gain));
      out.gain.value = 0.8;
      break;
    }
    case 'embers': {
      // Ashes: sparse soft crackles over a faint warm hiss
      const crack = eventLoop(ctx, 'embers', 7, (_d, sr, add) => {
        for (let k = 0; k < 22; k++) crackle(add, sr, Math.random() * 7, 0.008 + Math.random() * 0.02, 0.3 + Math.random() * 0.7, 0.7);
      });
      filtered(crack, 'bandpass', 2400, 0.7, 0.6);
      const n = noiseSource(ctx, 0.8);
      filtered(n, 'lowpass', 700, 0.4, 0.06);
      start(crack, n);
      out.gain.value = 0.85;
      break;
    }
    // ---- archived desert placeholders (milestone 1-2) ----
    case 'sandHiss': {
      const n1 = noiseSource(ctx, 0.97 + Math.random() * 0.06);
      const a = filtered(n1, 'bandpass', 2600, 0.7, 0.32);
      const n2 = noiseSource(ctx, 1.11);
      const b = filtered(n2, 'bandpass', 6200, 1.2, 0.14);
      start(n1, n2, lfo(ctx, 0.13, 0.16, a.g.gain), lfo(ctx, 0.29, 0.08, b.g.gain), lfo(ctx, 0.07, 700, a.f.frequency));
      out.gain.value = 0.9;
      break;
    }
    case 'sunDrone': {
      const lp = new BiquadFilterNode(ctx, { type: 'lowpass', frequency: 700, Q: 0.8 });
      lp.connect(out);
      for (const [f, type, gain] of [[110, 'sine', 0.32], [164.8, 'triangle', 0.12], [220.6, 'sine', 0.14]] as [number, OscillatorType, number][]) {
        const o = new OscillatorNode(ctx, { type, frequency: f, detune: (Math.random() - 0.5) * 8 });
        const g = new GainNode(ctx, { gain });
        o.connect(g).connect(lp);
        start(o);
      }
      start(lfo(ctx, 0.045, 320, lp.frequency));
      out.gain.value = 0.85;
      break;
    }
    case 'nightAmbience': {
      const n = noiseSource(ctx, 0.5);
      filtered(n, 'lowpass', 320, 0.3, 0.5);
      for (const f of [55, 82.4, 110.2]) {
        const o = new OscillatorNode(ctx, { type: 'sine', frequency: f });
        const g = new GainNode(ctx, { gain: 0.09 });
        o.connect(g).connect(out);
        start(o);
      }
      start(n);
      out.gain.value = 0.95;
      break;
    }
  }

  return {
    output: out,
    stop() {
      for (const s of sources) {
        try {
          s.stop();
        } catch {
          /* not started */
        }
      }
      out.disconnect();
    },
  };
}
