import { Vector3 } from '@iwsdk/core';

/**
 * 1€ filter (Casiez et al. 2012) for a 3D point: strong smoothing when the
 * point is nearly still (hides hand-tracking jitter), almost none when it
 * moves fast (no lag on a real reach). Units: metres, seconds.
 */
export class OneEuro3 {
  private readonly x = new Vector3();
  private readonly dx = new Vector3();
  private readonly raw = new Vector3();
  private ready = false;

  constructor(
    private readonly minCutoff = 2.0, // Hz when still: higher = less smoothing
    private readonly beta = 6.0, // how fast cutoff rises with speed (per m/s)
    private readonly dCutoff = 1.5, // Hz, for the speed estimate itself
  ) {}

  private static alpha(cutoff: number, dt: number): number {
    const tau = 1 / (2 * Math.PI * cutoff);
    return 1 / (1 + tau / dt);
  }

  reset(p: Vector3): void {
    this.x.copy(p);
    this.dx.set(0, 0, 0);
    this.ready = true;
  }

  /** Feed the raw point; returns the smoothed point (owned by the filter). */
  filter(p: Vector3, dt: number): Vector3 {
    if (!this.ready || dt <= 0) {
      this.reset(p);
      return this.x;
    }
    this.raw.copy(p).sub(this.x).divideScalar(dt);
    this.dx.lerp(this.raw, OneEuro3.alpha(this.dCutoff, dt));
    const cutoff = this.minCutoff + this.beta * this.dx.length();
    this.x.lerp(p, OneEuro3.alpha(cutoff, dt));
    return this.x;
  }
}
