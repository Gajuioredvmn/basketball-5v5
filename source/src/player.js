import * as THREE from 'three';
import { TEAM_INFO } from './const.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';

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
      const { x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1, rx = 0, parent = null, child = null, len = 0.3, axis = -1, r = 0.07 } = opt;
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
        else if (ci >= 0 && along > len - r) { w = 0.5 * (1 - Math.max(0, len - along) / r); oi = ci; }
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

export function makePlayerMesh(team, idx, number, scale, skinIdx) {
  const t = TEAM_INFO[team];
  const skinCol = SKINS[skinIdx % SKINS.length];
  const style = skinIdx % 6; // 0 短髮 1 寸頭 2 爆炸頭 3 辮子 4 短髮+頭帶 5 髒辮
  const mats = {
    skin: vcMat,
    jersey: new THREE.MeshStandardMaterial({ map: jerseyTexture(team, number), roughness: 0.66 }),
    shorts: new THREE.MeshStandardMaterial({ map: shortsTexture(team), roughness: 0.7, side: THREE.DoubleSide }),
  };
  const face = new THREE.MeshStandardMaterial({ map: faceTexture(skinCol, skinIdx, style), roughness: 0.52 });
  const hairCol = skinIdx % 7 === 4 ? '#4a2e18' : '#120c08';
  const shoeCol = team === 0 ? '#f2f2f2' : '#121212', soleCol = team === 1 ? '#f2c14e' : '#ffffff', sockCol = team === 1 ? '#111111' : '#ffffff';
  const accent = team === 0 ? '#c62828' : (team === 1 ? '#f2c14e' : '#888888');
  const sleeve = team < 2 && skinIdx % 4 === 1, sleeveCol = team === 1 ? '#111111' : '#ffffff';

  const root = new THREE.Group();
  const B = () => new THREE.Bone();
  const body = B(); root.add(body);
  const hips = B(); hips.position.y = 1.052; body.add(hips);
  const legs = [];
  for (const side of [1, -1]) { const hip = B(); hip.position.set(side * 0.105, -0.06, 0); hips.add(hip); const knee = B(); knee.position.y = -0.47; hip.add(knee); legs.push({ hip, knee }); }
  const torso = B(); hips.add(torso);
  const headG = B(); headG.position.y = 0.84; torso.add(headG);
  const arms = [];
  for (const side of [1, -1]) { const sh = B(); sh.position.set(side * 0.27, 0.535, 0); torso.add(sh); const el = B(); el.position.y = -0.3; sh.add(el); arms.push({ sh, el }); }
  const bones = [body, hips, legs[0].hip, legs[0].knee, legs[1].hip, legs[1].knee, torso, headG, arms[0].sh, arms[0].el, arms[1].sh, arms[1].el];
  root.updateMatrixWorld(true);
  const skel = new THREE.Skeleton(bones);
  const sb = skinBuilder(bones);

  // ---- 腿 ----
  legs.forEach(({ hip, knee }, i) => {
    const side = i === 0 ? 1 : -1;
    sb.add('skin', geo('thigh', () => lathe([[0.001, 0.03], [0.07, 0.03], [0.09, -0.02], [0.096, -0.14], [0.086, -0.3], [0.064, -0.44], [0.056, -0.5], [0.001, -0.51]])), skinCol, hip, { parent: hips, child: knee, len: 0.47, r: 0.09 });
    sb.add('skin', geo('calf', () => lathe([[0.001, 0.04], [0.054, 0.03], [0.058, 0.0], [0.07, -0.1], [0.066, -0.18], [0.047, -0.32], [0.039, -0.42], [0.001, -0.43]])), skinCol, knee, { parent: hip, r: 0.08 });
    sb.add('skin', geo('sock', () => new THREE.CylinderGeometry(0.051, 0.044, 0.2, 14)), sockCol, knee, { y: -0.35 });
    // 高筒籃球鞋：鞋身、鞋領、鞋底、鞋頭、側邊飾條
    sb.add('skin', geo('shoe', () => new THREE.BoxGeometry(0.112, 0.1, 0.27, 2, 2, 3)), shoeCol, knee, { y: -0.455, z: 0.035 });
    sb.add('skin', geo('collar', () => new THREE.CylinderGeometry(0.06, 0.062, 0.07, 14)), shoeCol, knee, { y: -0.4, z: -0.02 });
    sb.add('skin', geo('sole', () => new THREE.BoxGeometry(0.12, 0.03, 0.3)), soleCol, knee, { y: -0.509, z: 0.04 });
    sb.add('skin', geo('toe', () => new THREE.SphereGeometry(0.057, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2)), shoeCol, knee, { y: -0.497, z: 0.165, sx: 1, sy: 0.9, sz: 0.72 });
    sb.add('skin', geo('stripe', () => new THREE.BoxGeometry(0.116, 0.02, 0.16)), accent, knee, { y: -0.46, z: 0.02, rx: -0.35 });
    sb.add('skin', geo('lace', () => new THREE.BoxGeometry(0.06, 0.012, 0.12)), soleCol, knee, { y: -0.402, z: 0.09, rx: -0.25 });
    // 過膝球褲褲管（權重分給腰部，胯下比較順）
    sb.add('shorts', geo('shortleg', () => new THREE.CylinderGeometry(0.122, 0.132, 0.42, 18, 3, true)), null, hip, { x: side * 0.01, y: -0.19, parent: hips, len: 0.42, r: 0.16, sz: 0.95 });
  });
  sb.add('shorts', geo('shorts', () => new THREE.CylinderGeometry(0.205, 0.238, 0.26, 18, 2, true)), null, hips, { y: -0.07, sz: 0.78 });
  // ---- 軀幹（球衣），腰部權重分給骨盆 ----
  sb.add('jersey', geo('torso', () => lathe([[0.2, -0.03], [0.173, 0.0], [0.168, 0.12], [0.19, 0.28], [0.216, 0.4], [0.233, 0.5], [0.206, 0.57], [0.12, 0.62], [0.05, 0.635]], 22, Math.PI, Math.PI * 2)), null, torso, { y: 0.04, sz: 0.62, parent: hips, axis: 1, r: 0.12 });
  sb.add('skin', geo('waistband', () => new THREE.CylinderGeometry(0.205, 0.205, 0.045, 18)), t.trim, hips, { y: 0.06, sz: 0.76 });
  sb.add('skin', geo('trap', () => new THREE.SphereGeometry(0.11, 14, 8)), skinCol, torso, { y: 0.6, z: -0.01, sx: 1.25, sy: 0.45, sz: 0.7 });
  sb.add('skin', geo('neck', () => new THREE.CylinderGeometry(0.056, 0.066, 0.16, 12, 2)), skinCol, torso, { y: 0.69 });
  // ---- 手臂：肩膀權重分給軀幹、手肘彎曲順接 ----
  arms.forEach(({ sh, el }, i) => {
    const side = i === 0 ? 1 : -1;
    const armCol = sleeve && side === -1 ? sleeveCol : skinCol;
    sb.add('skin', geo('delt', () => new THREE.SphereGeometry(0.074, 14, 10)), skinCol, sh, { x: side * 0.008, y: -0.025, sy: 1.12, sx: 0.95, parent: torso, r: 0.1 });
    sb.add('skin', geo('uarm', () => lathe([[0.001, 0.02], [0.056, 0.0], [0.063, -0.1], [0.056, -0.2], [0.045, -0.29], [0.04, -0.32], [0.001, -0.33]])), armCol, sh, { parent: torso, child: el, len: 0.3, r: 0.07 });
    sb.add('skin', geo('farm', () => lathe([[0.001, 0.04], [0.042, 0.03], [0.048, 0], [0.051, -0.07], [0.041, -0.18], [0.033, -0.25], [0.001, -0.26]])), armCol, el, { parent: sh, r: 0.07 });
    sb.add('skin', geo('hand', () => new THREE.SphereGeometry(0.05, 12, 10)), skinCol, el, { y: -0.3, z: 0.01, sx: 0.75, sy: 1.35, sz: 0.5 });
    sb.add('skin', geo('thumb', () => new THREE.CapsuleGeometry(0.014, 0.04, 3, 6)), skinCol, el, { x: side * -0.02, y: -0.285, z: 0.035 });
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
  if (style === 0 || style === 4) hp.push([geo('hair', () => new THREE.SphereGeometry(0.114, 18, 8, 0, Math.PI * 2, 0, Math.PI * 0.45)), hairCol, 0, 0.018, -0.008, 0.92, 1.0, 1.03]);
  else if (style === 1) hp.push([geo('buzz', () => new THREE.SphereGeometry(0.111, 18, 8, 0, Math.PI * 2, 0, Math.PI * 0.42)), hairCol, 0, 0.01, -0.004, 0.9, 1.06, 1.0]);
  else if (style === 2) hp.push([geo('afro', () => new THREE.SphereGeometry(0.135, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.55)), hairCol, 0, 0.03, -0.015, 0.95, 0.95, 1.02]);
  else if (style === 3) { for (let k = -3; k <= 3; k++) hp.push([geo('braid', () => new THREE.CapsuleGeometry(0.011, 0.17, 3, 6)), hairCol, k * 0.022, 0.055, -0.02, 1, 1, 1, 1.25 + Math.abs(k) * 0.02, 0, k * 0.12]); }
  else if (style === 5) {
    hp.push([geo('hair', () => null), hairCol, 0, 0.018, -0.008, 0.93, 1.0, 1.04]);
    for (let k = 0; k < 10; k++) { const a = Math.PI * 0.55 + k / 9 * Math.PI * 0.9; hp.push([geo('dread', () => new THREE.CapsuleGeometry(0.014, 0.15, 3, 6)), hairCol, Math.cos(a) * 0.1, -0.03, Math.sin(a) * 0.09 - 0.01, 1, 1, 1, Math.sin(a) * -0.25, 0, Math.cos(a) * 0.25]); }
  }
  if (style === 4 && team < 2) hp.push([geo('band', () => new THREE.TorusGeometry(0.103, 0.014, 6, 22)), sleeveCol, 0, 0.045, 0, 1, 1, 1, Math.PI / 2]);
  headG.add(merged(hp));

  root.scale.setScalar(scale);
  const r = { root, body, hips, torso, headG, legL: legs[0], legR: legs[1], armL: arms[0], armR: arms[1], mats };
  r.joints = [legs[0].hip, legs[0].knee, legs[1].hip, legs[1].knee, arms[0].sh, arms[0].el, arms[1].sh, arms[1].el, torso, headG];
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
  const el = right ? rig.armR.el : rig.armL.el;
  return el.localToWorld(_hv.set(0, -0.3, 0.01)).clone();
}

const lerp = (a, b, t) => a + (b - a) * t;

export function animatePlayer(p, dt) {
  const r = p.rig;
  const spd = Math.hypot(p.vel.x, p.vel.z);
  const air = p.jy > 0.02;
  // 步頻隨速度提高、步幅 = 速度 / 步頻，擺腿角度依步幅算，腳不會在地上滑
  const steps = 1.7 + spd * 0.36;
  if (!air) p.runPhase += Math.PI * steps * dt * Math.min(1, spd / 0.4);
  const stepLen = spd / steps;
  const amp = Math.asin(Math.min(0.82, stepLen / (2 * 0.98 * p.scale)));
  const ph = p.runPhase;
  const sw = Math.min(1, spd / 6.5);
  const k = Math.min(1, dt * 16);
  // 側移（防守滑步）：速度方向和面向差很多時，改成橫向滑步
  const fx = Math.sin(p.facing), fz = Math.cos(p.facing);
  const fw = p.vel.x * fx + p.vel.z * fz, lat = p.vel.x * -fz + p.vel.z * fx;
  const shuffle = spd > 0.6 && Math.abs(lat) > Math.abs(fw) * 1.2;
  const back = spd > 0.6 && fw < -Math.abs(lat);
  const legAmp = shuffle ? 0.18 : amp * (back ? 0.6 : 1);
  const P = { hipL: -Math.sin(ph) * legAmp * (back ? -1 : 1), hipR: Math.sin(ph) * legAmp * (back ? -1 : 1),
    kneeL: 0.16 + Math.max(0, Math.sin(ph + 1.3)) * amp * 1.5, kneeR: 0.16 + Math.max(0, Math.sin(ph + 1.3 + Math.PI)) * amp * 1.5,
    hipLz: 0, hipRz: 0,
    shLx: Math.sin(ph) * sw * 0.8, shRx: -Math.sin(ph) * sw * 0.8, shLz: 0.1, shRz: -0.1, elL: -0.3 - sw * 0.9, elR: -0.3 - sw * 0.9,
    lean: sw * 0.16 + Math.max(-1, Math.min(1, p.accLean || 0)) * 0.15, head: 0, bodyY: null, twist: 0 };
  if (shuffle) { const o = Math.abs(Math.sin(ph)) * 0.32, s = Math.sign(lat); P.hipLz = s > 0 ? o : 0.08; P.hipRz = s > 0 ? -0.08 : -o; P.kneeL = 0.55; P.kneeR = 0.55; }
  const mode = p.pose;
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
  } else if (mode === 'cross' || mode === 'behind') {
    const u = p.moveDur ? 1 - p.moveT / p.moveDur : 0.5;
    P.hipL = H > 0 ? -0.75 : 0.45; P.hipR = H > 0 ? 0.45 : -0.75; P.kneeL = H > 0 ? 0.95 : 0.45; P.kneeR = H > 0 ? 0.45 : 0.95; P.lean = 0.42;
    const give = u < 0.5 ? -H : H;
    if (mode === 'cross') { setArm(give, -0.25, -0.35, -0.25); setArm(-give, -0.55, 0.25, -0.6); }
    else { setArm(give, 0.55, 0.35, -0.35); setArm(-give, 0.4, 0.4, -0.5); P.lean = 0.3; } // 背後：手往身後繞
    P.bodyY = -0.14;
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
  } else if (mode === 'shoot') {
    P.shLx = -2.5; P.shRx = -2.75; P.elL = -1.0; P.elR = -1.45; P.shLz = -0.35; P.shRz = 0.12; P.lean = p.fade ? -0.3 : -0.04;
  } else if (mode === 'follow') {
    P.shLx = -2.55; P.shRx = -2.95; P.elL = -0.45; P.elR = -0.05; P.shLz = 0.05; P.shRz = 0; P.lean = p.fade ? -0.3 : -0.05;
  } else if (mode === 'layup') {
    P.shRx = -3.05; P.elR = -0.1; P.shLx = -1.3; P.elL = -0.6; P.hipL = -1.25; P.kneeL = 1.35; P.hipR = 0.15; P.kneeR = 0.3; P.lean = 0;
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
  } else if (mode === 'clutch') { // 拉桿：先把球收到腰間，再從另一側往上送
    const t = p.clutch ? p.clutch.t : 0, up = t > 0.12;
    P.shRx = P.shLx = up ? -2.7 : -0.7; P.elR = P.elL = up ? -0.3 : -1.3; P.shRz = up ? 0.5 * (p.hand || 1) : 0.3; P.shLz = up ? 0.5 * (p.hand || 1) : -0.3;
    P.hipL = -1.0; P.kneeL = 1.4; P.hipR = -0.4; P.kneeR = 0.9; P.lean = up ? -0.05 : 0.25;
  }
  if (air && !['layup', 'dunk', 'hang', 'clutch', 'windmill'].includes(mode)) { P.kneeL = 0.75; P.kneeR = 0.65; P.hipL = -0.3; P.hipR = -0.2; P.hipLz = 0; P.hipRz = 0; }
  if (p.landT > 0) { const q = p.landT / 0.15; P.kneeL += 0.6 * q; P.kneeR += 0.6 * q; P.hipL -= 0.3 * q; P.hipR -= 0.3 * q; }
  r.legL.hip.rotation.x = lerp(r.legL.hip.rotation.x, P.hipL, k);
  r.legR.hip.rotation.x = lerp(r.legR.hip.rotation.x, P.hipR, k);
  r.legL.hip.rotation.z = lerp(r.legL.hip.rotation.z, P.hipLz, k);
  r.legR.hip.rotation.z = lerp(r.legR.hip.rotation.z, P.hipRz, k);
  r.legL.knee.rotation.x = lerp(r.legL.knee.rotation.x, P.kneeL, k);
  r.legR.knee.rotation.x = lerp(r.legR.knee.rotation.x, P.kneeR, k);
  r.armL.sh.rotation.x = lerp(r.armL.sh.rotation.x, P.shLx, k);
  r.armR.sh.rotation.x = lerp(r.armR.sh.rotation.x, P.shRx, k);
  r.armL.sh.rotation.z = lerp(r.armL.sh.rotation.z, P.shLz, k);
  r.armR.sh.rotation.z = lerp(r.armR.sh.rotation.z, P.shRz, k);
  r.armL.el.rotation.x = lerp(r.armL.el.rotation.x, P.elL, k);
  r.armR.el.rotation.x = lerp(r.armR.el.rotation.x, P.elR, k);
  r.torso.rotation.x = lerp(r.torso.rotation.x, P.lean, k);
  // 跑步時上半身微微扭轉
  r.torso.rotation.y = lerp(r.torso.rotation.y, air || shuffle ? 0 : Math.sin(ph) * sw * 0.12, k);
  r.headG.rotation.x = lerp(r.headG.rotation.x, -P.lean * 0.6 + P.head, k);
  if (P.bodyY !== null) r.body.position.y = lerp(r.body.position.y, P.bodyY, k);
  else {
    const kneeAvg = (r.legL.knee.rotation.x + r.legR.knee.rotation.x) / 2;
    const hipAvg = (r.legL.hip.rotation.x + r.legR.hip.rotation.x) / 2;
    const drop = (1 - Math.cos(kneeAvg)) * 0.22 + (1 - Math.cos(hipAvg)) * 0.12 + (shuffle ? 0.04 : 0);
    const bob = air ? 0 : Math.abs(Math.sin(ph)) * 0.045 * sw;
    r.body.position.y = p.jy / p.scale + (air ? 0 : -drop * 0.85 + bob);
  }
  r.root.position.set(p.pos.x, 0, p.pos.z);
  r.root.rotation.y = p.facing;
}
function clamp01(v) { return Math.max(0, Math.min(1, v)); }
