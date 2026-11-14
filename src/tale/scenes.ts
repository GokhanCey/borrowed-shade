import { BoxGeometry, Group, Mesh, MeshStandardMaterial, Vector3, type Object3D } from '@iwsdk/core';
import * as A from './art.js';
import * as B from './art2.js';
import { BOOK } from './book.js';
import { cutout, flat, mergeStatic, paper, PopLayer, rect } from './paper.js';

/**
 * A page's pop-up scene: layers standing on the stage page, optional props
 * glued to the shadow screen, and named anchors where actors stand.
 * Book-local coordinates: x right, y up from the table, z toward the reader
 * (0 = the hinge under the screen).
 */
export class Scene {
  readonly root = new Group();
  readonly layers: PopLayer[] = [];
  /** meshes that cast shadows onto the screen (merged layers) */
  readonly casters: Object3D[] = [];
  /** props on the screen (board-local), shown with the scene */
  readonly screenProps = new Group();
  /** where things happen: book-local points (y = page surface) */
  readonly anchors: Record<string, Vector3> = {};
  /** flat pieces lying on the page (shown once the scene has risen) */
  readonly flats: Mesh[] = [];
  /** named props the story animates (stones, lamps, the carved tower) */
  readonly props: Record<string, any> = {}; // eslint-disable-line @typescript-eslint/no-explicit-any
  /** per-frame animation (e.g. water, a turning mill) */
  animate?: (t: number, dt: number) => void;
  rise = 0;

  constructor(readonly id: string) {
    this.root.name = `Scene ${id}`;
    this.screenProps.name = `Screen props ${id}`;
  }

  /** 0 = folded flat, 1 = standing */
  setRise(v: number): void {
    this.rise = v;
    for (const l of this.layers) l.set(v);
    this.screenProps.visible = v > 0.05;
    const k = Math.min(1, v * 1.5);
    for (const f of this.flats) {
      f.visible = v > 0.02 && !f.userData.hidden;
      if (f.userData.sx === undefined) {
        f.userData.sx = f.scale.x;
        f.userData.sy = f.scale.y;
      }
      f.scale.x = f.userData.sx * k;
      f.scale.y = f.userData.sy * k;
    }
    this.screenProps.traverse((o) => {
      const m = (o as Mesh).material as MeshStandardMaterial | undefined;
      if (m && 'opacity' in m && m.userData.fade) m.opacity = m.userData.fade * Math.min(1, v * 1.4);
    });
  }
}

/** Builder helpers shared by every scene. */
export class SceneKit {
  readonly top = BOOK.board + BOOK.pages;
  readonly windows = paper(A.PAL.glass, { emissive: '#ffb347', emissiveIntensity: 0.9 });

  constructor(readonly scene: Scene) {}

  /** a pop-up layer at depth z; caster layers throw shadows on the screen */
  layer(z: number, delay: number, build: (g: Group) => void, caster = false): Group {
    const g = new Group();
    build(g);
    const merged = mergeStatic(g, `${this.scene.id} layer ${this.scene.layers.length}`);
    if (caster) for (const m of merged) this.scene.casters.push(m);
    const l = new PopLayer(g, z, delay);
    l.hinge.position.y = this.top;
    this.scene.layers.push(l);
    this.scene.root.add(l.hinge);
    return g;
  }

  house(kind: string, path: string, color: string, x: number, roof?: string, s = 1): Group {
    const g = new Group();
    g.name = `House ${kind}`;
    g.add(cutout(path, { color, name: `House ${kind}` }));
    if (roof && A.ROOFS[kind]) {
      const r = flat(A.ROOFS[kind], paper(roof), 'Roof');
      r.position.z = 0.001;
      g.add(r);
    }
    for (const [x0, y0, x1, y1] of A.WINDOWS[kind] ?? []) {
      const w = flat(rect(x0, y0, x1, y1), this.windows, 'Window');
      w.position.z = 0.0011;
      g.add(w);
    }
    g.position.x = x;
    g.scale.setScalar(s);
    return g;
  }

  piece(path: string, color: string, x: number, s = 1, opts: { edge?: string; y?: number; flip?: boolean; emissive?: string; ei?: number } = {}): Mesh {
    const m = cutout(path, { color, edge: opts.edge, emissive: opts.emissive, emissiveIntensity: opts.ei });
    m.position.set(x, opts.y ?? 0, 0);
    m.scale.set(opts.flip ? -s : s, s, s);
    return m;
  }

  lamp(g: Group, x: number, lit = true): void {
    g.add(this.piece(A.LAMP_POST, '#2a2433', x));
    const lamp = new Mesh(new BoxGeometry(0.006, 0.008, 0.006), paper(A.PAL.glass, { emissive: '#ffb347', emissiveIntensity: lit ? 1.4 : 0 }));
    lamp.position.set(x, 0.07, 0);
    if (!lit) {
      // kept apart so the story can light it
      lamp.userData.keep = true;
      lamp.name = 'Village lamp';
      ((this.scene.props.lamps ??= []) as Mesh[]).push(lamp);
    }
    g.add(lamp);
  }

  /** something glued on the screen (board-local x from centre, y from the bottom) */
  screenPiece(path: string, color: string, x: number, y: number, s = 1, opts: { emissive?: string; ei?: number } = {}): Mesh {
    const m = flat(path, paper(color, { emissive: opts.emissive, emissiveIntensity: opts.ei }), 'Screen piece');
    m.position.set(x, y, 0.0028);
    m.scale.setScalar(s);
    this.scene.screenProps.add(m);
    return m;
  }

  anchor(name: string, x: number, z: number, dy = 0): void {
    this.scene.anchors[name] = new Vector3(x, this.top + dy, z);
  }

  done(): Scene {
    for (const o of this.scene.casters) o.traverse((c) => c.layers.enable(BOOK.SHADOW_LAYER));
    this.scene.setRise(0);
    return this.scene;
  }
}

/** Page 1: the village at dusk. */
export function villageScene(): Scene {
  const k = new SceneKit(new Scene('village'));
  k.layer(0.025, 0.0, (g) => {
    g.add(k.piece(A.HILLS, A.PAL.hill, 0, 1, { edge: '#20203d' }));
  }, true);
  k.layer(0.06, 0.08, (g) => {
    g.add(k.house('tall', A.HOUSE_TALL, A.PAL.slate, -0.15, '#3f4366'));
    g.add(k.house('tower', A.HOUSE_TOWER, A.PAL.rose, 0.155, '#6b3f3f'));
    for (const [x, s] of [[-0.06, 1.1], [0.05, 0.9], [-0.205, 0.75], [0.205, 0.8]]) g.add(k.piece(A.PINE, '#55705c', x, s, { edge: '#1f2a24' }));
  }, true);
  k.layer(0.105, 0.16, (g) => {
    g.add(k.house('cottage', A.HOUSE_COTTAGE, A.PAL.cream, -0.03, A.PAL.roofA));
    g.add(k.house('wide', A.HOUSE_WIDE, '#c9b48e', 0.135, A.PAL.roofB));
    g.add(k.piece(A.OAK, A.PAL.sage, -0.165, 1, { edge: '#26301f' }));
  }, true);
  k.layer(0.155, 0.24, (g) => {
    for (const [x, path, color] of [[-0.12, A.VILLAGER, '#8a6f8f'], [0.09, A.VILLAGER_HAT, '#6f7f9a'], [0.16, A.VILLAGER, '#9b7a5e']] as const) g.add(k.piece(path, color, x, 1.25));
    k.lamp(g, -0.19, false);
    k.lamp(g, 0.205, false);
  });
  k.layer(0.215, 0.32, (g) => {
    for (const x of [-0.16, 0.16]) g.add(k.piece(A.FENCE, '#7a5a43', x));
  });
  k.anchor('ama', -0.012, 0.16);
  k.anchor('char', 0.033, 0.175);
  return k.done();
}

// ---- flat pieces lying on the page (water, stones) ----------------------------------------

function onPage(k: SceneKit, path: string | null, mat: MeshStandardMaterial, x: number, z: number, w = 1, d = 1, name = 'On page'): Mesh {
  const m = path ? flat(path, mat, name) : new Mesh(new BoxGeometry(w, 0.0006, d), mat);
  if (path) {
    m.rotation.x = -Math.PI / 2;
    m.scale.set(w, d, 1);
  }
  m.position.set(x, k.top + 0.0012, z);
  m.name = name;
  k.scene.root.add(m);
  k.scene.flats.push(m);
  return m;
}

// dark, still water: a soft sheen, never a hot white highlight (that read as a lamp lying in it)
const water = () => new MeshStandardMaterial({ color: '#1d2a44', roughness: 0.62, metalness: 0, emissive: '#0b1630', emissiveIntensity: 0.6 });

/** Page 2: the gate. */
export function gateScene(): Scene {
  const k = new SceneKit(new Scene('gate'));
  k.layer(0.025, 0.0, (g) => {
    g.add(k.piece(A.HILLS, '#343660', 0, 1, { edge: '#1c1c36' }));
  }, true);
  k.layer(0.075, 0.08, (g) => {
    g.add(k.piece(B.WALL, '#8b8174', 0, 1, { edge: '#3a332c' }));
    g.add(k.piece(B.GATE, '#a39684', 0, 1.15, { edge: '#3a332c' }));
    g.add(k.piece(B.KEYSTONE, '#b8aa95', 0, 1.15, { edge: '#3a332c' }));
  }, true);
  // the carved tower on the keystone: a pale glyph that glows when Tomas says "tower"
  const carveMat = paper('#f3e2b8', { emissive: '#ffcf8a', emissiveIntensity: 0.0001 }).clone();
  const carve = flat(B.KEY_TOWER, carveMat, 'Carved tower');
  carve.userData.keep = true;
  carve.scale.setScalar(1.15);
  carve.position.z = 0.0022;
  k.layer(0.075, 0.08, (g) => {
    g.add(carve);
  });
  k.scene.props.carve = carve;
  k.layer(0.14, 0.18, (g) => {
    g.add(k.piece(B.STOOL, '#5a3f2e', 0.1));
    k.lamp(g, -0.11);
    for (const [x, s] of [[-0.03, 1], [0.0, 0.9], [0.03, 1.05]]) g.add(k.piece(B.ROAD_STONE, '#6f665c', x, s));
  });
  k.anchor('tomas', 0.085, 0.15);
  k.anchor('ama', -0.035, 0.175);
  k.anchor('char', 0.03, 0.2);
  k.anchor('perch', 0.055, 0.079, 0.106); // the top of the wall
  return k.done();
}

/** Page 3F: Granny Pell's cottage at the wood's edge (the fox's low road). */
export function cottageScene(): Scene {
  const k = new SceneKit(new Scene('cottage'));
  k.layer(0.025, 0.0, (g) => {
    g.add(k.piece(B.WOODS, '#2f4436', 0, 1, { edge: '#16211a' }));
  }, true);
  k.layer(0.08, 0.1, (g) => {
    g.add(k.piece(B.CROOKED_COTTAGE, '#d8c3a0', -0.07, 1.1, { edge: '#3a2c22' }));
    const roof = flat(B.CROOKED_ROOF, paper('#6e4a3a'), 'Roof');
    roof.position.set(-0.07, 0, 0.001);
    roof.scale.setScalar(1.1);
    g.add(roof);
    const win = flat(rect(-30, 20, -12, 36), k.windows, 'Window');
    win.position.set(-0.07, 0, 0.0011);
    win.scale.setScalar(1.1);
    g.add(win);
    const map = flat(B.MAP, paper('#efd9a8'), 'Map');
    map.position.set(-0.035, 0.012, 0.0012);
    g.add(map);
  }, true);
  k.layer(0.14, 0.2, (g) => {
    for (const [x, s] of [[0.03, 1], [0.06, 0.9], [0.09, 1.1], [0.165, 0.95], [0.195, 1]]) g.add(k.piece(B.CABBAGE, '#7fa36a', x, s, { edge: '#2a3a22' }));
    g.add(k.piece(B.ROCKING_CHAIR, '#5a3f2e', 0.13, 1.1));
  });
  k.anchor('granny', 0.12, 0.165);
  k.anchor('ama', -0.04, 0.18);
  k.anchor('tomas', -0.11, 0.17);
  k.anchor('char', 0.075, 0.185);
  return k.done();
}

/** Page 3O: the drowned meadow (the owl's high road). */
export function meadowScene(): Scene {
  const k = new SceneKit(new Scene('meadow'));
  k.layer(0.025, 0.0, (g) => {
    g.add(k.piece(B.FAR_BANK, '#3a3a64', 0, 1, { edge: '#1c1c36' }));
    for (const x of [0.06, 0.075, 0.09, 0.105]) g.add(k.piece(B.STANDING_STONE, '#55557a', x, 0.6, { y: 0.04 }));
  }, true);
  k.layer(0.07, 0.08, (g) => {
    g.add(k.piece(B.WILLOW, '#5e7a5a', -0.15, 1.15, { edge: '#1f2a1d' }));
  }, true);
  onPage(k, null, water(), 0, 0.17, 0.42, 0.17, 'Flood water');
  k.layer(0.15, 0.18, (g) => {
    g.add(k.piece(B.FENCE_TOPS, '#7a5a43', -0.13, 1));
  });
  k.layer(0.275, 0.26, (g) => {
    g.add(k.piece(A.FENCE, '#7a5a43', -0.15, 0.8));
  });
  k.anchor('ama', -0.11, 0.26);
  k.anchor('tomas', -0.17, 0.265);
  k.anchor('char', -0.04, 0.22);
  k.anchor('far', 0.12, 0.07);
  k.anchor('perch', -0.135, 0.074, 0.085); // the willow's crown
  return k.done();
}

/** Page 4: the river. */
export function riverScene(): Scene {
  const k = new SceneKit(new Scene('river'));
  k.layer(0.025, 0.0, (g) => {
    g.add(k.piece(B.FAR_BANK, '#3b4466', 0, 1, { edge: '#1c1c36' }));
  }, true);
  onPage(k, null, water(), 0, 0.13, 0.42, 0.09, 'River');
  const stones: Mesh[] = [];
  for (const [x, z] of [[-0.075, 0.165], [-0.035, 0.145], [0.005, 0.125], [0.045, 0.105], [0.085, 0.09]]) {
    const edge = onPage(k, B.STEP_STONE, new MeshStandardMaterial({ color: '#0b0d18', transparent: true, opacity: 0 }), x + 0.002, z + 0.004, 1.25, 1.25, 'Stone edge');
    edge.userData.hidden = true; // drawn only once the heron has tapped its stone
    const st = onPage(k, B.STEP_STONE, paper('#8a8378'), x, z, 1.1, 1.1, 'Stepping stone');
    st.position.y += 0.0008;
    st.userData.edge = edge;
    stones.push(st);
  }
  k.scene.props.stones = stones;
  k.layer(0.2, 0.2, (g) => {
    g.add(k.piece(B.REEDS, '#6b7f4a', -0.18, 1, { edge: '#26301f' }));
    g.add(k.piece(B.REEDS, '#6b7f4a', 0.17, 0.9, { edge: '#26301f' }));
  });
  k.anchor('tomas', -0.13, 0.23);
  k.anchor('ama', -0.085, 0.235);
  k.anchor('char', -0.105, 0.195);
  k.anchor('bank', 0.115, 0.065); // the far bank
  k.anchor('near', -0.095, 0.195);
  return k.done();
}

/** Pages 5 and 6: the hill with its ring of stones (6 adds the little village below). */
export function hillScene(withVillage = false): Scene {
  const k = new SceneKit(new Scene(withVillage ? 'hill-village' : 'hill'));
  k.layer(0.03, 0.0, (g) => {
    g.add(k.piece(B.BIG_HILL, '#3f4470', 0, 1, { edge: '#1c1c36' }));
    for (const [x, s] of [[-0.035, 0.9], [-0.018, 1], [0.018, 1], [0.035, 0.9]]) g.add(k.piece(B.STANDING_STONE, '#6a6a8e', x, s, { y: 0.1 }));
    for (const [x, y] of [[-0.12, 0.042], [-0.09, 0.062], [-0.065, 0.078]]) g.add(k.piece(B.HILL_STEPS, '#8a8378', x, 1, { y }));
  }, true);
  if (withVillage) {
    const lamps: Mesh[] = [];
    k.layer(0.235, 0.2, (g) => {
      g.add(k.piece(B.VILLAGE_ROW, '#2e2a40', 0, 1, { edge: '#141220' }));
      for (const x of [-0.17, -0.125, -0.08, -0.034, 0.01, 0.058, 0.11, 0.156]) {
        const l = new Mesh(new BoxGeometry(0.007, 0.006, 0.002), new MeshStandardMaterial({ color: '#3a3328', emissive: '#ffb347', emissiveIntensity: 0 }));
        l.position.set(x, 0.011, 0.002);
        l.userData.keep = true;
        l.name = 'Village lamp';
        g.add(l);
        lamps.push(l);
      }
    });
    k.scene.props.lamps = lamps;
  }
  k.anchor('ring', 0, 0.034, 0.105);
  k.anchor('ama', -0.075, withVillage ? 0.19 : 0.2);
  k.anchor('tomas', -0.135, withVillage ? 0.2 : 0.21);
  k.anchor('char', 0, 0.06);
  return k.done();
}

/** Page 7: the village at night, every lamp lit, and the little room for borrowed shades. */
export function epilogueScene(): Scene {
  const k = new SceneKit(new Scene('epilogue'));
  k.layer(0.025, 0.0, (g) => {
    g.add(k.piece(A.HILLS, A.PAL.hill, 0, 1, { edge: '#20203d' }));
  }, true);
  k.layer(0.06, 0.08, (g) => {
    g.add(k.house('tall', A.HOUSE_TALL, A.PAL.slate, -0.16, '#3f4366'));
    g.add(k.house('tower', A.HOUSE_TOWER, A.PAL.rose, 0.16, '#6b3f3f'));
    for (const [x, s] of [[-0.07, 1.1], [0.06, 0.9]]) g.add(k.piece(A.PINE, '#55705c', x, s, { edge: '#1f2a24' }));
  }, true);
  k.layer(0.11, 0.16, (g) => {
    g.add(k.house('cottage', A.HOUSE_COTTAGE, A.PAL.cream, -0.06, A.PAL.roofA));
    g.add(k.piece(B.ROOM, '#e8d3b0', 0.11, 1, { edge: '#3a2c22' }));
    const door = flat(B.ROOM_DOOR, paper(A.PAL.glass, { emissive: '#ffb347', emissiveIntensity: 1.1 }), 'Open door');
    door.position.set(0.11, 0, 0.0012);
    g.add(door);
  }, true);
  k.layer(0.16, 0.24, (g) => {
    for (const [x, path, color] of [[-0.15, A.VILLAGER, '#8a6f8f'], [0.02, A.VILLAGER_HAT, '#6f7f9a'], [0.115, A.VILLAGER, '#9b7a5e']] as const) g.add(k.piece(path, color, x, 1.25));
    k.lamp(g, -0.19);
    k.lamp(g, -0.02);
    k.lamp(g, 0.14);
  });
  k.anchor('ama', -0.06, 0.175);
  k.anchor('tomas', -0.1, 0.18);
  k.anchor('granny', 0.0, 0.18);
  k.anchor('room', 0.06, 0.12); // clear of the brass lantern (front-right), in its light
  return k.done();
}

/** The flyleaf: a quiet endpaper scene for the lesson (hills and two lamp posts). */
export function flyleafScene(): Scene {
  const k = new SceneKit(new Scene('flyleaf'));
  k.layer(0.03, 0.0, (g) => {
    g.add(k.piece(A.HILLS, '#3d3a5c', 0, 1, { edge: '#20203d' }));
  }, true);
  k.layer(0.12, 0.12, (g) => {
    k.lamp(g, -0.13);
    k.lamp(g, 0.14);
  }, true);
  k.anchor('char', 0.0, 0.17);
  return k.done();
}

/** Spread 4: the windy common (both routes meet). A bent thorn, a half-built wall, a scarecrow with no shadow. */
export function commonScene(): Scene {
  const k = new SceneKit(new Scene('common'));
  k.layer(0.025, 0.0, (g) => {
    g.add(k.piece(B.BIG_HILL, '#3a3f68', 0.12, 0.8, { edge: '#1c1c36' }));
    g.add(k.piece(A.HILL_NEAR, '#465a4c', 0, 1, { edge: '#1f2a24' }));
  }, true);
  k.layer(0.07, 0.08, (g) => {
    // the thorn tree, bent by years of wind (leaning left)
    const thorn = k.piece(A.OAK, '#5b6a48', -0.16, 1.05, { edge: '#26301f' });
    thorn.rotation.z = 0.22;
    g.add(thorn);
    g.add(k.piece(B.WALL, '#857a6c', 0.11, 0.55, { edge: '#3a332c' }));
  }, true);
  k.layer(0.13, 0.16, (g) => {
    // the scarecrow: a cross of sticks, a coat, a hat
    g.add(k.piece('M -1.5 0 L 1.5 0 L 1.5 62 L -1.5 62 Z', '#5a3f2e', 0.05));
    g.add(k.piece('M -22 44 L 22 44 L 22 47 L -22 47 Z', '#5a3f2e', 0.05));
    g.add(k.piece('M -12 22 L 12 22 L 16 48 L -16 48 Z', '#7a6a4a', 0.05));
    g.add(k.piece('M -7 48 C -7 58 7 58 7 48 Z', '#d8c08a', 0.05));
    g.add(k.piece('M -12 56 L 12 56 L 12 58 L 6 58 L 5 66 L -5 66 L -6 58 L -12 58 Z', '#2e2a3a', 0.05));
    g.add(k.piece(B.STANDING_STONE, '#8a8378', 0.17, 1.1));
  });
  k.layer(0.2, 0.24, (g) => {
    for (const x of [-0.2, -0.08, 0.2]) g.add(k.piece(B.REEDS, '#6b7f4a', x, 0.6, { edge: '#26301f' }));
  });
  k.anchor('tomas', -0.1, 0.2);
  k.anchor('ama', -0.05, 0.21);
  k.anchor('char', 0.0, 0.22);
  k.anchor('far', 0.18, 0.12);
  return k.done();
}

/** Spread 6: the stair. Old tower stones climbing the hill, gorse, a fallen gatepost; a light sweeps down from the top. */
export function stairScene(): Scene {
  const k = new SceneKit(new Scene('stair'));
  k.layer(0.025, 0.0, (g) => {
    g.add(k.piece(B.BIG_HILL, '#3c416c', 0, 1.05, { edge: '#1c1c36' }));
  }, true);
  k.layer(0.07, 0.06, (g) => {
    // the stair: tower stones, climbing from the front left toward the top right
    for (let i = 0; i < 9; i++) g.add(k.piece(B.HILL_STEPS, '#8a8378', -0.16 + i * 0.03, 1.2, { y: 0.004 + i * 0.011 }));
    g.add(k.piece('M -16 0 L 16 0 L 16 5 L -16 5 Z', '#6f665c', 0.14, 1, { y: 0.0 }));
  }, true);
  k.layer(0.13, 0.14, (g) => {
    // gorse bushes (one hides a rabbit)
    for (const [x, s] of [[-0.19, 1], [0.06, 1.2], [0.16, 0.9]]) g.add(k.piece(B.CABBAGE, '#5c6a2e', x, s * 1.6, { edge: '#262a14' }));
  });
  k.anchor('tomas', -0.15, 0.2);
  k.anchor('ama', -0.1, 0.21);
  k.anchor('char', -0.05, 0.2);
  k.anchor('last', 0.03, 0.17);
  k.anchor('gorse', 0.06, 0.15);
  return k.done();
}

/** Spread 10: the way home. The village from spread 1, every lamp dark, the gate at one side. */
export function homeScene(): Scene {
  const k = new SceneKit(new Scene('home'));
  k.layer(0.025, 0.0, (g) => {
    g.add(k.piece(A.HILLS, '#2f3156', 0, 1, { edge: '#1a1a33' }));
  }, true);
  k.layer(0.07, 0.08, (g) => {
    g.add(k.house('tall', A.HOUSE_TALL, A.PAL.slate, -0.15, '#3f4366'));
    g.add(k.house('tower', A.HOUSE_TOWER, A.PAL.rose, 0.155, '#6b3f3f'));
    g.add(k.house('cottage', A.HOUSE_COTTAGE, A.PAL.cream, -0.03, A.PAL.roofA, 0.9));
    g.add(k.house('wide', A.HOUSE_WIDE, '#c9b48e', 0.07, A.PAL.roofB, 0.8));
  }, true);
  const lamps: Mesh[] = [];
  k.layer(0.17, 0.2, (g) => {
    g.add(k.piece(B.GATE, '#a39684', -0.17, 0.5, { edge: '#3a332c' }));
    for (const x of [-0.11, -0.03, 0.05, 0.13, 0.2]) {
      g.add(k.piece(A.LAMP_POST, '#2a2433', x));
      const l = new Mesh(new BoxGeometry(0.006, 0.008, 0.006), new MeshStandardMaterial({ color: '#3a3328', emissive: '#ffb347', emissiveIntensity: 0 }));
      l.position.set(x, 0.07, 0);
      l.userData.keep = true;
      l.name = 'Village lamp';
      g.add(l);
      lamps.push(l);
    }
  });
  k.scene.props.lamps = lamps;
  k.anchor('tomas', -0.13, 0.22);
  k.anchor('ama', -0.06, 0.23);
  k.anchor('char', 0.0, 0.23);
  k.anchor('gate', -0.17, 0.2);
  k.anchor('room', 0.04, 0.2); // clear of the brass lantern (front-right)
  return k.done();
}

/** The Lantern Room (Shadow Practice): low hills, two lamps, a long shelf at the back for your puppets. */
export function lanternRoomScene(): Scene {
  const k = new SceneKit(new Scene('lantern'));
  k.layer(0.02, 0.0, (g) => {
    g.add(k.piece(B.VILLAGE_ROW, '#2a2740', 0, 0.9, { edge: '#141220' }));
  }, true);
  k.layer(0.035, 0.03, (g) => {
    g.add(k.piece(A.HILL_NEAR, '#2f3156', 0, 1, { edge: '#1a1a33' }));
    for (const [x, s] of [[-0.21, 0.7], [-0.12, 0.55], [0.13, 0.6], [0.21, 0.75]]) g.add(k.piece(A.PINE, '#3f5a4a', x, s, { edge: '#1f2a24' }));
  }, true);
  k.layer(0.06, 0.06, (g) => {
    // the shelf: a long plank on two brackets
    g.add(k.piece('M -200 0 L 200 0 L 200 5 L -200 5 Z', '#6b4a33', 0, 1, { y: 0.016 }));
    for (const x of [-0.17, 0.17]) g.add(k.piece('M -3 0 L 3 0 L 3 16 L -3 16 Z', '#4a3324', x));
  });
  k.layer(0.15, 0.12, (g) => {
    k.lamp(g, -0.19);
    k.lamp(g, 0.2);
  }, true);
  k.anchor('shelf', -0.18, 0.06, 0.021);
  k.anchor('char', 0.0, 0.17);
  k.anchor('ama', -0.06, 0.18);
  return k.done();
}
