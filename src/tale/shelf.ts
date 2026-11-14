import { BoxGeometry, CanvasTexture, Group, Mesh, MeshBasicMaterial, MeshStandardMaterial, SRGBColorSpace, Vector3 } from '@iwsdk/core';

/**
 * THE BOOKSHELF on the desk (right of the book: controls on the right, the lantern on the left).
 * A little rack of paper books; touch a spine (hold a fingertip on it a moment, no pinch) to choose.
 * While a book is open, a first touch pulls the spine out ("Touch again to change books") and a
 * second touch confirms. Items appear on the shelf only when they are ready.
 */
export interface ShelfItem {
  id: string;
  title: string;
  sub?: string;
  color: string;
  ink: string;
  /** thickness, height, depth (m) */
  size: [number, number, number];
  /** an unfinished reading: a red ribbon hangs from it */
  bookmark?: boolean;
}

interface Token {
  item: ShelfItem;
  root: Group;
  mesh: Mesh;
  ribbon: Mesh;
  home: Vector3;
  out: number;
  glow: number;
}

export class Shelf {
  readonly group = new Group();
  private tokens: Token[] = [];
  private dwell = { id: '', t: 0, lost: 0 };
  private armed: { id: string; t: number } | null = null;
  private coolT = 0;
  /** a touch just counted: wait until no fingertip is on the shelf */
  private needClear = false;
  private tag: Mesh;
  private tagText = '';
  /** glow the spines one by one (the first-finish hint) */
  private hintT = -1;
  private tmp = new Vector3();

  constructor() {
    this.group.name = 'Bookshelf';
    // the rack: a plinth, a back panel and two cheeks (dark card with a warm lining)
    const card = new MeshStandardMaterial({ color: '#2a2230', roughness: 0.9 });
    const lining = new MeshStandardMaterial({ color: '#7a5a43', roughness: 0.9 });
    const plinth = new Mesh(new BoxGeometry(0.2, 0.004, 0.07), card);
    plinth.position.set(0, 0.002, 0);
    const back = new Mesh(new BoxGeometry(0.2, 0.13, 0.004), lining);
    back.position.set(0, 0.065, -0.033);
    const cheekL = new Mesh(new BoxGeometry(0.004, 0.13, 0.07), card);
    cheekL.position.set(-0.1, 0.065, 0);
    const cheekR = cheekL.clone();
    cheekR.position.x = 0.1;
    // the riser it stands on (10 cm of dark wood down to the desk)
    const riser = new Mesh(new BoxGeometry(0.17, 0.1, 0.06), new MeshStandardMaterial({ color: '#2b1d16', roughness: 0.85 }));
    riser.position.set(0, -0.05, -0.002);
    riser.name = 'Shelf riser';
    this.group.add(plinth, back, cheekL, cheekR, riser);
    // the tag that says what a touch will do
    this.tag = new Mesh(new BoxGeometry(0.11, 0.022, 0.001), new MeshBasicMaterial({ map: this.tagTexture(''), transparent: true }));
    this.tag.position.set(0, 0.16, 0.02);
    this.tag.visible = false;
    this.group.add(this.tag);
  }

  /** put the items on the shelf (left to right) */
  setItems(items: ShelfItem[]): void {
    for (const t of this.tokens) t.root.removeFromParent();
    this.tokens = [];
    let x = -0.085;
    for (const item of items) {
      const [w, h, d] = item.size;
      const root = new Group();
      const spine = spineTexture(item);
      const side = new MeshStandardMaterial({ color: item.color, roughness: 0.85 });
      const face = new MeshBasicMaterial({ map: spine });
      // +z face is the spine (towards the reader): five sides in one draw, the face in another
      const geo = new BoxGeometry(w, h, d);
      const ia = geo.index!.array;
      for (let i = 0; i < 6; i++) {
        const t = ia[24 + i];
        ia[24 + i] = ia[30 + i];
        ia[30 + i] = t;
      }
      geo.clearGroups();
      geo.addGroup(0, 30, 0);
      geo.addGroup(30, 6, 1);
      const mesh = new Mesh(geo, [side, face]);
      mesh.name = `Shelf ${item.id}`;
      mesh.position.y = h / 2 + 0.004;
      root.add(mesh);
      const ribbon = new Mesh(new BoxGeometry(0.006, 0.03, 0.001), new MeshBasicMaterial({ color: '#8a2f2a' }));
      ribbon.position.set(w * 0.2, h + 0.004 - 0.012, d / 2 + 0.002);
      ribbon.visible = !!item.bookmark;
      root.add(ribbon);
      const home = new Vector3(x + w / 2, 0, 0.01);
      root.position.copy(home);
      this.group.add(root);
      this.tokens.push({ item, root, mesh, ribbon, home, out: 0, glow: 0 });
      x += w + 0.008;
    }
  }

  /** the spines glow in turn, once (after the first finish) */
  hint(text = 'Touch a spine to choose another book.'): void {
    this.hintT = 0;
    this.say(text);
  }

  setBookmark(id: string, on: boolean): void {
    const t = this.tokens.find((k) => k.item.id === id);
    if (t) t.ribbon.visible = on;
  }

  /** a note on the tag (shown until cleared) */
  note(text: string): void {
    this.say(text);
  }

  private say(text: string): void {
    if (text === this.tagText) return;
    this.tagText = text;
    const m = this.tag.material as MeshBasicMaterial;
    m.map?.dispose();
    m.map = this.tagTexture(text);
    m.needsUpdate = true;
    this.tag.visible = !!text;
  }

  private tagTexture(text: string): CanvasTexture {
    const c = document.createElement('canvas');
    c.width = 512;
    c.height = 100;
    const g = c.getContext('2d')!;
    if (text) {
      g.fillStyle = 'rgba(250, 241, 222, 0.97)';
      g.fillRect(4, 4, 504, 92);
      g.strokeStyle = 'rgba(150, 110, 60, 0.6)';
      g.lineWidth = 3;
      g.strokeRect(4, 4, 504, 92);
      g.fillStyle = '#34221e';
      g.font = 'italic 600 34px Georgia, serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(text, 256, 52, 490);
    }
    const t = new CanvasTexture(c);
    t.colorSpace = SRGBColorSpace;
    return t;
  }

  /**
   * Every frame. `open`: a book is open (two touches needed). Returns the item chosen, or null.
   */
  update(dt: number, tips: Vector3[], open: boolean, enabled: boolean): string | null {
    this.coolT = Math.max(0, this.coolT - dt);
    // the first-finish hint: each spine glows in turn
    if (this.hintT >= 0) {
      this.hintT += dt;
      if (this.hintT > 0.4 * this.tokens.length + 4) {
        this.hintT = -1;
        this.say('');
      }
    }
    let over: Token | null = null;
    if (enabled) {
      let best = Infinity;
      for (const t of this.tokens) {
        const [w, h, d] = t.item.size;
        for (const tip of tips) {
          const p = t.mesh.worldToLocal(this.tmp.copy(tip));
          const inside = Math.abs(p.x) < w / 2 + 0.012 && Math.abs(p.y) < h / 2 + 0.012 && p.z > -d / 2 - 0.012 && p.z < d / 2 + 0.02;
          if (inside) {
            const dz = Math.abs(p.z - d / 2);
            if (dz < best) {
              best = dz;
              over = t;
            }
          }
        }
      }
    }
    // after a touch counts, the fingertip must leave the shelf (and 1 s pass) before the next one
    if (this.needClear) {
      if (!over) this.needClear = false;
      over = null;
    }
    if (this.coolT > 0) over = null;
    // dwell 0.2 s on one spine (short tracking drops forgiven)
    if (over && over.item.id === this.dwell.id) {
      this.dwell.t += dt;
      this.dwell.lost = 0;
    } else if (over) this.dwell = { id: over.item.id, t: 0, lost: 0 };
    else {
      this.dwell.lost += dt;
      if (this.dwell.lost > 0.1) this.dwell = { id: '', t: 0, lost: 0 };
    }
    let chosen: string | null = null;
    if (over && this.dwell.t >= 0.2) {
      this.dwell = { id: '', t: 0, lost: 0 };
      this.coolT = 1;
      this.needClear = true;
      if (!open || (this.armed && this.armed.id === over.item.id)) {
        chosen = over.item.id;
        this.armed = null;
        this.say('');
      } else {
        this.armed = { id: over.item.id, t: 6 };
        this.say('Touch again to change books');
      }
    }
    if (this.armed) {
      this.armed.t -= dt;
      if (this.armed.t <= 0) {
        this.armed = null;
        this.say('');
      }
    }
    this.tokens.forEach((t, i) => {
      const want = this.armed?.id === t.item.id ? 1 : over === t ? 0.4 : 0;
      t.out += (want - t.out) * Math.min(1, dt * 8);
      t.root.position.set(t.home.x, t.home.y, t.home.z + 0.03 * t.out);
      t.root.rotation.x = -0.2 * t.out;
      const hinted = this.hintT >= 0 && Math.floor(this.hintT / 0.4) % this.tokens.length === i;
      t.glow += ((hinted || over === t ? 1 : 0) - t.glow) * Math.min(1, dt * 6);
      const side = (t.mesh.material as MeshStandardMaterial[])[0];
      side.emissive.set('#ffcf8a');
      side.emissiveIntensity = 0.35 * t.glow;
    });
    return chosen;
  }

  snapshot(): { id: string; at: number[]; face: number[]; armed: boolean; wait: boolean }[] {
    return this.tokens.map((t) => ({
      id: t.item.id,
      armed: this.armed?.id === t.item.id,
      wait: this.needClear,
      at: t.mesh.getWorldPosition(new Vector3()).toArray().map((n) => +n.toFixed(3)),
      // a point just in front of the spine (where a fingertip touches it)
      face: t.mesh.localToWorld(new Vector3(0, 0, t.item.size[2] / 2 + 0.006)).toArray().map((n) => +n.toFixed(3)),
    }));
  }
}

function spineTexture(item: ShelfItem): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 448;
  const g = c.getContext('2d')!;
  g.fillStyle = item.color;
  g.fillRect(0, 0, 128, 448);
  g.strokeStyle = 'rgba(255, 230, 170, 0.55)';
  g.lineWidth = 4;
  g.strokeRect(10, 10, 108, 428);
  g.fillStyle = item.ink;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.save();
  g.translate(64, 224);
  g.rotate(-Math.PI / 2);
  g.font = 'italic 600 42px Georgia, serif';
  g.fillText(item.title, 0, item.sub ? -16 : 0, 400);
  if (item.sub) {
    g.font = 'italic 26px Georgia, serif';
    g.fillText(item.sub, 0, 24, 400);
  }
  g.restore();
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  return t;
}
