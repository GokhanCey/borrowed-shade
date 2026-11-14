/**
 * Hand-drawn outlines for the first tale (millimetres, y UP, origin at the
 * base centre of each piece). Kept as data so the art can be tuned without
 * touching code.
 */

export const HOUSE_COTTAGE = 'M -40 0 L 40 0 L 40 52 L 48 52 L 30 68 L 30 100 L 20 100 L 20 77 L 0 95 L -48 52 L -40 52 Z';
export const HOUSE_TALL = 'M -30 0 L 30 0 L 30 78 L 37 78 L 0 126 L -37 78 L -30 78 Z';
export const HOUSE_WIDE = 'M -55 0 L 55 0 L 55 38 L 61 38 L 20 72 L -20 72 L -61 38 L -55 38 Z';
export const HOUSE_TOWER = 'M -22 0 L 22 0 L 22 90 L 26 90 L 26 96 L 14 96 L 0 136 L -14 96 L -26 96 L -26 90 L -22 90 Z';

/** windows/doors per house, as [x0,y0,x1,y1] rectangles (warm lit glass) */
export const WINDOWS: Record<string, number[][]> = {
  cottage: [[-30, 22, -14, 38], [12, 22, 28, 38], [-6, 0, 7, 26]],
  tall: [[-19, 52, -7, 66], [7, 52, 19, 66], [-19, 24, -7, 38], [-1, 92, 6, 104]],
  wide: [[-44, 16, -30, 30], [-14, 0, 0, 24], [16, 16, 30, 30], [36, 16, 48, 30]],
  tower: [[-6, 104, 6, 118], [-9, 58, 9, 76], [-8, 20, 8, 40]],
};

/** roof overlays (flat, laid on the facade) */
export const ROOFS: Record<string, string> = {
  cottage: 'M -48 52 L 48 52 L 0 95 Z',
  tall: 'M -37 78 L 37 78 L 0 126 Z',
  wide: 'M -61 38 L 61 38 L 20 72 L -20 72 Z',
  tower: 'M -14 96 L 14 96 L 0 136 Z',
};

export const PINE = 'M -4 0 L 4 0 L 4 12 L 24 12 L 10 30 L 20 30 L 7 48 L 15 48 L 0 76 L -15 48 L -7 48 L -20 30 L -10 30 L -24 12 L -4 12 Z';
export const OAK = 'M -4 0 L 4 0 L 5 20 C 30 18 36 48 20 58 C 24 82 -4 94 -18 76 C -40 72 -36 30 -5 20 Z';

/** distant hills: a long low backdrop */
export const HILLS = 'M -215 0 L 215 0 L 215 44 C 170 74 120 52 70 70 C 30 86 0 104 -40 90 C -90 70 -130 88 -170 70 C -195 60 -205 66 -215 62 Z';
/** the near hill where the lost shadows will gather (page 3) */
export const HILL_NEAR = 'M -215 0 L 215 0 L 215 22 C 150 36 80 26 20 34 C -50 44 -120 30 -215 26 Z';

export const LAMP_POST = 'M -1.5 0 L 1.5 0 L 1.5 64 L 8 64 L 8 66 L -8 66 L -8 64 L -1.5 64 Z';

/** an adult villager (coat + head) */
export const VILLAGER = 'M -9 0 L 9 0 L 12 40 C 14 48 10 52 6 54 C 10 58 11 66 6 70 C 2 74 -4 74 -7 70 C -11 66 -10 58 -6 54 C -10 52 -14 48 -12 40 Z';
/** a villager with a hat and a stick */
export const VILLAGER_HAT = 'M -9 0 L 9 0 L 12 40 C 14 48 10 52 6 54 C 10 58 11 64 8 68 L 13 69 L 13 71 L 6 71 L 5 78 L -6 78 L -7 71 L -14 71 L -14 69 L -9 68 C -11 64 -10 58 -6 54 C -10 52 -14 48 -12 40 Z';

/** Ama: a small girl with a braid */
export const AMA_BODY = 'M -7 0 L 7 0 L 10 26 C 11 32 8 35 5 36 L -5 36 C -8 35 -11 32 -10 26 Z';
export const AMA_HEAD = 'M 0 -1 C 6 -1 8 4 8 8 C 8 13 4 16 0 16 C -4 16 -8 13 -8 8 C -8 4 -6 -1 0 -1 Z';
export const AMA_BRAID = 'M 5 9 C 10 8 12 3 10 -2 C 12 -4 11 -7 9 -6 C 7 -3 7 1 5 4 Z';
/** a cap of hair (chestnut), drawn in front of the head so it reads as hair, not a mark */
export const AMA_HAIR = 'M -8 9 C -8 14 -4 17 0 17 C 4 17 8 14 8 9 C 6 11 3 12 0 11 C -3 12 -6 11 -8 9 Z';

/** the target on the screen: the classic hand-shadow rabbit head */
export const RABBIT_SHADOW = 'M -18 0 C -26 10 -24 27 -11 33 L -14 72 C -14 80 -5 80 -4 72 L 0 37 L 7 70 C 9 78 17 76 15 68 L 7 35 C 18 33 26 24 24 13 C 22 3 12 -1 0 0 Z';

/** the paper rabbit that folds out of the shadow (sitting, facing +x) */
/** Ama's own rabbit: one ear up, one ear folded down to the side */
export const RABBIT_BENT = 'M -24 6 C -31 8 -31 17 -24 19 C -26 30 -13 38 0 36 C 2 40 2 44 4 46 L 2 68 C 1 75 6 76 7 70 L 9 50 L 12 52 L 24 58 C 30 60 32 54 27 51 L 14 47 C 22 46 27 40 24 34 C 22 30 18 28 14 28 C 18 22 18 12 14 6 L 16 0 L -18 0 C -22 0 -24 2 -24 6 Z';
export const RABBIT = 'M -24 6 C -31 8 -31 17 -24 19 C -26 30 -13 38 0 36 C 2 40 2 44 4 46 L 2 68 C 1 75 6 76 7 70 L 9 50 L 12 71 C 13 77 18 76 17 70 L 14 48 C 22 46 27 40 24 34 C 22 30 18 28 14 28 C 18 22 18 12 14 6 L 16 0 L -18 0 C -22 0 -24 2 -24 6 Z';

/** the ghost hand hint: a hand making the peace sign (front view, wrist at the origin) */
export const HAND_PEACE = 'M -14 0 L 14 0 L 17 38 C 22 42 22 50 16 52 L 12 52 L 10 94 C 10 100 3 100 3 94 L 4 56 L -2 56 L -10 92 C -11 98 -18 97 -17 91 L -12 54 C -20 52 -24 44 -18 40 L -16 30 Z';

/** a tear drop */
export const TEAR = 'M 0 0 C 2 0 3 2 3 3 C 3 5 1 7 0 9 C -1 7 -3 5 -3 3 C -3 2 -2 0 0 0 Z';

/** small decorative pieces */
export const MOON = 'M 0 -14 C 8 -14 14 -8 14 0 C 14 8 8 14 0 14 C 6 9 7 -9 0 -14 Z';
export const STAR = 'M 0 -4 L 1 -1 L 4 0 L 1 1 L 0 4 L -1 1 L -4 0 L -1 -1 Z';
export const FENCE = 'M -40 0 L 40 0 L 40 4 L 36 4 L 36 14 L 34 17 L 32 14 L 32 4 L 22 4 L 22 14 L 20 17 L 18 14 L 18 4 L 8 4 L 8 14 L 6 17 L 4 14 L 4 4 L -4 4 L -4 14 L -6 17 L -8 14 L -8 4 L -18 4 L -18 14 L -20 17 L -22 14 L -22 4 L -32 4 L -32 14 L -34 17 L -36 14 L -36 4 L -40 4 Z';

/** Palette: dusk indigo, lantern amber, warm cream paper. */
export const PAL = {
  cream: '#efe3c8',
  creamWarm: '#f3dcae',
  rose: '#d9a38c',
  sage: '#9fae8f',
  slate: '#6d7391',
  indigo: '#2d2b52',
  night: '#1a1833',
  hill: '#3b3b66',
  hillNear: '#4a4774',
  roofA: '#8e4f45',
  roofB: '#5b5f86',
  glass: '#ffc46b',
  ink: '#1b1424',
  gold: '#d7a24a',
  cover: '#24264a',
};
