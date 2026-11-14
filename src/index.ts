import { World } from '@iwsdk/core';
import projectOptions from 'virtual:iwsdk-project';
import { AudioEngine } from './audio/engine.js';
import { showTaleStart } from './tale/start.js';
import { TaleSystem } from './tale/tale-system.js';
import { PerfHud } from './ui/perf-hud.js';
import { stage } from './world/stage.js';

/**
 * Entry point.
 *   /            Borrowed Shade (the tale)
 * The previous game (island + planet) is preserved in git: tag `four-elements`.
 */
World.create(document.getElementById('scene-container') as HTMLDivElement, projectOptions).then((world) => {
  const audio = new AudioEngine();
  world.globals.audio = audio;
  // browsers keep audio suspended until a user gesture; entering XR is one
  const unlock = () => audio.unlock();
  for (const type of ['pointerdown', 'keydown', 'touchstart']) window.addEventListener(type, unlock, { capture: true, passive: true });
  world.renderer.xr.addEventListener('sessionstart', () => {
    unlock();
    // fixed foveation: three.js starts at 1 (strongest, cheapest edges); ?fov=0 / 0.5 / 1 compares on the headset
    const fov = new URLSearchParams(location.search).get('fov');
    if (fov !== null && !Number.isNaN(+fov)) world.renderer.xr.setFoveation(Math.min(1, Math.max(0, +fov)));
    const tale = world.getSystem(TaleSystem);
    const sess = world.renderer.xr.getSession() as (XRSession & { enabledFeatures?: string[]; supportedFrameRates?: Float32Array; updateTargetFrameRate?: (r: number) => Promise<void>; frameRate?: number }) | null;
    // ask for 72 Hz (a headset set to 90 or 120 would make every frame harder to hit and every number in the report mean something else)
    if (sess?.supportedFrameRates && Array.prototype.includes.call(sess.supportedFrameRates, 72)) void sess.updateTargetFrameRate?.(72).catch(() => undefined);
    tale?.log(`session:${sess?.environmentBlendMode ?? '?'}:features:${(sess?.enabledFeatures ?? []).join(',')}:foveation:${world.renderer.xr.getFoveation() ?? '?'}`);
    // pinches and coming back to the session count as gestures (the context may have been suspended)
    const s = world.renderer.xr.getSession();
    s?.addEventListener('selectstart', unlock);
    s?.addEventListener('squeezestart', unlock);
    s?.addEventListener('visibilitychange', () => {
      if (s.visibilityState === 'visible') unlock();
    });
  });

  const params = new URLSearchParams(location.search);
  stage.attach(world);

  {
    world.globals.worldMode = 'tale';
    world.scene.background = null;
    world.registerSystem(TaleSystem);
    const tale = world.getSystem(TaleSystem)!;
    if (params.has('demo')) {
      // the page plays itself on this screen; a click turns the sound on
      tale.demo = true;
      world.globals.started = true;
      tale.begin();
      const tip = document.createElement('div');
      tip.textContent = 'Click anywhere for sound';
      tip.style.cssText = 'position:fixed;left:50%;bottom:18px;transform:translateX(-50%);z-index:30;padding:8px 18px;border-radius:999px;background:rgba(30,18,12,0.7);color:#f3e6cc;font:italic 15px Georgia,serif;pointer-events:none;transition:opacity .6s';
      document.body.appendChild(tip);
      window.addEventListener('pointerdown', () => (tip.style.opacity = '0'), { once: true });
    } else {
      showTaleStart(world, () => tale.begin());
    }
    // desktop view: look at the book
    world.camera.position.set(0, 1.2, 0.05);
    world.camera.lookAt(0, 0.86, -0.5);
  }

  // the frame-rate readout: the lantern menu (Book > Frame rate) turns it on, or ?perf in the URL
  {
    const tale = world.getSystem(TaleSystem)!;
    const hud = new PerfHud(world, params.has('perf') || (tale.comfort.fps ?? 'off') !== 'off', () => tale.whereLabel(), () => `shadow ${tale.cpuShadowMs.toFixed(1)} ms · read ${tale.cpuReadMs.toFixed(1)} ms`);
    hud.mode = tale.comfort.fps === 'report' ? 'report' : 'live';
    tale.perfHud = hud;
  }

  if (import.meta.env.DEV) {
    const tale = world.getSystem(TaleSystem);
    (window as unknown as Record<string, unknown>).__alchemy = {
      world,
      audio,
      tale,
      debug: () => ({ world: 'tale', tale: tale?.snapshot() }),
    };
  }
});
