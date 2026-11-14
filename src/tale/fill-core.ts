/**
 * silhouette-fill score (prototype, pure, worker-safe, no imports).
 *
 * Everything works on ONE "stage grid": the visible shadow area of the paper screen,
 * read back from the hand beam at half resolution (2 beam px = 2.656 mm per cell),
 * y up, index = y * w + x. Areas (silhouettes, regions, strips) are given in stage
 * millimetres (x from the screen's left edge, y from its bottom edge).
 *
 *  C  = weighted coverage of the silhouette by the shadow (dilated by `nearMm`)
 *  σ  = weighted spill: shadow beyond the silhouette + margin, wrists ignored
 *  score = ramp(C; cZero..cFull) × ramp(1 − σ; sZero..sFree), capped by key parts
 *  best of a small shift search (± shiftMm), no scale, no rotation.
 */

export const FILL = {
  /** stage cell size: 2 beam px (0.68 m / 512 px × 2) */
  cellMm: 2.656,
  /** a silhouette cell counts as covered if shadow is within this (closes finger gaps, near misses) */
  nearMm: 3,
  /** inner band along the silhouette's edge that counts only edgeW (real hands round the corners) */
  edgeMm: 4,
  edgeW: 0.35,
  /** spill margin: free up to spillFreeMm outside the edge, full weight from spillFullMm */
  spillFreeMm: 4,
  spillFullMm: 8,
  /** "keep clear" zones (the notch between the ears): spill weighs this much, no free margin */
  clearW: 3,
  /** clear zones forgive this much (real finger edges jitter ~3 mm on Quest 2) */
  clearFreeMm: 2,
  /** NARROW concavities (inside the convex hull, outside the silhouette, and thinner than notchWideMm:
   *  the V between the ears, between legs): a tight margin and triple weight, because filling them
   *  erases the shape's character (a blob). Wide concavities (under a wing) are ordinary spill. */
  notchFreeMm: 2.5,
  notchFullMm: 6,
  notchW: 3,
  notchWideMm: 8,
  /** shadow touching the window border stands for unseen spill: each border cell counts this */
  borderW: 3,
  /** coverage term: 0 at cZero, full at cFull (linear between) */
  cZero: 0.35,
  cFull: 0.9,
  /** spill term: full up to sFree, 0 at sZero */
  sFree: 0.12,
  sZero: 0.6,
  /** a key part needs this fraction covered, else the score is capped at keyCap × the plate's pass mark
   *  (always under the pass, whatever the tier: a fist without ears never passes the rabbit) */
  keyNeed: 0.5,
  keyCap: 0.88,
  /** alignment freedom: the silhouette may slide this far to meet the shadow */
  shiftMm: 8,
  /** tiny preference for the unshifted fit (per cell of shift) */
  shiftCost: 0.004,
  /** window margin around the silhouette, mm */
  windowMm: 30,
  /** the shadow is "present" when its area in the window reaches this × silhouette area */
  presentFrac: 0.2,
  /** pass mark (shown as 75 %), stay mark while holding */
  pass: 0.75,
  stay: 0.68,
  /** seconds held above the mark to succeed; decay rate below it; tracking-loss grace */
  holdS: 0.6,
  decay: 1.5,
  graceS: 0.35,
  /** display smoothing per result */
  ema: 0.5,
};

export type Area =
  | { kind: 'disc'; x: number; y: number; r: number }
  | { kind: 'rect'; x0: number; y0: number; x1: number; y1: number }
  | { kind: 'capsule'; x0: number; y0: number; x1: number; y1: number; r: number }
  | { kind: 'ellipse'; x: number; y: number; rx: number; ry: number; rot?: number }
  | { kind: 'poly'; pts: [number, number][] };

export interface Stage {
  w: number;
  h: number;
}

/** is a stage-mm point inside an area */
export function inArea(a: Area, x: number, y: number): boolean {
  switch (a.kind) {
    case 'disc':
      return (x - a.x) ** 2 + (y - a.y) ** 2 <= a.r * a.r;
    case 'rect':
      return x >= a.x0 && x <= a.x1 && y >= a.y0 && y <= a.y1;
    case 'capsule': {
      const dx = a.x1 - a.x0;
      const dy = a.y1 - a.y0;
      const L = dx * dx + dy * dy || 1e-9;
      const t = Math.max(0, Math.min(1, ((x - a.x0) * dx + (y - a.y0) * dy) / L));
      return (x - a.x0 - t * dx) ** 2 + (y - a.y0 - t * dy) ** 2 <= a.r * a.r;
    }
    case 'ellipse': {
      const c = Math.cos(-(a.rot ?? 0));
      const s = Math.sin(-(a.rot ?? 0));
      const u = (x - a.x) * c - (y - a.y) * s;
      const v = (x - a.x) * s + (y - a.y) * c;
      return (u / a.rx) ** 2 + (v / a.ry) ** 2 <= 1;
    }
    case 'poly': {
      let inside = false;
      const P = a.pts;
      for (let i = 0, j = P.length - 1; i < P.length; j = i++) {
        if (P[i][1] > y !== P[j][1] > y && x < ((P[j][0] - P[i][0]) * (y - P[i][1])) / (P[j][1] - P[i][1]) + P[i][0]) inside = !inside;
      }
      return inside;
    }
  }
}

/** rasterise areas (union) into a stage grid (cell centres) */
export function rasterAreas(st: Stage, areas: Area[], out = new Uint8Array(st.w * st.h)): Uint8Array {
  const c = FILL.cellMm;
  for (let y = 0; y < st.h; y++) for (let x = 0; x < st.w; x++) {
    const mx = (x + 0.5) * c;
    const my = (y + 0.5) * c;
    for (const a of areas) if (inArea(a, mx, my)) {
      out[y * st.w + x] = 1;
      break;
    }
  }
  return out;
}

/** 2×2 pool of a full-res beam crop into stage cells: on when ≥ 2 of 4 (the GPU pass does the same) */
export function pool2(src: Uint8Array, w: number, h: number): Uint8Array {
  const W = w >> 1;
  const H = h >> 1;
  const out = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = 2 * y * w + 2 * x;
    out[y * W + x] = src[i] + src[i + 1] + src[i + w] + src[i + w + 1] >= 2 ? 1 : 0;
  }
  return out;
}

const INF = 60000;
/** chamfer 3-4 distance (×3 per cell) to the nearest set cell, rectangular grid */
export function chamfer(m: Uint8Array, w: number, h: number, out = new Uint16Array(w * h)): Uint16Array {
  for (let i = 0; i < w * h; i++) out[i] = m[i] ? 0 : INF;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x;
    let v = out[i];
    if (x > 0 && out[i - 1] + 3 < v) v = out[i - 1] + 3;
    if (y > 0) {
      if (out[i - w] + 3 < v) v = out[i - w] + 3;
      if (x > 0 && out[i - w - 1] + 4 < v) v = out[i - w - 1] + 4;
      if (x < w - 1 && out[i - w + 1] + 4 < v) v = out[i - w + 1] + 4;
    }
    out[i] = v;
  }
  for (let y = h - 1; y >= 0; y--) for (let x = w - 1; x >= 0; x--) {
    const i = y * w + x;
    let v = out[i];
    if (x < w - 1 && out[i + 1] + 3 < v) v = out[i + 1] + 3;
    if (y < h - 1) {
      if (out[i + w] + 3 < v) v = out[i + w] + 3;
      if (x < w - 1 && out[i + w + 1] + 4 < v) v = out[i + w + 1] + 4;
      if (x > 0 && out[i + w - 1] + 4 < v) v = out[i + w - 1] + 4;
    }
    out[i] = v;
  }
  return out;
}

// ---------------------------------------------------------------- silhouette template

/** raster of the convex hull of a mask's cell centres */
export function hullMask(S: Uint8Array, w: number, h: number): Uint8Array {
  const P: [number, number][] = [];
  for (let y = 0; y < h; y++) {
    let a = -1;
    let b = -1;
    for (let x = 0; x < w; x++) if (S[y * w + x]) {
      if (a < 0) a = x;
      b = x;
    }
    if (a >= 0) P.push([a, y], [b, y]);
  }
  const out = new Uint8Array(w * h);
  if (P.length < 3) return out;
  P.sort((p, q) => p[0] - q[0] || p[1] - q[1]);
  const cross = (o: number[], a: number[], b: number[]) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo: number[][] = [];
  for (const p of P) {
    while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop();
    lo.push(p);
  }
  const up: number[][] = [];
  for (let i = P.length - 1; i >= 0; i--) {
    while (up.length >= 2 && cross(up[up.length - 2], up[up.length - 1], P[i]) <= 0) up.pop();
    up.push(P[i]);
  }
  const Hh = lo.slice(0, -1).concat(up.slice(0, -1));
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let inside = true;
    for (let i = 0; i < Hh.length && inside; i++) if (cross(Hh[i], Hh[(i + 1) % Hh.length], [x, y]) < -1e-9) inside = false;
    if (inside) out[y * w + x] = 1;
  }
  return out;
}

export interface FillSpec {
  id: string;
  /** the silhouette, as areas (production: the SVG path rasterised into the stage grid) */
  shape: Area[];
  /** don't-care band(s) where the wrists enter; default: below the silhouette's bottom + 10 mm */
  wrist?: Area[];
  /** must-cover parts (ears, beak tip) */
  keys?: { name: string; area: Area; need?: number }[];
  /** must-stay-light notches (between the ears) */
  clear?: Area[];
  /** named parts for hints; default: compass sectors */
  parts?: { name: string; area: Area }[];
  pass?: number;
  /** a prebuilt stage raster of the silhouette (overrides `shape`) */
  raster?: Uint8Array;
  /** stage raster of plate cells that never count (eyes, windows, thin legs): weight 0 both ways */
  free?: Uint8Array;
}

export interface FillTemplate {
  id: string;
  st: Stage;
  /** window origin and size in stage cells */
  ox: number;
  oy: number;
  w: number;
  h: number;
  S: Uint8Array;
  wCov: Float32Array;
  sumCov: number;
  wSpill: Float32Array;
  wrist: Uint8Array;
  areaS: number;
  cx: number;
  cy: number;
  keys: { name: string; cells: Int32Array; need: number }[];
  parts: { name: string; cells: Int32Array; weight: number }[];
  /** silhouette cells (local index) with their coverage weight, for the list-based search */
  sCells: Int32Array;
  shift: number;
  pass: number;
  stay: number;
}

const SECTORS = ['right', 'top right', 'top', 'top left', 'left', 'bottom left', 'bottom', 'bottom right'];

export function buildFill(spec: FillSpec, st: Stage): FillTemplate {
  const c = FILL.cellMm;
  const full = spec.raster ?? rasterAreas(st, spec.shape);
  let x0 = st.w;
  let y0 = st.h;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < st.h; y++) for (let x = 0; x < st.w; x++) if (full[y * st.w + x]) {
    x0 = Math.min(x0, x);
    y0 = Math.min(y0, y);
    x1 = Math.max(x1, x);
    y1 = Math.max(y1, y);
  }
  const m = Math.ceil(FILL.windowMm / c);
  const ox = Math.max(0, x0 - m);
  const oy = Math.max(0, y0 - m);
  const w = Math.min(st.w, x1 + m + 1) - ox;
  const h = Math.min(st.h, y1 + m + 1) - oy;
  const S = new Uint8Array(w * h);
  let areaS = 0;
  let sx = 0;
  let sy = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (full[(y + oy) * st.w + x + ox]) {
    S[y * w + x] = 1;
    areaS++;
    sx += x;
    sy += y;
  }
  const cx = sx / areaS;
  const cy = sy / areaS;
  // distances: outside -> silhouette, inside -> background
  const dOut = chamfer(S, w, h);
  const bg = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) bg[i] = S[i] ? 0 : 1;
  const dIn = chamfer(bg, w, h);
  const mmAt = (x: number, y: number): [number, number] => [(x + ox + 0.5) * c, (y + oy + 0.5) * c];
  // default wrist band: under the silhouette's foot (its lowest 15 mm), 15 mm wider each side, up to 10 mm above the foot
  let fa = st.w;
  let fb = -1;
  for (let y = y0; y <= Math.min(y1, y0 + Math.round(15 / c)); y++) for (let x = x0; x <= x1; x++) if (full[y * st.w + x]) {
    fa = Math.min(fa, x);
    fb = Math.max(fb, x);
  }
  const wristAreas: Area[] = spec.wrist ?? [{ kind: 'rect', x0: fa * c - 15, y0: -1, x1: (fb + 1) * c + 15, y1: y0 * c + 10 }];
  const wrist = new Uint8Array(w * h);
  const wCov = new Float32Array(w * h);
  const wSpill = new Float32Array(w * h);
  let sumCov = 0;
  const edge = (3 * FILL.edgeMm) / c;
  const free = (3 * FILL.spillFreeMm) / c;
  const fullD = (3 * FILL.spillFullMm) / c;
  const nFree = (3 * FILL.notchFreeMm) / c;
  const nFull = (3 * FILL.notchFullMm) / c;
  const hull = hullMask(S, w, h);
  // narrow notches = (hull − S) minus its opening by a disc of radius notchWideMm
  const N = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) N[i] = hull[i] && !S[i] ? 1 : 0;
  const notN = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) notN[i] = N[i] ? 0 : 1;
  const rN = (3 * FILL.notchWideMm) / c;
  const dNotN = chamfer(notN, w, h);
  const core = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) core[i] = N[i] && dNotN[i] > rN ? 1 : 0;
  const dCore = chamfer(core, w, h);
  const narrow = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) narrow[i] = N[i] && dCore[i] > rN ? 1 : 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x;
    const [mx, my] = mmAt(x, y);
    if (wristAreas.some((a) => inArea(a, mx, my))) wrist[i] = 1;
    if (S[i]) {
      wCov[i] = spec.free?.[(y + oy) * st.w + x + ox] ? 0 : dIn[i] <= edge ? FILL.edgeW : 1;
      sumCov += wCov[i];
    } else if (!wrist[i]) {
      if (spec.clear?.some((a) => inArea(a, mx, my))) wSpill[i] = FILL.clearW * Math.max(0, Math.min(1, (dOut[i] - (3 * FILL.clearFreeMm) / c) / ((3 * FILL.clearFreeMm) / c)));
      else if (narrow[i]) wSpill[i] = FILL.notchW * Math.max(0, Math.min(1, (dOut[i] - nFree) / (nFull - nFree)));
      else wSpill[i] = Math.max(0, Math.min(1, (dOut[i] - free) / (fullD - free)));
    }
  }
  const cellsIn = (a: Area) => {
    const out: number[] = [];
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (S[y * w + x]) {
      const [mx, my] = mmAt(x, y);
      if (inArea(a, mx, my)) out.push(y * w + x);
    }
    return Int32Array.from(out);
  };
  const keys = (spec.keys ?? []).map((k) => ({ name: k.name, cells: cellsIn(k.area), need: k.need ?? FILL.keyNeed }));
  let parts: FillTemplate['parts'];
  if (spec.parts) parts = spec.parts.map((p) => ({ name: p.name, cells: cellsIn(p.area), weight: 0 }));
  else {
    // compass sectors of the outer silhouette (cells farther than 35 % of the mean radius)
    const lists: number[][] = SECTORS.map(() => []);
    let rMean = 0;
    for (let i = 0; i < w * h; i++) if (S[i]) rMean += Math.hypot((i % w) - cx, Math.floor(i / w) - cy);
    rMean /= areaS;
    for (let i = 0; i < w * h; i++) if (S[i]) {
      const dx = (i % w) - cx;
      const dy = Math.floor(i / w) - cy;
      if (Math.hypot(dx, dy) < 0.35 * rMean) continue;
      lists[((Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) % 8) + 8) % 8].push(i);
    }
    parts = lists.map((l, k) => ({ name: SECTORS[k], cells: Int32Array.from(l), weight: 0 }));
  }
  for (const p of parts) for (const i of p.cells) p.weight += wCov[i];
  const pass = spec.pass ?? FILL.pass;
  const sl: number[] = [];
  for (let i = 0; i < w * h; i++) if (S[i]) sl.push(i);
  return { id: spec.id, st, ox, oy, w, h, S, wCov, sumCov, wSpill, wrist, areaS, cx, cy, keys, parts, sCells: Int32Array.from(sl), shift: Math.round(FILL.shiftMm / c), pass, stay: pass - (FILL.pass - FILL.stay) };
}

// ---------------------------------------------------------------- scoring

export interface FillResult {
  present: boolean;
  /** 0..1, the pass mark is tpl.pass */
  score: number;
  /** what the reader sees: 75 at the pass mark */
  pct: number;
  coverage: number;
  spill: number;
  /** best shift, mm (silhouette moved to meet the shadow) */
  dx: number;
  dy: number;
  keys: { name: string; covered: number; ok: boolean }[];
  hint: { kind: 'none' | 'hands' | 'key' | 'missing' | 'spill' | 'move'; part?: string; dir?: string };
  /** for the glow overlay: window cells missing shadow / spilling (at the best shift) */
  missing?: Uint8Array;
  spilling?: Uint8Array;
  /** shift positions evaluated */
  evals?: number;
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
export const covTerm = (C: number) => clamp01((C - FILL.cZero) / (FILL.cFull - FILL.cZero));
export const spillTerm = (sig: number) => clamp01(1 - (sig - FILL.sFree) / (FILL.sZero - FILL.sFree));

const scratch = { Hd: new Uint8Array(0) };

/** dilate by one cell (3×3): "near enough" for coverage */
function dilate1(H: Uint8Array, w: number, h: number, out: Uint8Array): Uint8Array {
  out.fill(0);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (H[y * w + x]) {
    for (let dy = -1; dy <= 1; dy++) {
      const Y = y + dy;
      if (Y < 0 || Y >= h) continue;
      for (let dx = -1; dx <= 1; dx++) {
        const X = x + dx;
        if (X >= 0 && X < w) out[Y * w + X] = 1;
      }
    }
  }
  return out;
}

/** H: the whole stage grid (st.w × st.h, y up). withMaps adds the overlay masks. */
export function scoreFill(H: Uint8Array, t: FillTemplate, withMaps = false): FillResult {
  const { st, w, h, ox, oy } = t;
  const W = st.w;
  if (scratch.Hd.length < W * st.h) scratch.Hd = new Uint8Array(W * st.h);
  const Hd = FILL.nearMm >= FILL.cellMm * 0.75 ? dilate1(H, W, st.h, scratch.Hd) : H;
  const sh = t.shift;
  // the shadow cells that can land in the window at any shift, in window-local coords
  const hx: number[] = [];
  const hy: number[] = [];
  const reach = 2 * sh; // the "move" probe looks twice as far
  for (let Y = Math.max(0, oy - reach); Y < Math.min(st.h, oy + h + reach); Y++) for (let X = Math.max(0, ox - reach); X < Math.min(W, ox + w + reach); X++) if (H[Y * W + X]) {
    hx.push(X - ox);
    hy.push(Y - oy);
  }
  let evals = 0;
  const evalAt = (sx: number, sy: number) => {
    evals++;
    let cov = 0;
    for (const i of t.sCells) {
      const X = (i % w) + ox - sx;
      const Y = ((i / w) | 0) + oy - sy;
      if (X >= 0 && Y >= 0 && X < W && Y < st.h && Hd[Y * W + X]) cov += t.wCov[i];
    }
    let spill = 0;
    let area = 0;
    for (let k = 0; k < hx.length; k++) {
      const x = hx[k] + sx;
      const y = hy[k] + sy;
      if (x < 0 || y < 0 || x >= w || y >= h) continue;
      const i = y * w + x;
      if (t.wrist[i]) continue;
      area++;
      spill += t.wSpill[i];
      if ((x === 0 || y === 0 || x === w - 1 || y === h - 1) && !t.S[i]) spill += FILL.borderW;
    }
    const C = cov / t.sumCov;
    // spill is measured against the SILHOUETTE area: "how much extra shadow", so a bigger blob costs more
    const sig = area ? Math.min(1, spill / t.areaS) : 1;
    const raw = covTerm(C) * spillTerm(sig);
    return { s: raw - FILL.shiftCost * Math.hypot(sx, sy), raw, C, sig, sx, sy, area };
  };
  // coarse (step 2) then refine (±1): 9 + 8 evaluations instead of 49
  let best = evalAt(0, 0);
  const step = Math.max(1, sh - 1);
  for (const sy of [-step, 0, step]) for (const sx of [-step, 0, step]) if (sx || sy) {
    const r = evalAt(sx, sy);
    if (r.s > best.s) best = r;
  }
  const cx0 = best.sx;
  const cy0 = best.sy;
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    const sx = cx0 + dx;
    const sy = cy0 + dy;
    if ((!dx && !dy) || Math.abs(sx) > sh || Math.abs(sy) > sh) continue;
    const r = evalAt(sx, sy);
    if (r.s > best.s) best = r;
  }
  const present = best.area >= FILL.presentFrac * t.areaS;
  const c = FILL.cellMm;
  const empty: FillResult = { present: false, score: 0, pct: 0, coverage: 0, spill: 0, dx: 0, dy: 0, keys: [], hint: { kind: 'hands' } };
  if (!present) return empty;
  const atS = (i: number, sx: number, sy: number) => {
    const X = (i % w) + ox - sx;
    const Y = Math.floor(i / w) + oy - sy;
    return X >= 0 && Y >= 0 && X < W && Y < st.h ? Y * W + X : -1;
  };
  const at = (i: number) => atS(i, best.sx, best.sy);
  const keysAt = (sx: number, sy: number) =>
    t.keys.map((k) => {
      let n = 0;
      for (const i of k.cells) {
        const q = atS(i, sx, sy);
        if (q >= 0 && Hd[q]) n++;
      }
      const covered = k.cells.length ? n / k.cells.length : 1;
      return { name: k.name, covered, ok: covered >= k.need };
    });
  let score = best.raw;
  const keys = keysAt(best.sx, best.sy);
  const missingKey = keys.filter((k) => !k.ok).sort((a, b) => a.covered - b.covered)[0];
  if (missingKey) score = Math.min(score, FILL.keyCap * t.pass);
  // hints
  let hint: FillResult['hint'] = { kind: 'none' };
  const covF = covTerm(best.C);
  const preF = spillTerm(best.sig);
  let probe = false;
  if (score < t.pass && Math.max(Math.abs(best.sx), Math.abs(best.sy)) >= t.shift) {
    // the best fit is at the edge of the freedom: would the shape pass a bit further on? then "move"
    const pr = evalAt(2 * best.sx, 2 * best.sy);
    probe = pr.raw >= t.pass && keysAt(2 * best.sx, 2 * best.sy).every((k) => k.ok);
  }
  if (probe) {
    hint = { kind: 'move', dir: SECTORS[((Math.round(Math.atan2(best.sy, best.sx) / (Math.PI / 4)) % 8) + 8) % 8] };
  } else if (missingKey) hint = { kind: 'key', part: missingKey.name };
  else if (score < t.pass && covF <= preF) {
    let worst = '';
    let worstMiss = 0;
    for (const p of t.parts) {
      let miss = 0;
      for (const i of p.cells) {
        const q = at(i);
        if (q < 0 || !Hd[q]) miss += t.wCov[i];
      }
      if (miss > worstMiss) {
        worstMiss = miss;
        worst = p.name;
      }
    }
    hint = { kind: 'missing', part: worst };
  } else if (score < t.pass) {
    // where the spill is: its weighted centroid against the silhouette's
    let sx = 0;
    let sy = 0;
    let sw = 0;
    for (let i = 0; i < w * h; i++) {
      const q = at(i);
      if (q >= 0 && H[q] && t.wSpill[i]) {
        sx += t.wSpill[i] * (i % w);
        sy += t.wSpill[i] * Math.floor(i / w);
        sw += t.wSpill[i];
      }
    }
    const dx = sx / sw - t.cx;
    const dy = sy / sw - t.cy;
    const dir = Math.hypot(dx, dy) < 4 ? 'all round' : SECTORS[((Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) % 8) + 8) % 8];
    hint = { kind: 'spill', dir };
  }
  const res: FillResult = {
    present,
    score,
    pct: Math.max(0, Math.min(100, Math.round((100 * FILL.pass * score) / t.pass))),
    coverage: best.C,
    spill: best.sig,
    dx: -best.sx * c,
    dy: -best.sy * c,
    keys,
    hint,
    evals,
  };
  if (withMaps) {
    res.missing = new Uint8Array(w * h);
    res.spilling = new Uint8Array(w * h);
    for (let i = 0; i < w * h; i++) {
      const q = at(i);
      const on = q >= 0 && H[q];
      if (t.S[i] && t.wCov[i] === 1 && !(q >= 0 && Hd[q])) res.missing[i] = 1;
      if (on && t.wSpill[i] >= 0.5) res.spilling[i] = 1;
    }
  }
  return res;
}

// ---------------------------------------------------------------- hold and hysteresis

export type HoldState = 'away' | 'trying' | 'holding' | 'done';

/** per-frame: feeds on the latest result (7 Hz) and shapes what the reader sees */
export class FillHold {
  shown = 0;
  hold = 0;
  state: HoldState = 'away';
  private lost = 0;
  private lastRes: FillResult | null = null;
  private pass: number;
  private stay: number;
  constructor(pass = FILL.pass, stay = FILL.stay) {
    this.pass = pass;
    this.stay = stay;
  }
  /** a quiet assist: lower the marks, keep the hold */
  setMarks(pass: number, stay: number): void {
    this.pass = pass;
    this.stay = stay;
  }

  /** call on every new worker result */
  feed(r: FillResult): void {
    this.lastRes = r;
    if (!r.present) return; // update() decays the meter after the grace time
    this.shown = this.shown + FILL.ema * (r.pct - this.shown);
    this.lost = 0;
  }
  /** call every frame; `stale` when no result arrived for 0.5 s (hands lost, worker slow) */
  update(dt: number, stale: boolean): HoldState {
    if (this.state === 'done') return this.state;
    const r = this.lastRes;
    if (stale || !r || !r.present) {
      this.lost += dt;
      if (this.lost < FILL.graceS) return this.state; // tracking flicker: freeze
      this.hold = Math.max(0, this.hold - FILL.decay * dt);
      this.shown *= Math.exp(-3 * dt);
      if (this.hold === 0) this.state = 'away';
      return this.state;
    }
    const mark = this.state === 'holding' ? this.stay : this.pass;
    if (r.score >= mark) {
      this.state = 'holding';
      this.hold += dt;
      if (this.hold >= FILL.holdS) this.state = 'done';
    } else {
      this.hold = Math.max(0, this.hold - FILL.decay * dt);
      if (this.hold === 0) this.state = 'trying';
    }
    return this.state;
  }
}

// ---------------------------------------------------------------- region readbacks

/** fraction of an area covered by shadow (no tolerance: it is a light being blocked) */
export function regionCoverage(H: Uint8Array, st: Stage, region: Uint8Array): number {
  let n = 0;
  let k = 0;
  for (let i = 0; i < st.w * st.h; i++) if (region[i]) {
    n++;
    if (H[i]) k++;
  }
  return n ? k / n : 0;
}

/** on/off with hysteresis and a minimum dwell (cover the sun / uncover it) */
export class RegionSwitch {
  on = false;
  private t = 0;
  private onAt: number;
  private offAt: number;
  private dwell: number;
  constructor(onAt = 0.55, offAt = 0.3, dwell = 0.25) {
    this.onAt = onAt;
    this.offAt = offAt;
    this.dwell = dwell;
  }
  update(frac: number, dt: number): boolean {
    const want = this.on ? frac > this.offAt : frac >= this.onAt;
    if (want !== this.on) {
      this.t += dt;
      if (this.t >= this.dwell) {
        this.on = want;
        this.t = 0;
      }
    } else this.t = 0;
    return this.on;
  }
}

export interface Profile {
  /** per stage column in [x0, x1): top edge of the shadow in mm, or NaN (no ground) */
  top: Float32Array;
  x0: number;
  /** walkable spans [xa, xb] in mm (no gap wider than gapMm, no step taller than stepMm) */
  spans: [number, number][];
}

/**
 * Height profile of the shadow's top edge along a strip, for walking on it.
 * The top is the highest cell in [yLo, yHi] that has `thick` shadow cells under it
 * (a lone speck is not ground). Median of 3 columns, then spans.
 */
export function heightProfile(H: Uint8Array, st: Stage, xLoMm: number, xHiMm: number, yLoMm: number, yHiMm: number, opts: { thick?: number; gapMm?: number; stepMm?: number } = {}): Profile {
  const c = FILL.cellMm;
  const thick = opts.thick ?? 2;
  const x0 = Math.max(0, Math.floor(xLoMm / c));
  const x1 = Math.min(st.w, Math.ceil(xHiMm / c));
  const ya = Math.max(0, Math.floor(yLoMm / c));
  const yb = Math.min(st.h - 1, Math.ceil(yHiMm / c));
  const raw = new Float32Array(x1 - x0).fill(NaN);
  for (let x = x0; x < x1; x++) {
    let run = 0;
    for (let y = ya; y <= yb; y++) {
      // scan upward, remember the last cell that tops a run of ≥ thick
      if (H[y * st.w + x]) {
        run++;
        if (run >= thick) raw[x - x0] = (y + 1) * c;
      } else run = 0;
    }
  }
  const top = new Float32Array(raw.length).fill(NaN);
  for (let i = 0; i < raw.length; i++) {
    const v = [raw[i - 1], raw[i], raw[i + 1]].filter((z) => z !== undefined && !Number.isNaN(z)).sort((a, b) => a - b);
    top[i] = Number.isNaN(raw[i]) ? NaN : v[v.length >> 1];
  }
  const gap = Math.max(1, Math.round((opts.gapMm ?? 8) / c));
  const step = opts.stepMm ?? 12;
  const spans: [number, number][] = [];
  let a = -1;
  let last = -1;
  for (let i = 0; i <= top.length; i++) {
    const v = i < top.length ? top[i] : NaN;
    if (!Number.isNaN(v)) {
      if (a >= 0 && (i - last > gap || Math.abs(v - top[last]) > step)) {
        spans.push([(x0 + a) * c, (x0 + last + 1) * c]);
        a = -1;
      }
      if (a < 0) a = i;
      last = i;
    } else if (a >= 0 && i - last > gap) {
      spans.push([(x0 + a) * c, (x0 + last + 1) * c]);
      a = -1;
    }
  }
  if (a >= 0) spans.push([(x0 + a) * c, (x0 + last + 1) * c]);
  return { top, x0: x0 * c, spans };
}
