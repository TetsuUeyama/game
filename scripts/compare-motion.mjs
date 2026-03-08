/**
 * Compare original FBX motion (with model) against our converted motion data.
 * Outputs per-bone world rotation comparison to identify coordinate conversion errors.
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

function cleanBoneName(name) {
  return name.replace(/^mixamorig/, '');
}

const r = (v) => Math.round(v * 1000) / 1000;
const rad2deg = 180 / Math.PI;

async function analyze(fbxPath) {
  console.log(`Loading: ${fbxPath}`);
  const loader = new FBXLoader();
  const group = await new Promise((resolve, reject) => {
    loader.load(fbxPath, resolve, undefined, reject);
  });

  // Check if model has mesh (not just skeleton)
  let hasMesh = false;
  group.traverse((obj) => { if (obj.isMesh) hasMesh = true; });
  console.log(`Has mesh: ${hasMesh}`);
  console.log(`Children: ${group.children.length}`);

  // Collect bones
  const allBones = [];
  const boneByName = {};
  group.traverse((obj) => {
    if (obj.isBone) {
      allBones.push(obj);
      boneByName[cleanBoneName(obj.name)] = obj;
    }
  });
  console.log(`Bones: ${allBones.length}`);

  const clips = group.animations;
  if (!clips || clips.length === 0) {
    console.error('No animations!');
    return;
  }

  const clip = clips[0];
  console.log(`Clip: "${clip.name}", duration: ${clip.duration.toFixed(3)}s`);

  const mixer = new THREE.AnimationMixer(group);
  const action = mixer.clipAction(clip);
  action.play();

  // Key bones to analyze
  const keyBones = ['Hips', 'Spine', 'Spine1', 'Spine2', 'Neck', 'Head',
    'LeftShoulder', 'LeftArm', 'LeftForeArm', 'LeftHand',
    'RightShoulder', 'RightArm', 'RightForeArm', 'RightHand',
    'LeftUpLeg', 'LeftLeg', 'LeftFoot', 'LeftToeBase',
    'RightUpLeg', 'RightLeg', 'RightFoot', 'RightToeBase'];

  // Capture rest pose
  mixer.setTime(0);
  group.updateMatrixWorld(true);

  console.log('\n=== REST POSE (Frame 0) ===');
  console.log('Bone               | WorldPos (x,y,z)          | WorldQuat (x,y,z,w)              | LocalQuat (x,y,z,w)');
  console.log('-'.repeat(130));

  const restWorldPos = {};
  const restWorldQuat = {};
  const restLocalQuat = {};

  for (const name of keyBones) {
    const bone = boneByName[name];
    if (!bone) continue;

    const wp = new THREE.Vector3();
    const wq = new THREE.Quaternion();
    bone.getWorldPosition(wp);
    bone.getWorldQuaternion(wq);
    const lq = bone.quaternion.clone();

    restWorldPos[name] = wp.clone();
    restWorldQuat[name] = wq.clone();
    restLocalQuat[name] = lq.clone();

    console.log(`${name.padEnd(20)}| ${r(wp.x)}, ${r(wp.y)}, ${r(wp.z)}`.padEnd(50) +
      `| ${r(wq.x)}, ${r(wq.y)}, ${r(wq.z)}, ${r(wq.w)}`.padEnd(40) +
      `| ${r(lq.x)}, ${r(lq.y)}, ${r(lq.z)}, ${r(lq.w)}`);
  }

  // Analyze specific frames
  const framesToCheck = [30, 67, 100];
  for (const frameIdx of framesToCheck) {
    const time = frameIdx / 30;
    mixer.setTime(time);
    group.updateMatrixWorld(true);

    console.log(`\n=== FRAME ${frameIdx} (t=${time.toFixed(3)}s) ===`);
    console.log('Bone               | WorldDeltaQ (x,y,z,w)             | WorldDeltaEuler (X°,Y°,Z°)     | LocalQ (x,y,z,w)                | DeltaPos (x,y,z)');
    console.log('-'.repeat(170));

    for (const name of keyBones) {
      const bone = boneByName[name];
      if (!bone) continue;

      const wp = new THREE.Vector3();
      const wq = new THREE.Quaternion();
      bone.getWorldPosition(wp);
      bone.getWorldQuaternion(wq);
      const lq = bone.quaternion.clone();

      // World delta
      const dq = restWorldQuat[name].clone().invert().multiply(wq);
      const dp = wp.clone().sub(restWorldPos[name]);

      // Delta euler for readability
      const euler = new THREE.Euler().setFromQuaternion(dq, 'XYZ');
      const ex = r(euler.x * rad2deg);
      const ey = r(euler.y * rad2deg);
      const ez = r(euler.z * rad2deg);

      console.log(
        `${name.padEnd(20)}` +
        `| ${r(dq.x)}, ${r(dq.y)}, ${r(dq.z)}, ${r(dq.w)}`.padEnd(38) +
        `| X:${ex}° Y:${ey}° Z:${ez}°`.padEnd(35) +
        `| ${r(lq.x)}, ${r(lq.y)}, ${r(lq.z)}, ${r(lq.w)}`.padEnd(38) +
        `| ${r(dp.x)}, ${r(dp.y)}, ${r(dp.z)}`
      );
    }
  }

  // Now compare with our motion.json
  console.log('\n\n========================================');
  console.log('=== COMPARISON WITH motion.json ===');
  console.log('========================================');

  const motionPath = fbxPath.replace(/\s*\(1\)/, '').replace(/\.fbx$/i, '.motion.json');
  if (!fs.existsSync(motionPath)) {
    console.log(`Motion JSON not found: ${motionPath}`);
    return;
  }

  const motionData = JSON.parse(fs.readFileSync(motionPath, 'utf-8'));
  console.log(`Motion JSON: ${motionData.frameCount} frames, ${motionData.fps} fps`);

  for (const frameIdx of framesToCheck) {
    if (frameIdx >= motionData.frameCount) continue;
    const time = frameIdx / 30;
    mixer.setTime(time);
    group.updateMatrixWorld(true);

    const motionFrame = motionData.frames[frameIdx];

    console.log(`\n--- Frame ${frameIdx} ---`);
    console.log('Bone               | FBX WorldDeltaQ             | JSON dq                        | Match?');
    console.log('-'.repeat(110));

    for (const name of keyBones) {
      const bone = boneByName[name];
      if (!bone || !motionFrame[name]) continue;

      const wq = new THREE.Quaternion();
      bone.getWorldQuaternion(wq);
      const dq = restWorldQuat[name].clone().invert().multiply(wq);

      const jsonDQ = motionFrame[name].dq;

      // Check if they match
      const match = Math.abs(dq.x - jsonDQ[0]) < 0.01 &&
                    Math.abs(dq.y - jsonDQ[1]) < 0.01 &&
                    Math.abs(dq.z - jsonDQ[2]) < 0.01 &&
                    Math.abs(dq.w - jsonDQ[3]) < 0.01;

      // Also check negated (quaternion q and -q represent same rotation)
      const matchNeg = Math.abs(dq.x + jsonDQ[0]) < 0.01 &&
                       Math.abs(dq.y + jsonDQ[1]) < 0.01 &&
                       Math.abs(dq.z + jsonDQ[2]) < 0.01 &&
                       Math.abs(dq.w + jsonDQ[3]) < 0.01;

      const status = match ? 'OK' : matchNeg ? 'OK(neg)' : 'MISMATCH';

      console.log(
        `${name.padEnd(20)}` +
        `| ${r(dq.x)}, ${r(dq.y)}, ${r(dq.z)}, ${r(dq.w)}`.padEnd(32) +
        `| ${jsonDQ.map(v => r(v)).join(', ')}`.padEnd(35) +
        `| ${status}`
      );
    }
  }

  // Check what our viewer conversion does
  console.log('\n\n========================================');
  console.log('=== VIEWER CONVERSION ANALYSIS ===');
  console.log('========================================');
  console.log('Current: toViewerQuat(dq) = (-dqx, -dqy, dqz, dqw)');
  console.log('');

  const frameIdx = 67;
  const time = frameIdx / 30;
  mixer.setTime(time);
  group.updateMatrixWorld(true);

  console.log(`Frame ${frameIdx} - Checking rotation directions:`);
  for (const name of ['Hips', 'LeftArm', 'RightArm', 'LeftUpLeg', 'RightUpLeg', 'Head']) {
    const bone = boneByName[name];
    if (!bone) continue;

    const wq = new THREE.Quaternion();
    bone.getWorldQuaternion(wq);
    const dq = restWorldQuat[name].clone().invert().multiply(wq);

    const euler = new THREE.Euler().setFromQuaternion(dq, 'XYZ');

    // Our viewer coords: X=right, Y=up(voxelZ), Z=-depth(negVoxelY)
    // Three.js coords:   X=right, Y=up,         Z=toward camera
    // Mapping: threeX→viewerX, threeY→viewerY, threeZ→-viewerZ
    //
    // Test different quaternion conversions:
    const conv1 = { x: -dq.x, y: -dq.y, z: dq.z, w: dq.w };   // current
    const conv2 = { x: dq.x, y: dq.y, z: -dq.z, w: dq.w };    // negate z only
    const conv3 = { x: dq.x, y: dq.y, z: -dq.z, w: -dq.w };   // negate z,w
    const conv4 = { x: -dq.x, y: dq.y, z: dq.z, w: dq.w };    // negate x only

    console.log(`\n${name}:`);
    console.log(`  Three.js euler: X:${r(euler.x*rad2deg)}° Y:${r(euler.y*rad2deg)}° Z:${r(euler.z*rad2deg)}°`);
    console.log(`  Three.js dq: (${r(dq.x)}, ${r(dq.y)}, ${r(dq.z)}, ${r(dq.w)})`);
    console.log(`  Conv1 (-x,-y,z,w):  (${r(conv1.x)}, ${r(conv1.y)}, ${r(conv1.z)}, ${r(conv1.w)})`);
    console.log(`  Conv2 (x,y,-z,w):   (${r(conv2.x)}, ${r(conv2.y)}, ${r(conv2.z)}, ${r(conv2.w)})`);
    console.log(`  Conv3 (x,y,-z,-w):  (${r(conv3.x)}, ${r(conv3.y)}, ${r(conv3.z)}, ${r(conv3.w)})`);
    console.log(`  Conv4 (-x,y,z,w):   (${r(conv4.x)}, ${r(conv4.y)}, ${r(conv4.z)}, ${r(conv4.w)})`);
  }

  mixer.stopAllAction();
  mixer.uncacheRoot(group);
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fbxFile = path.join(__dirname, '..', 'public', 'models', 'character-motion', 'Hip Hop Dancing (1).fbx');
analyze(path.resolve(fbxFile));
