import {
  BufferGeometry,
  CanvasTexture,
  Color,
  DoubleSide,
  ExtrudeGeometry,
  Float32BufferAttribute,
  Group,
  Matrix3,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  RepeatWrapping,
  Path,
  Shape,
  ShapeGeometry,
  SRGBColorSpace,
  Vector2,
  Vector3,
  type Material,
  type Object3D,
} from '@iwsdk/core';

/**
 * The paper kit: every piece of the book is a hand-drawn outline (a tiny SVG
 * path dialect, authored in millimetres with y UP and the origin at the base
 * centre) turned into thin cut paper with a fibre texture and inked edges.
 */

/** Parse an SVG-like path (M L H V C Q Z, absolute and relative) into a Shape. mm -> metres. */
export function pathShape(d: string, scale = 0.001): Shape {
  const shape = new Shape();
  const tok = d.match(/[MLHVCQZmlhvcqz]|-?\d*\.?\d+(?:e-?\d+)?/g) ?? [];
  let i = 0;
  let cx = 0;
  let cy = 0;
  let sx = 0;
  let sy = 0;
  let cmd = 'M';
  const num = () => parseFloat(tok[i++]);
  while (i < tok.length) {
    if (/[A-Za-z]/.test(tok[i])) cmd = tok[i++];
    const rel = cmd === cmd.toLowerCase();
    const C = cmd.toUpperCase();
    if (C === 'Z') {
      shape.closePath();
      cx = sx;
      cy = sy;
      continue;
    }
    if (C === 'M' || C === 'L') {
      let x = num();
      let y = num();
      if (rel) {
        x += cx;
        y += cy;
      }
      if (C === 'M') {
        shape.moveTo(x * scale, y * scale);
        sx = x;
        sy = y;
        cmd = rel ? 'l' : 'L'; // subsequent pairs are line-tos
      } else shape.lineTo(x * scale, y * scale);
      cx = x;
      cy = y;
    } else if (C === 'H') {
      cx = rel ? cx + num() : num();
      shape.lineTo(cx * scale, cy * scale);
    } else if (C === 'V') {
      cy = rel ? cy + num() : num();
      shape.lineTo(cx * scale, cy * scale);
    } else if (C === 'C') {
      const p = [num(), num(), num(), num(), num(), num()];
      if (rel) for (let k = 0; k < 6; k += 2) {
        p[k] += cx;
        p[k + 1] += cy;
      }
      shape.bezierCurveTo(p[0] * scale, p[1] * scale, p[2] * scale, p[3] * scale, p[4] * scale, p[5] * scale);
      cx = p[4];
      cy = p[5];
    } else if (C === 'Q') {
      const p = [num(), num(), num(), num()];
      if (rel) for (let k = 0; k < 4; k += 2) {
        p[k] += cx;
        p[k + 1] += cy;
      }
      shape.quadraticCurveTo(p[0] * scale, p[1] * scale, p[2] * scale, p[3] * scale);
      cx = p[2];
      cy = p[3];
    } else {
      i++; // unknown token: skip
    }
  }
  return shape;
}

/** The outline points of a path (mm), placed: scaled, flipped in x, moved to (x, y) mm. */
export function placedPoints(d: string, x: number, y: number, scale = 1, flip = 1, divisions = 10): Vector2[] {
  return pathShape(d, 1).getPoints(divisions).map((p) => new Vector2(x + p.x * scale * flip, y + p.y * scale));
}

/** A shape with holes: the outline `d` (mm) and hole outlines given as point lists (mm). mm -> metres. */
export function cutShape(d: string, holes: Vector2[][], scale = 0.001): Shape {
  const shape = pathShape(d, scale);
  for (const h of holes) {
    const path = new Path(h.map((p) => new Vector2(p.x * scale, p.y * scale)));
    path.closePath();
    shape.holes.push(path);
  }
  return shape;
}

/** Points along a shape's outline (for dashed ghost outlines and hit tests). */
export function outline(shape: Shape, divisions = 64): Vector2[] {
  return shape.getSpacedPoints(divisions);
}

// ---- paper texture -------------------------------------------------------------

let paperTex: CanvasTexture | undefined;
/** A shared tiling paper-fibre texture (grey; tinted by material colour). */
export function paperTexture(): CanvasTexture {
  if (paperTex) return paperTex;
  const N = 256;
  const c = document.createElement('canvas');
  c.width = c.height = N;
  const g = c.getContext('2d')!;
  g.fillStyle = '#ececec';
  g.fillRect(0, 0, N, N);
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  // mottling
  for (let k = 0; k < 900; k++) {
    const v = 220 + Math.floor(rnd() * 35);
    g.fillStyle = `rgba(${v},${v},${v},0.25)`;
    const r = 2 + rnd() * 9;
    g.beginPath();
    g.arc(rnd() * N, rnd() * N, r, 0, Math.PI * 2);
    g.fill();
  }
  // fibres (wrapped so the texture tiles)
  g.lineWidth = 0.7;
  for (let k = 0; k < 420; k++) {
    const x = rnd() * N;
    const y = rnd() * N;
    const a = rnd() * Math.PI;
    const l = 4 + rnd() * 14;
    const v = rnd() < 0.5 ? 200 : 255;
    g.strokeStyle = `rgba(${v},${v},${v},${0.18 + rnd() * 0.25})`;
    for (const ox of [-N, 0, N]) for (const oy of [-N, 0, N]) {
      g.beginPath();
      g.moveTo(x + ox, y + oy);
      g.lineTo(x + ox + Math.cos(a) * l, y + oy + Math.sin(a) * l);
      g.stroke();
    }
  }
  paperTex = new CanvasTexture(c);
  paperTex.wrapS = paperTex.wrapT = RepeatWrapping;
  paperTex.colorSpace = SRGBColorSpace;
  paperTex.repeat.set(9, 9); // UVs are in metres: one tile every ~11 cm
  return paperTex;
}

// ---- materials -------------------------------------------------------------------

const matCache = new Map<string, MeshStandardMaterial>();
/** A matte paper material in a colour (cached). */
export function paper(color: string, opts: { emissive?: string; emissiveIntensity?: number; side?: 'double' } = {}): MeshStandardMaterial {
  const key = `${color}|${opts.emissive ?? ''}|${opts.emissiveIntensity ?? 0}|${opts.side ?? ''}`;
  let m = matCache.get(key);
  if (!m) {
    m = new MeshStandardMaterial({
      color: new Color(color),
      map: paperTexture(),
      roughness: 0.94,
      metalness: 0,
      emissive: new Color(opts.emissive ?? '#000000'),
      emissiveIntensity: opts.emissiveIntensity ?? 0,
      side: opts.side === 'double' ? DoubleSide : undefined,
    });
    matCache.set(key, m);
  }
  return m;
}

/** Ink colour used for cut edges and shadows. */
export const INK = '#1b1424';

// ---- cutouts ---------------------------------------------------------------------

export interface CutoutOptions {
  /** face colour */
  color?: string;
  /** paper thickness (m) */
  depth?: number;
  /** colour of the cut edge */
  edge?: string;
  emissive?: string;
  emissiveIntensity?: number;
  name?: string;
}

/**
 * A standing paper cut-out from a path. The face points +Z; the piece stands on
 * its base line (y = 0). Edges are inked so silhouettes read from any angle.
 */
export function cutout(d: string | Shape, o: CutoutOptions = {}): Mesh {
  const shape = typeof d === 'string' ? pathShape(d) : d;
  const depth = o.depth ?? 0.0016;
  const geo = new ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 10 });
  geo.translate(0, 0, -depth / 2);
  const face = paper(o.color ?? '#efe3c8', { emissive: o.emissive, emissiveIntensity: o.emissiveIntensity });
  const edge = paper(o.edge ?? INK);
  const mesh = new Mesh(geo, [face, edge] as Material[]);
  mesh.name = o.name ?? 'Cutout';
  return mesh;
}

/** A flat (zero-thickness) shape, e.g. glowing windows laid on a facade. */
export function flat(d: string | Shape, material: Material, name = 'Flat'): Mesh {
  const shape = typeof d === 'string' ? pathShape(d) : d;
  const m = new Mesh(new ShapeGeometry(shape, 10), material);
  m.name = name;
  return m;
}

/** Rectangle path helper (mm): x0..x1, y0..y1. */
export const rect = (x0: number, y0: number, x1: number, y1: number) => `M ${x0} ${y0} L ${x1} ${y0} L ${x1} ${y1} L ${x0} ${y1} Z`;

/**
 * A pop-up layer: a group hinged at its base line on the page. `rise` (0..1)
 * stands it up from lying flat on the page (0) to upright (1).
 */
export class PopLayer {
  readonly hinge = new Group();
  constructor(readonly content: Group | Mesh, readonly z: number, readonly delay = 0) {
    this.hinge.position.z = z;
    this.hinge.add(content);
  }
  set(open: number): void {
    // each layer starts rising a little after the previous one, and overshoots softly
    const t = Math.min(1, Math.max(0, (open - this.delay) / (1 - this.delay)));
    const e = t < 1 ? 1 - Math.pow(1 - t, 3) + Math.sin(t * Math.PI) * 0.06 : 1;
    // closed: lying flat toward the reader (+z), face down; open: upright
    this.hinge.rotation.x = (Math.PI / 2) * (1 - e);
    this.hinge.visible = open > this.delay * 0.6;
  }
}

// ---- static merging (performance) -------------------------------------------------------

let vcMat: MeshStandardMaterial | undefined;
/** One paper material for merged pieces: the colour comes from the vertices. */
export function paperVertexColor(): MeshStandardMaterial {
  if (!vcMat) vcMat = new MeshStandardMaterial({ color: new Color('#ffffff'), vertexColors: true, map: paperTexture(), roughness: 0.94, metalness: 0 });
  return vcMat;
}

/**
 * Merge every static paper mesh under `group` into one vertex-coloured mesh
 * (plus one mesh per glowing material). Objects with userData.keep (and their
 * children) are left alone. Cuts dozens of draw calls to one or two.
 */
export function mergeStatic(group: Group, name: string): Mesh[] {
  group.updateMatrixWorld(true);
  const inv = new Matrix4().copy(group.matrixWorld).invert();
  const plain = { pos: [] as number[], nor: [] as number[], uv: [] as number[], col: [] as number[] };
  const glows = new Map<Material, { pos: number[]; nor: number[]; uv: number[] }>();
  const victims: Mesh[] = [];
  const rel = new Matrix4();
  const nm = new Matrix3();
  const v = new Vector3();
  const c = new Color();
  const visit = (o: Object3D) => {
    if (o.userData.keep) return;
    const m = o as Mesh;
    if (m.isMesh && m.visible) {
      const mats = (Array.isArray(m.material) ? m.material : [m.material]) as MeshStandardMaterial[];
      const geo = (m.geometry.index ? m.geometry.toNonIndexed() : m.geometry) as BufferGeometry;
      rel.multiplyMatrices(inv, m.matrixWorld);
      nm.getNormalMatrix(rel);
      const P = geo.getAttribute('position');
      const N = geo.getAttribute('normal');
      const U = geo.getAttribute('uv');
      const groups = geo.groups.length ? geo.groups : [{ start: 0, count: P.count, materialIndex: 0 }];
      for (const gr of groups) {
        const mat = mats[gr.materialIndex ?? 0] ?? mats[0];
        const glowing = (mat.emissiveIntensity ?? 0) > 0;
        let tgt: { pos: number[]; nor: number[]; uv: number[] } = plain;
        if (glowing) {
          if (!glows.has(mat)) glows.set(mat, { pos: [], nor: [], uv: [] });
          tgt = glows.get(mat)!;
        }
        c.copy(mat.color);
        const end = Math.min(P.count, gr.start + gr.count);
        for (let i = gr.start; i < end; i++) {
          v.fromBufferAttribute(P, i).applyMatrix4(rel);
          tgt.pos.push(v.x, v.y, v.z);
          v.fromBufferAttribute(N, i).applyMatrix3(nm).normalize();
          tgt.nor.push(v.x, v.y, v.z);
          if (U) tgt.uv.push(U.getX(i), U.getY(i));
          else tgt.uv.push(0, 0);
          if (!glowing) plain.col.push(c.r, c.g, c.b);
        }
      }
      victims.push(m);
    }
    for (const ch of [...o.children]) visit(ch);
  };
  for (const ch of [...group.children]) visit(ch);
  for (const m of victims) m.removeFromParent();
  const out: Mesh[] = [];
  const build = (d: { pos: number[]; nor: number[]; uv: number[]; col?: number[] }, mat: Material, n: string) => {
    if (!d.pos.length) return;
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute(d.pos, 3));
    g.setAttribute('normal', new Float32BufferAttribute(d.nor, 3));
    g.setAttribute('uv', new Float32BufferAttribute(d.uv, 2));
    if (d.col) g.setAttribute('color', new Float32BufferAttribute(d.col, 3));
    g.computeBoundingSphere();
    const mesh = new Mesh(g, mat);
    mesh.name = n;
    group.add(mesh);
    out.push(mesh);
  };
  build(plain, paperVertexColor(), `${name} (merged)`);
  let k = 0;
  for (const [mat, d] of glows) build(d, mat, `${name} glow ${k++}`);
  return out;
}

/** A cut-out as ONE draw: its face and edge colours baked into the vertices (same paper, same look; not for glowing faces). */
export function oneDraw(m: Mesh): Mesh {
  const mats = m.material as MeshStandardMaterial[];
  if (!Array.isArray(mats)) return m;
  const geo = (m.geometry.index ? m.geometry.toNonIndexed() : m.geometry) as BufferGeometry;
  const n = geo.getAttribute('position').count;
  const col = new Float32Array(n * 3);
  for (const gr of geo.groups) {
    const c = mats[gr.materialIndex ?? 0].color;
    for (let i = gr.start; i < Math.min(n, gr.start + gr.count); i++) {
      col[i * 3] = c.r;
      col[i * 3 + 1] = c.g;
      col[i * 3 + 2] = c.b;
    }
  }
  geo.setAttribute('color', new Float32BufferAttribute(col, 3));
  geo.clearGroups();
  if (geo !== m.geometry) m.geometry.dispose();
  m.geometry = geo;
  m.material = paperVertexColor();
  return m;
}

/** Free the GPU memory of finished scenes (geometries, and materials that are not shared from the cache). */
export function disposeTree(...roots: Object3D[]): void {
  const shared = new Set<Material>([...matCache.values()]);
  if (vcMat) shared.add(vcMat);
  for (const root of roots) {
    root.traverse((o) => {
      const m = o as Mesh;
      if (!m.isMesh && !(o as unknown as { isLine?: boolean }).isLine) return;
      m.geometry?.dispose();
      const mats = (Array.isArray(m.material) ? m.material : [m.material]) as Material[];
      for (const mat of mats) if (mat && !shared.has(mat)) mat.dispose();
    });
    root.removeFromParent();
  }
}
