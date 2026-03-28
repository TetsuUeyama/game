/**
 * scale_segments_to_model.js
 *
 * ベースモデルのセグメントボクセルを、新キャラのbody_metricsに基づいてスケーリングするスクリプト。
 * 各セグメントをボーン軸方向（長さ）とボーン垂直方向（幅・奥行）で伸縮。
 *
 * Usage:
 *   node scripts/scale_segments_to_model.js <base_dir> <new_metrics.json> <output_dir>
 *
 * 例:
 *   node scripts/scale_segments_to_model.js \
 *     game-assets/vox/female/BasicBodyFemale \
 *     game-assets/vox/female/NewCharacter/body_metrics.json \
 *     game-assets/vox/female/NewCharacter
 */
// ファイルシステムモジュール
const fs = require('fs');
// パス操作モジュール
const path = require('path');

// コマンドライン引数
const BASE_DIR = process.argv[2];          // ベースモデルディレクトリ
const NEW_METRICS_PATH = process.argv[3];  // 新モデルのメトリクスJSON
const OUT_DIR = process.argv[4];           // 出力ディレクトリ

if (!BASE_DIR || !NEW_METRICS_PATH || !OUT_DIR) {
  console.log('Usage: node scale_segments_to_model.js <base_dir> <new_metrics.json> <output_dir>');
  process.exit(1);
}

// ========================================================================
// VOXパーサー/ライター
// ========================================================================
// VOXファイルパーサー（コンパクト版）
function parseVox(filePath) {
  const buf = fs.readFileSync(filePath);
  let offset = 8, sizeX = 0, sizeY = 0, sizeZ = 0;
  const voxels = []; let palette = null;
  const rc = (off) => ({ id: buf.toString('ascii', off, off + 4), cs: buf.readInt32LE(off + 4), ccs: buf.readInt32LE(off + 8), data: off + 12 });
  const main = rc(offset); offset += 12;
  const end = offset + main.ccs;
  while (offset < end) {
    const c = rc(offset);
    if (c.id === 'SIZE') { sizeX = buf.readInt32LE(c.data); sizeY = buf.readInt32LE(c.data + 4); sizeZ = buf.readInt32LE(c.data + 8); }
    else if (c.id === 'XYZI') { const n = buf.readInt32LE(c.data); for (let i = 0; i < n; i++) { const b = c.data + 4 + i * 4; voxels.push({ x: buf.readUInt8(b), y: buf.readUInt8(b + 1), z: buf.readUInt8(b + 2), c: buf.readUInt8(b + 3) }); } }
    else if (c.id === 'RGBA') { palette = []; for (let i = 0; i < 256; i++) { const b = c.data + i * 4; palette.push({ r: buf.readUInt8(b), g: buf.readUInt8(b + 1), b: buf.readUInt8(b + 2), a: buf.readUInt8(b + 3) }); } }
    offset += 12 + c.cs + c.ccs;
  }
  return { sizeX, sizeY, sizeZ, voxels, palette };
}

// VOXファイルライター（コンパクト版）
function writeVox(filePath, sizeX, sizeY, sizeZ, voxels, palette) {
  const n = voxels.length;
  const chunks = [];
  const sb = Buffer.alloc(24); sb.write('SIZE', 0); sb.writeInt32LE(12, 4); sb.writeInt32LE(0, 8);
  sb.writeInt32LE(sizeX, 12); sb.writeInt32LE(sizeY, 16); sb.writeInt32LE(sizeZ, 20); chunks.push(sb);
  const xb = Buffer.alloc(16 + n * 4); xb.write('XYZI', 0); xb.writeInt32LE(4 + n * 4, 4); xb.writeInt32LE(0, 8); xb.writeInt32LE(n, 12);
  for (let i = 0; i < n; i++) { const v = voxels[i], o = 16 + i * 4; xb.writeUInt8(v.x, o); xb.writeUInt8(v.y, o + 1); xb.writeUInt8(v.z, o + 2); xb.writeUInt8(v.c, o + 3); }
  chunks.push(xb);
  if (palette) { const rb = Buffer.alloc(12 + 256 * 4); rb.write('RGBA', 0); rb.writeInt32LE(256 * 4, 4); rb.writeInt32LE(0, 8); for (let i = 0; i < 256; i++) { const p = palette[i] || { r: 0, g: 0, b: 0, a: 255 }, o = 12 + i * 4; rb.writeUInt8(p.r, o); rb.writeUInt8(p.g, o + 1); rb.writeUInt8(p.b, o + 2); rb.writeUInt8(p.a, o + 3); } chunks.push(rb); }
  const cs = chunks.reduce((s, b) => s + b.length, 0);
  const out = Buffer.alloc(20 + cs); out.write('VOX ', 0); out.writeInt32LE(150, 4);
  out.write('MAIN', 8); out.writeInt32LE(0, 12); out.writeInt32LE(cs, 16);
  let pos = 20; for (const c of chunks) { c.copy(out, pos); pos += c.length; }
  fs.writeFileSync(filePath, out);
}

// ========================================================================
// データ読み込み
// ========================================================================
const baseMeta = JSON.parse(fs.readFileSync(path.join(BASE_DIR, 'segments.json'), 'utf8'));   // ベースセグメント情報
const baseMetrics = JSON.parse(fs.readFileSync(path.join(BASE_DIR, 'body_metrics.json'), 'utf8'));  // ベースメトリクス
const newMetrics = JSON.parse(fs.readFileSync(NEW_METRICS_PATH, 'utf8'));                       // 新モデルメトリクス

console.log(`\n=== Segment Scaler ===`);
console.log(`  Base: ${baseMetrics.model} (height=${baseMetrics.body_height.toFixed(3)})`);
console.log(`  New:  ${newMetrics.model} (height=${newMetrics.body_height.toFixed(3)})`);

// ========================================================================
// セグメントごとのスケール比率を計算
// ========================================================================
// 肢グループの合計長さからフォールバック比率を計算
const LIMB_GROUPS = {
  'arm.l': ['shoulder.l','c_arm_twist.l','c_arm_twist_2.l','c_arm_stretch.l','c_forearm_twist.l','c_forearm_twist_2.l','c_forearm_stretch.l','hand.l'],
  'arm.r': ['shoulder.r','c_arm_twist.r','c_arm_twist_2.r','c_arm_stretch.r','c_forearm_twist.r','c_forearm_twist_2.r','c_forearm_stretch.r','hand.r'],
  'leg.l': ['c_thigh_twist.l','c_thigh_twist_2.l','c_thigh_stretch.l','c_leg_stretch.l','c_leg_twist.l','c_leg_twist_2.l','foot.l'],
  'leg.r': ['c_thigh_twist.r','c_thigh_twist_2.r','c_thigh_stretch.r','c_leg_stretch.r','c_leg_twist.r','c_leg_twist_2.r','foot.r'],
  'spine': ['c_root_bend.x','c_spine_01_bend.x','c_spine_02_bend.x','c_spine_03_bend.x','neck.x'],
};

// 各肢グループの合計長比率を計算
const groupRatios = {};
for (const [group, bones] of Object.entries(LIMB_GROUPS)) {
  let baseTotal = 0, newTotal = 0;
  for (const bn of bones) {
    baseTotal += baseMetrics.metrics[bn]?.bone_length || 0;
    newTotal += newMetrics.metrics[bn]?.bone_length || 0;
  }
  groupRatios[group] = baseTotal > 0.001 ? newTotal / baseTotal : 1.0;
  console.log(`  Group ${group}: base=${baseTotal.toFixed(4)} new=${newTotal.toFixed(4)} ratio=${groupRatios[group].toFixed(3)}`);
}

// 各ボーンをグループにマッピング
const boneToGroup = {};
for (const [group, bones] of Object.entries(LIMB_GROUPS)) {
  for (const bn of bones) boneToGroup[bn] = group;
}

// 各セグメントのスケール比率を計算
const scaleRatios = {};

for (const [boneName, baseM] of Object.entries(baseMetrics.metrics)) {
  const newM = newMetrics.metrics[boneName];
  if (!newM) {
    scaleRatios[boneName] = { axial: 1.0, width: 1.0, depth: 1.0 };
    continue;
  }

  let axial = baseM.bone_length > 0.001 ? newM.bone_length / baseM.bone_length : 1.0;
  const width = baseM.width > 0.001 ? newM.width / baseM.width : 1.0;
  const depth = baseM.depth > 0.001 ? newM.depth / baseM.depth : 1.0;

  // 軸方向はグループ比率を使用（肢の一貫したプロポーションを保証）
  const group = boneToGroup[boneName];
  if (group) {
    axial = groupRatios[group];
  }

  // 0.7〜1.5の範囲にクランプ
  scaleRatios[boneName] = {
    axial: Math.max(0.7, Math.min(1.5, axial)),
    width: Math.max(0.7, Math.min(1.5, width)),
    depth: Math.max(0.7, Math.min(1.5, depth)),
  };
}

// 主要ボーンのスケール比率を表示
console.log('\n  Scale ratios:');
for (const [name, ratio] of Object.entries(scaleRatios)) {
  if (ratio.axial !== 1.0 || ratio.width !== 1.0 || ratio.depth !== 1.0) {
    console.log(`    ${name.padEnd(25)} axial=${ratio.axial.toFixed(3)} width=${ratio.width.toFixed(3)} depth=${ratio.depth.toFixed(3)}`);
  }
}

// ========================================================================
// 累積オフセット計算のためのボーン階層を構築
// ========================================================================
const segDir = path.join(OUT_DIR, 'segments');
fs.mkdirSync(segDir, { recursive: true });

const vs = baseMeta.voxel_size;

// ボーンチェーン順序の定義（ルートから末端へ）
const BONE_CHAINS = {
  // 脊椎チェーン
  'c_root_bend.x': { parent: null },
  'c_spine_01_bend.x': { parent: 'c_root_bend.x' },
  'c_spine_02_bend.x': { parent: 'c_spine_01_bend.x' },
  'c_spine_03_bend.x': { parent: 'c_spine_02_bend.x' },
  'neck.x': { parent: 'c_spine_03_bend.x' },
  'head.x': { parent: 'neck.x' },
  'jawbone.x': { parent: 'head.x' },
  // 左腕チェーン
  'shoulder.l': { parent: 'c_spine_03_bend.x' },
  'c_arm_twist.l': { parent: 'shoulder.l' },
  'c_arm_twist_2.l': { parent: 'c_arm_twist.l' },
  'c_arm_stretch.l': { parent: 'c_arm_twist_2.l' },
  'c_forearm_twist.l': { parent: 'c_arm_stretch.l' },
  'c_forearm_twist_2.l': { parent: 'c_forearm_twist.l' },
  'c_forearm_stretch.l': { parent: 'c_forearm_twist_2.l' },
  'hand.l': { parent: 'c_forearm_stretch.l' },
  // 右腕チェーン
  'shoulder.r': { parent: 'c_spine_03_bend.x' },
  'c_arm_twist.r': { parent: 'shoulder.r' },
  'c_arm_twist_2.r': { parent: 'c_arm_twist.r' },
  'c_arm_stretch.r': { parent: 'c_arm_twist_2.r' },
  'c_forearm_twist.r': { parent: 'c_arm_stretch.r' },
  'c_forearm_twist_2.r': { parent: 'c_forearm_twist.r' },
  'c_forearm_stretch.r': { parent: 'c_forearm_twist_2.r' },
  'hand.r': { parent: 'c_forearm_stretch.r' },
  // 左脚チェーン
  'c_thigh_twist.l': { parent: 'c_root_bend.x' },
  'c_thigh_twist_2.l': { parent: 'c_thigh_twist.l' },
  'c_thigh_stretch.l': { parent: 'c_thigh_twist_2.l' },
  'c_leg_stretch.l': { parent: 'c_thigh_stretch.l' },
  'c_leg_twist.l': { parent: 'c_leg_stretch.l' },
  'c_leg_twist_2.l': { parent: 'c_leg_twist.l' },
  'foot.l': { parent: 'c_leg_twist_2.l' },
  // 右脚チェーン
  'c_thigh_twist.r': { parent: 'c_root_bend.x' },
  'c_thigh_twist_2.r': { parent: 'c_thigh_twist.r' },
  'c_thigh_stretch.r': { parent: 'c_thigh_twist_2.r' },
  'c_leg_stretch.r': { parent: 'c_thigh_stretch.r' },
  'c_leg_twist.r': { parent: 'c_leg_stretch.r' },
  'c_leg_twist_2.r': { parent: 'c_leg_twist.r' },
  'foot.r': { parent: 'c_leg_twist_2.r' },
  // 顔/耳/目
  'c_ear_01.l': { parent: 'head.x' },
  'c_ear_02.l': { parent: 'c_ear_01.l' },
  'c_ear_01.r': { parent: 'head.x' },
  'c_ear_02.r': { parent: 'c_ear_01.r' },
  'c_eye.l': { parent: 'head.x' },
  'c_eye.r': { parent: 'head.x' },
  'breast.l': { parent: 'c_spine_03_bend.x' },
  'breast.r': { parent: 'c_spine_03_bend.x' },
};

// 親チェーンの累積テールシフトを計算する関数（再帰）
function computeParentTailShift(segName) {
  const chain = BONE_CHAINS[segName];
  if (!chain || !chain.parent) return { dx: 0, dy: 0, dz: 0 };

  const parentName = chain.parent;
  const parentBone = baseMeta.bone_positions[parentName];
  if (!parentBone) return computeParentTailShift(parentName);

  const parentRatio = scaleRatios[parentName] || { axial: 1.0 };

  // 親の軸方向スケーリングによるテールシフト
  const pHead = parentBone.head_voxel;
  const pTail = parentBone.tail_voxel;
  const tailShiftX = (pTail[0] - pHead[0]) * (parentRatio.axial - 1);
  const tailShiftY = (pTail[1] - pHead[1]) * (parentRatio.axial - 1);
  const tailShiftZ = (pTail[2] - pHead[2]) * (parentRatio.axial - 1);

  // 親自身の累積オフセットを加算
  const parentOffset = computeParentTailShift(parentName);

  return {
    dx: parentOffset.dx + tailShiftX,
    dy: parentOffset.dy + tailShiftY,
    dz: parentOffset.dz + tailShiftZ,
  };
}

// ========================================================================
// 各セグメントのボクセルを累積オフセット付きでスケーリング
// ========================================================================
const newSegments = {};
const newBonePositions = {};
const allScaledSegments = {};

for (const [segName, segInfo] of Object.entries(baseMeta.segments)) {
  const segFile = path.join(BASE_DIR, segInfo.file);
  if (!fs.existsSync(segFile)) continue;

  const segModel = parseVox(segFile);
  const ratio = scaleRatios[segName] || { axial: 1.0, width: 1.0, depth: 1.0 };

  const bonePosData = baseMeta.bone_positions[segName];
  if (!bonePosData) {
    // ボーン位置データがない場合、そのままコピー
    const outFile = path.join(segDir, `${segName}.vox`);
    writeVox(outFile, segModel.sizeX, segModel.sizeY, segModel.sizeZ, segModel.voxels, segModel.palette);
    newSegments[segName] = { file: `segments/${segName}.vox`, voxels: segModel.voxels.length };
    continue;
  }

  // 親チェーンのスケーリングからの累積オフセット
  const cumOffset = computeParentTailShift(segName);

  // ピボット位置（ボーンヘッド + 累積オフセット）
  const pivotX = bonePosData.head_voxel[0] + cumOffset.dx;
  const pivotY = bonePosData.head_voxel[1] + cumOffset.dy;
  const pivotZ = bonePosData.head_voxel[2] + cumOffset.dz;

  // ボーン軸方向を計算
  const boneDir = [
    bonePosData.tail_voxel[0] - bonePosData.head_voxel[0],
    bonePosData.tail_voxel[1] - bonePosData.head_voxel[1],
    bonePosData.tail_voxel[2] - bonePosData.head_voxel[2],
  ];
  const boneDirLen = Math.sqrt(boneDir[0] ** 2 + boneDir[1] ** 2 + boneDir[2] ** 2);
  let axisX, axisY, axisZ;
  if (boneDirLen > 0.1) {
    axisX = boneDir[0] / boneDirLen; axisY = boneDir[1] / boneDirLen; axisZ = boneDir[2] / boneDirLen;
  } else {
    axisX = 0; axisY = 0; axisZ = 1;
  }

  // ボーン軸に垂直な2軸を計算
  let perpX1, perpY1, perpZ1;
  if (Math.abs(axisZ) < 0.9) {
    perpX1 = axisY; perpY1 = -axisX; perpZ1 = 0;
  } else {
    perpX1 = 0; perpY1 = axisZ; perpZ1 = -axisY;
  }
  const pLen = Math.sqrt(perpX1 ** 2 + perpY1 ** 2 + perpZ1 ** 2);
  perpX1 /= pLen; perpY1 /= pLen; perpZ1 /= pLen;
  // 第2垂直軸（外積）
  const perpX2 = axisY * perpZ1 - axisZ * perpY1;
  const perpY2 = axisZ * perpX1 - axisX * perpZ1;
  const perpZ2 = axisX * perpY1 - axisY * perpX1;

  // ボクセルをスケーリング
  const scaledVoxels = [];
  const origPivotX = bonePosData.head_voxel[0];
  const origPivotY = bonePosData.head_voxel[1];
  const origPivotZ = bonePosData.head_voxel[2];

  const isScalingDown = ratio.axial < 1.0 || ratio.width < 1.0 || ratio.depth < 1.0;

  for (const v of segModel.voxels) {
    // ピボットからの相対位置
    const dx = v.x - origPivotX;
    const dy = v.y - origPivotY;
    const dz = v.z - origPivotZ;

    // ボーン軸方向と垂直方向に投影
    const axialProj = dx * axisX + dy * axisY + dz * axisZ;
    const perpProj1 = dx * perpX1 + dy * perpY1 + dz * perpZ1;
    const perpProj2 = dx * perpX2 + dy * perpY2 + dz * perpZ2;

    let newX, newY, newZ;
    if (isScalingDown && boneDirLen > 0.1) {
      // 縮小時: テール（先端）からの距離で切り取り/テーパーを適用
      const tailX = bonePosData.tail_voxel[0];
      const tailY = bonePosData.tail_voxel[1];
      const tailZ = bonePosData.tail_voxel[2];
      const distToTail = Math.sqrt((v.x-tailX)**2 + (v.y-tailY)**2 + (v.z-tailZ)**2);
      const distPivotToTail = boneDirLen;

      const tipRadius = distPivotToTail * (1 - ratio.axial);

      // 先端部分は破棄
      if (distToTail < tipRadius) {
        continue;
      }

      // テーパー: テール付近のボクセルは幅を狭める
      let widthScale = 1.0, depthScale = 1.0;
      const taperZone = distPivotToTail * 0.5;
      if (distToTail < taperZone) {
        const taperT = 1 - distToTail / taperZone;
        widthScale = 1.0 + (ratio.width - 1.0) * taperT;
        depthScale = 1.0 + (ratio.depth - 1.0) * taperT;
      }

      const newPerp1 = perpProj1 * widthScale;
      const newPerp2 = perpProj2 * depthScale;
      newX = Math.round(origPivotX + cumOffset.dx + axialProj * axisX + newPerp1 * perpX1 + newPerp2 * perpX2);
      newY = Math.round(origPivotY + cumOffset.dy + axialProj * axisY + newPerp1 * perpY1 + newPerp2 * perpY2);
      newZ = Math.round(origPivotZ + cumOffset.dz + axialProj * axisZ + newPerp1 * perpZ1 + newPerp2 * perpZ2);
    } else {
      // 拡大時: 軸方向と垂直方向をそれぞれスケーリング
      const newAxial = axialProj * ratio.axial;
      const newPerp1 = perpProj1 * ratio.width;
      const newPerp2 = perpProj2 * ratio.depth;
      newX = Math.round(pivotX + newAxial * axisX + newPerp1 * perpX1 + newPerp2 * perpX2);
      newY = Math.round(pivotY + newAxial * axisY + newPerp1 * perpY1 + newPerp2 * perpY2);
      newZ = Math.round(pivotZ + newAxial * axisZ + newPerp1 * perpZ1 + newPerp2 * perpZ2);
    }

    scaledVoxels.push({ x: newX, y: newY, z: newZ, c: v.c });
  }

  // スケーリング後のボーン位置を更新
  newBonePositions[segName] = {
    head_voxel: [Math.round(pivotX), Math.round(pivotY), Math.round(pivotZ)],
    tail_voxel: [
      Math.round(pivotX + boneDir[0] * ratio.axial),
      Math.round(pivotY + boneDir[1] * ratio.axial),
      Math.round(pivotZ + boneDir[2] * ratio.axial),
    ],
  };

  allScaledSegments[segName] = { voxels: scaledVoxels, palette: segModel.palette, sizeX: segModel.sizeX, sizeY: segModel.sizeY, sizeZ: segModel.sizeZ };
  const offStr = (cumOffset.dx || cumOffset.dy || cumOffset.dz) ? ` offset=[${cumOffset.dx.toFixed(1)},${cumOffset.dy.toFixed(1)},${cumOffset.dz.toFixed(1)}]` : '';
  console.log(`  ${segName}: ${segModel.voxels.length} -> ${scaledVoxels.length} voxels (ax=${ratio.axial.toFixed(2)} w=${ratio.width.toFixed(2)} d=${ratio.depth.toFixed(2)})${offStr}`);
}

// ========================================================================
// 後処理: 縮小セグメントのギャップをボディ表面で埋める
// ========================================================================
const allOccupied = new Set();
for (const [, segData] of Object.entries(allScaledSegments)) {
  for (const v of segData.voxels) allOccupied.add(`${v.x},${v.y},${v.z}`);
}

for (const [segName] of Object.entries(baseMeta.segments)) {
  const ratio = scaleRatios[segName] || { axial: 1.0, width: 1.0, depth: 1.0 };
  if (ratio.width >= 1.0 && ratio.depth >= 1.0 && ratio.axial >= 1.0) continue;
  if (!allScaledSegments[segName]) continue;

  const chain = BONE_CHAINS[segName];
  const fillTarget = chain?.parent || 'c_spine_03_bend.x';
  if (!allScaledSegments[fillTarget]) continue;

  const fillColor = allScaledSegments[fillTarget].voxels.length > 0
    ? allScaledSegments[fillTarget].voxels[0].c : 1;

  // 縮小で空いた元のセグメント位置を埋める
  const segFile = path.join(BASE_DIR, baseMeta.segments[segName].file);
  if (!fs.existsSync(segFile)) continue;
  const origModel = parseVox(segFile);
  const cumOffset = computeParentTailShift(segName);

  let filled = 0;
  for (const v of origModel.voxels) {
    const sx = Math.round(v.x + cumOffset.dx);
    const sy = Math.round(v.y + cumOffset.dy);
    const sz = Math.round(v.z + cumOffset.dz);
    const key = `${sx},${sy},${sz}`;
    if (!allOccupied.has(key)) {
      allScaledSegments[fillTarget].voxels.push({ x: sx, y: sy, z: sz, c: fillColor });
      allOccupied.add(key);
      filled++;
    }
  }
  if (filled > 0) console.log(`  Gap fill: ${segName} -> ${fillTarget}: ${filled} voxels`);
}

// ========================================================================
// 後処理: グローバル範囲を検出し、0-255に収まるようにシフト
// ========================================================================
let globalMinX = Infinity, globalMinY = Infinity, globalMinZ = Infinity;
let globalMaxX = -Infinity, globalMaxY = -Infinity, globalMaxZ = -Infinity;

for (const [, segData] of Object.entries(allScaledSegments)) {
  for (const v of segData.voxels) {
    if (v.x < globalMinX) globalMinX = v.x;
    if (v.y < globalMinY) globalMinY = v.y;
    if (v.z < globalMinZ) globalMinZ = v.z;
    if (v.x > globalMaxX) globalMaxX = v.x;
    if (v.y > globalMaxY) globalMaxY = v.y;
    if (v.z > globalMaxZ) globalMaxZ = v.z;
  }
}

// 全座標が0以上になるようにシフト
const shiftX = globalMinX < 0 ? -globalMinX : 0;
const shiftY = globalMinY < 0 ? -globalMinY : 0;
const shiftZ = globalMinZ < 0 ? -globalMinZ : 0;

const newGridX = Math.min(256, globalMaxX + shiftX + 2);
const newGridY = Math.min(256, globalMaxY + shiftY + 2);
const newGridZ = Math.min(256, globalMaxZ + shiftZ + 2);

if (shiftX || shiftY || shiftZ) {
  console.log(`\n  Grid shift: [${shiftX}, ${shiftY}, ${shiftZ}]`);
  // ボーン位置もシフト
  for (const [name, bp] of Object.entries(newBonePositions)) {
    bp.head_voxel = [bp.head_voxel[0] + shiftX, bp.head_voxel[1] + shiftY, bp.head_voxel[2] + shiftZ];
    bp.tail_voxel = [bp.tail_voxel[0] + shiftX, bp.tail_voxel[1] + shiftY, bp.tail_voxel[2] + shiftZ];
  }
}

console.log(`  New grid: ${newGridX}x${newGridY}x${newGridZ}`);

// シフト・クランプしたセグメントを書き出し
for (const [segName, segData] of Object.entries(allScaledSegments)) {
  const shifted = [];
  const seen = new Set();
  for (const v of segData.voxels) {
    const cx = Math.max(0, Math.min(255, v.x + shiftX));
    const cy = Math.max(0, Math.min(255, v.y + shiftY));
    const cz = Math.max(0, Math.min(255, v.z + shiftZ));
    const key = `${cx},${cy},${cz}`;
    if (!seen.has(key)) {
      seen.add(key);
      shifted.push({ x: cx, y: cy, z: cz, c: v.c });
    }
  }
  const outFile = path.join(segDir, `${segName}.vox`);
  writeVox(outFile, newGridX, newGridY, newGridZ, shifted, segData.palette);
  newSegments[segName] = { file: `segments/${segName}.vox`, voxels: shifted.length };
}

// ========================================================================
// 出力メタデータを書き出し
// ========================================================================
const dirName = path.basename(OUT_DIR);

// parts.jsonを生成
const parts = Object.entries(newSegments).map(([key, info]) => ({
  key,
  file: `/${dirName}/${info.file}`,
  voxels: info.voxels,
  default_on: true,
  meshes: [key],
  is_body: true,
  category: 'body_segment',
}));
fs.writeFileSync(path.join(OUT_DIR, 'parts.json'), JSON.stringify(parts, null, 2));

// シフトに応じてbb_minを更新
const newBbMin = [
  baseMeta.bb_min[0] - shiftX * vs,
  baseMeta.bb_min[1] - shiftY * vs,
  baseMeta.bb_min[2] - shiftZ * vs,
];

// segments.jsonを生成
const newMeta = {
  ...baseMeta,
  model: newMetrics.model,
  voxel_size: vs,
  grid: { gx: newGridX, gy: newGridY, gz: newGridZ },
  bb_min: newBbMin,
  bone_positions: { ...baseMeta.bone_positions, ...newBonePositions },
  segments: newSegments,
  scaled_from: baseMetrics.model,
  scale_ratios: scaleRatios,
};
fs.writeFileSync(path.join(OUT_DIR, 'segments.json'), JSON.stringify(newMeta, null, 2));

// grid.jsonを生成
const baseGrid = JSON.parse(fs.readFileSync(path.join(BASE_DIR, 'grid.json'), 'utf8'));
baseGrid.gx = newGridX;
baseGrid.gy = newGridY;
baseGrid.gz = newGridZ;
baseGrid.bb_min = newBbMin;
fs.writeFileSync(path.join(OUT_DIR, 'grid.json'), JSON.stringify(baseGrid, null, 2));

// 結果サマリー
console.log(`\n  Output: ${OUT_DIR}`);
console.log(`  Total segments: ${Object.keys(newSegments).length}`);
