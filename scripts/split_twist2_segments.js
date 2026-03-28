/**
 * split_twist2_segments.js
 *
 * twist_2セグメントが欠けているモデルのためにtwistセグメントを分割するスクリプト。
 *
 * 方式B: スクリプトベースのセグメント分割。
 * 各twistボーン（例: c_thigh_twist.l）のボクセルを2つに分割:
 * - stretchボーンに近い半分 → twistとして残る
 * - ルート/親に近い半分 → twist_2になる
 *
 * また breast_l/breast_r → breast.l/breast.r のリネームも実行
 * （CyberpunkElf互換性のため）。
 *
 * Usage: node scripts/split_twist2_segments.js <model_dir>
 */

// ファイルシステムモジュール
const fs = require('fs');
// パス操作モジュール
const path = require('path');

// コマンドライン引数からモデルディレクトリを取得
const MODEL_DIR = process.argv[2];
if (!MODEL_DIR) {
  console.log('Usage: node split_twist2_segments.js <model_dir>');
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
  const sizeChunk = Buffer.alloc(24);
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
  // ヘッダーとMAINチャンク
  const allChunks = Buffer.concat(bufs);
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
// segments.jsonを読み込み
const segmentsJson = JSON.parse(fs.readFileSync(path.join(MODEL_DIR, 'segments.json'), 'utf8'));
const { segments, bone_positions, grid } = segmentsJson;
const sx = grid.gx, sy = grid.gy, sz = grid.gz;

// 分割定義: twist → twist + twist_2 （左右の太もも、脛、腕、前腕）
const SPLIT_DEFS = [
  { twist: 'c_thigh_twist.l', twist2: 'c_thigh_twist_2.l', stretch: 'c_thigh_stretch.l' },  // 左太ももツイスト
  { twist: 'c_thigh_twist.r', twist2: 'c_thigh_twist_2.r', stretch: 'c_thigh_stretch.r' },  // 右太ももツイスト
  { twist: 'c_leg_twist.l',   twist2: 'c_leg_twist_2.l',   stretch: 'c_leg_stretch.l' },    // 左脛ツイスト
  { twist: 'c_leg_twist.r',   twist2: 'c_leg_twist_2.r',   stretch: 'c_leg_stretch.r' },    // 右脛ツイスト
  { twist: 'c_arm_twist.l',   twist2: 'c_arm_twist_2.l',   stretch: 'c_arm_stretch.l' },    // 左腕ツイスト
  { twist: 'c_arm_twist.r',   twist2: 'c_arm_twist_2.r',   stretch: 'c_arm_stretch.r' },    // 右腕ツイスト
  { twist: 'c_forearm_twist.l', twist2: 'c_forearm_twist_2.l', stretch: 'c_forearm_stretch.l' }, // 左前腕ツイスト
  { twist: 'c_forearm_twist.r', twist2: 'c_forearm_twist_2.r', stretch: 'c_forearm_stretch.r' }, // 右前腕ツイスト
];

// 胸のリネーム定義: アンダースコア → ドット（CyberpunkElf互換）
const BREAST_RENAME = [
  { from: 'breast_l', to: 'breast.l' },  // 左胸
  { from: 'breast_r', to: 'breast.r' },  // 右胸
];

console.log('=== Split twist2 segments ===');
console.log(`Model: ${MODEL_DIR}`);

const segDir = path.join(MODEL_DIR, 'segments');

// ツイスト分割を処理
for (const def of SPLIT_DEFS) {
  // twistセグメントが存在しなければスキップ
  if (!segments[def.twist]) {
    console.log(`  SKIP ${def.twist}: not found`);
    continue;
  }
  // twist_2が既に存在する場合はスキップ
  if (segments[def.twist2]) {
    console.log(`  SKIP ${def.twist}: twist_2 already exists`);
    continue;
  }

  // VOXファイルを読み込み
  const voxPath = path.join(MODEL_DIR, segments[def.twist].file);
  if (!fs.existsSync(voxPath)) {
    console.log(`  SKIP ${def.twist}: vox file not found`);
    continue;
  }

  const vox = readVox(voxPath);
  console.log(`  ${def.twist}: ${vox.voxels.length} voxels`);

  // ボーン方向に沿った分割点を決定
  const twistBP = bone_positions[def.twist];
  const stretchBP = bone_positions[def.stretch];

  let splitAxis, splitValue;
  if (twistBP && stretchBP) {
    // twistのhead-tail中点で分割
    const head = twistBP.head_voxel;
    const tail = twistBP.tail_voxel;
    const mid = [(head[0] + tail[0]) / 2, (head[1] + tail[1]) / 2, (head[2] + tail[2]) / 2];

    // ボーンの主方向軸を決定
    const dx = Math.abs(tail[0] - head[0]);
    const dy = Math.abs(tail[1] - head[1]);
    const dz = Math.abs(tail[2] - head[2]);

    if (dz >= dx && dz >= dy) {
      splitAxis = 'z'; splitValue = mid[2];  // Z軸が主方向
    } else if (dx >= dy) {
      splitAxis = 'x'; splitValue = mid[0];  // X軸が主方向
    } else {
      splitAxis = 'y'; splitValue = mid[1];  // Y軸が主方向
    }
  } else {
    // フォールバック: Z中央値で分割
    const zValues = vox.voxels.map(v => v.z).sort((a, b) => a - b);
    splitAxis = 'z';
    splitValue = zValues[Math.floor(zValues.length / 2)];
  }

  // stretch側がどちらかを判定
  let stretchDir = 1;
  if (stretchBP && twistBP) {
    const stretchHead = stretchBP.head_voxel;
    const twistHead = twistBP.head_voxel;
    const axisIdx = splitAxis === 'x' ? 0 : splitAxis === 'y' ? 1 : 2;
    stretchDir = stretchHead[axisIdx] > twistHead[axisIdx] ? 1 : -1;
  }

  // ボクセルを分割
  const twistVoxels = [];   // stretch側 → twistとして残る
  const twist2Voxels = [];  // 反対側 → twist_2になる

  for (const v of vox.voxels) {
    const val = v[splitAxis];
    const isStretchSide = stretchDir > 0 ? val >= splitValue : val <= splitValue;
    if (isStretchSide) {
      twistVoxels.push(v);
    } else {
      twist2Voxels.push(v);
    }
  }

  console.log(`    Split at ${splitAxis}=${Math.round(splitValue)}: twist=${twistVoxels.length}, twist_2=${twist2Voxels.length}`);

  // 更新されたtwistを書き出し
  writeVox(voxPath, sx, sy, sz, twistVoxels, vox.palette);
  segments[def.twist].voxels = twistVoxels.length;

  // 新しいtwist_2を書き出し
  const twist2SafeName = def.twist2.replace(/\./g, '_').toLowerCase();
  const twist2File = `segments/${twist2SafeName}.vox`;
  writeVox(path.join(MODEL_DIR, twist2File), sx, sy, sz, twist2Voxels, vox.palette);
  segments[def.twist2] = { file: twist2File, voxels: twist2Voxels.length };
}

// 胸のリネームを処理
for (const def of BREAST_RENAME) {
  if (!segments[def.from]) continue;
  if (segments[def.to]) {
    console.log(`  SKIP rename ${def.from}: ${def.to} already exists`);
    continue;
  }

  console.log(`  Rename: ${def.from} → ${def.to}`);

  // segments内でリネーム
  segments[def.to] = segments[def.from];
  delete segments[def.from];

  // VOXファイルもリネーム
  const oldFile = path.join(MODEL_DIR, segments[def.to].file);
  const newSafeName = def.to.replace(/\./g, '_').toLowerCase();
  const newFile = `segments/${newSafeName}.vox`;
  if (fs.existsSync(oldFile)) {
    fs.renameSync(oldFile, path.join(MODEL_DIR, newFile));
  }
  segments[def.to].file = newFile;
}

// segments.jsonを更新
fs.writeFileSync(path.join(MODEL_DIR, 'segments.json'), JSON.stringify(segmentsJson, null, 2));

// parts.jsonを更新
const parts = JSON.parse(fs.readFileSync(path.join(MODEL_DIR, 'parts.json'), 'utf8'));
const folderName = path.basename(MODEL_DIR);

// リネームされたパーツを更新
for (const def of BREAST_RENAME) {
  const idx = parts.findIndex(p => p.key === def.from);
  if (idx >= 0) {
    parts[idx].key = def.to;
    parts[idx].meshes = [def.to];
    const newSafeName = def.to.replace(/\./g, '_').toLowerCase();
    parts[idx].file = `/${folderName}/segments/${newSafeName}.vox`;
  }
}

// 新しいtwist_2パーツを追加
for (const def of SPLIT_DEFS) {
  if (!segments[def.twist2]) continue;
  if (parts.find(p => p.key === def.twist2)) continue;

  // 既存twistパーツのボクセル数を更新
  const twistPart = parts.find(p => p.key === def.twist);
  if (twistPart) twistPart.voxels = segments[def.twist].voxels;

  // twist_2パーツを追加
  const twist2SafeName = def.twist2.replace(/\./g, '_').toLowerCase();
  parts.push({
    key: def.twist2,
    file: `/${folderName}/segments/${twist2SafeName}.vox`,
    voxels: segments[def.twist2].voxels,
    default_on: true,
    meshes: [def.twist2],
    is_body: true,
    category: 'body_segment',
  });
}

// parts.jsonを保存
fs.writeFileSync(path.join(MODEL_DIR, 'parts.json'), JSON.stringify(parts, null, 2));

// 結果サマリー
console.log('\n=== Done ===');
console.log(`  Segments: ${Object.keys(segments).length}`);
