// 場館中央懸吊大螢幕：吊在中場正上方（底部離地 10m，比球員跳最高點和投籃弧線都高很多），
// 四面都有螢幕：長邊兩面朝兩側看台、短邊兩面朝兩端底線；螢幕下方一圈 LED 帶顯示比分與時間。
// 螢幕畫面是用另一台攝影機即時拍的現場（跟真的球場一樣播現場畫面）。
import * as THREE from 'three';

const BOTTOM = 10.0, W = 6.4, H = 3.6, D = 4.0, RIB = 0.55, CAP = 0.35;
export function createJumbotron(scene, { feed = true } = {}) {
  const grp = new THREE.Group(); scene.add(grp);
  const frame = new THREE.MeshStandardMaterial({ color: 0x15171c, roughness: 0.55, metalness: 0.4 });
  const yScreen = BOTTOM + RIB + H / 2, top = BOTTOM + RIB + H + CAP;
  // 機身（略小於螢幕外框，螢幕貼在外面）
  const body = new THREE.Mesh(new THREE.BoxGeometry(W + 0.1, top - BOTTOM, D + 0.1), frame); body.position.y = (top + BOTTOM) / 2; grp.add(body);
  // 下方收口與吊纜
  const bot = new THREE.Mesh(new THREE.BoxGeometry(W * 0.7, 0.3, D * 0.7), frame); bot.position.y = BOTTOM - 0.15; grp.add(bot);
  const cableMat = new THREE.MeshBasicMaterial({ color: 0x2a2d33 });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const c = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 30 - top, 6), cableMat);
    c.position.set(sx * W * 0.4, (30 + top) / 2, sz * D * 0.4); grp.add(c);
  }
  // 即時畫面
  let rt = null, feedCam = null;
  let screenMat;
  if (feed) {
    rt = new THREE.WebGLRenderTarget(384, 216, { samples: 0 }); rt.texture.colorSpace = THREE.SRGBColorSpace;
    feedCam = new THREE.PerspectiveCamera(34, 16 / 9, 0.3, 80);
    screenMat = new THREE.MeshBasicMaterial({ map: rt.texture, toneMapped: false });
  } else screenMat = new THREE.MeshBasicMaterial({ color: 0x0a1a3a });
  // LED 比分帶
  const can = document.createElement('canvas'); can.width = 1024; can.height = 88;
  const ribTex = new THREE.CanvasTexture(can); ribTex.colorSpace = THREE.SRGBColorSpace;
  const ribMat = new THREE.MeshBasicMaterial({ map: ribTex, toneMapped: false });
  const faces = [];
  for (const [w, x, z, ry] of [[W, 0, D / 2 + 0.06, 0], [W, 0, -D / 2 - 0.06, Math.PI], [D, W / 2 + 0.06, 0, Math.PI / 2], [D, -W / 2 - 0.06, 0, -Math.PI / 2]]) {
    const sw = w - 0.3, sh = Math.min(H - 0.2, sw * 9 / 16);
    const scr = new THREE.Mesh(new THREE.PlaneGeometry(sw, sh), screenMat); scr.position.set(x, yScreen, z); scr.rotation.y = ry; grp.add(scr);
    const rib = new THREE.Mesh(new THREE.PlaneGeometry(w - 0.1, RIB - 0.1), ribMat); rib.position.set(x, BOTTOM + RIB / 2, z); rib.rotation.y = ry; grp.add(rib);
    faces.push(scr);
  }
  const box = new THREE.Box3(new THREE.Vector3(-W / 2, BOTTOM, -D / 2), new THREE.Vector3(W / 2, top, D / 2));
  const frus = new THREE.Frustum(), m = new THREE.Matrix4();
  let lastTxt = '', tick = 0;
  return {
    grp, center: new THREE.Vector3(0, yScreen, 0),
    setScore(txt, colors) {
      if (txt === lastTxt) return; lastTxt = txt;
      const g = can.getContext('2d');
      g.fillStyle = '#05070c'; g.fillRect(0, 0, 1024, 88);
      const [a, b, c] = txt.split('|');
      g.fillStyle = colors[0]; g.fillRect(8, 8, 330, 72); g.fillStyle = colors[1]; g.fillRect(686, 8, 330, 72);
      g.font = 'bold 50px sans-serif'; g.textBaseline = 'middle'; g.textAlign = 'center'; g.fillStyle = '#fff';
      g.fillText(a, 173, 46); g.fillText(c, 851, 46);
      g.fillStyle = '#ffd23a'; g.fillText(b, 512, 46);
      ribTex.needsUpdate = true;
    },
    // 每 3 幀才更新一次畫面，而且只有大螢幕出現在主攝影機畫面裡時才拍
    update(renderer, scene, camera, look, force) {
      if (!rt) return;
      tick++;
      camera.updateMatrixWorld(); m.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse); frus.setFromProjectionMatrix(m);
      if (!force && !frus.intersectsBox(box)) return;
      if (tick % 3) return;
      feedCam.position.copy(look.pos); feedCam.lookAt(look.at);
      grp.visible = false;
      const prev = renderer.getRenderTarget();
      renderer.setRenderTarget(rt); renderer.render(scene, feedCam); renderer.setRenderTarget(prev);
      grp.visible = true;
    },
  };
}
