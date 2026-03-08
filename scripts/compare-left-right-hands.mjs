/**
 * Compare FBX RIGHT hand trajectory with viewer LEFT hand trajectory
 * and FBX LEFT hand with viewer RIGHT hand.
 *
 * If FBX RightHand matches viewer LeftHand, it proves a left/right swap.
 *
 * Coordinate mapping: viewer = (-Three_x, Three_y, -Three_z)
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

const restWorldPos = {};
for (const name of ['Hips', 'LeftHand', 'RightHand', 'LeftFoot', 'RightFoot']) {
  const bone = boneByName[name];
  if (bone) {
    const wp = new THREE.Vector3();
    bone.getWorldPosition(wp);
    restWorldPos[name] = wp.clone();
  }
}

// Viewer coordinate conversion
const toViewerPos = (p) => ({ x: -p.x, y: p.y, z: -p.z });

// Screen mapping: Screen RIGHT = -viewer_x, Screen LEFT = +viewer_x
// So FBX "Left" (positive Three_x in rest pose) → viewer_x = -Three_x (negative) → Screen RIGHT
// FBX "Right" (negative Three_x in rest pose) → viewer_x = -Three_x (positive) → Screen LEFT

console.log('=== REST POSE HAND POSITIONS ===');
console.log('(Shows which FBX hand maps to which screen side)\n');

for (const name of ['LeftHand', 'RightHand', 'Hips']) {
  const p = restWorldPos[name];
  const vp = toViewerPos(p);
  const screenSide = vp.x > 0 ? 'Screen LEFT' : 'Screen RIGHT';
  console.log(`FBX ${name.padEnd(12)} Three: (${r(p.x)}, ${r(p.y)}, ${r(p.z)}) → Viewer: (${r(vp.x)}, ${r(vp.y)}, ${r(vp.z)}) → ${screenSide}`);
}

console.log('\n=== KEY INSIGHT ===');
console.log('FBX LeftHand has positive Three_x → Viewer: negative x → Screen RIGHT');
console.log('FBX RightHand has negative Three_x → Viewer: positive x → Screen LEFT');
console.log('So FBX "Left" appears on screen RIGHT, FBX "Right" appears on screen LEFT');
console.log('This is EXPECTED for a character facing the camera (mirrored).\n');

// Now the critical question: does motion.json label bones correctly?
// Check: does the motion.json LeftHand data match FBX LeftHand or FBX RightHand?

console.log('=== TRAJECTORY COMPARISON: motion.json LeftHand vs FBX hands ===');
console.log('If motion.json "LeftHand" matches FBX "LeftHand" → names are consistent');
console.log('If motion.json "LeftHand" matches FBX "RightHand" → LEFT/RIGHT SWAP!\n');

console.log('Frame | FBX LeftHand delta (viewer)    | FBX RightHand delta (viewer)   | motion.json LeftHand dq matches?');
console.log('-'.repeat(120));

const sampleFrames = [];
for (let f = 0; f < motionData.frameCount; f += 10) sampleFrames.push(f);

for (const frameIdx of sampleFrames) {
  const time = frameIdx / 30;
  mixer.setTime(time);
  group.updateMatrixWorld(true);

  // FBX positions
  const fbxLeftHand = new THREE.Vector3();
  const fbxRightHand = new THREE.Vector3();
  const fbxHips = new THREE.Vector3();
  boneByName['LeftHand']?.getWorldPosition(fbxLeftHand);
  boneByName['RightHand']?.getWorldPosition(fbxRightHand);
  boneByName['Hips']?.getWorldPosition(fbxHips);

  const leftDelta = toViewerPos(fbxLeftHand.clone().sub(restWorldPos['LeftHand']));
  const rightDelta = toViewerPos(fbxRightHand.clone().sub(restWorldPos['RightHand']));
  const hipsDelta = toViewerPos(fbxHips.clone().sub(restWorldPos['Hips']));

  // Relative to hips (to see which direction the hand moves relative to body)
  const leftRelX = r(leftDelta.x - hipsDelta.x);
  const rightRelX = r(rightDelta.x - hipsDelta.x);

  // motion.json data - check if LeftHand's dq values match FBX Left or Right
  const motionFrame = motionData.frames[frameIdx];
  const motionLeft = motionFrame?.['LeftHand'];
  const motionRight = motionFrame?.['RightHand'];

  const leftDir = leftRelX > 0.5 ? 'L→ScrnLEFT' : leftRelX < -0.5 ? 'L→ScrnRIGHT' : 'L→center';
  const rightDir = rightRelX > 0.5 ? 'R→ScrnLEFT' : rightRelX < -0.5 ? 'R→ScrnRIGHT' : 'R→center';

  console.log(
    `${String(frameIdx).padStart(5)} ` +
    `| X:${r(leftDelta.x).toString().padStart(7)} relX:${leftRelX.toString().padStart(6)} ${leftDir.padEnd(12)}` +
    `| X:${r(rightDelta.x).toString().padStart(7)} relX:${rightRelX.toString().padStart(6)} ${rightDir.padEnd(12)}` +
    `| L_dq:(${motionLeft ? motionLeft.dq.map(v => r(v)).join(',') : 'N/A'})`
  );
}

// ========================================================================
// THE REAL TEST: Compare FBX RightHand world quat delta with
// motion.json LeftHand world quat delta (and vice versa)
// ========================================================================

console.log('\n\n=== DEFINITIVE TEST: FBX bone world delta vs motion.json bone data ===');
console.log('Compare world quaternion deltas to see if names match or are swapped\n');

const restWorldQuat = {};
mixer.setTime(0);
group.updateMatrixWorld(true);
for (const name of ['LeftShoulder', 'LeftArm', 'LeftForeArm', 'LeftHand',
                     'RightShoulder', 'RightArm', 'RightForeArm', 'RightHand']) {
  const bone = boneByName[name];
  if (bone) {
    const wq = new THREE.Quaternion();
    bone.getWorldQuaternion(wq);
    restWorldQuat[name] = wq.clone();
  }
}

const testFrames = [20, 40, 60, 67, 80, 100];
const toViewerQuat = (dq) => new THREE.Quaternion(-dq[0], dq[1], -dq[2], dq[3]);

for (const frameIdx of testFrames) {
  if (frameIdx >= motionData.frameCount) continue;
  const time = frameIdx / 30;
  mixer.setTime(time);
  group.updateMatrixWorld(true);

  const motionFrame = motionData.frames[frameIdx];

  console.log(`--- Frame ${frameIdx} ---`);
  console.log('                    | FBX→viewer delta quat              | motion.json→viewer delta quat     | Match?');

  for (const fbxName of ['LeftHand', 'RightHand']) {
    const bone = boneByName[fbxName];
    if (!bone || !restWorldQuat[fbxName]) continue;
    const wq = new THREE.Quaternion();
    bone.getWorldQuaternion(wq);
    const fbxDelta = restWorldQuat[fbxName].clone().invert().multiply(wq);
    const fbxViewer = new THREE.Quaternion(-fbxDelta.x, fbxDelta.y, -fbxDelta.z, fbxDelta.w);

    // Compare with SAME name in motion.json
    const motionSame = motionFrame?.[fbxName];
    // Compare with OPPOSITE name in motion.json
    const oppName = fbxName === 'LeftHand' ? 'RightHand' : 'LeftHand';
    const motionOpp = motionFrame?.[oppName];

    let sameDot = 0, oppDot = 0;
    if (motionSame) {
      const mqSame = toViewerQuat(motionSame.dq);
      sameDot = Math.abs(fbxViewer.x*mqSame.x + fbxViewer.y*mqSame.y +
                         fbxViewer.z*mqSame.z + fbxViewer.w*mqSame.w);
    }
    if (motionOpp) {
      const mqOpp = toViewerQuat(motionOpp.dq);
      oppDot = Math.abs(fbxViewer.x*mqOpp.x + fbxViewer.y*mqOpp.y +
                        fbxViewer.z*mqOpp.z + fbxViewer.w*mqOpp.w);
    }

    const sameErr = r(2 * Math.acos(Math.min(1, sameDot)) * 180 / Math.PI);
    const oppErr = r(2 * Math.acos(Math.min(1, oppDot)) * 180 / Math.PI);

    const matchesSame = sameErr < 2;
    const matchesOpp = oppErr < 2;

    let verdict;
    if (matchesSame && !matchesOpp) verdict = `SAME name OK (err=${sameErr}°)`;
    else if (!matchesSame && matchesOpp) verdict = `*** SWAPPED! *** (opp err=${oppErr}°, same err=${sameErr}°)`;
    else if (matchesSame && matchesOpp) verdict = `Both match?? (same=${sameErr}°, opp=${oppErr}°)`;
    else verdict = `Neither matches (same=${sameErr}°, opp=${oppErr}°)`;

    console.log(
      `FBX ${fbxName.padEnd(15)}` +
      `| (${r(fbxViewer.x)}, ${r(fbxViewer.y)}, ${r(fbxViewer.z)}, ${r(fbxViewer.w)})`.padEnd(40) +
      `| same=${sameErr}° opp=${oppErr}°`.padEnd(40) +
      `| ${verdict}`
    );
  }
  console.log('');
}

// ========================================================================
// Also compare POSITIONS: FBX RightHand position vs viewer LeftHand position
// ========================================================================
console.log('\n=== POSITION COMPARISON: FBX hand positions in viewer coords ===');
console.log('If the viewer shows "LeftHand" where FBX RightHand actually is, we have a swap\n');

console.log('Frame | FBX LeftHand viewer pos         | FBX RightHand viewer pos        | FBX Left screen side | FBX Right screen side');
console.log('-'.repeat(130));

for (const frameIdx of [0, 20, 40, 60, 67, 80, 100]) {
  if (frameIdx >= motionData.frameCount) continue;
  const time = frameIdx / 30;
  mixer.setTime(time);
  group.updateMatrixWorld(true);

  const leftP = new THREE.Vector3();
  const rightP = new THREE.Vector3();
  boneByName['LeftHand']?.getWorldPosition(leftP);
  boneByName['RightHand']?.getWorldPosition(rightP);

  const vLeft = toViewerPos(leftP);
  const vRight = toViewerPos(rightP);

  // Screen mapping: positive viewer_x = Screen LEFT (character's right)
  const leftScreen = vLeft.x > 0 ? 'Screen LEFT' : 'Screen RIGHT';
  const rightScreen = vRight.x > 0 ? 'Screen LEFT' : 'Screen RIGHT';

  console.log(
    `${String(frameIdx).padStart(5)} ` +
    `| (${r(vLeft.x).toString().padStart(6)}, ${r(vLeft.y).toString().padStart(6)}, ${r(vLeft.z).toString().padStart(6)})`.padEnd(34) +
    `| (${r(vRight.x).toString().padStart(6)}, ${r(vRight.y).toString().padStart(6)}, ${r(vRight.z).toString().padStart(6)})`.padEnd(34) +
    `| ${leftScreen.padEnd(21)}| ${rightScreen}`
  );
}

console.log('\n=== SUMMARY ===');
console.log('In FBX (Three.js), LeftHand = character\'s actual left hand');
console.log('After conversion to viewer coords: viewer_x = -Three_x');
console.log('So FBX LeftHand (positive Three_x) → negative viewer_x → Screen RIGHT');
console.log('This means: what the VIEWER shows on Screen LEFT should be the FBX RightHand');
console.log('If motion.json "LeftHand" data actually drives the Screen LEFT bone,');
console.log('then it\'s using LEFT name for what is visually the RIGHT hand → LEFT/RIGHT SWAP!');

mixer.stopAllAction();
mixer.uncacheRoot(group);
