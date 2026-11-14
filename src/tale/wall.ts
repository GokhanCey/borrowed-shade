import { AdditiveBlending, Mesh, PlaneGeometry, ShaderMaterial, Texture, Vector4 } from '@iwsdk/core';

/**
 * "YOURS." ON THE WALL. At the Hollow's twist, the lantern's beam goes past the paper screen and
 * throws the reader's own hand shadow, very large, into a warm pool of light on the dark behind
 * the book: the hand the Hollow was afraid of, as the Hollow saw it.
 *
 * It shows the reader's LIVE hand when one is in the beam (move your fingers and the giant hand
 * moves), and otherwise the page 1 hand that put out the sun (the echo), softened. The framing is
 * the screen's stage, so the wall is the screen's own picture, enlarged (about 7 times).
 *
 * One additive quad: light where there is no hand, nothing where the hand is. Hidden when off.
 */
export class HandWall {
  readonly mesh: Mesh;
  private mat: ShaderMaterial;
  private on = 0;
  private want = 0;
  private echoMix = 0;
  /** source chosen this frame: 'live' | 'echo' | 'none' */
  source: 'live' | 'echo' | 'none' = 'none';

  /** w, h: the wall in metres (the stage's aspect, 0.46 : 0.25) */
  constructor(w = 3.6, h = 3.6 * (0.25 / 0.46)) {
    this.mat = new ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      premultipliedAlpha: true,
      uniforms: {
        uHand: { value: null as Texture | null },
        uHandRect: { value: new Vector4(0, 0, 1, 1) },
        uEcho: { value: null as Texture | null },
        uEchoMix: { value: 0 },
        uOn: { value: 0 },
        uTime: { value: 0 },
      },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        uniform sampler2D uHand;
        uniform vec4 uHandRect;
        uniform sampler2D uEcho;
        uniform float uEchoMix;
        uniform float uOn;
        uniform float uTime;
        varying vec2 vUv;
        // the picture is lifted on the wall so the hand (low on the screen) lands in the pool, above the book
        const float LIFT = 0.1;
        float hand(vec2 uv) {
          uv.y -= LIFT;
          if (uv.y < 0.0 || uv.y > 1.0) return 0.0;
          vec2 h = uHandRect.xy + uv * uHandRect.zw;
          // a soft edge: five taps (the shadow of a near hand from a small flame is a little blurred)
          vec2 d = uHandRect.zw * vec2(0.004, 0.0074);
          float s = texture2D(uHand, h).r * 0.4;
          s += texture2D(uHand, h + vec2(d.x, 0.0)).r * 0.15;
          s += texture2D(uHand, h - vec2(d.x, 0.0)).r * 0.15;
          s += texture2D(uHand, h + vec2(0.0, d.y)).r * 0.15;
          s += texture2D(uHand, h - vec2(0.0, d.y)).r * 0.15;
          return s;
        }
        void main() {
          // the pool of lantern light: warm, brightest a little above the middle, a ragged soft rim
          vec2 p = (vUv - vec2(0.5, 0.56)) * vec2(1.84, 1.0);
          float r = length(p);
          // the pool fits inside the quad (its soft rim is never cut by the edge)
          float rim = 0.42 + 0.012 * sin(atan(p.y, p.x) * 9.0 + uTime * 0.7);
          float pool = smoothstep(rim, rim - 0.3, r);
          if (pool <= 0.0) discard;
          float flick = 0.94 + 0.06 * sin(uTime * 7.3) * sin(uTime * 3.1);
          vec2 eu = vUv - vec2(0.0, LIFT);
          float echo = eu.y < 0.0 || eu.y > 1.0 ? 0.0 : texture2D(uEcho, eu).r;
          float sh = mix(hand(vUv), echo, uEchoMix);
          vec3 warm = vec3(1.0, 0.72, 0.42);
          vec3 col = warm * pool * flick * (1.0 - 0.96 * clamp(sh, 0.0, 1.0)) * 0.55;
          // light only: alpha follows the light, so over passthrough nothing dark is drawn
          vec3 c = col * uOn;
          gl_FragColor = vec4(c, max(c.r, max(c.g, c.b)));
        }`,
    });
    this.mesh = new Mesh(new PlaneGeometry(w, h), this.mat);
    this.mesh.name = 'Hand on the wall';
    this.mesh.renderOrder = -5;
    this.mesh.visible = false;
  }

  /** the live hand target, and where the screen's stage sits inside it (uv x0, y0, width, height) */
  setHand(tex: Texture, x0: number, y0: number, w: number, h: number): void {
    this.mat.uniforms.uHand.value = tex;
    (this.mat.uniforms.uHandRect.value as Vector4).set(x0, y0, w, h);
  }

  /** the page 1 hand (stage grid, red channel), or null */
  setEcho(tex: Texture | null): void {
    this.mat.uniforms.uEcho.value = tex;
  }

  show(on: boolean): void {
    this.want = on ? 1 : 0;
  }

  get shown(): boolean {
    return this.on > 0.01;
  }

  /** liveHand: a hand is in the beam right now */
  update(dt: number, t: number, liveHand: boolean): void {
    // grows in over 1.5 s, fades over 1.5 s
    this.on += Math.sign(this.want - this.on) * Math.min(Math.abs(this.want - this.on), dt / 1.5);
    const hasEcho = !!this.mat.uniforms.uEcho.value;
    const wantEcho = !liveHand && hasEcho ? 1 : 0;
    this.echoMix += (wantEcho - this.echoMix) * Math.min(1, dt * 2.5);
    this.source = liveHand ? 'live' : hasEcho ? 'echo' : 'none';
    this.mat.uniforms.uEchoMix.value = this.echoMix;
    this.mat.uniforms.uOn.value = this.on * this.on * (3 - 2 * this.on);
    this.mat.uniforms.uTime.value = t;
    this.mesh.visible = this.on > 0.003 && !!this.mat.uniforms.uHand.value;
  }
}
