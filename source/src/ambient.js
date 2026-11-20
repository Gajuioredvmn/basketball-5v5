// 場邊人物（板凳、裁判、啦啦隊、死球時的球員）播放真人循環動作；legs=0 時腳仍用程式算（腳掌鎖地不滑步）
import { clipInfo } from './player.js';
export function ambient(a, dt, name, legs = 0, rate = 1, mirror = false) {
  if (!name || !clipInfo(name)) { a.moW = (a.moW || 0) * Math.max(0, 1 - dt * 9); if (a.moW < 0.01) a.mo = null; a.ambName = null; return; }
  const c = clipInfo(name);
  if (a.ambName !== name) { a.ambName = name; a.ambF = c.loop ? Math.random() * c.n : 0; a.moW = Math.min(a.moW || 0, 0.3); }
  a.ambF += dt * 30 * rate;
  a.mo = { name, f: c.loop ? a.ambF : Math.min(a.ambF, c.n - 1), legs, mirror };
  a.moW = (a.moW || 0) + (1 - (a.moW || 0)) * Math.min(1, dt * 6);
}
export const ambDone = a => { const c = a.ambName && clipInfo(a.ambName); return !c || (!c.loop && a.ambF >= c.n - 1); };
