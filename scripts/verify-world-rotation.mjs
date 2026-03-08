/**
 * Verify that our pipeline produces the correct WORLD rotation for each bone.
 *
 * Pipeline: worldDelta → toViewer(worldDelta) → hierarchy decomposition → Babylon.js worldQ
 * Expected: boneViewerWorldQ should equal toViewer(boneWorldDelta)
 *
 * This verifies that the telescoping property holds and the final visual result is correct.
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
    if (this.responseType === 'arraybuffer') {
      setTimeout(() => onLoad(ab), 0);
    } else {
      setTimeout(() => onLoad(buf.toString('utf-8')), 0);
    }
  } catch (e) {
    if (onError) onError(e);
    else console.error(e);
  }
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

console.log('Loading FBX...');
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

// Capture rest pose
mixer.setTime(0);
group.updateMatrixWorld(true);
const restWorldQuat = {};
for (const name of keyBones) {
  const bone = boneByName[name];
  if (bone) {
    const wq = new THREE.Quaternion();
    bone.getWorldQuaternion(wq);
    restWorldQuat[name] = wq.clone();
  }
}

// Conv1: (-x, -y, z, w) - the Z-negation conversion
const toViewer = (q) => new THREE.Quaternion(-q.x, -q.y, q.z, q.w);
const toViewerArr = (dq) => new THREE.Quaternion(-dq[0], -dq[1], dq[2], dq[3]);

console.log('\n=== WORLD ROTATION VERIFICATION ===');
console.log('Checking: does our pipeline produce correct world rotations?\n');

const frameIdx = 67;
const time = frameIdx / 30;
mixer.setTime(time);
group.updateMatrixWorld(true);

const motionFrame = motionData.frames[frameIdx];

// Step 1: What the FBX gives (ground truth world deltas)
const fbxWorldDeltas = {};
for (const name of keyBones) {
  const bone = boneByName[name];
  if (!bone || !restWorldQuat[name]) continue;
  const wq = new THREE.Quaternion();
  bone.getWorldQuaternion(wq);
  fbxWorldDeltas[name] = restWorldQuat[name].clone().invert().multiply(wq);
}

// Step 2: What our pipeline produces (from motion.json)
// Convert all world deltas to viewer space
const viewerWorldDeltas = {};
for (const [boneName, data] of Object.entries(motionFrame)) {
  viewerWorldDeltas[boneName] = toViewerArr(data.dq);
}

// Decompose to local using hierarchy
const viewerLocals = {};
for (const name of keyBones) {
  const worldDQ = viewerWorldDeltas[name];
  if (!worldDQ) continue;
  const parentName = HIERARCHY[name];
  if (!parentName) {
    viewerLocals[name] = worldDQ.clone();
  } else {
    const parentWorldDQ = viewerWorldDeltas[parentName];
    if (parentWorldDQ) {
      const parentInv = parentWorldDQ.clone().invert();
      viewerLocals[name] = parentInv.multiply(worldDQ);
    } else {
      viewerLocals[name] = worldDQ.clone();
    }
  }
}

// Recompute world from locals (simulating Babylon.js hierarchy)
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

console.log('Bone               | FBX WorldDelta euler (Three.js)   | Viewer recomputed world euler    | Match?');
console.log('-'.repeat(110));

let allMatch = true;
for (const name of keyBones) {
  const fbxDelta = fbxWorldDeltas[name];
  const viewerWorld = recomputedWorld[name];
  if (!fbxDelta || !viewerWorld) continue;

  const fbxViewer = toViewer(fbxDelta); // Convert FBX world delta to viewer coords for comparison

  const fbxEuler = new THREE.Euler().setFromQuaternion(fbxViewer, 'XYZ');
  const viewerEuler = new THREE.Euler().setFromQuaternion(viewerWorld, 'XYZ');

  // Quaternion distance
  const dot = Math.abs(
    fbxViewer.x * viewerWorld.x + fbxViewer.y * viewerWorld.y +
    fbxViewer.z * viewerWorld.z + fbxViewer.w * viewerWorld.w
  );
  const angError = r(2 * Math.acos(Math.min(1, dot)) * rad2deg);
  const ok = angError < 0.1;
  if (!ok) allMatch = false;

  console.log(
    `${name.padEnd(20)}` +
    `| X:${r(fbxEuler.x*rad2deg)}° Y:${r(fbxEuler.y*rad2deg)}° Z:${r(fbxEuler.z*rad2deg)}°`.padEnd(38) +
    `| X:${r(viewerEuler.x*rad2deg)}° Y:${r(viewerEuler.y*rad2deg)}° Z:${r(viewerEuler.z*rad2deg)}°`.padEnd(38) +
    `| ${ok ? 'OK' : 'MISMATCH'} (${angError}°)`
  );
}

console.log(`\nAll world rotations match: ${allMatch ? 'YES ✓' : 'NO ✗'}`);

// =====================================
// VISUAL COMPARISON: Check how the bone geometry would move
// =====================================
console.log('\n\n=== VISUAL COMPARISON ===');
console.log('For key bones: FBX rest→anim rotation DIRECTION vs viewer rotation DIRECTION');
console.log('A "tip" vector points along the bone axis. We rotate it and check the result.\n');

// For each bone, define a "tip" direction (along the bone from joint toward child)
const restWorldPos = {};
mixer.setTime(0);
group.updateMatrixWorld(true);
for (const name of keyBones) {
  const bone = boneByName[name];
  if (bone) {
    const wp = new THREE.Vector3();
    bone.getWorldPosition(wp);
    restWorldPos[name] = wp.clone();
  }
}

mixer.setTime(time);
group.updateMatrixWorld(true);

const animWorldPos = {};
for (const name of keyBones) {
  const bone = boneByName[name];
  if (bone) {
    const wp = new THREE.Vector3();
    bone.getWorldPosition(wp);
    animWorldPos[name] = wp.clone();
  }
}

// Check displacement of key endpoints
console.log('Bone          | FBX anim pos (Three.js)         | FBX delta pos (from rest)       | Viewer equivalent delta');
console.log('-'.repeat(120));

for (const name of ['LeftHand', 'RightHand', 'LeftFoot', 'RightFoot', 'Head']) {
  const restP = restWorldPos[name];
  const animP = animWorldPos[name];
  if (!restP || !animP) continue;

  const dp = animP.clone().sub(restP);
  // Convert position delta to viewer: (x, y, -z) since viewerZ = -ThreeZ
  const viewerDp = { x: r(dp.x), y: r(dp.y), z: r(-dp.z) };

  console.log(
    `${name.padEnd(14)}` +
    `| (${r(animP.x)}, ${r(animP.y)}, ${r(animP.z)})`.padEnd(35) +
    `| (${r(dp.x)}, ${r(dp.y)}, ${r(dp.z)})`.padEnd(35) +
    `| (${viewerDp.x}, ${viewerDp.y}, ${viewerDp.z})`
  );
}

console.log('\nIf the viewer character has the same proportions, these endpoint deltas');
console.log('should match the viewer-side movement (scaled by voxelHeight/fbxHeight).');

mixer.stopAllAction();
mixer.uncacheRoot(group);
