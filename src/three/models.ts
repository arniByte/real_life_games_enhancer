// Low-poly procedural models: chess pieces (lathe), darts, paddles, candles…

import * as THREE from 'three';
import { ps1, type PS1Material } from './ps1';
import * as T from './textures';

type Profile = [number, number][];

const lathe = (profile: Profile, segments = 8) =>
  new THREE.LatheGeometry(
    profile.map(([x, y]) => new THREE.Vector2(x, y)),
    segments,
  );

const PROFILES: Record<'pawn' | 'rook' | 'bishop' | 'queen' | 'king', Profile> = {
  pawn: [
    [0, 0], [0.4, 0], [0.4, 0.08], [0.32, 0.13], [0.3, 0.19], [0.2, 0.25], [0.13, 0.5], [0.22, 0.55], [0.22, 0.59],
    [0.12, 0.63], [0.19, 0.7], [0.22, 0.79], [0.18, 0.89], [0.09, 0.96], [0, 0.98],
  ],
  rook: [
    [0, 0], [0.44, 0], [0.44, 0.09], [0.35, 0.14], [0.31, 0.2], [0.24, 0.3], [0.22, 0.72], [0.31, 0.76], [0.33, 0.8],
    [0.33, 1], [0.25, 1], [0.25, 0.93], [0, 0.93],
  ],
  bishop: [
    [0, 0], [0.42, 0], [0.42, 0.08], [0.33, 0.13], [0.3, 0.19], [0.2, 0.26], [0.13, 0.62], [0.23, 0.66], [0.23, 0.7],
    [0.13, 0.73], [0.2, 0.82], [0.22, 0.92], [0.17, 1.04], [0.08, 1.12], [0.05, 1.16], [0.07, 1.19], [0, 1.22],
  ],
  queen: [
    [0, 0], [0.46, 0], [0.46, 0.09], [0.36, 0.14], [0.33, 0.2], [0.22, 0.28], [0.14, 0.82], [0.26, 0.87], [0.26, 0.91],
    [0.16, 0.95], [0.2, 1.0], [0.3, 1.18], [0.24, 1.2], [0.16, 1.24], [0.1, 1.26], [0.1, 1.3], [0, 1.36],
  ],
  king: [
    [0, 0], [0.47, 0], [0.47, 0.09], [0.37, 0.14], [0.34, 0.2], [0.23, 0.29], [0.15, 0.86], [0.27, 0.9], [0.27, 0.94],
    [0.17, 0.98], [0.23, 1.04], [0.27, 1.2], [0.2, 1.26], [0, 1.28],
  ],
};

export type ChessPiece = keyof typeof PROFILES | 'knight';

/** A chess piece about 1 unit tall. */
export function chessPiece(kind: ChessPiece, mat: THREE.Material, segments = 8): THREE.Group {
  const g = new THREE.Group();
  if (kind === 'knight') {
    const base = new THREE.Mesh(lathe(PROFILES.pawn.slice(0, 7), segments), mat);
    g.add(base);
    const s = new THREE.Shape();
    const pts: [number, number][] = [
      [-0.2, 0.45], [0.22, 0.45], [0.2, 0.7], [0.26, 0.86], [0.2, 1.02], [0.08, 1.14], [0.02, 1.2], [-0.04, 1.12],
      [-0.2, 1.06], [-0.36, 0.96], [-0.38, 0.88], [-0.28, 0.86], [-0.14, 0.88], [-0.22, 0.7],
    ];
    s.moveTo(...pts[0]);
    pts.slice(1).forEach((p) => s.lineTo(...p));
    const head = new THREE.Mesh(new THREE.ExtrudeGeometry(s, { depth: 0.24, bevelEnabled: false }), mat);
    head.position.z = -0.12;
    g.add(head);
    return g;
  }
  g.add(new THREE.Mesh(lathe(PROFILES[kind], segments), mat));
  if (kind === 'rook') {
    for (let i = 0; i < 4; i++) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.12), mat);
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      b.position.set(Math.cos(a) * 0.28, 1.04, Math.sin(a) * 0.28);
      b.rotation.y = -a;
      g.add(b);
    }
  }
  if (kind === 'queen') {
    for (let i = 0; i < 6; i++) {
      const b = new THREE.Mesh(new THREE.OctahedronGeometry(0.05, 0), mat);
      const a = (i / 6) * Math.PI * 2;
      b.position.set(Math.cos(a) * 0.27, 1.22, Math.sin(a) * 0.27);
      g.add(b);
    }
  }
  if (kind === 'king') {
    const v = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.26, 0.07), mat);
    v.position.y = 1.4;
    const h = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.07, 0.07), mat);
    h.position.y = 1.42;
    g.add(v, h);
  }
  return g;
}

/** A dart pointing along -Z, tip at origin, ~0.55 long. */
export function dart(color = 0xc0392b): THREE.Group {
  const g = new THREE.Group();
  const steel = ps1({ map: T.metal(), color: 0xdddddd });
  const tip = new THREE.Mesh(new THREE.ConeGeometry(0.015, 0.1, 4), steel);
  tip.rotation.x = -Math.PI / 2;
  tip.position.z = 0.05;
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.025, 0.16, 6), ps1({ map: T.gold(), color: 0xffffff }));
  barrel.rotation.x = Math.PI / 2;
  barrel.position.z = 0.18;
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.18, 4), ps1({ color: 0x222222 }));
  shaft.rotation.x = Math.PI / 2;
  shaft.position.z = 0.35;
  const flightMat = ps1({ color, side: THREE.DoubleSide, emissive: new THREE.Color(color).multiplyScalar(0.25) });
  const flightGeo = new THREE.PlaneGeometry(0.12, 0.14);
  const f1 = new THREE.Mesh(flightGeo, flightMat);
  f1.rotation.y = Math.PI / 2;
  f1.position.z = 0.46;
  const f2 = f1.clone();
  f2.rotation.z = Math.PI / 2;
  f2.rotation.y = Math.PI / 2;
  g.add(tip, barrel, shaft, f1, f2);
  return g;
}

/** Ping-pong paddle facing +Z, handle down. */
export function paddle(rubber = 0xb3221c): THREE.Group {
  const g = new THREE.Group();
  const wood = ps1({ map: T.woodPlanks(), color: 0xffffff });
  const face = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.05, 12), [
    wood,
    ps1({ color: rubber }),
    ps1({ color: 0x151515 }),
  ]);
  face.rotation.x = Math.PI / 2;
  face.scale.set(1, 1, 1.1);
  const handle = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.42, 0.07), wood);
  handle.position.y = -0.55;
  g.add(face, handle);
  return g;
}

/** Candle with a flickering flame (crossed planes). Returns the group and the flame for animation. */
export function candle(height = 0.4, radius = 0.06): { group: THREE.Group; flame: THREE.Group } {
  const group = new THREE.Group();
  const wax = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius * 1.1, height, 6), ps1({ map: T.bone(), color: 0xf0e6d0 }));
  wax.position.y = height / 2;
  group.add(wax);
  const flame = flameSprite(radius * 2.2, radius * 4.5);
  flame.position.y = height + radius * 2;
  group.add(flame);
  return { group, flame };
}

export function flameSprite(w: number, h: number): THREE.Group {
  const mat = ps1({ map: T.flame(), unlit: true, transparent: true, additive: true, side: THREE.DoubleSide, fog: 0.3, wave: 0.04 });
  const geo = new THREE.PlaneGeometry(w, h, 1, 3);
  const a = new THREE.Mesh(geo, mat);
  const b = new THREE.Mesh(geo, mat);
  b.rotation.y = Math.PI / 2;
  const g = new THREE.Group();
  g.add(a, b);
  g.userData.flame = true;
  return g;
}

export function flickerFlames(root: THREE.Object3D, t: number) {
  root.traverse((o) => {
    if (o.userData.flame) {
      const k = 0.85 + Math.sin(t * 17 + o.id) * 0.08 + Math.sin(t * 31 + o.id * 3) * 0.07;
      o.scale.set(1, k, 1);
    }
  });
}

/** Simple pillar with base and capital. */
export function pillar(height: number, radius: number, mat: PS1Material): THREE.Group {
  const g = new THREE.Group();
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius * 1.05, height, 8, 4), mat);
  shaft.position.y = height / 2;
  const base = new THREE.Mesh(new THREE.BoxGeometry(radius * 2.8, radius * 0.8, radius * 2.8), mat);
  base.position.y = radius * 0.4;
  const cap = base.clone();
  cap.position.y = height - radius * 0.4;
  g.add(shaft, base, cap);
  return g;
}

/** Floor plane subdivided enough to keep affine warping tasteful. */
export function floor(size: number, mat: THREE.Material, segments = 12): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size, segments, segments), mat);
  m.rotation.x = -Math.PI / 2;
  return m;
}

export function wall(w: number, h: number, mat: THREE.Material, segX = 8, segY = 4): THREE.Mesh {
  return new THREE.Mesh(new THREE.PlaneGeometry(w, h, segX, segY), mat);
}

/** Big inverted sphere with a texture — sky / void. */
export function skyDome(map: THREE.Texture, radius = 80, repeat: [number, number] = [3, 2]): THREE.Mesh {
  const mat = ps1({ map, unlit: true, side: THREE.BackSide, uvScale: repeat, fog: 0 });
  const m = new THREE.Mesh(new THREE.SphereGeometry(radius, 16, 10), mat);
  m.renderOrder = -1;
  return m;
}

/** A low-poly hooded figure (the Dealer / the Queen's guard). */
export function hoodedFigure(robe: THREE.ColorRepresentation, eyes: THREE.ColorRepresentation): THREE.Group {
  const g = new THREE.Group();
  const cloth = ps1({ color: robe });
  const body = new THREE.Mesh(
    lathe(
      [
        [0, 0], [0.7, 0], [0.62, 0.4], [0.5, 1.0], [0.42, 1.4], [0.36, 1.6], [0.4, 1.75], [0.36, 2.0], [0.2, 2.2], [0, 2.26],
      ],
      7,
    ),
    cloth,
  );
  g.add(body);
  const void_ = new THREE.Mesh(new THREE.CircleGeometry(0.2, 6), ps1({ color: 0x000000, unlit: true }));
  void_.position.set(0, 1.86, 0.33);
  void_.rotation.x = -0.25;
  g.add(void_);
  const eyeMat = ps1({ color: eyes, unlit: true, fog: 0.2 });
  for (const x of [-0.07, 0.07]) {
    const e = new THREE.Mesh(new THREE.PlaneGeometry(0.05, 0.025), eyeMat);
    e.position.set(x, 1.88, 0.36);
    e.rotation.x = -0.25;
    g.add(e);
  }
  return g;
}

export function card(rank: string, suit: string, scale = 1): THREE.Group {
  const g = new THREE.Group();
  const geo = new THREE.PlaneGeometry(0.6 * scale, 0.9 * scale);
  const front = new THREE.Mesh(geo, ps1({ map: T.cardFace(rank, suit), side: THREE.FrontSide }));
  const back = new THREE.Mesh(geo, ps1({ map: T.cardBack(), side: THREE.FrontSide }));
  back.rotation.y = Math.PI;
  g.add(front, back);
  return g;
}

export function die(size = 0.4): THREE.Mesh {
  const mats = [1, 6, 2, 5, 3, 4].map((n) => ps1({ map: T.dieFace(n) }));
  return new THREE.Mesh(new THREE.BoxGeometry(size, size, size), mats);
}

/** Volumetric-looking light cone: additive, fading toward the floor. */
export function lightCone(radiusBottom: number, height: number, color: THREE.ColorRepresentation, opacity = 0.12): THREE.Mesh {
  const c = document.createElement('canvas');
  c.width = 4;
  c.height = 32;
  const ctx = c.getContext('2d')!;
  for (let y = 0; y < 32; y++) {
    const a = Math.pow(1 - y / 32, 1.4);
    ctx.fillStyle = `rgba(255,255,255,${a})`;
    ctx.fillRect(0, y, 4, 1);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.colorSpace = THREE.NoColorSpace;
  const mat = ps1({ map: tex, color, unlit: true, transparent: true, additive: true, opacity, side: THREE.DoubleSide, depthWrite: false, fog: 0.5 });
  const m = new THREE.Mesh(new THREE.CylinderGeometry(0.08, radiusBottom, height, 16, 4, true), mat);
  m.renderOrder = 5;
  return m;
}

/** Soft-edged dark disc under an object (no real shadows in PS1 land). */
export function blobShadow(radius: number, opacity = 0.55): THREE.Mesh {
  const c = document.createElement('canvas');
  c.width = c.height = 16;
  const ctx = c.getContext('2d')!;
  for (let y = 0; y < 16; y++)
    for (let x = 0; x < 16; x++) {
      const d = Math.hypot(x - 7.5, y - 7.5) / 8;
      if (d < 1) {
        ctx.fillStyle = `rgba(0,0,0,${Math.min(1, (1 - d) * 1.6)})`;
        ctx.fillRect(x, y, 1, 1);
      }
    }
  const tex = new THREE.CanvasTexture(c);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(radius * 2, radius * 2), ps1({ map: tex, unlit: true, transparent: true, opacity, depthWrite: false, color: 0xffffff }));
  m.rotation.x = -Math.PI / 2;
  // Unlit black multiply-ish: draw as dark alpha.
  (m.material as THREE.ShaderMaterial).uniforms.uColor.value.setRGB(0, 0, 0);
  return m;
}
