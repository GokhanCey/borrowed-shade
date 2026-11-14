import type { TaleState } from './story.js';

/**
 * THE BOOKMARK: where a reading of the tale was left, kept on the headset. Saved at every spread
 * of the tale; cleared at the end, or when the reader starts from the beginning. With it, closing
 * the browser mid-tale costs nothing: the spine on the shelf shows a red ribbon, and opening the
 * book offers "Go on from <spread>" or "From the beginning".
 *
 * The page 1 hand (the shadow that put out the sun, replayed at "Yours.") is kept too, packed to
 * one bit per cell, so a resumed reading still replays the reader's own hand.
 */
export interface Bookmark {
  v: 1;
  pageIdx: number;
  pageId: string;
  st: TaleState;
  /** the page 1 hand, bit-packed, base64 (null if it was never captured) */
  echo: string | null;
  savedAt: number;
}

export type BookId = 'tale' | 'weather';
const KEYS: Record<BookId, string> = { tale: 'borrowedShade.bookmark.v1', weather: 'borrowedShade.bookmark.weather.v1' };

/** the names of the spreads, as the bookmark card says them */
export const PAGE_TITLES: Record<string, string> = {
  village: 'the village at dusk',
  gate: 'the gate',
  cottage: 'Granny Pell’s cottage',
  meadow: 'the drowned meadow',
  common: 'the windy common',
  river: 'the river',
  stair: 'the stair',
  hollow: 'the Hollow',
  tower: 'the tower',
  lending: 'the lending',
  home: 'the way home',
  epilogue: 'the morning after',
  'w-mill': 'the mill',
  'w-field': 'Fen’s field',
  'w-bakery': 'the bakery',
  'w-slip': 'the hill above the field',
  'w-four': 'the fifth jar',
};

export function saveBookmark(book: BookId, pageIdx: number, pageId: string, st: TaleState, echo: Uint8Array | null): void {
  const b: Bookmark = { v: 1, pageIdx, pageId, st, echo: echo ? pack(echo) : null, savedAt: Date.now() };
  try {
    localStorage.setItem(KEYS[book], JSON.stringify(b));
  } catch {
    /* private window or full storage: no bookmark */
  }
}

/** a bookmark only if it has the whole shape a reading needs (another build's, or a damaged one, is no bookmark) */
export function loadBookmark(book: BookId = 'tale'): Bookmark | null {
  try {
    const raw = localStorage.getItem(KEYS[book]);
    if (!raw) return null;
    const b = JSON.parse(raw) as Bookmark;
    const s = b?.st as TaleState | undefined;
    const ok = !!b && b.v === 1 && typeof b.pageId === 'string' && Number.isInteger(b.pageIdx) && b.pageIdx > 0 && !!s
      && typeof s.marks === 'object' && !!s.marks && typeof s.size === 'object' && !!s.size
      && Array.isArray(s.made) && Array.isArray(s.kept) && Array.isArray(s.lost)
      && (b.echo === null || typeof b.echo === 'string');
    return ok ? b : null;
  } catch {
    return null;
  }
}

export function clearBookmark(book: BookId = 'tale'): void {
  try {
    localStorage.removeItem(KEYS[book]);
  } catch {
    /* nothing to clear */
  }
}

/** a 0/1 grid to base64, one bit per cell (the 173 x 94 grid is about 2 KB) */
export function pack(mask: Uint8Array): string {
  const bytes = new Uint8Array(4 + Math.ceil(mask.length / 8));
  new DataView(bytes.buffer).setUint32(0, mask.length);
  for (let i = 0; i < mask.length; i++) if (mask[i]) bytes[4 + (i >> 3)] |= 1 << (i & 7);
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

/** the grid back from base64; null if it is not exactly a grid of `cells` (another grid size, or damage) */
export function unpack(data: string, cells: number): Uint8Array | null {
  try {
    const s = atob(data);
    if (s.length !== 4 + Math.ceil(cells / 8)) return null;
    const bytes = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) bytes[i] = s.charCodeAt(i);
    if (new DataView(bytes.buffer).getUint32(0) !== cells) return null;
    const mask = new Uint8Array(cells);
    for (let i = 0; i < cells; i++) mask[i] = (bytes[4 + (i >> 3)] >> (i & 7)) & 1;
    return mask;
  } catch {
    return null;
  }
}
