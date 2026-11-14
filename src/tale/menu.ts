import { BoxGeometry, CanvasTexture, Group, Mesh, MeshBasicMaterial, PlaneGeometry, SRGBColorSpace, Vector3 } from '@iwsdk/core';

/**
 * Paper UI: cards that unfold, with big buttons, segmented choices and sliders
 * you work with a fingertip. Only the nearest control under a fingertip can fire
 * (no double presses), every press sinks and warms the paper (there are no haptics),
 * and labels always fit their paper.
 */

const FONT = (px: number) => `italic 600 ${px}px Georgia, "Times New Roman", serif`;

/** draw a label fitted to the width (one size per card can be forced with `px`) */
export function fitFont(g: CanvasRenderingContext2D, text: string, maxW: number, maxPx: number, minPx: number): number {
  let px = maxPx;
  g.font = FONT(px);
  while (g.measureText(text).width > maxW && px > minPx) {
    px -= 1;
    g.font = FONT(px);
  }
  return px;
}

/** a poke-able control: what the card needs to pick the nearest one under a fingertip */
interface Pokeable {
  readonly group: Group;
  /** fingertip distance to the control (local metres) when inside its hit box, else Infinity */
  hit(tip: Vector3): number;
  visible(): boolean;
}

const tmp = new Vector3();

export class PaperButton implements Pokeable {
  readonly group = new Group();
  private face: Mesh;
  private tex: CanvasTexture;
  private canvas = document.createElement('canvas');
  private armed = true;
  private cool = 0;
  private press = 0;
  private hot = false;
  private sel = false;
  enabled = true;
  /** force one letter height (metres) so a card's labels match in real size */
  textH = 0;
  private faceH: number;

  constructor(readonly id: string, private label: string, readonly w = 0.11, readonly h = 0.036) {
    // the canvas has the face's own shape, so text is never stretched
    const fw = w * 0.97;
    const fh = h * 0.9;
    this.faceH = fh;
    this.canvas.width = 512;
    this.canvas.height = Math.max(32, Math.round((512 * fh) / fw));
    this.tex = new CanvasTexture(this.canvas);
    this.tex.colorSpace = SRGBColorSpace;
    this.tex.anisotropy = 4;
    const backing = new Mesh(new BoxGeometry(w, h, 0.004), new MeshBasicMaterial({ color: '#5a3d33' }));
    backing.position.z = -0.002;
    this.face = new Mesh(new PlaneGeometry(fw, fh), new MeshBasicMaterial({ map: this.tex, transparent: true }));
    this.face.position.z = 0.0006;
    this.group.add(backing, this.face);
    this.group.name = `Button ${id}`;
    this.draw();
  }

  /** the letter height (m) this button would like, fitted to its width */
  wantH(): number {
    const g = this.canvas.getContext('2d')!;
    const px = fitFont(g, this.label, this.canvas.width - 56, Math.round(this.canvas.height * 0.5), Math.round(this.canvas.height * 0.3));
    return (px / this.canvas.height) * this.faceH;
  }

  setLabel(label: string): void {
    if (label === this.label) return;
    this.label = label;
    this.draw();
  }

  /** redraw (after fontPx changed) */
  refresh(): void {
    this.draw();
  }

  /** a chosen segment stays raised and amber */
  setSelected(s: boolean): void {
    if (s === this.sel) return;
    this.sel = s;
    this.draw();
  }

  private draw(): void {
    const g = this.canvas.getContext('2d')!;
    const W = this.canvas.width;
    const H = this.canvas.height;
    g.clearRect(0, 0, W, H);
    g.fillStyle = this.hot ? '#ffe2a8' : this.sel ? '#f6c879' : '#f2e3c2';
    g.beginPath();
    g.roundRect(4, 4, W - 8, H - 8, 18);
    g.fill();
    g.strokeStyle = this.sel ? 'rgba(140, 80, 20, 0.9)' : 'rgba(90, 60, 40, 0.6)';
    g.lineWidth = this.sel ? 7 : 4;
    g.stroke();
    g.fillStyle = '#2a1c22';
    const px = this.textH ? Math.round((this.textH / this.faceH) * H) : Math.round((this.wantH() / this.faceH) * H);
    g.font = FONT(px);
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(this.label, W / 2, H / 2 + 2, W - 40);
    this.tex.needsUpdate = true;
  }

  visible(): boolean {
    return this.enabled && this.group.visible && (this.group.parent?.visible ?? true);
  }

  hit(tip: Vector3): number {
    this.group.worldToLocal(tmp.copy(tip));
    // 3 mm margin; the depth band lets a fingertip press in
    if (Math.abs(tmp.x) < this.w / 2 + 0.003 && Math.abs(tmp.y) < this.h / 2 + 0.003 && tmp.z < 0.02 && tmp.z > -0.02) return Math.hypot(tmp.x / this.w, tmp.y / this.h);
    return Infinity;
  }

  /** `chosen`: this button is the nearest control under a fingertip. Returns true once per poke. */
  update(dt: number, chosen: boolean): boolean {
    this.cool = Math.max(0, this.cool - dt);
    const was = this.press > 0.5;
    this.press = chosen ? Math.min(1, this.press + dt * 10) : Math.max(0, this.press - dt * 6);
    this.face.position.z = 0.0006 - 0.003 * this.press;
    const hot = this.press > 0.5;
    if (hot !== was) {
      this.hot = hot;
      this.draw();
    }
    if (!chosen) {
      this.armed = true;
      return false;
    }
    // a press counts once the paper is fully down (a fingertip passing through does not press)
    if (this.armed && this.cool === 0 && this.press >= 0.99) {
      this.armed = false;
      this.cool = 0.45;
      return true;
    }
    return false;
  }

  /** a fingertip already inside must leave before it can press (used while a card is arming) */
  disarm(): void {
    this.armed = false;
  }
}

/**
 * A paper slider you take by its knob: rest a fingertip ON the knob a moment (it warms), then drag.
 * The knob follows the finger from where you took it (never jumps to the finger), and a fingertip
 * that only passes over the card cannot move it. The level (0-10) is printed on the knob.
 */
export class PaperSlider implements Pokeable {
  readonly group = new Group();
  private fill: Mesh;
  private knob: Mesh;
  private knobCanvas = document.createElement('canvas');
  private knobTex: CanvasTexture;
  value: number;
  private raw: number;
  held = false;
  /** true on the frame the reader lets go (the programme saves then) */
  released = false;
  private arm = 0;
  private grabX = 0;
  private grabV = 0;
  private last = new Vector3();
  private hasLast = false;
  private stops = 10;
  private knobKey = -1;
  static readonly KW = 0.02;
  static readonly KH = 0.028;
  static readonly ARM = 0.2;

  constructor(readonly id: string, readonly w: number, value = 0.8, readonly h = 0.03, designed = 0.8) {
    this.value = this.raw = value;
    const track = new Mesh(new BoxGeometry(w, 0.008, 0.003), new MeshBasicMaterial({ color: '#b39b72' }));
    this.fill = new Mesh(new BoxGeometry(1, 0.009, 0.004), new MeshBasicMaterial({ color: '#e0a347' }));
    // the scale: eleven notches and a gold one at the designed level (one mesh)
    const sc = document.createElement('canvas');
    sc.width = 512;
    sc.height = 32;
    const g = sc.getContext('2d')!;
    for (let k = 0; k <= this.stops; k++) {
      const x = 6 + (k / this.stops) * 500;
      const gold = Math.abs(k / this.stops - designed) < 1e-3;
      g.fillStyle = gold ? '#d99a2b' : 'rgba(90,60,40,0.7)';
      g.fillRect(x - (gold ? 4 : 2), 0, gold ? 8 : 4, gold ? 32 : 18);
    }
    const scaleTex = new CanvasTexture(sc);
    scaleTex.colorSpace = SRGBColorSpace;
    const scale = new Mesh(new PlaneGeometry(w * (512 / 500), 0.008), new MeshBasicMaterial({ map: scaleTex, transparent: true }));
    scale.position.set(0, -0.011, 0.0016);
    this.knobCanvas.width = 64;
    this.knobCanvas.height = 96;
    this.knobTex = new CanvasTexture(this.knobCanvas);
    this.knobTex.colorSpace = SRGBColorSpace;
    this.knob = new Mesh(new BoxGeometry(PaperSlider.KW, PaperSlider.KH, 0.008), new MeshBasicMaterial({ map: this.knobTex }));
    this.group.add(track, this.fill, scale, this.knob);
    this.group.name = `Slider ${id}`;
    this.layout();
  }

  private layout(): void {
    const x = (this.value - 0.5) * this.w;
    const a = Math.min(1, this.arm / PaperSlider.ARM);
    this.knob.position.set(x, 0, this.held ? 0.007 : 0.003 + 0.003 * a);
    this.fill.scale.x = Math.max(0.0001, this.value * this.w);
    this.fill.position.set(-this.w / 2 + (this.value * this.w) / 2, 0, 0.0005);
    const stop = Math.round(this.value * this.stops);
    const hot = this.held ? 2 : a > 0 ? 1 : 0;
    const key = stop * 3 + hot;
    if (key === this.knobKey) return;
    this.knobKey = key;
    const g = this.knobCanvas.getContext('2d')!;
    g.fillStyle = hot === 2 ? '#c4772f' : hot === 1 ? '#a0603a' : '#7a4a2a';
    g.fillRect(0, 0, 64, 96);
    g.fillStyle = '#fff1d6';
    g.font = FONT(stop === 10 ? 34 : 46);
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(String(stop), 32, 50);
    this.knobTex.needsUpdate = true;
  }

  set(v: number): void {
    this.value = this.raw = Math.min(1, Math.max(0, v));
    this.layout();
  }

  visible(): boolean {
    return this.group.visible && (this.group.parent?.visible ?? true);
  }

  hit(tip: Vector3): number {
    this.group.worldToLocal(tmp.copy(tip));
    if (this.held) {
      // once taken, a wobbly hand keeps it; pulling 3.5 cm off the card lets go
      return Math.abs(tmp.x) < this.w / 2 + 0.04 && Math.abs(tmp.y) < 0.04 && tmp.z < 0.035 && tmp.z > -0.03 ? 0 : Infinity;
    }
    // only the knob, and only a fingertip at the paper (not one hovering past)
    const dx = (tmp.x - (this.value - 0.5) * this.w) / (PaperSlider.KW / 2 + 0.004);
    const dy = tmp.y / (PaperSlider.KH / 2 + 0.003);
    if (Math.abs(dx) < 1 && Math.abs(dy) < 1 && tmp.z < 0.015 && tmp.z > -0.02) return Math.hypot(dx, dy) * 0.7;
    return Infinity;
  }

  /** returns the new value when it changed a stop */
  update(dt: number, tip: Vector3 | null): number | null {
    this.released = false;
    if (!tip) {
      this.released = this.held;
      this.held = false;
      this.arm = 0;
      this.hasLast = false;
      this.layout();
      return null;
    }
    this.group.worldToLocal(tmp.copy(tip));
    if (!this.held) {
      const speed = this.hasLast ? tmp.distanceTo(this.last) / Math.max(dt, 1e-3) : 0;
      this.last.copy(tmp);
      this.hasLast = true;
      this.arm = speed < 0.25 ? this.arm + dt : 0; // a sweeping finger never arms it
      if (this.arm >= PaperSlider.ARM) {
        this.held = true;
        this.grabX = tmp.x;
        this.grabV = this.raw = this.value;
      }
      this.layout();
      return null;
    }
    const target = Math.min(1, Math.max(0, this.grabV + (tmp.x - this.grabX) / this.w));
    this.raw += (target - this.raw) * Math.min(1, dt * 14);
    const stop = Math.round(this.raw * this.stops) / this.stops;
    const changed = Math.abs(stop - this.value) > 1e-6 && Math.abs(this.raw - this.value) > 0.6 / this.stops;
    if (changed) this.value = stop;
    this.layout();
    return changed ? this.value : null;
  }
}

/** A standing paper card with a title and a column of buttons (the end card). */
export class PaperCard {
  readonly group = new Group();
  readonly buttons: PaperButton[] = [];
  private show = 0;
  private target = 0;
  private titleTex: CanvasTexture;
  private armed = 0;
  /** the card leans back so it faces a reader looking down at it */
  pitch = -0.26;

  constructor(title: string, items: [string, string][], width = 0.2) {
    const bh = 0.04;
    const gap = 0.008;
    const h = 0.05 + items.length * (bh + gap) + 0.012;
    const card = new Mesh(new BoxGeometry(width, h, 0.003), new MeshBasicMaterial({ color: '#e9d9b6' }));
    card.position.y = -h / 2;
    const c = document.createElement('canvas');
    c.width = 512;
    c.height = 96;
    const g = c.getContext('2d')!;
    g.fillStyle = '#3a2228';
    fitFont(g, title, 480, 54, 24);
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(title, 256, 50);
    this.titleTex = new CanvasTexture(c);
    this.titleTex.colorSpace = SRGBColorSpace;
    const titleMesh = new Mesh(new PlaneGeometry(width * 0.9, width * 0.9 * (96 / 512)), new MeshBasicMaterial({ map: this.titleTex, transparent: true }));
    titleMesh.position.set(0, -0.026, 0.002);
    this.group.add(card, titleMesh);
    items.forEach(([id, label], k) => {
      const b = new PaperButton(id, label, width - 0.025, bh);
      b.group.position.set(0, -0.05 - k * (bh + gap) - bh / 2, 0.004);
      this.group.add(b.group);
      this.buttons.push(b);
    });
    // one letter height for the whole card
    matchSizes(this.buttons);
    this.group.visible = false;
    this.group.scale.setScalar(0.001);
    this.group.rotation.order = 'YXZ';
  }

  open(on: boolean): void {
    this.target = on ? 1 : 0;
    if (on) {
      this.group.visible = true;
      this.armed = 0;
    }
  }

  get isOpen(): boolean {
    return this.target === 1;
  }

  button(id: string): PaperButton | undefined {
    return this.buttons.find((b) => b.id === id);
  }

  update(dt: number, tips: Vector3[]): string | null {
    // shut and settled: nothing to do (three cards are stepped every frame)
    if (this.target === 0 && this.show < 0.002) return null;
    this.show += (this.target - this.show) * Math.min(1, dt * 9);
    this.group.scale.setScalar(Math.max(0.001, this.show));
    this.group.rotation.x = -(1 - this.show) * 1.2 + this.pitch * this.show;
    if (this.target === 0 && this.show < 0.02) this.group.visible = false;
    this.armed = this.show > 0.9 ? this.armed + dt : 0;
    return pokeNearest(this.buttons, this.show > 0.9 ? tips : [], dt, this.armed > 0.6);
  }
}

/** each fingertip presses only the nearest button under it */
function pokeNearest(buttons: PaperButton[], tips: Vector3[], dt: number, live: boolean): string | null {
  const chosen = new Set<PaperButton>();
  for (const t of tips) {
    let best: PaperButton | null = null;
    let bd = Infinity;
    for (const b of buttons) {
      if (!b.visible()) continue;
      const d = b.hit(t);
      if (d < bd) {
        bd = d;
        best = b;
      }
    }
    if (best) chosen.add(best);
  }
  let hit: string | null = null;
  for (const b of buttons) {
    const fired = b.update(dt, chosen.has(b));
    if (fired) {
      if (live) hit = b.id;
      else b.disarm();
    }
  }
  return hit;
}

/** give a group of buttons one shared letter height (the smallest that fits them all) */
function matchSizes(buttons: PaperButton[]): void {
  if (!buttons.length) return;
  const h = Math.min(...buttons.map((b) => b.wantH()));
  for (const b of buttons) {
    b.textH = h;
    b.refresh();
  }
}

// ---- the programme: a paper card with a thumb index of tabs ---------------------------------

export type ProgrammeRow =
  | { kind: 'button'; id: string; label: string }
  | { kind: 'choice'; id: string; label: string; options: [string, string][]; value: string }
  | { kind: 'slider'; id: string; label: string; value: number }
  | { kind: 'stepper'; id: string; label: string };

export interface ProgrammeTab {
  id: string;
  label: string;
  rows: ProgrammeRow[];
}

export interface ProgrammeEvent {
  id: string;
  value?: string | number;
}

interface RowView {
  row: ProgrammeRow;
  group: Group;
  label?: Mesh;
  buttons: PaperButton[];
  slider?: PaperSlider;
}

function labelMesh(text: string, w: number, h: number, align: 'left' | 'center' = 'left'): Mesh {
  const c = document.createElement('canvas');
  c.width = 384;
  c.height = Math.round((384 * h) / w);
  const g = c.getContext('2d')!;
  g.fillStyle = '#3a2228';
  fitFont(g, text, c.width - 12, Math.round(c.height * 0.62), Math.round(c.height * 0.36));
  g.textAlign = align;
  g.textBaseline = 'middle';
  g.fillText(text, align === 'left' ? 6 : c.width / 2, c.height / 2 + 2, c.width - 12);
  const tex = new CanvasTexture(c);
  tex.colorSpace = SRGBColorSpace;
  tex.anisotropy = 4;
  return new Mesh(new PlaneGeometry(w, h), new MeshBasicMaterial({ map: tex, transparent: true }));
}

/**
 * The pause "programme": one card, a thumb index of tabs down the reader's
 * dominant-hand edge, at most four rows per page. Rows are buttons, segmented
 * choices (poke the value you want), sliders or ◂ ▸ steppers.
 */
const NO_EVENTS: ProgrammeEvent[] = [];

export class PaperProgramme {
  readonly group = new Group();
  private show = 0;
  private target = 0;
  private armed = 0;
  private tabButtons: PaperButton[] = [];
  private pages = new Map<string, RowView[]>();
  private pageGroups = new Map<string, Group>();
  tab: string;
  pitch = -0.26;
  /** fired controls since the last update */
  private slidersHeld = new Set<string>();
  private calm = 0;
  readonly W: number;
  readonly H: number;

  constructor(private tabs: ProgrammeTab[], width = 0.22, tabsOnRight = true) {
    const rowH = 0.04;
    const gap = 0.008;
    const maxRows = Math.max(...tabs.map((t) => t.rows.length));
    const H = 0.016 + maxRows * (rowH + gap) + 0.008;
    this.W = width;
    this.H = H;
    const tabW = 0.044;
    const bodyW = width - tabW - 0.012;
    const card = new Mesh(new BoxGeometry(width, H, 0.003), new MeshBasicMaterial({ color: '#e9d9b6' }));
    card.position.y = -H / 2;
    this.group.add(card);
    const tabX = tabsOnRight ? width / 2 - tabW / 2 - 0.004 : -width / 2 + tabW / 2 + 0.004;
    const bodyX = tabsOnRight ? -width / 2 + bodyW / 2 + 0.006 : width / 2 - bodyW / 2 - 0.006;
    // the thumb index
    const tabH = Math.min(0.04, (H - 0.016) / tabs.length - 0.004);
    tabs.forEach((t, k) => {
      const b = new PaperButton(`tab:${t.id}`, t.label, tabW, tabH);
      b.group.position.set(tabX, -0.008 - k * (tabH + 0.004) - tabH / 2, 0.004);
      this.group.add(b.group);
      this.tabButtons.push(b);
    });
    matchSizes(this.tabButtons);
    // the pages
    const allButtons: PaperButton[] = [];
    for (const t of tabs) {
      const pg = new Group();
      pg.name = `Page ${t.id}`;
      pg.position.x = bodyX;
      this.group.add(pg);
      const views: RowView[] = [];
      t.rows.forEach((row, k) => {
        const g = new Group();
        g.position.set(0, -0.016 - k * (rowH + gap) - rowH / 2, 0.004);
        pg.add(g);
        const view: RowView = { row, group: g, buttons: [] };
        if (row.kind === 'button') {
          const b = new PaperButton(row.id, row.label, bodyW, rowH);
          g.add(b.group);
          view.buttons.push(b);
        } else {
          const labW = bodyW * 0.27;
          const lab = labelMesh(row.label, labW, rowH * 0.7);
          lab.position.x = -bodyW / 2 + labW / 2;
          g.add(lab);
          view.label = lab;
          const restW = bodyW - labW - 0.004;
          const restX = bodyW / 2 - restW / 2;
          if (row.kind === 'choice') {
            const n = row.options.length;
            const sw = (restW - (n - 1) * 0.004) / n;
            row.options.forEach(([value, text], i) => {
              const b = new PaperButton(`${row.id}=${value}`, text, sw, rowH * 0.9);
              b.group.position.x = restX - restW / 2 + sw / 2 + i * (sw + 0.004);
              b.setSelected(value === row.value);
              g.add(b.group);
              view.buttons.push(b);
            });
          } else if (row.kind === 'stepper') {
            const sw = (restW - 0.004) / 2;
            for (const [i, [v, t2]] of ([[-1, 'Nearer'], [1, 'Farther']] as [number, string][]).entries()) {
              const label = row.id === 'height' ? (v < 0 ? 'Lower' : 'Higher') : t2;
              const b = new PaperButton(`${row.id}=${v}`, label, sw, rowH * 0.9);
              b.group.position.x = restX - restW / 2 + sw / 2 + i * (sw + 0.004);
              g.add(b.group);
              view.buttons.push(b);
            }
          } else if (row.kind === 'slider') {
            const s = new PaperSlider(row.id, restW - 0.012, row.value, rowH);
            s.group.position.x = restX;
            g.add(s.group);
            view.slider = s;
          }
        }
        allButtons.push(...view.buttons);
        views.push(view);
      });
      this.pages.set(t.id, views);
      this.pageGroups.set(t.id, pg);
    }
    // one letter height per kind of control: the full-width rows across the card, the segments per page
    matchSizes(allButtons.filter((b) => !b.id.includes('=')));
    for (const views of this.pages.values()) matchSizes(views.flatMap((v) => v.buttons).filter((b) => b.id.includes('=')));
    this.tab = tabs[0].id;
    this.showTab(this.tab);
    this.group.visible = false;
    this.group.scale.setScalar(0.001);
    this.group.rotation.order = 'YXZ';
    this.group.name = 'Programme';
  }

  showTab(id: string): void {
    // a tab switch must not hand the pressing finger to a slider
    this.calm = 0.5;
    this.tab = id;
    for (const [k, g] of this.pageGroups) g.visible = k === id;
    for (const b of this.tabButtons) b.setSelected(b.id === `tab:${id}`);
  }

  setChoice(id: string, value: string): void {
    for (const views of this.pages.values()) for (const v of views) if (v.row.id === id && v.row.kind === 'choice') {
      v.row.value = value;
      for (const b of v.buttons) b.setSelected(b.id === `${id}=${value}`);
    }
  }

  setSlider(id: string, value: number): void {
    for (const views of this.pages.values()) for (const v of views) if (v.row.id === id && v.slider) v.slider.set(value);
  }

  /** hide a row (e.g. "Room" in VR); rows below don't move */
  setRowVisible(id: string, on: boolean): void {
    for (const views of this.pages.values()) for (const v of views) if (v.row.id === id) v.group.visible = on;
  }

  setButtonLabel(id: string, label: string): void {
    for (const views of this.pages.values()) for (const v of views) for (const b of v.buttons) if (b.id === id) b.setLabel(label);
  }

  open(on: boolean, tab?: string): void {
    this.target = on ? 1 : 0;
    if (on) {
      this.group.visible = true;
      this.armed = 0;
      if (tab) this.showTab(tab);
    }
  }

  get isOpen(): boolean {
    return this.target === 1;
  }

  /** a slider is being held (the director lifts the pause quiet so it can be heard) */
  isHolding(id: string): boolean {
    return this.slidersHeld.has(id);
  }

  /** world positions of every visible control (for checks) */
  controls(): { id: string; at: number[] }[] {
    const out: { id: string; at: number[] }[] = [];
    for (const b of this.tabButtons) out.push({ id: b.id, at: b.group.getWorldPosition(new Vector3()).toArray() });
    for (const v of this.pages.get(this.tab) ?? []) {
      if (!v.group.visible) continue;
      for (const b of v.buttons) out.push({ id: b.id, at: b.group.getWorldPosition(new Vector3()).toArray() });
      if (v.slider) out.push({ id: v.slider.id, at: v.slider.group.getWorldPosition(new Vector3()).toArray() });
    }
    return out;
  }

  update(dt: number, tips: Vector3[]): ProgrammeEvent[] {
    if (this.target === 0 && this.show < 0.002) return NO_EVENTS;
    this.show += (this.target - this.show) * Math.min(1, dt * 9);
    this.group.scale.setScalar(Math.max(0.001, this.show));
    this.group.rotation.x = -(1 - this.show) * 1.2 + this.pitch * this.show;
    if (this.target === 0 && this.show < 0.02) this.group.visible = false;
    this.armed = this.show > 0.9 ? this.armed + dt : 0;
    const live = this.armed > 0.6;
    this.calm = Math.max(0, this.calm - dt);
    const active = this.show > 0.9 ? tips : [];
    const views = (this.pages.get(this.tab) ?? []).filter((v) => v.group.visible);
    const buttons = [...this.tabButtons, ...views.flatMap((v) => v.buttons)];
    const sliders = views.map((v) => v.slider).filter((s): s is PaperSlider => !!s);
    const events: ProgrammeEvent[] = [];
    // each fingertip goes to the nearest control under it; a held slider keeps its finger
    const chosen = new Set<PaperButton>();
    const sliderTip = new Map<PaperSlider, Vector3>();
    for (const t of active) {
      const held = sliders.find((s) => s.held && s.hit(t) < Infinity);
      if (held) {
        sliderTip.set(held, t);
        continue;
      }
      let best: PaperButton | PaperSlider | null = null;
      let bd = Infinity;
      for (const c of [...buttons, ...sliders]) {
        if (!c.visible()) continue;
        const d = c.hit(t);
        if (d < bd) {
          bd = d;
          best = c;
        }
      }
      if (best instanceof PaperButton) chosen.add(best);
      else if (best instanceof PaperSlider && live && this.calm === 0 && sliderTip.size === 0 && !sliders.some((s) => s.held && s !== best)) sliderTip.set(best, t);
    }
    for (const b of buttons) {
      if (!b.update(dt, chosen.has(b))) continue;
      if (!live) {
        b.disarm();
        continue;
      }
      if (b.id.startsWith('tab:')) {
        this.showTab(b.id.slice(4));
        events.push({ id: b.id });
        continue;
      }
      const eq = b.id.indexOf('=');
      if (eq < 0) events.push({ id: b.id });
      else {
        const id = b.id.slice(0, eq);
        const value = b.id.slice(eq + 1);
        const view = views.find((v) => v.row.id === id);
        if (view?.row.kind === 'stepper') events.push({ id, value: +value });
        else {
          this.setChoice(id, value);
          events.push({ id, value });
        }
      }
    }
    this.slidersHeld.clear();
    for (const s of sliders) {
      const v = s.update(dt, sliderTip.get(s) ?? null);
      if (s.held) this.slidersHeld.add(s.id);
      if (v !== null) events.push({ id: s.id, value: v });
      if (s.released) events.push({ id: `${s.id}:set`, value: s.value });
    }
    return events;
  }
}
