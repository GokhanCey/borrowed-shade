import { FILL, type Area, type FillSpec, type Stage } from './fill-core.js';
import { PLATES, type PlateData } from './silhouettes-data.js';

/** the visible stage of the paper screen (board-local metres): under the caption ribbon */
export const STAGE_X0 = -0.23;
export const STAGE_X1 = 0.23;
export const STAGE_Y0 = 0;
export const STAGE_Y1 = 0.25;

/** the stage grid (2.656 mm cells) */
export function stageGrid(): Stage {
  const mm = FILL.cellMm / 1000;
  return { w: Math.round((STAGE_X1 - STAGE_X0) / mm), h: Math.round((STAGE_Y1 - STAGE_Y0) / mm) };
}

/** a plate placed on the screen: its base centre in board metres */
export interface Placed {
  id: string;
  data: PlateData;
  /** base centre, board-local metres */
  bx: number;
  by: number;
}

/** place a plate so that its box is centred on board point (cx, cy) */
export function placeCentred(id: string, cx: number, cy: number): Placed {
  const data = PLATES[id];
  if (!data) throw new Error(`no plate ${id}`);
  return { id, data, bx: cx, by: cy - data.h / 2000 };
}

/** stage mm of a plate point (plate mm, base centre origin) */
export function toStage(p: Placed, x: number, y: number): [number, number] {
  return [(p.bx - STAGE_X0) * 1000 + x, (p.by - STAGE_Y0) * 1000 + y];
}

/** even-odd point in rings */
function inRings(rings: [number, number][][], x: number, y: number): boolean {
  let inside = false;
  for (const P of rings) {
    for (let i = 0, j = P.length - 1; i < P.length; j = i++) {
      if (P[i][1] > y !== P[j][1] > y && x < ((P[j][0] - P[i][0]) * (y - P[i][1])) / (P[j][1] - P[i][1]) + P[i][0]) inside = !inside;
    }
  }
  return inside;
}

function bounds(rings: [number, number][][]): [number, number, number, number] {
  let a = Infinity;
  let b = Infinity;
  let c = -Infinity;
  let d = -Infinity;
  for (const r of rings) for (const [x, y] of r) {
    a = Math.min(a, x);
    b = Math.min(b, y);
    c = Math.max(c, x);
    d = Math.max(d, y);
  }
  return [a, b, c, d];
}

/** rasterise plate rings into a stage grid (cell centres) */
export function rasterPlate(st: Stage, p: Placed, rings: [number, number][][], out: Uint8Array = new Uint8Array(st.w * st.h)): Uint8Array {
  if (!rings.length) return out;
  const c = FILL.cellMm;
  const [a, b, cc, d] = bounds(rings);
  const [sx, sy] = toStage(p, 0, 0);
  const x0 = Math.max(0, Math.floor((sx + a) / c) - 1);
  const x1 = Math.min(st.w - 1, Math.ceil((sx + cc) / c) + 1);
  const y0 = Math.max(0, Math.floor((sy + b) / c) - 1);
  const y1 = Math.min(st.h - 1, Math.ceil((sy + d) / c) + 1);
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    if (inRings(rings, (x + 0.5) * c - sx, (y + 0.5) * c - sy)) out[y * st.w + x] = 1;
  }
  return out;
}

/** the scorer's spec for a placed plate */
export function fillSpec(st: Stage, p: Placed, pass: number): FillSpec {
  const d = p.data;
  const [sx, sy] = toStage(p, 0, 0);
  const free = rasterPlate(st, p, d.art);
  rasterPlate(st, p, d.free, free);
  const keys = d.keys.map((k) => ({ name: k.name, area: { kind: 'disc', x: sx + k.x, y: sy + k.y, r: k.r } as Area }));
  const clear = d.clear.map((r) => ({ kind: 'poly', pts: r.map(([x, y]) => [sx + x, sy + y]) }) as Area);
  const wrist = d.wrist.map(([a, b, c, e]) => ({ kind: 'rect', x0: sx + a, y0: sy + b, x1: sx + c, y1: sy + e }) as Area);
  return {
    id: p.id,
    shape: [],
    raster: rasterPlate(st, p, d.shape),
    free,
    keys,
    clear,
    // no authored band (the wall): nothing is don't-care
    wrist: wrist.length ? wrist : [{ kind: 'rect', x0: -9, y0: -9, x1: -8, y1: -8 }],
    pass,
  };
}

