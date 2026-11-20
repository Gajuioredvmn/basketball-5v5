# 把 SkillMimic（BallPlay-M）的 .pt 轉成跟 CMU 一樣命名的關節座標 JSON（Y 朝上、公尺），也帶球的位置與接觸
import zipfile, pickle, numpy as np, re, json, sys, os, glob
def load_pt(path):
    z = zipfile.ZipFile(path); prefix = z.namelist()[0].split('/')[0]
    class U(pickle.Unpickler):
        def find_class(self, mod, name):
            if name == '_rebuild_tensor_v2':
                def rb(storage, off, size, stride, *a):
                    arr = np.frombuffer(storage, dtype=np.float32)
                    return np.lib.stride_tricks.as_strided(arr[off:], shape=size, strides=[s * 4 for s in stride]).copy()
                return rb
            if mod == 'torch' and name.endswith('Storage'): return name
            if mod == 'collections' and name == 'OrderedDict':
                import collections; return collections.OrderedDict
            return super().find_class(mod, name)
        def persistent_load(self, pid):
            return z.read(f'{prefix}/data/{pid[2]}')
    return U(z.open(f'{prefix}/data.pkl')).load()
NAMES = re.findall(r'<body name="([^"]+)"', open('/tmp/sm/skillmimic/data/assets/mjcf/mocap_humanoid.xml').read())
MAP = {'Pelvis': 'Hips', 'L_Hip': 'LeftUpLeg', 'L_Knee': 'LeftLeg', 'L_Ankle': 'LeftFoot', 'L_Toe': 'LeftToeBase',
       'R_Hip': 'RightUpLeg', 'R_Knee': 'RightLeg', 'R_Ankle': 'RightFoot', 'R_Toe': 'RightToeBase',
       'Spine': 'Spine', 'Chest': 'Spine1', 'Neck': 'Neck1', 'Head': 'Head',
       'L_Shoulder': 'LeftArm', 'L_Elbow': 'LeftForeArm', 'L_Wrist': 'LeftHand', 'L_Middle1': 'LeftHandIndex1',
       'R_Shoulder': 'RightArm', 'R_Elbow': 'RightForeArm', 'R_Wrist': 'RightHand', 'R_Middle1': 'RightHandIndex1'}
def conv(p): return [float(p[0]), float(p[2]), float(-p[1])]  # Z 朝上 → Y 朝上
for path in sorted(glob.glob('/tmp/sm/skillmimic/data/motions/BallPlay-M/*/*.pt')):
    a = load_pt(path); n = a.shape[0]
    bp = a[:, 165:165 + 159].reshape(n, 53, 3)
    frames = []
    for i in range(n):
        f = {MAP[nm]: conv(bp[i, j]) for j, nm in enumerate(NAMES) if nm in MAP}
        h, nk = np.array(f['Head']), np.array(f['Neck1'])
        f['Head_end'] = list(h + (h - nk) * 0.8)
        f['ball'] = conv(a[i, 324:327]); f['contact'] = float(round(a[i, 336]))
        frames.append(f)
    cat = os.path.basename(os.path.dirname(path))
    out = f'/tmp/smj/{cat}__{os.path.basename(path)[:-3]}.json'
    json.dump({'fps': 60, 'frames': frames}, open(out, 'w'))
print(len(glob.glob('/tmp/smj/*.json')))
