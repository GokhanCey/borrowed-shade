import {
  CanvasTexture,
  Color,
  DoubleSide,
  Group,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  Quaternion,
  SRGBColorSpace,
  Vector3,
} from '@iwsdk/core';
import * as A from './art.js';
import * as B from './art2.js';
import { BIRD, CAST } from './cast.js';
import { cutout, mergeStatic } from './paper.js';
import { PLATES } from './plates.js';

/**
 * THE KEEPING TRAY: everything you save with your shadow comes to the desk.
 * A walker who crossed on your road, a leaf from a gust you stopped, a hat you caught, a figure you
 * hid, a bird that sat on your fingers: each flies from the screen to a small paper tray at the front
 * of the stage and stands there as a tiny paper figure for the rest of the reading. Things you missed
 * come home the long way at the end, crumpled, and you smooth them flat with a fingertip.
 * No numbers anywhere: the tray is the tally. 2 draws (the tray card and one instanced mesh).
 */
export type KeepTint = 'wet' | 'sooty' | 'pale';

/** the atlas cells (8 x 4) */
const CELLS = ['rabbit', 'fox', 'owl', 'heron', 'snail', 'ama', 'tomas', 'villager', 'hat', 'leaf', 'scarf', 'glove', 'tendril', 'feather', 'bird', 'crumple', 'boat', 'sun', 'moon', 'map', 'plank', 'lamp', 'sack', 'loaf', 'turnip', 'kite', 'vane'] as const;
const cellOf = (c: string) => Math.max(0, (CELLS as readonly string[]).indexOf(c === 'hat' ? 'hat' : c));

const PATHS: Record<string, { d: string; color: string }> = {
  rabbit: { d: PLATES.rabbit.path, color: '#f6ead2' },
  fox: { d: PLATES.fox.path, color: '#e08a4a' },
  owl: { d: PLATES.owl.path, color: '#b79a76' },
  heron: { d: PLATES.heron.path, color: '#c9d3dc' },
  snail: { d: PLATES.snail.path, color: '#d9b98c' },
  boat: { d: PLATES.boat.path, color: '#b98f62' },
  ama: { d: A.VILLAGER, color: '#c46a5a' },
  tomas: { d: B.TOMAS, color: '#5d5a78' },
  villager: { d: A.VILLAGER, color: '#8a7f9a' },
  hat: { d: 'M -12 0 L 14 0 L 14 3 L 8 3 L 7 13 L -6 13 L -7 3 L -12 3 Z', color: '#2e2a3a' },
  leaf: { d: 'M -6 0 C -2 6 2 6 6 0 C 2 -4 -2 -4 -6 0 Z', color: '#c98a3a' },
  scarf: { d: 'M -14 -3 L 14 -3 L 14 3 L -14 3 Z', color: '#b8473a' },
  glove: { d: 'M -5 -4 L 5 -4 L 6 4 L -6 4 Z', color: '#6f6a5a' },
  tendril: { d: 'M 0 -5 C 10 -6 22 -2 30 0 C 22 2 10 6 0 5 Z', color: '#4a3d5e' },
  feather: { d: 'M -10 0 C -4 6 4 6 12 0 C 4 -3 -4 -3 -10 0 Z', color: '#3b3f6b' },
  bird: { d: BIRD, color: '#2a2433' },
  crumple: { d: 'M -8 -6 L -2 -8 L 6 -5 L 8 2 L 3 7 L -5 6 L -8 0 Z', color: '#bdb4a2' },
  sun: { d: 'M 0 -10 C 6 -10 10 -6 10 0 C 10 6 6 10 0 10 C -6 10 -10 6 -10 0 C -10 -6 -6 -10 0 -10 Z', color: '#f2c45a' },
  moon: { d: A.MOON, color: '#f6e7b8' },
  map: { d: B.MAP, color: '#efd9a8' },
  plank: { d: 'M -16 -2 L 16 -2 L 16 2 L -16 2 Z', color: '#8a6a4a' },
  lamp: { d: 'M -3 0 L 3 0 L 3 8 L -3 8 Z', color: '#ffd38a' },
  // the Weathermaker's Apprentice
  sack: { d: 'M -9 0 L 9 0 L 10 14 L 6 18 L 8 22 L -8 22 L -6 18 L -10 14 Z', color: '#e8dcc0' },
  loaf: { d: 'M -14 0 L 14 0 C 16 6 12 12 0 12 C -12 12 -16 6 -14 0 Z', color: '#c98a4a' },
  turnip: { d: 'M 0 0 C -9 2 -11 10 -6 16 L -3 18 L -6 28 L 0 20 L 6 28 L 3 18 L 6 16 C 11 10 9 2 0 0 Z', color: '#d8b2c6' },
  kite: { d: 'M 0 0 L 9 16 L 0 30 L -9 16 Z', color: '#c7563f' },
  vane: { d: 'M -1 0 L 1 0 L 1 18 L 14 18 L 10 22 L 14 26 L -12 26 L -14 22 L -12 18 L -1 18 Z', color: '#d9b46a' },
};
void CAST;

interface Slot {
  cell: string;
  tint?: KeepTint;
  /** crumpled (lost, waiting to be smoothed) */
  crumpled: boolean;
  pos: Vector3;
  /** flight: 0..1, or 1 when landed */
  t: number;
  from: Vector3;
  bounce: number;
  smooth: number;
  wasCrumpled?: boolean;
}

const MAX = 64;

const Z_AXIS = new Vector3(0, 0, 1);
const TINT = { wet: new Color('#8a92b0'), sooty: new Color('#9a9088'), pale: new Color('#d8d4dc'), none: new Color('#ffffff') };

export class KeepTray {
  readonly root = new Group();
  private card: Group;
  private mesh: InstancedMesh;
  private aCell: InstancedBufferAttribute;
  private slots: Slot[] = [];
  private queue: { cell: string; from: Vector3; tint?: KeepTint; crumpled: boolean }[] = [];
  private queueT = 0;
  private fold = 0;
  private vis = 0;
  private m = new Matrix4();
  private q = new Quaternion();
  private lastN = -1;
  private lastFold = -1;
  private s = new Vector3();
  private p = new Vector3();
  private c = new Color();
  /** the tray's front edge (book-local): x from x0, along z */
  private readonly x0 = -0.05;
  private readonly z = 0.324;

  constructor(private top: number) {
    this.root.name = 'Keeping tray';
    // the tray: a cream card with a low front lip and a back step
    const card = new Group();
    const base = cutout('M -95 -12 L 95 -12 L 95 12 L -95 12 Z', { color: '#e9dcc0', name: 'Tray base' });
    base.rotation.x = -Math.PI / 2;
    card.add(base);
    const lip = cutout('M -95 0 L 95 0 L 95 5 L -95 5 Z', { color: '#d7c49c', name: 'Tray lip' });
    lip.position.z = 0.012;
    card.add(lip);
    const step = cutout('M -95 0 L 95 0 L 95 8 L -95 8 Z', { color: '#cdb98f', name: 'Tray step' });
    step.position.z = -0.012;
    card.add(step);
    mergeStatic(card, 'keeping tray');
    card.position.set(0.04, top + 0.0006, this.z);
    this.card = card;
    this.root.add(card);
    // the figures: one instanced plane, its picture picked from an atlas
    const geo = new PlaneGeometry(1, 1);
    geo.translate(0, 0.5, 0);
    this.aCell = new InstancedBufferAttribute(new Float32Array(MAX), 1);
    geo.setAttribute('aCell', this.aCell);
    const mat = new MeshBasicMaterial({ map: atlas(), alphaTest: 0.5, side: DoubleSide, transparent: false });
    mat.onBeforeCompile = (sh) => {
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nattribute float aCell;')
        .replace('#include <uv_vertex>', '#include <uv_vertex>\n#ifdef USE_MAP\nvMapUv = (vMapUv + vec2(mod(aCell, 8.0), 3.0 - floor(aCell / 8.0))) / vec2(8.0, 4.0);\n#endif');
    };
    this.mesh = new InstancedMesh(geo, mat, MAX);
    this.mesh.name = 'Kept shadows';
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.root.add(this.mesh);
    this.root.visible = false;
  }

  /** a saved thing flies from `from` (book-local) to its slot */
  /** while a wave is in play, saved things wait in the screen and fly at the next rest */
  held = false;

  keep(cell: string, from: Vector3, tint?: KeepTint): void {
    this.queue.push({ cell, from: from.clone(), tint, crumpled: false });
  }

  /** back to the first n things (a replayed page takes back what it gave) */
  trim(n: number): void {
    this.queue.length = 0;
    if (this.slots.length > n) this.slots.length = n;
  }

  /** a resumed reading: put a kept thing straight into its place (no flight) */
  restore(cell: string, tint?: KeepTint): void {
    const i = this.slots.filter((s) => !s.crumpled).length;
    const pos = this.slotPos(i, false);
    this.slots.push({ cell, tint, crumpled: false, pos, t: 1, from: pos.clone(), bounce: 0, smooth: 1 });
  }

  /** a lost thing comes home crumpled (the epilogue's long way) */
  crumple(cell: string, from: Vector3): void {
    this.queue.push({ cell, from: from.clone(), crumpled: true });
  }

  /** where the crumpled ones lie (book-local), for the epilogue's touch */
  crumplePoints(): Vector3[] {
    return this.slots.filter((s) => s.crumpled).slice(0, 20).map((s) => s.pos.clone().setY(this.top + 0.006));
  }

  /** smooth the k-th crumpled one flat: it becomes itself again */
  unfold(k: number): void {
    const s = this.slots.filter((x) => x.crumpled)[k];
    if (s) {
      s.crumpled = false;
      s.smooth = 0;
    }
  }

  get hasCrumpled(): boolean {
    return this.slots.some((s) => s.crumpled) || this.queue.some((q) => q.crumpled);
  }

  /** something is still flying to the tray */
  get flying(): boolean {
    return this.queue.length > 0 || this.slots.some((s) => s.t < 1);
  }

  get count(): number {
    return this.slots.length + this.queue.length;
  }

  clear(): void {
    this.slots = [];
    this.queue = [];
    this.mesh.count = 0;
    this.vis = 0;
    this.root.visible = false;
  }

  /** fold flat with the cast (page turns, closing): 0 standing .. 1 flat */
  setFold(v: number): void {
    this.fold = v;
  }

  private slotPos(i: number, crumpled: boolean): Vector3 {
    if (crumpled) {
      const k = this.slots.filter((s) => s.crumpled).length;
      return new Vector3(0.1 + (k % 5) * 0.007, this.top + 0.0015, this.z - 0.004 - Math.floor(k / 5) * 0.007);
    }
    const row = Math.floor(i / 22) % 2;
    return new Vector3(this.x0 + (i % 22) * 0.0075, this.top + 0.0015 + row * 0.005, this.z + (row ? -0.01 : 0.002));
  }

  update(dt: number, music?: { tap(): void }): void {
    this.queueT -= dt;
    if (this.queue.length && !this.held && this.queueT <= 0 && this.slots.filter((s) => s.t < 1).length < 6) {
      const q = this.queue.shift()!;
      const i = this.slots.filter((s) => !s.crumpled).length;
      this.slots.push({ cell: q.cell, tint: q.tint, crumpled: q.crumpled, pos: this.slotPos(i, q.crumpled), t: 0, from: q.from, bounce: 0, smooth: 1 });
      this.queueT = 0.12;
    }
    if (this.slots.length) this.vis = Math.min(1, this.vis + dt * 2);
    this.root.visible = this.vis > 0.01 && this.fold < 0.98;
    const n = Math.min(MAX, this.slots.length);
    // settled and unchanged: nothing to rewrite or upload (it is like that for most of a reading)
    let busy = n !== this.lastN || this.fold !== this.lastFold;
    for (let i = 0; i < n && !busy; i++) {
      const s = this.slots[i];
      if (s.t < 1 || s.bounce > 0 || s.smooth < 1 || s.crumpled !== s.wasCrumpled) busy = true;
    }
    this.lastN = n;
    this.lastFold = this.fold;
    if (!busy) return;
    for (let i = 0; i < n; i++) {
      const s = this.slots[i];
      s.wasCrumpled = s.crumpled;
      if (s.t < 1) {
        s.t = Math.min(1, s.t + dt / 0.9);
        if (s.t >= 1) {
          s.bounce = 1;
          music?.tap();
        }
      }
      s.bounce = Math.max(0, s.bounce - dt * 4);
      s.smooth = Math.min(1, s.smooth + dt * 2);
      const k = s.t * s.t * (3 - 2 * s.t);
      // a paper flight: a low arc from the screen to the tray
      this.p.copy(s.from).lerp(s.pos, k);
      this.p.y += Math.sin(k * Math.PI) * 0.07 + Math.sin(s.bounce * Math.PI) * 0.004;
      this.p.z += Math.sin(k * Math.PI) * 0.02;
      const size = (0.022 - 0.009 * k) * (s.crumpled ? 0.7 : 1);
      const flat = Math.max(this.fold, 0);
      this.s.set(size * (s.crumpled ? 1 : 0.3 + 0.7 * s.smooth), size * (1 - flat), size);
      this.q.setFromAxisAngle(Z_AXIS, 0.3 * Math.sin(s.t * Math.PI * 3) * (1 - s.t));
      this.m.compose(this.p, this.q, this.s);
      this.mesh.setMatrixAt(i, this.m);
      this.aCell.setX(i, cellOf(s.crumpled ? 'crumple' : s.cell));
      this.mesh.setColorAt(i, TINT[s.tint ?? 'none']);
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.aCell.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
    this.card.scale.y = 1;
  }
}

/** the atlas: 8 x 4 cells of 64 px, each a paper cut-out with an ink edge */
let atlasTex: CanvasTexture | null = null;
function atlas(): CanvasTexture {
  if (atlasTex) return atlasTex;
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 256;
  const g = c.getContext('2d')!;
  CELLS.forEach((id, i) => {
    const art = PATHS[id];
    if (!art) return;
    const cx = (i % 8) * 64;
    const cy = Math.floor(i / 8) * 64;
    const path = new Path2D(art.d);
    // fit the path into the cell, base at the bottom
    const b = bounds(art.d);
    const s = Math.min(54 / Math.max(1, b[2] - b[0]), 54 / Math.max(1, b[3] - b[1]));
    g.save();
    g.translate(cx + 32 - ((b[0] + b[2]) / 2) * s, cy + 61 + b[1] * s);
    g.scale(s, -s);
    g.fillStyle = art.color;
    g.fill(path);
    g.lineWidth = 2 / s;
    g.strokeStyle = '#2a2026';
    g.stroke(path);
    g.restore();
  });
  atlasTex = new CanvasTexture(c);
  atlasTex.colorSpace = SRGBColorSpace;
  return atlasTex;
}

function bounds(d: string): [number, number, number, number] {
  const nums = (d.match(/-?\d*\.?\d+/g) ?? []).map(Number);
  let a = Infinity;
  let b = Infinity;
  let c = -Infinity;
  let e = -Infinity;
  for (let i = 0; i + 1 < nums.length; i += 2) {
    a = Math.min(a, nums[i]);
    c = Math.max(c, nums[i]);
    b = Math.min(b, nums[i + 1]);
    e = Math.max(e, nums[i + 1]);
  }
  return [a, b, c, e];
}
