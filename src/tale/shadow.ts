import {
  Color,
  Matrix4,
  MeshBasicMaterial,
  OrthographicCamera,
  PerspectiveCamera,
  ShaderMaterial,
  Vector2,
  Vector3,
  Vector4,
  WebGLRenderTarget,
  type Object3D,
  type Scene,
  type WebGLRenderer,
} from '@iwsdk/core';
import { BOOK } from './book.js';
import { paperTexture } from './paper.js';

/** Layer for the player's hands (separate from the village). */
export const HAND_LAYER = 4;

/** half the width of the screen region the hand beam covers (board metres) */
export const HAND_HALF = 0.34;
/** hand target resolution: 512 px over 2 × HAND_HALF = 1.33 mm per pixel on the screen */
export const HAND_PX = 512;

/**
 * Shadow-puppetry, cheaply, with two lights:
 *  - the VILLAGE: a perspective camera at the lantern-side light renders the
 *    pop-up scenery (red) so it throws big, atmospheric shadows up the screen;
 *  - the HANDS: an orthographic "lens-lantern" beam renders only the reader's
 *    hands into their own target. A parallel beam means the shadow's size does
 *    not depend on how far the hand is, so nobody has to lean. The same target
 *    is what the matcher reads back to compare your shadow with the outline.
 */
export class ShadowCaster {
  readonly camera = new PerspectiveCamera(80, 1, 0.02, 2);
  readonly target = new WebGLRenderTarget(512, 512);
  /** page 1's village shadow, kept for the Hollow's replay (rendered once, when asked) */
  readonly memTarget = new WebGLRenderTarget(512, 512);
  /** render the village into memTarget on the next frame */
  captureMem = false;
  /** the hand beam */
  readonly handCamera = new OrthographicCamera(-0.55, 0.55, 0.55, -0.55, 0.05, 1.3);
  readonly handTarget = new WebGLRenderTarget(HAND_PX, HAND_PX);
  readonly material: ShaderMaterial;
  private override = new MeshBasicMaterial({ color: new Color(1, 0, 0) });
  private vp = new Matrix4();
  private clearColor = new Color();
  private tmp = new Vector3();
  private v4 = new Vector4();
  /** beam frame (world): zone centre, right and up axes, the screen point S0 (board), scale */
  readonly zone = new Vector3();
  readonly right = new Vector3(1, 0, 0);
  readonly up = new Vector3(0, 1, 0);
  readonly s0 = new Vector2(0, 0.165);
  scale = 0.62;
  private villageDirty = true;

  constructor() {
    this.camera.layers.disableAll();
    this.handCamera.layers.disableAll();
    this.handCamera.layers.set(HAND_LAYER);
    this.material = new ShaderMaterial({
      uniforms: {
        uShadow: { value: this.target.texture },
        uHandShadow: { value: this.handTarget.texture },
        uHandMap: { value: new Vector4(0, 0.165, 1 / (2 * HAND_HALF), 0) },
        uScreenOffset: { value: new Vector2(0, BOOK.H / 2) },
        uVP: { value: this.vp },
        uPaper: { value: paperTexture() },
        uGlow: { value: 0 },
        uHot: { value: new Vector2(0.5, 0.45) },
        uVillage: { value: 0.75 },
        uHands: { value: 1 },
        uDusk: { value: new Color('#2b2b57') },
        uWarm: { value: new Color('#ffe2b0') },
        uDeep: { value: new Color('#c9773a') },
        uInk: { value: new Color('#1b1424') },
        uTexel: { value: 1 / 512 },
        uHandTexel: { value: 1 / HAND_PX },
        uTime: { value: 0 },
        uCaptionTop: { value: (BOOK.H - BOOK.captionH - 0.02) / BOOK.H },
        // the shadow plate: a stage-sized texture, R plate, G art, B decoration
        uPlate: { value: null },
        uPlateRect: { value: new Vector4(-0.23, 0, 0.46, 0.25) },
        /** 0 hidden .. 1 shown */
        uPlateOn: { value: 0 },
        /** 0 a black shadow plate .. 1 a sepia plate (a hand is in the light) */
        uPlateFade: { value: 0 },
        /** the missing parts pulse warm (0..1) */
        uPlateHint: { value: 0 },
        /** success: the plate floods with ink, the eye opens */
        uPlateDone: { value: 0 },
        // a light painted INTO the screen (a sun, a moon, a searchlight): your shadow covers it
        uLight: { value: new Vector4(0, 0.2, 0.03, 0.03) },
        uLightOn: { value: 0 },
        uLightCol: { value: new Color('#fff1c8') },
        /** how covered the painted light is: its halo dims and the screen darkens around it */
        uLightCov: { value: 0 },
        /** daylight (page 1's morning): 0 dusk .. 1 day */
        uDay: { value: 0 },
        uDayLow: { value: new Color('#ffe6b0') },
        uDayHigh: { value: new Color('#a9cde6') },
        /** where to put your hand: amber dashed targets (kind 1 ellipse, 2 rect, 3 dotted lane) */
        uTgtA: { value: new Vector4(0, 0, 0.01, 0.01) },
        uTgtB: { value: new Vector4(0, 0, 0.01, 0.01) },
        uTgtKind: { value: new Vector2(0, 0) },
        uTgtOn: { value: 0 },
        // "Yours.": page 1's village shadow (uMem 0..1) and the reader's captured hand (uEcho)
        uShadowMem: { value: null },
        uMem: { value: 0 },
        uEcho: { value: null },
        uEchoOn: { value: 0 },
        uEchoOff: { value: new Vector2(0, 0) },
        uEchoShear: { value: 0 },
        uEchoBase: { value: 0 },
        uEchoGold: { value: 0 },
      },
      vertexShader: /* glsl */ `
        uniform mat4 uVP;
        uniform vec2 uScreenOffset;
        varying vec4 vShadow;
        varying vec2 vUv;
        varying vec2 vPaperUv;
        varying vec2 vBoard;
        void main() {
          vec4 world = modelMatrix * vec4(position, 1.0);
          vShadow = uVP * world;
          vUv = uv;
          vBoard = position.xy + uScreenOffset;
          vPaperUv = position.xy * 9.0;
          gl_Position = projectionMatrix * viewMatrix * world;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform sampler2D uShadow;
        uniform sampler2D uHandShadow;
        uniform sampler2D uPaper;
        uniform vec4 uHandMap;
        uniform float uGlow, uVillage, uHands, uTexel, uHandTexel, uTime, uCaptionTop;
        uniform vec2 uHot;
        uniform vec3 uDusk, uWarm, uDeep, uInk;
        uniform sampler2D uPlate;
        uniform vec4 uPlateRect;
        uniform float uPlateOn, uPlateFade, uPlateHint, uPlateDone;
        uniform vec4 uLight;
        uniform float uLightOn, uLightCov, uDay, uTgtOn;
        uniform vec3 uLightCol, uDayLow, uDayHigh;
        uniform vec4 uTgtA, uTgtB;
        uniform sampler2D uShadowMem, uEcho;
        uniform float uMem, uEchoOn, uEchoShear, uEchoBase, uEchoGold;
        uniform vec2 uEchoOff;
        // the reader's captured hand (stage grid, crisp edges), slid and leaned
        float echoAt(vec2 pb) {
          vec2 q = pb - uEchoOff;
          q.x -= uEchoShear * max(0.0, q.y - uEchoBase);
          vec2 eu = (q - vec2(-0.23, 0.0)) / vec2(0.46, 0.25);
          if (eu.x <= 0.0 || eu.x >= 1.0 || eu.y <= 0.0 || eu.y >= 1.0) return 0.0;
          return smoothstep(0.42, 0.58, texture2D(uEcho, eu).r);
        }
        float villageMem(vec2 st, float r) {
          float acc = texture2D(uShadowMem, st).r * 0.4;
          acc += texture2D(uShadowMem, st + vec2( r, 0.0)).r * 0.15;
          acc += texture2D(uShadowMem, st + vec2(-r, 0.0)).r * 0.15;
          acc += texture2D(uShadowMem, st + vec2(0.0,  r)).r * 0.15;
          acc += texture2D(uShadowMem, st + vec2(0.0, -r)).r * 0.15;
          return acc;
        }
        uniform vec2 uTgtKind;
        // an amber dashed outline: 1 on the dashes
        float target(vec4 t, float kind, vec2 pb) {
          if (kind < 0.5) return 0.0;
          vec2 q = (pb - t.xy);
          float edge, along;
          if (kind < 1.5) {
            vec2 n = q / t.zw;
            float r = length(n);
            edge = abs(r - 1.0) * min(t.z, t.w);
            along = atan(n.y, n.x) / 6.2832 * 14.0;
          } else {
            vec2 d = abs(q) - t.zw;
            edge = abs(length(max(d, 0.0)) + min(max(d.x, d.y), 0.0));
            along = (q.x + q.y) / 0.008;
          }
          float line = 1.0 - smoothstep(0.0008, 0.0016, edge);
          float dash = step(0.5, fract(along + uTime * 0.15));
          if (kind > 2.5) {
            // a dotted lane: dots along its middle, plus the faint outline
            float dots = 1.0 - smoothstep(0.0012, 0.0022, length(vec2(fract(q.x / 0.008) * 0.008 - 0.004, q.y)));
            return max(line * dash * 0.6, dots * step(abs(q.x), t.z));
          }
          return line * dash;
        }
        varying vec4 vShadow;
        varying vec2 vUv;
        varying vec2 vPaperUv;
        varying vec2 vBoard;
        float village(vec2 st, float r) {
          float acc = texture2D(uShadow, st).r * 0.4;
          acc += texture2D(uShadow, st + vec2( r, 0.0)).r * 0.15;
          acc += texture2D(uShadow, st + vec2(-r, 0.0)).r * 0.15;
          acc += texture2D(uShadow, st + vec2(0.0,  r)).r * 0.15;
          acc += texture2D(uShadow, st + vec2(0.0, -r)).r * 0.15;
          return acc;
        }
        float hands(vec2 st, float r) {
          float acc = texture2D(uHandShadow, st).r * 0.4;
          acc += texture2D(uHandShadow, st + vec2( r, 0.0)).r * 0.15;
          acc += texture2D(uHandShadow, st + vec2(-r, 0.0)).r * 0.15;
          acc += texture2D(uHandShadow, st + vec2(0.0,  r)).r * 0.15;
          acc += texture2D(uHandShadow, st + vec2(0.0, -r)).r * 0.15;
          return acc;
        }
        void main() {
          float fibre = texture2D(uPaper, vPaperUv).r;
          // the lantern's hot spot glowing through the paper
          float d = distance(vUv * vec2(1.35, 1.0), uHot * vec2(1.35, 1.0));
          float hot = exp(-d * d * 4.5) * 0.72;
          vec3 lit = mix(uDeep, uWarm, hot);
          float top = smoothstep(0.35, 1.0, vUv.y);
          vec3 base = mix(lit, uDusk * 1.4, top * 0.55);
          vec3 col = mix(uDusk * 0.55, base, uGlow * (0.55 + 0.45 * hot));
          col *= 0.86 + 0.14 * fibre;
          // morning: a pale day sky over the dusk (page 1, until the sun is covered)
          if (uDay > 0.001) col = mix(col, mix(uDayLow, uDayHigh, smoothstep(0.2, 1.0, vUv.y)) * (0.86 + 0.14 * fibre), uDay * 0.85);
          if (uLightOn > 0.001) {
            vec2 q = (vBoard - uLight.xy) / uLight.zw;
            float r = length(q);
            float disc = smoothstep(1.0, 0.94, r);
            float halo = exp(-max(0.0, r - 1.0) * 2.6) * 0.55 * (1.0 - 0.85 * uLightCov) * (0.35 + 0.65 * max(uDay, 1.0 - uDay));
            // the screen darkens around a light you are covering
            col *= 1.0 - 0.3 * uLightCov * uLightOn * exp(-max(0.0, r - 1.0) * 1.2);
            col = mix(col, uLightCol, disc * uLightOn);
            col += uLightCol * halo * (1.0 - disc) * uLightOn * 0.6;
          }
          float sh = 0.0;
          float hs = 0.0;
          float gold = 0.0;
          if (vUv.y < uCaptionTop) {
            // the village, from the lantern-side light
            if (vShadow.w > 0.0) {
              vec2 st = vShadow.xy / vShadow.w * 0.5 + 0.5;
              if (st.x > 0.0 && st.x < 1.0 && st.y > 0.0 && st.y < 1.0) {
                sh = village(st, uTexel * 1.1) * uVillage;
                if (uMem > 0.001) sh = mix(sh, villageMem(st, uTexel * 1.1) * uVillage, uMem);
              }
            }
            // the hands, from the lens-lantern beam
            vec2 hst = (vBoard - uHandMap.xy) * uHandMap.z + 0.5;
            if (hst.x > 0.0 && hst.x < 1.0 && hst.y > 0.0 && hst.y < 1.0) hs = hands(hst, uHandTexel * 1.2) * uHands;
            float fade = smoothstep(uCaptionTop, uCaptionTop - 0.03, vUv.y);
            hs = smoothstep(0.12, 0.6, hs) * fade;
            sh = max(smoothstep(0.12, 0.6, sh) * fade, hs);
            // the reader's own hand, as it was on page 1, in the same ink as a live shadow
            if (uEchoOn > 0.001) {
              float e = echoAt(vBoard);
              sh = max(sh, e * 0.95 * uEchoOn * fade);
              if (uEchoGold > 0.001) {
                vec2 dx = vec2(0.0016, 0.0);
                vec2 dy = vec2(0.0, 0.0016);
                float en = min(min(echoAt(vBoard + dx), echoAt(vBoard - dx)), min(echoAt(vBoard + dy), echoAt(vBoard - dy)));
                gold = max(clamp(e - en, 0.0, 1.0) * step(0.2, hs), e * hs * 0.3) * uEchoGold * uEchoOn;
              }
            }
          }
          vec3 paperCol = col;
          float inkK = mix(0.4 + 0.58 * uGlow, 0.95, uDay);
          if (uPlateOn > 0.001) {
            vec2 pu = (vBoard - uPlateRect.xy) / uPlateRect.zw;
            if (pu.x > 0.0 && pu.x < 1.0 && pu.y > 0.0 && pu.y < 1.0) {
              vec3 pt = texture2D(uPlate, pu).rgb;
              float plate = pt.r;
              // the plate's edge (1.5 mm in), for the warm rim where your shadow meets it
              vec2 e = vec2(0.0015) / uPlateRect.zw;
              float nb = min(min(texture2D(uPlate, pu + vec2(e.x, 0.0)).r, texture2D(uPlate, pu - vec2(e.x, 0.0)).r),
                             min(texture2D(uPlate, pu + vec2(0.0, e.y)).r, texture2D(uPlate, pu - vec2(0.0, e.y)).r));
              float edge = clamp(plate - nb, 0.0, 1.0);
              float covered = plate * hs;
              float missing = plate * (1.0 - hs);
              float spill = hs * (1.0 - plate);
              // spill reads pale while a plate waits (the extra is visibly "too much")
              sh -= spill * 0.32 * uPlateFade * uPlateOn * (1.0 - uPlateDone);
              // the plate itself: black at first, sepia once a hand is in the light; full ink when done
              float plateInk = mix(0.92, 0.6, uPlateFade);
              plateInk = mix(plateInk, 1.0, uPlateDone);
              sh = max(sh, plate * plateInk * uPlateOn);
              // the jib and other decoration: soft grey
              sh = max(sh, pt.b * 0.45 * uPlateOn);
              col = mix(col, uInk, sh * inkK);
              // missing parts breathe warm when the tale is helping
              float pulse = 0.5 + 0.5 * sin(uTime * 4.0);
              col = mix(col, uWarm * 0.85, missing * uPlateHint * uPlateOn * pulse * 0.45 * (1.0 - uPlateDone));
              // a warm rim where your shadow fills the plate's edge, brighter on success
              col += uWarm * edge * covered * uPlateOn * (0.35 + 0.9 * uPlateDone);
              // art details (eyes, windows) stay paper-light; on success they glow through your shadow
              col = mix(col, mix(paperCol * 1.05, uWarm, uPlateDone), pt.g * uPlateOn * max(1.0 - hs, uPlateDone));
              sh = -1.0;
            }
          }
          if (sh >= 0.0) col = mix(col, uInk, sh * inkK);
          // where your live hand meets the remembered one: gold
          col = mix(col, vec3(0.91, 0.69, 0.29), gold);
          // the amber target sits over the ink, so it stays readable under your hand
          if (uTgtOn > 0.001 && vUv.y < uCaptionTop) {
            float tg = max(target(uTgtA, uTgtKind.x, vBoard), target(uTgtB, uTgtKind.y, vBoard));
            col = mix(col, vec3(1.0, 0.7, 0.28), tg * uTgtOn);
          }
          gl_FragColor = vec4(col, 1.0);
          #include <colorspace_fragment>
        }
      `,
    });
  }

  /** Point the village camera from the light at the screen centre, wide enough to cover it. */
  aim(light: Vector3, screenCentre: Vector3, screenCorners: Vector3[]): void {
    const before = this.vp.elements.slice();
    this.camera.position.copy(light);
    this.camera.lookAt(screenCentre);
    this.camera.updateMatrixWorld(true);
    let maxTan = 0.2;
    const inv = this.camera.matrixWorldInverse;
    for (const c of screenCorners) {
      const p = this.tmp.copy(c).applyMatrix4(inv);
      if (p.z < -1e-3) maxTan = Math.max(maxTan, Math.abs(p.x / p.z), Math.abs(p.y / p.z));
    }
    this.camera.fov = (Math.atan(maxTan * 1.08) * 2 * 180) / Math.PI;
    this.camera.aspect = 1;
    this.camera.updateProjectionMatrix();
    this.vp.multiplyMatrices(this.camera.projectionMatrix, this.camera.matrixWorldInverse);
    for (let i = 0; i < 16; i++) if (Math.abs(before[i] - this.vp.elements[i]) > 1e-6) {
      this.villageDirty = true;
      break;
    }
  }

  /** The village must be re-rendered (its scene rose, a page turned...). */
  markVillage(): void {
    this.villageDirty = true;
  }

  /**
   * Aim the hand beam: from the comfortable hand zone (world) toward the screen
   * point S0 (board-local) whose world position is `s0World`; `scale` = screen
   * metres per hand metre (calibrated to the reader's hand).
   */
  aimHands(zoneWorld: Vector3, s0World: Vector3, s0Board: Vector2, worldUp: Vector3, scale: number): void {
    this.zone.copy(zoneWorld);
    this.s0.copy(s0Board);
    this.scale = scale;
    const dir = this.tmp.copy(s0World).sub(zoneWorld).normalize();
    this.handCamera.position.copy(zoneWorld).addScaledVector(dir, -0.6);
    this.handCamera.up.copy(worldUp);
    this.handCamera.lookAt(zoneWorld);
    const half = HAND_HALF / scale;
    this.handCamera.left = -half;
    this.handCamera.right = half;
    this.handCamera.top = half;
    this.handCamera.bottom = -half;
    this.handCamera.updateProjectionMatrix();
    this.handCamera.updateMatrixWorld(true);
    this.right.setFromMatrixColumn(this.handCamera.matrixWorld, 0).normalize();
    this.up.setFromMatrixColumn(this.handCamera.matrixWorld, 1).normalize();
    (this.material.uniforms.uHandMap.value as Vector4).set(s0Board.x, s0Board.y, 1 / (2 * HAND_HALF), 0);
  }

  /** Where a world point's shadow lands on the screen (board-local x, y). */
  handToBoard(world: Vector3, out = new Vector2()): Vector2 {
    const d = this.tmp.copy(world).sub(this.zone);
    return out.set(this.s0.x + this.scale * d.dot(this.right), this.s0.y + this.scale * d.dot(this.up));
  }

  /** Where a hand should be (world) to cast onto board point o. */
  boardToHand(o: Vector2, out = new Vector3()): Vector3 {
    return out.copy(this.zone).addScaledVector(this.right, (o.x - this.s0.x) / this.scale).addScaledVector(this.up, (o.y - this.s0.y) / this.scale);
  }

  /** board-local point -> pixel in the hand target */
  boardToPx(x: number, y: number, out = new Vector2()): Vector2 {
    return out.set(((x - this.s0.x) / (2 * HAND_HALF) + 0.5) * HAND_PX, ((y - this.s0.y) / (2 * HAND_HALF) + 0.5) * HAND_PX);
  }

  /** Render the shadow targets: the village when it changed, the hands every frame. */
  render(renderer: WebGLRenderer, scene: Scene, handsOn = true): void {
    const xr = renderer.xr;
    const xrWas = xr.enabled;
    const prevTarget = renderer.getRenderTarget();
    const prevBg = scene.background;
    const prevOverride = scene.overrideMaterial;
    renderer.getClearColor(this.clearColor);
    const prevAlpha = renderer.getClearAlpha();
    xr.enabled = false;
    scene.background = null;
    scene.overrideMaterial = this.override;
    renderer.setClearColor(0x000000, 1);
    if (this.captureMem) {
      this.captureMem = false;
      renderer.setRenderTarget(this.memTarget);
      renderer.clear(true, true, false);
      this.override.color.setRGB(1, 0, 0);
      this.camera.layers.set(BOOK.SHADOW_LAYER);
      renderer.render(scene, this.camera);
    }
    if (this.villageDirty) {
      this.villageDirty = false;
      renderer.setRenderTarget(this.target);
      renderer.clear(true, true, false);
      this.override.color.setRGB(1, 0, 0);
      this.camera.layers.set(BOOK.SHADOW_LAYER);
      renderer.render(scene, this.camera);
    }
    renderer.setRenderTarget(this.handTarget);
    renderer.clear(true, true, false);
    if (handsOn) {
      this.override.color.setRGB(1, 1, 1);
      renderer.render(scene, this.handCamera);
    }
    renderer.setRenderTarget(prevTarget);
    renderer.setClearColor(this.clearColor, prevAlpha);
    scene.background = prevBg;
    scene.overrideMaterial = prevOverride;
    xr.enabled = xrWas;
  }

  /** Where a world point lands in the village light's view (kept for scenery tests). */
  project(world: Vector3, out = new Vector3()): Vector3 {
    this.v4.set(world.x, world.y, world.z, 1).applyMatrix4(this.vp);
    if (this.v4.w <= 0) return out.set(9, 9, 9);
    return out.set(this.v4.x / this.v4.w, this.v4.y / this.v4.w, this.v4.z / this.v4.w);
  }

  /** Put every mesh of a hand model on the hand layer (idempotent). */
  static tagHand(model: Object3D | undefined): void {
    model?.traverse((o) => o.layers.enable(HAND_LAYER));
  }
}
