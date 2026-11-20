import { loadBVH } from './bvhfk.mjs';
const { frames } = loadBVH(process.argv[2]);
const out = [];
frames.forEach((f, i) => { if (i % (+process.argv[3] || 3)) return; out.push([i, f.Hips.y.toFixed(2), Math.min(f.LeftToeBase.y, f.LeftFoot.y).toFixed(2), Math.min(f.RightToeBase.y, f.RightFoot.y).toFixed(2), f.LeftHand.y.toFixed(2), f.RightHand.y.toFixed(2), f.Hips.x.toFixed(2), f.Hips.z.toFixed(2)].join(' ')); });
console.log('i hipsY lfoot rfoot lhand rhand hx hz'); console.log(out.join('\n'));
