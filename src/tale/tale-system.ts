import {
  Quaternion,
  AdditiveBlending,
  BackSide,
  Box3,
  BufferGeometry,
  Color,
  createSystem,
  DoubleSide,
  Group,
  LineDashedMaterial,
  LineLoop,
  Mesh,
  MeshBasicMaterial,
  CanvasTexture,
  DataTexture,
  LinearFilter,
  RedFormat,
  UnsignedByteType,
  PlaneGeometry,
  SphereGeometry,
  SRGBColorSpace,
  RingGeometry,
  Shape,
  ShapeGeometry,
  Vector2,
  Vector3,
  type Object3D,
} from '@iwsdk/core';
import type { AudioEngine } from '../audio/engine.js';
import { classify, HandReader, type HandReading, type Side } from '../lab/hands.js';
import { stage } from '../world/stage.js';
import { Actor, person, popEase, puppet } from './actors.js';
import * as A from './art.js';
import * as B from './art2.js';
import { Book, BOOK, glowTexture } from './book.js';
import { Captions } from './captions.js';
import { CAST, circle } from './cast.js';
import { Theatre } from './env.js';
import { Hollow } from './hollow.js';
import { RoomWeather } from '../weather/room-weather.js';
import { PaperCard, PaperProgramme } from './menu.js';
import { HandWall } from './wall.js';
import { clearBookmark, loadBookmark, PAGE_TITLES, saveBookmark, unpack, type Bookmark } from './bookmark.js';
import { loadComfort, saveComfort, volumeGain, type Comfort } from './comfort.js';
import { TaleMusic } from './music.js';
import { disposeTree, flat, paper } from './paper.js';
import type { Scene } from './scenes.js';
import { ScreenField } from './screen-field.js';
import { Filler } from './filler.js';
import { FillHold } from './fill-core.js';
import { PlateCanvas, PLATES, placeCentred, Seal, type Placed } from './plates.js';
import { AdviceSlip } from './captions.js';
import { lightUniforms, ScreenAct, type ScreenActSpec, type ScreenHost, type TargetSpec } from './screen-acts.js';
import { drawVision } from './vision.js';
import { LanternRoom, type RoomHost } from './lantern-room.js';
import { KeepTray } from './tray.js';
import { Shelf, type ShelfItem } from './shelf.js';

/** what stands on the bookshelf (items join when they are ready) */
const SHELF_ITEMS: ShelfItem[] = [
  { id: 'tale', title: 'Borrowed Shade', color: '#2c3e6b', ink: '#f0d69a', size: [0.03, 0.115, 0.085] },
  { id: 'weather', title: 'The Four Elements', sub: 'Ottilie’s jars', color: '#3a4d63', ink: '#e6c27a', size: [0.028, 0.108, 0.082] },
  { id: 'room', title: 'Shadow Practice', sub: 'The Lantern Room', color: '#2e2a40', ink: '#f3e6cc', size: [0.026, 0.1, 0.08] },
];
const HINT_KEY = 'borrowedShade.desk.hinted.v1';
import { lanternRoomScene } from './scenes.js';
import { ShadowHands } from './hand-filter.js';
import { HAND_LAYER, HAND_PX, ShadowCaster } from './shadow.js';
import { WEATHER_PAGES, type WeatherFx } from '../weather/weather-story.js';
import { WeatherSky } from '../weather/weather-fx.js';
import { Made, type Element } from '../weather/made.js';
import { DeskLife } from './desk-life.js';

/** until the weather is built: nothing happens, quietly */
const NO_WEATHER: WeatherFx = { cloud() {}, cloudX: 0, tagX: 0, rain() {}, wind() {}, warm() {}, storm() {}, tagalong() {}, tagSize() {}, setShelf() {}, puff() {}, reset() {} };
import { PAGES, type ActSpec, type BeatSpec, type Director, type PageDef, type Size, type Step, type TaleState } from './story.js';

/**
 * BORROWED SHADE: the director. Plays the tale in the book: pages, captions,
 * hand beats (your shadow becomes a paper character), page turns, the actors
 * walking from page to page, the Hollow, the climax, pause and the end card.
 *
 * Inputs (hands only): poke the cover; make a shadow in the light; turn the
 * page (sweep a flat hand across the book, or touch the glowing corner); hold
 * an open palm over the lantern to pause; poke paper buttons.
 * Desktop: a click stands in for the hands. ?demo plays itself. ?fast for tests.
 */

/** the desk, below the eye (m): raised twice after playtests */
const TABLE_Y = -0.34;
const HINGE_Z = -0.57;
/** the shadow light: behind the hands at chest height, in front of the book (book-local) */
const SHADOW_LIGHT = new Vector3(0.04, 0.22, BOOK.D + 0.2);
const LESSON_KEY = 'borrowedShade.lesson.v1';
/** what has been read to the end: { fox, owl, keep, wings } */
const READ_KEY = 'borrowedShade.read.v1';
/** first reading gets the lesson; ?lesson forces it, ?nolesson / ?demo / ?fast skip it */
function lessonWanted(): boolean {
  const q = new URLSearchParams(location.search);
  if (q.has('lesson')) return true;
  if (q.has('nolesson') || q.has('demo') || q.has('fast')) return false;
  try {
    return localStorage.getItem(LESSON_KEY) !== 'done';
  } catch {
    return true;
  }
}
function lessonDone(): void {
  try {
    localStorage.setItem(LESSON_KEY, 'done');
  } catch {
    /* private window: the lesson comes back next time */
  }
}

/** the puppeteer zone (book-local): where a seated reader's hand rests to cast */
const ZONE = new Vector3(0, 0.16, 0.33);
/** every outline is centred on this screen height (board-local) */
const BAND_Y = 0.165;
/** an average adult hand, wrist crease to middle fingertip (m) */
const HAND_LEN = 0.185;
/** screen metres per hand metre for that hand (a 0.185 m hand fills a 0.115 m outline) */
const HAND_S = 0.62;
/** the help ladder (seconds with a hand in the light) */
/** plates sit with their box centred here (board y): below the caption, in the beam's sweet band */
const PLATE_Y = 0.13;
/** two-hand plates and the one-hand version offered after 5 s with one hand in the light */
const ONE_HAND: Record<string, string> = { wings: 'wing1', boat: 'boat1', woolsack: 'woolsack1', streamer: 'streamer1' };
/**
 * Signs whose hands can go either way round: the mirror is
 * scored at the same spot, never drawn, so either hand order (or either hand, one-handed) counts.
 */
const MIRROR: Record<string, string> = { boat: 'boat_m', boat1: 'boat1_m', wing1: 'wing1_m', streamer: 'streamer_m', ember: 'ember_m', streamer1: 'streamer1_m', ember1: 'ember1_m', rake1: 'rake1_m', mountain: 'mountain_m', mountain1: 'mountain1_m' };
/** plates that are kinder than the usual mark (the climax wings) */
const PLATE_PASS: Record<string, number> = { wings: 0.6, wing1: 0.62, wing1_m: 0.62 };
/** how a choice names its options on the advice slip */
const CHOICE_NAMES: Record<string, string> = { fox: 'Fox', owl: 'Owl', keep: 'Tower', wings: 'Wings' };
const LINE_INK = new Color('#3a2228');
const LINE_WARM = new Color('#ffcf8a');
const LINE_GOLD = new Color('#fff4d0');
const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** where the paper hills' shadows fall on the screen (board-local x -> y), measured per scene */
const RIDGES: Record<string, [number, number][]> = {
  hills: [[-0.24, 0.05], [-0.2, 0.058], [-0.12, 0.073], [-0.06, 0.08], [-0.02, 0.09], [0.02, 0.084], [0.06, 0.069], [0.1, 0.057], [0.18, 0.053], [0.24, 0.036]],
  farBank: [[-0.24, 0.042], [-0.2, 0.042], [-0.12, 0.041], [-0.06, 0.049], [0, 0.059], [0.04, 0.05], [0.08, 0.039], [0.12, 0.036], [0.24, 0.036]],
  bigHill: [[-0.24, 0.0], [-0.18, 0.02], [-0.1, 0.064], [-0.06, 0.087], [0, 0.103], [0.06, 0.087], [0.1, 0.064], [0.18, 0.02], [0.24, 0.0]],
};
function ridge(name: string, x: number): number {
  const t = RIDGES[name];
  if (x <= t[0][0]) return t[0][1];
  for (let i = 1; i < t.length; i++) {
    if (x <= t[i][0]) {
      const [x0, y0] = t[i - 1];
      const [x1, y1] = t[i];
      return y0 + ((x - x0) / (x1 - x0)) * (y1 - y0);
    }
  }
  return t[t.length - 1][1];
}


type Phase = 'waiting' | 'arrive' | 'cover' | 'opening' | 'ignite' | 'page' | 'turning' | 'end';

interface GapView {
  /** the option (cast id) */
  id: string;
  /** a hidden mirror of another gap's plate (scored, never drawn) */
  alt?: boolean;
  /** the plate it asks for */
  plate: string;
  placed: Placed;
  /** plate box centre on the screen (board-local) */
  centre: Vector2;
  /** plate base centre (board-local) */
  at: Vector2;
  /** what the reader sees (75 = it fits) */
  pct: number;
}

interface ActRun {
  spec: ActSpec;
  targets: Vector3[];
  marks: Mesh[];
  /** the live target */
  k: number;
  /** time on the live target */
  tk: number;
  t: number;
  hold: number;
  stroke: Record<Side, { z: number; t: number; spent?: boolean } | null>;
  idle: number;
  letGo: boolean;
  /** a short rest after each hit (one stroke is one stroke) */
  cool: number;
  /** a mark has resolved by itself: the rest follow quickly unless the reader joins in */
  auto: boolean;
}

interface BeatRun {
  spec: BeatSpec;
  state: 'asking' | 'accepted' | 'peel' | 'done';
  t: number;
  hint: boolean;
  gaps: GapView[];
  chosen: { id: string; size: Size; gap: GapView } | null;
  /** seconds with a hand in the light (drives the help ladder) */
  tHand: number;
  /** 0 asking, 1 advice, 2 missing parts glow, 3 a quiet assist */
  rung: 0 | 1 | 2 | 3;
  /** seconds with exactly one hand in the light; a one-hand plate was offered */
  oneHandT: number;
  oneHanded: boolean;
  /** the most hands seen helping on the plate in the last moments */
  handsOn: number;
  handsT: number;
  lent: boolean;
  /** the pass mark (gentle 0.65 / standard 0.75) */
  pass: number;
  /** seconds with no shadow on the screen */
  noShadowT: number;
  peelFrom: Vector3;
  shadow: Mesh | null;
  puppet: Actor | null;
  landAt: Vector3;
}

export class TaleSystem extends createSystem({}) implements Director {
  phase: Phase = 'waiting';
  st: TaleState = { route: null, ending: null, size: {}, made: [], lesson: false, hat: null, marks: {}, kept: [], lost: [] };
  /** seconds a hand has been in the light (the lesson waits for it) */
  beamT = 0;
  private flags = new Set<string>();
  private captionBeforePause = '';
  private nudged = 0;
  book!: Book;
  hollow!: Hollow;
  private roomWeather!: RoomWeather;
  music!: TaleMusic;
  private shadow!: ShadowCaster;
  /** the whole screen's hand shadow, a few times a second */
  field!: ScreenField;
  /** scores the shadow against the live plates */
  filler!: Filler;
  private plateCanvas!: PlateCanvas;
  private seal!: Seal;
  private advice!: AdviceSlip;
  /** the bookshelf on the desk: touch a spine to choose */
  shelf!: Shelf;
  private deskLife!: DeskLife;
  /** a book chosen while another was open: it opens as soon as the first has closed */
  private pendingChoice: string | null = null;
  /** the tale reached its last page (the corner or the lantern now closes the book) */
  private finished = false;
  /** the keeping tray: what your shadow saved stands on the desk */
  tray!: KeepTray;
  /** the running screen act (cover, road, wall, catch, hide, perch) */
  screenAct: ScreenAct | null = null;
  private screenHost!: ScreenHost;
  /** the shadow captured when the reader first covered the sun (the Hollow shows it back) */
  echoMask: Uint8Array | null = null;
  /** live shader values for the plate */
  private plateFx = { on: 0, fade: 0, hint: 0, done: 0 };

  /** the reader's hand length (m), measured from open hands; sets the beam scale */
  handLen = HAND_LEN;
  private handLenSamples = 0;
  /** the beam: zone centre (book-local) and screen target (board-local) */
  private zoneLocal = ZONE.clone();
  private s0 = new Vector2(0, BAND_Y);
  private beamScale = HAND_S;
  private captions!: Captions;
  private theatre!: Theatre;
  private pauseCard!: PaperProgramme;
  /** the reader's settings (kept between readings) */
  comfort: Comfort = loadComfort();
  /** where the tale root glides to (book distance and height) */
  private rootTarget = new Vector3();
  /** "Bring the book to me": wait until the reader sits back and is still */
  private moveWait: { t: number; still: number; last: Vector3 } | null = null;
  private moveLine = '';
  /** a dusk veil over the room (mixed reality, "Dim") */
  private veil!: Mesh;
  private endCard!: PaperCard;
  private root = new Group();
  private readers = { left: new HandReader('left'), right: new HandReader('right') };
  /** the smoothed hands that cast the shadow (the seen hands stay raw) */
  readonly shadowHands = new ShadowHands();
  readonly hands: Record<Side, HandReading | undefined> = { left: undefined, right: undefined };
  private taggedModels = new Set<Object3D>();
  private t = 0;
  private phaseT = 0;
  private calibrateIn = 0.4;
  // pages and script
  private pageIdx = -1;
  private page: PageDef | null = null;
  private steps: Step[] = [];
  private stepIdx = 0;
  private stepT = 0;
  private stepStarted = false;
  private stepHold = 0;
  /** lines shown since the tale began (the first few are held longer) */
  private linesShown = 0;
  private preLine = 0;
  private beatDue = -1;
  turnReady = false;
  private turnReadyT = 0;
  private turnNext: (() => void) | null = null;
  private sweep = { x: 0, t: 0, side: null as Side | null };
  // beats
  beat: BeatRun | null = null;
  act: ActRun | null = null;
  private markGeo = new PlaneGeometry(0.034, 0.034);
  private markTex = glowTexture();
  // actors
  private actors = new Map<string, Actor>();
  private amaActor!: Actor;
  private amaMoodNow: 'still' | 'crying' | 'happy' = 'still';
  private tears: Mesh[] = [];
  private amaShadow!: Mesh;
  private amaLantern!: Group;
  // screen pieces
  private bigMoon!: Mesh;
  private moonTarget = { y: 0.24, size: 0, x: 0.075 };
  private moonNow = { y: 0.24, size: 0, x: 0.075 };
  private walkers: Mesh[] = [];
  private marchers: Mesh[] = [];
  private marchOn = false;
  private farLampMesh!: Mesh;
  private corner!: Mesh;
  private sheetPivot = new Group();
  private sheetMat!: MeshBasicMaterial | import('@iwsdk/core').MeshStandardMaterial;
  private lampsLit = 0;
  /** story timers: run in story time (pause-aware), cleared on every page change */
  private timers: { t: number; fn: () => void }[] = [];
  /** shadows running down the hill (keep ending) */
  private runners: Mesh[] = [];
  /** what each page made (so "Replay this page" can take it back) */
  private madeOnPage = new Map<number, string[]>();
  // pause, modes
  paused = false;
  private palmT = 0;
  roomVisible = true;
  private isAR = false;
  demo = false;
  private demoT = 0;
  private demoLoop = 0;
  private fast = 1;
  private forceRoute: 'fox' | 'owl' | null = null;
  private forceEnding: 'keep' | 'wings' | null = null;
  // misc
  private tmpA = new Vector3();
  private tmpB = new Vector3();
  private tmpC = new Vector3();
  private head = new Vector3();
  private fwd = new Vector3();
  private lastTip: Vector3[] = [];
  readonly logs: string[] = [];
  handInBeam: { side: Side; pose: string | null; board: [number, number] } | null = null;

  /** the current page's pop-up scene */
  get pageScene(): Scene {
    return this.book.scene!;
  }

  init(): void {
    this.globals.tale = this;
    for (const s of ['left', 'right'] as const) this.input.xr.multiPointers[s].toggleSubPointer('ray', false);
    const params = new URLSearchParams(location.search);
    this.fast = params.has('fast') ? Math.min(1, Math.max(0.05, parseFloat(params.get('fast') || '') || 0.12)) : 1;
    const r = params.get('route');
    this.forceRoute = r === 'fox' || r === 'owl' ? r : null;
    const e = params.get('ending');
    this.forceEnding = e === 'keep' || e === 'wings' ? e : null;

    this.shadow = new ShadowCaster();
    this.field = new ScreenField(this.shadow);
    this.filler = new Filler(this.field);
    this.plateCanvas = new PlateCanvas();
    this.seal = new Seal();
    this.advice = new AdviceSlip();
    this.captions = new Captions();
    this.book = new Book(this.shadow.material, this.captions.material);
    // every pass sees the same lights (the shadow cameras see only their own layers: without this the
    // light set flips twice a frame and three.js re-validates every lit material each time)
    for (const l of [this.book.hemi, this.book.moon, this.book.lantern.light]) {
      l.layers.enable(BOOK.SHADOW_LAYER);
      l.layers.enable(HAND_LAYER);
    }
    {
      // the caption's paper ribbon: its own layer behind the ink (painted once, never per frame)
      const ribbon = new Mesh(new PlaneGeometry(BOOK.W - 0.05, BOOK.captionH), this.captions.ribbonMaterial);
      ribbon.name = 'Caption ribbon';
      ribbon.position.z = -0.0002;
      ribbon.renderOrder = 19;
      this.book.captionMesh.add(ribbon);
    }
    this.music = new TaleMusic(this.globals.audio as AudioEngine);
    {
      // the audio context's state is in the log (a silent tale is then explainable)
      const ae = this.globals.audio as AudioEngine;
      ae.ctx.addEventListener('statechange', () => this.log(`audio:${ae.ctx.state}`));
      this.log(`audio:${ae.ctx.state} vol:${JSON.stringify(this.comfort.volume)}`);
    }
    this.hollow = new Hollow();
    this.book.board.add(this.hollow.root);
    {
      const u = this.shadow.material.uniforms;
      u.uPlate.value = this.plateCanvas.texture;
      this.seal.mesh.position.set(0.195, 0.222, 0.0036);
      this.book.board.add(this.seal.mesh);
      // (its top edge stays where it was; a second line hangs lower)
      this.advice.mesh.position.set(-0.02, 0.233, 0.0035);
      this.book.board.add(this.advice.mesh);
      this.tray = new KeepTray(this.book.top);
      // "Yours.": the hand on the wall, in the dark behind the book (high enough to clear the screen)
      this.wall = new HandWall();
      this.wall.mesh.position.set(0, this.book.top + 0.95, -1.9);
      this.book.root.add(this.wall.mesh);
      const sky = new WeatherSky(this.field);
      this.book.board.add(sky.root);
      this.wx = sky;
      this.sky = sky;
      this.made = new Made(sky);
      this.book.board.add(this.made.root);
      // the villagers the Hollow lets go come home to the desk
      this.hollow.onLanded = (_k, x, y) => this.screenHost.keep?.('villager', x, y);
      this.book.root.add(this.tray.root);
      const fromBoard = (bx: number, by: number) => this.book.root.worldToLocal(this.book.board.localToWorld(new Vector3(bx, by, 0.004)));
      this.screenHost = {
        keep: (cell, bx, by, tint) => {
          if (this.mode !== 'tale') return;
          if (cell === 'hat' && this.screenAct?.spec.id !== 'hat') cell = 'villager';
          this.tray.keep(cell, fromBoard(bx, by), tint);
          this.st.kept.push({ cell, act: this.screenAct?.spec.id ?? '', page: this.page?.id ?? '', tint });
          this.log(`keep:${cell}`);
        },
        lose: (cell, _bx, _by, where) => {
          if (this.mode !== 'tale') return;
          if (cell === 'hat' && this.screenAct?.spec.id !== 'hat') cell = 'villager';
          this.st.lost.push({ cell, act: this.screenAct?.spec.id ?? '', page: this.page?.id ?? '', where });
          this.log(`lose:${cell}:${where}`);
        },
        field: this.field,
        board: this.book.board,
        light: lightUniforms(u),
        sound: (k) => {
          if (k === 'step') this.music.step();
          else if (k === 'bell') this.music.bell();
          else if (k === 'break') this.music.puff();
          else if (k === 'tap') this.music.tap();
          else if (k === 'shimmer') this.music.shimmer();
          else if (k === 'rest') this.music.hint();
          else this.music.rustle(0.3);
        },
        log: (m) => this.log(m),
        cov: (v) => (u.uLightCov.value = v),
        target: (t, strong = false) => this.setTarget(t, strong),
        advise: (text) => this.slip(text),
        stamp: () => {
          this.seal.stampPlain();
          this.music.shimmer();
        },
      };
    }

    this.scene.add(this.book.hemi);
    this.root.name = 'Tale';
    this.book.root.position.set(0, TABLE_Y, HINGE_Z);
    this.book.root.visible = false;
    this.theatre = new Theatre(TABLE_Y, HINGE_Z + BOOK.D / 2);
    this.root.add(this.theatre.root, this.book.root);
    stage.group.add(this.root);

    this.shelf = new Shelf();
    this.shelf.setItems(SHELF_ITEMS);
    for (const id of ['tale', 'weather'] as const) if (loadBookmark(id)) this.shelf.setBookmark(id, true);
    // back-left of the desk, up on a little riser: a look up and to the left to see it, a lean to
    // reach it, so a hand working on the book never brushes a spine
    this.shelf.group.position.set(-0.43, TABLE_Y + 0.1, -0.47);
    this.shelf.group.rotation.y = 0.62;
    this.root.add(this.shelf.group);
    // the shelf's twin at the back-right: a paper mobile to play with; paper lanterns in the room
    this.deskLife = new DeskLife(TABLE_Y);
    this.deskLife.onChime = (k) => this.music.chime(k);
    this.root.add(this.deskLife.root);
    // the Four Elements' weather comes off the page into the room
    this.roomWeather = new RoomWeather(TABLE_Y, HINGE_Z + BOOK.D / 2, glowTexture());
    this.root.add(this.roomWeather.root);
    this.deskLife.setEarned(this.earned());

    this.buildAma();
    this.buildScreenPieces();
    this.buildPageTurn();
    this.buildCards();

    const xr = this.renderer.xr;
    const onStart = () => {
      this.calibrateIn = 0.7;
      if (this.paused) this.recardIn = 0.9;
      const mode = xr.getSession()?.environmentBlendMode;
      this.isAR = mode === 'alpha-blend' || mode === 'additive';
      this.setRoom(this.isAR);
      this.log(`session:${mode ?? '?'}`);
      // the system menu or sleep: pause, so the tale never runs on unseen
      const session = xr.getSession();
      session?.addEventListener('visibilitychange', () => {
        if (session.visibilityState !== 'visible' && (this.phase === 'page' || this.phase === 'turning') && !this.paused) this.setPaused(true);
        // back again: the card is put in front of the reader as they sit now
        if (session.visibilityState === 'visible' && this.paused) this.recardIn = 0.6;
      });
    };
    const onEnd = () => {
      // a session that ends mid-page waits, paused, for the reader to come back
      if ((this.phase === 'page' || this.phase === 'turning') && !this.paused) this.setPaused(true);
      this.recardIn = 0;
      this.calibrateIn = 0.1;
      this.isAR = false;
      this.setRoom(false);
    };
    xr.addEventListener('sessionstart', onStart);
    xr.addEventListener('sessionend', onEnd);
    this.cleanupFuncs.push(() => {
      xr.removeEventListener('sessionstart', onStart);
      xr.removeEventListener('sessionend', onEnd);
    });
    this.setRoom(false);
    this.calibrate();

    // on a PC (no headset), a click stands in for the hands
    const onClick = () => {
      if (this.renderer.xr.isPresenting || !this.globals.started || this.paused) return;
      if (this.phase === 'cover') this.openBook();
      else if (this.beat?.state === 'asking') this.autoAccept();
      else if (this.screenAct) this.screenAct.skip();
      else if (this.turnReady) this.turnPage();
      else if (this.endCard.isOpen) this.playAgain();
    };
    this.renderer.domElement.addEventListener('pointerdown', onClick);
    this.cleanupFuncs.push(() => this.renderer.domElement.removeEventListener('pointerdown', onClick));
  }

  // ---- building ---------------------------------------------------------------------------

  private buildAma(): void {
    const ama = this.book.ama;
    ama.removeFromParent();
    ama.position.set(0, 0, 0);
    ama.scale.setScalar(1);
    this.amaActor = new Actor('ama', ama, 1.45);
    this.amaActor.speed = 0.05;
    this.amaActor.hop = 0.004;
    this.amaActor.gait = 'step';
    this.amaActor.visible = false;
    this.book.actors.add(this.amaActor.root);
    this.actors.set('ama', this.amaActor);
    for (let k = 0; k < 3; k++) {
      const tear = flat(A.TEAR, new MeshBasicMaterial({ color: '#cfe4ff', transparent: true, opacity: 0 }), 'Tear');
      tear.scale.setScalar(0.5);
      ama.add(tear);
      this.tears.push(tear);
    }
    // her own shadow, home again at the end (a dark rabbit lying at her heels)
    this.amaShadow = flat(A.RABBIT, new MeshBasicMaterial({ color: '#0d0a14', transparent: true, opacity: 0, depthWrite: false }), 'Ama’s own rabbit');
    this.amaShadow.rotation.x = -Math.PI / 2;
    this.amaShadow.scale.set(0.45, 0.8, 1);
    this.amaShadow.visible = false;
    this.book.actors.add(this.amaShadow);
    // the lantern Tomas gives her
    this.amaLantern = new Group();
    const body = new Mesh(new PlaneGeometry(0.008, 0.011), new MeshBasicMaterial({ color: '#ffd38a' }));
    const halo = new Mesh(new PlaneGeometry(0.035, 0.035), new MeshBasicMaterial({ map: glowTexture(), transparent: true, opacity: 0.5, depthWrite: false }));
    halo.position.z = -0.001;
    this.amaLantern.add(halo, body);
    this.amaLantern.position.set(0.009, 0.022, 0.003);
    this.amaLantern.visible = false;
    ama.add(this.amaLantern);
  }

  private buildScreenPieces(): void {
    const b = this.book.board;
    // the big paper moon (pages 5-7), behind the Hollow
    this.bigMoon = flat(B.FULL_MOON, paper('#f7ecc8', { emissive: '#ffefc0', emissiveIntensity: 0.75 }), 'Big moon');
    this.bigMoon.position.set(0.075, 0.2, 0.0018);
    this.bigMoon.visible = false;
    b.add(this.bigMoon);
    // villagers' shadows walking away (page 1)
    for (const [x, s, path] of [[-0.12, 1.25, A.VILLAGER], [-0.05, 1.1, A.VILLAGER_HAT], [0.02, 1.0, A.VILLAGER]] as const) {
      const w = flat(path, new MeshBasicMaterial({ color: A.PAL.ink, transparent: true, opacity: 0, depthWrite: false }), 'Walking shadow');
      w.scale.setScalar(s);
      w.position.set(x, 0.09, 0.0014);
      w.userData.x0 = x;
      w.visible = false;
      b.add(w);
      this.walkers.push(w);
    }
    // the procession up the hill (owl's view): 8 shadows and Ama's rabbit
    for (let k = 0; k < 9; k++) {
      const isRabbit = k === 5;
      const m = flat(isRabbit ? A.RABBIT : k % 2 ? A.VILLAGER_HAT : A.VILLAGER, new MeshBasicMaterial({ color: A.PAL.ink, transparent: true, opacity: 0, depthWrite: false }), isRabbit ? 'Ama’s rabbit (far)' : 'Marching shadow');
      m.scale.setScalar(isRabbit ? 0.45 : 0.42);
      m.userData.k = k;
      m.userData.rabbit = isRabbit;
      m.visible = false;
      b.add(m);
      this.marchers.push(m);
    }
    // the far lamp at the edge of the map (the hook)
    this.farLampMesh = flat(circle(0, 0, 3.5), new MeshBasicMaterial({ color: '#ffd38a', transparent: true, opacity: 0 }), 'Far lamp');
    this.farLampMesh.position.set(-0.205, 0.06, 0.003);
    const farHalo = new Mesh(new PlaneGeometry(0.018, 0.018), new MeshBasicMaterial({ map: glowTexture(), transparent: true, opacity: 0, depthWrite: false }));
    farHalo.name = 'Far lamp halo';
    farHalo.position.z = -0.0002;
    this.farLampMesh.add(farHalo);
    b.add(this.farLampMesh);
    // shadows running home down the hill (the keep ending)
    for (let k = 0; k < 6; k++) {
      const r = flat(k % 2 ? A.VILLAGER_HAT : A.VILLAGER, new MeshBasicMaterial({ color: A.PAL.ink, transparent: true, opacity: 0, depthWrite: false }), 'Running shadow');
      r.scale.setScalar(0.42);
      r.visible = false;
      r.userData.t = 0;
      b.add(r);
      this.runners.push(r);
    }
  }

  private buildPageTurn(): void {
    // the glowing page corner (front-LEFT, on the desk; the lantern is front-right), touched or swept to turn the page
    this.corner = flat('M 0 0 L 52 0 L 0 52 Z', new MeshBasicMaterial({ color: '#ffd9a0', transparent: true, opacity: 0, depthWrite: false }), 'Page corner');
    this.corner.rotation.x = -Math.PI / 2;
    this.corner.position.set(-BOOK.W / 2 + 0.012, this.book.top + 0.002, BOOK.D - 0.012);
    this.corner.visible = false;
    this.book.root.add(this.corner);
    // the turning sheet: pivots on the left edge of the stage page
    const sheetMat = paper('#e9dcc0', { side: 'double', emissive: '#3a3020', emissiveIntensity: 0.4 }).clone();
    sheetMat.transparent = true;
    const sheet = new Mesh(new PlaneGeometry(BOOK.W - 0.02, BOOK.D - 0.02), sheetMat);
    this.sheetMat = sheetMat;
    sheet.rotation.x = -Math.PI / 2;
    sheet.position.set((BOOK.W - 0.02) / 2, 0, 0);
    this.sheetPivot.add(sheet);
    this.sheetPivot.position.set(-BOOK.W / 2 + 0.01, this.book.top + 0.003, BOOK.D / 2 + 0.002);
    this.sheetPivot.visible = false;
    this.sheetPivot.name = 'Turning page';
    this.book.root.add(this.sheetPivot);
  }

  private buildCards(): void {
    const c = this.comfort;
    this.pauseCard = new PaperProgramme([
      { id: 'pause', label: 'Pause', rows: [
        { kind: 'button', id: 'continue', label: 'Continue' },
        { kind: 'button', id: 'replay', label: 'Replay this page' },
        { kind: 'button', id: 'closebook', label: 'Back to the shelf' },
      ] },
      { id: 'sound', label: 'Sound', rows: [
        { kind: 'slider', id: 'vol-all', label: 'All', value: c.volume.all },
        { kind: 'slider', id: 'vol-music', label: 'Music', value: c.volume.music },
        { kind: 'slider', id: 'vol-sounds', label: 'Sounds', value: c.volume.sounds },
      ] },
      { id: 'reading', label: 'Reading', rows: [
        { kind: 'choice', id: 'text', label: 'Text', options: [['1', 'A'], ['1.25', 'A+'], ['1.5', 'A++']], value: String(c.text) },
        { kind: 'choice', id: 'captions', label: 'Ribbon', options: [['paper', 'Paper'], ['strong', 'Strong']], value: c.captions },
        { kind: 'choice', id: 'pace', label: 'Pace', options: [['usual', 'Usual'], ['slow', 'Slow']], value: c.pace },
      ] },
      { id: 'book', label: 'Book', rows: [
        { kind: 'button', id: 'move', label: 'Bring the book to me' },
        { kind: 'stepper', id: 'distance', label: 'Distance' },
        { kind: 'stepper', id: 'height', label: 'Height' },
        { kind: 'choice', id: 'fps', label: 'Frame rate', options: [['off', 'Off'], ['on', 'On'], ['report', 'Report']], value: c.fps ?? 'off' },
        { kind: 'choice', id: 'room', label: 'Room', options: [['auto', 'Auto'], ['shown', 'Shown'], ['dim', 'Dim'], ['hidden', 'Hidden']], value: c.room },
      ] },
    ]);
    this.pauseCard.group.name = 'Pause card';
    this.endCard = new PaperCard('The end of the first tale', [
      ['again', 'Read it again'],
      ['practice', 'Shadow Practice'],
      ['close', 'Close the book'],
    ], 0.2);
    this.applyComfort();
    // the dusk veil: a soft dark sphere around the reader, for "Dim" in mixed reality
    const veil = new Mesh(new SphereGeometry(2.4, 24, 16), new MeshBasicMaterial({ color: '#0d0a14', transparent: true, opacity: 0.6, side: BackSide, depthWrite: false }));
    veil.name = 'Room veil';
    veil.renderOrder = -10;
    veil.visible = false;
    this.veil = veil;
    this.scene.add(veil);
    this.endCard.group.name = 'End card';
    for (const c of [this.pauseCard, this.endCard]) {
      c.group.position.set(-0.33, TABLE_Y + 0.27, HINGE_Z + 0.2);
      c.group.rotation.y = 0.5;
      this.root.add(c.group);
    }
  }

  /** Put a card front and centre, within easy reach (0.34 m ahead, a little below the eyes), facing the reader. */
  private placeCard(c: PaperCard | PaperProgramme): void {
    this.readHead();
    const w = this.head.clone().addScaledVector(this.fwd, 0.34);
    w.y -= 0.09;
    const local = this.root.worldToLocal(w.clone());
    c.group.position.copy(local);
    const head = this.root.worldToLocal(this.head.clone());
    c.group.rotation.y = Math.atan2(head.x - local.x, head.z - local.z);
  }

  // ---- Director API (used by the story) ---------------------------------------------------

  actor(id: string): Actor | undefined {
    return this.actors.get(id);
  }

  anchor(name: string, dx = 0, dz = 0): Vector3 {
    const s = this.pageScene;
    const a = s?.anchors[name] ?? s?.anchors.char ?? new Vector3(0, this.book.top, 0.18);
    return a.clone().add(new Vector3(dx, 0, dz));
  }

  walk(id: string, anchor: string, dx = 0, dz = 0): void {
    let a = this.actors.get(id);
    if (!a && (id === 'tomas' || id === 'granny')) {
      a = person(id).actor;
      a.visible = false;
      this.book.actors.add(a.root);
      this.actors.set(id, a);
    }
    // a resumed reading: Ama's own rabbit was made on an earlier page
    if (!a && id === 'amarabbit') a = this.ensureAmaRabbit();
    if (!a) return;
    const p = this.anchor(anchor, dx, dz);
    // (never off the page: a puppet's place is on the paper)
    p.x = Math.max(-BOOK.W / 2 + 0.045, Math.min(BOOK.W / 2 - 0.045, p.x));
    if (!a.visible) {
      a.put(p);
      this.reveal(a);
      return;
    }
    // from the near bank to the far one: stone by stone (nobody walks on the water)
    const stones = this.pageScene.props.stones as { position: Vector3 }[] | undefined;
    if (stones?.length && this.phase === 'page' && a.root.position.z > stones[0].position.z && p.z < stones[stones.length - 1].position.z) {
      let at = 0;
      let prev = a.root.position;
      const who = a;
      for (const q of [...stones.map((st) => st.position), p]) {
        const to = q.clone().setY(p.y);
        if (at === 0) who.go(to);
        else this.after(at, () => who.go(to));
        at += Math.hypot(q.x - prev.x, q.z - prev.z) / Math.max(0.03, who.speed);
        prev = q;
      }
      return;
    }
    a.go(p);
  }

  amaMood(m: 'still' | 'crying' | 'happy'): void {
    this.amaMoodNow = m;
  }

  moon(y: number, size: number, x = 0.075): void {
    this.moonTarget = { y, size, x };
    // with the moon behind it, the Hollow's window shows moonlight
    this.hollow.setWindow(x === 0 && size > 1 ? '#f7ecc8' : '#cdd6ff');
  }

  after(sec: number, fn: () => void): void {
    this.timers.push({ t: sec * Math.max(this.fast, 0.35), fn });
  }

  hillRun(): void {
    this.runners.forEach((r, k) => {
      r.visible = true;
      r.userData.t = -k * 0.45;
      r.userData.dir = k % 2 ? 1 : -1;
    });
    this.log('hill-run');
  }

  shadowsWalkAway(): void {
    for (const w of this.walkers) {
      w.visible = true;
      w.userData.t = 0;
    }
  }

  procession(on: boolean): void {
    this.marchOn = on;
    if (on) for (const m of this.marchers) {
      m.visible = true;
      // the rabbit goes first, clear of the others (the caption says "at the very front")
      m.userData.t = m.userData.rabbit ? 0.6 : -(1.6 + 0.5 * (m.userData.k > 5 ? m.userData.k - 1 : m.userData.k));
    }
  }

  lightLamps(): void {
    const lamps = (this.pageScene.props.lamps as Mesh[] | undefined) ?? [];
    lamps.forEach((l, k) => {
      this.after(0.5 + k * 0.65, () => {
        (l.material as unknown as { emissiveIntensity: number }).emissiveIntensity = 1.8;
        this.lampsLit++;
        this.music.hint();
      });
    });
  }

  amaShadowHome(): void {
    this.amaRabbit('ama');
    this.log('ama:shadow-home');
  }

  farLamp(): void {
    this.farLampMesh.userData.on = true;
    this.farLampMesh.visible = true;
    this.log('far-lamp');
  }

  passLantern(): void {
    this.amaLantern.visible = true;
    this.log('lantern:passed');
  }

  // ---- the screen world -------------------------------------------------------------

  private lightAnim: { from: number; to: number; t: number; dur: number } | null = null;
  private lightOn = 0;
  private reach = false;
  private reachT = 0;
  private mapPiece: Group | null = null;
  private mapOn = 0;
  private visionMesh: Mesh | null = null;
  private visionTex: CanvasTexture | null = null;
  private visionOn = 0;
  private visionWant = 0;
  private crossing = { v: 0, from: new Map<string, Vector3>() };

  private tgtWant = 0;
  private tgtStrongT = 0;
  private setTarget(t: TargetSpec | null, strong: boolean): void {
    const u = this.shadow.material.uniforms;
    if (!t) {
      this.tgtWant = 0;
      return;
    }
    (u.uTgtA.value as import('@iwsdk/core').Vector4).set(...t.a);
    if (t.b) (u.uTgtB.value as import('@iwsdk/core').Vector4).set(...t.b);
    (u.uTgtKind.value as Vector2).set(t.kind, t.b ? t.kind : 0);
    this.tgtWant = strong ? 0.9 : 0.15;
    this.tgtStrongT = strong ? 2 : 0;
  }

  private dayAnim: { from: number; to: number; t: number; dur: number; then?: () => void } | null = null;
  /** daylight on the screen (0 dusk .. 1 day), at once or over `sec` */
  day(v: number, sec = 0, then?: () => void): void {
    const u = this.shadow.material.uniforms;
    if (sec <= 0) {
      this.dayAnim = null;
      u.uDay.value = v;
      then?.();
    } else this.dayAnim = { from: u.uDay.value as number, to: v, t: 0, dur: sec, then };
  }

  fadeLight(on: number, sec: number): void {
    this.lightAnim = { from: this.lightOn, to: on, t: 0, dur: Math.max(0.01, sec) };
  }

  light(x: number, y: number, rx: number, ry: number, on: number, color?: string): void {
    this.lightOn = on;
    this.lightAnim = null;
    this.screenHost.light.set(x, y, rx, ry, on, color);
  }

  private adviseT = -1;
  private idleHandsT = 0;
  private restNudgedPage = '';
  advise(text: string, sec?: number): void {
    this.slip(text);
    this.adviseT = sec === undefined ? -1 : sec * this.paceK;
  }

  /** Pace: Slow gives everything that waits on the reader more time (not only the captions) */
  private get paceK(): number {
    return this.comfort.pace === 'slow' ? 1.3 : 1;
  }

  /**
   * THE ADVICE SLIP HAS ONE OWNER. The page writes its advice through slip(); the book's own notices
   * ("Put the controllers down", "The book will wait") outrank it while they last, and when a notice
   * ends the page's advice comes back (a one-shot line like the bird's is never lost to a notice).
   */
  private pageSlip = '';
  private notice = '';
  private slip(text: string): void {
    // anything but advise() itself ends a timed slip's clock (it must not clear a later line)
    this.adviseT = -1;
    this.pageSlip = text;
    if (!this.notice) this.advice.show(text);
  }
  private static readonly CTRL_MSG = 'Put the controllers down. Your hands are all you need.';
  private updateNotice(): void {
    const open = this.phase === 'page' || this.phase === 'turning' || this.phase === 'ignite' || this.phase === 'opening';
    const want = this.controllerSaid && open ? TaleSystem.CTRL_MSG : this.handHeld && this.holdT > 4 ? (this.pageSlip && Math.floor(this.holdT / 5) % 2 === 0 ? this.pageSlip : TaleSystem.HOLD_MSG) : '';
    if (want === this.notice) return;
    this.notice = want;
    this.advice.show(want || this.pageSlip);
  }

  /**
   * THE DESK NOTE: a small paper note standing over the shut book, where a reader looking at the book
   * sees it (the shelf is high at the back-left by design). It says how to begin, asks for bare hands,
   * and after a finished reading names what is still unread.
   */
  private deskNote: Mesh | null = null;
  private deskNoteText = '';
  private deskNoteOn = 0;
  private deskInvite = '';
  private deskInviteT = 0;
  private updateDeskNote(dt: number): void {
    this.deskInviteT = Math.max(0, this.deskInviteT - dt);
    const shut = this.phase === 'cover' && !this.pendingChoice && (!this.resumeFrom || this.controllerSaid);
    const want = !shut ? ''
      : this.controllerSaid ? 'Put the controllers down.|Your hands are all you need.'
      : this.deskInviteT > 0 ? this.deskInvite
      : this.phaseT > 6 ? 'Touch the cover to open the book.' : '';
    if (!this.deskNote) {
      if (!want) return;
      const c = document.createElement('canvas');
      c.width = 1024;
      c.height = 220;
      const tex = new CanvasTexture(c);
      tex.colorSpace = SRGBColorSpace;
      this.deskNote = new Mesh(new PlaneGeometry(0.3, 0.3 * (220 / 1024)), new MeshBasicMaterial({ map: tex, transparent: true, opacity: 0, depthWrite: false }));
      this.deskNote.name = 'Desk note';
      this.deskNote.renderOrder = 20;
      // standing over the back half of the shut book, leaning back toward a seated reader
      this.deskNote.rotation.x = -0.35;
      this.deskNote.position.set(0, this.book.top + 0.13, 0.1);
      this.deskNote.visible = false;
      this.book.root.add(this.deskNote);
    }
    const m = this.deskNote.material as MeshBasicMaterial;
    // a new line is painted while the note is away (it never changes text in view)
    if (want && want !== this.deskNoteText && this.deskNoteOn < 0.02) {
      this.deskNoteText = want;
      const c = m.map!.image as HTMLCanvasElement;
      const g = c.getContext('2d')!;
      g.clearRect(0, 0, c.width, c.height);
      g.fillStyle = 'rgba(250, 241, 222, 0.97)';
      g.fillRect(8, 8, c.width - 16, c.height - 16);
      g.strokeStyle = 'rgba(150, 110, 60, 0.6)';
      g.lineWidth = 4;
      g.strokeRect(8, 8, c.width - 16, c.height - 16);
      g.fillStyle = '#34221e';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      const lines = want.split('|');
      let size = 58;
      const font = (z: number) => `italic 600 ${z}px Georgia, "Times New Roman", serif`;
      g.font = font(size);
      while (size > 34 && lines.some((l) => g.measureText(l).width > c.width - 90)) g.font = font((size -= 2));
      lines.forEach((l, k) => g.fillText(l, c.width / 2, c.height / 2 + 2 + (k - (lines.length - 1) / 2) * size * 1.2));
      m.map!.needsUpdate = true;
    }
    this.deskNoteOn += ((want && want === this.deskNoteText ? 1 : 0) - this.deskNoteOn) * Math.min(1, dt * 4);
    m.opacity = this.deskNoteOn;
    this.deskNote.visible = this.deskNoteOn > 0.01;
  }

  /** a little shadow crossing your bridge: its paper actor on the stage follows from where it stood */
  followWalker(id: string, frac: number, ev?: { state: string; slot: number }): void {
    let a = this.actors.get(id);
    if (!a) return;
    if (!a.visible) {
      // every walker has a desk twin: bring it to the near bank
      a.put(this.anchor(this.pageScene.anchors.near ? 'near' : 'char', -0.02 * (ev?.slot ?? 0), 0));
      a.visible = true;
      a.fold = 0;
    }
    const c = this.crossing;
    if (!c.from.has(id)) c.from.set(id, a.root.position.clone());
    const from = c.from.get(id)!;
    const slots: Record<string, number> = { heron: -0.11, tomas: -0.065, ama: -0.02, rabbit: 0.03, snail: 0.11, fox: 0.075, owl: 0.075 };
    // the far side: the bank if the page has one, else each walker its own place past the gap (never one point)
    const to = this.pageScene.anchors.bank ? this.anchor('bank', slots[id] ?? 0, 0) : this.anchor('char', 0.06 + (slots[id] ?? 0.02) + 0.012 * (ev?.slot ?? 0), 0.01 * (ev?.slot ?? 0));
    // queued (below 0): wait at the near side; walking: on the page, exactly while the shadow is over the gap
    // (a perched walker, the owl on the wall, comes down to walk the road like the others)
    const k = Math.max(0, Math.min(1, frac));
    a.pageY = this.book.top;
    const stones = this.pageScene.props.stones as { position: Vector3 }[] | undefined;
    if (stones?.length) {
      // stone to stone, then one step over your shadow to the bank
      const pts = [from, ...stones.map((st) => st.position), to];
      let total = 0;
      for (let i = 1; i < pts.length; i++) total += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z);
      let want = k * total;
      let p = this.tmpB.copy(to);
      for (let i = 1; i < pts.length; i++) {
        const seg = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z);
        if (want <= seg || i === pts.length - 1) {
          p = this.tmpB.copy(pts[i - 1]).lerp(pts[i], seg > 0 ? Math.min(1, want / seg) : 1);
          break;
        }
        want -= seg;
      }
      a.track(p.setY(this.book.top));
      return;
    }
    a.track(from.clone().lerp(to, k).setY(this.book.top));
  }

  mapReveal(v: number): void {
    const on = v > 0.001;
    if (on && !this.mapPiece) {
      const g = new Group();
      g.name = 'Map drawing';
      const mat = new MeshBasicMaterial({ color: '#4a3326', transparent: true, opacity: 0, depthWrite: false });
      const hill = flat(B.BIG_HILL, mat, 'Map hill');
      hill.scale.setScalar(0.22);
      const tower = flat(B.TOWER, mat, 'Map tower');
      tower.scale.setScalar(0.42);
      tower.position.set(0, 0.022, 0);
      // the sheet of the map itself, held up to the candle: the drawing is on it
      const sheetMat = new MeshBasicMaterial({ color: '#efd9a8', transparent: true, opacity: 0, depthWrite: false });
      const sheet = flat('M -34 -9 L -22 -11 L -8 -9 L 8 -11 L 22 -9 L 34 -10 L 35 12 L 33 34 L 35 50 L 20 52 L 6 50 L -8 52 L -22 50 L -34 52 L -35 30 L -33 10 Z', sheetMat, 'Map sheet');
      sheet.position.z = -0.0002;
      sheet.renderOrder = 9;
      const rim = flat('M -36 -11 L -22 -13 L -8 -11 L 8 -13 L 22 -11 L 36 -12 L 37 12 L 35 34 L 37 52 L 20 54 L 6 52 L -8 54 L -22 52 L -36 54 L -37 30 L -35 10 Z', mat, 'Map rim');
      rim.position.z = -0.0003;
      rim.renderOrder = 8.9;
      hill.renderOrder = tower.renderOrder = 9.1;
      g.add(rim, sheet, hill, tower);
      g.rotation.z = -0.05;
      g.userData.sheet = sheetMat;
      g.position.set(-0.06, 0.125, 0.0033);
      this.book.board.add(g);
      g.userData.mat = mat;
      this.mapPiece = g;
    }
    this.mapOn = Math.max(0, Math.min(1, v));
  }

  hollowReach(on: boolean): void {
    this.reach = on;
    this.reachT = 0;
  }

  longWayHome(): void {
    const off = new Vector3(BOOK.W / 2 + 0.05, this.book.top + 0.1, 0.2);
    this.st.lost.forEach((l, k) => {
      if (l.home) return;
      this.after(0.25 * k, () => this.tray.crumple(l.cell, off));
    });
  }

  trayFlying(): boolean {
    return this.tray.flying;
  }

  trayCrumples(): Vector3[] {
    return this.tray.crumplePoints();
  }

  smoothCrumple(k: number): void {
    this.tray.unfold(0);
    const l = this.st.lost.find((x) => !x.home);
    if (l) l.home = true;
    void k;
  }

  retire(id: string): void {
    const a = this.actors.get(id);
    if (!a?.visible) return;
    a.go(a.root.position.clone().add(new Vector3(0, 0, -0.06)));
    this.after(0.9, () => (a.fold = 1));
    this.after(1.6, () => (a.visible = false));
  }

  private ensureAmaRabbit(): Actor {
    let a = this.actors.get('amarabbit');
    if (!a) {
      // grey paper with one ear folded down (never black: black reads as a shadow)
      a = puppet({ ...CAST.rabbit, id: 'amarabbit', paper: A.RABBIT_BENT, color: '#c9c3d4', glow: undefined, details: [circle(16, 40, 2)] });
      a.setSize(CAST.rabbit.scale * 0.85);
      this.book.actors.add(a.root);
      this.actors.set('amarabbit', a);
      a.visible = false;
    }
    return a;
  }

  amaRabbit(where: 'gorse' | 'ama' | 'away' | 'hollow'): void {
    const a = this.ensureAmaRabbit();
    if (where === 'gorse') {
      a.put(this.anchor('gorse', 0.01, 0.02));
      this.reveal(a);
    } else if (where === 'ama') {
      // on Ama's other side from the borrowed rabbit (it stands at her right), a little forward
      // it comes in from the side and sits in front of her, clear of Tomas and the borrowed rabbit
      if (!a.visible) {
        a.put(this.anchor('ama', -0.12, 0.08));
        this.reveal(a);
      }
      a.go(this.anchor('ama', -0.03, 0.055));
    } else if (where === 'hollow') {
      a.put(this.anchor('ring', 0.05, 0.03));
      this.reveal(a);
    } else {
      a.go(this.anchor('gorse', 0.12, -0.06));
      this.after(2.4, () => {
        const r = this.actors.get('amarabbit');
        if (r) r.visible = false;
      });
    }
    this.log(`ama-rabbit:${where}`);
  }

  /**
   * Show a puppet. Mid-page it stands up at once with a little pop (the page turn left every
   * hidden puppet folded flat, so one revealed later would otherwise lie invisible on the page);
   * during an opening or a turn the cast's own unfold handles it.
   */
  reveal(a: Actor): void {
    a.visible = true;
    if (this.phase === 'page') {
      a.pageY = this.book.top;
      a.fold = 0;
      a.squash = 1.12;
      this.after(0.12, () => (a.squash = 1));
    }
  }

  private followCrossingOld(v: number): void {
    // the travellers on the stage follow their shadows over your bridge (from their bank to the far bank)
    const c = this.crossing;
    if (v <= 0.001) return;
    for (const id of ['heron', 'ama', 'tomas', 'rabbit']) {
      const a = this.actors.get(id);
      if (!a?.visible) continue;
      if (!c.from.has(id)) c.from.set(id, a.root.position.clone());
      const from = c.from.get(id)!;
      const to = this.anchor('bank', id === 'heron' ? -0.05 : id === 'tomas' ? -0.025 : id === 'rabbit' ? 0.03 : 0, 0);
      const lag = id === 'heron' ? 0 : id === 'ama' ? 0.08 : id === 'tomas' ? 0.16 : 0.1;
      const k = Math.max(0, Math.min(1, (v - lag) / (1 - lag)));
      a.go(from.clone().lerp(to, k).setY(a.target.y));
    }
    c.v = v;
  }

  private visionCache = new Map<string, HTMLCanvasElement>();
  private echoDrawn: Uint8Array | null = null;
  /** draw both window pictures ahead of time (on page enter), so showing them never stalls */
  prepareVisions(): void {
    for (const k of ['carts', 'echo'] as const) {
      const c = document.createElement('canvas');
      c.width = 640;
      c.height = 480;
      drawVision(c, k, k === 'echo' ? this.echoMask : null, this.field.st);
      this.visionCache.set(k, c);
    }
    this.echoDrawn = this.echoMask;
    this.vision('carts');
    this.visionWant = 0;
    if (this.visionTex) this.renderer.initTexture(this.visionTex);
  }

  // ---- "Yours.": a replay of the reader's own hand putting out the sun -------------------------------
  private replay: { t: number; t2: number; stage: 'off' | 'in' | 'yours' | 'out'; gold: boolean } = { t: 0, t2: 0, stage: 'off', gold: false };
  private echoTex: DataTexture | null = null;
  private echoBase = 0;
  private replayHollow = 1;
  private replayMoon: { y: number; size: number; x: number } | null = null;

  /** start / turn / end the replay (the story drives it with d.vision('echo' | 'yours' | null)) */
  private replayStage(stage: 'in' | 'yours' | 'out'): void {
    const u = this.shadow.material.uniforms;
    if (stage === 'in') {
      if (!this.echoMask) return;
      // the mask as a texture (stage grid, row 0 at the bottom)
      const st = this.field.st;
      const data = new Uint8Array(st.w * st.h);
      let base = st.h;
      for (let i = 0; i < data.length; i++) if (this.echoMask[i]) {
        data[i] = 255;
        base = Math.min(base, Math.floor(i / st.w));
      }
      this.echoBase = (base / st.h) * 0.25;
      this.echoTex?.dispose();
      this.echoTex = new DataTexture(data, st.w, st.h, RedFormat, UnsignedByteType);
      this.echoTex.magFilter = LinearFilter;
      this.echoTex.minFilter = LinearFilter;
      this.echoTex.needsUpdate = true;
      u.uEcho.value = this.echoTex;
      u.uShadowMem.value = this.shadow.memTarget.texture;
      u.uEchoBase.value = this.echoBase;
      this.replay = { t: 0, t2: 0, stage: 'in', gold: false };
      // the Hollow steps back into the dark; the screen goes back to page 1's evening, sun and all (no moon yet)
      this.replayHollow = this.hollow.scale;
      this.hollow.opacity = 0;
      this.replayMoon = { ...this.moonTarget };
      this.moonTarget = { ...this.moonTarget, size: 0 };
      this.day(1, 1.6);
      this.light(0.12, 0.17, 0.03, 0.03, 0, '#ffd98a');
      this.fadeLight(1, 1.2);
      this.log('replay:in');
    } else if (stage === 'yours') {
      if (this.replay.stage === 'off') return;
      // your live hand in the beam: the remembered one glows gold where they meet, and the Hollow flinches
      this.replay.gold = this.field.count > 60 && this.field.age < 0.6;
      this.replay.stage = 'yours';
      this.showWall(true);
      this.replay.t2 = 0;
      if (this.replay.gold) this.hollow.grow = 1.15;
      this.log(`replay:yours:${this.replay.gold ? 'gold' : 'lean'}`);
    } else {
      if (this.replay.stage === 'off') return;
      this.replay.stage = 'out';
      this.replay.t2 = 0;
      this.hollow.grow = 1;
      this.showWall(false);
      this.log('replay:out');
    }
  }

  /** the hand on the wall (src/tale/wall.ts) */
  private wall!: HandWall;

  private showWall(on: boolean): void {
    if (on) {
      // the screen's stage inside the hand target (the wall shows exactly the screen's picture, enlarged)
      const a = this.shadow.boardToPx(-BOOK.W / 2, 0);
      const b = this.shadow.boardToPx(BOOK.W / 2, 0.25);
      this.wall.setHand(this.shadow.handTarget.texture, a.x / HAND_PX, a.y / HAND_PX, (b.x - a.x) / HAND_PX, (b.y - a.y) / HAND_PX);
      this.wall.setEcho(this.echoTex ?? null);
    }
    this.wall.show(on);
    this.log(`wall:${on ? 'on' : 'off'}`);
  }

  private updateReplay(dt: number): void {
    const r = this.replay;
    if (r.stage === 'off') return;
    const u = this.shadow.material.uniforms;
    r.t += dt;
    r.t2 += dt;
    const at = (t: number, a: number, d: number) => {
      const k = Math.min(1, Math.max(0, (t - a) / d));
      return k * k * (3 - 2 * k);
    };
    if (r.stage !== 'out') {
      // page 1's village is replayed only if it was captured in this reading (a resumed reading shows the sky and the hand)
      u.uMem.value = this.memCaptured ? at(r.t, 0, 1.2) : 0;
      // the hand slides in and puts the sun out, as it did on page 1
      u.uEchoOn.value = at(r.t, 2.2, 0.3);
      const off = 1 - at(r.t, 2.2, 1.8);
      (u.uEchoOff.value as Vector2).set(0, -0.1 * off);
      const cov = this.echoSunCover(-0.1 * off);
      u.uLightCov.value = cov;
      if (r.t > 2.2 && r.t < 4.2) this.day(1 - 0.9 * cov);
      if (r.t > 4.2 && r.t - dt <= 4.2) {
        this.fadeLight(0, 1.2);
        this.day(0, 1.2);
      }
      // ...and there it was, all along: the Hollow, on page 1's hill
      if (r.t > 4.6 && r.t - dt <= 4.6) {
        this.hollow.snap(0.212, 0.033, 0.42);
        this.hollow.setWindow('#ffe2b0');
        this.hollow.opacity = 0.45;
      }
    }
    if (r.stage === 'yours') {
      if (r.gold) {
        u.uEchoGold.value = r.t2 < 0.25 ? r.t2 / 0.25 : 1 - 0.4 * at(r.t2, 0.25, 1.2);
        if (r.t2 > 0.3) this.hollow.grow = 1;
      } else u.uEchoShear.value = 0.08 * at(r.t2, 0, 1.5);
    } else if (r.stage === 'out') {
      const k = 1 - at(r.t2, 0, 1);
      u.uEchoOn.value = Math.min(u.uEchoOn.value as number, k);
      u.uMem.value = Math.min(u.uMem.value as number, k);
      u.uEchoGold.value = Math.min(u.uEchoGold.value as number, k);
      if (r.t2 > 0.2 && this.hollow.opacity < 1) {
        this.hollow.snap(0, 0.075, this.replayHollow);
        this.hollow.opacity = 1;
        this.hollow.setWindow('#f7ecc8');
        if (this.replayMoon) this.moonTarget = this.replayMoon;
        this.replayMoon = null;
        this.fadeLight(0, 0.3);
        this.day(0, 0.5);
      }
      if (r.t2 > 1) {
        r.stage = 'off';
        u.uEchoShear.value = 0;
        u.uLightCov.value = 0;
      }
    }
  }

  /** how much of page 1's sun the remembered hand covers, slid by dy */
  private echoSunCover(dy: number): number {
    const m = this.echoMask;
    if (!m) return 0;
    const st = this.field.st;
    const c = 0.002656;
    let n = 0;
    let k = 0;
    for (let y = 0; y < st.h; y++) for (let x = 0; x < st.w; x++) {
      const bx = -0.23 + (x + 0.5) * c;
      const by = (y + 0.5) * c;
      if ((bx - 0.12) ** 2 + (by - 0.17) ** 2 > 0.03 * 0.03) continue;
      n++;
      const sy = Math.floor((by - dy) / c);
      if (sy >= 0 && sy < st.h && m[sy * st.w + x]) k++;
    }
    return n ? k / n : 0;
  }

  vision(kind: 'carts' | 'echo' | 'yours' | null): void {
    if (kind === 'echo') {
      this.visionWant = 0;
      this.replayStage('in');
      return;
    }
    if (kind === 'yours') {
      this.replayStage('yours');
      return;
    }
    if (!kind) {
      this.visionWant = 0;
      this.replayStage('out');
      return;
    }
    if (!this.visionMesh) {
      const canvas = document.createElement('canvas');
      canvas.width = 640;
      canvas.height = 480;
      this.visionTex = new CanvasTexture(canvas);
      this.visionTex.colorSpace = SRGBColorSpace;
      const m = new Mesh(new PlaneGeometry(0.2, 0.15), new MeshBasicMaterial({ map: this.visionTex, transparent: true, opacity: 0, depthWrite: false }));
      m.name = 'Window picture';
      m.renderOrder = 15;
      m.position.set(0, 0.135, 0.0045);
      this.book.board.add(m);
      this.visionMesh = m;
    }
    const cached = this.visionCache.get(kind);
    const target = this.visionTex!.image as HTMLCanvasElement;
    if (cached) {
      const g = target.getContext('2d')!;
      g.clearRect(0, 0, target.width, target.height);
      g.drawImage(cached, 0, 0);
    } else drawVision(target, kind, null, this.field.st);
    this.visionTex!.needsUpdate = true;
    this.visionWant = 1;
    this.log(`vision:${kind}`);
  }

  /** DEV (tests): a phantom on the hand layer whose shadow is exactly a shape on the screen.
   *  kind: a plate id, 'disc' (r = w), 'rect' (w x h); at board (bx, by) = the shape's centre. null removes it. */
  private phantomMesh: Mesh | null = null;
  phantom(kind: string | null, bx = 0, by = 0.13, w = 0.03, h = 0.03): void {
    if (this.phantomMesh) {
      this.phantomMesh.removeFromParent();
      disposeTree(this.phantomMesh);
      this.phantomMesh = null;
    }
    if (!kind) return;
    let shape: string;
    let cy = 0;
    if (kind === 'disc' || kind === 'ring') shape = circle(0, 0, w * 1000);
    else if (kind === 'rect') shape = `M ${-w * 500} ${-h * 500} L ${w * 500} ${-h * 500} L ${w * 500} ${h * 500} L ${-w * 500} ${h * 500} Z`;
    else {
      shape = PLATES[kind].path;
      cy = PLATES[kind].h / 2000;
    }
    const mat = new MeshBasicMaterial({ color: '#ffffff', side: DoubleSide });
    // 'ring': a window (a hole between fingers)
    // a plate with two hands has two parts: the phantom casts all of them
    const parts = PLATES[kind]?.shape;
    const m = kind === 'ring'
      ? new Mesh(new RingGeometry(w * 0.45, w, 32), mat)
      : parts && parts.length > 1
        ? new Mesh(new ShapeGeometry(parts.map((ring) => new Shape(ring.map(([x, y]) => new Vector2(x * 0.001, y * 0.001))))), mat)
        : flat(shape, mat, `Phantom ${kind}`);
    m.geometry.translate(0, -cy, 0);
    m.layers.set(HAND_LAYER);
    const at = this.shadow.boardToHand(new Vector2(bx, by), new Vector3());
    this.scene.add(m);
    m.position.copy(at);
    m.quaternion.copy(this.shadow.handCamera.quaternion);
    m.scale.setScalar(1 / this.beamScale);
    this.phantomMesh = m;
  }

  /** a paper note by the book when the sound is asleep (Quest only wakes audio on a real gesture: a pinch) */
  private soundNote: Mesh | null = null;
  private soundOffT = 0;
  private updateSoundNote(dt: number): void {
    const ae = this.globals.audio as AudioEngine;
    const asleep = this.renderer.xr.isPresenting && ae.ctx.state !== 'running' && this.phase !== 'waiting';
    this.soundOffT = asleep ? this.soundOffT + dt : 0;
    if (!this.soundNote) {
      const c = document.createElement('canvas');
      c.width = 1024;
      c.height = 160;
      const g = c.getContext('2d')!;
      g.fillStyle = 'rgba(250, 241, 222, 0.97)';
      g.fillRect(8, 8, 1008, 144);
      g.strokeStyle = 'rgba(150, 110, 60, 0.6)';
      g.lineWidth = 4;
      g.strokeRect(8, 8, 1008, 144);
      g.fillStyle = '#34221e';
      g.font = 'italic 600 54px Georgia, serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText('No sound? Pinch thumb and finger once.', 512, 82);
      const tex = new CanvasTexture(c);
      tex.colorSpace = SRGBColorSpace;
      this.soundNote = new Mesh(new PlaneGeometry(0.3, 0.047), new MeshBasicMaterial({ map: tex, transparent: true, opacity: 0, depthWrite: false }));
      this.soundNote.name = 'Sound note';
      this.soundNote.renderOrder = 20;
      this.soundNote.position.set(0, BOOK.H + 0.05, 0.004);
      this.book.board.add(this.soundNote);
    }
    const m = this.soundNote.material as MeshBasicMaterial;
    m.opacity += ((this.soundOffT > 1.5 ? 1 : 0) - m.opacity) * Math.min(1, dt * 4);
    this.soundNote.visible = m.opacity > 0.01;
  }

  /** DEV (?auto): the game makes the reader's shadow itself, so a check can play the whole tale */
  autoShadow = import.meta.env.DEV && new URLSearchParams(location.search).has('auto');
  private autoPhantomFor(sc: ScreenActSpec): void {
    if (sc.kind === 'cover' && sc.light) this.phantom('disc', sc.light.x, sc.light.y, sc.light.rx * 1.25);
    else if (sc.kind === 'road' && sc.road) {
      const r = sc.road;
      this.phantom('rect', (r.gapA + r.gapB) / 2, r.y - 0.012, r.gapB - r.gapA + 0.03, 0.024);
    } else if (sc.kind === 'wall' && sc.wall) {
      // tests: one wide shadow standing across both bands
      const w = sc.wall.band;
      const lo = Math.min(w.a[0] - w.a[2], w.b ? w.b[0] - w.b[2] : 9);
      const hi = Math.max(w.a[0] + w.a[2], w.b ? w.b[0] + w.b[2] : -9);
      this.phantom('rect', (lo + hi) / 2, w.a[1], hi - lo, w.a[3] * 2 + 0.03);
    } else if (sc.kind === 'catch' && sc.catch) {
      const t = sc.catch.tray.a;
      this.phantom('rect', t[0], t[1] - 0.01, t[2] * 2 + 0.03, 0.03);
    } else if (sc.kind === 'hide' && sc.hide) {
      const fy = sc.hide.figures[0][1];
      this.phantom('rect', -0.03, fy + 0.012, 0.26, 0.04);
    } else if (sc.kind === 'birds') {
      this.phantom('rect', 0, 0.09, 0.05, 0.1);
    }
    else this.phantom(null);
  }

  /** the screen world goes quiet between pages */
  private resetScreenWorld(): void {
    this.light(0, 0, 0.01, 0.01, 0);
    this.day(0);
    this.setTarget(null, false);
    this.shadow.material.uniforms.uLightCov.value = 0;
    this.slip('');
    this.marchOn = false;
    for (const w of [...this.walkers, ...this.marchers, ...this.runners]) w.visible = false;
    this.reach = false;
    this.mapOn = 0;
    if (this.mapPiece) {
      this.mapPiece.removeFromParent();
      disposeTree(this.mapPiece);
      this.mapPiece = null;
    }
    this.visionWant = 0;
    this.visionOn = 0;
    if (this.visionMesh) (this.visionMesh.material as MeshBasicMaterial).opacity = 0;
    this.crossing = { v: 0, from: new Map() };
    this.flags.delete('reached');
    this.carry = false;
    this.made?.clear();
    // a page left (or replayed) in the middle of the Hollow's memory: nothing of it stays on the next page
    if (this.replay.stage !== 'off') {
      this.replay = { t: 0, t2: 0, stage: 'off', gold: false };
      const u = this.shadow.material.uniforms;
      u.uEchoOn.value = 0;
      u.uMem.value = 0;
      u.uEchoGold.value = 0;
      u.uEchoShear.value = 0;
      this.replayMoon = null;
      this.hollow.opacity = 1;
    }
    this.wall?.show(false);
  }

  /** a caption that waits on the reader's hands with no plate or act (the Four Elements' carry) */
  private carry = false;
  holdHands(on: boolean): void {
    this.carry = on;
  }

  /** every frame: the painted light, the map, the window picture, the Hollow reaching for your hand */
  private updateScreenWorld(dt: number): void {
    if (!this.echoMask && this.mode === 'tale' && this.bookId === 'tale' && this.page && this.page.id !== 'village' && this.field.count > 400 && this.field.age < 0.3) {
      this.echoMask = this.field.H.slice();
      this.st.marks.echo = 2;
      this.log('echo:fallback');
    }
    {
      const u = this.shadow.material.uniforms;
      // the amber target: strong for 2 s, then faint (and strong again after 4 s with no hand)
      this.tgtStrongT -= dt;
      const handSeen = this.field.count > 12 && this.field.age < 0.6;
      if (this.tgtWant > 0 && this.tgtStrongT < -4 && !handSeen) this.tgtStrongT = 2;
      const want = this.tgtWant <= 0 ? 0 : this.tgtStrongT > 0 ? 0.9 : Math.min(this.tgtWant, 0.3);
      u.uTgtOn.value += (want - (u.uTgtOn.value as number)) * Math.min(1, dt * 4);
      const da = this.dayAnim;
      if (da) {
        da.t += dt;
        const k = Math.min(1, da.t / da.dur);
        u.uDay.value = da.from + (da.to - da.from) * k * k * (3 - 2 * k);
        if (k >= 1) {
          this.dayAnim = null;
          da.then?.();
        }
      }
    }
    const la = this.lightAnim;
    if (la) {
      la.t += dt;
      const k = Math.min(1, la.t / la.dur);
      this.lightOn = la.from + (la.to - la.from) * k * k * (3 - 2 * k);
      this.shadow.material.uniforms.uLightOn.value = this.lightOn;
      if (k >= 1) this.lightAnim = null;
    }
    // hands up while the story is only talking: a gentle word, once per page
    const idle = this.mode === 'tale' && this.bookId === 'tale' && this.page?.id !== 'hollow' && this.phase === 'page' && !this.paused && !this.act && !this.screenAct && !(this.beat && this.beat.state !== 'done') && !this.reach && !this.turnReady;
    this.idleHandsT = idle && this.handsInLight().length ? this.idleHandsT + dt : 0;
    if (this.idleHandsT > 3.5 && this.restNudgedPage !== this.page?.id && this.adviseT <= 0 && !this.pageSlip) {
      this.restNudgedPage = this.page?.id ?? '';
      this.advise('Rest your hands in your lap. The book will call them.', 4);
    }
    if (this.adviseT > 0) {
      this.adviseT -= dt;
      if (this.adviseT <= 0) this.slip('');
    }
    this.updateNotice();
    // no moon and no stars in the morning
    const day = this.shadow.material.uniforms.uDay.value as number;
    this.book.dayHides(day > 0.35);
    if (this.mapPiece) {
      const mat = this.mapPiece.userData.mat as MeshBasicMaterial;
      mat.opacity += (this.mapOn * 0.8 - mat.opacity) * Math.min(1, dt * 2);
      (this.mapPiece.userData.sheet as MeshBasicMaterial).opacity = Math.min(1, mat.opacity * 1.15);
    }
    if (this.visionMesh) {
      this.visionOn += (this.visionWant - this.visionOn) * Math.min(1, dt * 1.8);
      (this.visionMesh.material as MeshBasicMaterial).opacity = Math.min(1, this.visionOn * 1.5);
      // the memory pops out of the Hollow's window (small at the eye, full size in front of it)
      const k = this.visionOn;
      this.visionMesh.scale.setScalar(0.3 + 0.7 * k);
      this.visionMesh.position.set(0, 0.185 - 0.05 * k, 0.0045 + 0.003 * k);
      this.visionMesh.visible = this.visionOn > 0.01;
    }
    if (this.reach) {
      // the Hollow grows with your shadow: two hands, much bigger; no hands, it settles
      const area = this.field.age < 0.6 ? this.field.count : 0;
      const want = 1 + 0.35 * Math.min(1, area / 800);
      this.hollow.grow += (want - this.hollow.grow) * Math.min(1, dt * 1.5);
      if (area > 60) this.reachT += dt;
      if (this.reachT > 2.5 && !this.flags.has('reached')) this.flags.add('reached');
      // nobody came: it grows anyway, looking toward the lantern (where hands come from)
      if (this.stepT > 9 * this.fast * this.paceK && !this.flags.has('reached')) {
        this.hollow.grow = Math.max(this.hollow.grow, 1.15);
        this.flags.add('reached');
      }
    }
  }

  log(s: string): void {
    this.logs.push(s);
    if (this.logs.length > 200) this.logs.shift();
  }

  // ---- flow -------------------------------------------------------------------------------

  private go(p: Phase): void {
    this.phase = p;
    this.phaseT = 0;
    this.log(`phase:${p}`);
  }

  /** The book arrives shut (start, or after closing). */
  restart(): void {
    this.resetTale();
    this.book.setOpen(0);
    this.book.lantern.level = 0;
    this.music.pad(false);
    this.captions.say('');
    this.book.root.visible = true;
    this.go('arrive');
    this.music.thump();
  }

  /** page 1's village shadow was captured in this reading (for the Hollow's replay) */
  private memCaptured = false;

  private resetTale(): void {
    this.finished = false;
    this.oneHandReader = false;
    this.memCaptured = false;
    if (this.replay.stage !== 'off') {
      this.replay = { t: 0, t2: 0, stage: 'off', gold: false };
      const u = this.shadow.material.uniforms;
      u.uEchoOn.value = 0;
      u.uMem.value = 0;
    }
    this.wall?.show(false);
    this.sawDay = false;
    this.wx.reset();
    this.made?.reset();
    this.echoMask = null;
    this.echoDrawn = null;
    this.visionCache.clear();
    this.room?.dispose();
    this.room = null;
    this.mode = 'tale';
    for (const a of this.shelfActors) {
      a.root.removeFromParent();
      disposeTree(a.root);
    }
    this.shelfActors = [];
    this.st = { route: null, ending: null, size: {}, made: [], lesson: lessonWanted(), hat: null, marks: {}, kept: [], lost: [] };
    this.tray?.clear();
    this.resetScreenWorld();
    this.flags.clear();
    this.beamT = 0;
    this.linesShown = 0;
    for (const [id, a] of [...this.actors]) {
      if (id === 'ama') continue;
      a.root.removeFromParent();
      disposeTree(a.root);
      this.actors.delete(id);
    }
    this.amaActor.visible = false;
    this.amaMoodNow = 'still';
    (this.amaShadow.material as MeshBasicMaterial).opacity = 0;
    this.amaShadow.userData.on = false;
    this.amaShadow.visible = false;
    this.amaLantern.visible = false;
    this.farLampMesh.userData.on = false;
    this.farLampMesh.visible = false;
    (this.farLampMesh.material as MeshBasicMaterial).opacity = 0;
    this.clearBeat();
    this.clearAct();
    this.clearScreen();
    this.hollow.reset();
    this.moonTarget = { y: 0.24, size: 0, x: 0.075 };
    this.music.clear();
    this.music.finale(false);
    this.lampsLit = 0;
    this.pageIdx = -1;
    this.turnReady = false;
    this.endCard.open(false);
    this.shadow.material.uniforms.uHands.value = 1;
    for (const w of [...this.walkers, ...this.marchers, ...this.runners]) w.visible = false;
    this.marchOn = false;
    this.timers = [];
    this.madeOnPage.clear();
  }

  private openBook(fresh = false): void {
    if (this.phase !== 'cover') return;
    // a reading of the tale was left midway: offer to go on (the card waits on the desk)
    const q = new URLSearchParams(location.search);
    const testing = (this.autoShadow || q.has('fresh')) && !q.has('bookmark');
    if (!fresh && !this.demo && !testing) {
      // the card is already waiting: a finger resting on the cover must not rebuild it every frame
      if (this.resumeFrom) return;
      const b = loadBookmark(this.bookId);
      if (b && this.pages.findIndex((p) => p.id === b.pageId) > 0) {
        this.offerResume(b);
        return;
      }
    }
    this.enterPage(this.nextPage(-1));
    // the cast lies flat under the cover; it stands up once the page is lit
    this.flattenActors();
    this.go('opening');
    this.music.rustle(1.4);
  }

  /** every actor lies flat on the page (before an open, or under a turning sheet) */
  private flattenActors(): void {
    for (const a of this.actors.values()) {
      a.pageY = this.book.top;
      a.fold = 1;
    }
  }

  /**
   * Fold (down) or stand (up) the visible actors, staggered by depth: on a close or a
   * turn the front ones go first; on an open the back ones stand first. Returns true when done.
   */
  private foldActors(T: number, start: number, each: number, gap: number, down: boolean): boolean {
    const list = [...this.actors.values()].filter((a) => a.visible).sort((a, b) => (down ? b.root.position.z - a.root.position.z : a.root.position.z - b.root.position.z));
    let done = true;
    list.forEach((a, i) => {
      a.pageY = this.book.top;
      const k = Math.min(1, Math.max(0, (T - start - Math.min(i * gap, 0.5)) / each));
      // folding only ever lowers an actor; standing only ever raises it (interrupts land softly)
      if (down) a.fold = Math.max(a.fold, k);
      else a.fold = k >= 1 ? 0 : Math.min(a.fold, 1 - popEase(k));
      if (k < 1) done = false;
    });
    for (const a of this.actors.values()) if (!a.visible) a.fold = 1;
    const sh = this.amaShadow.material as MeshBasicMaterial;
    if (down) sh.opacity = Math.min(sh.opacity, 0.75 * (1 - this.amaActor.fold));
    return done;
  }

  /** which book is open (the shelf chooses): its pages */
  bookId: 'tale' | 'weather' = 'tale';
  /** the weather on the screen (The Weathermaker's Apprentice) */
  wx: WeatherFx = NO_WEATHER;
  /** the shapes the reader's hands made, as cut paper on the screen (The Four Elements) */
  made!: Made;
  private sky: WeatherSky | null = null;
  /** a token flies from the screen to the keeping tray */
  token(cell: string, bx: number, by: number): void {
    this.screenHost.keep?.(cell, bx, by);
  }
  private get pages(): PageDef[] {
    return this.bookId === 'weather' ? WEATHER_PAGES : PAGES;
  }

  private nextPage(from: number): number {
    const P = this.pages;
    for (let i = from + 1; i < P.length; i++) if (!P[i].when || P[i].when!(this.st)) return i;
    return -1;
  }

  /** Make page i the current page: its scene (folded), its actors, its script. */
  private enterPage(i: number, def?: PageDef): void {
    this.clearAct();
    this.clearScreen();
    this.resetScreenWorld();
    this.room?.dispose();
    this.room = null;
    this.mode = def ? 'room' : 'tale';
    this.pageIdx = i;
    this.page = def ?? this.pages[i];
    // how things stood when the page began (for "Replay this page")
    if (!def) this.pageStart = { st: JSON.stringify(this.st), tray: this.tray?.count ?? 0 };
    // the bookmark: every spread of the tale (from the second on) is a place to come back to
    if (!def && i > 0 && !this.demo) {
      // (written a moment after the turn, not in the middle of the sheet's sweep)
      const book = this.bookId;
      const [id, st, echo] = [this.page.id, JSON.stringify(this.st), book === 'tale' ? this.echoMask : null];
      this.bookmarkDue = () => saveBookmark(book, i, id, JSON.parse(st) as TaleState, echo);
      this.shelf.setBookmark(book, true);
    }
    this.timers = [];
    const old = this.book.scene;
    // the scene was built ahead, while the last page waited for its turn
    const scene = !def && this.ready?.idx === i && this.ready.book === this.bookId ? this.ready.scene : this.page.scene();
    if (this.ready && this.ready.scene !== scene) disposeTree(this.ready.scene.root, this.ready.scene.screenProps);
    this.ready = null;
    this.book.setScene(scene);
    if (old && old !== scene) disposeTree(old.root, old.screenProps);
    scene.setRise(0);
    // everyone steps off; the page calls back who it needs
    for (const a of this.actors.values()) a.visible = false;
    this.page.enter?.(this);
    // (already painted while the stair page waited, unless the remembered hand has changed since)
    if (this.page.id === 'hollow' && (this.visionCache.size < 2 || this.echoDrawn !== this.echoMask)) this.prepareVisions();
    if (this.page.id === 'village') this.after(3.5, () => {
      this.shadow.captureMem = true;
      this.memCaptured = true;
      this.st.marks.villageMem = 1;
    });
    if (def) this.room = new LanternRoom(this.roomHost());
    this.fitZone(0);
    this.steps = this.page.steps;
    this.nudged = 0;
    this.preLine = 0;
    this.beatDue = -1;
    this.stepIdx = 0;
    this.stepStarted = false;
    this.turnReady = false;
    this.log(`page:${this.page.id}`);
  }

  /** which shapes the reader made (The Four Elements), back from the story's marks */
  private restoreMade(): void {
    this.made.plates = {};
    for (const k of Object.keys(this.st.marks)) {
      const m = /^made:(\w+):(\w+)$/.exec(k);
      if (m && PLATES[m[2]]) this.made.plates[m[1] as Element] = m[2];
    }
  }

  /** the bookmark for the page just entered (saved once the page is up) */
  private bookmarkDue: (() => void) | null = null;
  /** the next page's pop-up scene, built while the reader is still on this one (a turn then has nothing to build) */
  private ready: { idx: number; book: string; scene: Scene } | null = null;
  private dropReady(): void {
    if (this.ready) disposeTree(this.ready.scene.root, this.ready.scene.screenProps);
    this.ready = null;
  }
  private prebuild(i: number): void {
    if (this.ready?.idx === i && this.ready.book === this.bookId) return;
    this.dropReady();
    const scene = this.pages[i].scene();
    scene.setRise(0);
    this.ready = { idx: i, book: this.bookId, scene };
    if (this.pages[i].id === 'hollow') this.prepareVisions();
  }

  /** the mobile's pieces: the moon; a star for a road; a bird for the wings; a star for the tower; a cloud for The Four Elements */
  private earned(): boolean[] {
    const r = this.readSoFar();
    return [true, !!(r.fox || r.owl), !!r.wings, !!r.keep, !!r.weather];
  }

  /** what has been read to its end, ever (the desk note names what is left) */
  private readSoFar(): Record<string, boolean> {
    try {
      const v = JSON.parse(localStorage.getItem(READ_KEY) ?? '{}') as Record<string, boolean>;
      return v && typeof v === 'object' ? v : {};
    } catch {
      return {};
    }
  }

  /** Called when a page's script ends: wait for a turn (or the end card). */
  private pageFinished(): void {
    const next = this.nextPage(this.pageIdx);
    if (next < 0) {
      if (!this.finished) {
        this.finished = true;
        this.bookmarkDue = null;
        clearBookmark(this.bookId);
        this.shelf.setBookmark(this.bookId, false);
        if (this.bookId === 'weather' && this.mode === 'tale' && !this.demo) {
          const r = this.readSoFar();
          r.weather = true;
          try {
            localStorage.setItem(READ_KEY, JSON.stringify(r));
          } catch {
            /* private window */
          }
        }
        if (this.bookId === 'tale' && this.mode === 'tale' && !this.demo) {
          const r = this.readSoFar();
          if (this.st.route) r[this.st.route] = true;
          if (this.st.ending) r[this.st.ending] = true;
          if (this.st.route && this.st.ending) r[`${this.st.route}+${this.st.ending}`] = true;
          try {
            localStorage.setItem(READ_KEY, JSON.stringify(r));
          } catch {
            /* private window */
          }
        }
        this.turnReady = true;
        this.turnReadyT = 0;
        this.turnNext = null;
        this.cornerArmed = false;
        this.cornerT = 0;
        this.log('end-ready');
      }
      return;
    }
    this.turnReady = true;
    this.turnReadyT = 0;
    this.turnNext = () => this.enterPage(next);
    this.cornerArmed = false;
    this.cornerT = 0;
    if (this.mode !== 'room') this.prebuild(next);
    this.log('turn:ready');
  }

  turnPage(): void {
    if (!this.turnReady || this.phase !== 'page') return;
    if (this.mode === 'room') {
      // a shape that has just taken is allowed to finish (it goes on the shelf first)
      if (this.beat && this.beat.state !== 'asking' && this.beat.state !== 'done') return;
      // Shadow Practice has no pages: the corner brings another outline (the lantern goes back to the shelf)
      this.room?.next();
      this.music.pageTurn();
      this.log('room:next');
      return;
    }
    if (this.finished && !this.turnNext) {
      this.closeBook();
      return;
    }
    this.turnReady = false;
    // the lesson counts as given once its page has really been turned
    if (this.st.lesson && (this.page?.id === 'village' || this.page?.id === 'w-loft')) lessonDone();
    this.made?.fadeAll();
    this.captions.say('');
    this.go('turning');
    this.music.pageTurn();
    this.log('turn');
  }

  private playAgain(): void {
    this.endCard.open(false);
    this.log('again');
    this.demoLoop++;
    if (this.book.open <= 0.9) {
      this.restart();
      return;
    }
    // a page turn back to the start: the puppets fold first, and the tale resets under the sheet
    this.captions.say('');
    this.music.rustle(1.2);
    this.turnNext = () => {
      this.resetTale();
      this.music.pad(true);
      this.enterPage(this.nextPage(-1));
    };
    this.go('turning');
  }

  private endLevel = 1;
  private endRise = 1;
  private thudDone = false;

  /** Close the book: the cast folds flat, then the scenery, the lantern dims and folds, the cover shuts. */
  private closeBook(): void {
    if (this.phase !== 'page' && this.phase !== 'turning' && this.phase !== 'ignite') return;
    this.endCard.open(false);
    // nothing the page had planned (lamps, a laugh, a capture) happens over the folding book
    this.timers = [];
    this.dropReady();
    this.made?.fadeAll();
    // a page entered during a turn has its bookmark written now (never into a later reading)
    if (this.bookmarkDue) {
      this.bookmarkDue();
      this.bookmarkDue = null;
    }
    this.clearAct();
    this.clearScreen();
    // nothing of the book stays lit while it folds shut: the wall, the window pictures, the weather
    this.showWall(false);
    if (this.replay.stage !== 'off' || this.visionWant > 0) this.vision(null);
    this.wx.reset();
    this.clearBeat();
    this.captions.say('');
    this.sheetPivot.visible = false;
    this.corner.visible = false;
    this.turnReady = false;
    this.endLevel = this.book.lantern.level;
    this.endRise = this.book.scene?.rise ?? 1;
    this.thudDone = false;
    this.music.rustle(1.2);
    this.go('end');
  }

  // ---- per frame --------------------------------------------------------------------------

  private frameNo = 0;
  private warmed = false;
  private recardIn = 0;
  private coverClear = true;
  private strayT = 0;
  private cornerArmed = false;
  private cornerT = 0;
  private cornerAway = 0;
  private oneHandReader = false;
  private strayOk = true;
  private vRise = -1;
  private vOpen = -1;
  private vScene: Scene | null = null;

  update(delta: number): void {
    const dt = Math.min(delta, 0.05);
    this.frameNo++;
    this.t += dt;
    this.readHead();
    if (this.calibrateIn > 0) {
      this.calibrateIn -= dt;
      if (this.calibrateIn <= 0) this.calibrate();
    }
    const audio = this.globals.audio as AudioEngine;
    if (audio.running) audio.updateListener(this.camera.matrixWorld);
    audio.keepAlive();
    this.updateSoundNote(dt);

    // hands
    const tips: Vector3[] = [];
    for (const side of ['left', 'right'] as const) {
      const model = this.input.xr.visualAdapters.hand[side].visual?.model as Object3D | undefined;
      // tracked = listed AND seen: a runtime can keep listing a hand it no longer sees (its model is then hidden)
      const tracked = this.input.xr.isPrimary('hand', side) && model?.visible !== false && !this.debugUntracked;
      if (model && !this.taggedModels.has(model)) {
        ShadowCaster.tagHand(model);
        this.taggedModels.add(model);
      }
      this.shadowHands.step(side, model, tracked, dt);
      const r = this.readers[side].read(model, tracked, this.hands[side]);
      this.hands[side] = r;
      if (r?.tracked) {
        tips.push(r.indexTip);
        // measure the reader's hand from open palms: it sets the beam's scale
        if (classify(r) === 'open') {
          const len = r.wrist.distanceTo(r.middleTip);
          if (len > 0.13 && len < 0.24) {
            this.handLenSamples++;
            this.handLen += (len - this.handLen) * Math.max(0.02, 1 / (this.handLenSamples + 15));
          }
        }
      }
    }
    this.lastTip = tips;
    this.checkControllers(dt);

    // cards (they work while paused)
    for (const ev of this.pauseCard.update(dt, tips)) this.onPause(ev.id, ev.value);
    this.music.setPreview(['vol-all', 'vol-music', 'vol-sounds'].some((id) => this.pauseCard.isHolding(id)));
    this.updatePlacement(dt);
    this.updateResumeCard(dt, tips);
    const endPick = this.endCard.update(dt, tips);
    if (endPick === 'again') this.playAgain();
    else if (endPick === 'practice') {
      this.endCard.open(false);
      this.captions.say('');
      this.music.rustle(1.2);
      this.turnNext = () => {
        this.resetTale();
        this.music.pad(true);
        this.enterPage(-1, TaleSystem.ROOM_PAGE);
      };
      this.go('turning');
    }
    else if (endPick === 'close') this.closeBook();

    this.checkPalmPause(dt);
    this.deskLife.update(dt, tips, this.book.lantern.level * this.book.lantern.dim, !this.wall.shown, 1 - Math.min(1, this.shadow.material.uniforms.uDay.value as number), this.roomWeather.gust);
    this.updateDeskNote(dt);
    if (this.recardIn > 0 && (this.recardIn -= dt) <= 0 && this.paused) this.placeCard(this.pauseCard);
    if (this.bookmarkDue && this.phase === 'page') {
      this.bookmarkDue();
      this.bookmarkDue = null;
    }
    // one warm-up of every shader already in the scene, on the first frame in the headset (not at first use, mid-story)
    if (!this.warmed && this.renderer.xr.isPresenting && this.book.root.visible) {
      this.warmed = true;
      try {
        this.renderer.compile(this.scene, this.camera);
        // textures first shown on a story beat (the pause card, the wall): uploaded now, not on that frame
        this.scene.traverse((o) => {
          const m = (o as Mesh).material as MeshBasicMaterial | MeshBasicMaterial[] | undefined;
          for (const mat of Array.isArray(m) ? m : m ? [m] : []) if (mat.map && !o.visible) this.renderer.initTexture(mat.map);
        });
      } catch {
        /* a warm-up must never stop the book */
      }
    }
    {
      const open = this.phase === 'page' || this.phase === 'turning' || this.phase === 'opening' || this.phase === 'ignite';
      const enabled = !this.pauseCard.isOpen && (this.phase === 'cover' || this.phase === 'page');
      const chosen = this.shelf.update(dt, tips, open, enabled);
      if (chosen) this.choose(chosen);
    }
    this.checkHandHold(dt, tips.length > 0);
    const sdt = this.paused || this.handHeld ? 0 : dt;
    this.phaseT += sdt;
    const book = this.book;

    if (this.phase === 'arrive') {
      const k = Math.min(1, this.phaseT / 1.1);
      const e = 1 - Math.pow(1 - k, 3);
      book.root.position.y = TABLE_Y + 0.28 * (1 - e) + Math.sin(k * Math.PI) * 0.01;
      book.root.rotation.y = (1 - e) * 0.25;
      if (k >= 1) this.go('cover');
    } else if (this.phase === 'cover') {
      book.lantern.level = 0;
      // a fingertip must have been off the cover since the book shut (a finger left on the corner never re-opens it)
      const on = this.coverTouched(tips);
      if (!on) this.coverClear = true;
      else if (this.coverClear) this.openBook();
      // the reader turned away while the book arrived (to put the controllers down): it comes to where they sit now
      if (this.strayOk && this.renderer.xr.isPresenting && !this.resumeFrom && !tips.length) {
        const toBook = book.root.getWorldPosition(this.tmpA).sub(this.head).setY(0).normalize();
        this.strayT = toBook.dot(this.fwd) < 0.6 ? this.strayT + dt : 0;
        if (this.strayT > 3) {
          this.strayT = 0;
          this.strayOk = false;
          this.calibrate();
        }
      }
    } else if (this.phase === 'opening') {
      // the cover rises, then the page rises back layer first, then the lantern unfolds
      const T = this.phaseT;
      const c = (a: number, d: number) => Math.min(1, Math.max(0, (T - a) / d));
      book.setBoard(c(0, 1.6));
      book.scene?.setRise(c(0.9, 1.4));
      book.setLanternFold(c(1.9, 0.5));
      if (T >= 2.4) {
        this.go('ignite');
        this.music.ignite();
        this.music.pad(true, 0.09);
        this.music.ambience(true);
      }
    } else if (this.phase === 'ignite') {
      book.lantern.level = Math.min(1, this.phaseT / 1.2);
      // once the page is lit, the cast stands up, back first
      this.foldActors(this.phaseT, 0.5, 0.4, 0.02, false);
      if (this.phaseT > 1.6) this.go('page');
    } else if (this.phase === 'page') {
      this.runScript(sdt);
      if (this.mode === 'room') {
        this.room?.update(sdt);
        this.turnReady = true;
        this.turnNext = null;
      }
      if (this.turnReady) this.checkTurn(sdt, tips);
    } else if (this.phase === 'turning') {
      this.animateTurn();
    } else if (this.phase === 'end') {
      // the close: the cast folds front first (each instrument leaves as its puppet lies down),
      // then the scenery, the lantern dims and folds, the cover shuts with a thump
      const T = this.phaseT;
      const c = (a: number, d: number) => Math.min(1, Math.max(0, (T - a) / d));
      this.foldActors(T, 0, 0.4, 0.12, true);
      for (const a of this.shelfActors) a.root.visible = T < 0.5;
      for (const [id, a] of this.actors) {
        const part = CAST[id]?.part;
        if (part && a.fold > 0.9 && this.music.has(part)) this.music.leave(part);
      }
      book.scene?.setRise(this.endRise * (1 - c(0.7, 1.2)));
      book.lantern.level = this.endLevel * (1 - c(1.5, 0.8) ** 2);
      book.setLanternFold(1 - c(2.1, 0.5));
      book.setBoard(1 - c(2.5, 1.6));
      if (T >= 2.5 && T - sdt < 2.5) this.music.pad(false);
      if (T >= 4.1 && !this.thudDone) {
        this.thudDone = true;
        this.music.thump();
        this.music.clear();
        this.music.ambience(false);
      }
      if (T >= 4.9) {
        const wasFinished = this.finished;
        // what was finished (read before the reset clears it)
        const finishedTale = wasFinished && this.bookId === 'tale' && this.mode === 'tale';
        this.resetTale();
        this.go('cover');
        this.coverClear = false;
        // what was just finished hangs on the mobile from now on (it grows in and rings)
        if (wasFinished) this.deskLife.setEarned(this.earned(), true);
        const next = this.pendingChoice;
        this.pendingChoice = null;
        if (finishedTale && !next) {
          // what is still unread, in view over the shut book (every finished reading, not once in a lifetime)
          const r = this.readSoFar();
          this.deskInvite = !r.owl ? 'The owl’s road is still unread.'
            : !r.fox ? 'The fox’s road is still unread.'
            : !r.wings ? 'You have not lent it wings yet.'
            : !r.keep ? 'You have not built it a tower yet.'
            : !r['fox+wings'] ? 'The fox has not seen the wings yet.'
            : !r['owl+keep'] ? 'The owl has not seen the tower yet.'
            : !r['fox+keep'] ? 'The fox has not seen the tower yet.'
            : !r['owl+wings'] ? 'The owl has not seen the wings yet.'
            : r.weather ? 'Every road is read.|The Lantern Room is always open.' : 'Every road is read.|Ottilie’s jars are on the shelf.';
          this.deskInviteT = 14;
          this.music.hint();
        } else if (wasFinished && this.bookId === 'weather' && !next) {
          const r = this.readSoFar();
          this.deskInvite = r.fox || r.owl ? 'The jars are shut.|The Lantern Room is always open.' : 'The jars are shut.|The tale is still on the shelf.';
          this.deskInviteT = 14;
          this.music.hint();
        }
        // the chosen book opens at once (a hand resting on the shut cover cannot take its place)
        if (next) this.choose(next);
      }
    }

    if (this.demo && !this.renderer.xr.isPresenting) this.runDemo(sdt);
    if (this.timers.length) {
      const due: (() => void)[] = [];
      for (const tm of this.timers) {
        tm.t -= sdt;
        if (tm.t <= 0) due.push(tm.fn);
      }
      if (due.length) {
        this.timers = this.timers.filter((tm) => tm.t > 0);
        for (const fn of due) fn();
      }
    }
    if (this.phase === 'page' && !this.paused && this.handsInLight().length) this.beamT += dt;
    this.updateBeat(sdt);
    this.updateAct(sdt);
    // Pace: Slow slows the screen acts too (gusts, falling things, the searchlight)
    if (!this.handHeld) this.updateScreen(sdt / this.paceK);
    this.updateScreenWorld(sdt);
    this.updateReplay(sdt);
    this.tray.setFold(this.mode === 'room' || (this.bookId === 'tale' && !this.amaActor.visible) ? 1 : this.bookId === 'tale' ? this.amaActor.fold : this.book.scene ? 1 - this.book.scene.rise : 1);
    this.tray.held = !!this.screenAct?.busy;
    this.sky?.update(sdt);
    this.made.update(sdt);
    {
      const sky = this.sky;
      const on = this.bookId === 'weather' && this.phase === 'page' && !!sky;
      this.roomWeather.update(dt, on ? sky!.rainAmount : 0, on ? sky!.windAmount : 0, on ? sky!.warmAmount : 0, this.renderer.domElement.height || 1000, on);
    }
    this.updateRoomVeil(dt);
    if (this.wall.shown || this.replay.stage === 'yours') this.wall.update(dt, this.t, this.handsInLight().length > 0 || !!this.phantomMesh);
    else this.wall.update(dt, this.t, false);
    this.tray.update(sdt, this.music);
    this.animate(dt, sdt);

    // lantern, shadows, sound, text
    book.lantern.dim = this.paused ? 0.35 : 1;
    book.lantern.update(dt, this.head);
    const u = this.shadow.material.uniforms;
    u.uGlow.value = book.lantern.level * book.lantern.dim * (0.92 + 0.08 * Math.sin(this.t * 7.3));
    u.uTime.value = this.t;
    if (book.root.visible && book.open > 0.3) {
      const H = BOOK.H;
      const W = BOOK.W;
      const centre = book.screenPoint(0, H * 0.45, this.tmpB);
      const corners = [book.screenPoint(-W / 2, 0), book.screenPoint(W / 2, 0), book.screenPoint(-W / 2, H), book.screenPoint(W / 2, H)];
      this.shadow.aim(this.shadowLight(this.tmpA), centre, corners);
      const fl = book.board.worldToLocal(book.lantern.flame(this.tmpC));
      u.uHot.value.set(0.5 + fl.x / (W - 0.024), Math.min(0.8, Math.max(0.15, fl.y / (H - 0.024) + 0.05)));
      this.aimBeam();
      // the village's shadows only change while the pop-ups rise or fold, the board moves, or a caster
      // turns (the mill's sails); aim() marks a moved view itself
      const rise = book.scene?.rise ?? 0;
      const spin = (book.scene?.props.spin as number | undefined) ?? 0;
      if (rise !== this.vRise || book.open !== this.vOpen || book.scene !== this.vScene || (spin !== 0 && (spin >= 1 || (this.frameNo & 1) === 0))) {
        this.vRise = rise;
        this.vOpen = book.open;
        this.vScene = book.scene ?? null;
        this.shadow.markVillage();
      }
      const t0 = performance.now();
      const posed = this.shadowHands.beginShadow();
      const anyHand = posed > 0 || !!this.hands.left?.tracked || !!this.hands.right?.tracked || !!this.phantomMesh;
      this.shadow.render(this.renderer, this.scene, anyHand);
      this.shadowHands.endShadow();
      const t1 = performance.now();
      this.field.update(dt, this.renderer, this.phase === 'page' && !this.paused && this.wantField());
      // CPU time of the two shadow jobs (the frame-rate readout shows them)
      this.cpuShadowMs += (t1 - t0 - this.cpuShadowMs) * 0.1;
      this.cpuReadMs += (performance.now() - t1 - this.cpuReadMs) * 0.1;
    }
    // a fade in flight always finishes (a hold or a pause never leaves a line half inked)
    this.captions.update(dt);
    this.book.captionMesh.visible = this.captions.ribbonMaterial.opacity > 0.01 || this.captions.material.opacity > 0.01;
    this.advice.update(dt);
    this.music.update();
    this.theatre.update(this.t, book.lantern.level * book.lantern.dim, this.renderer.domElement.height || 1000);
  }

  private runScript(dt: number): void {
    if (this.turnReady || this.endCard.isOpen) return;
    const step = this.steps[this.stepIdx];
    if (step && !this.stepStarted && step.when && !step.when(this.st)) {
      this.stepIdx++; // a line for another branch
      return;
    }
    if (!step) {
      this.pageFinished();
      return;
    }
    if (!this.stepStarted) {
      let text: string | null | undefined;
      if (step.say !== undefined) text = typeof step.say === 'function' ? step.say(this.st) : step.say;
      if (text === null) {
        this.stepIdx++; // a line for another branch
        return;
      }
      // a breath before the first line of a page (longer for the very first)
      if (this.stepIdx === 0 && this.preLine < (this.linesShown === 0 ? 1.0 : 0.8) * this.fast) {
        this.preLine += dt;
        return;
      }
      this.preLine = 0;
      this.stepStarted = true;
      this.stepT = 0;
      this.beatDue = step.beat ? (step.beat.options.length > 1 ? 1.0 : 0.4) * this.fast : -1;
      if (text !== undefined) {
        this.captions.say(text);
        this.linesShown++;
      }
      // hold by length, warmer (slower) for the first lines of the tale, and a little longer on page 1
      const n = this.linesShown;
      const warm = 1 + 0.12 * Math.max(0, 1 - n / 6);
      const page1 = this.page?.id === 'village' ? 1.12 : 1;
      const len = (text ?? '').length;
      const pace = this.comfort.pace === 'slow' ? 1.3 : 1;
      const read = Math.max(3.6, 1.6 + len * 0.06) * warm * page1;
      // a fixed hold is a minimum for a line with words (never shorter than its reading time); silent steps keep theirs
      const base = len ? Math.max(step.hold ?? 0, read) : step.hold ?? 0;
      this.stepHold = (base * pace + (step.breath ?? 0)) * this.fast;
      step.run?.(this);
      if (step.act) this.startAct(step.act);
      if (step.screen) this.startScreen(step.screen(this));
      this.log(`step:${this.page?.id}:${this.stepIdx}:hold:${this.stepHold.toFixed(1)}`);
    }
    if (this.captions.busy) return;
    this.stepT += dt;
    // the outline appears a moment after the question has been read
    if (step.beat && this.beatDue >= 0) {
      if (this.stepT < this.beatDue) return;
      this.beatDue = -1;
      this.startBeat(step.beat);
    }
    const waiting = step.beat ? this.beat?.state !== 'done' : (!!step.act && !!this.act) || (!!step.screen && !!this.screenAct);
    if (step.nudges) {
      const nx = step.nudges[this.nudged];
      if (nx && this.stepT >= nx[0] * this.fast && !(step.until?.(this) ?? false)) {
        this.captions.say(nx[1]);
        this.nudged++;
        this.log(`nudge:${this.page?.id}:${this.stepIdx}:${this.nudged}`);
      }
    }
    if (step.until && !step.until(this)) return;
    if (!waiting && this.stepT >= (step.beat ? Math.min(this.stepHold, 1.2) : this.stepHold)) {
      this.nudged = 0;
      this.stepIdx++;
      this.stepStarted = false;
    }
  }

  // ---- page turning -------------------------------------------------------------------------

  private checkTurn(dt: number, tips: Vector3[]): void {
    this.turnReadyT += dt;
    if (this.paused) return;
    // touch the glowing corner
    const c = this.corner.getWorldPosition(this.tmpA);
    let near = false;
    let far = tips.length > 0;
    for (const tip of tips) {
      const d = tip.distanceTo(c);
      if (d < 0.065) near = true;
      if (d < 0.095) far = false;
    }
    this.cornerAway = tips.length ? 0 : this.cornerAway + dt;
    if (far || this.cornerAway > 1.5) {
      this.cornerArmed = true;
      this.cornerT = 0;
    } else if (!near) this.cornerT = 0;
    else if (this.cornerArmed && (this.cornerT += dt) > (this.mode === 'room' ? 0.5 : 0.12)) {
      this.cornerArmed = false;
      this.cornerT = 0;
      this.log('turn:corner');
      this.turnPage();
      return;
    }
    // or sweep a flat hand across the book (not in the Lantern Room: hands play there all the time)
    if (this.mode === 'room') return;
    for (const side of ['left', 'right'] as const) {
      const r = this.hands[side];
      if (!r?.tracked) continue;
      const p = this.book.root.worldToLocal(this.tmpB.copy(r.wrist).lerp(r.indexTip, 0.5));
      const over = Math.abs(p.x) < BOOK.W / 2 + 0.05 && p.z > -0.02 && p.z < BOOK.D + 0.1 && p.y > this.book.top && p.y < this.book.top + 0.3;
      const flatHand = classify(r) === 'open';
      if (!over || !flatHand) {
        if (this.sweep.side === side) this.sweep.side = null;
        continue;
      }
      if (this.sweep.side !== side) {
        this.sweep = { x: p.x, t: 0, side };
        continue;
      }
      this.sweep.t += dt;
      if (Math.abs(p.x - this.sweep.x) > 0.13 && this.sweep.t < 1.2) {
        this.log('turn:sweep');
        this.sweep.side = null;
        this.turnPage();
        return;
      }
      if (this.sweep.t > 1.2) this.sweep = { x: p.x, t: 0, side };
    }
  }

  private animateTurn(): void {
    // the whole turn runs 1.5x slower than it used to: everything settles before the next thing moves
    const T = this.phaseT / 1.5;
    const c = (a: number, d: number) => Math.min(1, Math.max(0, (T - a) / d));
    // 1) the cast folds flat (front first), then the scene folds down
    if (T < 0.75) {
      this.foldActors(T, 0, 0.3, 0.04, true);
      this.book.scene?.setRise(1 - c(0.15, 0.6));
      return;
    }
    // 2) the sheet sweeps over; the new page (and its cast, flat and unseen) appears beneath it
    if (this.turnNext) {
      this.sheetPivot.visible = true;
      const next = this.turnNext;
      this.turnNext = null;
      next();
      this.flattenActors();
    }
    const k = c(0.75, 0.95);
    const e = k * k * (3 - 2 * k);
    this.sheetPivot.rotation.z = e * Math.PI;
    this.sheetPivot.position.y = this.book.top + 0.003 + Math.sin(e * Math.PI) * 0.01;
    this.sheetMat.opacity = k < 0.75 ? 1 : Math.max(0, 1 - (k - 0.75) / 0.25);
    if (k >= 1) this.sheetPivot.visible = false;
    // 3) the new scene rises, then the cast stands up, back first
    this.book.scene?.setRise(c(1.45, 1.0));
    if (T > 2.2) this.foldActors(T, 2.2, 0.35, 0.03, false);
    if (T > 2.8) {
      this.sheetPivot.visible = false;
      for (const a of this.actors.values()) if (a.visible) a.fold = 0;
      this.go('page');
    }
  }

  // ---- beats ----------------------------------------------------------------------------------

  /** the plate an option asks for */
  private plateOf(id: string): string {
    return id === 'keep' ? 'tower' : id;
  }

  /** does anything on this page read the screen field */
  private wantField(): boolean {
    // the Four Elements' weather reads your hands all the time (the cloud follows them, rain stops on them)
    return this.filler.active || !!this.screenAct || this.mode === 'room' || (this.bookId === 'weather' && this.mode === 'tale') || this.reach || this.act?.spec.kind === 'steer' || this.replay.stage !== 'off';
  }

  private startBeat(spec: BeatSpec): void {
    this.clearBeat();
    // aim the beam from where this reader's hand rests; the screen point stays fixed
    this.fitZone(0);
    this.aimBeam();
    const ids = spec.options;
    // lay the plates out side by side, centred, 30 mm apart
    const widths = ids.map((id) => PLATES[this.plateOf(id)].w / 1000);
    const total = widths.reduce((a, w) => a + w, 0) + 0.03 * (ids.length - 1);
    let x = -total / 2;
    const gaps: GapView[] = ids.map((id, k) => {
      const plate = this.plateOf(id);
      const cx = x + widths[k] / 2;
      x += widths[k] + 0.03;
      const placed = placeCentred(plate, cx, PLATE_Y);
      return { id, plate, placed, centre: new Vector2(cx, PLATE_Y), at: new Vector2(placed.bx, placed.by), pct: 0 };
    });
    gaps.push(...this.mirrorsOf(gaps));
    this.plateCanvas.draw(gaps.filter((g) => !g.alt).map((g) => g.placed));
    this.field.clear();
    this.screenClear(true);
    const pass = Math.min(spec.gentle ? 0.65 : 0.75, ...gaps.map((g) => PLATE_PASS[g.plate] ?? 1));
    this.filler.setup(gaps.map((g) => g.placed), pass);
    this.plateFx.on = 0;
    this.plateFx.done = 0;
    this.plateFx.hint = 0;
    this.seal.reset();
    this.music.beginMatch();
    this.beat = { spec, state: 'asking', t: 0, hint: false, gaps, chosen: null, tHand: 0, rung: 0, handsOn: 0, handsT: 0, oneHandT: 0, oneHanded: false, lent: false, pass, noShadowT: 0, peelFrom: new Vector3(), shadow: null, puppet: null, landAt: new Vector3() };
    if (this.oneHandReader) this.beat.oneHandT = 3.8;
    this.log(`beat:${spec.id}:asking`);
    if (this.autoShadow) {
      const want = spec.id === 'guide' ? this.forceRoute ?? 'fox' : spec.id === 'gift' ? this.forceEnding ?? 'keep' : spec.options[0];
      const g = gaps.find((x) => x.id === want) ?? gaps[0];
      this.after(0.3, () => this.phantom(g.plate, g.centre.x + 0.004, g.centre.y - 0.003));
    }
  }

  /** the hidden mirror gaps for these (drawn) gaps */
  private mirrorsOf(gaps: GapView[]): GapView[] {
    const out: GapView[] = [];
    for (const g of gaps) {
      const m = MIRROR[g.plate];
      if (g.alt || !m || !PLATES[m]) continue;
      const placed = placeCentred(m, g.centre.x, PLATE_Y);
      out.push({ id: g.id, plate: m, placed, centre: g.centre.clone(), at: new Vector2(placed.bx, placed.by), pct: 0, alt: true });
    }
    return out;
  }

  /** while a plate waits, nothing may overlap it: the moon slides to a corner, the Hollow and lights dim */
  private cleared: { moon: { y: number; size: number; x: number }; hollow: number; light: number } | null = null;
  private screenClear(on: boolean): void {
    const u = this.shadow.material.uniforms;
    if (on && !this.cleared) {
      this.cleared = { moon: { ...this.moonTarget }, hollow: this.hollow.opacity, light: u.uLightOn.value as number };
      if (this.moonTarget.size > 0) this.moonTarget = { x: 0.19, y: 0.215, size: this.moonTarget.size * 0.4 };
      this.hollow.opacity *= 0.3;
      u.uLightOn.value = (u.uLightOn.value as number) * 0.3;
    } else if (!on && this.cleared) {
      // only undo what we did: the story may have changed things while the plate waited
      if (this.moonTarget.x === 0.19 && this.moonTarget.y === 0.215) this.moonTarget = this.cleared.moon;
      this.hollow.opacity = Math.min(1, this.hollow.opacity / 0.3);
      if (!this.lightAnim) u.uLightOn.value = this.lightOn;
      this.cleared = null;
    }
  }

  private clearBeat(): void {
    this.screenClear(false);
    const b = this.beat;
    this.filler.clear();
    this.slip('');
    this.seal.show(false);
    this.shadow.material.uniforms.uHands.value = 1;
    if (!b) return;
    if (b.state === 'asking') this.music.endMatch('cancel');
    if (b.shadow) {
      b.shadow.removeFromParent();
      disposeTree(b.shadow);
    }
    this.plateFx.on = 0;
    this.plateFx.done = 0;
    this.beat = null;
  }

  /** Fit the puppeteer zone to the reader (once per beat) and aim the screen target. */
  private fitZone(xMid: number): void {
    const e = this.book.root.worldToLocal(this.tmpA.copy(this.head));
    const c = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
    this.zoneLocal.set(c(e.x, -0.08, 0.08), c(e.y - 0.31, 0.12, 0.22), c(e.z - 0.24, 0.26, 0.4 + this.comfort.bookPush));
    this.s0.set(xMid, BAND_Y);
    this.beamScale = c(0.115 / this.handLen, 0.5, 0.8);
  }

  /** Point the hand beam (every frame, so it follows the book if it moves). */
  private aimBeam(): void {
    this.book.board.updateMatrixWorld();
    const zoneW = this.book.root.localToWorld(this.tmpA.copy(this.zoneLocal));
    const s0W = this.book.board.localToWorld(this.tmpB.set(this.s0.x, this.s0.y, 0));
    const up = this.tmpC.setFromMatrixColumn(this.book.board.matrixWorld, 1).normalize();
    this.shadow.aimHands(zoneW, s0W, this.s0, up, this.beamScale);
  }

  /** desktop / demo: lend the shape without hands */
  private autoAccept(choice?: string): void {
    const b = this.beat;
    if (!b || b.state !== 'asking') return;
    const id = choice && b.spec.options.includes(choice) ? choice : b.spec.options[0];
    const size: Size = this.demo ? (this.demoLoop % 2 ? 'small' : 'big') : 'big';
    this.accept(id, size);
  }

  /** The shape took: the plate floods with ink, the seal stamps, then it peels into paper. */
  private accept(id: string, size: Size, from?: GapView): void {
    const b = this.beat!;
    const gap = from ?? b.gaps.find((g) => g.id === id) ?? b.gaps[0];
    // (this reading's reader makes shapes with one hand: the next half is offered after a second, not five)
    if (from) {
      const hands = PLATES[from.plate]?.hands;
      if (hands === 1 && b.oneHanded) this.oneHandReader = true;
      else if (hands === 2) this.oneHandReader = false;
    }
    b.chosen = { id, size, gap };
    b.state = 'accepted';
    b.t = 0;
    if (!b.spec.practice) this.st.size[b.spec.id] = size;
    this.music.endMatch('lock');
    this.music.shimmer();
    this.seal.stamp();
    this.slip('');
    this.log(`beat:${b.spec.id}:accepted:${id}:${size}`);
    b.spec.struck?.(this, id, size);
    // only the chosen plate stays on the canvas
    this.plateCanvas.draw([gap.placed]);
    const sh = flat(PLATES[gap.plate].path, new MeshBasicMaterial({ color: A.PAL.ink, transparent: true, opacity: 0, side: DoubleSide, depthWrite: false }), `Shadow ${id}`);
    sh.position.set(gap.at.x, gap.at.y, 0.002);
    this.book.board.add(sh);
    b.shadow = sh;
    this.filler.clear();
  }

  /** the hands in the light: their centroid, its shadow on the screen, their pose */
  private litAt = -1;
  private litList: { side: Side; mid: Vector3; board: Vector2; pose: string | null }[] = [];
  private handsInLight(): { side: Side; mid: Vector3; board: Vector2; pose: string | null }[] {
    // worked out once a frame (several readers ask)
    if (this.litAt === this.frameNo) return this.litList;
    this.litAt = this.frameNo;
    const out: { side: Side; mid: Vector3; board: Vector2; pose: string | null }[] = [];
    this.litList = out;
    // the box reaches to 10 cm in front of the reader's eyes, wherever they sit and however far the book is
    const zMax = Math.max(0.6, this.book.root.worldToLocal(this.tmpA.copy(this.head)).z - 0.1);
    for (const side of ['left', 'right'] as const) {
      const r = this.hands[side];
      if (!r?.tracked) continue;
      const mid = r.wrist.clone().lerp(r.indexTip, 0.6);
      const loc = this.book.root.worldToLocal(mid.clone());
      const board = this.shadow.handToBoard(mid);
      const inBox = Math.abs(loc.x - this.zoneLocal.x) < 0.34 && loc.x < 0.26 && loc.y > 0.04 && loc.y < 0.36 && loc.z > 0.1 && loc.z < zMax;
      const onScreen = Math.abs(board.x) < BOOK.W / 2 && board.y > 0 && board.y < BOOK.H;
      if (inBox && onScreen) out.push({ side, mid, board, pose: classify(r) });
    }
    return out;
  }

  private nearestTo(lit: { board: Vector2 }[], at: Vector2): number {
    let best = -1;
    for (let i = 0; i < lit.length; i++) if (best < 0 || lit[i].board.distanceTo(at) < lit[best].board.distanceTo(at)) best = i;
    return best;
  }

  /** hands whose shadow centre falls on (or near) a plate */
  private handsOnPlate(lit: { board: Vector2 }[], g: GapView): number {
    const d = g.placed.data;
    let n = 0;
    for (const h of lit) {
      if (Math.abs(h.board.x - g.centre.x) < d.w / 2000 + 0.03 && Math.abs(h.board.y - g.centre.y) < d.h / 2000 + 0.03) n++;
    }
    return n;
  }

  private updateBeat(dt: number): void {
    const b = this.beat;
    const u = this.shadow.material.uniforms;
    this.handInBeam = null;
    const fx = this.plateFx;
    const k = Math.min(1, dt * 4);
    if (!b || b.state === 'done') {
      fx.on += (0 - fx.on) * k;
      fx.done += (0 - fx.done) * k;
      fx.hint = 0;
      this.pushPlateFx();
      this.seal.update(dt, 0);
      return;
    }
    b.t += dt;
    this.filler.update(dt);
    const handShadow = this.field.count > 12 && this.field.age < 0.6;
    fx.fade += ((handShadow ? 1 : 0) - fx.fade) * Math.min(1, dt * 3);
    if (b.state === 'asking') {
      fx.on += (1 - fx.on) * Math.min(1, dt * 1.6);
      if (b.spec.hollowGrows && b.rung < 2) this.hollow.grow = Math.min(1.3, this.hollow.grow + dt * 0.05);
      const lit = this.handsInLight();
      if (lit.length) {
        this.handInBeam = { side: lit[0].side, pose: lit[0].pose, board: [+lit[0].board.x.toFixed(3), +lit[0].board.y.toFixed(3)] };
        b.tHand += dt;
      }
      // the patience ladder (story time, after the caption is up): advice, then the missing parts glow,
      // then a quiet assist; at the end the book lends the shape itself
      const T = (b.t - 1.5) / this.paceK;
      b.noShadowT = handShadow ? 0 : b.noShadowT + dt;
      const rung = (T >= 20 && b.tHand > 2 ? 3 : T >= 12 ? 2 : T >= 6 ? 1 : 0) as 0 | 1 | 2 | 3;
      if (rung !== b.rung) {
        b.rung = rung;
        this.log(`beat:${b.spec.id}:rung:${rung}`);
        if (rung >= 1 && !b.hint) {
          b.hint = true;
          this.music.hint();
        }
        if (rung === 3) for (const v of this.filler.views) v.hold.setMarks(b.pass - 0.05, b.pass - 0.12);
      }
      // the advice: for the plate the hand is nearest (or the first)
      if (rung >= 1) {
        const shown = b.gaps.filter((x) => !x.alt);
        // with a hand up: the outline it is nearest; with none: each option in turn (a choice names both)
        const i = lit.length ? shown.reduce((best, g, j) => (lit[0].board.distanceTo(g.centre) < lit[0].board.distanceTo(shown[best].centre) ? j : best), 0) : Math.floor(Math.max(0, T - 6) / 6) % shown.length;
        const g = shown[i];
        const say = shown.length > 1 ? `${CHOICE_NAMES[g.id] ?? g.id}: ${g.placed.data.advice.replace(/^For example: /, '')}` : g.placed.data.advice;
        const isOneHand = Object.values(ONE_HAND).includes(g.plate);
        const tail = say.replace(/^For example: /, '');
        // a hand is up but no shadow is on the picture: say where to hold it (the shape comes after)
        if (b.noShadowT > 3 && lit.length === 0 && this.lastTip.length > 0) this.slip('Hold your hand up between you and the picture, until its shadow falls on it.');
        else this.slip(b.oneHanded && isOneHand ? `One hand is enough now. ${tail.charAt(0).toUpperCase()}${tail.slice(1)}` : say);
      }
      fx.hint += ((rung >= 2 ? 1 : 0) - fx.hint) * Math.min(1, dt * 2);
      // one hand only for 5 s on a two-hand plate (the wings): offer its one-hand version
      const nLit = lit.length;
      b.oneHandT = nLit === 1 ? b.oneHandT + dt : nLit >= 2 ? 0 : b.oneHandT;
      if (b.oneHandT > 5 && !b.oneHanded) {
        const g2 = b.gaps.find((g) => !g.alt && ONE_HAND[g.plate] && PLATES[ONE_HAND[g.plate]]);
        if (g2) {
          b.oneHanded = true;
          // the two-hand shape (and its mirror) still counts, unseen: a second hand coming back is never wrong
          const two: GapView[] = [g2.plate, MIRROR[g2.plate]].filter((pl): pl is string => !!pl && !!PLATES[pl]).map((pl) => {
            const placed = placeCentred(pl, g2.centre.x, PLATE_Y);
            return { id: g2.id, plate: pl, placed, centre: g2.centre.clone(), at: new Vector2(placed.bx, placed.by), pct: 0, alt: true };
          });
          g2.plate = ONE_HAND[g2.plate];
          // under the hand that is in the light (it stays where you already are)
          const home = g2.centre.x;
          const near = lit.find((h) => b.gaps.filter((g) => !g.alt).every((g) => h.board.distanceTo(g2.centre) <= h.board.distanceTo(g.centre)));
          if (near) g2.centre.x = Math.max(home - 0.09, Math.min(home + 0.09, near.board.x));
          g2.placed = placeCentred(g2.plate, g2.centre.x, PLATE_Y);
          g2.at.set(g2.placed.bx, g2.placed.by);
          // the mirrors follow: the one-hand half for either hand
          b.gaps = b.gaps.filter((g) => !g.alt);
          b.gaps.push(...this.mirrorsOf(b.gaps), ...two);
          this.slip('One hand is enough now.');
          this.plateCanvas.draw(b.gaps.filter((g) => !g.alt).map((g) => g.placed));
          this.filler.setup(b.gaps.map((g) => g.placed), b.pass);
          this.log(`beat:${b.spec.id}:one-hand`);
        }
      }
      // read each plate
      let best: GapView | null = null;
      let bestScore = -1;
      for (const g of b.gaps) {
        const v = this.filler.view(g.plate);
        g.pct = v ? v.hold.shown : 0;
        if (v?.state === 'done') {
          const sc = v.res?.score ?? 0;
          if (sc > bestScore) {
            bestScore = sc;
            best = g;
          }
        }
      }
      // how many hands are helping (the most seen in the last second)
      let top: GapView = b.gaps[0];
      for (const g of b.gaps) if (g.pct > top.pct) top = g;
      const n = this.handsOnPlate(lit, top);
      b.handsT = n >= b.handsOn ? 0 : b.handsT + dt;
      if (n >= b.handsOn || b.handsT > 1) b.handsOn = n;
      // the seal: shown while your shadow is on the screen
      const tv = this.filler.view(top.plate);
      this.seal.show(handShadow && !!tv?.res?.present);
      this.seal.update(dt, top.pct);
      this.music.matchLevel(this.paused ? 0 : Math.min(1, top.pct / 100), 0.75, tv ? Math.min(1, tv.hold.hold / 0.6) : 0);
      if (best && !this.holdBeats) {
        const two = best.placed.data.hands === 2;
        // "two hands make a big one": a two-hand shape made by two hands is big (or a near-perfect fit)
        const size: Size = two ? (b.handsOn >= 2 || bestScore >= 0.95 ? 'big' : 'small') : b.handsOn >= 2 ? 'big' : 'small';
        this.log(`beat:${b.spec.id}:match:${best.id}:${bestScore.toFixed(2)}:hands${b.handsOn}`);
        this.accept(best.id, size, best);
        this.pushPlateFx();
        return;
      }
      // the book lends it: after a long honest try, or when no hand ever came
      if (!this.holdBeats && !b.spec.practice && ((T >= 28 && b.tHand > 3 * this.paceK) || T >= (this.bookId === 'weather' && b.tHand < 1 && Object.keys(this.st.marks).some((k) => k.startsWith('lent:')) ? 22 : 40))) {
        b.lent = true;
        const g = b.gaps.reduce((a, c) => (c.pct > a.pct ? c : a), b.gaps[0]);
        this.log(`beat:${b.spec.id}:lent:${g.id}`);
        this.st.marks[`lent:${b.spec.id}`] = 1;
        this.accept(g.id, 'small');
      }
    } else if (b.state === 'accepted') {
      // the plate floods with ink, a warm rim; a breath of anticipation ("that is mine"), then it peels
      const kk = Math.min(1, b.t / 0.45);
      fx.done = kk;
      fx.hint = 0;
      this.seal.update(dt, 100);
      (b.shadow!.material as MeshBasicMaterial).opacity = 0.9 * Math.min(1, b.t / 0.3);
      u.uHands.value = 1 - 0.85 * Math.min(1, b.t / 0.6);
      if (b.spec.morph && b.t >= 0.5) {
        // the outline itself becomes the thing (The Four Elements): it lifts off as cut paper, nothing flies away
        const ch = b.chosen!;
        b.shadow!.visible = false;
        fx.on = 0;
        fx.done = 0;
        this.seal.show(false);
        this.screenClear(false);
        b.state = 'done';
        u.uHands.value = 1;
        if (this.autoShadow) this.phantom(null);
        this.plateCanvas.clear();
        b.spec.morph(this, ch.gap.plate, ch.gap.at.x, ch.gap.at.y);
        b.spec.done?.(this, ch.id, ch.size);
        this.log(`beat:${b.spec.id}:done`);
        this.pushPlateFx();
        return;
      }
      // the very first one (the rabbit) takes its time: "that is mine", then it peels slowly
      if (!b.spec.morph && b.t >= (b.spec.id === 'rabbit' ? 1.3 : 0.75)) {
        b.state = 'peel';
        b.t = 0;
        fx.on = 0;
        this.seal.show(false);
        this.book.root.attach(b.shadow!);
        b.peelFrom.copy(b.shadow!.position);
        const off = b.spec.landOffset ?? [0, 0, 0];
        b.landAt.copy(this.anchor(b.spec.landBy?.[b.chosen!.id] ?? b.spec.land)).add(new Vector3(off[0], off[1], off[2]));
        this.log(`beat:${b.spec.id}:peel`);
        this.screenClear(false);
      }
    } else if (b.state === 'peel') {
      this.seal.update(dt, 100);
      fx.done = 0;
      const spawn = b.spec.spawn !== false;
      const T = b.spec.id === 'rabbit' ? 2.8 : 1.9;
      const kk = Math.min(1, b.t / T);
      const e = kk * kk * (3 - 2 * kk);
      const ch = b.chosen!;
      const from = b.peelFrom;
      const to = spawn ? this.tmpB.copy(b.landAt).add(this.tmpC.set(0, 0.02, 0)) : this.tmpB.set(ch.gap.centre.x * 0.5, this.book.top + ch.gap.at.y + 0.02, 0.03);
      const sh = b.shadow!;
      sh.position.lerpVectors(from, to, e);
      sh.position.y += Math.sin(kk * Math.PI) * 0.06;
      sh.rotation.set(-0.3 * Math.sin(kk * Math.PI), e * Math.PI * 0.5, 0);
      sh.scale.setScalar(1 - 0.5 * e);
      (sh.material as MeshBasicMaterial).opacity = 0.9 * (1 - Math.max(0, (kk - 0.62) / 0.38));
      if (spawn && kk > 0.55) {
        if (!b.puppet) {
          const def = CAST[ch.id];
          const p = puppet(def);
          p.put(b.landAt);
          p.setSize(def.scale * (ch.size === 'big' ? 1.2 : 0.8));
          this.book.actors.add(p.root);
          this.actors.set(ch.id, p);
          b.puppet = p;
          if (!b.spec.practice) this.st.made.push(ch.id);
          const list = this.madeOnPage.get(this.pageIdx) ?? [];
          list.push(ch.id);
          this.madeOnPage.set(this.pageIdx, list);
          this.music.rustle(0.4);
          this.music.join(def.part);
          this.log(`made:${ch.id}`);
        }
        const q = Math.min(1, (kk - 0.55) / 0.45);
        b.puppet.root.rotation.y = (1 - q) * -Math.PI * 0.5;
      }
      if (kk >= 1) {
        sh.visible = false;
        if (b.puppet) b.puppet.root.rotation.y = 0;
        b.state = 'done';
        u.uHands.value = 1;
        if (this.autoShadow) this.phantom(null);
        this.plateCanvas.clear();
        b.spec.done?.(this, ch.id, ch.size);
        if (b.spec.id === 'rabbit' && b.puppet) this.firstFlourish(b.puppet);
        this.log(`beat:${b.spec.id}:done`);
      }
    }
    this.pushPlateFx();
  }

  /** the first puppet comes alive: two ear twitches (a squash), a little motif, then a hop to Ama */
  private firstFlourish(p: Actor): void {
    const pulse = (at: number, k: number) => this.after(at, () => (p.squash = k));
    pulse(0.15, 1.1);
    pulse(0.27, 1);
    pulse(0.45, 1.08);
    pulse(0.57, 1);
    this.after(0.2, () => this.music.laugh());
    this.after(0.9, () => this.walk('rabbit', 'ama', 0.042, -0.012));
  }

  private pushPlateFx(): void {
    const u = this.shadow.material.uniforms;
    const fx = this.plateFx;
    u.uPlateOn.value = fx.on;
    u.uPlateFade.value = fx.fade;
    u.uPlateHint.value = fx.hint;
    u.uPlateDone.value = fx.done;
  }

  /** DEV: beats never accept (to bake outlines from the hand model) */
  holdBeats = false;

  // ---- shape practice (?shapes) -----------------------------------------------------------------

  // ---- acts: small hand moments that never block the tale --------------------------------------

  cornerPoint(): Vector3 {
    return this.corner.position.clone().setY(this.book.top);
  }

  actorPoint(id: string, frac: number): Vector3 | null {
    const a = this.actors.get(id);
    if (!a || !a.visible) return null;
    a.root.updateMatrixWorld(true);
    const box = new Box3().setFromObject(a.root);
    if (box.isEmpty()) return null;
    const c = box.getCenter(new Vector3());
    c.y = box.min.y + (box.max.y - box.min.y) * frac;
    c.z = box.max.z + 0.004;
    return this.book.root.worldToLocal(c);
  }

  private startAct(spec: ActSpec): void {
    this.clearAct();
    this.clearScreen();
    const targets = spec.kind === 'steer' ? [] : spec.targets?.(this) ?? [];
    const marks = targets.map((p, k) => {
      const m = new Mesh(this.markGeo, new MeshBasicMaterial({ map: this.markTex, color: '#ffd9a0', transparent: true, opacity: 0, blending: AdditiveBlending, depthWrite: false }));
      m.name = `Act ${spec.id} ${k}`;
      m.position.copy(p);
      m.renderOrder = 13;
      this.book.root.add(m);
      return m;
    });
    this.act = { spec, targets, marks, k: 0, tk: 0, t: 0, hold: 0, stroke: { left: null, right: null }, idle: 0, letGo: false, cool: 0, auto: false };
    this.log(`act:${spec.id}:start:${targets.length}`);
    if (spec.kind !== 'steer' && !targets.length) this.endAct();
  }

  private startScreen(spec: ScreenActSpec): void {
    this.clearScreen();
    this.oneHandT = 0;
    this.fitZone(0);
    this.aimBeam();
    // DEV (?patient): screen acts wait for the check's shadow instead of resolving by themselves
    if (import.meta.env.DEV && new URLSearchParams(location.search).has('patient')) spec.each = 600;
    this.screenAct = new ScreenAct(this.screenHost, spec);
    if (this.autoShadow) this.autoPhantomFor(spec);
  }

  private clearScreen(): void {
    this.screenAct?.dispose();
    this.screenAct = null;
  }

  private oneHandT = 0;
  private updateScreen(dt: number): void {
    const a = this.screenAct;
    if (!a) return;
    if (a.spec.id === 'bridge') {
      const lit = this.handsInLight().length;
      this.oneHandT = lit === 1 ? this.oneHandT + dt : lit >= 2 ? 0 : this.oneHandT;
      if (this.oneHandT > 8) a.useStone();
    }
    // ?fast (tests): screen acts run at test speed too
    if (a.update(dt / Math.max(0.12, Math.min(1, this.fast)))) {
      if (this.autoShadow) this.phantom(null);
      a.dispose();
      if (this.screenAct === a) this.screenAct = null;
    }
  }

  /** keep a copy of the reader's shadow right now (the Hollow will show it back) */
  captureEcho(): void {
    if (this.field.count > 40) {
      this.echoMask = this.field.H.slice();
      this.st.marks.echo = 1;
    }
    this.log(`echo:${this.echoMask ? 'captured' : 'none'}`);
  }

  private clearAct(): void {
    const a = this.act;
    if (!a) return;
    if (this.actHinted) {
      this.actHinted = false;
      this.slip('');
    }
    for (const m of a.marks) {
      m.removeFromParent();
      (m.material as MeshBasicMaterial).dispose();
    }
    if (a.spec.kind === 'steer') this.hollow.flightHeld = false;
    this.act = null;
  }

  private endAct(): void {
    const a = this.act;
    if (!a) return;
    a.spec.onDone?.(this);
    this.log(`act:${a.spec.id}:done`);
    this.clearAct();
    this.clearScreen();
  }

  /** the act's in-view hint is showing (cleared when the next mark lights) */
  private actHinted = false;

  private actHit(byHand: boolean): void {
    const a = this.act!;
    if (this.actHinted) {
      this.actHinted = false;
      this.slip('');
    }
    a.spec.onHit?.(this, a.k, byHand);
    this.log(`act:${a.spec.id}:${byHand ? 'hit' : 'timeout'}:${a.k}`);
    if (byHand) this.music.tap();
    a.k++;
    a.tk = 0;
    a.hold = 0;
    a.cool = 0.35;
    if (a.k >= a.targets.length) this.endAct();
  }

  private updateAct(dt: number): void {
    const a = this.act;
    if (!a || dt === 0) return;
    a.t += dt;
    a.cool = Math.max(0, a.cool - dt);
    const s = a.spec;
    const each = s.each * Math.max(this.fast, 0.15) * this.paceK;
    // let the line be read before the first target can time out
    let coming = false;
    if (s.kind === 'touch' && a.targets[a.k]) {
      const w = this.book.root.localToWorld(this.tmpA.copy(a.targets[a.k]));
      for (const tip of this.lastTip) if (tip.distanceTo(w) < 0.18) coming = true;
    }
    if (a.t > 1.6 * Math.max(this.fast, 0.15) && a.cool === 0 && !coming) a.tk += dt;
    if (s.kind === 'steer') {
      const tip = this.field.count > 12 && this.field.age < 0.6 ? this.field.tipRight() : null;
      if (tip && !a.letGo && a.t <= each * 3.5) {
        a.idle = 0;
        if (s.onSteer?.(this, tip[0], tip[1])) {
          this.log(`act:${s.id}:hit:0`);
          this.endAct();
        }
      } else {
        a.idle += dt;
        if (!a.letGo && (a.idle > each || a.t > each * 3.5)) {
          a.idle = 0;
          a.letGo = true;
          s.onLetGo?.(this);
          this.log(`act:${s.id}:timeout:0`);
        }
        if (a.letGo && a.idle > each + 2) this.endAct();
      }
      return;
    }
    // the marks: the live one pulses like the page corner, done ones fade, the rest wait faintly
    a.marks.forEach((m, k) => {
      const mat = m.material as MeshBasicMaterial;
      const want = k === a.k ? 0.55 + 0.35 * Math.sin(this.t * 6) : k < a.k ? 0 : 0.12;
      mat.opacity += (want - mat.opacity) * Math.min(1, dt * 6);
      m.visible = mat.opacity > 0.01;
      m.lookAt(this.head);
      m.scale.setScalar(k === a.k ? 1 + 0.15 * Math.sin(this.t * 6) : 0.8);
    });
    const tgt = a.targets[a.k];
    if (!tgt) return;
    const world = this.book.root.localToWorld(this.tmpA.copy(tgt));
    let hit = false;
    // a fingertip on it counts for every kind
    for (const tip of this.lastTip) if (tip.distanceTo(world) < 0.035) hit = true;
    if (s.kind === 'touch' && a.k === 0 && a.t < 0.6 * Math.max(this.fast, 0.15)) hit = false;
    if (!hit && s.kind === 'point') {
      let on = false;
      for (const side of ['left', 'right'] as const) {
        const r = this.hands[side];
        if (!r?.tracked) continue;
        const pose = classify(r);
        if (pose !== 'point' && pose !== 'gun') continue;
        const o = this.book.root.worldToLocal(this.tmpB.copy(r.wrist));
        const tipL = this.book.root.worldToLocal(this.tmpC.copy(r.indexTip));
        const dir = tipL.sub(o);
        if (dir.y > -0.02) continue;
        const k = (tgt.y - o.y) / dir.y;
        if (k <= 0) continue;
        const px = o.x + dir.x * k;
        const pz = o.z + dir.z * k;
        if (Math.hypot(px - tgt.x, pz - tgt.z) < 0.045) on = true;
      }
      a.hold = on ? a.hold + dt : Math.max(0, a.hold - dt * 2);
      if (a.hold > 0.4) hit = true;
    }
    if (!hit && s.kind === 'stroke') {
      for (const side of ['left', 'right'] as const) {
        const r = this.hands[side];
        if (!r?.tracked) {
          a.stroke[side] = null;
          continue;
        }
        const palm = this.book.root.worldToLocal(this.tmpB.copy(r.wrist).lerp(r.middleTip, 0.5));
        const inBox = Math.abs(palm.x - tgt.x) < 0.14 && palm.y > tgt.y + 0.01 && palm.y < tgt.y + 0.26 && Math.abs(palm.z - tgt.z) < 0.18;
        const st = a.stroke[side];
        if (!inBox) a.stroke[side] = null;
        else if (st?.spent) {
          // a spent stroke re-arms only once the hand has gone back 3 cm
          if (palm.z < st.z - 0.03) a.stroke[side] = { z: palm.z, t: a.t };
          else st.z = Math.max(st.z, palm.z);
        } else if (!st || a.t - st.t > 2.5) a.stroke[side] = { z: palm.z, t: a.t };
        else if (a.cool === 0 && palm.z - st.z >= 0.05 && a.t - st.t > 0.12) {
          hit = true;
          a.stroke[side] = { z: palm.z, t: a.t, spent: true };
        } else if (palm.z < st.z) st.z = palm.z; // the stroke starts at its farthest point
      }
    }
    if (a.cool > 0) return;
    if (hit) {
      a.auto = false;
      this.actHit(true);
    }
    // "I need to do it. I'm the one": a touch waits a long while before it happens by itself
    // (the first mark waits longest; once the reader is at it, the rest wait a little less; once the
    // book has done one itself, the rest follow at a walking pace, so nobody watches for a minute)
    else if (a.tk >= (a.auto ? 1.4 * Math.max(this.fast, 0.15) : Math.max(each, (a.k === 0 ? s.wait ?? 16 : 9) * Math.max(this.fast, 0.15) * this.paceK))) {
      a.auto = true;
      this.actHit(false);
    }
    // ...but not in silence: past its usual time, a short line in view says what to do
    else if (a.tk >= each && !this.actHinted) {
      this.actHinted = true;
      const how: Record<string, string> = {
        touch: 'Touch the glowing mark with a fingertip.',
        point: 'Point a finger at the glowing mark, and hold it there a moment.',
        stroke: 'Stroke your flat hand toward you, along the beam.',
      };
      const line = this.captions.shownText;
      if (how[a.spec.kind] && !/touch|point|stroke/i.test(line)) this.slip(how[a.spec.kind]);
    }
  }

  shadowLight(out = new Vector3()): Vector3 {
    return this.book.root.localToWorld(out.copy(SHADOW_LIGHT));
  }

  // ---- ambient animation --------------------------------------------------------------------

  private animate(dt: number, sdt: number): void {
    const t = this.t;
    // Tomas on the desk wears his hat only while he has it (the wind took it on the common; the Hollow gives it back)
    {
      const hat = this.actors.get('tomas')?.root.getObjectByName('Tomas hat');
      if (hat) hat.visible = this.st.hat !== 'lost' || !!this.st.marks.hatHome;
    }
    this.book.scene?.animate?.(t, sdt);
    for (const a of this.actors.values()) a.update(sdt, a.idle === 'hop' ? () => this.music.tap() : undefined);
    for (const [id, a] of this.actors) {
      const part = CAST[id]?.part;
      if (part && a.root.visible) this.music.place(part, a.root.getWorldPosition(this.tmpC));
    }
    if (this.music.has('hollow')) this.music.place('hollow', this.hollow.root.getWorldPosition(this.tmpC));
    // Ama
    const head = this.book.amaHead;
    const ama = this.amaActor.root;
    if (this.amaMoodNow === 'crying') {
      head.rotation.x += (0.38 - head.rotation.x) * Math.min(1, dt * 3);
      this.tears.forEach((tear, k) => {
        const p = (t * 0.6 + k / 3) % 1;
        tear.visible = true;
        // on her cheeks, falling a little way (head space)
        tear.position.set(0.0035 * (k % 2 ? 1 : -1), 0.007 - p * 0.012, 0.004);
        (tear.material as MeshBasicMaterial).opacity = Math.sin(p * Math.PI) * 0.85;
      });
    } else {
      head.rotation.x += (0 - head.rotation.x) * Math.min(1, dt * 4);
      for (const tear of this.tears) {
        const m = tear.material as MeshBasicMaterial;
        m.opacity *= 0.9;
        tear.visible = m.opacity > 0.01;
      }
      this.book.ama.rotation.z = this.amaMoodNow === 'happy' ? Math.sin(t * 2.2) * 0.05 : 0;
    }
    // Ama's own shadow, home at her heels
    if (this.amaShadow.userData.on) {
      const m = this.amaShadow.material as MeshBasicMaterial;
      m.opacity += (0.75 - m.opacity) * Math.min(1, dt * 1.5);
      this.amaShadow.position.set(ama.position.x - 0.03, this.book.top + 0.0015, ama.position.z - 0.012);
      this.amaShadow.visible = ama.visible;
    }
    // walking shadows (page 1)
    for (const w of this.walkers) {
      if (!w.visible) continue;
      w.userData.t += sdt;
      const k = Math.min(1, w.userData.t / 5);
      w.position.x = w.userData.x0 + k * 0.22;
      w.position.y = ridge('hills', w.position.x) - 0.002 + Math.abs(Math.sin(w.userData.t * 5)) * 0.003;
      (w.material as MeshBasicMaterial).opacity = 0.55 * Math.sin(Math.min(1, k * 1.2) * Math.PI);
      if (k >= 1) w.visible = false;
    }
    // the procession up the hill (owl's view)
    for (const m of this.marchers) {
      if (!m.visible) continue;
      m.userData.t += sdt;
      const k = Math.max(0, Math.min(1, m.userData.t / 7));
      const mx = -0.19 + k * 0.26;
      m.position.set(mx, ridge('farBank', mx) + 0.001 + Math.abs(Math.sin(m.userData.t * 5)) * 0.002, 0.0015);
      const flip = m.userData.rabbit && k > 0.45 && k < 0.6 ? -1 : 1; // it looked back once
      m.scale.x = Math.abs(m.scale.x) * flip;
      const mat = m.material as MeshBasicMaterial;
      const target = this.marchOn && m.userData.t > 0 ? 0.6 * Math.sin(Math.min(1, k * 1.05) * Math.PI) : 0;
      mat.opacity += (target - mat.opacity) * Math.min(1, dt * 3);
      if (!this.marchOn && mat.opacity < 0.01) m.visible = false;
    }
    // the big moon
    this.moonNow.y += (this.moonTarget.y - this.moonNow.y) * Math.min(1, dt * 0.5);
    this.moonNow.x += (this.moonTarget.x - this.moonNow.x) * Math.min(1, dt * 0.5);
    this.bigMoon.position.x = this.moonNow.x;
    // shadows running down the hill to their people
    for (const r of this.runners) {
      if (!r.visible) continue;
      r.userData.t += sdt;
      const k = Math.max(0, Math.min(1, r.userData.t / 3));
      const x = r.userData.dir * k * 0.19;
      r.position.set(x, ridge('bigHill', x) - 0.001 + Math.abs(Math.sin(r.userData.t * 7)) * 0.002, 0.0026);
      r.scale.x = Math.abs(r.scale.x) * r.userData.dir;
      (r.material as MeshBasicMaterial).opacity = r.userData.t < 0 ? 0 : 0.7 * Math.sin(Math.min(1, k * 1.1) * Math.PI);
      if (k >= 1) r.visible = false;
    }
    this.moonNow.size += (this.moonTarget.size - this.moonNow.size) * Math.min(1, dt * 0.6);
    this.bigMoon.visible = this.moonNow.size > 0.02;
    this.book.smallMoon.visible = !this.bigMoon.visible && (this.shadow.material.uniforms.uDay.value as number) < 0.35 && this.lightOn < 0.05;
    this.bigMoon.position.y = this.moonNow.y;
    this.bigMoon.scale.setScalar(Math.max(0.001, this.moonNow.size));
    // the far lamp (the hook)
    if (this.farLampMesh.userData.on) {
      (this.farLampMesh.material as MeshBasicMaterial).opacity = 0.65 + 0.3 * Math.sin(t * 3);
      ((this.farLampMesh.children[0] as Mesh).material as MeshBasicMaterial).opacity = 0.35;
    }
    // the page corner breathes when a turn is waiting
    const cm = this.corner.material as MeshBasicMaterial;
    const skippable = false;
    cm.opacity += (((this.turnReady || skippable) && !this.paused ? 0.55 + 0.35 * Math.sin(t * 3) : 0) - cm.opacity) * Math.min(1, dt * 4);
    this.corner.visible = cm.opacity > 0.01;
    // the Hollow
    this.hollow.update(sdt);
  }

  // ---- the Lantern Room (Shadow Practice) ----------------------------------------------------------

  mode: 'tale' | 'room' = 'tale';
  private room: LanternRoom | null = null;
  private roomMade: string | null = null;
  private static readonly ROOM_PAGE: PageDef = { id: 'lantern', scene: lanternRoomScene, steps: [], enter: (d) => d.day(0) };

  /** a spine was chosen: open it (closing the open book first) */
  private choose(id: string): void {
    // another book chosen while the bookmark card waits: the card goes, the bookmark stays
    // (a book with a bookmark offers it again when its own spine is touched: openBook does that)
    if (this.resumeFrom) {
      this.resumeFrom = null;
      this.resumeCard?.open(false);
    }
    if (this.phase === 'cover') {
      this.log(`shelf:${id}`);
      if (id === 'room') {
        this.bookId = 'tale';
        this.book.setCover('tale');
        this.openRoom();
      }
      else {
        this.bookId = id === 'weather' ? 'weather' : 'tale';
        this.book.setCover(this.bookId);
        this.openBook();
      }
      return;
    }
    const same = id === 'room' ? this.mode === 'room' : this.mode === 'tale' && this.bookId === id;
    if (same) return;
    this.log(`shelf:${id}`);
    this.pendingChoice = id;
    this.closeBook();
  }

  private flagStored(key: string): boolean {
    try {
      return localStorage.getItem(key) === '1';
    } catch {
      return false;
    }
  }

  private storeFlag(key: string): void {
    try {
      localStorage.setItem(key, '1');
    } catch {
      /* private window */
    }
  }

  /** open the book on the Lantern Room instead of the tale */
  openRoom(): void {
    if (this.phase !== 'cover') return;
    this.enterPage(-1, TaleSystem.ROOM_PAGE);
    this.flattenActors();
    this.go('opening');
    this.music.rustle(1.4);
  }

  private shelfActors: Actor[] = [];
  private roomHost(): RoomHost {
    return {
      ...this.screenHost,
      startPlate: (id) => {
        this.roomMade = null;
        this.startBeat({ id: 'practice', options: [id], land: 'shelf', practice: true, spawn: false, gentle: true, done: (_d, cid) => (this.roomMade = cid) });
      },
      plateState: () => this.beat?.state === 'done' ? 'done' : this.beat ? 'asking' : null,
      plateT: () => this.beat?.t ?? 0,
      dropPlate: () => this.clearBeat(),
      takeMade: () => {
        const m = this.roomMade;
        this.roomMade = null;
        return m;
      },
      shelf: (list) => {
        for (const a of this.shelfActors) {
          a.root.removeFromParent();
          disposeTree(a.root);
        }
        this.shelfActors = [];
        const step = Math.min(0.045, 0.34 / Math.max(1, list.length));
        list.forEach(({ id, n }, k) => {
          const def = CAST[id];
          if (!def) return;
          const p = puppet(def);
          p.put(this.anchor('shelf', k * step, 0));
          p.visible = true;
          // shelf puppets stand still (they are not stepped as actors): set their size directly
          p.root.scale.setScalar(def.scale * 0.45 * (n >= 3 ? 1.08 : 1));
          this.book.actors.add(p.root);
          this.shelfActors.push(p);
        });
      },
      say: (t) => this.captions.say(t),
      voice: (id, seconds) => {
        const part = CAST[id]?.part;
        if (!part) return;
        this.music.join(part);
        this.after(seconds, () => this.music.leave(part));
      },
    };
  }

  private coverTouched(tips: Vector3[]): boolean {
    for (const tip of tips) {
      const p = this.book.root.worldToLocal(this.tmpC.copy(tip));
      if (Math.abs(p.x) < BOOK.W / 2 && p.z > 0 && p.z < BOOK.D && p.y > -0.01 && p.y < this.book.top + BOOK.board + 0.035) {
        this.log('cover:touched');
        return true;
      }
    }
    return false;
  }

  // ---- pause ------------------------------------------------------------------------------------

  private palmLast: Record<Side, Vector3> = { left: new Vector3(), right: new Vector3() };
  private checkPalmPause(dt: number): void {
    if ((this.phase !== 'page' && this.phase !== 'turning') || this.pauseCard.isOpen) {
      this.palmT = 0;
      this.book.lantern.cover = 0;
      return;
    }
    const flame = this.book.lantern.flame(this.tmpA);
    const busy = this.beat?.state === 'asking' || !!this.screenAct || !!this.act;
    let over = false;
    for (const side of ['left', 'right'] as const) {
      const r = this.hands[side];
      if (!r?.tracked) continue;
      const palm = this.tmpB.copy(r.wrist).lerp(r.indexTip, 0.45);
      const slow = this.palmLast[side];
      const before = this.tmpC.copy(slow);
      slow.lerp(palm, Math.min(1, dt * 9));
      const speed = slow.distanceTo(before) / Math.max(dt, 1e-3);
      const dy = palm.y - flame.y;
      const dh = Math.hypot(palm.x - flame.x, palm.z - flame.z);
      const near = busy ? 0.07 : 0.09;
      if (speed < 0.18 && dy > 0.02 && dy < 0.2 && dh < near && r.palmNormal.y < -0.5 && classify(r) === 'open') over = true;
    }
    // while the screen asks for hands, a palm needs longer, and it must not be working: a palm whose
    // shadow is on the stage (a road, a roof) is playing, not resting
    // (a road or a roof is made in the beam, well away from the flame: the 6 cm radius keeps them apart)
    const working = false;
    const need = busy ? 0.8 : 0.32;
    this.palmT = over && !working ? this.palmT + dt : 0;
    // the lantern answers a covering palm at once (it dims under the hand): "it has seen me"
    this.book.lantern.cover += ((over ? 1 : 0) - this.book.lantern.cover) * Math.min(1, dt * 14);
    if (this.palmT > need) {
      this.palmT = 0;
      // the last line of the book: "Cover the lantern, and keep the dark company"
      if (this.page?.id === 'epilogue' && (this.turnReady || this.stepIdx >= this.steps.length - 1)) {
        this.log('close:palm');
        this.closeBook();
        return;
      }
      this.setPaused(true);
    }
  }

  flag(name: string): boolean {
    return this.flags.has(name);
  }

  setPaused(p: boolean): void {
    if (p && !this.paused) this.flags.add('paused');
    if (!p && this.paused) this.flags.add('resumed');
    // the lesson talks you through the card
    if (p && this.page?.id === 'flyleaf') {
      this.captionBeforePause = this.captions.shown ?? '';
      this.captions.say('Touch Continue to go on.');
    }
    if (!p && this.paused && this.page?.id === 'flyleaf' && this.captionBeforePause) {
      this.captions.say(this.captionBeforePause);
      this.captionBeforePause = '';
    }
    this.paused = p;
    this.pauseCard.setRowVisible('replay', this.mode !== 'room');
    if (p) this.placeCard(this.pauseCard);
    // the card always opens on its first page
    this.pauseCard.open(p, 'pause');
    this.music.setQuiet(p);
    this.log(`paused:${p}`);
  }

  private onPause(id: string, value?: string | number): void {
    if (id.startsWith('tab:')) {
      this.music.tap();
      return;
    }
    // a volume is saved only when the reader lets go of the knob
    if (id.endsWith(':set')) {
      saveComfort(this.comfort);
      this.log(`volume:${JSON.stringify(this.comfort.volume)}`);
      return;
    }
    this.log(`card:${id}${value !== undefined ? `=${value}` : ''}`);
    const c = this.comfort;
    if (id === 'continue') this.setPaused(false);
    else if (id === 'replay') {
      this.setPaused(false);
      this.replayPage();
    } else if (id === 'closebook') {
      this.setPaused(false);
      this.closeBook();
    } else if (id === 'move') {
      // the reader leaned in to press: wait until they sit back, then bring the book
      this.setPaused(false);
      this.moveLine = this.captions.shownText;
      this.captions.say('Sit back comfortably. The book will come to you.');
      this.moveWait = { t: 0, still: 0, last: this.head.clone() };
    } else if (id === 'distance' && typeof value === 'number') {
      c.bookPush = Math.min(0.35, Math.max(0, c.bookPush + 0.05 * value));
      this.music.tap();
    } else if (id === 'height' && typeof value === 'number') {
      c.bookLift = Math.min(0.16, Math.max(-0.08, c.bookLift + 0.02 * value));
      this.music.tap();
    } else if (id === 'vol-all' && typeof value === 'number') c.volume.all = value;
    else if (id === 'vol-music' && typeof value === 'number') c.volume.music = value;
    else if (id === 'vol-sounds' && typeof value === 'number') c.volume.sounds = value;
    else if (id === 'text' && typeof value === 'string') c.text = +value;
    else if (id === 'captions' && (value === 'paper' || value === 'strong')) c.captions = value;
    else if (id === 'pace' && (value === 'usual' || value === 'slow')) c.pace = value;
    else if (id === 'room' && (value === 'auto' || value === 'shown' || value === 'dim' || value === 'hidden')) {
      c.room = value;
      c.roomSet = true;
    }
    else if (id === 'fps' && (value === 'off' || value === 'on' || value === 'report')) {
      // "On" starts a fresh measurement; "Report" shows the pages measured since
      if (value === 'on' && c.fps !== 'on') this.perfHud?.clearReport();
      c.fps = value;
    }
    if (id !== 'continue' && id !== 'replay' && id !== 'closebook') this.music.tap();
    this.applyComfort();
    if (!id.startsWith('vol-')) saveComfort(c);
  }

  /** apply the reader's settings to sound, book and room */
  /**
   * THE HAND-LOSS HOLD. While the book waits on your hands (a shape asked for, a touch, a screen act,
   * the Hollow reaching), losing tracking of both hands freezes the moment instead of failing it:
   * falling things hang in the air, clocks stop. After 4 s a slip says the book will wait; after
   * 20 s more the hold lets go and the moment resolves by itself as before. Never during plain
   * captions, and never in the stair's "hands away" act (no hands is the point there).
   */
  handHeld = false;
  /** tests: both hands read as lost */
  debugUntracked = false;
  private holdT = 0;
  private holdKey = '';
  private holdSeen = false;
  private holdSpent = false;
  private holdSlip = false;
  private lostT = 0;
  private static readonly HOLD_MSG = 'The book will wait. Raise a hand when you’re ready.';
  private checkHandHold(dt: number, anyHand: boolean): void {
    const sa = this.screenAct;
    const key =
      this.phase !== 'page' || this.paused ? '' :
      this.beat && this.beat.state === 'asking' ? `beat:${this.beat.spec.id}` :
      this.act ? `act:${this.act.spec.id}` :
      sa && sa.spec.kind !== 'clear' ? `screen:${sa.spec.id}` :
      this.reach ? 'reach' : this.carry ? 'carry' : '';
    if (key !== this.holdKey) {
      this.holdKey = key;
      this.holdSeen = false;
      this.holdSpent = false;
      if (this.handHeld) this.releaseHold('off');
    }
    if (!key) return;
    if (anyHand) {
      this.holdSeen = true;
      this.lostT = 0;
      if (this.handHeld) this.releaseHold('release');
      return;
    }
    if (!this.holdSeen || this.holdSpent) return;
    // a frame or two of lost tracking (hands crossing) is not a hold
    this.lostT += dt;
    if (!this.handHeld && this.lostT < 0.35) return;
    if (!this.handHeld) {
      this.handHeld = true;
      // resting on a shape: its how-to is on the slip at once (the ladder's clock is stopped while the book waits)
      if (this.beat?.state === 'asking' && this.beat.rung < 1) {
        const g = this.beat.gaps.find((x) => !x.alt);
        if (g) this.pageSlip = g.placed.data.advice;
      }
      this.holdSlip = false;
      this.holdT = 0;
      this.field.clear();
      this.log(`hold:on:${key}`);
    }
    this.holdT += dt;
    if (this.holdT > 4 && !this.holdSlip) {
      this.holdSlip = true;
      this.log('hold:slip');
    }
    if (this.holdT > (key === 'carry' ? 1.5 : 24)) {
      // long enough: the moment carries on (and resolves by itself, as it always could)
      this.holdSpent = true;
      this.releaseHold('spent');
    }
  }

  private releaseHold(why: string): void {
    this.handHeld = false;
    this.holdSlip = false;
    this.lostT = 0;
    this.log(`hold:${why}`);
  }

  /** the bookmark card ("Go on from ..." / "From the beginning"), made when it is offered */
  private resumeCard: PaperCard | null = null;
  private resumeFrom: Bookmark | null = null;

  private offerResume(b: Bookmark): void {
    if (this.resumeCard) {
      this.resumeCard.group.removeFromParent();
      this.resumeCard.group.traverse((o) => ((o as Mesh).material as MeshBasicMaterial | undefined)?.map?.dispose());
      disposeTree(this.resumeCard.group);
    }
    const title = PAGE_TITLES[b.pageId] ?? 'where you left off';
    this.resumeCard = new PaperCard('A bookmark', [
      ['resume', `Go on from ${title}`],
      ['fresh', 'From the beginning'],
    ], 0.22);
    this.resumeCard.group.name = 'Bookmark card';
    this.root.add(this.resumeCard.group);
    this.placeCard(this.resumeCard);
    this.resumeCard.open(true);
    this.resumeFrom = b;
    this.music.rustle(0.6);
    this.log(`bookmark:offer:${b.pageId}`);
  }

  private updateResumeCard(dt: number, tips: Vector3[]): void {
    const c = this.resumeCard;
    if (!c) return;
    const pick = c.update(dt, tips);
    if (!pick || !this.resumeFrom) return;
    const b = this.resumeFrom;
    this.resumeFrom = null;
    c.open(false);
    if (pick === 'resume') this.resume(b);
    else {
      clearBookmark(this.bookId);
      this.shelf.setBookmark(this.bookId, false);
      this.log('bookmark:fresh');
      this.openBook(true);
    }
  }

  /** open the tale where the bookmark is: its state, its puppets, the tray, the page 1 hand */
  resume(b: Bookmark): void {
    if (this.phase !== 'cover') return;
    // the page by its name (never a dead card: a bookmark this build cannot open starts the book afresh)
    const i = this.pages.findIndex((p) => p.id === b.pageId);
    if (i <= 0) {
      clearBookmark(this.bookId);
      this.shelf.setBookmark(this.bookId, false);
      this.openBook(true);
      return;
    }
    this.resetTale();
    this.st = { ...(JSON.parse(JSON.stringify(b.st)) as TaleState), lesson: false };
    delete this.st.marks.villageMem;
    this.echoMask = b.echo ? unpack(b.echo, this.field.st.w * this.field.st.h) : null;
    if (!this.echoMask) delete this.st.marks.echo;
    // the voices that had joined by this page
    if (this.st.ending) this.music.join('hollow');
    this.restoreMade();
    // the cast you made, standing where the page puts them
    for (const id of new Set(this.st.made)) {
      const def = CAST[id];
      if (!def || this.actors.has(id)) continue;
      const p = puppet(def);
      p.setSize(def.scale * (this.st.size[id] === 'big' ? 1.2 : 0.8));
      p.visible = false;
      this.book.actors.add(p.root);
      this.actors.set(id, p);
      this.music.join(def.part);
    }
    for (const k of this.st.kept) if (k && typeof k.cell === 'string') this.tray.restore(k.cell, k.tint as 'wet' | 'sooty' | 'pale' | undefined);
    this.log(`bookmark:resume:${b.pageId}`);
    this.enterPage(i);
    this.flattenActors();
    this.go('opening');
    this.music.rustle(1.4);
  }

  /** controllers in the hands: the book is made for bare hands (said in view, once it lasts 1.5 s) */
  private controllerT = 0;
  private controllerSaid = false;
  private checkControllers(dt: number): void {
    const held = (['left', 'right'] as const).some((side) => this.input.xr.isPrimary('controller', side));
    this.controllerT = held ? this.controllerT + dt : 0;
    // shown by the desk note (book shut) or as a notice on the slip (book open), for as long as they are held
    if (this.controllerT > 1.5 && !this.controllerSaid) {
      this.controllerSaid = true;
      this.log('controllers:held');
    } else if (!held && this.controllerSaid) this.controllerSaid = false;
  }

  /** the frame-rate readout (src/ui/perf-hud.ts), set by the entry point */
  perfHud: { visible: boolean; mode: 'live' | 'report'; clearReport(): void } | null = null;
  /** CPU time (ms, smoothed) of the hand-shadow render and the shadow grid readback */
  cpuShadowMs = 0;
  cpuReadMs = 0;
  /** for the frame-rate readout: which book and page */
  whereLabel(): string {
    if (this.mode === 'room') return 'Shadow Practice';
    const book = this.bookId === 'weather' ? 'Weather' : 'Tale';
    return this.page && this.phase !== 'cover' && this.phase !== 'arrive' ? `${book} · ${this.page.id}` : 'desk';
  }

  private applyComfort(): void {
    const c = this.comfort;
    if (this.perfHud) {
      this.perfHud.visible = c.fps === 'on' || c.fps === 'report' || new URLSearchParams(location.search).has('perf');
      this.perfHud.mode = c.fps === 'report' ? 'report' : 'live';
    }
    this.music?.setVolumes(volumeGain(c.volume.all), volumeGain(c.volume.music), volumeGain(c.volume.sounds));
    if (this.captions) {
      // a book further away reads smaller: the default size grows with the distance
      // Text: A / A+ / A++ makes the ribbon itself bigger (the canvas was already full: a bigger font had no room)
      this.captions.scale = 1 + c.bookPush * 0.9;
      this.captions.style = c.captions;
      this.captions.refresh();
      const k = c.text >= 1.5 ? 1.3 : c.text >= 1.25 ? 1.15 : 1;
      const cm = this.book.captionMesh;
      // the ribbon grows TALLER, never wider (wider put the ends of long lines under the frame):
      // it hangs from the top of the screen and grows downward; the slip and the seal move down with it
      this.captions.tall = k;
      cm.scale.set(1, k, 1);
      cm.position.y = BOOK.H - 0.012 - (BOOK.captionH * k) / 2;
      const down = BOOK.captionH * (k - 1);
      this.advice.mesh.position.y = 0.233 - down;
      this.seal.mesh.position.y = 0.222 - down;
      this.advice.scale = c.text;
      this.advice.style = c.captions;
      this.advice.refresh();
    }
    this.rootTarget.set(0, c.bookLift, -c.bookPush);
    if (this.theatre) this.setRoom(this.isAR);
  }

  /** the book glides to its distance; "Bring the book to me" waits for the reader to settle */
  private updatePlacement(dt: number): void {
    this.root.position.lerp(this.rootTarget, 1 - Math.exp(-dt * 6));
    const m = this.moveWait;
    if (!m) return;
    m.t += dt;
    const speed = this.head.distanceTo(m.last) / Math.max(dt, 1e-3);
    m.last.copy(this.head);
    m.still = speed < 0.05 ? m.still + dt : 0;
    if (m.still > 0.5 || m.t > 3) {
      this.moveWait = null;
      this.calibrate();
      // the story's line comes back (the book moved; the page did not)
      this.captions.say(this.moveLine);
      this.moveLine = '';
      this.music.rustle(0.5);
    }
  }

  /** Start the current page again (characters made on earlier pages stay). */
  private pageStart: { st: string; tray: number } | null = null;

  private replayPage(): void {
    if (this.pageIdx < 0) return;
    this.clearAct();
    this.clearScreen();
    this.timers = [];
    this.finished = false;
    this.wx.reset();
    const b = this.beat;
    if (b && b.state !== 'done' && b.puppet) {
      b.puppet.root.removeFromParent();
      disposeTree(b.puppet.root);
      this.actors.delete(b.chosen!.id);
    }
    this.clearBeat();
    for (const id of this.madeOnPage.get(this.pageIdx) ?? []) {
      const gone = this.actors.get(id);
      if (gone) {
        gone.root.removeFromParent();
        disposeTree(gone.root);
      }
      this.actors.delete(id);
      this.music.leave(CAST[id]?.part ?? id);
      this.st.made = this.st.made.filter((m) => m !== id);
    }
    this.madeOnPage.delete(this.pageIdx);
    // everything the page saved, lost or marked goes back to how it was when the page began
    // (otherwise a replay doubles the tray and the Hollow's coat)
    if (this.pageStart) {
      const made = this.st.made;
      this.st = { ...(JSON.parse(this.pageStart.st) as TaleState), made };
      this.tray.trim(this.pageStart.tray);
      this.restoreMade();
    }
    this.shadow.material.uniforms.uHands.value = 1;
    const i = this.pageIdx;
    this.turnNext = () => this.enterPage(i);
    this.turnReady = true;
    this.phase = 'page';
    this.turnPage();
  }

  /** mixed reality: the room shown, dimmed (a dusk veil), hidden (the dark theatre), or auto. VR: always the theatre. */
  setRoom(ar: boolean): void {
    const mode = ar ? this.comfort.room : 'hidden';
    this.roomVisible = ar && mode !== 'hidden';
    this.theatre.root.visible = !this.roomVisible;
    if (this.veil) {
      this.veil.visible = ar && (mode === 'dim' || mode === 'auto');
      (this.veil.material as MeshBasicMaterial).opacity = mode === 'dim' ? 0.6 : this.veilNow;
    }
    this.pauseCard?.setRowVisible('room', ar);
  }

  /**
   * THE ROOM YOU PUT TO BED (Room: Auto, mixed reality). Your real room stays as it is on the desk and
   * through page 1; as your hand covers the sun, the room goes dark with it (the veil follows the
   * page's own dusk), and it stays night while the tale is night. When the book closes, the room comes
   * back slowly, like a dawn. The Weathermaker is daytime: the room stays.
   */
  private veilNow = 0;
  private sawDay = false;
  private updateRoomVeil(dt: number): void {
    this.veil?.position.copy(this.head);
    if (!this.veil || !this.isAR || this.comfort.room !== 'auto') return;
    const open = this.phase === 'page' || this.phase === 'turning' || this.phase === 'ignite';
    const day = this.shadow.material.uniforms.uDay.value as number;
    // the dark only comes once the reader has seen the sun up (it comes with their hand, not before)
    if (open && day > 0.5) this.sawDay = true;
    const tale = open && this.mode === 'tale' && this.bookId === 'tale' && (this.sawDay || this.pageIdx > 0);
    const night = tale ? Math.min(1, Math.max(0, 1 - day)) : 0;
    const want = 0.93 * night;
    // dark comes with your hand (quick); the dawn at the close is slow (about 6 s)
    const rate = want > this.veilNow ? 1.6 : 0.18;
    this.veilNow += (want - this.veilNow) * Math.min(1, dt * rate);
    const m = this.veil.material as MeshBasicMaterial;
    m.opacity = this.veilNow;
    this.veil.visible = this.veilNow > 0.01;
  }

  // ---- placement ------------------------------------------------------------------------------

  private readHead(): void {
    this.camera.updateMatrixWorld();
    this.camera.getWorldPosition(this.head);
    this.camera.getWorldDirection(this.fwd);
    this.fwd.y = 0;
    if (this.fwd.lengthSq() < 1e-4) this.fwd.set(0, 0, -1);
    this.fwd.normalize();
  }

  private calibrate(): void {
    this.readHead();
    stage.calibrate(this.head, this.fwd);
    // (a hemisphere light's direction is its world position: keep it where a reader seated on the origin has it,
    // turned with the stage, so the paper's shading never depends on where the session began)
    this.book.hemi.position.set(0, 2.26, -0.79).applyQuaternion(stage.group.quaternion);
    this.log('calibrate');
    if (this.phase === 'waiting' && (this.renderer.xr.isPresenting || this.globals.started)) this.restart();
  }

  begin(): void {
    if (this.phase === 'waiting') this.restart();
  }

  // ---- demo -------------------------------------------------------------------------------------

  private runDemo(dt: number): void {
    const route = this.forceRoute ?? (this.demoLoop % 2 ? 'owl' : 'fox');
    const ending = this.forceEnding ?? (Math.floor(this.demoLoop / 2) % 2 ? 'wings' : 'keep');
    const f = Math.max(this.fast, 0.25);
    if (this.phase === 'cover' && this.phaseT > 2 * f) this.openBook();
    else if (this.beat?.state === 'asking' && this.beat.t > 6 * f) {
      const opts = this.beat.spec.options;
      this.autoAccept(opts.includes(route) ? route : opts.includes(ending) ? ending : opts[0]);
    } else if (this.turnReady && this.phase === 'page' && this.turnReadyT > 2.5 * f) this.turnPage();
    if (this.endCard.isOpen) {
      this.demoT += dt;
      if (this.demoT > 8 * f) this.playAgain();
    } else this.demoT = 0;
  }

  // ---- checks ---------------------------------------------------------------------------------

  snapshot(): Record<string, unknown> {
    const v = (o: Object3D) => o.getWorldPosition(new Vector3()).toArray().map((n) => +n.toFixed(3));
    const b = this.beat;
    return {
      phase: this.phase,
      mode: this.mode,
      shelf: this.shelf.snapshot(),
      wall: { on: this.wall?.shown ?? false, source: this.wall?.source ?? 'none' },
      finished: this.finished,
      page: this.page?.id ?? null,
      step: this.stepIdx,
      open: +this.book.open.toFixed(2),
      lantern: +this.book.lantern.level.toFixed(2),
      caption: this.captions.shown,
      act: this.act ? { id: this.act.spec.id, kind: this.act.spec.kind, k: this.act.k, n: this.act.targets.length, target: this.act.targets[this.act.k] ? this.book.root.localToWorld(this.act.targets[this.act.k].clone()).toArray().map((n) => +n.toFixed(3)) : null } : null,
      state: this.st,
      lesson: { on: this.st.lesson, beamT: +this.beamT.toFixed(1), flags: [...this.flags] },
      beat: b ? { id: b.spec.id, state: b.state, hint: b.hint, options: b.spec.options, chosen: b.chosen?.id ?? null } : null,
      gaps: b ? b.gaps.map((g) => ({ id: g.id, plate: g.plate, at: this.book.board.localToWorld(new Vector3(g.centre.x, g.centre.y, 0)).toArray().map((n) => +n.toFixed(3)), centre: [+g.centre.x.toFixed(3), +g.centre.y.toFixed(3)], pct: +g.pct.toFixed(0) })) : [],
      handInBeam: this.handInBeam,
      beam: { zone: this.book.root.localToWorld(this.zoneLocal.clone()).toArray().map((n) => +n.toFixed(3)), s: +this.beamScale.toFixed(3), handLen: +this.handLen.toFixed(3) },
      screen: this.screenAct ? { id: this.screenAct.spec.id, kind: this.screenAct.spec.kind, t: +this.screenAct.t.toFixed(1), light: this.screenAct.spec.light ?? null, road: this.screenAct.spec.road ?? null, wall: this.screenAct.spec.wall ?? null, catch: this.screenAct.spec.catch ?? null, hide: this.screenAct.spec.hide ?? null } : null,
      field: { frames: this.field.frames, count: this.field.count, age: +Math.min(99, this.field.age).toFixed(2), results: this.filler.results },
      match: b
        ? {
            rung: b.rung,
            tHand: +b.tHand.toFixed(1),
            hands: b.handsOn,
            plates: this.filler.views.map((v) => ({ id: v.id, state: v.state, shown: +v.hold.shown.toFixed(0), res: v.res ? { S: +v.res.score.toFixed(2), C: +v.res.coverage.toFixed(2), sig: +v.res.spill.toFixed(2), dx: +v.res.dx.toFixed(1), dy: +v.res.dy.toFixed(1), keys: v.res.keys.map((x) => `${x.name}:${x.covered.toFixed(2)}`), hint: v.res.hint } : null })),
          }
        : null,
      turnReady: this.turnReady,
      corner: v(this.corner),
      actors: [...this.actors.entries()].filter(([, a]) => a.visible).map(([id, a]) => ({ id, at: v(a.root), fold: +a.fold.toFixed(2) })),
      music: this.music.members,
      hollow: this.hollow.debug(),
      lampsLit: this.lampsLit,
      paused: this.paused,
      pauseCard: this.pauseCard.isOpen,
      pauseTab: this.pauseCard.tab,
      controls: this.pauseCard.isOpen ? this.pauseCard.controls().map((x) => ({ id: x.id, at: x.at.map((n) => +n.toFixed(3)) })) : [],
      comfort: this.comfort,
      bookPush: +(-this.root.position.z).toFixed(3),
      endCard: this.endCard.isOpen,
      room: this.roomVisible,
      ar: this.isAR,
      hands: (['left', 'right'] as const).map((s) => (this.hands[s] ? { side: s, tracked: this.hands[s]!.tracked, pose: classify(this.hands[s]!) } : null)),
      book: v(this.book.root),
      flame: this.book.lantern.flame(new Vector3()).toArray().map((n) => +n.toFixed(3)),
      light: this.shadowLight(new Vector3()).toArray().map((n) => +n.toFixed(3)),
      buttons: [...this.pauseCard.controls().map((x) => ({ id: x.id, at: x.at.map((n) => +n.toFixed(3)), visible: this.pauseCard.isOpen })), ...this.endCard.buttons.map((bt) => ({ id: bt.id, at: v(bt.group), visible: bt.group.visible && bt.group.parent!.visible }))],
      log: [...this.logs.slice(-30), ...this.music.log.slice(-6)],
    };
  }
}
