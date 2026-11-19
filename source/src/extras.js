// 場邊人物：啦啦隊（6 人）與吉祥物
// 比賽進行中：啦啦隊站在遠側兩個底線角落（場外）、吉祥物在遠側底線籃架旁走動
// 暫停時：跑到中場圈附近排隊形跳舞，吉祥物在最前面翻跟斗
import * as THREE from 'three';
import { HX, HZ } from './const.js';
import { makePlayerMesh, animatePlayer } from './player.js';

const hyp = Math.hypot;
function makeActor(rig, scale) {
  return { rig, pos: new THREE.Vector3(), vel: new THREE.Vector3(), facing: 0, jy: 0, runPhase: Math.random() * 6, pose: 'idle', scale, landT: 0, dribblePh: 0, hand: 1, actT: 0, danceT: 0, home: new THREE.Vector3(), spot: new THREE.Vector3(), cheerT: 0, flip: 0 };
}
export function createExtras(scene, { dancers = true } = {}) {
  const list = [];
  if (dancers) {
    for (let i = 0; i < 6; i++) {
      const rig = makePlayerMesh(3, i, '', 0.88, [0, 1, 6, 4, 2, 7][i], { long: true, pom: i % 2 ? '#d4a017' : '#e8e8e8' });
      scene.add(rig.root);
      const a = makeActor(rig, 0.88); a.kind = 'dancer';
      const side = i < 3 ? -1 : 1, k = i % 3;
      // 遠側底線角落：底線外 0.9～2.1m、遠側邊線往內一點，面向球場
      a.home.set(side * (HX + 0.9 + k * 0.6), 0, -(HZ - 0.6 - k * 0.55));
      // 暫停時的隊形：中圈前後兩排
      const row = i % 2, col = Math.floor(i / 2);
      a.spot.set((col - 1) * 2.4 + (row ? 1.2 : -1.2) * 0.5, 0, row ? 0.9 : -0.9);
      a.pos.copy(a.home); a.facing = Math.atan2(-a.home.x, -a.home.z);
      list.push(a);
    }
  }
  const mrig = makePlayerMesh(0, 0, '00', 1.0, 3, { mascot: '#7a4a24' });
  scene.add(mrig.root);
  const mascot = makeActor(mrig, 1.0); mascot.kind = 'mascot';
  mascot.home.set(HX + 1.5, 0, -3.0); mascot.spot.set(0, 0, 2.6); mascot.pos.copy(mascot.home); mascot.walkDir = 1;
  list.push(mascot);
  let showWas = false;
  return {
    list, mascot,
    cheer(big) { for (const a of list) a.cheerT = big ? 2.2 : 1.2; if (big) mascot.flip = 0.001; },
    update(dt, show) {
      if (show && !showWas) for (const a of list) a.danceT = 0;
      showWas = show;
      for (const a of list) {
        let tgt;
        if (show) tgt = a.spot;
        else if (a.kind === 'mascot') { // 在遠側底線籃架旁來回走
          a.home.z += a.walkDir * dt * 0.5; if (a.home.z > -1.6) a.walkDir = -1; if (a.home.z < -5.6) a.walkDir = 1;
          tgt = a.home;
        } else tgt = a.home;
        const dx = tgt.x - a.pos.x, dz = tgt.z - a.pos.z, d = hyp(dx, dz);
        const spd = d > 1.5 ? 4.2 : (a.kind === 'mascot' && !show ? 0.5 : 2.0);
        if (d > 0.08) { const v = Math.min(spd, d * 3); a.vel.set(dx / d * v, 0, dz / d * v); a.pos.addScaledVector(a.vel, dt); a.facing = Math.atan2(dx, dz); }
        else a.vel.set(0, 0, 0);
        const arrived = d < 0.3;
        a.cheerT -= dt;
        if (show && arrived) { a.danceT += dt; a.facing = 0; a.pose = a.kind === 'mascot' ? (Math.floor(a.danceT / 2.5) % 2 ? 'dance' : 'wave') : 'dance'; if (a.kind === 'mascot' && a.danceT > 1.2 && a.flip === 0 && Math.floor(a.danceT) % 5 === 1) a.flip = 0.001; }
        else if (d > 0.3 && a.vel.lengthSq() > 0.3) a.pose = 'run';
        else {
          a.facing = Math.atan2(-a.pos.x, -a.pos.z); // 面向球場中心
          a.pose = a.cheerT > 0 ? (a.kind === 'mascot' ? 'wave' : 'cheer') : (a.kind === 'mascot' ? (Math.sin(performance.now() * 0.0007) > 0.6 ? 'wave' : 'idle') : 'idle');
        }
        animatePlayer(a, dt);
        // 吉祥物後空翻：身體繞骨盆翻一圈，同時往上跳
        if (a.flip > 0) {
          a.flip += dt / 0.9; const u = Math.min(1, a.flip);
          a.rig.hips.rotation.x = -u * Math.PI * 2; a.rig.body.position.y += Math.sin(u * Math.PI) * 0.9;
          if (u >= 1) { a.flip = 0; a.rig.hips.rotation.x = 0; }
        }
      }
    },
  };
}
