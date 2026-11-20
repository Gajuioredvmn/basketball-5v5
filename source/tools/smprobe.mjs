import { retarget } from './retarget.mjs';
import fs from 'fs';
const files = fs.readdirSync('/tmp/smj').filter(f => f.startsWith(process.argv[2]));
for (const fn of files.slice(0, +process.argv[3] || 3)) {
  const { frames } = retarget('/tmp/smj/' + fn);
  const sp = frames.length > 1 ? Math.hypot(frames.at(-1).x - frames[0].x, frames.at(-1).z - frames[0].z) / (frames.length / 30) : 0;
  console.log(fn, 'n', frames.length, 'speed', sp.toFixed(2));
  if (process.argv[4]) console.log(frames.map((f, i) => `${i} hip${f.hipY.toFixed(2)} lf${f.lfoot.toFixed(2)} rf${f.rfoot.toFixed(2)} lh${f.lhand.toFixed(2)} rh${f.rhand.toFixed(2)} b${f.ball.y.toFixed(2)} c${f.contact}`).filter((_, i) => i % 2 === 0).join('\n'));
}
