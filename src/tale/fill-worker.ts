/// <reference lib="webworker" />
import { scoreFill, type FillResult, type FillTemplate } from './fill-core.js';

/**
 * Scores the reader's shadow against the live plates off the main thread
 * (about 0.7 ms on desktop, 3–5 ms on Quest 2 per read).
 */
let epoch = -1;
let tpls: FillTemplate[] = [];

self.onmessage = (e: MessageEvent) => {
  const m = e.data as { type: 'setup'; epoch: number; tpls: FillTemplate[] } | { type: 'score'; epoch: number; seq: number; H: Uint8Array };
  if (m.type === 'setup') {
    epoch = m.epoch;
    tpls = m.tpls;
    return;
  }
  if (m.epoch !== epoch) return;
  const res: Record<string, FillResult> = {};
  for (const t of tpls) res[t.id] = scoreFill(m.H, t, false);
  (self as unknown as Worker).postMessage({ type: 'result', epoch, seq: m.seq, res });
};
