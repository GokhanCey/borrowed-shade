/**
 * Sound descriptions for the audio engine. A sound is either a file in
 * public/audio/ (an optimised mono .ogg) or a procedural placeholder
 * generated live (src/audio/procedural.ts).
 */
export type ProceduralId =
  | 'rumble' | 'steamHiss' | 'airy' | 'lavaBubble' | 'mudSquelch' | 'rain' | 'storm' | 'stone' | 'embers'
  | 'sandHiss' | 'sunDrone' | 'nightAmbience';

export interface SoundSpec {
  /** path under public/audio/, e.g. 'forest/campfire.ogg' */
  file?: string;
  procedural?: ProceduralId;
  /** loudness trim, 1 = as normalised */
  volume?: number;
  /** playback rate */
  rate?: number;
  /** gentle high-shelf boost */
  bright?: boolean;
}

/** URL of an optimised sound in public/audio/ (any extension maps to .ogg). */
export function optimizedUrl(file: string): string {
  return `${import.meta.env.BASE_URL}audio/${file.replace(/\.[a-z0-9]+$/i, '')}.ogg`;
}
