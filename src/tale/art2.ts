/**
 * Art for the full tale (pages 2-7): scenes, people, the Hollow, and the
 * ghost hands that hint each shape. Millimetres, y UP, origin at the base
 * centre, facing +x unless noted.
 */

// ---- people ------------------------------------------------------------------------

/** Old Tomas: long coat, bent back, a stick */
export const TOMAS = 'M -10 0 L 10 0 L 13 44 C 16 50 14 56 9 58 C 13 62 13 70 8 74 C 3 78 -4 77 -7 72 C -10 67 -9 61 -5 58 L -9 56 C -15 52 -16 46 -13 40 Z';
export const TOMAS_STICK = 'M 15 0 L 17 0 L 19 58 L 17 58 Z';
export const TOMAS_HAT = 'M -11 70 L 13 70 L 13 73 L 7 73 L 6 82 L -5 82 L -6 73 L -11 73 Z';
/** Granny Pell: round shawl, bun */
export const GRANNY = 'M -13 0 L 13 0 C 16 18 16 34 10 44 C 14 46 14 54 9 58 C 12 62 10 70 4 71 C 6 74 3 78 0 78 C -3 78 -6 74 -4 71 C -10 70 -12 62 -9 58 C -14 54 -14 46 -10 44 C -16 34 -16 18 -13 0 Z';
export const SPECTACLES = 'M -6 74 L 6 74 L 6 76 L -6 76 Z';

// ---- the gate (page 2) -------------------------------------------------------------

/** a stone arch with a keystone */
export const GATE = 'M -70 0 L -40 0 L -40 50 C -40 80 40 80 40 50 L 40 0 L 70 0 L 70 92 L -70 92 Z';
export const KEYSTONE = 'M -9 76 L 9 76 L 12 96 L -12 96 Z';
/** the little tower carved on the keystone */
export const KEY_TOWER = 'M -3 79 L 3 79 L 2.5 89 L 4 89 L 4 91 L -4 91 L -4 89 L -2.5 89 Z';
export const STOOL = 'M -10 0 L -8 0 L -6 14 L 6 14 L 8 0 L 10 0 L 10 18 L -10 18 Z';
export const ROAD_STONE = 'M -14 0 L 14 0 L 12 6 L -12 6 Z';
export const WALL = 'M -110 0 L 110 0 L 110 46 L 100 46 L 100 52 L 90 52 L 90 46 L 74 46 L 74 52 L 64 52 L 64 46 L -64 46 L -64 52 L -74 52 L -74 46 L -90 46 L -90 52 L -100 52 L -100 46 L -110 46 Z';

// ---- Granny Pell's cottage (page 3F) -------------------------------------------------

export const CROOKED_COTTAGE = 'M -46 0 L 44 0 L 46 50 L 54 54 L 14 92 L 10 100 L 2 100 L 4 88 L -50 56 L -44 52 Z';
export const CROOKED_ROOF = 'M -50 56 L 54 54 L 14 92 L 4 88 Z';
export const CABBAGE = 'M -8 0 L 8 0 C 14 2 14 10 9 13 C 6 17 -6 17 -9 13 C -14 10 -14 2 -8 0 Z';
export const ROCKING_CHAIR = 'M -14 0 C -6 4 6 4 14 0 L 14 2 C 10 5 6 6 4 6 L 4 14 L 10 14 L 10 16 L -6 16 L -8 38 L -11 38 L -9 16 L -10 6 C -12 5 -14 4 -14 2 Z';
export const MAP = 'M -16 0 L 16 2 L 15 24 L -15 22 Z';
export const WOODS = 'M -215 0 L 215 0 L 215 50 L 200 30 L 188 62 L 176 34 L 162 70 L 148 38 L 134 66 L 120 32 L 104 60 L 90 30 L 76 56 L 62 28 L 46 64 L 30 34 L 14 58 L 0 30 L -14 62 L -30 32 L -46 66 L -62 30 L -78 58 L -94 28 L -110 64 L -126 34 L -142 60 L -158 30 L -174 66 L -190 36 L -205 58 L -215 40 Z';

// ---- the drowned meadow (page 3O) ----------------------------------------------------

export const WILLOW = 'M -4 0 L 4 0 L 5 30 C 26 36 38 56 34 80 C 30 74 28 66 26 60 L 24 76 C 20 68 18 62 16 56 L 12 74 C 10 66 8 60 6 54 L 2 72 C 0 64 -2 58 -4 52 L -8 70 C -10 62 -12 56 -14 50 L -20 70 C -22 60 -24 54 -26 48 C -34 56 -34 36 -5 30 Z';
export const FENCE_TOPS = 'M -60 0 L 60 0 L 60 3 L 56 3 L 56 8 L 54 10 L 52 8 L 52 3 L 30 3 L 30 8 L 28 10 L 26 8 L 26 3 L 4 3 L 4 8 L 2 10 L 0 8 L 0 3 L -22 3 L -22 8 L -24 10 L -26 8 L -26 3 L -48 3 L -48 8 L -50 10 L -52 8 L -52 3 L -60 3 Z';
export const TREETOPS = 'M -215 0 L 215 0 L 215 26 C 200 44 182 30 170 46 C 158 60 140 40 128 52 C 112 66 96 40 80 50 C 64 62 50 38 36 50 C 22 62 6 38 -8 50 C -24 64 -40 40 -56 50 C -72 62 -86 40 -102 50 C -118 62 -134 40 -150 52 C -166 64 -184 38 -200 48 C -206 52 -212 46 -215 40 Z';

// ---- the river (page 4) ----------------------------------------------------------------

export const REEDS = 'M -20 0 L 20 0 L 18 4 L 16 30 L 15 4 L 12 4 L 9 42 L 8 4 L 4 4 L 1 36 L 0 4 L -3 4 L -7 46 L -8 4 L -11 4 L -14 28 L -15 4 L -18 4 Z';
export const STEP_STONE = 'M -12 0 L 12 0 C 14 3 12 7 8 8 L -8 8 C -12 7 -14 3 -12 0 Z';
export const FAR_BANK = 'M -215 0 L 215 0 L 215 40 C 160 52 120 38 80 46 C 40 56 10 70 -20 64 C -60 56 -100 44 -150 50 C -180 54 -200 46 -215 44 Z';

// ---- the hill (pages 5-6) ----------------------------------------------------------------

export const BIG_HILL = 'M -215 0 L 215 0 C 180 10 150 30 110 60 C 80 82 50 104 0 108 C -50 104 -80 82 -110 60 C -150 30 -180 10 -215 0 Z';
export const STANDING_STONE = 'M -5 0 L 5 0 L 6 18 C 5 22 -5 22 -6 18 Z';
export const HILL_STEPS = 'M -8 0 L 8 0 L 8 3 L -8 3 Z';
/** the little village at the foot of the hill (page 6): a row of roofs */
export const VILLAGE_ROW = 'M -200 0 L 200 0 L 200 16 L 190 26 L 180 16 L 166 16 L 166 28 L 156 36 L 146 28 L 146 16 L 120 16 L 120 24 L 110 32 L 100 24 L 100 16 L 70 16 L 70 30 L 58 40 L 46 30 L 46 16 L 20 16 L 20 22 L 10 30 L 0 22 L 0 16 L -24 16 L -24 28 L -34 36 L -44 28 L -44 16 L -70 16 L -70 24 L -80 32 L -90 24 L -90 16 L -116 16 L -116 30 L -126 38 L -136 30 L -136 16 L -160 16 L -160 24 L -170 32 L -180 24 L -180 16 L -200 16 Z';

// ---- the epilogue room (page 7) -------------------------------------------------------

export const ROOM = 'M -40 0 L 40 0 L 40 52 L 46 52 L 0 84 L -46 52 L -40 52 Z';
export const ROOM_DOOR = 'M -12 0 L 6 0 L 6 30 L -12 30 Z';

// ---- the Hollow: the shadow of a tower that is not there ---------------------------------

/** the tower shape (on the screen), with an arched window cut by a separate light shape */
export const HOLLOW = 'M -30 0 L 30 0 L 26 120 L 32 120 L 32 132 L 22 132 L 22 140 L 12 140 L 12 132 L 4 132 L 4 140 L -4 140 L -4 132 L -12 132 L -12 140 L -22 140 L -22 132 L -32 132 L -32 120 L -26 120 Z';
export const HOLLOW_WINDOW = 'M -6 92 L 6 92 L 6 104 C 6 110 -6 110 -6 104 Z';
/** the paper moon disc */
export const FULL_MOON = 'M 0 -30 C 17 -30 30 -17 30 0 C 30 17 17 30 0 30 C -17 30 -30 17 -30 0 C -30 -17 -17 -30 0 -30 Z';

// ---- ghost hands: one per shape (front view, wrist at the origin) -------------------------

export const HANDS: Record<string, string> = {
  peace: 'M -14 0 L 14 0 L 17 38 C 22 42 22 50 16 52 L 12 52 L 10 94 C 10 100 3 100 3 94 L 4 56 L -2 56 L -10 92 C -11 98 -18 97 -17 91 L -12 54 C -20 52 -24 44 -18 40 L -16 30 Z',
  rock: 'M -14 0 L 14 0 L 17 38 L 22 40 L 24 74 C 24 80 17 80 17 74 L 15 52 L 6 54 L -2 54 L -10 52 L -11 88 C -11 94 -18 94 -18 88 L -17 50 C -22 46 -24 40 -18 36 L -16 28 Z',
  ok: 'M -14 0 L 14 0 L 17 40 L 19 86 C 19 92 12 92 12 86 L 10 56 L 9 92 C 9 98 2 98 2 92 L 2 56 L -1 58 C -6 72 -22 70 -24 58 C -26 48 -20 40 -14 38 Z',
  call: 'M -14 0 L 14 0 L 18 36 L 30 60 C 33 65 27 69 24 64 L 12 48 L 8 52 L -6 52 L -12 48 L -32 34 C -37 31 -34 25 -29 27 L -16 30 Z',
  point: 'M -14 0 L 14 0 L 17 40 C 21 44 20 52 14 54 L 4 56 L 3 94 C 3 100 -4 100 -4 94 L -6 54 C -14 52 -22 46 -18 38 L -16 30 Z',
  thumbsUp: 'M -16 0 L 16 0 L 18 44 C 18 52 10 54 4 52 L 2 80 C 2 86 -6 86 -6 80 L -8 52 C -16 50 -20 44 -18 36 Z',
  open: 'M -16 0 L 16 0 L 20 40 L 34 62 C 37 67 31 70 28 66 L 18 52 L 18 88 C 18 94 11 94 11 88 L 9 56 L 7 98 C 7 104 0 104 0 98 L -1 56 L -4 94 C -4 100 -11 100 -11 94 L -10 54 L -14 82 C -15 88 -22 87 -21 81 L -18 40 Z',
};

// ---- new cast shapes -------------------------------------------------------------------

/** the little boat (call: thumb and little finger up = prow and stern) */
export const BOAT_SHADOW = 'M -40 10 L -2 10 L -2 52 L 22 22 L 2 22 L 2 10 L 40 10 L 34 0 L -34 0 Z';
export const BOAT = 'M -40 12 C -30 0 30 0 40 12 L 34 14 C 20 8 -20 8 -34 14 Z';
export const BOAT_SAIL = 'M -1 12 L 1 12 L 1 48 L 22 18 L 1 18 Z';
/** the tower the reader makes (thumbs up) */
export const TOWER = 'M -14 0 L 14 0 L 10 70 L 14 70 L 14 76 L 8 76 L 8 82 L 4 82 L 4 78 L -4 78 L -4 82 L -8 82 L -8 76 L -14 76 L -14 70 L -10 70 Z';
export const TOWER_WINDOW = 'M -3 58 L 3 58 L 3 66 C 3 69 -3 69 -3 66 Z';

// ---- the kirigami Hollow: three laminated card sheets with torn crowns, a window cut through,
// and seven villagers cut out of its body (light shows through until they come home)
// front sheet A (ink), mid sheet B (a shade warmer), back sheet C (the warm paper rim)
export const HOLLOW_A = 'M -32 0 L 32 0 L 27 118 L 29 124 L 24 129 L 26 137 L 19 133 L 15 142 L 10 136 L 4 146 L -1 138 L -6 143 L -11 135 L -16 140 L -20 131 L -26 134 L -25 125 L -29 120 L -27 118 Z';
export const HOLLOW_B = 'M -33 0 L 33 0 L 28.5 120 L 31 127 L 25 133 L 22 141 L 16 137 L 12 147 L 6 140 L 0 149 L -5 141 L -12 146 L -15 137 L -22 142 L -24 132 L -30 128 L -28.5 120 Z';
export const HOLLOW_C = 'M -34 0 L 34 0 L 30 121 L 33 130 L 27 136 L 24 145 L 17 140 L 14 150 L 7 143 L 2 152 L -4 146 L -9 151 L -14 141 L -20 146 L -25 137 L -31 133 L -30 121 Z';
export const HOLLOW_EYE = 'M -10 100 L 10 100 L 10 112 C 10 126 -10 126 -10 112 Z';
export const HOLLOW_EYE_RING = 'M -12.5 97.5 L 12.5 97.5 L 12.5 112 C 12.5 129 -12.5 129 -12.5 112 Z';
export const HOLLOW_PEG = 'M 27.5 98 L 36 99 L 36 101.5 L 27.3 101 Z';
export const CUT_HATMAN = 'M -5 0 L 5 0 L 7 15 C 8 18 6 19 4 19.5 C 6 21 6 23 4.5 23.5 L 8 23.5 L 8 24.5 L 4 24.5 L 3.5 27 L -3.5 27 L -4 24.5 L -8 24.5 L -8 23.5 L -4.5 23.5 C -6 23 -6 21 -4 19.5 C -6 19 -8 18 -7 15 Z';
export const CUT_BASKET = 'M -8 0 L 8 0 L 5.5 8 L 7 8 L 7 4 L 13 4 L 14 9 L 8 9 L 4.5 13 C 6 16 5 18 3 18.5 C 5 20 5 23 2.5 24 C 0 25 -3 24 -3.5 22 C -4.5 20 -3.5 19 -2.5 18.5 C -5 18 -6 16 -4 14 Z';
export const CUT_SHOULDERS = 'M -5 0 L 5 0 L 6.5 15 C 7 18 5 19 3.5 19.5 C 5 21 5 23.5 2.5 24 L 5 25 L 4 30 C 4.5 33 1 34.5 -0.5 33 C -2 32 -2 30.5 -1 29.5 L -4 25 L -2.5 24 C -5 23.5 -5 21 -3.5 19.5 C -5 19 -7 18 -6.5 15 Z';
export const CUT_PIPE = 'M -5 0 L 5 0 L 6.5 14 C 7 17 5 18 3.5 18.5 C 5 19.2 5.4 19.8 5.4 20.2 L 9 19.6 L 9 21.6 L 10.6 21.6 L 10.6 18.6 L 8.6 18.6 L 8.6 19 L 5.3 19.3 C 5.6 21.5 5 23.2 3 24 C 0 25 -3 24 -4 22 C -5 20 -4 19 -3 18.5 C -5 18 -7 17 -6.5 14 Z';
export const CUT_DOG = 'M -8 0 L -6.5 0 L -6 4 L 4 4 L 4.5 0 L 6 0 L 6 6 L 8 8 L 9 7 L 9.5 9 L 7.5 11 L 5 10 L 4.5 7.5 L -6 7.5 L -9 10 L -8.5 6.5 Z';
