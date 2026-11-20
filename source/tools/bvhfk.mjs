// 讀 BVH，算出每一幀各關節的世界座標（公尺、Y 朝上）
import * as THREE from 'three';
import { BVHLoader } from 'three/examples/jsm/loaders/BVHLoader.js';
import fs from 'fs';
export function loadBVH(path, fps = 30) {
  const res = new BVHLoader().parse(fs.readFileSync(path, 'utf8'));
  const bones = res.skeleton.bones, root = bones[0];
  const holder = new THREE.Object3D(); holder.add(root);
  const mixer = new THREE.AnimationMixer(holder);
  const act = mixer.clipAction(res.clip); act.play();
  const dur = res.clip.duration, n = Math.floor(dur * fps);
  const names = bones.map(b => b.name);
  const frames = [];
  for (let i = 0; i < n; i++) {
    mixer.setTime(i / fps); holder.updateMatrixWorld(true);
    const f = {};
    for (const b of bones) if (!/endsite/i.test(b.name)) f[b.name] = new THREE.Vector3().setFromMatrixPosition(b.matrixWorld);
    // 末端點（手指尖、腳尖、頭頂）
    for (const b of bones) for (const c of b.children) if (c.isBone && /endsite|site|end/i.test(c.name)) f[b.name + '_end'] = new THREE.Vector3().setFromMatrixPosition(c.matrixWorld);
    frames.push(f);
  }
  // 單位換算：大腿＋小腿長度 → 0.9 公尺
  const f0 = frames[0], leg = f0.LeftUpLeg.distanceTo(f0.LeftLeg) + f0.LeftLeg.distanceTo(f0.LeftFoot);
  const s = 0.9 / leg;
  let minY = 1e9; for (const f of frames) for (const k of ['LeftToeBase', 'RightToeBase', 'LeftFoot', 'RightFoot']) minY = Math.min(minY, f[k].y);
  for (const f of frames) for (const k in f) { f[k].y -= minY; f[k].multiplyScalar(s); }
  return { frames, fps, names, scale: s };
}
// SkillMimic 轉出的 JSON（60fps）→ 重新取樣成 30fps，格式跟 loadBVH 一樣，另外帶球的位置
export function loadJSON(path, fps = 30) {
  const J = JSON.parse(fs.readFileSync(path, 'utf8')), src = J.frames, step = J.fps / fps;
  const frames = [];
  for (let t = 0; t < src.length - 1; t += step) {
    const i = Math.floor(t), u = t - i, a = src[i], b = src[Math.min(src.length - 1, i + 1)], f = {};
    for (const k in a) if (Array.isArray(a[k])) f[k] = new THREE.Vector3(a[k][0] + (b[k][0] - a[k][0]) * u, a[k][1] + (b[k][1] - a[k][1]) * u, a[k][2] + (b[k][2] - a[k][2]) * u);
    f.contact = a.contact;
    frames.push(f);
  }
  let minY = 1e9; for (const f of frames) for (const k of ['LeftToeBase', 'RightToeBase', 'LeftFoot', 'RightFoot']) minY = Math.min(minY, f[k].y);
  const f0 = frames[0], leg = f0.LeftUpLeg.distanceTo(f0.LeftLeg) + f0.LeftLeg.distanceTo(f0.LeftFoot), sc = 0.9 / leg;
  for (const f of frames) for (const k in f) if (f[k] && f[k].isVector3) { f[k].y -= minY; f[k].multiplyScalar(sc); }
  return { frames, fps };
}
