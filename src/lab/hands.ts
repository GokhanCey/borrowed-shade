import { Vector3, type Object3D } from '@iwsdk/core';

/**
 * Reading tracked hands for the Hand Lab: joint positions (from IWSDK's hand
 * model bones, which follow the WebXR joint poses), finger straightness, a
 * simple pose classifier, pinch point, palm normal.
 */
export type Side = 'left' | 'right';
export const FINGERS = ['thumb', 'index', 'middle', 'ring', 'pinky'] as const;
export type Finger = (typeof FINGERS)[number];

const CHAIN: Record<Finger, string[]> = {
  thumb: ['thumb-metacarpal', 'thumb-phalanx-proximal', 'thumb-phalanx-distal', 'thumb-tip'],
  index: ['index-finger-metacarpal', 'index-finger-phalanx-proximal', 'index-finger-phalanx-intermediate', 'index-finger-phalanx-distal', 'index-finger-tip'],
  middle: ['middle-finger-metacarpal', 'middle-finger-phalanx-proximal', 'middle-finger-phalanx-intermediate', 'middle-finger-phalanx-distal', 'middle-finger-tip'],
  ring: ['ring-finger-metacarpal', 'ring-finger-phalanx-proximal', 'ring-finger-phalanx-intermediate', 'ring-finger-phalanx-distal', 'ring-finger-tip'],
  pinky: ['pinky-finger-metacarpal', 'pinky-finger-phalanx-proximal', 'pinky-finger-phalanx-intermediate', 'pinky-finger-phalanx-distal', 'pinky-finger-tip'],
};

export interface HandReading {
  side: Side;
  tracked: boolean;
  wrist: Vector3;
  indexTip: Vector3;
  thumbTip: Vector3;
  middleTip: Vector3;
  pinchPoint: Vector3;
  /** distance thumb tip <-> index tip (m) */
  pinchGap: number;
  /** 0 (curled) .. 1 (straight) per finger */
  straight: Record<Finger, number>;
  extended: Record<Finger, boolean>;
  /** unit vector out of the palm */
  palmNormal: Vector3;
}

export class HandReader {
  private bones = new Map<string, Object3D>();
  private model?: Object3D;
  private tmp = new Vector3();
  private a = new Vector3();
  private b = new Vector3();

  constructor(readonly side: Side) {}

  /** Bind to the current hand model (it can be swapped by IWSDK). */
  private bind(model: Object3D | undefined): boolean {
    if (!model) return false;
    if (model !== this.model) {
      this.model = model;
      this.bones.clear();
      model.traverse((o) => {
        if (o.name) this.bones.set(o.name, o);
      });
    }
    return this.bones.has('wrist') && this.bones.has('index-finger-tip');
  }

  private pos(name: string, out: Vector3): Vector3 {
    const o = this.bones.get(name);
    return o ? o.getWorldPosition(out) : out.set(0, 0, 0);
  }

  read(model: Object3D | undefined, tracked: boolean, out: HandReading | undefined): HandReading | undefined {
    if (!this.bind(model)) return undefined;
    const r: HandReading = out ?? {
      side: this.side,
      tracked: false,
      wrist: new Vector3(),
      indexTip: new Vector3(),
      thumbTip: new Vector3(),
      middleTip: new Vector3(),
      pinchPoint: new Vector3(),
      pinchGap: 1,
      straight: { thumb: 0, index: 0, middle: 0, ring: 0, pinky: 0 },
      extended: { thumb: false, index: false, middle: false, ring: false, pinky: false },
      palmNormal: new Vector3(),
    };
    r.tracked = tracked;
    this.pos('wrist', r.wrist);
    this.pos('index-finger-tip', r.indexTip);
    this.pos('thumb-tip', r.thumbTip);
    this.pos('middle-finger-tip', r.middleTip);
    r.pinchPoint.copy(r.indexTip).add(r.thumbTip).multiplyScalar(0.5);
    r.pinchGap = r.indexTip.distanceTo(r.thumbTip);

    for (const f of FINGERS) {
      // straightness: straight-line length / summed segment length
      const chain = CHAIN[f];
      let path = 0;
      this.pos(chain[0], this.a);
      const start = this.tmp.copy(this.a);
      for (let k = 1; k < chain.length; k++) {
        this.pos(chain[k], this.b);
        path += this.a.distanceTo(this.b);
        this.a.copy(this.b);
      }
      r.straight[f] = path > 1e-4 ? start.distanceTo(this.a) / path : 0;
    }
    // fingers: straight = extended. Thumb: far from the index knuckle = extended.
    for (const f of ['index', 'middle', 'ring', 'pinky'] as const) r.extended[f] = r.straight[f] > 0.86;
    const indexKnuckle = this.pos('index-finger-phalanx-proximal', this.tmp);
    r.extended.thumb = r.thumbTip.distanceTo(indexKnuckle) > 0.045 && r.straight.thumb > 0.8;

    // palm normal: (pinky - wrist) x (index - wrist), flipped for the right hand
    const w = r.wrist;
    const i = this.pos('index-finger-metacarpal', this.a).sub(w);
    const p = this.pos('pinky-finger-metacarpal', this.b).sub(w);
    r.palmNormal.crossVectors(p, i).normalize();
    if (this.side === 'right') r.palmNormal.negate();
    return r;
  }
}

/** The poses the lab asks for. `null` = don't care. [thumb, index, middle, ring, pinky] */
export interface PoseDef {
  id: string;
  name: string;
  fingers: (boolean | null)[];
  /** thumb tip touching index tip */
  pinch?: boolean;
  /** for the shadow theatre: what it looks like */
  hint: string;
}

export const POSES: PoseDef[] = [
  { id: 'open', name: 'Open hand', fingers: [true, true, true, true, true], hint: 'all five fingers straight' },
  { id: 'fist', name: 'Fist', fingers: [false, false, false, false, false], hint: 'close every finger' },
  { id: 'point', name: 'Point', fingers: [null, true, false, false, false], hint: 'only the index finger' },
  { id: 'peace', name: 'Peace', fingers: [null, true, true, false, false], hint: 'index + middle' },
  { id: 'thumbsUp', name: 'Thumbs up', fingers: [true, false, false, false, false], hint: 'only the thumb' },
  { id: 'rock', name: 'Rock', fingers: [null, true, false, false, true], hint: 'index + pinky' },
  { id: 'three', name: 'Three', fingers: [null, true, true, true, false], hint: 'index, middle, ring' },
  { id: 'call', name: 'Call me', fingers: [true, false, false, false, true], hint: 'thumb + pinky' },
  { id: 'ok', name: 'OK', fingers: [null, null, true, true, true], pinch: true, hint: 'thumb touches index, others straight' },
];

// most specific first: OK needs the pinch (sorted once)
const ORDERED = [...POSES].sort((a, b) => Number(!!b.pinch) - Number(!!a.pinch));

/** Which pose (if any) the hand is making right now. */
export function classify(r: HandReading): string | null {
  const e = r.extended;
  const touching = r.pinchGap < 0.025;
  for (let i = 0; i < ORDERED.length; i++) {
    const p = ORDERED[i];
    if (p.pinch && !touching) continue;
    const f = p.fingers;
    if ((f[0] === null || f[0] === e.thumb) && (f[1] === null || f[1] === e.index) && (f[2] === null || f[2] === e.middle) && (f[3] === null || f[3] === e.ring) && (f[4] === null || f[4] === e.pinky)) return p.id;
  }
  return null;
}
