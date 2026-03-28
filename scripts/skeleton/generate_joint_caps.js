/**
 * generate_joint_caps.js
 *
 * ボーンセグメント間のギャップを埋めるジョイントキャップボクセルを生成するスクリプト。
 *
 * 各ジョイント境界について:
 * 1. 境界ボクセル（異なるセグメントに隣接するボクセル）を検出
 * 2. 断面の輪郭を計算
 * 3. 内部を1-2レイヤーで充填
 * 4. ブレンドされたボーントランスフォームを持つジョイントセグメントを作成
 *
 * Usage: node scripts/generate_joint_caps.js <model_dir>
 * 例: node scripts/generate_joint_caps.js C:/Users/user/developsecond/game-assets/vox/female/QueenMarika-Detailed
 */

// ファイルシステムモジュール
const fs = require('fs');
// パス操作モジュール
const path = require('path');

// コマンドライン引数からモデルディレクトリを取得
const MODEL_DIR = process.argv[2];
if (!MODEL_DIR) {
  console.log('Usage: node generate_joint_caps.js <model_dir>');
  process.exit(1);
}

// ========================================================================
// VOXリーダー/ライター
// ========================================================================
// VOXファイルパーサー
function readVox(filepath) {
  const buf = fs.readFileSync(filepath);
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let offset = 0;
  const readU32 = () => { const v = view.getUint32(offset, true); offset += 4; return v; };
  const readU8 = () => view.getUint8(offset++);
  const readStr = (n) => { let s = ''; for (let i = 0; i < n; i++) s += String.fromCharCode(view.getUint8(offset + i)); offset += n; return s; };

  if (readStr(4) !== 'VOX ') throw new Error('Not VOX');
  readU32();
  let sizeX = 0, sizeY = 0, sizeZ = 0;
  const voxels = [];
  let palette = null;

  const readChunks = (end) => {
    while (offset < end) {
      const id = readStr(4), cs = readU32(), ccs = readU32(), ce = offset + cs;
      if (id === 'SIZE') { sizeX = readU32(); sizeY = readU32(); sizeZ = readU32(); }
      else if (id === 'XYZI') { const n = readU32(); for (let i = 0; i < n; i++) voxels.push({ x: readU8(), y: readU8(), z: readU8(), c: readU8() }); }
      else if (id === 'RGBA') { palette = []; for (let i = 0; i < 256; i++) { palette.push({ r: readU8(), g: readU8(), b: readU8() }); readU8(); } }
      offset = ce; if (ccs > 0) readChunks(offset + ccs);
    }
  };

  if (readStr(4) !== 'MAIN') throw new Error('No MAIN');
  const mc = readU32(), mcc = readU32();
  offset += mc;
  readChunks(offset + mcc);
  if (!palette) { palette = []; for (let i = 0; i < 256; i++) palette.push({ r: 200, g: 180, b: 160 }); }
  return { sizeX, sizeY, sizeZ, voxels, palette };
}

// VOXファイルライター
function writeVox(filepath, sx, sy, sz, voxels, palette) {
  const numVoxels = voxels.length;
  const bufs = [];

  // SIZEチャンク
  const sizeChunk = Buffer.alloc(4 + 4 + 4 + 12);
  sizeChunk.write('SIZE', 0);
  sizeChunk.writeUInt32LE(12, 4);
  sizeChunk.writeUInt32LE(0, 8);
  sizeChunk.writeUInt32LE(sx, 12);
  sizeChunk.writeUInt32LE(sy, 16);
  sizeChunk.writeUInt32LE(sz, 20);
  bufs.push(sizeChunk);

  // XYZIチャンク
  const xyziContentSize = 4 + numVoxels * 4;
  const xyziChunk = Buffer.alloc(4 + 4 + 4 + xyziContentSize);
  xyziChunk.write('XYZI', 0);
  xyziChunk.writeUInt32LE(xyziContentSize, 4);
  xyziChunk.writeUInt32LE(0, 8);
  xyziChunk.writeUInt32LE(numVoxels, 12);
  for (let i = 0; i < numVoxels; i++) {
    const v = voxels[i];
    xyziChunk.writeUInt8(v.x & 0xFF, 16 + i * 4);
    xyziChunk.writeUInt8(v.y & 0xFF, 16 + i * 4 + 1);
    xyziChunk.writeUInt8(v.z & 0xFF, 16 + i * 4 + 2);
    xyziChunk.writeUInt8(v.c & 0xFF, 16 + i * 4 + 3);
  }
  bufs.push(xyziChunk);

  // RGBAチャンク
  const rgbaChunk = Buffer.alloc(4 + 4 + 4 + 256 * 4);
  rgbaChunk.write('RGBA', 0);
  rgbaChunk.writeUInt32LE(256 * 4, 4);
  rgbaChunk.writeUInt32LE(0, 8);
  for (let i = 0; i < 256; i++) {
    const c = i < palette.length ? palette[i] : { r: 0, g: 0, b: 0 };
    rgbaChunk.writeUInt8(c.r, 12 + i * 4);
    rgbaChunk.writeUInt8(c.g, 12 + i * 4 + 1);
    rgbaChunk.writeUInt8(c.b, 12 + i * 4 + 2);
    rgbaChunk.writeUInt8(255, 12 + i * 4 + 3);
  }
  bufs.push(rgbaChunk);

  const allChunks = Buffer.concat(bufs);

  // ヘッダー + MAINチャンク
  const header = Buffer.alloc(20);
  header.write('VOX ', 0);
  header.writeUInt32LE(150, 4);
  header.write('MAIN', 8);
  header.writeUInt32LE(0, 12);
  header.writeUInt32LE(allChunks.length, 16);

  fs.mkdirSync(path.dirname(filepath), { recursive: true });
  fs.writeFileSync(filepath, Buffer.concat([header, allChunks]));
}

// ========================================================================
// メイン処理
// ========================================================================
// segments.jsonとparts.jsonを読み込み
const segmentsJson = JSON.parse(fs.readFileSync(path.join(MODEL_DIR, 'segments.json'), 'utf8'));
const partsJson = JSON.parse(fs.readFileSync(path.join(MODEL_DIR, 'parts.json'), 'utf8'));

const { grid, segments, bone_hierarchy, bone_positions } = segmentsJson;
const sx = grid.gx, sy = grid.gy, sz = grid.gz;

// 全セグメントのボクセルを統一グリッドに読み込み
console.log('Loading segments...');
const globalGrid = new Map();   // "x,y,z" → {bone, colorIndex}
const bonePalettes = {};         // bone → パレット配列

for (const [boneName, segInfo] of Object.entries(segments)) {
  const voxPath = path.join(MODEL_DIR, segInfo.file);
  if (!fs.existsSync(voxPath)) continue;

  const vox = readVox(voxPath);
  bonePalettes[boneName] = vox.palette;

  for (const v of vox.voxels) {
    globalGrid.set(`${v.x},${v.y},${v.z}`, { bone: boneName, c: v.c, palette: vox.palette });
  }
}

console.log(`  Total voxels: ${globalGrid.size}`);
console.log(`  Segments: ${Object.keys(segments).length}`);

// ========================================================================
// ジョイント境界を検出
// ========================================================================
console.log('\nFinding joint boundaries...');
const DIR6 = [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]];

// 各ボクセルについて、隣接が異なるボーンに属するかチェック
const jointPairs = new Map();  // "boneA|boneB" → {boundary, colors}

for (const [key, info] of globalGrid) {
  const [x, y, z] = key.split(',').map(Number);

  for (const [dx, dy, dz] of DIR6) {
    const nx = x + dx, ny = y + dy, nz = z + dz;
    const nKey = `${nx},${ny},${nz}`;
    const neighbor = globalGrid.get(nKey);

    // 隣接が異なるボーンの場合、境界として記録
    if (neighbor && neighbor.bone !== info.bone) {
      const pairKey = [info.bone, neighbor.bone].sort().join('|');
      if (!jointPairs.has(pairKey)) {
        jointPairs.set(pairKey, { boundary: new Set(), colors: new Map() });
      }
      const joint = jointPairs.get(pairKey);

      // 両側の境界ボクセルを記録
      joint.boundary.add(key);
      joint.boundary.add(nKey);

      // 色情報を記録
      const pal = info.palette;
      if (pal && info.c > 0 && info.c <= pal.length) {
        joint.colors.set(key, pal[info.c - 1]);
      }
    }
  }
}

console.log(`  Joint pairs found: ${jointPairs.size}`);

// ========================================================================
// 各ジョイントのギャップ充填ボクセルを生成
// ========================================================================
console.log('\nGenerating joint caps...');

const jointSegments = {};      // jointName → {voxels, boneA, boneB}
const jointPalette = [];       // ジョイント共有パレット
const jointPaletteMap = new Map();

// ジョイントパレットのカラーインデックスを取得
function getJointColorIndex(r, g, b) {
  const key = `${r},${g},${b}`;
  if (jointPaletteMap.has(key)) return jointPaletteMap.get(key);
  const idx = jointPalette.length + 1;
  if (idx > 255) {
    // パレット上限: 最近色を検索
    let bestIdx = 1, bestDist = Infinity;
    for (let i = 0; i < jointPalette.length; i++) {
      const p = jointPalette[i];
      const d = (r-p.r)**2 + (g-p.g)**2 + (b-p.b)**2;
      if (d < bestDist) { bestDist = d; bestIdx = i + 1; }
    }
    return bestIdx;
  }
  jointPaletteMap.set(key, idx);
  jointPalette.push({ r, g, b });
  return idx;
}

for (const [pairKey, joint] of jointPairs) {
  const [boneA, boneB] = pairKey.split('|');

  // 両ボーンの境界ボクセルを分離
  const boundaryA = new Set();
  const boundaryB = new Set();

  for (const key of joint.boundary) {
    const info = globalGrid.get(key);
    if (!info) continue;
    if (info.bone === boneA) boundaryA.add(key);
    else if (info.bone === boneB) boundaryB.add(key);
  }

  // 境界ボクセルに隣接する空き位置を検出
  const candidates = new Set();
  for (const key of joint.boundary) {
    const [x, y, z] = key.split(',').map(Number);
    for (const [dx, dy, dz] of DIR6) {
      const nx = x + dx, ny = y + dy, nz = z + dz;
      if (nx < 0 || ny < 0 || nz < 0 || nx >= sx || ny >= sy || nz >= sz) continue;
      const nKey = `${nx},${ny},${nz}`;
      if (!globalGrid.has(nKey)) {
        candidates.add(nKey);
      }
    }
  }

  // フィルタ: 両セグメントの境界に隣接する候補のみ保持（2ボクセル以内）
  const gapVoxels = [];
  for (const key of candidates) {
    const [x, y, z] = key.split(',').map(Number);

    let nearA = false, nearB = false;
    // 直接隣接チェック
    for (const [dx, dy, dz] of DIR6) {
      const nKey = `${x+dx},${y+dy},${z+dz}`;
      if (boundaryA.has(nKey)) nearA = true;
      if (boundaryB.has(nKey)) nearB = true;
    }
    // 2ステップ隣接チェック
    if (!nearA || !nearB) {
      for (let dx = -2; dx <= 2; dx++) {
        for (let dy = -2; dy <= 2; dy++) {
          for (let dz = -2; dz <= 2; dz++) {
            if (Math.abs(dx) + Math.abs(dy) + Math.abs(dz) > 2) continue;
            const nKey = `${x+dx},${y+dy},${z+dz}`;
            if (boundaryA.has(nKey)) nearA = true;
            if (boundaryB.has(nKey)) nearB = true;
          }
        }
      }
    }

    // 両側に隣接する場合のみギャップボクセルとして追加
    if (nearA && nearB) {
      // 最近傍の境界ボクセルから色を取得
      let bestColor = { r: 200, g: 180, b: 160 };
      let bestDist = Infinity;
      for (const bKey of joint.boundary) {
        const [bx, by, bz] = bKey.split(',').map(Number);
        const d = (x-bx)**2 + (y-by)**2 + (z-bz)**2;
        if (d < bestDist && joint.colors.has(bKey)) {
          bestDist = d;
          bestColor = joint.colors.get(bKey);
        }
      }

      const ci = getJointColorIndex(bestColor.r, bestColor.g, bestColor.b);
      gapVoxels.push({ x, y, z, c: ci });
    }
  }

  // ギャップボクセルがあればジョイントセグメントとして登録
  if (gapVoxels.length > 0) {
    const jointName = `joint_${boneA}_${boneB}`.replace(/\./g, '_');
    jointSegments[jointName] = {
      voxels: gapVoxels,
      boneA,
      boneB,
    };
    console.log(`  ${jointName}: ${gapVoxels.length} fill voxels`);
  }
}

// ========================================================================
// ジョイントセグメントファイルを書き出し
// ========================================================================
console.log('\nWriting joint segments...');
const jointDir = path.join(MODEL_DIR, 'segments');

const newParts = [];    // parts.jsonに追加するエントリ
const jointMeta = {};   // segments.jsonに追加するメタデータ

for (const [jointName, data] of Object.entries(jointSegments)) {
  const filename = `${jointName}.vox`;
  const filepath = path.join(jointDir, filename);

  // VOXファイルとして書き出し
  writeVox(filepath, sx, sy, sz, data.voxels, jointPalette);

  // parts.jsonに追加（boneAをプライマリボーンとして使用）
  newParts.push({
    key: jointName,
    file: `/${path.basename(MODEL_DIR)}/segments/${filename}`,
    voxels: data.voxels.length,
    default_on: true,
    meshes: [jointName],
    is_body: true,
    category: 'joint',
    joint_bones: [data.boneA, data.boneB],  // ビューアでブレンド用
  });

  // segments.jsonにジョイントメタデータを追加
  jointMeta[jointName] = {
    file: `segments/${filename}`,
    voxels: data.voxels.length,
    boneA: data.boneA,
    boneB: data.boneB,
  };

  console.log(`  Written: ${filename} (${data.voxels.length} voxels)`);
}

// parts.jsonを更新
const updatedParts = [...partsJson, ...newParts];
fs.writeFileSync(path.join(MODEL_DIR, 'parts.json'), JSON.stringify(updatedParts, null, 2));

// segments.jsonにジョイント情報を追加
segmentsJson.joints = jointMeta;
fs.writeFileSync(path.join(MODEL_DIR, 'segments.json'), JSON.stringify(segmentsJson, null, 2));

// 結果サマリー
console.log(`\n=== Done ===`);
console.log(`  Joint segments: ${Object.keys(jointSegments).length}`);
console.log(`  Total fill voxels: ${Object.values(jointSegments).reduce((s, d) => s + d.voxels.length, 0)}`);
