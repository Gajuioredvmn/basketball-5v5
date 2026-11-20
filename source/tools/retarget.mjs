// 把 CMU 動作（BVH 關節座標）轉成遊戲骨架每根骨頭的局部旋轉（四元數）
// 方法：每一段骨頭讓它「指向」跟真人一樣的方向（方向對齊），軀幹和頭用「上方＋左方」兩個向量決定整個朝向
import * as THREE from 'three';
import { loadBVH, loadJSON } from './bvhfk.mjs';
export const BONES = ['hips', 'torso', 'chest', 'neck', 'headG', 'hipL', 'kneeL', 'ankleL', 'hipR', 'kneeR', 'ankleR', 'shL', 'elL', 'wrL', 'shR', 'elR', 'wrR'];
const V = () => new THREE.Vector3();
const DOWN = new THREE.Vector3(0, -1, 0), FOOT = new THREE.Vector3(0, -0.35, 1).normalize();
function basis(up, left) {
  const y = up.clone().normalize(), x = left.clone().addScaledVector(y, -left.dot(y)).normalize(), z = V().crossVectors(x, y).normalize();
  return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
}
function limb(parentW, rest, dirWorld) {
  const d = dirWorld.clone().normalize().applyQuaternion(parentW.clone().invert());
  const ql = new THREE.Quaternion().setFromUnitVectors(rest, d);
  return { local: ql, world: parentW.clone().multiply(ql) };
}
export function retarget(path, { from = 0, to = null, mirror = false } = {}) {
  const { frames, fps } = path.endsWith('.json') ? loadJSON(path) : loadBVH(path);
  const out = [];
  const end = to == null ? frames.length : Math.min(to, frames.length);
  for (let i = from; i < end; i++) {
    let f = frames[i];
    // 鏡像：左右對調（左手運球改右手）
    if (mirror) { const g = {}; for (const k in f) { const k2 = k.replace(/^Left/, 'TMP').replace(/^Right/, 'Left').replace(/^TMP/, 'Right').replace(/^LThumb/, 'TMP').replace(/^RThumb/, 'LThumb').replace(/^TMP/, 'RThumb').replace(/^LHip/, 'TMP').replace(/^RHip/, 'LHip').replace(/^TMP/, 'RHip'); g[k2] = f[k].clone(); g[k2].x = -g[k2].x; } f = g; }
    const P = k => f[k];
    // 面向：骨盆左方 × 上方 = 前方
    const left0 = V().subVectors(P('LeftUpLeg'), P('RightUpLeg')); left0.y = 0;
    const fwd = V().crossVectors(left0, new THREE.Vector3(0, 1, 0)).normalize();
    const yaw = Math.atan2(fwd.x, fwd.z);
    const qYawInv = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -yaw);
    const L = k => V().subVectors(P(k), P('Hips')).applyQuaternion(qYawInv); // 角色自己的座標（面向 +z）
    const dir = (a, b) => V().subVectors(L(b), L(a));
    const res = {};
    const leftHip = dir('RightUpLeg', 'LeftUpLeg'), leftSh = dir('RightArm', 'LeftArm');
    const hipsW = basis(dir('Hips', 'Spine'), leftHip); res.hips = hipsW;
    const torsoW = basis(dir('Spine', 'Spine1'), leftHip.clone().add(leftSh)); res.torso = hipsW.clone().invert().multiply(torsoW);
    const chestW = basis(dir('Spine1', 'Neck1'), leftSh); res.chest = torsoW.clone().invert().multiply(chestW);
    const neckW = basis(dir('Neck1', 'Head'), leftSh); res.neck = chestW.clone().invert().multiply(neckW);
    const headW = basis(dir('Head', 'Head_end'), leftSh); res.headG = neckW.clone().invert().multiply(headW);
    for (const [s, S] of [['L', 'Left'], ['R', 'Right']]) {
      const th = limb(hipsW, DOWN, dir(S + 'UpLeg', S + 'Leg')); res['hip' + s] = th.local;
      const ca = limb(th.world, DOWN, dir(S + 'Leg', S + 'Foot')); res['knee' + s] = ca.local;
      const ft = limb(ca.world, FOOT, dir(S + 'Foot', S + 'ToeBase')); res['ankle' + s] = ft.local;
      const ua = limb(chestW, DOWN, dir(S + 'Arm', S + 'ForeArm')); res['sh' + s] = ua.local;
      const fa = limb(ua.world, DOWN, dir(S + 'ForeArm', S + 'Hand')); res['el' + s] = fa.local;
      const hd = limb(fa.world, DOWN, dir(S + 'Hand', S + 'HandIndex1')); res['wr' + s] = hd.local;
    }
    out.push({ q: BONES.map(b => res[b]), hipY: P('Hips').y, yaw, x: P('Hips').x, z: P('Hips').z,
      lhand: P('LeftHand').y, rhand: P('RightHand').y, ball: f.ball ? f.ball.clone() : null, contact: f.contact, ballL: f.ball ? V().subVectors(f.ball, P('Hips')).applyQuaternion(qYawInv) : null, lfoot: Math.min(P('LeftFoot').y, P('LeftToeBase').y), rfoot: Math.min(P('RightFoot').y, P('RightToeBase').y) });
  }
  return { frames: out, fps };
}
// 打包：每幀 17 根骨頭 × 4（int16）＋骨盆高度（mm）；有球的片段再加球的位置（角色座標，mm）與手是否碰球
export function pack(fr, withBall = false) {
  const n = fr.length, per = BONES.length * 4 + 1 + (withBall ? 4 : 0), a = new Int16Array(n * per);
  fr.forEach((f, i) => {
    let o = i * per;
    for (const q of f.q) { const s = q.w < 0 ? -1 : 1; a[o++] = Math.round(q.x * s * 32767); a[o++] = Math.round(q.y * s * 32767); a[o++] = Math.round(q.z * s * 32767); a[o++] = Math.round(q.w * s * 32767); }
    a[o++] = Math.round(f.hipY * 1000);
    if (withBall) { a[o++] = Math.round(f.ballL.x * 1000); a[o++] = Math.round((f.ballL.y + f.hipY) * 1000); a[o++] = Math.round(f.ballL.z * 1000); a[o++] = f.contact ? 1 : 0; }
  });
  return Buffer.from(a.buffer).toString('base64');
}
