import { Group, Vector3, type World } from '@iwsdk/core';

/**
 * The "stage": everything placed around the seated user (island, shelf, well,
 * book) lives in one group anchored at the user's head position and facing.
 * Local coordinates: origin = head, -Z = forward, +Y = up, metres.
 * Re-anchored 0.7 s after entering XR, when the real seated pose is known.
 */
export const LAYOUT = {
  islandCenter: new Vector3(0, -0.6, -0.86), // top surface centre
  islandRadius: 0.62,
  shelfRadius: 0.36, // arc around the user, in front of the chest
  shelfY: -0.4,
  shelfFrom: -56, // degrees, 0 = straight ahead, negative = left
  shelfTo: 56,
  well: polar(70, 0.4, -0.42),
  bookRest: polar(-70, 0.39, -0.39),
  bookOpen: polar(-42, 0.44, -0.13),
  onboardLeft: new Vector3(-0.17, -0.3, -0.33),
  onboardRight: new Vector3(0.17, -0.3, -0.33),
  messageAt: new Vector3(0, -0.02, -0.95),
};

export function polar(deg: number, r: number, y: number): Vector3 {
  const a = (deg * Math.PI) / 180;
  return new Vector3(Math.sin(a) * r, y, -Math.cos(a) * r);
}

class Stage {
  readonly group = new Group();
  private listeners: (() => void)[] = [];
  private tmp = new Vector3();

  attach(world: World): void {
    this.group.name = 'Stage';
    world.scene.add(this.group);
  }

  /** Anchor the stage at the head, facing the horizontal look direction. */
  calibrate(head: Vector3, forward: Vector3): void {
    this.group.position.copy(head);
    this.group.rotation.set(0, Math.atan2(-forward.x, -forward.z), 0);
    this.group.updateMatrixWorld(true);
    for (const l of this.listeners) l();
  }

  onCalibrate(fn: () => void): void {
    this.listeners.push(fn);
  }

  /** Stage-local point -> world point (new vector unless `out` given). */
  toWorld(local: Vector3, out = new Vector3()): Vector3 {
    return this.group.localToWorld(out.copy(local));
  }

  /** World point -> stage-local point. */
  toLocal(world: Vector3, out = new Vector3()): Vector3 {
    return this.group.worldToLocal(out.copy(world));
  }

  /** Height of the island top in world space. */
  get islandTopY(): number {
    return this.toWorld(LAYOUT.islandCenter, this.tmp).y;
  }
}

export const stage = new Stage();
