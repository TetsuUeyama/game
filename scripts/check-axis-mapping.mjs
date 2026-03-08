/**
 * Check the actual axis mapping between FBX (Three.js) and the voxel viewer.
 * Determine if X axis is flipped.
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

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fbxPath = path.join(__dirname, '..', 'public', 'models', 'character-motion', 'Hip Hop Dancing (1).fbx');

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
mixer.setTime(0);
group.updateMatrixWorld(true);

console.log('=== FBX REST POSE BONE POSITIONS (Three.js world space) ===');
console.log('Three.js: X=right, Y=up, Z=toward camera');
console.log('');

const bones = ['Hips', 'Head', 'LeftArm', 'RightArm', 'LeftHand', 'RightHand',
               'LeftUpLeg', 'RightUpLeg', 'LeftFoot', 'RightFoot'];

for (const name of bones) {
  const bone = boneByName[name];
  if (!bone) continue;
  const wp = new THREE.Vector3();
  bone.getWorldPosition(wp);
  console.log(`${name.padEnd(15)} X: ${r(wp.x).toString().padStart(8)}  Y: ${r(wp.y).toString().padStart(8)}  Z: ${r(wp.z).toString().padStart(8)}`);
}

console.log('\n=== ANALYSIS ===');
const leftHand = new THREE.Vector3();
const rightHand = new THREE.Vector3();
boneByName['LeftHand']?.getWorldPosition(leftHand);
boneByName['RightHand']?.getWorldPosition(rightHand);

console.log(`LeftHand X:  ${r(leftHand.x)} (${leftHand.x > 0 ? 'POSITIVE' : 'NEGATIVE'})`);
console.log(`RightHand X: ${r(rightHand.x)} (${rightHand.x > 0 ? 'POSITIVE' : 'NEGATIVE'})`);
console.log(`→ In FBX/Three.js: Character's LEFT side = ${leftHand.x > 0 ? '+X' : '-X'}`);

console.log('\n=== VOXEL MODEL DEFAULT MARKERS ===');
console.log('From getDefaultMarkers(35):');
console.log('LeftWrist  voxel_x = 10  (low X)');
console.log('RightWrist voxel_x = 60  (high X, mirrored from left)');
console.log('Center     voxel_x = 35');

console.log('\n=== VIEWER COORDINATES ===');
console.log('viewer_x = (voxel_x - cx) * SCALE');
console.log(`LeftWrist  viewer_x = (10 - 35) * SCALE = -25 * SCALE  (NEGATIVE)`);
console.log(`RightWrist viewer_x = (60 - 35) * SCALE = +25 * SCALE  (POSITIVE)`);

console.log('\n=== CAMERA FRONT VIEW (alpha=PI/2, beta=PI/2) ===');
console.log('Babylon.js ArcRotateCamera position formula:');
console.log('  x = target.x + radius * cos(alpha) * sin(beta)');
console.log('  y = target.y + radius * cos(beta)');
console.log('  z = target.z + radius * sin(alpha) * sin(beta)');
console.log('For alpha=PI/2, beta=PI/2:');
console.log('  x = 0, y = 0, z = radius  → camera at +Z looking toward -Z');
console.log('');
console.log('Camera forward = (0, 0, -1), up = (0, 1, 0)');
console.log('Camera right (left-handed cross) = cross(up, forward):');
// cross((0,1,0), (0,0,-1)) = (1*(-1)-0*0, 0*0-0*(-1), 0*0-1*0) = (-1, 0, 0)
console.log('  = (-1, 0, 0)  → screen RIGHT = NEGATIVE viewer_x');
console.log('');
console.log('So when user sees front view:');
console.log('  Screen LEFT  = +viewer_x = RightWrist = character RIGHT');
console.log('  Screen RIGHT = -viewer_x = LeftWrist  = character LEFT');
console.log('  → Character LEFT hand appears on viewer RIGHT side ✓ (mirror image)');

console.log('\n=== AXIS MAPPING ===');
console.log(`FBX/Three.js:  Character LEFT = +Three_x = ${r(leftHand.x)}`);
console.log(`Voxel viewer:  Character LEFT = -viewer_x = (10-35)*S = -25*S`);
console.log('');
console.log('CONCLUSION: viewer_x = -Three_x  (X AXIS IS FLIPPED!)');
console.log('            viewer_y =  Three_y  (both up)');
console.log('            viewer_z = -Three_z  (Z negated)');
console.log('');
console.log('Full mapping: (x,y,z) → (-x, y, -z)  = 180° rotation around Y');
console.log('This is a PROPER rotation (det=+1), NOT a reflection!');
console.log('');
console.log('Quaternion conversion for 180° Y rotation:');
console.log('  q_viewer = R_Y(180°) × q_three × R_Y(180°)⁻¹');
console.log('  = (0,1,0,0) × (x,y,z,w) × (0,-1,0,0)');
console.log('  = (-x, y, -z, w)');
console.log('');
console.log('CORRECT CONVERSION: (-x, y, -z, w)');
console.log('CURRENT (WRONG):    (-x, -y, z, w)');

mixer.stopAllAction();
mixer.uncacheRoot(group);
