import { buildFill, FillHold, scoreFill, type FillResult, type FillTemplate, type HoldState } from './fill-core.js';
import { fillSpec, type Placed } from './plates.js';
import type { ScreenField } from './screen-field.js';

export interface FillView {
  id: string;
  placed: Placed;
  tpl: FillTemplate;
  hold: FillHold;
  res: FillResult | null;
  state: HoldState;
}

/**
 * Scores the reader's shadow against the live plates: each new ScreenField grid
 * goes to the worker (or is scored here if workers are unavailable), results feed
 * a hold with hysteresis per plate.
 */
export class Filler {
  views: FillView[] = [];
  private worker: Worker | null = null;
  private epoch = 0;
  private seq = 0;
  private busy = false;
  private lastAt = 0;
  private clock = 0;
  private off: (() => void) | null = null;
  /** results received (tests) */
  results = 0;

  constructor(private field: ScreenField) {
    try {
      this.worker = new Worker(new URL('./fill-worker.ts', import.meta.url), { type: 'module' });
      this.worker.onmessage = (e) => this.onResult(e.data);
      this.worker.onerror = () => (this.worker = null);
    } catch {
      this.worker = null;
    }
  }

  get active(): boolean {
    return this.views.length > 0;
  }

  setup(list: Placed[], pass: number): void {
    this.clear();
    this.epoch++;
    this.views = list.map((p) => {
      const tpl = buildFill(fillSpec(this.field.st, p, pass), this.field.st);
      return { id: p.id, placed: p, tpl, hold: new FillHold(tpl.pass, tpl.stay), res: null, state: 'away' as HoldState };
    });
    this.worker?.postMessage({ type: 'setup', epoch: this.epoch, tpls: this.views.map((v) => v.tpl) });
    this.off = this.field.onGrid((H) => this.onGrid(H));
  }

  clear(): void {
    this.off?.();
    this.off = null;
    this.views = [];
    this.busy = false;
    this.epoch++;
  }

  view(id: string): FillView | undefined {
    return this.views.find((v) => v.id === id);
  }

  private onGrid(H: Uint8Array): void {
    if (!this.views.length) return;
    if (this.worker) {
      if (this.busy && this.clock - this.lastAt < 1) return; // one in flight (1 s lost-reply guard)
      this.busy = true;
      this.lastAt = this.clock;
      const copy = H.slice();
      this.worker.postMessage({ type: 'score', epoch: this.epoch, seq: ++this.seq, H: copy }, [copy.buffer]);
    } else {
      const res: Record<string, FillResult> = {};
      for (const v of this.views) res[v.id] = scoreFill(H, v.tpl, false);
      this.onResult({ type: 'result', epoch: this.epoch, seq: ++this.seq, res });
    }
  }

  private onResult(m: { type: string; epoch: number; seq: number; res: Record<string, FillResult> }): void {
    if (m.epoch !== this.epoch) return;
    this.busy = false;
    this.results++;
    for (const v of this.views) {
      const r = m.res[v.id];
      if (!r) continue;
      v.res = r;
      v.hold.feed(r);
    }
  }

  /** every frame (paused: frozen) */
  update(dt: number): void {
    this.clock += dt;
    const stale = this.field.age > 0.5;
    for (const v of this.views) v.state = v.hold.update(dt, stale);
  }
}
