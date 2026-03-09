/**
 * Generate custom attack motion files (.motion.json)
 * 12 motions: Left/Right × Punch/Kick × Upper/Mid/Lower
 *
 * Three.js/FBX coordinate system:
 *   Character faces +Z, Y is up, right arm along +X in T-pose
 *   Negative Y rotation swings +X toward +Z (right arm forward)
 *   Negative X rotation swings -Y toward +Z (right leg forward kick)
 */

const fs = require('fs');
const path = require('path');

const FPS = 30;
const FBX_BODY_HEIGHT = 2.854;
const OUTPUT = path.join(__dirname, '..', 'public', 'models', 'character-motion');

// ===== Quaternion math =====
function axisAngle(ax, ay, az, deg) {
  const r = (deg * Math.PI) / 360;
  const s = Math.sin(r);
  const l = Math.sqrt(ax * ax + ay * ay + az * az) || 1;
  return [s * ax / l, s * ay / l, s * az / l, Math.cos(r)];
}
function qmul(a, b) {
  return [
    a[3]*b[0]+a[0]*b[3]+a[1]*b[2]-a[2]*b[1],
    a[3]*b[1]-a[0]*b[2]+a[1]*b[3]+a[2]*b[0],
    a[3]*b[2]+a[0]*b[1]-a[1]*b[0]+a[2]*b[3],
    a[3]*b[3]-a[0]*b[0]-a[1]*b[1]-a[2]*b[2],
  ];
}
function slerp(a, b, t) {
  let d = a[0]*b[0]+a[1]*b[1]+a[2]*b[2]+a[3]*b[3];
  const flip = d < 0;
  const bb = flip ? a.map((_, i) => -b[i]) : [...b];
  d = Math.abs(d);
  if (d > 0.9999) return a.map((v, i) => (1 - t) * v + t * bb[i]);
  const o = Math.acos(Math.min(1, d)), so = Math.sin(o);
  const s0 = Math.sin((1 - t) * o) / so, s1 = Math.sin(t * o) / so;
  return a.map((v, i) => s0 * v + s1 * bb[i]);
}
function normalize(q) {
  const l = Math.sqrt(q[0]*q[0]+q[1]*q[1]+q[2]*q[2]+q[3]*q[3]);
  return q.map(v => v / l);
}
// Euler YXZ → quaternion
function euler(yDeg, xDeg, zDeg) {
  let q = axisAngle(0, 1, 0, yDeg);
  if (xDeg) q = qmul(q, axisAngle(1, 0, 0, xDeg));
  if (zDeg) q = qmul(q, axisAngle(0, 0, 1, zDeg));
  return normalize(q);
}

const ID = [0, 0, 0, 1];

// ===== Pose definitions =====
// Each attack defines: windUp pose, peak pose, and optional hold
// Bones not listed stay at identity (rest pose)

// Helper: mirror a pose (swap Left↔Right, negate Y and Z rotations, flip X dp)
function mirrorPose(pose) {
  const out = {};
  for (const [bone, rot] of Object.entries(pose)) {
    if (bone === '_dp') {
      out._dp = [-rot[0], rot[1], rot[2]];
      continue;
    }
    let mb = bone;
    if (bone.startsWith('Left')) mb = 'Right' + bone.slice(4);
    else if (bone.startsWith('Right')) mb = 'Left' + bone.slice(5);
    out[mb] = { y: -rot.y, x: rot.x, z: -rot.z };
  }
  return out;
}

// ===== RIGHT PUNCH POSES =====

const R_PUNCH_UPPER_PEAK = {
  Spine2:        { y: -18, x: 8, z: 0 },
  Spine1:        { y: -8,  x: 4, z: 0 },
  RightShoulder: { y: -20, x: -15, z: 0 },
  RightArm:      { y: -60, x: -35, z: 10 },
  RightForeArm:  { y: -55, x: -40, z: 5 },
  RightHand:     { y: -55, x: -40, z: 0 },
  LeftArm:       { y: 10,  x: 0, z: -15 },
  _dp: [0, 0.1, 0.3],
};

const R_PUNCH_UPPER_WINDUP = {
  Spine2:        { y: 12, x: -5, z: 0 },
  RightArm:      { y: 20, x: 10, z: 10 },
  RightForeArm:  { y: 15, x: 15, z: 0 },
  _dp: [0, -0.05, -0.1],
};

const R_PUNCH_MID_PEAK = {
  Spine2:        { y: -22, x: 0, z: 0 },
  Spine1:        { y: -10, x: 0, z: 0 },
  RightShoulder: { y: -18, x: 0, z: 0 },
  RightArm:      { y: -75, x: 0, z: 8 },
  RightForeArm:  { y: -80, x: 0, z: 0 },
  RightHand:     { y: -82, x: 0, z: 0 },
  LeftArm:       { y: 8,   x: 0, z: -12 },
  _dp: [0, 0, 0.35],
};

const R_PUNCH_MID_WINDUP = {
  Spine2:        { y: 14, x: 0, z: 0 },
  RightArm:      { y: 20, x: 5, z: 5 },
  RightForeArm:  { y: 18, x: 10, z: 0 },
  _dp: [0, 0, -0.1],
};

const R_PUNCH_LOW_PEAK = {
  Spine2:        { y: -20, x: -12, z: 0 },
  Spine1:        { y: -8,  x: -6,  z: 0 },
  RightShoulder: { y: -15, x: 12, z: 0 },
  RightArm:      { y: -68, x: 25, z: -5 },
  RightForeArm:  { y: -72, x: 30, z: 0 },
  RightHand:     { y: -72, x: 32, z: 0 },
  LeftArm:       { y: 8,   x: 0, z: -10 },
  _dp: [0, -0.1, 0.3],
};

const R_PUNCH_LOW_WINDUP = {
  Spine2:        { y: 12, x: 5, z: 0 },
  RightArm:      { y: 18, x: -8, z: 8 },
  _dp: [0, 0, -0.08],
};

// ===== RIGHT KICK POSES =====

const R_KICK_UPPER_PEAK = {
  Hips:          { y: 0, x: 5, z: -5 },
  Spine2:        { y: 0, x: 12, z: 0 },
  RightUpLeg:    { y: 0, x: -120, z: 0 },
  RightLeg:      { y: 0, x: -110, z: 0 },
  RightFoot:     { y: 0, x: -100, z: 0 },
  LeftUpLeg:     { y: 0, x: 8, z: 0 },
  LeftArm:       { y: -15, x: 0, z: 20 },
  RightArm:      { y: 15, x: 0, z: -20 },
  _dp: [0, -0.15, -0.2],
};

const R_KICK_UPPER_WINDUP = {
  RightUpLeg:    { y: 0, x: -55, z: 0 },
  RightLeg:      { y: 0, x: -20, z: 0 },
  Spine2:        { y: 0, x: 5, z: 0 },
  _dp: [0, -0.05, -0.1],
};

const R_KICK_MID_PEAK = {
  Hips:          { y: 0, x: 3, z: -3 },
  Spine2:        { y: 0, x: 8, z: 0 },
  RightUpLeg:    { y: 0, x: -85, z: 0 },
  RightLeg:      { y: 0, x: -75, z: 0 },
  RightFoot:     { y: 0, x: -70, z: 0 },
  LeftUpLeg:     { y: 0, x: 5, z: 0 },
  LeftArm:       { y: -10, x: 0, z: 15 },
  RightArm:      { y: 10, x: 0, z: -15 },
  _dp: [0, -0.08, -0.1],
};

const R_KICK_MID_WINDUP = {
  RightUpLeg:    { y: 0, x: -45, z: 0 },
  RightLeg:      { y: 0, x: -10, z: 0 },
  Spine2:        { y: 0, x: 3, z: 0 },
  _dp: [0, -0.03, -0.05],
};

const R_KICK_LOW_PEAK = {
  Hips:          { y: 0, x: 2, z: -2 },
  Spine2:        { y: 0, x: 3, z: 0 },
  RightUpLeg:    { y: 15, x: -40, z: 0 },
  RightLeg:      { y: 10, x: -30, z: 0 },
  RightFoot:     { y: 5,  x: -25, z: 0 },
  LeftUpLeg:     { y: 0, x: 3, z: 0 },
  LeftArm:       { y: -5, x: 0, z: 10 },
  _dp: [0, -0.03, 0.1],
};

const R_KICK_LOW_WINDUP = {
  RightUpLeg:    { y: 5, x: -20, z: 0 },
  RightLeg:      { y: 0, x: -5, z: 0 },
  _dp: [0, 0, -0.03],
};

// ===== Generate all 12 motions =====

const attackDefs = [
  // Right punches
  { name: 'Right Punch Upper', file: 'right_punch_upper', frames: 10, windup: R_PUNCH_UPPER_WINDUP, peak: R_PUNCH_UPPER_PEAK },
  { name: 'Right Punch Mid',   file: 'right_punch_mid',   frames: 10, windup: R_PUNCH_MID_WINDUP,   peak: R_PUNCH_MID_PEAK },
  { name: 'Right Punch Lower', file: 'right_punch_lower', frames: 10, windup: R_PUNCH_LOW_WINDUP,   peak: R_PUNCH_LOW_PEAK },
  // Left punches (mirror)
  { name: 'Left Punch Upper',  file: 'left_punch_upper',  frames: 10, windup: mirrorPose(R_PUNCH_UPPER_WINDUP), peak: mirrorPose(R_PUNCH_UPPER_PEAK) },
  { name: 'Left Punch Mid',    file: 'left_punch_mid',    frames: 10, windup: mirrorPose(R_PUNCH_MID_WINDUP),   peak: mirrorPose(R_PUNCH_MID_PEAK) },
  { name: 'Left Punch Lower',  file: 'left_punch_lower',  frames: 10, windup: mirrorPose(R_PUNCH_LOW_WINDUP),   peak: mirrorPose(R_PUNCH_LOW_PEAK) },
  // Right kicks
  { name: 'Right Kick Upper',  file: 'right_kick_upper',  frames: 14, windup: R_KICK_UPPER_WINDUP,  peak: R_KICK_UPPER_PEAK },
  { name: 'Right Kick Mid',    file: 'right_kick_mid',    frames: 14, windup: R_KICK_MID_WINDUP,    peak: R_KICK_MID_PEAK },
  { name: 'Right Kick Lower',  file: 'right_kick_lower',  frames: 14, windup: R_KICK_LOW_WINDUP,    peak: R_KICK_LOW_PEAK },
  // Left kicks (mirror)
  { name: 'Left Kick Upper',   file: 'left_kick_upper',   frames: 14, windup: mirrorPose(R_KICK_UPPER_WINDUP),  peak: mirrorPose(R_KICK_UPPER_PEAK) },
  { name: 'Left Kick Mid',     file: 'left_kick_mid',     frames: 14, windup: mirrorPose(R_KICK_MID_WINDUP),    peak: mirrorPose(R_KICK_MID_PEAK) },
  { name: 'Left Kick Lower',   file: 'left_kick_lower',   frames: 14, windup: mirrorPose(R_KICK_LOW_WINDUP),    peak: mirrorPose(R_KICK_LOW_PEAK) },
];

// Convert a pose object { BoneName: {y,x,z}, _dp: [...] } to frame data
function poseToFrame(pose) {
  const frame = {};
  for (const [bone, rot] of Object.entries(pose)) {
    if (bone === '_dp') continue;
    const dq = euler(rot.y, rot.x, rot.z);
    frame[bone] = { dq };
  }
  // Hips dp
  if (pose._dp) {
    if (!frame.Hips) frame.Hips = { dq: [...ID] };
    frame.Hips.dp = [...pose._dp];
  }
  return frame;
}

// Interpolate two poses at parameter t (0=a, 1=b)
function lerpPose(a, b, t) {
  const allBones = new Set([
    ...Object.keys(a).filter(k => k !== '_dp'),
    ...Object.keys(b).filter(k => k !== '_dp'),
  ]);
  const result = {};
  for (const bone of allBones) {
    const aRot = a[bone] || { y: 0, x: 0, z: 0 };
    const bRot = b[bone] || { y: 0, x: 0, z: 0 };
    const aDq = euler(aRot.y, aRot.x, aRot.z);
    const bDq = euler(bRot.y, bRot.x, bRot.z);
    const dq = normalize(slerp(aDq, bDq, t));
    result[bone] = { dq };
  }

  // Interpolate dp
  const aDp = a._dp || [0, 0, 0];
  const bDp = b._dp || [0, 0, 0];
  const dp = aDp.map((v, i) => v + (bDp[i] - v) * t);
  if (!result.Hips) result.Hips = { dq: [...ID] };
  result.Hips.dp = dp;

  return result;
}

const EMPTY_POSE = { _dp: [0, 0, 0] };

function generateMotion(def) {
  const { name, file, frames, windup, peak } = def;

  // Timeline:
  // 0.00 - 0.15: rest → windup
  // 0.15 - 0.45: windup → peak
  // 0.45 - 0.60: peak hold (slight ease)
  // 0.60 - 1.00: peak → rest

  const frameData = [];
  for (let i = 0; i < frames; i++) {
    const t = i / (frames - 1); // 0 to 1

    let frame;
    if (t <= 0.15) {
      // Rest → windup
      const lt = t / 0.15;
      frame = lerpPose(EMPTY_POSE, windup, easeInOut(lt));
    } else if (t <= 0.45) {
      // Windup → peak
      const lt = (t - 0.15) / 0.30;
      frame = lerpPose(windup, peak, easeIn(lt));
    } else if (t <= 0.60) {
      // Peak hold
      const lt = (t - 0.45) / 0.15;
      frame = lerpPose(peak, peak, lt);
    } else {
      // Peak → rest
      const lt = (t - 0.60) / 0.40;
      frame = lerpPose(peak, EMPTY_POSE, easeOut(lt));
    }

    frameData.push(frame);
  }

  const duration = frames / FPS;

  const motion = {
    name: 'custom',
    label: name,
    duration,
    fps: FPS,
    frameCount: frames,
    fbxBodyHeight: FBX_BODY_HEIGHT,
    outputBones: [],
    frames: frameData,
  };

  const filePath = path.join(OUTPUT, `${file}.motion.json`);
  fs.writeFileSync(filePath, JSON.stringify(motion, null, 0));
  console.log(`  Generated: ${filePath} (${frames} frames, ${duration.toFixed(3)}s)`);
}

// Easing functions
function easeInOut(t) {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}
function easeIn(t) {
  return t * t;
}
function easeOut(t) {
  return 1 - (1 - t) * (1 - t);
}

// ===== Main =====
console.log('Generating 12 attack motions...\n');
for (const def of attackDefs) {
  generateMotion(def);
}
console.log('\nDone!');
