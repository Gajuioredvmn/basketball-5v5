let ctx = null, master = null, crowdGain = null, noiseBuf = null;
export function initAudio() {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
  const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
  ctx = new AC();
  master = ctx.createGain(); master.gain.value = 0.8; master.connect(ctx.destination);
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0); let b0 = 0, b1 = 0, b2 = 0;
  for (let i = 0; i < d.length; i++) { const w = Math.random() * 2 - 1; b0 = 0.99765 * b0 + w * 0.099; b1 = 0.963 * b1 + w * 0.2965; b2 = 0.57 * b2 + w * 1.0526; d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.2; }
  // 觀眾背景聲
  const src = ctx.createBufferSource(); src.buffer = noiseBuf; src.loop = true;
  const lp = ctx.createBiquadFilter(); lp.type = 'bandpass'; lp.frequency.value = 700; lp.Q.value = 0.6;
  crowdGain = ctx.createGain(); crowdGain.gain.value = 0.09;
  src.connect(lp); lp.connect(crowdGain); crowdGain.connect(master); src.start();
}
const now = () => ctx.currentTime;
function noise(dur, type, freq, q, vol, t0 = 0) {
  if (!ctx) return;
  const s = ctx.createBufferSource(); s.buffer = noiseBuf;
  const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
  const g = ctx.createGain(); const t = now() + t0;
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  s.connect(f); f.connect(g); g.connect(master); s.start(t, Math.random()); s.stop(t + dur + 0.05);
}
function tone(freq, dur, type, vol, t0 = 0, slide = 0) {
  if (!ctx) return;
  const o = ctx.createOscillator(); o.type = type; o.frequency.value = freq;
  const g = ctx.createGain(); const t = now() + t0;
  if (slide) o.frequency.exponentialRampToValueAtTime(freq * slide, t + dur);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.05);
}
export const sfx = {
  dribble(v = 1) { tone(95, 0.12, 'sine', 0.5 * v, 0, 0.6); noise(0.05, 'lowpass', 900, 1, 0.25 * v); },
  bounce(v = 1) { tone(110, 0.14, 'sine', 0.45 * v, 0, 0.6); noise(0.05, 'lowpass', 800, 1, 0.2 * v); },
  rim(v = 1) { [620, 1530, 2390, 3400].forEach((f, i) => tone(f, 0.35 - i * 0.06, 'sine', 0.13 * v / (i + 1))); noise(0.06, 'highpass', 2000, 1, 0.15 * v); },
  board(v = 1) { noise(0.12, 'lowpass', 500, 1, 0.55 * v); tone(150, 0.1, 'triangle', 0.25 * v, 0, 0.7); },
  swish() { noise(0.28, 'bandpass', 3200, 0.8, 0.5); noise(0.18, 'bandpass', 5200, 1, 0.25, 0.05); },
  buzzer() { tone(196, 1.2, 'square', 0.12); tone(233, 1.2, 'square', 0.09); },
  whistle() { if (!ctx) return; const o = ctx.createOscillator(); o.frequency.value = 2700 + Math.random() * 450; const l = ctx.createOscillator(); l.frequency.value = 38; const lg = ctx.createGain(); lg.gain.value = 180; l.connect(lg); lg.connect(o.frequency); const g = ctx.createGain(); const t = now(); g.gain.setValueAtTime(0.0, t); g.gain.linearRampToValueAtTime(0.18, t + 0.03); g.gain.setValueAtTime(0.18, t + 0.45); g.gain.exponentialRampToValueAtTime(0.001, t + 0.6); o.connect(g); g.connect(master); o.start(t); l.start(t); o.stop(t + 0.65); l.stop(t + 0.65); },
  steal() { noise(0.08, 'bandpass', 1500, 2, 0.3); },
  cheer(level = 1) { if (!crowdGain) return; const t = now(); crowdGain.gain.cancelScheduledValues(t); crowdGain.gain.setValueAtTime(crowdGain.gain.value, t); crowdGain.gain.linearRampToValueAtTime(0.09 + 0.38 * level, t + 0.25); crowdGain.gain.linearRampToValueAtTime(crowdBase, t + 2.6); },
  oh() { if (!crowdGain) return; const t = now(); crowdGain.gain.cancelScheduledValues(t); crowdGain.gain.setValueAtTime(crowdGain.gain.value, t); crowdGain.gain.linearRampToValueAtTime(0.2, t + 0.2); crowdGain.gain.linearRampToValueAtTime(crowdBase, t + 1.2); },
};
// 球鞋摩擦、觀眾喊 DE-FENSE、灌籃重擊、嘆氣
let squeakT = 0, crowdBase = 0.09;
sfx.squeak = (v = 1) => { if (!ctx || now() - squeakT < 0.12) return; squeakT = now(); const f = 2600 + Math.random() * 1200; tone(f, 0.07, 'sine', 0.06 * v, 0, 1.25); noise(0.05, 'bandpass', f, 6, 0.08 * v); };
sfx.chant = () => { if (!ctx) return; for (const [t0, f] of [[0, 330], [0.32, 262]]) { noise(0.24, 'bandpass', f * 2.2, 1.5, 0.22, t0); noise(0.22, 'bandpass', f * 4.1, 2, 0.1, t0); tone(f, 0.22, 'sawtooth', 0.025, t0); } noise(0.06, 'highpass', 1800, 1, 0.12, 0.62); noise(0.06, 'highpass', 1800, 1, 0.12, 0.82); };
sfx.slam = () => { tone(60, 0.35, 'sine', 0.6, 0, 0.5); noise(0.18, 'lowpass', 300, 1, 0.5); };
sfx.groan = () => { if (!ctx) return; noise(0.9, 'bandpass', 420, 0.8, 0.18); };
sfx.whistle2 = () => { sfx.whistle(); setTimeout(() => sfx.whistle(), 260); };
sfx.setCrowd = (v) => { crowdBase = v; if (crowdGain) crowdGain.gain.setTargetAtTime(v, now(), 0.6); };
export function setMuted(m) { if (master) master.gain.value = m ? 0 : 0.8; }
