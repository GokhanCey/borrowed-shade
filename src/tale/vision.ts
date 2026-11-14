import * as A from './art.js';
import * as B from './art2.js';
import type { Stage } from './fill-core.js';

/**
 * The Hollow's window pictures (spread 7), painted like a memory in an arched window:
 *  - 'carts': the hill at dusk, carts loaded with stones, and huge black hands in the sky
 *  - 'echo':  the village at dusk, and over it the reader's own hand shadow, captured
 *             on page 1 when they covered the sun (it must be theirs, never a painted hand)
 */
export function drawVision(canvas: HTMLCanvasElement, kind: 'carts' | 'echo', mask: Uint8Array | null, st: Stage): void {
  const g = canvas.getContext('2d')!;
  const W = canvas.width;
  const H = canvas.height;
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.clearRect(0, 0, W, H);
  // the arched window frame (everything is clipped to it)
  const arch = new Path2D();
  const r = W * 0.42;
  arch.moveTo(W / 2 - r, H - 14);
  arch.lineTo(W / 2 - r, H * 0.48);
  arch.arc(W / 2, H * 0.48, r, Math.PI, 0);
  arch.lineTo(W / 2 + r, H - 14);
  arch.closePath();
  g.save();
  g.clip(arch);
  // cut paper, flat: a moonlit vellum sky (no gradient), card layers on it
  g.fillStyle = '#e9e4c8';
  g.fillRect(0, 0, W, H);
  // a faint paper grain, so it reads as paper, not a picture
  g.globalAlpha = 0.06;
  for (let i = 0; i < 160; i++) {
    g.fillStyle = i % 2 ? '#8a7f6a' : '#ffffff';
    g.fillRect((i * 97) % W, (i * 53) % H, 2 + (i % 5), 1);
  }
  g.globalAlpha = 1;
  const ink = '#1b1424';
  const path = (d: string, x: number, y: number, s: number, color: string, flip = 1) => {
    g.save();
    g.setTransform(s * flip, 0, 0, -s, x, y);
    g.fillStyle = color;
    g.fill(new Path2D(d));
    g.restore();
  };
  if (kind === 'carts') {
    // the hill with its tower half gone
    path(A.HILLS, W / 2, H - 10, 1.6, '#4a4568');
    path(B.TOWER, W * 0.56, H * 0.62, 1.4, '#4a4568');
    // carts with stones
    for (const [x, s] of [[W * 0.22, 1], [W * 0.42, 0.85], [W * 0.7, 1.1]] as const) {
      g.fillStyle = '#4a3326';
      g.fillRect(x - 34 * s, H - 70 * s, 68 * s, 22 * s);
      g.fillStyle = '#8a8378';
      for (let k = 0; k < 4; k++) g.fillRect(x - 30 * s + k * 15 * s, H - 84 * s - (k % 2) * 6 * s, 13 * s, 14 * s);
      g.fillStyle = ink;
      for (const dx of [-22, 22]) {
        g.beginPath();
        g.arc(x + dx * s, H - 46 * s, 10 * s, 0, Math.PI * 2);
        g.fill();
      }
    }
    // huge hands in the sky, reaching down
    g.globalAlpha = 0.92;
    path(B.HANDS.open, W * 0.3, H * 0.05, 2.3, ink, 1);
    g.save();
    g.setTransform(-2.1, 0, 0, 2.1, W * 0.78, H * 0.02);
    g.fillStyle = ink;
    g.fill(new Path2D(B.HANDS.open));
    g.restore();
    g.globalAlpha = 1;
  } else {
    // the sun going down behind the village, as on page 1
    g.fillStyle = '#ffd98a';
    g.beginPath();
    g.arc(W * 0.66, H * 0.42, 34, 0, Math.PI * 2);
    g.fill();
    path(A.HILLS, W / 2, H - 6, 1.6, '#3d3a5c');
    path(B.VILLAGE_ROW, W / 2, H - 6, 1.6, '#2e2a40');
    // the reader's hand, as it was on page 1, over the roofs (their own shadow)
    if (mask) {
      let x0 = st.w;
      let y0 = st.h;
      let x1 = 0;
      let y1 = 0;
      for (let y = 0; y < st.h; y++) for (let x = 0; x < st.w; x++) if (mask[y * st.w + x]) {
        x0 = Math.min(x0, x);
        y0 = Math.min(y0, y);
        x1 = Math.max(x1, x);
        y1 = Math.max(y1, y);
      }
      const bw = x1 - x0 + 1;
      const bh = y1 - y0 + 1;
      const s = Math.min((W * 0.62) / bw, (H * 0.62) / bh);
      const ox = W * 0.62 - (bw * s) / 2;
      const oy = H * 0.08;
      // the mask into a small canvas, then ONE blurred, scaled draw (a blur per cell stalls the frame)
      const mc = document.createElement('canvas');
      mc.width = bw;
      mc.height = bh;
      const mg = mc.getContext('2d')!;
      const img = mg.createImageData(bw, bh);
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (mask[y * st.w + x]) {
        const i = ((y1 - y) * bw + (x - x0)) * 4;
        img.data[i] = 27;
        img.data[i + 1] = 20;
        img.data[i + 2] = 36;
        img.data[i + 3] = 255;
      }
      mg.putImageData(img, 0, 0);
      g.filter = 'blur(2px)';
      g.imageSmoothingEnabled = true;
      g.drawImage(mc, ox, oy, bw * s, bh * s);
      g.filter = 'none';
    }
  }
  g.restore();
  // the frame
  g.lineWidth = 12;
  g.strokeStyle = '#2a2236';
  g.stroke(arch);
  g.lineWidth = 3;
  g.strokeStyle = 'rgba(255, 220, 160, 0.5)';
  g.stroke(arch);
}
