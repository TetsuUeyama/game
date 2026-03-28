/**
 * calc-optimal-markers.js
 *
 * FBXバインドポーズにできるだけ一致するボーン方向を生成する
 * 最適なボクセルマーカー位置を計算するスクリプト。
 *
 * マーカー: Chin（顎）, Groin（股間）, LeftWrist（左手首）, LeftElbow（左肘）, LeftKnee（左膝）
 * これらからcalculateAllBonesが全41ボーン位置を導出する。
 *
 * 主要な関係:
 * - Hips = Groin位置
 * - Neck = Chin の z-4
 * - Spine チェーン = lerp(Hips, Neck)
 * - LeftUpLeg = Hips + LeftKneeからのオフセット
 * - LeftLeg = LeftKnee
 * - LeftFoot = LeftKnee の y調整, z=2
 * - LeftShoulder = Spine2 + LeftElbowからのオフセット
 * - LeftArm = lerp(LeftShoulder, LeftElbow, 0.3)
 * - LeftForeArm = LeftElbow
 * - LeftHand = LeftWrist
 */

// FBXモーションデータからバインドポーズのワールド位置を読み込み
const d = require('../public/models/character-motion/Hip Hop Dancing.motion.json');
const bwp = d.bindWorldPositions;

// FBXバインド位置（ビューア空間、Hips基準）
// viewer = (-Three_x, Three_y, Three_z)
const hips = bwp['Hips'];
// ボクセルのスケール（vox-parserと同じ値）
const SCALE = 0.125;

// FBXボーン位置をボクセル空間の相対座標に変換する関数
function fbxToVoxel(boneName, cx, cy) {
  const bp = bwp[boneName];
  if (!bp) return null;
  // Hipsからの相対座標を計算
  const relX = bp[0] - hips[0];
  const relY = bp[1] - hips[1];
  const relZ = bp[2] - hips[2];
  // FBXのボディ高さ（Hips→Head Y方向）
  const fbxBodyHeight = bwp['Head'][1] - hips[1];
  return { relX, relY, relZ, fbxBodyHeight };
}

// 既知のデフォルト値: centerX=35, Groin z=31, Chin z=82
// ボクセルボディ高さ = (headZ - hipsZ) * SCALE = (90 - 31) * 0.125 = 7.375
// FBX ボディ高さ ≈ 2.854
// スケールファクター = 7.375 / 2.854 ≈ 2.584

// グリッド中心座標とHipsのZ位置
const cx = 35, cy = 13;
const groinZ = 31; // HipsのZボクセル座標
// FBXのボディ高さ
const fbxBodyHeight = bwp['Head'][1] - hips[1];
// ボクセル空間でのHeadのZ座標（比例計算）
const headZ_voxel = groinZ + (bwp['Head'][1] - hips[1]) / fbxBodyHeight * (82 + 8 - groinZ);

// マーカーからボーン位置を計算する関数（calculateAllBonesのロジックを再現）
function computeBonesFromMarkers(chin, groin, lWrist, lElbow, lKnee) {
  // 3D線形補間ヘルパー
  const lerp3 = (a, b, t) => ({
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
    z: a.z + (b.z - a.z) * t,
  });

  // Hips = Groin位置
  const hips = { ...groin };
  // Neck = Chin の z-4
  const neck = { x: chin.x, y: chin.y, z: chin.z - 4 };
  // Head = Chin の z+8（最大103）
  const head = { x: chin.x, y: chin.y, z: Math.min(chin.z + 8, 103) };
  // Spine2 = Hips-Neck間の75%位置
  const spine2 = lerp3(hips, neck, 0.75);

  // LeftShoulder = Spine2 + LeftElbowからのオフセット（35%）
  const lShoulderOffset = (lElbow.x - spine2.x) * 0.35;
  const lShoulder = { x: spine2.x + lShoulderOffset, y: spine2.y, z: spine2.z + 2 };

  // LeftUpLeg = Groin + LeftKneeからのXオフセット（80%）
  const lLegOffsetX = (lKnee.x - groin.x) * 0.8;
  const lUpLeg = { x: groin.x + lLegOffsetX, y: groin.y, z: groin.z };

  return { hips, neck, head, spine2, lShoulder, lUpLeg };
}

// ボクセルボディ高さ（近似値）とスケールファクター
const voxelBodyHeight = (82 - 4 + 8 - groinZ);
const scaleFactor_approx = voxelBodyHeight * SCALE / fbxBodyHeight;

console.log('FBX body height:', fbxBodyHeight.toFixed(3));
console.log('Voxel body height (z units):', voxelBodyHeight);
console.log('Scale factor approx:', scaleFactor_approx.toFixed(3));
console.log();

// FBXボーン位置をボクセル空間に変換する関数
// viewer = (-relX * sf, relY * sf, relZ * sf) Hips相対
// voxel_x = viewer_x / S + cx
// voxel_y = cy - viewer_z / S
// voxel_z = viewer_y / S + groinZ
function fbxBoneToVoxel(boneName, sf) {
  const bp = bwp[boneName];
  if (!bp) return null;
  const relX = bp[0] - hips[0];
  const relY = bp[1] - hips[1];
  const relZ = bp[2] - hips[2];
  return {
    x: Math.round((-relX * sf) / SCALE + cx),     // X: Three.jsのXを反転
    y: Math.round(cy - (relZ * sf) / SCALE),       // Y: Three.jsのZを反転
    z: Math.round((relY * sf) / SCALE + groinZ),   // Z: Three.jsのYを高さに
  };
}

// 実際のスケールファクターを計算
const actualBodyHeightViewer = (82 - 4 + 8 - groinZ) * SCALE;
const sf = actualBodyHeightViewer / fbxBodyHeight;
console.log('Scale factor:', sf.toFixed(4));
console.log();

// 主要ボーンのリスト
const keyBones = ['Hips', 'Spine', 'Spine2', 'Neck', 'Head',
  'LeftShoulder', 'LeftArm', 'LeftForeArm', 'LeftHand',
  'RightShoulder', 'RightArm', 'RightForeArm', 'RightHand',
  'LeftUpLeg', 'LeftLeg', 'LeftFoot', 'LeftToeBase',
  'RightUpLeg', 'RightLeg', 'RightFoot', 'RightToeBase'];

// FBXボーンをボクセル空間に変換して表示
console.log('=== FBX bones converted to voxel space ===');
console.log('Bone                | Voxel (x, y, z)');
console.log('-'.repeat(50));
for (const name of keyBones) {
  const v = fbxBoneToVoxel(name, sf);
  if (v) console.log(name.padEnd(20) + '| x=' + String(v.x).padStart(3) + ' y=' + String(v.y).padStart(3) + ' z=' + String(v.z).padStart(3));
}

// 最適マーカー位置を計算
// マーカー→ボーンのマッピング:
// Groin → Hips（直接）
// Chin.z → Neck.z + 4, Head.z = Chin.z + 8
// LeftWrist → LeftHand
// LeftElbow → LeftForeArm
// LeftKnee → LeftLeg

const fbxLeftHand = fbxBoneToVoxel('LeftHand', sf);
const fbxLeftForeArm = fbxBoneToVoxel('LeftForeArm', sf);
const fbxLeftLeg = fbxBoneToVoxel('LeftLeg', sf);
const fbxNeck = fbxBoneToVoxel('Neck', sf);
const fbxHips = fbxBoneToVoxel('Hips', sf);

console.log();
console.log('=== OPTIMAL MARKER POSITIONS ===');
console.log('(Derived from FBX bind pose)');
console.log();
// Chin: neck.z + 4 = chin.z なので chin.z = fbxNeck.z + 4
const optChin = { x: cx, y: fbxNeck.y, z: fbxNeck.z + 4 };
const optGroin = { x: cx, y: fbxHips.y, z: fbxHips.z };
console.log('Chin:      ', JSON.stringify(optChin));
console.log('Groin:     ', JSON.stringify(optGroin));
console.log('LeftWrist: ', JSON.stringify(fbxLeftHand));
console.log('LeftElbow: ', JSON.stringify(fbxLeftForeArm));
console.log('LeftKnee:  ', JSON.stringify(fbxLeftLeg));

// 検証: マーカーからボーンを計算してFBXと方向を比較
console.log();
console.log('=== VERIFICATION ===');
const bones = computeBonesFromMarkers(optChin, optGroin, fbxLeftHand, fbxLeftForeArm, fbxLeftLeg);
const fbxUpLeg = fbxBoneToVoxel('LeftUpLeg', sf);
const fbxShoulder = fbxBoneToVoxel('LeftShoulder', sf);
// マーカーから導出したボーン位置とFBXの位置を比較
console.log('LeftUpLeg from markers:', JSON.stringify(bones.lUpLeg), '  FBX:', JSON.stringify(fbxUpLeg));
console.log('LeftShoulder from markers:', JSON.stringify(bones.lShoulder), '  FBX:', JSON.stringify(fbxShoulder));
