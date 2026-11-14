import { CanvasTexture, CircleGeometry, LinearFilter, Mesh, MeshBasicMaterial, SRGBColorSpace } from '@iwsdk/core';
import { STAGE_X0, STAGE_X1, STAGE_Y0, STAGE_Y1, toStage, type Placed } from './plate-core.js';
import { PLATES, type PlateData } from './silhouettes-data.js';

export { PLATES };
export type { PlateData };
export { placeCentred, fillSpec, rasterPlate, type Placed } from './plate-core.js';

/**
 * The plate canvas: the whole stage, drawn once per beat, read by the screen shader.
 *   R = plate ink, G = art (light details), B = decoration (a jib), A unused.
 */
export class PlateCanvas {
  /** px per mm */
  static readonly K = 2;
  readonly canvas = document.createElement('canvas');
  readonly texture: CanvasTexture;
  private ctx: CanvasRenderingContext2D;

  constructor() {
    const K = PlateCanvas.K;
    this.canvas.width = Math.round((STAGE_X1 - STAGE_X0) * 1000 * K);
    this.canvas.height = Math.round((STAGE_Y1 - STAGE_Y0) * 1000 * K);
    this.ctx = this.canvas.getContext('2d')!;
    this.texture = new CanvasTexture(this.canvas);
    this.texture.minFilter = LinearFilter;
    this.texture.magFilter = LinearFilter;
    this.texture.generateMipmaps = false;
    this.texture.flipY = true;
    this.clear();
  }

  clear(): void {
    this.ctx.fillStyle = '#000';
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    this.texture.needsUpdate = true;
  }

  private path(p: Placed, rings: [number, number][][]): Path2D {
    const K = PlateCanvas.K;
    const [sx, sy] = toStage(p, 0, 0);
    const H = this.canvas.height;
    const path = new Path2D();
    for (const r of rings) {
      r.forEach(([x, y], i) => {
        const X = (sx + x) * K;
        const Y = H - (sy + y) * K;
        if (i) path.lineTo(X, Y);
        else path.moveTo(X, Y);
      });
      path.closePath();
    }
    return path;
  }

  draw(list: Placed[]): void {
    this.clear();
    const g = this.ctx;
    g.globalCompositeOperation = 'lighter';
    for (const p of list) {
      g.fillStyle = '#ff0000';
      g.fill(this.path(p, p.data.shape), 'evenodd');
      if (p.data.free.length) g.fill(this.path(p, p.data.free), 'evenodd');
      if (p.data.art.length) {
        g.fillStyle = '#00ff00';
        g.fill(this.path(p, p.data.art), 'evenodd');
      }
      if (p.data.decor.length) {
        g.fillStyle = '#0000ff';
        g.fill(this.path(p, p.data.decor), 'evenodd');
      }
    }
    g.globalCompositeOperation = 'source-over';
    this.texture.needsUpdate = true;
  }
}

/**
 * The wax seal: hangs off the caption ribbon's lower right. A thin ink ring fills
 * with the fit, a gold notch marks 75 %, the number is the fit (75 = it fits).
 * Redrawn only when the shown integer changes; stamps down on success.
 */
export class Seal {
  readonly mesh: Mesh;
  private canvas = document.createElement('canvas');
  private ctx: CanvasRenderingContext2D;
  private tex: CanvasTexture;
  private mat: MeshBasicMaterial;
  private shownInt = -1;
  private lit = false;
  /** 0..1 visibility */
  vis = 0;
  private want = 0;
  private stampT = -1;
  private drawT = 0;

  constructor() {
    this.canvas.width = this.canvas.height = 192;
    this.ctx = this.canvas.getContext('2d')!;
    this.tex = new CanvasTexture(this.canvas);
    this.tex.colorSpace = SRGBColorSpace;
    this.mat = new MeshBasicMaterial({ map: this.tex, transparent: true, opacity: 0, depthWrite: false });
    this.mesh = new Mesh(new CircleGeometry(0.021, 40), this.mat);
    this.mesh.name = 'Fit seal';
    this.mesh.renderOrder = 14;
    this.mesh.visible = false;
    this.draw(0, false);
  }

  show(on: boolean): void {
    if (on && this.lit && this.plainT <= 0) this.lit = false;
    this.want = on ? 1 : 0;
  }

  /** success: the seal presses like a stamp */
  /** a screen act done by hand: the seal appears, stamps with an embossed lantern (no number), and goes */
  private plainT = -1;
  stampPlain(): void {
    this.lit = true;
    this.drawPlain();
    this.want = 1;
    this.vis = 0.6;
    this.stampT = 0;
    this.plainT = 1.6;
  }

  private drawPlain(): void {
    this.draw(100, true);
    const g = this.ctx;
    const S = this.canvas.width;
    const c = S / 2;
    // cover the number with a small embossed lantern
    g.fillStyle = '#8a3324';
    g.beginPath();
    g.arc(c, c, c * 0.6, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#f7ead2';
    g.beginPath();
    g.ellipse(c, c * 1.04, c * 0.2, c * 0.27, 0, 0, Math.PI * 2);
    g.fill();
    g.fillRect(c - c * 0.09, c * 0.66, c * 0.18, c * 0.08);
    this.shownInt = -1;
    this.tex.needsUpdate = true;
  }

  stamp(): void {
    this.stampT = 0;
    this.lit = true;
    this.draw(Math.max(this.shownInt, 75), true);
  }

  reset(): void {
    this.plainT = -1;
    this.want = 0;
    this.vis = 0;
    this.lit = false;
    this.stampT = -1;
    this.shownInt = -1;
    this.mesh.visible = false;
  }

  update(dt: number, pct: number): void {
    if (this.plainT > 0) {
      this.plainT -= dt;
      if (this.plainT <= 0) this.want = 0;
    }
    // a stamped seal keeps its face until it has faded out
    if (this.lit && this.plainT <= 0 && this.want === 0 && this.vis < 0.02) this.lit = false;
    this.vis += (this.want - this.vis) * Math.min(1, dt * (this.want ? 5 : 2.5));
    this.mat.opacity = this.vis;
    this.mesh.visible = this.vis > 0.01;
    let s = 0.6 + 0.4 * this.vis;
    if (this.stampT >= 0) {
      this.stampT += dt;
      const k = this.stampT / 0.25;
      s *= k < 0.5 ? 1 - 0.16 * (k / 0.5) : k < 1 ? 0.84 + 0.16 * ((k - 0.5) / 0.5) : 1;
      if (k >= 1) this.stampT = -1;
    }
    this.mesh.scale.setScalar(s);
    this.drawT -= dt;
    if (!this.lit && this.drawT <= 0) {
      const n = Math.max(0, Math.min(100, Math.round(pct)));
      if (n !== this.shownInt) {
        this.draw(n, false);
        this.drawT = 0.1; // at most ten redraws a second
      }
    }
  }

  private draw(n: number, done: boolean): void {
    this.shownInt = n;
    const g = this.ctx;
    const S = this.canvas.width;
    const c = S / 2;
    g.clearRect(0, 0, S, S);
    // wax: a slightly lumpy red-brown disc
    g.beginPath();
    for (let i = 0; i <= 48; i++) {
      const a = (i / 48) * Math.PI * 2;
      const r = c * (0.94 + 0.03 * Math.sin(a * 7) + 0.02 * Math.sin(a * 3 + 1));
      const x = c + r * Math.cos(a);
      const y = c + r * Math.sin(a);
      if (i) g.lineTo(x, y);
      else g.moveTo(x, y);
    }
    const grad = g.createRadialGradient(c * 0.8, c * 0.75, c * 0.1, c, c, c);
    grad.addColorStop(0, done ? '#b5432c' : '#93402e');
    grad.addColorStop(1, done ? '#6e2116' : '#5a2219');
    g.fillStyle = grad;
    g.fill();
    // the track and the fit ring
    const R = c * 0.74;
    g.lineWidth = c * 0.1;
    g.strokeStyle = 'rgba(30,14,10,0.55)';
    g.beginPath();
    g.arc(c, c, R, 0, Math.PI * 2);
    g.stroke();
    const a0 = -Math.PI / 2;
    g.strokeStyle = n >= 75 ? '#ffe7a8' : '#f3e2c4';
    g.beginPath();
    g.arc(c, c, R, a0, a0 + (Math.min(100, n) / 100) * Math.PI * 2);
    g.stroke();
    // the gold notch at 75
    const an = a0 + 0.75 * Math.PI * 2;
    g.strokeStyle = n >= 75 ? '#fff4d0' : '#d9a441';
    g.lineWidth = c * 0.07;
    g.beginPath();
    g.moveTo(c + (R - c * 0.13) * Math.cos(an), c + (R - c * 0.13) * Math.sin(an));
    g.lineTo(c + (R + c * 0.13) * Math.cos(an), c + (R + c * 0.13) * Math.sin(an));
    g.stroke();
    // the number
    g.fillStyle = '#f7ead2';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = `bold ${Math.round(c * 0.62)}px Georgia, serif`;
    g.fillText(String(n), c, c * 0.98);
    g.font = `${Math.round(c * 0.24)}px Georgia, serif`;
    g.fillText('%', c, c * 1.42);
    this.tex.needsUpdate = true;
  }
}
