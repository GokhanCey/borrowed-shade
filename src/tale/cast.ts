/**
 * The cast: for every character, the hand shape that casts it, the outline it
 * leaves on the screen (the "gap" the tale asks you to fill), the paper puppet
 * it folds into, and its part in the music. Outlines in millimetres, y UP,
 * origin at the base centre, facing +x.
 */
import { RABBIT, RABBIT_SHADOW } from './art.js';
import { BOAT, BOAT_SHADOW, HANDS, TOWER } from './art2.js';

export type Pose = 'peace' | 'rock' | 'ok' | 'point' | 'call' | 'open' | 'thumbsUp';

export interface CharDef {
  id: string;
  /** the paper puppet it folds into */
  paper: string;
  color: string;
  /** puppet scale on the stage (before big/small) */
  scale: number;
  /** small ink details on the puppet (eyes) */
  details?: string[];
  /** a soft glow on the puppet */
  glow?: string;
  /** does it hop (true) or glide/stand */
  hops?: boolean;
  /** the music part (music.ts PARTS) */
  part: string;
}

const FOX_SHADOW = 'M -20 0 C -26 10 -24 26 -14 32 L -18 64 L -4 40 L 6 40 L 14 66 L 16 36 C 24 32 30 26 44 22 C 48 20 48 14 42 12 C 30 8 20 6 10 2 C 2 -1 -10 -2 -20 0 Z';
const OWL_SHADOW = 'M -24 0 C -32 18 -30 40 -22 52 L -26 72 L -12 58 C -4 62 4 62 12 58 L 26 72 L 22 52 C 30 40 32 18 24 0 C 12 -6 -12 -6 -24 0 Z';
export const HERON_SHADOW = 'M -8 0 L 4 0 C 6 18 4 34 10 48 C 14 56 22 60 28 58 L 64 54 L 28 50 C 24 48 22 44 20 40 C 14 28 12 14 10 0 Z';
const SNAIL = 'M -32 0 L 34 0 C 40 0 42 6 38 10 L 36 12 L 46 34 L 41 35 L 32 15 L 30 16 L 34 37 L 29 37 L 26 17 C 20 19 14 20 10 20 C 14 34 4 48 -10 46 C -26 44 -34 30 -30 16 C -28 8 -33 4 -32 0 Z';
const TOWER_SHADOW = 'M -16 0 L 16 0 L 10 70 L 14 70 L 14 76 L 8 76 L 8 90 C 8 96 -8 96 -8 90 L -8 76 L -14 76 L -14 70 L -10 70 Z';
export const BIRD = 'M -62 34 C -42 38 -22 28 -8 12 L 0 2 L 8 12 C 22 28 42 38 62 34 C 46 50 26 54 10 34 L 5 48 L -5 48 L -10 34 C -26 54 -46 50 -62 34 Z';

const FOX_PAPER = 'M -26 0 C -42 6 -44 28 -30 31 C -24 32 -18 26 -16 20 C -14 30 -8 38 2 40 L 2 60 L 8 48 L 12 60 L 14 46 C 20 46 28 44 37 40 L 34 37 C 26 36 20 34 16 30 C 18 20 16 8 12 0 Z';
const OWL_PAPER = 'M -16 0 L 16 0 C 22 14 22 30 18 40 L 20 54 L 12 46 C 4 50 -4 50 -12 46 L -20 54 L -18 40 C -22 30 -22 14 -16 0 Z';
const HERON_PAPER = 'M -1 0 L 1 0 L 2 22 C 12 22 18 28 17 36 C 16 42 11 45 9 51 C 7 59 10 65 16 66 L 40 63 L 16 61 C 13 59 13 55 15 51 C 19 43 15 39 7 39 C -9 41 -22 34 -27 29 C -17 27 -7 25 -1 23 Z';

export const circle = (x: number, y: number, r = 2) =>
  `M ${x} ${y - r} C ${x + r * 0.55} ${y - r} ${x + r} ${y - r * 0.55} ${x + r} ${y} C ${x + r} ${y + r * 0.55} ${x + r * 0.55} ${y + r} ${x} ${y + r} C ${x - r * 0.55} ${y + r} ${x - r} ${y + r * 0.55} ${x - r} ${y} C ${x - r} ${y - r * 0.55} ${x - r * 0.55} ${y - r} ${x} ${y - r} Z`;

export const CAST: Record<string, CharDef> = {
  rabbit: { id: 'rabbit', paper: RABBIT, color: '#fbf3e2', scale: 1.2, details: [circle(16, 40, 2)], glow: '#ffd9a0', hops: true, part: 'rabbit' },
  fox: { id: 'fox', paper: FOX_PAPER, color: '#e08a4a', scale: 1.0, details: [circle(22, 41, 1.8)], hops: true, part: 'fox' },
  owl: { id: 'owl', paper: OWL_PAPER, color: '#b79a76', scale: 1.05, details: [circle(-7, 32, 4.5), circle(7, 32, 4.5)], part: 'owl' },
  snail: { id: 'snail', paper: SNAIL, color: '#d9b98c', scale: 0.75, details: [circle(40, 31, 1.6)], part: 'snail' },
  boat: { id: 'boat', paper: BOAT, color: '#b98f62', scale: 1.15, part: 'boat' },
  heron: { id: 'heron', paper: HERON_PAPER, color: '#c9d3dc', scale: 1.3, details: [circle(14, 61, 1.4)], part: 'heron' },
  tower: { id: 'tower', paper: TOWER, color: '#d8cdb8', scale: 1.5, glow: '#ffc46b', part: 'tower' },
  /** the climax choice: wings for the Hollow (it becomes a night bird on the screen) */
  wings: { id: 'wings', paper: BIRD, color: '#3b3f6b', scale: 1.2, part: 'hollow' },
  /** the lesson's handprint (an open hand); it folds into a paper moth */
  mark: { id: 'mark', paper: BIRD, color: '#f1e2c4', scale: 0.55, part: 'mark' },
  /** the climax choice: a tower for keeps (the paper tower stays and is lit) */
  keep: { id: 'keep', paper: TOWER, color: '#d8cdb8', scale: 1.5, glow: '#ffc46b', part: 'hollow' },
};


