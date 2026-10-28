// PS1-style material: vertex snapping (wobble), affine texture mapping, per-vertex
// (Gouraud) lighting and per-vertex fog. All materials share one set of global
// uniforms so lights and fog are updated once per frame.

import * as THREE from 'three';

export const MAX_LIGHTS = 4;

export const globals = {
  uSnap: { value: new THREE.Vector2(160, 120) },
  uSnapOn: { value: 1 },
  uTime: { value: 0 },
  uAmbient: { value: new THREE.Color(0.12, 0.1, 0.16) },
  uDirDir: { value: new THREE.Vector3(0, -1, 0) },
  uDirColor: { value: new THREE.Color(0, 0, 0) },
  uLightPos: { value: Array.from({ length: MAX_LIGHTS }, () => new THREE.Vector3()) },
  uLightColor: { value: Array.from({ length: MAX_LIGHTS }, () => new THREE.Color(0, 0, 0)) },
  uLightRange: { value: new Array<number>(MAX_LIGHTS).fill(1) },
  uFogColor: { value: new THREE.Color(0.04, 0.03, 0.06) },
  uFogNear: { value: 6 },
  uFogFar: { value: 30 },
  uPxScale: { value: 240 },
};

const VERT = /* glsl */ `
uniform vec2 uSnap;
uniform float uSnapOn;
uniform vec3 uAmbient;
uniform vec3 uDirDir;
uniform vec3 uDirColor;
uniform vec3 uLightPos[${MAX_LIGHTS}];
uniform vec3 uLightColor[${MAX_LIGHTS}];
uniform float uLightRange[${MAX_LIGHTS}];
uniform float uFogNear;
uniform float uFogFar;
uniform float uUnlit;
uniform float uFogAmount;
uniform vec2 uUvScale;
uniform vec2 uUvOffset;
uniform float uTime;
uniform float uWave;
#ifdef USE_VCOLOR
attribute vec3 color;
#endif
varying vec3 vUvA;
varying vec3 vLight;
varying float vFog;
varying vec3 vVColor;

void main() {
  vec3 pos = position;
  if (uWave > 0.0) {
    pos.z += sin(pos.y * 2.3 + uTime * 2.0) * uWave * (0.5 - pos.y * 0.5);
    pos.x += cos(pos.y * 1.7 + uTime * 1.3) * uWave * 0.3;
  }
  vec4 mv = modelViewMatrix * vec4(pos, 1.0);
  vec4 clip = projectionMatrix * mv;
  if (uSnapOn > 0.5 && clip.w > 0.0) {
    vec2 ndc = clip.xy / clip.w;
    ndc = floor(ndc * uSnap + 0.5) / uSnap;
    clip.xy = ndc * clip.w;
  }
  gl_Position = clip;
  vec2 tuv = uv * uUvScale + uUvOffset;
  vUvA = vec3(tuv * clip.w, clip.w);

  vec3 n = normalize(normalMatrix * normal);
  vec3 light = vec3(1.0);
  if (uUnlit < 0.5) {
    light = uAmbient + uDirColor * max(dot(n, -uDirDir), 0.0);
    for (int i = 0; i < ${MAX_LIGHTS}; i++) {
      vec3 d = uLightPos[i] - mv.xyz;
      float dist = length(d);
      float att = clamp(1.0 - dist / max(uLightRange[i], 0.001), 0.0, 1.0);
      att *= att;
      float lambert = max(dot(n, d / max(dist, 0.0001)), 0.0) * 0.85 + 0.15;
      light += uLightColor[i] * att * lambert;
    }
  }
  vLight = light;
#ifdef USE_VCOLOR
  vVColor = color;
#else
  vVColor = vec3(1.0);
#endif
  vFog = smoothstep(uFogNear, uFogFar, -mv.z) * uFogAmount;
}
`;

const FRAG = /* glsl */ `
uniform sampler2D uMap;
uniform float uHasMap;
uniform vec3 uColor;
uniform vec3 uEmissive;
uniform float uOpacity;
uniform float uAlphaTest;
uniform vec3 uFogColor;
varying vec3 vUvA;
varying vec3 vLight;
varying float vFog;
varying vec3 vVColor;

void main() {
  vec2 uv = vUvA.xy / vUvA.z;
  vec4 tex = uHasMap > 0.5 ? texture2D(uMap, uv) : vec4(1.0);
  if (tex.a < uAlphaTest) discard;
  vec3 base = tex.rgb * uColor * vVColor;
  vec3 col = base * min(vLight, vec3(1.8)) + uEmissive * tex.rgb;
  col = mix(col, uFogColor, vFog);
  gl_FragColor = vec4(col, tex.a * uOpacity);
}
`;

export interface PS1Options {
  map?: THREE.Texture | null;
  color?: THREE.ColorRepresentation;
  emissive?: THREE.ColorRepresentation;
  unlit?: boolean;
  transparent?: boolean;
  opacity?: number;
  alphaTest?: number;
  side?: THREE.Side;
  uvScale?: [number, number];
  vertexColors?: boolean;
  additive?: boolean;
  depthWrite?: boolean;
  fog?: number;
  /** Cloth-like vertex wave (banners, flames). */
  wave?: number;
}

export type PS1Material = THREE.ShaderMaterial & {
  uniforms: Record<string, THREE.IUniform> & {
    uColor: THREE.IUniform<THREE.Color>;
    uEmissive: THREE.IUniform<THREE.Color>;
    uOpacity: THREE.IUniform<number>;
    uUvOffset: THREE.IUniform<THREE.Vector2>;
    uUvScale: THREE.IUniform<THREE.Vector2>;
    uMap: THREE.IUniform<THREE.Texture | null>;
    uHasMap: THREE.IUniform<number>;
  };
};

export function ps1(opts: PS1Options = {}): PS1Material {
  const mat = new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FRAG,
    uniforms: {
      ...globals,
      uMap: { value: opts.map ?? null },
      uHasMap: { value: opts.map ? 1 : 0 },
      uColor: { value: new THREE.Color(opts.color ?? 0xffffff) },
      uEmissive: { value: new THREE.Color(opts.emissive ?? 0x000000) },
      uOpacity: { value: opts.opacity ?? 1 },
      uAlphaTest: { value: opts.alphaTest ?? (opts.transparent ? 0.01 : 0.5) },
      uUnlit: { value: opts.unlit ? 1 : 0 },
      uFogAmount: { value: opts.fog ?? 1 },
      uUvScale: { value: new THREE.Vector2(...(opts.uvScale ?? [1, 1])) },
      uUvOffset: { value: new THREE.Vector2(0, 0) },
      uWave: { value: opts.wave ?? 0 },
    },
    transparent: opts.transparent ?? false,
    side: opts.side ?? THREE.FrontSide,
    depthWrite: opts.depthWrite ?? !opts.additive,
    blending: opts.additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    defines: opts.vertexColors ? { USE_VCOLOR: '' } : {},
  }) as PS1Material;
  return mat;
}

// ── Particles ────────────────────────────────────────────────

const P_VERT = /* glsl */ `
uniform vec2 uSnap;
uniform float uSnapOn;
uniform float uPxScale;
attribute float aSize;
attribute vec4 aColor;
varying vec4 vColor;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vec4 clip = projectionMatrix * mv;
  if (uSnapOn > 0.5 && clip.w > 0.0) {
    clip.xy = floor(clip.xy / clip.w * uSnap + 0.5) / uSnap * clip.w;
  }
  gl_Position = clip;
  gl_PointSize = clamp(floor(aSize * uPxScale / max(-mv.z, 0.1)), 1.0, 3.0);
  vColor = aColor;
}
`;

const P_FRAG = /* glsl */ `
varying vec4 vColor;
void main() {
  if (vColor.a <= 0.01) discard;
  gl_FragColor = vec4(vColor.rgb * vColor.a, vColor.a);
}
`;

interface Particle {
  life: number;
  max: number;
  vx: number;
  vy: number;
  vz: number;
  gravity: number;
  drag: number;
  size: number;
  r: number;
  g: number;
  b: number;
}

export interface EmitOptions {
  count?: number;
  color?: THREE.ColorRepresentation;
  /** Random extra hue jitter between color and color2. */
  color2?: THREE.ColorRepresentation;
  speed?: number;
  spread?: number;
  life?: number;
  gravity?: number;
  size?: number;
  drag?: number;
  dir?: THREE.Vector3;
  radius?: number;
}

/** Fixed-size additive particle pool rendered as snapped square points. */
export class Particles {
  readonly points: THREE.Points;
  private parts: (Particle | null)[];
  private pos: Float32Array;
  private col: Float32Array;
  private size: Float32Array;
  private cursor = 0;

  constructor(readonly capacity = 400) {
    this.parts = new Array(capacity).fill(null);
    this.pos = new Float32Array(capacity * 3);
    this.col = new Float32Array(capacity * 4);
    this.size = new Float32Array(capacity);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    geo.setAttribute('aColor', new THREE.BufferAttribute(this.col, 4));
    geo.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1));
    const mat = new THREE.ShaderMaterial({
      vertexShader: P_VERT,
      fragmentShader: P_FRAG,
      uniforms: { uSnap: globals.uSnap, uSnapOn: globals.uSnapOn, uPxScale: globals.uPxScale },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
  }

  emit(at: THREE.Vector3, o: EmitOptions = {}) {
    const c1 = new THREE.Color(o.color ?? 0xffcc66);
    const c2 = new THREE.Color(o.color2 ?? o.color ?? 0xffcc66);
    const n = o.count ?? 20;
    for (let i = 0; i < n; i++) {
      const idx = this.cursor;
      this.cursor = (this.cursor + 1) % this.capacity;
      const speed = (o.speed ?? 2) * (0.4 + Math.random() * 0.6);
      let dx = Math.random() * 2 - 1;
      let dy = Math.random() * 2 - 1;
      let dz = Math.random() * 2 - 1;
      const len = Math.hypot(dx, dy, dz) || 1;
      dx /= len;
      dy /= len;
      dz /= len;
      if (o.dir) {
        const spread = o.spread ?? 0.4;
        dx = o.dir.x + dx * spread;
        dy = o.dir.y + dy * spread;
        dz = o.dir.z + dz * spread;
      }
      const t = Math.random();
      const r = o.radius ?? 0;
      this.pos[idx * 3] = at.x + (Math.random() * 2 - 1) * r;
      this.pos[idx * 3 + 1] = at.y + (Math.random() * 2 - 1) * r;
      this.pos[idx * 3 + 2] = at.z + (Math.random() * 2 - 1) * r;
      const life = (o.life ?? 1.2) * (0.6 + Math.random() * 0.6);
      this.parts[idx] = {
        life,
        max: life,
        vx: dx * speed,
        vy: dy * speed,
        vz: dz * speed,
        gravity: o.gravity ?? -2,
        drag: o.drag ?? 0.6,
        size: (o.size ?? 0.06) * (0.6 + Math.random() * 0.8),
        r: c1.r + (c2.r - c1.r) * t,
        g: c1.g + (c2.g - c1.g) * t,
        b: c1.b + (c2.b - c1.b) * t,
      };
    }
  }

  update(dt: number) {
    for (let i = 0; i < this.capacity; i++) {
      const p = this.parts[i];
      if (!p) {
        this.col[i * 4 + 3] = 0;
        continue;
      }
      p.life -= dt;
      if (p.life <= 0) {
        this.parts[i] = null;
        this.col[i * 4 + 3] = 0;
        continue;
      }
      const damp = Math.exp(-p.drag * dt);
      p.vx *= damp;
      p.vz *= damp;
      p.vy = p.vy * damp + p.gravity * dt;
      this.pos[i * 3] += p.vx * dt;
      this.pos[i * 3 + 1] += p.vy * dt;
      this.pos[i * 3 + 2] += p.vz * dt;
      const a = Math.min(1, (p.life / p.max) * 1.6);
      this.col[i * 4] = p.r;
      this.col[i * 4 + 1] = p.g;
      this.col[i * 4 + 2] = p.b;
      this.col[i * 4 + 3] = a;
      this.size[i] = p.size;
    }
    const geo = this.points.geometry;
    geo.attributes.position.needsUpdate = true;
    geo.attributes.aColor.needsUpdate = true;
    geo.attributes.aSize.needsUpdate = true;
  }
}
