// Quaternius 通用動作庫（CC0）GLB → 關節座標 JSON（跟 CMU 一樣的命名），給 retarget 用
import fs from 'fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
globalThis.self = globalThis; globalThis.window = globalThis;
const MAP = { pelvis: 'Hips', thigh_l: 'LeftUpLeg', calf_l: 'LeftLeg', foot_l: 'LeftFoot', ball_l: 'LeftToeBase', thigh_r: 'RightUpLeg', calf_r: 'RightLeg', foot_r: 'RightFoot', ball_r: 'RightToeBase',
  spine_01: 'Spine', spine_03: 'Spine1', neck_01: 'Neck1', Head: 'Head', upperarm_l: 'LeftArm', lowerarm_l: 'LeftForeArm', hand_l: 'LeftHand', middle_01_l: 'LeftHandIndex1',
  upperarm_r: 'RightArm', lowerarm_r: 'RightForeArm', hand_r: 'RightHand', middle_01_r: 'RightHandIndex1' };
const [file, outDir, ...want] = process.argv.slice(2);
const buf = fs.readFileSync(file);
new GLTFLoader().parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), '', g => {
  const bones = {}; g.scene.traverse(o => { if (o.isBone && MAP[o.name]) bones[MAP[o.name]] = o; });
  const mixer = new THREE.AnimationMixer(g.scene);
  for (const clip of g.animations) {
    if (want.length && !want.includes(clip.name)) continue;
    mixer.stopAllAction(); const act = mixer.clipAction(clip); act.reset().play();
    const n = Math.max(2, Math.round(clip.duration * 30)), frames = [];
    for (let i = 0; i <= n; i++) {
      mixer.setTime(Math.min(clip.duration, i / 30)); g.scene.updateMatrixWorld(true);
      const f = {};
      for (const k in bones) { const v = new THREE.Vector3().setFromMatrixPosition(bones[k].matrixWorld); f[k] = [v.x, v.y, v.z]; }
      const h = f.Head, nk = f.Neck1; f.Head_end = [h[0] + (h[0] - nk[0]) * 0.8, h[1] + (h[1] - nk[1]) * 0.8, h[2] + (h[2] - nk[2]) * 0.8];
      frames.push(f);
    }
    fs.writeFileSync(`${outDir}/${clip.name}.json`, JSON.stringify({ fps: 30, frames }));
    act.stop();
  }
  console.log('done');
}, e => console.log('err', e));
