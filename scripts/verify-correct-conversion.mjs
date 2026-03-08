/**
 * Verify the CORRECT conversion formula: (-x, y, -z, w)
 * Axis mapping: viewer = (-Three_x, Three_y, -Three_z)
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Blob } from 'buffer';

global.Blob = Blob;
global.self = global;
global.window = global;
global.document = {
  createElementNS: (_ns, tag) => {
    if (tag === 'img') return { set src(_v) {}, addEventListener() {} };
    return { style: {} };
  },
  createElement: (tag) => {
    if (tag === 'canvas') return { getContext: () => null, style: {} };
    return { style: {} };
  },
};
try { global.navigator = { userAgent: 'node', platform: 'node' }; } catch {
  Object.defineProperty(global, 'navigator', { value: { userAgent: 'node', platform: 'node' }, writable: true, configurable: true });
}
global.URL = global.URL || {};
global.URL.createObjectURL = global.URL.createObjectURL || (() => '');
global.URL.revokeObjectURL = global.URL.revokeObjectURL || (() => '');
if (!global.fetch) {
  global.fetch = async (url) => {
    const filePath = url.startsWith('file://') ? fileURLToPath(url) : url;
    const buf = fs.readFileSync(filePath);
    return {
      ok: true,
      arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength),
      text: async () => buf.toString('utf-8'),
      json: async () => JSON.parse(buf.toString('utf-8')),
    };
  };
}

const THREE = await import('three');
THREE.FileLoader.prototype.load = function (url, onLoad, _onProgress, onError) {
  try {
    const filePath = path.resolve(url);
    const buf = fs.readFileSync(filePath);
    const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
    if (this.responseType === 'arraybuffer') setTimeout(() => onLoad(ab), 0);
    else setTimeout(() => onLoad(buf.toString('utf-8')), 0);
  } catch (e) { if (onError) onError(e); else console.error(e); }
  return {};
};
THREE.TextureLoader.prototype.load = function () { return new THREE.Texture(); };
const { FBXLoader } = await import('three/examples/jsm/loaders/FBXLoader.js');

function cleanBoneName(name) { return name.replace(/^mixamorig/, ''); }
const r = (v) => Math.round(v * 1000) / 1000;
const rad2deg = 180 / Math.PI;

const HIERARCHY = {
  'Hips': null,
  'Spine': 'Hips', 'Spine1': 'Spine', 'Spine2': 'Spine1',
  'Neck': 'Spine2', 'Head': 'Neck',
  'LeftShoulder': 'Spine2', 'LeftArm': 'LeftShoulder', 'LeftForeArm': 'LeftArm', 'LeftHand': 'LeftForeArm',
  'RightShoulder': 'Spine2', 'RightArm': 'RightShoulder', 'RightForeArm': 'RightArm', 'RightHand': 'RightForeArm',
  'LeftUpLeg': 'Hips', 'LeftLeg': 'LeftUpLeg', 'LeftFoot': 'LeftLeg', 'LeftToeBase': 'LeftFoot',
  'RightUpLeg': 'Hips', 'RightLeg': 'RightUpLeg', 'RightFoot': 'RightLeg', 'RightToeBase': 'RightFoot',
};

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fbxPath = path.join(__dirname, '..', 'public', 'models', 'character-motion', 'Hip Hop Dancing (1).fbx');
const motionPath = path.join(__dirname, '..', 'public', 'models', 'character-motion', 'Hip Hop Dancing.motion.json');

const loader = new FBXLoader();
const group = await new Promise((resolve, reject) => {
  loader.load(path.resolve(fbxPath), resolve, undefined, reject);
});

const boneByName = {};
group.traverse((obj) => { if (obj.isBone) boneByName[cleanBoneName(obj.name)] = obj; });

const clip = group.animations[0];
const mixer = new THREE.AnimationMixer(group);
const action = mixer.clipAction(clip);
action.play();

const motionData = JSON.parse(fs.readFileSync(path.resolve(motionPath), 'utf-8'));
const keyBones = Object.keys(HIERARCHY);

// Rest pose
mixer.setTime(0);
group.updateMatrixWorld(true);
const restWorldQuat = {};
const restWorldPos = {};
for (const name of keyBones) {
  const bone = boneByName[name];
  if (bone) {
    const wq = new THREE.Quaternion();
    const wp = new THREE.Vector3();
    bone.getWorldQuaternion(wq);
    bone.getWorldPosition(wp);
    restWorldQuat[name] = wq.clone();
    restWorldPos[name] = wp.clone();
  }
}

// The correct conversion: (-x, y, -z, w)
// This is 180° Y rotation conjugation
const toViewer = (q) => new THREE.Quaternion(-q.x, q.y, -q.z, q.w);
const toViewerArr = (dq) => new THREE.Quaternion(-dq[0], dq[1], -dq[2], dq[3]);
// Position: (-x, y, -z)
const posToViewer = (p) => ({ x: -p.x, y: p.y, z: -p.z });

// Check if this conversion is a homomorphism (required for hierarchy decomposition)
console.log('=== HOMOMORPHISM CHECK ===');
const q1 = new THREE.Quaternion(0.3, 0.4, 0.5, 0.6).normalize();
const q2 = new THREE.Quaternion(0.1, 0.7, 0.2, 0.5).normalize();
const prod = q1.clone().multiply(q2);
const cProd = toViewer(prod);
const cProdFromParts = toViewer(q1).multiply(toViewer(q2));
const homError = Math.abs(cProd.x - cProdFromParts.x) + Math.abs(cProd.y - cProdFromParts.y) +
                 Math.abs(cProd.z - cProdFromParts.z) + Math.abs(cProd.w - cProdFromParts.w);
console.log(`C(q1×q2) vs C(q1)×C(q2): error = ${homError.toFixed(10)}`);
console.log(`Homomorphism: ${homError < 1e-6 ? 'YES ✓' : 'NO ✗'}\n`);

// Verify world rotations at frame 67
const frameIdx = 67;
const time = frameIdx / 30;
mixer.setTime(time);
group.updateMatrixWorld(true);

const motionFrame = motionData.frames[frameIdx];

console.log(`=== FRAME ${frameIdx}: WORLD ROTATION VERIFICATION ===`);
console.log('Bone               | FBX→viewer euler                  | Pipeline euler                   | Error°');
console.log('-'.repeat(110));

// FBX world deltas
const fbxWorldDeltas = {};
for (const name of keyBones) {
  const bone = boneByName[name];
  if (!bone || !restWorldQuat[name]) continue;
  const wq = new THREE.Quaternion();
  bone.getWorldQuaternion(wq);
  fbxWorldDeltas[name] = restWorldQuat[name].clone().invert().multiply(wq);
}

// Pipeline: convert world deltas, decompose hierarchy, recompute world
const viewerWorldDeltas = {};
for (const [boneName, data] of Object.entries(motionFrame)) {
  viewerWorldDeltas[boneName] = toViewerArr(data.dq);
}

const viewerLocals = {};
for (const name of keyBones) {
  const worldDQ = viewerWorldDeltas[name];
  if (!worldDQ) continue;
  const parentName = HIERARCHY[name];
  if (!parentName || !viewerWorldDeltas[parentName]) {
    viewerLocals[name] = worldDQ.clone();
  } else {
    viewerLocals[name] = viewerWorldDeltas[parentName].clone().invert().multiply(worldDQ);
  }
}

const recomputedWorld = {};
for (const name of keyBones) {
  const parentName = HIERARCHY[name];
  const localQ = viewerLocals[name];
  if (!localQ) continue;
  if (!parentName || !recomputedWorld[parentName]) {
    recomputedWorld[name] = localQ.clone();
  } else {
    recomputedWorld[name] = recomputedWorld[parentName].clone().multiply(localQ);
  }
}

let allOK = true;
for (const name of keyBones) {
  const fbxDelta = fbxWorldDeltas[name];
  const viewerWorld = recomputedWorld[name];
  if (!fbxDelta || !viewerWorld) continue;

  const fbxViewer = toViewer(fbxDelta);
  const e1 = new THREE.Euler().setFromQuaternion(fbxViewer, 'XYZ');
  const e2 = new THREE.Euler().setFromQuaternion(viewerWorld, 'XYZ');

  const dot = Math.abs(fbxViewer.x*viewerWorld.x + fbxViewer.y*viewerWorld.y +
                        fbxViewer.z*viewerWorld.z + fbxViewer.w*viewerWorld.w);
  const angErr = r(2 * Math.acos(Math.min(1, dot)) * rad2deg);
  const ok = angErr < 1.5;
  if (!ok) allOK = false;

  console.log(
    `${name.padEnd(20)}` +
    `| X:${r(e1.x*rad2deg)}° Y:${r(e1.y*rad2deg)}° Z:${r(e1.z*rad2deg)}°`.padEnd(38) +
    `| X:${r(e2.x*rad2deg)}° Y:${r(e2.y*rad2deg)}° Z:${r(e2.z*rad2deg)}°`.padEnd(38) +
    `| ${ok ? 'OK' : 'ERR'} (${angErr}°)`
  );
}

console.log(`\nAll world rotations correct: ${allOK ? 'YES ✓' : 'NO ✗'}`);

// Endpoint position comparison
console.log('\n=== ENDPOINT POSITIONS (converted to viewer space) ===');
console.log('Bone          | FBX delta (viewer coords)        | Direction check');
console.log('-'.repeat(80));

const animWorldPos = {};
for (const name of keyBones) {
  const bone = boneByName[name];
  if (bone) {
    const wp = new THREE.Vector3();
    bone.getWorldPosition(wp);
    animWorldPos[name] = wp.clone();
  }
}

for (const name of ['LeftHand', 'RightHand', 'LeftFoot', 'RightFoot', 'Head']) {
  const restP = restWorldPos[name];
  const animP = animWorldPos[name];
  if (!restP || !animP) continue;
  const dp = animP.clone().sub(restP);
  const vdp = posToViewer(dp);

  console.log(
    `${name.padEnd(14)}` +
    `| (${r(vdp.x)}, ${r(vdp.y)}, ${r(vdp.z)})`.padEnd(38) +
    `| X:${vdp.x > 0 ? 'right' : 'left'} Y:${vdp.y > 0 ? 'up' : 'down'} Z:${vdp.z > 0 ? 'back' : 'front'}`
  );
}

mixer.stopAllAction();
mixer.uncacheRoot(group);
