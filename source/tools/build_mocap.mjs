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
// 8. SkillMimic BallPlay-M 其他全部籃球動作（Apache 2.0）：同類動作做成多個版本，遊戲裡分給不同球員／隨機挑
const GROUPS = { rebStand: [], rebound: ['rebound'], catch: ['catch'], pick: [], shot: ['jumpshot'], drun: ['drun'], xover: [] };
{ const files = fs.readdirSync(SM).filter(f => f.endsWith('.json')).sort();
  const firstContact = (fr, from = 0) => fr.findIndex((f, i) => i >= from && f.contact);
  const firstFree = (fr, from) => fr.findIndex((f, i) => i > from && !f.contact);
  let nr = 0, nc = 0, np = 0, skipped = [];
  for (const f of files) {
    const { frames } = retarget(SM + f);
    if (f.startsWith('rebound__')) { if (f === 'rebound__002_025pickle_rebound_1.json') continue;
      const ev = jumpEvents(frames, 4), grab = firstContact(frames, 1);
      if (ev.takeoff < 0 || ev.land <= ev.takeoff || grab < ev.takeoff || grab > ev.land + 2) { // 沒跳起來的：站著伸手抓球的版本
        if (grab >= 4) { const name = 'rebS' + (GROUPS.rebStand.length + 1); put(name, frames.slice(0, Math.min(frames.length, grab + 20)), { ev: { grab } }, true); GROUPS.rebStand.push(name); } else skipped.push(f); continue; }
      const name = 'reb' + (++nr); put(name, frames, { ev: { ...ev, grab } }, true); GROUPS.rebound.push(name); }
    else if (f.startsWith('catch__')) { if (f.includes('catch_013')) continue;
      const grab = firstContact(frames, 1); if (grab < 6) { skipped.push(f); continue; }
      const name = 'catch' + (++nc); put(name, frames.slice(0, Math.min(frames.length, grab + 16)), { ev: { grab } }, true); GROUPS.catch.push(name); }
    else if (f.startsWith('pick_40__')) {
      const grab = firstContact(frames, 1); if (grab < 8) { skipped.push(f); continue; }
      const name = 'pick' + (++np); put(name, frames.slice(Math.max(0, grab - 24), Math.min(frames.length, grab + 14)), { ev: { grab: Math.min(24, grab) } }, true); GROUPS.pick.push(name); }
    else if (f.startsWith('shot_style')) { const k = 'ABC'[+f[10] - 1]; const ev = jumpEvents(frames, 4);
      const rel = firstFree(frames, ev.takeoff > 0 ? ev.takeoff : 0);
      if (ev.takeoff < 0 || ev.land <= ev.takeoff || rel < 0) { skipped.push(f); continue; }
      put('shot' + k, frames, { ev: { ...ev, release: rel } }, true); GROUPS.shot.push('shot' + k); }
    else if (f.startsWith('pass__')) { const rel = firstFree(frames, 3); put('pass', frames.slice(0, Math.min(frames.length, rel + 14)), { ev: { release: rel } }, true); }
    else if (f.startsWith('turnlayup__') || f.startsWith('turnhook__')) { const ev = jumpEvents(frames, 4); const rel = firstFree(frames, Math.max(0, ev.takeoff));
      put(f.startsWith('turnhook') ? 'hook' : 'turnLayup', frames, { ev: { ...ev, release: rel } }, true); }
    else if (f.startsWith('rturn2lhand__')) { // 跑動中右手→左手 Crossover：從換手前的最後一次運球開始
      const sw = frames.findIndex((fr, i) => i > 30 && fr.ballL && fr.ballL.x > 0); const a = Math.max(0, sw - 14), seg = frames.slice(a, Math.min(frames.length, sw + 14));
      put('xoverRun', seg, { ev: { sw: sw - a } }, true); GROUPS.xover.push('xoverRun'); }
    else if (f.startsWith('lleg_style')) { const name = 'xover' + f[10]; // 原地左右換手（兩種風格）
      const sw = frames.findIndex((fr, i) => i > 2 && fr.ballL && frames[i - 1].ballL && fr.ballL.x > 0 && frames[i - 1].ballL.x <= 0);
      put(name, frames, { ev: { sw }, loop: true }, true); GROUPS.xover.push(name); }
    else if (f.startsWith('legturn__')) { const sw = frames.findIndex((fr, i) => i > 3 && fr.ballL && fr.ballL.x > 0); put('legturn', frames, { ev: { sw } }, true); }
    else if (f.startsWith('back__')) { const sw = frames.findIndex((fr, i) => i > 40 && fr.ballL && fr.ballL.x > 0); const a = Math.max(0, sw - 40); put('behind', frames.slice(a, Math.min(frames.length, sw + 12)), { ev: { sw: sw - a } }, true); }
    else if (f.startsWith('lrun__') || f.startsWith('rrun__') || (f.startsWith('run__') && !f.includes('pickle_run_3'))) {
      const b = bestLoop(frames, 14, 40); const seg = frames.slice(b.i, b.j), dist = Math.hypot(frames[b.j].x - frames[b.i].x, frames[b.j].z - frames[b.i].z);
      const name = f.startsWith('lrun') ? 'drunL' : f.startsWith('rrun') ? 'drunR' : 'drun' + (GROUPS.drun.length + 1);
      put(name, seg, { loop: true, speed: rigSpeed(seg), stance: stanceSpeed(seg), rootSpeed: dist / (seg.length / 30) }, true); if (/^drun\d/.test(name)) GROUPS.drun.push(name); else (GROUPS.drunTurn = GROUPS.drunTurn || []).push(name); }
    else if (f.startsWith('turn__')) { /* 跟 rturn2lhand 是同一段資料，略過 */ }
    else skipped.push(f);
  }
  console.error('skipped', skipped);
}
// 10. CMU 動作庫裡其他全部籃球動作（06 運球、102 籃球攻防、124 投籃／罰球／上籃、裁判手勢）
{ const cm = (f, o) => retarget(D + f, o).frames, skipped = [];
  const loopOf = (fr, mn = 20, mx = 60) => { const b = bestLoop(fr, Math.min(mn, fr.length - 6), mx); return b ? fr.slice(b.i, b.j) : fr; };
  const lowsOf = seg => { const L = []; for (let k = 1; k < seg.length - 1; k++) if (seg[k].rhand < seg[k - 1].rhand && seg[k].rhand <= seg[k + 1].rhand) L.push(k); return L.length ? L : undefined; };
  const addLoop = (name, fr, grp) => { const seg = loopOf(fr); put(name, seg, { loop: true, speed: rigSpeed(seg), lows: grp && grp.startsWith('drib') ? lowsOf(seg) : undefined }); if (grp) (GROUPS[grp] = GROUPS[grp] || []).push(name); };
  // 06：走著運球（前進、後退、側移、轉彎、換手、低運球）
  for (const [n, f, g] of [['dribF2', '06_03', 'dribble'], ['dribF3', '06_04', 'dribble'], ['dribF4', '06_05', 'dribble'], ['dribBack1', '06_06', 'dribBack'], ['dribBack2', '06_07', 'dribBack'],
    ['dribSide1', '06_08', 'dribSide'], ['dribSide2', '06_09', 'dribSide'], ['dribTurnL', '06_10', 'dribble'], ['dribTurnR', '06_11', 'dribble'], ['dribCross', '06_12', 'dribble'], ['dribLow', '06_13', 'dribLow']])
    addLoop(n, cm('006/' + f + '.bvh', f === '06_13' ? { to: 600 } : {}), g);
  GROUPS.dribble.unshift('dribble');
  // 投籃：跳投／定點投／罰球／上籃
  const shot = (name, f, grp, pre = 30, post = 14) => { const fr = cm(f); const ev0 = jumpEvents(fr, 10); let rel = -1, m = -1;
    const a0 = ev0.takeoff > 0 ? ev0.takeoff : 0, a1 = ev0.land > 0 ? ev0.land : fr.length; for (let i = a0; i < a1; i++) if (fr[i].rhand > m) { m = fr[i].rhand; rel = i; }
    if (ev0.takeoff < 0) { m = -1; for (let i = 0; i < fr.length; i++) if (fr[i].rhand > m) { m = fr[i].rhand; rel = i; } }
    const st = Math.max(0, (ev0.takeoff > 0 ? ev0.takeoff : rel) - pre), en = Math.min(fr.length, (ev0.land > 0 ? ev0.land : rel) + post), seg = fr.slice(st, en);
    const sh = x => x < 0 ? -1 : x - st; put(name, seg, { ev: { takeoff: sh(ev0.takeoff), land: sh(ev0.land), release: rel - st } }); if (grp) GROUPS[grp].push(name); return clips[name].ev; };
  console.error('shots', shot('shotCMU', '006/06_15.bvh', 'shot'), shot('setShot', '124/124_03.bvh', null), shot('setShot2', '006/06_14.bvh', null), shot('ft', '124/124_04.bvh', null, 45, 20));
  { const fr = cm('124/124_06.bvh'); const ev = jumpEvents(fr, 10); let rel = ev.takeoff, m = -1; for (let i = ev.takeoff; i < ev.land; i++) if (fr[i].rhand > m) { m = fr[i].rhand; rel = i; }
    const st = Math.max(0, ev.takeoff - 30), seg = fr.slice(st, Math.min(fr.length, ev.land + 14)); put('layupCMU', seg, { ev: { takeoff: ev.takeoff - st, land: ev.land - st, release: rel - st } }); GROUPS.layup = ['layup', 'layupCMU']; }
  // 102：籃球攻防（持球跑動轉彎、轉身、切入、假動作、投籃假動作、防守滑步、軸心腳）
  const M102 = { '01': 'drunTurnR1', '02': 'drunTurnL1', '03': 'drunTurnL2', '04': 'drunTurnR2', '05': 'drunStraight', '06': 'drunTurnR3', '07': 'drunTurnL3', '08': 'drunTurnR4', '33': 'drunTurnR5',
    '10': 'runNoBall', '11': 'spin1', '12': 'spin2', '15': 'spin3', '13': 'goRight', '14': 'goLeft', '16': 'evadeL', '17': 'evadeR', '18': 'feintL', '19': 'feintR', '20': 'pumpR', '21': 'pumpL',
    '22': 'def1', '23': 'def2', '24': 'def3', '25': 'def4', '26': 'def5', '27': 'def6', '28': 'def7', '29': 'pivot', '30': 'drive0', '31': 'driveR', '32': 'driveL' };
  for (const [k, name] of Object.entries(M102)) { const fr = cm('102/102_' + k + '.bvh'); let fake = -1, m = -1; for (let i = 0; i < fr.length * 0.7; i++) if (fr[i].rhand > m) { m = fr[i].rhand; fake = i; }
    if (name.startsWith('drun')) { const seg = loopOf(fr, 14, 40); put(name, seg, { loop: true, speed: rigSpeed(seg) }); } else put(name, fr, { speed: rigSpeed(fr), ev: { fake } });
    const g = name.replace(/\d+$/, '').replace(/^drunTurn[LR]$/, 'drunTurn').replace(/^drunStraight$/, 'drun'); (GROUPS[g] = GROUPS[g] || []).push(name); }
  { const fr = cm('102/102_10.bvh'); addLoop('runLoop', fr.slice(6), null); }
  // 裁判手勢：每段取手動作最多的 3 秒
  for (const f of ['026/26_02', '027/27_02', '027/27_06', '028/28_01', '028/28_05', '029/29_02', '029/29_07', '030/30_01', '030/30_07', '031/31_01', '031/31_05', '032/32_03', '032/32_07', '040/40_12', '041/41_10', '041/41_11']) {
    let fr; try { fr = cm(f + '.bvh'); } catch (e) { skipped.push(f); continue; }
    let best = 0, bi = 0; for (let i = 0; i + 90 < fr.length; i += 15) { let v = 0; for (let j = i; j < i + 90; j++) v += Math.max(fr[j].rhand, fr[j].lhand); if (v > best) { best = v; bi = i; } }
    const name = 'sig' + ((GROUPS.signal || []).length + 1); put(name, fr.slice(bi, bi + 90)); (GROUPS.signal = GROUPS.signal || []).push(name); }
  console.error('cmu skipped', skipped);
}
// 9. Quaternius 其他用得到的：點頭、搖頭、被撞、蹲著看、坐下／站起、正式走路、喊話
{ const Q = '/tmp/qtj/'; const standY = clips.idle.stand;
  for (const [name, file, loop] of [['yes', 'Yes'], ['no', 'Idle_No_Loop', true], ['hitChest', 'Hit_Chest'], ['hitHead', 'Hit_Head'], ['hitBack', 'Hit_Knockback'], 
    ['sitDown', 'Sitting_Enter'], ['standUp', 'Sitting_Exit'], ['walkFormal', 'Walk_Formal_Loop', true], ['call', 'Idle_Rail_Call', true]]) {
    const { frames } = retarget(Q + file + '.json'); const seg = loop ? frames.slice(0, frames.length - 1) : frames;
    clips[name] = { fps: 30, n: seg.length, stand: standY, ball: false, loop: !!loop, data: pack(seg) };
  } }
const meta = Object.fromEntries(Object.entries(clips).map(([k, v]) => [k, { ...v, data: v.data.length }]));
console.log(JSON.stringify(meta, null, 0));
fs.writeFileSync('src/mocapData.js', '// 真人動作資料（已轉成遊戲骨架），由 tools/build_mocap.mjs 產生\n// 來源：CMU Graphics Lab Motion Capture Database（mocap.cs.cmu.edu，免費使用）、SkillMimic BallPlay-M（github.com/wyhuai/SkillMimic，Apache 2.0）、Quaternius Universal Animation Library 1 & 2（CC0）\nexport const MOCAP_BONES = ' + JSON.stringify(BONES) + ';\nexport const MOCAP = ' + JSON.stringify(clips) + ';\nexport const MOCAP_GROUPS = ' + JSON.stringify(GROUPS) + ';\n');
