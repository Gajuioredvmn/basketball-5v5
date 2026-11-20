// 產生 src/mocapData.js：遊戲用的真人動作片段（已轉成遊戲骨架）
// 來源：CMU Graphics Lab Motion Capture Database（免費使用）、SkillMimic BallPlay-M（Apache 2.0）
import fs from 'fs';
import { retarget, pack, BONES, stanceSpeed } from './retarget.mjs';
const D = '/tmp/cm/data/', SM = '/tmp/smj/';
const clips = {};
import * as THREE from 'three';
// 用「遊戲骨架」的尺寸重新算一次：片段在我們骨架上播放時，踩地那隻腳相對骨盆往後移的速度（=不滑步需要的移動速度）
function rigSpeed(fr) {
  const I = n => BONES.indexOf(n), V3 = (x, y, z) => new THREE.Vector3(x, y, z);
  const soles = fr.map(f => ['L', 'R'].map(s => {
    const qh = f.q[I('hips')], q1 = qh.clone().multiply(f.q[I('hip' + s)]), q2 = q1.clone().multiply(f.q[I('knee' + s)]), q3 = q2.clone().multiply(f.q[I('ankle' + s)]);
    const pos = V3(s === 'L' ? 0.105 : -0.105, -0.06, 0).applyQuaternion(qh);
    pos.add(V3(0, -0.47, 0).applyQuaternion(q1)).add(V3(0, -0.43, 0).applyQuaternion(q2)).add(V3(0, -0.075, 0.06).applyQuaternion(q3));
    return pos;
  }));
  const vs = [];
  for (let i = 0; i < fr.length - 1; i++) {
    const lo = soles[i][0].y < soles[i][1].y ? 0 : 1, a = soles[i][lo], b = soles[i + 1][lo], o = soles[i][1 - lo];
    if (o.y > a.y + 0.02) vs.push(-(b.z - a.z) * 30);
  }
  vs.sort((x, y) => x - y); return vs.length ? vs[Math.floor(vs.length / 2)] : 0;
}
const both = (f, h) => f.lfoot > h && f.rfoot > h;
function jumpEvents(fr, from = 0) {
  let to = -1, land = -1;
  for (let i = from; i < fr.length; i++) if (to < 0 && both(fr[i], 0.07)) { to = i; break; }
  // 單腳起跳（上籃）：其中一腳離地較高、另一腳也離地
  if (to < 0) for (let i = from; i < fr.length; i++) if (Math.min(fr[i].lfoot, fr[i].rfoot) > 0.03 && Math.max(fr[i].lfoot, fr[i].rfoot) > 0.12) { to = i; break; }
  for (let i = to + 2; i < fr.length; i++) if (Math.min(fr[i].lfoot, fr[i].rfoot) < 0.03) { land = i; break; }
  return { takeoff: to, land };
}
const put = (name, fr, extra = {}, withBall = false) => { clips[name] = { fps: 30, n: fr.length, stand: fr[0].hipY, ball: withBall, data: pack(fr, withBall), ...extra }; };
function bestLoop(frames, minLen, maxLen, hand = 'rhand') {
  let best = null;
  for (let i = 0; i < Math.min(40, frames.length - minLen); i++) for (let j = i + minLen; j < Math.min(frames.length, i + maxLen); j++) {
    let e = 0; for (let b = 0; b < BONES.length; b++) e += 1 - Math.abs(frames[i].q[b].dot(frames[j].q[b]));
    e += Math.abs(frames[i][hand] - frames[j][hand]) * 2;
    if (frames[i].ballL) e += frames[i].ballL.distanceTo(frames[j].ballL) * 2;
    if (!best || e < best.e) best = { i, j, e };
  }
  return best;
}
// 1. 跳投（CMU 124_05）
{ const { frames } = retarget(D + '124/124_05.bvh', { from: 72, to: 132 }); const ev = jumpEvents(frames, 10);
  let rel = ev.takeoff, m = -1; for (let i = ev.takeoff; i < ev.land; i++) if (frames[i].rhand > m) { m = frames[i].rhand; rel = i; }
  put('jumpshot', frames, { ev: { ...ev, release: rel } }); }
// 2. 慢速運球（CMU 06_02，走著運球）
{ const { frames } = retarget(D + '006/06_02.bvh', { from: 70, to: 200 }); const b = bestLoop(frames, 24, 70);
  const seg = frames.slice(b.i, b.j), dist = Math.hypot(frames[b.j].x - frames[b.i].x, frames[b.j].z - frames[b.i].z);
  const lows = []; for (let k = 1; k < seg.length - 1; k++) if (seg[k].rhand < seg[k - 1].rhand && seg[k].rhand <= seg[k + 1].rhand) lows.push(k);
  put('dribble', seg, { loop: true, speed: rigSpeed(seg), stance: stanceSpeed(seg), rootSpeed: dist / (seg.length / 30), lows }); }
// 3. 快速運球跑動（BallPlay run_3，含真實球路）
{ const { frames } = retarget(SM + 'run__013_018pickle_run_3.json'); const b = bestLoop(frames, 14, 40);
  const seg = frames.slice(b.i, b.j), dist = Math.hypot(frames[b.j].x - frames[b.i].x, frames[b.j].z - frames[b.i].z);
  put('drun', seg, { loop: true, speed: rigSpeed(seg), stance: stanceSpeed(seg), rootSpeed: dist / (seg.length / 30) }, true); }
// 4. 搶籃板（BallPlay rebound_1）：起跳 → 空中抓球 → 落地收到下巴
{ const { frames } = retarget(SM + 'rebound__002_025pickle_rebound_1.json'); const ev = jumpEvents(frames, 8);
  const grab = frames.findIndex(f => f.contact); put('rebound', frames, { ev: { ...ev, grab } }, true); }
// 5. 接球（BallPlay catch_013）
{ const { frames } = retarget(SM + 'catch__003_008pickle_catch_013.json'); const grab = frames.findIndex(f => f.contact);
  put('catch', frames.slice(0, Math.min(frames.length, grab + 16)), { ev: { grab } }, true); }
// 6. 上籃（BallPlay layup）：收球兩步 → 起跳 → 出手 → 落地
{ const { frames } = retarget(SM + 'layup__031_015pickle_layup_001_001.json', { from: 42 }); const ev = jumpEvents(frames, 8);
  let rel = frames.findIndex((f, i) => i > ev.takeoff && !f.contact); put('layup', frames, { ev: { ...ev, release: rel } }, true); }
// 7. Quaternius 通用動作庫（CC0）：坐姿、待機、跳舞、走路、慢跑、衝刺（原地循環動作）
{ const Q = '/tmp/qtj/'; const standY = retarget(Q + 'Idle_Loop.json').frames[0].hipY;
  for (const [name, file, speed] of [['sit', 'Sitting_Idle_Loop'], ['sitTalk', 'Sitting_Talking_Loop'], ['idle', 'Idle_Loop'], ['idleTalk', 'Idle_Talking_Loop'], ['foldArms', 'Idle_FoldArms_Loop'],
    ['dance', 'Dance_Loop'], ['walk', 'Walk_Loop', 1.4], ['jog', 'Jog_Fwd_Loop', 3.4], ['sprint', 'Sprint_Loop', 6.2]]) {
    const { frames } = retarget(Q + file + '.json'); const seg = frames.slice(0, frames.length - 1);
    clips[name] = { fps: 30, n: seg.length, stand: standY, ball: false, loop: true, speed: speed ? rigSpeed(seg) : undefined, data: pack(seg) };
  } }
const meta = Object.fromEntries(Object.entries(clips).map(([k, v]) => [k, { ...v, data: v.data.length }]));
console.log(JSON.stringify(meta, null, 0));
fs.writeFileSync('src/mocapData.js', '// 真人動作資料（已轉成遊戲骨架），由 tools/build_mocap.mjs 產生\n// 來源：CMU Graphics Lab Motion Capture Database（mocap.cs.cmu.edu，免費使用）、SkillMimic BallPlay-M（github.com/wyhuai/SkillMimic，Apache 2.0）、Quaternius Universal Animation Library 1 & 2（CC0）\nexport const MOCAP_BONES = ' + JSON.stringify(BONES) + ';\nexport const MOCAP = ' + JSON.stringify(clips) + ';\n');
