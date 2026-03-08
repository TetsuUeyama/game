/**
 * Trace the LEFT HAND trajectory across all frames.
 * Compare FBX ground truth endpoint positions (converted to viewer coords)
 * with what our quaternion pipeline produces.
 *
 * This is the definitive test: if the hand moves LEFT when it should move RIGHT,
 * we know there's a directional error.
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
const r = (v) => Math.round(v * 100) / 100;

const HIERARCHY = {
  'Hips': null,
  'Spine': 'Hips', 'Spine1': 'Spine', 'Spine2': 'Spine1',
  'Neck': 'Spine2', 'Head': 'Neck',
  'LeftShoulder': 'Spine2', 'LeftArm': 'LeftShoulder', 'LeftForeArm': 'LeftArm', 'LeftHand': 'LeftForeArm',
  'RightShoulder': 'Spine2', 'RightArm': 'RightShoulder', 'RightForeArm': 'RightArm', 'RightHand': 'RightForeArm',
  'LeftUpLeg': 'Hips', 'LeftLeg': 'LeftUpLeg', 'LeftFoot': 'LeftLeg', 'LeftToeBase': 'LeftFoot',
  'RightUpLeg': 'Hips', 'RightLeg': 'RightUpLeg', 'RightFoot': 'RightLeg', 'RightToeBase': 'RightFoot',
};
const keyBones = Object.keys(HIERARCHY);

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

// Capture rest pose
mixer.setTime(0);
group.updateMatrixWorld(true);

const restWorldQuat = {};
const restWorldPos = {};
const restBoneLength = {};

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

// Compute bone lengths (rest pose)
for (const name of keyBones) {
  const parentName = HIERARCHY[name];
  if (parentName && restWorldPos[name] && restWorldPos[parentName]) {
    restBoneLength[name] = restWorldPos[name].distanceTo(restWorldPos[parentName]);
  }
}

// Axis mapping: viewer = (-Three_x, Three_y, -Three_z)
const toViewerPos = (p) => ({ x: -p.x, y: p.y, z: -p.z });
const toViewerQuat = (dq) => new THREE.Quaternion(-dq[0], dq[1], -dq[2], dq[3]);

/**
 * Simulate what the viewer does:
 * 1. Convert world deltas to viewer space
 * 2. Decompose to local deltas via hierarchy
 * 3. Apply local deltas through hierarchy to compute world rotation
 * 4. Use world rotation to compute endpoint positions
 */
function simulateViewerFrame(frameData) {
  // Convert world deltas
  const worldDeltas = {};
  for (const [boneName, data] of Object.entries(frameData)) {
    worldDeltas[boneName] = toViewerQuat(data.dq);
  }

  // Decompose to local
  const locals = {};
  for (const name of keyBones) {
    const worldDQ = worldDeltas[name];
    if (!worldDQ) continue;
    const parentName = HIERARCHY[name];
    if (!parentName || !worldDeltas[parentName]) {
      locals[name] = worldDQ.clone();
    } else {
      locals[name] = worldDeltas[parentName].clone().invert().multiply(worldDQ);
    }
  }

  // Recompose world (simulating Babylon.js hierarchy: worldQ = parentWorldQ × localQ)
  const world = {};
  for (const name of keyBones) {
    const parentName = HIERARCHY[name];
    const localQ = locals[name];
    if (!localQ) continue;
    if (!parentName || !world[parentName]) {
      world[name] = localQ.clone();
    } else {
      world[name] = world[parentName].clone().multiply(localQ);
    }
  }

  // Compute endpoint positions using world rotations and bone lengths
  // In the viewer, the rest position of each bone tip relative to parent
  // is determined by the rest pose bone direction rotated by the world delta.
  //
  // For the LeftHand endpoint, we need to compute:
  //   viewerPos(LeftHand) = viewerPos(Hips) + sum of (worldDelta[parent] × boneVector)
  //
  // But for simplicity, let's just return the world delta quaternion

  return { worldDeltas: world, inputWorldDeltas: worldDeltas };
}

// ========================================================================
// TRACE HAND TRAJECTORY
// ========================================================================

console.log('=== LEFT HAND TRAJECTORY: FBX vs VIEWER PIPELINE ===');
console.log('FBX delta = actual hand displacement from rest (converted to viewer coords)');
console.log('Pipeline = world delta quaternion applied to rest bone chain');
console.log('If X direction is inverted, arm swing direction would be wrong\n');

console.log('Frame | FBX LeftHand delta (viewer)      | FBX Hips delta (viewer)          | Arm swing direction');
console.log('-'.repeat(100));

// Sample every 10 frames
const sampleFrames = [];
for (let f = 0; f < motionData.frameCount; f += 5) {
  sampleFrames.push(f);
}

const trajectoryData = [];

for (const frameIdx of sampleFrames) {
  const time = frameIdx / 30;
  mixer.setTime(time);
  group.updateMatrixWorld(true);

  // FBX ground truth
  const leftHandPos = new THREE.Vector3();
  const hipsPos = new THREE.Vector3();
  boneByName['LeftHand']?.getWorldPosition(leftHandPos);
  boneByName['Hips']?.getWorldPosition(hipsPos);

  const leftHandDelta = leftHandPos.clone().sub(restWorldPos['LeftHand']);
  const hipsDelta = hipsPos.clone().sub(restWorldPos['Hips']);

  // Convert to viewer coords
  const vHandDelta = toViewerPos(leftHandDelta);
  const vHipsDelta = toViewerPos(hipsDelta);

  // Determine swing direction relative to body
  const handRelativeToHips_x = vHandDelta.x - vHipsDelta.x;
  const handRelativeToHips_z = vHandDelta.z - vHipsDelta.z;

  const direction = (handRelativeToHips_x > 0.05 ? 'RIGHT' : handRelativeToHips_x < -0.05 ? 'LEFT' : 'center') +
    ' / ' + (handRelativeToHips_z > 0.05 ? 'BACK' : handRelativeToHips_z < -0.05 ? 'FRONT' : 'center');

  trajectoryData.push({
    frame: frameIdx,
    handX: vHandDelta.x,
    handZ: vHandDelta.z,
    hipsX: vHipsDelta.x,
    relX: handRelativeToHips_x,
    relZ: handRelativeToHips_z,
  });

  console.log(
    `${String(frameIdx).padStart(5)} ` +
    `| X:${r(vHandDelta.x).toString().padStart(6)} Y:${r(vHandDelta.y).toString().padStart(6)} Z:${r(vHandDelta.z).toString().padStart(6)}` +
    `  | X:${r(vHipsDelta.x).toString().padStart(6)} Y:${r(vHipsDelta.y).toString().padStart(6)} Z:${r(vHipsDelta.z).toString().padStart(6)}` +
    `  | ${direction}`
  );
}

// Now check: does the pipeline's world quaternion produce matching results?
console.log('\n\n=== WORLD QUATERNION COMPARISON (key frames) ===');
console.log('Compare pipeline world delta with FBX world delta (converted to viewer)');
console.log('Focus on LeftArm chain to find directional error\n');

const checkFrames = [0, 20, 40, 60, 80, 100, 120];
const checkBones = ['LeftShoulder', 'LeftArm', 'LeftForeArm', 'LeftHand'];

for (const frameIdx of checkFrames) {
  if (frameIdx >= motionData.frameCount) continue;
  const time = frameIdx / 30;
  mixer.setTime(time);
  group.updateMatrixWorld(true);

  const motionFrame = motionData.frames[frameIdx];
  const result = simulateViewerFrame(motionFrame);

  console.log(`--- Frame ${frameIdx} ---`);
  console.log('Bone               | FBX→viewer world quat            | Pipeline world quat              | Error°');

  for (const name of checkBones) {
    const bone = boneByName[name];
    if (!bone || !restWorldQuat[name]) continue;
    const wq = new THREE.Quaternion();
    bone.getWorldQuaternion(wq);
    const fbxDelta = restWorldQuat[name].clone().invert().multiply(wq);
    const fbxViewer = new THREE.Quaternion(-fbxDelta.x, fbxDelta.y, -fbxDelta.z, fbxDelta.w);

    const pipelineQ = result.worldDeltas[name];
    if (!pipelineQ) { console.log(`${name.padEnd(20)}| NO DATA`); continue; }

    const dot = Math.abs(fbxViewer.x*pipelineQ.x + fbxViewer.y*pipelineQ.y +
                         fbxViewer.z*pipelineQ.z + fbxViewer.w*pipelineQ.w);
    const angErr = r(2 * Math.acos(Math.min(1, dot)) * 180 / Math.PI);

    console.log(
      `${name.padEnd(20)}` +
      `| (${r(fbxViewer.x)}, ${r(fbxViewer.y)}, ${r(fbxViewer.z)}, ${r(fbxViewer.w)})`.padEnd(36) +
      `| (${r(pipelineQ.x)}, ${r(pipelineQ.y)}, ${r(pipelineQ.z)}, ${r(pipelineQ.w)})`.padEnd(36) +
      `| ${angErr}°`
    );
  }
  console.log('');
}

// ========================================================================
// DEFINITIVE TEST: Compute hand endpoint using FK chain with pipeline quaternions
// vs FBX endpoint, both in viewer coordinates
// ========================================================================
console.log('\n=== DEFINITIVE FK TEST: Hand endpoint position ===');
console.log('Compute LeftHand position using FK chain with pipeline world quaternions');
console.log('Compare with FBX LeftHand position (converted to viewer coords)\n');

console.log('Frame | FBX hand (viewer)                | FK hand (viewer)                 | Delta');
console.log('-'.repeat(100));

// Rest pose bone vectors (in viewer coords)
const restBoneVectors = {};
for (const name of keyBones) {
  const parentName = HIERARCHY[name];
  if (parentName && restWorldPos[name] && restWorldPos[parentName]) {
    const diff = restWorldPos[name].clone().sub(restWorldPos[parentName]);
    restBoneVectors[name] = toViewerPos(diff);
  }
}

for (const frameIdx of [0, 20, 40, 60, 67, 80, 100, 120]) {
  if (frameIdx >= motionData.frameCount) continue;
  const time = frameIdx / 30;
  mixer.setTime(time);
  group.updateMatrixWorld(true);

  const motionFrame = motionData.frames[frameIdx];
  const result = simulateViewerFrame(motionFrame);

  // FBX ground truth LeftHand position (viewer coords)
  const fbxHandPos = new THREE.Vector3();
  boneByName['LeftHand']?.getWorldPosition(fbxHandPos);
  const fbxHandDelta = fbxHandPos.clone().sub(restWorldPos['LeftHand']);
  const vFbxHand = toViewerPos(fbxHandDelta);

  // FK chain: compute LeftHand position from Hips using world deltas
  // handPos = hipsPos + worldDelta[Hips] × boneVec[Spine] + worldDelta[Spine] × boneVec[Spine1] + ...
  const chain = ['Spine', 'Spine1', 'Spine2', 'LeftShoulder', 'LeftArm', 'LeftForeArm', 'LeftHand'];

  // Start from Hips (apply position delta)
  const hipsData = motionFrame['Hips'];
  let fkPos = new THREE.Vector3(0, 0, 0);
  if (hipsData?.dp) {
    fkPos.x = -hipsData.dp[0]; // viewer_x = -Three_x
    fkPos.y = hipsData.dp[1];  // viewer_y = Three_y
    fkPos.z = -hipsData.dp[2]; // viewer_z = -Three_z
  }

  // Add rotated bone vectors
  for (const boneName of chain) {
    const parentName = HIERARCHY[boneName];
    const boneVec = restBoneVectors[boneName];
    if (!boneVec || !parentName) continue;

    // Get parent world delta
    const parentWorldQ = result.worldDeltas[parentName];
    if (!parentWorldQ) {
      fkPos.x += boneVec.x;
      fkPos.y += boneVec.y;
      fkPos.z += boneVec.z;
      continue;
    }

    // Rotate bone vector by parent world delta
    const bv = new THREE.Vector3(boneVec.x, boneVec.y, boneVec.z);
    bv.applyQuaternion(parentWorldQ);
    fkPos.x += bv.x;
    fkPos.y += bv.y;
    fkPos.z += bv.z;
  }

  // fkPos is the delta from rest position
  const dx = r(vFbxHand.x - fkPos.x);
  const dy = r(vFbxHand.y - fkPos.y);
  const dz = r(vFbxHand.z - fkPos.z);

  console.log(
    `${String(frameIdx).padStart(5)} ` +
    `| (${r(vFbxHand.x).toString().padStart(6)}, ${r(vFbxHand.y).toString().padStart(6)}, ${r(vFbxHand.z).toString().padStart(6)})` +
    `  | (${r(fkPos.x).toString().padStart(6)}, ${r(fkPos.y).toString().padStart(6)}, ${r(fkPos.z).toString().padStart(6)})` +
    `  | (${dx}, ${dy}, ${dz})`
  );
}

mixer.stopAllAction();
mixer.uncacheRoot(group);
