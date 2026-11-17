import { Matrix4, Vector3 } from '@iwsdk/core';

/** what the finder needs from three's XR manager */
interface XRSource {
  getFrame(): XRFrame | null;
  getReferenceSpace(): XRReferenceSpace | null;
}

/**
 * The reader's real table, from the headset's detected planes (mixed reality only).
 * A table is a horizontal plane under the spot where the book should sit, between
 * a little below the eye and well above the floor. No plane, no permission, no
 * Space Setup: it simply finds nothing, and the book stays where it always was.
 */
export class TableFinder {
  private m = new Matrix4();
  private p = new Vector3();

  /** world height of the table top under `spot`, or null */
  find(xr: XRSource, head: Vector3, spot: Vector3): number | null {
    const frame = xr.getFrame();
    const ref = xr.getReferenceSpace();
    const planes = frame?.detectedPlanes;
    if (!frame || !ref || !planes || planes.size === 0) return null;
    let best: number | null = null;
    planes.forEach((plane) => {
      if (plane.orientation !== 'horizontal') return;
      const pose = frame.getPose(plane.planeSpace, ref);
      if (!pose) return;
      const y = pose.transform.position.y;
      const below = head.y - y;
      // a table: under the eye, but not the floor (seated eye ~1.2 m, table ~0.45 m below it)
      if (below < 0.15 || below > 0.8) return;
      // the plane's own space: y is its normal, the outline lies in x/z
      this.m.fromArray(pose.transform.matrix).invert();
      this.p.copy(spot).applyMatrix4(this.m);
      if (!inside(plane.polygon, this.p.x, this.p.z)) return;
      // several tables under one spot (a desk and a shelf over it): take the one nearest the eye's reach
      if (best === null || Math.abs(below - 0.45) < Math.abs(head.y - best - 0.45)) best = y;
    });
    return best;
  }
}

/** point in polygon (even-odd), on the x/z plane */
function inside(poly: readonly DOMPointReadOnly[], x: number, z: number): boolean {
  let hit = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (a.z > z !== b.z > z && x < ((b.x - a.x) * (z - a.z)) / (b.z - a.z) + a.x) hit = !hit;
  }
  return hit;
}
