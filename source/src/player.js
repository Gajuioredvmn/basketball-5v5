import * as THREE from 'three';
import { TEAM_INFO } from './const.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import { MOCAP, MOCAP_BONES, MOCAP_BLOB } from './mocapData.js';

// ---- 真人動作（CMU 動作捕捉）播放 ----
const CLIPS = {};
// 片段的說明資料（長度、事件幀等）馬上可用；動作數字是壓縮的，開啟時在背景解壓（約幾十毫秒），解完之前先用程式動作
for (const [name, c] of Object.entries(MOCAP)) CLIPS[name] = { ...c, a: null, per: MOCAP_BONES.length * 4 + 1 + (c.ball ? 4 : 0), hy: MOCAP_BONES.length * 4 };
export const mocapReady = (async () => {
  const bin = atob(MOCAP_BLOB), u8 = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  const buf = await new Response(new Blob([u8]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer();
  const D = new Int16Array(buf), NB = MOCAP_BONES.length * 4;
  for (const c of Object.values(CLIPS)) {
    const per = c.per, n = c.len / per, a = new Int16Array(c.len); let k = c.o;
    for (let ch = 0; ch < per; ch++) { let v = 0; const sh = ch < NB ? 8 : 1; for (let f = 0; f < n; f++) { v += D[k++]; a[f * per + ch] = v * sh; } }
    c.a = a;
  }
})().catch(e => console.warn('mocap decode failed', e));
export const clipInfo = name => CLIPS[name];
// 片段裡球的位置（角色自己的座標：面向 +z、腳底中心為原點）與手有沒有碰到球
export function clipBall(name, f, mirror, out) {
  const c = CLIPS[name]; if (!c || !c.ball || !c.a) return null;
  const n = c.n; let f0 = Math.floor(f), t = f - f0;
  if (c.loop) f0 = ((f0 % n) + n) % n; else { f0 = Math.max(0, Math.min(n - 1, f0)); if (f0 === n - 1) t = 0; }
  const f1 = c.loop ? (f0 + 1) % n : Math.min(n - 1, f0 + 1), o0 = f0 * c.per + c.hy + 1, o1 = f1 * c.per + c.hy + 1, A = c.a;
  out.set((A[o0] * (1 - t) + A[o1] * t) / 1000, (A[o0 + 1] * (1 - t) + A[o1 + 1] * t) / 1000, (A[o0 + 2] * (1 - t) + A[o1 + 2] * t) / 1000);
  if (mirror) out.x = -out.x;
  return A[o0 + 3];
}
const MIRROR = MOCAP_BONES.map(b => { const m = b.match(/^(.*)([LR])$/); return m ? MOCAP_BONES.indexOf(m[1] + (m[2] === 'L' ? 'R' : 'L')) : MOCAP_BONES.indexOf(b); });
const _qa = new THREE.Quaternion(), _qb = new THREE.Quaternion(), _qI = new THREE.Quaternion(), _yAx = new THREE.Vector3(0, 1, 0), _xAx = new THREE.Vector3(1, 0, 0);
function clipQuat(c, fi, b, out) { const o = fi * c.per + b * 4, A = c.a; return out.set(A[o] / 32767, A[o + 1] / 32767, A[o + 2] / 32767, A[o + 3] / 32767).normalize(); }
function boneList(r) { return [r.hips, r.torso, r.chest, r.neck, r.headG, r.legL.hip, r.legL.knee, r.legL.ankle, r.legR.hip, r.legR.knee, r.legR.ankle, r.armL.sh, r.armL.el, r.armL.wr, r.armR.sh, r.armR.el, r.armR.wr]; }
// 把片段第 f 幀（可以是小數，會內插）套到骨架上；w 是混合比例，mask(i) 回傳每根骨頭的比例
function applyClip(r, c, f, w, mirror, mask) {
  if (!c.a) return 0;
  const n = c.n; let f0 = Math.floor(f), t = f - f0;
  if (c.loop) { f0 = ((f0 % n) + n) % n; } else { f0 = Math.max(0, Math.min(n - 1, f0)); if (f0 === n - 1) t = 0; }
  const f1 = c.loop ? (f0 + 1) % n : Math.min(n - 1, f0 + 1);
  const bl = r._bl || (r._bl = boneList(r));
  for (let i = 0; i < bl.length; i++) {
    const src = mirror ? MIRROR[i] : i, wi = w * (mask ? mask(i) : 1); if (wi <= 0.001) continue;
    clipQuat(c, f0, src, _qa); clipQuat(c, f1, src, _qb); _qa.slerp(_qb, t);
    if (mirror) { _qa.y = -_qa.y; _qa.z = -_qa.z; }
    bl[i].quaternion.slerp(_qa, wi);
  }
  const hy = (c.a[f0 * c.per + c.hy] * (1 - t) + c.a[f1 * c.per + c.hy] * t) / 1000;
  return hy - c.stand; // 骨盆比站立時低多少（蹲）
}

const geoCache = {};
const geo = (k, f) => geoCache[k] || (geoCache[k] = f());
const lathe = (pts, seg = 16, ps = 0, pl = Math.PI * 2) => new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg, ps, pl);

function canvasTex(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}
// 球衣：底色、側邊色塊、滾邊、號碼，加上布料皺褶與兩側陰影
export function jerseyTexture(team, number) {
  const t = TEAM_INFO[team];
  return canvasTex(512, 256, (g) => {
    g.fillStyle = t.color; g.fillRect(0, 0, 512, 256);
    g.fillStyle = t.dark; g.fillRect(116, 36, 22, 220); g.fillRect(374, 36, 22, 220);
    g.fillStyle = t.trim; g.fillRect(0, 0, 512, 9); g.fillRect(124, 36, 6, 220); g.fillRect(382, 36, 6, 220);
    // 布料網眼與皺褶
    for (let i = 0; i < 2600; i++) { g.fillStyle = `rgba(0,0,0,${Math.random() * 0.05})`; g.fillRect(Math.random() * 512, Math.random() * 256, 2, 2); }
    for (let i = 0; i < 26; i++) {
      const x = Math.random() * 512, y = 150 + Math.random() * 100;
      const gr = g.createLinearGradient(x - 20, y, x + 20, y + 10);
      gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(0.5, 'rgba(0,0,0,0.12)'); gr.addColorStop(1, 'rgba(255,255,255,0.05)');
      g.strokeStyle = gr; g.lineWidth = 6; g.beginPath(); g.moveTo(x - 24, y - 8); g.quadraticCurveTo(x, y + 6, x + 26, y - 4); g.stroke();
    }
    g.textAlign = 'center'; g.textBaseline = 'middle';
    const drawNum = (x, size, y) => {
      g.font = `900 ${size}px "Arial Black", Arial, sans-serif`;
      g.lineWidth = 9; g.strokeStyle = t.trim === '#ffffff' ? t.dark : t.trim; g.strokeText(String(number), x, y);
      g.fillStyle = t.num; g.fillText(String(number), x, y);
    };
    drawNum(256, 104, 150);
    if (team < 2) { g.font = 'bold 34px sans-serif'; g.fillStyle = t.num; g.fillText(t.name, 256, 72); }
    drawNum(0, 140, 140); drawNum(512, 140, 140);
    // 兩側陰影讓軀幹有立體感
    const sh = g.createLinearGradient(0, 0, 512, 0);
    sh.addColorStop(0, 'rgba(0,0,0,0.06)'); sh.addColorStop(0.25, 'rgba(0,0,0,0.2)'); sh.addColorStop(0.5, 'rgba(0,0,0,0)'); sh.addColorStop(0.75, 'rgba(0,0,0,0.2)'); sh.addColorStop(1, 'rgba(0,0,0,0.06)');
    g.fillStyle = sh; g.fillRect(0, 0, 512, 256);
  });
}
export function shortsTexture(team) {
  const t = TEAM_INFO[team];
  return canvasTex(256, 128, (g) => {
    g.fillStyle = t.color; g.fillRect(0, 0, 256, 128);
    g.fillStyle = t.dark; g.fillRect(0, 0, 256, 14);
    g.fillStyle = t.trim; g.fillRect(56, 0, 16, 128); g.fillRect(184, 0, 16, 128);
    g.fillStyle = t.dark; g.fillRect(52, 0, 4, 128); g.fillRect(72, 0, 4, 128); g.fillRect(180, 0, 4, 128); g.fillRect(200, 0, 4, 128);
    for (let i = 0; i < 18; i++) { const x = Math.random() * 256; g.strokeStyle = 'rgba(0,0,0,0.13)'; g.lineWidth = 4; g.beginPath(); g.moveTo(x, 20); g.quadraticCurveTo(x + 8, 70, x - 4, 128); g.stroke(); }
  });
}
function shade(hex, k) { const c = new THREE.Color(hex); c.multiplyScalar(k); return '#' + c.getHexString(); }
function faceTexture(skin, seed, style) {
  return canvasTex(256, 128, (g) => {
    g.fillStyle = skin; g.fillRect(0, 0, 256, 128);
    const cx = 64;
    // 臉部明暗：顴骨、下顎、眼窩
    const sd = g.createRadialGradient(cx, 64, 10, cx, 64, 60);
    sd.addColorStop(0, 'rgba(255,255,255,0.08)'); sd.addColorStop(0.6, 'rgba(0,0,0,0)'); sd.addColorStop(1, 'rgba(0,0,0,0.22)');
    g.fillStyle = sd; g.fillRect(0, 0, 256, 128);
    g.fillStyle = 'rgba(0,0,0,0.13)'; for (const s of [-1, 1]) { g.beginPath(); g.ellipse(cx + s * 10, 57, 8, 5, 0, 0, Math.PI * 2); g.fill(); }
    g.fillStyle = 'rgba(0,0,0,0.1)'; for (const s of [-1, 1]) { g.beginPath(); g.ellipse(cx + s * 19, 75, 6, 9, s * 0.3, 0, Math.PI * 2); g.fill(); }
    g.strokeStyle = 'rgba(20,12,8,0.9)'; g.lineWidth = 3.4; g.lineCap = 'round';
    g.beginPath(); g.moveTo(cx - 17, 50); g.quadraticCurveTo(cx - 11, 46, cx - 5, 48.5); g.stroke();
    g.beginPath(); g.moveTo(cx + 5, 48.5); g.quadraticCurveTo(cx + 11, 46, cx + 17, 50); g.stroke();
    for (const s of [-1, 1]) {
      g.fillStyle = '#f4efe8'; g.beginPath(); g.ellipse(cx + s * 10, 57, 4.6, 2.5, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#2a1a10'; g.beginPath(); g.arc(cx + s * 10, 57, 2.2, 0, Math.PI * 2); g.fill();
      g.fillStyle = 'rgba(255,255,255,0.9)'; g.fillRect(cx + s * 10 + 0.6, 55.6, 1.1, 1.1);
      g.strokeStyle = 'rgba(25,15,10,0.85)'; g.lineWidth = 1.3; g.beginPath(); g.ellipse(cx + s * 10, 56.6, 5, 2.8, 0, Math.PI, Math.PI * 2); g.stroke();
    }
    g.fillStyle = 'rgba(0,0,0,0.16)'; g.beginPath(); g.ellipse(cx, 69, 5.5, 3, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = shade(skin, 0.75); g.beginPath(); g.ellipse(cx, 79, 7.5, 2.4, 0, 0, Math.PI * 2); g.fill();
    g.strokeStyle = 'rgba(60,20,15,0.85)'; g.lineWidth = 1.6; g.beginPath(); g.moveTo(cx - 7, 78.6); g.quadraticCurveTo(cx, 80.2, cx + 7, 78.6); g.stroke();
    if (seed % 3 === 0) { g.fillStyle = 'rgba(15,10,8,0.6)'; g.beginPath(); g.ellipse(cx, 87, 11, 6, 0, 0, Math.PI); g.fill(); g.fillRect(cx - 9, 72, 18, 3); }
    // 頭皮：辮子／短髮紋路（在頭後方與上方）
    if (style === 3) { g.strokeStyle = 'rgba(15,10,8,0.85)'; g.lineWidth = 3; for (let i = 0; i < 9; i++) { const x = 120 + i * 14; g.beginPath(); g.moveTo(x, 0); g.lineTo(x + 6, 40); g.stroke(); } }
  });
}

export const SKINS = ['#8d5524', '#c68642', '#e0ac69', '#5c3a21', '#f1c27d', '#a86b3c', '#ffdbac', '#6b4423', '#d19a66', '#4a2c17'];
const vcMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.58 });
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _c = new THREE.Color(), _v = new THREE.Vector3(), _n = new THREE.Matrix3();

// 剛體零件（掛在頭骨上），用頂點顏色合併
function merged(parts) {
  const geos = parts.map(([g, col, x, y, z, sx = 1, sy = 1, sz = 1, rx = 0, ry = 0, rz = 0]) => {
    const c = g.clone();
    _m.compose(new THREE.Vector3(x, y, z), _q.setFromEuler(_e.set(rx, ry, rz)), new THREE.Vector3(sx, sy, sz));
    c.applyMatrix4(_m); _c.set(col);
    const n = c.attributes.position.count, arr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { arr[i * 3] = _c.r; arr[i * 3 + 1] = _c.g; arr[i * 3 + 2] = _c.b; }
    c.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    return c;
  });
  return new THREE.Mesh(mergeGeometries(geos), vcMat);
}

// 蒙皮身體：每個零件綁在一根骨頭上，靠近關節的頂點分一半權重給相鄰骨頭，彎曲時不會斷開
function skinBuilder(bones) {
  const groups = {};
  return {
    add(group, g, color, bone, opt = {}) {
      const { x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1, rx = 0, parent = null, child = null, len = 0.3, axis = -1, r = 0.07, full = false } = opt;
      const c = g.clone().toNonIndexed();
      _m.compose(new THREE.Vector3(x, y, z), _q.setFromEuler(_e.set(rx, 0, 0)), new THREE.Vector3(sx, sy, sz));
      c.applyMatrix4(_m);
      const pos = c.attributes.position, nrm = c.attributes.normal, cnt = pos.count;
      const si = new Uint16Array(cnt * 4), sw = new Float32Array(cnt * 4);
      const bi = bones.indexOf(bone), pi = parent ? bones.indexOf(parent) : -1, ci = child ? bones.indexOf(child) : -1;
      for (let i = 0; i < cnt; i++) {
        const along = axis * pos.getY(i);
        let w = 0, oi = 0;
        if (pi >= 0 && along < r) { w = 0.5 * (1 - Math.max(0, along) / r); oi = pi; }
        else if (ci >= 0 && along > len - r) { w = full ? Math.min(1, 0.5 + (along - len) / r * 0.5) : 0.5 * (1 - Math.max(0, len - along) / r); oi = ci; }
        si[i * 4] = bi; si[i * 4 + 1] = oi; sw[i * 4] = 1 - w; sw[i * 4 + 1] = w;
      }
      // 轉到骨架的綁定空間
      c.applyMatrix4(bone.matrixWorld);
      if (color) { _c.set(color); const arr = new Float32Array(cnt * 3); for (let i = 0; i < cnt; i++) { arr[i * 3] = _c.r; arr[i * 3 + 1] = _c.g; arr[i * 3 + 2] = _c.b; } c.setAttribute('color', new THREE.BufferAttribute(arr, 3)); }
      c.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
      c.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
      (groups[group] = groups[group] || []).push(c);
    },
    build(root, skeleton, mats) {
      for (const k in groups) {
        const m = new THREE.SkinnedMesh(mergeGeometries(groups[k]), mats[k]);
        m.frustumCulled = false; root.add(m); m.bind(skeleton, new THREE.Matrix4());
      }
    },
  };
}

export function makePlayerMesh(team, idx, number, scale, skinIdx, opts = {}) {
  const t = TEAM_INFO[team];
  const skinCol = SKINS[skinIdx % SKINS.length];
  const style = skinIdx % 6; // 0 短髮 1 寸頭 2 爆炸頭 3 辮子 4 短髮+頭帶 5 髒辮
  const mats = {
    skin: vcMat,
    jersey: new THREE.MeshStandardMaterial({ map: jerseyTexture(team, number), roughness: 0.66 }),
    shorts: new THREE.MeshStandardMaterial({ map: shortsTexture(team), roughness: 0.7, side: THREE.DoubleSide }),
  };
  const face = new THREE.MeshStandardMaterial({ map: faceTexture(skinCol, opts.long ? 1 : skinIdx, opts.long ? 0 : style), roughness: 0.52 });
  const hairCol = skinIdx % 7 === 4 ? '#4a2e18' : '#120c08';
  const shoeCol = team === 3 ? '#f2f2f2' : team === 0 ? '#f2f2f2' : '#121212', soleCol = team === 1 ? '#f2c14e' : '#ffffff', sockCol = team === 1 ? '#111111' : '#ffffff';
  const accent = team === 0 ? '#c62828' : (team === 1 ? '#f2c14e' : '#888888');
  const sleeve = team < 2 && skinIdx % 4 === 1, sleeveCol = team === 1 ? '#111111' : '#ffffff';

  const root = new THREE.Group();
  const B = () => new THREE.Bone();
  const body = B(); root.add(body);
  const hips = B(); hips.position.y = 1.052; body.add(hips);
  const legs = [];
  for (const side of [1, -1]) { const hip = B(); hip.position.set(side * 0.105, -0.06, 0); hips.add(hip); const knee = B(); knee.position.y = -0.47; hip.add(knee); const ankle = B(); ankle.position.y = -0.43; knee.add(ankle); legs.push({ hip, knee, ankle }); }
  // 腰（torso）→ 胸（chest）→ 脖子（neck）→ 頭；肩膀掛在胸上，上下半身可以分開扭轉
  const torso = B(); hips.add(torso);
  const chest = B(); chest.position.y = 0.32; torso.add(chest);
  const neck = B(); neck.position.y = 0.3; chest.add(neck);
  const headG = B(); headG.position.y = 0.22; neck.add(headG);
  const arms = [];
  for (const side of [1, -1]) { const sh = B(); sh.position.set(side * 0.27, 0.215, 0); chest.add(sh); const el = B(); el.position.y = -0.3; sh.add(el); const wr = B(); wr.position.y = -0.25; el.add(wr); arms.push({ sh, el, wr }); }
  const bones = [body, hips, legs[0].hip, legs[0].knee, legs[1].hip, legs[1].knee, torso, headG, arms[0].sh, arms[0].el, arms[1].sh, arms[1].el, chest, neck, legs[0].ankle, legs[1].ankle, arms[0].wr, arms[1].wr];
  root.updateMatrixWorld(true);
  const skel = new THREE.Skeleton(bones);
  const sb = skinBuilder(bones);

  // ---- 腿 ----
  legs.forEach(({ hip, knee, ankle }, i) => {
    const side = i === 0 ? 1 : -1;
    sb.add('skin', geo('thigh', () => lathe([[0.001, 0.03], [0.07, 0.03], [0.09, -0.02], [0.096, -0.14], [0.086, -0.3], [0.064, -0.44], [0.056, -0.5], [0.001, -0.51]])), skinCol, hip, { parent: hips, child: knee, len: 0.47, r: 0.09 });
    sb.add('skin', geo('calf', () => lathe([[0.001, 0.04], [0.054, 0.03], [0.058, 0.0], [0.07, -0.1], [0.066, -0.18], [0.047, -0.32], [0.039, -0.42], [0.001, -0.43]])), skinCol, knee, { parent: hip, child: ankle, len: 0.43, r: 0.06, full: true });
    sb.add('skin', geo('sock', () => new THREE.CylinderGeometry(0.051, 0.044, 0.2, 14)), sockCol, knee, { y: -0.35, child: ankle, len: 0.43, r: 0.05, full: true });
    // 高筒籃球鞋：鞋身、鞋領、鞋底、鞋頭、側邊飾條
    sb.add('skin', geo('shoe', () => new THREE.BoxGeometry(0.112, 0.1, 0.27, 2, 2, 3)), shoeCol, ankle, { y: -0.025, z: 0.035 });
    sb.add('skin', geo('collar', () => new THREE.CylinderGeometry(0.06, 0.062, 0.07, 14)), shoeCol, ankle, { y: 0.03, z: -0.02 });
    sb.add('skin', geo('sole', () => new THREE.BoxGeometry(0.12, 0.03, 0.3)), soleCol, ankle, { y: -0.079, z: 0.04 });
    sb.add('skin', geo('toe', () => new THREE.SphereGeometry(0.057, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2)), shoeCol, ankle, { y: -0.067, z: 0.165, sx: 1, sy: 0.9, sz: 0.72 });
    sb.add('skin', geo('stripe', () => new THREE.BoxGeometry(0.116, 0.02, 0.16)), accent, ankle, { y: -0.03, z: 0.02, rx: -0.35 });
    sb.add('skin', geo('lace', () => new THREE.BoxGeometry(0.06, 0.012, 0.12)), soleCol, ankle, { y: 0.028, z: 0.09, rx: -0.25 });
    // 過膝球褲褲管（權重分給腰部，胯下比較順）
    sb.add('shorts', geo('shortleg', () => new THREE.CylinderGeometry(0.122, 0.132, 0.42, 18, 3, true)), null, hip, { x: side * 0.01, y: -0.19, parent: hips, len: 0.42, r: 0.16, sz: 0.95 });
  });
  sb.add('shorts', geo('shorts', () => new THREE.CylinderGeometry(0.205, 0.238, 0.26, 18, 2, true)), null, hips, { y: -0.07, sz: 0.78 });
  // ---- 軀幹（球衣），腰部權重分給骨盆 ----
  sb.add('jersey', geo('torso', () => lathe([[0.2, -0.03], [0.173, 0.0], [0.168, 0.12], [0.19, 0.28], [0.216, 0.4], [0.233, 0.5], [0.206, 0.57], [0.12, 0.62], [0.05, 0.635]], 22, Math.PI, Math.PI * 2)), null, torso, { y: 0.04, sz: 0.62, parent: hips, child: chest, len: 0.32, axis: 1, r: 0.12, full: true });
  sb.add('skin', geo('waistband', () => new THREE.CylinderGeometry(0.205, 0.205, 0.045, 18)), t.trim, hips, { y: 0.06, sz: 0.76 });
  sb.add('skin', geo('trap', () => new THREE.SphereGeometry(0.11, 14, 8)), skinCol, chest, { y: 0.28, z: -0.01, sx: 1.25, sy: 0.45, sz: 0.7 });
  sb.add('skin', geo('neck', () => new THREE.CylinderGeometry(0.056, 0.066, 0.16, 12, 2)), skinCol, neck, { y: 0.07, parent: chest, axis: 1, r: 0.05 });
  // ---- 手臂：肩膀權重分給軀幹、手肘彎曲順接 ----
  arms.forEach(({ sh, el, wr }, i) => {
    const side = i === 0 ? 1 : -1;
    const armCol = sleeve && side === -1 ? sleeveCol : skinCol;
    sb.add('skin', geo('delt', () => new THREE.SphereGeometry(0.074, 14, 10)), skinCol, sh, { x: side * 0.008, y: -0.025, sy: 1.12, sx: 0.95, parent: chest, r: 0.1 });
    sb.add('skin', geo('uarm', () => lathe([[0.001, 0.02], [0.056, 0.0], [0.063, -0.1], [0.056, -0.2], [0.045, -0.29], [0.04, -0.32], [0.001, -0.33]])), armCol, sh, { parent: chest, child: el, len: 0.3, r: 0.07 });
    sb.add('skin', geo('farm', () => lathe([[0.001, 0.04], [0.042, 0.03], [0.048, 0], [0.051, -0.07], [0.041, -0.18], [0.033, -0.25], [0.001, -0.26]])), armCol, el, { parent: sh, child: wr, len: 0.25, r: 0.05, full: true });
    sb.add('skin', geo('hand', () => new THREE.SphereGeometry(0.05, 12, 10)), skinCol, wr, { y: -0.05, z: 0.01, sx: 0.75, sy: 1.35, sz: 0.5 });
    sb.add('skin', geo('thumb', () => new THREE.CapsuleGeometry(0.014, 0.04, 3, 6)), skinCol, wr, { x: side * -0.02, y: -0.035, z: 0.035 });
  });
  sb.build(root, skel, mats);

  // ---- 頭（剛體） ----
  const head = new THREE.Mesh(geo('head', () => new THREE.SphereGeometry(0.108, 24, 16)), face); head.scale.set(0.88, 1.08, 0.98); headG.add(head);
  const hp = [
    [geo('jaw', () => new THREE.SphereGeometry(0.07, 14, 8)), skinCol, 0, -0.06, 0.03, 1.05, 0.7, 0.95],
    [geo('nose', () => new THREE.SphereGeometry(0.018, 8, 6)), skinCol, 0, -0.012, 0.104, 1, 1.25, 1],
    [geo('ear', () => new THREE.SphereGeometry(0.024, 8, 6)), skinCol, 0.095, -0.005, -0.005, 0.5, 1, 0.8],
    [geo('ear', () => null), skinCol, -0.095, -0.005, -0.005, 0.5, 1, 0.8],
  ];
  if (opts.long) { // 長髮綁馬尾
    hp.push([geo('hairL', () => new THREE.SphereGeometry(0.118, 18, 10, 0, Math.PI * 2, 0, Math.PI * 0.55)), hairCol, 0, 0.012, -0.012, 0.95, 1.02, 1.06]);
    hp.push([geo('pony', () => new THREE.CapsuleGeometry(0.035, 0.2, 4, 8)), hairCol, 0, -0.03, -0.12, 1, 1, 1, -0.35]);
    hp.push([geo('tie', () => new THREE.TorusGeometry(0.03, 0.01, 6, 12)), '#ffd23a', 0, 0.06, -0.1, 1, 1, 1, 1.2]);
  }
  else if (style === 0 || style === 4) hp.push([geo('hair', () => new THREE.SphereGeometry(0.114, 18, 8, 0, Math.PI * 2, 0, Math.PI * 0.45)), hairCol, 0, 0.018, -0.008, 0.92, 1.0, 1.03]);
  else if (style === 1) hp.push([geo('buzz', () => new THREE.SphereGeometry(0.111, 18, 8, 0, Math.PI * 2, 0, Math.PI * 0.42)), hairCol, 0, 0.01, -0.004, 0.9, 1.06, 1.0]);
  else if (style === 2) hp.push([geo('afro', () => new THREE.SphereGeometry(0.135, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.55)), hairCol, 0, 0.03, -0.015, 0.95, 0.95, 1.02]);
  else if (style === 3) { for (let k = -3; k <= 3; k++) hp.push([geo('braid', () => new THREE.CapsuleGeometry(0.011, 0.17, 3, 6)), hairCol, k * 0.022, 0.055, -0.02, 1, 1, 1, 1.25 + Math.abs(k) * 0.02, 0, k * 0.12]); }
  else if (style === 5) {
    hp.push([geo('hair', () => null), hairCol, 0, 0.018, -0.008, 0.93, 1.0, 1.04]);
    for (let k = 0; k < 10; k++) { const a = Math.PI * 0.55 + k / 9 * Math.PI * 0.9; hp.push([geo('dread', () => new THREE.CapsuleGeometry(0.014, 0.15, 3, 6)), hairCol, Math.cos(a) * 0.1, -0.03, Math.sin(a) * 0.09 - 0.01, 1, 1, 1, Math.sin(a) * -0.25, 0, Math.cos(a) * 0.25]); }
  }
  if (style === 4 && team < 2) hp.push([geo('band', () => new THREE.TorusGeometry(0.103, 0.014, 6, 22)), sleeveCol, 0, 0.045, 0, 1, 1, 1, Math.PI / 2]);
  headG.add(merged(hp));
  if (opts.pom) for (const a of arms) { // 彩球
    const pm = new THREE.Mesh(geo('pom', () => new THREE.IcosahedronGeometry(0.11, 1)), new THREE.MeshStandardMaterial({ color: opts.pom, roughness: 0.35, metalness: 0.5, flatShading: true }));
    pm.position.set(0, -0.08, 0.01); a.wr.add(pm);
  }
  if (opts.mascot) { // 吉祥物：原創的大頭熊，頭套蓋住原本的頭
    headG.children.forEach(c => { c.visible = false; });
    const fur = new THREE.MeshStandardMaterial({ color: opts.mascot, roughness: 0.95 }), light = new THREE.MeshStandardMaterial({ color: '#e9d2a8', roughness: 0.9 });
    const black = new THREE.MeshStandardMaterial({ color: '#141010', roughness: 0.4 }), white = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.4 });
    const hd = new THREE.Group(); hd.position.y = 0.06; headG.add(hd);
    const add = (g, m, x, y, z, sx = 1, sy = 1, sz = 1) => { const o = new THREE.Mesh(g, m); o.position.set(x, y, z); o.scale.set(sx, sy, sz); hd.add(o); return o; };
    add(new THREE.SphereGeometry(0.26, 24, 18), fur, 0, 0, 0, 1, 0.95, 0.95);
    add(new THREE.SphereGeometry(0.11, 16, 10), light, 0, -0.07, 0.2, 1.1, 0.8, 0.8);
    add(new THREE.SphereGeometry(0.035, 12, 8), black, 0, -0.03, 0.29);
    for (const sd of [-1, 1]) {
      add(new THREE.SphereGeometry(0.085, 14, 10), fur, sd * 0.19, 0.19, -0.02, 1, 1, 0.55);
      add(new THREE.SphereGeometry(0.05, 12, 8), light, sd * 0.19, 0.19, 0.02, 1, 1, 0.4);
      add(new THREE.SphereGeometry(0.045, 12, 8), white, sd * 0.085, 0.06, 0.215, 1, 1.2, 0.6);
      add(new THREE.SphereGeometry(0.022, 10, 6), black, sd * 0.085, 0.06, 0.24);
    }
    const smile = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.008, 6, 16, Math.PI), black); smile.position.set(0, -0.11, 0.255); smile.rotation.z = Math.PI; hd.add(smile);
  }

  root.scale.setScalar(scale);
  const r = { root, body, hips, torso, chest, neck, headG, legL: legs[0], legR: legs[1], armL: arms[0], armR: arms[1], mats };
  r.joints = [legs[0].hip, legs[0].knee, legs[1].hip, legs[1].knee, arms[0].sh, arms[0].el, arms[1].sh, arms[1].el, torso, headG, chest, neck, legs[0].ankle, legs[1].ankle, arms[0].wr, arms[1].wr];
  return r;
}

// 倒影：用 SkeletonUtils 複製一份有自己骨架的模型，鏡像到地板下
export function makeReflection(rig, scene) {
  const clone = SkeletonUtils.clone(rig.root);
  const src = [], dst = [];
  rig.root.traverse(o => src.push(o)); clone.traverse(o => dst.push(o));
  scene.add(clone);
  return { clone, sync() {
    for (let i = 1; i < src.length; i++) { dst[i].position.copy(src[i].position); dst[i].quaternion.copy(src[i].quaternion); }
    clone.position.set(rig.root.position.x, 0, rig.root.position.z);
    clone.quaternion.copy(rig.root.quaternion);
    const s = rig.root.scale.x; clone.scale.set(s, -s, s);
  } };
}

const _hv = new THREE.Vector3();
// 手掌在世界座標的位置（運球時讓球真的碰到手）
export function handWorld(rig, right) {
  const wr = right ? rig.armR.wr : rig.armL.wr;
  return wr.localToWorld(_hv.set(0, -0.05, 0.01)).clone();
}

const lerp = (a, b, t) => a + (b - a) * t;
// 腳掌鎖地適用於所有「腳踩在地上」的姿勢；只有坐著、掛框這類腿本身有特殊擺法的姿勢不鎖
const NOLOCK = new Set(['sit', 'hang', 'dunk', 'windmill', 'clutch', 'layup', 'dance']);
const LOCO = { has: m => !NOLOCK.has(m) };

export function animatePlayer(p, dt) {
  if (p.rig._moDy) { p.rig.body.position.y -= p.rig._moDy; p.rig._moDy = 0; }
  const r = p.rig;
  const spd = Math.hypot(p.vel.x, p.vel.z);
  const air = p.jy > 0.02;
  // 步頻隨速度提高、步幅 = 速度 / 步頻，擺腿角度依步幅算，腳不會在地上滑
  // 步頻：每秒幾步；步幅上限 1.35m（再快就加快步頻），確保腳掌踩地時可以完全不動
  // 面向和移動方向不同時：側移慢（<3.2m/s）用防守滑步；更快或斜向跑時，下半身（骨盆和腿）轉向移動方向、上半身維持面向
  const fx = Math.sin(p.facing), fz = Math.cos(p.facing);
  const fw = p.vel.x * fx + p.vel.z * fz, lat = p.vel.x * -fz + p.vel.z * fx;
  const shuffle = spd > 0.6 && spd < 3.2 && Math.abs(lat) > Math.abs(fw) * 1.2;
  const va = Math.atan2(-lat, fw); // 移動方向相對面向的角度（正＝往左）
  const back = spd > 0.6 && !shuffle && Math.abs(va) > 1.95;
  const legYaw = back ? va - Math.sign(va) * Math.PI : va;
  // 步頻（每秒幾步）跟真人差不多：走路約 2 步、慢跑 2.6 步、衝刺 3.8 步
  const steps = shuffle ? Math.max(2.6 + spd * 0.7, spd / 0.5) : 1.8 + Math.min(spd, 7) * 0.35;
  // 一隻腳踩地的時間比例：走路 60%（兩腳會同時著地），跑越快越短（跑步時有兩腳都離地的騰空期），腳不用劈很開
  const duty = shuffle ? 0.5 : spd < 1.2 ? 0.6 : spd < 2.2 ? 0.6 - (spd - 1.2) * 0.24 : spd < 3.5 ? 0.36 - (spd - 2.2) / 1.3 * 0.06 : Math.max(0.26, 0.3 - (spd - 3.5) / 3.5 * 0.04);
  if (!air) p.runPhase += Math.PI * steps * dt * Math.min(1, spd / 0.4);
  const stepLen = spd * duty * 2 / steps, LEG = 0.98 * p.scale; // 踩地期間腳相對身體移動的距離
  const amp = Math.asin(Math.min(0.82, stepLen / (2 * LEG)));
  // 步態：一半時間踩地（腳相對身體「等速」往後移＝相對地面靜止）、一半時間抬腳往前擺
  const gait = phi => { phi = ((phi % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI); const st = 2 * Math.PI * duty;
    if (phi < st) return { u: 1 - 2 * phi / st, lift: 0 };
    const t = (phi - st) / (2 * Math.PI - st), e = t * t * (3 - 2 * t); return { u: -1 + 2 * e, lift: Math.sin(t * Math.PI) }; };
  const footAng = u => Math.asin(Math.max(-0.95, Math.min(0.95, u * stepLen / (2 * LEG))));
  const ph = p.runPhase;
  const sw = Math.min(1, spd / 6.5);
  const armS = Math.min(1, spd / 4.5);
  const k = Math.min(1, dt * 16);
  // 側移（防守滑步）：速度方向和面向差很多時，改成橫向滑步
  const gL = gait(ph), gR = gait(ph + Math.PI), lk = Math.min(1, stepLen * 1.4) * Math.min(1, spd / 0.6);
  const dirS = back ? -1 : 1;
  // 下半身轉向有速度上限（每秒 9 弧度），避免一瞬間轉過去造成踩地的腳打滑
  { const tgt = shuffle || spd <= 0.6 || air ? 0 : legYaw, cur = p._legYaw || 0, mx = 9 * dt; p._legYaw = cur + Math.max(-mx, Math.min(mx, tgt - cur)); }
  const legYawT = p._legYaw;
  const P = { hipL: shuffle ? 0 : -footAng(gL.u) * dirS - gL.lift * 0.25 * lk, hipR: shuffle ? 0 : -footAng(gR.u) * dirS - gR.lift * 0.25 * lk,
    kneeL: 0.16 + gL.lift * 1.15 * lk, kneeR: 0.16 + gR.lift * 1.15 * lk,
    hipLz: 0, hipRz: 0,
    shLx: Math.sin(ph) * armS * 0.75, shRx: -Math.sin(ph) * armS * 0.75, shLz: 0.1, shRz: -0.1, elL: -0.3 - Math.min(1, spd / 3) * 1.05, elR: -0.3 - Math.min(1, spd / 3) * 1.05, // 跑起來手肘彎約 80 度、前後擺
    lean: sw * 0.16 + Math.max(-1, Math.min(1, p.accLean || 0)) * 0.3, head: 0, bodyY: null, twist: 0, wrL: 0.15, wrR: 0.15, ankL: null, ankR: null, look: true };
  if (shuffle) { // 防守滑步：腳往側邊踩，同樣踩地時相對地面不動
    const s = Math.sign(lat);
    P.hipLz = 0.07 - footAng(gL.u) * s; P.hipRz = -0.07 - footAng(gR.u) * s;
    P.kneeL = 0.55 + gL.lift * 0.6; P.kneeR = 0.55 + gR.lift * 0.6; }
  const kDef = [P.kneeL, P.kneeR], kBase = shuffle ? 0.55 : 0.16 + 0.55 * sw; // 移動時本來的蹲低程度（不含抬腳）
  const mode = p.pose;
  // 腳步不經過平滑：同一種移動姿勢維持 0.15 秒後，腿的角度直接用步態算出來的值（平滑會讓腳落後、看起來在滑）
  if (p._lastMode !== mode) { p._lastMode = mode; p._modeT = 0; } else p._modeT = (p._modeT || 0) + dt;
  const kLeg = LOCO.has(mode) && !air ? 1 : k; // 落地緩衝也用腳掌鎖地（蹲低由身體高度做）
  const H = p.hand || 1;
  const setArm = (side, x, z, e) => { if (side > 0) { P.shRx = x; P.shRz = -z; P.elR = e; } else { P.shLx = x; P.shLz = z; P.elL = e; } };
  if (mode === 'defense') {
    P.hipL += -0.5; P.hipR += -0.5; P.kneeL += 0.8; P.kneeR += 0.8; P.lean = 0.28;
    P.shLx = -0.45; P.shRx = -0.45; P.shLz = 1.0; P.shRz = -1.0; P.elL = -0.55; P.elR = -0.55;
  } else if (mode === 'dribble') {
    // 球在最高點時手肘彎、手掌接球，往下推時手臂伸直
    const c = Math.cos(p.dribblePh * 2);
    setArm(H, -0.42 - c * 0.12, 0.28, -0.5 - c * 0.32);
    setArm(-H, -0.65, 0.4, -1.0);
    P.kneeL += 0.25; P.kneeR += 0.25; P.hipL -= 0.15; P.hipR -= 0.15; P.lean += 0.12;
  } else if (mode === 'cross' || mode === 'behind' || mode === 'xover') {
    const u = p.moveDur ? 1 - p.moveT / p.moveDur : 0.5;
    P.hipL = H > 0 ? -0.75 : 0.45; P.hipR = H > 0 ? 0.45 : -0.75; P.kneeL = H > 0 ? 0.95 : 0.45; P.kneeR = H > 0 ? 0.45 : 0.95; P.lean = 0.42;
    const give = u < 0.5 ? -H : H;
    if (mode === 'cross' || mode === 'xover') { setArm(give, -0.25, -0.35, -0.25); setArm(-give, -0.55, 0.25, -0.6); if (mode === 'xover') P.lean = 0.3; }
    else { setArm(give, 0.55, 0.35, -0.35); setArm(-give, 0.4, 0.4, -0.5); P.lean = 0.15; } // 背後：手往身後繞
    P.bodyY = mode === 'xover' ? -0.1 : -0.14;
  } else if (mode === 'hesi') {
    setArm(H, -0.5, 0.3, -0.9); setArm(-H, -0.6, 0.5, -1.0); P.lean = 0.0; P.kneeL += 0.15; P.kneeR += 0.15; P.head = -0.15;
  } else if (mode === 'post') {
    const c = Math.cos(p.dribblePh * 2);
    setArm(H, -0.35 - c * 0.1, 0.35, -0.55 - c * 0.3); setArm(-H, -0.25, 1.05, -1.45);
    P.hipL -= 0.45; P.hipR -= 0.45; P.kneeL += 0.75; P.kneeR += 0.75; P.lean = 0.35; P.bodyY = -0.1;
  } else if (mode === 'hook') {
    const sd = p.hookSide || 1;
    setArm(-sd, -3.0, 0.55, -0.15); setArm(sd, -1.2, 0.6, -0.9); P.lean = -0.08; P.hipL = sd > 0 ? -0.9 : 0.1; P.hipR = sd > 0 ? 0.1 : -0.9; P.kneeL = sd > 0 ? 1.1 : 0.2; P.kneeR = sd > 0 ? 0.2 : 1.1;
  } else if (mode === 'hold') {
    P.shLx = -0.95; P.shRx = -0.95; P.elL = -1.0; P.elR = -1.0; P.shLz = -0.25; P.shRz = 0.25;
  } else if (mode === 'ftset') {
    P.shLx = -0.8; P.shRx = -0.8; P.elL = -1.3; P.elR = -1.3; P.shLz = -0.2; P.shRz = 0.2; P.kneeL += 0.2; P.kneeR += 0.2;
  } else if (mode === 'shoot') { // 跳投分段：下蹲收球 → 起跳舉到出手點（手腕後扣）→ 出手後手臂伸直、手腕下壓
    const t = p.actT || 0; P.look = false;
    if (p.released) { P.shRx = -2.95; P.elR = -0.05; P.wrR = -1.05; P.shRz = 0.05; P.shLx = -2.35; P.elL = -0.45; P.shLz = -0.5; P.wrL = -0.2; }
    else if (!air) { const u = Math.min(1, t / 0.13); P.kneeL = P.kneeR = 0.2 + 0.7 * u; P.hipL = P.hipR = -0.15 - 0.35 * u; P.lean = 0.18 * u; P.shRx = -1.15; P.elR = -1.75; P.wrR = 0.6; P.shLx = -1.05; P.elL = -1.55; P.shLz = -0.35; P.shRz = 0.1; P.head = -0.1; }
    else { P.shRx = -2.6; P.elR = -1.55; P.wrR = 0.95; P.shRz = 0.1; P.shLx = -2.25; P.elL = -1.25; P.shLz = -0.5; P.wrL = 0.2; }
    if (air) { P.hipL = -0.12; P.hipR = -0.05; P.kneeL = 0.12; P.kneeR = 0.08; P.lean = p.fade ? -0.32 : -0.05; }
  } else if (mode === 'follow') {
    P.shLx = -2.55; P.shRx = -2.95; P.elL = -0.45; P.elR = -0.05; P.shLz = 0.05; P.shRz = 0; P.lean = p.fade ? -0.3 : -0.05;
  } else if (mode === 'layup') { // 上升時雙手護球到下巴，接近最高點單手伸出、手腕輕挑
    const up = (p.jv || 0) > 1.6 && !p.released; P.look = false;
    if (up) { P.shRx = P.shLx = -1.9; P.elR = P.elL = -1.3; P.shRz = 0.25; P.shLz = -0.25; P.wrR = 0.5; }
    else { P.shRx = -3.05; P.elR = -0.1; P.wrR = p.released ? -0.6 : 0.4; P.shLx = -1.3; P.elL = -0.6; }
    P.hipL = -1.25; P.kneeL = 1.35; P.hipR = 0.15; P.kneeR = 0.3; P.lean = 0; P.ankR = 0.7;
  } else if (mode === 'gather') { // 上籃前兩步：大步收球，球在身側
    const u = Math.min(1, (p.actT || 0) / 0.22), s2 = u < 0.5 ? 1 : -1;
    P.hipL = s2 > 0 ? -0.95 : 0.45; P.hipR = s2 > 0 ? 0.45 : -0.95; P.kneeL = s2 > 0 ? 0.55 : 0.9; P.kneeR = s2 > 0 ? 0.9 : 0.55;
    P.shRx = P.shLx = -0.95; P.elR = P.elL = -1.35; P.shRz = -0.2; P.shLz = 0.45; P.lean = 0.3; P.bodyY = -0.1;
  } else if (mode === 'catch') { // 接球：雙手往前伸、手掌張開對著球
    P.shRx = P.shLx = -1.45; P.elR = P.elL = -0.45; P.shRz = 0.18; P.shLz = -0.18; P.wrR = P.wrL = 0.5; P.kneeL += 0.15; P.kneeR += 0.15;
  } else if (mode === 'tired') { // 累了：雙手扶膝、彎腰喘氣
    const br = Math.sin(performance.now() * 0.006 + p.runPhase) * 0.04;
    P.hipL = P.hipR = -0.55; P.kneeL = P.kneeR = 0.55; P.lean = 0.75 + br; P.shRx = P.shLx = -0.75; P.elR = P.elL = -0.25; P.shRz = -0.12; P.shLz = 0.12; P.head = -0.5; P.look = false;
  } else if (mode === 'passC' || mode === 'passB' || mode === 'passO' || mode === 'passQ') { // 傳球種類
    const u = Math.min(1, (p.actT || 0) / 0.18); P.look = false;
    if (mode === 'passC') { P.shRx = P.shLx = -1.25 - u * 0.25; P.elR = P.elL = -1.4 + u * 1.3; P.shRz = 0.25 - u * 0.1; P.shLz = -0.25 + u * 0.1; P.wrR = P.wrL = -0.9 * u + 0.5 * (1 - u); P.lean = 0.12 + u * 0.1; P.hipL = -0.45; P.hipR = 0.2; P.kneeL = 0.4; } // 胸前推傳、跨一步
    else if (mode === 'passB') { P.shRx = P.shLx = -1.1 + u * 0.5; P.elR = P.elL = -1.3 + u * 1.2; P.shRz = 0.25; P.shLz = -0.25; P.wrR = P.wrL = -0.9 * u; P.lean = 0.3; P.kneeL = P.kneeR = 0.55; P.bodyY = -0.08; } // 地板傳球：壓低往下推
    else if (mode === 'passO') { P.shRx = P.shLx = -3.0 + u * 0.6; P.elR = P.elL = -1.5 + u * 1.4; P.shRz = 0.15; P.shLz = -0.15; P.wrR = P.wrL = -1.0 * u + 0.6 * (1 - u); P.lean = -0.1 + u * 0.25; } // 過頂傳球
    else { const H2 = p.hand || 1; setArm(H2, -1.0 - u * 0.5, -0.1 + u * 0.4, -1.2 + u * 1.15); if (H2 > 0) P.wrR = -0.9 * u; else P.wrL = -0.9 * u; setArm(-H2, -0.5, 0.25, -0.8); P.lean = 0.15; } // 單手快傳（側推）
  } else if (mode === 'euro') {
    setArm(1, -0.95, -0.2, -1.0); setArm(-1, -0.95, -0.2, -1.0); P.lean = 0.3; P.hipL *= 1.4; P.hipR *= 1.4; P.kneeL += 0.3; P.kneeR += 0.3;
  } else if (mode === 'dunk') {
    const u = p.dunk ? Math.min(1, p.actT / p.dunk.tApex) : 1;
    if (p.dunk && p.dunk.style === 'one') { P.shRx = u < 0.6 ? -3.45 : -3.45 + (u - 0.6) / 0.4 * 0.9; P.elR = u < 0.6 ? -1.3 : -0.2; P.shLx = -1.6; P.shLz = 0.5; P.elL = -0.4; }
    else { P.shRx = P.shLx = u < 0.6 ? -3.25 : -3.25 + (u - 0.6) / 0.4 * 0.75; P.elR = P.elL = u < 0.6 ? -1.1 : -0.15; P.shLz = -0.15; P.shRz = 0.15; }
    P.hipL = -1.1; P.kneeL = 1.7; P.hipR = -0.3; P.kneeR = 1.0; P.lean = u < 0.6 ? -0.15 : 0.15;
  } else if (mode === 'windmill') { // 風車：持球手臂整圈繞
    const u = p.dunk ? Math.min(1, p.actT / p.dunk.tApex) : 1;
    P.shRx = -0.4 - u * 2.9 - Math.sin(u * Math.PI) * 0.6; P.shRz = -0.35; P.elR = -0.1; P.shLx = -1.2; P.shLz = 0.6; P.elL = -0.5;
    P.hipL = -1.0; P.kneeL = 1.6; P.hipR = -0.3; P.kneeR = 1.0; P.lean = 0.05;
  } else if (mode === 'hang') {
    P.shRx = -2.85; P.elR = -0.05; P.shLx = -2.85; P.elL = -0.05; P.shLz = -0.12; P.shRz = 0.12; P.hipL = -0.45; P.hipR = -0.25; P.kneeL = 0.6; P.kneeR = 0.45; P.lean = -0.1; P.head = 0.2;
  } else if (mode === 'block' || mode === 'rebound') {
    P.shRx = -3.1; P.elR = -0.05; P.shLx = -3.05; P.elL = -0.05; P.shLz = 0.15; P.shRz = -0.15; P.lean = 0;
  } else if (mode === 'secure') { // 抓籃板：先在接到球的高度雙手抓住（高球在頭上），再拉到下巴、手肘往外撐護球
    const t = 0.55 - (p.secureT || 0), hi = p.secureHi;
    P.look = false;
    if (t < 0.18 && hi) { P.shRx = P.shLx = -2.85; P.elR = P.elL = -0.45; P.shRz = -0.3; P.shLz = 0.3; P.wrR = P.wrL = 0.3; }
    else if (t < 0.12) { const a = -Math.max(0.9, Math.min(2.4, ((p.secureY || 1.2) - 0.6) * 1.6)); P.shRx = P.shLx = a; P.elR = P.elL = -0.5; P.shRz = -0.28; P.shLz = 0.28; P.kneeL += 0.3; P.kneeR += 0.3; P.lean += 0.15; }
    else { P.shRx = P.shLx = -1.25; P.elR = P.elL = -2.0; P.shRz = -0.75; P.shLz = 0.75; P.wrR = P.wrL = 0.2; P.kneeL += 0.35; P.kneeR += 0.35; P.hipL -= 0.2; P.hipR -= 0.2; P.lean += 0.2; P.hipLz = 0.18; P.hipRz = -0.18; }
  } else if (mode === 'steal') {
    P.shRx = -1.55; P.elR = 0; P.shRz = 0.2; P.shLx = -0.4; P.lean = 0.38; P.kneeL += 0.45; P.kneeR += 0.45;
  } else if (mode === 'contest') {
    P.shRx = -2.9; P.elR = -0.1; P.shLx = -0.6; P.shLz = 0.8; P.elL = -0.5;
  } else if (mode === 'pass') {
    P.shLx = -1.45; P.shRx = -1.45; P.elL = -0.1; P.elR = -0.1; P.shLz = -0.15; P.shRz = 0.15;
  } else if (mode === 'screen') {
    P.shLx = -0.3; P.shRx = -0.3; P.shLz = -0.35; P.shRz = 0.35; P.elL = -1.6; P.elR = -1.6; P.kneeL += 0.3; P.kneeR += 0.3; P.hipL -= 0.15; P.hipR -= 0.15;
  } else if (mode === 'sit') {
    P.hipL = -1.5; P.hipR = -1.45; P.kneeL = 1.5; P.kneeR = 1.45; P.shLx = -0.55; P.shRx = -0.55; P.elL = -0.9; P.elR = -0.9; P.lean = -0.08; P.bodyY = -0.52;
  } else if (mode === 'idle') {
    const br = Math.sin(performance.now() * 0.002 + p.runPhase) * 0.03;
    P.shLx = 0.05 + br; P.shRx = 0.05 + br; P.elL = -0.25; P.elR = -0.25; P.shLz = 0.12; P.shRz = -0.12; P.hipL = -0.05; P.hipR = 0.08; P.kneeL = 0.12; P.kneeR = 0.18;
  } else if (mode === 'celebrate') {
    const w = Math.sin(performance.now() * 0.012 + p.runPhase), ty = p.celebType || 0;
    if (ty === 0) { P.shRx = -2.6 - w * 0.25; P.elR = -1.2; P.shLx = -0.4; P.shLz = 0.4; P.elL = -0.9; } // 握拳振臂
    else if (ty === 1) { P.shRx = P.shLx = -3.0; P.elR = P.elL = -0.1; P.shRz = -0.25; P.shLz = 0.25; P.head = -0.25; } // 雙手指天
    else if (ty === 2) { P.shRx = P.shLx = -1.5; P.shRz = -1.2; P.shLz = 1.2; P.elR = P.elL = -1.9; P.lean = -0.1; } // 秀肌肉
    else { const c = Math.abs(Math.sin(performance.now() * 0.02)); P.shRx = P.shLx = -1.25; P.shRz = 0.2 + c * 0.3; P.shLz = -0.2 - c * 0.3; P.elR = P.elL = -0.5; } // 拍手
  } else if (mode === 'dejected') { // 雙手叉腰、低頭
    P.shRx = P.shLx = 0.25; P.shRz = -0.55; P.shLz = 0.55; P.elR = P.elL = -1.7; P.head = 0.35; P.lean = 0.05;
  } else if (mode === 'cheer') { // 板凳起立揮手
    const w = Math.sin(performance.now() * 0.015 + p.runPhase);
    P.shRx = -2.9 + w * 0.3; P.shLx = -2.9 - w * 0.3; P.elR = P.elL = -0.3; P.shRz = -0.2; P.shLz = 0.2; P.kneeL = P.kneeR = 0.15;
  } else if (mode === 'dance') { // 啦啦隊舞步：每兩拍換一個動作，全隊同步
    const bt = (p.danceT || 0) * 2.2, beat = Math.floor(bt), f = bt - beat, mv = Math.floor(beat / 2) % 6, sw = Math.sin(bt * Math.PI);
    if (mv === 0) { P.shRx = P.shLx = -2.6; P.shRz = -0.6 - sw * 0.2; P.shLz = 0.6 + sw * 0.2; P.elR = P.elL = -0.1; P.kneeL = 0.2 + Math.max(0, sw) * 0.4; P.kneeR = 0.2 + Math.max(0, -sw) * 0.4; } // 高舉 V 字
    else if (mv === 1) { const s2 = beat % 2 ? 1 : -1; P.shRx = s2 > 0 ? -3.0 : -0.3; P.shLx = s2 > 0 ? -0.3 : -3.0; P.elR = P.elL = -0.1; P.hipLz = s2 * 0.15; P.hipRz = s2 * 0.15; P.lean = 0.05; } // 左右交替出拳
    else if (mv === 2) { const s2 = beat % 2 ? 1 : -1; P.hipL = s2 > 0 ? -1.5 * Math.sin(f * Math.PI) : 0; P.hipR = s2 < 0 ? -1.5 * Math.sin(f * Math.PI) : 0; P.kneeL = P.kneeR = 0.05; P.shRx = P.shLx = -1.5; P.shRz = -1.4; P.shLz = 1.4; P.elR = P.elL = 0; } // 踢腿
    else if (mv === 3) { P.shRx = P.shLx = -1.6 + sw * 0.4; P.shRz = -0.3; P.shLz = 0.3; P.elR = P.elL = -1.6; P.kneeL = P.kneeR = 0.5 + Math.abs(sw) * 0.3; P.lean = 0.2; P.bodyY = -0.08 - Math.abs(sw) * 0.06; } // 下蹲搖彩球
    else if (mv === 4) { P.shRx = -2.8; P.shLx = -2.8; P.shRz = -0.2 - sw * 0.5; P.shLz = 0.2 - sw * 0.5; P.elR = P.elL = -0.2; P.hipLz = sw * 0.2; P.hipRz = sw * 0.2; } // 舉手搖擺
    else { P.shRx = -1.2; P.shLx = -1.2; P.shRz = -1.5 + sw * 0.6; P.shLz = 1.5 - sw * 0.6; P.elR = P.elL = -0.2; P.kneeL = P.kneeR = 0.3; } // 轉圈張手
  } else if (mode === 'wave') { // 揮手（吉祥物）
    const w = Math.sin(performance.now() * 0.012 + p.runPhase);
    P.shRx = -2.7; P.shRz = -0.4 + w * 0.35; P.elR = -0.4; P.shLx = -0.3; P.shLz = 0.5; P.elL = -0.6;
  } else if (mode === 'boxout') { // 卡位：重心壓低、腳張開、雙臂往兩側撐開把人擋在身後
    P.hipL = -0.55; P.hipR = -0.55; P.kneeL = 0.95; P.kneeR = 0.95; P.hipLz = 0.22; P.hipRz = -0.22; P.lean = 0.32; P.bodyY = -0.12;
    P.shLx = -0.75; P.shRx = -0.75; P.shLz = 1.25; P.shRz = -1.25; P.elL = -1.25; P.elR = -1.25; P.head = -0.25;
  } else if (mode === 'clutch') { // 拉桿：先把球收到腰間，再從另一側往上送
    const t = p.clutch ? p.clutch.t : 0, up = t > 0.12;
    P.shRx = P.shLx = up ? -2.7 : -0.7; P.elR = P.elL = up ? -0.3 : -1.3; P.shRz = up ? 0.5 * (p.hand || 1) : 0.3; P.shLz = up ? 0.5 * (p.hand || 1) : -0.3;
    P.hipL = -1.0; P.kneeL = 1.4; P.hipR = -0.4; P.kneeR = 0.9; P.lean = up ? -0.05 : 0.25;
  }
  // 空中腿部依階段變化：上升時伸直、腳尖下壓；最高點收腿；下降時伸腿準備落地
  if (air && !['layup', 'dunk', 'hang', 'clutch', 'windmill', 'shoot'].includes(mode)) {
    const jv = p.jv || 0;
    if (jv > 1.2) { P.kneeL = 0.15; P.kneeR = 0.25; P.hipL = -0.1; P.hipR = -0.2; }
    else if (jv > -1.0) { P.kneeL = 0.75; P.kneeR = 0.6; P.hipL = -0.45; P.hipR = -0.3; }
    else { P.kneeL = 0.3; P.kneeR = 0.35; P.hipL = -0.2; P.hipR = -0.15; }
    P.hipLz = 0; P.hipRz = 0;
  }
  if (p.landT > 0) { const q = p.landT / 0.2; P.kneeL += 0.85 * q; P.kneeR += 0.85 * q; P.hipL -= 0.45 * q; P.hipR -= 0.45 * q; P.lean += 0.15 * q; }
  // 腳踝：站地上時讓腳掌貼平地面；空中時腳尖往下；跑步後腳蹬地
  // 精確腳步：已知膝蓋彎曲角度，反算髖關節角度，讓腳踝落在步態要求的前後位置（踩地時相對地面完全不動）
  // ===== 腳掌鎖地 =====
  // 每隻腳踩到地上時，記下它在「場上」的位置和方向；踩地期間不管身體怎麼移動、轉身、加減速，都反算髖關節角度讓腳一直停在那裡。
  // 抬腳時才往下一步的位置擺。站著時腳離理想站位太遠，就「跨一步」過去（有抬腳動作，不會瞬移）。
  const ft = p._ft || (p._ft = [{ on: false, x: 0, z: 0, yaw: 0, step: null, cx: null, cz: null }, { on: false, x: 0, z: 0, yaw: 0, step: null, cx: null, cz: null }]);
  p._ankYaw = [0, 0];
  if (LOCO.has(mode) && !air) {
    const L1 = 0.47, L2 = 0.43, half = stepLen / 2 / p.scale, sc = p.scale;
    // 膝蓋照常平滑過渡，髖關節用平滑後的膝蓋角度反算（所以換姿勢時腳也不會滑）
    const kPose = P.kneeL === kDef[0] && P.kneeR === kDef[1] ? kBase : Math.max(0.05, Math.min(P.kneeL, P.kneeR)); // 這個姿勢本來要蹲多低（不受步伐影響）
    P.kneeL = lerp(r.legL.knee.rotation.x, P.kneeL, k); P.kneeR = lerp(r.legR.knee.rotation.x, P.kneeR, k);
    const AB = kn => [L1 + L2 * Math.cos(kn), L2 * Math.sin(kn)];
    const solve = (d, kn, zr = 0) => { const [A, B] = AB(kn), Ac = A * Math.cos(zr), R = Math.hypot(Ac, B); return Math.asin(Math.max(-0.98, Math.min(0.98, -d / R))) - Math.atan2(B, Ac); };
    const fwdOf = (th, kn, zr) => { const [A, B] = AB(kn); return -(A * Math.cos(zr) * Math.sin(th) + B * Math.cos(th)); };
    // 身體高度先決定（平順），兩隻腳再用反向運動學去配合它：踩地的腳剛好踩在原地，不會因為步伐讓整個人一上一下跳
    const Dk = kq => Math.sqrt(L1 * L1 + L2 * L2 + 2 * L1 * L2 * Math.cos(kq));
    const dropT = P.bodyY !== null ? Math.max(0, -P.bodyY) * (shuffle || spd < 2.2 ? 1 : Math.max(0.35, 1 - (spd - 2.2) / 2)) : 0.9 - Dk(kPose); // 姿勢指定的蹲低（例如防守）；真的跑起來時人會站高一點 // 姿勢有指定身體高度（例如防守蹲低）就用它
    p._dropS = p._dropS == null ? dropT : p._dropS + (dropT - p._dropS) * Math.min(1, dt * 10);
    const legOut = [];
    const moving = p._mv = spd > (p._mv ? 0.2 : 0.45); // 有遲滯，速度在門檻附近時不會一下走一下停
    const yawW = p.facing + (p._legYaw || 0), cy = Math.cos(yawW), sy = Math.sin(yawW);
    const s2 = Math.sign(lat) || 1;
    const legs = [[gL, 'L', 1], [gR, 'R', -1]];
    for (let i = 0; i < 2; i++) {
      const [g, nm, side] = legs[i], F = ft[i];
      let kn = nm === 'L' ? P.kneeL : P.kneeR; const A = AB(kn)[0];
      const baseZ = nm === 'L' ? P.hipLz : P.hipRz;
      let idX, idZ;
      if (moving && !shuffle) { idX = A * Math.sin(baseZ); idZ = (g.u - 0.2) * half * dirS; } // 落腳點稍微在身體前面一點、蹬地時在後面多一點（像真人）
      else if (moving && shuffle) { idX = side * 0.13 - g.u * half * s2; idZ = 0; } // 腳站寬一點，滑步時兩腳不交叉
      else if (mode === 'cross' && p.moveT > 0) { const sg = nm === 'L' ? 1 : -1, fr = (p.hand || 1) > 0 ? sg : -sg; idX = sg * 0.2; idZ = fr * 0.3; } // 胯下：前後跨開一大步、兩腳也張開，球才穿得過去
      else { idX = A * Math.sin(baseZ); idZ = fwdOf(nm === 'L' ? P.hipL : P.hipR, kn, baseZ); }
      const hx = side * 0.105, hipWX = p.pos.x + (cy * hx) * sc, hipWZ = p.pos.z + (-sy * hx) * sc;
      const toW = (x, z) => [hipWX + (cy * x + sy * z) * sc, hipWZ + (-sy * x + cy * z) * sc];
      const toL = (wx, wz) => { wx = (wx - hipWX) / sc; wz = (wz - hipWZ) / sc; return [cy * wx - sy * wz, sy * wx + cy * wz]; };
      let lx = idX, lz = idZ, lift = 0;
      if (F.step) { // 站著時跨一步到新站位
        F.step.t += dt / 0.2; const u = Math.min(1, F.step.t), e = u * u * (3 - 2 * u);
        const [fx2, fz2] = toL(F.step.fx, F.step.fz); lx = fx2 + (idX - fx2) * e; lz = fz2 + (idZ - fz2) * e; lift = Math.sin(u * Math.PI);
        if (u >= 1) { F.step = null; F.on = true; [F.x, F.z] = toW(idX, idZ); F.yaw = yawW; }
      } else if (F.toeOff && moving && g.lift === 0) { // 已經蹬離地面（腳尖離地），等步態進入擺腳
      } else if (!moving || g.lift === 0) {
        F.toeOff = false;
        if (!F.on) { // 落腳：就踩在腳現在的位置（不跳）
          F.on = true; if (F.cx !== null && moving) { F.x = F.cx; F.z = F.cz; } else [F.x, F.z] = toW(idX, idZ); F.yaw = yawW;
        }
        [lx, lz] = toL(F.x, F.z);
        const reach = Math.abs(lz - idZ) > 0.3 || Math.abs(lx - idX) > 0.3; // 跟步態要求的位置差太多（被撞、急轉）才重新落腳
        const dYaw = Math.atan2(Math.sin(F.yaw - yawW), Math.cos(F.yaw - yawW));
        // 身體轉超過約 35 度：踩著的腳跟著跨一步轉過去（不在地上扭轉腳掌）
        if (reach || (Math.abs(dYaw) > 0.6 && (!ft[1 - i].step || Math.abs(dYaw) > 0.75)) || (!moving && Math.hypot(lx - idX, lz - idZ) > 0.2 && (!ft[1 - i].step || mode === 'cross'))) { F.on = false; F.step = { t: 0, fx: F.x, fz: F.z }; }
        p._ankYaw[i] = F.on ? Math.max(-0.7, Math.min(0.7, dYaw)) : 0; // 腳掌方向也鎖住（轉身時以腳為軸）
      } else { F.on = false; F.toeOff = false; }
      if (moving && !F.on && !F.step) lift = Math.max(lift, g.lift);
      if (lift > 0 || !F.on) { // 抬起來的腳只擺到「身體現在的高度搆得到」的地方，落地時才不會把身體突然往下拉
        const vP = 0.9 - (p._dropIK != null ? p._dropIK : p._dropS) - lift * 0.1, rH = Math.sqrt(Math.max(0.01, 0.894 * 0.894 - vP * vP)), hz = Math.hypot(lx, lz);
        if (hz > rH) { lx *= rH / hz; lz *= rH / hz; }
      }
      legOut.push([nm, lx, lz, lift]);
      [F.cx, F.cz] = toW(lx, lz);
    }
    // 身體至少要低到兩隻踩地的腳都搆得到（腳伸直的極限）
    const LM = (L1 + L2) * 0.995;
    // 後腳蹬地時可以墊腳尖（腳跟抬起最多 0.14），所以後腳不會把身體往下拉
    const HMAX = 0.085, rise = a => 0.075 * (Math.cos(a) - 1) + 0.15 * Math.sin(a); // 以腳尖底部為軸轉 a，腳踝升高多少
    let drop = p._dropS, anyOn = false;
    for (const [nm, lx, lz, lift] of legOut) if (!lift && !(lz * dirS < 0 && moving)) {
      const need = 0.9 - Math.sqrt(Math.max(0.01, LM * LM - lx * lx - lz * lz)), F = ft[nm === 'L' ? 0 : 1];
      // 急轉向、急換方向時：踩著的腳離身體太遠就跨一步（抬腳換位置），不會為了搆到它把身體壓得很低
      if (need > p._dropS + 0.1) { if (F.on) { F.on = false; F.step = { t: 0, fx: F.x, fz: F.z }; } continue; }
      anyOn = true; drop = Math.max(drop, need); }
    for (const [, , lz, lift] of legOut) if (!lift && lz * dirS < 0 && moving) anyOn = true; // 後腳只靠墊腳尖配合，搆不到就提早蹬離地面，不把身體往下拉
    // 跑步騰空（兩腳都離地）時身體高度從離地那一刻平順接到下一次落地，不會突然掉下去
    if (!anyOn && p._dropH != null) drop = p._dropH + (p._dropS - p._dropH) * Math.min(1, dt * 3);
    // 跑步的自然起伏：每一步踩地中間身體最低、騰空時最高（平滑的波，幅度幾公分）
    // 走路：腳跟著地（兩腳同時踩地）時最低、單腳撐地時最高，起伏約 2 公分
    if (moving && !shuffle) { const wk = Math.max(0, Math.min(1, (2.4 - spd) / 0.6)); drop += (1 - wk) * Math.min(0.055, Math.max(0, spd - 2) * 0.03 + 0.01) * (0.5 + 0.5 * Math.cos(2 * (ph - Math.PI * duty))) + wk * 0.022 * Math.min(1, spd) * (0.5 + 0.5 * Math.cos(2 * ph)); }
    drop = Math.min(drop, p._dropS + 0.12); // 身體最多只比姿勢本來的高度再低 16 公分：絕不會蹲到像跪地
    if (p._dropIK != null) drop = Math.max(drop, p._dropIK - 1.2 * dt); // 身體往上回升有速度上限（往下蹲多一點腳一定搆得到，不會浮空）
    p._dropH = drop;
    p._dropIK = drop;
    const v = 0.9 - drop;
    p._heel = [0, 0];
    for (const [nm, lx, lz0, lift] of legOut) {
      let lz = lz0, h = lift * (shuffle ? 0.08 : 0.1 + 0.22 * Math.max(0, Math.min(1, (spd - 1.5) / 4))) * (p.moveT > 0 ? 0.55 : 1); // 運球招式時步子低而快 // 抬腳高度：走路低、跑步時腳跟往後上踢
      if (!lift && moving && lz * dirS < 0) { // 墊腳：腳尖固定在地上，腳跟抬起，腳踝往上、稍微往前
        const hA = v - Math.sqrt(Math.max(0.01, LM * LM - lx * lx - lz * lz));
        if (hA > rise(0.95)) { const F = ft[nm === 'L' ? 0 : 1]; if (F.on) { F.on = false; F.toeOff = true; } }
        if (hA > 0) { let lo = 0, hi = 0.95; for (let it = 0; it < 12; it++) { const m = (lo + hi) / 2; if (rise(m) < hA) lo = m; else hi = m; }
          const a = lo; h = rise(a); lz += 0.15 * (1 - Math.cos(a)) + 0.075 * Math.sin(a); p._heel[nm === 'L' ? 0 : 1] = a; }
      }
      const D = Math.min(LM, Math.hypot(Math.max(0.2, v - h), lx, lz));
      const kn = Math.acos(Math.max(-1, Math.min(Math.cos(0.03), (D * D - L1 * L1 - L2 * L2) / (2 * L1 * L2))));
      const zr = Math.asin(Math.max(-0.9, Math.min(0.9, lx / AB(kn)[0])));
      const th = solve(lz, kn, zr);
      if (nm === 'L') { P.hipLz = zr; P.hipL = th; P.kneeL = kn; } else { P.hipRz = zr; P.hipR = th; P.kneeR = kn; }
    }
  } else { for (const F of ft) { F.on = false; F.step = null; F.cx = null; } p._dropIK = null; p._dropS = null; p._dropH = null; p._heel = null; }
  const flat = leg => leg === 'legL' ? -(P.hipL + P.kneeL) : -(P.hipR + P.kneeR);
  const airToe = air ? 0.55 : 0;
  const pushL = !air && spd > 1 ? gL.lift * 0.5 * sw : 0, pushR = !air && spd > 1 ? gR.lift * 0.5 * sw : 0; // 只在抬腳時腳尖下壓，踩地時腳掌貼平
  const hl = p._heel && !air ? p._heel : [0, 0];
  const ankL = P.ankL !== null ? P.ankL : flat('legL') + airToe + pushL + hl[0], ankR = P.ankR !== null ? P.ankR : flat('legR') + airToe + pushR + hl[1];
  r.legL.hip.rotation.x = lerp(r.legL.hip.rotation.x, P.hipL, kLeg);
  r.legR.hip.rotation.x = lerp(r.legR.hip.rotation.x, P.hipR, kLeg);
  r.legL.hip.rotation.z = lerp(r.legL.hip.rotation.z, P.hipLz, kLeg);
  r.legR.hip.rotation.z = lerp(r.legR.hip.rotation.z, P.hipRz, kLeg);
  r.legL.knee.rotation.x = lerp(r.legL.knee.rotation.x, P.kneeL, kLeg);
  r.legR.knee.rotation.x = lerp(r.legR.knee.rotation.x, P.kneeR, kLeg);
  r.armL.sh.rotation.x = lerp(r.armL.sh.rotation.x, P.shLx, k);
  r.armR.sh.rotation.x = lerp(r.armR.sh.rotation.x, P.shRx, k);
  r.armL.sh.rotation.z = lerp(r.armL.sh.rotation.z, P.shLz, k);
  r.armR.sh.rotation.z = lerp(r.armR.sh.rotation.z, P.shRz, k);
  r.armL.el.rotation.x = lerp(r.armL.el.rotation.x, P.elL, k);
  r.armR.el.rotation.x = lerp(r.armR.el.rotation.x, P.elR, k);
  // 真人動作留下的側轉、扭轉：程式動作沒在控制的軸慢慢歸零
  { const kk = Math.min(1, k * 0.8); for (const L of [r.legL, r.legR]) { L.hip.rotation.y *= 1 - kk; L.knee.rotation.y *= 1 - kk; L.knee.rotation.z *= 1 - kk; L.ankle.rotation.y *= 1 - kk; }
    for (const A of [r.armL, r.armR]) { A.sh.rotation.y *= 1 - kk; A.el.rotation.y *= 1 - kk; A.el.rotation.z *= 1 - kk; A.wr.rotation.y *= 1 - kk; A.wr.rotation.z *= 1 - kk; }
    r.torso.rotation.z *= 1 - kk; r.chest.rotation.z *= 1 - kk; r.neck.rotation.z *= 1 - kk; r.headG.rotation.z *= 1 - kk; }
  { _qa.setFromAxisAngle(_yAx, legYawT); r.hips.quaternion.slerp(_qa, kLeg); } // 骨盆朝移動方向（真人動作的腳在空中時才會再覆蓋）
  // 腳踝：用四元數把骨盆＋大腿＋小腿的轉動整個抵銷，腳掌前後左右都貼平地面，再加上腳尖下壓的角度
  for (const [L, extra, fixed] of [[r.legL, ankL - flat('legL'), P.ankL], [r.legR, ankR - flat('legR'), P.ankR]]) {
    const li = L === r.legL ? 0 : 1, planted = p._ft && p._ft[li].on && !air;
    if (fixed !== null && !planted) { L.ankle.rotation.set(lerp(L.ankle.rotation.x, fixed, kLeg), 0, 0); continue; }
    // 踩在地上的腳：腳掌方向＝踩下去那一刻的方向（不跟著身體轉）；連骨盆的轉動也抵銷，腳尖才不會在地上掃動
    _qa.copy(r.hips.quaternion).multiply(L.hip.quaternion).multiply(L.knee.quaternion).invert(); _qb.setFromAxisAngle(_yAx, legYawT + (p._ankYaw ? p._ankYaw[li] : 0)); _qa.multiply(_qb); _qb.setFromAxisAngle(_xAx, planted && fixed !== null ? 0 : extra); _qa.multiply(_qb);
    L.ankle.quaternion.slerp(_qa, kLeg);
  }
  r.armL.wr.rotation.x = lerp(r.armL.wr.rotation.x, P.wrL, k);
  r.armR.wr.rotation.x = lerp(r.armR.wr.rotation.x, P.wrR, k);
  // 前傾分給腰和胸；跑步時骨盆和肩膀反向扭轉
  r.torso.rotation.x = lerp(r.torso.rotation.x, P.lean * 0.55, k);
  r.chest.rotation.x = lerp(r.chest.rotation.x, P.lean * 0.45, k);
  const tw = air || shuffle ? 0 : Math.sin(ph) * sw * 0.14;
  r.torso.rotation.y = lerp(r.torso.rotation.y, -tw * 0.5 - legYawT * 0.7, k);
  r.chest.rotation.y = lerp(r.chest.rotation.y, tw * 1.5 - legYawT * 0.3, k);
  // 頭：抵銷前傾、再轉向要看的東西（球）；脖子分一半
  let yaw = 0, pitch = 0;
  if (P.look && p.lookAt) {
    const dx = p.lookAt.x - p.pos.x, dz = p.lookAt.z - p.pos.z;
    let a = Math.atan2(dx, dz) - p.facing; a = Math.atan2(Math.sin(a), Math.cos(a));
    yaw = Math.max(-1.25, Math.min(1.25, a)); if (Math.abs(a) > 2.2) yaw *= 0.4;
    pitch = Math.max(-0.5, Math.min(0.4, -Math.atan2(p.lookAt.y - 1.7 * p.scale - p.jy, Math.hypot(dx, dz) + 0.3) * 0.7));
  }
  const kh = Math.min(1, k * 0.6);
  r.neck.rotation.y = lerp(r.neck.rotation.y, yaw * 0.45, kh);
  r.headG.rotation.y = lerp(r.headG.rotation.y, yaw * 0.55, kh);
  r.neck.rotation.x = lerp(r.neck.rotation.x, (-P.lean * 0.6 + P.head) * 0.4 + pitch * 0.4, k);
  r.headG.rotation.x = lerp(r.headG.rotation.x, (-P.lean * 0.6 + P.head) * 0.6 + pitch * 0.6, k);
  if (P.bodyY !== null && !(p._dropIK != null && !air)) r.body.position.y = lerp(r.body.position.y, P.bodyY, k);
  else {
    const kneeAvg = (r.legL.knee.rotation.x + r.legR.knee.rotation.x) / 2;
    const hipAvg = (r.legL.hip.rotation.x + r.legR.hip.rotation.x) / 2;
    // 身體高度：讓比較低的那隻腳剛好踩在地上（不浮空、不陷進地板）
    const ext = L => { const th = L.hip.rotation.x, kn = L.knee.rotation.x; return (0.47 + 0.43 * Math.cos(kn)) * Math.cos(L.hip.rotation.z) * Math.cos(th) - 0.43 * Math.sin(kn) * Math.sin(th); };
    // 身體高度只看「踩在地上」的腳；兩腳都離地（跑步騰空）時維持原本高度並平順過渡，不會一上一下跳
    const ftp = p._ft, onL = ftp && ftp[0].on, onR = ftp && ftp[1].on;
    let drop;
    if (p._dropIK != null && !air) drop = p._dropIK;
    else if (onL || onR) drop = 0.9 - Math.max(onL ? ext(r.legL) : -9, onR ? ext(r.legR) : -9);
    else if (ftp && p._dropLast != null && !air) drop = p._dropLast;
    else drop = 0.9 - Math.max(ext(r.legL), ext(r.legR));
    if (p._dropIK != null && !air) p._dropLast = drop;
    else if (!air) { p._dropLast = p._dropLast == null ? drop : p._dropLast + (drop - p._dropLast) * (onL || onR ? 0.6 : 0.2); drop = p._dropLast; }
    else p._dropLast = null;
    r.body.position.y = p.jy / p.scale + (air ? 0 : -drop);
  }
  // 骨盆：沒播真人動作時慢慢回正
  // 真人動作覆蓋在程式動作上（p.mo = { name, f, mirror, legs }，p.moW = 混合比例）
  if (p.mo && p.moW > 0.001 && CLIPS[p.mo.name]) {
    const c = CLIPS[p.mo.name], legs = p.mo.legs == null ? 1 : p.mo.legs;
    const spine = p.mo.spine == null ? 1 : p.mo.spine;
    const dy = applyClip(r, c, p.mo.f, p.moW, p.mo.mirror, legs < 1 || spine < 1 ? (i => (i >= 5 && i <= 10) || i === 0 ? legs : i === 1 || i === 2 ? spine : 1) : null);
    const legsW = legs * p.moW;
    if (p.jy > 0.02 || legsW < 0.05) { if (p.mo.crouch !== false && legs > 0.05) { r._moDy = Math.min(0, dy) * p.moW * (p.jy > 0.02 ? 0 : 1); r.body.position.y += r._moDy; } }
    else {
      // 腳用真人動作時：直接量兩隻腳底的高度，把身體上下移到「比較低的腳剛好踩在地板上」（不陷進地板、不浮空）
      r.root.position.set(p.pos.x, 0, p.pos.z); r.root.updateMatrixWorld(true);
      const yl = r.legL.ankle.localToWorld(_hv.set(0, -0.075, 0.06)).y, yr = r.legR.ankle.localToWorld(_hv.set(0, -0.075, 0.06)).y;
      const before = r.body.position.y; r.body.position.y -= Math.min(yl, yr) / p.scale * legsW;
      r._moDy = r.body.position.y - before;
    }
  }
  r.root.position.set(p.pos.x, 0, p.pos.z);
  r.root.rotation.y = p.facing;
}
function clamp01(v) { return Math.max(0, Math.min(1, v)); }
