import type { WebGLRenderer } from '@iwsdk/core';
import { FILL, type Stage } from './fill-core.js';
import { HAND_HALF, HAND_PX, type ShadowCaster } from './shadow.js';

import { STAGE_X0, STAGE_X1, STAGE_Y0, STAGE_Y1 } from './plate-core.js';

export { STAGE_X0, STAGE_X1, STAGE_Y0, STAGE_Y1 };

/**
 * ScreenField: where the reader's hand shadow is on the WHOLE screen, a few
 * times a second. One async readback of the hand-beam target over the stage,
 * pooled 2×2 into the stage grid (2.656 mm cells, y up, index = y·w + x).
 * Everything else (fills, the road, the wall, cover/uncover, catching) reads `H`.
 */
export class ScreenField {
  readonly st: Stage;
  /** the latest shadow grid (1 = shadow) */
  readonly H: Uint8Array;
  /** seconds since the latest grid arrived */
  age = 99;
  /** grids received (tests) */
  frames = 0;
  /** reads per second */
  rate = 8;
  /** shadow cells in the latest grid */
  count = 0;

  /** shadow cells above a height on the screen (board y, m) */
  countAbove(by: number): number {
    const y0 = Math.max(0, Math.floor((by - STAGE_Y0) / (FILL.cellMm / 1000)));
    let n = 0;
    for (let i = y0 * this.st.w; i < this.H.length; i++) n += this.H[i];
    return n;
  }
  private buf: Uint8Array;
  private pw: number;
  private ph: number;
  private inFlight = false;
  private timer = 0;
  private listeners: ((H: Uint8Array) => void)[] = [];

  constructor(private shadow: ShadowCaster) {
    const mm = FILL.cellMm / 1000;
    this.st = { w: Math.round((STAGE_X1 - STAGE_X0) / mm), h: Math.round((STAGE_Y1 - STAGE_Y0) / mm) };
    this.H = new Uint8Array(this.st.w * this.st.h);
    this.pw = this.st.w * 2;
    this.ph = this.st.h * 2;
    this.buf = new Uint8Array(this.pw * this.ph * 4);
  }

  /** called with each new grid (the grid is reused: copy it to keep it) */
  onGrid(fn: (H: Uint8Array) => void): () => void {
    this.listeners.push(fn);
    return () => (this.listeners = this.listeners.filter((f) => f !== fn));
  }

  /** stage mm (from the stage's bottom-left) -> board-local metres */
  static toBoard(xMm: number, yMm: number): [number, number] {
    return [STAGE_X0 + xMm / 1000, STAGE_Y0 + yMm / 1000];
  }

  static toMm(bx: number, by: number): [number, number] {
    return [(bx - STAGE_X0) * 1000, (by - STAGE_Y0) * 1000];
  }

  /** is there shadow at a stage cell (bounds-safe) */
  at(cx: number, cy: number): boolean {
    if (cx < 0 || cy < 0 || cx >= this.st.w || cy >= this.st.h) return false;
    return this.H[cy * this.st.w + cx] === 1;
  }

  /** the last few grids and when they arrived (ms) */
  readonly recent: { H: Uint8Array; t: number }[] = [0, 1, 2, 3].map(() => ({ H: new Uint8Array(0), t: -1e9 }));

  /** shadow at a board point in ANY grid of the last `maxAge` seconds */
  atBoardAny(bx: number, by: number, maxAge = 0.35): boolean {
    if (this.atBoard(bx, by)) return true;
    const c = FILL.cellMm / 1000;
    const cx = Math.floor((bx - STAGE_X0) / c);
    const cy = Math.floor((by - STAGE_Y0) / c);
    if (cx < 0 || cy < 0 || cx >= this.st.w || cy >= this.st.h) return false;
    const now = performance.now();
    for (const r of this.recent) if (r.H.length && now - r.t <= maxAge * 1000 && r.H[cy * this.st.w + cx]) return true;
    return false;
  }

  /** the highest top edge at x over the recent grids (see topAt) */
  topAtAny(bx: number, yLo: number, yHi: number, maxAge = 0.35): number {
    let best = this.topAt(bx, yLo, yHi);
    const now = performance.now();
    const keep = this.H;
    for (const r of this.recent) {
      if (!r.H.length || now - r.t > maxAge * 1000) continue;
      (this as unknown as { H: Uint8Array }).H = r.H;
      const t = this.topAt(bx, yLo, yHi);
      (this as unknown as { H: Uint8Array }).H = keep;
      if (!Number.isNaN(t) && (Number.isNaN(best) || t > best)) best = t;
    }
    return best;
  }

  /** shadow at a board-local point */
  atBoard(bx: number, by: number): boolean {
    const c = FILL.cellMm / 1000;
    return this.at(Math.floor((bx - STAGE_X0) / c), Math.floor((by - STAGE_Y0) / c));
  }

  /**
   * The top edge of the shadow at board x (median of 3 columns), searching down from yHi to yLo
   * (board metres). A lone speck is not ground: the top needs `thick` shadow cells under it. NaN = none.
   */
  topAt(bx: number, yLo: number, yHi: number, thick = 2): number {
    const c = FILL.cellMm / 1000;
    const cx = Math.floor((bx - STAGE_X0) / c);
    const ya = Math.max(0, Math.floor((yLo - STAGE_Y0) / c));
    const yb = Math.min(this.st.h - 1, Math.floor((yHi - STAGE_Y0) / c));
    const tops: number[] = [];
    for (let x = cx - 1; x <= cx + 1; x++) {
      if (x < 0 || x >= this.st.w) continue;
      let run = 0;
      let found = NaN;
      for (let y = ya; y <= yb; y++) {
        run = this.H[y * this.st.w + x] ? run + 1 : 0;
        if (run >= thick) found = y;
      }
      // the highest cell of the topmost run
      if (!Number.isNaN(found)) {
        let y = found;
        while (y + 1 <= yb && this.H[(y + 1) * this.st.w + x]) y++;
        tops.push(STAGE_Y0 + (y + 1) * c);
      }
    }
    if (tops.length < 2) return NaN;
    tops.sort((a, b) => a - b);
    return tops[tops.length === 3 ? 1 : 0];
  }

  /** fraction of a board-space disc (or ellipse) covered by shadow */
  coverEllipse(x: number, y: number, rx: number, ry = rx): number {
    const c = FILL.cellMm / 1000;
    const x0 = Math.max(0, Math.floor((x - rx - STAGE_X0) / c));
    const x1 = Math.min(this.st.w - 1, Math.ceil((x + rx - STAGE_X0) / c));
    const y0 = Math.max(0, Math.floor((y - ry - STAGE_Y0) / c));
    const y1 = Math.min(this.st.h - 1, Math.ceil((y + ry - STAGE_Y0) / c));
    let n = 0;
    let k = 0;
    for (let cy = y0; cy <= y1; cy++) for (let cx = x0; cx <= x1; cx++) {
      const bx = STAGE_X0 + (cx + 0.5) * c;
      const by = STAGE_Y0 + (cy + 0.5) * c;
      if (((bx - x) / rx) ** 2 + ((by - y) / ry) ** 2 > 1) continue;
      n++;
      if (this.H[cy * this.st.w + cx]) k++;
    }
    return n ? k / n : 0;
  }

  /** the shadow's centre (board m) and its area in cells, or null */
  private cFrame = -1;
  private cVal: [number, number, number] | null = null;
  centroid(): [number, number, number] | null {
    if (this.cFrame === this.frames) return this.cVal;
    this.cFrame = this.frames;
    this.cVal = this.computeCentroid();
    return this.cVal;
  }

  private computeCentroid(): [number, number, number] | null {
    if (!this.count) return null;
    const c = FILL.cellMm / 1000;
    let sx = 0;
    let sy = 0;
    let n = 0;
    const { w, h } = this.st;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (this.H[y * w + x]) {
      sx += x;
      sy += y;
      n++;
    }
    return n ? [STAGE_X0 + (sx / n + 0.5) * c, STAGE_Y0 + (sy / n + 0.5) * c, n] : null;
  }

  /** the shadow's leading tip toward +x: its rightmost column and the mean y there (board m), or null */
  tipRight(): [number, number] | null {
    const c = FILL.cellMm / 1000;
    const { w, h } = this.st;
    for (let x = w - 1; x >= 0; x--) {
      let sy = 0;
      let n = 0;
      for (let y = 0; y < h; y++) if (this.H[y * w + x]) {
        sy += y;
        n++;
      }
      if (n >= 2) return [STAGE_X0 + (x + 0.5) * c, STAGE_Y0 + (sy / n + 0.5) * c];
    }
    return null;
  }

  /** clear the grid (hands hidden, page turning) */
  private gen = 0;
  clear(): void {
    this.gen++;
    for (const r of this.recent) r.t = -1e9;
    this.H.fill(0);
    this.count = 0;
  }

  update(dt: number, renderer: WebGLRenderer, active = true): void {
    this.age += dt;
    if (!active || this.inFlight) return;
    this.timer -= dt;
    if (this.timer > 0) return;
    this.timer = 1 / this.rate;
    // the stage's pixel origin in the hand target (the beam is centred on s0)
    const s0 = this.shadow.s0;
    const k = HAND_PX / (2 * HAND_HALF);
    const x0 = Math.round((STAGE_X0 - s0.x) * k + HAND_PX / 2);
    const y0 = Math.round((STAGE_Y0 - s0.y) * k + HAND_PX / 2);
    const r = renderer as unknown as { readRenderTargetPixelsAsync?: (t: unknown, x: number, y: number, w: number, h: number, b: Uint8Array) => Promise<unknown> };
    if (!r.readRenderTargetPixelsAsync) return;
    // clamp to the target (the grid outside it stays empty)
    const cx0 = Math.max(0, x0);
    const cy0 = Math.max(0, y0);
    const cw = Math.min(HAND_PX, x0 + this.pw) - cx0;
    const ch = Math.min(HAND_PX, y0 + this.ph) - cy0;
    if (cw <= 0 || ch <= 0) return;
    const buf = cw * ch * 4 === this.buf.length ? this.buf : new Uint8Array(cw * ch * 4);
    this.inFlight = true;
    const gen = this.gen;
    r.readRenderTargetPixelsAsync(this.shadow.handTarget, cx0, cy0, cw, ch, buf)
      .then(() => {
        if (gen !== this.gen) return;
        this.pool(buf, cw, ch, cx0 - x0, cy0 - y0);
        this.age = 0;
        this.frames++;
        // keep a short memory of recent grids (readback lag: a reader in time is never judged late)
        const slot = this.recent[this.frames % this.recent.length];
        if (slot.H.length !== this.H.length) slot.H = new Uint8Array(this.H.length);
        slot.H.set(this.H);
        slot.t = performance.now();
        for (const f of this.listeners) f(this.H);
      })
      .catch(() => {
        /* context lost / target resized: the next read tries again */
      })
      .finally(() => (this.inFlight = false));
  }

  /** 2×2 pool, on when ≥ 2 of 4 pixels are shadow (matches fill-core's pool2) */
  private pool(buf: Uint8Array, cw: number, ch: number, ox: number, oy: number): void {
    const { w, h } = this.st;
    const H = this.H;
    H.fill(0);
    let n = 0;
    for (let y = 0; y < h; y++) {
      const py = 2 * y - oy;
      if (py < 0 || py + 1 >= ch) continue;
      for (let x = 0; x < w; x++) {
        const px = 2 * x - ox;
        if (px < 0 || px + 1 >= cw) continue;
        const i = (py * cw + px) * 4;
        const j = i + cw * 4;
        const s = (buf[i] > 127 ? 1 : 0) + (buf[i + 4] > 127 ? 1 : 0) + (buf[j] > 127 ? 1 : 0) + (buf[j + 4] > 127 ? 1 : 0);
        if (s >= 2) {
          H[y * w + x] = 1;
          n++;
        }
      }
    }
    this.count = n;
  }
}
