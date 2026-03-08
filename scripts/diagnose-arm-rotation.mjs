/**
 * Diagnose arm rotation issue: compare Three.js ground truth with
 * what Babylon.js viewer would compute, using Babylon.js Quaternion class.
 *
 * This script simulates the EXACT same logic as page.tsx applyFrame,
 * but using Babylon.js Quaternion to verify the result matches Three.js.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Blob } from 'buffer';

// ── Polyfills for Three.js ──
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

// ── Also import Babylon.js Quaternion ──
const BABYLON = await import('@babylonjs/core/Maths/math.vector.js');
const BQ = BABYLON.Quaternion;

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
for (const name of keyBones) {
  const bone = boneByName[name];
  if (bone) {
    const wq = new THREE.Quaternion();
    bone.getWorldQuaternion(wq);
    restWorldQuat[name] = wq.clone();
  }
}

// Convert using Three.js (reference)
const toViewerThree = (q) => new THREE.Quaternion(-q.x, q.y, -q.z, q.w);
const toViewerArrThree = (dq) => new THREE.Quaternion(-dq[0], dq[1], -dq[2], dq[3]);

// Convert using Babylon.js (what the viewer actually does)
const toViewerArrBabylon = (dq) => new BQ(-dq[0], dq[1], -dq[2], dq[3]);

const frameIdx = 67;
const time = frameIdx / 30;
mixer.setTime(time);
group.updateMatrixWorld(true);

const motionFrame = motionData.frames[frameIdx];

// FBX ground truth world deltas
const fbxWorldDeltas = {};
for (const name of keyBones) {
  const bone = boneByName[name];
  if (!bone || !restWorldQuat[name]) continue;
  const wq = new THREE.Quaternion();
  bone.getWorldQuaternion(wq);
  fbxWorldDeltas[name] = restWorldQuat[name].clone().invert().multiply(wq);
}

// ===== THREE.JS PIPELINE (reference) =====
const threeWorldDeltas = {};
for (const [boneName, data] of Object.entries(motionFrame)) {
  threeWorldDeltas[boneName] = toViewerArrThree(data.dq);
}

const threeLocals = {};
for (const name of keyBones) {
  const worldDQ = threeWorldDeltas[name];
  if (!worldDQ) continue;
  const parentName = HIERARCHY[name];
  if (!parentName || !threeWorldDeltas[parentName]) {
    threeLocals[name] = worldDQ.clone();
  } else {
    threeLocals[name] = threeWorldDeltas[parentName].clone().invert().multiply(worldDQ);
  }
}

// ===== BABYLON.JS PIPELINE (what the viewer does) =====
const babylonWorldDeltas = {};
for (const [boneName, data] of Object.entries(motionFrame)) {
  babylonWorldDeltas[boneName] = toViewerArrBabylon(data.dq);
}

const babylonLocals = {};
for (const name of keyBones) {
  const worldDQ = babylonWorldDeltas[name];
  if (!worldDQ) continue;
  const parentName = HIERARCHY[name];
  if (!parentName || !babylonWorldDeltas[parentName]) {
    babylonLocals[name] = worldDQ.clone();
  } else {
    const parentInv = babylonWorldDeltas[parentName].clone();
    parentInv.invertInPlace();
    babylonLocals[name] = parentInv.multiply(worldDQ);
  }
}

// Recompose world from locals (simulating Babylon.js hierarchy)
const babylonRecomposedWorld = {};
for (const name of keyBones) {
  const parentName = HIERARCHY[name];
  const localQ = babylonLocals[name];
  if (!localQ) continue;
  if (!parentName || !babylonRecomposedWorld[parentName]) {
    babylonRecomposedWorld[name] = localQ.clone();
  } else {
    // Babylon.js hierarchy: worldQ = parentWorldQ × localQ
    babylonRecomposedWorld[name] = babylonRecomposedWorld[parentName].multiply(localQ);
  }
}

console.log('=== FRAME 67: THREE.JS vs BABYLON.JS PIPELINE COMPARISON ===');
console.log('Focus on arm bones to find discrepancy\n');

console.log('--- LOCAL QUATERNION VALUES (parentWorldInv × worldDelta) ---');
console.log('Bone               | Three.js local quat              | Babylon.js local quat            | Match?');
console.log('-'.repeat(110));

const focusBones = [
  'Hips', 'Spine', 'Spine2',
  'LeftShoulder', 'LeftArm', 'LeftForeArm', 'LeftHand',
  'RightShoulder', 'RightArm', 'RightForeArm', 'RightHand',
  'LeftUpLeg', 'LeftLeg', 'LeftFoot',
  'RightUpLeg', 'RightLeg', 'RightFoot',
];

for (const name of focusBones) {
  const tq = threeLocals[name];
  const bq = babylonLocals[name];
  if (!tq || !bq) continue;

  // Compare quaternion values
  const dx = Math.abs(tq.x - bq.x);
  const dy = Math.abs(tq.y - bq.y);
  const dz = Math.abs(tq.z - bq.z);
  const dw = Math.abs(tq.w - bq.w);
  const maxDiff = Math.max(dx, dy, dz, dw);
  const ok = maxDiff < 1e-6;

  console.log(
    `${name.padEnd(20)}` +
    `| (${r(tq.x)}, ${r(tq.y)}, ${r(tq.z)}, ${r(tq.w)})`.padEnd(36) +
    `| (${r(bq.x)}, ${r(bq.y)}, ${r(bq.z)}, ${r(bq.w)})`.padEnd(36) +
    `| ${ok ? 'OK' : `DIFF ${r(maxDiff)}`}`
  );
}

console.log('\n--- RECOMPOSED WORLD QUATERNION (Babylon.js hierarchy: parent × local) ---');
console.log('Bone               | Expected (converted FBX)         | Babylon recomposed               | Error°');
console.log('-'.repeat(110));

for (const name of focusBones) {
  const expected = threeWorldDeltas[name];
  const actual = babylonRecomposedWorld[name];
  if (!expected || !actual) continue;

  // Angular error
  const dot = Math.abs(expected.x * actual.x + expected.y * actual.y +
                       expected.z * actual.z + expected.w * actual.w);
  const angErr = r(2 * Math.acos(Math.min(1, dot)) * rad2deg);

  console.log(
    `${name.padEnd(20)}` +
    `| (${r(expected.x)}, ${r(expected.y)}, ${r(expected.z)}, ${r(expected.w)})`.padEnd(36) +
    `| (${r(actual.x)}, ${r(actual.y)}, ${r(actual.z)}, ${r(actual.w)})`.padEnd(36) +
    `| ${angErr < 0.5 ? 'OK' : 'ERR'} (${angErr}°)`
  );
}

// ===== KEY TEST: Verify Babylon.js Quaternion.multiply matches Three.js =====
console.log('\n--- QUATERNION MULTIPLY CROSS-CHECK ---');
const tA = new THREE.Quaternion(0.3, 0.5, -0.2, 0.8).normalize();
const tB = new THREE.Quaternion(-0.1, 0.7, 0.4, 0.5).normalize();
const tAB = tA.clone().multiply(tB);

const bA = new BQ(tA.x, tA.y, tA.z, tA.w);
const bB = new BQ(tB.x, tB.y, tB.z, tB.w);
const bAB = bA.multiply(bB);

console.log(`Three.js A×B: (${r(tAB.x)}, ${r(tAB.y)}, ${r(tAB.z)}, ${r(tAB.w)})`);
console.log(`Babylon  A×B: (${r(bAB.x)}, ${r(bAB.y)}, ${r(bAB.z)}, ${r(bAB.w)})`);
const mulDiff = Math.max(
  Math.abs(tAB.x - bAB.x), Math.abs(tAB.y - bAB.y),
  Math.abs(tAB.z - bAB.z), Math.abs(tAB.w - bAB.w)
);
console.log(`Max difference: ${mulDiff.toExponential(3)} → ${mulDiff < 1e-10 ? 'IDENTICAL' : 'DIFFERENT!'}`);

// ===== KEY TEST: Verify Babylon.js invert matches Three.js =====
console.log('\n--- QUATERNION INVERT CROSS-CHECK ---');
const tInv = tA.clone().invert();
const bInv = bA.clone();
bInv.invertInPlace();

console.log(`Three.js inv(A): (${r(tInv.x)}, ${r(tInv.y)}, ${r(tInv.z)}, ${r(tInv.w)})`);
console.log(`Babylon  inv(A): (${r(bInv.x)}, ${r(bInv.y)}, ${r(bInv.z)}, ${r(bInv.w)})`);
const invDiff = Math.max(
  Math.abs(tInv.x - bInv.x), Math.abs(tInv.y - bInv.y),
  Math.abs(tInv.z - bInv.z), Math.abs(tInv.w - bInv.w)
);
console.log(`Max difference: ${invDiff.toExponential(3)} → ${invDiff < 1e-10 ? 'IDENTICAL' : 'DIFFERENT!'}`);

// ===== FBX LOCAL DELTA comparison =====
console.log('\n--- FBX LOCAL DELTA vs VIEWER LOCAL DELTA (Euler angles) ---');
console.log('Shows how the viewer-space local rotation relates to the FBX local rotation');
console.log('Bone               | FBX local Euler                  | Viewer local Euler               | Description');
console.log('-'.repeat(120));

// Get FBX local deltas
mixer.setTime(0);
group.updateMatrixWorld(true);
const restLocalQ = {};
for (const name of keyBones) {
  const bone = boneByName[name];
  if (bone) restLocalQ[name] = bone.quaternion.clone();
}
mixer.setTime(time);
group.updateMatrixWorld(true);
const animLocalQ = {};
for (const name of keyBones) {
  const bone = boneByName[name];
  if (bone) animLocalQ[name] = bone.quaternion.clone();
}
const fbxLocalDelta = {};
for (const name of keyBones) {
  if (!restLocalQ[name] || !animLocalQ[name]) continue;
  fbxLocalDelta[name] = restLocalQ[name].clone().invert().multiply(animLocalQ[name]);
}

for (const name of focusBones) {
  const fbx = fbxLocalDelta[name];
  const viewer = threeLocals[name]; // Three.js viewer-space local
  if (!fbx || !viewer) continue;

  const fe = new THREE.Euler().setFromQuaternion(fbx, 'XYZ');
  const ve = new THREE.Euler().setFromQuaternion(viewer, 'XYZ');

  const fx = r(fe.x * rad2deg), fy = r(fe.y * rad2deg), fz = r(fe.z * rad2deg);
  const vx = r(ve.x * rad2deg), vy = r(ve.y * rad2deg), vz = r(ve.z * rad2deg);

  // Describe the relationship
  let desc = '';
  const xMatch = Math.abs(fx - vx) < 2;
  const xNeg = Math.abs(fx + vx) < 2;
  const yMatch = Math.abs(fy - vy) < 2;
  const yNeg = Math.abs(fy + vy) < 2;
  const zMatch = Math.abs(fz - vz) < 2;
  const zNeg = Math.abs(fz + vz) < 2;

  const parts = [];
  if (xMatch) parts.push('X=same');
  else if (xNeg) parts.push('X=negated');
  else parts.push(`X: ${fx}→${vx}`);
  if (yMatch) parts.push('Y=same');
  else if (yNeg) parts.push('Y=negated');
  else parts.push(`Y: ${fy}→${vy}`);
  if (zMatch) parts.push('Z=same');
  else if (zNeg) parts.push('Z=negated');
  else parts.push(`Z: ${fz}→${vz}`);
  desc = parts.join(', ');

  console.log(
    `${name.padEnd(20)}` +
    `| X:${fx}° Y:${fy}° Z:${fz}°`.padEnd(36) +
    `| X:${vx}° Y:${vy}° Z:${vz}°`.padEnd(36) +
    `| ${desc}`
  );
}

mixer.stopAllAction();
mixer.uncacheRoot(group);
