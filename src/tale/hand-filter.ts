import { Matrix4, Quaternion, Vector3, type Object3D } from '@iwsdk/core';

/**
 * The shadow hand: the hand you see stays exactly as
 * tracked, but the hand that casts the shadow is a smoothed copy of it.
 *
 * Every joint is filtered in world space with a One Euro filter (steady when still,
 * quick when moving, so a jaw snap or a wing beat still comes through). A joint that
 * jumps implausibly in one frame (a tracking glitch) is held for a few frames unless the
 * jump persists. If tracking drops for a moment, the shadow keeps the last good pose
 * briefly instead of blinking out.
 *
 * Use: `beginShadow()` just before the hand beam renders (it poses each hand's bones),
 * `endShadow()` right after (it puts the tracked pose back).
 */
export interface FilterParams {
  /** cutoff at rest (Hz): lower = steadier */
  minCutoff: number;
  /** how fast the cutoff opens with speed (per m/s) */
  beta: number;
  /** a single-frame jump larger than this (m) is a glitch until it persists */
  jump: number;
  /** frames a jump must persist to be believed */
  jumpFrames: number;
}

export const GENTLE: FilterParams = { minCutoff: 1.2, beta: 6, jump: 0.035, jumpFrames: 3 };

interface JointState {
  bone: Object3D;
  /** filtered world pose */
  p: Vector3;
  q: Quaternion;
  dp: Vector3;
  init: boolean;
  jumpCount: number;
  /** the tracked local pose (restored after the shadow render) */
  savedP: Vector3;
  savedQ: Quaternion;
  savedS: Vector3;
}

const alpha = (cutoff: number, dt: number) => {
  const tau = 1 / (2 * Math.PI * cutoff);
  return 1 / (1 + tau / dt);
};

const tmpM = new Matrix4();
const tmpM2 = new Matrix4();
const tmpP = new Vector3();
const tmpQ = new Quaternion();
const tmpS = new Vector3();
const ONE = new Vector3(1, 1, 1);

class HandFilter {
  private joints: JointState[] = [];
  private model: Object3D | null = null;
  /** seconds since tracking was last good */
  lost = 0;

  constructor(private params: FilterParams) {}

  private bind(model: Object3D): void {
    this.model = model;
    this.joints = [];
    // bones in hierarchy order (parents before children)
    model.traverse((o) => {
      if ((o as { isBone?: boolean }).isBone) this.joints.push({ bone: o, p: new Vector3(), q: new Quaternion(), dp: new Vector3(), init: false, jumpCount: 0, savedP: new Vector3(), savedQ: new Quaternion(), savedS: new Vector3() });
    });
  }

  /** read the tracked pose and advance the filter */
  step(model: Object3D | undefined, tracked: boolean, dt: number): void {
    if (!model) return;
    if (model !== this.model) this.bind(model);
    if (!tracked) {
      this.lost += dt;
      return;
    }
    // after a long loss the filter starts fresh (no slow slide from a stale pose)
    const restart = this.lost > 0.5;
    this.lost = 0;
    model.updateMatrixWorld(true);
    const P = this.params;
    for (const j of this.joints) {
      j.bone.matrixWorld.decompose(tmpP, tmpQ, tmpS);
      if (!j.init || restart) {
        j.p.copy(tmpP);
        j.q.copy(tmpQ);
        j.dp.set(0, 0, 0);
        j.init = true;
        j.jumpCount = 0;
        continue;
      }
      // a glitch: hold until the jump persists
      const d = tmpP.distanceTo(j.p);
      if (d > P.jump && j.jumpCount < P.jumpFrames) {
        j.jumpCount++;
        continue;
      }
      j.jumpCount = 0;
      // One Euro: the derivative sets the cutoff
      const ad = alpha(1, dt);
      const vx = (tmpP.x - j.p.x) / dt;
      const vy = (tmpP.y - j.p.y) / dt;
      const vz = (tmpP.z - j.p.z) / dt;
      j.dp.x += (vx - j.dp.x) * ad;
      j.dp.y += (vy - j.dp.y) * ad;
      j.dp.z += (vz - j.dp.z) * ad;
      const speed = j.dp.length();
      const a = alpha(P.minCutoff + P.beta * speed, dt);
      j.p.lerp(tmpP, a);
      j.q.slerp(tmpQ, a);
    }
  }

  /** pose the bones as the filtered hand (world -> local through the parents) */
  apply(): boolean {
    if (!this.model || !this.joints.length || this.lost > 0.35 || !this.joints[0].init) return false;
    for (const j of this.joints) {
      j.savedP.copy(j.bone.position);
      j.savedQ.copy(j.bone.quaternion);
      j.savedS.copy(j.bone.scale);
    }
    for (const j of this.joints) {
      const parent = j.bone.parent;
      if (!parent) continue;
      parent.updateMatrixWorld(false);
      // keep the bone's own scale, take the filtered world position and rotation
      j.bone.matrixWorld.decompose(tmpP, tmpQ, tmpS);
      tmpM.compose(j.p, j.q, tmpS);
      tmpM2.copy(parent.matrixWorld).invert().multiply(tmpM);
      tmpM2.decompose(j.bone.position, j.bone.quaternion, tmpS);
      j.bone.scale.copy(j.savedS);
      j.bone.updateMatrixWorld(true);
    }
    return true;
  }

  restore(): void {
    if (!this.model) return;
    for (const j of this.joints) {
      j.bone.position.copy(j.savedP);
      j.bone.quaternion.copy(j.savedQ);
      j.bone.scale.copy(j.savedS);
    }
    this.model.updateMatrixWorld(true);
  }
}

export class ShadowHands {
  private filters = { left: new HandFilter(GENTLE), right: new HandFilter(GENTLE) };
  private applied: ('left' | 'right')[] = [];
  enabled = true;

  step(side: 'left' | 'right', model: Object3D | undefined, tracked: boolean, dt: number): void {
    this.filters[side].step(model, tracked, dt);
  }

  beginShadow(): number {
    this.applied = [];
    if (!this.enabled) return 0;
    for (const side of ['left', 'right'] as const) if (this.filters[side].apply()) this.applied.push(side);
    return this.applied.length;
  }

  endShadow(): void {
    for (const side of this.applied) this.filters[side].restore();
    this.applied = [];
  }

  debug(): Record<string, number> {
    return { left: +this.filters.left.lost.toFixed(2), right: +this.filters.right.lost.toFixed(2) };
  }
}

export const _unused = ONE;
