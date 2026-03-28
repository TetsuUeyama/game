/**
 * extract_skeleton.js
 *
 * リアリスティックVOXボディからボディランドマークを抽出してリファレンススケルトンを作成するスクリプト。
 * Tポーズのボディ形状を解析して関節と寸法を検出する。
 *
 * Usage: node extract_skeleton.js [body.vox] [grid.json] [output.json]
 */
// ファイルシステムモジュール
const fs = require('fs');
// パス操作モジュール
const path = require('path');

// ========================================================================
// VOXパーサー
// ========================================================================
function parseVox(buf) {
  let offset = 0;
  const readU32 = () => { const v = buf.readUInt32LE(offset); offset += 4; return v; };
  const readU8 = () => buf[offset++];
  const readStr = (n) => { const s = buf.toString('ascii', offset, offset + n); offset += n; return s; };
  if (readStr(4) !== 'VOX ') throw new Error('Not VOX');
  readU32();
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
// メイン処理
// ========================================================================
// コマンドライン引数
const args = process.argv.slice(2);
const voxPath = args[0] || 'public/realistic/body/body.vox';
const gridPath = args[1] || 'public/realistic/grid.json';
const outPath = args[2] || 'scripts/realistic-vox/reference_skeleton.json';

// ファイル読み込み
const voxBuf = fs.readFileSync(voxPath);
const grid = JSON.parse(fs.readFileSync(gridPath, 'utf8'));
const model = parseVox(voxBuf);

console.log(`Loaded: ${model.voxels.length} voxels, grid ${model.sizeX}x${model.sizeY}x${model.sizeZ}`);
console.log(`Grid: ${grid.gx}x${grid.gy}x${grid.gz}, voxel_size=${grid.voxel_size.toFixed(6)}`);

// Z値ごとのボクセルをグループ化
const byZ = {};
for (const v of model.voxels) {
  if (!byZ[v.z]) byZ[v.z] = [];
  byZ[v.z].push({ x: v.x, y: v.y });
}

// ========================================================================
// ヘルパー関数
// ========================================================================
// Z断面の統計情報を取得する関数
function getSliceStats(z) {
  const pts = byZ[z] || [];
  if (pts.length === 0) return null;
  const xs = pts.map(p => p.x), ys = pts.map(p => p.y);
  const xMin = Math.min(...xs), xMax = Math.max(...xs);
  const yMin = Math.min(...ys), yMax = Math.max(...ys);
  return {
    count: pts.length,
    xMin, xMax, yMin, yMax,
    xCenter: (xMin + xMax) / 2, yCenter: (yMin + yMax) / 2,
    width: xMax - xMin + 1, depth: yMax - yMin + 1,
  };
}

// 指定Z範囲の重心を計算する関数
function centroidRange(zLo, zHi) {
  let sx = 0, sy = 0, sz = 0, n = 0;
  for (const v of model.voxels) {
    if (v.z >= zLo && v.z <= zHi) { sx += v.x; sy += v.y; sz += v.z; n++; }
  }
  return n > 0 ? [sx / n, sy / n, sz / n] : [0, 0, 0];
}

// ボクセル座標→ワールド座標に変換する関数
function toWorld(vx, vy, vz) {
  return [
    grid.grid_origin[0] + (vx + 0.5) * grid.voxel_size,
    grid.grid_origin[1] + (vy + 0.5) * grid.voxel_size,
    grid.grid_origin[2] + (vz + 0.5) * grid.voxel_size,
  ];
}

// Z範囲と高さ
const allZ = Object.keys(byZ).map(Number).sort((a, b) => a - b);
const zMin = allZ[0];
const zMax = allZ[allZ.length - 1];
const heightVox = zMax - zMin + 1;

console.log(`\nBody Z range: ${zMin} - ${zMax} (height: ${heightVox} voxels)`);

// ========================================================================
// 1. 幅プロファイル
// ========================================================================
const widthProfile = [];
for (let z = zMin; z <= zMax; z++) {
  const s = getSliceStats(z);
  widthProfile.push(s ? { z, ...s } : { z, width: 0, count: 0, xMin: 0, xMax: 0, xCenter: 0, yCenter: 0, depth: 0 });
}

// ボディ全体のX中心
const globalCentroid = centroidRange(zMin, zMax);
const bodyCenterX = Math.round(globalCentroid[0]);
console.log(`Body center X: ${bodyCenterX}`);

// ========================================================================
// 2. 腕レベルの検出（Tポーズ: 最も幅広いZ断面 = 腕が完全に伸びている）
// ========================================================================
let armZ = zMin, armWidth = 0;
for (const w of widthProfile) {
  if (w.width > armWidth) { armWidth = w.width; armZ = w.z; }
}
console.log(`\nArm level (widest): z=${armZ} (width=${armWidth})`);

// ========================================================================
// 3. 体幹幅の検出（腕の開始点を検出して純粋な体幹幅を特定）
// ========================================================================
const torsoWidths = widthProfile.filter(w => w.z >= zMin + 20 && w.z <= armZ - 3 && w.width > 0);
torsoWidths.sort((a, b) => Math.abs(b.z - armZ) - Math.abs(a.z - armZ));
let shoulderRefZ = armZ - 10;
let torsoLeftX = bodyCenterX - 20, torsoRightX = bodyCenterX + 20;

// 中央値の体幹幅を計算
const medianTorsoWidth = torsoWidths.length > 0
  ? torsoWidths.map(w => w.width).sort((a, b) => a - b)[Math.floor(torsoWidths.length / 2)]
  : 50;
const armThreshold = medianTorsoWidth * 1.8;

// 腕開始直前のZ断面を検出
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
// 4. 肩 = 腕Zレベルでの体幹エッジ
// ========================================================================
const armStats = getSliceStats(armZ);
const shoulderZ = armZ;
const shoulderLeftVox = [torsoLeftX, Math.round(armStats.yCenter), shoulderZ];
const shoulderRightVox = [torsoRightX, Math.round(armStats.yCenter), shoulderZ];
console.log(`Shoulders: left=[${shoulderLeftVox}], right=[${shoulderRightVox}]`);

// ========================================================================
// 5. 手首 = 腕の先端（腕Zレンジ±5での最外X）
// ========================================================================
const armZLo = armZ - 5, armZHi = armZ + 5;
let wristLeftX = torsoLeftX, wristRightX = torsoRightX;
for (const v of model.voxels) {
  if (v.z >= armZLo && v.z <= armZHi) {
    if (v.x < wristLeftX) wristLeftX = v.x;
    if (v.x > wristRightX) wristRightX = v.x;
  }
}

// 手首のY,Z（先端付近の平均）
const wristMargin = 3;
const wristLPts = model.voxels.filter(v => v.x <= wristLeftX + wristMargin && v.z >= armZLo && v.z <= armZHi);
const wristRPts = model.voxels.filter(v => v.x >= wristRightX - wristMargin && v.z >= armZLo && v.z <= armZHi);
const avg = (pts, key) => pts.reduce((s, v) => s + v[key], 0) / (pts.length || 1);

const wristLeftVox = [wristLeftX, Math.round(avg(wristLPts, 'y')), Math.round(avg(wristLPts, 'z'))];
const wristRightVox = [wristRightX, Math.round(avg(wristRPts, 'y')), Math.round(avg(wristRPts, 'z'))];
console.log(`Wrists: left=[${wristLeftVox}] (x=${wristLeftX}), right=[${wristRightVox}] (x=${wristRightX})`);

// ========================================================================
// 6. 肘 = 腕の中点
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
// 7. 首: 腕レベルと頭頂の間の最も幅が狭いZ断面
// ========================================================================
let neckZ = armZ, neckWidth = 999;
const headSearchStart = armZ + 5;
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
// 8. 頭部
// ========================================================================
const headCentroid = centroidRange(neckZ, zMax);
const headCenterVox = headCentroid.map(Math.round);
const headTopVox = [Math.round(headCentroid[0]), Math.round(headCentroid[1]), zMax];
console.log(`Head: center=[${headCenterVox}], top z=${zMax}`);

// ========================================================================
// 9. 股関節: 脚が分離するZ（中央にギャップがある最高Z）
// ========================================================================
let hipZ = -1;
for (let z = zMin; z < armZ; z++) {
  const pts = byZ[z] || [];
  if (pts.length < 10) continue;
  const xs = pts.map(p => p.x);
  const centerCount = xs.filter(x => Math.abs(x - bodyCenterX) <= 2).length;
  const xMin_s = Math.min(...xs), xMax_s = Math.max(...xs);
  // 中央にボクセルがなく幅が十分 = 脚の分離点
  if (centerCount === 0 && (xMax_s - xMin_s) > 10) {
    hipZ = z;
  }
}
if (hipZ < 0) {
  hipZ = Math.round(zMin + heightVox * 0.45);
  console.log(`Hip (estimated 45%): z=${hipZ}`);
} else {
  console.log(`Hip (gap detected): z=${hipZ}`);
}

// 股間 = 分離点、股関節はその少し上
const hipJointZ = hipZ + Math.round(heightVox * 0.02);

const hipStats = getSliceStats(hipJointZ);
const hipCenterY = hipStats ? Math.round(hipStats.yCenter) : Math.round(globalCentroid[1]);
const hipCenterVox = [bodyCenterX, hipCenterY, hipJointZ];

// 左右の股関節中心
const hipPts = byZ[hipZ] || [];
const leftPts = hipPts.filter(p => p.x < bodyCenterX);
const rightPts = hipPts.filter(p => p.x >= bodyCenterX);
const hipLeftX = leftPts.length > 0 ? Math.round(leftPts.reduce((s, p) => s + p.x, 0) / leftPts.length) : bodyCenterX - 10;
const hipRightX = rightPts.length > 0 ? Math.round(rightPts.reduce((s, p) => s + p.x, 0) / rightPts.length) : bodyCenterX + 10;
const hipLeftVox = [hipLeftX, hipCenterY, hipJointZ];
const hipRightVox = [hipRightX, hipCenterY, hipJointZ];
console.log(`Hip joints: left=[${hipLeftVox}], right=[${hipRightVox}]`);

// ========================================================================
// 10. 足首: 各脚の足底付近
// ========================================================================
let footBottomLeftZ = zMax, footBottomRightZ = zMax;
for (let z = zMin; z <= hipZ; z++) {
  const pts = byZ[z] || [];
  if (pts.some(p => p.x < bodyCenterX)) footBottomLeftZ = Math.min(footBottomLeftZ, z);
  if (pts.some(p => p.x >= bodyCenterX)) footBottomRightZ = Math.min(footBottomRightZ, z);
}
// 足首 ≈ 足底 + 全高の約3%
const ankleOffset = Math.round(heightVox * 0.03);
const ankleLeftZ = footBottomLeftZ + ankleOffset;
const ankleRightZ = footBottomRightZ + ankleOffset;
const ankleLeftVox = [hipLeftX, hipCenterY, ankleLeftZ];
const ankleRightVox = [hipRightX, hipCenterY, ankleRightZ];

// ========================================================================
// 11. 膝: 股関節と足首の中点
// ========================================================================
const kneeLeftVox = [hipLeftX, hipCenterY, Math.round((hipJointZ + ankleLeftZ) / 2)];
const kneeRightVox = [hipRightX, hipCenterY, Math.round((hipJointZ + ankleRightZ) / 2)];

// ========================================================================
// 12. 体幹中心
// ========================================================================
const torsoCentroid = centroidRange(hipJointZ, shoulderZ);
const torsoCenterVox = torsoCentroid.map(Math.round);

// ========================================================================
// 寸法計算
// ========================================================================
const armLengthLeft = torsoLeftX - wristLeftX;
const armLengthRight = wristRightX - torsoRightX;
const legLength = hipJointZ - zMin;
const torsoHeight = shoulderZ - hipJointZ;
const headHeight = zMax - neckZ;

const vs = grid.voxel_size;
const toCm = (voxels) => (voxels * vs * 100).toFixed(1);

// ========================================================================
// ランドマークデータを構築
// ========================================================================
const landmarks_voxel = {
  head_top: headTopVox,              // 頭頂
  head_center: headCenterVox,        // 頭部中心
  neck: neckVox,                     // 首
  shoulder_left: shoulderLeftVox,    // 左肩
  shoulder_right: shoulderRightVox,  // 右肩
  elbow_left: elbowLeftVox,          // 左肘
  elbow_right: elbowRightVox,        // 右肘
  wrist_left: wristLeftVox,          // 左手首
  wrist_right: wristRightVox,        // 右手首
  torso_center: torsoCenterVox,      // 体幹中心
  hip_center: hipCenterVox,          // 股関節中心
  hip_left: hipLeftVox,              // 左股関節
  hip_right: hipRightVox,            // 右股関節
  knee_left: kneeLeftVox,            // 左膝
  knee_right: kneeRightVox,          // 右膝
  ankle_left: ankleLeftVox,          // 左足首
  ankle_right: ankleRightVox,        // 右足首
  foot_bottom: [bodyCenterX, Math.round(globalCentroid[1]), zMin],  // 足底
};

// ランドマークをワールド座標に変換
const landmarks_world = {};
for (const [key, [vx, vy, vz]] of Object.entries(landmarks_voxel)) {
  landmarks_world[key] = toWorld(vx, vy, vz).map(v => parseFloat(v.toFixed(6)));
}

// ボクセル単位の寸法
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

// 実寸法（cm）
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

// 結果をJSONとして出力
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

// サマリーを表示
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
