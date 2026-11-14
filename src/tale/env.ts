import {
  AdditiveBlending,
  BackSide,
  BufferGeometry,
  CanvasTexture,
  Color,
  CylinderGeometry,
  Float32BufferAttribute,
  Group,
  Mesh,
  MeshStandardMaterial,
  Points,
  ShaderMaterial,
  SphereGeometry,
  SRGBColorSpace,
} from '@iwsdk/core';
import { glowTexture } from './book.js';

/**
 * The dark theatre: used in a VR session, or in your room when you switch the
 * room off. A warm dark room, a wooden table under the book, and a few motes
 * of dust drifting in the lantern light. All stage-local (origin = head).
 */
export class Theatre {
  readonly root = new Group();
  readonly table: Mesh;
  private dust: Points;
  private dustMat: ShaderMaterial;

  constructor(tableY: number, bookCentreZ: number) {
    this.root.name = 'Theatre';
    // a dome: almost black, warmer and lighter low in front (as if lit by the lantern)
    const dome = new Mesh(
      new SphereGeometry(6, 32, 16),
      new ShaderMaterial({
        side: BackSide,
        depthWrite: false,
        uniforms: { uLow: { value: new Color('#2a1c18') }, uHigh: { value: new Color('#07060f') }, uFront: { value: new Color('#3a2418') } },
        vertexShader: /* glsl */ `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
        fragmentShader: /* glsl */ `
          uniform vec3 uLow, uHigh, uFront; varying vec3 vDir;
          void main(){
            float h = smoothstep(-0.4, 0.6, vDir.y);
            vec3 c = mix(uLow, uHigh, h);
            float front = max(0.0, -vDir.z) * (1.0 - h);
            c += uFront * front * 0.6;
            gl_FragColor = vec4(c, 1.0);
            #include <colorspace_fragment>
          }`,
      }),
    );
    dome.name = 'Theatre dome';
    dome.renderOrder = -10;
    // the table: a round wooden top on a dark base
    this.table = new Mesh(new CylinderGeometry(0.62, 0.62, 0.035, 48), new MeshStandardMaterial({ map: woodTexture(), roughness: 0.75, color: new Color('#c9a27c') }));
    this.table.position.set(0, tableY - 0.0175, bookCentreZ);
    this.table.name = 'Theatre table';
    const leg = new Mesh(new CylinderGeometry(0.07, 0.12, 0.7, 20), new MeshStandardMaterial({ color: new Color('#1d1411'), roughness: 0.9 }));
    leg.position.set(0, tableY - 0.035 - 0.35, bookCentreZ);
    // dust motes
    const n = 90;
    const pos: number[] = [];
    const seed: number[] = [];
    for (let k = 0; k < n; k++) {
      pos.push((Math.random() - 0.5) * 0.7, tableY + Math.random() * 0.45, bookCentreZ + (Math.random() - 0.5) * 0.6);
      seed.push(Math.random());
    }
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute(pos, 3));
    g.setAttribute('aSeed', new Float32BufferAttribute(seed, 1));
    this.dustMat = new ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      uniforms: { uTime: { value: 0 }, uMap: { value: glowTexture() }, uLevel: { value: 0 }, uScale: { value: 900 } },
      vertexShader: /* glsl */ `
        attribute float aSeed; uniform float uTime, uScale; varying float vA;
        void main(){
          vec3 p = position;
          p.y += mod(uTime * (0.004 + aSeed * 0.006) + aSeed * 0.45, 0.45) - 0.2;
          p.x += sin(uTime * 0.3 + aSeed * 30.0) * 0.02;
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mv;
          gl_PointSize = uScale * (0.0025 + aSeed * 0.002) / -mv.z;
          vA = 0.35 + 0.65 * sin(uTime * 0.8 + aSeed * 40.0) * 0.5 + 0.5;
        }`,
      fragmentShader: /* glsl */ `
        uniform sampler2D uMap; uniform float uLevel; varying float vA;
        void main(){ vec4 t = texture2D(uMap, gl_PointCoord); gl_FragColor = vec4(t.rgb, t.a * vA * uLevel * 0.5); }`,
    });
    this.dust = new Points(g, this.dustMat);
    this.dust.name = 'Dust motes';
    this.dust.frustumCulled = false;
    this.root.add(dome, this.table, leg, this.dust);
  }

  update(t: number, lantern: number, viewportHeight: number): void {
    this.dustMat.uniforms.uTime.value = t;
    this.dustMat.uniforms.uLevel.value = lantern;
    this.dustMat.uniforms.uScale.value = viewportHeight;
  }
}

function woodTexture(): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d')!;
  g.fillStyle = '#7a5236';
  g.fillRect(0, 0, 256, 256);
  for (let y = 0; y < 256; y += 2) {
    const v = Math.sin(y * 0.15) * 0.5 + Math.sin(y * 0.031 + 2) * 0.5;
    g.fillStyle = `rgba(${v > 0 ? 40 : 120},${v > 0 ? 24 : 80},${v > 0 ? 14 : 50},${0.12 + Math.abs(v) * 0.12})`;
    g.fillRect(0, y, 256, 2);
  }
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  return t;
}
