import { Group, Mesh, MeshBasicMaterial, PlaneGeometry, ShapeGeometry, type Vector4 } from '@iwsdk/core';
import { glowTexture } from './book.js';
import { BIRD } from './cast.js';
import { RegionSwitch } from './fill-core.js';
import { pathShape } from './paper.js';
import { PLATES } from './plates.js';
import type { ScreenField } from './screen-field.js';
import * as A from './art.js';
import * as B from './art2.js';

/**
 * Screen acts: your shadow is a thing in the shadow world.
 *   cover / uncover  a light painted into the screen (sun, moon, a glare); it dims live as you cover it
 *   clear            take your hands out of the light (and keep them out a moment)
 *   road             little shadows walk across a gap on the top edge of your shadow, in groups
 *   wall             waves of gusts (and a pressing tendril) break on your shadow
 *   catch            waves of falling things ride your shadow's top and are delivered
 *   hide             a searchlight sweeps (several times); figures under your shadow are not seen
 *   birds            hold still: birds land on the peaks of your shadow (your fingertips)
 * Every act shows WHERE (an amber dashed target in the screen shader), says HOW (the advice slip,
 * after a few seconds if nothing happens) and answers live; it stamps the seal when done by hand.
 * Waves rest between each other (arms down); if nobody plays the first wave, the act resolves by itself.
 * Positions are board-local metres (x across the screen, y up from its bottom; stage y 0..0.25).
 */
export type ScreenKind = 'cover' | 'uncover' | 'clear' | 'road' | 'wall' | 'catch' | 'hide' | 'birds';

export interface TargetSpec {
  /** 1 ellipse (cx, cy, rx, ry), 2 rectangle (cx, cy, half w, half h), 3 dotted lane (as rectangle) */
  kind: 1 | 2 | 3;
  a: [number, number, number, number];
  b?: [number, number, number, number];
}

export interface ScreenHost {
  field: ScreenField;
  board: Group;
  /** the light painted into the screen */
  light: { set(x: number, y: number, rx: number, ry: number, on: number, color?: string): void };
  /** how covered the painted light is (0..1): its halo dims and the screen darkens around it */
  cov(v: number): void;
  /** the amber target in the screen shader (null clears); strong at first, then faint */
  target(t: TargetSpec | null, strong?: boolean): void;
  /** the advice slip ('' hides) */
  advise(text: string): void;
  /** success by hand: the seal stamps (no number) */
  stamp(): void;
  sound(kind: 'tap' | 'shimmer' | 'rustle' | 'break' | 'bell' | 'step' | 'rest'): void;
  log(s: string): void;
  /** something was saved: it flies from the screen (board bx, by) to the keeping tray on the desk */
  keep?(cell: string, bx: number, by: number, tint?: 'wet' | 'sooty' | 'pale'): void;
  /** something was lost: the world remembers it (where it went) */
  lose?(cell: string, bx: number, by: number, where: 'hollow' | 'road' | 'sea' | 'chimney'): void;
}

/** what an act tells the story when it ends */
export interface ActInfo {
  hat?: boolean;
  missed?: number;
  /** hide: bits of the figures taken on the last sweep */
  takenMask?: number;
  /** wall: the tendril was broken (1) or got through (0) */
  tendril?: number;
  /** road: walkers who fell in on the way (and arrived wet) */
  wet?: number;
}

/** one wave of things */
export interface Wave {
  /** gusts: [t, y, side (+1 from the right, -1 from the left)]; falling: [t, x, fall speed] */
  items: [number, number, number][];
  speed?: number;
}

export interface ScreenActSpec {
  id: string;
  kind: ScreenKind;
  /** cover/uncover: the light (board m); rx/ry radii */
  light?: { x: number; y: number; rx: number; ry?: number; color?: string };
  /** road: the left lip, the gap, the right lip, the bank height, and who crosses (groups cross in turn) */
  road?: { x0: number; gapA: number; gapB: number; x1: number; y: number; walkers: string[]; groups?: string[][]; speed?: number };
  /** wall: waves of gusts toward a protected x (and an optional tendril in the last wave) */
  wall?: { target: number; waves: Wave[]; tendril?: { t: number; y: number; side: number }; band: TargetSpec };
  /** catch: waves of falling things; delivered to (dx, dy) after riding 1.2 s */
  catch?: { what: 'light' | 'shadow' | 'loose'; waves: Wave[]; deliver?: [number, number]; tray: TargetSpec };
  /** hide: the figures (x, ground y, figure) and the sweeps (direction, speed, figures' x for that sweep) */
  hide?: { figures: [number, number, string][]; sweeps?: { dir: 1 | -1; speed: number; xs?: number[] }[] };
  /** birds: where they settle if nobody holds still (x, y) */
  birds?: { roost: [number, number]; n?: number };
  /** the amber target (default by kind) */
  target?: TargetSpec;
  /** the advice slip: how to do it */
  advice?: string;
  /** keep the screen grid as it is at the start (the Lantern Room's visitors) */
  keepField?: boolean;
  /** seconds without any hand before the act resolves by itself */
  each?: number;
  /** rest between waves, s (default 3) */
  rest?: number;
  /** every frame: progress 0..1 */
  onProgress?: (v: number) => void;
  /** road: every walker, every frame: its raw progress (below 0 = still queued) and what it is doing,
   *  so the paper twins on the desk walk with their shadows */
  onWalker?: (id: string, frac: number, ev: { state: 'queue' | 'walk' | 'teeter' | 'fall' | 'done'; slot: number }) => void;
  /** when it ends: byHand (the reader did it), and a count (caught, blocked, hidden...) */
  onDone?: (byHand: boolean, n: number, info?: ActInfo) => void;
}

/** little shadow figures (screen mm paths and scale) */
const FIGURES: Record<string, { path: string; s: number; h: number }> = {
  tomas: { path: B.TOMAS, s: 0.42, h: 0.034 },
  ama: { path: A.VILLAGER, s: 0.3, h: 0.022 },
  villager: { path: A.VILLAGER, s: 0.4, h: 0.03 },
  hat: { path: A.VILLAGER_HAT, s: 0.4, h: 0.031 },
  rabbit: { path: PLATES.rabbit.path, s: 0.2, h: 0.018 },
  fox: { path: PLATES.fox.path, s: 0.22, h: 0.019 },
  owl: { path: PLATES.owl.path, s: 0.2, h: 0.018 },
  heron: { path: PLATES.heron.path, s: 0.26, h: 0.025 },
  snail: { path: PLATES.snail.path, s: 0.16, h: 0.008 },
};
const LOOSE = [
  'M -6 0 C -2 4 2 4 6 0 C 2 -3 -2 -3 -6 0 Z', // a leaf
  'M -14 -2 L 14 -2 L 14 2 L -14 2 Z', // a scarf
  'M -5 -4 L 5 -4 L 6 4 L -6 4 Z', // a glove
];
const HAT = 'M -12 0 L 14 0 L 14 3 L 8 3 L 7 13 L -6 13 L -7 3 L -12 3 Z';
const GUST = 'M 0 -3 C 8 -9 18 -9 26 -2 C 18 -5 10 -4 6 0 C 12 -1 18 1 22 6 C 14 3 6 3 0 3 Z';
const TENDRIL = 'M 0 -5 C 10 -6 22 -2 30 0 C 22 2 10 6 0 5 Z';

/** shared geometry per path (triangulated once, never disposed) */
const GEO = new Map<string, ShapeGeometry>();
function geo(path: string): ShapeGeometry {
  let g = GEO.get(path);
  if (!g) {
    g = new ShapeGeometry(pathShape(path), 8);
    GEO.set(path, g);
  }
  return g;
}
function sprite(path: string, color: string, opacity: number, name: string): Mesh {
  const m = new Mesh(geo(path), new MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false }));
  m.name = name;
  m.renderOrder = 12;
  return m;
}
function figure(id: string, opacity = 0.92): Mesh {
  const f = FIGURES[id] ?? FIGURES.villager;
  const m = sprite(f.path, A.PAL.ink, opacity, `Screen figure ${id}`);
  m.scale.setScalar(f.s);
  m.renderOrder = 11;
  return m;
}

interface Walker {
  id: string;
  mesh: Mesh;
  x: number;
  y: number;
  /** order in the whole line; group index */
  k: number;
  g: number;
  air: number;
  tap: number;
  done: boolean;
  vy: number;
  fell: boolean;
}

interface Mote {
  mesh: Mesh;
  x: number;
  y: number;
  vy: number;
  hw: number;
  sway: number;
  state: 'fall' | 'ride' | 'deliver' | 'ground' | 'gone';
  t: number;
  ride: number;
  phase: number;
  /** the centre it sways about (kept inside the tray) and how far it may sway */
  x0: number;
  amp: number;
  cell: string;
}

interface Threat {
  mesh: Mesh;
  x: number;
  y: number;
  dir: number;
  speed: number;
  state: 'go' | 'press' | 'broke' | 'hit';
  t: number;
  press: number;
  tendril: boolean;
}

interface Bird {
  mesh: Mesh;
  x: number;
  y: number;
  tx: number;
  ty: number;
  state: 'wait' | 'fly' | 'sit';
  delay: number;
  t: number;
}

export class ScreenAct {
  readonly spec: ScreenActSpec;
  t = 0;
  /** seconds a hand shadow has been on the screen during this act */
  tHand = 0;
  done = false;
  byHand = false;
  count = 0;
  private host: ScreenHost;
  private group = new Group();
  private sw = new RegionSwitch(0.55, 0.3, 0.25);
  private onT = 0;
  private offT = 0;
  private wasCovered = false;
  private progress = 0;
  private endT = -1;
  private ownsLight = false;
  // waves
  private wave = 0;
  private waveT = 0;
  private resting = 0;
  private spawned = 0;
  // road
  private walkers: Walker[] = [];
  private plank: Mesh | null = null;
  private stone = false;
  private groupNow = 0;
  private groupRest = 0;
  // catch / wall
  private motes: Mote[] = [];
  private threats: Threat[] = [];
  // hide
  private sweepI = 0;
  private sweepX = 0;
  private sweepRest = 0;
  private passFrames: number[] = [];
  private coverFrames: number[] = [];
  private hidden = 0;
  private hideFigs: { mesh: Mesh; x: number; y: number; tx: number; eyes: Mesh[] }[] = [];
  // birds
  private birds: Bird[] = [];
  private stillT = 0;
  private lastC: [number, number, number] | null = null;
  private landedAt = -1;
  /** where the hand was when the birds came down (they stay while it stays near) */
  private birdsAt: [number, number] = [9, 9];

  constructor(host: ScreenHost, spec: ScreenActSpec) {
    this.host = host;
    this.spec = spec;
    this.group.name = `Screen act ${spec.id}`;
    host.board.add(this.group);
    const s = spec;
    if ((s.kind === 'cover' || s.kind === 'uncover') && s.light) {
      host.light.set(s.light.x, s.light.y, s.light.rx, s.light.ry ?? s.light.rx, 1, s.light.color);
    } else if (s.kind === 'road' && s.road) {
      const r = s.road;
      // the banks: painted ledges, so the walkers stand on something
      this.ledge(r.x0 - 0.04, r.gapA, r.y);
      this.ledge(r.gapB, r.x1 + 0.04, r.y);
      const groups = r.groups ?? [r.walkers];
      let k = 0;
      groups.forEach((grp, g) => grp.forEach((id, j) => {
        const mesh = figure(id);
        const x = r.x0 - j * 0.026;
        mesh.position.set(x, r.y, 0.0032);
        mesh.visible = g === 0;
        this.group.add(mesh);
        this.walkers.push({ id, mesh, x, y: r.y, k, g, air: 0, tap: 0, done: false, vy: 0, fell: false });
        k++;
      }));
    } else if (s.kind === 'hide' && s.hide) {
      for (const [x, y, id] of s.hide.figures) {
        const mesh = figure(id);
        mesh.position.set(x, y, 0.0032);
        const eyes: Mesh[] = [];
        for (const dx of [-0.0022, 0.0022]) {
          const e = new Mesh(new PlaneGeometry(0.0016, 0.0016), new MeshBasicMaterial({ color: '#fff4d0', transparent: true, opacity: 0, depthWrite: false }));
          e.position.set(x + dx, y + (FIGURES[id]?.h ?? 0.02) * 0.8, 0.0034);
          eyes.push(e);
          this.group.add(e);
        }
        this.group.add(mesh);
        this.hideFigs.push({ mesh, x, y, tx: x, eyes });
      }
      // the steps they stand on
      this.ledge(-0.16, 0.1, s.hide.figures[0][1]);
      const sw = this.sweeps[0];
      this.sweepX = sw.dir > 0 ? -0.27 : 0.27;
    }
    host.target(s.target ?? this.defaultTarget(), true);
    if (!spec.keepField) host.field.clear();
    host.log(`screen:${spec.id}:start`);
  }

  /** a painted ledge (ground) from x0 to x1 with its top at y */
  private ledge(x0: number, x1: number, y: number): void {
    const m = new Mesh(new PlaneGeometry(x1 - x0, 0.007), new MeshBasicMaterial({ color: A.PAL.ink, transparent: true, opacity: 0.9, depthWrite: false }));
    m.name = 'Ledge';
    m.position.set((x0 + x1) / 2, y - 0.0035, 0.0031);
    m.renderOrder = 11;
    this.group.add(m);
  }

  private get sweeps(): { dir: 1 | -1; speed: number; xs?: number[] }[] {
    return this.spec.hide?.sweeps ?? [{ dir: 1, speed: 0.08 }];
  }

  private defaultTarget(): TargetSpec | null {
    const s = this.spec;
    if ((s.kind === 'cover' || s.kind === 'uncover') && s.light) {
      const L = s.light;
      return { kind: 1, a: [L.x, L.y, L.rx * 1.4, (L.ry ?? L.rx) * 1.4] };
    }
    if (s.kind === 'road' && s.road) {
      const r = s.road;
      return { kind: 3, a: [(r.gapA + r.gapB) / 2, r.y - 0.012, (r.gapB - r.gapA) / 2 + 0.008, 0.012] };
    }
    if (s.kind === 'wall' && s.wall) return s.wall.band;
    if (s.kind === 'catch' && s.catch) return s.catch.tray;
    if (s.kind === 'hide' && s.hide) return this.hideTarget(s.hide.figures.map((f) => f[0]), s.hide.figures[0][1]);
    if (s.kind === 'birds') return { kind: 1, a: [0, 0.14, 0.05, 0.06] };
    return null;
  }

  private hideTarget(xs: number[], y: number): TargetSpec {
    const lo = Math.min(...xs);
    const hi = Math.max(...xs);
    return { kind: 1, a: [(lo + hi) / 2, y + 0.017, (hi - lo) / 2 + 0.025, 0.032] };
  }

  private get each(): number {
    return this.spec.each ?? ({ cover: 12, uncover: 10, clear: 9, road: 14, wall: 9, catch: 10, hide: 9, birds: 14 } as const)[this.spec.kind];
  }

  private get rest(): number {
    return this.spec.rest ?? 3;
  }

  /** returns true when the act has ended */
  update(dt: number): boolean {
    if (this.done) return true;
    this.t += dt;
    const f = this.host.field;
    const hand = f.count > 12 && f.age < 0.6;
    if (hand) this.tHand += dt;
    const s = this.spec;
    switch (s.kind) {
      case 'cover':
      case 'uncover':
        this.updateCover(dt, hand);
        break;
      case 'clear':
        // hands resting on the real table can still throw a strip along the bottom: only the picture counts
        this.offT = f.countAbove(0.06) < 10 ? this.offT + dt : 0;
        this.progress = Math.min(1, this.offT / 1.5);
        if (this.offT >= 1.5) {
          this.count = 1;
          this.end(true, 0.2);
        } else if (this.t > this.each) this.end(false, 0);
        break;
      case 'road':
        this.updateRoad(dt);
        break;
      case 'wall':
        this.updateWall(dt);
        break;
      case 'catch':
        this.updateCatch(dt);
        break;
      case 'hide':
        this.updateHide(dt);
        break;
      case 'birds':
        this.updateBirds(dt, hand);
        break;
    }
    // say how, if nothing is happening
    // (never while the reader is already at it: a hand that has just come in gets a moment first)
    if (s.advice && this.endT < 0) this.host.advise(this.t > 4 && this.progress < 0.2 && this.count === 0 && (this.tHand < 0.5 || this.t > 9) && !this.resting && !this.groupRest && !this.sweepRest ? s.advice : '');
    s.onProgress?.(this.progress);
    if (this.endT >= 0) {
      this.endT -= dt;
      if (this.endT <= 0) this.finish();
    }
    return this.done;
  }

  private end(byHand: boolean, delay = 0.6): void {
    if (this.endT >= 0 || this.done) return;
    this.byHand = byHand;
    this.endT = delay;
    if (byHand) this.host.stamp();
    this.host.target(null);
    this.host.advise('');
    this.host.log(`screen:${this.spec.id}:${byHand ? 'hand' : 'self'}:${this.count}`);
  }

  private hatCaught = false;
  private info: ActInfo = {};
  private finish(): void {
    this.done = true;
    this.spec.onDone?.(this.byHand, this.count, { ...this.info, hat: this.hatCaught });
  }

  /** desktop click / tests: let it resolve by itself now */
  /** a wave is in play (the keeping tray holds its flights until the arms can rest) */
  get busy(): boolean {
    return this.endT < 0 && !this.resting && !this.groupRest && !this.sweepRest;
  }

  skip(): void {
    this.end(false, 0);
  }

  dispose(): void {
    if (this.ownsLight) this.host.light.set(0, 0, 0.01, 0.01, 0);
    this.host.target(null);
    this.host.advise('');
    this.host.cov(0);
    this.group.removeFromParent();
    const shared = new Set<unknown>(GEO.values());
    this.group.traverse((o) => {
      const m = o as Mesh;
      if (m.material) (m.material as MeshBasicMaterial).dispose();
      if (m.geometry && !shared.has(m.geometry)) m.geometry.dispose();
    });
  }

  /** a wave runner: spawns items on schedule, rests between waves; true when all waves are spent */
  private runWaves(dt: number, waves: Wave[], spawn: (it: [number, number, number], w: Wave) => void, alive: () => boolean): boolean {
    if (this.wave >= waves.length) return true;
    if (this.resting > 0) {
      this.resting -= dt;
      if (this.resting <= 0) {
        this.resting = 0;
        this.host.target(this.spec.target ?? this.defaultTarget(), true);
      }
      return false;
    }
    const w = waves[this.wave];
    this.waveT += dt;
    while (this.spawned < w.items.length && this.waveT >= w.items[this.spawned][0]) {
      spawn(w.items[this.spawned], w);
      this.spawned++;
    }
    if (this.spawned >= w.items.length && !alive()) {
      // nobody is playing: don't make them wait through the other waves
      if (this.wave === 0 && this.tHand < 0.5) {
        this.wave = waves.length;
        return true;
      }
      this.wave++;
      this.spawned = 0;
      this.waveT = 0;
      if (this.wave < waves.length) {
        this.resting = this.rest;
        this.host.target(this.spec.target ?? this.defaultTarget(), false);
        this.host.sound('rest');
      }
    }
    return this.wave >= waves.length;
  }

  // ---- cover / uncover ------------------------------------------------------------------------

  private updateCover(dt: number, hand: boolean): void {
    const L = this.spec.light!;
    const frac = this.host.field.coverEllipse(L.x, L.y, L.rx, L.ry ?? L.rx);
    const on = this.sw.update(hand ? frac : 0, dt);
    this.progress += ((hand ? frac : 0) - this.progress) * Math.min(1, dt * 6);
    this.host.cov(this.progress);
    if (this.spec.kind === 'cover') {
      this.onT = on ? this.onT + dt : 0;
      if (this.onT >= 0.6) {
        this.count = 1;
        this.end(true, 0.3);
      }
    } else {
      if (on) this.wasCovered = true;
      this.offT = frac < 0.12 ? this.offT + dt : 0;
      if (this.offT >= 1.0 && (this.wasCovered || this.t > 2.5)) {
        this.count = 1;
        this.end(true, 0.3);
      }
    }
    if (this.t > this.each && this.tHand < 1) this.end(false, 0);
    if (this.t > this.each + 10) this.end(false, 0);
  }

  // ---- road -----------------------------------------------------------------------------------

  private groundAt(x: number): number {
    const r = this.spec.road!;
    if (x <= r.gapA || x >= r.gapB) return r.y;
    if (this.plank) return r.y;
    // the heron stone (one hand): solid ground at the middle of the gap
    if (this.stone && Math.abs(x - (r.gapA + r.gapB) / 2) < 0.01) return r.y;
    return this.host.field.topAt(x, r.y - 0.045, r.y + 0.055);
  }

  /** one hand only for a while: the heron steps into the river as a stone, splitting the gap */
  useStone(): void {
    if (this.stone || this.spec.kind !== 'road') return;
    this.stone = true;
    const r = this.spec.road!;
    const m = figure('heron');
    const mid = (r.gapA + r.gapB) / 2;
    m.position.set(mid, r.y - 0.025, 0.0031);
    this.group.add(m);
    this.host.target({ kind: 3, a: [(r.gapA + mid) / 2, r.y - 0.012, (mid - r.gapA) / 2, 0.012], b: [(mid + r.gapB) / 2, r.y - 0.012, (r.gapB - mid) / 2, 0.012] }, true);
    this.host.log(`screen:${this.spec.id}:stone`);
  }

  private updateRoad(dt: number): void {
    const r = this.spec.road!;
    const speed = r.speed ?? 0.065;
    const groups = Math.max(...this.walkers.map((w) => w.g)) + 1;
    // groups cross in turn, with a rest between them
    if (this.groupRest > 0) {
      this.groupRest -= dt;
      if (this.groupRest <= 0) {
        this.groupRest = 0;
        this.groupNow++;
        this.host.target(this.spec.target ?? this.defaultTarget(), true);
        for (const w of this.walkers) if (w.g === this.groupNow) w.mesh.visible = true;
      }
    }
    for (const w of this.walkers) {
      if (w.done || w.g !== this.groupNow || this.groupRest > 0) continue;
      const gNow = this.groundAt(w.x);
      const gAhead = this.groundAt(w.x + 0.009);
      const leader = this.walkers.find((o) => o.k === w.k - 1 && o.g === w.g && !o.done);
      const room = !leader || leader.x - w.x > 0.022;
      const canStep = !Number.isNaN(gAhead) && Math.abs(gAhead - w.y) < 0.016 && room;
      if (!Number.isNaN(gNow) && (w.x <= r.gapA || w.x >= r.gapB || this.plank || Math.abs(gNow - w.y) < 0.03)) {
        w.air = 0;
        w.y += (gNow - w.y) * Math.min(1, dt * 14);
        w.vy = 0;
        if (canStep) {
          const before = w.x;
          w.x += speed * dt;
          w.tap = 0;
          if (Math.floor(w.x / 0.012) !== Math.floor(before / 0.012) && w.x > r.gapA && w.x < r.gapB) this.host.sound('step');
        } else w.tap += dt;
      } else {
        // the ground went away under it: a moment of teetering (lag-tolerant), then it floats back to the near lip
        w.air += dt;
        if (w.air > 0.5) {
          if (!w.fell) {
            w.fell = true;
            this.info.wet = (this.info.wet ?? 0) + 1;
            this.host.sound('rustle');
          }
          w.vy -= 0.35 * dt;
          w.y += w.vy * dt;
          const lip = r.gapA - 0.004;
          w.x += (lip - w.x) * Math.min(1, dt * 3);
          if (Math.abs(w.x - lip) < 0.003) {
            w.y = r.y;
            w.air = 0;
            w.vy = 0;
          }
        }
      }
      const slot = w.k - this.walkers.filter((o) => o.g < w.g).length;
      if (w.x >= r.x1 - slot * 0.024) {
        w.done = true;
        w.x = r.x1 - slot * 0.024;
        // across: it walks off the screen into the desk tray (a handover, never a pop)
        if (!this.plank) {
          this.host.keep?.(w.id, w.x, w.y, w.fell ? 'wet' : undefined);
          w.mesh.visible = false;
        }
      }
      w.mesh.position.set(w.x, w.y + (w.tap > 0.4 ? Math.abs(Math.sin(w.tap * 9)) * 0.0015 : 0) + (w.tap === 0 && w.air === 0 ? Math.abs(Math.sin(w.x * 260)) * 0.001 : 0), 0.0032);
      w.mesh.rotation.z = w.air > 0 ? Math.sin(this.t * 16) * 0.2 : 0;
    }
    // every walker, every frame (queued ones too), so the desk twins line up from the start
    if (this.spec.onWalker) {
      for (const w of this.walkers) {
        const raw = w.g > this.groupNow ? -0.05 * (w.g - this.groupNow) : (w.x - r.x0) / (r.x1 - r.x0);
        const state = w.done ? 'done' : w.g > this.groupNow ? 'queue' : w.air > 0.5 ? 'fall' : w.air > 0 ? 'teeter' : 'walk';
        this.spec.onWalker(w.id, raw, { state, slot: w.k });
      }
    }
    const all = this.walkers.length;
    this.progress = all ? this.walkers.filter((w) => w.done).length / all : 1;
    const groupDone = this.walkers.filter((w) => w.g === this.groupNow).every((w) => w.done);
    if (groupDone && this.groupRest <= 0) {
      if (this.groupNow + 1 < groups) {
        this.groupRest = this.rest;
        this.host.target(this.spec.target ?? this.defaultTarget(), false);
        this.host.sound('rest');
      } else {
        this.count = all;
        this.end(!this.plank, 0.5);
        return;
      }
    }
    // the book lays its own paper plank: nobody came, or the crossing stalled for a long while
    const crossing = this.walkers.some((w) => w.x > r.gapA + 0.01 && w.x < r.gapB && !w.done);
    if (!this.plank && ((this.t > this.each && this.tHand < 1 && !crossing) || this.t > this.each + 20 * groups)) {
      this.plank = sprite(B.ROAD_STONE, A.PAL.ink, 0.85, 'Book plank');
      this.plank.scale.set((r.gapB - r.gapA + 0.02) / 0.028, 0.8, 1);
      this.plank.position.set((r.gapA + r.gapB) / 2, r.y - 0.005, 0.003);
      this.group.add(this.plank);
      this.host.sound('rustle');
      this.host.log(`screen:${this.spec.id}:plank`);
    }
  }

  // ---- wall -----------------------------------------------------------------------------------

  /** a gust slows down inside the dashed band (a fair chance to meet it) */
  private inBand(x: number, y: number): boolean {
    const b = this.spec.wall?.band;
    if (!b) return false;
    const inR = (a: [number, number, number, number]) => Math.abs(x - a[0]) < a[2] + 0.02 && Math.abs(y - a[1]) < a[3];
    return inR(b.a) || (!!b.b && inR(b.b));
  }

  /** ≥ 3 shadow cells in a small window just ahead of the nose (one speck never stops a gust) */
  private blockedAt(nose: number, y: number, dir: number): boolean {
    const f = this.host.field;
    let n = 0;
    for (let i = 0; i < 3; i++) for (let j = -2; j <= 2; j++) if (f.atBoardAny(nose + dir * i * 0.00266, y + j * 0.00266)) n++;
    return n >= 3;
  }

  private updateWall(dt: number): void {
    const W = this.spec.wall!;
    const spent = this.runWaves(dt, W.waves, (it, w) => {
      const [, y, side] = it;
      const dir = side > 0 ? -1 : 1;
      const m = sprite(GUST, '#e9eef7', 0.85, 'Gust');
      m.scale.set(-dir * 0.9, 0.9 + 0.1 * this.wave, 1);
      this.group.add(m);
      this.threats.push({ mesh: m, x: side > 0 ? 0.25 : -0.25, y, dir, speed: w.speed ?? 0.08, state: 'go', t: 0, press: 0, tendril: false });
      // the last wave's tendril
      if (W.tendril && this.wave === W.waves.length - 1 && this.spawned === 0) {
        const td = W.tendril;
        const tm = sprite(TENDRIL, '#2a1d3a', 0.9, 'Tendril');
        tm.scale.set(td.side > 0 ? -1 : 1, 1, 1);
        this.group.add(tm);
        this.threats.push({ mesh: tm, x: td.side > 0 ? 0.25 : -0.25, y: td.y, dir: td.side > 0 ? -1 : 1, speed: 0.035, state: 'go', t: -td.t, press: 0, tendril: true });
      }
    }, () => this.threats.some((th) => th.state === 'go' || th.state === 'press'));
    for (const th of this.threats) {
      th.t += dt;
      if (th.t < 0) {
        th.mesh.visible = false;
        continue;
      }
      th.mesh.visible = true;
      if (th.state === 'go' || th.state === 'press') {
        const nose = th.x + th.dir * 0.026;
        const yy = th.y + (th.tendril ? 0 : Math.sin(th.t * 3) * 0.006);
        // the shadow grid is up to ~0.3 s old: look ahead by what the gust travels in that time
        const lag = Math.min(0.035, th.speed * 0.3);
        const blocked = this.blockedAt(nose, yy, th.dir) || this.blockedAt(nose + th.dir * lag, yy, th.dir);
        if (th.tendril) {
          // it presses on your palm, and breaks after 1.2 s of pressing; if the hand leaves it carries on
          if (blocked) {
            th.state = 'press';
            th.press += dt;
            th.mesh.scale.y = 1 + 0.15 * Math.sin(th.t * 20) * Math.min(1, th.press);
            if (th.press >= 1.2) {
              th.state = 'broke';
              th.t = 0;
              this.count++;
              this.info.tendril = 1;
              this.host.sound('break');
              this.host.keep?.('tendril', th.x, th.y);
            }
          } else {
            th.state = 'go';
            th.x += th.dir * th.speed * dt;
          }
        } else if (blocked) {
          th.state = 'broke';
          th.t = 0;
          this.count++;
          this.host.sound('break');
          this.host.keep?.('leaf', th.x, yy);
        } else th.x += th.dir * th.speed * dt * (this.inBand(th.x, yy) ? 0.6 : 1);
        if (th.state === 'go' && ((th.dir > 0 && nose >= W.target) || (th.dir < 0 && nose <= W.target))) {
          th.state = 'hit';
          th.t = 0;
          this.host.sound('rustle');
          this.info.missed = (this.info.missed ?? 0) + 1;
          if (th.tendril) this.info.tendril = 0;
          this.host.lose?.(th.tendril ? 'tendril' : 'scarf', th.x, yy, th.tendril ? 'road' : 'hollow');
        }
        th.mesh.position.set(th.x, yy, 0.0034);
      } else {
        const k = Math.min(1, th.t / 0.6);
        if (th.state === 'broke') {
          th.mesh.scale.y *= 1 + dt * 3;
          th.mesh.scale.x *= 1 - dt * 1.5;
        } else th.x += th.dir * 0.03 * dt;
        (th.mesh.material as MeshBasicMaterial).opacity = 0.85 * (1 - k);
        th.mesh.position.x = th.x;
        if (k >= 1) th.mesh.visible = false;
      }
    }
    const total = W.waves.reduce((a, w) => a + w.items.length, 0) + (W.tendril ? 1 : 0);
    this.progress = total ? this.count / total : 0;
    if (spent && this.threats.every((th) => th.state !== 'go' && th.state !== 'press')) this.end(this.count > 0, 0.8);
  }

  // ---- catch ----------------------------------------------------------------------------------

  private topHits(m: Mote, lo: number, hi: number): number {
    const f = this.host.field;
    let best = NaN;
    let hits = 0;
    for (const x of [m.x - m.hw, m.x, m.x + m.hw]) {
      const t = f.topAtAny(x, lo, hi);
      if (!Number.isNaN(t)) {
        hits++;
        best = Number.isNaN(best) ? t : Math.max(best, t);
      }
    }
    return hits >= 2 ? best : NaN;
  }

  private updateCatch(dt: number): void {
    const C = this.spec.catch!;
    const spent = this.runWaves(dt, C.waves, (it, w) => {
      const [, x, vy] = it;
      const k = this.motes.length;
      let mesh: Mesh;
      let hw = 0.006;
      let sway = 0.004;
      if (C.what === 'loose') {
        const last = this.wave === C.waves.length - 1 && this.spawned === w.items.length - 1;
        mesh = sprite(last ? HAT : LOOSE[k % LOOSE.length], A.PAL.ink, 0.92, last ? 'Hat' : 'Loose thing');
        mesh.scale.setScalar(last ? 1 : 0.9);
        hw = last ? 0.012 : k % 3 === 1 ? 0.015 : 0.007;
        sway = last ? 0.05 : 0.03;
        mesh.userData.hat = last;
      } else if (C.what === 'shadow') {
        mesh = figure(k % 2 ? 'villager' : 'hat', 0.85);
        hw = 0.008;
      } else {
        mesh = new Mesh(new PlaneGeometry(0.018, 0.018), new MeshBasicMaterial({ map: glowTexture(), color: '#ffe2a0', transparent: true, opacity: 0.95, depthWrite: false }));
        mesh.renderOrder = 12;
      }
      this.group.add(mesh);
      // it falls INSIDE the drawn tray, and sways only as far as the tray allows
      const [tcx, , thw] = C.tray.a;
      const x0 = Math.min(tcx + thw - hw, Math.max(tcx - thw + hw, x));
      const amp = Math.max(0, Math.min(sway * 0.4, thw - Math.abs(x0 - tcx) - hw));
      const cell = C.what === 'loose' ? (mesh.userData.hat ? 'hat' : ['leaf', 'scarf', 'glove'][k % 3]) : C.what === 'shadow' ? (k % 2 ? 'villager' : 'hat') : 'leaf';
      this.motes.push({ mesh, x: x0, y: 0.245, vy: -Math.abs(vy || 0.03), hw, sway, state: 'fall', t: 0, ride: 0, phase: k * 1.7, x0, amp, cell });
    }, () => this.motes.some((m) => m.state === 'fall' || m.state === 'ride'));
    const [dx, dy] = C.deliver ?? [-0.19, 0.04];
    for (const m of this.motes) {
      m.t += dt;
      if (m.state === 'fall') {
        m.y += m.vy * dt;
        m.x = m.x0 + m.amp * Math.sin(m.t * 2.4 + m.phase);
        if (C.what === 'loose') m.mesh.rotation.z = Math.sin(m.t * 2.6 + m.phase) * 0.5;
        const top = this.topHits(m, m.y - 0.012, m.y + 0.004);
        if (!Number.isNaN(top)) {
          m.state = 'ride';
          m.y = top;
          m.ride = 0;
          m.mesh.rotation.z = 0;
          this.count++; // it only ever goes up: a caught thing stays caught
          if (m.mesh.userData.hat) this.hatCaught = true;
          this.host.sound('bell');
        } else if (m.y <= 0.012) {
          m.state = 'ground';
          m.t = 0;
          this.info.missed = (this.info.missed ?? 0) + 1;
          this.host.lose?.(m.cell, m.x, m.y, C.what === 'shadow' ? 'chimney' : 'sea');
        }
      } else if (m.state === 'ride') {
        // it sits on your shadow's top and moves with it; after 1.2 s it is delivered (arms can rest)
        m.ride += dt;
        const top = this.topHits(m, m.y - 0.03, m.y + 0.03);
        if (!Number.isNaN(top)) m.y += (top - m.y) * Math.min(1, dt * 10);
        if (m.ride >= 1.2 || Number.isNaN(top)) {
          // saved: it hops from your shadow to the keeping tray on the desk
          m.state = 'gone';
          m.mesh.visible = false;
          this.host.keep?.(m.cell, m.x, m.y);
        }
      } else if (m.state === 'deliver') {
        const k = Math.min(1, m.t / 0.9);
        m.x += (dx - m.x) * Math.min(1, dt * 3);
        m.y += (dy + Math.sin(k * Math.PI) * 0.04 - m.y) * Math.min(1, dt * 3);
        (m.mesh.material as MeshBasicMaterial).opacity = 0.95 * (1 - k * 0.7);
        if (k >= 1) {
          m.state = 'gone';
          m.mesh.visible = false;
        }
      } else if (m.state === 'ground') {
        (m.mesh.material as MeshBasicMaterial).opacity = Math.max(0.3, 0.95 - m.t);
      }
      m.mesh.position.set(m.x, m.y + 0.006, 0.0036);
    }
    this.updateHints(C);
    const total = C.waves.reduce((a, w) => a + w.items.length, 0);
    this.progress = total ? this.count / total : 0;
    if (spent && this.motes.every((m) => m.state === 'gone' || m.state === 'ground')) this.end(this.count > 0, 0.8);
  }

  /** landing hints: a soft ink oval on the tray line where a falling thing will land, about 1 s ahead */
  private hints: Mesh[] = [];
  private updateHints(C: NonNullable<ScreenActSpec['catch']>): void {
    const trayTop = C.tray.a[1] + C.tray.a[3];
    const soon = this.motes.filter((m) => m.state === 'fall' && (m.y - trayTop) / Math.abs(m.vy) <= 1 && m.y > trayTop);
    while (this.hints.length < Math.min(4, soon.length)) {
      const h = new Mesh(new PlaneGeometry(1, 0.004), new MeshBasicMaterial({ color: A.PAL.ink, transparent: true, opacity: 0, depthWrite: false }));
      h.name = 'Landing hint';
      h.renderOrder = 11;
      this.group.add(h);
      this.hints.push(h);
    }
    this.hints.forEach((h, i) => {
      const m = soon[i];
      const mat = h.material as MeshBasicMaterial;
      if (!m) {
        mat.opacity = 0;
        h.visible = false;
        return;
      }
      const k = 1 - Math.max(0, Math.min(1, (m.y - trayTop) / Math.abs(m.vy)));
      h.visible = true;
      mat.opacity = 0.5 * k;
      h.scale.set((m.hw * 2 + 0.006) * (1.6 - 0.6 * k), 1, 1);
      h.position.set(m.x0, trayTop, 0.0033);
    });
  }

  // ---- hide -----------------------------------------------------------------------------------

  private updateHide(dt: number): void {
    const H = this.spec.hide!;
    const f = this.host.field;
    const sweeps = this.sweeps;
    const sw = sweeps[Math.min(this.sweepI, sweeps.length - 1)];
    this.ownsLight = true;
    if (this.sweepRest > 0) {
      // rest: the light lifts and fades; the figures walk to their next places
      this.sweepRest -= dt;
      this.host.light.set(this.sweepX, this.spec.hide!.figures[0][1], 0.032, 0.12, 0);
      for (const g of this.hideFigs) {
        g.x += Math.sign(g.tx - g.x) * Math.min(Math.abs(g.tx - g.x), 0.03 * dt);
        g.mesh.position.x = g.x;
        g.eyes.forEach((e, i) => (e.position.x = g.x + (i ? 0.0022 : -0.0022)));
      }
      if (this.sweepRest <= 0) {
        this.sweepRest = 0;
        this.host.target(this.hideTarget(this.hideFigs.map((g) => g.x), H.figures[0][1]), true);
      }
      return;
    }
    if (this.t > 1.6) this.sweepX += sw.dir * sw.speed * dt;
    const lightOn = Math.min(1, Math.max(0, (this.t - 1.0) / 0.6));
    this.host.light.set(this.sweepX, H.figures[0][1], 0.032, 0.12, lightOn, '#f4f7ff');
    let anyUnder = 0;
    this.hideFigs.forEach((g, i) => {
      const h = (FIGURES[H.figures[i][2]]?.h ?? 0.02) * 0.6;
      const cov = f.coverEllipse(g.x, g.y + h, 0.012, h + 0.004);
      const under = cov > 0.55;
      if (under) anyUnder++;
      const mat = g.mesh.material as MeshBasicMaterial;
      mat.opacity += ((under ? 0 : 0.92) - mat.opacity) * Math.min(1, dt * 6);
      for (const e of g.eyes) (e.material as MeshBasicMaterial).opacity += ((under ? 0.95 : 0) - (e.material as MeshBasicMaterial).opacity) * Math.min(1, dt * 6);
      // hidden is decided over the whole pass: ≥ 60 % of the frames while the light is over it
      if (Math.abs(this.sweepX - g.x) < 0.028) {
        this.passFrames[i] = (this.passFrames[i] ?? 0) + 1;
        if (under) this.coverFrames[i] = (this.coverFrames[i] ?? 0) + 1;
      }
    });
    this.progress = this.hideFigs.length ? anyUnder / this.hideFigs.length : 0;
    const off = sw.dir > 0 ? this.sweepX > 0.27 : this.sweepX < -0.27;
    if (off) {
      const last = this.sweepI === sweeps.length - 1;
      this.hideFigs.forEach((g, i) => {
        const hid = (this.passFrames[i] ?? 0) > 0 && (this.coverFrames[i] ?? 0) / this.passFrames[i] >= 0.6;
        if (hid) this.hidden++;
        if (!last || this.tHand < 0.5) return;
        // the last sweep decides: kept safe (to the tray), or taken up the hill to the Hollow
        const id = H.figures[i][2];
        if (hid) this.host.keep?.(id, g.x, g.y);
        else {
          this.info.takenMask = (this.info.takenMask ?? 0) | (1 << i);
          this.host.lose?.(id, g.x, g.y, 'hollow');
          g.mesh.visible = false;
          for (const e of g.eyes) e.visible = false;
        }
      });
      this.passFrames = [];
      this.coverFrames = [];
      this.sweepI++;
      if (this.sweepI >= sweeps.length || (this.sweepI === 1 && this.tHand < 0.5)) {
        this.count = this.hidden;
        this.host.light.set(0, 0, 0.01, 0.01, 0);
        this.end(this.count > 0, 0.4);
        return;
      }
      const next = sweeps[this.sweepI];
      this.sweepX = next.dir > 0 ? -0.27 : 0.27;
      this.sweepRest = this.rest;
      if (next.xs) this.hideFigs.forEach((g, i) => (g.tx = next.xs![i] ?? g.tx));
      this.host.target(this.hideTarget(this.hideFigs.map((g) => g.tx), H.figures[0][1]), false);
      this.host.sound('rest');
    }
  }

  // ---- birds (Tree for the Birds) ---------------------------------------------------------------

  /** perches: local maxima of the shadow's top edge (your fingertips) */
  private perchCache: { frame: number; v: [number, number][] } = { frame: -1, v: [] };
  private perches(): [number, number][] {
    const f = this.host.field;
    if (this.perchCache.frame === f.frames) return this.perchCache.v;
    const tops: number[] = [];
    const xs: number[] = [];
    for (let x = -0.2; x <= 0.2; x += 0.00266) {
      xs.push(x);
      tops.push(f.topAt(x, 0.03, 0.245));
    }
    const out: [number, number][] = [];
    for (let i = 0; i < tops.length; i++) {
      const t = tops[i];
      if (Number.isNaN(t)) continue;
      let peak = true;
      let lower = 0;
      for (let j = -4; j <= 4; j++) {
        const u = tops[i + j];
        if (j === 0 || u === undefined) continue;
        if (!Number.isNaN(u) && u > t) peak = false;
        if (Number.isNaN(u) || u < t - 0.005) lower++;
      }
      if (peak && lower >= 2 && !out.some(([x]) => Math.abs(x - xs[i]) < 0.013)) out.push([xs[i], t]);
    }
    const v = out.sort((a, b) => b[1] - a[1]).slice(0, this.spec.birds?.n ?? 5);
    this.perchCache = { frame: f.frames, v };
    return v;
  }

  private updateBirds(dt: number, hand: boolean): void {
    const P = this.spec.birds ?? { roost: [0.15, 0.06] as [number, number] };
    const f = this.host.field;
    if (!this.birds.length) {
      const n = P.n ?? 5;
      for (let i = 0; i < n; i++) {
        const mesh = sprite(BIRD, A.PAL.ink, 0.9, 'Perching bird');
        mesh.scale.setScalar(0.16);
        this.group.add(mesh);
        this.birds.push({ mesh, x: 0.26 + i * 0.02, y: 0.2 + (i % 2) * 0.02, tx: 0, ty: 0.19, state: 'wait', delay: i * 0.5, t: 0 });
      }
    }
    // stillness: the shadow's centre moves < 3 mm and its area changes < 8 % for 1 s
    const c = f.count > 20 && f.age < 0.6 ? f.centroid() : null;
    if (!c) {
      this.stillT = 0;
      this.lastC = null;
    } else if (!this.lastC || Math.hypot(c[0] - this.lastC[0], c[1] - this.lastC[1]) > 0.005 || Math.abs(c[2] - this.lastC[2]) > 0.15 * this.lastC[2]) {
      this.lastC = c;
      this.stillT = 0;
    } else this.stillT += dt;
    // still for a second brings them down; once they are down they stay while the hand stays within a
    // centimetre or so (a wobble or a tremor does not send them off), and a hand that has been in the
    // light for six seconds gets them anyway: stillness decides how soon they come, never whether
    const at = c ? Math.hypot(c[0] - this.birdsAt[0], c[1] - this.birdsAt[1]) : 9;
    if (hand && this.stillT > 1.0 && c) this.birdsAt = [c[0], c[1]];
    const still = hand && !!c && (this.stillT > 1.0 || at < 0.014 || this.tHand > 6);
    if (!hand || !c) this.birdsAt = [9, 9];
    else if (this.tHand > 6 && at >= 0.014 && this.stillT > 0.3) this.birdsAt = [c[0], c[1]];
    const perches = still ? this.perches() : [];
    let landed = 0;
    const self = !hand && this.t > this.each;
    this.birds.forEach((b, i) => {
      b.t += dt;
      if (b.t < b.delay) return;
      if (still && perches[i]) {
        b.tx = perches[i][0];
        b.ty = perches[i][1] + 0.002;
        if (b.state !== 'sit') b.state = 'fly';
      } else if (self) {
        b.tx = P.roost[0] + i * 0.012;
        b.ty = P.roost[1];
        if (b.state !== 'sit') b.state = 'fly';
      } else {
        // circling, waiting for a still branch (they leave if you move fast)
        b.state = 'fly';
        b.tx = Math.sin(this.t * 0.7 + i * 1.3) * 0.12;
        b.ty = 0.2 + Math.sin(this.t * 1.3 + i) * 0.02;
      }
      b.x += (b.tx - b.x) * Math.min(1, dt * 2.2);
      b.y += (b.ty - b.y) * Math.min(1, dt * 2.2);
      const near = Math.hypot(b.tx - b.x, b.ty - b.y) < 0.004;
      if (b.state === 'fly' && near && (still || self)) {
        b.state = 'sit';
        this.host.sound('tap');
      }
      if (b.state === 'sit') landed++;
      const sit = b.state === 'sit';
      b.mesh.scale.set(0.16 * (sit ? 1 : Math.sign(b.tx - b.x) || 1), 0.16 * (sit ? 0.7 : 0.7 + 0.3 * Math.abs(Math.sin(b.t * 9))), 1);
      b.mesh.position.set(b.x, b.y, 0.0036);
    });
    this.progress = landed / this.birds.length;
    const want = self ? this.birds.length : Math.min(this.birds.length, Math.max(1, perches.length));
    if (landed >= want && landed > 0) {
      if (this.landedAt < 0) this.landedAt = this.t;
      this.count = landed;
      if (this.t - this.landedAt > 3) {
        if (!self) for (const b of this.birds) if (b.state === 'sit') {
          this.host.keep?.('bird', b.x, b.y);
          b.mesh.visible = false;
        }
        this.end(!self, 0);
      }
    } else this.landedAt = -1;
    if (this.t > 24) this.end(this.count > 0, 0);
  }
}

/** the light painted into the screen, as shader uniforms */
export function lightUniforms(u: Record<string, { value: unknown }>): ScreenHost['light'] {
  return {
    set(x, y, rx, ry, on, color) {
      (u.uLight.value as Vector4).set(x, y, rx, ry);
      u.uLightOn.value = on;
      if (color) (u.uLightCol.value as { set(c: string): void }).set(color);
    },
  };
}
