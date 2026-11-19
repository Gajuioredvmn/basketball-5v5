import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { HX, HZ, RIM_H, RIM_R, BALL_R, BASKET_X, BOARD_X, BOARD_BOTTOM, BOARD_W, BOARD_H, THREE_R, THREE_SIDE, KEY_HALF, FT_X, CIRCLE_R, RA_R, G, TEAM_INFO, POS_NAMES, PALETTE } from './const.js';
import { buildArena, updateShotClockDisplays } from './arena.js';
import { makePlayerMesh, makeReflection, animatePlayer, handWorld, jerseyTexture, shortsTexture } from './player.js';
import { initAudio, sfx, setMuted } from './audio.js';
import { createExtras } from './extras.js';

const params = new URLSearchParams(location.search);
const store = { get(k, d) { try { const v = localStorage.getItem('bb5v5.' + k); return v ? JSON.parse(v) : d; } catch (e) { return d; } }, set(k, v) { try { localStorage.setItem('bb5v5.' + k, JSON.stringify(v)); } catch (e) { } } };
const SET = Object.assign({ voice: true, size: 1, lefty: false, vib: true, quality: 'high', pos: {} }, store.get('settings', {}));
function buzz(ms) { if (SET.vib && navigator.vibrate) try { navigator.vibrate(ms); } catch (e) { } }
const AUTO = params.has('auto');
const MANUAL = params.has('manual');
const $ = id => document.getElementById(id);
const rand = (a = 0, b = 1) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const hyp = Math.hypot;

// ================= 渲染 =================
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, SET.quality === 'high' ? 2 : SET.quality === 'mid' ? 1.5 : 1));
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
renderer.outputColorSpace = THREE.SRGBColorSpace;
$('game').appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x07090f);
scene.fog = new THREE.Fog(0x07090f, 38, 70);
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.55;
scene.add(new THREE.HemisphereLight(0xfff4e6, 0x30261c, 0.6));
const sun = new THREE.DirectionalLight(0xffffff, 1.7); sun.position.set(3, 30, 8); scene.add(sun);
const camera = new THREE.PerspectiveCamera(36, 2, 0.1, 140);
const arena = buildArena(scene, renderer);

const shadowTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'); const gr = g.createRadialGradient(32, 32, 2, 32, 32, 32); gr.addColorStop(0, 'rgba(0,0,0,0.55)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c); })();
const shadowMat = new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false });
const shadowGeo = new THREE.PlaneGeometry(1, 1); shadowGeo.rotateX(-Math.PI / 2);
function makeShadow(size) { const m = new THREE.Mesh(shadowGeo, shadowMat); m.scale.set(size, 1, size); m.position.y = 0.012; scene.add(m); return m; }

// ================= 球 =================
const ballTex = (() => {
  const c = document.createElement('canvas'); c.width = 512; c.height = 256; const g = c.getContext('2d');
  g.fillStyle = '#d8661f'; g.fillRect(0, 0, 512, 256);
  for (let i = 0; i < 9000; i++) { g.fillStyle = `rgba(${Math.random() < 0.5 ? '0,0,0' : '255,200,150'},${Math.random() * 0.12})`; g.fillRect(Math.random() * 512, Math.random() * 256, 2, 2); }
  g.strokeStyle = '#1a0e08'; g.lineWidth = 5;
  g.beginPath(); g.moveTo(0, 128); g.lineTo(512, 128); g.stroke();
  for (const x of [0, 256, 512]) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, 256); g.stroke(); }
  for (const off of [128, 384]) { g.beginPath(); for (let y = 0; y <= 256; y += 4) { const x = off + Math.sin((y / 256) * Math.PI) * 70 * (off === 128 ? 1 : -1); y === 0 ? g.moveTo(x, y) : g.lineTo(x, y); } g.stroke(); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
})();
const ballMesh = new THREE.Mesh(new THREE.SphereGeometry(BALL_R, 24, 16), new THREE.MeshStandardMaterial({ map: ballTex, roughness: 0.75 }));
scene.add(ballMesh);
const ballRefl = new THREE.Mesh(ballMesh.geometry, new THREE.MeshStandardMaterial({ map: ballTex, roughness: 0.75 })); scene.add(ballRefl);
const ballShadow = makeShadow(0.4);
const ball = { pos: new THREE.Vector3(0, BALL_R, 0), vel: new THREE.Vector3(), state: 'dead', holder: null, lastTeam: 0, shot: null, pass: null, prevY: 0, rimT: 0, boardT: 0, rimTouched: false, missed: false };

// ================= 球員（每隊 10 人：5 先發 + 5 替補） =================
const ATTR = [
  { scale: 0.95, spd: 1.07, shoot: 1.04, three: 1.08, ft: 1.06, def: 1.0, blk: 0.6, reb: 0.75, handle: 1.2, dunk: false, hcm: 191 },
  { scale: 0.98, spd: 1.05, shoot: 1.07, three: 1.1, ft: 1.08, def: 1.0, blk: 0.7, reb: 0.85, handle: 1.08, dunk: true, hcm: 196 },
  { scale: 1.01, spd: 1.01, shoot: 1.0, three: 0.98, ft: 1.0, def: 1.05, blk: 0.9, reb: 0.95, handle: 1.0, dunk: true, hcm: 201 },
  { scale: 1.04, spd: 0.96, shoot: 0.96, three: 0.84, ft: 0.92, def: 1.0, blk: 1.1, reb: 1.12, handle: 0.9, dunk: true, hcm: 206 },
  { scale: 1.08, spd: 0.92, shoot: 0.9, three: 0.55, ft: 0.82, def: 1.05, blk: 1.35, reb: 1.25, handle: 0.82, dunk: true, hcm: 213 },
];
const NUMS = [[3, 11, 7, 23, 34, 0, 8, 15, 20, 42], [1, 5, 9, 21, 33, 2, 10, 14, 25, 50]];
const roster = [[], []], teams = [[], []];
let players = [];
const ring = new THREE.Mesh(new THREE.RingGeometry(0.42, 0.52, 32), new THREE.MeshBasicMaterial({ color: 0xffd400, transparent: true, opacity: 0.9, depthWrite: false }));
ring.rotation.x = -Math.PI / 2; ring.position.y = 0.015; scene.add(ring);
const newStats = () => ({ pts: 0, reb: 0, ast: 0, stl: 0, blk: 0, fgm: 0, fga: 0, tpm: 0, tpa: 0, ftm: 0, fta: 0, pf: 0, tov: 0, sec: 0 });
for (let t = 0; t < 2; t++) for (let i = 0; i < 10; i++) {
  const role = i % 5, bench = i >= 5;
  const a = { ...ATTR[role] };
  if (bench) for (const k of ['spd', 'shoot', 'three', 'ft', 'def', 'blk', 'reb', 'handle']) a[k] *= rand(0.9, 0.98);
  a.scale *= bench ? rand(0.98, 1.02) : 1; a.hcm = Math.round(a.hcm * a.scale / ATTR[role].scale);
  const skin = t * 10 + i * 3 + (t ? 1 : 0);
  const rig = makePlayerMesh(t, role, NUMS[t][i], a.scale, skin);
  scene.add(rig.root);
  const p = { team: t, role, idx: bench ? -1 : role, num: NUMS[t][i], ...a, rig, refl: makeReflection(rig, scene), pos: new THREE.Vector3(), vel: new THREE.Vector3(), facing: 0, jy: 0, jv: 0, runPhase: rand(0, 6), dribblePh: 0, pose: 'run', hand: 1,
    action: null, actT: 0, slowT: 0, stealCD: 0, moveCD: 0, moveT: 0, moveVel: new THREE.Vector3(), openT: 0, noGrabT: 0, holdT: 0, decT: 0, contestT: -1, cutT: rand(3, 8), cutting: 0, landT: 0, keyT: 0, dkeyT: 0,
    sta: 1, st: newStats(), onCourt: !bench, chair: -1, walkTo: null, shadow: makeShadow(0.9 * a.scale) };
  roster[t].push(p);
}
const CHAIRS = t => Array.from({ length: 8 }, (_, i) => new THREE.Vector3((t === 0 ? -1 : 1) * (4.5 + i * 0.65), 0, HZ + 2.6));
function rebuildLists() {
  for (let t = 0; t < 2; t++) { teams[t] = [null, null, null, null, null]; for (const p of roster[t]) if (p.onCourt) teams[t][p.idx] = p; }
  players = [...teams[0], ...teams[1]];
}
const refRig = makePlayerMesh(2, 0, 12, 0.98, 6); scene.add(refRig.root);
const extras = createExtras(scene, { dancers: SET.quality !== 'low' });
for (const a of extras.list) a.shadow = makeShadow(0.8);
const referee = { rig: refRig, refl: makeReflection(refRig, scene), pos: new THREE.Vector3(0, 0, -HZ - 0.7), vel: new THREE.Vector3(), facing: 0, jy: 0, runPhase: 0, pose: 'run', scale: 0.98, landT: 0, dribblePh: 0, shadow: makeShadow(0.9) };

// ================= 遊戲狀態 =================
const S = { play: ['motion', 'motion'], defense: ['man', 'man'], slowmo: 0, shake: 0, phase: 'title', paused: false, quarter: 1, qlen: 180, clock: 180, shotClock: 24, score: [0, 0], poss: 0, attack: [1, -1], arrow: 0, diff: 1, timer: 0, ib: null, next: null, pendingEnd: false, tip: null,
  teamFouls: [0, 0], timeouts: [7, 7], fc: false, bcT: 0, ft: null, pendingFT: null, assist: null, gameT: 0, run: [0, 0], aiTOused: false, autoSub: true, subQueue: [], screen: [null, null], screenCD: [0, 0],
  replay: null, lastReplay: -99, highlight: null, lastScoreSide: 0, chargeCD: 0,
  stats: [0, 1].map(() => ({ fgm: 0, fga: 0, tpm: 0, tpa: 0, ftm: 0, fta: 0, reb: 0, stl: 0, blk: 0, tov: 0, pf: 0 })) };
let ctrl = null;
const DIFF = [{ ai: 0.85, react: 1.4, steal: 0.7 }, { ai: 1.0, react: 1.0, steal: 1.0 }, { ai: 1.12, react: 0.75, steal: 1.25 }];
const D = () => DIFF[S.diff];
const isUser = p => !AUTO && p === ctrl;
const basketX = team => S.attack[team] * BASKET_X;
const distB = (p, team = p.team) => hyp(p.pos.x - basketX(team), p.pos.z);
const fwd = p => new THREE.Vector3(Math.sin(p.facing), 0, Math.cos(p.facing));
const opp = p => teams[1 - p.team];
const inFront = (team, x) => x * S.attack[team] > 0.05;
const inKey = (x, z, side) => Math.abs(z) < KEY_HALF && x * side > FT_X;
const tag = p => `#${p.num} ${POS_NAMES[p.role]}`;
function nearestOpp(p) { let best = null, bd = 1e9; for (const q of opp(p)) { const d = hyp(q.pos.x - p.pos.x, q.pos.z - p.pos.z); if (d < bd) { bd = d; best = q; } } return [best, bd]; }
function isThreeSpot(x, z, team) {
  const bx = basketX(team), s = S.attack[team];
  const cornerX = BASKET_X - Math.sqrt(THREE_R ** 2 - THREE_SIDE ** 2);
  if (x * s > cornerX) return Math.abs(z) > THREE_SIDE + 0.03;
  return hyp(x - bx, z) > THREE_R + 0.03;
}

// ================= HUD / 訊息 =================
// 播報：只有「說出來的話」才有字幕，顯示在畫面最下方；其他文字一律不出現在比賽畫面上
const VOICE = { v: null, busy: false, pri: 0 };
function pickVoice() { try { const vs = speechSynthesis.getVoices(); VOICE.v = vs.find(v => /zh[-_]TW/i.test(v.lang)) || vs.find(v => /zh[-_](HK|Hant)/i.test(v.lang)) || vs.find(v => /^zh/i.test(v.lang)) || null; } catch (e) { } }
if ('speechSynthesis' in window) { pickVoice(); speechSynthesis.onvoiceschanged = pickVoice; }
function speakText(t) { return t.replace(/#(\d+)\s*(PG|SG|SF|PF|C)?/g, '$1號').replace(/（第 (\d+) 犯）/g, '，第 $1 次犯規').replace(/2\+1/g, '二加一').replace(/24 秒/g, '二十四秒').replace(/[　]+/g, '，'); }
function say(text, pri = 1) {
  (window.__log = window.__log || []).push(text);
  if ($('title').classList.contains('show')) return;
  if (VOICE.busy && pri < VOICE.pri) return;
  const t = speakText(text);
  const el = $('sub'); el.textContent = t; el.className = 'show'; clearTimeout(say.t); say.t = setTimeout(() => { if (S.tut && S.tut.text) el.textContent = S.tut.text; else el.className = ''; }, Math.max(1800, t.length * 230));
  if (!SET.voice || muted || !('speechSynthesis' in window)) return;
  try {
    if (VOICE.busy) speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(t); u.lang = 'zh-TW'; if (VOICE.v) u.voice = VOICE.v; u.rate = 1.12; u.pitch = 1.05; u.volume = 1;
    u.onend = u.onerror = () => { VOICE.busy = false; VOICE.pri = 0; };
    VOICE.busy = true; VOICE.pri = pri; speechSynthesis.speak(u);
  } catch (e) { }
}
const msg = (text, cls = '') => say(text, cls === 'big' ? 2 : 1);
const pick = a => a[(Math.random() * a.length) | 0];
function lowerThird(p, extra) {
  // 不再顯示字卡；得分里程碑改由播報說出來
  if (p.st.pts >= 20 && p.st.pts % 10 < 3 && !p['said' + Math.floor(p.st.pts / 10)]) { p['said' + Math.floor(p.st.pts / 10)] = 1; setTimeout(() => say(`${p.num}號本場已經拿下 ${p.st.pts} 分`, 0), 1800); }
  return;
  const el = $('l3'); const s = p.st;
  el.innerHTML = `<b class="c${p.team}">${tag(p)}</b> ${extra ? extra + '　' : ''}本場 <b>${s.pts}</b> 分 ${s.reb} 籃板 ${s.ast} 助攻`;
  el.className = 'show'; clearTimeout(lowerThird.t); lowerThird.t = setTimeout(() => el.className = '', 2600);
}
function pbp(text) {
  return;
  const el = $('pbp'); el.textContent = `${text}　${TEAM_INFO[0].name} ${S.score[0]}:${S.score[1]} ${TEAM_INFO[1].name}`;
  el.className = 'show'; clearTimeout(pbp.t); pbp.t = setTimeout(() => el.className = '', 3600);
}
function fmtClock(t) { t = Math.max(0, t); if (t < 60) return t.toFixed(1); const m = Math.floor(t / 60), s = Math.floor(t % 60); return m + ':' + String(s).padStart(2, '0'); }
const QNAME = q => q <= 4 ? ['第一節', '第二節', '第三節', '第四節'][q - 1] : (q === 5 ? '延長賽' : '延長賽 ' + (q - 4));
function updateHUD() {
  $('s0').textContent = S.score[0]; $('s1').textContent = S.score[1];
  $('qtr').textContent = S.quarter <= 4 ? QNAME(S.quarter).slice(1, 2) + '節' : 'OT' + (S.quarter > 5 ? S.quarter - 4 : '');
  $('qtr').textContent = S.quarter <= 4 ? ['1ST', '2ND', '3RD', '4TH'][S.quarter - 1] : 'OT' + (S.quarter > 5 ? S.quarter - 4 : '');
  $('clk').textContent = fmtClock(S.clock);
  const scOff = S.clock < S.shotClock || ['tipoff', 'break', 'ft', 'intro', 'over'].includes(S.phase);
  $('sc').textContent = scOff ? '' : Math.ceil(Math.max(0, S.shotClock));
  $('sc').className = !scOff && S.shotClock < 5 ? 'warn' : '';
  updateShotClockDisplays(arena.shotClocks, scOff ? null : S.shotClock);
  for (let t = 0; t < 2; t++) {
    $('f' + t).textContent = '犯規 ' + Math.min(S.teamFouls[t], 9);
    $('bn' + t).style.visibility = S.teamFouls[1 - t] >= 5 ? 'visible' : 'hidden';
    $('to' + t).textContent = '●'.repeat(S.timeouts[t]) + '○'.repeat(7 - S.timeouts[t]);
    $('poss' + t).style.visibility = S.poss === t && S.phase !== 'title' ? 'visible' : 'hidden';
  }
  const offense = ball.holder && ball.holder.team === 0 && S.phase !== 'ft';
  const ftUser = S.phase === 'ft' && S.ft && S.ft.shooter === ctrl && !AUTO;
  $('b1').firstChild.textContent = ftUser ? '罰球' : (offense ? '投籃' : '跳');
  $('b1').querySelector('small').textContent = ftUser || offense ? '按住·最高點放開' : (ball.holder ? '封阻' : '搶籃板');
  $('b2').textContent = offense ? '傳球' : '抄截';
  $('b4').textContent = offense ? (ctrl && ctrl.post ? '腳步' : (ctrl && distB(ctrl) < 4.6 && S.fc ? '背打' : '招式')) : '換人';
  $('replayTag').style.display = S.phase === 'replay' ? 'block' : 'none';
  const clutch = S.mode !== 'three' && S.mode !== 'dunk' && S.quarter >= 4 && S.clock <= S.qlen / 4 && Math.abs(S.score[0] - S.score[1]) <= 5 && ['live', 'dead', 'inbound', 'ft'].includes(S.phase);
  if (clutch !== S.clutch) { S.clutch = clutch; sfx.setCrowd(clutch ? 0.17 : 0.09); if (clutch) say('比賽進入關鍵時刻！', 2); }
  if (S.mode === 'three' || S.mode === 'dunk') updateContestHUD();
}

// ================= 輸入 =================
const inp = { x: 0, z: 0, mag: 0, b1: false, b1Down: false, b1Up: false, b2Down: false, b3: false, b4Down: false, idleT: 0, sprintHeld: false };
const keys = {};
addEventListener('keydown', e => { if (e.repeat) return; keys[e.code] = true;
  if (e.code === 'KeyJ' || e.code === 'Space') { inp.b1 = true; inp.b1Down = true; }
  if (e.code === 'KeyK') inp.b2Down = true; if (e.code === 'KeyI' || e.code === 'KeyQ') inp.b4Down = true;
  if (e.code === 'Escape' || e.code === 'KeyP') togglePause(); });
addEventListener('keyup', e => { keys[e.code] = false; if (e.code === 'KeyJ' || e.code === 'Space') { inp.b1 = false; inp.b1Up = true; } });
const joy = { id: null, cx: 0, cy: 0, dx: 0, dy: 0 };
const pad = $('pad');
pad.addEventListener('pointerdown', e => {
  if (S.phase === 'replay' || S.phase === 'intro') { skipCinematic(); return; }
  if (document.body.classList.contains('edit')) return;
  if (e.target !== pad || joy.id !== null || (SET.lefty ? e.clientX < innerWidth * 0.5 : e.clientX > innerWidth * 0.5)) return;
  joy.id = e.pointerId; joy.cx = e.clientX; joy.cy = e.clientY; joy.dx = joy.dy = 0;
  const base = $('joy'); base.style.left = (e.clientX - 60) + 'px'; base.style.top = (e.clientY - 60) + 'px'; base.classList.add('on');
  $('knob').style.transform = 'translate(0px,0px)';
});
addEventListener('pointermove', e => {
  if (e.pointerId !== joy.id) return;
  let dx = e.clientX - joy.cx, dy = e.clientY - joy.cy; const l = hyp(dx, dy), R = 55;
  if (l > R) { dx *= R / l; dy *= R / l; }
  joy.dx = dx / R; joy.dy = dy / R; $('knob').style.transform = `translate(${dx}px,${dy}px)`;
});
const joyEnd = e => { if (e.pointerId !== joy.id) return; joy.id = null; joy.dx = joy.dy = 0; const jb = $('joy'); jb.classList.remove('on'); jb.style.left = ''; jb.style.top = ''; $('knob').style.transform = ''; };
addEventListener('pointerup', joyEnd); addEventListener('pointercancel', joyEnd);
function bindBtn(id, down, up) {
  const el = $(id); let pid = null;
  el.addEventListener('pointerdown', e => { e.preventDefault(); if (S.phase === 'replay' || S.phase === 'intro') { skipCinematic(); return; } pid = e.pointerId; el.setPointerCapture?.(e.pointerId); el.classList.add('pressed'); down(); });
  const end = e => { if (e.pointerId !== pid) return; pid = null; el.classList.remove('pressed'); up && up(); };
  el.addEventListener('pointerup', end); el.addEventListener('pointercancel', end); el.addEventListener('lostpointercapture', end);
}
bindBtn('b1', () => { inp.b1 = true; inp.b1Down = true; }, () => { if (inp.b1) { inp.b1 = false; inp.b1Up = true; } });
bindBtn('b2', () => inp.b2Down = true);
bindBtn('b3', () => inp.b3 = true, () => inp.b3 = false);
bindBtn('b4', () => inp.b4Down = true);
document.addEventListener('contextmenu', e => e.preventDefault());
document.addEventListener('touchmove', e => { if (!e.target.closest('.scrollable')) e.preventDefault(); }, { passive: false });
document.addEventListener('dblclick', e => e.preventDefault());
function readInput(dt) {
  if (params.has('botinput')) { inp.idleT = inp.mag < 0.15 ? inp.idleT + dt : 0; return; }
  let x = joy.dx, z = joy.dy;
  if (keys.KeyA || keys.ArrowLeft) x -= 1; if (keys.KeyD || keys.ArrowRight) x += 1;
  if (keys.KeyW || keys.ArrowUp) z -= 1; if (keys.KeyS || keys.ArrowDown) z += 1;
  const m = hyp(x, z); if (m > 1) { x /= m; z /= m; }
  inp.x = x; inp.z = z; inp.mag = Math.min(1, m);
  inp.sprintHeld = inp.b3 || keys.ShiftLeft || keys.KeyL;
  inp.idleT = inp.mag < 0.15 ? inp.idleT + dt : 0;
}

// ================= 持球位置 =================
function handBall(p) {
  const f = fwd(p), r = new THREE.Vector3(-f.z, 0, f.x).multiplyScalar(p.hand || 1);
  const s = p.scale, out = new THREE.Vector3();
  const pose = p.pose;
  if ((pose === 'dunk' || pose === 'hang' || pose === 'windmill') && p.dunk) {
    const dk = p.dunk, u = clamp(p.actT / dk.tApex, 0, 1);
    const cock = new THREE.Vector3(p.pos.x - f.x * 0.12 * s, 2.3 * s + p.jy + 0.05, p.pos.z - f.z * 0.12 * s);
    const over = dk.rim.clone().addScaledVector(dk.dir, 0.06); over.y = RIM_H + 0.3;
    return u < 0.6 ? cock : cock.lerp(over, (u - 0.6) / 0.4);
  }
  if (pose === 'hook') return new THREE.Vector3(p.pos.x - r.x * (p.hookSide || 1) * 0.3 * s, 2.5 * s + p.jy, p.pos.z - r.z * (p.hookSide || 1) * 0.3 * s);
  if (pose === 'shoot' || pose === 'layup' || pose === 'dunk') {
    out.set(p.pos.x + f.x * 0.2 * s, 2.3 * s + p.jy, p.pos.z + f.z * 0.2 * s);
    if (pose !== 'shoot') out.addScaledVector(r, 0.18 * s).setY(2.44 * s + p.jy);
  } else if (pose === 'behind' && p.moveT > 0) {
    const u = 1 - p.moveT / (p.moveDur || 0.42);
    const sd = (q, lat, fw, y) => new THREE.Vector3(p.pos.x + r.x * lat * s * q + f.x * fw * s, y, p.pos.z + r.z * lat * s * q + f.z * fw * s);
    const a = sd(-1, 0.32, 0.12, 0.8 * s), mid = sd(1, 0, -0.34, BALL_R), b = sd(1, 0.32, 0.22, 0.82 * s);
    if (u < 0.5) out.copy(a).lerp(mid, u / 0.5); else out.copy(mid).lerp(b, (u - 0.5) / 0.5);
    if (u >= 0.5 && !p.crossBounced) { p.crossBounced = true; sfx.dribble(isUser(p) ? 0.9 : 0.5); }
    if (u < 0.5) p.crossBounced = false;
  } else if (pose === 'cross' && p.moveT > 0) {
    // 胯下：從原本那隻手往下，從兩腳中間彈地，再到另一隻手
    const u = 1 - p.moveT / (p.moveDur || 0.42);
    const side = (q, lat, fw, y) => new THREE.Vector3(p.pos.x + r.x * lat * s * q + f.x * fw * s, y, p.pos.z + r.z * lat * s * q + f.z * fw * s);
    const a = side(-1, 0.3, 0.28, 0.8 * s), mid = side(1, 0, 0.02, BALL_R), b = side(1, 0.3, 0.28, 0.82 * s);
    if (u < 0.5) out.copy(a).lerp(mid, u / 0.5); else out.copy(mid).lerp(b, (u - 0.5) / 0.5);
    if (u >= 0.5 && !p.crossBounced) { p.crossBounced = true; sfx.dribble(isUser(p) ? 0.9 : 0.5); }
    if (u < 0.5) p.crossBounced = false;
  } else if (pose === 'dribble' || pose === 'cross' || pose === 'behind' || pose === 'hesi' || pose === 'post') {
    const hand = 0.92 * s; const c = Math.abs(Math.cos(p.dribblePh));
    const side = pose === 'cross' ? 0.05 : 0.3;
    out.set(p.pos.x + r.x * side * s + f.x * 0.3 * s, BALL_R + (hand - BALL_R) * c + p.jy, p.pos.z + r.z * side * s + f.z * 0.3 * s);
  } else if (pose === 'ftset') {
    out.set(p.pos.x + f.x * 0.32 * s, 1.25 * s, p.pos.z + f.z * 0.32 * s);
  } else {
    out.set(p.pos.x + f.x * 0.36 * s, 1.2 * s + p.jy, p.pos.z + f.z * 0.36 * s);
  }
  return out;
}
const chest = p => new THREE.Vector3(p.pos.x, 1.3 * p.scale + p.jy, p.pos.z);

// ================= 球權 =================
function jump(p, v) { if (p.jy > 0.001 || p.jv > 0) return false; p.jv = v * (0.9 + 0.1 * p.sta); p.jy = 0.001; return true; }
function setPoss(team) {
  if (team !== S.poss) { S.shotClock = 24; S.poss = team; S.fc = false; S.bcT = 0; for (const p of players) { p.keyT = 0; p.dkeyT = 0; p.post = null; } S.screen = [null, null]; if (team >= 0) aiCoach(team); }
}
// 電腦教練：每次球權選一套戰術，防守視比分與時間調整
function aiCoach(offTeam) {
  if (offTeam === 1 || AUTO) { const r = Math.random(); S.play[offTeam] = r < 0.4 ? 'motion' : r < 0.7 ? 'pnr' : r < 0.9 ? 'post' : 'three'; }
  const dt = 1 - offTeam;
  if (dt === 1 || AUTO) {
    const old = S.defense[dt];
    const late = S.quarter >= 4 && S.clock < S.qlen * 0.3;
    if (late && S.score[dt] < S.score[offTeam] - 2) S.defense[dt] = 'press';
    else if (Math.random() < 0.25) { const r = Math.random(); S.defense[dt] = r < 0.65 ? 'man' : r < 0.9 ? 'zone' : 'press'; }
    if (old !== S.defense[dt] && dt === 1 && !AUTO) setTimeout(() => msg(`${TEAM_INFO[1].name}改打${DEF_NAMES[S.defense[1]]}`), 900);
  }
}
const DEF_NAMES = { man: '人盯人', zone: '2-3 區域聯防', press: '全場緊迫盯人' };
const PLAY_NAMES = { motion: '自由進攻', pnr: '擋拆', post: '低位單打', three: '三分戰術' };
function giveBall(p, how) {
  if (S.pendingFT) return; // 犯規後的球等罰球
  const changed = p.team !== S.poss, wasShot = ball.state === 'shot' || ball.missed;
  if (wasShot && how === 'rebound' && p.team === 1 && ball.lastTeam === 0 && S.phase === 'live') sfx.groan();
  const passer = ball.pass ? ball.pass.from : null;
  if (wasShot && how === 'rebound' && S.phase === 'live') { if (p.team === ball.lastTeam) { S.stats[p.team].oreb = (S.stats[p.team].oreb || 0) + 1; if (Math.random() < 0.6) say(pick(['進攻籃板！', '搶下進攻籃板，二次進攻！', `${p.num}號 搶到進攻籃板`]), 1); } else if (p.boxing && Math.random() < 0.3) say(pick(['卡位漂亮，籃板到手', '防守籃板']), 1); }
  ball.state = 'held'; ball.holder = p; ball.shot = null; ball.pass = null; ball.lastTeam = p.team; ball.vel.set(0, 0, 0);
  p.holdT = 0; p.decT = rand(0.2, 0.4); p.dribblePh = 0;
  if (how === 'rebound' || (wasShot && how !== 'pass')) {
    S.stats[p.team].reb++; p.st.reb++;
    if (p.team === S.poss && ball.rimTouched) { if (S.shotClock < 14) S.shotClock = 14; }
    else setPoss(p.team);
    S.fc = inFront(p.team, p.pos.x);
  } else setPoss(p.team);
  if (how === 'loose' || how === 'steal') S.fc = inFront(p.team, p.pos.x);
  ball.missed = false; ball.rimTouched = false;
  if (how === 'pass' && passer && passer.team === p.team) {
    S.assist = { passer, to: p, t: S.gameT };
    // 回場違例：球過半場後再傳回後場
    if (S.phase === 'live' && S.fc && !inFront(p.team, p.pos.x)) { violation('回場違例'); return; }
  }
  if (S.phase === 'inbound') { S.phase = 'live'; S.ib = null; if (inFront(p.team, p.pos.x) && S.ibFront) S.fc = true; }
  if (S.phase === 'tipoff') S.phase = 'live';
  if (p.team === 0) ctrl = p;
  else if (changed || !ctrl) ctrl = guardOf(p);
}
function guardOf(handler) { return teams[1 - handler.team][handler.idx]; }

function launch(from, target, apexExtra) {
  const H = Math.max(from.y, target.y) + apexExtra;
  const vy = Math.sqrt(2 * G * (H - from.y)); const t = vy / G + Math.sqrt(2 * (H - target.y) / G);
  return new THREE.Vector3((target.x - from.x) / t, vy, (target.z - from.z) / t);
}

// ================= 投籃 =================
function shotProb(p, d, cd, three, kind) {
  let b;
  if (kind === 'dunk') b = 0.94; else if (kind === 'layup') b = 0.8;
  else if (d < 3) b = 0.58; else if (d < 5) b = 0.5; else if (d < 7.24) b = 0.46; else if (d < 8.6) b = 0.41; else if (d < 10.4) b = 0.16; else b = 0.04;
  if (kind === 'hook') b = (d < 2.5 ? 0.56 : d < 4 ? 0.48 : 0.36) * p.shoot;
  if (kind === 'jump') b *= three ? p.three : p.shoot;
  if (p.openT > 0) cd += 1.0; // 後撤步拉開空間
  const cPen = kind === 'dunk' ? 0.5 : (kind === 'layup' ? 0.7 : 1);
  if (cd < 0.9) b -= 0.18 * cPen; else if (cd < 1.4) b -= 0.08 * cPen; else if (cd < 2.2) b -= 0.03 * cPen;
  b -= (1 - p.sta) * 0.1;
  return b;
}
// 甜蜜點寬度：距離越遠、防守越近、跑動中、體力越低 → 越窄；射手能力越好 → 越寬
function shotWindow(p, d, cd, three, moving) {
  let w = 0.075 * (three ? p.three : p.shoot);
  w *= d < 5 ? 1.15 : d < 7.24 ? 1.0 : d < 8.6 ? 0.85 : 0.55;
  w *= cd < 0.9 ? 0.65 : cd < 1.5 ? 0.82 : 1;
  if (moving) w *= 0.8;
  w *= 0.85 + 0.15 * p.sta;
  return clamp(w, 0.025, 0.09);
}
function startShot(p) {
  if (p.action || p.jy > 0) return;
  const d = distB(p);
  const [, cd] = nearestOpp(p);
  const dirB = new THREE.Vector3(basketX(p.team) - p.pos.x, 0, -p.pos.z).normalize();
  const movingToward = p.vel.dot(dirB) > 1.0;
  if (p.post) {
    const Lp = new THREE.Vector3(-dirB.z, 0, dirB.x);
    const lat = isUser(p) ? inp.x * Lp.x + inp.z * Lp.z : (Math.random() < 0.6 ? (Math.random() < 0.5 ? 1 : -1) : 0);
    p.post = null;
    if (Math.abs(lat) > 0.4) {
      p.action = 'shoot'; p.actT = 0; p.released = false; p.vel.set(0, 0, 0); p.shotKind = 'hook'; p.hookSide = Math.sign(lat); p.fade = false;
      p.facing = Math.atan2(dirB.x, dirB.z) - p.hookSide * 1.2; p.aiRelease = 0.32;
      if (isUser(p)) showShotLabel('勾射', true);
      notifyShot(p); return;
    }
    p.facing = Math.atan2(dirB.x, dirB.z);
    p.action = 'shoot'; p.actT = 0; p.released = false; p.vel.set(0, 0, 0); p.shotKind = 'jump'; p.fade = true; p.aiRelease = 0.43 + rand(-0.05, 0.05) / D().ai;
    if (isUser(p)) showShotLabel('轉身後仰', true);
    notifyShot(p); return;
  }
  const Ld = new THREE.Vector3(-dirB.z, 0, dirB.x);
  const latIn = isUser(p) ? inp.x * Ld.x + inp.z * Ld.z : 0;
  const [nd0] = nearestOpp(p);
  const blocker = nd0 && hyp(nd0.pos.x - p.pos.x, nd0.pos.z - p.pos.z) < 1.5 && (nd0.pos.x - p.pos.x) * dirB.x + (nd0.pos.z - p.pos.z) * dirB.z > 0.3;
  if (d > 2.0 && d < 4.6 && movingToward && hyp(p.vel.x, p.vel.z) > 3 && ((isUser(p) && Math.abs(latIn) > 0.4) || (!isUser(p) && blocker && Math.random() < 0.4))) {
    p.action = 'euro'; p.actT = 0; p.euroSide = isUser(p) ? Math.sign(latIn) : (Math.random() < 0.5 ? 1 : -1);
    if (isUser(p)) showShotLabel('歐洲步', true);
    return;
  }
  if (d < 2.4 || (d < 3.6 && movingToward && hyp(p.vel.x, p.vel.z) > 3)) {
    const dunk = p.dunk && d < 3.0 && p.sta > 0.3 && (isUser(p) ? (inp.sprintHeld || p.role >= 3) : (cd > 1.2 && d < 2.6 && Math.random() < 0.5));
    startLayup(p, dunk);
  } else {
    p.action = 'shoot'; p.actT = 0; p.released = false; p.vel.set(0, 0, 0); p.shotKind = 'jump';
    p.fade = isUser(p) ? (inp.mag > 0.5 && inp.x * dirB.x + inp.z * dirB.z < -0.5) : (cd < 1.2 && Math.random() < 0.35);
    p.aiRelease = 0.43 + rand(-0.06, 0.06) / D().ai;
    p.facing = Math.atan2(basketX(p.team) - p.pos.x, -p.pos.z);
    if (isUser(p)) { // 依當下距離與防守算出甜蜜點，顯示在力道條上
      p.win = shotWindow(p, d, cd, isThreeSpot(p.pos.x, p.pos.z, p.team), hyp(p.vel.x, p.vel.z) > 2);
      const z = document.querySelector('#meter .zone'); z.style.bottom = ((0.91 - p.win) * 100) + '%'; z.style.height = (p.win * 200) + '%';
    }
    notifyShot(p);
  }
}
function startLayup(p, dunk) {
  const bx = basketX(p.team);
  const dir = new THREE.Vector3(p.pos.x - bx, 0, p.pos.z); if (dir.lengthSq() < 0.01) dir.set(-S.attack[p.team], 0, 0); dir.normalize();
  if (dir.x * S.attack[p.team] > -0.15) { dir.x = -S.attack[p.team] * 0.4; dir.normalize(); }
  let tgt = new THREE.Vector3(bx + dir.x * (dunk ? 0.36 : 0.95), 0, dir.z * (dunk ? 0.36 : 0.95));
  p.reverse = false;
  if (!dunk && isUser(p) && inp.mag > 0.5 && Math.abs(p.pos.x) > HX - 3.2 && Math.sign(inp.z) === -Math.sign(p.pos.z) && Math.abs(p.pos.z) > 0.6) {
    // 反手上籃：從籃框下穿到另一側，用籃框擋住防守者
    p.reverse = true; tutEv('reverse'); tgt = new THREE.Vector3(bx - S.attack[p.team] * 0.75, 0, -Math.sign(p.pos.z) * 0.85);
    setTimeout(() => say('反手上籃！', 1), 300);
  }
  const v = dunk ? 5.0 : 3.9; const tApex = v / G;
  if (!jump(p, v)) return;
  p.action = dunk ? 'dunk' : 'layup'; p.actT = 0; p.released = false; p.shotKind = dunk ? 'dunk' : 'layup';
  if (dunk) { p.dunk = { style: p.forceStyle || (Math.random() < 0.5 ? 'one' : 'two'), tApex, dir: dir.clone(), rim: new THREE.Vector3(bx, RIM_H, 0), spin: 0 }; p.forceStyle = null; p.dunkBall = handBall(p); }
  const hv = new THREE.Vector3(tgt.x - p.pos.x, 0, tgt.z - p.pos.z).divideScalar(tApex);
  if (hv.length() > 7) hv.setLength(7);
  p.vel.copy(hv);
  p.facing = Math.atan2(bx - p.pos.x, -p.pos.z);
  notifyShot(p);
}
function notifyShot(shooter) {
  for (const q of opp(shooter)) {
    if (isUser(q)) continue;
    const d = hyp(q.pos.x - shooter.pos.x, q.pos.z - shooter.pos.z);
    if (d < 2.4) q.contestT = rand(0.08, 0.24) * D().react * (shooter.shotKind === 'jump' ? 1 : 0.6);
  }
}
function releaseShot(p, timing) {
  p.released = true;
  const kind = p.shotKind;
  const bx = basketX(p.team);
  const from = kind !== 'dunk' && p.visBall && p.visT === renderTick ? p.visBall.clone() : handBall(p);
  const d = hyp(p.pos.x - bx, p.pos.z);
  const three = kind === 'jump' && isThreeSpot(p.pos.x, p.pos.z, p.team);
  const [nd, cd] = nearestOpp(p);
  let prob = shotProb(p, d, kind === 'hook' ? cd * 1.6 : (p.clutch ? cd * 1.5 : cd), three, kind);
  let label = '';
  if (kind === 'jump') {
    if (timing != null) {
      const win = p.win || 0.07, err = timing - 0.91; p.timingErr = err;
      if (Math.abs(err) <= win) { // 甜蜜點：空檔幾乎必進，被貼身才可能不進
        p.shotGrade = 'perfect'; tutEv('perfect'); prob = cd < 0.9 ? 0.72 : cd < 1.5 ? 0.88 : 0.97; if (d > 8.6) prob *= 0.8; meterFlash('perfect');
      } else if (Math.abs(err) <= win * 2.3) { p.shotGrade = 'good'; prob += 0.05; meterFlash('good'); }
      else { p.shotGrade = 'bad'; prob *= 0.45; meterFlash('bad'); }
    } else { p.shotGrade = null; p.timingErr = 0; prob += (D().ai - 1) * 0.6 + rand(-0.03, 0.03); }
    if (hyp(p.vel.x, p.vel.z) > 2 && !p.fade && p.shotGrade !== 'perfect') prob -= 0.05;
    if (p.fade) { prob += cd < 1.4 ? 0.06 : -0.04; if (isUser(p) && !label) label = '後仰跳投'; }
  } else if (p.team === 1) prob += (D().ai - 1) * 0.4;
  // 投籃犯規：防守者貼身封阻或伸手
  let fouled = false;
  if (nd && !p.fade && cd < 0.85 && (nd.jy > 0.05 || nd.action === 'contest' || nd.action === 'steal' || nd.action === 'block')) {
    const fc = (kind === 'jump' ? 0.22 : 0.34) * (cd < 0.6 ? 1.3 : 1);
    if (Math.random() < fc) { fouled = true; prob -= 0.12; }
  }
  prob = clamp(prob, 0.02, p.shotGrade === 'perfect' ? 0.97 : 0.95);
  if (kind === 'layup' && p.clutch) prob = clamp(prob - 0.04, 0.05, 0.9);
  let make = Math.random() < prob;
  if (p.forceMake != null) { make = p.forceMake; p.forceMake = null; }
  (window.__shots = window.__shots || []).push({ k: kind, d: +d.toFixed(1), cd: +cd.toFixed(1), p: +prob.toFixed(2), make, team: p.team, res: null }); ball.shotRec = window.__shots[window.__shots.length - 1];
  const rimC = new THREE.Vector3(bx, RIM_H, 0);
  const tgt = rimC.clone();
  const toShooter = new THREE.Vector3(p.pos.x - bx, 0, p.pos.z).normalize();
  if (make) { tgt.x += rand(-0.03, 0.03); tgt.z += rand(-0.03, 0.03); }
  else if (kind === 'jump' && p.shotGrade && p.shotGrade !== 'perfect') {
    // 出手太早 → 偏短打前框；太晚 → 偏長打後框或籃板
    const m = rand(0.2, 0.3) + (d > 9 ? rand(0, 0.5) : 0);
    tgt.addScaledVector(toShooter, p.timingErr < 0 ? m : -m);
    tgt.add(new THREE.Vector3(-toShooter.z, 0, toShooter.x).multiplyScalar(rand(-0.06, 0.06)));
  }
  else if (kind === 'jump' && p.shotGrade === 'perfect') {
    // 甜蜜點但被干擾：在籃框上滾出（左右偏一點）
    tgt.add(new THREE.Vector3(-toShooter.z, 0, toShooter.x).multiplyScalar(rand(0.17, 0.22) * (Math.random() < 0.5 ? 1 : -1)));
  }
  else {
    const r = Math.random(), m = rand(0.19, 0.3) + (d > 9 ? rand(0, 0.8) : 0);
    if (r < 0.45) tgt.addScaledVector(toShooter, m);
    else if (r < 0.8) tgt.addScaledVector(toShooter, -m);
    else tgt.add(new THREE.Vector3(-toShooter.z, 0, toShooter.x).multiplyScalar(m * (Math.random() < 0.5 ? 1 : -1)));
  }
  S.stats[p.team].fga++; p.st.fga++; if (three) { S.stats[p.team].tpa++; p.st.tpa++; }
  ball.hRec = { team: p.team, num: p.num, dep: HX - p.pos.x * S.attack[p.team], v: p.pos.z * S.attack[p.team], three, made: false }; (S.shots = S.shots || []).push(ball.hRec);
  ball.state = 'shot'; ball.holder = null; ball.lastTeam = p.team; ball.rimTouched = false; ball.missed = false;
  ball.shot = { team: p.team, shooter: p, three, t: 0, tried: new Set(), kind, buzzer: S.clock < 1.2 };
  p.clutchShot = !!p.clutch;
  for (const q of players) q.keyT = 0;
  ball.pos.copy(from);
  if (kind === 'dunk') {
    const hand = p.visBall && p.visT === renderTick ? p.visBall.clone() : handBall(p);
    // 手要在籃框上方、離框心不超過 0.42 公尺，球才砸得進
    hand.y = Math.max(hand.y, RIM_H + 0.18);
    const hv = new THREE.Vector3(hand.x - bx, 0, hand.z); if (hv.length() > 0.12) hv.setLength(0.12);
    hand.set(bx + hv.x, hand.y, hv.z);
    const aim = rimC.clone().addScaledVector(toShooter, make ? 0.0 : 0.3); aim.y = RIM_H - 0.3;
    ball.pos.copy(hand); ball.vel.copy(aim.sub(hand).normalize().multiplyScalar(make ? 6.5 : 5.0));
    if (make) say(p.dunk ? pick([DUNKS[p.dunk.style][0] + '！', '一記' + DUNKS[p.dunk.style][0] + '！']) : '灌籃！', 2); sfx.rim(1); sfx.board(1); if (make) sfx.cheer(1);
    arena.crowdUniforms.uCheer.value = 1;
    rimFlex[toShooter.x * 0 + (bx > 0 ? 1 : 0)] = 0.5; S.slowmo = 0.5; S.shake = 0.35;
    // 手在籃框附近才掛框，位置用 0.12 秒平滑移過去（不瞬移）
    if (make && hand.distanceTo(rimC) < 0.6) { p.action = 'hang'; p.actT = 0; p.hangT = 0.55; p.hangFrom = { x: p.pos.x, z: p.pos.z, y: p.jy }; p.hangTo = { x: bx + toShooter.x * 0.34, z: toShooter.z * 0.34, y: Math.max(0.3, RIM_H + 0.02 - 2.44 * p.scale) }; p.vel.set(0, 0, 0); p.jv = 0; p.facing = Math.atan2(-toShooter.x, -toShooter.z); }
  } else if (kind === 'layup') ball.vel.copy(launch(from, tgt, 0.45));
  else if (kind === 'hook') ball.vel.copy(launch(from, tgt, 0.85));
  else ball.vel.copy(launch(from, tgt, 1.0 + 0.12 * d));
  p.noGrabT = 0.5;
  if (label && isUser(p)) showShotLabel(label, label === '完美出手');
  if (fouled) callFoul(nd, p, 'shoot', three ? 3 : 2);
}
function showShotLabel() { } // 不在畫面上顯示文字
function meterFlash(kind) { S.meterHold = 0.55; const m = $('meter'); m.dataset.r = kind; m.classList.add('flash'); clearTimeout(meterFlash.t); meterFlash.t = setTimeout(() => m.classList.remove('flash'), 550); }

// ================= 傳球、抄截、招式 =================
function passTarget(p, dir) {
  let best = null, bs = 1e9;
  for (const t of teams[p.team]) {
    if (t === p) continue;
    const dx = t.pos.x - p.pos.x, dz = t.pos.z - p.pos.z, d = hyp(dx, dz);
    let s = d * 0.05;
    if (dir) { const a = Math.acos(clamp((dx * dir.x + dz * dir.z) / (d || 1), -1, 1)); s += a * 2.2; }
    if (s < bs) { bs = s; best = t; }
  }
  return best;
}
function doPass(p, to, speed = 12.5) {
  if (!to) return;
  const scr = S.screen[to.team];
  const rolling = to.cutting > 0 || (scr && scr.screener === to && scr.stage === 'roll');
  if (S.phase === 'live' && to.dunk && to.sta > 0.3 && rolling && distB(to) < 4.4 && distB(p) > 3.5 && nearestOpp(to)[1] > 1.2 && !to.jy && (isUser(p) ? inp.sprintHeld : Math.random() < 0.2)) return lobPass(p, to);
  const from = handBall(p); from.y = Math.max(from.y, 1.15 * p.scale);
  let tgt = chest(to); const d = from.distanceTo(tgt);
  let T = clamp(d / speed, 0.15, 1.3);
  tgt.addScaledVector(to.vel, T * (to.cutting > 0 ? 1.05 : 0.85)); tgt.y = 1.25 * to.scale;
  const v = tgt.clone().sub(from).divideScalar(T); v.y += 0.5 * G * T;
  ball.state = 'pass'; ball.holder = null; ball.pos.copy(from); ball.vel.copy(v); ball.lastTeam = p.team;
  ball.pass = { from: p, to, t: 0, T, tried: new Set() };
  p.action = 'pass'; p.actT = 0; p.noGrabT = 0.3;
  p.facing = Math.atan2(to.pos.x - p.pos.x, to.pos.z - p.pos.z);
}
function lobPass(p, to) {
  const bx = basketX(to.team);
  const dir = new THREE.Vector3(to.pos.x - bx, 0, to.pos.z); if (dir.x * S.attack[to.team] > -0.2) dir.x = -S.attack[to.team]; dir.normalize();
  const from = handBall(p); from.y = Math.max(from.y, 2.0 * p.scale);
  const tgt = new THREE.Vector3(bx + dir.x * 0.5, RIM_H + 0.55, dir.z * 0.5);
  const T = clamp(from.distanceTo(tgt) / 9, 0.75, 1.15);
  const v = tgt.clone().sub(from).divideScalar(T); v.y += 0.5 * G * T;
  ball.state = 'pass'; ball.holder = null; ball.pos.copy(from); ball.vel.copy(v); ball.lastTeam = p.team;
  ball.pass = { from: p, to, t: 0, T, tried: new Set(), lob: true };
  to.oop = { t: 0, T, spot: new THREE.Vector3(bx + dir.x * 0.75, 0, dir.z * 0.75), dir };
  p.action = 'pass'; p.actT = 0; p.noGrabT = 0.4;
  if (p.team === 0) showShotLabel('空中接力！', true);
}
function oopCatch(t) {
  const oop = t.oop; t.oop = null;
  giveBall(t, 'pass');
  t.action = 'dunk'; t.shotKind = 'dunk'; t.released = false; t.actT = 1;
  t.dunk = { style: 'two', tApex: 0.4, dir: oop.dir, rim: new THREE.Vector3(basketX(t.team), RIM_H, 0) };
  msg('空中接力！', 'big');
}
function doSteal(p) {
  if (p.stealCD > 0 || p.jy > 0 || p.action) return;
  p.stealCD = 0.9; p.action = 'steal'; p.actT = 0;
  const h = ball.holder;
  if (!h || h.team === p.team || S.phase !== 'live') return;
  const dx = h.pos.x - p.pos.x, dz = h.pos.z - p.pos.z, d = hyp(dx, dz);
  if (d > 1.55) { p.slowT = 0.35; return; }
  p.facing = Math.atan2(dx, dz);
  if (h.jy > 0.05 || h.action === 'shoot') { if (Math.random() < 0.35) callFoul(p, h, 'shoot', isThreeSpot(h.pos.x, h.pos.z, h.team) ? 3 : 2, true); else p.slowT = 0.5; return; }
  const behind = fwd(h).dot(new THREE.Vector3(-dx, 0, -dz).normalize()) < -0.3;
  let ch = 0.24 * p.def / h.handle * (p.team === 1 ? D().steal : 1);
  if (h.pose === 'hold') ch *= 0.6;
  if (Math.random() < ch) {
    S.stats[p.team].stl++; p.st.stl++; S.stats[h.team].tov++; h.st.tov++;
    msg('抄截！'); sfx.steal(); sfx.oh(); if (p.team === 0) buzz(35);
    h.slowT = 0.4; h.noGrabT = 0.4;
    if (Math.random() < 0.55) giveBall(p, 'steal');
    else { ball.state = 'loose'; ball.holder = null; ball.lastTeam = p.team; ball.pos.copy(handBall(h)); ball.vel.set(-dx / d * 2.4 + rand(-1, 1), 1.8, -dz / d * 2.4 + rand(-1, 1)); p.noGrabT = 0.1; }
  } else {
    p.slowT = 0.45;
    // 伸手犯規（從背後更容易被吹）
    if (Math.random() < (behind ? 0.35 : 0.15)) callFoul(p, h, 'reach');
  }
}
function enterPost(p) {
  if (p.action || p.jy > 0) return;
  p.post = { t: 0, dur: rand(1.0, 2.6), away: 0 };
  if (isUser(p)) showShotLabel('背打', true);
}
function dreamShake(p) {
  if (p.action || p.jy > 0) return;
  p.action = 'dream'; p.actT = 0; p.post = null; p.dreamSide = Math.random() < 0.5 ? 1 : -1;
  if (isUser(p)) showShotLabel('夢幻腳步', true);
  const g = guardOf(p);
  if (g && hyp(g.pos.x - p.pos.x, g.pos.z - p.pos.z) < 2 && Math.random() < 0.42 * p.handle / g.def + 0.12) { g.slowT = 0.95; if (Math.random() < 0.3) { msg('夢幻腳步！', 'big'); sfx.oh(); } }
}
function doMove(p, kind, side) {
  if (p.moveCD > 0 || p.jy > 0 || p.action || ball.holder !== p) return;
  p.moveCD = 1.0;
  const B = new THREE.Vector3(basketX(p.team) - p.pos.x, 0, -p.pos.z).normalize();
  const L = new THREE.Vector3(-B.z, 0, B.x);
  if (!kind) {
    if (inp.mag < 0.3) kind = 'spin';
    else {
      const along = inp.x * B.x + inp.z * B.z, lat = inp.x * L.x + inp.z * L.z; side = Math.sign(lat) || 1;
      if (along < -0.3 && Math.abs(lat) > 0.4) kind = 'behind';
      else if (along < -0.5) kind = 'stepback';
      else if (Math.abs(lat) > 0.45) kind = 'cross';
      else if (along > 0.6) kind = 'hesi';
      else kind = 'spin';
    }
  }
  side = side || (Math.random() < 0.5 ? 1 : -1);
  // 靠近邊線時往場內做
  { const test = p.pos.clone().addScaledVector(L, side * 2.2); if (Math.abs(test.z) > HZ - 0.4 || Math.abs(test.x) > HX - 0.4) side = -side; }
  if (kind === 'cross') { p.hand = -p.hand; p.moveT = p.moveDur = 0.42; p.moveVel.copy(L).multiplyScalar(side * 5.2).addScaledVector(B, 1.2); p.moveKind = 'cross'; if (isUser(p)) showShotLabel('胯下運球', true); }
  else if (kind === 'behind') { p.hand = -p.hand; p.moveT = p.moveDur = 0.42; p.moveVel.copy(L).multiplyScalar(side * 5.0).addScaledVector(B, 1.0); p.moveKind = 'behind'; if (isUser(p)) showShotLabel('背後運球', true); }
  else if (kind === 'hesi') { p.moveT = p.moveDur = 0.55; p.moveB = B.clone(); p.moveVel.copy(B).multiplyScalar(0.8); p.moveKind = 'hesi'; if (isUser(p)) showShotLabel('猶豫步', true); }
  else if (kind === 'spin') { if (isUser(p)) showShotLabel('轉身', true); p.moveT = p.moveDur = 0.45; p.moveVel.copy(L).multiplyScalar(side * 3.4).addScaledVector(B, 3.0); p.moveKind = 'spin'; p.spinDir = side; }
  else { if (isUser(p)) showShotLabel('後撤步', true); p.moveT = p.moveDur = 0.32; p.moveVel.copy(B).multiplyScalar(-4.2); p.moveKind = 'stepback'; p.openT = 0.9; if (S.fc && Math.abs(p.pos.x) < 2.2) p.moveVel.multiplyScalar(0.2); }
  if (isUser(p)) tutEv('move');
  const g = guardOf(p);
  if (g && hyp(g.pos.x - p.pos.x, g.pos.z - p.pos.z) < 1.9) {
    const ch = 0.34 * p.handle / g.def * (kind === 'stepback' ? 0.6 : (kind === 'hesi' ? 0.8 : 1)) * (isUser(g) ? 0.8 : 1);
    if (Math.random() < ch) { g.slowT = 0.8; if (Math.random() < 0.25) { g.slowT = 1.4; msg('晃倒了！', 'big'); sfx.oh(); } else if (isUser(p)) showShotLabel('晃開了', true); }
    else if (Math.random() < 0.07 && hyp(g.pos.x - p.pos.x, g.pos.z - p.pos.z) < 1.2) { S.stats[g.team].stl++; g.st.stl++; S.stats[p.team].tov++; p.st.tov++; msg('抄截！'); giveBall(g, 'steal'); }
  }
}

// ================= 犯規與罰球 =================
function callFoul(def, off, kind, nShots, andMaybe) {
  if (S.phase !== 'live') return;
  sfx.whistle();
  def.st.pf++; S.stats[def.team].pf++;
  const offensive = kind === 'charge';
  if (!offensive) S.teamFouls[def.team]++;
  const pfTxt = `（第 ${def.st.pf} 犯）`;
  if (def.st.pf >= 6) setTimeout(() => msg(`${tag(def)} 6 犯離場`), 1500);
  pbp(`${TEAM_INFO[def.team].name} ${tag(def)} 犯規${pfTxt}`); if (def.team === 0) buzz(20);
  if (kind === 'shoot') {
    msg(`投籃犯規 ${tag(def)}${pfTxt}`);
    if (ball.state === 'shot') S.pendingFT = { shooter: off, n: nShots };
    else { // 出手前就被打到
      S.pendingFT = null;
      deadBall({ ft: true, shooter: off, n: nShots }, 1.3);
    }
  } else if (kind === 'charge') {
    msg(`進攻犯規 ${tag(def)}${pfTxt}`); S.stats[def.team].tov++; def.st.tov++;
    deadBall({ team: 1 - def.team, kind: 'side', x: clamp(def.pos.x, -12, 12), z: (def.pos.z < 0 ? -1 : 1) * (HZ + 0.45) }, 1.4);
  } else {
    const bonus = S.teamFouls[def.team] >= 5;
    msg(`${kind === 'reach' ? '打手犯規' : '阻擋犯規'} ${tag(def)}${pfTxt}${bonus ? '　加罰' : ''}`);
    if (bonus) deadBall({ ft: true, shooter: off, n: 2 }, 1.3);
    else {
      if (S.shotClock < 14 && inFront(off.team, off.pos.x)) S.shotClock = 14;
      deadBall({ team: off.team, kind: 'side', x: clamp(off.pos.x, -12, 12), z: (off.pos.z < 0 ? -1 : 1) * (HZ + 0.45), keepClock: true }, 1.3);
    }
  }
}
function violation(text) {
  sfx.whistle(); msg(text); setTimeout(() => pbp(`${S.poss >= 0 ? TEAM_INFO[S.poss].name : ''} ${text}`), 10);
  const t = S.poss; if (t >= 0) S.stats[t].tov++;
  const bp = ball.holder ? ball.holder.pos : ball.pos;
  if (ball.holder) ball.holder.st.tov++;
  deadBall({ team: 1 - t, kind: 'side', x: clamp(bp.x, -12, 12), z: (bp.z < 0 ? -1 : 1) * (HZ + 0.45) }, 1.3);
}
function startFT(shooter, n, keep) {
  S.phase = 'ft'; S.pendingFT = null;
  const team = shooter.team, s = S.attack[team];
  S.ft = { shooter, n, k: 0, t: 0, stage: 'setup', team, keep: !!keep };
  S.poss = team; ball.state = 'dead'; ball.holder = null; ball.shot = null; ball.vel.set(0, 0, 0);
  ball.pos.set(s * (FT_X - 0.6), BALL_R, 0.4);
  const laneZ = KEY_HALF + 0.42;
  const spot = (u, z) => new THREE.Vector3(s * (HX - u), 0, z);
  const off = teams[team].filter(p => p !== shooter).sort((a, b) => b.role - a.role);
  const def = teams[1 - team].slice().sort((a, b) => b.role - a.role);
  // NBA 罰球站位：靠籃框第一格給防守方，再來是進攻方
  if (!keep) {
    def[0].ftSpot = spot(2.75, laneZ); def[1].ftSpot = spot(2.75, -laneZ); def[2].ftSpot = spot(4.75, laneZ);
    off[0].ftSpot = spot(3.75, -laneZ); off[1].ftSpot = spot(3.75, laneZ);
  } else { def[0].ftSpot = spot(9.5, 4); def[1].ftSpot = spot(9.5, -4); def[2].ftSpot = spot(10, 1); off[0].ftSpot = spot(9.8, -2.5); off[1].ftSpot = spot(9.8, 2.5); }
  def[3].ftSpot = spot(10.2, -3.2); def[4].ftSpot = spot(11.5, 2.4);
  off[2].ftSpot = spot(10.0, 4.6); off[3].ftSpot = spot(11.2, -4.4);
  shooter.ftSpot = new THREE.Vector3(s * (FT_X - 0.35), 0, 0);
  if (team === 0) ctrl = shooter; else ctrl = teams[0].slice().sort((a, b) => b.role - a.role)[0];
  msg(`${tag(shooter)} 罰球 ${n} 次`);
}
function updateFT(dt) {
  const ft = S.ft; ft.t += dt;
  const sh = ft.shooter;
  if (ft.stage === 'setup') {
    const ready = players.every(p => !p.ftSpot || hyp(p.pos.x - p.ftSpot.x, p.pos.z - p.ftSpot.z) < 0.35);
    if ((ready && ft.t > 1.2) || ft.t > 3.5) {
      sh.pos.copy(sh.ftSpot); sh.vel.set(0, 0, 0);
      ball.state = 'held'; ball.holder = sh; ft.stage = 'aim'; ft.t = 0; ft.aiT = rand(1.0, 1.7);
    }
  } else if (ft.stage === 'aim') {
    sh.facing = Math.atan2(basketX(sh.team) - sh.pos.x, -sh.pos.z);
    if (isUser(sh)) {
      if (inp.b1Down && !sh.action) { sh.action = 'ftshoot'; sh.actT = 0; const z = document.querySelector('#meter .zone'); z.style.bottom = '84%'; z.style.height = '14%'; }
      if (sh.action === 'ftshoot' && (inp.b1Up || sh.actT > 0.75)) releaseFT(sh.actT / 0.6);
    } else if (ft.t > ft.aiT) { if (!sh.action) { sh.action = 'ftshoot'; sh.actT = 0; } else if (sh.actT > 0.52) releaseFT(null); }
  } else if (ft.stage === 'flight') {
    const done = ft.made || (ball.state === 'shot' && ball.missed && ball.pos.y < 2.2) || ball.state === 'loose' || ball.pos.y < 0.5;
    if (done) { ft.stage = 'between'; ft.t = 0; }
  } else if (ft.stage === 'between') {
    if (ft.t > 1.1) { ft.k++; ft.made = false; sh.pos.copy(sh.ftSpot); ball.state = 'held'; ball.holder = sh; ft.stage = 'aim'; ft.t = 0; ft.aiT = rand(0.9, 1.5); }
  }
}
function releaseFT(timing) {
  const ft = S.ft, sh = ft.shooter;
  sh.action = 'follow'; sh.actT = 0; sh.released = true;
  let prob = 0.77 * sh.ft * (0.92 + 0.08 * sh.sta);
  if (timing != null) {
    if (timing >= 0.84 && timing <= 0.98) { prob = 0.97; meterFlash('perfect'); }
    else if (timing >= 0.7 && timing <= 1.08) meterFlash('good');
    else { prob -= 0.3; meterFlash('bad'); }
  } else prob += (D().ai - 1) * 0.5;
  const make = Math.random() < clamp(prob, 0.05, 0.97);
  const bx = basketX(sh.team);
  const from = handBall(sh); from.y = 2.25 * sh.scale;
  const tgt = new THREE.Vector3(bx, RIM_H, 0);
  const toS = new THREE.Vector3(sh.pos.x - bx, 0, sh.pos.z).normalize();
  if (make) { tgt.x += rand(-0.02, 0.02); tgt.z += rand(-0.02, 0.02); } else tgt.addScaledVector(toS, (Math.random() < 0.5 ? 1 : -1) * rand(0.2, 0.28));
  ball.state = 'shot'; ball.holder = null; ball.lastTeam = sh.team; ball.rimTouched = false; ball.missed = false;
  ball.shot = { team: sh.team, shooter: sh, three: false, t: 0, tried: new Set(), kind: 'ft' };
  ball.pos.copy(from); ball.vel.copy(launch(from, tgt, 1.25));
  S.stats[sh.team].fta++; sh.st.fta++;
  const last = ft.k >= ft.n - 1;
  if (last && !ft.keep) { S.phase = 'live'; S.ft = null; for (const p of players) p.ftSpot = null; sh.noGrabT = 0.8; }
  else ft.stage = 'flight';
}

// ================= 球物理 =================
const tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3();
function collideRims() {
  for (const s of [-1, 1]) {
    const cx = s * BASKET_X;
    const dx = ball.pos.x - cx, dz = ball.pos.z, hd = hyp(dx, dz);
    if (hd > 1e-5 && Math.abs(ball.pos.y - RIM_H) < 0.3) {
      tmp.set(cx + dx / hd * RIM_R, RIM_H, dz / hd * RIM_R);
      tmp2.copy(ball.pos).sub(tmp); const dist = tmp2.length(), minD = BALL_R + 0.011;
      if (dist < minD) {
        tmp2.divideScalar(dist); ball.pos.copy(tmp).addScaledVector(tmp2, minD);
        const vn = ball.vel.dot(tmp2);
        if (vn < 0) { ball.vel.addScaledVector(tmp2, -(1.55) * vn); ball.vel.multiplyScalar(0.9); if (ball.rimT <= 0) { sfx.rim(clamp(-vn / 4, 0.2, 1)); ball.rimT = 0.12; } }
        ball.rimTouched = true; if (ball.state === 'shot') ball.missed = true;
      }
    }
    const x0 = s > 0 ? BOARD_X : -BOARD_X - 0.03, x1 = x0 + 0.03;
    tmp.set(clamp(ball.pos.x, x0, x1), clamp(ball.pos.y, BOARD_BOTTOM, BOARD_BOTTOM + BOARD_H), clamp(ball.pos.z, -BOARD_W / 2, BOARD_W / 2));
    tmp2.copy(ball.pos).sub(tmp); const bd = tmp2.length();
    if (bd < BALL_R) {
      if (bd < 1e-5) tmp2.set(-s, 0, 0); else tmp2.divideScalar(bd);
      ball.pos.copy(tmp).addScaledVector(tmp2, BALL_R);
      const vn = ball.vel.dot(tmp2);
      if (vn < 0) { ball.vel.addScaledVector(tmp2, -1.6 * vn); ball.vel.multiplyScalar(0.92); if (ball.boardT <= 0) { sfx.board(clamp(-vn / 5, 0.2, 1)); ball.boardT = 0.12; } }
      if (ball.state === 'shot') ball.missed = true;
    }
    if (Math.abs(ball.pos.z) < 0.25 && s * ball.pos.x > BOARD_X && s * ball.pos.x < HX + 2.9 && Math.abs(ball.pos.y - (BOARD_BOTTOM + BOARD_H / 2 + 0.1)) < 0.22) { ball.vel.y = -Math.abs(ball.vel.y) * 0.5; }
    if (hd < RIM_R && ball.pos.y < RIM_H - 0.05 && ball.pos.y > RIM_H - 0.5) {
      if (ball.vel.y < -2.0) ball.vel.y += (-2.0 - ball.vel.y) * 0.35;
      ball.vel.x *= 0.9; ball.vel.z *= 0.9;
      ball.vel.x += (cx - ball.pos.x) * 0.15; ball.vel.z += (-ball.pos.z) * 0.15;
    }
  }
}
const rimFlex = [0, 0];
const nets = arena.hoops.map((h, i) => ({ net: h.net, t: 0, s: i ? 1 : -1 }));
function stepBall(dt) {
  ball.rimT -= dt; ball.boardT -= dt;
  if (ball.state === 'held') {
    const h = ball.holder;
    const np = handBall(h);
    if (h.pose === 'dribble' || h.pose === 'cross') {
      const c = Math.cos(h.dribblePh); if (Math.sign(c) !== Math.sign(h.lastCos || 1) && S.phase !== 'title') sfx.dribble(h === ctrl ? 0.8 : 0.4); h.lastCos = c;
    }
    ball.pos.lerp(np, h.pose === 'dribble' || h.pose === 'cross' ? 1 : Math.min(1, dt * 18));
    return;
  }
  if (ball.state === 'toss' && ball.pos.y < 1.75 && ball.vel.y < 0) { ball.vel.set(0, 0, 0); return; }
  const n = 4, h = dt / n;
  for (let i = 0; i < n; i++) {
    ball.prevY = ball.pos.y;
    ball.vel.y -= G * h;
    ball.pos.addScaledVector(ball.vel, h);
    collideRims();
    if (ball.prevY >= RIM_H && ball.pos.y < RIM_H && ball.vel.y < 0) {
      for (const s of [-1, 1]) if (hyp(ball.pos.x - s * BASKET_X, ball.pos.z) < RIM_R - 0.035) scored(s);
    }
    if (ball.pos.y < BALL_R) {
      ball.pos.y = BALL_R;
      if (ball.vel.y < -0.6) sfx.bounce(clamp(-ball.vel.y / 6, 0.1, 0.8));
      ball.vel.y = -ball.vel.y * 0.76; ball.vel.x *= 0.88; ball.vel.z *= 0.88;
      if (Math.abs(ball.vel.y) < 0.4) ball.vel.y = 0;
      if (ball.state === 'shot') { ball.missed = true; ball.state = 'loose'; }
      if (ball.state === 'pass') ball.state = 'loose';
      if (S.phase === 'live' && (Math.abs(ball.pos.x) > HX || Math.abs(ball.pos.z) > HZ)) outOfBounds(ball.pos.x, ball.pos.z, ball.lastTeam);
    }
    if (ball.pos.y <= BALL_R + 0.001) { const f = Math.max(0, 1 - 1.2 * h); ball.vel.x *= f; ball.vel.z *= f; }
    if (ball.pos.z < -(HZ + 1.75) && ball.pos.y < 1.0) { ball.pos.z = -(HZ + 1.75); ball.vel.z = Math.abs(ball.vel.z) * 0.4; }
    if (ball.pos.z > HZ + 1.9 && ball.pos.y < 0.85 && Math.abs(ball.pos.x) < 3) { ball.pos.z = HZ + 1.9; ball.vel.z = -Math.abs(ball.vel.z) * 0.4; }
    if (Math.abs(ball.pos.x) > 18.5) { ball.pos.x = Math.sign(ball.pos.x) * 18.5; ball.vel.x *= -0.4; }
    if (Math.abs(ball.pos.z) > 10.8) { ball.pos.z = Math.sign(ball.pos.z) * 10.8; ball.vel.z *= -0.4; }
  }
  if (ball.state === 'shot' && ball.shot.kind !== 'ft') {
    const sh = ball.shot; sh.t += dt;
    for (const q of opp(sh.shooter)) {
      if (q.jy < 0.12 || sh.tried.has(q)) continue;
      const f = fwd(q);
      const hand = new THREE.Vector3(q.pos.x + f.x * 0.15, 2.42 * q.scale + q.jy, q.pos.z + f.z * 0.15);
      const dHand = hand.distanceTo(ball.pos);
      // 干擾球：球已在下墜、高於籃框，防守者碰到球
      if (sh.t > 0.3 && ball.vel.y < 0 && !ball.missed && ball.pos.y > RIM_H + 0.08 && dHand < 0.36 && hyp(ball.pos.x - basketX(sh.team), ball.pos.z) < 1.6) {
        sh.tried.add(q); goaltend(sh, q); return;
      }
      if (sh.t < 0.45 && dHand < 0.42) {
        sh.tried.add(q);
        if (Math.random() < 0.68 * q.blk * (sh.kind === 'dunk' ? 0.4 : 1) * (sh.shooter.clutchShot ? 0.35 : 1)) {
          const bx = basketX(sh.team); const away = new THREE.Vector3(ball.pos.x - bx, 0, ball.pos.z).normalize();
          ball.vel.set(away.x * rand(3, 5) + rand(-2, 2), rand(0, 2.2), away.z * rand(3, 5) + rand(-2, 2));
          ball.state = 'loose'; ball.missed = true; ball.lastTeam = q.team;
          S.stats[q.team].blk++; q.st.blk++; msg('火鍋！', 'big'); sfx.board(0.8); sfx.oh(); if (q.team === 0) buzz(40); pbp(`${TEAM_INFO[q.team].name} ${tag(q)} 火鍋`);
          if (S.pendingFT && S.pendingFT.shooter === sh.shooter) {} // 犯規在先，仍罰球
          break;
        }
      }
    }
  }
  if (ball.state === 'pass') {
    const ps = ball.pass; ps.t += dt;
    for (const q of opp(ps.from)) {
      if (ps.tried.has(q)) continue;
      if (hyp(q.pos.x - ball.pos.x, q.pos.z - ball.pos.z) < 0.55 && ball.pos.y < 2.3 * q.scale + q.jy) {
        ps.tried.add(q);
        if (Math.random() < 0.17 * q.def * (q.team === 1 ? D().steal : 1)) { S.stats[q.team].stl++; q.st.stl++; S.stats[ps.from.team].tov++; ps.from.st.tov++; msg('抄截！'); sfx.steal(); sfx.oh(); giveBall(q, 'steal'); return; }
      }
    }
    for (const t of teams[ps.from.team]) {
      if (t === ps.from) continue;
      if (ps.lob && t === ps.to) {
        const hands = new THREE.Vector3(t.pos.x, 2.42 * t.scale + t.jy, t.pos.z);
        if (t.jy > 0.3 && hands.distanceTo(ball.pos) < 0.6) { oopCatch(t); return; }
        continue;
      }
      if (chest(t).distanceTo(ball.pos) < 0.8) { giveBall(t, 'pass'); return; }
    }
    if (ps.t > ps.T + 0.5) ball.state = 'loose';
  }
  if (ball.state === 'loose' || ball.state === 'shot') tryGrab();
}
function tryGrab() {
  if (S.phase === 'ft' || S.pendingFT) return;
  if (ball.state === 'shot' && !(ball.missed && ball.vel.y < 0) && ball.pos.y > 2.0) return;
  let best = null, bd = 1e9;
  for (const p of players) {
    if (p.noGrabT > 0 || p.action === 'shoot' || p.action === 'layup' || p.action === 'dunk' || p.action === 'hang') continue;
    const d = hyp(p.pos.x - ball.pos.x, p.pos.z - ball.pos.z);
    const top = 2.45 * p.scale + p.jy + (p.pose === 'rebound' || p.pose === 'block' ? 0.15 : 0);
    if (d < 0.55 * p.scale && ball.pos.y < top && ball.pos.y > 0.05) { const sc = d - p.reb * 0.15 + rand(0, 0.12) - (p.boxing ? 0.08 : 0) + (p.boxedT > 0 ? 0.1 : 0); if (sc < bd) { bd = sc; best = p; } }
  }
  if (best) { if (S.phase !== 'live' && S.phase !== 'tipoff') return; giveBall(best, (ball.state === 'shot' || ball.missed) ? 'rebound' : 'loose'); }
}
function goaltend(sh, q) {
  sfx.whistle(); msg('干擾球！進球算');
  const s = S.attack[sh.team];
  ball.vel.set(-s * 1.5, -1, rand(-1, 1));
  creditBasket(sh.team, sh.shooter, sh.three ? 3 : 2, s);
}
function scored(s) {
  if (ball.state === 'dead' || ball.state === 'held') return;
  if (S.phase === 'contest3') return contest3Scored();
  if (S.phase === 'contestD') return contestDScored();
  if (S.phase === 'practice') return practiceScored();
  if (S.phase !== 'live' && S.phase !== 'ft') return;
  const team = S.attack[0] === s ? 0 : 1;
  const sh = ball.shot;
  if (sh && sh.kind === 'ft') {
    S.score[team] += 1; S.stats[team].ftm++; sh.shooter.st.ftm++; sh.shooter.st.pts++; pbp(`${TEAM_INFO[team].name} ${tag(sh.shooter)} 罰球命中`);
    nets[s > 0 ? 1 : 0].t = 0.9; sfx.swish(); sfx.cheer(team === 0 ? 0.5 : 0.15);
    if (S.phase === 'ft') { S.ft.made = true; ball.state = 'dead'; return; }
    // 最後一罰進：對方發球（技術犯規罰球則由罰球隊在邊線發球）
    ball.state = 'dead'; ball.shot = null; S.phase = 'dead'; S.timer = 1.4; S.poss = 1 - team;
    S.next = S.pendingEnd ? 'end' : { team: 1 - team, kind: 'baseline', x: s * (HX + 0.45), z: 1.9 };
    return;
  }
  const pts = sh && sh.team === team && sh.three ? 3 : 2;
  creditBasket(team, sh && sh.team === team ? sh.shooter : null, pts, s);
}
function celebrate(team, shooter, big) {
  if (shooter) { shooter.celebT = 1.6; shooter.celebType = (Math.random() * 3) | 0; }
  for (const q of teams[team]) if (q !== shooter && shooter && hyp(q.pos.x - shooter.pos.x, q.pos.z - shooter.pos.z) < 6) { q.celebT = 1.0; q.celebType = 3; }
  for (const q of teams[1 - team]) if (shooter && hyp(q.pos.x - shooter.pos.x, q.pos.z - shooter.pos.z) < 3.5) q.dejT = 1.3;
  if (big) for (const q of roster[team]) if (!q.onCourt) q.cheerT = 2.4;
  if (team === 0) extras.cheer(big); // 主場啦啦隊、吉祥物跟著歡呼
}
function creditBasket(team, shooter, pts, s) {
  if (ball.shotRec) ball.shotRec.res = 'in';
  const sh = ball.shot;
  if (ball.hRec && sh && sh.kind !== 'ft') ball.hRec.made = true;
  S.score[team] += pts;
  if (shooter) {
    S.stats[team].fgm++; shooter.st.fgm++; shooter.st.pts += pts; if (pts === 3) { S.stats[team].tpm++; shooter.st.tpm++; }
    const a = S.assist; if (a && a.to === shooter && S.gameT - a.t < 5 && a.passer.team === team) a.passer.st.ast++;
  }
  S.assist = null;
  S.run[team] += pts; S.run[1 - team] = 0;
  pbp(`${TEAM_INFO[team].name} ${shooter ? tag(shooter) + ' ' : ''}${sh && sh.kind === 'dunk' ? '灌籃' : pts === 3 ? '三分命中' : sh && sh.kind === 'hook' ? '勾射得手' : '兩分進帳'}`);
  if (team === 0) buzz(sh && sh.kind === 'dunk' ? 60 : 25);
  if (sh && sh.kind === 'dunk') sfx.slam();
  sfx.swish(); sfx.cheer(team === 0 ? (pts === 3 ? 1 : 0.7) : 0.25);
  arena.crowdUniforms.uCheer.value = team === 0 ? 1 : 0.35;
  const andOne = S.pendingFT && shooter && S.pendingFT.shooter === shooter;
  const k = sh ? sh.kind : 'jump';
  if (andOne) say(pick(['進算！還有加罰！', '打進還有一罰！']), 2);
  else if (pts === 3) say(pick(['三分球命中！', '三分出手，進了！', '漂亮的三分球！']), 2);
  else if (k === 'dunk') { /* 灌籃已在出手時播報 */ }
  else if (k === 'layup') say(pick(['上籃得手', '切入上籃，進了', '輕鬆放進']), 1);
  else if (k === 'hook') say(pick(['勾射得分', '低位勾射，進了']), 1);
  else say(pick(['跳投命中', '中距離，進了', '兩分到手']), 0);
  celebrate(team, shooter, pts === 3 || andOne || k === 'dunk' || (sh && sh.buzzer));
  if (shooter && (team === 0 || pts === 3 || andOne || (sh && sh.kind === 'dunk'))) setTimeout(() => lowerThird(shooter, andOne ? '2+1' : (pts === 3 ? '三分命中' : '')), 600);
  // 精彩重播：灌籃、三分、2+1、壓哨
  const hl = sh && (sh.kind === 'dunk' || pts === 3 || andOne || sh.buzzer);
  if (hl && S.gameT - S.lastReplay > 40 && !AUTO) { S.highlight = { side: s, kind: sh.kind }; S.lastReplay = S.gameT; }
  ball.state = 'dead'; ball.shot = null; ball.missed = false;
  S.poss = 1 - team; S.lastScoreSide = s;
  S.phase = 'dead'; S.timer = 1.8;
  S.runClock = !(S.quarter >= 4 && S.clock <= S.qlen / 6);
  if (andOne) { S.next = { ft: true, shooter, n: 1 }; S.pendingFT = null; }
  else if (S.pendingEnd) S.next = 'end';
  else S.next = { team: 1 - team, kind: 'baseline', x: s * (HX + 0.45), z: 1.9 };
}
function outOfBounds(x, z, lastTeam) {
  sfx.whistle(); msg('出界');
  const team = 1 - lastTeam;
  if (ball.holder) { S.stats[lastTeam].tov++; ball.holder.st.tov++; }
  let ix, iz;
  if (Math.abs(x) > HX && Math.abs(z) < HZ) { ix = Math.sign(x) * (HX + 0.45); iz = Math.abs(z) < 1.4 ? 1.9 * (z < 0 ? -1 : 1) : clamp(z, -HZ + 0.5, HZ - 0.5); }
  else { iz = Math.sign(z) * (HZ + 0.45); ix = clamp(x, -12.5, 12.5); }
  deadBall({ team, kind: 'side', x: ix, z: iz, keepClock: team === S.poss }, 1.2);
}
function deadBall(next, t) {
  S.runClock = false;
  S.phase = 'dead'; S.timer = t; S.next = next;
  if (!next.ft && next !== 'end') S.poss = next.team;
  if (ball.holder) { ball.pos.copy(handBall(ball.holder)); }
  ball.vel.set(0, Math.min(0, ball.vel.y), 0);
  ball.state = 'dead'; ball.holder = null; ball.shot = null;
  for (const p of players) { p.action = p.jy > 0 ? p.action : null; }
}
function startInbound(n) {
  S.phase = 'inbound';
  const tm = teams[n.team];
  let thrower;
  if (n.kind === 'baseline') thrower = tm[4];
  else { let bd = 1e9; for (const p of tm) { const d = hyp(p.pos.x - n.x, p.pos.z - n.z); if (d < bd && p.idx !== 0) { bd = d; thrower = p; } } }
  const receiver = thrower.idx === 0 ? tm[1] : tm[0];
  const spot = new THREE.Vector3(n.x, 0, n.z);
  ball.state = 'dead'; ball.holder = null; ball.vel.set(0, 0, 0);
  const inward = new THREE.Vector3(-Math.sign(n.x) * (Math.abs(n.x) > HX ? 1 : 0), 0, -Math.sign(n.z) * (Math.abs(n.z) > HZ ? 1 : 0)).normalize();
  ball.pos.set(n.x + inward.x * 0.25, BALL_R, n.z + inward.z * 0.25);
  S.ib = { thrower, receiver, spot, inward, t: 0, step: 'fetch', kind: n.kind, team: n.team };
  const keep = n.keepClock && S.poss === n.team;
  if (S.poss !== n.team || !keep) { S.shotClock = n.keepClock ? Math.max(S.shotClock, 14) : 24; }
  S.poss = n.team; S.fc = false; S.bcT = 0; S.ibFront = inFront(n.team, n.x);
  if (S.ibFront) S.fc = true;
  if (n.team === 0) ctrl = receiver; else ctrl = guardOf(receiver);
}
function updateInbound(dt) {
  const ib = S.ib; ib.t += dt;
  const th = ib.thrower;
  if (ib.step === 'fetch') {
    if (hyp(th.pos.x - ball.pos.x, th.pos.z - ball.pos.z) < 0.6 || ib.t > 4) {
      ball.state = 'held'; ball.holder = th; ball.lastTeam = th.team; ib.step = 'wait'; ib.t = 0;
    }
  } else if (ib.step === 'wait') {
    th.facing = Math.atan2(ib.inward.x, ib.inward.z);
    if (ib.t > 1.1 && hyp(th.pos.x - ib.spot.x, th.pos.z - ib.spot.z) < 0.5 || ib.t > 3) { doPass(th, ib.receiver, 10); ib.step = 'passed'; th.noGrabT = 0.6; }
  } else if (ib.step === 'passed') {
    if ((ball.state === 'loose' && ib.t > 2.5) || ball.state === 'held') { S.phase = 'live'; S.ib = null; }
  }
}

// ================= 換人與體力 =================
function benchSeat(p) {
  const used = new Set(roster[p.team].filter(q => !q.onCourt && q !== p).map(q => q.chair));
  const chairs = CHAIRS(p.team); for (let i = 0; i < chairs.length; i++) if (!used.has(i)) { p.chair = i; return chairs[i]; }
  p.chair = 0; return chairs[0];
}
function doSub(out, inn) {
  if (!out.onCourt || inn.onCourt || inn.st.pf >= 6) return false;
  inn.onCourt = true; inn.idx = out.idx; inn.chair = -1; inn.walkTo = null;
  inn.pos.set((out.team === 0 ? -1.4 : 1.4), 0, HZ + 1.2); inn.vel.set(0, 0, 0); inn.action = null; inn.jy = 0; inn.jv = 0;
  out.onCourt = false; out.idx = -1; out.action = null; out.walkTo = benchSeat(out);
  if (ctrl === out) ctrl = inn;
  if (ball.holder === out) ball.holder = inn;
  rebuildLists();
  return true;
}
function autoSubs() {
  const msgs = [];
  for (let t = 0; t < 2; t++) {
    if (t === 0 && !S.autoSub && !AUTO) continue;
    for (const p of teams[t].slice()) {
      if (S.ft && S.ft.shooter === p) continue;
      const fouledOut = p.st.pf >= 6;
      if (!fouledOut && p.sta > 0.42) continue;
      const cands = roster[t].filter(q => !q.onCourt && q.st.pf < 6 && (fouledOut || q.sta > 0.82)).sort((a, b) => (b.role === p.role) - (a.role === p.role) || b.sta - a.sta);
      if (cands[0] && doSub(p, cands[0])) msgs.push(`${TEAM_INFO[t].name} 換人：#${cands[0].num} 換下 #${p.num}`);
    }
    // 先發體力恢復後換回來
    for (const q of roster[t]) {
      if (q.onCourt || NUMS[t].indexOf(q.num) >= 5 || q.sta < 0.92 || q.st.pf >= 6) continue;
      const cur = teams[t].find(p => p.role === q.role && NUMS[t].indexOf(p.num) >= 5 && p.sta < 0.7);
      if (cur && !(S.ft && S.ft.shooter === cur) && doSub(cur, q)) msgs.push(`${TEAM_INFO[t].name} 換人：#${q.num} 回場`);
    }
  }
  for (const [o, i] of S.subQueue) doSub(o, i);
  S.subQueue = [];
  if (msgs.length) msg(msgs[0]);
}
function updateBench(dt) {
  for (let t = 0; t < 2; t++) for (const p of roster[t]) {
    if (p.onCourt || p.hidden) continue;
    p.sta = Math.min(1, p.sta + dt * 0.003 * (720 / S.qlen));
    if (p.walkTo) {
      const dx = p.walkTo.x - p.pos.x, dz = p.walkTo.z - p.pos.z, d = hyp(dx, dz);
      if (d < 0.15) { p.walkTo = null; p.vel.set(0, 0, 0); }
      else { p.vel.set(dx / d * 2.6, 0, dz / d * 2.6); p.pos.addScaledVector(p.vel, dt); p.facing = Math.atan2(dx, dz); p.pose = 'run'; continue; }
    }
    if (p.chair < 0) p.pos.copy(benchSeat(p));
    p.cheerT = (p.cheerT || 0) - dt;
    const c = CHAIRS(t)[p.chair]; const up = p.cheerT > 0; p.pos.set(c.x, 0, c.z + (up ? -0.35 : 0.05)); p.vel.set(0, 0, 0); p.facing = Math.PI; p.pose = up ? 'cheer' : 'sit';
  }
}

// ================= 暫停 =================
function canUserTimeout() {
  if (S.timeouts[0] <= 0 || !['live', 'dead', 'inbound'].includes(S.phase)) return false;
  if (S.phase === 'dead' && (S.next === 'end' || (S.next && S.next.ft))) return false;
  if (S.phase === 'live') return ball.state === 'held' && ball.holder.team === 0;
  return true;
}
function callTimeout(team) {
  S.timeouts[team]--;
  sfx.whistle(); msg(`${TEAM_INFO[team].name} 請求暫停`);
  let resume;
  if (S.phase === 'live') { const bp = ball.holder.pos; resume = { team: 0, kind: 'side', x: clamp(bp.x, -12, 12), z: (bp.z < 0 ? -1 : 1) * (HZ + 0.45), keepClock: true }; }
  else if (S.phase === 'inbound' && S.ib) resume = { team: S.ib.team, kind: S.ib.kind, x: S.ib.spot.x, z: S.ib.spot.z, keepClock: true };
  else resume = S.next;
  S.toResume = resume;
  ball.state = 'dead'; ball.holder = null;
  S.phase = 'timeout'; S.runClock = false;
  for (const p of [...roster[0], ...roster[1]]) p.sta = Math.min(1, p.sta + 0.12);
  // 球員走回各自板凳前圍成一圈；啦啦隊進場表演，幾秒後（或點畫面）才跳出換人面板
  for (const t of [0, 1]) teams[t].forEach((p, i) => { const a = i / 5 * Math.PI * 2; p.huddle = new THREE.Vector3((t === 0 ? -1 : 1) * 6.2 + Math.cos(a) * 0.85, 0, HZ + 1.15 + Math.sin(a) * 0.6); });
  S.showT = AUTO ? 0 : 4.5;
  document.body.classList.toggle('tshow', S.showT > 0);
  if (S.showT <= 0) openSubPanel(true);
}
function updateHuddle(dt) {
  if (S.showT > 0) { S.showT -= dt; if (S.showT <= 0) { openSubPanel(true); document.body.classList.remove('tshow'); } }
  for (const p of players) {
    if (!p.huddle) continue;
    const dx = p.huddle.x - p.pos.x, dz = p.huddle.z - p.pos.z, d = hyp(dx, dz);
    if (d > 0.15) { const v = Math.min(3.0, d * 2); p.vel.set(dx / d * v, 0, dz / d * v); p.pos.addScaledVector(p.vel, dt); p.facing = Math.atan2(dx, dz); p.pose = 'run'; }
    else { p.vel.set(0, 0, 0); const c = (p.team === 0 ? -1 : 1) * 6.2; p.facing = Math.atan2(c - p.pos.x, HZ + 1.15 - p.pos.z); p.pose = 'idle'; }
    p.jy = 0; p.jv = 0; p.action = null;
  }
}
addEventListener('pointerdown', () => { if (S.phase === 'timeout' && S.showT > 0) { S.showT = 0; openSubPanel(true); document.body.classList.remove('tshow'); } }, true);
function endTimeout() {
  $('subp').classList.remove('show'); S.showT = 0;
  for (const p of [...roster[0], ...roster[1]]) p.huddle = null;
  autoSubs();
  const r = S.toResume; S.toResume = null;
  if (r && r.ft) startFT(r.shooter, r.n, r.keep); else if (r === 'end') endQuarter(); else startInbound(r || { team: S.poss, kind: 'side', x: 0, z: -(HZ + 0.45) });
}
let subSel = null;
function openSubPanel(isTO) {
  const el = $('subp'); el.classList.add('show');
  $('subTitle').textContent = isTO ? `暫停　剩 ${S.timeouts[0]} 次` : '陣容與換人';
  $('subGo').textContent = isTO ? '回到比賽' : '關閉';
  subSel = null; renderSubPanel();
}
function renderSubPanel() {
  const row = (p, onC) => {
    const queued = S.subQueue.some(([o, i]) => o === p || i === p);
    const pct = Math.round(p.sta * 100);
    return `<button class="pl${subSel === p ? ' sel' : ''}${queued ? ' q' : ''}${p.st.pf >= 6 ? ' out' : ''}" data-n="${p.num}" data-c="${onC ? 1 : 0}"><b>#${p.num}</b> ${POS_NAMES[p.role]} <span class="bar"><i style="width:${pct}%;background:${pct > 60 ? '#5dd36b' : pct > 40 ? '#f2c14e' : '#ff5a4a'}"></i></span> <small>${p.st.pts}分 ${p.st.pf}犯</small></button>`;
  };
  $('subCourt').innerHTML = teams[0].map(p => row(p, true)).join('');
  $('subBench').innerHTML = roster[0].filter(p => !p.onCourt).map(p => row(p, false)).join('');
  $('autoSub').textContent = '電腦自動換人：' + (S.autoSub ? '開' : '關');
  $('subQ').textContent = S.subQueue.length ? '待換：' + S.subQueue.map(([o, i]) => `#${i.num}↔#${o.num}`).join('　') + '（下一次死球生效）' : '先點場上球員，再點板凳球員';
}
$('subp').addEventListener('click', e => {
  const b = e.target.closest('.pl'); if (!b) return;
  const p = roster[0].find(q => q.num === +b.dataset.n);
  if (p.st.pf >= 6) return;
  if (b.dataset.c === '1') subSel = subSel === p ? null : p;
  else if (subSel) { S.subQueue = S.subQueue.filter(([o, i]) => o !== subSel && i !== p); S.subQueue.push([subSel, p]); subSel = null; }
  renderSubPanel();
});
$('autoSub').addEventListener('click', () => { S.autoSub = !S.autoSub; renderSubPanel(); });
$('subGo').addEventListener('click', () => {
  if (S.phase === 'timeout') endTimeout(); else { $('subp').classList.remove('show'); if (S.paused) togglePause(); }
});

// ================= 節次 =================
function placeTeams() { for (const p of players) { p.vel.set(0, 0, 0); p.jy = 0; p.jv = 0; p.action = null; p.slowT = 0; p.ftSpot = null; } }
function startTipoff(ot) {
  S.phase = 'tipoff'; S.timer = 0; placeTeams();
  const spots = [[0.55, 0], [2.4, 2.6], [2.4, -2.6], [5.0, 4.0], [5.0, -3.8]];
  for (const p of players) {
    const side = -S.attack[p.team];
    const sp = p.idx === 4 ? spots[0] : spots[p.idx + 1];
    p.pos.set(side * sp[0], 0, sp[1] * (p.team ? -1 : 1));
    p.facing = Math.atan2(-side, 0);
  }
  ball.state = 'toss'; ball.holder = null; ball.pos.set(0, 1.7, -0.35); ball.vel.set(0, 0, 0);
  referee.pos.set(0, 0, -0.75); referee.facing = 0;
  S.tip = { tossed: false, res: false, aiJump: [rand(1.05, 1.25), rand(1.0, 1.35)] };
  ctrl = teams[0][4];
  say((ot ? QNAME(S.quarter) + '，' : '') + '雙方準備跳球', 1); document.body.classList.add('tiphint');
}
function updateTipoff(dt) {
  S.timer += dt; const tip = S.tip;
  if (!tip.tossed && S.timer > 0.8) { tip.tossed = true; ball.pos.set(0, 1.75, 0); ball.vel.set(0, 6.3, 0); }
  for (let t = 0; t < 2; t++) {
    const c = teams[t][4];
    if (isUser(c)) { if (inp.b1Down && tip.tossed && jump(c, 4.1)) c.action = 'block'; }
    else if (S.timer > tip.aiJump[t] && jump(c, 4.1)) c.action = 'block';
  }
  if (tip.tossed && !tip.res && S.timer > 1.55) {
    tip.res = true;
    const h = t => { const c = teams[t][4]; return 2.45 * c.scale + c.jy + rand(0, 0.12); };
    const w = h(0) >= h(1) ? 0 : 1;
    const mate = teams[w][1];
    ball.state = 'loose'; ball.lastTeam = w;
    const T = 0.85; ball.vel.set((mate.pos.x - ball.pos.x) / T, (1.3 - ball.pos.y + 0.5 * G * T * T) / T, (mate.pos.z - ball.pos.z) / T);
    if (S.quarter === 1) S.arrow = 1 - w;
    S.phase = 'live'; S.poss = -1; S.shotClock = 24; document.body.classList.remove('tiphint');
    sfx.cheer(0.4);
  }
}
function startQuarter() {
  placeTeams();
  S.teamFouls = [0, 0]; S.pendingEnd = false;
  autoSubs();
  if (S.quarter >= 5) { S.clock = Math.max(60, Math.round(S.qlen * 5 / 12)); msg(QNAME(S.quarter)); startTipoff(true); return; }
  // NBA：第二、三節由開場跳球輸的一方，第四節由贏的一方，在自己後場底線發球
  const team = S.quarter === 4 ? 1 - S.arrow : S.arrow;
  for (const p of players) {
    const dir = S.attack[p.team];
    const sp = offenseSpot(p);
    p.pos.set(p.team === team ? sp.x * 0.3 : -dir * (3 + p.idx * 1.2), 0, p.team === team ? sp.z : (p.idx - 2) * 2.3);
  }
  S.clock = S.qlen;
  msg(QNAME(S.quarter));
  startInbound({ team, kind: 'baseline', x: -S.attack[team] * (HX + 0.45), z: 1.9 });
}
function endQuarter() {
  sfx.buzzer(); S.pendingEnd = false; S.pendingFT = null;
  S.phase = 'break';
  ball.state = 'dead'; ball.holder = null; ball.shot = null;
  const q = S.quarter;
  const over = q >= 4 && S.score[0] !== S.score[1];
  if (over) {
    S.phase = 'over';
    const win = S.score[0] > S.score[1];
    $('brkTitle').textContent = win ? '勝利！' : '比賽結束';
    $('brkBtn').textContent = '再來一場';
    if (S.mode === 'series') {
      const sr = S.series; sr.wins[win ? 0 : 1]++;
      const done = sr.wins[0] >= 4 || sr.wins[1] >= 4;
      $('brkTitle').textContent = done ? (sr.wins[0] >= 4 ? '🏆 總冠軍！' : '系列賽落敗') : `第 ${sr.game} 戰${win ? '勝利' : '落敗'}`;
      $('brkBtn').textContent = done ? '開始新的系列賽' : `第 ${sr.game + 1} 戰`;
      S.seriesTxt = `　系列賽 ${TEAM_INFO[0].name} ${sr.wins[0]}:${sr.wins[1]} ${TEAM_INFO[1].name}`;
      if (done) S.series = { wins: [0, 0], game: 1 }; else sr.game++;
      store.set('series', S.series);
    }
    sfx.cheer(win ? 1 : 0.3);
  } else {
    $('brkTitle').textContent = q === 2 ? '中場休息' : (q >= 4 ? '平手！進入延長賽' : QNAME(q) + '結束');
    $('brkBtn').textContent = '繼續';
  }
  $('brkSub').textContent = `${TEAM_INFO[0].name} ${S.score[0]} : ${S.score[1]} ${TEAM_INFO[1].name}` + (q === 2 && !over ? '　下半場交換場地' : '') + (over && S.seriesTxt ? S.seriesTxt : '');
  S.seriesTxt = '';
  if (over) {
    const all = [...roster[0], ...roster[1]].filter(p => p.st.sec > 0);
    const gs = p => p.st.pts + p.st.reb * 1.2 + p.st.ast * 1.5 + (p.st.stl + p.st.blk) * 2 - p.st.tov + (p.team === (S.score[0] > S.score[1] ? 0 : 1) ? 4 : 0);
    const mvp = all.sort((a, b) => gs(b) - gs(a))[0];
    if (mvp) $('brkSub').textContent += `\n全場最佳：${TEAM_INFO[mvp.team].name} ${tag(mvp)}　${mvp.st.pts} 分 ${mvp.st.reb} 籃板 ${mvp.st.ast} 助攻`;
  }
  boxTab = 0; renderBox();
  $('brk').classList.add('show');
  for (const p of [...roster[0], ...roster[1]]) p.sta = Math.min(1, p.sta + (q === 2 ? 0.5 : 0.2));
}
let boxTab = 0;
function renderBox() {
  const st = S.stats; const pct = (a, b) => b ? Math.round(a / b * 100) + '%' : '-';
  const r = (lbl, f) => `<tr><td>${f(0)}</td><th>${lbl}</th><td>${f(1)}</td></tr>`;
  const team = `<table class="tm"><tr><td class="t0">${TEAM_INFO[0].name}</td><th></th><td class="t1">${TEAM_INFO[1].name}</td></tr>` +
    r('投籃', t => `${st[t].fgm}/${st[t].fga} ${pct(st[t].fgm, st[t].fga)}`) + r('三分', t => `${st[t].tpm}/${st[t].tpa}`) + r('罰球', t => `${st[t].ftm}/${st[t].fta}`) +
    r('籃板', t => st[t].reb) + r('抄截', t => st[t].stl) + r('火鍋', t => st[t].blk) + r('失誤', t => st[t].tov) + r('犯規', t => st[t].pf) + '</table>';
  const ps = boxTab > 1 ? '' : roster[boxTab].map(p => `<tr><td>#${p.num}</td><td>${POS_NAMES[p.role]}</td><td>${Math.round(p.st.sec / 60 * 12 * 60 / S.qlen)}</td><td><b>${p.st.pts}</b></td><td>${p.st.reb}</td><td>${p.st.ast}</td><td>${p.st.stl}</td><td>${p.st.blk}</td><td>${p.st.fgm}/${p.st.fga}</td><td>${p.st.tpm}/${p.st.tpa}</td><td>${p.st.ftm}/${p.st.fta}</td><td>${p.st.pf}</td></tr>`).join('');
  const tabs = `<div class="tabs"><button data-t="2" class="${boxTab === 2 ? 'on' : ''}">全隊</button><button data-t="0" class="${boxTab === 0 ? 'on' : ''}">${TEAM_INFO[0].name}</button><button data-t="1" class="${boxTab === 1 ? 'on' : ''}">${TEAM_INFO[1].name}</button><button data-t="3" class="${boxTab === 3 ? 'on' : ''}">投籃熱區</button></div>`;
  if (boxTab === 3) { renderHeat(tabs); return; }
  $('brkStats').innerHTML = tabs +
    (boxTab === 2 ? team : `<div class="scrollable box"><table class="ps"><tr><th>背號</th><th>位置</th><th>上場</th><th>得分</th><th>籃板</th><th>助攻</th><th>抄截</th><th>火鍋</th><th>投籃</th><th>三分</th><th>罰球</th><th>犯規</th></tr>${ps}</table></div><div class="note">上場時間換算成 12 分鐘一節</div>`);
}
$('brkStats').addEventListener('click', e => {
  const b = e.target.closest('button[data-t]'); if (b) { boxTab = +b.dataset.t; renderBox(); return; }
  const h = e.target.closest('button[data-ht]'); if (h) { heatSel.team = +h.dataset.ht; heatSel.num = null; renderBox(); return; }
  const n = e.target.closest('button[data-hn]'); if (n) { heatSel.num = n.dataset.hn === '' ? null : +n.dataset.hn; renderBox(); }
});
// ---- 投籃熱區圖：半場、三個區域依命中率上色，進球實心點、沒進叉叉 ----
const heatSel = { team: 0, num: null };
function heatZone(r) { if (r.three) return 2; return (Math.abs(r.v) < KEY_HALF && r.dep < 5.79) ? 0 : 1; }
function renderHeat(tabs) {
  const all = (S.shots || []).filter(r => r.team === heatSel.team);
  const list = heatSel.num == null ? all : all.filter(r => r.num === heatSel.num);
  const nums = [...new Set(all.map(r => r.num))].sort((a, b) => a - b);
  const z = [0, 1, 2].map(i => { const a = list.filter(r => heatZone(r) === i); return [a.filter(r => r.made).length, a.length]; });
  const pct = ([m, a]) => a ? Math.round(m / a * 100) + '%' : '-';
  const chips = `<div class="tabs hchips"><button data-ht="0" class="${heatSel.team === 0 ? 'on' : ''}">${TEAM_INFO[0].name}</button><button data-ht="1" class="${heatSel.team === 1 ? 'on' : ''}">${TEAM_INFO[1].name}</button><span class="sep"></span><button data-hn="" class="${heatSel.num == null ? 'on' : ''}">全隊</button>${nums.map(n => `<button data-hn="${n}" class="${heatSel.num === n ? 'on' : ''}">#${n}</button>`).join('')}</div>`;
  $('brkStats').innerHTML = tabs + chips + `<div class="heat"><canvas id="heatC" width="400" height="300"></canvas><table class="tm hz"><tr><th>禁區</th><td>${z[0][0]}/${z[0][1]}</td><td>${pct(z[0])}</td></tr><tr><th>中距離</th><td>${z[1][0]}/${z[1][1]}</td><td>${pct(z[1])}</td></tr><tr><th>三分</th><td>${z[2][0]}/${z[2][1]}</td><td>${pct(z[2])}</td></tr></table></div><div class="note">紅色＝手感熱（命中率高）、藍色＝手感冷；● 進球　✕ 沒進</div>`;
  const c = $('heatC'), g = c.getContext('2d');
  const W = c.width, H = c.height, k = Math.min(W / (2 * HZ), H / HX);
  const X = v => W / 2 + v * k, Y = dep => dep * k; // 底線在上方
  const bD = HX - BASKET_X;
  const heatCol = ([m, a]) => { if (!a) return 'rgba(255,255,255,0.05)'; const f = m / a; return f >= 0.5 ? 'rgba(230,70,40,0.55)' : f >= 0.4 ? 'rgba(240,170,40,0.45)' : f >= 0.3 ? 'rgba(150,150,160,0.35)' : 'rgba(50,110,230,0.5)'; };
  g.fillStyle = '#2a2018'; g.fillRect(0, 0, W, H);
  const arcPath = () => { const a0 = Math.acos(THREE_SIDE / THREE_R); g.beginPath(); g.moveTo(X(-THREE_SIDE), 0); g.lineTo(X(-THREE_SIDE), Y(bD + Math.sin(a0) * THREE_R)); g.arc(X(0), Y(bD), THREE_R * k, Math.PI - a0, a0, true); g.lineTo(X(THREE_SIDE), 0); g.closePath(); };
  g.fillStyle = heatCol(z[2]); g.fillRect(0, 0, W, Y(HX));
  arcPath(); g.fillStyle = '#2a2018'; g.fill(); g.fillStyle = heatCol(z[1]); g.fill();
  g.fillStyle = '#2a2018'; g.fillRect(X(-KEY_HALF), 0, KEY_HALF * 2 * k, 5.79 * k); g.fillStyle = heatCol(z[0]); g.fillRect(X(-KEY_HALF), 0, KEY_HALF * 2 * k, 5.79 * k);
  g.strokeStyle = 'rgba(255,255,255,0.75)'; g.lineWidth = 1.5;
  g.strokeRect(1, 1, W - 2, Y(HX) - 2); arcPath(); g.stroke();
  g.strokeRect(X(-KEY_HALF), 0, KEY_HALF * 2 * k, 5.79 * k);
  g.beginPath(); g.arc(X(0), Y(5.79), CIRCLE_R * k, 0, Math.PI); g.stroke();
  g.beginPath(); g.arc(X(0), Y(bD), RA_R * k, 0, Math.PI); g.stroke();
  g.beginPath(); g.arc(X(0), Y(HX), CIRCLE_R * k, Math.PI, 0); g.stroke();
  g.strokeStyle = '#ff7a1a'; g.lineWidth = 2; g.beginPath(); g.arc(X(0), Y(bD), RIM_R * k, 0, Math.PI * 2); g.stroke();
  g.strokeStyle = '#fff'; g.beginPath(); g.moveTo(X(-0.915), Y(HX - BOARD_X)); g.lineTo(X(0.915), Y(HX - BOARD_X)); g.stroke();
  for (const r of list) {
    // 起跳後身體會飄，點畫在三分線附近時依實際判定推到線的正確那一側
    let v = r.v, dp = r.dep; const rd = hyp(v, dp - bD), corner = Math.abs(v) >= THREE_SIDE - 0.05 && dp < bD + 2.6;
    if (r.three && !corner && rd < THREE_R + 0.18) { const k2 = (THREE_R + 0.18) / (rd || 1); v *= k2; dp = bD + (dp - bD) * k2; }
    if (!r.three && rd > THREE_R - 0.18) { const k2 = (THREE_R - 0.18) / rd; v *= k2; dp = bD + (dp - bD) * k2; }
    if (!r.three && Math.abs(v) > THREE_SIDE - 0.18) v = Math.sign(v) * (THREE_SIDE - 0.18);
    const x = X(clamp(v, -HZ + 0.2, HZ - 0.2)), y = Y(clamp(dp, 0.2, HX - 0.2));
    if (r.made) { g.fillStyle = '#ffd23a'; g.strokeStyle = '#3a2400'; g.lineWidth = 1; g.beginPath(); g.arc(x, y, 4.5, 0, Math.PI * 2); g.fill(); g.stroke(); }
    else { g.strokeStyle = 'rgba(255,255,255,0.85)'; g.lineWidth = 1.8; g.beginPath(); g.moveTo(x - 3.5, y - 3.5); g.lineTo(x + 3.5, y + 3.5); g.moveTo(x + 3.5, y - 3.5); g.lineTo(x - 3.5, y + 3.5); g.stroke(); }
  }
}
function continueBreak() {
  $('brk').classList.remove('show');
  if (S.practiceDone) { S.practiceDone = false; startPractice(false); return; }
  if (S.boxFromPause) { S.boxFromPause = false; togglePause(); return; }
  if (S.phase === 'over' && S.mode === 'three') { startThree(); return; }
  if (S.phase === 'over' && S.mode === 'dunk') { startDunk(); return; }
  if (S.phase === 'over') { newGame(); return; }
  if (S.quarter === 2) S.attack = [-S.attack[0], -S.attack[1]];
  S.quarter++;
  startQuarter();
}
$('brkBtn').addEventListener('click', continueBreak);

// ================= AI =================
const SPOTS = [[7.9, 0], [6.1, 5.0], [6.1, -5.0], [1.0, 7.05], [1.6, -2.95]];
function toWorld(team, u, v) { const s = S.attack[team]; return { x: s * BASKET_X - s * u, z: v }; }
function offenseSpot(p) {
  if (p.cutting > 0) return toWorld(p.team, 1.1, p.cutSide);
  const scr = S.screen[p.team];
  if (scr && scr.screener === p) {
    if (scr.stage === 'roll') return toWorld(p.team, 1.4, clamp(p.pos.z * 0.3, -1.2, 1.2));
    return { x: scr.spot.x, z: scr.spot.z };
  }
  let [u, v] = SPOTS[p.idx];
  const h = ball.holder;
  const play = S.play[p.team];
  const bs = h ? (h.pos.z >= 0 ? 1 : -1) : 1;
  if (play === 'post') {
    if (p.role === 4) { u = 1.7; v = bs * (KEY_HALF + 0.5); }
    else if (p.role === 3) { u = 5.4; v = -bs * 1.8; }
    else if (p.idx === 2) { u = 1.0; v = -bs * 7.05; }
  } else if (play === 'pnr') {
    if (p.role === 3) { u = 1.0; v = 7.05; } else if (p.idx === 2) { u = 1.0; v = -7.05; }
  } else if (play === 'three' && (p.idx === 1 || p.idx === 2)) {
    // 射手繞掩護：在籃下與側翼／底角之間來回
    p.runT = (p.runT || 0) + 1 / 60;
    const ph = Math.floor((p.runT + p.idx * 1.6) / 3.2) % 2;
    const sd = p.idx === 1 ? 1 : -1;
    if (ph === 0) { u = 1.6; v = sd * 1.9; } else { u = p.idx === 1 ? 6.6 : 0.9; v = sd * (p.idx === 1 ? 4.6 : 7.0); }
  } else if (play === 'three' && p.role >= 3) { u = 4.2; v = (p.role === 3 ? 1 : -1) * 3.0; }
  let w = toWorld(p.team, u, v);
  if (h && h !== p && h.team === p.team) {
    const d = hyp(h.pos.x - w.x, h.pos.z - w.z);
    if (d < 2.8) { const away = Math.sign(v - h.pos.z) || 1; w = toWorld(p.team, Math.max(1.0, u - 1.5), clamp(v + away * 2.6, -7.1, 7.1)); }
  }
  // 3 秒：在禁區待太久就出來
  if (p.keyT > 1.6) w = { x: w.x, z: (p.pos.z < 0 ? -1 : 1) * (KEY_HALF + 0.7) };
  return w;
}
function zoneSpot(p) {
  const h = ball.holder, offT = 1 - p.team;
  const Z = [[6.3, 2.0], [6.3, -2.0], [2.6, 4.4], [2.6, -4.4], [1.6, 0]];
  const [u, v] = Z[p.idx];
  const w = toWorld(offT, u, v);
  const bp = h ? h.pos : ball.pos;
  // 整個區域往球的方向移動
  const dx = clamp((bp.x - w.x) * 0.25, -1.4, 1.4), dz = clamp((bp.z - w.z) * 0.3, -1.6, 1.6);
  let x = w.x + dx, z = w.z + dz;
  if (h && h.team === offT) {
    // 球進到誰的區域，誰就上前防持球者
    let best = null, bd = 1e9;
    for (const q of teams[p.team]) { const ww = toWorld(offT, Z[q.idx][0], Z[q.idx][1]); const d = hyp(ww.x - h.pos.x, ww.z - h.pos.z); if (d < bd) { bd = d; best = q; } }
    if (best === p && bd < 4.2) { const bx = basketX(offT); const toB = new THREE.Vector3(bx - h.pos.x, 0, -h.pos.z).normalize(); x = h.pos.x + toB.x * 1.2; z = h.pos.z + toB.z * 1.2; }
  }
  return { x, z, face: h || null };
}
function pressSpot(p) {
  const h = ball.holder, offT = 1 - p.team;
  if (!h || h.team !== offT) return null;
  const man = teams[offT][p.idx];
  const fwdDir = S.attack[offT]; // 對手的進攻方向
  if (man === h) return { x: h.pos.x + fwdDir * 1.0, z: h.pos.z, face: h };
  // 最近的隊友去包夾持球者（靠邊線那側）
  let trap = null, td = 1e9;
  for (const q of teams[p.team]) { if (teams[offT][q.idx] === h) continue; const d = hyp(q.pos.x - h.pos.x, q.pos.z - h.pos.z); if (d < td) { td = d; trap = q; } }
  if (trap === p && td < 7) return { x: h.pos.x + fwdDir * 0.5, z: h.pos.z + (h.pos.z > 0 ? 0.9 : -0.9), face: h };
  // 其他人站在自己防守對象與球之間，阻斷傳球
  const t = 0.3; return { x: man.pos.x + (h.pos.x - man.pos.x) * t, z: man.pos.z + (h.pos.z - man.pos.z) * t, face: h };
}
function defenseSpot(p) {
  const sch = S.defense[p.team];
  if (sch === 'zone' && S.fc && S.poss === 1 - p.team) return zoneSpot(p);
  if (sch === 'press' && !S.fc && S.poss === 1 - p.team && S.phase === 'live') { const ps = pressSpot(p); if (ps) return ps; }
  const man = teams[1 - p.team][p.idx];
  const bx = basketX(1 - p.team), s = S.attack[1 - p.team];
  const toB = new THREE.Vector3(bx - man.pos.x, 0, -man.pos.z); const dB = toB.length(); toB.normalize();
  let x, z;
  const manBack = (man.pos.x * s) < -1;
  const h = ball.holder;
  if (h === man) {
    if (manBack) { const w = toWorld(1 - p.team, 10.5, man.pos.z * 0.6); return { x: w.x, z: w.z, face: man }; }
    const gap = clamp(dB * 0.15 + 0.9, 1.0, 1.6);
    x = man.pos.x + toB.x * gap; z = man.pos.z + toB.z * gap;
  } else {
    const bp = h ? h.pos : ball.pos;
    const sag = 0.3;
    x = man.pos.x + (bx - man.pos.x) * sag; z = man.pos.z * (1 - sag);
    const tb = hyp(bp.x - x, bp.z - z) || 1;
    const help = Math.min(1.4, tb * 0.2);
    x += (bp.x - x) / tb * help; z += (bp.z - z) / tb * help;
    // 協防與包夾：持球者切入禁區，或在低位持球太久
    if (h && h.team !== p.team && guardOf(h) !== p && p === helper(h) && (distB(h) < 4 || (distB(h) < 5 && h.holdT > 1.2))) {
      x = h.pos.x + (bx - h.pos.x) * 0.3; z = h.pos.z * 0.75;
    }
  }
  // 防守 3 秒：沒貼人就別一直待在禁區
  if (p.dkeyT > 2.0 && inKey(x, z, S.attack[1 - p.team])) z = (z < 0 ? -1 : 1) * (KEY_HALF + 0.5);
  if ((x - bx) * -s > 15) x = bx - s * 15;
  return { x, z, face: h || null };
}
function helper(h) {
  let best = null, bd = 1e9;
  for (const q of teams[1 - h.team]) { if (q === guardOf(h)) continue; const d = hyp(q.pos.x - h.pos.x, q.pos.z - h.pos.z); if (d < bd) { bd = d; best = q; } }
  return best;
}
function predictLanding() {
  const p = ball.pos.clone(), v = ball.vel.clone();
  for (let i = 0; i < 60; i++) { if (v.y < 0 && p.y < 2.6) break; v.y -= G * 0.03; p.addScaledVector(v, 0.03); }
  return p;
}
function chasers() {
  const lp = predictLanding(); const res = new Set();
  for (const t of teams) { const s = t.slice().sort((a, b) => hyp(a.pos.x - lp.x, a.pos.z - lp.z) - hyp(b.pos.x - lp.x, b.pos.z - lp.z)); res.add(s[0]); res.add(s[1]); }
  return { set: res, lp };
}
function reboundPhase() {
  if (S.phase !== 'live') return false;
  if (ball.state === 'shot') return ball.missed || (ball.shot && ball.shot.kind !== 'ft' && ball.shot.t > 0.15 && ball.shot.kind !== 'dunk');
  return ball.state === 'loose' && ball.missed && ball.pos.y > 1.4;
}
// 搶籃板：防守方轉身用屁股把自己的人卡在外面；進攻方長人衝籃下
function reboundTarget(p, ch) {
  const offT = ball.lastTeam, bx = basketX(offT);
  const lp = ch ? ch.lp : ball.pos;
  const low = ball.missed && ball.pos.y < 2.6 && ball.vel.y < 0;
  if (p.team !== offT) {
    const man = teams[offT][p.idx];
    if (low && ch && ch.set.has(p) && hyp(lp.x - p.pos.x, lp.z - p.pos.z) < 1.8) { p.boxing = null; return null; } // 球下來了，離得近就去搶
    if (man && hyp(man.pos.x - bx, man.pos.z) < 6.8) {
      const dx = bx - man.pos.x, dz = -man.pos.z, d = hyp(dx, dz) || 1;
      p.boxing = man;
      const tx = man.pos.x + dx / d * 0.62, tz = man.pos.z + dz / d * 0.62;
      return { x: tx, z: tz, spd: 1, sprint: hyp(tx - p.pos.x, tz - p.pos.z) > 1.4 };
    }
    return null;
  }
  const sh = ball.shot ? ball.shot.shooter : null;
  if (p !== sh && (p.role >= 3 || hyp(p.pos.x - bx, p.pos.z) < 4.2)) {
    // 繞過卡位的人往落點擠
    const b = opp(p).find(o => o.boxing === p && hyp(o.pos.x - p.pos.x, o.pos.z - p.pos.z) < 1.0);
    let tx = lp.x, tz = lp.z;
    if (b && (p.beatBoxT || 0) <= 0) { const sd = p.pos.z > b.pos.z ? 1 : -1; tz = b.pos.z + sd * 0.9; tx = b.pos.x; }
    return { x: tx, z: tz, spd: 1, sprint: true };
  }
  return null;
}
function aiTarget(p, ch) {
  const ph = S.phase;
  if (['tipoff', 'break', 'over', 'title', 'intro', 'timeout', 'replay'].includes(ph)) return { x: p.pos.x, z: p.pos.z, spd: 0 };
  if (p.ftSpot && (ph === 'ft' || (ph === 'live' && ball.state === 'shot' && ball.shot && ball.shot.kind === 'ft' && ball.vel.y > 0))) return { x: p.ftSpot.x, z: p.ftSpot.z, spd: 0.55, face: ball.holder || null };
  if (ph === 'inbound' && S.ib) {
    const ib = S.ib;
    if (p === ib.thrower) return ib.step === 'fetch' ? { x: ball.pos.x, z: ball.pos.z, spd: 1 } : { x: ib.spot.x, z: ib.spot.z, spd: 0.6 };
    if (p === ib.receiver) {
      const r = ib.spot.clone().addScaledVector(ib.inward, 3.6); r.x = clamp(r.x, -HX + 1, HX - 1);
      if (Math.abs(ib.spot.x) > HX) r.z = ib.spot.z > 0 ? 3.5 : -3.5; else r.x += S.attack[p.team] * (S.ibFront ? 1.2 : -1.5);
      return { x: r.x, z: r.z, spd: 0.8 };
    }
  }
  if (p.oop && ball.state === 'pass' && ball.pass && ball.pass.lob && ball.pass.to === p) return { x: p.oop.spot.x, z: p.oop.spot.z, spd: 1, sprint: true };
  if (ball.state === 'pass' && ball.pass && ball.pass.to === p) return { x: p.pos.x + (ball.pos.x - p.pos.x) * 0.15, z: p.pos.z + (ball.pos.z - p.pos.z) * 0.15, spd: 0.5 };
  if (reboundPhase()) { const rt = reboundTarget(p, ch); if (rt) return rt; }
  if ((ball.state === 'loose' || (ball.state === 'shot' && ball.shot && ball.shot.t > 0.3)) && ch && ch.set.has(p)) {
    const t = ball.pos.y < 1.2 ? ball.pos : ch.lp;
    return { x: t.x, z: t.z, spd: 1, sprint: true };
  }
  if (S.poss === p.team) {
    const w = offenseSpot(p);
    const back = p.pos.x * S.attack[p.team] < 0;
    return { x: w.x, z: w.z, spd: back ? 1 : 0.8, sprint: back };
  }
  if (S.poss < 0) { const d = defenseSpot(p); return { x: d.x, z: d.z, spd: 1 }; }
  const d = defenseSpot(p);
  const far = hyp(d.x - p.pos.x, d.z - p.pos.z) > (ball.holder && guardOf(ball.holder) === p ? 1.8 : 4);
  return { x: d.x, z: d.z, spd: 1, sprint: far, face: d.face };
}
// 擋拆：大個子上來幫持球者擋人，擋完往籃下切
function updateScreens(dt) {
  for (let t = 0; t < 2; t++) {
    S.screenCD[t] -= dt;
    let sc = S.screen[t];
    const h = ball.holder;
    if (!sc && S.phase === 'live' && h && h.team === t && S.poss === t && S.fc && !h.post && (S.screenCD[t] < 0 || (S.play[t] === 'pnr' && S.screenCD[t] < 5)) && h.holdT > (S.play[t] === 'pnr' ? 0.4 : 1.0) && distB(h) > 6.2 && distB(h) < 9.5) {
      const g = guardOf(h);
      const cands = teams[t].filter(p => p !== h && p.role >= 3 && !p.cutting);
      if (g && cands.length) {
        const screener = cands.sort((a, b) => hyp(a.pos.x - h.pos.x, a.pos.z - h.pos.z) - hyp(b.pos.x - h.pos.x, b.pos.z - h.pos.z))[0];
        const side = h.pos.z > 0 ? -1 : 1; // 往球場中間擋
        sc = S.screen[t] = { screener, handler: h, stage: 'set', t: 0, spot: new THREE.Vector3(g.pos.x, 0, g.pos.z + side * 0.7) };
        S.screenCD[t] = rand(7, 11);
        if (t === 0 && isUser(h)) showShotLabel('隊友上來擋拆', true);
      }
    }
    if (!sc) continue;
    sc.t += dt;
    if (!sc.screener.onCourt || ball.holder !== sc.handler || S.phase !== 'live') { S.screen[t] = null; continue; }
    const g = guardOf(sc.handler);
    if (sc.stage === 'set') {
      if (g) sc.spot.lerp(new THREE.Vector3(g.pos.x, 0, g.pos.z + (sc.handler.pos.z > 0 ? -0.7 : 0.7)), Math.min(1, dt * 2));
      if (hyp(sc.screener.pos.x - sc.spot.x, sc.screener.pos.z - sc.spot.z) < 0.45 || sc.t > 2.8) { sc.stage = 'hold'; sc.t = 0; sc.spot.copy(sc.screener.pos); }
    } else if (sc.stage === 'hold') {
      if (g && g.slowT <= 0 && hyp(g.pos.x - sc.screener.pos.x, g.pos.z - sc.screener.pos.z) < 0.75) {
        g.slowT = 0.7; // 撞上掩護
        // 換防：擋人者的防守者離持球者夠近就交換防守對象
        const sd = guardOf(sc.screener);
        if (sd && !sc.switched && hyp(sd.pos.x - sc.handler.pos.x, sd.pos.z - sc.handler.pos.z) < 2.8 && Math.random() < 0.7) {
          const i1 = g.idx; g.idx = sd.idx; sd.idx = i1; sc.switched = true; rebuildLists();
          if (sc.handler.team === 0 && isUser(sc.handler)) showShotLabel('對手換防', false);
        }
      }
      if (sc.t > 1.6) { sc.stage = 'roll'; sc.t = 0; }
    } else if (sc.t > 2.2) S.screen[t] = null;
  }
}

function aiHandler(p, dt) {
  p.decT -= dt;
  const bx = basketX(p.team), s = S.attack[p.team];
  const back = p.pos.x * s < 0.5;
  if (!p.drive) p.drive = { x: p.pos.x, z: p.pos.z };
  if (S.phase !== 'live' || p.action || p.jy > 0 || p.moveT > 0) return p.drive;
  if (p.decT > 0) return p.drive;
  p.decT = rand(0.18, 0.32);
  const d = distB(p);
  const [nd, cd] = nearestOpp(p);
  const three = isThreeSpot(p.pos.x, p.pos.z, p.team);
  if (!back && S.shotClock < 2.2) { startShot(p); return p.drive; }
  if (!back && d < 2.5 && p.holdT > 0.3) { startShot(p); return p.drive; }
  if (back) { const w = toWorld(p.team, 7.5, clamp(p.pos.z * 0.5, -3, 3)); p.drive = { x: w.x, z: w.z, sprint: S.bcT > 3 || Math.random() < 0.5 }; return p.drive; }
  if (!p.post && p.role >= 3 && d < 4.6 && p.holdT < 0.8 && Math.random() < 0.7) enterPost(p);
  if (p.post) {
    const doubled = opp(p).filter(o => hyp(o.pos.x - p.pos.x, o.pos.z - p.pos.z) < 2.0).length >= 2;
    if (doubled || p.holdT > p.post.dur) {
      if (doubled) {
        let best = null, bd = 0; for (const t of teams[p.team]) { if (t === p) continue; const od = nearestOpp(t)[1]; if (od > bd && laneClear(p, t)) { bd = od; best = t; } }
        if (best) { p.post = null; doPass(p, best); return p.drive; }
      }
      const r = Math.random();
      if (r < 0.55) { startShot(p); return p.drive; }
      if (r < 0.85) { dreamShake(p); return p.drive; }
      p.post = null;
    } else { p.drive = { x: basketX(p.team) - S.attack[p.team] * 1.2, z: p.pos.z * 0.6 }; return p.drive; }
  }
  const q = shotProb(p, d, cd, three, 'jump');
  if (three && d < 8.7 && cd > 1.25 && p.three >= 0.85 && p.holdT > 0.2 && Math.random() < 0.5) { startShot(p); return p.drive; }
  const thr = 0.33 + (S.shotClock > 14 ? 0.04 : 0) - (S.shotClock < 7 ? 0.08 : 0) - (three && cd > 1.6 ? 0.05 : 0);
  if ((p.holdT > 0.5 || (p.holdT > 0.2 && cd > 1.7)) && d < 8.4 && cd > 1.0 && q > thr && Math.random() < 0.55) { startShot(p); return p.drive; }
  // 被貼身防守時用運球招式
  if (cd < 1.3 && p.moveCD <= 0 && Math.random() < 0.22 * p.handle) { doMove(p, ['cross', 'spin', 'stepback', 'behind', 'hesi'][(Math.random() * 5) | 0]); return p.drive; }
  for (const t of teams[p.team]) {
    if (t === p || !t.dunk) continue;
    const scr2 = S.screen[t.team];
    const rolling = t.cutting > 0 || (scr2 && scr2.screener === t && scr2.stage === 'roll');
    if (rolling && distB(t) < 4.4 && d > 3.5 && nearestOpp(t)[1] > 0.9 && Math.random() < 0.16) { doPass(p, t); return p.drive; }
  }
  // 低位戰術：把球餵給低位
  if (S.play[p.team] === 'post') {
    const c = teams[p.team].find(t => t.role >= 3 && t !== p && distB(t) < 4.4);
    if (c && p.holdT > 0.7 && nearestOpp(c)[1] > 0.7 && laneClear(p, c) && Math.random() < 0.5) { doPass(p, c); return p.drive; }
  }
  let best = null, bq = -1;
  for (const t of teams[p.team]) {
    if (t === p) continue;
    if (S.fc && !inFront(t.team, t.pos.x)) continue;
    const [, od] = nearestOpp(t);
    const tq = shotProb(t, distB(t), od, isThreeSpot(t.pos.x, t.pos.z, t.team), 'jump') + (distB(t) < 2.5 && od > 1.2 ? 0.2 : 0) + Math.min(od, 3) * 0.02;
    if (tq > bq && laneClear(p, t)) { bq = tq; best = t; }
  }
  if (best && p.holdT > 0.6 && (bq > q + 0.1 && Math.random() < 0.55 || p.holdT > 3.8 + rand(0, 2))) { doPass(p, best); return p.drive; }
  const toB = new THREE.Vector3(bx - p.pos.x, 0, -p.pos.z).normalize();
  const dirNd = new THREE.Vector3(nd.pos.x - p.pos.x, 0, nd.pos.z - p.pos.z); const ndd = dirNd.length(); dirNd.normalize();
  let tx = bx - s * 1.0, tz = 0;
  const scr = S.screen[p.team];
  if (scr && scr.handler === p && scr.stage === 'hold') { // 利用掩護
    tx = scr.screener.pos.x - s * 1.2; tz = scr.screener.pos.z + (scr.screener.pos.z - p.pos.z) * 1.5;
  } else if (ndd < 1.6 && dirNd.dot(toB) > 0.75) {
    const side = Math.sign(toB.x * dirNd.z - toB.z * dirNd.x) || 1;
    tx = p.pos.x + toB.x * 2 + -toB.z * side * 2.2; tz = p.pos.z + toB.z * 2 + toB.x * side * 2.2;
  } else if (p.holdT < 1.2 && Math.random() < 0.35) { const w = offenseSpot(p); tx = w.x; tz = w.z; }
  if (S.fc) tx = s > 0 ? Math.max(tx, 0.8) : Math.min(tx, -0.8);
  p.drive = { x: clamp(tx, -HX + 0.6, HX - 0.6), z: clamp(tz, -HZ + 0.6, HZ - 0.6), sprint: Math.random() < 0.5 };
  return p.drive;
}
function laneClear(a, b) {
  const ax = a.pos.x, az = a.pos.z, dx = b.pos.x - ax, dz = b.pos.z - az, L2 = dx * dx + dz * dz;
  for (const q of opp(a)) {
    const t = clamp(((q.pos.x - ax) * dx + (q.pos.z - az) * dz) / L2, 0, 1);
    if (hyp(ax + dx * t - q.pos.x, az + dz * t - q.pos.z) < 0.9 && t > 0.1) return false;
  }
  return true;
}

// ================= 球員更新 =================
function updatePlayers(dt) {
  const ch = (ball.state === 'loose' || ball.state === 'shot') ? chasers() : null;
  const F = 720 / S.qlen;
  for (const p of players) {
    p.slowT -= dt; p.stealCD -= dt; p.noGrabT -= dt; p.landT -= dt; p.moveCD -= dt; p.openT -= dt; p.boxedT = (p.boxedT || 0) - dt; p.beatBoxT = (p.beatBoxT || 0) - dt;
    if (ball.holder === p) p.holdT += dt;
    if (!reboundPhase() || p.action) p.boxing = null;
    if (S.phase === 'live') { p.st.sec += dt; p.sta = Math.max(0.05, p.sta - dt * F * (0.0007 + (p.sprint ? 0.0009 : 0))); }
    if (p.cutting > 0) p.cutting -= dt;
    else if (S.poss === p.team && ball.holder !== p && S.phase === 'live') { p.cutT -= dt; if (p.cutT < 0) { p.cutT = rand(4, 9); if (p.idx !== 0 && S.play[p.team] !== 'post' && Math.random() < (p.dunk ? 0.75 : 0.5)) { p.cutting = 1.7; p.cutSide = rand(-1.0, 1.0); } } }
    const user = isUser(p);
    if (p.action) {
      p.actT += dt;
      if (p.action === 'shoot') {
        if (p.shotKind === 'hook') { if (p.actT > 0.06 && p.jy === 0 && p.jv === 0 && !p.released) jump(p, 2.6); if (!p.released && p.actT >= 0.32) releaseShot(p, null); }
        else if (p.actT > 0.1 && p.jy === 0 && p.jv === 0 && !p.released) { jump(p, 3.4); if (p.fade) { const Bf = new THREE.Vector3(basketX(p.team) - p.pos.x, 0, -p.pos.z).normalize(); p.vel.copy(Bf).multiplyScalar(-1.7); } }
        const fill = p.actT / 0.5;
        if (!p.released && p.shotKind !== 'hook') {
          if (user) { if (inp.b1Up || fill > 1.25) releaseShot(p, fill); }
          else if (p.actT >= p.aiRelease) releaseShot(p, null);
        }
      } else if ((p.action === 'layup' || p.action === 'dunk') && !p.released) {
        // 拉桿：空中把球收到腰間、換到另一側再出手，等防守者先落下
        if (!p.clutch && p.jy > 0.2 && p.jv > -0.5 && ((user && inp.b4Down) || (!user && opp(p).some(o => o.jy > 0.2 && hyp(o.pos.x - p.pos.x, o.pos.z - p.pos.z) < 1.4) && Math.random() < 0.5))) {
          p.clutch = { t: 0 }; p.hand = -p.hand; if (user) tutEv('clutch'); if (p.jv > 0.6) p.jv = Math.max(p.jv, 1.2);
          if (S.phase === 'live') setTimeout(() => say(pick(['空中拉桿！', '漂亮的拉桿！']), 1), 250);
        }
        if (p.clutch) { p.clutch.t += dt; if (p.clutch.t > 0.24) releaseShot(p, null); }
        else if (p.jv < 0.35) releaseShot(p, null);
      }
      else if ((p.action === 'pass' && p.actT > 0.3) || (p.action === 'steal' && p.actT > 0.35) || (p.action === 'contest' && p.actT > 0.6) || (p.action === 'follow' && p.actT > 0.6 && p.jy === 0)) p.action = null;
      if (p.released && p.clutch && (p.action === 'layup' || p.action === 'dunk' || p.action === 'hang' || !p.action)) p.clutch = null;
      if ((p.action === 'shoot' && p.released && p.jy === 0 && p.actT > 0.3 && !(p.fade = false)) || ((p.action === 'layup' || p.action === 'dunk' || p.action === 'block' || p.action === 'rebound') && p.jy === 0 && p.jv === 0 && p.actT > 0.1)) p.action = null;
    }
    if (p.oop) {
      p.oop.t += dt;
      if (!(ball.state === 'pass' && ball.pass && ball.pass.to === p)) p.oop = null;
      else if (p.oop.t > p.oop.T - 0.5 && !p.jy && jump(p, 4.8)) { p.action = 'rebound'; p.actT = 0; const to = new THREE.Vector3(p.oop.spot.x - p.pos.x, 0, p.oop.spot.z - p.pos.z); p.vel.copy(to.divideScalar(0.45)).clampLength(0, 5); }
    }
    if (!user && p.contestT > 0) {
      p.contestT -= dt;
      if (p.contestT <= 0) {
        const sh = ball.holder && ball.holder.team !== p.team ? ball.holder : (ball.shot ? ball.shot.shooter : null);
        if (sh) { const d = hyp(sh.pos.x - p.pos.x, sh.pos.z - p.pos.z); if (d < 1.6 && !p.action && jump(p, 3.3 + p.blk * 0.35)) p.action = 'block'; else if (!p.action) { p.action = 'contest'; p.actT = 0; } }
      }
    }
    if (!user && !p.action && S.phase === 'live' && (ball.state === 'loose' || (ball.state === 'shot' && ball.missed)) && ball.vel.y < 0 && ball.pos.y > 2.2 && ball.pos.y < 3.6 && hyp(ball.pos.x - p.pos.x, ball.pos.z - p.pos.z) < 1.0) { if (jump(p, 3.2 + p.reb * 0.3)) { p.action = 'rebound'; p.actT = 0; } }
    if (user && S.phase === 'live') {
      if (ball.holder === p) {
        if (inp.b1Down) startShot(p);
        if (inp.b2Down && !p.action) { const dir = inp.mag > 0.3 ? { x: inp.x, z: inp.z } : { x: Math.sin(p.facing), z: Math.cos(p.facing) }; doPass(p, passTarget(p, dir)); }
        if (inp.b4Down) { if (p.post) dreamShake(p); else if (distB(p) < 4.6 && S.fc) enterPost(p); else doMove(p); }
      } else {
        if (inp.b1Down && !p.action && jump(p, 3.45 + p.blk * 0.25)) { p.action = ball.holder || (ball.state === 'shot' && !ball.missed) ? 'block' : 'rebound'; p.actT = 0; }
        if (inp.b2Down) doSteal(p);
      }
    }
    let tgt = null;
    if (ball.holder === p && !user && S.phase === 'live') { const dv = aiHandler(p, dt); tgt = { x: dv.x, z: dv.z, spd: 1, sprint: dv.sprint }; }
    if (!user && S.phase === 'live' && ball.holder && ball.holder.team !== p.team && guardOf(ball.holder) === p && !p.action) {
      if (hyp(ball.holder.pos.x - p.pos.x, ball.holder.pos.z - p.pos.z) < 1.3 && Math.random() < dt * 0.05 * p.def * D().steal) doSteal(p);
    }
    // ---- 移動 ----
    const airborne = p.jy > 0;
    let want = new THREE.Vector3();
    let spdMul = 1, sprint = false, faceT = null;
    const base = 5.4 * p.spd * (0.82 + 0.18 * p.sta);
    if (airborne || p.action === 'hang') want = null;
    else if (p.moveT > 0) {
      p.moveT -= dt; want = null;
      if (p.moveKind === 'hesi' && p.moveT < p.moveDur - 0.25) p.moveVel.copy(p.moveB).multiplyScalar(7.0 * (0.82 + 0.18 * p.sta));
      p.vel.copy(p.moveVel); if (p.moveKind === 'spin') p.facing += p.spinDir * dt * 14;
    }
    else if (p.action === 'dream') {
      want = null;
      const Bv = new THREE.Vector3(basketX(p.team) - p.pos.x, 0, -p.pos.z).normalize(), Lv = new THREE.Vector3(-Bv.z, 0, Bv.x);
      if (p.actT < 0.25) { p.vel.copy(Lv).multiplyScalar(p.dreamSide * 1.2); p.facing += p.dreamSide * dt * 7; }
      else { p.vel.copy(Bv).multiplyScalar(3.6).addScaledVector(Lv, -p.dreamSide * 1.6); p.facing += -p.dreamSide * dt * 13; }
      if (p.actT > 0.55) { p.action = null; p.facing = Math.atan2(Bv.x, Bv.z); }
    }
    else if (p.action === 'euro') {
      want = null;
      const Bv = new THREE.Vector3(basketX(p.team) - p.pos.x, 0, -p.pos.z).normalize(), Lv = new THREE.Vector3(-Bv.z, 0, Bv.x);
      p.vel.copy(Bv).multiplyScalar(4.6).addScaledVector(Lv, p.euroSide * 3.4 * (p.actT < 0.18 ? 1 : -1));
      if (p.actT > 0.36) { p.action = null; startLayup(p, false); }
    }
    else if (p.action === 'shoot' || p.action === 'ftshoot' || (p.action === 'follow' && S.phase === 'ft') || (p.action === 'pass' && p.actT < 0.15) || (S.phase === 'ft' && S.ft && S.ft.shooter === p && S.ft.stage !== 'setup')) want.set(0, 0, 0);
    else if (p.scripted) { const dx = p.scripted.x - p.pos.x, dz = p.scripted.z - p.pos.z, d = hyp(dx, dz); if (d > 0.1) want.set(dx / d, 0, dz / d); spdMul = Math.min(1, d * 1.5); }
    else if (S.phase === 'contest3') want.set(0, 0, 0);
    else if (user && (inp.mag > 0.12 || ball.holder === p || S.phase === 'tipoff') && S.phase !== 'ft') {
      want.set(inp.x, 0, inp.z).multiplyScalar(inp.mag > 0.12 ? 1 : 0);
      sprint = inp.sprintHeld && p.sta > 0.15; spdMul = Math.min(1, inp.mag * 1.25);
      if (S.phase === 'inbound' && S.ib && S.ib.thrower === p) want.set(0, 0, 0);
    } else {
      tgt = tgt || aiTarget(p, ch);
      const dx = tgt.x - p.pos.x, dz = tgt.z - p.pos.z, d = hyp(dx, dz);
      if (d > 0.12) want.set(dx / d, 0, dz / d); spdMul = Math.min(tgt.spd, d * 0.9 + 0.05); sprint = !!tgt.sprint;
      if (tgt.face) faceT = tgt.face;
    }
    p.sprint = sprint && want && want.lengthSq() > 0;
    if (want) {
      let max = base * (sprint ? 1.28 : 1) * (ball.holder === p ? 0.9 : 1) * (p.slowT > 0 ? 0.45 : 1) * spdMul;
      if (p.post) {
        max = Math.min(max, 1.4);
        const Bp = new THREE.Vector3(basketX(p.team) - p.pos.x, 0, -p.pos.z).normalize();
        if (want.lengthSq() > 0.01 && want.clone().normalize().dot(Bp) < -0.5) p.post.away += dt; else p.post.away = 0;
        if (p.post.away > 0.35 || distB(p) > 5.8 || ball.holder !== p) p.post = null;
      }
      if (p.action === 'steal') max *= 0.5;
      want.multiplyScalar(max);
      const acc = 18 * dt; tmp.copy(want).sub(p.vel); if (tmp.length() > acc) tmp.setLength(acc); p.vel.add(tmp);
      if (ball.holder === p && S.phase === 'inbound') p.vel.multiplyScalar(0.5);
    }
    if (S.phase === 'live' && p.jy === 0) {
      const sp0 = hyp(p.vel.x, p.vel.z), lv = p.lastVel || (p.lastVel = new THREE.Vector3());
      const ls = hyp(lv.x, lv.z);
      if (sp0 > 3 && ls > 3 && (p.vel.x * lv.x + p.vel.z * lv.z) / (sp0 * ls) < 0.55 && p.pos.distanceTo(camera.position) < 16) sfx.squeak(clamp(1.2 - p.pos.distanceTo(camera.position) / 16, 0.2, 1));
      lv.copy(p.vel);
    }
    { const sp = hyp(p.vel.x, p.vel.z); p.accLean = (p.accLean || 0) * 0.85 + clamp((sp - (p.lastSpd || 0)) / dt / 14, -1, 1) * 0.15; p.lastSpd = sp; }
    // 電腦持球不會自己走出界；招式的位移也不會把人帶出去
    if (ball.holder === p && S.phase === 'live' && (!user || p.moveT > 0)) {
      if (Math.abs(p.pos.x + p.vel.x * 0.3) > HX - 0.35) p.vel.x *= 0.2;
      if (Math.abs(p.pos.z + p.vel.z * 0.3) > HZ - 0.35) p.vel.z *= 0.2;
    }
    p.pos.addScaledVector(p.vel, dt);
    if (p.action === 'dunk' && p.dunk && !p.released && (p.dunk.style === '360' || p.dunk.style === 'reverse')) {
      const tot = p.dunk.style === '360' ? Math.PI * 2 : Math.PI, rate = tot / Math.max(0.2, p.dunk.tApex);
      const step = Math.min(rate * dt, tot - p.dunk.spin); p.dunk.spin += step; p.facing += step;
    }
    if (p.action === 'hang') { if (p.hangFrom) { const u = Math.min(1, p.actT / 0.12), e = u * (2 - u); p.pos.x = p.hangFrom.x + (p.hangTo.x - p.hangFrom.x) * e; p.pos.z = p.hangFrom.z + (p.hangTo.z - p.hangFrom.z) * e; p.jy = p.hangFrom.y + (p.hangTo.y - p.hangFrom.y) * e; }
      p.hangT -= dt; p.vel.set(0, 0, 0); if (p.hangT <= 0) { p.action = null; p.dunk = null; p.jv = -0.5; p.vel.set(-Math.sin(p.facing) * 1.2, 0, -Math.cos(p.facing) * 1.2); } }
    else if (p.jy > 0 || p.jv > 0) { p.jv -= G * dt; p.jy += p.jv * dt; if (p.jy <= 0) { p.jy = 0; p.jv = 0; p.landT = 0.15; if (p.action === 'layup' || p.action === 'dunk') p.vel.multiplyScalar(0.3); } }
    // ---- 面向 ----
    let fa = null;
    if (['shoot', 'layup', 'dunk', 'hang', 'pass', 'steal', 'ftshoot', 'follow', 'dream'].includes(p.action) || p.moveT > 0) fa = null;
    else if (p.boxing && hyp(p.boxing.pos.x - p.pos.x, p.boxing.pos.z - p.pos.z) < 1.6) fa = Math.atan2(basketX(p.boxing.team) - p.pos.x, -p.pos.z);
    else if (p.post && ball.holder === p) fa = Math.atan2(p.pos.x - basketX(p.team), p.pos.z);
    else if (ball.holder === p && S.phase !== 'ft') { const sp = hyp(p.vel.x, p.vel.z); fa = sp > 1 ? Math.atan2(p.vel.x, p.vel.z) : Math.atan2(basketX(p.team) - p.pos.x, -p.pos.z); }
    else if (S.phase === 'ft') fa = Math.atan2(basketX(S.ft ? S.ft.team : 0) - p.pos.x, -p.pos.z);
    else if (S.poss !== p.team && S.phase === 'live' && hyp(p.vel.x, p.vel.z) < 4.2) { const f = faceT || ball.holder || null; const fp = f ? f.pos : ball.pos; fa = Math.atan2(fp.x - p.pos.x, fp.z - p.pos.z); }
    else if (hyp(p.vel.x, p.vel.z) > 1) fa = Math.atan2(p.vel.x, p.vel.z);
    else fa = Math.atan2(ball.pos.x - p.pos.x, ball.pos.z - p.pos.z);
    if (fa !== null) { let da = fa - p.facing; da = Math.atan2(Math.sin(da), Math.cos(da)); p.facing += clamp(da, -10 * dt, 10 * dt); }
    // ---- 姿勢 ----
    const scr = S.screen[p.team];
    p.celebT = (p.celebT || 0) - dt; p.dejT = (p.dejT || 0) - dt;
    if (p.action === 'ftshoot') p.pose = 'shoot';
    else if (p.action === 'euro' || p.action === 'dream') { p.pose = 'euro'; }
    else if (p.action === 'shoot' && p.shotKind === 'hook') p.pose = 'hook';
    else if (p.clutch && !p.released && (p.action === 'layup' || p.action === 'dunk')) p.pose = 'clutch';
    else if (p.action === 'dunk' && p.dunk && p.dunk.style === 'windmill') p.pose = 'windmill';
    else if (ball.holder === p && p.post && S.phase === 'live') { p.pose = 'post'; p.dribblePh += dt * 6; }
    else if (p.action) p.pose = p.action === 'rebound' ? 'rebound' : p.action;
    else if (p.boxing && hyp(p.boxing.pos.x - p.pos.x, p.boxing.pos.z - p.pos.z) < 1.3) p.pose = 'boxout';
    else if (p.moveT > 0 && (p.moveKind === 'cross' || p.moveKind === 'behind')) { p.pose = p.moveKind; p.dribblePh += dt * 14; }
    else if (p.moveT > 0 && p.moveKind === 'hesi' && p.moveT > p.moveDur - 0.25) { p.pose = 'hesi'; p.dribblePh += dt * 9; }
    else if (ball.holder === p) {
      if (S.phase === 'ft') p.pose = 'ftset';
      else if (S.phase === 'contest3') p.pose = 'hold';
      else { p.pose = S.phase === 'inbound' || S.phase === 'dead' ? 'hold' : 'dribble'; p.dribblePh += dt * (7 + hyp(p.vel.x, p.vel.z) * 0.9); }
    }
    else if ((scr && scr.screener === p && scr.stage === 'hold') || (S.play[p.team] === 'three' && p.role >= 3 && S.poss === p.team && S.phase === 'live' && ball.holder !== p && hyp(p.vel.x, p.vel.z) < 0.5)) p.pose = 'screen';
    else if (p.celebT > 0 && ball.holder !== p) p.pose = 'celebrate';
    else if (p.dejT > 0 && ball.holder !== p) p.pose = 'dejected';
    else if (S.phase === 'ft' || S.phase === 'dead' || S.phase === 'timeout') p.pose = hyp(p.vel.x, p.vel.z) > 0.6 ? 'run' : 'idle';
    else if (S.poss !== p.team && S.phase === 'live' && ball.holder && hyp(teams[1 - p.team][p.idx].pos.x - p.pos.x, teams[1 - p.team][p.idx].pos.z - p.pos.z) < 3.2 && hyp(p.vel.x, p.vel.z) < 4) p.pose = 'defense';
    else p.pose = 'run';
  }
  // ---- 卡位接觸：被卡在身後的人速度變慢、被往外推；籃板能力強的偶爾能繞過去 ----
  for (const p of players) {
    const o = p.boxing; if (!o || p.jy > 0) continue;
    const bx = basketX(o.team), dx = o.pos.x - p.pos.x, dz = o.pos.z - p.pos.z, d = hyp(dx, dz);
    const behind = (o.pos.x - bx) * (o.pos.x - bx) + o.pos.z * o.pos.z > (p.pos.x - bx) * (p.pos.x - bx) + p.pos.z * p.pos.z;
    if (d < 0.85 && behind && o.beatBoxT <= 0 && o.jy === 0) {
      o.boxedT = 0.25; o.slowT = Math.max(o.slowT, 0.12);
      if (d > 0.01) { o.pos.x += dx / d * 0.5 * dt; o.pos.z += dz / d * 0.5 * dt; }
      if (Math.random() < dt * 0.9 * o.reb / Math.max(0.5, p.reb) * (o.role >= 3 ? 1.2 : 0.8)) o.beatBoxT = 0.7;
    }
  }
  // ---- 身體碰撞與帶球撞人 ----
  S.chargeCD -= dt;
  for (let i = 0; i < players.length; i++) for (let j = i + 1; j < players.length; j++) {
    const a = players[i], b = players[j];
    const dx = b.pos.x - a.pos.x, dz = b.pos.z - a.pos.z, d = hyp(dx, dz), min = 0.34 * (a.scale + b.scale);
    if (d < min && d > 1e-4) {
      const nx = dx / d, nz = dz / d;
      // 持球者高速撞上站定的防守者
      if (S.phase === 'live' && S.chargeCD < 0 && a.team !== b.team) {
        const [h, df, sgn] = ball.holder === a ? [a, b, 1] : (ball.holder === b ? [b, a, -1] : [null]);
        if (h && h.jy === 0 && df.pose === 'defense' && hyp(df.vel.x, df.vel.z) < 1.2 && (h.vel.x * nx + h.vel.z * nz) * sgn > 4.2) {
          S.chargeCD = 2.5;
          if (Math.random() < 0.3) { callFoul(h, df, 'charge'); continue; }
          if (Math.random() < 0.12) { callFoul(df, h, 'block'); continue; }
        }
      }
      const wa = a.post && a.team !== b.team ? 0.2 : (b.post && a.team !== b.team ? 0.8 : 0.5);
      const ov = min - d; a.pos.x -= nx * ov * wa; a.pos.z -= nz * ov * wa; b.pos.x += nx * ov * (1 - wa); b.pos.z += nz * ov * (1 - wa);
    }
  }
  for (const p of players) {
    p.screenHitT = (p.screenHitT || 0) - dt;
    if (p.pose !== 'screen' || S.phase !== 'live') continue;
    for (const q of opp(p)) if ((q.screenHitT || 0) <= 0 && q.slowT <= 0 && hyp(q.pos.x - p.pos.x, q.pos.z - p.pos.z) < 0.7) { q.slowT = 0.5; q.screenHitT = 1.5; }
  }
  for (const p of players) { p.pos.x = clamp(p.pos.x, -(HX + 1.8), HX + 1.8); p.pos.z = clamp(p.pos.z, -(HZ + 1.3), HZ + 1.6); }
  const h = ball.holder;
  if (h && S.phase === 'live' && h.jy === 0 && (Math.abs(h.pos.x) > HX || Math.abs(h.pos.z) > HZ)) { S.stats[h.team].tov++; h.st.tov++; outOfBounds(h.pos.x, h.pos.z, h.team); }
}
// ---- 違例判定 ----
function checkViolations(dt) {
  if (S.phase !== 'live' || S.poss < 0) return;
  const t = S.poss, s = S.attack[t];
  const h = ball.holder;
  const control = ball.state === 'held' || ball.state === 'pass';
  if (!control) return;
  if (h && h.team === t) {
    if (inFront(t, h.pos.x)) S.fc = true;
    else if (S.fc && h.jy === 0 && h.pos.x * s < -0.3) { violation('回場違例'); return; }
  }
  if (!S.fc) { S.bcT += dt; if (S.bcT > 8) { violation('8 秒違例'); return; } }
  if (!S.fc) return;
  for (const p of teams[t]) {
    if (inKey(p.pos.x, p.pos.z, s) && !(p === h && p.action)) { p.keyT += dt; if (p.keyT > 3) { violation(`3 秒違例 ${tag(p)}`); return; } } else p.keyT = 0;
  }
  for (const p of teams[1 - t]) {
    let guarding = false; for (const q of teams[t]) if (hyp(q.pos.x - p.pos.x, q.pos.z - p.pos.z) < 1.7) { guarding = true; break; }
    if (inKey(p.pos.x, p.pos.z, s) && !guarding) {
      p.dkeyT += dt;
      if (p.dkeyT > 3) {
        sfx.whistle(); msg(`防守 3 秒 ${tag(p)}　技術犯規罰 1 球`);
        S.stats[p.team].pf++; p.dkeyT = 0;
        const shooter = teams[t].slice().sort((a, b) => b.ft - a.ft)[0];
        deadBall({ ft: true, shooter, n: 1, keep: true }, 1.3);
        S.keepAfterFT = { team: t, x: clamp((h || ball).pos.x, -12, 12) };
        return;
      }
    } else p.dkeyT = 0;
  }
}
function updateReferee(dt) {
  let tx, tz;
  if (S.phase === 'tipoff' && !(S.tip && S.tip.tossed && S.timer > 1.2)) { tx = 0; tz = -0.75; }
  else if (S.phase === 'ft' && S.ft) { tx = S.attack[S.ft.team] * (HX - 1.0); tz = -HZ - 0.4; }
  else { tx = clamp(ball.pos.x * 0.9, -12, 12); tz = -HZ - 0.55; }
  const dx = tx - referee.pos.x, dz = tz - referee.pos.z, d = hyp(dx, dz);
  const sp = Math.min(5.5, d * 1.5);
  const want = d > 0.1 ? new THREE.Vector3(dx / d * sp, 0, dz / d * sp) : new THREE.Vector3();
  tmp.copy(want).sub(referee.vel); if (tmp.length() > 14 * dt) tmp.setLength(14 * dt); referee.vel.add(tmp);
  referee.pos.addScaledVector(referee.vel, dt);
  const fa = Math.atan2(ball.pos.x - referee.pos.x, ball.pos.z - referee.pos.z);
  let da = Math.atan2(Math.sin(fa - referee.facing), Math.cos(fa - referee.facing)); referee.facing += clamp(da, -6 * dt, 6 * dt);
  referee.pose = S.phase === 'tipoff' && S.timer < 0.85 ? 'hold' : (hyp(referee.vel.x, referee.vel.z) > 0.5 ? 'run' : 'idle');
}

// ================= 重播 =================
const REC = { frames: [], max: 260 };
let renderTick = 0;
function recordFrame(dt) {
  const ents = [...players, referee];
  const f = { dt, rigs: ents.map(e => e.rig), data: new Float32Array(ents.length * 24 + 3) };
  let o = 0;
  for (const e of ents) {
    const r = e.rig; f.data[o++] = r.root.position.x; f.data[o++] = r.root.position.z; f.data[o++] = r.root.rotation.y; f.data[o++] = r.body.position.y;
    for (const j of r.joints) { f.data[o++] = j.rotation.x; f.data[o++] = j.rotation.z; }
  }
  f.data[o++] = ball.pos.x; f.data[o++] = ball.pos.y; f.data[o++] = ball.pos.z;
  REC.frames.push(f); if (REC.frames.length > REC.max) REC.frames.shift();
}
function applyFrame(f) {
  let o = 0;
  for (const r of f.rigs) {
    r.root.position.set(f.data[o++], 0, f.data[o++]); r.root.rotation.y = f.data[o++]; r.body.position.y = f.data[o++];
    for (const j of r.joints) { j.rotation.x = f.data[o++]; j.rotation.z = f.data[o++]; }
  }
  ball.pos.set(f.data[o++], f.data[o++], f.data[o++]);
}
function startReplay() {
  const hl = S.highlight; S.highlight = null;
  if (REC.frames.length < 30) return false;
  // 從得分前約 3 秒開始，慢動作播放
  let acc = 0, start = REC.frames.length - 1;
  while (start > 0 && acc < 3.4) { acc += REC.frames[start].dt; start--; }
  S.replay = { frames: REC.frames.slice(start), i: 0, t: 0, side: hl.side, saved: ball.pos.clone() };
  S.phase = 'replay'; applyFrame(S.replay.frames[0]);
  return true;
}
function updateReplay(dt) {
  const R = S.replay; R.t += dt * 0.5;
  let acc = 0, i = 0; while (i < R.frames.length - 1 && acc + R.frames[i].dt < R.t) { acc += R.frames[i].dt; i++; }
  applyFrame(R.frames[i]);
  if (i >= R.frames.length - 1) finishReplay();
}
function finishReplay() {
  const R = S.replay; S.replay = null;
  ball.pos.copy(R.saved);
  S.phase = 'dead'; S.timer = 0.01; S.afterReplay = true;
}
function skipCinematic() {
  if (S.phase === 'replay') finishReplay();
  else if (S.phase === 'intro') S.introT = 99;
}

// ================= 賽前介紹 =================
function startIntro() {
  S.phase = 'intro'; S.introT = 0; S.introCard = false;
  const card = (t) => `<div class="lu c${t}"><h3>${TEAM_INFO[t].name}　先發</h3>` + teams[t].map(p => `<div><b>#${p.num}</b><span>${POS_NAMES[p.role]}</span><small>${p.hcm} cm</small></div>`).join('') + '</div>';
  $('introCard').innerHTML = card(0) + '<div class="vs">VS</div>' + card(1);
}
function updateIntro(dt) {
  S.introT += dt;
  if (S.introT > 2.6 && !S.introCard) { S.introCard = true; $('intro').classList.add('show'); }
  if (S.introT > 7.5) { $('intro').classList.remove('show'); startTipoff(); }
}

// ================= 個人賽 =================
const RACK_UV = [[1.0, 7.05], [5.3, 5.3], [7.6, 0], [5.3, -5.3], [1.0, -7.05]];
const DUNKS = { one: ['單手灌籃', 7.0], two: ['雙手暴扣', 7.4], windmill: ['風車灌籃', 8.6], '360': ['360 轉身灌籃', 9.0], reverse: ['背扣', 8.3] };
const racks = [];
function buildRacks() {
  if (racks.length) return;
  const moneyTex = (() => { const c = document.createElement('canvas'); c.width = 256; c.height = 128; const g = c.getContext('2d'); ['#c62828', '#ffffff', '#1d3f91', '#ffffff'].forEach((col, i) => { g.fillStyle = col; g.fillRect(i * 64, 0, 64, 128); }); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; })();
  const metal = new THREE.MeshStandardMaterial({ color: 0x9aa3ad, metalness: 0.7, roughness: 0.35 });
  const moneyMat = new THREE.MeshStandardMaterial({ map: moneyTex, roughness: 0.7 });
  for (let i = 0; i < 5; i++) {
    const g = new THREE.Group();
    const frame = new THREE.Mesh(new THREE.BoxGeometry(1.25, 0.04, 0.32), metal); frame.position.y = 0.62; g.add(frame);
    for (const x of [-0.58, 0.58]) for (const z of [-0.13, 0.13]) { const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.62, 6), metal); leg.position.set(x, 0.31, z); g.add(leg); }
    const balls = [];
    for (let k = 0; k < 5; k++) { const b = new THREE.Mesh(ballMesh.geometry, k === 4 ? moneyMat : ballMesh.material); b.position.set(-0.5 + k * 0.25, 0.76, 0); g.add(b); balls.push(b); }
    g.userData.balls = balls; g.visible = false; scene.add(g); racks.push(g);
  }
}
function soloSetup(p) {
  for (const q of [...roster[0], ...roster[1]]) { q.hidden = q !== p; q.onCourt = q === p; q.walkTo = null; q.action = null; q.post = null; q.oop = null; }
  referee.hidden = true; p.idx = 1; p.jy = 0; p.jv = 0; p.vel.set(0, 0, 0); p.sta = 1;
  teams[0] = [p]; teams[1] = []; players = [p]; ctrl = p; S.attack = [1, -1]; S.poss = 0; S.fc = true;
  $('title').classList.remove('show'); $('brk').classList.remove('show'); $('hud').classList.add('show');
  document.body.classList.add('solo'); document.body.classList.toggle('solo3', S.mode === 'three'); $('chud').style.display = 'block';
}
function giveSoloBall(p) { ball.state = 'held'; ball.holder = p; ball.shot = null; ball.vel.set(0, 0, 0); ball.missed = false; ball.rimTouched = false; p.holdT = 0; }
// ================= 練習／教學 =================
// 練習：一個人在半場自由投籃、運球、灌籃；球落地後會自動彈回手上
// 教學：同一個場地，照步驟一個一個做，完成才進下一步（說明用底部字幕＋語音）
const tutRing = new THREE.Mesh(new THREE.RingGeometry(0.55, 0.75, 40), new THREE.MeshBasicMaterial({ color: 0x5dd36b, transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false }));
tutRing.rotation.x = -Math.PI / 2; tutRing.position.y = 0.02; tutRing.visible = false; scene.add(tutRing);
const TUT = [
  { text: '歡迎來到教學。用左下角的搖桿移動，走到地上的綠色圈圈。', ring: [6.0, 3.5], done: (p, t) => t.atRing },
  { text: '很好！按住右邊的「加速」再推搖桿，可以跑得更快。加速跑到下一個圈圈。', ring: [9.5, -4.0], done: (p, t) => t.atRing && t.sprinted },
  { text: '持球時按「招式」做運球招式：搖桿往旁邊推是換手或胯下，往後拉是後撤步，不推是轉身。做一次招式。', done: (p, t) => t.ev.move },
  { text: '練跳投：按住「投籃」，力道條會往上跑，在綠色區放開就是完美出手。投一次完美出手。', ring: [4.6, 0], done: (p, t) => t.ev.perfect },
  { text: '綠色區會變寬變窄：離籃框越遠、被防守越緊就越窄。到三分線外投進一球。', ring: [8.0, 0], done: (p, t) => t.ev.three },
  { text: '往籃框跑，靠近時按「投籃」就是上籃。上籃進一球。', ring: [7.0, -3.0], done: (p, t) => t.ev.layup },
  { text: '按住「加速」往籃框衝，靠近時按「投籃」就是灌籃。灌進一球。', ring: [8.0, 2.5], done: (p, t) => t.ev.dunk },
  { text: '上籃或灌籃跳起來之後，在空中按「招式」就是拉桿，可以躲過封阻。做一次空中拉桿。', done: (p, t) => t.ev.clutch },
  { text: '沿著底線切入，靠近籃框時把搖桿往籃框另一邊推再按「投籃」，就是反手上籃。做一次反手上籃。', ring: [1.2, 4.0], done: (p, t) => t.ev.reverse },
  { text: '教學完成！之後可以在主畫面選「練習」自由練習。', done: (p, t) => t.t > 5 },
];
function tutEv(k) { if (S.tut) S.tut.ev[k] = true; }
function tutStep(i) {
  const t = S.tut; t.i = i; t.t = 0; t.ev = {}; t.atRing = false; t.sprinted = false;
  const st = TUT[i]; t.text = st.text; say(st.text, 3);
  if (st.ring) { const w = toWorld(0, st.ring[0], st.ring[1]); tutRing.position.set(w.x, 0.02, w.z); tutRing.visible = true; } else tutRing.visible = false;
}
function startPractice(tutorial) {
  S.mode = tutorial ? 'tutorial' : 'practice';
  const p = roster[0][2]; soloSetup(p);
  $('chud').style.display = 'none';
  const w = toWorld(0, 8.0, 0); p.pos.set(w.x, 0, w.z); p.facing = Math.atan2(BASKET_X - p.pos.x, -p.pos.z);
  giveSoloBall(p); S.phase = 'practice'; S.pr = { idle: 0, ret: null, makes: 0 };
  S.tut = null;
  if (tutorial) { S.tut = { i: 0, t: 0, ev: {} }; tutStep(0); } else say('自由練習：投籃、運球、灌籃都可以，球會自動回到你手上。', 2);
}
function practiceScored() {
  const sh = ball.shot; if (!sh || S.pr.counted === sh) return;
  S.pr.counted = sh; sfx.swish();
  if (ball.hRec) ball.hRec.made = true;
  if (sh.kind === 'dunk') { sfx.slam(); buzz(60); }
  if (sh.three) tutEv('three'); if (sh.kind === 'layup') tutEv('layup'); if (sh.kind === 'dunk') tutEv('dunk');
}
function updatePractice(dt) {
  const p = ctrl, pr = S.pr;
  if (ball.holder === p && !p.action) {
    if (inp.b1Down) startShot(p);
    if (inp.b4Down) doMove(p);
  } else if (ball.holder !== p && inp.b1Down && !p.action && jump(p, 3.45)) { p.action = 'rebound'; p.actT = 0; }
  updatePlayers(dt);
  if (pr.ret) { // 球自己彈回來：沿拋物線飛回球員胸前
    const R = pr.ret; R.t += dt; const u = Math.min(1, R.t / R.T);
    const to = chest(p);
    ball.pos.lerpVectors(R.from, to, u); ball.pos.y += Math.sin(u * Math.PI) * 1.2;
    if (u >= 1) { pr.ret = null; giveSoloBall(p); }
  } else {
    stepBall(dt);
    if (ball.holder !== p && ball.state !== 'pass') {
      if (hyp(ball.pos.x - p.pos.x, ball.pos.z - p.pos.z) < 0.55 && ball.pos.y < 2.3 + p.jy && ball.state !== 'shot') giveSoloBall(p); // 自己撿到
      else {
        const settled = ball.pos.y < 0.5 || Math.abs(ball.pos.x) > HX || Math.abs(ball.pos.z) > HZ;
        pr.idle = settled ? pr.idle + dt : 0;
        if (pr.idle > 0.9) { pr.idle = 0; ball.state = 'dead'; ball.vel.set(0, 0, 0); pr.ret = { from: ball.pos.clone(), t: 0, T: 0.75 }; }
      }
    }
  }
  const t = S.tut; if (!t) return;
  t.t += dt;
  if (tutRing.visible) { tutRing.material.opacity = 0.55 + Math.sin(t.t * 5) * 0.25; if (hyp(p.pos.x - tutRing.position.x, p.pos.z - tutRing.position.z) < 0.8) { t.atRing = true; } }
  if (p.sprint) t.sprinted = true;
  if (t.i === 1 && !t.sprinted) t.atRing = false;
  if (t.wait > 0) { t.wait -= dt; if (t.wait <= 0) { if (t.i + 1 < TUT.length) tutStep(t.i + 1); else tutDone(); } return; }
  if (TUT[t.i].done(p, t)) { sfx.cheer(0.4); if (t.i + 1 < TUT.length) say(pick(['很好！', '漂亮！', '做得好！']), 3); t.wait = 1.6; tutRing.visible = false; }
}
function tutDone() {
  S.tut = null; $('sub').className = ''; S.mode = 'practice';
  $('brkTitle').textContent = '教學完成'; $('brkSub').textContent = '接下來可以自由練習，或回主畫面開始比賽'; $('brkStats').innerHTML = '';
  $('brkBtn').textContent = '自由練習'; $('brkBtn2').style.display = ''; S.practiceDone = true; $('brk').classList.add('show');
}
function startThree() {
  S.mode = 'three'; buildRacks();
  const p = roster[0][1]; soloSetup(p);
  S.c3 = { rack: 0, k: 0, t: 60, score: 0, wait: 0, moving: false, started: false, intro: 2.2, made: [] };
  RACK_UV.forEach(([u, v], i) => { const w = toWorld(0, u + 0.9, v * 1.08); const r = racks[i]; r.visible = true; r.position.set(w.x, 0, w.z); r.rotation.y = Math.atan2(w.x - BASKET_X, w.z) + Math.PI / 2; r.userData.balls.forEach(b => b.visible = true); });
  const w = toWorld(0, ...RACK_UV[0]); p.pos.set(w.x, 0, w.z);
  p.facing = Math.atan2(BASKET_X - p.pos.x, -p.pos.z);
  giveSoloBall(p); S.phase = 'contest3'; msg('三分大賽　60 秒', 'big');
}
function contest3Next() {
  const c = S.c3, p = ctrl;
  c.k++;
  if (c.k >= 5) { c.k = 0; c.rack++; if (c.rack >= 5) return endContest(); c.moving = true; p.scripted = toWorld(0, ...RACK_UV[c.rack]); ball.state = 'dead'; ball.holder = null; ball.pos.set(0, -5, 0); return; }
  racks[c.rack].userData.balls[c.k - 1].visible = false;
  giveSoloBall(p);
}
function updateContest3(dt) {
  const c = S.c3, p = ctrl;
  if (c.intro > 0) { c.intro -= dt; if (c.intro <= 0) msg('開始！'); updatePlayers(dt); stepBall(dt); return; }
  c.t -= dt;
  if (c.t <= 0) { c.t = 0; return endContest(); }
  if (c.moving) {
    const tg = p.scripted; if (hyp(tg.x - p.pos.x, tg.z - p.pos.z) < 0.25) { c.moving = false; p.scripted = null; p.vel.set(0, 0, 0); p.facing = Math.atan2(BASKET_X - p.pos.x, -p.pos.z); racks[c.rack].userData.balls[0].visible = false; giveSoloBall(p); }
  } else if (ball.holder === p && !p.action) {
    if (c.k === 0 && racks[c.rack].userData.balls[0].visible) racks[c.rack].userData.balls[0].visible = false;
    p.facing = Math.atan2(BASKET_X - p.pos.x, -p.pos.z);
    if (inp.b1Down || (AUTO && p.holdT > 0.4)) startShot(p);
  } else if (ball.state === 'shot' || ball.state === 'loose') {
    c.wait += dt;
    if (c.scoredThis || c.wait > 1.7 || (ball.missed && ball.pos.y < 2.2)) { c.wait = 0; c.scoredThis = false; contest3Next(); }
  }
  updatePlayers(dt); stepBall(dt);
}
function contest3Scored() {
  const c = S.c3; if (c.scoredThis) return;
  const pts = c.k === 4 ? 2 : 1; c.score += pts; c.scoredThis = true;
  sfx.swish(); sfx.cheer(pts === 2 ? 0.8 : 0.4); buzz(20);
  if (pts === 2) showShotLabel('彩球 +2', true);
}
function startDunk() {
  S.mode = 'dunk';
  const p = roster[0][2]; soloSetup(p);
  S.cd = { n: 0, total: 0, style: 'two', state: 'ready', t: 0, results: [] };
  resetDunker(p); S.phase = 'contestD'; msg('灌籃大賽　共 3 次', 'big');
}
function resetDunker(p) {
  const w = toWorld(0, 9.2, rand(-2.5, 2.5)); p.pos.set(w.x, 0, w.z); p.vel.set(0, 0, 0); p.jy = 0; p.jv = 0; p.action = null; p.dunk = null;
  p.facing = Math.atan2(BASKET_X - p.pos.x, -p.pos.z); giveSoloBall(p); S.cd.state = 'ready'; S.cd.t = 0;
}
function updateDunk(dt) {
  const c = S.cd, p = ctrl; c.t += dt;
  if (c.state === 'ready') {
    if (inp.b4Down) { const ks = Object.keys(DUNKS); c.style = ks[(ks.indexOf(c.style) + 1) % ks.length]; showShotLabel(DUNKS[c.style][0], true); }
    if (inp.b1Down && ball.holder === p && !p.action) {
      const d = distB(p), sp = hyp(p.vel.x, p.vel.z);
      if (d > 3.8) showShotLabel('太遠了，再靠近一點');
      else {
        c.quality = (d >= 2.0 && d <= 3.3 ? 0.4 : d < 1.4 ? -0.8 : -0.1) + clamp((sp - 4.0) * 0.2, -0.6, 0.4);
        p.forceStyle = c.style; p.forceMake = d >= 1.2 && d <= 3.6 && Math.random() < (c.style === '360' ? 0.82 : c.style === 'windmill' ? 0.88 : 0.95);
        startLayup(p, true); c.state = 'air'; c.t = 0;
      }
    }
  } else if (c.state === 'air') {
    if (c.t > 1.6 && (ball.state !== 'shot' || ball.pos.y < 1.5)) judgeDunk(c.made);
  } else if (c.state === 'judge' && c.t > 3.2) {
    $('judges').classList.remove('show');
    if (c.n >= 3) return endContest();
    resetDunker(p);
  }
  updatePlayers(dt); stepBall(dt);
}
function contestDScored() { if (S.cd.state === 'air') { S.cd.made = true; sfx.swish(); sfx.slam(); buzz(60); } }
function judgeDunk(made) {
  const c = S.cd; c.n++; c.state = 'judge'; c.t = 0;
  const base = DUNKS[c.style][1];
  const scores = made ? Array.from({ length: 5 }, () => Math.round(clamp(base + c.quality + rand(-0.8, 0.8), 6, 10))) : [0, 0, 0, 0, 0];
  const sum = scores.reduce((a, b) => a + b, 0); c.total += sum; c.made = false; c.results.push(sum);
  $('judges').innerHTML = `<div class="jt">${made ? DUNKS[c.style][0] : '沒灌進'}</div><div class="jc">${scores.map(v => `<b class="${v === 10 ? 'ten' : ''}">${v}</b>`).join('')}</div><div class="js">${sum} 分</div>`;
  $('judges').classList.add('show');
  if (made) { sfx.cheer(sum >= 45 ? 1 : 0.6); arena.crowdUniforms.uCheer.value = sum >= 45 ? 1 : 0.5; } else sfx.groan();
}
function endContest() {
  const three = S.mode === 'three';
  const score = three ? S.c3.score : S.cd.total;
  const key = three ? 'best3' : 'bestD'; const best = Math.max(store.get(key, 0), score); store.set(key, best);
  const lv = [0.85, 1, 1.12][S.diff];
  const rivals = three ? [0, 1, 2].map(() => Math.round(rand(13, 22) * lv)) : [0, 1, 2].map(() => Math.round(rand(110, 135) * lv));
  const all = [{ n: '你（' + tag(ctrl) + '）', s: score, me: true }, ...rivals.map((s, i) => ({ n: `對手 ${i + 1}`, s }))].sort((a, b) => b.s - a.s);
  const rank = all.findIndex(x => x.me) + 1;
  S.phase = 'over'; S.contestOver = true;
  racks.forEach(r => r.visible = false);
  $('brkTitle').textContent = rank === 1 ? `🏆 ${three ? '三分大賽' : '灌籃大賽'}冠軍！` : `${three ? '三分大賽' : '灌籃大賽'}　第 ${rank} 名`;
  $('brkSub').textContent = `你的分數 ${score}　個人最佳 ${best}`;
  $('brkStats').innerHTML = '<table class="tm">' + all.map((x, i) => `<tr><th>${i + 1}</th><td style="text-align:left${x.me ? ';color:#ffd34d;font-weight:800' : ''}">${x.n}</td><td>${x.s}</td></tr>`).join('') + '</table>';
  $('brkBtn').textContent = '再來一次'; $('brkBtn2').style.display = 'inline-block';
  $('brk').classList.add('show'); sfx.buzzer(); if (rank === 1) sfx.cheer(1);
}
function updateContestHUD() {
  const el = $('chud');
  if (S.mode === 'three' && S.c3) {
    const c = S.c3;
    const dots = RACK_UV.map((_, i) => '<span class="rk">' + [0, 1, 2, 3, 4].map(k => `<i class="${i < c.rack || (i === c.rack && k < c.k) ? 'used' : ''}${k === 4 ? ' money' : ''}"></i>`).join('') + '</span>').join('');
    el.innerHTML = `<b>三分大賽</b>　剩 <b class="${c.t < 10 ? 'warn' : ''}">${c.t.toFixed(1)}</b> 秒　分數 <b>${c.score}</b><div>${dots}</div>`;
  } else if (S.mode === 'dunk' && S.cd) {
    const c = S.cd;
    el.innerHTML = `<b>灌籃大賽</b>　第 ${Math.min(3, c.n + 1)} / 3 次　總分 <b>${c.total}</b><div>招式：<b>${DUNKS[c.style][0]}</b>（按「招式」切換，衝向籃框按「投籃」起跳）</div>`;
  }
}
function exitSolo() {
  document.body.classList.remove('solo', 'solo3'); $('chud').style.display = 'none'; $('judges').classList.remove('show'); $('brkBtn2').style.display = 'none';
  racks.forEach(r => r.visible = false);
  for (const q of [...roster[0], ...roster[1]]) { q.hidden = false; q.scripted = null; q.forceStyle = null; q.forceMake = null; }
  referee.hidden = false; S.contestOver = false; S.c3 = null; S.cd = null; S.pr = null; S.tut = null; tutRing.visible = false; $('sub').className = '';
}

// ================= 設定 =================
function applySettings() {
  document.documentElement.style.setProperty('--bs', SET.size);
  document.body.classList.toggle('lefty', SET.lefty);
  const def = { b1: [8, 26], b2: [112, 22], b3: [22, 128], b4: [100, 100] };
  for (const id of ['b1', 'b2', 'b3', 'b4']) {
    const el = $(id); const [x, y] = SET.pos[id] || def[id];
    el.style.bottom = y + 'px';
    if (SET.lefty) { el.style.left = `calc(max(18px, env(safe-area-inset-left)) + ${x}px)`; el.style.right = 'auto'; }
    else { el.style.right = `calc(max(18px, env(safe-area-inset-right)) + ${x}px)`; el.style.left = 'auto'; }
  }
  const joyEl = $('joy'); if (SET.lefty) { joyEl.style.right = 'calc(max(20px, env(safe-area-inset-right)) + 10px)'; joyEl.style.left = 'auto'; } else { joyEl.style.right = ''; }
  document.querySelectorAll('#setp .opt').forEach(g => { const k = g.dataset.s; g.querySelectorAll('button').forEach(b => b.classList.toggle('on', String(k === 'lefty' || k === 'vib' || k === 'voice' ? +SET[k] : SET[k]) === b.dataset.v)); });
}
document.querySelectorAll('#setp .opt').forEach(g => g.addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return; const k = g.dataset.s;
  SET[k] = k === 'size' ? +b.dataset.v : (k === 'lefty' || k === 'vib' || k === 'voice') ? b.dataset.v === '1' : b.dataset.v;
  store.set('settings', SET); applySettings();
}));
const openSet = () => { $('setp').classList.add('show'); applySettings(); };
$('setBtn').addEventListener('click', openSet); $('setBtn2').addEventListener('click', () => { $('pause').classList.remove('show'); openSet(); });
$('setClose').addEventListener('click', () => { $('setp').classList.remove('show'); if (S.paused) $('pause').classList.add('show'); });
$('resetPos').addEventListener('click', () => { SET.pos = {}; store.set('settings', SET); applySettings(); });
$('editBtn').addEventListener('click', () => { $('setp').classList.remove('show'); document.body.classList.add('edit'); $('hud').classList.add('show'); });
$('editDone').addEventListener('click', () => { document.body.classList.remove('edit'); store.set('settings', SET); if (S.phase === 'title') $('hud').classList.remove('show'); openSet(); });
// 編輯模式：拖曳按鈕
let drag = null;
for (const id of ['b1', 'b2', 'b3', 'b4']) $(id).addEventListener('pointerdown', e => {
  if (!document.body.classList.contains('edit')) return;
  e.stopImmediatePropagation(); drag = { id, pid: e.pointerId }; $(id).setPointerCapture?.(e.pointerId);
}, true);
addEventListener('pointermove', e => {
  if (!drag || e.pointerId !== drag.pid) return;
  const el = $(drag.id), w = el.offsetWidth, h = el.offsetHeight;
  const x = SET.lefty ? e.clientX - w / 2 - 18 : innerWidth - e.clientX - w / 2 - 18, y = innerHeight - e.clientY - h / 2;
  SET.pos[drag.id] = [clamp(Math.round(x), 0, innerWidth - w - 20), clamp(Math.round(y), 0, innerHeight - h - 10)]; applySettings();
});
addEventListener('pointerup', e => { if (drag && e.pointerId === drag.pid) drag = null; });
applySettings();
$('helpBtn').addEventListener('click', () => $('helpBox').classList.toggle('show'));

// ================= 主迴圈 =================
function update(dt) {
  readInput(dt);
  if (AUTO && S.phase === 'break') { S.timer -= dt; if (S.timer < -2) { S.timer = 0; continueBreak(); } }
  if (AUTO && S.phase === 'intro') S.introT = 99;
  if (S.phase !== 'title' && !S.paused) {
    if (S.phase === 'intro') { updateIntro(dt); inp.b1Down = inp.b1Up = inp.b2Down = inp.b4Down = false; return; }
    if (S.phase === 'contest3') { updateContest3(dt); inp.b1Down = inp.b1Up = inp.b2Down = inp.b4Down = false; return; }
    if (S.phase === 'practice') { updatePractice(dt); inp.b1Down = inp.b1Up = inp.b2Down = inp.b4Down = false; return; }
    if (S.phase === 'contestD') { updateDunk(dt); inp.b1Down = inp.b1Up = inp.b2Down = inp.b4Down = false; return; }
    if (S.phase === 'replay') { updateReplay(dt); inp.b1Down = inp.b1Up = inp.b2Down = inp.b4Down = false; return; }
    if (S.phase === 'timeout') { updateBench(dt); updateHuddle(dt); inp.b1Down = inp.b1Up = inp.b2Down = inp.b4Down = false; return; }
    S.gameT += dt;
    if (inp.b4Down && ball.holder?.team !== 0 && S.phase !== 'ft') {
      let best = null, bd = 1e9; for (const p of teams[0]) { if (p === ctrl) continue; const d = hyp(p.pos.x - ball.pos.x, p.pos.z - ball.pos.z); if (d < bd) { bd = d; best = p; } }
      if (best) ctrl = best;
    }
    if (S.phase === 'tipoff') updateTipoff(dt);
    if (S.phase === 'inbound') updateInbound(dt);
    if (S.phase === 'ft') updateFT(dt);
    if (S.phase === 'dead') {
      S.timer -= dt;
      if (S.timer <= 0) {
        if (S.highlight && !S.afterReplay && startReplay()) { /* 重播中 */ }
        else {
          S.afterReplay = false;
          // 電腦被打出一波攻勢時叫暫停
          if (!AUTO && !S.aiTOused && S.run[0] >= 8 && S.timeouts[1] > 0 && S.next && S.next.team === 1 && !S.next.ft) { S.aiTOused = true; S.run[0] = 0; callTimeout(1); }
          else {
            const nx = S.next;
            autoSubs();
            if (nx === 'end') endQuarter();
            else if (nx.ft) startFT(nx.shooter.onCourt ? nx.shooter : teams[nx.shooter.team][nx.shooter.idx >= 0 ? nx.shooter.idx : 0], nx.n, nx.keep);
            else startInbound(nx);
          }
        }
      }
    }
    if ((S.phase === 'dead' || S.phase === 'inbound') && S.runClock && !S.pendingEnd) {
      S.clock -= dt;
      if (S.clock <= 0) { S.clock = 0; S.runClock = false; endQuarter(); }
    }
    if (S.phase === 'live' && S.poss === 1 && S.fc && (S.quarter >= 4 || Math.abs(S.score[0] - S.score[1]) <= 6)) { S.chantT = (S.chantT || 0) - dt; if (S.chantT <= 0) { S.chantT = 1.5; sfx.chant(); } }
    if (S.phase === 'live') {
      S.runClock = false;
      S.clock -= dt;
      if (ball.state === 'held' || ball.state === 'pass' || ball.state === 'shot') S.shotClock -= dt;
      if (S.run[1] > 0) S.aiTOused = false;
      // 投籃犯規：球沒進就罰球
      if (S.pendingFT && (ball.state !== 'shot' || ball.missed)) { const pf = S.pendingFT; S.pendingFT = null; deadBall({ ft: true, shooter: pf.shooter, n: pf.n }, 0.9); }
      if (S.phase === 'live' && S.clock <= 0 && !S.pendingEnd) {
        S.clock = 0;
        if (ball.state === 'shot') S.pendingEnd = true; else endQuarter();
      } else if (S.phase === 'live' && S.pendingEnd && ball.state !== 'shot') endQuarter();
      if (S.phase === 'live' && S.shotClock <= 0 && (ball.state === 'held' || ball.state === 'pass') && S.clock > 0) violation('24 秒違例');
      checkViolations(dt);
      if (S.clock < 0) S.clock = 0;
    }
    if (ball.state === 'loose' && ctrl && ctrl.team === 0 && inp.mag < 0.12 && !ctrl.action) {
      let best = null, bd = 1e9; for (const p of teams[0]) { const d = hyp(p.pos.x - ball.pos.x, p.pos.z - ball.pos.z); if (d < bd) { bd = d; best = p; } }
      if (best && best !== ctrl && bd + 1.5 < hyp(ctrl.pos.x - ball.pos.x, ctrl.pos.z - ball.pos.z)) ctrl = best;
    }
    if (S.phase !== 'replay' && S.phase !== 'timeout') {
      updateScreens(dt);
      updatePlayers(dt);
      updateBench(dt);
      updateReferee(dt);
      if (S.phase !== 'break' && S.phase !== 'over') stepBall(dt);
    }
    // 罰完技術犯規後由原進攻方邊線發球
    if (S.keepAfterFT && S.phase === 'ft' && S.ft && S.ft.keep && S.ft.stage === 'between' && S.ft.t > 1.0 && S.ft.k >= S.ft.n - 1) {
      const k = S.keepAfterFT; S.keepAfterFT = null; S.ft = null; for (const p of players) p.ftSpot = null;
      startInbound({ team: k.team, kind: 'side', x: k.x, z: -(HZ + 0.45), keepClock: true });
    }
  }
  inp.b1Down = inp.b1Up = inp.b2Down = inp.b4Down = false;
}

const camPos = new THREE.Vector3(0, 9, 14), camLook = new THREE.Vector3(); let camZoom = 1, orbit = 0;
function updateCamera(dt) {
  const aspect = innerWidth / innerHeight;
  const vfov = clamp(2 * Math.atan(0.68 / aspect) * 180 / Math.PI, 30, 58);
  if (Math.abs(camera.fov - vfov) > 0.01 || camera.aspect !== aspect) { camera.fov = vfov; camera.aspect = aspect; camera.updateProjectionMatrix(); }
  if (S.phase === 'intro') {
    orbit += dt * 0.32; const r = 21;
    camera.position.set(Math.sin(orbit) * r, 7 + Math.sin(orbit * 0.7) * 2, Math.cos(orbit) * r * 0.75 + 3);
    camera.lookAt(0, 1.2, 0); camLook.set(0, 0.6, 0); camZoom = 1; return;
  }
  if ((S.phase === 'contest3' || (S.contestOver && S.mode === 'three')) && ctrl) {
    // 從射手右後方看向籃框：射手在畫面左側、籃框在中間
    const bx = BASKET_X, away = new THREE.Vector3(ctrl.pos.x - bx, 0, ctrl.pos.z).normalize();
    const right = new THREE.Vector3(away.z, 0, -away.x);
    const want = new THREE.Vector3(ctrl.pos.x + away.x * 3.4 + right.x * 1.3, 2.7, ctrl.pos.z + away.z * 3.4 + right.z * 1.3);
    camera.position.lerp(want, 1 - Math.exp(-dt * 3));
    camLook.set(bx * 0.6 + ctrl.pos.x * 0.4, 2.3, ctrl.pos.z * 0.4); camera.lookAt(camLook);
    return;
  }
  if (S.phase === 'timeout') { // 暫停：從記錄台後方看中場表演，兩隊在邊線圍圈
    camera.position.lerp(new THREE.Vector3(0, 5.2, 16.5), 1 - Math.exp(-dt * 2.5));
    camLook.lerp(new THREE.Vector3(0, 0.9, 3.2), 1 - Math.exp(-dt * 2.5)); camera.lookAt(camLook); return;
  }
  if (S.phase === 'replay' && S.replay) {
    const s = S.replay.side;
    const bp = ball.pos;
    camera.position.set(s * (HX + 2.2), 3.3, 3.8);
    camera.lookAt(bp.x * 0.5 + s * BASKET_X * 0.5, Math.max(1.6, bp.y * 0.7), bp.z * 0.5);
    return;
  }
  const fx = ball.holder ? ball.holder.pos.x : ball.pos.x, fz = ball.holder ? ball.holder.pos.z : ball.pos.z;
  let tx = clamp(fx, -(BASKET_X - 5.6), BASKET_X - 5.6), tz = clamp(fz * 0.3, -1.6, 2.0), zoom = 1;
  const dunker = players.find(p => p.action === 'dunk' || p.action === 'hang' || p.action === 'layup');
  const drive = ball.holder && S.phase === 'live' && distB(ball.holder) < 5.5 ? ball.holder : null;
  const sh = ball.state === 'shot' && ball.shot ? ball.shot : (dunker || drive ? { team: (dunker || drive).team } : null);
  const dunking = dunker && (dunker.action === 'dunk' || dunker.action === 'hang');
  const scoredRecently = S.phase === 'dead' && S.timer > 0.4 && S.lastScoreSide;
  if (S.phase === 'ft' && S.ft) { const bx = basketX(S.ft.team); tx = bx * 0.78; tz = 0.4; zoom = 0.72; }
  else if (sh || scoredRecently) {
    const bx = sh ? basketX(sh.team) : S.lastScoreSide * BASKET_X;
    tx = bx * 0.9 + fx * 0.1; tx = clamp(tx, -(BASKET_X - 2.4), BASKET_X - 2.4); tz = 0.6; zoom = dunking ? 0.5 : 0.62;
    if (dunking) { tx = bx - Math.sign(bx) * 1.6; tz = 0.2; }
  }
  const k = 1 - Math.exp(-dt * (dunking ? 6 : (sh ? 3.4 : 2.6)));
  camLook.x += (tx - camLook.x) * k; camLook.z += (tz - camLook.z) * k; camLook.y = 0.6 + (1 - camZoom) * 3;
  camZoom += (zoom - camZoom) * (1 - Math.exp(-dt * (dunking ? 5 : 2.2)));
  camPos.set(camLook.x, 8.0 * camZoom + 0.6, camLook.z + 11.8 * camZoom);
  camera.position.copy(camPos); camera.lookAt(camLook.x, camLook.y, camLook.z - 0.8);
  if (S.shake > 0) { camera.position.x += rand(-1, 1) * S.shake * 0.12; camera.position.y += rand(-1, 1) * S.shake * 0.12; }
  if (params.get('cam')) { const c = params.get('cam').split(',').map(Number); camera.position.set(c[0], c[1], c[2]); camera.lookAt(c[3], c[4], c[5]); }
  const cf = window.__camFollow; if (cf) { const f = fwd(cf); const sd = window.__camSide || 0; camera.position.set(cf.pos.x + f.x * 3.6 * (1 - sd) - f.z * (1.6 + 2 * sd), 1.5, cf.pos.z + f.z * 3.6 * (1 - sd) + f.x * (1.6 + 2 * sd)); camera.lookAt(cf.pos.x, 0.95, cf.pos.z); window.__dbgFace = [cf.facing, cf.rig.root.rotation.y, cf.num]; }
}
function updateNet(n, dt) {
  const geo = n.net.geometry, pos = geo.attributes.position, base = n.net.userData.base;
  const cx = n.s * BASKET_X, cy = RIM_H - 0.225;
  const bx = ball.pos.x - cx, by = ball.pos.y - cy, bz = ball.pos.z;
  const inside = Math.hypot(bx, bz) < RIM_R + 0.05 && by < 0.35 && by > -0.45;
  if (inside && ball.vel.y < 0 && n.t < 0.6 && S.phase !== 'replay') n.t = 0.9;
  if (n.t <= 0 && !inside && !n.dirty) return;
  n.t = Math.max(0, n.t - dt);
  const decay = n.t / 0.9, ph = (0.9 - n.t) * 16;
  for (let i = 0; i < pos.count; i++) {
    const x0 = base[i * 3], y0 = base[i * 3 + 1], z0 = base[i * 3 + 2];
    const f = (0.225 - y0) / 0.45;
    const r0 = Math.hypot(x0, z0) || 1e-4;
    let r = r0, y = y0, ox = 0, oz = 0;
    if (inside) {
      const infl = Math.exp(-(((y0 - by) / 0.13) ** 2));
      r = Math.max(r, r0 + (BALL_R + 0.03 - r0) * infl * (r0 < BALL_R + 0.03 ? 1 : 0));
      ox = bx * infl * 0.6 * f; oz = bz * infl * 0.6 * f;
    }
    if (n.t > 0) {
      r *= 1 + 0.22 * f * Math.sin(ph) * decay;
      y += f * f * 0.12 * decay * Math.abs(Math.sin(ph * 0.5));
      ox += f * 0.05 * decay * Math.sin(ph * 0.7); oz += f * 0.05 * decay * Math.cos(ph * 0.6);
    }
    pos.setXYZ(i, x0 / r0 * r + ox, y, z0 / r0 * r + oz);
  }
  pos.needsUpdate = true; n.dirty = n.t > 0 || inside;
  if (!n.dirty) { for (let i = 0; i < pos.count; i++) pos.setXYZ(i, base[i * 3], base[i * 3 + 1], base[i * 3 + 2]); pos.needsUpdate = true; }
}
function render(dt) {
  const replay = S.phase === 'replay';
  extras.update(dt, S.phase === 'timeout' || (S.phase === 'break' && !S.contestOver));
  for (const a of extras.list) { a.shadow.position.set(a.rig.root.position.x, 0.012, a.rig.root.position.z); }
  if (!replay) {
    for (const p of players) animatePlayer(p, dt);
    animatePlayer(referee, dt);
  }
  for (let t = 0; t < 2; t++) for (const p of roster[t]) {
    if (!p.onCourt && !p.hidden) animatePlayer(p, dt);
    p.rig.root.visible = !p.hidden; p.shadow.visible = !p.hidden;
    p.shadow.position.set(p.rig.root.position.x, 0.012, p.rig.root.position.z);
    const sc = 0.9 * p.scale * (1 - Math.min(0.4, p.jy * 0.4)); p.shadow.scale.set(sc, 1, sc);
    p.refl.sync(); p.refl.clone.visible = p.onCourt && !p.hidden && SET.quality !== 'low';
  }
  referee.shadow.position.set(referee.rig.root.position.x, 0.012, referee.rig.root.position.z); referee.refl.sync();
  referee.rig.root.visible = referee.shadow.visible = !referee.hidden; referee.refl.clone.visible = !referee.hidden && SET.quality !== 'low'; ballRefl.visible = SET.quality !== 'low';
  if (S.phase === 'live' || S.phase === 'inbound' || S.phase === 'tipoff' || S.phase === 'dead') recordFrame(dt);
  // 畫面上的球：持球時依實際手掌位置擺放，運球時手掌真的接到球
  renderTick++;
  let vis = ball.pos;
  const hb = ball.holder;
  if (ball.state === 'held' && hb && !replay) {
    hb.rig.root.updateMatrixWorld(true);
    const pose = hb.pose;
    if (pose === 'dribble' || pose === 'hesi') {
      const top = handWorld(hb.rig, (hb.hand || 1) > 0); top.y -= BALL_R + 0.03;
      const c = Math.abs(Math.cos(hb.dribblePh));
      vis = new THREE.Vector3(top.x, BALL_R, top.z).lerp(top, c);
    } else if (['hold', 'ftset', 'shoot', 'pass', 'euro'].includes(pose)) {
      vis = handWorld(hb.rig, true).add(handWorld(hb.rig, false)).multiplyScalar(0.5).addScaledVector(fwd(hb), 0.08 * hb.scale);
      if (pose === 'shoot') vis.y += 0.07;
    } else if (pose === 'layup') vis = handWorld(hb.rig, true).add(new THREE.Vector3(0, 0.1, 0));
    else if (pose === 'dunk' || pose === 'windmill' || pose === 'clutch') {
      const two = pose === 'clutch' || (hb.dunk && hb.dunk.style === 'two');
      vis = two ? handWorld(hb.rig, true).add(handWorld(hb.rig, false)).multiplyScalar(0.5).addScaledVector(fwd(hb), 0.06) : handWorld(hb.rig, true).addScaledVector(fwd(hb), 0.05);
      vis.y += 0.08;
    }
    hb.visBall = vis.clone(); hb.visT = renderTick;
  }
  ballMesh.position.copy(vis); ballMesh.visible = vis.y > -1;
  if (ball.state !== 'held') { const v = hyp(ball.vel.x, ball.vel.z); if (v > 0.05) { ballMesh.rotation.x += ball.vel.z * dt / BALL_R * 0.5; ballMesh.rotation.z -= ball.vel.x * dt / BALL_R * 0.5; } }
  else if (ball.holder.pose === 'dribble') ballMesh.rotation.x += dt * 8;
  ballRefl.visible = ballRefl.visible && vis.y > -1; ballShadow.visible = vis.y > -1;
  ballRefl.position.set(vis.x, -vis.y, vis.z); ballRefl.rotation.copy(ballMesh.rotation);
  ballShadow.position.set(vis.x, 0.013, vis.z);
  const bs = 0.36 * (1 - Math.min(0.6, vis.y * 0.12)); ballShadow.scale.set(bs, 1, bs);
  ring.visible = !AUTO && ctrl && !['title', 'break', 'over', 'replay', 'intro', 'timeout'].includes(S.phase);
  if (ctrl) ring.position.set(ctrl.pos.x, 0.015, ctrl.pos.z);
  for (const n of nets) updateNet(n, dt);
  arena.hoops.forEach((h, i) => { rimFlex[i] = Math.max(0, rimFlex[i] - dt); const hang = players.some(p => p.action === 'hang' && (basketX(p.team) > 0 ? 1 : 0) === i); const k = hang ? 0.12 : rimFlex[i] * Math.sin(rimFlex[i] * 40) * 0.25; h.rim.rotation.z = (i ? 1 : -1) * k; h.net.rotation.z = (i ? 1 : -1) * k * 0.6; });
  arena.crowdUniforms.uTime.value += dt;
  arena.crowdUniforms.uCheer.value = Math.max(0, arena.crowdUniforms.uCheer.value - dt * 0.4);
  arena.adTex.offset.x = (arena.adTex.offset.x + dt * 0.03) % 1;
  updateCamera(realDt);
  $('letterbox').className = replay || S.phase === 'intro' ? 'on' : '';
  document.body.classList.toggle('cine', replay || S.phase === 'intro');
  const m = $('meter');
  S.meterHold = (S.meterHold || 0) - dt;
  const metering = ctrl && isUser(ctrl) && ((ctrl.action === 'shoot' && ctrl.shotKind === 'jump' && (!ctrl.released || S.meterHold > 0)) || ctrl.action === 'ftshoot' || (ctrl.action === 'follow' && S.meterHold > 0));
  if (metering) {
    const v = new THREE.Vector3(ctrl.pos.x, 2.4 * ctrl.scale + ctrl.jy, ctrl.pos.z).project(camera);
    m.style.left = ((v.x + 1) / 2 * innerWidth + 34) + 'px'; m.style.top = ((1 - v.y) / 2 * innerHeight - 10) + 'px';
    m.style.display = 'block'; if (!ctrl.released || ctrl.action === 'ftshoot') $('mfill').style.height = Math.min(100, ctrl.actT / (ctrl.action === 'ftshoot' ? 0.6 : 0.5) * 100) + '%';
  } else m.style.display = 'none';
  const sl = $('slabel');
  if (sl.className && ctrl) { const v = new THREE.Vector3(ctrl.pos.x, 2.6 * ctrl.scale, ctrl.pos.z).project(camera); sl.style.left = ((v.x + 1) / 2 * innerWidth) + 'px'; sl.style.top = ((1 - v.y) / 2 * innerHeight - 20) + 'px'; }
  renderer.render(scene, camera);
}
function resize() { renderer.setSize(innerWidth, innerHeight); }
addEventListener('resize', resize); resize();

let last = performance.now(), hudT = 0, realDt = 1 / 60;
function frame(now) {
  requestAnimationFrame(frame);
  let dt = Math.min(0.05, (now - last) / 1000); last = now;
  const steps = AUTO && params.get('speed') ? +params.get('speed') : 1;
  realDt = dt;
  if (S.slowmo > 0) { S.slowmo -= dt; dt *= 0.35; }
  S.shake = Math.max(0, (S.shake || 0) - dt * 1.5);
  if (!MANUAL) for (let i = 0; i < steps; i++) update(dt);
  if (!params.has('norender')) render(dt);
  hudT -= dt; if (hudT <= 0) { hudT = 0.1; updateHUD(); }
}

// ================= 選單 =================
function startMode() {
  if (S.mode === 'three') startThree(); else if (S.mode === 'dunk') startDunk(); else if (S.mode === 'practice' || S.mode === 'tutorial') startPractice(S.mode === 'tutorial'); else { if (S.mode === 'series' && !S.series) S.series = store.get('series', null) || { wins: [0, 0], game: 1 }; newGame(); }
}
function applyTeamColors() {
  for (let t = 0; t < 2; t++) {
    const c = PALETTE[S.colors[t]];
    if (TEAM_INFO[t].color === c.color && TEAM_INFO[t].name === c.name) continue;
    Object.assign(TEAM_INFO[t], { name: c.name, color: c.color, dark: c.dark, num: c.num, trim: c.trim });
    if (t === 0) { const m = extras.mascot.rig.mats; m.jersey.map.dispose(); m.jersey.map = jerseyTexture(0, '00'); m.jersey.needsUpdate = true; m.shorts.map.dispose(); m.shorts.map = shortsTexture(0); m.shorts.needsUpdate = true; }
    for (const p of roster[t]) { const m = p.rig.mats; m.jersey.map.dispose(); m.jersey.map = jerseyTexture(t, p.num); m.jersey.needsUpdate = true; m.shorts.map.dispose(); m.shorts.map = shortsTexture(t); m.shorts.needsUpdate = true; }
  }
  for (let t = 0; t < 2; t++) { document.querySelector('#board .t' + t).style.background = PALETTE[S.colors[t]].ui; $('tn' + t).textContent = TEAM_INFO[t].name; document.documentElement.style.setProperty('--c' + t, PALETTE[S.colors[t]].ui); }
}
function newGame() {
  if (S.contestOver || S.mode === 'game' || S.mode === 'series') exitSolo();
  S.attack = [1, -1];
  S.score = [0, 0]; S.quarter = 1; S.attack = [1, -1]; S.clock = S.qlen; S.shotClock = 24; S.pendingEnd = false; S.pendingFT = null; S.ft = null;
  S.teamFouls = [0, 0]; S.timeouts = [7, 7]; S.gameT = 0; S.lastReplay = -99; S.run = [0, 0]; S.aiTOused = false; S.subQueue = []; S.highlight = null; S.keepAfterFT = null;
  S.play[1] = 'motion'; S.defense[1] = 'man'; S.runClock = false;
  S.shots = []; S.stats = [0, 1].map(() => ({ fgm: 0, fga: 0, tpm: 0, tpa: 0, ftm: 0, fta: 0, reb: 0, stl: 0, blk: 0, tov: 0, pf: 0 }));
  for (let t = 0; t < 2; t++) roster[t].forEach((p, i) => { p.onCourt = i < 5; p.idx = i < 5 ? p.role : -1; p.chair = -1; p.walkTo = null; p.sta = 1; p.st = newStats(); p.hand = 1; p.ftSpot = null; });
  rebuildLists();
  REC.frames = [];
  $('title').classList.remove('show'); $('brk').classList.remove('show'); $('hud').classList.add('show');
  startTipoff(); if (!AUTO) { $('msg').className = ''; startIntro(); }
}
function togglePause() {
  if (['title', 'over', 'break', 'timeout', 'intro', 'replay'].includes(S.phase)) return;
  S.paused = !S.paused;
  $('callTO').style.display = $('lineup').style.display = $('boxBtn').style.display = (S.mode === 'three' || S.mode === 'dunk' || S.mode === 'practice' || S.mode === 'tutorial') ? 'none' : ''; $('pause').classList.toggle('show', S.paused);
  if (S.paused) { $('callTO').disabled = !canUserTimeout(); $('callTO').textContent = `叫暫停（剩 ${S.timeouts[0]} 次）`; }
}
S.mode = 'game'; S.colors = store.get('colors', [0, 1]); S.series = store.get('series', null);
function renderColorOpts() {
  for (const k of ['c0', 'c1']) {
    const g = document.querySelector(`.opt[data-k="${k}"]`); const t = k === 'c0' ? 0 : 1;
    g.querySelectorAll('button').forEach(b => { b.classList.toggle('on', +b.dataset.v === S.colors[t]); b.disabled = +b.dataset.v === S.colors[1 - t]; });
  }
  const m = { game: '開始比賽', series: S.series && (S.series.wins[0] || S.series.wins[1]) ? `繼續系列賽（${S.series.wins[0]}:${S.series.wins[1]}）` : '開始系列賽', three: '開始三分大賽', dunk: '開始灌籃大賽', practice: '開始練習', tutorial: '開始教學' };
  $('start').textContent = m[S.mode];
  document.querySelectorAll('.opt[data-k="q"], .opt[data-k="c1"]').forEach(g => g.style.display = ['three', 'dunk', 'practice', 'tutorial'].includes(S.mode) ? 'none' : '');
}
document.querySelectorAll('.opt').forEach(g => {
  if (g.dataset.k === 'c0' || g.dataset.k === 'c1') g.insertAdjacentHTML('beforeend', PALETTE.map((c, i) => `<button class="sw" data-v="${i}" style="background:${c.ui}" title="${c.name}"></button>`).join(''));
  g.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b || b.disabled) return;
    const k = g.dataset.k;
    if (k === 'c0' || k === 'c1') { S.colors[k === 'c0' ? 0 : 1] = +b.dataset.v; store.set('colors', S.colors); renderColorOpts(); return; }
    g.querySelectorAll('button').forEach(x => x.classList.remove('on')); b.classList.add('on');
    if (k === 'q') S.qlen = +b.dataset.v * 60; else if (k === 'm') S.mode = b.dataset.v; else S.diff = +b.dataset.v;
    renderColorOpts();
  });
});
renderColorOpts();
$('start').addEventListener('click', () => {
  applyTeamColors();
  try { if ('speechSynthesis' in window) { const u = new SpeechSynthesisUtterance(' '); u.volume = 0; speechSynthesis.speak(u); } } catch (e) { }
  initAudio();
  if (matchMedia('(pointer:coarse)').matches && !isFull()) goFullscreen(false);
  startMode();
});
$('brkBtn2').addEventListener('click', () => { $('brk').classList.remove('show'); exitSolo(); $('hud').classList.remove('show'); S.phase = 'title'; $('title').classList.add('show'); rebuildAfterSolo(); });
function rebuildAfterSolo() { for (let t = 0; t < 2; t++) roster[t].forEach((p, i) => { p.onCourt = i < 5; p.idx = i < 5 ? p.role : -1; p.chair = -1; }); rebuildLists(); startTipoff(); S.phase = 'title'; ball.state = 'dead'; ball.pos.set(0, BALL_R, 1); }
$('pbtn').addEventListener('click', togglePause);
// ================= 全螢幕 =================
const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const inFrame = (() => { try { return window.self !== window.top; } catch (e) { return true; } })();
const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
function isFull() { return standalone || !!(document.fullscreenElement || document.webkitFullscreenElement); }
function fsTip() {
  let t;
  if (inFrame) t = '現在遊戲是在 Claude 的預覽視窗裡開的，這個視窗不允許遊戲自己切全螢幕。<br><br>要全螢幕玩：把遊戲網址用手機瀏覽器開，再照下面的方式加到主畫面。';
  else t = '';
  if (isIOS) t += (t ? '<br><br>' : '') + '<b>iPhone</b>：Safari 不支援網頁自己切全螢幕。請按 Safari 下方的 <b>分享</b> → <b>加入主畫面</b>，之後從主畫面的圖示打開，就會是沒有網址列的全螢幕。';
  else t += (t ? '<br><br>' : '') + '<b>Android</b>：在 Chrome 開遊戲網址，按「全螢幕」按鈕即可；也可以在 Chrome 選單選 <b>加到主畫面</b>，從圖示打開就是全螢幕。';
  $('fsText').innerHTML = t; $('fstip').classList.add('show');
}
function goFullscreen(showTip = true) {
  const el = document.documentElement;
  const req = el.requestFullscreen || el.webkitRequestFullscreen;
  if (!req || isFull()) { if (showTip && !isFull()) fsTip(); return; }
  try {
    const r = req.call(el, { navigationUI: 'hide' });
    if (r && r.then) r.then(() => { screen.orientation?.lock?.('landscape').catch(() => { }); }).catch(() => { if (showTip) fsTip(); });
  } catch (e) { if (showTip) fsTip(); }
}
$('fsbtn').addEventListener('click', () => goFullscreen(true));
$('fsBtn2').addEventListener('click', () => goFullscreen(true));
$('fsClose').addEventListener('click', () => $('fstip').classList.remove('show'));
const fsSync = () => document.body.classList.toggle('fs', isFull());
document.addEventListener('fullscreenchange', fsSync); document.addEventListener('webkitfullscreenchange', fsSync); fsSync();
function renderTac() {
  const b = (k, v, cur, name) => `<button data-k="${k}" data-v="${v}" class="${cur === v ? 'on' : ''}">${name}</button>`;
  $('tacO').innerHTML = Object.entries(PLAY_NAMES).map(([v, n]) => b('o', v, S.play[0], n)).join('');
  $('tacD').innerHTML = Object.entries(DEF_NAMES).map(([v, n]) => b('d', v, S.defense[0], n)).join('');
  $('tbtn').textContent = '戰術：' + PLAY_NAMES[S.play[0]].replace('進攻', '') + '／' + { man: '人盯人', zone: '區域', press: '緊迫' }[S.defense[0]];
}
$('tbtn').addEventListener('click', () => { $('tac').classList.toggle('show'); renderTac(); });
$('tac').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  if (b.dataset.k === 'o') S.play[0] = b.dataset.v; else if (b.dataset.k === 'd') S.defense[0] = b.dataset.v; else { $('tac').classList.remove('show'); return; }
  renderTac(); msg(b.dataset.k === 'o' ? '進攻：' + PLAY_NAMES[S.play[0]] : '防守：' + DEF_NAMES[S.defense[0]]);
});
renderTac();
$('resume').addEventListener('click', togglePause);
$('callTO').addEventListener('click', () => { if (!canUserTimeout()) return; S.paused = false; $('pause').classList.remove('show'); callTimeout(0); });
$('lineup').addEventListener('click', () => { $('pause').classList.remove('show'); openSubPanel(false); });
$('boxBtn').addEventListener('click', () => { boxTab = 0; renderBox(); $('pause').classList.remove('show'); $('brkTitle').textContent = '比賽數據'; $('brkSub').textContent = `${TEAM_INFO[0].name} ${S.score[0]} : ${S.score[1]} ${TEAM_INFO[1].name}`; $('brkBtn').textContent = '回到比賽'; S.boxFromPause = true; $('brk').classList.add('show'); });
$('restart').addEventListener('click', () => { S.paused = false; $('pause').classList.remove('show'); if (['three', 'dunk', 'practice', 'tutorial'].includes(S.mode)) { exitSolo(); rebuildAfterSolo(); $('title').classList.remove('show'); $('hud').classList.add('show'); startMode(); } else newGame(); });
$('quit').addEventListener('click', () => { S.paused = false; $('pause').classList.remove('show'); $('hud').classList.remove('show'); exitSolo(); S.phase = 'title'; $('title').classList.add('show'); rebuildAfterSolo(); });
let muted = false; $('mute').addEventListener('click', () => { muted = !muted; setMuted(muted); $('mute').textContent = muted ? '音效：關' : '音效：開'; });
document.addEventListener('visibilitychange', () => { if (document.hidden && !S.paused && !['title', 'over', 'break', 'timeout'].includes(S.phase)) togglePause(); });

rebuildLists();
for (let t = 0; t < 2; t++) roster[t].forEach(p => { if (!p.onCourt) p.pos.copy(benchSeat(p)); });
startTipoff(); S.phase = 'title'; ball.state = 'dead'; ball.pos.set(0, BALL_R, 1);
camLook.set(0, 0.6, 0);
if (AUTO) { S.qlen = +(params.get('q') || 60); S.diff = 1; newGame(); }
window.__g = { doPass, callTimeout, extras, tutRing, renderer, S, ball, get players() { return players; }, get teams() { return teams; }, roster, get ctrl() { return ctrl; }, camera, inp, newGame, tick(n, dt = 1 / 60) { for (let i = 0; i < n; i++) update(dt); }, step(n, dt = 1 / 60) { for (let i = 0; i < n; i++) update(dt); realDt = dt; render(dt); } };
requestAnimationFrame(frame);
