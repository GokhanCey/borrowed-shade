import { CanvasTexture, Color, Group, Mesh, MeshBasicMaterial, PlaneGeometry, ShaderMaterial, Shape, ShapeGeometry, SRGBColorSpace, Vector2 } from '@iwsdk/core';
import { PLATES } from '../tale/plates.js';
import type { WeatherSky } from './weather-fx.js';

/**
 * WHAT YOUR HANDS MADE (The Four Elements).
 *
 * The outline stays simple to make. What it BECOMES is the reward, and it is the real thing, drawn
 * as well as the tale is drawn (the rule: "what I make should look simple; what it becomes
 * should look cool, and real"):
 *
 *   two fists      a heaped paper cumulus, lit from above, that breathes, follows the hands and darkens to rain
 *   two flat hands the wind itself: long white strokes that run across the sky and curl at the head
 *   the rakes      go up into the cloud and comb the rain out of it (the rain is the thing)
 *   coal and flame a living fire: layered tongues that lick and sway, with sparks
 *   two leaning hands  a mountain: a lit face and a shaded face, snow on the peak, pines at its foot
 *
 * The shape is still the reader's: it lifts off the screen as their own ink outline, in the place and
 * at the size they made it, and the thing grows out of it there, as wide and as tall as their hands
 * were. A one-handed reader gets the same whole thing.
 *
 * Board-local, like the weather. One picture per element, built once (nothing is allocated when a
 * sign is made except its ink outline).
 */
export type Element = 'cloud' | 'air' | 'water' | 'fire' | 'earth';

const DEFAULT_PLATE: Record<Element, string> = { cloud: 'woolsack', air: 'streamer', water: 'rake', fire: 'ember', earth: 'mountain' };
const INK = new Color('#1b1424');
const WATER = new Color('#9db6d4');
const WATER_EDGE = new Color('#4f6a8c');
const CLOUD_LIT = new Color('#ffffff');
const CLOUD_DARK = new Color('#7f7a92');
const Z0 = 0.0034;
/** the visible sky (the frame's bars start just outside) */
const X0 = -0.212;
const X1 = 0.212;
/** the band of sky the wind runs in (board y) */
const WIND_Y0 = 0.055;
const WIND_Y1 = 0.225;
/**
 * Draw order: after the rain (11), before the weather's cloud sprites (12), so the little grey cloud,
 * its eye and the puffs sit ON what you made, and nothing here ties with the advice slip (13).
 */
const RO = { back: 11.2, art: 11.4, edge: 11.6, fill: 11.8 };
/** how much bigger than the hands' own outline the thing is drawn (width, height) */
const GROW: Record<Element, [number, number]> = { cloud: [1.3, 0], air: [1, 1], water: [1, 1], fire: [2.5, 1.35], earth: [1.75, 2.3] };
/** where the mountain's summit is, up its picture */
const PEAK = 0.95;

interface Piece {
  el: Element;
  /** the reader's own outline, in ink */
  g: Group;
  fill: MeshBasicMaterial;
  edge: MeshBasicMaterial;
  /** half size of the whole thing at scale 1 (m), and where its middle is from the outline's origin */
  hw: number;
  hh: number;
  mid: number;
  /** already the thing (an element coming back, or moving on): no ink */
  paper: boolean;
  /** 0..1 from where it starts (the outline, or a point) to where it lives */
  k: number;
  dur: number;
  x0: number;
  y0: number;
  s0: number;
  tx: number;
  ty: number;
  ts: number;
  /** opacity (fades out when asked) */
  a: number;
  aT: number;
  age: number;
  hold: number;
}

const VERT = 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }';

/** a living fire: banded tongues (cut-paper colours) that lick upward and sway, a rounded foot, a few sparks */
const FLAME = `
precision mediump float;
varying vec2 vUv;
uniform float uTime;
uniform float uAlpha;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}
void main() {
  vec2 uv = vUv;
  float t = uTime;
  float n = noise(vec2(uv.x * 4.0, uv.y * 3.0 - t * 2.2)) * 0.65 + noise(vec2(uv.x * 9.0 + 3.0, uv.y * 6.0 - t * 3.4)) * 0.35;
  float sway = (noise(vec2(t * 0.9, uv.y * 1.5)) - 0.5) * 0.24 * uv.y;
  float x = uv.x - 0.5 - sway;
  float halfW = mix(0.33, 0.03, pow(uv.y, 1.2)) * (0.45 + 0.55 * smoothstep(0.0, 0.2, uv.y));
  float f = 1.0 - abs(x) / halfW;
  f += (n - 0.5) * (0.45 + 0.9 * uv.y);
  f -= uv.y * 0.22;
  f *= smoothstep(0.0, 0.05, uv.y);
  vec3 c = vec3(0.60, 0.11, 0.07);
  c = mix(c, vec3(0.93, 0.31, 0.09), step(0.22, f));
  c = mix(c, vec3(1.0, 0.60, 0.14), step(0.46, f));
  c = mix(c, vec3(1.0, 0.85, 0.36), step(0.72, f));
  c = mix(c, vec3(1.0, 0.97, 0.84), step(0.98, f));
  float a = smoothstep(0.02, 0.09, f);
  for (int i = 0; i < 4; i++) {
    float fi = float(i);
    float cyc = t * 0.55 + fi * 0.27;
    float ph = fract(cyc);
    float sx = 0.5 + 0.26 * sin(fi * 5.3 + floor(cyc) * 2.1) + 0.04 * sin(t * 5.0 + fi);
    float d = length((uv - vec2(sx, 0.34 + ph * 0.62)) * vec2(1.0, 1.3));
    float s = smoothstep(0.02, 0.007, d) * (1.0 - ph);
    c = mix(c, vec3(1.0, 0.86, 0.42), s);
    a = max(a, s);
  }
  gl_FragColor = vec4(c, a * uAlpha);
}`;

/** the wind: four long strokes that run across the sky, thick in the middle and fine at both ends, each curling in on itself at the head */
const WIND = `
precision mediump float;
varying vec2 vUv;
uniform float uTime;
uniform float uAlpha;
uniform float uAspect;
void main() {
  vec2 p = vec2(vUv.x * uAspect, vUv.y);
  float a = 0.0;
  for (int i = 0; i < 4; i++) {
    float fi = float(i);
    float lane = 0.17 + fi * 0.2 + 0.03 * sin(fi * 3.1);
    float cyc = fract(uTime * (0.13 + 0.07 * fract(fi * 0.618 + 0.2)) + fi * 0.29 + 0.11 * fi * fi);
    float head = (cyc * 1.75 - 0.25) * uAspect;
    float len = (0.5 + 0.1 * sin(fi * 2.3)) * uAspect;
    float xr = (head - p.x) / len;
    float yl = lane + 0.05 * sin(p.x * 2.4 + fi * 1.7 + uTime * 0.5);
    float w = 0.034 * pow(max(0.0, sin(clamp(xr, 0.0, 1.0) * 3.14159)), 0.5);
    float s = (xr > 0.0 && xr < 1.0) ? smoothstep(w, w * 0.4, abs(p.y - yl)) : 0.0;
    float r = 0.105;
    float yh = lane + 0.05 * sin(head * 2.4 + fi * 1.7 + uTime * 0.5);
    vec2 q = p - vec2(head, yh + r);
    float ang = atan(q.x, -q.y);
    if (ang < -0.25) ang += 6.28318;
    float u = ang / 5.4;
    float cw = 0.03 * (1.0 - u);
    float ring = (u > -0.05 && u < 1.0) ? smoothstep(cw, cw * 0.4, abs(length(q) - r * (1.0 - 0.5 * max(u, 0.0)))) : 0.0;
    a = max(a, max(s, ring) * smoothstep(0.0, 0.1, cyc) * smoothstep(1.0, 0.86, cyc));
  }
  a *= smoothstep(0.0, 0.07, vUv.x) * smoothstep(1.0, 0.93, vUv.x);
  vec3 col = mix(vec3(0.40, 0.48, 0.64), vec3(0.99, 0.97, 0.93), smoothstep(0.3, 0.85, a));
  gl_FragColor = vec4(col, smoothstep(0.0, 0.35, a) * uAlpha);
}`;

export class Made {
  readonly root = new Group();
  /** the plate each element was made with in this reading (the last spread brings them back) */
  plates: Partial<Record<Element, string>> = {};
  private pieces: Piece[] = [];
  private t = 0;
  private tmp = new Color();
  // the pictures (one of each, built once)
  private cloudBack: Mesh;
  private cloudFront: Mesh;
  private mountain: Mesh;
  private flame: Mesh;
  private wind: Mesh;
  private flameMat: ShaderMaterial;
  private windMat: ShaderMaterial;

  constructor(private sky: WeatherSky) {
    this.root.name = 'Made shapes';
    const unit = new PlaneGeometry(1, 1);
    const pic = (tex: CanvasTexture, order: number, name: string) => {
      const m = new Mesh(unit, new MeshBasicMaterial({ map: tex, transparent: true, opacity: 0, depthWrite: false }));
      m.name = name;
      m.renderOrder = order;
      m.visible = false;
      this.root.add(m);
      return m;
    };
    this.cloudBack = pic(cloudTexture(true), RO.back, 'Made cloud (back)');
    this.cloudFront = pic(cloudTexture(false), RO.art, 'Made cloud');
    this.mountain = pic(mountainTexture(), RO.art, 'Made mountain');
    this.flameMat = new ShaderMaterial({ vertexShader: VERT, fragmentShader: FLAME, uniforms: { uTime: { value: 0 }, uAlpha: { value: 0 } }, transparent: true, depthWrite: false });
    this.flame = new Mesh(unit, this.flameMat);
    this.flame.name = 'Made fire';
    this.flame.renderOrder = RO.art;
    this.flame.visible = false;
    const ww = X1 - X0;
    const wh = WIND_Y1 - WIND_Y0;
    this.windMat = new ShaderMaterial({ vertexShader: VERT, fragmentShader: WIND, uniforms: { uTime: { value: 0 }, uAlpha: { value: 0 }, uAspect: { value: ww / wh } }, transparent: true, depthWrite: false });
    this.wind = new Mesh(unit, this.windMat);
    this.wind.name = 'Made wind';
    this.wind.renderOrder = RO.art;
    this.wind.position.set((X0 + X1) / 2, (WIND_Y0 + WIND_Y1) / 2, Z0);
    this.wind.scale.set(ww, wh, 1);
    this.wind.visible = false;
    this.root.add(this.flame, this.wind);
  }

  /**
   * The outline the reader has just filled becomes the element. (bx, by) is the plate's base centre
   * on the screen, as the beat placed it; `to` is where the thing lives: [x, y, scale] (for earth,
   * y is the ground it stands on).
   */
  become(el: Element, plate: string, bx: number, by: number, to?: [number, number, number]): void {
    this.plates[el] = PLATES[plate] ? plate : DEFAULT_PLATE[el];
    this.spawn(el, this.plates[el]!, bx, by, false, to);
  }

  /** the element comes back (another page, or out of its jar): the same thing, growing from a point */
  again(el: Element, x: number, y: number, to?: [number, number, number]): void {
    this.spawn(el, this.plates[el] ?? DEFAULT_PLATE[el], x, y, true, to);
  }

  private spawn(el: Element, plate: string, x: number, y: number, small: boolean, to?: [number, number, number]): void {
    // one of each on a page (a new one replaces the old)
    this.drop(el);
    const d = PLATES[plate] ?? PLATES[DEFAULT_PLATE[el]];
    const rings = d.shape;
    // the bounding box of what the hands made (mm, plate coordinates: origin at the base centre)
    let x0 = Infinity;
    let x1 = -Infinity;
    let y0 = Infinity;
    let y1 = -Infinity;
    let tipX = 0;
    for (const ring of rings) for (const [px, py] of ring) {
      x0 = Math.min(x0, px);
      x1 = Math.max(x1, px);
      y0 = Math.min(y0, py);
      if (py > y1) {
        y1 = py;
        tipX = px;
      }
    }
    const cx = (x0 + x1) / 2;
    const cy = (y0 + y1) / 2;
    const halfW = (x1 - x0) / 2000;
    const hh = (y1 - y0) / 2000;
    const shape = (ring: [number, number][], grow = 1) => {
      // (each ring grown about its own middle: an even rim round every hand)
      let mx = 0;
      let my = 0;
      for (const [px, py] of ring) {
        mx += px;
        my += py;
      }
      mx /= ring.length;
      my /= ring.length;
      return new Shape(ring.map(([px, py]) => new Vector2((mx + (px - mx) * grow - cx) * 0.001, (my + (py - my) * grow - cy) * 0.001)));
    };
    // one hand made half of a cloud or a mountain: the thing is still whole, as wide as two hands
    // (beside the hand for a cloud; on the side the hand leans to for a mountain)
    const half = d.hands === 1 && el === 'cloud';
    const axis = !half ? 0 : el === 'cloud' || tipX >= cx ? x1 + 4 : x0 - 4;
    const mid = half ? (axis - cx) * 0.001 : 0;
    const hw = half ? halfW * 2 + 0.004 : halfW;
    const fill = new MeshBasicMaterial({ color: INK.clone(), transparent: true, opacity: 0.9, depthWrite: false });
    const edge = new MeshBasicMaterial({ color: INK.clone(), transparent: true, opacity: 0.9, depthWrite: false });
    const g = new Group();
    g.name = `Made ${el} (outline)`;
    const back = new Mesh(new ShapeGeometry(rings.map((r) => shape(r, 1.07))), edge);
    back.position.set(0.0006, -0.0006, -0.00005);
    back.renderOrder = RO.edge;
    const front = new Mesh(new ShapeGeometry(rings.map((r) => shape(r))), fill);
    front.renderOrder = RO.fill;
    g.add(back, front);
    this.root.add(g);
    // lifting off the screen: exactly where the outline was (the plate's origin is its base centre)
    const p: Piece = {
      el, g, fill, edge, hw, hh, mid, paper: small, k: 0, dur: small ? 1.1 : 1.15,
      x0: small ? x : x + cx * 0.001, y0: small ? y : y + cy * 0.001, s0: 1, tx: x, ty: y, ts: 1,
      a: 1, aT: 1, age: 0, hold: 1.7,
    };
    if (el === 'cloud') [p.tx, p.ty, p.ts] = to ?? [x, 0.17, 0.8];
    else if (el === 'water') [p.tx, p.ty, p.ts] = to ?? [x, 0.15, 0.5];
    else if (el === 'fire') [p.tx, p.ty, p.ts] = to ?? [x, 0.07, 0.8];
    else if (el === 'earth') {
      const [ex, ground, es] = to ?? [x, 0.03, 1.25];
      [p.tx, p.ty, p.ts] = [ex, ground + hh * es, es];
    } else {
      // the wind: the two hands sweep off along the sky and are drawn out into it
      p.ts = 1;
      p.tx = p.x0 + 0.05;
      p.ty = p.y0;
    }
    // a thing with a middle of its own (a completed half) stands with that middle on its place
    if (el !== 'air') p.tx -= mid * p.ts;
    if (small) {
      p.s0 = 0.2 * p.ts;
      p.hold = 2.6;
    }
    g.position.set(p.x0, p.y0, Z0 + 0.00004);
    g.visible = false;
    this.pieces.push(p);
    if (el === 'cloud') {
      this.sky.shapeHalf = hw * p.ts * GROW.cloud[0] * 0.86;
      this.sky.shapeBottom = hw * p.ts * GROW.cloud[0] * CLOUD_ASPECT * 0.62;
    }
  }

  /** an element moves on, as the thing it is (the fire sinks down the chimney) */
  moveTo(el: Element, x: number, y: number, scale: number, seconds = 1.2): void {
    for (const p of this.pieces) if (p.el === el) {
      p.x0 = p.g.position.x;
      p.y0 = p.g.position.y;
      p.s0 = p.g.scale.x;
      p.tx = x - p.mid * scale;
      p.ty = y;
      p.ts = scale;
      p.k = 0;
      p.dur = seconds;
      p.paper = true;
    }
  }

  /** let an element go (it fades) */
  fade(el: Element): void {
    for (const p of this.pieces) if (p.el === el) p.aT = 0;
  }

  /** the page is turning or the book is closing: everything made fades with the scenery */
  fadeAll(): void {
    for (const p of this.pieces) p.aT = 0;
  }

  /** the top of an element standing on the screen (board y), or NaN */
  top(el: Element): number {
    for (const p of this.pieces) if (p.el === el) return el === 'earth' ? p.ty - p.hh * p.ts + 2 * p.hh * p.ts * GROW.earth[1] * PEAK : p.ty + p.hh * p.ts;
    return NaN;
  }

  private picture(el: Element): Mesh | null {
    return el === 'cloud' ? this.cloudFront : el === 'earth' ? this.mountain : el === 'fire' ? this.flame : el === 'air' ? this.wind : null;
  }

  private drop(el: Element): void {
    for (let i = this.pieces.length - 1; i >= 0; i--) {
      const p = this.pieces[i];
      if (p.el !== el) continue;
      this.remove(p);
      this.pieces.splice(i, 1);
    }
    if (el === 'cloud') this.sky.shapeHalf = 0;
  }

  private remove(p: Piece): void {
    p.g.removeFromParent();
    for (const c of p.g.children) (c as Mesh).geometry.dispose();
    p.fill.dispose();
    p.edge.dispose();
    const pic = this.picture(p.el);
    if (pic) pic.visible = false;
    if (p.el === 'cloud') this.cloudBack.visible = false;
  }

  /** a page ends: nothing made stays on the screen (the plates are remembered) */
  clear(): void {
    for (const p of this.pieces) this.remove(p);
    this.pieces.length = 0;
    this.sky.shapeHalf = 0;
  }

  /** a reading ends: forget what was made */
  reset(): void {
    this.clear();
    this.plates = {};
  }

  update(dt: number): void {
    if (!this.pieces.length) return;
    this.t += dt;
    const t = this.t;
    this.flameMat.uniforms.uTime.value = t;
    this.windMat.uniforms.uTime.value = t;
    for (let i = this.pieces.length - 1; i >= 0; i--) {
      const p = this.pieces[i];
      p.age += dt;
      p.k = Math.min(1, p.k + dt / p.dur);
      const e = p.k * p.k * (3 - 2 * p.k);
      p.a += (p.aT - p.a) * Math.min(1, dt * 2.2);
      if (p.aT === 0 && p.a < 0.02) {
        this.remove(p);
        this.pieces.splice(i, 1);
        if (p.el === 'cloud') this.sky.shapeHalf = 0;
        continue;
      }
      let alpha = p.a;
      let s = p.s0 + (p.ts - p.s0) * e;
      let x = p.x0 + (p.tx - p.x0) * e;
      let y = p.y0 + (p.ty - p.y0) * e;
      // the reader's ink gives way to the thing: the outline thins out as the picture comes up through it
      const ink = p.paper ? 0 : 1 - smooth(e / 0.7);
      const art = p.paper ? 1 : smooth((e - 0.18) / 0.62);
      // (the picture swells into place with a small overshoot)
      const pop = p.paper ? 1 : 0.72 + 0.28 * backOut(art);
      let inkX = 1;
      if (p.el === 'cloud') {
        // once it is a cloud it goes where the weather's cloud goes (it follows your hands, it rains)
        x = p.x0 + (this.sky.cloudX - p.mid * p.ts - p.x0) * e;
        y = p.y0 + (this.sky.cloudY - p.y0) * e + Math.sin(t * 0.7) * 0.0012 * e;
        if (!this.sky.cloudOn) alpha *= this.sky.cloudGrow;
        const w = 2 * p.hw * s * GROW.cloud[0] * pop;
        const h = w * CLOUD_ASPECT;
        const breathe = 1 + 0.018 * Math.sin(t * 0.9);
        const mx = x + p.mid * s;
        this.tmp.copy(CLOUD_LIT).lerp(CLOUD_DARK, this.sky.cloudDark * 0.85);
        for (const [m, k] of [[this.cloudBack, 0], [this.cloudFront, 1]] as const) {
          // the back heap leans the other way and drifts a little against the front: it billows
          m.position.set(mx + (k ? 0 : -0.035 * w + 0.004 * Math.sin(t * 0.5) * s), y + (k ? 0 : 0.07 * h + 0.002 * Math.sin(t * 0.63 + 1) * s), Z0 + k * 0.00002);
          m.scale.set((k ? 1 : -0.92) * w * breathe, h * (2 - breathe) * (k ? 1 : 0.94), 1);
          const mat = m.material as MeshBasicMaterial;
          mat.opacity = alpha * art;
          mat.color.copy(this.tmp);
          if (!k) mat.color.multiplyScalar(0.95);
          m.visible = mat.opacity > 0.01;
        }
      } else if (p.el === 'air') {
        // the hands are drawn out along the sky and thin away into the wind they made
        inkX = 1 + 1.6 * e;
        const wind = Math.min(1, this.sky.windAmount * 3);
        this.windMat.uniforms.uAlpha.value = alpha * art * (p.paper ? 1 : 0.35 + 0.65 * wind);
        this.wind.visible = alpha * art > 0.01;
      } else if (p.el === 'water') {
        // your rakes go up into the cloud and comb the rain out of it
        if (this.sky.cloudGrow > 0.3) {
          x = p.x0 + (this.sky.cloudX - p.x0) * e;
          y = p.y0 + (this.sky.cloudY - 0.012 - p.y0) * e;
        }
        if (e >= 1 && p.aT > 0 && p.age > p.hold) p.aT = 0;
      } else if (p.el === 'fire') {
        const w = 2 * p.hw * s * GROW.fire[0] * pop;
        const h = 2 * p.hh * s * GROW.fire[1] * pop;
        this.flame.position.set(x + p.mid * s, y - p.hh * s + h / 2 - 0.002 * s, Z0);
        this.flame.scale.set(w, h, 1);
        this.flameMat.uniforms.uAlpha.value = alpha * art;
        this.flame.visible = alpha * art > 0.01;
      } else {
        // earth: it comes up out of the ground and stands
        const w = 2 * p.hw * s * GROW.earth[0];
        const h = 2 * p.hh * s * GROW.earth[1] * (p.paper ? 1 : 0.15 + 0.85 * backOut(art));
        this.mountain.position.set(x + p.mid * s, y - p.hh * s + h / 2, Z0);
        this.mountain.scale.set(w, h, 1);
        const mat = this.mountain.material as MeshBasicMaterial;
        mat.opacity = alpha * Math.min(1, art * 1.6);
        this.mountain.visible = mat.opacity > 0.01;
      }
      if (p.el === 'water') {
        const ce = p.paper ? 1 : e;
        p.fill.color.copy(INK).lerp(WATER, ce);
        p.edge.color.copy(INK).lerp(WATER_EDGE, ce);
        p.fill.opacity = alpha;
        p.edge.opacity = alpha * 0.9;
      } else {
        p.fill.opacity = alpha * ink * 0.9;
        p.edge.opacity = alpha * ink * 0.8;
      }
      p.g.position.x = x;
      p.g.position.y = y;
      p.g.scale.set(s * inkX, s, 1);
      p.g.visible = p.fill.opacity > 0.01;
    }
  }
}

function smooth(v: number): number {
  const k = Math.max(0, Math.min(1, v));
  return k * k * (3 - 2 * k);
}
function backOut(v: number): number {
  const k = Math.max(0, Math.min(1, v)) - 1;
  return 1 + 2.2 * k * k * k + 1.2 * k * k;
}
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

// ---- the pictures (painted once) ------------------------------------------------------------------

const CLOUD_W = 768;
const CLOUD_H = 420;
/** height over width of the cloud's picture */
const CLOUD_ASPECT = CLOUD_H / CLOUD_W;

/** a heaped cumulus cut from layered paper: lit from above, lilac in its folds, a flat grey belly */
function cloudTexture(back: boolean): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = CLOUD_W;
  c.height = CLOUD_H;
  const g = c.getContext('2d')!;
  // the heaps behind, then the ones in front (x, y, r)
  const far: [number, number, number][] = back
    ? [[170, 250, 95], [300, 185, 120], [450, 165, 125], [585, 235, 100]]
    : [[150, 262, 82], [262, 196, 112], [398, 152, 132], [532, 196, 112], [632, 262, 78]];
  const near: [number, number, number][] = back ? [] : [[218, 286, 70], [340, 262, 92], [478, 276, 86], [578, 296, 60]];
  const all = [...far, ...near];
  const belly = () => {
    g.beginPath();
    for (const [x, y, r] of all) {
      g.moveTo(x + r, y);
      g.arc(x, y, r, 0, Math.PI * 2);
    }
    g.roundRect(105, 250, 570, 100, 50);
  };
  // the sheet behind it: the shadow a cut piece of paper throws
  g.save();
  g.shadowColor = 'rgba(38, 34, 66, 0.5)';
  g.shadowBlur = 16;
  g.shadowOffsetX = 5;
  g.shadowOffsetY = 9;
  const body = g.createLinearGradient(0, 30, 0, 350);
  body.addColorStop(0, back ? '#f6f6fb' : '#ffffff');
  body.addColorStop(0.6, back ? '#e6e7f1' : '#fbfaf8');
  body.addColorStop(1, back ? '#c9cbdd' : '#dfe0ec');
  g.fillStyle = body;
  belly();
  g.fill();
  g.restore();
  g.save();
  belly();
  g.clip();
  const heap = (x: number, y: number, r: number, rim: boolean) => {
    if (rim) {
      // a heap in front: its own sheet, with the fold's shadow under its edge
      g.save();
      g.shadowColor = 'rgba(90, 92, 130, 0.3)';
      g.shadowBlur = 14;
      g.shadowOffsetY = -5;
      const f = g.createLinearGradient(0, y - r, 0, y + r);
      f.addColorStop(0, '#ffffff');
      f.addColorStop(1, '#eeeef6');
      g.fillStyle = f;
      g.beginPath();
      g.arc(x, y, r, 0, Math.PI * 2);
      g.fill();
      g.restore();
    }
    // light from above and the left
    const hi = g.createRadialGradient(x - r * 0.35, y - r * 0.45, r * 0.05, x - r * 0.2, y - r * 0.25, r * 1.05);
    hi.addColorStop(0, 'rgba(255, 255, 255, 0.95)');
    hi.addColorStop(1, 'rgba(255, 255, 255, 0)');
    g.fillStyle = hi;
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
    // the fold on its lower right
    const lo = g.createRadialGradient(x - r * 0.25, y - r * 0.3, r * 0.75, x, y, r * 1.12);
    lo.addColorStop(0, 'rgba(126, 130, 172, 0)');
    lo.addColorStop(1, back ? 'rgba(120, 124, 160, 0.26)' : 'rgba(140, 146, 184, 0.2)');
    g.fillStyle = lo;
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
  };
  for (const [x, y, r] of far) heap(x, y, r, false);
  for (const [x, y, r] of near) heap(x, y, r, true);
  // the flat grey belly
  const under = g.createLinearGradient(0, 262, 0, 352);
  under.addColorStop(0, 'rgba(120, 124, 164, 0)');
  under.addColorStop(1, 'rgba(124, 130, 170, 0.4)');
  g.fillStyle = under;
  g.fillRect(0, 262, CLOUD_W, 100);
  // the paper's grain
  const r = rng(7);
  for (let i = 0; i < 1400; i++) {
    g.fillStyle = r() > 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(70,70,110,0.035)';
    g.fillRect(r() * CLOUD_W, r() * CLOUD_H, 2, 2);
  }
  g.restore();
  // the cut edge
  g.strokeStyle = back ? 'rgba(104, 106, 140, 0.55)' : 'rgba(128, 132, 164, 0.6)';
  g.lineWidth = 2.5;
  belly();
  g.stroke();
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** a mountain in layered paper: a far shoulder, the peak with a lit face and a shaded face, snow, strata, pines at its foot */
function mountainTexture(): CanvasTexture {
  const W = 640;
  const H = 512;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d')!;
  const B = H - 4;
  const poly = (pts: number[][]) => {
    g.beginPath();
    pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
    g.closePath();
  };
  const cast = (blur: number, oy: number) => {
    g.shadowColor = 'rgba(20, 14, 26, 0.55)';
    g.shadowBlur = blur;
    g.shadowOffsetX = 4;
    g.shadowOffsetY = oy;
  };
  const summit = [322, H - H * PEAK];
  const left = [[70, B], [150, 392], [186, 404], [240, 232], [268, 250], summit];
  const right = [[366, 124], [390, 110], [452, 276], [478, 262], [540, 392], [600, B]];
  const ridge = [summit, [340, 150], [312, 262], [346, 384], [330, B]];
  // the far shoulder (bluer: it is further off)
  g.save();
  cast(10, 4);
  const far = g.createLinearGradient(0, 230, 0, B);
  far.addColorStop(0, '#77708a');
  far.addColorStop(1, '#4f475c');
  g.fillStyle = far;
  poly([[12, B], [96, 372], [128, 388], [176, 262], [206, 300], [300, B]]);
  g.fill();
  g.restore();
  g.fillStyle = '#e4e2ee';
  poly([[176, 262], [206, 300], [196, 318], [184, 300], [170, 322], [160, 304]]);
  g.fill();
  // the peak: one sheet with its shadow, then its two faces
  g.save();
  cast(14, 6);
  g.fillStyle = '#6a5444';
  poly([...left, ...right]);
  g.fill();
  g.restore();
  const lit = g.createLinearGradient(120, 60, 330, B);
  lit.addColorStop(0, '#c9ab86');
  lit.addColorStop(1, '#8c6f55');
  g.fillStyle = lit;
  poly([...left, ...ridge.slice(1)]);
  g.fill();
  const shade = g.createLinearGradient(340, 60, 560, B);
  shade.addColorStop(0, '#7a6050');
  shade.addColorStop(1, '#49382f');
  g.fillStyle = shade;
  poly([...ridge.slice().reverse(), ...right]);
  g.fill();
  // strata and crags, inside the peak
  g.save();
  poly([...left, ...right]);
  g.clip();
  g.lineCap = 'round';
  for (const [x0, y0, x1, y1, w, dark] of [
    [150, 440, 250, 300, 5, 0], [196, 470, 286, 330, 4, 0], [250, 470, 306, 380, 4, 0], [122, 470, 176, 410, 4, 0],
    [372, 250, 430, 400, 5, 1], [410, 230, 500, 430, 4, 1], [366, 360, 400, 460, 4, 1], [470, 330, 546, 470, 4, 1],
  ]) {
    g.strokeStyle = dark ? 'rgba(20, 12, 10, 0.28)' : 'rgba(74, 52, 36, 0.26)';
    g.lineWidth = w;
    g.beginPath();
    g.moveTo(x0, y0);
    g.lineTo(x1, y1);
    g.stroke();
  }
  // snow on the peak: a torn lower edge, bright on the lit face, blue on the shaded one
  const snow = [[232, 258], [252, 204], [270, 236], [292, 176], [310, 214], [330, 168], [350, 212], [368, 170], [388, 216], [408, 180], [436, 250], [460, 60], [322, -20], [200, 60]];
  g.save();
  cast(6, 3);
  g.fillStyle = '#fdfaf2';
  poly(snow);
  g.fill();
  g.restore();
  g.save();
  poly([...ridge.slice().reverse(), ...right]);
  g.clip();
  g.fillStyle = 'rgba(128, 146, 190, 0.5)';
  poly(snow);
  g.fill();
  g.restore();
  // the ridge itself: a fine dark crease
  g.strokeStyle = 'rgba(40, 28, 22, 0.35)';
  g.lineWidth = 2.5;
  g.beginPath();
  ridge.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
  g.stroke();
  g.restore();
  // the cut edge of the peak
  g.strokeStyle = 'rgba(36, 26, 22, 0.75)';
  g.lineWidth = 3;
  g.lineJoin = 'round';
  poly([...left, ...right]);
  g.stroke();
  // the foothills in front, with pines
  g.save();
  cast(12, -5);
  const hill = g.createLinearGradient(0, 400, 0, B);
  hill.addColorStop(0, '#56634a');
  hill.addColorStop(1, '#333d2e');
  g.fillStyle = hill;
  g.beginPath();
  g.moveTo(24, B);
  g.quadraticCurveTo(110, 418, 214, 452);
  g.quadraticCurveTo(300, 478, 392, 446);
  g.quadraticCurveTo(500, 410, 626, B);
  g.closePath();
  g.fill();
  g.restore();
  for (const [x, y, s] of [[96, 458, 1], [132, 446, 1.25], [170, 452, 0.9], [452, 440, 1.2], [492, 436, 0.95], [528, 450, 1.3], [566, 470, 0.9], [300, 470, 0.8]]) {
    g.fillStyle = '#26332a';
    for (let k = 0; k < 3; k++) {
      const w = (16 - k * 3.5) * s;
      const top = y - (18 + k * 13) * s;
      poly([[x - w, top + 20 * s], [x + w, top + 20 * s], [x, top]]);
      g.fill();
    }
    g.fillStyle = 'rgba(190, 210, 170, 0.22)';
    poly([[x - 12 * s, y + 2 * s], [x, y - 44 * s], [x - 2 * s, y + 2 * s]]);
    g.fill();
  }
  // the paper's grain
  const r = rng(11);
  g.globalCompositeOperation = 'source-atop';
  for (let i = 0; i < 2600; i++) {
    g.fillStyle = r() > 0.5 ? 'rgba(255,240,220,0.05)' : 'rgba(20,10,10,0.05)';
    g.fillRect(r() * W, r() * H, 2, 2);
  }
  g.globalCompositeOperation = 'source-over';
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
