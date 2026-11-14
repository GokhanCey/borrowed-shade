import { DoubleSide, Group, Mesh, MeshBasicMaterial, Shape, ShapeGeometry, Vector2, Vector3 } from '@iwsdk/core';
import * as A from './art.js';
import * as B from './art2.js';
import { BIRD, HERON_SHADOW } from './cast.js';
import { cutShape, flat, pathShape, placedPoints } from './paper.js';
import { PLATES } from './silhouettes-data.js';

/** little pegs down the Hollow's sides, where it hangs what the wind and the light took (mm, the peg's tip) */
const COAT_PEGS: [number, number][] = [[-29, 114], [30, 70], [-31, 66], [30, 112], [-33, 34], [32, 36]];
/** a scarf, hanging from its top (mm) */
const SCARF = 'M -5 0 L 5 0 L 5.5 -15 L 8 -27 L 3 -25 L 1 -17 L -1.5 -28 L -6.5 -26 L -4 -15 Z';

/** the seven villagers cut out of the Hollow: path, x, y (mm, base centre), scale, flipX */
const CUTS: [string, number, number, number, number][] = [
  [B.CUT_HATMAN, -19, 22, 1, 1],
  [B.CUT_BASKET, -1, 22, 1, 1],
  [B.CUT_DOG, 21, 22, 0.8, 1],
  [B.CUT_SHOULDERS, -14, 52, 1, 1],
  [B.CUT_PIPE, 9, 52, 1, 1],
  [B.GRANNY, -1, 77, 0.24, 1],
  [HERON_SHADOW, 24, 78, 0.26, -1],
];

/**
 * The Hollow: the shadow of a tower that is not there, made like kirigami. It lives on the shadow
 * screen (board-local metres: x from the centre, y from the bottom).
 *  - three laminated card sheets with torn crowns; it sways gently around its base (never wobbles)
 *  - one arched window cut right through, its only eye, with the sky (or the moon) in it
 *  - the stolen shadows are CUT OUT of its body: seven villagers, light showing through
 * When it lets go, each villager pops out, falls, and lands standing; its hole darkens shut.
 * It can be glimpsed, grow when afraid, shed its shadows, or become a bird.
 */
export class Hollow {
  readonly root = new Group();
  private tower = new Group();
  private bird = new Group();
  /** the three card sheets (back C, mid B, front A) */
  private sheets: Mesh[] = [];
  /** the light behind the cut-outs (darkens as the villagers come home) */
  private glow: Mesh;
  private window: Mesh;
  private ring: Mesh;
  /** the falling villagers (only during a shed) */
  private figs: Mesh[] = [];
  private heal = 0;
  /** Tomas's hat, hung on a peg (when the wind took it) */
  private hat: Group;
  hatOn = false;
  /** what hangs on its coat: scarves and taken shadows (ids: 'scarf', 'heron', 'rabbit', 'fox', 'owl') */
  private coat = new Group();
  private coatIds = '';
  private birdMats: MeshBasicMaterial[] = [];
  private t = 0;
  // targets (eased)
  readonly pos = new Vector3(0.19, 0.12, 0);
  private cur = new Vector3(0.19, 0.12, 0);
  scale = 0.45;
  private curScale = 0.45;
  opacity = 0;
  private curOpacity = 0;
  /** extra height while it is afraid (1 = normal) */
  grow = 1;
  private curGrow = 1;
  /** reflection: drawn upside down, faint */
  mirrored = false;
  /** 0 = tower, 1 = bird */
  private birdness = 0;
  birdTarget = 0;
  private flyY = 0.11;
  /** the bird's flight across the screen (0..1) */
  flight = -1;
  /** the reader is carrying the bird: no automatic drift */
  flightHeld = false;
  /** the bird waits to be picked up (no drift on its own) */
  flightWait = false;
  /** the bird's shown x and size, eased (it never jumps) */
  private bEase: { x: number; s: number } | null = null;
  /** while carried: the height of your shadow's tip (board m) */
  flightY: number | null = null;
  /** shadows hanging on it: 1 = all on, 0 = shed */
  coatsOn = 1;
  private shedT = -1;
  /** a shudder (decays) */
  shake = 0;
  /** where the shed shadows fall from when it has become a bird */
  private shedFromBird = false;
  /** where the bird let go (latched for the whole shed) */
  private drop: { x: number; y: number; s: number } | null = null;

  constructor() {
    this.root.name = 'The Hollow';
    this.root.position.z = 0.0024;
    // the cut-out holes (window + seven villagers), shared by all three sheets
    const holes = [placedPoints(B.HOLLOW_EYE, 0, 0, 1, 1, 12), ...CUTS.map(([d, x, y, sc, f]) => placedPoints(d, x, y, sc, f, 6))];
    const colors = ['#2e2030', '#241a2c', A.PAL.ink];
    [B.HOLLOW_C, B.HOLLOW_B, B.HOLLOW_A].forEach((d, k) => {
      const m = new Mesh(new ShapeGeometry(cutShape(d, holes), 6), new MeshBasicMaterial({ color: colors[k], transparent: true, opacity: 0, depthWrite: false }));
      m.name = `Hollow sheet ${'CBA'[k]}`;
      m.position.z = 0.0003 + k * 0.0002;
      m.renderOrder = 3 + k;
      this.tower.add(m);
      this.sheets.push(m);
    });
    // the light behind the cut-out villagers (one merged mesh, warm)
    // ShapeGeometry takes many shapes at once: one mesh for all seven
    const glowShapes = CUTS.map(([d, x, y, sc, f]) => new Shape(placedPoints(d, x, y, sc, f, 6).map((v) => new Vector2(v.x * 0.001, v.y * 0.001))));
    this.glow = new Mesh(new ShapeGeometry(glowShapes, 4), new MeshBasicMaterial({ color: '#ffe2b0', transparent: true, opacity: 0, depthWrite: false }));
    this.glow.name = 'Hollow cut-out light';
    this.glow.position.z = 0.0001;
    this.glow.renderOrder = 2;
    this.tower.add(this.glow);
    // the window: its only eye, cut through, with a thin vellum ring
    this.window = flat(B.HOLLOW_EYE, new MeshBasicMaterial({ color: '#cdd6ff', transparent: true, opacity: 0, depthWrite: false }), 'Hollow window');
    this.window.position.z = 0.0001;
    this.window.renderOrder = 2;
    this.tower.add(this.window);
    this.ring = new Mesh(new ShapeGeometry(cutShape(B.HOLLOW_EYE_RING, [placedPoints(B.HOLLOW_EYE, 0, 0, 1, 1, 12)]), 8), new MeshBasicMaterial({ color: '#f3dfa0', transparent: true, opacity: 0, depthWrite: false }));
    this.ring.name = 'Hollow window ring';
    this.ring.position.z = 0.0011;
    this.ring.renderOrder = 7;
    this.tower.add(this.ring);
    // the falling villagers: the same cut shapes, standing paper (shown only when it lets go)
    for (const [d, x, y, sc, f] of CUTS) {
      const m = flat(d, new MeshBasicMaterial({ color: '#1b1424', transparent: true, opacity: 0, side: DoubleSide, depthWrite: false }), 'Freed shadow');
      m.scale.set(sc * f, sc, 1);
      m.userData.home = new Vector3(x * 0.001, y * 0.001, 0.0012);
      m.userData.s = sc;
      m.userData.f = f;
      m.visible = false;
      m.renderOrder = 8;
      this.tower.add(m);
      this.figs.push(m);
    }
    // Tomas's hat on a peg (shown only if the wind took it)
    this.hat = new Group();
    const peg = flat(B.HOLLOW_PEG, new MeshBasicMaterial({ color: '#2e2030', transparent: true, opacity: 0, depthWrite: false }), 'Hollow peg');
    const hat = flat(B.TOMAS_HAT, new MeshBasicMaterial({ color: '#6a5a74', transparent: true, opacity: 0, depthWrite: false }), 'Tomas hat on the peg');
    hat.scale.setScalar(0.6);
    hat.position.set(0.033, 0.0565, 0.0002);
    this.hat.add(peg, hat);
    this.hat.position.z = 0.0013;
    this.hat.visible = false;
    this.tower.add(this.hat);
    this.coat.name = 'Hollow coat';
    this.coat.position.z = 0.0013;
    this.tower.add(this.coat);
    // the night bird it can become
    const bm = flat(BIRD, new MeshBasicMaterial({ color: A.PAL.ink, transparent: true, opacity: 0, side: DoubleSide, depthWrite: false }), 'Night bird');
    bm.scale.setScalar(0.0021 / 0.001);
    const eye = flat(B.HOLLOW_WINDOW, new MeshBasicMaterial({ color: '#cdd6ff', transparent: true, opacity: 0, depthWrite: false }), 'Night bird eye');
    eye.scale.setScalar(0.4);
    eye.position.set(0, -0.012, 0.0003);
    this.birdMats.push(bm.material as MeshBasicMaterial, eye.material as MeshBasicMaterial);
    this.bird.add(bm, eye);
    this.root.add(this.tower, this.bird);
    this.root.visible = false;
  }

  /** Jump straight to a pose (no easing), e.g. when a page starts. */
  snap(x: number, y: number, scale: number): void {
    this.pos.set(x, y, 0);
    this.cur.set(x, y, 0);
    this.scale = this.curScale = scale;
    this.bEase = null;
  }

  /** let go of the stolen shadows: each villager pops out, falls and lands standing; the holes close */
  shed(): void {
    this.shedT = 0;
    this.coatsOn = 0;
    // what it kept comes off its coat: Tomas's hat leaves the peg too
    this.hatOn = false;
    this.shedFromBird = this.birdTarget > 0.5;
    this.drop = null;
  }

  /** it has already let go (a shed has begun) */
  get hasShed(): boolean {
    return this.shedT >= 0;
  }

  /** after the lending: it has let go of everything (holes healed, coat and hat gone); no shed animation */
  settle(): void {
    if (this.shedT < 0) this.shedT = 30;
    this.heal = 1;
    this.coatsOn = 0;
    this.hatOn = false;
    this.setCoat([]);
    for (const f of this.figs) f.userData.landed = true;
  }

  /** called with each freed villager's landing point (board metres), for the desk */
  onLanded?: (k: number, x: number, y: number) => void;

  /** tint the window (e.g. moonlight on the hill pages) */
  setWindow(color: string): void {
    (this.window.material as MeshBasicMaterial).color.set(color);
  }

  reset(): void {
    // a new reading: the freed villagers can land (and come to the tray) again
    for (const f of this.figs) f.userData.landed = false;
    this.opacity = this.curOpacity = 0;
    this.grow = this.curGrow = 1;
    this.mirrored = false;
    this.birdTarget = this.birdness = 0;
    this.flight = -1;
    this.flightHeld = false;
    this.flightWait = false;
    this.bEase = null;
    this.flightY = null;
    this.coatsOn = 1;
    this.shedT = -1;
    this.shake = 0;
    this.shedFromBird = false;
    this.setWindow('#cdd6ff');
    this.heal = 0;
    this.hatOn = false;
    this.setCoat([]);
    for (const f of this.figs) f.visible = false;
    this.root.visible = false;
  }

  /** hang what it took on its coat (one peg each, up to six) */
  setCoat(ids: string[]): void {
    const key = ids.slice(0, COAT_PEGS.length).join(',');
    if (key === this.coatIds) return;
    this.coatIds = key;
    for (const g of [...this.coat.children]) {
      g.removeFromParent();
      g.traverse((o) => {
        const m = o as Mesh;
        if (m.isMesh) {
          m.geometry.dispose();
          (m.material as MeshBasicMaterial).dispose();
        }
      });
    }
    ids.slice(0, COAT_PEGS.length).forEach((id, k) => {
      const [px, py] = COAT_PEGS[k];
      const side = px < 0 ? -1 : 1;
      const g = new Group();
      g.position.set(px * 0.001, py * 0.001, 0);
      // the peg: a short stub out of its side
      const peg = new Mesh(new ShapeGeometry(pathShape(`M ${-5 * side} -1.6 L ${5 * side} -1.2 L ${5 * side} 1.4 L ${-5 * side} 1.6 Z`), 1), new MeshBasicMaterial({ color: '#2e2030', transparent: true, opacity: 0, depthWrite: false }));
      g.add(peg);
      // the thing on it (pivot at the peg, hanging down)
      const pivot = new Group();
      pivot.position.x = 4 * side * 0.001;
      const plate = PLATES[id];
      if (plate) {
        const h = 26;
        const s = h / plate.h;
        const m = flat(plate.path, new MeshBasicMaterial({ color: '#8f86a6', transparent: true, opacity: 0, side: DoubleSide, depthWrite: false }), `Taken ${id}`);
        // hung upside down by its feet, like a coat on a hook
        m.scale.set(s * side, -s, 1);
        pivot.add(m);
      } else {
        const m = flat(SCARF, new MeshBasicMaterial({ color: '#b8473a', transparent: true, opacity: 0, side: DoubleSide, depthWrite: false }), 'Taken scarf');
        pivot.add(m);
      }
      g.add(pivot);
      this.coat.add(g);
    });
  }

  debug(): Record<string, number | boolean> {
    return { opacity: +this.curOpacity.toFixed(2), bird: +this.birdness.toFixed(2), flight: +this.flight.toFixed(2), x: +this.cur.x.toFixed(3), y: +this.cur.y.toFixed(3), scale: +this.curScale.toFixed(2), visible: this.root.visible, birdVisible: this.bird.visible };
  }

  get visibleAmount(): number {
    return this.curOpacity;
  }

  update(dt: number): void {
    this.t += dt;
    if (this.flight >= 0 && this.flight < 1.2 && !this.flightHeld && !this.flightWait) this.flight += dt / 9; // a slow crossing
    this.shake = Math.max(0, this.shake - dt / 1.2);
    const e = Math.min(1, dt * 2.2);
    this.cur.lerp(this.pos, e);
    this.curScale += (this.scale - this.curScale) * e;
    this.curOpacity += (this.opacity - this.curOpacity) * Math.min(1, dt * 1.6);
    this.curGrow += (this.grow - this.curGrow) * Math.min(1, dt * 0.9);
    this.birdness += (this.birdTarget - this.birdness) * Math.min(1, dt * 1.5);
    this.root.visible = this.curOpacity > 0.01;
    if (!this.root.visible) return;

    // the tower: card sheets that sway gently around the base (no scale wobble), with a little parallax
    this.tower.position.set(this.cur.x + Math.sin(this.t * 38) * 0.0025 * this.shake, this.cur.y, 0);
    const grow = Math.min(1.15, this.curGrow);
    this.tower.scale.set(this.curScale, this.curScale * grow * (this.mirrored ? -1 : 1), 1);
    this.tower.rotation.z = Math.sin(this.t * 0.5) * 0.026 + Math.sin(this.t * 0.83) * 0.008;
    const towerA = this.curOpacity * (1 - this.birdness);
    // far away (small): the card goes bluer and fainter
    const far = this.curScale <= 0.45 ? 0.8 : 1;
    this.sheets.forEach((m, k) => {
      (m.material as MeshBasicMaterial).opacity = towerA * far * [0.85, 0.92, 1][k];
      m.position.x = (k - 1) * Math.sin(this.t * 0.6) * 0.0003;
    });
    // the holes: light shows through the villagers until they come home (then the holes darken shut)
    if (this.shedT >= 0) this.heal = Math.min(1, this.heal + dt / 2.6);
    const gm = this.glow.material as MeshBasicMaterial;
    gm.opacity = towerA * (0.85 * (1 - this.heal) + 0.15) * (0.9 + 0.1 * Math.sin(this.t * 1.3));
    gm.color.set(this.heal > 0.5 ? '#2e2030' : '#ffe2b0');
    (this.window.material as MeshBasicMaterial).opacity = towerA * (0.75 + 0.2 * Math.sin(this.t * 1.3));
    (this.ring.material as MeshBasicMaterial).opacity = towerA * 0.55;
    this.hat.visible = this.hatOn && towerA > 0.01;
    for (const c of this.hat.children) ((c as Mesh).material as MeshBasicMaterial).opacity = towerA;
    this.coat.visible = this.coat.children.length > 0 && towerA > 0.01 && this.shedT < 0;
    if (this.coat.visible) {
      this.coat.children.forEach((g, k) => {
        // each hanging thing swings a little on its peg
        const item = g.children[1];
        if (item) item.rotation.z = 0.12 * Math.sin(this.t * 1.1 + k * 1.7);
        g.traverse((o) => {
          if ((o as Mesh).isMesh) ((o as Mesh).material as MeshBasicMaterial).opacity = towerA;
        });
      });
    }
    // the freed villagers: pop, fall on a curve, land standing on the ground, hold, walk off and fade
    this.figs.forEach((m, k) => {
      if (this.shedT < 0) return;
      const tt = this.shedT - k * 0.32;
      const mat = m.material as MeshBasicMaterial;
      if (tt < 0) return;
      m.visible = true;
      const home = m.userData.home as Vector3;
      // landing point in tower-local terms: the ground under the tower, spread out
      const lx = home.x + (k - 3) * 0.006 / Math.max(0.2, this.curScale);
      // from the bird, they fall to the ground of the screen (not to the bird's height in the sky)
      const ts = this.shedFromBird && this.drop ? this.drop.s : Math.max(0.05, this.tower.scale.x);
      const ly = this.shedFromBird ? (0.045 - (this.drop?.y ?? this.tower.position.y)) / ts : 0;
      const sc = m.userData.s as number;
      const f = m.userData.f as number;
      if (tt < 0.25) {
        const p = tt / 0.25;
        m.position.set(home.x, home.y, 0.0012 + 0.003 * p);
        m.scale.set(sc * f * (1 + 0.12 * p), sc * (1 - 0.14 * p), 1);
      } else if (tt < 1.25) {
        const p = (tt - 0.25) / 1.0;
        const e = p * p;
        const cx = home.x + 0.4 * (lx - home.x);
        const cy = Math.max(home.y, ly) + 0.03;
        m.position.set((1 - e) * (1 - e) * home.x + 2 * (1 - e) * e * cx + e * e * lx, (1 - e) * (1 - e) * home.y + 2 * (1 - e) * e * cy + e * e * ly, 0.0042);
        m.rotation.z = Math.sin(p * Math.PI * 2) * 0.5;
        m.scale.set(sc * f, sc, 1);
      } else {
        const p = tt - 1.25;
        m.rotation.z = 0;
        if (!m.userData.landed) {
          m.userData.landed = true;
          const w = new Vector3();
          m.getWorldPosition(w);
          if (this.shedFromBird) this.onLanded?.(k, (this.drop?.x ?? this.tower.position.x) + lx * ts, 0.045);
          else this.onLanded?.(k, this.cur.x + lx * this.curScale, this.cur.y);
        }
        m.scale.set(sc * f, sc * (p < 0.25 ? 0.9 + 0.4 * p : 1), 1);
        m.position.set(lx + Math.max(0, p - 1.5) * 0.012 * Math.sign(-this.cur.x || 1) / Math.max(0.2, this.curScale), ly, 0.0042);
      }
      mat.opacity = this.curOpacity * Math.max(0, Math.min(1, tt / 0.15)) * (tt > 3 ? Math.max(0, 1 - (tt - 3) / 0.8) : 1);
    });
    if (this.shedT >= 0) this.shedT += dt;

    // the bird
    const ba = this.curOpacity * this.birdness;
    const bx = this.flight < 0 ? 0 : -0.27 + Math.min(this.flight, 1) * 0.54;
    const edge = this.flight < 0 || (this.flightHeld && this.flight < 0.85) ? 1 : Math.max(0, Math.min(1, (0.21 - Math.abs(bx)) / 0.03));
    for (const m of this.birdMats) m.opacity = Math.max(0, ba * edge) * (m === this.birdMats[0] ? 0.95 : 0.9);
    this.bird.visible = ba > 0.01;
    if (this.bird.visible) {
      const f = this.flight;
      // from beyond the left edge, across the moon, off past the right edge
      const fx = f < 0 ? this.cur.x : -0.27 + Math.min(f, 1) * 0.54;
      const waiting = this.flightWait && !this.flightHeld;
      const free = waiting ? 0.13 : 0.11 + Math.sin(Math.min(f, 1) * Math.PI) * 0.09;
      if (f < 0) this.flyY = this.cur.y + 0.09 * this.curScale;
      else this.flyY += ((this.flightHeld && this.flightY !== null ? this.flightY : free) - this.flyY) * Math.min(1, dt * 6);
      const fy = f < 0 ? this.cur.y + 0.09 * this.curScale : this.flyY;
      const flap = Math.sin(this.t * (f < 0 ? 3 : 5)) * 0.25;
      const bsT = this.curScale * (f < 0 || waiting ? 0.55 : 0.75);
      if (!this.bEase) this.bEase = { x: fx, s: bsT };
      const ke = Math.min(1, dt * 5);
      this.bEase.x += (fx - this.bEase.x) * ke;
      this.bEase.s += (bsT - this.bEase.s) * ke;
      const bs = this.bEase.s;
      this.bird.position.set(this.bEase.x, fy, 0.0004);
      this.bird.scale.set(bs, bs * (1 - Math.abs(flap) * 0.6), 1);
      this.bird.rotation.z = f < 0 ? 0 : -0.1 + Math.sin(f * 6) * 0.05;
      // the shed shadows snow down from the bird, not from where the tower stood
      if (this.shedFromBird && this.shedT >= 0 && this.shedT < 8) {
        // the drop point is fixed the moment it lets go (inside the screen: the bird may be past the
        // edge), and held while the freed shadows land and walk off: they never jump with the bird
        if (!this.drop) this.drop = { x: Math.max(-0.17, Math.min(0.17, fx)), y: fy - 0.04, s: bs };
        this.tower.position.set(this.drop.x, this.drop.y, 0);
        this.tower.scale.set(this.drop.s, this.drop.s, 1);
      }
    }
  }
}
