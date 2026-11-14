import { CanvasTexture, createSystem, LinearFilter, Quaternion, SRGBColorSpace, Sprite, SpriteMaterial, Vector3, type World } from '@iwsdk/core';

/**
 * The frame-rate readout, for checks on the headset. Turned on from the lantern menu
 * (Book > Frame rate) or with `?perf` in the URL.
 *
 * It floats low and to the left of your view (it follows your head) and shows, every half second:
 *  - frames per second (green at 70+, yellow at 60-69, red under 60; the competition asks for 60+),
 *  - the worst single frame in that half second, in milliseconds (a stutter shows here even when
 *    the average looks fine: 14 ms is a smooth 72 Hz frame, 33 ms is a dropped one),
 *  - draw calls and triangles, and the page you are on (so a slow page can be named).
 * One sprite, one draw call; it costs nothing when hidden.
 *
 * "Report" (Frame rate: Report) shows a table instead: one row per page read so far, with its
 * average fps, the lowest half-second, the worst frame and the peak draw calls. It is kept on the
 * headset (localStorage), so one screenshot after a whole reading covers every page.
 */
interface PageStat {
  frames: number;
  ms: number;
  low: number;
  worst: number;
  calls: number;
  shadow: number;
  read: number;
  /** frames that took longer than one 60 Hz slot allows (they were shown late) */
  missed?: number;
}
/** a frame longer than this was shown late (13.9 ms at 72 Hz, 16.7 at 60; the rest is callback jitter) */
const MISS_MS = 19;
const REPORT_KEY = 'borrowedShade.perfReport.v1';

export class PerfHud {
  private canvas = document.createElement('canvas');
  private ctx = this.canvas.getContext('2d')!;
  private texture: CanvasTexture;
  private sprite: Sprite;
  private frames = 0;
  private last = performance.now();
  private prev = performance.now();
  private worst = 0;
  private missedNow = 0;
  private low = Infinity;
  private lowT = 0;
  private tmp = new Vector3();
  private q = new Quaternion();
  /** where the readout floats, in head space (m) */
  private readonly offset = new Vector3(-0.15, -0.12, -0.55);

  /** 'live' = the small readout; 'report' = the per-page table */
  mode: 'live' | 'report' = 'live';
  private stats = new Map<string, PageStat>();
  private saveT = 0;

  constructor(
    private world: World,
    visible: boolean,
    private where: () => string = () => '',
    private cpu: () => string = () => '',
  ) {
    try {
      const raw = localStorage.getItem(REPORT_KEY);
      if (raw) for (const [k, v] of JSON.parse(raw) as [string, PageStat][]) if (v && typeof v.frames === 'number') this.stats.set(k, v);
    } catch {
      /* no storage */
    }
    this.canvas.width = 512;
    this.canvas.height = 512;
    this.texture = new CanvasTexture(this.canvas);
    this.texture.colorSpace = SRGBColorSpace;
    // (the readout must not cost what it measures: no mip chain on its twice-a-second upload)
    this.texture.generateMipmaps = false;
    this.texture.minFilter = LinearFilter;
    this.sprite = new Sprite(new SpriteMaterial({ map: this.texture, depthTest: false, depthWrite: false, transparent: true }));
    this.sprite.name = 'Frame rate';
    this.sprite.scale.set(0.15, 0.15, 1);
    this.sprite.renderOrder = 100;
    this.sprite.frustumCulled = false;
    this.sprite.visible = visible;
    world.scene.add(this.sprite);
    hud = this;
    world.registerSystem(PerfHudSystem);
  }

  get visible(): boolean {
    return this.sprite.visible;
  }

  /** the last whole frame's draw calls and triangles (three.js resets its counters per render pass) */
  private calls = 0;
  private tris = 0;

  set visible(v: boolean) {
    this.world.renderer.info.autoReset = !v;
    if (v && !this.sprite.visible) {
      this.frames = 0;
      this.worst = 0;
      this.low = Infinity;
      this.last = this.prev = performance.now();
    }
    this.sprite.visible = v;
  }

  tick(): void {
    if (!this.sprite.visible) return;
    const info = this.world.renderer.info;
    info.autoReset = false;
    this.calls = info.render.calls;
    this.tris = info.render.triangles;
    info.reset();
    const now = performance.now();
    const d = now - this.prev;
    this.worst = Math.max(this.worst, d);
    if (d > MISS_MS) this.missedNow++;
    this.prev = now;
    this.frames++;
    // follow the head: low and to the left, always facing you
    const cam = this.world.camera;
    cam.getWorldPosition(this.tmp);
    cam.getWorldQuaternion(this.q);
    this.sprite.position.copy(this.offset).applyQuaternion(this.q).add(this.tmp);
    if (now - this.last > 500) this.draw(now);
  }

  /** forget the per-page table (a new test run) */
  clearReport(): void {
    this.stats.clear();
    try {
      localStorage.removeItem(REPORT_KEY);
    } catch {
      /* no storage */
    }
  }

  report(): Record<string, PageStat & { fps: number }> {
    const out: Record<string, PageStat & { fps: number }> = {};
    for (const [k, v] of this.stats) out[k] = { ...v, fps: +((v.frames * 1000) / Math.max(1, v.ms)).toFixed(1) };
    return out;
  }

  private drawReport(): void {
    const g = this.ctx;
    const col = (v: number) => (v >= 70 ? '#9ef59e' : v >= 60 ? '#ffe08a' : '#ff8a8a');
    g.clearRect(0, 0, 512, 512);
    g.fillStyle = 'rgba(14,10,26,0.86)';
    g.fillRect(0, 0, 512, 512);
    g.fillStyle = '#ffffff';
    g.font = '700 26px system-ui, sans-serif';
    g.fillText('Frame-rate report', 16, 32);
    g.font = '500 17px system-ui, sans-serif';
    g.fillStyle = '#b9b2c9';
    g.fillText('page             avg  low  late  worst draws shad', 16, 60);
    let y = 86;
    for (const [k, v] of this.stats) {
      if (y > 506) break;
      const avg = (v.frames * 1000) / Math.max(1, v.ms);
      g.fillStyle = '#e8e0f2';
      g.fillText(k.replace('Tale · ', '').replace('Weather · ', 'w ').slice(0, 15), 16, y);
      g.fillStyle = col(avg);
      g.fillText(avg.toFixed(0), 172, y);
      g.fillStyle = col(v.low);
      g.fillText(Number.isFinite(v.low) ? v.low.toFixed(0) : '-', 216, y);
      // the share of frames shown late: the column that answers "min 60 fps"
      const late = (100 * (v.missed ?? 0)) / Math.max(1, v.frames);
      g.fillStyle = late <= 1 ? '#9ef59e' : late <= 3 ? '#ffe08a' : '#ff8a8a';
      g.fillText(`${late.toFixed(1)}%`, 258, y);
      g.fillStyle = v.worst > 45 ? '#ff8a8a' : v.worst > 19 ? '#ffe08a' : '#9ef59e';
      g.fillText(v.worst.toFixed(0), 330, y);
      g.fillStyle = '#e8e0f2';
      g.fillText(String(v.calls), 384, y);
      g.fillText(v.shadow.toFixed(1), 440, y);
      y += 19;
    }
    this.texture.needsUpdate = true;
  }

  private draw(now: number): void {
    const span = now - this.last;
    const fps = (this.frames * 1000) / span;
    // the per-page table
    const key = this.where();
    const st = this.stats.get(key) ?? { frames: 0, ms: 0, low: Infinity, worst: 0, calls: 0, shadow: 0, read: 0 };
    st.frames += this.frames;
    st.ms += span;
    st.low = Math.min(st.low, fps);
    st.worst = Math.max(st.worst, this.worst);
    st.missed = (st.missed ?? 0) + this.missedNow;
    this.missedNow = 0;
    st.calls = Math.max(st.calls, this.calls);
    const cpu = this.cpu().match(/[\d.]+/g)?.map(Number) ?? [];
    st.shadow = Math.max(st.shadow, cpu[0] ?? 0);
    st.read = Math.max(st.read, cpu[1] ?? 0);
    this.stats.set(key, st);
    this.saveT += span;
    if (this.saveT > 5000) {
      this.saveT = 0;
      try {
        localStorage.setItem(REPORT_KEY, JSON.stringify([...this.stats]));
      } catch {
        /* no storage */
      }
    }
    if (this.mode === 'report') {
      this.drawReport();
      this.frames = 0;
      this.last = now;
      this.worst = 0;
      return;
    }
    // the lowest half-second in the last 10 s (resets so one old hitch does not stick)
    this.lowT += now - this.last;
    if (this.lowT > 10000) {
      this.lowT = 0;
      this.low = Infinity;
    }
    this.low = Math.min(this.low, fps);
    this.frames = 0;
    this.last = now;

    const g = this.ctx;
    const col = (v: number) => (v >= 70 ? '#9ef59e' : v >= 60 ? '#ffe08a' : '#ff8a8a');
    g.clearRect(0, 0, 512, 512);
    g.fillStyle = 'rgba(14,10,26,0.78)';
    g.fillRect(0, 0, 512, 228);
    g.fillStyle = col(fps);
    g.font = '700 56px system-ui, sans-serif';
    g.fillText(`${fps.toFixed(0)} fps`, 20, 62);
    g.font = '600 30px system-ui, sans-serif';
    g.fillStyle = col(this.low);
    g.fillText(`low ${this.low.toFixed(0)}`, 300, 40);
    g.fillStyle = this.worst > 25 ? '#ff8a8a' : this.worst > 17.5 ? '#ffe08a' : '#9ef59e';
    g.fillText(`worst ${this.worst.toFixed(0)} ms`, 300, 76);
    g.fillStyle = '#ffffff';
    g.font = '500 28px system-ui, sans-serif';
    g.fillText(`${this.calls} draws · ${(this.tris / 1000).toFixed(0)}k tris (all passes)`, 20, 122);
    g.fillStyle = '#d8cfe8';
    g.fillText(this.cpu(), 20, 162);
    g.fillText(this.where(), 20, 204);
    this.worst = 0;
    this.texture.needsUpdate = true;
  }
}

let hud: PerfHud | undefined;

/** Counts frames for the HUD (an ECS system runs once per rendered frame, in and out of XR). */
class PerfHudSystem extends createSystem({}) {
  update(): void {
    hud?.tick();
  }
}
