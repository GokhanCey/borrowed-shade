import { CanvasTexture, Group, Mesh, MeshBasicMaterial, MeshStandardMaterial, PlaneGeometry, RingGeometry, SRGBColorSpace } from '@iwsdk/core';
import * as A from '../tale/art.js';
import { circle } from '../tale/cast.js';
import { cutout, flat, mergeStatic, paper, rect } from '../tale/paper.js';
import { Scene, SceneKit } from '../tale/scenes.js';

/**
 * The town of Brimble, in cut paper (The Weathermaker's Apprentice).
 * Paths are in millimetres, base at y 0, centred on x 0 (paper.ts scales them to metres).
 */
export const W = {
  /** the downs behind the town: long, low, rolling */
  DOWNS: 'M -215 0 L 215 0 L 215 52 C 180 66 150 58 116 68 C 80 78 50 70 16 80 C -20 90 -60 72 -100 76 C -140 80 -170 64 -215 70 Z',
  /** Ottilie's loft: a narrow tower with a pointed cap */
  LOFT: 'M -30 0 L 30 0 L 30 112 L 36 112 L 0 150 L -36 112 L -30 112 Z',
  LOFT_WINDOW: 'M -12 70 L 12 70 L 12 92 C 12 100 -12 100 -12 92 Z',
  /** a shelf of jars (weather in jars) */
  JARS: 'M -40 0 L 40 0 L 40 3 L 35 3 L 35 6 L 34 18 L 31 20 L 31 23 L 23 23 L 23 20 L 20 18 L 20 6 L 15 6 L 14 14 L 12 16 L 12 19 L 4 19 L 4 16 L 2 14 L 1 6 L -4 6 L -5 20 L -8 22 L -8 26 L -17 26 L -17 22 L -20 20 L -21 6 L -26 6 L -27 15 L -29 17 L -29 20 L -36 20 L -36 17 L -38 15 L -38 3 L -40 3 Z',
  /** the vane on the loft's point */
  VANE: 'M -1 0 L 1 0 L 1 14 L 16 14 L 12 18 L 16 22 L -14 22 L -17 18 L -14 14 L -1 14 Z',
  /** Ottilie: tall, a long coat, a muffler, her hair up in a knot */
  OTTILIE: 'M -10 0 L 10 0 L 8 34 L 11 50 L 7 56 L 9 58 L 5 61 C 7 68 4 74 0 74 C -2 74 -3 76 -1 80 C -6 80 -7 76 -4 73 C -7 70 -7 64 -5 61 L -9 58 L -7 56 L -11 50 L -8 34 Z',
  /** a townsman, stout (Mr. Crabbe, Mr. Pottle) */
  STOUT: 'M -12 0 L -4 0 L -3 14 L 3 14 L 4 0 L 12 0 L 13 30 C 13 42 9 48 6 50 C 8 54 7 62 0 63 C -7 62 -8 54 -6 50 C -9 48 -13 42 -13 30 Z',
  /** a boy (Fen) */
  BOY: 'M -6 0 L -2 0 L -1 12 L 1 12 L 2 0 L 6 0 L 7 26 L 4 32 C 6 36 5 42 0 42 C -5 42 -6 36 -4 32 L -7 26 Z',
  /** the mill: a tapering tower with a cap */
  MILL: 'M -22 0 L 22 0 L 15 86 L 19 86 L 0 104 L -19 86 L -15 86 Z',
  MILL_DOOR: 'M -6 0 L 6 0 L 6 14 C 6 20 -6 20 -6 14 Z',
  /** one sail of the mill (from the hub out; four are turned) */
  SAIL: 'M -2 2 L 2 2 L 3 14 L 12 14 L 12 60 L 3 60 L 0 64 L -2 60 Z',
  /** a turnip, its leaves up */
  TURNIP: 'M 0 0 C -8 1 -10 9 -6 14 L -4 16 L -8 26 L -1 18 L 0 28 L 1 18 L 8 26 L 4 16 L 6 14 C 10 9 8 1 0 0 Z',
  /** the washing line: two poles and the sheets */
  POLE: 'M -1.2 0 L 1.2 0 L 1.2 62 L -1.2 62 Z',
  SHEET: 'M -14 0 L 14 0 L 15 26 L -15 26 Z',
  /** the bakery: a wide house, its chimney */
  BAKERY: 'M -46 0 L 46 0 L 46 48 L 50 48 L 22 76 L 22 90 L 12 90 L 12 86 L 0 98 L -50 48 L -46 48 Z',
  BAKERY_WIN: 'M -34 12 L -14 12 L -14 32 L -34 32 Z M 14 12 L 34 12 L 34 32 L 14 32 Z',
  OVEN_DOOR: 'M -7 0 L 7 0 L 7 12 C 7 20 -7 20 -7 12 Z',
  /** a row of little houses down the street */
  STREET: 'M -110 0 L 110 0 L 110 30 L 96 44 L 82 30 L 82 36 L 64 50 L 46 36 L 46 30 L 30 44 L 14 30 L 14 38 L -4 52 L -22 38 L -22 30 L -38 44 L -54 30 L -54 36 L -72 50 L -90 36 L -90 30 L -110 30 Z',
  STREET_WIN: 'M -100 10 L -94 10 L -94 18 L -100 18 Z M -66 12 L -60 12 L -60 20 L -66 20 Z M -32 10 L -26 10 L -26 18 L -32 18 Z M 0 14 L 6 14 L 6 22 L 0 22 Z M 34 10 L 40 10 L 40 18 L 34 18 Z M 66 12 L 72 12 L 72 20 L 66 20 Z M 94 10 L 100 10 L 100 18 L 94 18 Z',
  SACK: 'M -7 0 L 7 0 L 8 11 L 5 14 L 7 17 L -7 17 L -5 14 L -8 11 Z',
};

const COL = {
  downs: '#7d9a7a',
  downsEdge: '#2f3d30',
  loft: '#c9b48e',
  slate: '#5d6a82',
  ink: '#2a2433',
  ottilie: '#6f8fae',
  crabbe: '#8a6a4a',
  fen: '#9a7a5e',
  mags: '#cf8f97',
  pottle: '#c98a4a',
};

/** a lit window that the story can warm (its own material, kept out of the merge) */
function glowPiece(path: string, x: number, y: number, s = 1): Mesh {
  const m = flat(path, new MeshStandardMaterial({ color: '#3a3040', emissive: '#ffb347', emissiveIntensity: 0, roughness: 0.9 }), 'Warm window');
  m.position.set(x, y, 0.0011);
  m.scale.setScalar(s);
  m.userData.keep = true;
  return m;
}

/** a layer's pieces, grown from their base line (the town stands taller in the book) */
function grow(g: Group, s: number): Group {
  const c = new Group();
  c.scale.setScalar(s);
  g.add(c);
  return c;
}

const SKY = {
  SUN: 'M 0 -14 C 8 -14 14 -8 14 0 C 14 8 8 14 0 14 C -8 14 -14 8 -14 0 C -14 -8 -8 -14 0 -14 Z',
  WISP: 'M -34 0 C -32 7 -22 11 -13 8 C -8 15 5 17 11 10 C 18 14 30 10 34 0 C 22 -3 -22 -3 -34 0 Z',
};

/**
 * The painted sky on the screen (cut paper glued to the sky sheet): a sun or a low evening sun,
 * two or three slow paper wisps, and Brimble's rooftops far off on the downs. It fills the sky
 * the way the tale's moon and hills do, and never looks like the weather you make (those are
 * white with an ink line; these are soft card, flat, and stay put).
 */
function paintedSky(k: SceneKit, o: { sun?: [number, number, string]; wisps?: [number, number, number][]; town?: number; tint?: string }): void {
  // thin backlit vellum: they glow softly and let the reader's shadow and the outlines show through
  const piece = (path: string, color: string, x: number, y: number, s: number, a: number) => {
    const m = flat(path, new MeshBasicMaterial({ color, transparent: true, opacity: a, depthWrite: false }), 'Painted sky');
    m.position.set(x, y, 0.0026);
    m.scale.setScalar(s);
    m.renderOrder = 3;
    k.scene.screenProps.add(m);
  };
  if (o.sun) piece(SKY.SUN, o.sun[2], o.sun[0], o.sun[1], 1.15, 0.7);
  for (const [x, y, sc] of o.wisps ?? []) piece(SKY.WISP, o.tint ?? '#fbf3e3', x, y, sc * 1.35, 0.45);
  void o.town; // (the far town was opaque over the reader's shadow: left out)
}

/** a small standing figure (scenery: the town's people stand where the story needs them) */
function person(k: SceneKit, path: string, color: string, x: number, s = 1, flip = false): Group {
  const g = new Group();
  g.add(k.piece(path, color, 0, 1, { edge: '#2a2026', flip }));
  // a face, and the one thing each is known by (two-layer cut-outs, like Ama and Tomas)
  const look = LOOKS.get(path);
  if (look) {
    const face = flat(circle(look.face[0], look.face[1], look.face[2]), paper('#e6c4a0'), 'Face');
    face.position.z = 0.0011;
    g.add(face);
    for (const [d, c] of look.wear ?? []) {
      const m = flat(d, paper(c), 'Dress');
      m.position.z = 0.0013;
      g.add(m);
    }
  }
  g.position.x = x;
  g.scale.setScalar(s);
  return g;
}

/** head (x, y, r in mm) and what they wear: Ottilie's red muffler, the millers' and bakers' aprons, Fen's straw hat, Mags's headscarf */
const LOOKS = new Map<string, { face: [number, number, number]; wear?: [string, string][] }>([
  [W.OTTILIE, { face: [0, 67.5, 5.4], wear: [[rect(-9, 55, 9, 60.5), '#b8473e']] }],
  [W.STOUT, { face: [0, 56.5, 6], wear: [[rect(-8, 16, 8, 40), '#efe6d2']] }],
  [W.BOY, { face: [0, 37.5, 4.4], wear: [['M -8.5 40.5 L 8.5 40.5 L 5 45.5 L -5 45.5 Z', '#d8b45a']] }],
  [A.VILLAGER, { face: [0, 62, 6], wear: [['M -9.5 64 C -9.5 77 9.5 77 9.5 64 L 6 68.5 C 3 71 -3 71 -6 68.5 Z', '#efe3cf']] }],
  [A.VILLAGER_HAT, { face: [0, 61, 5.6] }],
]);

/** the four jars: earth, water, fire, air (a colour, a glow, and its letter in ink) */
const JARS = [
  { tint: '#a9825c', glow: '#c9925c', letter: 'E' },
  { tint: '#8fb6d8', glow: '#9fd0ff', letter: 'W' },
  { tint: '#eda65a', glow: '#ffb24a', letter: 'F' },
  { tint: '#eef1f2', glow: '#ffffff', letter: 'A' },
];
const JAR_PATH = 'M -10 0 L 10 0 L 11.5 4 L 11.5 21 L 8 26 L 8 29 L -8 29 L -8 26 L -11.5 21 L -11.5 4 Z';
const JAR_LID_PATH = 'M -9.5 29 L 9.5 29 L 9.5 33.5 L -9.5 33.5 Z';
const letterTex = new Map<string, CanvasTexture>();
function letter(ch: string): Mesh {
  let t = letterTex.get(ch);
  if (!t) {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d')!;
    g.fillStyle = '#2a2433';
    g.font = '700 50px Georgia, "Times New Roman", serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(ch, 32, 35);
    t = new CanvasTexture(c);
    t.colorSpace = SRGBColorSpace;
    letterTex.set(ch, t);
  }
  const m = new Mesh(new PlaneGeometry(0.011, 0.011), new MeshBasicMaterial({ map: t, transparent: true, depthWrite: false }));
  m.name = 'Jar letter';
  m.position.set(0, 0.0125, 0.0012);
  m.userData.keep = true;
  return m;
}
/** one jar (kept out of the merge: the story opens it): its own glowing face, a lid that lifts, its letter */
function makeJar(k: SceneKit, i: number, x: number, s = 1.35): Mesh {
  const jar = k.piece(JAR_PATH, JARS[i].tint, x, s, { y: 0.004, edge: '#2a2433', emissive: JARS[i].glow, ei: 0.12 });
  jar.userData.keep = true;
  jar.name = `Jar ${i}`;
  const mats = jar.material as MeshStandardMaterial[];
  mats[0] = mats[0].clone();
  jar.userData.face = mats[0];
  const lid = k.piece(JAR_LID_PATH, '#c9a878', 0, 1, { edge: '#5a4632' });
  lid.position.z = 0.0006;
  lid.userData.keep = true;
  jar.add(lid, letter(JARS[i].letter));
  jar.userData.lid = lid;
  return jar;
}
/**
 * the lid of an opened jar hops off and comes to rest leaning against the jar's side, on the ground
 * (the lid is drawn 29..33.5 mm up the jar: turned 60 degrees about the jar's foot and set down beside it)
 */
function restLid(lid: Mesh, open: boolean, dt: number): void {
  const k = Math.min(1, dt * 5);
  const u = (lid.userData.u = ((lid.userData.u as number) ?? 0) + ((open ? 1 : 0) - ((lid.userData.u as number) ?? 0)) * k);
  lid.rotation.z = 1.05 * u;
  // an arc: up off the jar first, then down beside it
  lid.position.x = 0.0106 * u;
  lid.position.y = -0.0066 * u + 0.016 * Math.sin(Math.min(1, u) * Math.PI) * (open ? 1 : 0);
}
/** per frame: an opened jar hops, its lid comes off and leans beside it, and it glows; a shut one waits with a faint glimmer */
function stepJar(j: Mesh, pop: number, t: number, dt: number, i: number): void {
  const open = !!j.userData.open;
  j.position.y = 0.004 + 0.012 * Math.sin(pop * Math.PI);
  restLid(j.userData.lid as Mesh, open, dt);
  (j.userData.face as MeshStandardMaterial).emissiveIntensity = open ? 0.8 : 0.3 + 0.08 * Math.sin(t * 2 + i);
}
/**
 * This spread's jar stands at the front-left of the page ("The first jar said AIR."). When the reader
 * makes its sign, the story pops it open a beat before their shape lifts: jar opens, your shape answers.
 */
function spreadJar(k: SceneKit, i: number): void {
  let jar: Mesh | null = null;
  k.layer(0.268, 0.3, (g) => {
    jar = makeJar(k, i, -0.15, 1.5);
    g.add(jar);
  });
  const state = { open: false, pop: 0 };
  k.scene.props.jar = state;
  const prev = k.scene.animate;
  k.scene.animate = (t, dt) => {
    prev?.(t, dt);
    const j = jar as Mesh | null;
    if (!j) return;
    state.pop = Math.max(0, state.pop - dt * 2.2);
    j.userData.open = state.open;
    stepJar(j, state.pop, t, dt, i);
  };
}

/** a far row of Brimble's roofs on the downs (the town is somewhere on every spread) */
function farTown(k: SceneKit, x: number): void {
  k.layer(0.05, 0.04, (g) => {
    g.add(k.piece(W.STREET, '#cdbb9c', x, 0.55, { edge: '#3a2c22' }));
  }, true);
}

/** Spread 1: the weather loft above the town. */
export function loftScene(): Scene {
  const k = new SceneKit(new Scene('w-loft'));
  k.layer(0.03, 0.0, (g) => {
    g.add(k.piece(W.DOWNS, COL.downs, 0, 1, { edge: COL.downsEdge }));
  }, true);
  k.layer(0.07, 0.08, (g) => {
    g.add(k.piece(W.STREET, '#d8c3a0', 0.06, 0.8, { edge: '#3a2c22' }));
    const win = flat(W.STREET_WIN, k.windows, 'Window');
    win.position.set(0.06, 0, 0.0011);
    win.scale.setScalar(0.8);
    g.add(win);
  }, true);
  k.layer(0.11, 0.16, (g0) => {
    const g = grow(g0, 1.3);
    g.add(k.piece(W.LOFT, COL.loft, -0.12, 1, { edge: '#3a2c22' }));
    const w = flat(W.LOFT_WINDOW, k.windows, 'Window');
    w.position.set(-0.12, 0, 0.0011);
    g.add(w);
    g.add(k.piece(W.VANE, '#d9b46a', -0.12, 1, { y: 0.15 }));
    g.add(k.piece(W.JARS, '#b9c9d6', 0.09, 0.9, { edge: '#3a4652' }));
    const oak = k.piece(A.OAK, '#7f9a6a', 0.145, 0.9, { edge: '#26301f' });
    oak.position.z = -0.002;
    g.add(oak);
  }, true);
  k.layer(0.16, 0.24, (g0) => {
    const g = grow(g0, 1.15);
    g.add(person(k, W.OTTILIE, COL.ottilie, -0.05, 1.05));
    g.add(k.piece(A.PINE, '#55705c', -0.19, 0.7, { edge: '#1f2a24' }));
  });
  k.layer(0.22, 0.32, (g) => {
    for (const x of [-0.15, 0.15]) g.add(k.piece(A.FENCE, '#7a5a43', x));
  });
  paintedSky(k, { sun: [0.17, 0.205, '#f6dc9a'], wisps: [[-0.17, 0.19, 1], [0.05, 0.215, 0.8]], town: 0.1 });
  k.anchor('char', 0.02, 0.18);
  return k.done();
}

/** Spread 2: Mr. Crabbe's mill, its sails still. */
export function millScene(): Scene {
  const k = new SceneKit(new Scene('w-mill'));
  k.layer(0.03, 0.0, (g) => {
    g.add(k.piece(W.DOWNS, COL.downs, 0, 1, { edge: COL.downsEdge }));
  }, true);
  let hub: Group | null = null;
  k.layer(0.09, 0.1, (g0) => {
    const g = grow(g0, 1.4);
    g.add(k.piece(W.MILL, '#d8c3a0', 0.105, 1, { edge: '#3a2c22' }));
    g.add(k.piece(W.MILL_DOOR, '#5a3f2e', 0.105, 1));
    // the sails turn (kept out of the merge so the story can spin them)
    hub = new Group();
    hub.name = 'Mill sails';
    hub.userData.keep = true;
    hub.position.set(0.105, 0.084, 0.004);
    for (let i = 0; i < 4; i++) {
      const s = cutout(W.SAIL, { color: '#efe3c8', edge: '#3a2c22' });
      s.rotation.z = (i * Math.PI) / 2 + 0.3;
      hub.add(s);
    }
    // (four sails, one draw: in the main pass and in the shadow pass that follows them while they turn)
    mergeStatic(hub, 'Mill sails');
    g.add(hub);
  }, true);
  k.layer(0.15, 0.2, (g0) => {
    const g = grow(g0, 1.2);
    g.add(person(k, W.STOUT, COL.crabbe, -0.06, 1.0));
    for (const [x, s] of [[0.02, 1], [0.035, 0.85]]) g.add(k.piece(W.SACK, '#e8dcc0', x, s, { edge: '#5a4a32' }));
    g.add(k.piece(A.OAK, '#8aa06c', -0.15, 0.8, { edge: '#26301f' }));
  });
  k.layer(0.22, 0.32, (g) => {
    // the wheat that is waiting for the wind
    for (const x of [-0.17, -0.09, 0.17]) g.add(k.piece(A.FENCE, '#d8b45a', x, 0.9));
  });
  paintedSky(k, { sun: [-0.16, 0.2, '#f6dc9a'], wisps: [[0.15, 0.2, 0.9], [-0.03, 0.225, 0.7]], town: -0.12 });
  farTown(k, -0.1);
  const sails = hub as Group | null;
  if (sails) k.scene.casters.push(sails);
  k.scene.props.sails = sails;
  k.scene.props.spin = 0;
  let ang = 0;
  k.scene.animate = (_t, dt) => {
    ang -= dt * (k.scene.props.spin as number);
    if (sails) sails.rotation.z = ang;
  };
  spreadJar(k, 3);
  k.anchor('char', 0.0, 0.18);
  return k.done();
}

/** Spread 3: Fen's turnip field (left) and Mags's washing line (right). */
export function fieldScene(): Scene {
  const k = new SceneKit(new Scene('w-field'));
  k.layer(0.03, 0.0, (g) => {
    g.add(k.piece(W.DOWNS, COL.downs, 0, 1, { edge: COL.downsEdge }));
  }, true);
  const turnips: Mesh[] = [];
  k.layer(0.1, 0.1, (g0) => {
    const g = grow(g0, 1.15);
    for (const x of [0.07, 0.17]) g.add(k.piece(W.POLE, '#6a5040', x));
    const line = flat(rect(70, 60, 170, 61), paper('#3a2c22'), 'Line');
    g.add(line);
    for (const [x, c] of [[0.095, '#f2ead8'], [0.145, '#e8d6c8']] as const) g.add(k.piece(W.SHEET, c, x, 1, { y: 0.034, edge: '#7a6a5a' }));
  }, true);
  k.layer(0.14, 0.18, (g) => {
    for (const [x, s] of [[-0.19, 1.1], [-0.155, 0.95], [-0.12, 1.15], [-0.085, 0.95], [-0.05, 1.05]]) {
      const t = k.piece(W.TURNIP, '#d8b2c6', x, s, { edge: '#4a3040' });
      t.userData.keep = true;
      t.userData.s = s;
      turnips.push(t);
      g.add(t);
    }
    g.add(person(k, W.BOY, COL.fen, -0.015, 1.3));
    g.add(person(k, A.VILLAGER, COL.mags, 0.115, 1.15, true));
  });
  k.layer(0.06, 0.06, (g) => {
    for (const [x, s] of [[-0.2, 0.9], [-0.1, 0.7], [0.2, 0.8]]) g.add(k.piece(A.OAK, '#7f9a6a', x, s, { edge: '#26301f' }));
  }, true);
  paintedSky(k, { sun: [0.18, 0.21, '#f6dc9a'], wisps: [[-0.12, 0.205, 1], [0.04, 0.22, 0.75]], town: 0.0 });
  k.scene.props.turnips = turnips;
  k.scene.props.grow = 0;
  let cur = 0;
  k.scene.animate = (_t, dt) => {
    cur += ((k.scene.props.grow as number) - cur) * Math.min(1, dt * 1.5);
    for (const t of turnips) t.scale.setScalar((t.userData.s as number) * (1 + 0.45 * cur));
  };
  farTown(k, 0.03);
  spreadJar(k, 1);
  k.anchor('char', 0.0, 0.18);
  return k.done();
}

/** Spread 4: the Pottles' bakery at dusk, the street behind it. */
export function bakeryScene(): Scene {
  const k = new SceneKit(new Scene('w-bakery'));
  k.layer(0.03, 0.0, (g) => {
    g.add(k.piece(W.DOWNS, '#5f7563', 0, 1, { edge: COL.downsEdge }));
  }, true);
  const warm: Mesh[] = [];
  k.layer(0.07, 0.08, (g) => {
    g.add(k.piece(W.STREET, '#b9a689', 0, 1, { edge: '#3a2c22' }));
    const w = glowPiece(W.STREET_WIN, 0, 0, 1);
    warm.push(w);
    g.add(w);
  }, true);
  k.layer(0.12, 0.16, (g0) => {
    const g = grow(g0, 1.3);
    g.add(k.piece(W.BAKERY, '#d8b48e', 0.04, 1, { edge: '#3a2c22' }));
    const w = glowPiece(W.BAKERY_WIN, 0.04, 0, 1);
    warm.push(w);
    g.add(w);
    const oven = glowPiece(W.OVEN_DOOR, 0.04, 0, 1);
    warm.push(oven);
    g.add(oven);
  }, true);
  k.layer(0.17, 0.24, (g0) => {
    const g = grow(g0, 1.2);
    g.add(person(k, W.STOUT, COL.pottle, -0.07, 1.0));
    g.add(person(k, A.VILLAGER_HAT, '#8a6f8f', -0.115, 1.0));
    // the street lamps are already lit: it is evening
    k.lamp(g, -0.19);
    k.lamp(g, 0.16);
  });
  paintedSky(k, { sun: [-0.15, 0.1, '#f0a868'], wisps: [[0.1, 0.19, 1], [-0.05, 0.215, 0.8]], tint: '#e8c4a8' });
  // where the bellows are pumped (a flat hand stroked toward the reader, over the bakery)
  k.anchor('oven', 0.04, 0.2);
  k.scene.props.warm = warm;
  k.scene.props.glow = 0;
  let cur = 0;
  // the bellows: two boards and a nozzle pointing at the oven door
  let bellows: Mesh | null = null;
  k.layer(0.2, 0.3, (g) => {
    bellows = k.piece('M -15 5 C -15 15 -4 21 6 17 L 20 10 L 27 10 L 27 7 L 20 7 L 6 1 C -4 -3 -15 0 -15 5 Z M -15 8 L -25 12 L -25 4 Z', '#8a5a3a', 0.04, 1.25, { edge: '#2a2018' });
    bellows.userData.keep = true;
    bellows.name = 'Bellows';
    g.add(bellows);
  });
  k.scene.props.squeeze = 0;
  k.scene.animate = (t, dt) => {
    cur += ((k.scene.props.glow as number) - cur) * Math.min(1, dt * 1.2);
    warm.forEach((m, i) => ((m.material as MeshStandardMaterial).emissiveIntensity = cur * (1.1 + 0.12 * Math.sin(t * 3 + i * 2))));
    const sq = Math.max(0, (k.scene.props.squeeze as number) - dt * 2.4);
    k.scene.props.squeeze = sq;
    const b = bellows as Mesh | null;
    if (b) b.scale.y = 1.25 * (1 - 0.5 * Math.sin(sq * Math.PI));
  };
  spreadJar(k, 2);
  k.anchor('char', 0.0, 0.18);
  return k.done();
}

// ---- Earth and the finale ---------------------------------------------------------------------

const EARTH = {
  /** the hill above the field, its slope cut where the rain loosened it */
  SLOPE: 'M -215 0 L 215 0 L 215 40 C 170 46 140 96 90 112 C 60 120 30 104 10 88 L -10 70 C -40 60 -90 54 -130 40 C -170 30 -200 34 -215 30 Z',
  /** loose stones on the slope (one path, many pieces) */
  STONES: 'M 20 80 C 26 74 34 76 34 82 C 32 88 22 88 20 80 Z M -8 64 C -2 58 8 60 8 66 C 6 72 -6 72 -8 64 Z M 44 98 C 50 94 58 96 57 102 C 54 106 45 105 44 98 Z M -34 56 C -30 52 -22 53 -22 58 C -24 62 -33 61 -34 56 Z',
  /** the earth you raise on the screen: a paper mountain (drawn on the screen, it grows from the ground) */
  MOUNTAIN: 'M -70 0 L 70 0 L 40 44 L 30 40 L 14 66 L 0 60 L -16 78 L -30 52 L -44 40 Z',
  FENCE: 'M -60 0 L 60 0 L 60 3 L 52 3 L 52 16 L 48 16 L 48 3 L 22 3 L 22 16 L 18 16 L 18 3 L -18 3 L -18 16 L -22 16 L -22 3 L -48 3 L -48 16 L -52 16 L -52 3 L -60 3 Z',
  /** one big jar (the last spread: four in a row at the front of the stage, each a finger wide) */
  JAR: 'M -10 0 L 10 0 L 11.5 4 L 11.5 21 L 8 26 L 8 29 L -8 29 L -8 26 L -11.5 21 L -11.5 4 Z',
  JAR_LID: 'M -9.5 29 L 9.5 29 L 9.5 33.5 L -9.5 33.5 Z',
  BENCH: 'M -118 0 L 118 0 L 118 4 L -118 4 Z',
};

/** Spread 5: Earth. The night's rain loosened the hill above Fen's field. */
export function slipScene(): Scene {
  const k = new SceneKit(new Scene('w-slip'));
  k.layer(0.03, 0.0, (g) => {
    g.add(k.piece(W.DOWNS, '#6d8a6c', 0, 1, { edge: COL.downsEdge }));
  }, true);
  const stones: Mesh[] = [];
  k.layer(0.08, 0.08, (g) => {
    g.add(k.piece(EARTH.SLOPE, '#8a7356', -0.02, 1, { edge: '#3a2c22' }));
    const st = k.piece(EARTH.STONES, '#d8cdb6', -0.02, 1, { edge: '#2a221c' });
    st.userData.keep = true;
    st.userData.home = st.position.clone();
    stones.push(st);
    g.add(st);
  }, true);
  k.layer(0.15, 0.2, (g) => {
    for (const [x, s] of [[0.1, 0.8], [0.13, 0.75], [0.16, 0.85], [0.19, 0.7]]) g.add(k.piece(W.TURNIP, '#d8b2c6', x, s, { edge: '#4a3040' }));
    g.add(k.piece(EARTH.FENCE, '#7a5a43', -0.14, 1));
    g.add(person(k, W.BOY, COL.fen, 0.05, 1.3));
    g.add(person(k, W.OTTILIE, COL.ottilie, -0.07, 1.2));
  });
  k.layer(0.055, 0.06, (g) => {
    for (const [x, s] of [[-0.2, 0.9], [-0.15, 0.7], [0.2, 0.75]]) g.add(k.piece(A.PINE, '#55705c', x, s, { edge: '#1f2a24' }));
  }, true);
  paintedSky(k, { sun: [-0.17, 0.215, '#f3e2b0'], wisps: [[0.0, 0.215, 0.9]], town: 0.14 });
  // the mountain on the screen: grows from the ground when earth is made (props.rise 0..1)
  const mtn = k.screenPiece(EARTH.MOUNTAIN, '#5f4b3a', -0.05, 0.025, 1);
  mtn.scale.set(1, 0.001, 1);
  mtn.visible = false;
  k.scene.props.rise = 0;
  // the stones slide while nothing holds the hill (props.slide 0..1), and stop when it does
  k.scene.props.slide = 0.2;
  let rise = 0;
  let slid = 0;
  k.scene.animate = (t, dt) => {
    rise += ((k.scene.props.rise as number) - rise) * Math.min(1, dt * 1.6);
    mtn.scale.set(1.75 * (1 + 0.08 * rise), 1.75 * Math.max(0.001, rise * (1 + 0.04 * Math.sin(t * 2) * (1 - rise))), 1);
    const sl = k.scene.props.slide as number;
    // held: the stones roll their last few millimetres down into the mountain's foot, and rest there
    slid = sl === 0 && slid > 0.003 ? slid + (0.03 - slid) * Math.min(1, dt * 1.4) : Math.min(0.03, slid + dt * 0.004 * sl);
    for (const s of stones) {
      const h = s.userData.home as { x: number; y: number };
      s.position.x = h.x + slid * 0.8 + (sl > 0.5 ? 0.0006 * Math.sin(t * 23) : 0);
      s.position.y = h.y - slid * 0.5;
    }
  };
  farTown(k, -0.11);
  spreadJar(k, 0);
  k.anchor('char', 0.0, 0.18);
  return k.done();
}

/** Spread 6: all four. The loft again, at the window; a rainbow waits behind the screen. */
export function fourScene(): Scene {
  const k = new SceneKit(new Scene('w-four'));
  k.layer(0.03, 0.0, (g) => {
    g.add(k.piece(W.DOWNS, COL.downs, 0, 1, { edge: COL.downsEdge }));
  }, true);
  k.layer(0.07, 0.08, (g) => {
    g.add(k.piece(W.STREET, '#d8c3a0', 0.04, 0.8, { edge: '#3a2c22' }));
    const win = flat(W.STREET_WIN, k.windows, 'Window');
    win.position.set(0.04, 0, 0.0011);
    win.scale.setScalar(0.8);
    g.add(win);
  }, true);
  k.layer(0.12, 0.16, (g0) => {
    const g = grow(g0, 1.25);
    g.add(k.piece(W.LOFT, COL.loft, -0.14, 0.9, { edge: '#3a2c22' }));
    g.add(k.piece(W.VANE, '#d9b46a', -0.14, 0.9, { y: 0.135 }));
  }, true);
  k.layer(0.17, 0.24, (g0) => {
    const g = grow(g0, 1.15);
    g.add(person(k, W.OTTILIE, COL.ottilie, -0.04, 1.05));
    g.add(person(k, W.BOY, COL.fen, 0.06, 1.0));
    g.add(person(k, W.STOUT, COL.crabbe, 0.12, 0.95));
    // the fifth jar, at Ottilie's elbow: clear glass, empty, its lid lying beside it
    g.add(k.piece(JAR_PATH, '#e6eef0', -0.1, 1.1, { edge: '#3a4652' }));
    g.add(k.piece(JAR_LID_PATH, '#c9a878', -0.127, 1.1, { y: -0.031, edge: '#5a4632' }));
  });
  // the four jars in a row at the front, big enough for a fingertip each: earth, water, fire, air
  // (left of the brass lantern; the reader opens them one by one)
  const jars: Mesh[] = [];
  const JAR_X = [-0.125, -0.06, 0.005, 0.07];
  const JAR_Z = 0.265;
  k.layer(JAR_Z, 0.32, (g) => {
    g.add(k.piece(EARTH.BENCH, '#5a4636', -0.0275, 1, { edge: '#2a2018' }));
    JAR_X.forEach((x, i) => {
      const jar = makeJar(k, i, x);
      jars.push(jar);
      g.add(jar);
    });
  });
  JAR_X.forEach((x, i) => k.anchor(`jar${i}`, x, JAR_Z + 0.004, 0.045));
  k.scene.props.jars = jars;
  k.scene.props.pop = [0, 0, 0, 0];
  paintedSky(k, { sun: [0.18, 0.21, '#f6dc9a'], wisps: [[-0.17, 0.205, 0.9]] });
  // a little hill for the Tagalong to stand on (earth first)
  const hill = k.screenPiece(EARTH.MOUNTAIN, '#5f4b3a', 0.03, 0.025, 0.9);
  hill.scale.set(0.9, 0.001, 1);
  hill.visible = false;
  k.scene.props.rise = 0;
  // the rainbow: seven paper bands on the screen, revealed band by band (props.bow 0..1),
  // arching from where the little cloud rained (props.bowX), drawn under the hand shadow and the outlines
  const bands: Mesh[] = [];
  const colors = ['#c0504a', '#d98a3e', '#e6c45a', '#7fae6a', '#5f8fb8', '#5a5f9e', '#8a5f9a'];
  colors.forEach((c, i) => {
    const r0 = 0.15 - i * 0.011;
    const m = new Mesh(new RingGeometry(r0 - 0.011, r0, 48, 1, 0, Math.PI), new MeshBasicMaterial({ color: c, transparent: true, opacity: 0, depthWrite: false }));
    m.position.set(0.03, 0.035, 0.0012);
    m.renderOrder = 2;
    m.name = 'Rainbow band';
    k.scene.screenProps.add(m);
    bands.push(m);
  });
  k.scene.props.bow = 0;
  k.scene.props.bowDim = 1;
  k.scene.props.bowX = 0.03;
  let bow = 0;
  let rise = 0;
  let dimNow = 1;
  k.scene.animate = (t, dt) => {
    rise += ((k.scene.props.rise as number) - rise) * Math.min(1, dt * 1.6);
    hill.scale.set(0.9, 0.9 * Math.max(0.001, rise), 1);
    // an opened jar hops, its lid lifts and stays off, and it glows; a shut one waits with a faint glimmer
    const pop = k.scene.props.pop as number[];
    for (let i = 0; i < jars.length; i++) {
      const j = jars[i];
      pop[i] = Math.max(0, pop[i] - dt * 2.2);
      const open = !!j.userData.open;
      j.position.y = 0.004 + 0.012 * Math.sin(pop[i] * Math.PI);
      restLid(j.userData.lid as Mesh, open, dt);
      j.userData.face.emissiveIntensity = open ? 0.8 : 0.3 + 0.08 * Math.sin(t * 2 + i);
    }
    const bx = Math.max(-0.06, Math.min(0.06, k.scene.props.bowX as number));
    for (const m of bands) m.position.x = bx;
    bow += ((k.scene.props.bow as number) - bow) * Math.min(1, dt * 0.7);
    dimNow += ((k.scene.props.bowDim as number) - dimNow) * Math.min(1, dt * 2);
    const dim = dimNow;
    for (let i = 0; i < bands.length; i++) {
      const o = 0.55 * dim * Math.min(1, Math.max(0, bow * 7 - i));
      (bands[i].material as MeshBasicMaterial).opacity = o;
      bands[i].visible = o > 0.004;
    }
  };
  k.anchor('char', 0.0, 0.18);
  return k.done();
}
