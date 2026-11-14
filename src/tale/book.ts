import {
  AdditiveBlending,
  BoxGeometry,
  CanvasTexture,
  Color,
  CylinderGeometry,
  CatmullRomCurve3,
  DirectionalLight,
  Group,
  HemisphereLight,
  LatheGeometry,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  SphereGeometry,
  PointLight,
  SRGBColorSpace,
  TubeGeometry,
  Vector2,
  Vector3,
  type Material,
  type Object3D,
} from '@iwsdk/core';
import * as A from './art.js';
import { cutout, flat, mergeStatic, oneDraw, paper } from './paper.js';
import type { Scene } from './scenes.js';

/**
 * The pop-up book. Book-local axes: origin at the hinge on the table, x to the
 * right, y up, +z toward the reader. The front half lies on the table as the
 * stage (z 0..D); the back board rises from lying shut (closed) to upright,
 * showing its inside: the paper shadow screen.
 */
export const BOOK = {
  W: 0.46,
  D: 0.34,
  H: 0.34,
  board: 0.009,
  pages: 0.012,
  /** layer that the lantern "sees" when casting shadows onto the screen */
  SHADOW_LAYER: 3,
  /** caption band at the top of the screen (m) */
  captionH: 0.07,
};

export class Book {
  readonly root = new Group();
  /** the back board (screen side), hinged at the top of the page block */
  readonly board = new Group();
  /** everything that stands on the stage page */
  readonly stageRoot = new Group();
  /** Ama and the characters: above the scenes, they travel from page to page */
  readonly actors = new Group();
  /** the little paper moon glued on the screen (hidden when the big moon rises) */
  smallMoon!: Mesh;
  readonly stars: Mesh[] = [];
  private dayHidden = false;
  /** the morning: no paper moon and no stars */
  dayHides(on: boolean): void {
    if (on === this.dayHidden) return;
    this.dayHidden = on;
    for (const s of this.stars) s.visible = !on;
    if (on) this.smallMoon.visible = false;
  }
  /** the current page's pop-up scene */
  scene: Scene | null = null;
  readonly screenMesh: Mesh;
  /** where captions are drawn (child of the board) */
  readonly captionMesh: Mesh;
  readonly lantern: Lantern;
  readonly ama: Group;
  readonly amaHead: Group;
  /** stage-page surface height above the table */
  readonly top = BOOK.board + BOOK.pages;
  /** open amount 0 (shut) .. 1 (screen upright) */
  open = 0;
  readonly hemi: HemisphereLight;
  readonly moon: DirectionalLight;

  constructor(screenMaterial: Material, captionMaterial: Material) {
    const { W, D, H } = BOOK;
    this.root.name = 'Book';

    // ---- base: back cover + page block -------------------------------------------------
    const coverMat = new MeshStandardMaterial({ color: new Color(A.PAL.cover), roughness: 0.85 });
    const base = new Mesh(new BoxGeometry(W, BOOK.board, D), coverMat);
    base.position.set(0, BOOK.board / 2, D / 2);
    base.name = 'Book base';
    const pageEdge = new MeshStandardMaterial({ color: new Color('#e9dcc0'), roughness: 1 });
    const block = new Mesh(new BoxGeometry(W - 0.012, BOOK.pages, D - 0.008), pageEdge);
    block.position.set(0, BOOK.board + BOOK.pages / 2, D / 2 + 0.002);
    block.name = 'Page block';
    // a printed ground: soft path + grass tint on the stage page
    const ground = new Mesh(new PlaneGeometry(W - 0.02, D - 0.02), paper('#7f866a'));
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(0, this.top + 0.0004, D / 2 + 0.002);
    ground.name = 'Stage ground';
    this.root.add(base, block, ground, this.stageRoot);

    // ---- the board: built upright, then hinged shut ---------------------------------------
    this.board.position.set(0, this.top, 0);
    this.board.name = 'Screen board';
    const boardMesh = new Mesh(new BoxGeometry(W, H, BOOK.board), coverMat);
    boardMesh.position.set(0, H / 2, -BOOK.board / 2);
    boardMesh.name = 'Board';
    // the cover art, on the outside of the board (faces up when the book is shut)
    const coverArt = new Mesh(new PlaneGeometry(W - 0.004, H - 0.004), coverFace());
    this.coverArt = coverArt;
    coverArt.rotation.y = Math.PI;
    coverArt.position.set(0, H / 2, -BOOK.board - 0.0004);
    coverArt.name = 'Cover art';
    this.screenMesh = new Mesh(new PlaneGeometry(W - 0.024, H - 0.024), screenMaterial);
    this.screenMesh.position.set(0, H / 2, 0.0008);
    this.screenMesh.name = 'Shadow screen';
    this.captionMesh = new Mesh(new PlaneGeometry(W - 0.05, BOOK.captionH), captionMaterial);
    this.captionMesh.position.set(0, H - 0.012 - BOOK.captionH / 2, 0.0038);
    this.captionMesh.name = 'Caption';
    this.captionMesh.renderOrder = 20;
    // a cut-paper frame around the screen
    const frameMat = paper('#3b2a2a');
    const t = 0.012;
    const frame = new Group();
    for (const [w, h, x, y] of [[W, t, 0, t / 2], [W, t, 0, H - t / 2], [t, H, -W / 2 + t / 2, H / 2], [t, H, W / 2 - t / 2, H / 2]] as const) {
      const f = new Mesh(new BoxGeometry(w, h, 0.003), frameMat);
      f.position.set(x, y, 0.0016);
      frame.add(f);
    }
    // the paper moon and a few stars glued onto the screen (they glow softly)
    const moonMat = paper('#f6e7b8', { emissive: '#ffe6a6', emissiveIntensity: 0.55 });
    const moon = flat(A.MOON, moonMat, 'Paper moon');
    moon.scale.setScalar(1.25);
    moon.position.set(0.15, H - 0.12, 0.003);
    const starMat = paper('#f6e7b8', { emissive: '#ffe6a6', emissiveIntensity: 0.8 });
    const starGroup = new Group();
    for (const [x, y, s] of [[-0.16, 0.235, 1], [-0.08, 0.255, 0.7], [0.05, 0.245, 0.8], [-0.19, 0.19, 0.6], [0.2, 0.19, 0.7]]) {
      const st = flat(A.STAR, starMat, 'Paper star');
      st.position.set(x, y, 0.003);
      st.scale.setScalar(s);
      starGroup.add(st);
    }
    // (they share one glowing material: merged, they are one draw, and switch off together by day)
    const stars = mergeStatic(starGroup, 'Paper stars');
    starGroup.userData.keep = true;
    frame.add(starGroup);
    for (const st of stars) this.stars.push(st);
    moon.userData.keep = true;
    frame.add(moon);
    this.smallMoon = moon;
    mergeStatic(frame, 'Screen frame');
    this.board.add(boardMesh, coverArt, this.screenMesh, frame, this.captionMesh);
    this.root.add(this.board);

    // ---- actors (Ama, the characters you make) live above the scenes ----------------------
    this.actors.name = 'Actors';
    this.root.add(this.actors);
    const amaGroup = new Group();
    amaGroup.name = 'Ama';
    const body = cutout(A.AMA_BODY, { color: '#c46a5a', name: 'Ama body' });
    const amaHead = new Group();
    amaHead.position.y = 0.036;
    // hair in front of the head (cap) and the braid behind it: never coplanar with the face
    const hair = cutout(A.AMA_HAIR, { color: '#7a4b32', edge: '#4a2e22', name: 'Ama hair' });
    hair.position.z = 0.0009;
    const braid = cutout(A.AMA_BRAID, { color: '#7a4b32', edge: '#4a2e22', name: 'Ama braid' });
    braid.position.z = -0.0012;
    amaHead.add(cutout(A.AMA_HEAD, { color: '#e6c4a0', name: 'Ama head' }), hair, braid);
    mergeStatic(amaHead, 'Ama head');
    amaGroup.add(oneDraw(body), amaHead);
    amaGroup.scale.setScalar(1.45);
    amaGroup.position.set(-0.012, this.top, 0.16);
    this.actors.add(amaGroup);
    this.ama = amaGroup;
    this.amaHead = amaHead;

    // ---- lights -----------------------------------------------------------------------
    this.lantern = new Lantern();
    // the brass lantern stands front-right on the desk
    this.lantern.root.position.set(0.165, this.top, D - 0.05);
    this.lantern.root.rotation.y = 0.35; // the hook leans in toward the village
    this.root.add(this.lantern.root);
    this.hemi = new HemisphereLight(new Color('#6a70b0'), new Color('#2a1e18'), 0.9);
    this.moon = new DirectionalLight(new Color('#9fb0ff'), 0.35);
    this.moon.position.set(-0.3, 0.6, -0.4);
    this.moon.target.position.set(0, 0, 0.15);
    this.root.add(this.hemi, this.moon, this.moon.target);
    this.setOpen(0);
  }

  /** 0 = shut, 1 = open: the board rises and the village pops up behind it. */
  /** the board (the cover-and-screen leaf): 0 shut .. 1 standing */
  private coverArt!: Mesh;
  private coverKind: CoverKind = 'tale';
  /** dress the board for another book on the shelf */
  setCover(kind: CoverKind): void {
    if (kind === this.coverKind) return;
    this.coverKind = kind;
    const old = this.coverArt.material as MeshStandardMaterial;
    old.map?.dispose();
    old.dispose();
    this.coverArt.material = coverFace(kind);
    this.lantern.setStyle(kind === 'weather' ? 'jar' : 'paper');
  }

  setBoard(v: number): void {
    this.open = v;
    // ease the board: slow start, gentle settle
    const e = v * v * (3 - 2 * v);
    this.board.rotation.x = (Math.PI / 2) * (1 - e);
  }

  /** the lantern: 0 folded flat into the page .. 1 standing (with a little overshoot) */
  setLanternFold(v: number): void {
    const le = v < 1 ? 1 - Math.pow(1 - v, 3) + Math.sin(v * Math.PI) * 0.12 : 1;
    const L = this.lantern;
    L.root.scale.setScalar(Math.max(0.001, le));
    // only the meshes hide: a light under a hidden parent drops out of the light set, and every lit
    // shader would be rebuilt the moment the lantern unfolds (its intensity is 0 while folded anyway)
    const on = v > 0;
    for (const c of L.root.children) c.visible = on || c === L.bulb;
    L.show(on);
  }

  /** all three together (old callers) */
  setOpen(v: number): void {
    this.setBoard(v);
    this.scene?.setRise(v);
    this.setLanternFold(Math.min(1, Math.max(0, (v - 0.55) / 0.45)));
  }

  /** Show a page's scene (replacing the current one). It starts folded flat. */
  setScene(scene: Scene): void {
    if (this.scene) {
      this.scene.root.removeFromParent();
      this.scene.screenProps.removeFromParent();
    }
    this.scene = scene;
    this.stageRoot.add(scene.root);
    this.board.add(scene.screenProps);
  }

  /** World position of a point on the screen, in screen-local metres (x from centre, y from the bottom). */
  screenPoint(x: number, y: number, out = new Vector3()): Vector3 {
    return this.board.localToWorld(out.set(x, y, 0.002));
  }
}

/** The paper lantern on its little hooked post. */
export class Lantern {
  readonly root = new Group();
  readonly light: PointLight;
  readonly bulb: Group;
  private paperMat: MeshStandardMaterial;
  private glow: Mesh;
  /** 0 (dark) .. 1 (lit) */
  level = 0;
  /** extra dimming (pause) */
  dim = 1;
  /** a palm is over it (0..1): it dims under the hand at once, so the reader knows it has seen them */
  cover = 0;
  private t = 0;
  /** which lantern hangs on the hook: the tale's paper lantern, or a jar of light (The Four Elements) */
  style: 'paper' | 'jar' = 'paper';
  private jarMat!: MeshStandardMaterial;
  private flies: Mesh[] = [];
  private shown = false;

  setStyle(s: 'paper' | 'jar'): void {
    this.style = s;
    this.show(this.shown);
  }

  /** show or hide the lantern's parts (the light itself always stays in the scene) */
  show(on: boolean): void {
    this.shown = on;
    for (const c of this.bulb.children) c.visible = c === this.light || (on && (!c.userData.style || c.userData.style === this.style));
  }

  constructor() {
    this.root.name = 'Lantern';
    const postMat = new MeshStandardMaterial({ color: new Color('#2a211d'), roughness: 0.7, metalness: 0.2 });
    // the post rises from the near edge and hooks forward (toward the screen)
    const curve = new CatmullRomCurve3([new Vector3(0, 0, 0.01), new Vector3(0, 0.12, 0.012), new Vector3(0, 0.175, -0.01), new Vector3(0, 0.168, -0.04)]);
    const post = new Mesh(new TubeGeometry(curve, 24, 0.0025, 6, false), postMat);
    post.name = 'Lantern post';
    const foot = new Mesh(new CylinderGeometry(0.014, 0.018, 0.006, 16), postMat);
    foot.position.set(0, 0.003, 0.01);
    this.bulb = new Group();
    this.bulb.position.set(0, 0.126, -0.04);
    // paper body: a lathe profile (a soft round lantern with ribs implied by the texture)
    const pts: Vector2[] = [];
    for (let k = 0; k <= 16; k++) {
      const a = (k / 16) * Math.PI;
      pts.push(new Vector2(0.005 + Math.sin(a) * 0.019, -Math.cos(a) * 0.026));
    }
    this.paperMat = new MeshStandardMaterial({ color: new Color('#f7e2bc'), emissive: new Color('#ffb066'), emissiveIntensity: 0, roughness: 1, map: lanternTexture(), emissiveMap: lanternTexture() });
    const body = new Mesh(new LatheGeometry(pts, 20), this.paperMat);
    body.name = 'Lantern paper';
    const capMat = new MeshStandardMaterial({ color: new Color('#1e1714'), roughness: 0.6 });
    const capTop = new Mesh(new CylinderGeometry(0.008, 0.011, 0.006, 14), capMat);
    capTop.position.y = 0.028;
    const capBot = new Mesh(new CylinderGeometry(0.011, 0.008, 0.005, 14), capMat);
    capBot.position.y = -0.028;
    const string = new Mesh(new CylinderGeometry(0.0007, 0.0007, 0.012, 4), capMat);
    string.position.y = 0.037;
    // a soft additive halo (reads as light in passthrough too)
    this.glow = new Mesh(new PlaneGeometry(0.11, 0.11), new MeshBasicMaterial({ map: glowTexture(), transparent: true, opacity: 0, blending: AdditiveBlending, depthWrite: false }));
    this.glow.name = 'Lantern halo';
    this.light = new PointLight(new Color('#ffb062'), 0, 2.0, 2);
    for (const m of [body, capTop, capBot, string]) m.userData.style = 'paper';
    this.bulb.add(body, capTop, capBot, string, this.glow, this.light);
    // ---- the jar of light (Ottilie's jars): frosted glass, a brass lid, a wire handle, and three
    // slow sparks of bottled daylight inside
    {
      const jar: Vector2[] = [
        new Vector2(0.0005, -0.029), new Vector2(0.019, -0.029), new Vector2(0.0215, -0.025), new Vector2(0.0215, 0.01),
        new Vector2(0.019, 0.017), new Vector2(0.0145, 0.021), new Vector2(0.0145, 0.026), new Vector2(0.0165, 0.0275),
      ];
      this.jarMat = new MeshStandardMaterial({ color: new Color('#fff3d6'), emissive: new Color('#ffcf7a'), emissiveIntensity: 0, roughness: 0.35, metalness: 0, transparent: true, opacity: 0.66, depthWrite: false });
      const glass = new Mesh(new LatheGeometry(jar, 20), this.jarMat);
      glass.name = 'Lantern jar';
      glass.renderOrder = 2;
      const brass = new MeshStandardMaterial({ color: new Color('#b88a3e'), roughness: 0.45, metalness: 0.6 });
      const lid = new Mesh(new CylinderGeometry(0.0172, 0.0172, 0.006, 18), brass);
      lid.position.y = 0.0295;
      // a brass ring round its foot
      const band = new Mesh(new CylinderGeometry(0.0222, 0.0222, 0.0035, 20), brass);
      band.position.y = -0.0265;
      const handle = new Mesh(new TubeGeometry(new CatmullRomCurve3([new Vector3(-0.0165, 0.029, 0), new Vector3(-0.012, 0.04, 0), new Vector3(0, 0.0445, 0), new Vector3(0.012, 0.04, 0), new Vector3(0.0165, 0.029, 0)]), 12, 0.0008, 5, false), brass);
      const brassParts = new Group();
      brassParts.add(lid, band, handle);
      mergeStatic(brassParts, 'Jar brass');
      const parts: (Mesh | Group)[] = [glass, brassParts];
      for (let i = 0; i < 3; i++) {
        const fly = new Mesh(new SphereGeometry(0.0022, 8, 6), new MeshBasicMaterial({ color: new Color('#fff3c0'), transparent: true, opacity: 0, depthWrite: false }));
        fly.name = 'Bottled light';
        fly.renderOrder = 1;
        this.flies.push(fly);
        parts.push(fly);
      }
      for (const m of parts) {
        m.userData.style = 'jar';
        m.visible = false;
        this.bulb.add(m);
      }
    }
    this.root.add(post, foot, this.bulb);
  }

  /** world position of the flame */
  flame(out = new Vector3()): Vector3 {
    return this.bulb.getWorldPosition(out);
  }

  update(dt: number, cameraPos: Vector3): void {
    this.t += dt;
    // a living flame: two slow noises + a rare small gutter
    const f = 0.9 + 0.06 * Math.sin(this.t * 7.3) + 0.04 * Math.sin(this.t * 13.1 + 1.7) + 0.03 * Math.sin(this.t * 2.1);
    const l = this.level * this.dim * f;
    this.light.intensity = 0.11 * l;
    // (only the lantern's own glow answers the palm: the light on the page stays, the picture is not disturbed)
    const own = l * (1 - 0.6 * this.cover);
    this.paperMat.emissiveIntensity = 0.85 * own;
    if (this.style === 'jar') {
      this.jarMat.emissiveIntensity = 1.05 * own;
      // the bottled light drifts round inside the glass
      for (let i = 0; i < this.flies.length; i++) {
        const a = this.t * (0.7 + i * 0.23) + i * 2.1;
        this.flies[i].position.set(Math.cos(a) * 0.009, -0.006 + Math.sin(a * 1.3 + i) * 0.012, Math.sin(a) * 0.009);
        (this.flies[i].material as MeshBasicMaterial).opacity = Math.min(1, l * (0.75 + 0.25 * Math.sin(this.t * 3 + i * 1.9)));
      }
    }
    (this.glow.material as MeshBasicMaterial).opacity = 0.4 * own;
    this.glow.lookAt(cameraPos);
  }
}

// ---- generated textures -------------------------------------------------------------------

export type CoverKind = 'tale' | 'weather';

function coverFace(kind: CoverKind = 'tale'): MeshStandardMaterial {
  const t = kind === 'weather' ? weatherCoverTexture() : coverTexture();
  return new MeshStandardMaterial({ map: t, emissiveMap: t, emissive: new Color('#ffffff'), emissiveIntensity: 0.32, roughness: 0.8 });
}

function coverTexture(): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 384;
  const g = c.getContext('2d')!;
  g.fillStyle = '#24264a';
  g.fillRect(0, 0, 512, 384);
  // cloth weave
  for (let y = 0; y < 384; y += 3) {
    g.fillStyle = `rgba(255,255,255,${0.015 + (y % 6 ? 0 : 0.012)})`;
    g.fillRect(0, y, 512, 1);
  }
  g.strokeStyle = '#c99a48';
  g.lineWidth = 3;
  g.strokeRect(22, 22, 468, 340);
  g.lineWidth = 1;
  g.strokeRect(30, 30, 452, 324);
  g.fillStyle = '#d7a24a';
  g.textAlign = 'center';
  g.font = 'italic 600 52px Georgia, "Times New Roman", serif';
  g.fillText('Borrowed Shade', 256, 150);
  g.font = 'italic 22px Georgia, "Times New Roman", serif';
  g.fillText('a tale for one lantern and two hands', 256, 188);
  // a small lantern emblem
  g.beginPath();
  g.ellipse(256, 272, 26, 34, 0, 0, Math.PI * 2);
  g.stroke();
  g.lineWidth = 2;
  for (const dx of [-12, 0, 12]) {
    g.beginPath();
    g.ellipse(256, 272, Math.abs(dx) ? 26 - Math.abs(dx) : 2, 34, 0, 0, Math.PI * 2);
    g.stroke();
  }
  g.fillRect(246, 232, 20, 6);
  g.fillRect(246, 306, 20, 6);
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  // shut, the cover lies face-up with its top edge away from the reader
  t.center.set(0.5, 0.5);
  t.rotation = Math.PI;
  return t;
}

/** The Four Elements: slate-blue cloth, a gilt weathervane over four little jars */
function weatherCoverTexture(): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 384;
  const g = c.getContext('2d')!;
  g.fillStyle = '#3a4d63';
  g.fillRect(0, 0, 512, 384);
  for (let x = 0; x < 512; x += 3) {
    g.fillStyle = `rgba(255,255,255,${0.014 + (x % 6 ? 0 : 0.01)})`;
    g.fillRect(x, 0, 1, 384);
  }
  g.strokeStyle = '#d9b46a';
  g.lineWidth = 3;
  g.strokeRect(22, 22, 468, 340);
  g.fillStyle = '#e6c27a';
  g.textAlign = 'center';
  g.font = 'italic 600 50px Georgia, "Times New Roman", serif';
  g.fillText('The Four Elements', 256, 132);
  g.font = 'italic 21px Georgia, "Times New Roman", serif';
  g.fillText('air, water, fire and earth, for two hands', 256, 176);
  // four little jars along the bottom
  for (const [i, label] of ['A', 'W', 'F', 'E'].entries()) {
    const x = 196 + i * 40;
    g.strokeStyle = '#e6c27a';
    g.lineWidth = 2;
    g.strokeRect(x - 11, 316, 22, 26);
    g.fillRect(x - 8, 310, 16, 6);
    g.font = '600 13px Georgia, serif';
    g.fillText(label, x, 334);
  }
  // the weathervane: a pole, an arrow, a little cockerel-less cloud, N S E W
  g.strokeStyle = '#e6c27a';
  g.lineWidth = 3;
  g.beginPath();
  g.moveTo(256, 236);
  g.lineTo(256, 302);
  g.moveTo(206, 262);
  g.lineTo(306, 262);
  g.stroke();
  g.beginPath();
  g.moveTo(306, 262);
  g.lineTo(292, 254);
  g.lineTo(292, 270);
  g.closePath();
  g.fill();
  g.beginPath();
  g.moveTo(206, 262);
  g.lineTo(196, 252);
  g.lineTo(214, 252);
  g.lineTo(222, 262);
  g.lineTo(214, 272);
  g.lineTo(196, 272);
  g.closePath();
  g.fill();
  for (const [dx, r] of [[-14, 11], [0, 15], [15, 10]] as const) {
    g.beginPath();
    g.arc(256 + dx, 300, r, Math.PI, 0);
    g.fill();
  }
  g.fillRect(238, 299, 36, 6);
  g.font = '600 16px Georgia, serif';
  g.fillText('N', 256, 232);
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  t.center.set(0.5, 0.5);
  t.rotation = Math.PI;
  return t;
}

function lanternTexture(): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 64;
  const g = c.getContext('2d')!;
  const grad = g.createLinearGradient(0, 0, 0, 64);
  grad.addColorStop(0, '#d9a868');
  grad.addColorStop(0.5, '#fff0d2');
  grad.addColorStop(1, '#d9a868');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 64);
  g.fillStyle = 'rgba(110,60,25,0.55)';
  for (let x = 0; x < 128; x += 11) g.fillRect(x, 0, 2, 64); // ribs
  g.fillStyle = 'rgba(160,40,30,0.35)';
  g.fillRect(0, 28, 128, 8); // a red paper band
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  return t;
}

let glowTex: CanvasTexture | undefined;
export function glowTexture(): CanvasTexture {
  if (glowTex) return glowTex;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, 'rgba(255,190,110,1)');
  grad.addColorStop(0.25, 'rgba(255,150,70,0.45)');
  grad.addColorStop(1, 'rgba(255,120,40,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  glowTex = new CanvasTexture(c);
  glowTex.colorSpace = SRGBColorSpace;
  return glowTex;
}
