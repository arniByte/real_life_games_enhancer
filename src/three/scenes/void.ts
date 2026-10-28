// The Abyss of Games: a floating rune platform, a giant d20 and orbiting dice.

import * as THREE from 'three';
import { BaseScene, ease } from './base';
import { ps1 } from '../ps1';
import * as T from '../textures';
import { candle, die, pillar, skyDome } from '../models';
import type { FxEvent } from '../fx';

export class VoidScene extends BaseScene {
  private d20!: THREE.Mesh;
  private spin = 0.4;
  private dice: THREE.Mesh[] = [];
  private coins: THREE.Mesh[] = [];
  private runes!: THREE.Mesh;
  private sky!: THREE.Mesh;
  private runePulse = 0;

  build() {
    this.baseFov = 55;
    this.ambient.setRGB(0.12, 0.1, 0.18);
    this.fogColor.setRGB(0.03, 0.02, 0.06);
    this.fogNear = 9;
    this.fogFar = 40;
    this.clearColor.setRGB(0.01, 0.0, 0.03);
    this.dirColor.setRGB(0.18, 0.16, 0.3);

    this.sky = skyDome(T.stars(), 90, [2, 1]);
    this.scene.add(this.sky);

    const stone = ps1({ map: T.flagstone(), uvScale: [4, 4] });
    const plat = new THREE.Mesh(new THREE.CylinderGeometry(6, 5, 0.8, 12), [ps1({ map: T.stoneBricks(), uvScale: [6, 1] }), stone, stone]);
    plat.position.y = -0.4;
    this.scene.add(plat);
    const under = new THREE.Mesh(new THREE.ConeGeometry(5, 6, 8, 2), ps1({ map: T.stoneBricks(), uvScale: [4, 3] }));
    under.rotation.x = Math.PI;
    under.position.y = -3.8;
    this.scene.add(under);

    this.runes = new THREE.Mesh(
      new THREE.PlaneGeometry(9, 9),
      ps1({ map: T.runeRing(), unlit: true, transparent: true, additive: true, depthWrite: false, fog: 0.3 }),
    );
    this.runes.rotation.x = -Math.PI / 2;
    this.runes.position.y = 0.03;
    this.scene.add(this.runes);

    const pmat = ps1({ map: T.stoneBricks(), uvScale: [1, 3] });
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + 0.3;
      const h = 2 + (i % 3) * 1.4;
      const p = pillar(h, 0.32, pmat);
      p.position.set(Math.cos(a) * 5.2, 0, Math.sin(a) * 5.2);
      p.rotation.z = (Math.random() - 0.5) * 0.1;
      this.scene.add(p);
      const c = candle(0.35, 0.07);
      c.group.position.set(Math.cos(a) * 5.2, h, Math.sin(a) * 5.2);
      this.scene.add(c.group);
    }

    this.d20 = new THREE.Mesh(new THREE.IcosahedronGeometry(1.6, 0), ps1({ map: T.darkMarble(), color: 0xc0a0ff, emissive: 0x2a1450 }));
    this.d20.position.set(0, 3.4, 0);
    this.scene.add(this.d20);
    const wire = new THREE.Mesh(new THREE.IcosahedronGeometry(1.75, 0), ps1({ color: 0x8ff0ff, unlit: true, transparent: true, additive: true, opacity: 0.25, depthWrite: false }));
    wire.userData.wire = true;
    this.d20.add(wire);

    for (let i = 0; i < 5; i++) {
      const d = die(0.45);
      d.userData.a = (i / 5) * Math.PI * 2;
      d.userData.r = 2.8 + (i % 2) * 0.4;
      this.dice.push(d);
      this.scene.add(d);
    }
    const coinMat = ps1({ map: T.gold(), emissive: 0x221500 });
    for (let i = 0; i < 9; i++) {
      const c = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.05, 8), coinMat);
      c.position.set((Math.random() - 0.5) * 9, 1.5 + Math.random() * 4, (Math.random() - 0.5) * 6 - 1);
      c.rotation.x = Math.PI / 2;
      c.userData.spin = 1 + Math.random() * 2;
      this.coins.push(c);
      this.scene.add(c);
    }

    this.addLight({ pos: new THREE.Vector3(0, 3.4, 2.5), color: new THREE.Color(0.6, 0.4, 1), intensity: 1.5, range: 10, flicker: 0.2 });
    this.addLight({ pos: new THREE.Vector3(-4, 2, 3), color: new THREE.Color(0.2, 0.7, 0.9), intensity: 0.9, range: 9, flicker: 0.3 });
    this.addLight({ pos: new THREE.Vector3(4, 2, 3), color: new THREE.Color(1, 0.5, 0.2), intensity: 0.8, range: 8, flicker: 1 });

    this.camera.position.set(0, 3.2, 9);
    this.look.set(0, 2.8, 0);
  }

  intro() {
    this.camera.position.set(0, 12, 14);
    this.look.set(0, 0, 0);
    this.flyTo(new THREE.Vector3(0, 3.2, 9), new THREE.Vector3(0, 2.8, 0), 3.6, ease.inOutCubic);
  }

  fx(e: FxEvent) {
    switch (e.type) {
      case 'uni.points':
        this.spin = e.delta > 0 ? 6 : -4;
        this.particles.emit(this.d20.position, { count: Math.min(60, 10 + Math.abs(e.delta) * 2), color: e.delta > 0 ? 0xffd070 : 0xff3040, color2: e.delta > 0 ? 0x8ff0ff : 0x802040, speed: 3, life: 1, gravity: e.delta > 0 ? -1 : -4, size: 0.07 });
        break;
      case 'uni.round':
        this.runePulse = 1;
        break;
      case 'win':
        this.spin = 10;
        for (let i = 0; i < 7; i++)
          setTimeout(() => this.particles.emit(new THREE.Vector3((Math.random() - 0.5) * 8, 5 + Math.random() * 2, (Math.random() - 0.5) * 4), { count: 45, color: e.color ?? 0xffd070, color2: 0xffffff, speed: 3, life: 1.6, gravity: -2.5, size: 0.08 }), i * 300);
        break;
      case 'souls':
        this.particles.emit(new THREE.Vector3(0, 1.5, 2), { count: 10 * e.amount, color: 0x8ff0ff, color2: 0xb08cff, speed: 1.3, life: 1.6, gravity: 1.4, size: 0.05, radius: 1 });
        break;
    }
  }

  protected tick(dt: number) {
    this.spin += (0.4 - this.spin) * Math.min(1, dt * 1.2);
    this.d20.rotation.y += dt * this.spin;
    this.d20.rotation.x += dt * this.spin * 0.37;
    this.d20.position.y = 3.4 + Math.sin(this.time * 0.9) * 0.2;
    this.dice.forEach((d, i) => {
      const a = d.userData.a + this.time * 0.35;
      d.position.set(Math.cos(a) * d.userData.r, 3.2 + Math.sin(this.time * 1.2 + i) * 0.6, Math.sin(a) * d.userData.r);
      d.rotation.x += dt * (0.6 + i * 0.1);
      d.rotation.y += dt * 0.8;
    });
    this.coins.forEach((c) => {
      c.rotation.z += dt * c.userData.spin;
      c.position.y += Math.sin(this.time + c.id) * dt * 0.1;
    });
    this.sky.rotation.y += dt * 0.006;
    this.runes.rotation.z -= dt * 0.1;
    this.runePulse = Math.max(0, this.runePulse - dt * 0.8);
    const s = 1 + this.runePulse * 0.3;
    this.runes.scale.set(s, s, 1);
    (this.runes.material as THREE.ShaderMaterial).uniforms.uColor.value.setScalar(1 + this.runePulse * 2);
    if (Math.random() < dt * 6) {
      const a = Math.random() * Math.PI * 2;
      this.particles.emit(new THREE.Vector3(Math.cos(a) * 4, 0.1, Math.sin(a) * 4), { count: 1, color: 0x9a62d6, color2: 0x8ff0ff, speed: 0.2, life: 3, gravity: 0.5, size: 0.05 });
    }
  }
}
