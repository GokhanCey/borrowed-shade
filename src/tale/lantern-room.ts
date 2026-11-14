import { AdditiveBlending, Group, Mesh, MeshBasicMaterial, PlaneGeometry, ShapeGeometry } from '@iwsdk/core';
import * as A from './art.js';
import { glowTexture } from './book.js';
import { FILL } from './fill-core.js';
import { pathShape } from './paper.js';
import { PLATES } from './plates.js';
import { ScreenAct, type ScreenHost } from './screen-acts.js';
import { STAGE_X0, STAGE_Y0, type ScreenField } from './screen-field.js';

/**
 * THE LANTERN ROOM (Shadow Practice): an endless, quiet night theatre with no story.
 *   - plates come one at a time from a shuffled deck (the seal and the advice, no lending, no failing);
 *     each one you make peels into a small puppet on the shelf at the back (kept between visits);
 *   - between plates, visitors answer your shadow:
 *       still hand            -> birds land on your fingertips (Tree for the Birds)
 *       gaps between fingers  -> stars shine through them, and three make a constellation (Window in the Night)
 *       a hand low in the stream -> paper fish swim around your shadow (Shadow River)
 *   - touch the glowing corner for another outline; the lantern (a flat hand over it) goes back to the shelf.
 * No score, no timer, no checklist.
 */
export interface RoomHost extends ScreenHost {
  /** start a practice plate (the director's fill beat, practice: true, landing on the shelf) */
  startPlate(id: string): void;
  /** 'asking' | 'done' | null (no plate) */
  plateState(): string | null;
  /** seconds the live plate has waited */
  plateT(): number;
  /** give up the live plate quietly (no line, no lending) */
  dropPlate(): void;
  /** the plate just made (id), once */
  takeMade(): string | null;
  /** put the shelf puppets on the stage (ids, counts) */
  shelf(list: { id: string; n: number }[]): void;
  /** the ribbon at the top of the screen */
  say(text: string): void;
  /** a voice joins for a while (the made puppet's part) */
  voice(id: string, seconds: number): void;
}

const SHELF_KEY = 'borrowedShade.shelf.v1';
const ASK: Record<string, string> = {
  rabbit: 'A rabbit, perhaps?',
  fox: 'A fox, with its nose to the ground?',
  owl: 'An owl, round and awake?',
  snail: 'A snail, slow and never lost?',
  boat: 'A little boat?',
  heron: 'A heron, standing on one leg?',
  tower: 'A tower, with a lamp at the top?',
  wings: 'Wings, wide enough for the moon?',
};
const MADE = ['That one goes on the shelf.', 'A clean shadow.', 'Another for the shelf.', 'It stands by itself now.', 'The paper will remember it.'];

export function loadShelf(): Record<string, { n: number }> {
  try {
    const v = JSON.parse(localStorage.getItem(SHELF_KEY) ?? '{}') as Record<string, { n: number }>;
    if (typeof v !== 'object' || !v) return {};
    // only shapes the room can show (older readings may have saved a sign half)
    for (const k of Object.keys(v)) if ((!(k in ASK) && k !== 'wing1' && k !== 'boat1') || !v[k] || typeof v[k].n !== 'number') delete v[k];
    return v;
  } catch {
    return {};
  }
}

function saveShelf(s: Record<string, { n: number }>): void {
  try {
    localStorage.setItem(SHELF_KEY, JSON.stringify(s));
  } catch {
    /* private window: the shelf lasts this visit */
  }
}

/** constellation names for 3+ stars (whimsical, by count) */
const NAMES = ['The Teacup', 'The Little Ladder', 'The Sleeping Fox', 'The Lantern Key', 'The Heron’s Step', 'The Kite', 'The Open Door'];

interface Star {
  mesh: Mesh;
  x: number;
  y: number;
  life: number;
  on: number;
}

interface Fish {
  mesh: Mesh;
  x: number;
  y: number;
  vx: number;
  vy: number;
  dir: number;
}

const FISH = 'M -6 0 C -3 3 3 3 6 0 L 9 3 L 9 -3 L 6 0 C 3 -3 -3 -3 -6 0 Z';

export class LanternRoom {
  private group = new Group();
  private deck: string[] = [];
  private last = '';
  private phase: 'wait' | 'plate' | 'free' = 'wait';
  private phaseT = 0;
  private noHandT = 0;
  private shelfData = loadShelf();
  private oneHandMade = 0;
  // visitors
  private birds: ScreenAct | null = null;
  private birdsRest = 0;
  private stars: Star[] = [];
  private starGeo = new PlaneGeometry(0.014, 0.014);
  private lines: Mesh[] = [];
  private named = '';
  private fish: Fish[] = [];
  private river = 0;
  private stillT = 0;
  private lastC: [number, number, number] | null = null;
  private fishGeo = new ShapeGeometry(pathShape(FISH), 6);
  private winFrame = -1;
  private bufD = new Uint8Array(0);
  private bufSeen = new Uint8Array(0);
  private stack = new Int32Array(0);
  private litKey = '';

  constructor(private host: RoomHost) {
    this.group.name = 'Lantern Room';
    host.board.add(this.group);
    host.shelf(Object.entries(this.shelfData).map(([id, v]) => ({ id, n: v.n })));
    // the stream (low on the screen): seven paper fish
    for (let i = 0; i < 7; i++) {
      const mesh = new Mesh(this.fishGeo, new MeshBasicMaterial({ color: '#d9e6f2', transparent: true, opacity: 0, depthWrite: false }));
      mesh.name = 'Paper fish';
      mesh.renderOrder = 12;
      mesh.scale.setScalar(0.9);
      this.group.add(mesh);
      const dir = i % 2 ? 1 : -1;
      this.fish.push({ mesh, x: -0.2 + i * 0.06, y: 0.03 + (i % 3) * 0.018, vx: dir * 0.035, vy: 0, dir });
    }
    host.say('The Lantern Room. Make any shadow you like. The glowing corner brings another outline.');
    // the way out, said once, on the slip (it is the only place a reader who starts here would learn it)
    host.advise('To close the book, hold a flat hand over the lantern.');
    host.log('room:open');
  }

  private nextPlate(): string {
    // the tale's own shadows only (the Four Elements' sign halves are not animals for the shelf)
    const ids = Object.keys(ASK).filter((id) => PLATES[id] && PLATES[id].mode === 'shape' && (PLATES[id].hands !== 2 || this.oneHandMade >= 2));
    if (!this.deck.length) {
      this.deck = ids.slice();
      for (let i = this.deck.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [this.deck[i], this.deck[j]] = [this.deck[j], this.deck[i]];
      }
      if (this.deck[0] === this.last && this.deck.length > 1) this.deck.push(this.deck.shift()!);
    }
    this.last = this.deck.shift() ?? 'rabbit';
    return this.last;
  }

  update(dt: number): void {
    const f = this.host.field;
    const hand = f.count > 12 && f.age < 0.6;
    this.noHandT = hand ? 0 : this.noHandT + dt;
    this.phaseT += dt;
    if (this.phase === 'wait') {
      if (this.phaseT > 5) {
        this.phase = 'plate';
        this.phaseT = 0;
        this.host.startPlate(this.nextPlate());
        this.host.say(ASK[this.last] ?? 'Another shape?');
        // (the way out, until the outline's own hint takes the slip)
        this.host.advise('To close the book, hold a flat hand over the lantern.');
      }
    } else if (this.phase === 'plate') {
      const made = this.host.takeMade();
      if (made) {
        const e = (this.shelfData[made] ??= { n: 0 });
        e.n++;
        saveShelf(this.shelfData);
        if (PLATES[made]?.hands !== 2) this.oneHandMade++;
        this.host.voice(made, 16);
        this.host.say(MADE[(e.n + made.length) % MADE.length]);
        // the praise is read before the next line replaces it
        this.praise = 2.8;
        // it goes on the shelf at once
        this.host.shelf(Object.entries(this.shelfData).map(([id, v]) => ({ id, n: v.n })));
        this.host.log(`room:made:${made}:${e.n}`);
      }
      this.praise -= dt;
      const st = this.host.plateState();
      if (st === null && this.phaseT > 3) this.toFree();
      else if (st === 'done' && this.praise <= 0) {
        this.host.shelf(Object.entries(this.shelfData).map(([id, v]) => ({ id, n: v.n })));
        this.toFree();
      } else if (st === 'asking' && this.host.plateT() > 45) {
        // no line and no lending: the plate simply fades, and the room is yours for a while
        this.host.dropPlate();
        this.toFree();
      }
    } else {
      // free play: the visitors; a new plate once the line has been read and the hands are down, or after 25 s
      if (this.phaseT > 9 && this.noHandT > 2) {
        this.stopBirds();
        this.phase = 'plate';
        this.phaseT = 0;
        this.host.startPlate(this.nextPlate());
        this.host.say(ASK[this.last] ?? 'Another shape?');
        // (the way out, until the outline's own hint takes the slip)
        this.host.advise('To close the book, hold a flat hand over the lantern.');
      }
    }
    this.updateVisitors(dt, hand);
  }

  private praise = 0;

  /** the corner: another outline, now */
  next(): void {
    this.stopBirds();
    this.host.dropPlate();
    this.praise = 0;
    this.phase = 'plate';
    this.phaseT = 0;
    this.host.startPlate(this.nextPlate());
    this.host.say(ASK[this.last] ?? 'Another shape?');
    this.host.advise('To close the book, hold a flat hand over the lantern.');
  }

  private toFree(): void {
    this.host.say('Stay a while. Hold a hand still, and birds land on it.');
    this.host.advise('Thumb to fingertip in a ring, and stars come out inside it. A flat hand over the lantern closes the book.');
    this.phase = 'free';
    this.phaseT = 0;
    this.birdsRest = 1;
  }

  private stopBirds(): void {
    this.birds?.dispose();
    this.birds = null;
  }

  // ---- visitors ----------------------------------------------------------------------------------

  private updateVisitors(dt: number, hand: boolean): void {
    const f = this.host.field;
    const free = this.phase === 'free';
    // birds: only between plates
    if (free) {
      if (!this.birds) {
        this.birdsRest -= dt;
        if (this.birdsRest <= 0) this.birds = new ScreenAct({ ...this.host, target: () => {}, advise: () => {}, stamp: () => {} }, { id: 'room-birds', kind: 'birds', birds: { roost: [0.17, 0.06], n: 5 }, each: 999, keepField: true });
      } else if (this.birds.update(dt)) {
        this.stopBirds();
        this.birdsRest = 3;
      }
    } else this.stopBirds();

    // stillness (for the fish)
    const c = hand ? f.centroid() : null;
    if (!c) {
      this.stillT = 0;
      this.lastC = null;
    } else if (!this.lastC || Math.hypot(c[0] - this.lastC[0], c[1] - this.lastC[1]) > 0.005) {
      this.lastC = c;
      this.stillT = 0;
    } else this.stillT += dt;

    // Window in the Night: stars in the enclosed gaps of your shadow (fingers making a window)
    if (hand && (c?.[1] ?? 0) > 0.1 && f.frames !== this.winFrame) {
      this.winFrame = f.frames;
      this.findWindows();
    }
    for (const s of this.stars) {
      s.life -= dt;
      const want = s.life > 0 ? 1 : 0;
      s.on += (want - s.on) * Math.min(1, dt * (want ? 2 : 0.6));
      (s.mesh.material as MeshBasicMaterial).opacity = s.on * (0.75 + 0.25 * Math.sin(performance.now() / 300 + s.x * 90));
      s.mesh.visible = s.on > 0.01;
    }
    this.stars = this.stars.filter((s) => {
      if (s.life < -6 && s.on < 0.02) {
        s.mesh.removeFromParent();
        (s.mesh.material as MeshBasicMaterial).dispose();
        return false;
      }
      return true;
    });
    const lit = this.stars.filter((s) => s.life > 0);
    this.drawLines(lit);

    // Shadow River: when your shadow is low (in the stream), fish swim about it; a still hand draws them in
    let low = 0;
    if (hand) {
      const W = f.st.w;
      const yMax = Math.floor((0.09 - STAGE_Y0) / (FILL.cellMm / 1000));
      for (let y = 0; y < yMax; y++) for (let x = 0; x < W; x++) if (f.H[y * W + x]) low++;
    }
    const wantRiver = hand && low > 0.3 * f.count ? 1 : 0;
    this.river += (wantRiver - this.river) * Math.min(1, dt * (wantRiver ? 1.5 : 0.5));
    for (const fi of this.fish) {
      (fi.mesh.material as MeshBasicMaterial).opacity = this.river * 0.9;
      fi.mesh.visible = this.river > 0.01;
      if (!fi.mesh.visible) continue;
      // steer away from shadow cells (8 directions), dart out if inside, drift to the hand's edge if it is still
      let ax = 0;
      let ay = 0;
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2;
        if (f.atBoard(fi.x + Math.cos(a) * 0.008, fi.y + Math.sin(a) * 0.008)) {
          ax -= Math.cos(a);
          ay -= Math.sin(a);
        }
      }
      const inside = f.atBoard(fi.x, fi.y);
      if (this.stillT > 1.5 && c && !inside) {
        ax += (c[0] - fi.x) * 2;
        ay += (Math.min(0.08, c[1]) - fi.y) * 2;
      }
      fi.vx += ax * dt * (inside ? 0.6 : 0.15);
      fi.vy += ay * dt * (inside ? 0.6 : 0.15);
      fi.vx += (fi.dir * 0.035 - fi.vx) * dt * 0.8;
      fi.vy += (0 - fi.vy) * dt * 1.2;
      const sp = Math.hypot(fi.vx, fi.vy);
      const max = inside ? 0.12 : 0.06;
      if (sp > max) {
        fi.vx *= max / sp;
        fi.vy *= max / sp;
      }
      fi.x += fi.vx * dt;
      fi.y = Math.min(0.085, Math.max(0.015, fi.y + fi.vy * dt));
      if (fi.x > 0.24) fi.x = -0.24;
      if (fi.x < -0.24) fi.x = 0.24;
      fi.mesh.position.set(fi.x, fi.y, 0.0036);
      fi.mesh.scale.set(0.9 * (fi.vx >= 0 ? 1 : -1), 0.9, 1);
    }
  }

  /** holes in the shadow (closed gaps between fingers), found by flooding the background from the border */
  private findWindows(): void {
    const f = this.host.field;
    const { w, h } = f.st;
    const H = f.H;
    // close near-touching fingers: dilate by 2 cells
    if (this.bufD.length !== w * h) {
      this.bufD = new Uint8Array(w * h);
      this.bufSeen = new Uint8Array(w * h);
      this.stack = new Int32Array(w * h);
    }
    const D = this.bufD;
    D.fill(0);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (H[y * w + x]) {
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
        const X = x + dx;
        const Y = y + dy;
        if (X >= 0 && Y >= 0 && X < w && Y < h) D[Y * w + X] = 1;
      }
    }
    const seen = this.bufSeen;
    seen.fill(0);
    const stack = this.stack;
    let sp = 0;
    const push = (i: number) => {
      if (!seen[i] && !D[i]) {
        seen[i] = 1;
        stack[sp++] = i;
      }
    };
    for (let x = 0; x < w; x++) {
      push(x);
      push((h - 1) * w + x);
    }
    for (let y = 0; y < h; y++) {
      push(y * w);
      push(y * w + w - 1);
    }
    while (sp > 0) {
      const i = stack[--sp];
      const x = i % w;
      const y = (i / w) | 0;
      if (x > 0) push(i - 1);
      if (x < w - 1) push(i + 1);
      if (y > 0) push(i - w);
      if (y < h - 1) push(i + w);
    }
    // label the holes: cells neither shadow nor reached
    const c = FILL.cellMm / 1000;
    for (let i = 0; i < w * h; i++) {
      if (seen[i] || D[i]) continue;
      let n = 0;
      let sx = 0;
      let sy = 0;
      let qp = 0;
      stack[qp++] = i;
      seen[i] = 1;
      while (qp > 0) {
        const j = stack[--qp];
        n++;
        const x = j % w;
        const y = (j / w) | 0;
        sx += x;
        sy += y;
        if (x > 0 && !seen[j - 1] && !D[j - 1]) {
          seen[j - 1] = 1;
          stack[qp++] = j - 1;
        }
        if (x < w - 1 && !seen[j + 1] && !D[j + 1]) {
          seen[j + 1] = 1;
          stack[qp++] = j + 1;
        }
        if (y > 0 && !seen[j - w] && !D[j - w]) {
          seen[j - w] = 1;
          stack[qp++] = j - w;
        }
        if (y < h - 1 && !seen[j + w] && !D[j + w]) {
          seen[j + w] = 1;
          stack[qp++] = j + w;
        }
      }
      if (n < 6 || n > 900) continue;
      const bx = STAGE_X0 + (sx / n + 0.5) * c;
      const by = STAGE_Y0 + (sy / n + 0.5) * c;
      const near = this.stars.find((s) => Math.hypot(s.x - bx, s.y - by) < 0.01);
      if (near) near.life = 6;
      else if (this.stars.length < 12) {
        const mesh = new Mesh(this.starGeo, new MeshBasicMaterial({ map: glowTexture(), color: '#fff4c8', transparent: true, opacity: 0, depthWrite: false, blending: AdditiveBlending }));
        mesh.name = 'Window star';
        mesh.renderOrder = 13;
        mesh.position.set(bx, by, 0.004);
        this.group.add(mesh);
        this.stars.push({ mesh, x: bx, y: by, life: 6, on: 0 });
        this.host.sound('bell');
      }
    }
  }

  /** three or more stars: a constellation (a minimum spanning tree of thin lines) and its name */
  private drawLines(lit: Star[]): void {
    const key = lit.map((s) => `${s.x.toFixed(3)},${s.y.toFixed(3)}`).join(';');
    if (key === this.litKey) return;
    this.litKey = key;
    for (const l of this.lines) {
      l.removeFromParent();
      l.geometry.dispose();
      (l.material as MeshBasicMaterial).dispose();
    }
    this.lines = [];
    if (lit.length < 3) {
      if (this.named) {
        this.named = '';
        this.host.advise('');
      }
      return;
    }
    const inTree = [lit[0]];
    const rest = lit.slice(1);
    while (rest.length) {
      let best = 0;
      let from = inTree[0];
      let d = Infinity;
      rest.forEach((s, i) => {
        for (const t of inTree) {
          const dd = Math.hypot(s.x - t.x, s.y - t.y);
          if (dd < d) {
            d = dd;
            best = i;
            from = t;
          }
        }
      });
      const s = rest.splice(best, 1)[0];
      inTree.push(s);
      const len = Math.hypot(s.x - from.x, s.y - from.y);
      const m = new Mesh(new PlaneGeometry(len, 0.0008), new MeshBasicMaterial({ color: '#fff4c8', transparent: true, opacity: 0.55, depthWrite: false, blending: AdditiveBlending }));
      m.position.set((s.x + from.x) / 2, (s.y + from.y) / 2, 0.0039);
      m.rotation.z = Math.atan2(s.y - from.y, s.x - from.x);
      m.renderOrder = 13;
      this.group.add(m);
      this.lines.push(m);
    }
    const name = NAMES[(lit.length * 7 + Math.round(lit[0].x * 100)) % NAMES.length];
    if (name !== this.named) {
      this.named = name;
      this.host.advise(`Your window shows a constellation: ${name}.`);
    }
  }

  dispose(): void {
    this.stopBirds();
    this.host.advise('');
    this.group.removeFromParent();
    this.group.traverse((o) => {
      const m = o as Mesh;
      if (m.material) (m.material as MeshBasicMaterial).dispose();
      if (m.geometry && m.geometry !== this.starGeo && m.geometry !== this.fishGeo) m.geometry.dispose();
    });
    this.starGeo.dispose();
    this.fishGeo.dispose();
    this.host.log('room:close');
    void A;
  }
}
