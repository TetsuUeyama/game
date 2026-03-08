/**
 * Verify quaternion conversion by comparing motion.json deltas
 * with expected Euler angles from the FBX.
 *
 * Loads the model-attached FBX and motion.json, applies each conversion formula,
 * decomposes to local deltas via the same hierarchy, and compares.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Blob } from 'buffer';

// ── Polyfills ──
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

// Mixamo hierarchy (matching BONE_DEFS in page.tsx)
const HIERARCHY = {
  'Hips': null,
  'Spine': 'Hips', 'Spine1': 'Spine', 'Spine2': 'Spine1',
  'Neck': 'Spine2', 'Head': 'Neck',
  'LeftShoulder': 'Spine2', 'LeftArm': 'LeftShoulder', 'LeftForeArm': 'LeftArm', 'LeftHand': 'LeftForeArm',
  'RightShoulder': 'Spine2', 'RightArm': 'RightShoulder', 'RightForeArm': 'RightArm', 'RightHand': 'RightForeArm',
  'LeftUpLeg': 'Hips', 'LeftLeg': 'LeftUpLeg', 'LeftFoot': 'LeftLeg', 'LeftToeBase': 'LeftFoot',
  'RightUpLeg': 'Hips', 'RightLeg': 'RightUpLeg', 'RightFoot': 'RightLeg', 'RightToeBase': 'RightFoot',
};

// Conversion formulas
const CONVERSIONS = {
  conv1: (dq) => new THREE.Quaternion(-dq[0], -dq[1], dq[2], dq[3]),  // (-x,-y,z,w)
  conv2: (dq) => new THREE.Quaternion(dq[0], dq[1], -dq[2], dq[3]),   // (x,y,-z,w)
  conv3: (dq) => new THREE.Quaternion(dq[0], dq[1], -dq[2], -dq[3]),  // (x,y,-z,-w)
  conv4: (dq) => new THREE.Quaternion(-dq[0], dq[1], dq[2], dq[3]),   // (-x,y,z,w)
  identity: (dq) => new THREE.Quaternion(dq[0], dq[1], dq[2], dq[3]), // (x,y,z,w)
};

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load FBX with model to get ground truth local rotations
const fbxPath = path.join(__dirname, '..', 'public', 'models', 'character-motion', 'Hip Hop Dancing (1).fbx');
const motionPath = path.join(__dirname, '..', 'public', 'models', 'character-motion', 'Hip Hop Dancing.motion.json');

console.log('Loading FBX...');
const loader = new FBXLoader();
const group = await new Promise((resolve, reject) => {
  loader.load(path.resolve(fbxPath), resolve, undefined, reject);
});

const boneByName = {};
group.traverse((obj) => {
  if (obj.isBone) boneByName[cleanBoneName(obj.name)] = obj;
});

const clip = group.animations[0];
const mixer = new THREE.AnimationMixer(group);
const action = mixer.clipAction(clip);
action.play();

// Load motion.json
const motionData = JSON.parse(fs.readFileSync(path.resolve(motionPath), 'utf-8'));

// Key bones to check
const keyBones = ['Hips', 'Spine', 'Spine2', 'LeftArm', 'RightArm', 'LeftForeArm', 'RightForeArm', 'LeftUpLeg', 'RightUpLeg', 'Head'];

// Analyze frame 67
const frameIdx = 67;
const time = frameIdx / 30;
mixer.setTime(time);
group.updateMatrixWorld(true);

console.log(`\n=== Frame ${frameIdx} ===`);
console.log('Comparing FBX LOCAL rotations vs viewer LOCAL rotations (from world deltas + hierarchy decomposition)');
console.log('FBX local = bone.quaternion (the actual local rotation Three.js computed)');
console.log('Viewer local = parentWorldDelta⁻¹ × boneWorldDelta (our decomposition)\n');

// Get FBX rest pose
mixer.setTime(0);
group.updateMatrixWorld(true);

const restLocalQ = {};
for (const name of keyBones) {
  const bone = boneByName[name];
  if (bone) restLocalQ[name] = bone.quaternion.clone();
}

// Get animated pose
mixer.setTime(time);
group.updateMatrixWorld(true);

const animLocalQ = {};
for (const name of keyBones) {
  const bone = boneByName[name];
  if (bone) animLocalQ[name] = bone.quaternion.clone();
}

// Compute FBX local delta = restLocalQ⁻¹ × animLocalQ
const fbxLocalDelta = {};
for (const name of keyBones) {
  if (!restLocalQ[name] || !animLocalQ[name]) continue;
  const invRest = restLocalQ[name].clone().invert();
  fbxLocalDelta[name] = invRest.multiply(animLocalQ[name]);
}

// Now, from motion.json, apply each conversion and compute local deltas
const motionFrame = motionData.frames[frameIdx];

for (const [convName, convFn] of Object.entries(CONVERSIONS)) {
  console.log(`\n--- Conversion: ${convName} ---`);
  console.log('Bone               | FBX local delta euler        | Viewer local delta euler       | Error°');
  console.log('-'.repeat(100));

  // Convert world deltas
  const worldDeltas = {};
  for (const [boneName, data] of Object.entries(motionFrame)) {
    worldDeltas[boneName] = convFn(data.dq);
  }

  // Decompose to local deltas using hierarchy
  const viewerLocalDelta = {};
  for (const name of keyBones) {
    const worldDQ = worldDeltas[name];
    if (!worldDQ) continue;

    const parentName = HIERARCHY[name];
    if (!parentName) {
      viewerLocalDelta[name] = worldDQ.clone();
    } else {
      const parentWorldDQ = worldDeltas[parentName];
      if (parentWorldDQ) {
        const parentInv = parentWorldDQ.clone().invert();
        viewerLocalDelta[name] = parentInv.multiply(worldDQ);
      } else {
        viewerLocalDelta[name] = worldDQ.clone();
      }
    }
  }

  // Compare
  let totalError = 0;
  let count = 0;
  for (const name of keyBones) {
    const fbx = fbxLocalDelta[name];
    const viewer = viewerLocalDelta[name];
    if (!fbx || !viewer) continue;

    const fbxEuler = new THREE.Euler().setFromQuaternion(fbx, 'XYZ');
    const viewerEuler = new THREE.Euler().setFromQuaternion(viewer, 'XYZ');

    const ex = r(fbxEuler.x * rad2deg);
    const ey = r(fbxEuler.y * rad2deg);
    const ez = r(fbxEuler.z * rad2deg);

    const vx = r(viewerEuler.x * rad2deg);
    const vy = r(viewerEuler.y * rad2deg);
    const vz = r(viewerEuler.z * rad2deg);

    // Angular error (using quaternion distance)
    const dot = Math.abs(fbx.x * viewer.x + fbx.y * viewer.y + fbx.z * viewer.z + fbx.w * viewer.w);
    const angError = r(2 * Math.acos(Math.min(1, dot)) * rad2deg);
    totalError += angError;
    count++;

    console.log(
      `${name.padEnd(20)}` +
      `| X:${ex}° Y:${ey}° Z:${ez}°`.padEnd(32) +
      `| X:${vx}° Y:${vy}° Z:${vz}°`.padEnd(35) +
      `| ${angError}°`
    );
  }

  console.log(`  Total angular error: ${r(totalError)}° (avg: ${r(totalError / count)}°)`);
}

mixer.stopAllAction();
mixer.uncacheRoot(group);
