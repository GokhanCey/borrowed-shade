import type { Mesh } from '@iwsdk/core';
import type { BeatSpec, Director, PageDef, TaleState } from '../tale/story.js';
import { bakeryScene, fieldScene, fourScene, loftScene, millScene, slipScene } from './almanac-scene.js';
import type { Element, Made } from './made.js';

/**
 * THE FOUR ELEMENTS: the second book on the shelf.
 * Ottilie Vane keeps Brimble's four elements in four jars (air, water, fire and earth), but today she
 * has a cold and no voice, so she makes them the old way, with her hands, and needs a second pair:
 * yours. Each spread opens one jar for one errand in the town. A small grey cloud nobody ordered,
 * the Tagalong, rides your shadow from the first page; at the end it turns out to be a fifth jar.
 *
 * WHAT YOU MAKE IS THE THING, AND NOTHING IS ASKED TWICE.
 *  - Each sign is made once in the whole book: a cloud (two fists), air (two flat hands), the rakes
 *    (water), a coal and a flame (fire), a mountain (earth).
 *  - The outline you fill lifts off the screen as cut paper and is the element (src/weather/made.ts):
 *    your fists are the cloud that follows your hands; your hands stream across the sky as the wind.
 *  - Between signs your hands do other things: carry your cloud, pump the bellows, open the jars.
 *  - The last spread asks for no sign at all: each jar gives back the very shape your hands made.
 * Either hand order counts (mirrors are scored too). One hand is always enough. If no hand comes,
 * Ottilie signs it alone, softer (and coughs).
 */

/** the weather on the screen (src/weather/weather-fx.ts), as the story uses it */
export interface WeatherFx {
  cloud(on: boolean, opts?: { x?: number; y?: number; size?: number; follow?: boolean; dark?: number }): void;
  readonly cloudX: number;
  readonly tagX: number;
  rain(amount: number, slant?: number): void;
  wind(amount: number, dir?: 1 | -1): void;
  warm(amount: number, x?: number, y?: number, r?: number): void;
  storm(amount: number): void;
  tagalong(mode: 'hidden' | 'shelf' | 'ride' | 'hide' | 'rain' | 'white'): void;
  /** how big the little grey cloud is drawn (1.7 is its usual size) */
  tagSize(k: number): void;
  setShelf(x: number, y: number): void;
  puff(x: number, y: number): void;
  reset(): void;
}

/** what the weather book needs of the director, beyond the tale's */
export interface WeatherDirector extends Director {
  readonly wx: WeatherFx;
  /** the shapes the reader's hands made, as cut paper on the screen */
  readonly made: Made;
  /** a token flies from the screen (board x, y) to the keeping tray on the desk */
  token(cell: string, bx: number, by: number): void;
  /** a caption that waits on the reader's hands (carrying the cloud): a lost hand holds the moment */
  holdHands(on: boolean): void;
}

const W = (d: Director) => d as WeatherDirector;
const lent = (s: TaleState, id: string) => !!s.marks[`lent:${id}`];
/** the reader made this element with one hand (the paper completed it) */
const one = (s: TaleState, el: Element) => !!s.marks[`one:${el}`];

/**
 * Ask for a sign. The filled outline itself becomes the element (`el`), going to `to` ([x, y, scale]),
 * and then the world answers (`done`).
 */
function sign(id: string, plate: string, el: Element, to: [number, number, number] | undefined, done: (d: WeatherDirector, byHand: boolean) => void): BeatSpec {
  return {
    id, options: [plate], land: 'char', spawn: false, gentle: true,
    morph: (d, made, x, y) => {
      const byHand = !lent(d.st, id);
      const jar = d.pageScene.props.jar as { open: boolean; pop: number } | undefined;
      if (jar && el !== 'cloud') {
        jar.open = true;
        jar.pop = 1;
      }
      // which shape it was (a one-hand half, a mirror): kept in the marks, so a bookmark brings it back
      for (const k of Object.keys(d.st.marks)) if (k.startsWith(`made:${el}:`)) delete d.st.marks[k];
      d.st.marks[`made:${el}:${made}`] = 1;
      d.st.marks[`one:${el}`] = /1(_m)?$/.test(made) ? 1 : 0;
      // Ottilie's own are smaller ("a smallish cloud", "a small hill of her own")
      const t = to ?? (el === 'cloud' ? ([0, 0.17, 0.8] as [number, number, number]) : undefined);
      W(d).made.become(el, made, x, y, t && !byHand ? [t[0], t[1], t[2] * 0.72] : t);
      done(W(d), byHand);
    },
  };
}

/** the jars of the last spread (scene props): open one */
function openJar(d: Director, k: number): void {
  const pop = d.pageScene.props.pop as number[] | undefined;
  if (pop) pop[k] = 1;
  const jars = d.pageScene.props.jars as Mesh[] | undefined;
  if (jars?.[k]) jars[k].userData.open = true;
  d.music.tap();
}

export const WEATHER_PAGES: PageDef[] = [
  // ---- 1. The weather loft -------------------------------------------------------------------
  {
    id: 'w-loft',
    scene: loftScene,
    enter: (d) => {
      d.day(1);
      W(d).wx.reset();
      W(d).wx.setShelf(0.1, 0.105);
    },
    steps: [
      { say: 'Above the town of Brimble, in a loft, lived Ottilie Vane, who kept the four elements.' },
      { say: 'Air, water, fire and earth: one to a jar, and the jars on a shelf.' },
      { say: 'This morning she had a cold, and not one word of voice left.' },
      { say: 'So she would open the jars the old way: with her hands, and yours.', breath: 0.5 },
      { when: (s) => s.lesson, say: 'Hold your hands up in front of the picture, in the lantern’s light: their shadows fall on it.' },
      { say: 'First, a cloud. Two fists, side by side, a hand’s width of air between them.', beat: sign('w-cloud', 'woolsack', 'cloud', undefined, (d, byHand) => {
        d.wx.cloud(true, { x: 0, y: 0.17, size: 1, follow: byHand });
        d.music.shimmer();
        d.st.marks.cloud = byHand ? 1 : 0;
      }) },
      { say: (s) => (s.marks.cloud ? (one(s, 'cloud') ? 'Your fist went up white, and was a cloud. A good, fat, ordinary cloud.' : 'Your two fists went up white, and were a cloud. A good, fat, ordinary cloud.') : 'Ottilie made it herself, between two sneezes. A smallish cloud.') },
      { when: (s) => !!s.marks.cloud, say: 'It goes where your hands go. Take it for a walk across the sky.', hold: 7, run: (d) => W(d).holdHands(true) },
      { say: 'And behind it came a very small grey one that nobody had asked for.', run: (d) => {
        const w = W(d);
        w.holdHands(false);
        // it pops out from behind the cloud
        w.wx.setShelf(w.wx.cloudX + 0.05, 0.15);
        w.wx.tagalong('ride');
        w.wx.setShelf(0.1, 0.105);
      } },
      { say: (s) => (s.marks.cloud ? 'Ottilie shooed it. It sat on your knuckle and looked pleased.' : 'Ottilie shooed it. It sat above her jar shelf and looked pleased.'), hold: 4 },
      // (a reader who opens this book first is taught the pause here)
      { when: (s) => s.lesson, run: (d) => d.advise('To pause at any time, hold a flat hand over the lantern.', 7), hold: 3 },
      { say: '', run: (d) => {
        W(d).wx.cloud(false);
        W(d).wx.tagalong('shelf');
      }, hold: 0.6 },
      { when: (s) => s.lesson, say: 'When a page is done, its corner glows. Touch it to turn the page.', hold: 3 },
    ],
  },

  // ---- 2. The mill --------------------------------------------------------------------------
  {
    id: 'w-mill',
    scene: millScene,
    enter: (d) => {
      d.day(1);
      W(d).wx.setShelf(-0.17, 0.1);
      W(d).wx.tagalong('ride');
    },
    steps: [
      { say: 'The first jar said AIR.' },
      { say: 'Down the hill, Mr Crabbe’s mill stood still, and so did Mr Crabbe.' },
      { say: '“No wind for a week,” he said. “The wheat won’t grind itself.”' },
      { say: 'Air is two flat hands, palms to the light.' },
      { say: 'Fingers pointing at each other, one hand higher than the other.', beat: sign('w-wind', 'streamer', 'air', undefined, (d, byHand) => {
        d.wx.wind(byHand ? 1 : 0.4, 1);
        d.pageScene.props.spin = byHand ? 2.4 : 0.9;
        d.music.rustle(0.8);
        d.st.marks.wind = byHand ? 1 : 0;
      }) },
      { say: (s) => (s.marks.wind ? (one(s, 'air') ? 'Your hand went streaming across the sky, and the sails went round.' : 'Your hands went streaming across the sky, and the sails went round.') : 'Ottilie blew a weak wind of her own. The sails went round, grudgingly.') },
      { say: (s) => (s.marks.wind ? 'Mr Crabbe pretended not to smile. Three sacks, and flour on everything.' : 'One sack, and a sneeze.'), hold: 3.5, run: (d) => {
        const n = d.st.marks.wind ? 3 : 1;
        for (let i = 0; i < n; i++) d.after(0.5 + i * 0.6, () => W(d).token('sack', 0.12 + i * 0.015, 0.03));
      } },
      { say: 'The little grey cloud tried to blow too. It came out as a hiccup.', run: (d) => {
        const w = W(d);
        w.wx.wind(0);
        w.made.fade('air');
        d.pageScene.props.spin = 0.5;
        d.after(0.8, () => w.wx.puff(w.wx.tagX + 0.012, 0.125));
      } },
    ],
  },

  // ---- 3. Fen's field -----------------------------------------------------------------------
  {
    id: 'w-field',
    scene: fieldScene,
    enter: (d) => {
      d.day(1);
      W(d).wx.setShelf(0.0, 0.115);
      W(d).wx.tagalong('ride');
    },
    steps: [
      { say: 'The second jar said WATER.' },
      { say: 'Fen’s turnips were small and thirsty. Mags had just hung out the sheets.' },
      { say: (s) => (s.marks.cloud ? 'Your cloud had followed you down the hill.' : 'Ottilie’s small cloud had followed you down the hill.'), run: (d) => {
        // the very cloud of the first page (the shape your fists made), no sign asked again
        const w = W(d);
        w.made.again('cloud', 0.19, 0.2);
        w.wx.cloud(true, { x: 0, y: 0.17, size: 1, follow: true });
      } },
      { say: 'Carry it where you want the rain: over the turnips, or over the washing.', hold: 8, run: (d) => W(d).holdHands(true) },
      { say: 'Now for the rain. Water is a drop: one hand up, all five fingertips pinched together.', run: (d) => {
        const w = W(d);
        w.holdHands(false);
        // it stays where you left it: over the field (left) or over the washing (right), never between
        const field = w.wx.cloudX < 0.04;
        d.st.marks.field = field ? 1 : 0;
        w.wx.cloud(true, { x: field ? Math.min(w.wx.cloudX, -0.09) : Math.max(w.wx.cloudX, 0.11), y: 0.17, size: 1, follow: false });
      }, beat: sign('w-rain', 'rake', 'water', undefined, (d, byHand) => {
        d.wx.rain(byHand ? 1 : 0.5);
        d.wx.cloud(true, { dark: 0.5 });
        d.music.rustle(1.2);
        d.st.marks.sheets = d.st.marks.field ? 0 : 1;
        if (d.st.marks.field) d.after(2, () => (d.pageScene.props.grow = byHand ? 1 : 0.5));
      }) },
      { say: (s) => (lent(s, 'w-rain')
        ? (s.marks.field ? 'Ottilie squeezed it out herself, coughing. A thin rain came down, and Fen held out his hat.' : 'Ottilie squeezed it out herself, coughing. A thin rain came down: all over Mags’s clean sheets.')
        : (s.marks.field ? 'Your drop went up into the cloud, and the rain came down. Fen held out his hat.' : 'Your drop went up into the cloud, and the rain came down: all over Mags’s clean sheets.')), hold: 4.5 },
      { say: (s) => (s.marks.field ? 'The turnips drank, and swelled, and Fen whooped.' : '“Next time,” said Mags, “ask.”'), run: (d) => {
        if (!d.st.marks.field) d.pageScene.props.grow = 0.3;
        if (d.st.marks.field) d.after(1, () => W(d).token('turnip', -0.12, 0.04));
      } },
      { say: 'The little grey cloud squeezed itself very hard. Nothing came.', breath: 0.6, run: (d) => {
        W(d).wx.rain(0);
        W(d).wx.cloud(false);
      } },
    ],
  },

  // ---- 4. The bakery at dusk ----------------------------------------------------------------
  {
    id: 'w-bakery',
    scene: bakeryScene,
    enter: (d) => {
      d.day(0.45);
      W(d).wx.setShelf(0.16, 0.095);
      W(d).wx.tagalong('ride');
    },
    steps: [
      { say: 'The third jar said FIRE.' },
      { say: 'By evening the wind turned cold, and the Pottles’ oven would not light.' },
      { when: (s) => !!s.marks.sheets, say: 'Mags’s sheets were still dripping on the line.' },
      { say: 'Fire is a flame: one hand held tall, fingers together.', beat: sign('w-warm', 'ember', 'fire', [0.088, 0.125, 0.5], (d, byHand) => {
        d.wx.warm(byHand ? 0.8 : 0.5, 0.04, 0.06, 0.12);
        d.music.shimmer();
        d.st.marks.warm = byHand ? 1 : 0;
        // it goes down the Pottles' chimney, and the windows answer
        d.after(2.0, () => d.made.moveTo('fire', 0.088, 0.07, 0.3, 1.1));
        d.after(2.7, () => d.made.fade('fire'));
        d.after(2.9, () => (d.pageScene.props.glow = byHand ? 0.55 : 0.3));
      }) },
      { say: (s) => (s.marks.warm ? (one(s, 'fire') ? 'Your flame went down the Pottles’ chimney.' : 'Your flame went down the Pottles’ chimney.') : 'Ottilie lit it with a cough and a match.') },
      { say: 'Every window on the street went the colour of toast.' },
      { say: 'But a fire needs a breath to wake it. Pump the bellows: three long strokes.', run: (d) => {
        d.st.marks.bellows = 0;
        d.advise('Stroke a flat hand towards you, over the bellows. Three times.');
      }, act: {
        id: 'bellows', kind: 'stroke', each: 5,
        targets: (d) => [0, 1, 2].map(() => d.anchor('oven')),
        onHit: (d, k, byHand) => {
          const w = W(d);
          if (byHand) d.st.marks.bellows = (d.st.marks.bellows ?? 0) + 1;
          d.pageScene.props.glow = 0.7 + 0.25 * (k + 1) * (byHand ? 1 : 0.6);
          w.wx.warm(1, 0.04, 0.06, 0.13 + 0.02 * k);
          w.wx.puff(0.075, 0.115);
          d.pageScene.props.squeeze = 1;
          d.music.rustle(0.5);
        },
        onDone: (d) => d.advise(''),
      } },
      { say: (s) => ((s.marks.bellows ?? 0) >= 2 ? 'The oven roared. The bread rose as if it had somewhere to be.' : s.marks.bellows ? 'You gave it one good breath, and Mr Pottle the rest. The bread rose, a little to one side.' : 'Mr Pottle worked the bellows himself. The bread came out flat, but warm.'), run: (d) => d.after(1.2, () => W(d).token('loaf', 0.04, 0.03)) },
      { when: (s) => !!s.marks.sheets, say: 'Mags hung her sheets by the oven door. They were dry before the bread was done.' },
      { say: 'The little grey cloud warmed itself in the glow of the windows, and did not rain on anything.', hold: 4, run: (d) => {
        W(d).wx.setShelf(0.04, 0.135);
        W(d).wx.tagalong('shelf');
      } },
      { say: 'One jar was left on the shelf. It said EARTH, and it was very heavy.', breath: 0.8, run: (d) => {
        W(d).wx.warm(0);
        W(d).wx.tagalong('shelf');
      } },
    ],
  },

  // ---- 5. Earth: the hill above the field ------------------------------------------------------
  {
    id: 'w-slip',
    scene: slipScene,
    enter: (d) => {
      d.day(0.85);
      W(d).wx.setShelf(-0.17, 0.1);
      W(d).wx.tagalong('ride');
    },
    steps: [
      { say: 'In the night, all that rain had loosened the hill above Fen’s field.' },
      { say: 'By morning, stones were creeping down it, one at a time, towards the turnips.', run: (d) => (d.pageScene.props.slide = 1) },
      { say: '“Stop,” Fen told the hill. The hill did not.' },
      { say: 'Earth is a mountain: bend one hand into a peak, knuckles on top.', beat: sign('w-earth', 'mountain', 'earth', [0.112, 0.058, 0.85], (d, byHand) => {
        d.pageScene.props.slide = 0;
        d.wx.puff(0.1, 0.1);
        d.music.rustle(1.2);
        d.st.marks.earth = byHand ? 1 : 0;
      }) },
      { say: (s) => (s.marks.earth ? 'Your small peak came down to the ground and grew, and stood there, a mountain. The stones leaned on it, and stayed.' : 'Ottilie raised a small hill of her own. It held, mostly.') },
      { say: 'Fen picked the biggest turnip and gave it to you. It was warm from the ground.', run: (d) => d.after(0.8, () => W(d).token('turnip', 0.12, 0.04)) },
      { say: (s) => (s.marks.earth ? 'The little grey cloud sat on top of your mountain, like a hat.' : 'The little grey cloud sat on top of Ottilie’s hill, like a hat.'), hold: 4, run: (d) => {
        const w = W(d);
        const top = w.made.top('earth');
        w.wx.setShelf(0.112, Number.isNaN(top) ? 0.14 : top + 0.006);
        w.wx.tagalong('shelf');
      } },
    ],
  },

  // ---- 6. All four: the fifth jar ---------------------------------------------------------------
  // no sign is asked here: each jar gives back the very shape the reader's hands made
  {
    id: 'w-four',
    scene: fourScene,
    enter: (d) => {
      d.day(1);
      W(d).wx.setShelf(0.13, 0.105);
      W(d).wx.tagSize(2.4);
      W(d).wx.tagalong('ride');
    },
    steps: [
      { say: 'In spring, Ottilie’s voice came back, a little.' },
      { say: 'She set the four jars in a row, and took a fifth down from the top shelf. It was empty, and its lid was off.' },
      { say: '“That little cloud,” she whispered. “I made it when I was your age.”', breath: 0.6 },
      { say: '“I gave it no earth to stand on, no water, no warmth. It has followed me for sixty years.”', breath: 0.8 },
      { say: 'Give it all four. Earth first, to stand on: touch the brown jar.', act: {
        id: 'jar-earth', kind: 'touch', each: 6, wait: 16,
        targets: (d) => [d.anchor('jar0')],
        onHit: (d) => {
          const w = W(d);
          openJar(d, 0);
          w.made.again('earth', -0.125, 0.06, [0.03, 0.04, 0.6]);
          w.wx.puff(-0.125, 0.09);
          d.music.shimmer();
          d.after(1.3, () => {
            const top = w.made.top('earth');
            w.wx.setShelf(0.03, Number.isNaN(top) ? 0.1 : top + 0.008);
            w.wx.tagalong('shelf');
          });
        },
      } },
      { say: 'Out of the jar came a mountain, just as hands had made it. The little cloud sat down on it.', hold: 4 },
      { say: 'Then water: the blue jar.', act: {
        id: 'jar-water', kind: 'touch', each: 6, wait: 13,
        targets: (d) => [d.anchor('jar1')],
        onHit: (d) => {
          const w = W(d);
          openJar(d, 1);
          w.made.again('water', -0.06, 0.06, [w.wx.tagX, 0.215, 0.42]);
          w.wx.tagalong('rain');
          d.music.rustle(1);
        },
      } },
      { say: 'It rained at last: about a teaspoon.', hold: 3.5 },
      { say: 'Then fire, for the light to come through: the amber jar.', act: {
        id: 'jar-fire', kind: 'touch', each: 6, wait: 13,
        targets: (d) => [d.anchor('jar2')],
        onHit: (d) => {
          const w = W(d);
          openJar(d, 2);
          w.made.again('fire', 0.005, 0.06, [0.15, 0.068, 0.5]);
          w.wx.warm(0.8, 0.15, 0.07, 0.12);
          d.pageScene.props.bowX = w.wx.tagX;
          d.pageScene.props.bow = 1;
          d.music.twist();
        },
      } },
      { say: 'And the light came through it in every colour there is.', hold: 4.5 },
      { say: 'Last, air, to carry it home: the white jar.', act: {
        id: 'jar-air', kind: 'touch', each: 6, wait: 13,
        targets: (d) => [d.anchor('jar3')],
        onHit: (d) => {
          const w = W(d);
          openJar(d, 3);
          w.made.again('air', 0.07, 0.06);
          w.wx.wind(0.5, 1);
          w.wx.tagalong('white');
          d.after(3.5, () => {
            w.wx.wind(0);
            w.made.fade('air');
          });
        },
      } },
      { say: 'It went up white, and light, and never followed anyone again.', hold: 6, breath: 0.8, run: (d) => {
        W(d).wx.warm(0);
        W(d).made.fade('fire');
      } },
      { say: 'Ottilie gave you her weathervane. “For your desk,” she said. “Tell me what it says.”', run: (d) => d.after(0.8, () => W(d).token('vane', -0.15, 0.12)) },
    ],
  },
];
