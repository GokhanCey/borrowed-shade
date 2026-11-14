import type { Vector3 } from '@iwsdk/core';
import type { Actor } from './actors.js';
import type { Hollow } from './hollow.js';
import type { ScreenActSpec } from './screen-acts.js';
import type { TaleMusic } from './music.js';
import { commonScene, cottageScene, epilogueScene, gateScene, hillScene, homeScene, meadowScene, riverScene, stairScene, villageScene, type Scene } from './scenes.js';

/**
 * BORROWED SHADE, Tale 1: the whole story as data.
 * 11 spreads per route (fox: the cottage; owl: the meadow), two real choices
 * (fox/owl at the gate; a tower to stay or wings to go at the climax), two twists
 * (the rabbit led them; the Hollow is afraid of hands, and the hand was yours).
 * Hands only ever act on the screen: fill a shadow plate, cover a light, be a road,
 * a wall, a roof; catch; hold still for a bird. Every moment also resolves by itself.
 * Two hands make a big one; one hand a small one.
 */
export type Size = 'big' | 'small';

export interface TaleState {
  route: 'fox' | 'owl' | null;
  ending: 'keep' | 'wings' | null;
  /** size per beat id */
  size: Record<string, Size>;
  /** characters made, in order */
  made: string[];
  /** first reading: a few extra lines teach the rest and the corner */
  lesson: boolean;
  /** Tomas's hat (the windy common) */
  hat: 'caught' | 'lost' | null;
  /** what the reader's shadow did on the screen (road, wall, hide...): counts */
  marks: Record<string, number>;
  /** what was saved (it stands in the keeping tray) and what was lost (it comes home the long way) */
  kept: { cell: string; act: string; page: string; tint?: string }[];
  lost: { cell: string; act: string; page: string; where: string; home?: boolean }[];
}

/** what the story can ask of the director */
export interface Director {
  readonly st: TaleState;
  readonly pageScene: Scene;
  readonly hollow: Hollow;
  readonly music: TaleMusic;
  actor(id: string): Actor | undefined;
  /** show a puppet that was hidden (it stands up at once if the page is already open) */
  reveal(a: Actor): void;
  /** walk an actor to a named anchor of the current scene (+ offsets, metres) */
  walk(id: string, anchor: string, dx?: number, dz?: number): void;
  /** the point of an anchor (book-local) */
  anchor(name: string, dx?: number, dz?: number): Vector3;
  amaMood(m: 'still' | 'crying' | 'happy'): void;
  /** the big paper moon on the screen: height (m from the screen bottom), size */
  moon(y: number, size: number, x?: number): void;
  /** the villagers' shadows walking away on the screen (page 1) */
  shadowsWalkAway(): void;
  /** the procession of shadows up the hill (owl's view) with Ama's rabbit looking back */
  procession(on: boolean): void;
  /** light the village lamps one by one, on the beat */
  lightLamps(): void;
  /** Ama gets her own shadow back (a dark rabbit at her heels) */
  amaShadowHome(): void;
  /** a small lamp lights at the edge of the map (the hook) */
  farLamp(): void;
  /** Tomas gives Ama his lantern */
  passLantern(): void;
  /** called by a beat when the reader is slow: the Hollow stops growing etc. */
  log(s: string): void;
  /** run fn after `sec` seconds of story time (pauses with the tale; cleared on page change) */
  after(sec: number, fn: () => void): void;
  /** shadows run down the big hill to the village (the keep ending) */
  hillRun(): void;
  /** seconds (in total) a hand has been in the light */
  readonly beamT: number;
  /** the glowing page corner (book-local) */
  cornerPoint(): Vector3;
  /** a point at `frac` of an actor's height (book-local), or null */
  actorPoint(id: string, frac: number): Vector3 | null;
  /** has the reader done this yet? ('paused', 'resumed') */
  flag(name: string): boolean;
  /** the light painted into the screen (sun, moon, a window): on 0..1 */
  light(x: number, y: number, rx: number, ry: number, on: number, color?: string): void;
  /** keep a copy of the reader's shadow right now (the Hollow shows it back later) */
  captureEcho(): void;
  /** daylight on the screen (0 dusk .. 1 day), at once or over `sec` */
  day(v: number, sec?: number, then?: () => void): void;
  /** fade the screen's painted light to `on` over `sec` */
  fadeLight(on: number, sec: number): void;
  /** Granny's map drawing, revealed in your shade (0..1) */
  mapReveal(v: number): void;
  /** the advice slip, in the book's advice voice ('' hides); shown for `sec` if given */
  advise(text: string, sec?: number): void;
  /** the long way home: everything lost comes back crumpled into the tray */
  longWayHome(): void;
  /** where the crumpled things lie (book-local) */
  trayCrumples(): Vector3[];
  /** something is still flying into the keeping tray */
  trayFlying(): boolean;
  /** smooth the k-th crumpled thing flat */
  smoothCrumple(k: number): void;
  /** a lent puppet folds away (its owner's own shadow came home) */
  retire(id: string): void;
  /** a little shadow crossing your bridge: its paper actor on the stage follows (0..1) */
  followWalker(id: string, frac: number, ev?: { state: string; slot: number }): void;
  /** the Hollow grows with your hand's shadow (spread 7) */
  hollowReach(on: boolean): void;
  /** the Hollow's window pictures: the carts and hands, then your own hand over the village */
  vision(kind: 'carts' | 'echo' | 'yours' | null): void;
  /** Ama's own rabbit (a dark paper rabbit): in the gorse, at her boots, or away up the hill */
  amaRabbit(where: 'gorse' | 'ama' | 'away' | 'hollow'): void;

}

export type Text = string | ((s: TaleState) => string | null);

export interface Step {
  /** a caption ('' clears); null-returning functions skip the line */
  say?: Text;
  /** seconds to hold after the caption is shown (default: by length) */
  hold?: number;
  /** extra seconds to let a line land (an emotional turn, a payoff) */
  breath?: number;
  /** side effect when the step begins */
  run?: (d: Director) => void;
  /** a hand beat: the tale waits until a shape is lent */
  beat?: BeatSpec;
  /** skip this step unless true */
  when?: (s: TaleState) => boolean;
  /** the step waits (after its hold) until this is true */
  until?: (d: Director) => boolean;
  /** gentle extra lines if the reader is stuck: [seconds, caption] */
  nudges?: [number, string][];
  /** a small hand moment: the step waits for it, but every target also resolves by itself */
  act?: ActSpec;
  /** a screen act: your shadow does something in the shadow world (the step waits; it resolves by itself) */
  screen?: (d: Director) => ScreenActSpec;
}

/**
 * A hand moment. Targets light one at a time; the reader touches (or points at, or
 * strokes toward) the live one, or after `each` seconds it happens by itself, with
 * the same outcome. `steer` instead hands the reader a shadow to carry across the screen.
 */
export interface ActSpec {
  id: string;
  kind: 'touch' | 'point' | 'stroke' | 'steer';
  /** book-local targets, read when the act starts (unused by steer) */
  targets?: (d: Director) => Vector3[];
  /** seconds before the live target resolves by itself */
  each: number;
  /** target k happened (byHand: the reader did it) */
  onHit?: (d: Director, k: number, byHand: boolean) => void;
  /** steer: the reader's shadow is at board (x, y); return true when the crossing is complete */
  onSteer?: (d: Director, x: number, y: number) => boolean;
  /** steer: nobody steered for `each` seconds; let it go by itself */
  onLetGo?: (d: Director) => void;
  onDone?: (d: Director) => void;
  /** seconds the first mark waits for a touch before it happens by itself (default 16) */
  wait?: number;
}

export interface BeatSpec {
  id: string;
  /** cast ids on offer (two = a choice) */
  options: string[];
  /** where the paper character lands (scene anchor) */
  land: string;
  /** per-option landing anchors (e.g. the owl perches on the gate) */
  landBy?: Record<string, string>;
  landOffset?: [number, number, number];
  /** where the outline(s) sit on the screen (board-local x, y) */
  gaps?: [number, number][];
  /** while waiting: the Hollow grows (page 5) */
  hollowGrows?: boolean;
  /** make a paper puppet (default true); the climax gift does not */
  spawn?: boolean;
  /** the gentle pass mark (0.65): the first fill, the climax gift, the epilogue */
  gentle?: boolean;
  /** a practice shape (the lesson): no size, no music part, not counted as made */
  practice?: boolean;
  /** called when the shape is lent */
  done?: (d: Director, charId: string, size: Size) => void;
  /** called the moment the shape is accepted (the seal stamps): for answers that must not wait for the peel */
  struck?: (d: Director, charId: string, size: Size) => void;
  /**
   * The filled outline itself becomes something on the screen (no peel, no puppet): called with the
   * plate that was made (a one-hand half or a mirror, if that is what the reader made) and its base
   * centre on the screen (board x, y).
   */
  morph?: (d: Director, plate: string, bx: number, by: number) => void;
}

export interface PageDef {
  id: string;
  scene: () => Scene;
  when?: (s: TaleState) => boolean;
  /** set up actors and the screen as the page opens */
  enter?: (d: Director) => void;
  steps: Step[];
}

const big = (s: TaleState, id: string) => s.size[id] === 'big';
const fox = (s: TaleState) => s.route === 'fox';
const owl = (s: TaleState) => s.route === 'owl';
/** what the Hollow took on the way and hangs on its coat: scarves from the common, shadows the light found on the stair */
const coatOf = (s: TaleState) => s.lost.filter((l) => l.where === 'hollow' && !l.home && ['scarf', 'heron', 'rabbit', 'fox', 'owl'].includes(l.cell)).map((l) => l.cell);
const NAMES: Record<string, string> = { heron: 'the heron’s', rabbit: 'the rabbit’s', fox: 'the fox’s', owl: 'the owl’s' };

export const PAGES: PageDef[] = [
  // ---- 1. The village at dusk ----------------------------------------------------------
  // the first hand moment is the sun; your hand in the sky is remembered (twist 2)
  {
    id: 'village',
    scene: villageScene,
    enter: (d) => {
      d.walk('ama', 'ama');
      d.hollow.snap(0.212, 0.033, 0.42);
      d.hollow.opacity = 0;
      d.moon(0.24, 0);
      d.light(0.12, 0.17, 0.03, 0.03, 1, '#ffd98a');
      d.day(1);
    },
    steps: [
      { say: 'It was the longest night of the year, and the sun would not go down.' },
      { say: 'Someone would have to put the sun to bed by hand.', screen: (d) => ({
        id: 'sun', kind: 'cover', light: { x: 0.12, y: 0.17, rx: 0.03, color: '#ffd98a' }, each: 14,
        advice: 'Put your hand in the beam so its shadow covers the sun.',
        onProgress: (v) => d.day(1 - 0.9 * v),
        onDone: (byHand) => {
          if (byHand) d.captureEcho();
          d.fadeLight(0, 2.4);
          d.day(0, 2.4, () => d.lightLamps());
          d.music.shimmer();
        },
      }) },
      // (the sun's own dusk, started when the sun was put to bed, lights the lamps when it ends)
      { say: 'Every evening, when the lamps were lit,' },
      { say: 'the villagers’ shadows walked home beside them.', breath: 0.4 },
      { say: 'But tonight, the shadows looked up at the sky, and did not come home.', hold: 5.6, run: (d) => {
        d.shadowsWalkAway();
        d.hollow.opacity = 0.45; // far right, a tall shadow where nothing stands
      } },
      { say: 'They did not look stolen. They looked as if they were hurrying.', run: (d) => (d.hollow.opacity = 0) },
      { say: 'Little Ama’s shadow had always been a rabbit: one ear up, one ear down.', breath: 0.6, run: (d) => d.amaMood('crying') },
      { say: 'Will you lend her yours?', beat: { id: 'rabbit', options: ['rabbit'], land: 'char', gentle: true } },
      { say: (s) => (big(s, 'rabbit') ? 'Her new rabbit was big as a dog, and twice as proud.' : 'Her new rabbit was small, and very sure of itself.') },
      { say: 'And Ama laughed, for the first time that night.', breath: 0.6, run: (d) => {
        d.amaMood('happy');
        d.music.laugh();
      } },
      { when: (s) => s.lesson, run: (d) => d.advise('To pause at any time, hold a flat hand over the lantern.', 7), hold: 3 },
      { say: 'Then the rabbit put its nose down. Little grey footprints led off the page.', run: (d) => d.walk('rabbit', 'char', 0.05, 0.03) },
      { say: 'Touch each footprint with a fingertip.', act: {
        id: 'footprints', kind: 'touch', each: 3.2,
        targets: (d) => {
          const from = d.anchor('char', 0.05, 0.03);
          const to = d.cornerPoint();
          return [1, 2, 3, 4].map((k) => from.clone().lerp(to, k / 5.2).setY(from.y + 0.002));
        },
        onHit: (d, k) => {
          const r = d.actor('rabbit');
          const from = d.anchor('char', 0.05, 0.03);
          const to = d.cornerPoint();
          if (r) r.go(from.clone().lerp(to, (k + 1) / 5.2).setY(r.target.y));
          d.music.tap();
        },
      } },
      { say: 'When a page is done, its corner glows. Touch it to turn the page.', when: (s) => s.lesson, hold: 3 },
      { when: (s) => !s.lesson, say: 'The footprints went on, past the last lamp and out of the village.' },
    ],
  },

  // ---- 2. The gate (choice 1, and the first road) ----------------------------------------
  {
    id: 'gate',
    scene: gateScene,
    enter: (d) => {
      d.walk('tomas', 'tomas');
      d.walk('ama', 'ama');
      d.walk('rabbit', 'ama', 0.042, -0.012);
      d.hollow.snap(0.0, 0.0, 0.95);
      d.hollow.opacity = 0;
    },
    steps: [
      { say: 'At the gate sat Old Tomas, who had watched the road for forty years.' },
      { say: 'Without his shadow, he would not take one step into the dark.', run: (d) => {
        // for a moment the gate's shadow is far too tall
        d.hollow.opacity = 0.42;
        d.after(2.2, () => (d.hollow.opacity = 0));
      } },
      { say: '“My grandfather’s grandfather said a tower stood on that hill.”', run: (d) => {
        const c = d.pageScene.props.carve;
        if (c) c.material.emissiveIntensity = 1.4;
      } },
      { say: '“It kept the dark company. They took it down by hand, stone by stone.”' },
      { say: 'Who will lead him: a fox that knows the ground, or an owl that sees?', beat: { id: 'guide', options: ['fox', 'owl'], land: 'char', landBy: { owl: 'perch' }, done: (d, id) => {
        d.st.route = id === 'fox' ? 'fox' : 'owl';
      } } },
      { say: (s) => fox(s)
        ? (big(s, 'guide') ? 'The fox, long as a cart, put its nose in the mud and set off low.' : 'The fox, no bigger than a boot, put its nose in the mud and set off low.')
        : (big(s, 'guide') ? 'A great grey owl rose over the gate, and saw a glow on the hill.' : 'An owl, round as a loaf, rose over the gate, and saw a glow on the hill.') },
      { say: 'Still Tomas would not move. “I can’t see where the road goes.”' },
      { say: 'The road ran off into the dark, and stopped where Tomas could no longer see it.', screen: (d) => ({
        id: 'road-gate', kind: 'road',
        road: { x0: -0.17, gapA: -0.06, gapB: 0.045, x1: 0.16, y: 0.15, walkers: [], groups: [[d.st.route === 'owl' ? 'owl' : 'fox'], ['rabbit']] },
        advice: 'Lay your hand flat and long across the dotted gap, little finger down.',
        onWalker: (id, f, ev) => d.followWalker(id, f, ev),
        onDone: (byHand) => {
          d.st.marks.roadGate = byHand ? 1 : 0;
        },
      }) },
      { say: (s) => (s.marks.roadGate
        ? (fox(s) ? 'The fox trotted down your shadow. Tomas put one boot on it, then two.' : 'The owl flew low along your shadow. Tomas put one boot on it, then two.')
        : 'Ama took his hand, as if he were the small one.'), run: (d) => d.walk('ama', 'tomas', -0.03, 0.035) },
      { say: '“Well,” said Tomas. “Nobody tell my wife.”' },
    ],
  },

  // ---- 3F. The low road: Granny Pell's cottage (fox) ------------------------------------
  {
    id: 'cottage',
    scene: cottageScene,
    when: fox,
    enter: (d) => {
      d.walk('tomas', 'tomas');
      d.walk('ama', 'ama');
      d.walk('rabbit', 'ama', 0.042, -0.012);
      d.walk('fox', 'char', -0.04, 0.05);
      d.walk('granny', 'granny');
      d.hollow.snap(0.16, 0.041, 0.3);
      d.hollow.opacity = 0;
    },
    steps: [
      { say: 'The fox led them low, through mud, to a crooked cottage.' },
      { say: 'Granny Pell’s shadow had always been a snail: slow, and never lost.' },
      { say: 'Now she was lost in her own garden, hunting for her spectacles.' },
      { say: 'Lend her a snail?', beat: { id: 'snail', options: ['snail'], land: 'char' } },
      { say: (s) => (big(s, 'snail') ? 'A snail the size of a cabbage settled beside her, very kindly.' : 'A snail the size of a thumbnail climbed onto her shoulder, taking its time.'), run: (d) => {
        // sized to Granny: a big snail sits on the ground beside her; a small one rides on her shoulder
        if (d.st.size.snail === 'big') d.walk('snail', 'granny', 0.05, 0.01);
        else {
          d.walk('snail', 'granny', 0.03, 0.008);
          d.after(3.0, () => {
            const sn = d.actor('snail');
            if (sn) {
              sn.setSize(sn.baseSize * 0.38);
              sn.go(d.anchor('granny', 0.012, 0.004).setY(d.anchor('granny').y + 0.074));
            }
          });
        }
      } },
      { say: 'It looked up at the top of her head. Touch the top of her head.', act: {
        id: 'specs', kind: 'touch', each: 5,
        targets: (d) => {
          const p = d.actorPoint('granny', 0.98);
          return p ? [p] : [];
        },
        onHit: (d) => {
          const specs = d.actor('granny')?.root.getObjectByName('Spectacles');
          if (specs) specs.visible = true;
          d.music.laugh();
        },
      } },
      { say: 'The spectacles were on her head. They had been there all evening.' },
      { say: 'She held the map up to the candle, but the glare on the paper ate every line.', run: (d) => d.light(-0.06, 0.15, 0.04, 0.032, 1, '#fff0c8'), screen: (d) => ({
        id: 'map', kind: 'cover', light: { x: -0.06, y: 0.15, rx: 0.04, ry: 0.032, color: '#fff0c8' }, each: 12,
        advice: 'Shade the bright patch on the screen with your palm.',
        onProgress: (v) => d.mapReveal(v),
        onDone: (byHand) => {
          d.st.marks.map = byHand ? 1 : 0;
          d.fadeLight(0, 0.8);
          d.mapReveal(1);
        },
      }) },
      { say: (s) => (s.marks.map ? 'In your shadow, a drawing came out: a hill, and a tower on it.' : 'The candle guttered, and a drawing came out: a hill, and a tower on it.') },
      { say: '“The tower’s shadow,” she said. “It never left the hill.”', run: (d) => {
        d.hollow.opacity = 0.38;
        d.after(2.6, () => (d.hollow.opacity = 0));
      } },
      { say: '“It keeps watch up there. For what, nobody remembers.”' },
      { say: 'The fox sniffed the floor. Rabbit.', run: (d) => d.mapReveal(0) },
    ],
  },

  // ---- 3O. The high road: the drowned meadow (owl) ---------------------------------------
  {
    id: 'meadow',
    scene: meadowScene,
    when: owl,
    enter: (d) => {
      d.walk('tomas', 'tomas');
      d.walk('ama', 'ama');
      d.walk('rabbit', 'ama', 0.042, -0.012);
      d.walk('owl', 'perch');
      d.hollow.snap(0.084, 0.033, 0.22);
      d.hollow.opacity = 0;
      d.light(0.06, 0.19, 0.03, 0.03, 1, '#f3f0ff');
    },
    steps: [
      { say: 'The owl flew high, but the moon was so bright it could not see past it.' },
      { say: 'Something would have to stand between the owl and that bright moon.', screen: (d) => ({
        id: 'moon', kind: 'cover', light: { x: 0.06, y: 0.19, rx: 0.03, color: '#f3f0ff' }, each: 12,
        advice: 'Hold your hand over the moon on the screen.',
        onDone: (byHand) => {
          d.st.marks.moon = byHand ? 1 : 0;
          d.fadeLight(0.25, 1.2);
        },
      }) },
      { say: (s) => (s.marks.moon ? 'In your shadow it saw them: every shadow in the village, climbing the hill.' : 'A cloud crossed the moon, and it saw them: every shadow in the village, climbing the hill.'), run: (d) => d.procession(true) },
      { say: 'At the very front hopped a rabbit, one ear up, one ear down.' },
      { say: 'Between them lay the meadow, drowned in black water to the fences.', run: (d) => {
        d.procession(false);
        d.hollow.opacity = 0.55;
      } },
      { say: 'Lend Ama a little boat?', beat: { id: 'boat', options: ['boat'], land: 'char' } },
      { say: (s) => (big(s, 'boat') ? 'A boat wide enough for Tomas, which was saying something.' : 'A small boat. Tomas folded himself into it, grumbling.'), run: (d) => {
        d.hollow.opacity = 0;
        d.walk('ama', 'char', 0, -0.006);
        d.walk('rabbit', 'char', 0.02, -0.004);
        d.walk('tomas', 'char', -0.024, -0.008);
      } },
      { say: 'Ama had never rowed. The water would have to be pulled, stroke by stroke.', run: (d) => d.advise('Pull the water towards you with a flat hand, over the boat.', 10), act: {
        id: 'row', kind: 'stroke', each: 4,
        targets: (d) => {
          const a = d.anchor('char', 0, -0.006);
          const b = d.anchor('far', 0, 0.022);
          return [0, 1, 2, 3].map((k) => a.clone().lerp(b, (k + 0.5) / 4));
        },
        onHit: (d, k) => {
          const a = d.anchor('char', 0, -0.006);
          const b = d.anchor('far', 0, 0.022);
          const p = a.clone().lerp(b, (k + 1) / 4);
          for (const [id, dx, dz] of [['boat', 0, 0], ['ama', 0, -0.006], ['rabbit', 0.02, -0.006], ['tomas', -0.024, -0.008]] as const) {
            const act = d.actor(id);
            if (act) {
              act.speed = 0.06;
              act.go(p.clone().add({ x: dx, y: 0, z: dz } as Vector3).setY(act.target.y));
            }
          }
          d.music.rustle(0.3);
        },
      } },
      { say: 'She rowed. On the hill, the owl saw something standing in a ring of stones.', run: (d) => {
        d.fadeLight(0, 1);
        d.hollow.opacity = 0.6;
        d.walk('ama', 'far');
        d.walk('rabbit', 'far', 0.03, -0.004);
        d.walk('tomas', 'far', -0.05, -0.005);
      } },
    ],
  },

  // ---- 4. The windy common (both routes meet) ---------------------------------------------
  // the comic breather; the wall is taught here, safely, before the Hollow
  {
    id: 'common',
    scene: commonScene,
    enter: (d) => {
      d.walk('tomas', 'tomas');
      d.walk('ama', 'ama');
      d.walk('rabbit', 'ama', 0.042, -0.012);
      d.walk('fox', 'char', -0.02, 0.01);
      d.walk('owl', 'char', 0.0, 0.0);
      d.hollow.snap(0.16, 0.066, 0.3);
      d.hollow.opacity = 0.35;
    },
    steps: [
      { say: 'Over the common blew the wind of the longest night.' },
      { say: 'It wanted lamps to put out, and loose things to carry away.' },
      { say: 'And shadows are very loose things.', run: (d) => (d.hollow.opacity = 0) },
      { say: 'Something would have to stand between the wind and the little ones.', screen: (d) => ({
        id: 'wall-common', kind: 'wall',
        wall: {
          target: -0.03,
          band: { kind: 2, a: [0.055, 0.1, 0.025, 0.05], b: [-0.135, 0.1, 0.025, 0.05] },
          waves: [
            { items: [[0, 0.09, 1], [1.6, 0.12, 1]], speed: 0.07 },
            { items: [[0, 0.07, 1], [1.2, 0.11, 1], [2.4, 0.14, 1]], speed: 0.085 },
            { items: [[0, 0.1, 1], [1.0, 0.08, -1], [2.0, 0.13, 1], [3.0, 0.1, -1]], speed: 0.09 },
          ],
        },
        advice: 'Stand a hand up tall in one of the dashed bands, in the wind’s way.',
        onDone: (_byHand, n) => (d.st.marks.wallCommon = n),
      }) },
      { say: (s) => (s.marks.wallCommon
        ? (fox(s) ? 'The fox lay flat behind your shadow, and grinned at the wind.' : 'The owl tucked itself into your shadow, and made itself small.')
        : (fox(s) ? 'The fox lay flat in the grass, and grinned at the wind.' : 'The owl held on to Ama’s collar, and made itself small.')) },
      { say: 'Then the wind stole everything that was loose. Last of all, it took Tomas’s hat.', screen: (d) => ({
        id: 'hat', kind: 'catch',
        catch: {
          what: 'loose',
          deliver: [-0.19, 0.045],
          tray: { kind: 2, a: [0, 0.14, 0.12, 0.016] },
          waves: [
            { items: [[0.8, 0.08, 0.035], [2.8, 0.02, 0.035], [4.8, 0.1, 0.03]] },
            { items: [[0, -0.04, 0.035], [2.0, 0.07, 0.035], [4.0, 0.0, 0.03]] },
          ],
        },
        advice: 'Hold a flat hand under what falls, like a tray.',
        onDone: (_byHand, _n, info) => (d.st.hat = info?.hat ? 'caught' : 'lost'),
      }) },
      { say: (s) => (s.hat === 'caught' ? '“Forty years, this hat,” said Tomas, and pulled it down to his ears.' : 'It sailed off over the hill. “Forty years, that hat,” said Tomas.') },
      { say: 'The wind gave up, and went to bother the sea.' },
    ],
  },

  // ---- 5. The river ---------------------------------------------------------------------
  {
    id: 'river',
    scene: riverScene,
    enter: (d) => {
      d.walk('tomas', 'tomas');
      d.walk('ama', 'ama');
      d.walk('rabbit', 'ama', 0.042, -0.012);
      // the fox sits beside Ama, inside the lantern's light (further forward it read as a black cut-out)
      d.walk('fox', 'ama', 0.075, -0.005);
      d.walk('owl', 'ama', 0.06, -0.02);
      d.walk('boat', 'char', -0.065, -0.025);
      d.hollow.mirrored = false;
      d.hollow.snap(0.0, 0.052, 0.4);
      d.hollow.opacity = 0.3;
    },
    steps: [
      { say: 'At the foot of the hill ran the river, black as a boot.' },
      { say: 'Without shadows, stones and water looked exactly the same.' },
      { say: '“When I was young,” said Tomas, “my shadow was a heron.”' },
      { say: 'Lend him one, for old times?', beat: { id: 'heron', options: ['heron'], land: 'char' } },
      { say: (s) => (big(s, 'heron') ? 'A heron taller than Tomas stepped in. Tomas stood straighter.' : 'A heron small as a teapot stepped in. Tomas laughed.'), run: (d) => d.music.laugh() },
      { say: 'Point at a stone, and the heron will step there and tap it.', act: {
        id: 'stones', kind: 'point', each: 4.5,
        targets: (d) => ((d.pageScene.props.stones as { position: Vector3 }[] | undefined) ?? []).map((st) => st.position.clone()),
        onHit: (d, k) => {
          const stones = d.pageScene.props.stones as { userData: { edge: { material: { opacity: number }; visible: boolean; userData: { hidden: boolean } } }; position: Vector3 }[] | undefined;
          const st = stones?.[k];
          if (!st) return;
          const h = d.actor('heron');
          if (h) h.go(st.position.clone().setY(h.target.y).add({ x: -0.012, y: 0, z: 0.004 } as Vector3));
          d.after(0.5, () => {
            st.userData.edge.material.opacity = 0.85;
            st.userData.edge.userData.hidden = false;
            st.userData.edge.visible = true;
            d.music.tap();
          });
        },
      } },
      { say: 'Each stone found its edge, but one. It was carted off to build the gate.' },
      { say: 'Where the last stone should have been, there was only black water.', screen: (d) => ({
        id: 'bridge', kind: 'road',
        road: { x0: -0.2, gapA: -0.085, gapB: 0.075, x1: 0.2, y: 0.15, walkers: [], groups: [['heron', 'rabbit'], [d.st.route === 'owl' ? 'owl' : 'fox']] },
        advice: 'Two hands end to end across the dotted water. One hand: wait a moment.',
        onWalker: (id, f, ev) => d.followWalker(id, f, ev),
        onDone: (byHand) => (d.st.marks.bridge = byHand ? 1 : 0),
      }) },
      { say: (s) => (s.marks.bridge ? (fox(s) ? 'They crossed on your shadow. The fox came last, pretending not to hurry.' : 'They crossed on your shadow. The owl walked it too, to be polite.') : 'The book laid down a plank of its own, and they crossed, carefully.'), run: (d) => {
        d.walk('ama', 'bank', -0.02, 0.0);
        d.walk('rabbit', 'bank', 0.03, -0.006);
        d.walk('tomas', 'bank', -0.065, 0.006);
        d.walk('heron', 'bank', -0.11, -0.004);
        d.walk('fox', 'bank', 0.075, 0.004);
        d.walk('owl', 'bank', 0.075, -0.012);
      } },
      { say: (s) => (fox(s) ? 'Behind them, the snail was coming. Slowly. Never lost.' : 'Ama tied the little boat to a reed. “For the way home.”') },
      { say: 'On the far bank, the grey footprints went on, up a stair of old stones.', run: (d) => (d.hollow.opacity = 0.42) },
    ],
  },

  // ---- 6. The stair (twist 1: the rabbit led them) ------------------------------------------
  {
    id: 'stair',
    scene: stairScene,
    enter: (d) => {
      d.walk('tomas', 'tomas');
      d.walk('ama', 'ama');
      d.walk('rabbit', 'ama', -0.03, -0.03);
      d.walk('fox', 'char', 0.0, 0.0);
      d.walk('owl', 'char', 0.02, -0.01);
      d.walk('heron', 'tomas', -0.04, 0.03);
      d.hollow.snap(0.0, 0.102, 0.45);
      d.hollow.opacity = 0;
    },
    steps: [
      { say: 'Halfway up, a light came sweeping down the hill, slow as a lighthouse.' },
      { say: 'Three borrowed shadows stood on the steps, right in its path.' },
      { say: 'They needed a roof, and quickly.', screen: (d) => ({
        id: 'hide', kind: 'hide',
        hide: {
          figures: [[-0.11, 0.15, 'heron'], [-0.08, 0.15, 'rabbit'], [-0.055, 0.15, d.st.route === 'owl' ? 'owl' : 'fox']],
          sweeps: [
            { dir: 1, speed: 0.07 },
            { dir: -1, speed: 0.08, xs: [0.0, 0.03, 0.055] },
            { dir: 1, speed: 0.11, xs: [-0.04, -0.012, 0.016] },
          ],
        },
        advice: 'Hold a flat hand over the three little shadows until the light has gone.',
        onDone: (_byHand, n) => (d.st.marks.hid = n),
      }) },
      { say: (s) => (s.marks.hid ? (s.lost.some((l) => l.act === 'hide') ? 'The light slid off your hand, found one small shadow, and took it up the hill.' : 'The light passed over your hand, found nothing, and went back up.') : 'The light found Ama, and stopped, and looked. Then it hurried back up.') },
      { say: 'At the top of the stair, the grey footprints stopped. Touch the last one.', act: {
        id: 'last', kind: 'touch', each: 4,
        targets: (d) => [d.anchor('last', 0, 0).setY(d.anchor('last').y + 0.002)],
        onHit: (d) => d.music.tap(),
      } },
      { say: 'Out of the gorse came a rabbit. One ear up, one ear down.', run: (d) => d.amaRabbit('gorse') },
      { say: 'Ama’s own rabbit. Nobody had taken it. It had led them all away.', breath: 0.8, run: (d) => d.music.twist() },
      { say: 'Then it looked at the lantern’s beam, where hands come from. Its ears went flat.' },
      { say: 'It would not come while a hand was in the light.', screen: (d) => ({
        id: 'hands-away', kind: 'clear', each: 9,
        advice: 'Lower your hands out of the beam, slowly, and keep them down.',
        onDone: (byHand) => {
          d.st.marks.calm = byHand ? 1 : 0;
          if (byHand) d.amaRabbit('ama');
        },
      }) },
      { say: (s) => (s.marks.calm ? 'It crept to Ama’s boots, and touched her nose with its nose.' : 'It stayed in the gorse, shaking. Ama sat down to wait for it.') },
      { say: 'Then it ran uphill again, and twice it looked back at her.', run: (d) => d.amaRabbit('away') },
    ],
  },

  // ---- 7. The Hollow (twist 2: it is afraid of hands, and the hand was yours) ---------------
  {
    id: 'hollow',
    scene: () => hillScene(false),
    enter: (d) => {
      d.hollow.hatOn = d.st.hat === 'lost';
      d.hollow.setCoat(coatOf(d.st));
      d.walk('tomas', 'tomas');
      d.walk('ama', 'ama');
      d.walk('rabbit', 'ama', 0.042, -0.012);
      d.walk('fox', 'ama', 0.08, 0.0);
      d.walk('owl', 'ama', 0.125, -0.01);
      d.walk('heron', 'tomas', -0.04, 0.03);
      d.hollow.mirrored = false;
      d.hollow.snap(0.0, 0.075, 1.2);
      d.hollow.opacity = 0;
      d.moon(0.1, 0.9, 0);
    },
    steps: [
      { say: 'At the top of the hill stood the Hollow, and every shadow with it.', run: (d) => {
        d.hollow.opacity = 1;
        d.moon(0.2, 1.25, 0);
        d.music.dread();
      } },
      { say: 'It had no face. Only a window, with the moon in it.' },
      { say: (s) => (fox(s) ? '“The tower’s shadow,” whispered Tomas. “Granny was right.”' : '“So that’s what the owl saw,” whispered Tomas.') },
      { say: 'Tomas’s hat hung on it too, like a hat on a peg.', when: (s) => s.hat === 'lost' },
      { when: (s) => coatOf(s).includes('scarf'), say: (s) => (coatOf(s).filter((c) => c === 'scarf').length > 1 ? 'The scarves the wind took on the common hung there too.' : 'The scarf the wind took on the common hung there too.') },
      { when: (s) => coatOf(s).some((c) => c !== 'scarf'), say: (s) => {
        const taken = coatOf(s).filter((c) => c !== 'scarf');
        return taken.length > 1 ? 'On its coat hung small shadows you knew.' : `On its coat hung a small shadow you knew: ${NAMES[taken[0]] ?? 'one of yours'}.`;
      } },
      { say: 'It stood very still, as if it were waiting for something.', run: (d) => {
        d.hollowReach(true);
        d.advise('Put one hand into the lantern’s beam, and watch the tall shadow.');
      }, until: (d) => d.flag('reached'), nudges: [[5, 'Still it waited.']] },
      { say: 'It grew. It drank the light. It held its shadows close.', hold: 4, run: (d) => d.advise('') },
      { say: 'Then the wind came back over the hill, for the shadows on its coat.', run: (d) => d.hollowReach(false), screen: (d) => ({
        id: 'wall-hollow', kind: 'wall',
        wall: {
          target: 0.0,
          band: { kind: 2, a: [0.075, 0.14, 0.025, 0.05], b: [-0.075, 0.14, 0.025, 0.05] },
          waves: [
            { items: [[0, 0.12, 1], [1.4, 0.16, 1]], speed: 0.075 },
            { items: [[0, 0.11, -1], [1.2, 0.15, 1], [2.4, 0.13, -1]], speed: 0.085 },
            { items: [[0, 0.13, 1], [1.0, 0.12, -1], [2.0, 0.16, 1]], speed: 0.095 },
          ],
          tendril: { t: 1, y: 0.13, side: 1 },
        },
        advice: 'One hand or two, up beside the Hollow. The wind comes from both sides now.',
        onProgress: (v) => (d.hollow.grow = Math.max(0.9, 1.25 - 0.35 * v)),
        onDone: (_byHand, n) => (d.st.marks.wallHollow = n),
      }) },
      { say: (s) => ((s.marks.wallHollow ?? 0) >= 5
        ? 'The wind tore at your hands, and could not get past. The Hollow stopped growing.'
        : s.marks.wallHollow
          ? 'Your hands stopped some of the wind. The rest went howling by, and the Hollow held on.'
          : 'The Hollow bent over its shadows and held on, and the wind went by.'), run: (d) => (d.hollow.grow = 0.95) },
      { say: 'Its window showed you why: carts, stones, and huge hands taking its tower away.', hold: 5, run: (d) => d.vision('carts') },
      { say: (s) => (s.marks.echo && s.marks.villageMem ? 'Then the village at dusk, and a hand that put out the sun.' : s.marks.echo ? 'Then the evening sky, and the hand that put out the sun.' : 'Then the evening sky, and a hand in it, very like yours.'), hold: 7, run: (d) => d.vision('echo') },
      { say: 'It was never afraid of the dark. It was afraid of hands.', hold: 4.5, run: (d) => (d.hollow.shake = 0.3) },
      { say: 'Yours.', hold: 5, run: (d) => {
        d.vision('yours');
        d.music.twist();
      } },
      { hold: 1.2, run: (d) => d.vision(null) },
    ],
  },

  // ---- 8. The tower (the apology, made with the hands) --------------------------------------
  {
    id: 'tower',
    scene: () => hillScene(false),
    enter: (d) => {
      d.walk('tomas', 'tomas');
      d.walk('ama', 'ama');
      d.walk('rabbit', 'ama', 0.042, -0.012);
      d.walk('fox', 'ama', 0.08, 0.0);
      d.walk('owl', 'ama', 0.125, -0.01);
      d.walk('heron', 'tomas', -0.04, 0.03);
      d.hollow.mirrored = false;
      d.hollow.snap(0.0, 0.075, 1.15);
      d.hollow.opacity = 1;
      d.hollow.grow = 0.95;
      d.hollow.setCoat(coatOf(d.st));
      d.hollow.hatOn = d.st.hat === 'lost' && !d.st.marks.hatHome;
      d.moon(0.2, 1.25, 0);
    },
    steps: [
      { say: 'Ama stepped between your hands and the Hollow, and looked up at it.', run: (d) => d.walk('ama', 'char', -0.03, 0.03) },
      { say: '“Hands took your tower,” she said. “Watch what these ones do.”', breath: 0.6 },
      { say: 'Make it a tower with your shadow. One hand or two.', beat: { id: 'tower', options: ['tower'], land: 'ring' } },
      { say: (s) => (big(s, 'tower') ? 'Your tower stood as tall as the old one. The Hollow straightened.' : 'Your tower was small as a milk churn. The Hollow knelt to fit.'), run: (d) => {
        d.hollow.grow = d.st.size.tower === 'big' ? 1.05 : 0.8;
      } },
      { say: 'Slowly, the Hollow stepped behind it, like a coat onto its hook.' },
      { say: 'At the top of your tower sat a cold lamp. Touch it to light it.', act: {
        id: 'towerLamp', kind: 'touch', each: 6,
        targets: (d) => {
          const p = d.actorPoint('tower', 0.86);
          return p ? [p] : [];
        },
        onHit: (d) => {
          const t = d.actor('tower');
          const lamp = t?.root.children[0]?.userData.lamp;
          if (lamp) lamp.opacity = 1;
          d.music.shimmer();
          d.hollow.grow = Math.max(0.8, d.hollow.grow - 0.1);
        },
      } },
      { say: 'For the first time in a hundred years, it had something to stand behind.' },
      { say: 'Out of its coat peeped Ama’s rabbit, and its ears came up.', run: (d) => d.amaRabbit('hollow') },
    ],
  },

  // ---- 9. The lending (choice 2: the climax) ------------------------------------------------
  {
    id: 'lending',
    scene: () => hillScene(true),
    enter: (d) => {
      d.walk('tomas', 'tomas');
      d.walk('ama', 'ama');
      d.walk('rabbit', 'ama', 0.042, -0.012);
      d.walk('fox', 'ama', 0.08, 0.0);
      d.walk('owl', 'ama', 0.125, -0.01);
      d.walk('heron', 'tomas', -0.04, 0.03);
      if (d.hollow.hasShed || d.hollow.birdTarget > 0) d.hollow.reset();
      d.walk('tower', 'ring', 0, 0);
      d.walk('amarabbit', 'ring', 0.05, 0.03);
      d.hollow.snap(0.0, 0.075, 1.2);
      d.hollow.opacity = 1;
      d.hollow.setCoat(coatOf(d.st));
      d.hollow.hatOn = d.st.hat === 'lost' && !d.st.marks.hatHome;
      d.moon(0.17, 2.2, 0);
    },
    steps: [
      { say: 'But a tower made of a hand lasts only while the hand holds it.', run: (d) => {
        const t = d.actor('tower');
        if (t) {
          t.sizeRate = 1.2;
          t.setSize(0.75);
        }
      } },
      { say: 'The Hollow looked at you through its window. It did not ask.' },
      { say: 'What will you lend it for keeps: a tower, or wings?', beat: { id: 'gift', options: ['keep', 'wings'], land: 'ring', spawn: false, gentle: true, done: (d, id, size) => {
        d.st.ending = id === 'wings' ? 'wings' : 'keep';
        const t = d.actor('tower');
        if (id === 'keep' && t) {
          t.sizeRate = 2;
          t.setSize(size === 'big' ? 1.85 : 1.15);
          d.hollow.scale = size === 'big' ? 1.1 : 0.8;
          const lamp = t.root.children[0]?.userData.lamp;
          if (lamp) lamp.opacity = 1;
        } else if (t) t.visible = false;
        if (id === 'wings') d.hollow.birdTarget = 1;
        d.music.join('hollow');
        d.music.finale(true);
      } } },
      { say: (s) => s.ending === 'keep'
        ? (big(s, 'gift') ? 'A tower tall as the night, with its lamp at the top.' : 'A small tower, low and warm, near enough to hear the village.')
        : (big(s, 'gift') ? 'Wings wide enough to cover the moon. The Hollow opened them.' : 'Small, quick wings. The Hollow circled Ama three times first.') },
      { when: (s) => s.ending === 'wings', say: '“But then who will keep the dark company?” said Tomas.' },
      { when: (s) => s.ending === 'wings', say: 'Ama held up her small hand. “I will.”', breath: 0.6 },
      { when: (s) => s.ending === 'wings', say: '“Show it the way,” she said, and looked at you.', run: (d) => {
        // the bird flies to the left and waits there for your fingertip
        d.hollow.flight = 0.28;
        d.hollow.flightWait = true;
        d.advise('The bird waits on the left. Point at it, then carry it left to right, across the moon.');
      }, act: {
        id: 'fly', kind: 'steer', each: 7,
        onSteer: (d, x, y) => {
          // the bird follows the tip of your shadow, both ways, gliding after it (it never jumps to your hand)
          const want = Math.min(1, Math.max(0, (x + 0.27) / 0.54));
          // it waits on the left to be picked up: only a fingertip near it carries it (no jump, no instant finish)
          const cur = d.hollow.flight < 0 ? 0.28 : d.hollow.flight;
          if (!d.hollow.flightHeld && Math.abs(want - cur) > 0.22) {
            if (d.hollow.flight < 0) d.hollow.flight = cur;
            return false;
          }
          d.hollow.flightWait = false;
          const f = Math.max(0.3, cur + Math.max(-0.02, Math.min(0.02, (want - cur) * 0.12)));
          d.hollow.flight = f;
          if (!d.hollow.flightHeld) d.advise('Now carry it to the right, across the moon.');
          d.hollow.flightHeld = true;
          d.hollow.flightY = Math.min(0.21, Math.max(0.08, y));
          // the right side of the picture is the far side (the last grid column lies under the frame)
          return f > 0.86;
        },
        onLetGo: (d) => {
          d.hollow.flightHeld = false;
          d.hollow.flightWait = false;
          if (d.hollow.flight < 0) d.hollow.flight = 0;
        },
        onDone: (d) => {
          d.hollow.flightHeld = false;
          d.hollow.flightWait = false;
          d.advise('');
        },
      } },
      { when: (s) => s.ending === 'keep', say: 'High in the tower hung a bell. Touch it, and let the village hear.', act: {
        id: 'bell', kind: 'touch', each: 6,
        targets: (d) => {
          const p = d.actorPoint('tower', 0.95);
          return p ? [p] : [];
        },
        // the bell is heard and seen: it rings, and the Hollow shivers with it
        onHit: (d) => {
          d.music.bell();
          d.music.shimmer();
          d.hollow.shake = 0.6;
        },
      } },
      { say: (s) => (s.ending === 'keep' ? 'The bell rang, and the Hollow, for the first time, hummed along.' : 'It sang as it flew. Nobody knew a shadow could sing.') },
      { say: 'Then it shook, and every shadow it had kept safe let go.', run: (d) => {
        d.hollow.shed();
        if (d.st.ending === 'keep') d.hollow.shake = 1;
      } },
      { when: (s) => coatOf(s).length > 0 || s.hat === 'lost', say: 'It let go of what it had kept for you, too.', run: (d) => {
        // Tomas's hat comes off the peg and back to his head on the desk
        if (d.st.hat === 'lost') {
          d.st.marks.hatHome = 1;
          // it is home: the epilogue's long way does not bring a second, crumpled one
          for (const l of d.st.lost) if (l.cell === 'hat') l.home = true;
        }
      } },
    ],
  },

  // ---- 10. The way home (the book turns back a page) ----------------------------------------
  {
    id: 'home',
    scene: homeScene,
    enter: (d) => {
      d.walk('tomas', 'tomas');
      d.walk('ama', 'ama');
      d.walk('rabbit', 'ama', 0.042, -0.012);
      d.walk('heron', 'tomas', -0.04, 0.03);
      d.walk('fox', 'char', 0.03, 0.0);
      d.walk('owl', 'char', 0.05, -0.01);
      d.hollow.birdTarget = d.st.ending === 'wings' ? 1 : 0;
      d.hollow.flight = -1;
      d.hollow.settle();
      if (d.st.ending === 'wings') {
        d.hollow.snap(0.0, 0.17, 0.4);
        d.hollow.opacity = 0.7;
      } else {
        d.hollow.snap(-0.113, 0.068, 0.45);
        d.hollow.opacity = 0.6;
      }
      d.moon(0.22, 0.8, -0.12);
    },
    steps: [
      { say: 'Then the book did something books hardly ever do. It turned back a page.' },
      { say: 'Every evening, when the lamps were lit, the shadows walked home.' },
      { when: (s) => s.ending === 'keep', say: 'The shadows came running down the hill. But the road home dipped into the dark.', screen: (d) => ({
        id: 'road-home', kind: 'road',
        road: { x0: -0.21, gapA: -0.1, gapB: 0.01, x1: 0.19, y: 0.16, walkers: [], speed: 0.08, groups: [['villager', 'hat'], ['villager', 'hat', 'villager'], ['hat', 'villager', 'hat', 'villager']] },
        advice: 'One long hand across the dotted dip; hold while they run.',
        onDone: (byHand) => {
          d.st.marks.roadHome = byHand ? 1 : 0;
          d.lightLamps();
        },
      }) },
      { when: (s) => s.ending === 'keep', say: (s) => (s.marks.roadHome ? 'They ran down your shadow like children down a banister.' : 'They found their own way, slowly, the big ones carrying the small.') },
      { when: (s) => s.ending === 'wings', say: 'Over the village, the shadows fell from its wings like snow.', screen: (d) => ({
        id: 'catch-home', kind: 'catch',
        catch: {
          what: 'shadow',
          deliver: [0.0, 0.04],
          tray: { kind: 2, a: [0, 0.14, 0.15, 0.016] },
          waves: [
            { items: [[0, -0.1, 0.03], [1.2, -0.03, 0.03], [2.4, 0.04, 0.03], [3.6, 0.11, 0.03]] },
            { items: [[0, 0.04, 0.03], [1.0, -0.1, 0.045], [2.0, 0.11, 0.03], [3.0, -0.03, 0.045]] },
            { items: [[0, -0.1, 0.04], [0, 0.1, 0.04], [1.6, -0.04, 0.04], [1.6, 0.04, 0.04]] },
          ],
        },
        advice: 'Hold out a flat hand under the falling shadows.',
        onDone: (_byHand, n) => {
          d.st.marks.caught = n;
          d.lightLamps();
        },
      }) },
      { when: (s) => s.ending === 'wings', say: (s) => (s.marks.caught ? 'Each one you caught, you set down at its own front door.' : 'They came home down the chimneys, sooty and pleased.') },
      { say: 'And tonight, the shadows came home.', hold: 4.4 },
      { say: 'Tomas’s own shadow came home: a heron again. Your heron bowed, and folded itself flat.', run: (d) => d.retire('heron') },
      { say: 'His wife was waiting at the gate. Somebody had told her.', run: (d) => d.music.laugh() },
      { say: 'Ama’s own rabbit came home to her heels, muddy and sorry.', hold: 5, run: (d) => {
        d.amaShadowHome();
      } },
      { say: '“You were brave,” Ama told her rabbit, “in the wrong direction.”' },
    ],
  },

  // ---- 11. A room for borrowed shades (epilogue) -------------------------------------------
  {
    id: 'epilogue',
    scene: epilogueScene,
    enter: (d) => {
      d.walk('ama', 'ama');
      d.walk('tomas', 'tomas');
      if (d.st.route === 'fox') d.walk('granny', 'granny');
      const rest = ['rabbit', 'fox', 'owl', 'heron', 'boat'].filter((id) => d.actor(id));
      rest.forEach((id, k) => {
        d.walk(id, 'room', -0.1 + k * 0.055, 0.066 + (k % 2) * 0.006);
        const a = d.actor(id);
        if (a) a.setSize(a.baseSize);
      });
      d.hollow.birdTarget = d.st.ending === 'wings' ? 1 : 0;
      d.hollow.flight = -1;
      d.hollow.settle();
      d.walk('amarabbit', 'ama', -0.05, 0.035);
      if (d.st.ending === 'wings') d.hollow.snap(0.17, 0.16, 0.35);
      else d.hollow.snap(0.105, 0.051, 0.35);
      d.hollow.opacity = d.st.ending === 'wings' ? 0.5 : 0.55;
      d.moon(0.24, 0.8);
      d.music.finale(false);
    },
    steps: [
      { say: 'From that night on, the village kept a little room for borrowed shades.' },
      { say: 'Ama gave your rabbit back, with thanks, and a little mud.' },
      { say: 'Tomas gave Ama his lantern. “Your turn to keep the dark company.”', run: (d) => d.passLantern() },
      { say: (s) => (s.ending === 'keep' ? 'Every evening she climbed the hill and lit the tower’s lamp.' : 'Every evening she lit a lamp in her window, for a bird.') },
      { say: (s) => s.ending === 'keep'
        ? (big(s, 'gift') ? 'And the Hollow stood tall behind it, watching the far roads.' : 'Children climbed up to sit in its shade on hot days.')
        : (big(s, 'gift') ? 'Some nights, a great shadow crossed the moon and dipped a wing.' : 'Some nights, a small dark bird sat on her sill.'), run: (d) => {
        if (d.st.ending !== 'wings') return;
        if (d.st.size.gift === 'big') d.hollow.flight = 0;
        else d.hollow.snap(0.12, 0.07, 0.25);
      } },
      { run: (d) => {
        if (d.st.route !== 'fox') return;
        const sn = d.actor('snail');
        if (sn) {
          sn.put(d.anchor('room', -0.25, 0.03));
          d.reveal(sn);
          sn.setSize(sn.baseSize);
          d.walk('snail', 'room', -0.07, 0.03);
        }
      }, say: (s) => (fox(s) ? 'The snail arrived at breakfast. Never lost.' : 'The little boat stayed tied to its reed, for whoever needs it next.') },
      { when: (s) => s.lost.some((l) => !l.home), say: 'Some things came home the long way, crumpled from the trip.', run: (d) => d.longWayHome(), hold: 4, until: (d) => !d.trayFlying() },
      { when: (s) => s.lost.some((l) => !l.home), say: 'Smooth each one flat with a fingertip.', act: {
        id: 'smooth', kind: 'touch', each: 6,
        targets: (d) => d.trayCrumples(),
        onHit: (d, k) => {
          d.smoothCrumple(k);
          d.music.tap();
        },
      } },
      { say: (s) => (s.lost.length ? 'Now everything was home. Even the ones that took the long way.' : s.kept.length ? 'Nothing had to come the long way home.' : null) },
      { say: 'Put your hand in the light, once more, and hold it still.', screen: (d) => ({
        id: 'birds', kind: 'birds', birds: { roost: [0.15, 0.055], n: 5 },
        advice: 'Hold one hand still in the dashed circle, fingers spread like branches.',
        onDone: (byHand) => (d.st.marks.perch = byHand ? 1 : 0),
      }) },
      { say: (s) => (s.marks.perch ? 'The birds came down, one on every finger. Below, the shadows waved.' : 'The birds circled once and went to roost. Below, Ama waved at the sky.'), hold: 5 },
      { say: 'Ama grew up, and grew old, and never once let the dark sit alone.' },
      { say: 'When she was very old, she made a book with paper hills.' },
      { say: 'She signed it with one letter.', breath: 0.8 },
      { say: 'At the edge of the map, a lamp no one had ever lit began to burn.', hold: 5, run: (d) => d.farLamp() },
      { say: 'Now it is your turn to keep the dark company.', hold: 4, run: (d) => d.advise('Touch the glowing corner to close the book.') },
    ],
  },
];
