/**
 * Generate grapple motion pairs (attacker + defender).
 *
 * Moves:
 *   1. Takedown: tackle → push down → mount position
 *   2. Hip Throw: grab → rotate → throw
 *
 * Each generates 2 files: {name}_atk.motion.json and {name}_def.motion.json
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

function lerpPose(a, b, t) {
  const allBones = new Set([
    ...Object.keys(a).filter(k => k !== '_dp'),
    ...Object.keys(b).filter(k => k !== '_dp'),
  ]);
  const result = {};
  for (const bone of allBones) {
    const aRot = a[bone] || { y: 0, x: 0, z: 0 };
    const bRot = b[bone] || { y: 0, x: 0, z: 0 };
    result[bone] = { dq: normalize(slerp(euler(aRot.y, aRot.x, aRot.z), euler(bRot.y, bRot.x, bRot.z), t)) };
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

function roundArr(arr, d = 5) {
  return arr.map(v => Math.round(v * (10 ** d)) / (10 ** d));
}

function buildMotionJson(name, frames, numFrames) {
  const cleanFrames = frames.map(frame => {
    const clean = {};
    for (const [bone, data] of Object.entries(frame)) {
      clean[bone] = { dq: roundArr(data.dq) };
      if (data.dp) clean[bone].dp = roundArr(data.dp, 4);
    }
    return clean;
  });
  return {
    name,
    fps: FPS,
    frameCount: numFrames,
    duration: (numFrames - 1) / FPS,
    fbxBodyHeight: FBX_BODY_HEIGHT,
    bindWorldPositions: {},
    frames: cleanFrames,
  };
}

function generateFromKeyframes(keyframes, numFrames) {
  const frames = [];
  for (let i = 0; i < numFrames; i++) {
    const t = i / (numFrames - 1);
    // Find the two surrounding keyframes
    let kfA = keyframes[0], kfB = keyframes[0], lt = 0;
    for (let k = 0; k < keyframes.length - 1; k++) {
      if (t >= keyframes[k].t && t <= keyframes[k + 1].t) {
        kfA = keyframes[k];
        kfB = keyframes[k + 1];
        const range = kfB.t - kfA.t;
        lt = range > 0 ? (t - kfA.t) / range : 0;
        // Apply easing
        if (kfA.easing === 'in') lt = easeIn(lt);
        else if (kfA.easing === 'out') lt = easeOut(lt);
        else lt = easeInOut(lt);
        break;
      }
    }
    // If past last keyframe, hold
    if (t > keyframes[keyframes.length - 1].t) {
      frames.push(lerpPose(keyframes[keyframes.length - 1].pose, keyframes[keyframes.length - 1].pose, 0));
    } else {
      frames.push(lerpPose(kfA.pose, kfB.pose, lt));
    }
  }
  return frames;
}

// ============================================================
// TAKEDOWN (push down → mount)
// ============================================================

const TAKEDOWN_FRAMES = 28; // ~0.9s

// --- Attacker: tackle → lean over → mount position ---
const takedownAtkKeyframes = [
  { t: 0, pose: {}, easing: 'out' }, // rest
  { t: 0.15, pose: { // lunge forward, arms reach out
    Spine2:        { y: 0, x: 30, z: 0 },
    Spine1:        { y: 0, x: 15, z: 0 },
    Spine:         { y: 0, x: 10, z: 0 },
    Head:          { y: 0, x: 10, z: 0 },
    RightArm:      { y: -30, x: 0, z: -30 },
    LeftArm:       { y: 30, x: 0, z: 30 },
    RightForeArm:  { y: 0, x: -40, z: 0 },
    LeftForeArm:   { y: 0, x: -40, z: 0 },
    _dp: [0, -0.1, -0.15],
  }, easing: 'in' },
  { t: 0.4, pose: { // grab and push — deep lean
    Hips:          { y: 0, x: 35, z: 0 },
    Spine:         { y: 0, x: 20, z: 0 },
    Spine1:        { y: 0, x: 15, z: 0 },
    Spine2:        { y: 0, x: 25, z: 0 },
    Head:          { y: 0, x: 15, z: 0 },
    RightArm:      { y: -40, x: -30, z: -20 },
    LeftArm:       { y: 40, x: -30, z: 20 },
    RightForeArm:  { y: 0, x: -60, z: 0 },
    LeftForeArm:   { y: 0, x: -60, z: 0 },
    RightUpLeg:    { y: 0, x: -30, z: 0 },
    LeftUpLeg:     { y: 0, x: -25, z: 0 },
    RightLeg:      { y: 0, x: -50, z: 0 },
    LeftLeg:       { y: 0, x: -45, z: 0 },
    _dp: [0, -0.45, -0.25],
  }, easing: 'out' },
  { t: 0.7, pose: { // mount: kneeling over opponent
    Hips:          { y: 0, x: 55, z: 0 },
    Spine:         { y: 0, x: 15, z: 0 },
    Spine1:        { y: 0, x: 10, z: 0 },
    Spine2:        { y: 0, x: 15, z: 0 },
    Head:          { y: 0, x: 10, z: 0 },
    RightArm:      { y: -20, x: -40, z: -15 },
    LeftArm:       { y: 20, x: -40, z: 15 },
    RightForeArm:  { y: 0, x: -70, z: 0 },
    LeftForeArm:   { y: 0, x: -70, z: 0 },
    RightUpLeg:    { y: 0, x: -60, z: 15 },
    LeftUpLeg:     { y: 0, x: -55, z: -15 },
    RightLeg:      { y: 0, x: -90, z: 0 },
    LeftLeg:       { y: 0, x: -85, z: 0 },
    _dp: [0, -0.7, -0.15],
  }, easing: 'inout' },
  { t: 1.0, pose: { // settled mount
    Hips:          { y: 0, x: 58, z: 0 },
    Spine:         { y: 0, x: 12, z: 0 },
    Spine1:        { y: 0, x: 8, z: 0 },
    Spine2:        { y: 0, x: 12, z: 0 },
    Head:          { y: 0, x: 8, z: 0 },
    RightArm:      { y: -15, x: -35, z: -10 },
    LeftArm:       { y: 15, x: -35, z: 10 },
    RightForeArm:  { y: 0, x: -65, z: 0 },
    LeftForeArm:   { y: 0, x: -65, z: 0 },
    RightUpLeg:    { y: 0, x: -65, z: 18 },
    LeftUpLeg:     { y: 0, x: -60, z: -18 },
    RightLeg:      { y: 0, x: -95, z: 0 },
    LeftLeg:       { y: 0, x: -90, z: 0 },
    _dp: [0, -0.75, -0.1],
  }, easing: 'inout' },
];

// --- Defender: pushed back → falls → lies on back ---
const takedownDefKeyframes = [
  { t: 0, pose: {}, easing: 'out' },
  { t: 0.15, pose: { // hit by tackle, recoil
    Spine2:        { y: 0, x: -15, z: 0 },
    Spine1:        { y: 0, x: -8, z: 0 },
    Head:          { y: 0, x: -15, z: 5 },
    RightArm:      { y: 20, x: 0, z: -30 },
    LeftArm:       { y: -20, x: 0, z: 30 },
    _dp: [0, 0, 0.05],
  }, easing: 'in' },
  { t: 0.4, pose: { // falling backward
    Hips:          { y: 0, x: -50, z: 0 },
    Spine:         { y: 0, x: -10, z: 0 },
    Spine1:        { y: 0, x: -8, z: 0 },
    Spine2:        { y: 0, x: -15, z: 5 },
    Head:          { y: 5, x: -20, z: -8 },
    RightArm:      { y: 45, x: 0, z: -65 },
    LeftArm:       { y: -40, x: 0, z: 60 },
    RightForeArm:  { y: 0, x: 40, z: 0 },
    LeftForeArm:   { y: 0, x: 35, z: 0 },
    RightUpLeg:    { y: 0, x: 15, z: 0 },
    LeftUpLeg:     { y: 0, x: 10, z: 0 },
    RightLeg:      { y: 0, x: 20, z: 0 },
    LeftLeg:       { y: 0, x: 25, z: 0 },
    _dp: [0, -0.6, 0.2],
  }, easing: 'out' },
  { t: 0.7, pose: { // flat on back, pinned
    Hips:          { y: 0, x: -88, z: 0 },
    Spine:         { y: 0, x: -5, z: 0 },
    Spine1:        { y: 0, x: -3, z: 0 },
    Spine2:        { y: 0, x: -5, z: 3 },
    Head:          { y: 8, x: -8, z: -10 },
    Neck:          { y: 0, x: -3, z: 0 },
    RightArm:      { y: 55, x: 10, z: -85 },
    LeftArm:       { y: -50, x: 10, z: 80 },
    RightForeArm:  { y: 0, x: 30, z: 15 },
    LeftForeArm:   { y: 0, x: 25, z: -10 },
    RightUpLeg:    { y: 0, x: 20, z: 10 },
    LeftUpLeg:     { y: 0, x: 15, z: -10 },
    RightLeg:      { y: 0, x: 25, z: 0 },
    LeftLeg:       { y: 0, x: 20, z: 0 },
    _dp: [0, -1.1, 0.3],
  }, easing: 'inout' },
  { t: 1.0, pose: { // settled, pinned under mount
    Hips:          { y: 0, x: -90, z: 0 },
    Spine:         { y: 0, x: -3, z: 0 },
    Spine1:        { y: 0, x: -2, z: 0 },
    Spine2:        { y: 0, x: -3, z: 3 },
    Head:          { y: 10, x: -5, z: -12 },
    Neck:          { y: 0, x: -2, z: 0 },
    RightArm:      { y: 60, x: 10, z: -88 },
    LeftArm:       { y: -55, x: 10, z: 83 },
    RightForeArm:  { y: 0, x: 25, z: 12 },
    LeftForeArm:   { y: 0, x: 20, z: -8 },
    RightUpLeg:    { y: 0, x: 15, z: 10 },
    LeftUpLeg:     { y: 0, x: 10, z: -10 },
    RightLeg:      { y: 0, x: 20, z: 0 },
    LeftLeg:       { y: 0, x: 15, z: 0 },
    _dp: [0, -1.15, 0.3],
  }, easing: 'inout' },
];

// ============================================================
// HIP THROW
// ============================================================

const HIP_THROW_FRAMES = 24; // ~0.8s

// --- Attacker: grab → rotate hip → throw ---
const hipThrowAtkKeyframes = [
  { t: 0, pose: {}, easing: 'out' },
  { t: 0.2, pose: { // grab opponent
    Spine2:        { y: -20, x: 15, z: 0 },
    Spine1:        { y: -10, x: 8, z: 0 },
    RightArm:      { y: -50, x: -20, z: -15 },
    LeftArm:       { y: 30, x: -30, z: 20 },
    RightForeArm:  { y: 0, x: -70, z: 0 },
    LeftForeArm:   { y: 0, x: -60, z: 0 },
    _dp: [0, -0.05, -0.1],
  }, easing: 'in' },
  { t: 0.5, pose: { // rotate — hip turn, pull opponent
    Hips:          { y: -60, x: 15, z: 0 },
    Spine:         { y: -25, x: 10, z: 0 },
    Spine1:        { y: -15, x: 12, z: 0 },
    Spine2:        { y: -30, x: 20, z: -5 },
    Head:          { y: -20, x: 5, z: 0 },
    RightArm:      { y: -40, x: -40, z: -20 },
    LeftArm:       { y: 50, x: -20, z: 35 },
    RightForeArm:  { y: 0, x: -80, z: 0 },
    LeftForeArm:   { y: 0, x: -50, z: 0 },
    RightUpLeg:    { y: 0, x: -20, z: 0 },
    LeftUpLeg:     { y: 0, x: -15, z: 0 },
    _dp: [0.15, -0.15, -0.1],
  }, easing: 'out' },
  { t: 0.75, pose: { // follow through — bent forward, released
    Hips:          { y: -30, x: 25, z: 0 },
    Spine:         { y: -10, x: 15, z: 0 },
    Spine1:        { y: -5, x: 10, z: 0 },
    Spine2:        { y: -15, x: 15, z: 0 },
    Head:          { y: -10, x: 10, z: 0 },
    RightArm:      { y: -20, x: 0, z: -25 },
    LeftArm:       { y: 25, x: 0, z: 20 },
    RightForeArm:  { y: 0, x: -30, z: 0 },
    LeftForeArm:   { y: 0, x: -25, z: 0 },
    _dp: [0.05, -0.1, -0.05],
  }, easing: 'inout' },
  { t: 1.0, pose: { // recovery stand
    Spine2:        { y: -5, x: 5, z: 0 },
    _dp: [0, 0, 0],
  }, easing: 'inout' },
];

// --- Defender: grabbed → lifted → slammed ---
const hipThrowDefKeyframes = [
  { t: 0, pose: {}, easing: 'out' },
  { t: 0.2, pose: { // grabbed, pulled in
    Spine2:        { y: 0, x: 10, z: 5 },
    Head:          { y: 0, x: 15, z: 0 },
    RightArm:      { y: 20, x: 0, z: -30 },
    LeftArm:       { y: -15, x: 0, z: 25 },
    _dp: [0, 0.05, -0.05],
  }, easing: 'in' },
  { t: 0.45, pose: { // airborne — rotated over attacker's hip
    Hips:          { y: 30, x: 60, z: 30 },
    Spine:         { y: 10, x: 15, z: 10 },
    Spine1:        { y: 5, x: 10, z: 5 },
    Spine2:        { y: 15, x: 20, z: 10 },
    Head:          { y: 10, x: 25, z: -10 },
    RightArm:      { y: 50, x: 0, z: -70 },
    LeftArm:       { y: -45, x: 0, z: 65 },
    RightForeArm:  { y: 0, x: -45, z: 15 },
    LeftForeArm:   { y: 0, x: -40, z: -10 },
    RightUpLeg:    { y: 0, x: 20, z: 0 },
    LeftUpLeg:     { y: 0, x: 15, z: 0 },
    RightLeg:      { y: 0, x: 15, z: 0 },
    LeftLeg:       { y: 0, x: 20, z: 0 },
    _dp: [0.3, 0.2, 0.1],
  }, easing: 'out' },
  { t: 0.7, pose: { // slammed to ground
    Hips:          { y: 15, x: 85, z: 15 },
    Spine:         { y: 5, x: 8, z: 5 },
    Spine1:        { y: 3, x: 5, z: 3 },
    Spine2:        { y: 8, x: 10, z: 5 },
    Head:          { y: 10, x: 15, z: -15 },
    Neck:          { y: 5, x: 8, z: -5 },
    RightArm:      { y: 55, x: 15, z: -80 },
    LeftArm:       { y: -50, x: 10, z: 75 },
    RightForeArm:  { y: 0, x: -50, z: 20 },
    LeftForeArm:   { y: 0, x: -45, z: -15 },
    RightUpLeg:    { y: 5, x: 15, z: 5 },
    LeftUpLeg:     { y: -5, x: 10, z: -5 },
    RightLeg:      { y: 0, x: 25, z: 0 },
    LeftLeg:       { y: 0, x: 20, z: 0 },
    _dp: [0.15, -1.0, 0.3],
  }, easing: 'inout' },
  { t: 1.0, pose: { // settled on ground
    Hips:          { y: 15, x: 88, z: 12 },
    Spine:         { y: 3, x: 5, z: 3 },
    Spine1:        { y: 2, x: 3, z: 2 },
    Spine2:        { y: 5, x: 5, z: 3 },
    Head:          { y: 12, x: 10, z: -18 },
    Neck:          { y: 5, x: 5, z: -5 },
    RightArm:      { y: 60, x: 15, z: -85 },
    LeftArm:       { y: -55, x: 10, z: 80 },
    RightForeArm:  { y: 0, x: -45, z: 15 },
    LeftForeArm:   { y: 0, x: -40, z: -10 },
    RightUpLeg:    { y: 5, x: 12, z: 5 },
    LeftUpLeg:     { y: -5, x: 8, z: -5 },
    RightLeg:      { y: 0, x: 20, z: 0 },
    LeftLeg:       { y: 0, x: 15, z: 0 },
    _dp: [0.15, -1.1, 0.3],
  }, easing: 'inout' },
];

// ============================================================
// Generate all
// ============================================================

if (!fs.existsSync(OUTPUT)) fs.mkdirSync(OUTPUT, { recursive: true });

const grapples = [
  { name: 'takedown', atkKF: takedownAtkKeyframes, defKF: takedownDefKeyframes, frames: TAKEDOWN_FRAMES },
  { name: 'hip_throw', atkKF: hipThrowAtkKeyframes, defKF: hipThrowDefKeyframes, frames: HIP_THROW_FRAMES },
];

for (const g of grapples) {
  const atkFrames = generateFromKeyframes(g.atkKF, g.frames);
  const defFrames = generateFromKeyframes(g.defKF, g.frames);

  const atkMotion = buildMotionJson(`${g.name}_atk`, atkFrames, g.frames);
  const defMotion = buildMotionJson(`${g.name}_def`, defFrames, g.frames);

  const atkPath = path.join(OUTPUT, `${g.name}_atk.motion.json`);
  const defPath = path.join(OUTPUT, `${g.name}_def.motion.json`);
  fs.writeFileSync(atkPath, JSON.stringify(atkMotion));
  fs.writeFileSync(defPath, JSON.stringify(defMotion));
  console.log(`Generated: ${atkPath} (${g.frames} frames)`);
  console.log(`Generated: ${defPath} (${g.frames} frames)`);
}
