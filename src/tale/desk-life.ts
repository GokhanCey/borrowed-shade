import { BoxGeometry, CatmullRomCurve3, CylinderGeometry, DoubleSide, Group, Mesh, MeshStandardMaterial, Color, Shape, TubeGeometry, Vector3 } from '@iwsdk/core';
import * as A from './art.js';
import { flat, mergeStatic, paper } from './paper.js';

/**
 * LIFE ON THE DESK AND IN THE ROOM.
 *
 *  - A PAPER MOBILE stands at the back-right of the desk, the shelf's twin (the shelf is back-left):
 *    paper pieces on threads, turning slowly. Brush one with a fingertip and it swings and rings a
 *    small note. It has no job in any story; it is there to be played with. It starts with the moon
 *    alone and EARNS its other pieces: a star for a road read to its end, a bird for the wings, a
 *    second star for the tower, a cloud for The Four Elements. They are there the next time, before
 *    any book is opened: the desk shows what has been read.
 *    It stands well away from the brass lantern (front-right) and the screen, so playing with it
 *    never pauses the book or casts on the picture.
 *  - A STRING OF PAPER LANTERNS hangs in the room, high in an arc behind the book. They are dark
 *    while the book is shut and come on, one after another, as the book's own lantern is lit; they
 *    go out while the Hollow's wall has the light. Atmosphere only (out of reach).
 *
 * Few draw calls: the lanterns are one merged mesh, the stand another, and four hanging pieces.
 */
const BIRD = 'M -13 0 C -8 7 -3 7 0 2 C 3 7 8 7 13 0 C 8 3 3 3 0 -2 C -3 3 -8 3 -13 0 Z';
const CLOUD = 'M -13 -4 C -17 -4 -17 3 -12 3 C -12 9 -3 10 -1 5 C 2 10 11 9 11 3 C 16 3 16 -4 12 -4 Z';

/** a full-bellied crescent (metres): the outer round, and the bite of a smaller round set to one side */
function crescent(R = 0.0165): Shape {
  const r = R * 0.8;
  const off = R * 0.42;
  // where the two rounds cross
  const x = (R * R - r * r + off * off) / (2 * off);
  const y = Math.sqrt(Math.max(0, R * R - x * x));
  const a = Math.atan2(y, x);
  const b = Math.atan2(y, x - off);
  const s = new Shape();
  s.absarc(0, 0, R, a, Math.PI * 2 - a, false);
  s.absarc(off, 0, r, Math.PI * 2 - b, b, true);
  return s;
}

interface Hang {
  pivot: Group;
  piece: Mesh;
  /** swing angles and speeds (rad), about x and z */
  ax: number;
  az: number;
  vx: number;
  vz: number;
  cool: number;
  ph: number;
  /** on the mobile (earned), and how far it has grown in */
  on: boolean;
  grown: number;
}

export class DeskLife {
  readonly root = new Group();
  private spin = new Group();
  private hangs: Hang[] = [];
  private lamps: MeshStandardMaterial;
  private lampsOn = 0;
  private lampsShow = 1;
  private garland: Mesh[] = [];
  private t = 0;
  private tmp = new Vector3();
  private centre = new Vector3();
  /** called when a piece is rung (k: which) */
  onChime: (k: number) => void = () => undefined;

  /** tableY: the desk's height in the tale root's frame */
  constructor(tableY: number) {
    this.root.name = 'Desk life';

    // ---- the mobile ------------------------------------------------------------------------------
    const mobile = new Group();
    mobile.name = 'Paper mobile';
    // the shelf's twin: as near as the shelf is, clear of the lantern's pause and of the beam
    mobile.position.set(0.49, tableY, -0.44);
    mobile.scale.setScalar(0.8);
    const dark = new MeshStandardMaterial({ color: new Color('#2a211d'), roughness: 0.7, metalness: 0.2 });
    const stand = new Group();
    const curve = new CatmullRomCurve3([new Vector3(0, 0, 0), new Vector3(0, 0.24, 0), new Vector3(-0.025, 0.345, 0.012), new Vector3(-0.1, 0.372, 0.045)]);
    stand.add(new Mesh(new TubeGeometry(curve, 20, 0.003, 6, false), dark));
    const foot = new Mesh(new BoxGeometry(0.07, 0.008, 0.07), dark);
    foot.position.y = 0.004;
    stand.add(foot);
    mobile.add(stand);
    mergeStatic(stand, 'Mobile stand');
    // the turning cross: two thin sticks
    this.spin.position.set(-0.1, 0.36, 0.045);
    const cross = new Group();
    const s1 = new Mesh(new BoxGeometry(0.2, 0.003, 0.003), dark);
    const s2 = new Mesh(new BoxGeometry(0.003, 0.003, 0.2), dark);
    const drop = new Mesh(new BoxGeometry(0.0015, 0.014, 0.0015), dark);
    drop.position.y = 0.007;
    cross.add(s1, s2, drop);
    this.spin.add(cross);
    mergeStatic(cross, 'Mobile cross');
    mobile.add(this.spin);
    const things: [string | Shape, string, number, number, number, number][] = [
      // path, colour, scale, x, z, thread length
      [crescent(), '#f7ecc8', 1, 0.1, 0, 0.1],
      [A.STAR, '#ffd98a', 4.2, -0.1, 0, 0.07],
      [BIRD, '#cfe0f0', 1.6, 0, 0.1, 0.13],
      [A.STAR, '#ffe9b8', 3.4, 0, -0.1, 0.05],
      [CLOUD, '#ffffff', 1.5, 0, 0, 0.165],
    ];
    things.forEach(([path, color, s, x, z, len], i) => {
      const pivot = new Group();
      pivot.position.set(x, 0, z);
      const mat = paper(color, { emissive: color, emissiveIntensity: 0.45, side: 'double' }).clone();
      mat.side = DoubleSide;
      const g = new Group();
      const thread = new Mesh(new BoxGeometry(0.0012, len, 0.0012), mat);
      thread.position.y = -len / 2;
      const shape = flat(path, mat, 'Mobile piece');
      shape.scale.setScalar(s);
      // the moon hangs tipped, the way a crescent on a thread does
      if (i === 0) shape.geometry.rotateZ(-0.5);
      // every piece hangs TRUE: the thread meets its top edge, straight above its middle
      shape.geometry.computeBoundingBox();
      const bb = shape.geometry.boundingBox!;
      const cx = (bb.min.x + bb.max.x) / 2;
      const pos = shape.geometry.getAttribute('position');
      const reach = (bb.max.x - bb.min.x) * 0.08;
      let topY = -Infinity;
      for (let v = 0; v < pos.count; v++) if (Math.abs(pos.getX(v) - cx) <= reach) topY = Math.max(topY, pos.getY(v));
      if (!Number.isFinite(topY)) topY = bb.max.y;
      shape.position.set(-cx * s, -len - topY * s + 0.0012, 0);
      g.add(thread, shape);
      pivot.add(g);
      const merged = mergeStatic(g, `Mobile ${i}`);
      this.spin.add(pivot);
      this.hangs.push({ pivot, piece: merged[0] ?? shape, ax: 0, az: 0, vx: 0, vz: 0, cool: 0, ph: i * 1.9, on: i === 0, grown: i === 0 ? 1 : 0 });
      pivot.visible = i === 0;
      pivot.userData.len = (len + 0.02) * 0.8;
    });
    this.root.add(mobile);

    // ---- the string of paper lanterns, high in the room behind the book ------------------------------
    const garland = new Group();
    this.lamps = new MeshStandardMaterial({ color: new Color('#e9c79a'), emissive: new Color('#ffb062'), emissiveIntensity: 0.001, roughness: 1, transparent: true });
    const cap = new MeshStandardMaterial({ color: new Color('#2a211d'), roughness: 0.8 });
    cap.emissiveIntensity = 0;
    const knots: Vector3[] = [];
    for (let i = 0; i < 9; i++) {
      const az = (-68 + i * 17) * (Math.PI / 180);
      // round paper lanterns with a dark cap and foot, on one string that sags between them
      const lamp = new Mesh(new CylinderGeometry(0.03, 0.024, 0.06, 10), this.lamps);
      const p = new Vector3(Math.sin(az) * 1.75, 0.66 + 0.05 * Math.cos(i * Math.PI) - 0.02 * Math.abs(i - 4), -0.25 - Math.cos(az) * 1.6);
      lamp.position.copy(p);
      const top = new Mesh(new CylinderGeometry(0.012, 0.016, 0.01, 8), cap);
      top.position.copy(p).setY(p.y + 0.035);
      const foot = new Mesh(new CylinderGeometry(0.014, 0.01, 0.008, 8), cap);
      foot.position.copy(p).setY(p.y - 0.034);
      garland.add(lamp, top, foot);
      knots.push(new Vector3(p.x, p.y + 0.07, p.z));
    }
    garland.add(new Mesh(new TubeGeometry(new CatmullRomCurve3(knots), 48, 0.0025, 4, false), cap));
    this.root.add(garland);
    this.garland = mergeStatic(garland, 'Room lanterns');
  }

  /**
   * dt; fingertips (world); the book lantern's level 0..1; whether the room's lanterns may be lit
   * (not while the Hollow's wall has the light).
   */
  /**
   * which pieces the reader has earned (index 0, the moon, is always there). `ring`: they have just
   * been earned (a book has just closed): each new one grows in with its note.
   */
  setEarned(on: boolean[], ring = false): void {
    this.hangs.forEach((h, i) => {
      const want = i === 0 || !!on[i];
      if (want && !h.on) {
        h.on = true;
        h.pivot.visible = true;
        if (!ring) h.grown = 1;
        else {
          h.vx += 2.2;
          h.cool = 0.8 + i * 0.35;
          this.pending.push(i);
        }
      } else if (!want && h.on) {
        h.on = false;
        h.grown = 0;
        h.pivot.visible = false;
      }
    });
  }
  private pending: number[] = [];

  update(dt: number, tips: Vector3[], level: number, roomLit: boolean, night = 1, gust = 0): void {
    this.t += dt;
    const t = this.t;
    // the room's lanterns come on with the story's night (the sun put to bed lights them), never by day
    this.lampsOn += ((roomLit ? level * night : 0) - this.lampsOn) * Math.min(1, dt * 0.8);
    this.lamps.emissiveIntensity = 0.55 * this.lampsOn * (0.92 + 0.08 * Math.sin(t * 1.3));
    // while the Hollow's wall has the light the string fades right out (nothing stands in that light)
    this.lampsShow += ((roomLit ? 1 : 0) - this.lampsShow) * Math.min(1, dt * 2.5);
    this.lamps.opacity = this.lampsShow;
    // unlit, they are not there at all (nothing grey floats over a shut book)
    for (const m of this.garland) m.visible = this.lampsShow > 0.01 && this.lampsOn > 0.03;
    this.spin.rotation.y = t * 0.12;
    // is a fingertip anywhere near the mobile?
    this.spin.getWorldPosition(this.centre);
    let near = false;
    for (const tip of tips) if (tip.distanceTo(this.centre) < 0.34) near = true;
    for (let i = 0; i < this.hangs.length; i++) {
      const h = this.hangs[i];
      if (!h.on) continue;
      h.grown = Math.min(1, h.grown + dt * 1.2);
      h.pivot.scale.setScalar(Math.max(0.001, h.grown * h.grown * (3 - 2 * h.grown)));
      h.cool = Math.max(0, h.cool - dt);
      // a piece just earned rings once as it settles
      if (h.cool === 0 && this.pending.length && this.pending[0] === i) {
        this.pending.shift();
        this.onChime(i);
      }
      if (near && h.cool === 0) {
        // the piece hangs below its pivot by its thread
        h.pivot.getWorldPosition(this.tmp);
        this.tmp.y -= h.pivot.userData.len as number;
        for (const tip of tips) {
          const dx = this.tmp.x - tip.x;
          const dz = this.tmp.z - tip.z;
          if (Math.abs(this.tmp.y - tip.y) < 0.05 && Math.hypot(dx, dz) < 0.05) {
            // pushed away from the finger
            const n = Math.hypot(dx, dz) || 1;
            h.vz += (dx / n) * 3.2;
            h.vx -= (dz / n) * 3.2;
            h.cool = 0.5;
            this.onChime(i);
            break;
          }
        }
      }
      // a pendulum with a little air (and a breath of draught so it is never dead still)
      // (the room's wind, when a book makes one, sets the whole mobile swinging)
      const drive = 0.05 * Math.sin(t * 0.9 + h.ph) + gust * (2.2 + 1.6 * Math.sin(t * 1.7 + h.ph * 2));
      h.vx += (-14 * h.ax - 0.9 * h.vx + drive) * dt;
      h.vz += (-14 * h.az - 0.9 * h.vz + drive * 0.7) * dt;
      h.ax += h.vx * dt;
      h.az += h.vz * dt;
      h.pivot.rotation.x = Math.max(-1.1, Math.min(1.1, h.ax));
      h.pivot.rotation.z = Math.max(-1.1, Math.min(1.1, h.az));
    }
  }
}
