import {
  AdditiveBlending,
  CanvasTexture,
  Color,
  DoubleSide,
  Group,
  InstancedBufferAttribute,
  InstancedMesh,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  SRGBColorSpace,
} from '@iwsdk/core';
import { STAGE_X0, STAGE_X1, STAGE_Y0, STAGE_Y1 } from '../tale/plate-core.js';
import type { ScreenField } from '../tale/screen-field.js';

/**
 * THE WEATHER ON THE SKY SHEET (The Weathermaker's Apprentice).
 * Everything is cut paper laid on the shadow screen, in board-local metres (x from the screen centre,
 * positive right; y up from the stage bottom; the stage is STAGE_X0..X1 = ±0.23 by STAGE_Y0..Y1 = 0..0.25,
 * the caption ribbon sits above it).
 *   cloud     a layered paper cloud (3 instances) that grows from a puff and can ride your shadow's x
 *   rain      INK streaks (rain in a lantern beam is shadow) from the cloud's span to the ground; a streak
 *             that meets your hand shadow stops on top of it with a little splash (the shelter)
 *   wind      paper gust curls crossing the screen
 *   warm      a soft additive amber glow
 *   storm     a torn, darkening sky band with an occasional pale torn-light flash
 *   Tagalong  a 20 mm grey cloud with two dot eyes: rides the top of your shadow, waits on a shelf,
 *             hides in your shadow, rains its teaspoon, turns white and drifts away
 *   puff      a burst of paper scraps and a curl ring
 * Draw calls: at most 4 (sky band, glow, one instanced mesh of bits, one instanced mesh of clouds),
 * each hidden when it has nothing to show. No allocation per frame.
 */
export type TagMode = 'hidden' | 'shelf' | 'ride' | 'hide' | 'rain' | 'white';

const INK = '#1b1424';
const PAPER = '#f3e6cc';
const AMBER = '#ffcf8a';
/** rain lands here (board y) */
const GROUND = 0.03;
/** the visible screen inside the frame (the frame covers the outer 12 mm) */
const VIS_X0 = STAGE_X0 + 0.012;
const VIS_X1 = STAGE_X1 - 0.012;

/** z above the screen (screen 0.0008, captions 0.0022, screen acts 0.0031..0.0036) */
const Z = { band: 0.0026, glow: 0.0027, torn: 0.00285, rain: 0.003, splash: 0.00302, gust: 0.0031, scrap: 0.0033, cloud: 0.0033, tag: 0.0036, eye: 0.0037 };
/** renderOrders: above the screen (0), under captions (13/20) and plate outlines (14) */
export const WEATHER_RENDER_ORDER = { band: 10, glow: 10, bits: 11, clouds: 12 } as const;

// ---- atlas cells (8 x 4 cells of 128 px) ------------------------------------------------------
const C_CLOUD = 0;
const C_CLOUD2 = 1;
const C_TAG = 2;
const C_EYE = 3;
const C_BLINK = 4;
const C_STREAK = 5;
const C_SPLASH = 6;
const C_GUST = 7;
const C_GUST2 = 8;
const C_SCRAP = 9;
const C_SCRAP2 = 10;
const C_TORN = 11;
const C_RING = 12;

/** a cloud cell: visible shape spans x 4..124 px, y 32..100 px of 128 (bottom 0.281 of the quad below centre) */
const CLOUD_VIS_W = 118 / 128;
const CLOUD_BOTTOM = (100 - 64) / 128;
/** the Tagalong cell: 100 px wide */
const TAG_VIS_W = 100 / 128;
/** size 1 = about 70 mm wide */
const CLOUD_W = 0.07 / CLOUD_VIS_W;
/** the Tagalong is about 20 mm wide */
const TAG_W = 0.02 / TAG_VIS_W;

// ---- the bits mesh: index ranges ----------------------------------------------------------------
const MAXR = 120; // rain streaks
const MAXC = 16; // the Tagalong's curtain
const MAXS = 24; // splashes
const MAXG = 12; // gust curls
const MAXP = 32; // puff scraps and rings
const MAXT = 1; // the torn-light flash
const R0 = 0;
const C0 = R0 + MAXR;
const S0 = C0 + MAXC;
const G0 = S0 + MAXS;
const P0 = G0 + MAXG;
const T0 = P0 + MAXP;
const NBITS = T0 + MAXT;
const NSTREAK = MAXR + MAXC;
/** the clouds mesh: back, main, front, Tagalong, two eyes */
const NCLOUD = 6;

/** ground-truth cell of the screen grid (shelter sampling step) */
const CELL = 0.002656;
/** where the Tagalong looks for a shadow top around its x (m) */
const OFFS = [0, -0.008, 0.008, -0.02, 0.02, -0.04, 0.04, -0.08, 0.08];

const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
const approach = (v: number, t: number, step: number) => (v < t ? Math.min(t, v + step) : Math.max(t, v - step));
const ease = (dt: number, rate: number) => 1 - Math.exp(-dt * rate);
const backOut = (t: number) => {
  const u = t - 1;
  return 1 + 2.70158 * u * u * u + 1.70158 * u * u;
};
const pulse = (t: number, t0: number, d: number) => (t >= t0 && t <= t0 + d ? Math.sin((Math.PI * (t - t0)) / d) : 0);

/** one instanced quad mesh whose pictures come from the atlas, with a per-instance cell and opacity */
class Sprites {
  readonly mesh: InstancedMesh;
  private mat: Float32Array;
  private cell: Float32Array;
  private opa: Float32Array;
  private col: Float32Array;
  private aCell: InstancedBufferAttribute;
  private aOpa: InstancedBufferAttribute;

  constructor(n: number, material: MeshBasicMaterial, name: string, renderOrder: number) {
    const geo = new PlaneGeometry(1, 1);
    this.aCell = new InstancedBufferAttribute(new Float32Array(n), 1);
    this.aOpa = new InstancedBufferAttribute(new Float32Array(n), 1);
    geo.setAttribute('aCell', this.aCell);
    geo.setAttribute('aOpa', this.aOpa);
    this.mesh = new InstancedMesh(geo, material, n);
    this.mesh.instanceColor = new InstancedBufferAttribute(new Float32Array(n * 3).fill(1), 3);
    this.mesh.name = name;
    this.mesh.renderOrder = renderOrder;
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
    this.mat = this.mesh.instanceMatrix.array as Float32Array;
    this.cell = this.aCell.array as Float32Array;
    this.opa = this.aOpa.array as Float32Array;
    this.col = this.mesh.instanceColor.array as Float32Array;
    for (let i = 0; i < n; i++) this.hide(i);
  }

  /** a quad at (x, y, z), size sx × sy (negative sx mirrors), turned by angle (c = cos, s = sin) */
  put(i: number, x: number, y: number, z: number, sx: number, sy: number, c: number, s: number, cell: number, a: number, col: Color): void {
    const e = this.mat;
    const o = i * 16;
    e[o] = sx * c;
    e[o + 1] = sx * s;
    e[o + 2] = 0;
    e[o + 3] = 0;
    e[o + 4] = -sy * s;
    e[o + 5] = sy * c;
    e[o + 6] = 0;
    e[o + 7] = 0;
    e[o + 8] = 0;
    e[o + 9] = 0;
    e[o + 10] = 1;
    e[o + 11] = 0;
    e[o + 12] = x;
    e[o + 13] = y;
    e[o + 14] = z;
    e[o + 15] = 1;
    this.cell[i] = cell;
    this.opa[i] = a;
    this.col[i * 3] = col.r;
    this.col[i * 3 + 1] = col.g;
    this.col[i * 3 + 2] = col.b;
  }

  hide(i: number): void {
    const e = this.mat;
    const o = i * 16;
    for (let k = 0; k < 16; k++) e[o + k] = 0;
    e[o + 15] = 1;
    this.opa[i] = 0;
  }

  flush(): void {
    this.mesh.instanceMatrix.needsUpdate = true;
    this.aCell.needsUpdate = true;
    this.aOpa.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
}

export class WeatherSky {
  readonly root = new Group();
  private field: ScreenField;
  private bits: Sprites;
  private clouds: Sprites;
  private band: Mesh;
  private bandMat: MeshBasicMaterial;
  private glow: Mesh;
  private glowMat: MeshBasicMaterial;
  private t = 0;

  // colours (linear, reused)
  private cInk = new Color(INK);
  private cRain = new Color('#2c4a80');
  private cPaper = new Color('#ffffff');
  private cPale = new Color('#fff1d6');
  private cStorm = new Color('#2a2236');
  private cTagGrey = new Color('#aaa4b6');
  private cTagHide = new Color('#5a536c');
  private cEyePale = new Color(PAPER);
  private cLayer = [new Color('#ddd3c3'), new Color('#ffffff'), new Color('#f2ece2')];
  private cLayerDark = [new Color('#3b3549'), new Color('#5d5769'), new Color('#6c667a')];
  private tmp = new Color();
  private tmp2 = new Color();

  // ---- the cloud ----
  private cOn = false;
  private cx = 0;
  private cy = 0.17;
  private ctx = 0;
  private cty = 0.17;
  private cSize = 1;
  private cSizeT = 1;
  private cFollow = false;
  private cDark = 0;
  private cDarkT = 0;
  /** growth 0..1 (up when on, down when off) */
  private cg = 0;

  // ---- rain ----
  private rainT = 0;
  private rainA = 0;
  private slantT = 0;
  private slant = 0;
  private sx = new Float32Array(NSTREAK);
  private sy = new Float32Array(NSTREAK);
  private sk = new Float32Array(NSTREAK);
  private sl = new Float32Array(NSTREAK);
  private sv = new Float32Array(NSTREAK);
  private sw = new Float32Array(NSTREAK);
  private so = new Float32Array(NSTREAK);
  private sStop = new Float32Array(NSTREAK);
  private sAge = new Float32Array(NSTREAK);
  private sDel = new Float32Array(NSTREAK);
  private sOn = new Uint8Array(NSTREAK);
  private sHit = new Uint8Array(NSTREAK);
  private seq = 0;
  private sheltered = 0;

  // ---- splashes ----
  private px = new Float32Array(MAXS);
  private py = new Float32Array(MAXS);
  private pAge = new Float32Array(MAXS).fill(9);
  private pNext = 0;

  // ---- wind ----
  private windT = 0;
  private windA = 0;
  private windDir: 1 | -1 = 1;
  private gx = new Float32Array(MAXG);
  private gy0 = new Float32Array(MAXG);
  private gSp = new Float32Array(MAXG);
  private gPh = new Float32Array(MAXG);
  private gSc = new Float32Array(MAXG);
  private gDir = new Int8Array(MAXG);
  private gCell = new Uint8Array(MAXG);
  private gDel = new Float32Array(MAXG);
  private gOn = new Uint8Array(MAXG);

  // ---- puffs ----
  private qx = new Float32Array(MAXP);
  private qy = new Float32Array(MAXP);
  private qvx = new Float32Array(MAXP);
  private qvy = new Float32Array(MAXP);
  private qr = new Float32Array(MAXP);
  private qvr = new Float32Array(MAXP);
  private qAge = new Float32Array(MAXP).fill(9);
  private qLife = new Float32Array(MAXP).fill(1);
  private qSz = new Float32Array(MAXP);
  private qCell = new Uint8Array(MAXP);
  private qNext = 0;
  private puffs = 0;

  // ---- warmth ----
  private warmT = 0;
  private warmA = 0;
  private wx = 0;
  private wy = 0.06;
  private wr = 0.06;
  private wxT = 0;
  private wyT = 0.06;
  private wrT = 0.06;

  // ---- storm ----
  private stormT = 0;
  private stormA = 0;
  private flashIn = 3;
  private flashT = 9;
  private flashX = 0;
  private flashes = 0;

  // ---- the Tagalong ----
  private mode: TagMode = 'hidden';
  private tx = -0.16;
  private ty = 0.14;
  private tvx = 0;
  private tvy = 0;
  private tgX = -0.16;
  private tgY = 0.14;
  private shelfX = -0.16;
  private shelfY = 0.14;
  private tVis = 0;
  private tWhite = 0;
  private tHide = 0;
  private tRain = 0;
  private sq = 0;
  private sqv = 0;
  private air = false;
  private lands = 0;
  private blinkIn = 2.5;
  private blinkT = 9;
  private lookX = 0;
  private lost = 9;
  private qT = 0;
  private qFrames = -1;
  private riding = false;
  private fx = 0;
  private fy = 0;

  constructor(field: ScreenField) {
    this.field = field;
    this.root.name = 'Weather sky';
    const tex = atlas();
    const mat = new MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, side: DoubleSide });
    mat.onBeforeCompile = (sh) => {
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nattribute float aCell;\nattribute float aOpa;\nvarying float vOpa;')
        .replace(
          '#include <uv_vertex>',
          '#include <uv_vertex>\n#ifdef USE_MAP\nvMapUv = (vMapUv + vec2(mod(aCell, 8.0), 3.0 - floor(aCell / 8.0 + 0.001))) / vec2(8.0, 4.0);\n#endif\nvOpa = aOpa;',
        );
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying float vOpa;')
        .replace('#include <map_fragment>', '#include <map_fragment>\ndiffuseColor.a *= vOpa;');
    };
    mat.customProgramCacheKey = () => 'weather-sprites';
    this.bits = new Sprites(NBITS, mat, 'Weather bits', WEATHER_RENDER_ORDER.bits);
    this.clouds = new Sprites(NCLOUD, mat, 'Weather clouds', WEATHER_RENDER_ORDER.clouds);

    // the storm band: a torn, layered darkening across the top of the stage
    this.bandMat = new MeshBasicMaterial({ map: bandTexture(), color: this.cStorm, transparent: true, opacity: 0, depthWrite: false });
    this.band = new Mesh(new PlaneGeometry(STAGE_X1 - STAGE_X0 + 0.01, 0.15), this.bandMat);
    this.band.name = 'Storm band';
    this.band.position.set(0, STAGE_Y1 - 0.075, Z.band);
    this.band.renderOrder = WEATHER_RENDER_ORDER.band;
    this.band.visible = false;

    // warmth: a soft additive amber
    this.glowMat = new MeshBasicMaterial({ map: glowTexture(), color: AMBER, transparent: true, opacity: 0, depthWrite: false, blending: AdditiveBlending });
    this.glow = new Mesh(new PlaneGeometry(1, 1), this.glowMat);
    this.glow.name = 'Warm glow';
    this.glow.position.z = Z.glow;
    this.glow.renderOrder = WEATHER_RENDER_ORDER.glow;
    this.glow.visible = false;

    this.root.add(this.band, this.glow, this.bits.mesh, this.clouds.mesh);
  }

  // ===================================================================================== API

  cloud(on: boolean, opts?: { x?: number; y?: number; size?: number; follow?: boolean; dark?: number }): void {
    if (opts) {
      if (opts.size !== undefined) this.cSizeT = clamp(opts.size, 0.3, 2.5);
      if (opts.x !== undefined) this.ctx = opts.x;
      if (opts.y !== undefined) this.cty = opts.y;
      if (opts.follow !== undefined) this.cFollow = opts.follow;
      if (opts.dark !== undefined) this.cDarkT = clamp(opts.dark, 0, 1);
    }
    if (on && !this.cOn) {
      if (this.cg < 0.05) {
        // a new cloud: it grows out of a puff where it will stand
        this.cx = this.clampCloudX(this.ctx, this.cSizeT);
        this.cy = this.cty;
        this.cSize = this.cSizeT;
        this.cg = 0;
      }
      this.puff(this.cx, this.cy);
    } else if (!on && this.cOn) {
      this.puff(this.cx, this.cy - 0.005);
    }
    this.cOn = on;
  }

  /** the reader's own cut-paper cloud stands in for the painted one (src/weather/made.ts): its half width and half height (m), 0 = none */
  shapeHalf = 0;
  shapeBottom = 0;
  /** how big the little grey cloud is drawn (1 = 2 cm; it is a character: it has to be seen) */
  tagScale = 1.7;
  tagSize(k: number): void {
    this.tagScale = k;
  }
  get cloudY(): number {
    return this.cy;
  }
  get cloudDark(): number {
    return Math.max(this.cDark, this.stormA * 0.85);
  }
  get cloudOn(): boolean {
    return this.cOn;
  }
  get cloudGrow(): number {
    return this.cg;
  }
  get windAmount(): number {
    return this.windA;
  }
  get rainAmount(): number {
    return this.rainA;
  }
  get warmAmount(): number {
    return this.warmA;
  }

  get cloudX(): number {
    return this.cx;
  }

  /** where the Tagalong is (board m) */
  get tagX(): number {
    return this.tx;
  }

  rain(amount: number, slant = 0): void {
    this.rainT = clamp(amount, 0, 1);
    this.slantT = clamp(slant, -1, 1);
  }

  wind(amount: number, dir: 1 | -1 = 1): void {
    this.windT = clamp(amount, 0, 1);
    this.windDir = dir;
  }

  warm(amount: number, x?: number, y?: number, r?: number): void {
    this.warmT = clamp(amount, 0, 1);
    const fresh = this.warmA < 0.01;
    if (x !== undefined) this.wxT = x;
    if (y !== undefined) this.wyT = y;
    if (r !== undefined) this.wrT = Math.max(0.005, r);
    if (fresh) {
      this.wx = this.wxT;
      this.wy = this.wyT;
      this.wr = this.wrT * 0.6;
    }
  }

  storm(amount: number): void {
    this.stormT = clamp(amount, 0, 1);
  }

  tagalong(mode: TagMode): void {
    if (mode === this.mode) return;
    if (this.tVis < 0.02 && mode !== 'hidden') {
      // it comes in from the shelf with a little puff
      this.tx = this.shelfX;
      this.ty = this.shelfY;
      this.tvx = this.tvy = 0;
      this.puff(this.tx, this.ty + 0.006);
    }
    if (mode === 'white') this.tvy = Math.max(this.tvy, 0.004);
    this.mode = mode;
    this.air = true;
  }

  setShelf(x: number, y: number): void {
    this.shelfX = x;
    this.shelfY = y;
  }

  puff(x: number, y: number): void {
    this.puffs++;
    // a curl ring
    let i = this.qNext;
    this.qNext = (this.qNext + 1) % MAXP;
    this.qx[i] = x;
    this.qy[i] = y;
    this.qvx[i] = this.qvy[i] = 0;
    this.qr[i] = Math.random() * 6.28;
    this.qvr[i] = 1.2;
    this.qAge[i] = 0;
    this.qLife[i] = 0.55;
    this.qSz[i] = 0.024;
    this.qCell[i] = C_RING;
    // and paper scraps
    for (let k = 0; k < 8; k++) {
      i = this.qNext;
      this.qNext = (this.qNext + 1) % MAXP;
      const a = (k / 8) * 6.283 + Math.random() * 0.6;
      const v = 0.05 + Math.random() * 0.07;
      this.qx[i] = x + Math.cos(a) * 0.004;
      this.qy[i] = y + Math.sin(a) * 0.004;
      this.qvx[i] = Math.cos(a) * v;
      this.qvy[i] = Math.sin(a) * v + 0.02;
      this.qr[i] = Math.random() * 6.28;
      this.qvr[i] = (Math.random() - 0.5) * 12;
      this.qAge[i] = 0;
      this.qLife[i] = 0.5 + Math.random() * 0.35;
      this.qSz[i] = 0.003 + Math.random() * 0.0025;
      this.qCell[i] = k & 1 ? C_SCRAP : C_SCRAP2;
    }
  }

  reset(): void {
    this.cOn = false;
    this.cFollow = false;
    this.cDarkT = 0;
    this.rainT = 0;
    this.slantT = 0;
    this.windT = 0;
    this.warmT = 0;
    this.stormT = 0;
    this.flashT = 9;
    this.tagScale = 1.7;
    this.mode = 'hidden';
  }

  // ===================================================================================== frame

  update(dt: number): void {
    dt = clamp(dt, 0, 0.05);
    this.t += dt;
    const fade = dt / 0.5;
    this.rainA = approach(this.rainA, this.rainT, fade);
    this.slant = approach(this.slant, this.slantT, dt / 0.6);
    this.windA = approach(this.windA, this.windT, fade);
    this.warmA = approach(this.warmA, this.warmT, fade);
    this.stormA = approach(this.stormA, this.stormT, dt / 0.8);
    this.cDark = approach(this.cDark, this.cDarkT, dt / 0.8);

    this.updateCloud(dt);
    this.updateTag(dt);
    let any = false;
    any = this.updateRain(dt) || any;
    any = this.updateSplashes(dt) || any;
    any = this.updateWind(dt) || any;
    any = this.updatePuffs(dt) || any;
    any = this.updateStorm(dt) || any;
    this.updateWarm(dt);
    this.bits.mesh.visible = any;
    if (any) this.bits.flush();
    const cl = this.cg > 0.001 || this.tVis > 0.001;
    this.clouds.mesh.visible = cl;
    if (cl) this.clouds.flush();
  }

  // ---- the shadow --------------------------------------------------------------------------------

  /** is a hand shadow in the light now */
  private lit(): boolean {
    return this.field.count >= 25 && this.field.age < 0.6;
  }

  /** the shadow's top nearest x0 (sets fx, fy) */
  private findTop(x0: number): boolean {
    if (!this.lit()) return false;
    const f = this.field;
    for (let k = 0; k < OFFS.length; k++) {
      const x = clamp(x0 + OFFS[k], VIS_X0, VIS_X1);
      const top = f.topAtAny(x, STAGE_Y0, STAGE_Y1 - 0.004, 0.25);
      if (!Number.isNaN(top)) {
        this.fx = x;
        this.fy = top;
        return true;
      }
    }
    const c = f.centroid();
    if (!c) return false;
    const top = f.topAtAny(c[0], STAGE_Y0, STAGE_Y1 - 0.004, 0.25);
    this.fx = c[0];
    this.fy = Number.isNaN(top) ? c[1] : top;
    return true;
  }

  // ---- the cloud ---------------------------------------------------------------------------------

  private clampCloudX(x: number, size: number): number {
    // (the reader's own paper cloud is wider than the painted one: it stays inside the picture too)
    const h = Math.max(0.036 * size, this.shapeHalf * 1.06);
    return clamp(x, VIS_X0 + h, VIS_X1 - h);
  }

  private updateCloud(dt: number): void {
    this.cg = this.cOn ? Math.min(1, this.cg + dt / 0.55) : Math.max(0, this.cg - dt / 0.45);
    this.cSize += (this.cSizeT - this.cSize) * ease(dt, 3);
    if (this.cFollow && this.cOn && this.lit()) {
      const c = this.field.centroid();
      if (c) this.ctx = c[0];
    } else if (this.cFollow) {
      // out of the light it waits where it is
      this.ctx = this.cx;
    }
    const k = ease(dt, this.cFollow ? 3 : 2.5);
    this.cx += (this.clampCloudX(this.ctx, this.cSize) - this.cx) * k;
    this.cy += (this.cty - this.cy) * k;
    if (this.cg <= 0.001 || this.shapeHalf > 0) {
      // (the reader's own shape is the cloud: the painted lumps stay away)
      for (let i = 0; i < 3; i++) this.clouds.hide(i);
      return;
    }
    const grow = this.cOn ? 0.25 + 0.75 * backOut(this.cg) : 0.6 + 0.4 * this.cg;
    const a = smooth(this.cg / 0.35);
    const W = CLOUD_W * this.cSize * grow;
    const dark = Math.max(this.cDark, this.stormA * 0.85);
    const t = this.t;
    // back lump (up-left, darker), main, front lump (down-right, mirrored)
    for (let i = 0; i < 3; i++) {
      const breathe = 1 + 0.012 * Math.sin(t * 0.9 + i * 2.1);
      const bob = Math.sin(t * 0.7 + i * 2) * 0.0007;
      const ox = i === 0 ? -0.2 : i === 2 ? 0.24 : 0;
      const oy = i === 0 ? 0.07 : i === 2 ? -0.075 : 0;
      const s = i === 0 ? 0.72 : i === 2 ? 0.5 : 1;
      this.tmp.copy(this.cLayer[i]).lerp(this.cLayerDark[i], dark);
      this.clouds.put(
        i,
        this.cx + ox * W,
        this.cy + oy * W + bob,
        Z.cloud + i * 0.00005,
        (i === 2 ? -1 : 1) * W * s * breathe,
        W * s * (2 - breathe),
        1,
        0,
        i === 1 ? C_CLOUD : C_CLOUD2,
        a,
        this.tmp,
      );
    }
  }

  /** the rain's source span and the height it leaves from */
  private rainX0 = 0;
  private rainX1 = 0;
  private rainTop = 0;
  private rainSource(): void {
    if (this.cg > 0.3 && this.shapeHalf > 0) {
      // it rains from under the reader's own cloud, as wide as it is
      this.rainX0 = this.cx - this.shapeHalf * 0.85;
      this.rainX1 = this.cx + this.shapeHalf * 0.85;
      this.rainTop = this.cy - this.shapeBottom + 0.004;
    } else if (this.cg > 0.3) {
      const W = CLOUD_W * this.cSize;
      const h = 0.36 * W * CLOUD_VIS_W;
      this.rainX0 = this.cx - h;
      this.rainX1 = this.cx + h * 1.15;
      this.rainTop = this.cy - CLOUD_BOTTOM * W + 0.003;
    } else {
      this.rainX0 = VIS_X0 + 0.005;
      this.rainX1 = VIS_X1 - 0.005;
      this.rainTop = STAGE_Y1 - 0.016;
    }
  }

  // ---- rain and the shelter ------------------------------------------------------------------------

  private updateRain(dt: number): boolean {
    this.rainSource();
    const span = this.rainX1 - this.rainX0;
    const want = Math.min(MAXR, Math.round(this.rainA * 70 * clamp(span / 0.05, 0.6, 2.2)));
    const slant = clamp(this.slant + this.windA * this.windDir * 0.35, -1.2, 1.2) * 0.55;
    const lenLo = 7 + this.rainA;
    const lenHi = 10 + 4 * this.rainA;
    let n = this.stepStreaks(R0, MAXR, want, this.rainX0, this.rainX1, this.rainTop, slant, 0.48 + 0.12 * this.stormA, lenLo, lenHi, 1.0, 0.62 + 0.25 * this.rainA, dt);
    // the Tagalong's own thin curtain
    this.tRain = approach(this.tRain, this.mode === 'rain' && this.tVis > 0.5 ? 1 : 0, dt / 0.5);
    const tw = TAG_W * this.tagScale * TAG_VIS_W;
    const cw = Math.round(this.tRain * MAXC);
    n += this.stepStreaks(C0, MAXC, cw, this.tx - tw * 0.32, this.tx + tw * 0.32, this.ty + 0.003, 0, 0.36, 5, 8, 0.6, 0.72, dt);
    return n > 0;
  }

  /** falling ink streaks in slots [i0, i0+n): `want` of them are kept going; returns how many show */
  private stepStreaks(i0: number, n: number, want: number, x0: number, x1: number, top: number, k: number, speed: number, lenLo: number, lenHi: number, wMm: number, opa: number, dt: number): number {
    const f = this.field;
    const lit = this.lit();
    let shown = 0;
    for (let j = 0; j < n; j++) {
      const i = i0 + j;
      const b = i; // slot index in the bits mesh equals the streak index (R0 = 0, C0 follows)
      if (!this.sOn[i]) {
        if (j >= want) {
          this.sDel[i] = Math.random() * 0.6;
          this.bits.hide(b);
          continue;
        }
        this.sDel[i] -= dt;
        if (this.sDel[i] > 0 || top <= GROUND + 0.01) {
          this.bits.hide(b);
          continue;
        }
        // a new streak: evenly spread across the span (golden-ratio sequence, a little jitter)
        this.seq = (this.seq + 0.618034) % 1;
        const u = clamp(this.seq + (Math.random() - 0.5) * 0.06, 0, 1);
        this.sx[i] = x0 + (x1 - x0) * u;
        this.sy[i] = top - Math.random() * 0.006;
        this.sk[i] = k * (0.92 + Math.random() * 0.16);
        this.sl[i] = (lenLo + Math.random() * (lenHi - lenLo)) / 1000;
        this.sv[i] = speed * (0.85 + Math.random() * 0.3);
        this.sw[i] = (wMm * (0.8 + Math.random() * 0.4)) / 1000;
        this.so[i] = opa * (0.75 + Math.random() * 0.25);
        this.sStop[i] = GROUND;
        this.sHit[i] = 0;
        this.sAge[i] = 0;
        this.sOn[i] = 1;
      }
      // fall
      const yPrev = this.sy[i];
      const dy = this.sv[i] * dt;
      this.sy[i] -= dy;
      this.sx[i] += this.sk[i] * dy;
      this.sAge[i] += dt;
      const hx = this.sx[i];
      const hy = this.sy[i];
      const kk = this.sk[i];
      if (!this.sHit[i]) {
        // the shelter: the head meets the reader's hand shadow -> it stops on top of it
        if (lit) {
          const yEnd = Math.max(hy, GROUND);
          for (let y = yPrev; y >= yEnd - 1e-6; y -= CELL) {
            const x = hx + (hy - y) * kk;
            if (f.atBoard(x, y)) {
              this.sStop[i] = y;
              this.sHit[i] = 1;
              this.sheltered++;
              this.splash(x, y);
              break;
            }
          }
        }
        if (!this.sHit[i] && hy <= GROUND) {
          this.sHit[i] = 1;
          if (Math.random() < 0.6) this.splash(hx + (hy - GROUND) * kk, GROUND);
        }
      }
      // the visible part: from the tail down to the head, cut at the stop
      const inv = 1 / Math.sqrt(1 + kk * kk);
      const ly = this.sl[i] * inv;
      const bottom = Math.max(hy, this.sStop[i]);
      const vis = hy + ly - bottom;
      if (vis <= 0.0004) {
        this.sOn[i] = 0;
        this.sDel[i] = Math.random() * 0.08;
        this.bits.hide(b);
        continue;
      }
      const cy = bottom + vis / 2;
      const cx = hx + (hy - cy) * kk;
      const len = vis / inv;
      const a = this.so[i] * Math.min(1, this.sAge[i] / 0.07);
      this.bits.put(b, cx, cy, Z.rain, this.sw[i] * 1.28, len * (128 / 114), inv, kk * inv, C_STREAK, a, this.cRain);
      shown++;
    }
    return shown;
  }

  private splash(x: number, y: number): void {
    const i = this.pNext;
    this.pNext = (this.pNext + 1) % MAXS;
    this.px[i] = x;
    this.py[i] = y;
    this.pAge[i] = 0;
  }

  private updateSplashes(dt: number): boolean {
    let shown = 0;
    for (let i = 0; i < MAXS; i++) {
      this.pAge[i] += dt;
      const k = this.pAge[i] / 0.2;
      if (k >= 1) {
        this.bits.hide(S0 + i);
        continue;
      }
      const w = 0.0024 + 0.0014 * k;
      const h = 0.0026 * (1 - 0.3 * k);
      this.bits.put(S0 + i, this.px[i], this.py[i] + 0.25 * h, Z.splash, w, h, 1, 0, C_SPLASH, 0.8 * (1 - k), this.cRain);
      shown++;
    }
    return shown > 0;
  }

  // ---- wind ----------------------------------------------------------------------------------------

  private updateWind(dt: number): boolean {
    const want = this.windA > 0.005 ? Math.min(MAXG, Math.round(this.windA * 8 + 0.4)) : 0;
    const fadeA = Math.min(1, this.windA * 4);
    let shown = 0;
    for (let i = 0; i < MAXG; i++) {
      const b = G0 + i;
      if (!this.gOn[i]) {
        if (i >= want) {
          this.gDel[i] = Math.random() * 1.2;
          this.bits.hide(b);
          continue;
        }
        this.gDel[i] -= dt;
        if (this.gDel[i] > 0) {
          this.bits.hide(b);
          continue;
        }
        const d = this.windDir;
        this.gDir[i] = d;
        this.gx[i] = d > 0 ? VIS_X0 - 0.02 : VIS_X1 + 0.02;
        this.gy0[i] = 0.06 + Math.random() * 0.16;
        this.gSp[i] = (0.13 + Math.random() * 0.1) * (0.75 + 0.6 * this.windA);
        this.gPh[i] = Math.random() * 6.28;
        this.gSc[i] = 0.8 + Math.random() * 0.45;
        this.gCell[i] = Math.random() < 0.6 ? C_GUST : C_GUST2;
        this.gOn[i] = 1;
      }
      const d = this.gDir[i];
      this.gx[i] += d * this.gSp[i] * dt;
      this.gPh[i] += dt;
      const x = this.gx[i];
      if ((d > 0 && x > VIS_X1 + 0.025) || (d < 0 && x < VIS_X0 - 0.025)) {
        this.gOn[i] = 0;
        this.gDel[i] = (0.1 + Math.random() * 0.9) / (0.5 + 1.5 * this.windA);
        this.bits.hide(b);
        continue;
      }
      const ph = this.gPh[i];
      const y = this.gy0[i] + Math.sin(ph * 2.2) * 0.005 + Math.sin(ph * 0.9 + i) * 0.003;
      const rot = 0.18 * Math.sin(ph * 1.7) - d * 0.06;
      const edge = clamp(Math.min(x - VIS_X0 + 0.01, VIS_X1 + 0.01 - x) / 0.035, 0, 1);
      const W = 0.032 * this.gSc[i];
      const stretch = 1 + 0.08 * Math.sin(ph * 5);
      this.bits.put(b, x, y, Z.gust + i * 0.000004, d * W * stretch, W * (2 - stretch), Math.cos(rot), Math.sin(rot), this.gCell[i], 0.9 * edge * fadeA, this.cPaper);
      shown++;
    }
    return shown > 0;
  }

  // ---- puffs ----------------------------------------------------------------------------------------

  private updatePuffs(dt: number): boolean {
    let shown = 0;
    for (let i = 0; i < MAXP; i++) {
      const b = P0 + i;
      if (this.qAge[i] >= this.qLife[i]) {
        this.bits.hide(b);
        continue;
      }
      this.qAge[i] += dt;
      const k = Math.min(1, this.qAge[i] / this.qLife[i]);
      const drag = Math.exp(-dt * 3.5);
      this.qvx[i] *= drag;
      this.qvy[i] = this.qvy[i] * drag - 0.05 * dt;
      this.qx[i] += this.qvx[i] * dt;
      this.qy[i] += this.qvy[i] * dt;
      this.qr[i] += this.qvr[i] * dt;
      const ring = this.qCell[i] === C_RING;
      const s = ring ? this.qSz[i] * (0.35 + 0.65 * Math.sqrt(k)) : this.qSz[i] * (1 - 0.4 * k);
      const a = ring ? 0.85 * (1 - k) : 0.95 * (1 - k * k);
      this.bits.put(b, this.qx[i], this.qy[i], Z.scrap, s, s, Math.cos(this.qr[i]), Math.sin(this.qr[i]), this.qCell[i], a, this.cPaper);
      shown++;
    }
    return shown > 0;
  }

  // ---- storm ----------------------------------------------------------------------------------------

  private updateStorm(dt: number): boolean {
    const s = this.stormA;
    if (s > 0.35) {
      this.flashIn -= dt;
      if (this.flashIn <= 0) {
        this.flashT = 0;
        this.flashX = VIS_X0 + 0.04 + Math.random() * (VIS_X1 - VIS_X0 - 0.08);
        this.flashIn = 2.5 + Math.random() * 4;
        this.flashes++;
      }
    } else {
      this.flashIn = Math.max(this.flashIn, 1.2);
    }
    this.flashT += dt;
    const fl = (pulse(this.flashT, 0, 0.12) + 0.7 * pulse(this.flashT, 0.17, 0.14)) * Math.min(1, s * 1.5);
    this.band.visible = s > 0.003;
    if (this.band.visible) {
      this.bandMat.opacity = s * 0.62 * (1 - 0.7 * fl);
      this.bandMat.color.copy(this.cStorm).lerp(this.cPale, fl * 0.85);
      this.band.position.x = Math.sin(this.t * 0.11) * 0.003;
    }
    if (fl > 0.01) {
      const h = 0.085;
      this.bits.put(T0, this.flashX, STAGE_Y1 - 0.012 - h / 2, Z.torn, 0.045, h, 1, 0, C_TORN, 0.9 * fl, this.cPale);
      return true;
    }
    this.bits.hide(T0);
    return false;
  }

  // ---- warmth ---------------------------------------------------------------------------------------

  private updateWarm(dt: number): void {
    const k = ease(dt, 4);
    this.wx += (this.wxT - this.wx) * k;
    this.wy += (this.wyT - this.wy) * k;
    this.wr += (this.wrT - this.wr) * ease(dt, 2.5);
    const a = this.warmA;
    this.glow.visible = a > 0.003;
    if (!this.glow.visible) return;
    const t = this.t;
    const flicker = 0.9 + 0.06 * Math.sin(t * 7.3) * Math.sin(t * 3.1 + 1) + 0.04 * Math.sin(t * 1.7);
    this.glowMat.opacity = smooth(a) * 0.85 * flicker;
    const s = 2 * this.wr * (0.85 + 0.15 * smooth(a)) * (1 + 0.025 * Math.sin(t * 2.3));
    this.glow.scale.set(s, s, 1);
    this.glow.position.x = this.wx;
    this.glow.position.y = this.wy;
  }

  // ---- the Tagalong ---------------------------------------------------------------------------------

  private updateTag(dt: number): void {
    const m = this.mode;
    const visT = m === 'hidden' || (m === 'white' && this.ty > STAGE_Y1 - 0.02) ? 0 : 1;
    this.tVis = approach(this.tVis, visT, dt * (visT ? 2.5 : m === 'white' ? 0.9 : 2));
    this.tWhite = approach(this.tWhite, m === 'white' ? 1 : 0, dt / 1.2);
    this.tHide = approach(this.tHide, m === 'hide' ? 1 : 0, dt / 0.4);
    if (this.tVis <= 0.001) {
      for (let i = 3; i < NCLOUD; i++) this.clouds.hide(i);
      if (m === 'hidden') {
        this.tx = this.shelfX;
        this.ty = this.shelfY;
        this.tvx = this.tvy = 0;
      }
      return;
    }

    // targets (the shadow is read when a new grid arrives, or every 0.1 s)
    this.lost += dt;
    this.qT -= dt;
    if (m !== 'white' && (this.qT <= 0 || this.field.frames !== this.qFrames)) {
      this.qT = 0.1;
      this.qFrames = this.field.frames;
      if (m === 'ride' || m === 'rain') {
        if (this.findTop(this.tx)) {
          this.lost = 0;
          this.tgX = this.fx;
          this.tgY = m === 'ride' ? this.fy + 0.0004 : this.fy + 0.032;
        }
      } else if (m === 'hide') {
        const c = this.lit() ? this.field.centroid() : null;
        if (c && this.findTop(c[0])) {
          this.lost = 0;
          this.tgX = this.fx;
          this.tgY = this.fy - 0.014;
        }
      }
    }
    if (m === 'shelf' || ((m === 'ride' || m === 'hide') && this.lost > 0.5)) {
      this.tgX = this.shelfX;
      this.tgY = this.shelfY;
    } else if (m === 'rain' && this.lost > 0.5) {
      // no hands: it hovers where it is, not too low
      this.tgX = this.tx;
      this.tgY = Math.max(this.ty, 0.11);
    }
    this.riding = (m === 'ride' || m === 'rain') && this.lost <= 0.5;

    // motion: a damped spring (snappy when riding, a glide otherwise); white drifts up and away
    if (m === 'white') {
      this.tvy += (0.032 - this.tvy) * ease(dt, 1.2);
      this.tvx += (0.008 * Math.sin(this.t * 0.8) - this.tvx) * ease(dt, 2);
    } else {
      const w = this.riding || m === 'hide' ? 9 : 4.5;
      this.tvx += (w * w * (this.tgX - this.tx) - 2 * w * this.tvx) * dt;
      this.tvy += (w * w * (this.tgY - this.ty) - 2 * w * this.tvy) * dt;
      const sp = Math.hypot(this.tvx, this.tvy);
      if (sp > 0.4) {
        this.tvx *= 0.4 / sp;
        this.tvy *= 0.4 / sp;
      }
    }
    this.tx += this.tvx * dt;
    this.ty += this.tvy * dt;
    this.tx = clamp(this.tx, VIS_X0 + 0.01, VIS_X1 - 0.01);

    // landing: a little squash
    const dist = Math.hypot(this.tgX - this.tx, this.tgY - this.ty);
    if (m !== 'white') {
      if (dist > 0.01) this.air = true;
      else if (this.air && dist < 0.003) {
        this.air = false;
        this.lands++;
        this.sqv -= 2.6;
      }
    }
    const rest = m === 'rain' ? -0.07 + 0.06 * Math.sin(this.t * 7) : 0;
    this.sqv += (-130 * (this.sq - rest) - 10 * this.sqv) * dt;
    this.sq = clamp(this.sq + this.sqv * dt, -0.35, 0.3);

    // blink
    this.blinkIn -= dt;
    this.blinkT += dt;
    if (this.blinkIn <= 0) {
      this.blinkT = 0;
      this.blinkIn = Math.random() < 0.2 ? 0.28 : 2.2 + Math.random() * 3;
    }
    const blink = this.blinkT < 0.12;

    // draw: the feet point (tx, ty) stays put while it squashes
    const grow = 0.5 + 0.5 * smooth(this.tVis);
    const sx = 1 - 0.7 * this.sq;
    const sy = 1 + this.sq;
    // (it grows as it goes white: the size of a real cloud at last)
    const W = TAG_W * this.tagScale * (1 + 0.7 * this.tWhite) * grow;
    const bob = this.riding ? Math.sin(this.t * 2.6) * 0.0007 : Math.sin(this.t * 1.3) * 0.001;
    const cy = this.ty + bob - CLOUD_BOTTOM * W * sy;
    const tilt = clamp(-this.tvx * 1.5, -0.2, 0.2);
    this.tmp.copy(this.cTagGrey).lerp(this.cPaper, this.tWhite).lerp(this.cTagHide, this.tHide);
    const a = this.tVis * (1 - 0.45 * this.tHide);
    this.clouds.put(3, this.tx, cy, Z.tag, W * sx, W * sy, Math.cos(tilt), Math.sin(tilt), C_TAG, a, this.tmp);

    // eyes: they look where it goes (and toward the big cloud); pale when it peeks from the shadow
    let look = clamp(this.tvx * 0.05, -0.0008, 0.0008);
    if (this.cOn && this.cg > 0.5 && Math.abs(this.cx - this.tx) > 0.02) look += Math.sign(this.cx - this.tx) * 0.0004;
    if (m === 'hide') look += Math.sin(this.t * 0.9) * 0.0006;
    this.lookX += (look - this.lookX) * ease(dt, 8);
    const eyeY = cy + W * sy * (-0.04 + 0.03 * this.tHide);
    this.tmp2.copy(this.cInk).lerp(this.cEyePale, this.tHide);
    const ew = 0.0029 * grow;
    for (let e = 0; e < 2; e++) {
      const ex = this.tx + (e ? 1 : -1) * 0.1 * W * sx + this.lookX;
      this.clouds.put(4 + e, ex, eyeY, Z.eye, ew, blink ? ew * 0.8 : ew * sy, Math.cos(tilt), Math.sin(tilt), blink ? C_BLINK : C_EYE, this.tVis, this.tmp2);
    }
  }

  // ===================================================================================== tests

  snapshot(): Record<string, unknown> {
    let rain = 0;
    let curtain = 0;
    for (let i = 0; i < MAXR; i++) rain += this.sOn[i];
    for (let i = 0; i < MAXC; i++) curtain += this.sOn[C0 + i];
    let gusts = 0;
    for (let i = 0; i < MAXG; i++) gusts += this.gOn[i];
    let scraps = 0;
    for (let i = 0; i < MAXP; i++) if (this.qAge[i] < this.qLife[i]) scraps++;
    const draws = [this.band, this.glow, this.bits.mesh, this.clouds.mesh].filter((m) => m.visible).length;
    return {
      cloud: { on: this.cOn, x: this.cx, y: this.cy, size: this.cSize, grow: this.cg, follow: this.cFollow, dark: this.cDark },
      rain: { amount: this.rainA, slant: this.slant, streaks: rain, sheltered: this.sheltered, span: [this.rainX0, this.rainX1], top: this.rainTop },
      wind: { amount: this.windA, dir: this.windDir, gusts },
      warm: { amount: this.warmA, x: this.wx, y: this.wy, r: this.wr },
      storm: { amount: this.stormA, flashes: this.flashes },
      tagalong: { mode: this.mode, x: this.tx, y: this.ty, vis: this.tVis, riding: this.riding, lands: this.lands, curtain, white: this.tWhite, hide: this.tHide },
      puffs: this.puffs,
      scraps,
      draws,
    };
  }
}

function smooth(v: number): number {
  const t = clamp(v, 0, 1);
  return t * t * (3 - 2 * t);
}

// ===================================================================================== textures

/** a deterministic little random (the torn edges look the same every reading) */
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

let atlasTex: CanvasTexture | null = null;
/** 8 x 4 cells of 128 px: cut paper with an ink edge (clouds, gusts, scraps), white shapes tinted per instance */
function atlas(): CanvasTexture {
  if (atlasTex) return atlasTex;
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 512;
  const g = c.getContext('2d')!;
  const at = (i: number): [number, number] => [(i % 8) * 128, Math.floor(i / 8) * 128];
  const r = rng(7);

  /** a paper cloud: lumps [x, y, r] over a flat base, an ink edge, a shaded underside and a fold line or two */
  const cloud = (i: number, lumps: number[][], base: [number, number], face: string, shade: string) => {
    const [ox, oy] = at(i);
    g.save();
    g.translate(ox, oy);
    const p = new Path2D();
    for (const [x, y, rr] of lumps) {
      p.moveTo(x + rr, y);
      p.arc(x, y, rr, 0, Math.PI * 2);
    }
    p.rect(base[0], 76, base[1] - base[0], 24);
    g.lineJoin = 'round';
    g.strokeStyle = INK;
    g.lineWidth = 6;
    g.stroke(p);
    g.fillStyle = face;
    g.fill(p);
    g.save();
    g.clip(p);
    // the shaded underside (a gentle wave)
    g.fillStyle = shade;
    g.beginPath();
    g.moveTo(0, 86);
    g.bezierCurveTo(30, 80, 50, 92, 70, 85);
    g.bezierCurveTo(90, 79, 110, 90, 128, 84);
    g.lineTo(128, 128);
    g.lineTo(0, 128);
    g.closePath();
    g.fill();
    // fold lines inside the two biggest lumps (layered paper)
    g.strokeStyle = 'rgba(27,20,36,0.32)';
    g.lineWidth = 2;
    const sorted = lumps.slice().sort((a, b) => b[2] - a[2]);
    for (let k = 0; k < 2 && k < sorted.length; k++) {
      const [x, y, rr] = sorted[k];
      g.beginPath();
      g.arc(x, y + rr * 0.35, rr * 0.75, Math.PI * 1.15, Math.PI * 1.6);
      g.stroke();
    }
    g.restore();
    g.restore();
  };
  cloud(C_CLOUD, [[30, 76, 22], [56, 60, 28], [86, 64, 24], [106, 80, 18], [16, 88, 12], [110, 88, 12]], [16, 110], PAPER, '#e1cfac');
  cloud(C_CLOUD2, [[28, 74, 20], [54, 58, 24], [82, 62, 26], [104, 80, 18], [18, 88, 12], [108, 88, 12]], [18, 108], PAPER, '#e1cfac');
  cloud(C_TAG, [[42, 74, 20], [66, 62, 27], [88, 76, 20], [26, 88, 12], [102, 88, 12]], [26, 102], '#faf6ee', '#e4ddd2');

  // eyes: a dot, and a closed lid
  {
    const [ox, oy] = at(C_EYE);
    g.fillStyle = '#ffffff';
    g.beginPath();
    g.arc(ox + 64, oy + 64, 40, 0, Math.PI * 2);
    g.fill();
  }
  {
    const [ox, oy] = at(C_BLINK);
    g.strokeStyle = '#ffffff';
    g.lineWidth = 16;
    g.lineCap = 'round';
    g.beginPath();
    g.moveTo(ox + 26, oy + 58);
    g.quadraticCurveTo(ox + 64, oy + 82, ox + 102, oy + 58);
    g.stroke();
  }
  // a rain streak: thin tail at the top, a heavier head at the bottom
  {
    const [ox, oy] = at(C_STREAK);
    g.fillStyle = '#ffffff';
    g.beginPath();
    g.moveTo(ox + 56, oy + 7);
    g.lineTo(ox + 72, oy + 7);
    g.lineTo(ox + 114, oy + 104);
    g.quadraticCurveTo(ox + 114, oy + 121, ox + 64, oy + 121);
    g.quadraticCurveTo(ox + 14, oy + 121, ox + 14, oy + 104);
    g.closePath();
    g.fill();
  }
  // a splash: a little crown of three ticks
  {
    const [ox, oy] = at(C_SPLASH);
    g.strokeStyle = '#ffffff';
    g.lineWidth = 13;
    g.lineCap = 'round';
    g.beginPath();
    g.moveTo(ox + 54, oy + 96);
    g.lineTo(ox + 22, oy + 52);
    g.moveTo(ox + 64, oy + 92);
    g.lineTo(ox + 64, oy + 34);
    g.moveTo(ox + 74, oy + 96);
    g.lineTo(ox + 106, oy + 52);
    g.stroke();
  }
  // gust curls: the tale's GUST cut (26 mm, 4 px per mm) and a ribbon spiral
  {
    const [ox, oy] = at(C_GUST);
    g.save();
    g.translate(ox + 12, oy + 64);
    g.scale(4, -4);
    const p = new Path2D('M 0 -3 C 8 -9 18 -9 26 -2 C 18 -5 10 -4 6 0 C 12 -1 18 1 22 6 C 14 3 6 3 0 3 Z');
    g.lineJoin = 'round';
    g.strokeStyle = INK;
    g.lineWidth = 1.4;
    g.stroke(p);
    g.fillStyle = PAPER;
    g.fill(p);
    g.restore();
  }
  {
    const [ox, oy] = at(C_GUST2);
    const ribbon = () => {
      g.beginPath();
      g.moveTo(ox + 8, oy + 78);
      g.bezierCurveTo(ox + 36, oy + 66, ox + 62, oy + 84, ox + 88, oy + 70);
      g.arc(ox + 92, oy + 56, 14, Math.PI * 0.6, Math.PI * 2.2, true);
      g.stroke();
    };
    g.lineCap = 'round';
    g.lineJoin = 'round';
    g.strokeStyle = INK;
    g.lineWidth = 12;
    ribbon();
    g.strokeStyle = PAPER;
    g.lineWidth = 7;
    ribbon();
  }
  // paper scraps (torn polygons)
  for (const [cell, n] of [[C_SCRAP, 5], [C_SCRAP2, 6]] as const) {
    const [ox, oy] = at(cell);
    g.beginPath();
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2 + r() * 0.5;
      const rr = 30 + r() * 26;
      const x = ox + 64 + Math.cos(a) * rr;
      const y = oy + 64 + Math.sin(a) * rr * 0.8;
      if (k) g.lineTo(x, y);
      else g.moveTo(x, y);
    }
    g.closePath();
    g.lineJoin = 'round';
    g.strokeStyle = INK;
    g.lineWidth = 6;
    g.stroke();
    g.fillStyle = PAPER;
    g.fill();
  }
  // the torn-light flash: a jagged pale tear running down from the top
  {
    const [ox, oy] = at(C_TORN);
    g.fillStyle = '#ffffff';
    g.beginPath();
    g.moveTo(ox + 44, oy + 4);
    g.lineTo(ox + 84, oy + 4);
    let x = 84;
    for (let y = 18; y <= 120; y += 14) {
      x = clamp(x + (r() - 0.55) * 34, 56, 104);
      g.lineTo(ox + x, oy + y);
    }
    g.lineTo(ox + x - 10, oy + 124);
    x -= 10;
    for (let y = 110; y >= 18; y -= 14) {
      x = clamp(x + (r() - 0.45) * 30, 24, 76);
      g.lineTo(ox + x - 8, oy + y);
    }
    g.closePath();
    g.fill();
  }
  // the puff ring: six paper curls around a circle
  {
    const [ox, oy] = at(C_RING);
    const arcs = () => {
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * Math.PI * 2;
        g.beginPath();
        g.arc(ox + 64, oy + 64, 44, a, a + 0.62);
        g.arc(ox + 64 + Math.cos(a + 0.62) * 36, oy + 64 + Math.sin(a + 0.62) * 36, 8, a + 0.62, a + 0.62 + Math.PI * 1.2);
        g.stroke();
      }
    };
    g.lineCap = 'round';
    g.strokeStyle = INK;
    g.lineWidth = 12;
    arcs();
    g.strokeStyle = PAPER;
    g.lineWidth = 7;
    arcs();
  }
  atlasTex = new CanvasTexture(c);
  atlasTex.colorSpace = SRGBColorSpace;
  atlasTex.anisotropy = 4;
  return atlasTex;
}

let bandTex: CanvasTexture | null = null;
/** the storm band: three torn layers, darkest at the top (white; tinted by the material) */
function bandTexture(): CanvasTexture {
  if (bandTex) return bandTex;
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 128;
  const g = c.getContext('2d')!;
  const r = rng(31);
  g.fillStyle = '#ffffff';
  const layer = (yBase: number, amp: number, step: number, alpha: number) => {
    g.globalAlpha = alpha;
    g.beginPath();
    g.moveTo(0, 0);
    g.lineTo(512, 0);
    for (let x = 512; x >= 0; x -= step) g.lineTo(x, yBase + (r() - 0.5) * 2 * amp + Math.sin(x * 0.02) * amp);
    g.closePath();
    g.fill();
  };
  layer(112, 7, 9, 0.42);
  layer(72, 6, 8, 0.42);
  layer(32, 4, 7, 0.45);
  g.globalAlpha = 1;
  bandTex = new CanvasTexture(c);
  bandTex.colorSpace = SRGBColorSpace;
  return bandTex;
}

let glowTex: CanvasTexture | null = null;
function glowTexture(): CanvasTexture {
  if (glowTex) return glowTex;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, 'rgba(255,255,255,0.85)');
  grad.addColorStop(0.3, 'rgba(255,255,255,0.45)');
  grad.addColorStop(0.65, 'rgba(255,255,255,0.12)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  glowTex = new CanvasTexture(c);
  glowTex.colorSpace = SRGBColorSpace;
  return glowTex;
}
