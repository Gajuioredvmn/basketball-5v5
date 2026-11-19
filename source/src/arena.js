import * as THREE from 'three';
import { HX, HZ, RIM_H, RIM_R, BASKET_X, BOARD_X, BOARD_BOTTOM, BOARD_W, BOARD_H, THREE_R, THREE_SIDE, KEY_HALF, FT_X, CIRCLE_R, RA_R } from './const.js';

// ---------- 地板貼圖 ----------
const FX = 16, FZ = 9, PPM = 64; // 地板貼圖範圍 x[-16,16] z[-9,9]
function floorTexture(renderer) {
  const W = FX * 2 * PPM, H = FZ * 2 * PPM;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d');
  const X = x => (x + FX) * PPM, Z = z => (z + FZ) * PPM;
  // 木紋：沿長邊的楓木條
  g.fillStyle = '#c9955c'; g.fillRect(0, 0, W, H);
  let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const plank = 0.075 * PPM;
  for (let y = 0; y < H; y += plank) {
    let x = -rnd() * 300;
    while (x < W) {
      const len = (1.2 + rnd() * 1.8) * PPM;
      const l = 0.86 + rnd() * 0.22;
      g.fillStyle = `rgb(${Math.min(255, 205 * l) | 0},${(152 * l) | 0},${(95 * l) | 0})`;
      g.fillRect(x, y, len, plank);
      g.fillStyle = 'rgba(70,40,15,0.18)'; g.fillRect(x, y, 1, plank);
      x += len;
    }
    g.fillStyle = 'rgba(60,35,10,0.22)'; g.fillRect(0, y, W, 1);
  }
  // 木紋細線
  for (let i = 0; i < 9000; i++) {
    g.fillStyle = `rgba(90,55,20,${0.04 + rnd() * 0.06})`;
    g.fillRect(rnd() * W, rnd() * H, 6 + rnd() * 40, 1);
  }
  // 場外緩衝區（深藍漆）
  g.fillStyle = 'rgba(22,36,72,0.93)';
  g.fillRect(0, 0, W, Z(-HZ)); g.fillRect(0, Z(HZ), W, H - Z(HZ));
  g.fillRect(0, Z(-HZ), X(-HX), Z(HZ) - Z(-HZ)); g.fillRect(X(HX), Z(-HZ), W - X(HX), Z(HZ) - Z(-HZ));
  // 禁區、中圈上漆
  const paint = 'rgba(166,40,36,0.88)';
  g.fillStyle = paint;
  for (const s of [-1, 1]) {
    const x0 = X(s * HX), x1 = X(s * FT_X);
    g.fillRect(Math.min(x0, x1), Z(-KEY_HALF), Math.abs(x1 - x0), Z(KEY_HALF) - Z(-KEY_HALF));
  }
  g.beginPath(); g.arc(X(0), Z(0), CIRCLE_R * PPM, 0, Math.PI * 2); g.fill();
  // 中圈標誌
  g.fillStyle = 'rgba(22,36,72,0.9)';
  g.beginPath(); g.arc(X(0), Z(0), 1.2 * PPM, 0, Math.PI * 2); g.fill();
  g.strokeStyle = '#f08a24'; g.lineWidth = 0.09 * PPM;
  g.beginPath(); g.arc(X(0), Z(0), 0.85 * PPM, 0, Math.PI * 2); g.stroke();
  g.beginPath(); g.moveTo(X(-0.85), Z(0)); g.lineTo(X(0.85), Z(0)); g.stroke();
  g.beginPath(); g.moveTo(X(0), Z(-0.85)); g.lineTo(X(0), Z(0.85)); g.stroke();
  g.fillStyle = '#ffffff'; g.font = `bold ${0.42 * PPM}px sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
  // 場邊字樣（底線外緩衝區，文字面向攝影機）
  g.font = `bold ${0.7 * PPM}px sans-serif`; g.fillStyle = 'rgba(255,255,255,0.85)';
  g.fillText('全 場 5 v 5', X(0), Z(HZ + 0.85));
  // 白線（5 公分）
  g.strokeStyle = '#ffffff'; g.lineWidth = 0.05 * PPM; g.setLineDash([]);
  const line = (x1, z1, x2, z2) => { g.beginPath(); g.moveTo(X(x1), Z(z1)); g.lineTo(X(x2), Z(z2)); g.stroke(); };
  g.strokeRect(X(-HX), Z(-HZ), X(HX) - X(-HX), Z(HZ) - Z(-HZ));
  line(0, -HZ, 0, HZ);
  g.beginPath(); g.arc(X(0), Z(0), CIRCLE_R * PPM, 0, Math.PI * 2); g.stroke();
  const a = Math.atan2(THREE_SIDE, Math.sqrt(THREE_R ** 2 - THREE_SIDE ** 2));
  for (const s of [-1, 1]) {
    const bx = s * BASKET_X;
    const xEnd = s * (BASKET_X - Math.sqrt(THREE_R ** 2 - THREE_SIDE ** 2));
    line(s * HX, -THREE_SIDE, xEnd, -THREE_SIDE); line(s * HX, THREE_SIDE, xEnd, THREE_SIDE);
    g.beginPath();
    if (s > 0) g.arc(X(bx), Z(0), THREE_R * PPM, Math.PI - a, Math.PI + a); else g.arc(X(bx), Z(0), THREE_R * PPM, -a, a);
    g.stroke();
    // 禁區
    g.strokeRect(Math.min(X(s * HX), X(s * FT_X)), Z(-KEY_HALF), Math.abs(X(s * HX) - X(s * FT_X)), Z(KEY_HALF) - Z(-KEY_HALF));
    // 罰球圈：外半實線、內半虛線
    g.beginPath();
    if (s > 0) g.arc(X(s * FT_X), Z(0), CIRCLE_R * PPM, Math.PI / 2, Math.PI * 1.5); else g.arc(X(s * FT_X), Z(0), CIRCLE_R * PPM, -Math.PI / 2, Math.PI / 2);
    g.stroke();
    g.setLineDash([0.39 * PPM, 0.39 * PPM]); g.beginPath();
    if (s > 0) g.arc(X(s * FT_X), Z(0), CIRCLE_R * PPM, -Math.PI / 2, Math.PI / 2); else g.arc(X(s * FT_X), Z(0), CIRCLE_R * PPM, Math.PI / 2, Math.PI * 1.5);
    g.stroke(); g.setLineDash([]);
    // 合理衝撞區（4 呎半圓，兩端直線到籃板正下方）
    g.beginPath();
    if (s > 0) g.arc(X(bx), Z(0), RA_R * PPM, Math.PI / 2, Math.PI * 1.5); else g.arc(X(bx), Z(0), RA_R * PPM, -Math.PI / 2, Math.PI / 2);
    g.stroke();
    line(bx, -RA_R, s * BOARD_X, -RA_R); line(bx, RA_R, s * BOARD_X, RA_R);
    // 禁區兩側站位標記（7、11、14 呎）與 8 呎處的實心區塊
    for (const d of [2.134, 3.353, 4.267]) {
      const x = s * (HX - d);
      line(x, KEY_HALF, x, KEY_HALF + 0.152); line(x, -KEY_HALF, x, -KEY_HALF - 0.152);
    }
    g.fillStyle = '#ffffff';
    for (const zz of [1, -1]) g.fillRect(Math.min(X(s * (HX - 2.134)), X(s * (HX - 2.438))), zz > 0 ? Z(KEY_HALF) : Z(-KEY_HALF - 0.203), 0.305 * PPM, 0.203 * PPM);
    // 底線起 28 呎的教練區界線（板凳那一側，場內外各 3 呎）
    const tx = s * (HX - 8.534);
    line(tx, HZ - 0.914, tx, HZ + 0.914);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  return tex;
}

function textTexture(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

// ---------- 籃架 ----------
function makeHoop(s, shotClocks) {
  const grp = new THREE.Group();
  const glass = new THREE.MeshStandardMaterial({ color: 0xcfe6ff, transparent: true, opacity: 0.22, roughness: 0.05, metalness: 0.1, depthWrite: false });
  const white = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5 });
  const pad = new THREE.MeshStandardMaterial({ color: 0x14244d, roughness: 0.8 });
  const steel = new THREE.MeshStandardMaterial({ color: 0x2b2f38, roughness: 0.45, metalness: 0.6 });
  const orange = new THREE.MeshStandardMaterial({ color: 0xff5a14, roughness: 0.4, metalness: 0.4 });
  const by = BOARD_BOTTOM + BOARD_H / 2;
  const boardX = s * (BOARD_X + 0.015);
  const board = new THREE.Mesh(new THREE.BoxGeometry(0.03, BOARD_H, BOARD_W), glass);
  board.position.set(boardX, by, 0); grp.add(board);
  const faceX = s * (BOARD_X - 0.002);
  const bar = (y, z, h, w) => { const m = new THREE.Mesh(new THREE.BoxGeometry(0.01, h, w), white); m.position.set(faceX, y, z); grp.add(m); };
  // 外框
  bar(BOARD_BOTTOM + BOARD_H - 0.025, 0, 0.05, BOARD_W); bar(BOARD_BOTTOM + 0.025, 0, 0.05, BOARD_W);
  bar(by, BOARD_W / 2 - 0.025, BOARD_H, 0.05); bar(by, -BOARD_W / 2 + 0.025, BOARD_H, 0.05);
  // 內框 0.59 x 0.45，下緣齊籃框上緣
  const iy0 = RIM_H + 0.02, iy1 = iy0 + 0.457;
  bar(iy1 - 0.025, 0, 0.05, 0.61); bar(iy0 + 0.025, 0, 0.05, 0.61);
  bar((iy0 + iy1) / 2, 0.305 - 0.025, 0.457, 0.05); bar((iy0 + iy1) / 2, -0.305 + 0.025, 0.457, 0.05);
  // 籃板下緣護墊
  const bp = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.05, BOARD_W), pad); bp.position.set(boardX, BOARD_BOTTOM - 0.025, 0); grp.add(bp);
  // 籃框
  const rim = new THREE.Mesh(new THREE.TorusGeometry(RIM_R, 0.01, 8, 32), orange);
  rim.rotation.order = 'ZXY'; rim.rotation.x = Math.PI / 2; rim.position.set(s * BASKET_X, RIM_H, 0); grp.add(rim);
  const brk = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.05, 0.16), orange);
  brk.position.set(s * (BOARD_X - 0.08), RIM_H - 0.02, 0); brk.scale.x = 0.95; grp.add(brk);
  const brk2 = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.2, 0.22), orange);
  brk2.position.set(s * (BOARD_X - 0.012), RIM_H - 0.08, 0); grp.add(brk2);
  // 籃網
  // 籃網：12 組菱形網目，白色粗繩
  const netTex = textTexture(256, 128, (g, w, h) => {
    g.strokeStyle = '#ffffff'; g.lineWidth = 5; g.lineCap = 'round';
    const n = 12, cw = w / n;
    for (let i = -n; i < 2 * n; i++) {
      g.beginPath(); g.moveTo(i * cw, 0); g.lineTo(i * cw + w / 2, h); g.stroke();
      g.beginPath(); g.moveTo(i * cw + w / 2, 0); g.lineTo(i * cw, h); g.stroke();
    }
    g.lineWidth = 7; g.beginPath(); g.moveTo(0, 3); g.lineTo(w, 3); g.stroke();
  });
  netTex.wrapS = THREE.RepeatWrapping;
  const netGeo = new THREE.CylinderGeometry(RIM_R - 0.004, 0.125, 0.45, 32, 8, true);
  const net = new THREE.Mesh(netGeo, new THREE.MeshBasicMaterial({ map: netTex, transparent: true, alphaTest: 0.35, side: THREE.DoubleSide }));
  net.position.set(s * BASKET_X, RIM_H - 0.225, 0); grp.add(net);
  net.userData.base = Float32Array.from(netGeo.attributes.position.array);
  // 籃架：落地底座在底線外 2m，支臂伸到籃板背面
  const baseFront = HX + 2.0;
  const base = new THREE.Mesh(new THREE.BoxGeometry(1.3, 1.15, 1.7), pad);
  base.position.set(s * (baseFront + 0.65), 0.575, 0); grp.add(base);
  const baseTop = new THREE.Mesh(new THREE.BoxGeometry(1.32, 0.04, 1.72), new THREE.MeshStandardMaterial({ color: 0xffffff }));
  baseTop.position.set(s * (baseFront + 0.65), 1.16, 0); grp.add(baseTop);
  const poleX = s * (baseFront + 0.85);
  const pole = new THREE.Mesh(new THREE.BoxGeometry(0.28, 2.55, 0.28), steel); pole.position.set(poleX, 1.15 + 1.275, 0); grp.add(pole);
  const armY = by + 0.1;
  const armLen = Math.abs(poleX) - (BOARD_X + 0.03);
  const arm = new THREE.Mesh(new THREE.BoxGeometry(armLen, 0.2, 0.22), steel);
  arm.position.set(s * (BOARD_X + 0.03 + armLen / 2), armY, 0); grp.add(arm);
  // 斜撐：從底座前上方到支臂中段
  const p1 = new THREE.Vector3(s * (baseFront + 0.2), 1.17, 0), p2 = new THREE.Vector3(s * (BOARD_X + 0.03 + armLen * 0.45), armY - 0.1, 0);
  const brace = new THREE.Mesh(new THREE.BoxGeometry(0.12, p1.distanceTo(p2), 0.12), steel);
  brace.position.copy(p1).add(p2).multiplyScalar(0.5);
  brace.rotation.z = Math.atan2(p2.y - p1.y, p2.x - p1.x) - Math.PI / 2; grp.add(brace);
  // 支臂下方護墊（面向球場）
  const armPad = new THREE.Mesh(new THREE.BoxGeometry(armLen * 0.5, 0.08, 0.3), pad);
  armPad.position.set(s * (BOARD_X + 0.03 + armLen * 0.25), armY - 0.14, 0); grp.add(armPad);
  // 底座側面字樣
  const decal = textTexture(256, 128, (g, w, h) => { g.fillStyle = '#14244d'; g.fillRect(0, 0, w, h); g.fillStyle = '#fff'; g.font = 'bold 54px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('5 v 5', w / 2, h / 2); });
  const dm = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 0.5), new THREE.MeshStandardMaterial({ map: decal }));
  dm.position.set(s * (baseFront + 0.65), 0.6, 0.851); grp.add(dm);
  // 進攻計時器：裝在籃板正上方
  const scCan = document.createElement('canvas'); scCan.width = 128; scCan.height = 64;
  const scTex = new THREE.CanvasTexture(scCan); scTex.colorSpace = THREE.SRGBColorSpace;
  const scBox = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.3, 0.55), new THREE.MeshStandardMaterial({ color: 0x111111 }));
  scBox.position.set(boardX, BOARD_BOTTOM + BOARD_H + 0.15, 0); grp.add(scBox);
  const scFace = new THREE.Mesh(new THREE.PlaneGeometry(0.48, 0.24), new THREE.MeshBasicMaterial({ map: scTex }));
  scFace.position.set(boardX - s * 0.082, BOARD_BOTTOM + BOARD_H + 0.15, 0); scFace.rotation.y = -s * Math.PI / 2; grp.add(scFace);
  shotClocks.push({ can: scCan, tex: scTex, last: null });
  return { grp, net, rim };
}

// ---------- 觀眾席 ----------
function makeStands(scene, crowdUniforms) {
  const dummy = new THREE.Object3D();
  const seatPos = [];
  // 遠側長邊看台（面向 +z）
  const rows = 14;
  const standMat = new THREE.MeshStandardMaterial({ color: 0x1b1f2a, roughness: 0.9 });
  const stepGeo = new THREE.BoxGeometry(1, 1, 1);
  const addStep = (cx, cy, cz, sx, sy, sz) => { const m = new THREE.Mesh(stepGeo, standMat); m.position.set(cx, cy, cz); m.scale.set(sx, sy, sz); scene.add(m); };
  const z0 = -11.2;
  for (let r = 0; r < rows; r++) {
    const z = z0 - r * 0.85, y = 0.55 + r * 0.42;
    addStep(0, y / 2, z - 0.425, 38.6, y, 0.85);
    for (let x = -19.0; x <= 19.0; x += 0.56) {
      if (Math.abs(x) < 0.7 || Math.abs(Math.abs(x) - 11) < 0.6) continue; // 走道
      seatPos.push([x, y, z - 0.3, 0]);
    }
  }
  // 兩端看台（面向球場）
  for (const s of [-1, 1]) {
    for (let r = 0; r < 11; r++) {
      const x = s * (19.6 + r * 0.85), y = 0.55 + r * 0.42;
      addStep(x + s * 0.425, y / 2, -1.5, 0.85, y, 20);
      for (let z = -11; z <= 8; z += 0.56) {
        if (Math.abs(z + 1.5) < 0.6) continue;
        seatPos.push([x + s * 0.3, y, z, s]);
      }
    }
  }
  // 看台前緣 LED 環帶
  const ribbon = textTexture(2048, 64, (g, w, h) => {
    const grd = g.createLinearGradient(0, 0, w, 0); grd.addColorStop(0, '#0b1b4a'); grd.addColorStop(0.5, '#183a8c'); grd.addColorStop(1, '#0b1b4a');
    g.fillStyle = grd; g.fillRect(0, 0, w, h);
    g.fillStyle = '#ffd34d'; g.font = 'bold 40px sans-serif'; g.textBaseline = 'middle';
    const words = ['DEFENSE!', '加油！', 'MAKE SOME NOISE', '全場 5v5', 'DEFENSE!', '加油！', 'MAKE SOME NOISE'];
    let x = 30; for (const wd of words) { g.fillText(wd, x, h / 2); x += g.measureText(wd).width + 120; }
  });
  const rib = new THREE.Mesh(new THREE.PlaneGeometry(38.6, 0.5), new THREE.MeshBasicMaterial({ map: ribbon }));
  rib.position.set(0, 0.32, z0 + 0.01); scene.add(rib);
  // 座椅
  const seatGeo = new THREE.BoxGeometry(0.46, 0.42, 0.42);
  const seats = new THREE.InstancedMesh(seatGeo, new THREE.MeshStandardMaterial({ color: 0x7a1d1d, roughness: 0.8 }), seatPos.length);
  // 觀眾（身體 + 頭）
  const bodyGeo = new THREE.CapsuleGeometry(0.18, 0.32, 2, 6); bodyGeo.translate(0, 0.62, 0);
  const headGeo = new THREE.SphereGeometry(0.1, 8, 6); headGeo.translate(0, 1.08, 0);
  const crowdMat = (c) => {
    const m = new THREE.MeshLambertMaterial({ color: c });
    m.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = crowdUniforms.uTime; sh.uniforms.uCheer = crowdUniforms.uCheer;
      sh.vertexShader = 'uniform float uTime; uniform float uCheer;\n' + sh.vertexShader.replace('#include <begin_vertex>',
        `#include <begin_vertex>
        float ph = instanceMatrix[3].x * 1.7 + instanceMatrix[3].z * 2.3;
        transformed.y += (0.025 * sin(uTime * 1.3 + ph) + uCheer * (0.28 + 0.18 * abs(sin(uTime * 7.0 + ph)))) ;`);
    };
    return m;
  };
  let seed = 3; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const people = seatPos.filter(() => rnd() < 0.86);
  const bodies = new THREE.InstancedMesh(bodyGeo, crowdMat(0xffffff), people.length);
  const heads = new THREE.InstancedMesh(headGeo, crowdMat(0xffffff), people.length);
  const shirt = ['#c62828', '#c62828', '#1d3f91', '#ffffff', '#222222', '#f2c14e', '#2e7d32', '#6a1b9a', '#9e9e9e', '#e65100', '#c62828', '#1d3f91'];
  const skin = ['#f1c27d', '#e0ac69', '#c68642', '#8d5524', '#ffdbac', '#e8b98e'];
  const col = new THREE.Color();
  seatPos.forEach((p, i) => {
    dummy.position.set(p[0], p[1] + 0.21, p[2]);
    dummy.rotation.set(0, p[3] === 0 ? 0 : (p[3] > 0 ? -Math.PI / 2 : Math.PI / 2), 0);
    dummy.updateMatrix(); seats.setMatrixAt(i, dummy.matrix);
  });
  people.forEach((p, i) => {
    dummy.position.set(p[0], p[1] + 0.05, p[2]); dummy.rotation.set(0, 0, 0); dummy.scale.setScalar(0.92 + rnd() * 0.16);
    dummy.updateMatrix(); bodies.setMatrixAt(i, dummy.matrix); heads.setMatrixAt(i, dummy.matrix);
    bodies.setColorAt(i, col.set(shirt[(rnd() * shirt.length) | 0]).multiplyScalar(0.75));
    heads.setColorAt(i, col.set(skin[(rnd() * skin.length) | 0]).multiplyScalar(0.8));
  });
  scene.add(seats, bodies, heads);
  // 約一成觀眾舉加油牌（隨歡呼一起晃動）
  const holders = people.filter(() => rnd() < 0.1);
  const signGeo = new THREE.PlaneGeometry(0.62, 0.4); signGeo.translate(0, 1.42, 0.08);
  const signs = new THREE.InstancedMesh(signGeo, crowdMat(0xffffff), holders.length);
  signs.material.side = THREE.DoubleSide;
  const signCols = ['#ffd34d', '#ffffff', '#c62828', '#ff8a1f', '#5ec8ff', '#7fff6a'];
  holders.forEach((p, i) => {
    dummy.position.set(p[0], p[1] + 0.05, p[2]); dummy.rotation.set(0, p[3] === 0 ? 0 : (p[3] > 0 ? -Math.PI / 2 : Math.PI / 2), 0); dummy.scale.setScalar(1);
    dummy.updateMatrix(); signs.setMatrixAt(i, dummy.matrix); signs.setColorAt(i, col.set(signCols[(rnd() * signCols.length) | 0]));
  });
  scene.add(signs);
}

// ---------- 場邊 LED 廣告看板 ----------
function makeBoards(scene) {
  const tex = textTexture(1024, 64, (g, w, h) => {
    g.fillStyle = '#05070d'; g.fillRect(0, 0, w, h);
    const items = [['DEFENSE', '#ff4d4d'], ['籃球之夜', '#ffd34d'], ['FAST BREAK', '#5ec8ff'], ['港都運動', '#ffffff']];
    g.font = 'bold 40px sans-serif'; g.textBaseline = 'middle'; g.textAlign = 'center';
    items.forEach((it, i) => { g.fillStyle = it[1]; g.fillText(it[0], (i + 0.5) * w / 4, h / 2); });
  });
  tex.wrapS = THREE.RepeatWrapping; tex.repeat.set(3, 1);
  const mat = new THREE.MeshBasicMaterial({ map: tex });
  const frame = new THREE.MeshStandardMaterial({ color: 0x111317, roughness: 0.6 });
  // 遠側邊線外 2m，落地擺放、高 0.9m、斜面朝球場
  const z = -(HZ + 2.0);
  const box = new THREE.Mesh(new THREE.BoxGeometry(30, 0.9, 0.35), frame); box.position.set(0, 0.45, z - 0.1); scene.add(box);
  const face = new THREE.Mesh(new THREE.PlaneGeometry(29.8, 0.78), mat); face.position.set(0, 0.47, z + 0.08); scene.add(face);
  return tex;
}

// ---------- 場館本體 ----------
export function buildArena(scene, renderer) {
  const shotClocks = [];
  const crowdUniforms = { uTime: { value: 0 }, uCheer: { value: 0 } };
  // 外圈地板（看台區）
  // 外圈地板做成框，中間留給半透明的球場地板（倒影從下面透出來）
  const outerMat = new THREE.MeshStandardMaterial({ color: 0x14161c, roughness: 0.9 });
  for (const [w, d, x, z] of [[80, 21, 0, -(FZ + 10.5)], [80, 21, 0, FZ + 10.5], [24, FZ * 2, -(FX + 12), 0], [24, FZ * 2, FX + 12, 0]]) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), outerMat); m.rotation.x = -Math.PI / 2; m.position.set(x, -0.005, z); scene.add(m);
  }
  // 主地板
  // 亮面木地板：半透明，讓下方的鏡像球員形成倒影
  const floorMat = new THREE.MeshStandardMaterial({ map: floorTexture(renderer), roughness: 0.3, metalness: 0.0, envMapIntensity: 0.9, transparent: true, opacity: 0.8 });
  floorMat.color.setScalar(1.12);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(FX * 2, FZ * 2), floorMat);
  floor.rotation.x = -Math.PI / 2; floor.renderOrder = -1; scene.add(floor);
  const under = new THREE.Mesh(new THREE.PlaneGeometry(FX * 2, FZ * 2), new THREE.MeshBasicMaterial({ color: 0x2a1c10 }));
  under.rotation.x = -Math.PI / 2; under.position.y = -3.2; scene.add(under);
  // 牆面
  const wallMat = new THREE.MeshStandardMaterial({ color: 0x0c0f18, roughness: 1 });
  const wall = new THREE.Mesh(new THREE.BoxGeometry(80, 22, 1), wallMat); wall.position.set(0, 11, -24); scene.add(wall);
  for (const s of [-1, 1]) { const w = new THREE.Mesh(new THREE.BoxGeometry(1, 22, 60), wallMat); w.position.set(s * 31, 11, 0); scene.add(w); }
  makeStands(scene, crowdUniforms);
  // 天花板燈組在亮面地板上的倒影（放在地板下方，從半透明地板透出來）
  const glow = new THREE.MeshBasicMaterial({ color: 0xfff6e0, transparent: true, opacity: 0.55, depthWrite: false });
  for (let i = -2; i <= 2; i++) for (const z of [-3.2, 0, 3.2]) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 0.7), glow); m.rotation.x = -Math.PI / 2; m.position.set(i * 5.6, -2.9, z); scene.add(m);
  }
  // 球場正上方的主燈：球場最亮、往外漸暗
  const spot = new THREE.SpotLight(0xfff2dc, 650, 0, Math.PI / 4.2, 0.55, 2); spot.position.set(0, 26, 2); spot.target.position.set(0, 0, 0); scene.add(spot, spot.target);
  const adTex = makeBoards(scene);
  const hoops = [makeHoop(-1, shotClocks), makeHoop(1, shotClocks)];
  hoops.forEach(h => scene.add(h.grp));
  // 記錄台（近側邊線外，中線位置）與兩隊板凳
  const tableMat = new THREE.MeshStandardMaterial({ color: 0x14244d, roughness: 0.7 });
  const table = new THREE.Mesh(new THREE.BoxGeometry(6, 0.8, 0.7), tableMat); table.position.set(0, 0.4, HZ + 2.4); scene.add(table);
  const chairMat = new THREE.MeshStandardMaterial({ color: 0x333842 });
  for (const s of [-1, 1]) for (let i = 0; i < 8; i++) {
    const c = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.45, 0.5), chairMat); c.position.set(s * (4.5 + i * 0.65), 0.225, HZ + 2.6); scene.add(c);
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.06), chairMat); b.position.set(s * (4.5 + i * 0.65), 0.7, HZ + 2.83); scene.add(b);
  }
  return { hoops, shotClocks, crowdUniforms, adTex };
}

export function updateShotClockDisplays(shotClocks, value) {
  const txt = value == null ? '' : String(Math.ceil(Math.max(0, value)));
  for (const sc of shotClocks) {
    if (sc.last === txt) continue; sc.last = txt;
    const g = sc.can.getContext('2d');
    g.fillStyle = '#080808'; g.fillRect(0, 0, 128, 64);
    g.fillStyle = '#ff2a1a'; g.font = 'bold 54px monospace'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(txt, 64, 34); sc.tex.needsUpdate = true;
  }
}
