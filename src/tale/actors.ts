import { Group, Mesh, MeshBasicMaterial, Vector3 } from '@iwsdk/core';
import * as A from './art.js';
import * as B from './art2.js';
import { CAST, type CharDef } from './cast.js';
import { cutout, flat, mergeStatic, paper } from './paper.js';

/**
 * Everyone who stands on the stage page and travels from page to page:
 * people (Ama, Tomas, Granny Pell) and the paper characters the reader makes.
 * Actors walk to where a page wants them, with little hops.
 */
export class Actor {
  readonly root = new Group();
  readonly target = new Vector3();
  /** metres per second while walking */
  speed = 0.06;
  /** hop height while walking (0 = glide) */
  hop = 0.006;
  /** 1 faces +x, -1 faces -x */
  facing = 1;
  private size = 1;
  private sizeNow = 0;
  /** how fast size changes (per second, eased) */
  sizeRate = 5;
  /** the size the actor was made at (for resets) */
  baseSize = 1;
  /** eased height (so changes of level are walked or flown, never teleported) */
  private baseY = 0;
  /** flies between heights (the owl) */
  flyer = false;
  private walkT = 0;
  visible = true;
  /** idle bob (breathing / a hopping rabbit) */
  idle: 'still' | 'breathe' | 'hop' = 'breathe';
  /**
   * How it travels, like a paper puppet on a stick: people `step` (a waddle), the rabbit
   * `hop`s (moving only in the air), the fox `trot`s, the heron `stride`s (stop-start),
   * the snail `glide`s (an inchworm stretch), the boat `float`s (rocking), the owl `fly`s.
   */
  gait: 'step' | 'hop' | 'trot' | 'stride' | 'glide' | 'float' | 'fly' = 'step';
  private t = Math.random() * 10;
  /** the paper turn: eases through edge-on when the facing flips */
  private flip = 1;
  /** 0 standing .. 1 lying flat on the page (the book folds its cast like its scenery) */
  fold = 0;
  /** the page surface (book-local y), where a folded actor lies */
  pageY = 0;

  /** a momentary squash/stretch (an ear twitch), 1 = none */
  squash = 1;

  constructor(readonly id: string, body: Group | Mesh, size = 1) {
    this.root.name = `Actor ${id}`;
    this.root.add(body);
    this.size = size;
    this.baseSize = size;
  }

  /** place immediately */
  put(p: Vector3): void {
    this.target.copy(p);
    this.root.position.copy(p);
    this.baseY = p.y;
    this.flip = this.facing;
    // placed while folded: arrive at full size, so standing up is pure paper rotation
    if (this.fold > 0.5) this.sizeNow = this.size * (this.visible ? 1 : 0);
  }

  /** walk to a point (book-local) */
  go(p: Vector3): void {
    this.target.copy(p);
    this.tracking = false;
  }

  /** follow a moving point closely (a twin of a shadow on the screen): no speed cap */
  tracking = false;
  track(p: Vector3): void {
    this.target.copy(p);
    this.tracking = true;
  }

  setSize(s: number): void {
    this.size = s;
  }

  get moving(): boolean {
    return this.root.position.distanceTo(this.target) > 0.003;
  }

  update(dt: number, onStep?: () => void): void {
    this.t += dt;
    const show = this.visible ? 1 : 0;
    this.sizeNow += (this.size * show - this.sizeNow) * Math.min(1, dt * this.sizeRate);
    this.root.visible = this.sizeNow > 0.01;
    const p = this.root.position;
    const d = this.target.clone().sub(p);
    d.y = 0;
    const dist = d.length();
    let lift = 0;
    const climbing = Math.abs(this.target.y - this.baseY) > 0.002;
    this.baseY += (this.target.y - this.baseY) * Math.min(1, dt * (this.flyer ? 2.5 : 4));
    if (this.flyer && (dist > 0.01 || climbing)) lift += Math.sin(Math.min(1, dist / 0.15) * Math.PI) * 0.03;
    let sway = 0;
    let stretch = 1;
    const g = this.gait;
    if (dist > 0.003) {
      // the gait sets how far each moment carries it
      let k = 1;
      if (g === 'hop') {
        // 0.30 s in the air, 0.12 s on the ground: it only moves while airborne
        const ph = (this.walkT % 1) * 0.42;
        k = ph < 0.3 ? 1.4 : 0;
        lift = ph < 0.3 ? Math.sin((ph / 0.3) * Math.PI) * Math.max(this.hop, 0.008) : 0;
      } else if (g === 'stride') {
        k = 0.25 + 1.5 * Math.pow(Math.max(0, Math.sin(this.walkT * Math.PI)), 2); // stop, step, stop
        lift = Math.abs(Math.sin(this.walkT * Math.PI)) * this.hop;
      } else if (g === 'glide') {
        k = 0.4 + 0.9 * Math.max(0, Math.sin(this.walkT * Math.PI * 2));
        stretch = 1 + 0.07 * Math.sin(this.walkT * Math.PI * 2);
      } else if (g === 'float') {
        lift = 0.0007 * Math.sin(this.t * 2.2);
      } else if (g !== 'fly') {
        lift = Math.abs(Math.sin(this.walkT * Math.PI)) * this.hop;
        sway = (g === 'step' ? 0.06 : 0.035) * Math.sin(this.walkT * Math.PI);
      }
      const step = this.tracking ? dist * Math.min(1, dt * 9) : Math.min(dist, this.speed * dt * k);
      p.addScaledVector(d.normalize(), step);
      if (Math.abs(d.x) > 0.2 * Math.abs(d.z) && Math.abs(this.target.x - p.x) > 0.004) this.facing = this.target.x > p.x ? 1 : -1;
      const before = this.walkT % 1;
      // distance-driven: small puppets take quick steps, big ones slower
      const rate = g === 'hop' ? 1 / 0.42 : g === 'trot' ? 4.2 : g === 'stride' ? 1.4 : g === 'glide' ? 1.1 : 3.0;
      this.walkT += dt * rate;
      if (onStep && this.walkT % 1 < before) onStep();
    } else if (this.idle === 'hop') {
      const h = (this.t * 0.8) % 3;
      lift = h < 0.42 ? Math.sin((h / 0.42) * Math.PI) * 0.01 : 0;
    }
    if (g === 'float') {
      // a boat on water rocks and heaves even at rest
      sway = 0.05 * Math.sin(Math.PI * 2 * 0.35 * this.t) + 0.025 * Math.sin(Math.PI * 2 * 0.61 * this.t + 1.3);
      lift += 0.0007 * Math.sin(this.t * 2.2);
    }
    // folded: hinge at the feet, the top falls toward the reader, and it sinks onto the page
    const f = this.fold;
    const stand = 1 - f;
    p.y = (this.baseY + lift * stand) * stand + (this.pageY + 0.0015) * f;
    this.root.rotation.x = (Math.PI / 2) * foldEase(f);
    if (f > 0.98) this.root.visible = false;
    sway *= stand;
    this.root.rotation.z += (sway - this.root.rotation.z) * Math.min(1, dt * 10);
    // the paper turn: through edge-on, never a mirror snap
    const turn = Math.min(1, dt / 0.22) * 2;
    this.flip += Math.max(-turn, Math.min(turn, this.facing - this.flip));
    const fx = Math.sign(this.flip || 1) * Math.max(0.04, Math.abs(this.flip));
    const breathe = this.idle === 'still' || f > 0 ? 1 : 1 + Math.sin(this.t * 1.7) * 0.012;
    this.root.scale.set(this.sizeNow * fx * stretch, this.sizeNow * breathe * this.squash, this.sizeNow);
  }
}

/** paper falling flat: slow start, quick drop, one tiny bounce at the page */
export const foldEase = (t: number) => (t <= 0 ? 0 : t >= 1 ? 1 : t < 0.82 ? Math.pow(t / 0.82, 2) : 1 - 0.05 * Math.sin(((t - 0.82) / 0.18) * Math.PI));
/** standing up: overshoot past upright about 6 degrees, then settle (easeOutBack) */
export const popEase = (t: number) => {
  const s = 1.2;
  const u = t - 1;
  return t >= 1 ? 1 : t <= 0 ? 0 : 1 + (s + 1) * u * u * u + s * u * u;
};

/** a person cut-out (Tomas, Granny Pell) */
export function person(kind: 'tomas' | 'granny'): { actor: Actor; extra: Record<string, Mesh> } {
  const g = new Group();
  const extra: Record<string, Mesh> = {};
  if (kind === 'tomas') {
    g.add(cutout(B.TOMAS, { color: '#5d5a78', name: 'Tomas' }));
    g.add(cutout(B.TOMAS_HAT, { color: '#2e2a3a', name: 'Tomas hat' }));
    g.add(cutout(B.TOMAS_STICK, { color: '#4a3424', name: 'Tomas stick' }));
    const face = flat(A.AMA_HEAD, paper('#c9a487'), 'Tomas face');
    face.scale.setScalar(0.62);
    face.position.set(1.5 * 0.001, 0.0615, 0.0009);
    g.add(face);
  } else {
    g.add(cutout(B.GRANNY, { color: '#8a5f6f', name: 'Granny Pell' }));
    const face = flat(A.AMA_HEAD, paper('#cfac8f'), 'Granny face');
    face.scale.setScalar(0.6);
    face.position.set(0, 0.0605, 0.0009);
    g.add(face);
    const specs = flat(B.SPECTACLES, new MeshBasicMaterial({ color: '#1b1424' }), 'Spectacles');
    specs.position.set(0, -0.009, 0.001);
    specs.visible = false;
    specs.userData.keep = true;
    g.add(specs);
    extra.specs = specs;
  }
  mergeStatic(g, kind);
  const actor = new Actor(kind, g, 1.25);
  actor.speed = 0.035;
  actor.hop = 0.002;
  actor.gait = 'step';
  return { actor, extra };
}

/** a paper puppet for a cast character (the shape the reader's shadow folded into) */
export function puppet(def: CharDef): Actor {
  const g = new Group();
  g.add(cutout(def.paper, { color: def.color, emissive: def.glow, emissiveIntensity: def.glow ? 0.18 : 0, name: def.id }));
  for (const d of def.details ?? []) {
    const eye = flat(d, new MeshBasicMaterial({ color: A.PAL.ink }), `${def.id} eye`);
    eye.position.z = 0.0009;
    g.add(eye);
  }
  if (def.id === 'boat') {
    const sail = cutout(B.BOAT_SAIL, { color: '#efe3c8', name: 'Sail' });
    sail.position.z = -0.001;
    g.add(sail);
  }
  if (def.id === 'tower' || def.id === 'keep') {
    const lampMat = new MeshBasicMaterial({ color: '#ffd38a', transparent: true, opacity: 0.25 });
    const win = flat(B.TOWER_WINDOW, lampMat, 'Tower lamp');
    win.position.z = 0.0009;
    win.userData.keep = true;
    g.add(win);
    g.userData.lamp = lampMat;
  }
  mergeStatic(g, def.id);
  const a = new Actor(def.id, g, def.scale);
  a.flyer = def.id === 'owl';
  a.idle = def.hops ? 'hop' : def.id === 'tower' || def.id === 'boat' ? 'still' : 'breathe';
  // only the rabbit hops; the others step, glide or (the owl) fly
  a.hop = def.hops ? 0.01 : def.id === 'snail' || def.id === 'boat' ? 0 : 0.0025;
  a.speed = def.id === 'snail' ? 0.012 : 0.07;
  const GAITS: Record<string, Actor['gait']> = { rabbit: 'hop', fox: 'trot', owl: 'fly', heron: 'stride', snail: 'glide', boat: 'float', mark: 'fly' };
  a.gait = GAITS[def.id] ?? 'step';
  if (a.gait === 'trot') {
    // the fox trots low; only the rabbit hops
    a.hop = 0.004;
    a.idle = 'breathe';
  }
  return a;
}

export function castDef(id: string): CharDef {
  return CAST[id];
}
