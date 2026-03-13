/**
 * Extract body landmarks from a realistic vox body to create a reference skeleton.
 * Analyzes T-pose body shape to detect joints and measurements.
 *
 * Usage: node extract_skeleton.js [body.vox] [grid.json] [output.json]
 */
const fs = require('fs');
const path = require('path');

// ========================================================================
// VOX parser
// ========================================================================
function parseVox(buf) {
  let offset = 0;
  const readU32 = () => { const v = buf.readUInt32LE(offset); offset += 4; return v; };
  const readU8 = () => buf[offset++];
  const readStr = (n) => { const s = buf.toString('ascii', offset, offset + n); offset += n; return s; };

  if (readStr(4) !== 'VOX ') throw new Error('Not VOX');
  readU32(); // version

  let sizeX = 0, sizeY = 0, sizeZ = 0;
  const voxels = [];

  const readChunks = (end) => {
    while (offset < end) {
      const id = readStr(4), cs = readU32(), ccs = readU32(), ce = offset + cs;
      if (id === 'SIZE') { sizeX = readU32(); sizeY = readU32(); sizeZ = readU32(); }
      else if (id === 'XYZI') {
        const n = readU32();
        for (let i = 0; i < n; i++) voxels.push({ x: readU8(), y: readU8(), z: readU8(), ci: readU8() });
      }
      offset = ce;
      if (ccs > 0) readChunks(offset + ccs);
    }
  };

  if (readStr(4) !== 'MAIN') throw new Error('No MAIN');
  const mc = readU32(), mcc = readU32();
  offset += mc;
  readChunks(offset + mcc);

  return { sizeX, sizeY, sizeZ, voxels };
}

// ========================================================================
// Main
// ========================================================================
const args = process.argv.slice(2);
const voxPath = args[0] || 'public/realistic/body/body.vox';
const gridPath = args[1] || 'public/realistic/grid.json';
const outPath = args[2] || 'scripts/realistic-vox/reference_skeleton.json';

const voxBuf = fs.readFileSync(voxPath);
const grid = JSON.parse(fs.readFileSync(gridPath, 'utf8'));
const model = parseVox(voxBuf);

console.log(`Loaded: ${model.voxels.length} voxels, grid ${model.sizeX}x${model.sizeY}x${model.sizeZ}`);
console.log(`Grid: ${grid.gx}x${grid.gy}x${grid.gz}, voxel_size=${grid.voxel_size.toFixed(6)}`);

// Build lookup structures
const byZ = {};  // z -> [{x, y}]
for (const v of model.voxels) {
  if (!byZ[v.z]) byZ[v.z] = [];
  byZ[v.z].push({ x: v.x, y: v.y });
}

// ========================================================================
// Helpers
// ========================================================================
function getSliceStats(z) {
  const pts = byZ[z] || [];
  if (pts.length === 0) return null;
  const xs = pts.map(p => p.x), ys = pts.map(p => p.y);
  const xMin = Math.min(...xs), xMax = Math.max(...xs);
  const yMin = Math.min(...ys), yMax = Math.max(...ys);
  return {
    count: pts.length,
    xMin, xMax, yMin, yMax,
    xCenter: (xMin + xMax) / 2,
    yCenter: (yMin + yMax) / 2,
    width: xMax - xMin + 1,
    depth: yMax - yMin + 1,
  };
}

function centroidRange(zLo, zHi) {
  let sx = 0, sy = 0, sz = 0, n = 0;
  for (const v of model.voxels) {
    if (v.z >= zLo && v.z <= zHi) { sx += v.x; sy += v.y; sz += v.z; n++; }
  }
  return n > 0 ? [sx / n, sy / n, sz / n] : [0, 0, 0];
}

function toWorld(vx, vy, vz) {
  return [
    grid.grid_origin[0] + (vx + 0.5) * grid.voxel_size,
    grid.grid_origin[1] + (vy + 0.5) * grid.voxel_size,
    grid.grid_origin[2] + (vz + 0.5) * grid.voxel_size,
  ];
}

const allZ = Object.keys(byZ).map(Number).sort((a, b) => a - b);
const zMin = allZ[0];
const zMax = allZ[allZ.length - 1];
const heightVox = zMax - zMin + 1;

console.log(`\nBody Z range: ${zMin} - ${zMax} (height: ${heightVox} voxels)`);

// ========================================================================
// 1. Width profile
// ========================================================================
const widthProfile = [];
for (let z = zMin; z <= zMax; z++) {
  const s = getSliceStats(z);
  widthProfile.push(s ? { z, ...s } : { z, width: 0, count: 0, xMin: 0, xMax: 0, xCenter: 0, yCenter: 0, depth: 0 });
}

// Global body center X
const globalCentroid = centroidRange(zMin, zMax);
const bodyCenterX = Math.round(globalCentroid[0]);
console.log(`Body center X: ${bodyCenterX}`);

// ========================================================================
// 2. Find arm level (T-pose): widest Z slice = arms fully extended
// ========================================================================
let armZ = zMin, armWidth = 0;
for (const w of widthProfile) {
  if (w.width > armWidth) { armWidth = w.width; armZ = w.z; }
}
console.log(`\nArm level (widest): z=${armZ} (width=${armWidth})`);

// ========================================================================
// 3. Find torso width by detecting the arm onset
//    Strategy: scan width profile from below armZ upward.
//    Torso width is stable, then jumps when arms appear.
//    The last stable width = pure torso.
// ========================================================================
// Collect widths below arm level (torso/hip region)
const torsoWidths = widthProfile.filter(w => w.z >= zMin + 20 && w.z <= armZ - 3 && w.width > 0);
// Sort by proximity to armZ (prefer the closest non-arm Z)
torsoWidths.sort((a, b) => Math.abs(b.z - armZ) - Math.abs(a.z - armZ));
// The widest non-arm slice near armZ = shoulder torso width
// (the torso is widest at shoulder level before arms extend)
let shoulderRefZ = armZ - 10;
let torsoLeftX = bodyCenterX - 20, torsoRightX = bodyCenterX + 20;

// Find the Z just below armZ where width hasn't exploded (< 2x the median torso width)
const medianTorsoWidth = torsoWidths.length > 0
  ? torsoWidths.map(w => w.width).sort((a, b) => a - b)[Math.floor(torsoWidths.length / 2)]
  : 50;
const armThreshold = medianTorsoWidth * 1.8;

for (let z = armZ; z >= armZ - 30; z--) {
  const s = getSliceStats(z);
  if (s && s.width > 0 && s.width < armThreshold) {
    shoulderRefZ = z;
    torsoLeftX = s.xMin;
    torsoRightX = s.xMax;
    break;
  }
}
const torsoWidth = torsoRightX - torsoLeftX + 1;
console.log(`Torso ref (z=${shoulderRefZ}): width=${torsoWidth} (x: ${torsoLeftX}-${torsoRightX}), armThresh=${armThreshold.toFixed(0)}`);
console.log(`Arm span at z=${armZ}: ${armWidth} voxels`);

// ========================================================================
// 4. Shoulder = torso edge at arm Z level
// ========================================================================
const armStats = getSliceStats(armZ);
const shoulderZ = armZ;
const shoulderLeftVox = [torsoLeftX, Math.round(armStats.yCenter), shoulderZ];
const shoulderRightVox = [torsoRightX, Math.round(armStats.yCenter), shoulderZ];
console.log(`Shoulders: left=[${shoulderLeftVox}], right=[${shoulderRightVox}]`);

// ========================================================================
// 5. Wrist = arm tips (outermost X at arm Z range ±5)
// ========================================================================
const armZLo = armZ - 5, armZHi = armZ + 5;
let wristLeftX = torsoLeftX, wristRightX = torsoRightX;
for (const v of model.voxels) {
  if (v.z >= armZLo && v.z <= armZHi) {
    if (v.x < wristLeftX) wristLeftX = v.x;
    if (v.x > wristRightX) wristRightX = v.x;
  }
}

// Wrist Y & Z (average near tips)
const wristMargin = 3;
const wristLPts = model.voxels.filter(v => v.x <= wristLeftX + wristMargin && v.z >= armZLo && v.z <= armZHi);
const wristRPts = model.voxels.filter(v => v.x >= wristRightX - wristMargin && v.z >= armZLo && v.z <= armZHi);
const avg = (pts, key) => pts.reduce((s, v) => s + v[key], 0) / (pts.length || 1);

const wristLeftVox = [wristLeftX, Math.round(avg(wristLPts, 'y')), Math.round(avg(wristLPts, 'z'))];
const wristRightVox = [wristRightX, Math.round(avg(wristRPts, 'y')), Math.round(avg(wristRPts, 'z'))];
console.log(`Wrists: left=[${wristLeftVox}] (x=${wristLeftX}), right=[${wristRightVox}] (x=${wristRightX})`);

// ========================================================================
// 6. Elbow = midpoint of arm
// ========================================================================
const elbowLeftVox = [
  Math.round((shoulderLeftVox[0] + wristLeftVox[0]) / 2),
  Math.round((shoulderLeftVox[1] + wristLeftVox[1]) / 2),
  Math.round((shoulderLeftVox[2] + wristLeftVox[2]) / 2),
];
const elbowRightVox = [
  Math.round((shoulderRightVox[0] + wristRightVox[0]) / 2),
  Math.round((shoulderRightVox[1] + wristRightVox[1]) / 2),
  Math.round((shoulderRightVox[2] + wristRightVox[2]) / 2),
];

// ========================================================================
// 7. Neck: local width minimum between arm level and head top
//    Search from arm level upward, find first significant narrowing
// ========================================================================
let neckZ = armZ, neckWidth = 999;
const headSearchStart = armZ + 5; // a bit above arms
for (const w of widthProfile) {
  if (w.z >= headSearchStart && w.z <= zMax - 5 && w.width > 0 && w.width < neckWidth) {
    neckWidth = w.width;
    neckZ = w.z;
  }
}
const neckStats = getSliceStats(neckZ);
const neckVox = [Math.round(neckStats.xCenter), Math.round(neckStats.yCenter), neckZ];
console.log(`Neck: z=${neckZ} (width=${neckWidth})`);

// ========================================================================
// 8. Head
// ========================================================================
const headCentroid = centroidRange(neckZ, zMax);
const headCenterVox = headCentroid.map(Math.round);
const headTopVox = [Math.round(headCentroid[0]), Math.round(headCentroid[1]), zMax];
console.log(`Head: center=[${headCenterVox}], top z=${zMax}`);

// ========================================================================
// 9. Hip: find Z where legs separate (gap in middle)
//    Scan from bottom up, find highest Z with center gap
// ========================================================================
let hipZ = -1;
for (let z = zMin; z < armZ; z++) {
  const pts = byZ[z] || [];
  if (pts.length < 10) continue;
  const xs = pts.map(p => p.x);
  const centerCount = xs.filter(x => Math.abs(x - bodyCenterX) <= 2).length;
  const xMin_s = Math.min(...xs), xMax_s = Math.max(...xs);
  if (centerCount === 0 && (xMax_s - xMin_s) > 10) {
    hipZ = z;
  }
}
if (hipZ < 0) {
  // Fallback: estimate at 45% height
  hipZ = Math.round(zMin + heightVox * 0.45);
  console.log(`Hip (estimated 45%): z=${hipZ}`);
} else {
  console.log(`Hip (gap detected): z=${hipZ}`);
}

// Crotch = the exact separation point; hip joint is slightly above
const hipJointZ = hipZ + Math.round(heightVox * 0.02);

const hipStats = getSliceStats(hipJointZ);
const hipCenterY = hipStats ? Math.round(hipStats.yCenter) : Math.round(globalCentroid[1]);
const hipCenterVox = [bodyCenterX, hipCenterY, hipJointZ];

// Left/right hip centers
const hipPts = byZ[hipZ] || [];
const leftPts = hipPts.filter(p => p.x < bodyCenterX);
const rightPts = hipPts.filter(p => p.x >= bodyCenterX);
const hipLeftX = leftPts.length > 0 ? Math.round(leftPts.reduce((s, p) => s + p.x, 0) / leftPts.length) : bodyCenterX - 10;
const hipRightX = rightPts.length > 0 ? Math.round(rightPts.reduce((s, p) => s + p.x, 0) / rightPts.length) : bodyCenterX + 10;
const hipLeftVox = [hipLeftX, hipCenterY, hipJointZ];
const hipRightVox = [hipRightX, hipCenterY, hipJointZ];
console.log(`Hip joints: left=[${hipLeftVox}], right=[${hipRightVox}]`);

// ========================================================================
// 10. Ankle: near foot bottom, for each leg
// ========================================================================
// Find the very bottom of each leg
let footBottomLeftZ = zMax, footBottomRightZ = zMax;
for (let z = zMin; z <= hipZ; z++) {
  const pts = byZ[z] || [];
  if (pts.some(p => p.x < bodyCenterX)) footBottomLeftZ = Math.min(footBottomLeftZ, z);
  if (pts.some(p => p.x >= bodyCenterX)) footBottomRightZ = Math.min(footBottomRightZ, z);
}
// Ankle ≈ bottom + ~3% of total height (above foot)
const ankleOffset = Math.round(heightVox * 0.03);
const ankleLeftZ = footBottomLeftZ + ankleOffset;
const ankleRightZ = footBottomRightZ + ankleOffset;
const ankleLeftVox = [hipLeftX, hipCenterY, ankleLeftZ];
const ankleRightVox = [hipRightX, hipCenterY, ankleRightZ];

// ========================================================================
// 11. Knee: midpoint between hip and ankle
// ========================================================================
const kneeLeftVox = [hipLeftX, hipCenterY, Math.round((hipJointZ + ankleLeftZ) / 2)];
const kneeRightVox = [hipRightX, hipCenterY, Math.round((hipJointZ + ankleRightZ) / 2)];

// ========================================================================
// 12. Torso center
// ========================================================================
const torsoCentroid = centroidRange(hipJointZ, shoulderZ);
const torsoCenterVox = torsoCentroid.map(Math.round);

// ========================================================================
// Measurements
// ========================================================================
const armLengthLeft = torsoLeftX - wristLeftX;
const armLengthRight = wristRightX - torsoRightX;
const legLength = hipJointZ - zMin;
const torsoHeight = shoulderZ - hipJointZ;
const headHeight = zMax - neckZ;

const vs = grid.voxel_size;
const toCm = (voxels) => (voxels * vs * 100).toFixed(1);

// ========================================================================
// Build landmarks
// ========================================================================
const landmarks_voxel = {
  head_top: headTopVox,
  head_center: headCenterVox,
  neck: neckVox,
  shoulder_left: shoulderLeftVox,
  shoulder_right: shoulderRightVox,
  elbow_left: elbowLeftVox,
  elbow_right: elbowRightVox,
  wrist_left: wristLeftVox,
  wrist_right: wristRightVox,
  torso_center: torsoCenterVox,
  hip_center: hipCenterVox,
  hip_left: hipLeftVox,
  hip_right: hipRightVox,
  knee_left: kneeLeftVox,
  knee_right: kneeRightVox,
  ankle_left: ankleLeftVox,
  ankle_right: ankleRightVox,
  foot_bottom: [bodyCenterX, Math.round(globalCentroid[1]), zMin],
};

const landmarks_world = {};
for (const [key, [vx, vy, vz]] of Object.entries(landmarks_voxel)) {
  landmarks_world[key] = toWorld(vx, vy, vz).map(v => parseFloat(v.toFixed(6)));
}

const measurements_voxel = {
  height: heightVox,
  shoulder_width: torsoWidth,
  arm_span: armWidth,
  arm_length_left: armLengthLeft,
  arm_length_right: armLengthRight,
  torso_height: torsoHeight,
  leg_length: legLength,
  head_height: headHeight,
  hip_width: hipRightX - hipLeftX,
};

const measurements_world = {
  height: toCm(heightVox) + ' cm',
  shoulder_width: toCm(torsoRightX - torsoLeftX + 1) + ' cm',
  arm_span: toCm(armWidth) + ' cm',
  arm_length: toCm((armLengthLeft + armLengthRight) / 2) + ' cm',
  torso_height: toCm(torsoHeight) + ' cm',
  leg_length: toCm(legLength) + ' cm',
  head_height: toCm(headHeight) + ' cm',
  hip_width: toCm(hipRightX - hipLeftX) + ' cm',
};

const result = {
  source: path.basename(voxPath, '.vox'),
  generated: new Date().toISOString(),
  grid: {
    gx: grid.gx, gy: grid.gy, gz: grid.gz,
    voxel_size: grid.voxel_size,
    grid_origin: grid.grid_origin,
  },
  landmarks_voxel,
  landmarks_world,
  measurements_voxel,
  measurements_world,
  bbox_voxel: {
    min: [Math.min(...model.voxels.map(v => v.x)), Math.min(...model.voxels.map(v => v.y)), zMin],
    max: [Math.max(...model.voxels.map(v => v.x)), Math.max(...model.voxels.map(v => v.y)), zMax],
  },
};

fs.writeFileSync(outPath, JSON.stringify(result, null, 2));
console.log(`\nSaved: ${outPath}`);

// Print summary
console.log('\n=== LANDMARKS (voxel coordinates) ===');
for (const [k, v] of Object.entries(landmarks_voxel)) {
  console.log(`  ${k.padEnd(20)} [${v.join(', ')}]`);
}
console.log('\n=== MEASUREMENTS (voxels) ===');
for (const [k, v] of Object.entries(measurements_voxel)) {
  console.log(`  ${k.padEnd(20)} ${v}`);
}
console.log('\n=== MEASUREMENTS (real world) ===');
for (const [k, v] of Object.entries(measurements_world)) {
  console.log(`  ${k.padEnd(20)} ${v}`);
}
