/**
 * Generate FORWARD knockdown motion (fall face-down, うつ伏せ).
 *
 * Three.js/FBX coordinate system:
 *   Character faces +Z, Y is up
 *   threeQuatToViewer preserves X rotation
 *   In viewer, character model faces -Z
 *   So POSITIVE Hips X rotation = lean forward in viewer = うつ伏せ
 *   dp[2] negative = move -Z in viewer = move forward (toward face dir)
 *
 * Timeline (22 frames at 30fps ≈ 0.7s):
 *   0-12%: Gut impact (body folds forward)
 *   12-45%: Knees buckle, falling forward
 *   45-75%: Hit ground face-down
 *   75-100%: Settle
 */

const fs = require('fs');
const path = require('path');

const FPS = 30;
const FRAMES = 22;
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
  const bb = d < 0 ? a.map((_, i) => -b[i]) : [...b];
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
function euler(yDeg, xDeg, zDeg) {
  let q = axisAngle(0, 1, 0, yDeg);
  if (xDeg) q = qmul(q, axisAngle(1, 0, 0, xDeg));
  if (zDeg) q = qmul(q, axisAngle(0, 0, 1, zDeg));
  return normalize(q);
}

const ID = [0, 0, 0, 1];

// ===== Forward knockdown key poses =====
// Positive X on Hips/Spine = lean forward in viewer

const REST = {};

// Phase 1: Gut impact — body folds forward, head drops
const IMPACT = {
  Head:          { y: 0, x: 25, z: -5 },
  Neck:          { y: 0, x: 15, z: 0 },
  Spine2:        { y: 0, x: 20, z: 0 },
  Spine1:        { y: 0, x: 12, z: 0 },
  Spine:         { y: 0, x: 8, z: 0 },
  Hips:          { y: 0, x: 5, z: 0 },
  RightArm:      { y: -10, x: 0, z: -15 },
  LeftArm:       { y: 10, x: 0, z: 15 },
  RightForeArm:  { y: 0, x: -40, z: 0 },
  LeftForeArm:   { y: 0, x: -40, z: 0 },
  _dp: [0, -0.03, -0.05],
};

// Phase 2: Knees buckle, falling forward
const FALLING = {
  Hips:          { y: -3, x: 50, z: 5 },
  Spine:         { y: 0, x: 15, z: 0 },
  Spine1:        { y: 0, x: 12, z: 3 },
  Spine2:        { y: 5, x: 20, z: -5 },
  Head:          { y: -5, x: 25, z: 8 },
  Neck:          { y: 0, x: 15, z: 0 },
  RightArm:      { y: -30, x: -20, z: -40 },
  LeftArm:       { y: 25, x: -15, z: 35 },
  RightForeArm:  { y: 0, x: -60, z: -10 },
  LeftForeArm:   { y: 0, x: -55, z: 10 },
  RightUpLeg:    { y: 0, x: -30, z: 0 },
  LeftUpLeg:     { y: 0, x: -25, z: 0 },
  RightLeg:      { y: 0, x: -50, z: 0 },
  LeftLeg:       { y: 0, x: -55, z: 0 },
  _dp: [0, -0.55, -0.2],
};

// Phase 3: Face-down on ground — flat
const GROUND = {
  Hips:          { y: -5, x: 88, z: 8 },
  Spine:         { y: 0, x: 5, z: 0 },
  Spine1:        { y: 0, x: 3, z: 3 },
  Spine2:        { y: 3, x: 5, z: -5 },
  Head:          { y: -8, x: 8, z: 10 },
  Neck:          { y: -5, x: 5, z: 5 },
  RightArm:      { y: -45, x: -30, z: -70 },
  LeftArm:       { y: 40, x: -25, z: 60 },
  RightForeArm:  { y: 15, x: -70, z: -15 },
  LeftForeArm:   { y: -10, x: -65, z: 10 },
  RightHand:     { y: 0, x: -10, z: 10 },
  LeftHand:      { y: 0, x: -10, z: -10 },
  RightUpLeg:    { y: 5, x: -15, z: -5 },
  LeftUpLeg:     { y: -5, x: -10, z: 5 },
  RightLeg:      { y: 0, x: -25, z: 0 },
  LeftLeg:       { y: 0, x: -20, z: 0 },
  RightFoot:     { y: 0, x: 15, z: 0 },
  LeftFoot:      { y: 0, x: 10, z: 0 },
  _dp: [0, -1.1, -0.3],
};

// Phase 4: Settled
const SETTLED = {
  Hips:          { y: -5, x: 90, z: 8 },
  Spine:         { y: 0, x: 3, z: 0 },
  Spine1:        { y: 0, x: 2, z: 3 },
  Spine2:        { y: 3, x: 3, z: -5 },
  Head:          { y: -10, x: 5, z: 12 },
  Neck:          { y: -5, x: 3, z: 5 },
  RightArm:      { y: -50, x: -30, z: -75 },
  LeftArm:       { y: 45, x: -25, z: 65 },
  RightForeArm:  { y: 15, x: -65, z: -10 },
  LeftForeArm:   { y: -10, x: -60, z: 8 },
  RightHand:     { y: 0, x: -8, z: 8 },
  LeftHand:      { y: 0, x: -8, z: -8 },
  RightUpLeg:    { y: 5, x: -12, z: -5 },
  LeftUpLeg:     { y: -5, x: -8, z: 5 },
  RightLeg:      { y: 0, x: -20, z: 0 },
  LeftLeg:       { y: 0, x: -15, z: 0 },
  RightFoot:     { y: 0, x: 12, z: 0 },
  LeftFoot:      { y: 0, x: 8, z: 0 },
  _dp: [0, -1.15, -0.3],
};

// ===== Interpolation & generation =====

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
  const aDp = a._dp || [0, 0, 0];
  const bDp = b._dp || [0, 0, 0];
  const dp = aDp.map((v, i) => v + (bDp[i] - v) * t);
  if (!result.Hips) result.Hips = { dq: [...ID] };
  result.Hips.dp = dp;
  return result;
}

function easeIn(t) { return t * t; }
function easeOut(t) { return 1 - (1 - t) * (1 - t); }
function easeInOut(t) { return t < 0.5 ? 2*t*t : 1-2*(1-t)*(1-t); }

function generateKnockdownFwd() {
  const frames = [];
  for (let i = 0; i < FRAMES; i++) {
    const t = i / (FRAMES - 1);
    let frame;
    if (t <= 0.12) {
      frame = lerpPose(REST, IMPACT, easeOut(t / 0.12));
    } else if (t <= 0.45) {
      frame = lerpPose(IMPACT, FALLING, easeIn((t - 0.12) / 0.33));
    } else if (t <= 0.75) {
      frame = lerpPose(FALLING, GROUND, easeOut((t - 0.45) / 0.30));
    } else {
      frame = lerpPose(GROUND, SETTLED, easeInOut((t - 0.75) / 0.25));
    }
    frames.push(frame);
  }
  return frames;
}

function roundArr(arr, d = 5) {
  return arr.map(v => Math.round(v * (10 ** d)) / (10 ** d));
}

const frames = generateKnockdownFwd();
const cleanFrames = frames.map(frame => {
  const clean = {};
  for (const [bone, data] of Object.entries(frame)) {
    clean[bone] = { dq: roundArr(data.dq) };
    if (data.dp) clean[bone].dp = roundArr(data.dp, 4);
  }
  return clean;
});

const motion = {
  name: 'Knockdown Forward',
  fps: FPS,
  frameCount: FRAMES,
  duration: (FRAMES - 1) / FPS,
  fbxBodyHeight: FBX_BODY_HEIGHT,
  bindWorldPositions: {},
  frames: cleanFrames,
};

if (!fs.existsSync(OUTPUT)) fs.mkdirSync(OUTPUT, { recursive: true });
const outPath = path.join(OUTPUT, 'knockdown_forward.motion.json');
fs.writeFileSync(outPath, JSON.stringify(motion));
console.log(`Generated: ${outPath} (${FRAMES} frames)`);
