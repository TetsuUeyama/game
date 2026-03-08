/**
 * Diagnose the FK pipeline issue with bind-pose-based delta quaternions.
 *
 * Compare:
 * 1. FBX ground truth bone directions (world space, converted to viewer)
 * 2. Viewer pipeline: worldDelta.rotate(voxel_bone_vec)
 *
 * If bone directions differ, it means the voxel bone vectors don't match
 * the FBX bind-pose bone vectors, causing incorrect FK results.
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
  'LeftUpLeg': 'Hips', 'LeftLeg': 'LeftUpLeg', 'LeftFoot': 'LeftLeg',
  'RightUpLeg': 'Hips', 'RightLeg': 'RightUpLeg', 'RightFoot': 'RightLeg',
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

// ========================================================================
// STEP 1: Capture BIND POSE (T-pose, before animation)
// ========================================================================
group.updateMatrixWorld(true);

const bindWorldPos = {};
const bindWorldQuat = {};
for (const name of keyBones) {
  const bone = boneByName[name];
  if (!bone) continue;
  const pos = new THREE.Vector3();
  const quat = new THREE.Quaternion();
  bone.getWorldPosition(pos);
  bone.getWorldQuaternion(quat);
  bindWorldPos[name] = pos.clone();
  bindWorldQuat[name] = quat.clone();
}

// FBX bind-pose bone vectors (parent→child, world space)
const fbxBindBoneVec = {};
for (const name of keyBones) {
  const parentName = HIERARCHY[name];
  if (parentName && bindWorldPos[name] && bindWorldPos[parentName]) {
    fbxBindBoneVec[name] = bindWorldPos[name].clone().sub(bindWorldPos[parentName]);
  }
}

// Convert to viewer coords
const toViewerVec = (v) => new THREE.Vector3(-v.x, v.y, -v.z);
const toViewerQuat = (q) => new THREE.Quaternion(-q.x, q.y, -q.z, q.w);

// ========================================================================
// STEP 2: Voxel model bone vectors (simulating what the viewer uses)
// ========================================================================

// Default Vagrant markers
const cx = 35, cy = 13.5;
const markers = {
  Chin: { x: cx, y: cy, z: 82 },
  Groin: { x: cx, y: cy, z: 31 },
  LeftWrist: { x: 10, y: cy, z: 34 },
  LeftElbow: { x: 14, y: cy, z: 48 },
  LeftKnee: { x: 24, y: cy, z: 17 },
};
markers.RightWrist = { x: 2*cx - markers.LeftWrist.x, y: markers.LeftWrist.y, z: markers.LeftWrist.z };
markers.RightElbow = { x: 2*cx - markers.LeftElbow.x, y: markers.LeftElbow.y, z: markers.LeftElbow.z };
markers.RightKnee  = { x: 2*cx - markers.LeftKnee.x, y: markers.LeftKnee.y, z: markers.LeftKnee.z };

// Replicate calculateAllBones logic
const lerp3 = (a, b, t) => ({ x: a.x+(b.x-a.x)*t, y: a.y+(b.y-a.y)*t, z: a.z+(b.z-a.z)*t });
const chin = markers.Chin, groin = markers.Groin;
const hips = { ...groin };
const neck = { x: chin.x, y: chin.y, z: chin.z - 4 };
const head = { x: chin.x, y: chin.y, z: Math.min(chin.z + 8, 103) };
const spine  = lerp3(hips, neck, 0.25);
const spine1 = lerp3(hips, neck, 0.50);
const spine2 = lerp3(hips, neck, 0.75);

const lShoulderOff = (markers.LeftElbow.x - spine2.x) * 0.35;
const lShoulder = { x: spine2.x + lShoulderOff, y: spine2.y, z: spine2.z + 2 };
const lArm = lerp3(lShoulder, markers.LeftElbow, 0.3);
const lForeArm = { ...markers.LeftElbow };
const lHand = { ...markers.LeftWrist };

const rShoulderOff = (markers.RightElbow.x - spine2.x) * 0.35;
const rShoulder = { x: spine2.x + rShoulderOff, y: spine2.y, z: spine2.z + 2 };
const rArm = lerp3(rShoulder, markers.RightElbow, 0.3);
const rForeArm = { ...markers.RightElbow };
const rHand = { ...markers.RightWrist };

const lLegOff = (markers.LeftKnee.x - groin.x) * 0.8;
const lUpLeg = { x: groin.x + lLegOff, y: groin.y, z: groin.z };
const lLeg = { ...markers.LeftKnee };
const lFoot = { x: markers.LeftKnee.x, y: Math.max(markers.LeftKnee.y - 4, 0), z: 2 };

const rLegOff = (markers.RightKnee.x - groin.x) * 0.8;
const rUpLeg = { x: groin.x + rLegOff, y: groin.y, z: groin.z };
const rLeg = { ...markers.RightKnee };
const rFoot = { x: markers.RightKnee.x, y: Math.max(markers.RightKnee.y - 4, 0), z: 2 };

const voxelBones = {
  Hips: hips, Spine: spine, Spine1: spine1, Spine2: spine2, Neck: neck, Head: head,
  LeftShoulder: lShoulder, LeftArm: lArm, LeftForeArm: lForeArm, LeftHand: lHand,
  RightShoulder: rShoulder, RightArm: rArm, RightForeArm: rForeArm, RightHand: rHand,
  LeftUpLeg: lUpLeg, LeftLeg: lLeg, LeftFoot: lFoot,
  RightUpLeg: rUpLeg, RightLeg: rLeg, RightFoot: rFoot,
};

const SCALE = 0.019;  // from vox-parser
function voxelToViewer(vx, vy, vz) {
  return new THREE.Vector3((vx - cx) * SCALE, vz * SCALE, -(vy - cy) * SCALE);
}

// Voxel bone vectors in viewer space
const voxelBoneVec = {};
for (const name of keyBones) {
  const parentName = HIERARCHY[name];
  if (parentName && voxelBones[name] && voxelBones[parentName]) {
    const child = voxelToViewer(voxelBones[name].x, voxelBones[name].y, voxelBones[name].z);
    const parent = voxelToViewer(voxelBones[parentName].x, voxelBones[parentName].y, voxelBones[parentName].z);
    voxelBoneVec[name] = child.clone().sub(parent);
  }
}

// FBX bind bone vectors converted to viewer space
const fbxBindBoneVecViewer = {};
for (const name of keyBones) {
  if (fbxBindBoneVec[name]) {
    fbxBindBoneVecViewer[name] = toViewerVec(fbxBindBoneVec[name]);
  }
}

// ========================================================================
// STEP 3: Compare bone vectors
// ========================================================================
console.log('=== BONE VECTOR COMPARISON: FBX bind-pose vs Voxel T-pose ===');
console.log('Both in viewer coordinates. If directions differ, FK will produce wrong results.\n');

console.log('Bone               | FBX bind (viewer, normalized)    | Voxel (viewer, normalized)       | Angle diff');
console.log('-'.repeat(115));

for (const name of keyBones) {
  const fbxVec = fbxBindBoneVecViewer[name];
  const voxVec = voxelBoneVec[name];
  if (!fbxVec || !voxVec) continue;

  const fbxLen = fbxVec.length() || 1;
  const voxLen = voxVec.length() || 1;
  const fbxN = fbxVec.clone().divideScalar(fbxLen);
  const voxN = voxVec.clone().divideScalar(voxLen);

  const dot = Math.max(-1, Math.min(1, fbxN.dot(voxN)));
  const angleDiff = r(Math.acos(dot) * rad2deg);

  console.log(
    `${name.padEnd(20)}` +
    `| (${r(fbxN.x).toString().padStart(7)}, ${r(fbxN.y).toString().padStart(7)}, ${r(fbxN.z).toString().padStart(7)})`.padEnd(36) +
    `| (${r(voxN.x).toString().padStart(7)}, ${r(voxN.y).toString().padStart(7)}, ${r(voxN.z).toString().padStart(7)})`.padEnd(36) +
    `| ${angleDiff}°${angleDiff > 15 ? ' ← LARGE' : ''}`
  );
}

// ========================================================================
// STEP 4: Simulate FK at specific frames and compare positions
// ========================================================================
const motionData = JSON.parse(fs.readFileSync(path.resolve(motionPath), 'utf-8'));

const clip = group.animations[0];
const mixer = new THREE.AnimationMixer(group);
const action = mixer.clipAction(clip);
action.play();

// Scale factor
const hipsBindY = bindWorldPos['Hips']?.y ?? 0;
const headBindY = bindWorldPos['Head']?.y ?? 1;
const fbxBodyHeight = headBindY - hipsBindY;
const voxelBodyHeight = (voxelBones['Head'].z - voxelBones['Hips'].z) * SCALE;
const scaleFactor = voxelBodyHeight / fbxBodyHeight;

console.log(`\nScale factor: ${r(scaleFactor)} (voxelHeight=${r(voxelBodyHeight)}, fbxHeight=${r(fbxBodyHeight)})`);

const toViewerQuatArr = (dq) => new THREE.Quaternion(-dq[0], dq[1], -dq[2], dq[3]);

function simulateViewerFK(frame) {
  // Convert world deltas
  const worldDeltas = {};
  for (const [boneName, data] of Object.entries(frame)) {
    worldDeltas[boneName] = toViewerQuatArr(data.dq);
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

  // FK: compute world positions using hierarchy
  const worldRot = {};
  const worldPos = {};

  for (const name of keyBones) {
    const localQ = locals[name];
    if (!localQ) continue;
    const parentName = HIERARCHY[name];

    if (!parentName) {
      // Root (Hips)
      worldRot[name] = localQ.clone();
      const hipsRestViewer = voxelToViewer(voxelBones['Hips'].x, voxelBones['Hips'].y, voxelBones['Hips'].z);
      const data = frame[name];
      if (data?.dp) {
        worldPos[name] = new THREE.Vector3(
          hipsRestViewer.x - data.dp[0] * scaleFactor,
          hipsRestViewer.y + data.dp[1] * scaleFactor,
          hipsRestViewer.z - data.dp[2] * scaleFactor,
        );
      } else {
        worldPos[name] = hipsRestViewer.clone();
      }
    } else {
      // Accumulate world rotation
      if (worldRot[parentName]) {
        worldRot[name] = worldRot[parentName].clone().multiply(localQ);
      } else {
        worldRot[name] = localQ.clone();
      }

      // Position = parentPos + parentWorldRot.rotate(boneVec)
      const boneVec = voxelBoneVec[name];
      if (worldPos[parentName] && boneVec && worldRot[parentName]) {
        const rotatedVec = boneVec.clone().applyQuaternion(worldRot[parentName]);
        worldPos[name] = worldPos[parentName].clone().add(rotatedVec);
      }
    }
  }

  return { worldPos, worldRot };
}

// Also compute "ideal" FK using FBX bind bone vectors instead of voxel vectors
function simulateIdealFK(frame) {
  const worldDeltas = {};
  for (const [boneName, data] of Object.entries(frame)) {
    worldDeltas[boneName] = toViewerQuatArr(data.dq);
  }
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
  const worldRot = {};
  const worldPos = {};

  for (const name of keyBones) {
    const localQ = locals[name];
    if (!localQ) continue;
    const parentName = HIERARCHY[name];

    if (!parentName) {
      worldRot[name] = localQ.clone();
      const hipsRestViewer = voxelToViewer(voxelBones['Hips'].x, voxelBones['Hips'].y, voxelBones['Hips'].z);
      const data = frame[name];
      if (data?.dp) {
        worldPos[name] = new THREE.Vector3(
          hipsRestViewer.x - data.dp[0] * scaleFactor,
          hipsRestViewer.y + data.dp[1] * scaleFactor,
          hipsRestViewer.z - data.dp[2] * scaleFactor,
        );
      } else {
        worldPos[name] = hipsRestViewer.clone();
      }
    } else {
      if (worldRot[parentName]) {
        worldRot[name] = worldRot[parentName].clone().multiply(localQ);
      } else {
        worldRot[name] = localQ.clone();
      }
      // Use FBX bind bone vectors (scaled) instead of voxel vectors
      const fbxVec = fbxBindBoneVecViewer[name];
      if (worldPos[parentName] && fbxVec && worldRot[parentName]) {
        const scaledVec = fbxVec.clone().multiplyScalar(scaleFactor);
        const rotatedVec = scaledVec.clone().applyQuaternion(worldRot[parentName]);
        worldPos[name] = worldPos[parentName].clone().add(rotatedVec);
      }
    }
  }
  return { worldPos, worldRot };
}

console.log('\n=== FK POSITION COMPARISON AT KEY FRAMES ===');
console.log('FBX truth vs Viewer (voxel bone vecs) vs Ideal (FBX bind bone vecs, scaled)');
console.log('Focus on endpoints: LeftHand, RightHand, Head\n');

const checkBones = ['LeftHand', 'RightHand', 'Head', 'LeftFoot', 'RightFoot'];
const testFrames = [0, 20, 40, 60, 67, 80, 100, 120];

for (const frameIdx of testFrames) {
  if (frameIdx >= motionData.frameCount) continue;
  const time = frameIdx / 30;
  mixer.setTime(time);
  group.updateMatrixWorld(true);

  const motionFrame = motionData.frames[frameIdx];
  const viewerResult = simulateViewerFK(motionFrame);
  const idealResult = simulateIdealFK(motionFrame);

  console.log(`--- Frame ${frameIdx} ---`);
  console.log('Bone          | FBX truth (viewer)             | Viewer FK (voxel vecs)          | Ideal FK (fbx vecs)            | Voxel err | Ideal err');
  console.log('-'.repeat(155));

  for (const name of checkBones) {
    const bone = boneByName[name];
    if (!bone) continue;
    const fbxPos = new THREE.Vector3();
    bone.getWorldPosition(fbxPos);
    const fbxViewer = toViewerVec(fbxPos);

    const viewerPos = viewerResult.worldPos[name];
    const idealPos = idealResult.worldPos[name];

    // Scale FBX positions relative to bind Hips, to match viewer scale
    const fbxRelToHips = fbxPos.clone().sub(bindWorldPos['Hips']);
    const fbxScaled = new THREE.Vector3(
      -fbxRelToHips.x * scaleFactor,
      fbxRelToHips.y * scaleFactor,
      -fbxRelToHips.z * scaleFactor,
    );
    // Add voxel hips position
    const hipsViewer = voxelToViewer(voxelBones['Hips'].x, voxelBones['Hips'].y, voxelBones['Hips'].z);
    fbxScaled.add(hipsViewer);

    const voxErr = viewerPos ? r(viewerPos.distanceTo(fbxScaled)) : 'N/A';
    const idealErr = idealPos ? r(idealPos.distanceTo(fbxScaled)) : 'N/A';

    console.log(
      `${name.padEnd(14)}` +
      `| (${r(fbxScaled.x).toString().padStart(6)}, ${r(fbxScaled.y).toString().padStart(6)}, ${r(fbxScaled.z).toString().padStart(6)})`.padEnd(34) +
      `| (${viewerPos ? r(viewerPos.x).toString().padStart(6) : '  N/A'}, ${viewerPos ? r(viewerPos.y).toString().padStart(6) : '  N/A'}, ${viewerPos ? r(viewerPos.z).toString().padStart(6) : '  N/A'})`.padEnd(34) +
      `| (${idealPos ? r(idealPos.x).toString().padStart(6) : '  N/A'}, ${idealPos ? r(idealPos.y).toString().padStart(6) : '  N/A'}, ${idealPos ? r(idealPos.z).toString().padStart(6) : '  N/A'})`.padEnd(34) +
      `| ${String(voxErr).padStart(6)}  | ${String(idealErr).padStart(6)}`
    );
  }
  console.log('');
}

// ========================================================================
// STEP 5: Check if using FBX bone vectors fixes the direction issue
// ========================================================================
console.log('\n=== DIRECTION ANALYSIS: LeftHand relative to Hips ===');
console.log('Shows which direction the left hand moves relative to hips over time');
console.log('"FBX" = ground truth, "Voxel" = current viewer, "Ideal" = FBX bone vecs\n');

console.log('Frame | FBX hand-hips direction          | Voxel hand-hips direction        | Ideal hand-hips direction        | Voxel match? | Ideal match?');
console.log('-'.repeat(155));

for (const frameIdx of testFrames) {
  if (frameIdx >= motionData.frameCount) continue;
  const time = frameIdx / 30;
  mixer.setTime(time);
  group.updateMatrixWorld(true);

  const motionFrame = motionData.frames[frameIdx];
  const viewerResult = simulateViewerFK(motionFrame);
  const idealResult = simulateIdealFK(motionFrame);

  // FBX
  const fbxHand = new THREE.Vector3();
  const fbxHips = new THREE.Vector3();
  boneByName['LeftHand']?.getWorldPosition(fbxHand);
  boneByName['Hips']?.getWorldPosition(fbxHips);
  const fbxRel = toViewerVec(fbxHand.clone().sub(fbxHips));

  // Viewer
  const voxHand = viewerResult.worldPos['LeftHand'];
  const voxHips = viewerResult.worldPos['Hips'];
  const voxRel = voxHand && voxHips ? voxHand.clone().sub(voxHips) : null;

  // Ideal
  const idealHand = idealResult.worldPos['LeftHand'];
  const idealHips = idealResult.worldPos['Hips'];
  const idealRel = idealHand && idealHips ? idealHand.clone().sub(idealHips) : null;

  const dirStr = (v) => {
    if (!v) return 'N/A';
    const lr = v.x > 0.01 ? 'L' : v.x < -0.01 ? 'R' : '-';
    const ud = v.y > 0.01 ? 'U' : v.y < -0.01 ? 'D' : '-';
    const fb = v.z > 0.01 ? 'B' : v.z < -0.01 ? 'F' : '-';
    return `${lr}${ud}${fb} (${r(v.x)},${r(v.y)},${r(v.z)})`;
  };

  const matchDir = (a, b) => {
    if (!a || !b) return '?';
    const sameX = (a.x > 0.01 && b.x > 0.01) || (a.x < -0.01 && b.x < -0.01) || (Math.abs(a.x) <= 0.01 && Math.abs(b.x) <= 0.01);
    const sameY = (a.y > 0.01 && b.y > 0.01) || (a.y < -0.01 && b.y < -0.01) || (Math.abs(a.y) <= 0.01 && Math.abs(b.y) <= 0.01);
    return sameX && sameY ? 'OK' : `X:${sameX?'ok':'FLIP'} Y:${sameY?'ok':'FLIP'}`;
  };

  console.log(
    `${String(frameIdx).padStart(5)} ` +
    `| ${dirStr(fbxRel).padEnd(34)}` +
    `| ${dirStr(voxRel).padEnd(34)}` +
    `| ${dirStr(idealRel).padEnd(34)}` +
    `| ${matchDir(fbxRel, voxRel).padEnd(13)}` +
    `| ${matchDir(fbxRel, idealRel)}`
  );
}

mixer.stopAllAction();
mixer.uncacheRoot(group);
