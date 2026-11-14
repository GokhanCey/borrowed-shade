import { SessionMode, type World } from '@iwsdk/core';

/**
 * The page a player sees in the browser before the headset: the title, one
 * line, and one button. "Begin" opens the book in your room when the headset
 * can show it (mixed reality), otherwise in the dark theatre (VR).
 */
const CSS = `
.bs-start {
  position: fixed; inset: 0; z-index: 20; display: flex; align-items: center; justify-content: center;
  background: radial-gradient(ellipse at 50% 38%, rgba(120,72,40,0.55), rgba(10,8,22,0.96) 68%);
  color: #f3e6cc; font-family: Georgia, "Times New Roman", serif; transition: opacity 0.8s;
}
.bs-start.gone { opacity: 0; pointer-events: none; }
.bs-card { max-width: 560px; padding: 32px 36px; text-align: center; }
.bs-lantern { width: 54px; height: 70px; margin: 0 auto 22px; border-radius: 45% 45% 45% 45% / 50% 50% 50% 50%;
  background: radial-gradient(circle at 50% 45%, #ffe2a8, #f0a24a 55%, #8a4a1c); box-shadow: 0 0 60px 18px rgba(255,170,80,0.35); }
.bs-title { font-size: 52px; font-style: italic; font-weight: 600; letter-spacing: 0.5px; margin: 0 0 8px; color: #f6d9a0; }
.bs-sub { font-size: 19px; font-style: italic; color: #e3cfae; margin: 0 0 30px; }
.bs-btns { display: flex; justify-content: center; gap: 14px; margin-bottom: 24px; flex-wrap: wrap; }
.bs-btn { font: italic 600 20px Georgia, serif; padding: 13px 38px; border-radius: 999px; cursor: pointer;
  border: 1px solid rgba(246,217,160,0.6); background: #7a4a26; color: #fff5e2; }
.bs-btn:hover { background: #8f5a30; }
.bs-btn.alt { background: transparent; }
.bs-help { font-size: 15px; line-height: 1.75; color: #d8c4a4; }
.bs-note { margin-top: 18px; font-size: 13px; color: #a8957a; }
`;

export function showTaleStart(world: World, onBegin: () => void): void {
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);
  const el = document.createElement('div');
  el.className = 'bs-start';
  el.innerHTML = `
    <div class="bs-card">
      <div class="bs-lantern"></div>
      <h1 class="bs-title">Borrowed Shade</h1>
      <p class="bs-sub">A tale for one lantern and two hands.</p>
      <div class="bs-btns">
        <button class="bs-btn" data-act="xr" hidden>Begin</button>
        <button class="bs-btn alt" data-act="look">Look on this screen</button>
      </div>
      <div class="bs-help">Sit at a table. Put the controllers down.<br/>Your hands will know what to do.</div>
      <div class="bs-note">For Meta Quest: open this page in the Quest Browser. Headphones recommended.</div>
    </div>`;
  document.body.appendChild(el);

  const hide = () => {
    el.classList.add('gone');
    world.globals.started = true;
    window.setTimeout(() => el.remove(), 900);
    onBegin();
  };
  const xrBtn = el.querySelector('[data-act="xr"]') as HTMLButtonElement;
  let arOk = false;
  xrBtn.addEventListener('click', () => {
    world.launchXR(arOk ? { sessionMode: SessionMode.ImmersiveAR, features: { handTracking: true } } : { sessionMode: SessionMode.ImmersiveVR, features: { handTracking: true } });
    hide();
  });
  el.querySelector('[data-act="look"]')!.addEventListener('click', hide);
  const xr = navigator.xr;
  if (xr) {
    void Promise.all([xr.isSessionSupported('immersive-ar').catch(() => false), xr.isSessionSupported('immersive-vr').catch(() => false)]).then(([ar, vr]) => {
      arOk = ar;
      if (ar || vr) xrBtn.hidden = false;
    });
  }
  world.renderer.xr.addEventListener('sessionstart', () => {
    if (!el.classList.contains('gone')) hide();
  });
}
