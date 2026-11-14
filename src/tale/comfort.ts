/**
 * The reader's settings, kept between readings (localStorage, every access guarded:
 * a private window simply plays with the defaults).
 */
export interface Comfort {
  v: 1;
  /** 0..1 sliders; 0.8 is the designed level */
  volume: { all: number; music: number; sounds: number };
  /** caption size: 1, 1.25, 1.5 */
  text: number;
  captions: 'paper' | 'strong';
  pace: 'usual' | 'slow';
  /** extra distance of the book from the reader (m), and height (m) */
  bookPush: number;
  bookLift: number;
  /** mixed reality: 'auto' = your room goes dark as you put the sun to bed, and comes back at the close */
  room: 'auto' | 'shown' | 'dim' | 'hidden';
  /** the reader chose the room setting themselves (a stored default is not a choice) */
  roomSet?: boolean;
  /** the frame-rate readout (for testing on the headset) */
  fps?: 'off' | 'on' | 'report';
}

const KEY = 'borrowedShade.comfort.v3';
/** v1 sliders could be moved by a passing finger: their volumes are not trusted */
const OLD = 'borrowedShade.comfort.v2';

export const DEFAULT_COMFORT: Comfort = {
  v: 1,
  volume: { all: 0.8, music: 0.8, sounds: 0.1 },
  text: 1,
  captions: 'paper',
  pace: 'usual',
  bookPush: 0.22,
  bookLift: 0,
  room: 'auto',
};

const clamp = (v: unknown, lo: number, hi: number, d: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d);
const pick = <T extends string>(v: unknown, ok: readonly T[], d: T): T => (ok.includes(v as T) ? (v as T) : d);

export function loadComfort(): Comfort {
  let raw: Partial<Comfort> = {};
  let fromOld = false;
  try {
    const s = localStorage.getItem(KEY);
    fromOld = s === null;
    raw = JSON.parse(s ?? localStorage.getItem(OLD) ?? '{}') as Partial<Comfort>;
  } catch {
    raw = {};
  }
  if (typeof raw !== 'object' || raw === null) raw = {};
  const d = DEFAULT_COMFORT;
  const vol = (fromOld ? {} : raw.volume ?? {}) as Partial<Comfort['volume']>;
  // a reading never starts nearly silent: if All × Music or All × Sounds is under −12 dB, that slider goes back to 0.8
  const all = Math.max(0.4, clamp(vol.all, 0, 1, d.volume.all));
  const floor = (v: number, dv: number) => (volumeGain(all) * volumeGain(v) < 0.25 ? dv : v);
  const music = floor(clamp(vol.music, 0, 1, d.volume.music), d.volume.music);
  // the sounds bed is quiet by design (1 on the slider): never floored up to the music's level
  // (a slider still sitting on the old default of 2.5 was never chosen: it takes the new one)
  const kept = clamp(vol.sounds, 0, 1, d.volume.sounds);
  const sounds = Math.abs(kept - 0.25) < 0.001 ? d.volume.sounds : kept;
  return {
    v: 1,
    // a reading never starts nearly silent (a quiet start can't be told from a broken one)
    volume: { all, music, sounds },
    text: clamp(raw.text, 1, 1.5, d.text),
    captions: pick(raw.captions, ['paper', 'strong'] as const, d.captions),
    pace: pick(raw.pace, ['usual', 'slow'] as const, d.pace),
    bookPush: fromOld ? d.bookPush : clamp(raw.bookPush, 0, 0.35, d.bookPush),
    bookLift: fromOld ? d.bookLift : clamp(raw.bookLift, -0.08, 0.16, d.bookLift),
    // older saves stored 'shown' as a default, not a choice: only a reader's own choice is kept
    room: raw.roomSet ? pick(raw.room, ['auto', 'shown', 'dim', 'hidden'] as const, d.room) : d.room,
    roomSet: !!raw.roomSet,
    fps: pick(raw.fps, ['off', 'on', 'report'] as const, 'off'),
  };
}

export function saveComfort(c: Comfort): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(c));
  } catch {
    /* private window: settings last this reading only */
  }
}

/** slider value -> gain (perceptual; 0.8 = unity) */
export const volumeGain = (v: number) => Math.pow(v / 0.8, 2);
