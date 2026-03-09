/**
 * Diagnose FK math: compare FBX ground truth positions with our viewer FK algorithm.
 * This will reveal whether the torso lean inversion and gaps are caused by
 * the converter (motion.json data) or the viewer (FK application).
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

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fbxPath = path.join(__dirname, '..', 'public', 'models', 'character-motion', 'Hip Hop Dancing.fbx');
const motionPath = path.join(__dirname, '..', 'public', 'models', 'character-motion', 'Hip Hop Dancing.motion.json');

const motionData = JSON.parse(fs.readFileSync(path.resolve(motionPath), 'utf-8'));

const loader = new FBXLoader();
const group = await new Promise((resolve, reject) => {
  loader.load(path.resolve(fbxPath), resolve, undefined, reject);
});

const boneByName = {};
group.traverse((obj) => { if (obj.isBone) boneByName[cleanBoneName(obj.name)] = obj; });

// ========================================================================
// STEP 1: Capture BIND POSE (before animation)
// ========================================================================
group.updateMatrixWorld(true);
const bindWorldPos = {};
const bindWorldQuat = {};
for (const name of Object.keys(boneByName)) {
  const bone = boneByName[name];
  const pos = new THREE.Vector3();
  const quat = new THREE.Quaternion();
  bone.getWorldPosition(pos);
  bone.getWorldQuaternion(quat);
  bindWorldPos[name] = pos.clone();
  bindWorldQuat[name] = quat.clone();
}

// Set up animation
const clip = group.animations[0];
const mixer = new THREE.AnimationMixer(group);
const action = mixer.clipAction(clip);
action.play();

// ========================================================================
// Key bones for comparison
// ========================================================================
const KEY_BONES = [
  'Hips', 'Spine', 'Spine1', 'Spine2', 'Neck', 'Head',
  'LeftShoulder', 'LeftArm', 'LeftForeArm', 'LeftHand',
  'RightShoulder', 'RightArm', 'RightForeArm', 'RightHand',
  'LeftUpLeg', 'LeftLeg', 'LeftFoot',
  'RightUpLeg', 'RightLeg', 'RightFoot',
];

const HIERARCHY = {};
for (const name of KEY_BONES) {
  const bone = boneByName[name];
  if (bone?.parent?.isBone) {
    HIERARCHY[name] = cleanBoneName(bone.parent.name);
  }
}

// Viewer coordinate conversion
const toViewerPos = (p) => ({ x: -p.x, y: p.y, z: -p.z });
const toViewerQuat = (q) => ({ x: -q.x, y: q.y, z: -q.z, w: q.w });

// Quaternion multiply: a × b (Hamilton product)
function qMul(a, b) {
  return {
    x: a.x*b.w + a.w*b.x + a.y*b.z - a.z*b.y,
    y: a.y*b.w + a.w*b.y + a.z*b.x - a.x*b.z,
    z: a.z*b.w + a.w*b.z + a.x*b.y - a.y*b.x,
    w: a.w*b.w - a.x*b.x - a.y*b.y - a.z*b.z,
  };
}

function qInv(q) { return { x: -q.x, y: -q.y, z: -q.z, w: q.w }; }

// Rotate vector by quaternion: q × v × q⁻¹
function qRotVec(q, v) {
  const vq = { x: v.x, y: v.y, z: v.z, w: 0 };
  const r = qMul(qMul(q, vq), qInv(q));
  return { x: r.x, y: r.y, z: r.z };
}

// ========================================================================
// TEST FRAMES
// ========================================================================
const testFrames = [0, 10, 20, 30, 40, 50, 60];

for (const frameIdx of testFrames) {
  if (frameIdx >= motionData.frameCount) continue;
  const time = frameIdx / motionData.fps;
  mixer.setTime(time);
  group.updateMatrixWorld(true);

  console.log(`\n${'='.repeat(80)}`);
  console.log(`FRAME ${frameIdx} (t=${r(time)}s)`);
  console.log(`${'='.repeat(80)}`);

  // Get FBX ground truth positions (in viewer space)
  const fbxPositions = {};
  for (const name of KEY_BONES) {
    const bone = boneByName[name];
    if (!bone) continue;
    const wp = new THREE.Vector3();
    bone.getWorldPosition(wp);
    fbxPositions[name] = toViewerPos(wp);
  }

  // Get motion.json delta quaternions (in viewer space)
  const frame = motionData.frames[frameIdx];
  const worldDeltas = {};
  for (const name of KEY_BONES) {
    const data = frame[name];
    if (data) {
      worldDeltas[name] = toViewerQuat({ x: data.dq[0], y: data.dq[1], z: data.dq[2], w: data.dq[3] });
    } else {
      worldDeltas[name] = { x: 0, y: 0, z: 0, w: 1 }; // identity
    }
  }

  // Compute FK positions using our viewer algorithm
  // METHOD A: localDQ = parentWorldDQ⁻¹ × worldDQ (current code)
  // METHOD B: localDQ = worldDQ × parentWorldDQ⁻¹ (alternative)
  const fkPositionsA = {};
  const fkPositionsB = {};

  // Bind-pose bone vectors in viewer space
  const bindVecViewer = {};
  for (const name of KEY_BONES) {
    const parentName = HIERARCHY[name];
    if (parentName && bindWorldPos[name] && bindWorldPos[parentName]) {
      const bv = {
        x: bindWorldPos[name].x - bindWorldPos[parentName].x,
        y: bindWorldPos[name].y - bindWorldPos[parentName].y,
        z: bindWorldPos[name].z - bindWorldPos[parentName].z,
      };
      bindVecViewer[name] = toViewerPos(bv);
    }
  }

  // FK Method A: localDQ = parentInv × worldDQ
  const accWorldA = {};
  for (const name of KEY_BONES) {
    const parentName = HIERARCHY[name];
    const worldDQ = worldDeltas[name];

    if (!parentName) {
      // Root bone (Hips)
      accWorldA[name] = worldDQ;
      const data = frame[name];
      const hipsBindV = toViewerPos(bindWorldPos[name]);
      if (data?.dp) {
        fkPositionsA[name] = {
          x: hipsBindV.x + (-data.dp[0]),
          y: hipsBindV.y + data.dp[1],
          z: hipsBindV.z + (-data.dp[2]),
        };
      } else {
        fkPositionsA[name] = hipsBindV;
      }
    } else {
      accWorldA[name] = worldDQ;
      const parentWorldDQ = accWorldA[parentName] ?? { x: 0, y: 0, z: 0, w: 1 };
      const boneVec = bindVecViewer[name];
      if (boneVec && fkPositionsA[parentName]) {
        // Parent rotates the bone vector
        const rotatedVec = qRotVec(parentWorldDQ, boneVec);
        fkPositionsA[name] = {
          x: fkPositionsA[parentName].x + rotatedVec.x,
          y: fkPositionsA[parentName].y + rotatedVec.y,
          z: fkPositionsA[parentName].z + rotatedVec.z,
        };
      }
    }
  }

  // FK Method B: use worldDQ directly to rotate bone vectors (should give same result)
  // This is a sanity check - both methods should produce identical positions
  // because worldDQ.rotate(boneVec) = (the correct animated bone direction)

  // Compare FBX ground truth with FK Method A
  console.log('\nBone               | FBX viewer pos                 | FK-A viewer pos                | Error');
  console.log('-'.repeat(100));

  let totalError = 0;
  let count = 0;
  for (const name of KEY_BONES) {
    const fbx = fbxPositions[name];
    const fk = fkPositionsA[name];
    if (!fbx || !fk) continue;

    // Scale: FBX positions are in FBX units, FK uses FBX units too (no scaling in this test)
    const ex = fbx.x - fk.x;
    const ey = fbx.y - fk.y;
    const ez = fbx.z - fk.z;
    const err = Math.sqrt(ex*ex + ey*ey + ez*ez);
    totalError += err;
    count++;

    console.log(
      `${name.padEnd(20)}` +
      `| (${r(fbx.x).toString().padStart(8)}, ${r(fbx.y).toString().padStart(8)}, ${r(fbx.z).toString().padStart(8)})` +
      `| (${r(fk.x).toString().padStart(8)}, ${r(fk.y).toString().padStart(8)}, ${r(fk.z).toString().padStart(8)})` +
      `| ${r(err)}`
    );
  }
  console.log(`\nAverage position error: ${r(totalError / count)}`);

  // Check spine direction specifically
  console.log('\n--- SPINE DIRECTION CHECK ---');
  const hipsP = fbxPositions['Hips'];
  const spine2P = fbxPositions['Spine2'];
  if (hipsP && spine2P) {
    const spineDir = {
      x: spine2P.x - hipsP.x,
      y: spine2P.y - hipsP.y,
      z: spine2P.z - hipsP.z,
    };
    const len = Math.sqrt(spineDir.x**2 + spineDir.y**2 + spineDir.z**2);
    console.log(`FBX Spine2-Hips viewer direction: (${r(spineDir.x/len)}, ${r(spineDir.y/len)}, ${r(spineDir.z/len)})`);
    console.log(`  Z component: ${r(spineDir.z/len)} → ${spineDir.z > 0 ? 'BACKWARD (away from camera)' : 'FORWARD (toward camera)'}`);
  }

  const hipsFK = fkPositionsA['Hips'];
  const spine2FK = fkPositionsA['Spine2'];
  if (hipsFK && spine2FK) {
    const spineDir = {
      x: spine2FK.x - hipsFK.x,
      y: spine2FK.y - hipsFK.y,
      z: spine2FK.z - hipsFK.z,
    };
    const len = Math.sqrt(spineDir.x**2 + spineDir.y**2 + spineDir.z**2);
    console.log(`FK  Spine2-Hips viewer direction: (${r(spineDir.x/len)}, ${r(spineDir.y/len)}, ${r(spineDir.z/len)})`);
    console.log(`  Z component: ${r(spineDir.z/len)} → ${spineDir.z > 0 ? 'BACKWARD (away from camera)' : 'FORWARD (toward camera)'}`);
  }
}

// ========================================================================
// Also verify: does the Babylon.js decomposition matter?
// Test: parentInv × worldDQ vs worldDQ × parentInv
// ========================================================================
console.log('\n\n' + '='.repeat(80));
console.log('LOCAL DECOMPOSITION TEST: parentInv×world vs world×parentInv');
console.log('='.repeat(80));

const testFrame = 30;
const frame30 = motionData.frames[testFrame];
mixer.setTime(testFrame / motionData.fps);
group.updateMatrixWorld(true);

const worldDQs = {};
for (const name of KEY_BONES) {
  const data = frame30[name];
  if (data) {
    worldDQs[name] = toViewerQuat({ x: data.dq[0], y: data.dq[1], z: data.dq[2], w: data.dq[3] });
  } else {
    worldDQs[name] = { x: 0, y: 0, z: 0, w: 1 };
  }
}

console.log('\nBone               | Method A: pInv×w              | Method B: w×pInv              | Same?');
console.log('-'.repeat(100));

for (const name of KEY_BONES) {
  const parentName = HIERARCHY[name];
  if (!parentName) continue;
  const worldDQ = worldDQs[name];
  const parentDQ = worldDQs[parentName] ?? { x: 0, y: 0, z: 0, w: 1 };
  const pInv = qInv(parentDQ);

  const localA = qMul(pInv, worldDQ);       // parentInv × worldDQ
  const localB = qMul(worldDQ, pInv);       // worldDQ × parentInv

  // Check if they produce the same rotated bone vector
  const boneVec = bindVecViewer[name];
  if (!boneVec) continue;

  const rotA = qRotVec(localA, boneVec);
  const rotB = qRotVec(localB, boneVec);

  // What we actually want: parentWorldDQ.rotate(localDQ.rotate(boneVec))
  // Method A: parent.rotate(localA.rotate(boneVec)) should = worldDQ.rotate(boneVec)
  const parentRotA = qRotVec(parentDQ, rotA);
  const parentRotB = qRotVec(parentDQ, rotB);
  const worldRot = qRotVec(worldDQ, boneVec);

  // But wait: if worldQuat = parentQuat × localQuat, then
  //   worldQuat.rotate(v) = parentQuat.rotate(localQuat.rotate(v))
  // If worldQuat = localQuat × parentQuat, then
  //   worldQuat.rotate(v) ≠ parentQuat.rotate(localQuat.rotate(v))

  // Test: does parent.rotate(localA.rotate(v)) = world.rotate(v)?
  const errA = Math.sqrt(
    (parentRotA.x - worldRot.x)**2 +
    (parentRotA.y - worldRot.y)**2 +
    (parentRotA.z - worldRot.z)**2
  );
  // Test: does parent.rotate(localB.rotate(v)) = world.rotate(v)?
  const errB = Math.sqrt(
    (parentRotB.x - worldRot.x)**2 +
    (parentRotB.y - worldRot.y)**2 +
    (parentRotB.z - worldRot.z)**2
  );

  // But we need to test what BABYLON actually does!
  // In Babylon, worldRot = parentRot × localRot
  // So parent.rotate(local.rotate(v)) should = world.rotate(v)
  // This tests Method A (parentInv × world)

  // Alternative: worldRot = localRot × parentRot
  // Then local.rotate(parent.rotate(v)) should = world.rotate(v)
  const altA = qRotVec(localA, qRotVec(parentDQ, boneVec));
  const altB = qRotVec(localB, qRotVec(parentDQ, boneVec));
  const altErrA = Math.sqrt(
    (altA.x - worldRot.x)**2 + (altA.y - worldRot.y)**2 + (altA.z - worldRot.z)**2
  );
  const altErrB = Math.sqrt(
    (altB.x - worldRot.x)**2 + (altB.y - worldRot.y)**2 + (altB.z - worldRot.z)**2
  );

  console.log(
    `${name.padEnd(20)}` +
    `| p(A(v))err=${r(errA).toString().padStart(6)} l(p(v))err=${r(altErrA).toString().padStart(6)}` +
    `| p(B(v))err=${r(errB).toString().padStart(6)} l(p(v))err=${r(altErrB).toString().padStart(6)}` +
    `| ${errA < 0.001 ? 'A=standard' : altErrA < 0.001 ? 'A=reversed' : errB < 0.001 ? 'B=standard' : altErrB < 0.001 ? 'B=reversed' : 'NEITHER??'}`
  );
}

// Also directly check: compute child world pos both ways and compare with FBX
console.log('\n\n--- POSITION CHECK: which decomposition matches FBX? ---');
console.log('Bone               | FBX pos (viewer)               | MethodA pos                    | MethodB pos                    | Winner');
console.log('-'.repeat(140));

// Get FBX truth at frame 30
const fbxPos30 = {};
for (const name of KEY_BONES) {
  const wp = new THREE.Vector3();
  boneByName[name]?.getWorldPosition(wp);
  fbxPos30[name] = toViewerPos(wp);
}

// FK with method A: local = parentInv × world, compose as parent × local
const posA = {};
const posB = {};
for (const name of KEY_BONES) {
  const parentName = HIERARCHY[name];
  if (!parentName) {
    // Root (Hips)
    const hipsBindV = toViewerPos(bindWorldPos[name]);
    const data = frame30[name];
    const pos = data?.dp ? {
      x: hipsBindV.x + (-data.dp[0]),
      y: hipsBindV.y + data.dp[1],
      z: hipsBindV.z + (-data.dp[2]),
    } : hipsBindV;
    posA[name] = pos;
    posB[name] = pos;
    continue;
  }

  const boneVec = bindVecViewer[name];
  if (!boneVec) continue;

  const parentDQ = worldDQs[parentName] ?? { x: 0, y: 0, z: 0, w: 1 };

  // Method A: Babylon convention worldRot = parent × local
  // Child pos = parentPos + parentWorldRot.rotate(boneVec)
  // parentWorldRot = parentWorldDQ (accumulated)
  if (posA[parentName]) {
    const rotVec = qRotVec(parentDQ, boneVec);
    posA[name] = {
      x: posA[parentName].x + rotVec.x,
      y: posA[parentName].y + rotVec.y,
      z: posA[parentName].z + rotVec.z,
    };
  }

  // Method B: Alternative convention worldRot = local × parent
  // Child pos = parentPos + ???.rotate(boneVec)
  // Actually in this convention, the bone vector is rotated differently
  // Let's compute: if worldRot = localRot × parentRot,
  // then the child world pos should be parentPos + worldRot.rotate(boneVec) ... no.
  // In scene graph, child pos = parentPos + parentWorldRot.rotate(localPos)
  // This is true regardless of how parentWorldRot is composed.
  // So both methods compute parentPos + parentWorldDQ.rotate(boneVec)
  // The difference is only in what localDQ value is set on the node.
  // For POSITION, both methods give the same result (parentDQ.rotate(boneVec))!
  if (posB[parentName]) {
    const rotVec = qRotVec(parentDQ, boneVec);
    posB[name] = {
      x: posB[parentName].x + rotVec.x,
      y: posB[parentName].y + rotVec.y,
      z: posB[parentName].z + rotVec.z,
    };
  }
}

for (const name of KEY_BONES) {
  const fbx = fbxPos30[name];
  const a = posA[name];
  const b = posB[name];
  if (!fbx || !a) continue;

  const errA = Math.sqrt((fbx.x-a.x)**2 + (fbx.y-a.y)**2 + (fbx.z-a.z)**2);
  const errB = b ? Math.sqrt((fbx.x-b.x)**2 + (fbx.y-b.y)**2 + (fbx.z-b.z)**2) : 999;

  console.log(
    `${name.padEnd(20)}` +
    `| (${r(fbx.x).toString().padStart(8)}, ${r(fbx.y).toString().padStart(8)}, ${r(fbx.z).toString().padStart(8)})` +
    `| (${r(a.x).toString().padStart(8)}, ${r(a.y).toString().padStart(8)}, ${r(a.z).toString().padStart(8)})` +
    `| (${r(b?.x).toString().padStart(8)}, ${r(b?.y).toString().padStart(8)}, ${r(b?.z).toString().padStart(8)})` +
    `| errA=${r(errA)} errB=${r(errB)}`
  );
}

mixer.stopAllAction();
mixer.uncacheRoot(group);
