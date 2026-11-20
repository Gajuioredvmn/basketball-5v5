import fs from 'fs';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
globalThis.self = globalThis; globalThis.window = globalThis;
const buf = fs.readFileSync(process.argv[2]);
new GLTFLoader().parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), '', g => {
  console.log('anims', g.animations.length);
  console.log(g.animations.map(a => a.name + ':' + a.duration.toFixed(1)).join(' | '));
  const bones = []; g.scene.traverse(o => { if (o.isBone) bones.push(o.name); }); console.log('bones', bones.join(' '));
}, e => console.log('err', e));
