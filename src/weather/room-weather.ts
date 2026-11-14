import { AdditiveBlending, BufferGeometry, Color, Float32BufferAttribute, Group, LineSegments, Mesh, MeshBasicMaterial, PlaneGeometry, Points, ShaderMaterial, type Texture } from '@iwsdk/core';

/**
 * THE WEATHER COMES OFF THE PAGE (The Four Elements).
 *
 * What the reader makes on the screen happens, quietly, in the room around the desk too:
 *   rain   fine streaks fall all round the desk (never between the reader and the book: the lantern
 *          keeps its circle dry), and the room goes a little blue
 *   wind   pale streaks run through the room from left to right, the way the wind on the screen blows
 *   fire   a warm light breathes on the walls behind and beside the desk, and sparks rise
 * It follows the screen's own weather (the same amounts), so it never needs telling.
 * Real, small and slow: nothing here flashes or crosses the picture.
 *
 * Four draw calls at most, each hidden when it has nothing to show. No work per frame but a few uniforms.
 */
export class RoomWeather {
  readonly root = new Group();
  private rain: LineSegments;
  private wind: LineSegments;
  private sparks: Points;
  private glow: Mesh[] = [];
  private rainMat: ShaderMaterial;
  private windMat: ShaderMaterial;
  private sparkMat: ShaderMaterial;
  private glowMat: MeshBasicMaterial;
  private t = 0;
  private rainA = 0;
  private windA = 0;
  private warmA = 0;
  private cWarm = new Color('#ff8a3c');
  private cWet = new Color('#4d6fa8');

  /** tableY: the desk's height; bookZ: the middle of the book (both in the tale root's frame, head at the origin) */
  constructor(tableY: number, bookZ: number, glowMap: Texture) {
    this.root.name = 'Room weather';
    let seed = 20261112;
    const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
    // (the dry circle: the book, the reader, and everything between them)
    const dry = (x: number, z: number) => Math.abs(x) < 0.46 && z > bookZ - 0.3;

    // ---- rain ---------------------------------------------------------------------------------------
    {
      const pos: number[] = [];
      const info: number[] = [];
      let n = 0;
      while (n < 300) {
        const x = (rnd() - 0.5) * 3.2;
        const z = bookZ - 1.7 + rnd() * 2.5;
        if (dry(x, z)) continue;
        const s = rnd();
        pos.push(x, 0, z, x, 0, z);
        info.push(s, 0, s, 1);
        n++;
      }
      const g = new BufferGeometry();
      g.setAttribute('position', new Float32BufferAttribute(pos, 3));
      g.setAttribute('aInfo', new Float32BufferAttribute(info, 2));
      this.rainMat = new ShaderMaterial({
        transparent: true,
        depthWrite: false,
        uniforms: { uTime: { value: 0 }, uAmount: { value: 0 }, uTop: { value: tableY + 1.45 }, uRange: { value: 1.9 } },
        vertexShader: /* glsl */ `
          attribute vec2 aInfo; uniform float uTime, uTop, uRange; varying float vA;
          void main() {
            float s = aInfo.x;
            float fall = mod(uTime * (1.7 + s * 0.9) + s * 37.0, uRange);
            vec3 p = position;
            p.y = uTop - fall + aInfo.y * (0.05 + s * 0.045);
            p.x += aInfo.y * 0.01 - fall * 0.05;
            vA = smoothstep(0.0, 0.25, fall) * smoothstep(uRange, uRange - 0.3, fall) * (0.5 + 0.5 * s) * (1.0 - 0.6 * aInfo.y);
            gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
          }`,
        fragmentShader: /* glsl */ `
          precision mediump float; uniform float uAmount; varying float vA;
          void main() { gl_FragColor = vec4(0.74, 0.83, 0.96, vA * uAmount * 0.5); }`,
      });
      this.rain = new LineSegments(g, this.rainMat);
      this.rain.name = 'Room rain';
    }

    // ---- wind ---------------------------------------------------------------------------------------
    {
      const pos: number[] = [];
      const info: number[] = [];
      let n = 0;
      while (n < 70) {
        const z = bookZ - 1.5 + rnd() * 2.1;
        // (behind the book, or out to the sides: never across the picture)
        const side = z > bookZ - 0.3;
        const y = tableY + 0.08 + rnd() * 1.0;
        const s = rnd();
        const lane = side ? (rnd() > 0.5 ? 1 : -1) * (0.55 + rnd() * 0.9) : 0;
        pos.push(lane, y, z, lane, y, z);
        info.push(s, 0, s, 1);
        n++;
      }
      const g = new BufferGeometry();
      g.setAttribute('position', new Float32BufferAttribute(pos, 3));
      g.setAttribute('aInfo', new Float32BufferAttribute(info, 2));
      this.windMat = new ShaderMaterial({
        transparent: true,
        depthWrite: false,
        uniforms: { uTime: { value: 0 }, uAmount: { value: 0 } },
        vertexShader: /* glsl */ `
          attribute vec2 aInfo; uniform float uTime; varying float vA;
          void main() {
            float s = aInfo.x;
            vec3 p = position;
            // a lane of its own at the sides (position.x != 0): a short run there; behind the book: right across the room
            float span = p.x == 0.0 ? 3.4 : 0.7;
            float x0 = p.x == 0.0 ? -1.7 : p.x - 0.35;
            float run = mod(uTime * (0.55 + s * 0.5) + s * 23.0, span);
            float x = run - aInfo.y * (0.16 + s * 0.14);
            p.x = x0 + x;
            p.y += 0.035 * sin(x * 3.2 + s * 40.0 + uTime * 0.7);
            vA = smoothstep(0.0, 0.3, run) * smoothstep(span, span - 0.3, run) * (0.4 + 0.6 * s) * (1.0 - aInfo.y);
            gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
          }`,
        fragmentShader: /* glsl */ `
          precision mediump float; uniform float uAmount; varying float vA;
          void main() { gl_FragColor = vec4(0.96, 0.95, 0.9, vA * uAmount * 0.55); }`,
      });
      this.wind = new LineSegments(g, this.windMat);
      this.wind.name = 'Room wind';
    }

    // ---- firelight: a glow on the wall behind and on each side, and sparks -----------------------------
    {
      this.glowMat = new MeshBasicMaterial({ map: glowMap, color: this.cWarm.clone(), transparent: true, opacity: 0, depthWrite: false, blending: AdditiveBlending });
      const geo = new PlaneGeometry(1, 1);
      for (const [x, y, z, ry, w, h] of [
        [0, tableY + 0.35, bookZ - 1.5, 0, 3.4, 2.2],
        [-1.7, tableY + 0.3, bookZ - 0.2, Math.PI / 2, 2.6, 2.0],
        [1.7, tableY + 0.3, bookZ - 0.2, -Math.PI / 2, 2.6, 2.0],
      ]) {
        const m = new Mesh(geo, this.glowMat);
        m.position.set(x, y, z);
        m.rotation.y = ry;
        m.scale.set(w, h, 1);
        m.renderOrder = -5;
        m.name = 'Room glow';
        this.glow.push(m);
        this.root.add(m);
      }
      const pos: number[] = [];
      const sd: number[] = [];
      for (let k = 0; k < 46; k++) {
        const a = rnd() * Math.PI * 2;
        const r = 0.75 + rnd() * 0.7;
        const x = Math.sin(a) * r;
        const z = bookZ - Math.abs(Math.cos(a)) * r * 0.9 - 0.15;
        pos.push(x, tableY - 0.2, z);
        sd.push(rnd());
      }
      const g = new BufferGeometry();
      g.setAttribute('position', new Float32BufferAttribute(pos, 3));
      g.setAttribute('aSeed', new Float32BufferAttribute(sd, 1));
      this.sparkMat = new ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
        uniforms: { uTime: { value: 0 }, uAmount: { value: 0 }, uMap: { value: glowMap }, uScale: { value: 900 } },
        vertexShader: /* glsl */ `
          attribute float aSeed; uniform float uTime, uScale; varying float vA;
          void main() {
            float life = fract(uTime * (0.09 + aSeed * 0.08) + aSeed * 7.0);
            vec3 p = position;
            p.y += life * 1.5;
            p.x += 0.07 * sin(uTime * 0.9 + aSeed * 50.0) * life;
            p.z += 0.05 * sin(uTime * 0.7 + aSeed * 31.0) * life;
            vec4 mv = modelViewMatrix * vec4(p, 1.0);
            gl_Position = projectionMatrix * mv;
            gl_PointSize = uScale * (0.006 + aSeed * 0.005) * (1.0 - 0.5 * life) / -mv.z;
            vA = smoothstep(0.0, 0.12, life) * (1.0 - life) * (0.6 + 0.4 * sin(uTime * 6.0 + aSeed * 90.0));
          }`,
        fragmentShader: /* glsl */ `
          precision mediump float; uniform sampler2D uMap; uniform float uAmount; varying float vA;
          void main() { vec4 t = texture2D(uMap, gl_PointCoord); gl_FragColor = vec4(vec3(1.0, 0.62, 0.25) * t.rgb, t.a * vA * uAmount); }`,
      });
      this.sparks = new Points(g, this.sparkMat);
      this.sparks.name = 'Room sparks';
    }
    for (const o of [this.rain, this.wind, this.sparks]) {
      o.frustumCulled = false;
      o.visible = false;
      o.renderOrder = 30;
      this.root.add(o);
    }
  }

  /** the wind in the room, 0..1 (the mobile swings in it) */
  get gust(): number {
    return this.windA;
  }

  /**
   * dt; the screen's weather (rain, wind, warmth: 0..1 each); the viewport height in pixels (for the
   * sparks' size); `show`: false while nothing of this belongs in the room (another book, the wall)
   */
  update(dt: number, rain: number, wind: number, warm: number, viewportHeight: number, show: boolean): void {
    this.t += dt;
    const k = Math.min(1, dt * 0.9);
    this.rainA += ((show ? rain : 0) - this.rainA) * k;
    this.windA += ((show ? wind : 0) - this.windA) * k;
    this.warmA += ((show ? warm : 0) - this.warmA) * k;
    const t = this.t;
    this.rain.visible = this.rainA > 0.01;
    if (this.rain.visible) {
      this.rainMat.uniforms.uTime.value = t;
      this.rainMat.uniforms.uAmount.value = this.rainA;
    }
    this.wind.visible = this.windA > 0.01;
    if (this.wind.visible) {
      this.windMat.uniforms.uTime.value = t;
      this.windMat.uniforms.uAmount.value = this.windA;
    }
    this.sparks.visible = this.warmA > 0.01;
    if (this.sparks.visible) {
      this.sparkMat.uniforms.uTime.value = t;
      this.sparkMat.uniforms.uAmount.value = this.warmA;
      this.sparkMat.uniforms.uScale.value = viewportHeight;
    }
    // the walls: firelight breathing (never a flash: a few per cent, slowly), or the cool of the rain
    const fire = this.warmA * (0.2 + 0.035 * Math.sin(t * 5.1) + 0.025 * Math.sin(t * 8.3 + 1.3) + 0.02 * Math.sin(t * 1.7));
    const wet = this.rainA * 0.1;
    const level = Math.max(fire, wet);
    this.glowMat.opacity = level;
    if (level > 0.004) this.glowMat.color.copy(fire >= wet ? this.cWarm : this.cWet);
    for (const m of this.glow) m.visible = level > 0.004;
  }
}
