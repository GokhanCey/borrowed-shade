import { CanvasTexture, Mesh, MeshBasicMaterial, PlaneGeometry, SRGBColorSpace } from '@iwsdk/core';

/**
 * The story text, printed on a paper ribbon at the top of the shadow screen.
 * Lines fade in like ink soaking into paper and fade out before the next one.
 * Big, high-contrast serif: readable on Quest 2 lenses at arm's length.
 */
export class Captions {
  /** the ink (painted once per line; its fade is this material's opacity) */
  readonly material: MeshBasicMaterial;
  /** the paper ribbon behind the ink (painted once per style; it eases in and out by itself) */
  readonly ribbonMaterial: MeshBasicMaterial;
  private canvas = document.createElement('canvas');
  private g: CanvasRenderingContext2D;
  private tex: CanvasTexture;
  private ribbonCanvas = document.createElement('canvas');
  private ribbonTex: CanvasTexture;
  private ribbonK = 0;
  private ribbonStyle = '';
  private current = '';
  /** the line on the ribbon now */
  get shownText(): string {
    return this.current;
  }
  private next: string | null = null;
  private alpha = 0;
  private dirty = true;
  /** text size multiplier (pause card: "Text size") */
  scale = 1;
  /** 'strong': a solid ribbon and upright, heavier ink (easier to read) */
  style: 'paper' | 'strong' = 'paper';
  /**
   * Text size (A = 1, A+ = 1.15, A++ = 1.3): the ribbon grows taller by this much and the letters with
   * it; a long line may then take three lines. Its width never changes (it stays inside the frame).
   */
  private tallK = 1;
  get tall(): number {
    return this.tallK;
  }
  set tall(k: number) {
    if (k === this.tallK) return;
    this.tallK = k;
    for (const [c, tex] of [[this.canvas, this.tex], [this.ribbonCanvas, this.ribbonTex]] as const) {
      c.height = Math.round(256 * k);
      // (a canvas of another size is another texture)
      tex.dispose();
      tex.needsUpdate = true;
    }
    this.ribbonStyle = '';
    this.dirty = true;
  }
  /** last line shown (for checks) */
  shown = '';

  constructor() {
    this.canvas.width = 1536;
    this.canvas.height = 256;
    this.g = this.canvas.getContext('2d')!;
    this.tex = new CanvasTexture(this.canvas);
    this.tex.colorSpace = SRGBColorSpace;
    this.tex.anisotropy = 4;
    this.material = new MeshBasicMaterial({ map: this.tex, transparent: true, opacity: 0, depthWrite: false });
    this.ribbonCanvas.width = 1536;
    this.ribbonCanvas.height = 256;
    this.ribbonTex = new CanvasTexture(this.ribbonCanvas);
    this.ribbonTex.colorSpace = SRGBColorSpace;
    this.ribbonTex.anisotropy = 4;
    this.ribbonMaterial = new MeshBasicMaterial({ map: this.ribbonTex, transparent: true, opacity: 0, depthWrite: false });
  }

  /** Show a line (cross-fades from the current one). Empty string clears. */
  say(text: string): void {
    if (text === this.current && this.next === null) return;
    this.next = text;
  }

  /** Show a line at once, without the ink fade (a live readout). */
  live(text: string): void {
    this.current = text;
    this.shown = text;
    this.next = null;
    this.alpha = 1;
    this.dirty = true;
  }

  get busy(): boolean {
    return this.next !== null;
  }

  update(dt: number): void {
    if (this.next !== null) {
      this.alpha = Math.max(0, this.alpha - dt * 3.2);
      if (this.alpha === 0) {
        this.current = this.next;
        this.shown = this.current;
        this.next = null;
        this.dirty = true; // the only repaint of a line: once, when it changes
      }
    } else if (this.alpha < 1 && this.current) this.alpha = Math.min(1, this.alpha + dt * 1.6);
    if (this.dirty) this.draw();
    this.material.opacity = this.alpha;
    // the ribbon stays while lines follow each other, and eases away when the story is silent
    this.ribbonK += ((this.current || this.next ? 1 : 0) - this.ribbonK) * Math.min(1, dt * 6);
    this.ribbonMaterial.opacity = this.ribbonK;
  }

  /** Re-draw now (e.g. after a text-size change). */
  refresh(): void {
    this.dirty = true;
  }

  private draw(): void {
    this.dirty = false;
    const g = this.g;
    const W = this.canvas.width;
    const H = this.canvas.height;
    g.clearRect(0, 0, W, H);
    if (this.ribbonStyle !== this.style) {
      // the ribbon: a warm paper strip with torn ends (its own layer, painted once per style)
      this.ribbonStyle = this.style;
      const r = this.ribbonCanvas.getContext('2d')!;
      r.clearRect(0, 0, W, H);
      r.fillStyle = this.style === 'strong' ? 'rgba(255, 250, 240, 1)' : 'rgba(244, 231, 204, 0.97)';
      r.beginPath();
      r.moveTo(26, 22);
      for (let x = 26; x <= W - 26; x += 48) r.lineTo(x, 18 + ((x * 7) % 9));
      r.lineTo(W - 10, H / 2);
      r.lineTo(W - 26, H - 20);
      for (let x = W - 26; x >= 26; x -= 48) r.lineTo(x, H - 18 - ((x * 5) % 9));
      r.lineTo(10, H / 2);
      r.closePath();
      r.fill();
      r.strokeStyle = 'rgba(120, 84, 52, 0.35)';
      r.lineWidth = 3;
      r.stroke();
      this.ribbonTex.needsUpdate = true;
    }
    if (!this.current) {
      this.tex.needsUpdate = true;
      return;
    }
    // ink text: up to two lines, always inside the paper. The size the reader chose (A, A+, A++) is
    // honoured as far as it fits; it never ends up smaller than the plain size would have been.
    const face = this.style === 'strong' ? '600' : 'italic 500';
    const maxW = W - 170;
    const maxH = H - 56;
    const fit = (want: number): [number, string[]] => {
      let size = want;
      for (;;) {
        g.font = `${face} ${size}px Georgia, "Times New Roman", serif`;
        const ls = wrap(g, this.current, maxW);
        if ((ls.length <= (this.tallK > 1 ? 3 : 2) && ls.length * size * 1.12 <= maxH) || size <= 34) return [size, ls];
        size -= 3;
      }
    };
    const [plain] = fit(Math.round(76 * this.tallK));
    let [s, lines] = fit(Math.round(76 * Math.max(1, this.scale) * this.tallK));
    if (s < plain) [s, lines] = fit(plain);
    g.font = `${face} ${s}px Georgia, "Times New Roman", serif`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    const lh = s * 1.12;
    const y0 = H / 2 - ((lines.length - 1) * lh) / 2;
    g.fillStyle = 'rgba(36, 24, 30, 1)';
    lines.forEach((l, k) => g.fillText(l, W / 2, y0 + k * lh));
    this.tex.needsUpdate = true;
  }
}

function wrap(g: CanvasRenderingContext2D, text: string, max: number): string[] {
  const out: string[] = [];
  let line = '';
  for (const w of text.split(' ')) {
    const t = line ? `${line} ${w}` : w;
    if (g.measureText(t).width > max && line) {
      out.push(line);
      line = w;
    } else line = t;
  }
  if (line) out.push(line);
  return out;
}

/**
 * The advice slip: a narrow paper strip pinned under the caption ribbon, in the
 * book's advice voice ("For example: a loose fist, two fingers up"). Never part
 * of the story line; fades in and out.
 */
export class AdviceSlip {
  readonly mesh: Mesh;
  private canvas = document.createElement('canvas');
  private g: CanvasRenderingContext2D;
  private tex: CanvasTexture;
  private mat: MeshBasicMaterial;
  text = '';
  private next: string | null = null;
  private alpha = 0;
  shown = '';
  /** the reader's Text size and Ribbon style (the slip follows the captions) */
  scale = 1;
  style: 'paper' | 'strong' = 'paper';

  /** re-draw now (a setting changed) */
  refresh(): void {
    this.draw();
  }

  constructor() {
    this.canvas.width = 1536;
    this.canvas.height = 200;
    this.g = this.canvas.getContext('2d')!;
    this.tex = new CanvasTexture(this.canvas);
    this.tex.colorSpace = SRGBColorSpace;
    this.tex.anisotropy = 4;
    this.mat = new MeshBasicMaterial({ map: this.tex, transparent: true, opacity: 0, depthWrite: false });
    this.mesh = new Mesh(new PlaneGeometry(0.4, 0.4 * (200 / 1536)), this.mat);
    this.mesh.name = 'Advice slip';
    this.mesh.renderOrder = 13;
    this.mesh.visible = false;
  }

  show(text: string): void {
    if (text === (this.next ?? this.text)) return;
    this.next = text;
  }

  update(dt: number): void {
    if (this.next !== null) {
      this.alpha = Math.max(0, this.alpha - dt * 4);
      if (this.alpha === 0) {
        this.text = this.next;
        this.shown = this.text;
        this.next = null;
        this.draw();
      }
    } else if (this.text) this.alpha = Math.min(1, this.alpha + dt * 2);
    this.mat.opacity = this.alpha;
    this.mesh.visible = this.alpha > 0.01;
  }

  private draw(): void {
    const g = this.g;
    const W = this.canvas.width;
    const H = this.canvas.height;
    g.clearRect(0, 0, W, H);
    if (!this.text) {
      this.tex.needsUpdate = true;
      return;
    }
    // one line when it fits at a readable size, else two; never clipped, never tiny
    const face = this.style === 'strong' ? '600' : '500';
    const font = (s: number) => `${face} ${s}px Georgia, "Times New Roman", serif`;
    const big = Math.round(60 * Math.min(1.25, Math.max(1, this.scale)));
    let size = big;
    let lines: string[] = [this.text];
    g.font = font(size);
    while (g.measureText(this.text).width > W - 150 && size > 56) g.font = font((size -= 2));
    if (g.measureText(this.text).width > W - 150) {
      for (size = Math.min(big, 72); ; size -= 2) {
        g.font = font(size);
        lines = wrap(g, this.text, W - 150);
        if ((lines.length <= 2 && lines.length * size * 1.15 + 34 <= H) || size <= 36) break;
      }
      lines = lines.slice(0, 2);
    }
    const lh = size * 1.15;
    let widest = 0;
    for (const l of lines) widest = Math.max(widest, g.measureText(l).width);
    const tw = Math.min(W - 20, widest + 110);
    // the paper is only as tall as its lines, hung from the top (one line keeps the old footprint)
    const th = lines.length * lh + 34;
    const x0 = (W - tw) / 2;
    g.fillStyle = this.style === 'strong' ? 'rgba(255, 250, 240, 1)' : 'rgba(250, 241, 222, 0.97)';
    g.beginPath();
    g.moveTo(x0, 10);
    g.lineTo(x0 + tw, 6);
    g.lineTo(x0 + tw - 8, th - 4);
    g.lineTo(x0 + 6, th - 8);
    g.closePath();
    g.fill();
    g.strokeStyle = 'rgba(150, 110, 60, 0.45)';
    g.lineWidth = 3;
    g.stroke();
    // a small mark: the book's advice voice
    g.fillStyle = 'rgba(160, 96, 40, 0.9)';
    g.beginPath();
    g.arc(x0 + 34, 12 + lh / 2 + 4, 9, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = 'rgba(52, 34, 30, 1)';
    g.textAlign = 'left';
    g.textBaseline = 'middle';
    lines.forEach((l, k) => g.fillText(l, x0 + 60, 14 + lh / 2 + k * lh));
    this.tex.needsUpdate = true;
  }
}
