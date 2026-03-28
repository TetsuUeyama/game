/**
 * remap_shared_body.js
 *
 * CyberpunkElfのボディをHighPriestessのグリッドに平行移動のみでリマップするスクリプト。
 * ボディサイズは保持（スケーリングなし）し、同じボディを着せ替え用に
 * 複数モデル間で共有可能にする。中心位置のみ合わせる。
 *
 * Usage: node scripts/remap_shared_body.js
 */
// ファイルシステムモジュール
const fs = require('fs');
// パス操作モジュール
const path = require('path');

// VOXファイルを読み込んでパースする関数
function readVox(filePath) {
  const buf = fs.readFileSync(filePath);
  let off = 0;
  const readU32 = () => { const v = buf.readUInt32LE(off); off += 4; return v; };
  const readU8 = () => buf[off++];
  const readStr = (n) => { let s = ''; for (let i = 0; i < n; i++) s += String.fromCharCode(buf[off + i]); off += n; return s; };
  if (readStr(4) !== 'VOX ') throw new Error('Not VOX');
  readU32();
  if (readStr(4) !== 'MAIN') throw new Error('No MAIN');
  const mc = readU32(); const mcc = readU32(); off += mc;
  const end = off + mcc;
  let sx = 0, sy = 0, sz = 0;
  const voxels = []; let palette = null;
  while (off < end) {
    const id = readStr(4); const cs = readU32(); readU32(); const ce = off + cs;
    if (id === 'SIZE') { sx = readU32(); sy = readU32(); sz = readU32(); }
    else if (id === 'XYZI') { const n = readU32(); for (let i = 0; i < n; i++) voxels.push({ x: readU8(), y: readU8(), z: readU8(), c: readU8() }); }
    else if (id === 'RGBA') { palette = []; for (let i = 0; i < 256; i++) palette.push({ r: readU8(), g: readU8(), b: readU8(), a: readU8() }); }
    off = ce;
  }
  return { sx, sy, sz, voxels, palette };
}

// ボクセルデータをVOXファイルとして書き出す関数
function writeVox(filePath, sx, sy, sz, voxels, palette) {
  const sizeData = Buffer.alloc(12);
  sizeData.writeUInt32LE(sx, 0); sizeData.writeUInt32LE(sy, 4); sizeData.writeUInt32LE(sz, 8);
  const xyziData = Buffer.alloc(4 + voxels.length * 4);
  xyziData.writeUInt32LE(voxels.length, 0);
  for (let i = 0; i < voxels.length; i++) {
    const v = voxels[i];
    xyziData[4 + i * 4] = v.x; xyziData[4 + i * 4 + 1] = v.y;
    xyziData[4 + i * 4 + 2] = v.z; xyziData[4 + i * 4 + 3] = v.c;
  }
  const rgbaData = Buffer.alloc(1024);
  if (palette) for (let i = 0; i < 256; i++) {
    rgbaData[i*4] = palette[i].r; rgbaData[i*4+1] = palette[i].g;
    rgbaData[i*4+2] = palette[i].b; rgbaData[i*4+3] = palette[i].a;
  }
  function makeChunk(id, data) {
    const h = Buffer.alloc(12); h.write(id, 0, 4, 'ascii');
    h.writeUInt32LE(data.length, 4); h.writeUInt32LE(0, 8);
    return Buffer.concat([h, data]);
  }
  const children = Buffer.concat([makeChunk('SIZE', sizeData), makeChunk('XYZI', xyziData), makeChunk('RGBA', rgbaData)]);
  const mainH = Buffer.alloc(12); mainH.write('MAIN', 0, 4, 'ascii');
  mainH.writeUInt32LE(0, 4); mainH.writeUInt32LE(children.length, 8);
  const voxH = Buffer.alloc(8); voxH.write('VOX ', 0, 4, 'ascii'); voxH.writeUInt32LE(150, 4);
  fs.writeFileSync(filePath, Buffer.concat([voxH, mainH, children]));
}

// --- メイン処理 ---
const BASE = path.join(__dirname, '..');

// ボディ専用グリッド情報を読み込み（voxelize_body_only.pyで生成）
const ceBodyGrid = JSON.parse(fs.readFileSync(path.join(BASE, 'public/box-compare/ce_body_grid.json'), 'utf8'));  // CEのボディグリッド
const hpBodyGrid = JSON.parse(fs.readFileSync(path.join(BASE, 'public/box-compare/hp_body_grid.json'), 'utf8'));  // HPのボディグリッド

// フルモデルグリッド情報（blender_voxelize.pyでボディ専用BBoxで変形生成）
const ceFullGrid = JSON.parse(fs.readFileSync(path.join(BASE, 'public/box2-new/cyberpunkelf_grid.json'), 'utf8'));
const hpFullGrid = JSON.parse(fs.readFileSync(path.join(BASE, 'public/box3-new/highpriestess_blender_rigged_grid.json'), 'utf8'));

// ボディの変形後中心座標を計算（平行移動量の算出用）
const ceBodyDefCenter = [
  (ceBodyGrid.def_min[0] + ceBodyGrid.def_max[0]) / 2,
  (ceBodyGrid.def_min[1] + ceBodyGrid.def_max[1]) / 2,
  (ceBodyGrid.def_min[2] + ceBodyGrid.def_max[2]) / 2,
];
const hpBodyDefCenter = [
  (hpBodyGrid.def_min[0] + hpBodyGrid.def_max[0]) / 2,
  (hpBodyGrid.def_min[1] + hpBodyGrid.def_max[1]) / 2,
  (hpBodyGrid.def_min[2] + hpBodyGrid.def_max[2]) / 2,
];

// 平行移動オフセット: CEボディ中心 → HPボディ中心（スケーリングなし）
const translation = [
  hpBodyDefCenter[0] - ceBodyDefCenter[0],
  hpBodyDefCenter[1] - ceBodyDefCenter[1],
  hpBodyDefCenter[2] - ceBodyDefCenter[2],
];

// 微調整: 少し前方に移動（変形空間のY正方向）
const Y_FORWARD_OFFSET = 0.03;
translation[1] += Y_FORWARD_OFFSET;

// パラメータを表示
console.log('CE body center:', ceBodyDefCenter.map(v => v.toFixed(4)));
console.log('HP body center:', hpBodyDefCenter.map(v => v.toFixed(4)));
console.log('Translation (world):', translation.map(v => v.toFixed(4)));
console.log(`CE full grid: ${ceFullGrid.gx}x${ceFullGrid.gy}x${ceFullGrid.gz}`);
console.log(`HP full grid: ${hpFullGrid.gx}x${hpFullGrid.gy}x${hpFullGrid.gz}`);

// CEボディをフルモデルボクセル化から読み込み（衣装下のスキンフィルを含む）
const ceBody = readVox(path.join(BASE, 'public/box2-new/cyberpunkelf_body.vox'));
console.log(`\nCE body: ${ceBody.sx}x${ceBody.sy}x${ceBody.sz}, ${ceBody.voxels.length} voxels`);

// HPのスキンカラーパレット用にフルモデルVOXを読み込み
const hpFull = readVox(path.join(BASE, 'public/box3-new/highpriestess_blender_rigged.vox'));
const hpPalette = hpFull.palette;

// 旧HPボディからスキンカラーインデックスを取得
const hpOldBody = readVox(path.join(BASE, 'public/box3/highpriestess_blender_rigged_body.vox'));
// HPボディで最も多く使われている色を特定（スキントーン）
const hpBodyColors = {};
for (const v of hpOldBody.voxels) hpBodyColors[v.c] = (hpBodyColors[v.c] || 0) + 1;
const hpSkinIndices = Object.entries(hpBodyColors).sort((a, b) => b[1] - a[1]).map(([c]) => parseInt(c));
console.log('HP skin color indices (top 5):', hpSkinIndices.slice(0, 5));

// CEパレットインデックス → HPパレットインデックスのマッピングを構築
// 各CE色に対して輝度で最も近いHPスキン色を割り当て
function colorDist(a, b) {
  return Math.abs(a.r - b.r) + Math.abs(a.g - b.g) + Math.abs(a.b - b.b);
}

// HPスキン色を輝度順にソート
const hpSkinColors = hpSkinIndices.slice(0, 20).map(idx => ({
  idx,
  ...hpOldBody.palette[idx - 1],
  lum: hpOldBody.palette[idx - 1].r * 0.299 + hpOldBody.palette[idx - 1].g * 0.587 + hpOldBody.palette[idx - 1].b * 0.114
}));
hpSkinColors.sort((a, b) => a.lum - b.lum);

// CEボディで使用されている色を使用頻度順に取得
const ceUsedColors = {};
for (const v of ceBody.voxels) ceUsedColors[v.c] = (ceUsedColors[v.c] || 0) + 1;
const ceSortedByCount = Object.entries(ceUsedColors).sort((a, b) => b[1] - a[1]).map(([c]) => parseInt(c));

// CE色を輝度順にソート
const ceLumSorted = ceSortedByCount.map(idx => ({
  idx,
  lum: ceBody.palette[idx - 1].r * 0.299 + ceBody.palette[idx - 1].g * 0.587 + ceBody.palette[idx - 1].b * 0.114
}));
ceLumSorted.sort((a, b) => a.lum - b.lum);

// マッピング作成: CE輝度順位 → HP輝度順位
const colorMap = {};
for (let i = 0; i < ceLumSorted.length; i++) {
  const hpIdx = Math.min(i, hpSkinColors.length - 1);
  const ratio = hpSkinColors.length > 1 ? i / (ceLumSorted.length - 1 || 1) : 0;
  const hpI = Math.round(ratio * (hpSkinColors.length - 1));
  colorMap[ceLumSorted[i].idx] = hpSkinColors[hpI].idx;
}

// カラーマッピングの上位5件を表示
console.log('Color mapping (CE→HP, top 5):');
for (const ce of ceSortedByCount.slice(0, 5)) {
  const hp = colorMap[ce];
  const ceC = ceBody.palette[ce - 1];
  const hpC = hpOldBody.palette[hp - 1];
  console.log(`  CE idx${ce} RGB(${ceC.r},${ceC.g},${ceC.b}) → HP idx${hp} RGB(${hpC.r},${hpC.g},${hpC.b})`);
}

// ターゲットグリッドサイズとボクセルサイズ
const TX = hpFullGrid.gx, TY = hpFullGrid.gy, TZ = hpFullGrid.gz;
const ceVs = ceFullGrid.voxel_size;   // CEのボクセルサイズ
const hpVs = hpFullGrid.voxel_size;   // HPのボクセルサイズ

// リマップ処理
const remapped = [];
const seen = new Set();  // 重複防止
let clipped = 0;         // グリッド外のボクセル数

for (const v of ceBody.voxels) {
  // CEボクセル座標 → CE変形ワールド座標
  const wx = ceFullGrid.def_min[0] + (v.x + 0.5) * ceVs;
  const wy = ceFullGrid.def_min[1] + (v.y + 0.5) * ceVs;
  const wz = ceFullGrid.def_min[2] + (v.z + 0.5) * ceVs;

  // HP空間に平行移動（スケーリングなし — ボディサイズ保持）
  const hx = wx + translation[0];
  const hy = wy + translation[1];
  const hz = wz + translation[2];

  // HP変形ワールド座標 → HPボクセル座標
  const vx2 = Math.round((hx - hpFullGrid.def_min[0]) / hpVs - 0.5);
  const vy2 = Math.round((hy - hpFullGrid.def_min[1]) / hpVs - 0.5);
  const vz2 = Math.round((hz - hpFullGrid.def_min[2]) / hpVs - 0.5);

  // グリッド範囲内なら追加
  if (vx2 >= 0 && vx2 < TX && vy2 >= 0 && vy2 < TY && vz2 >= 0 && vz2 < TZ) {
    const key = `${vx2},${vy2},${vz2}`;
    if (!seen.has(key)) {
      seen.add(key);
      // カラーマッピングを適用
      remapped.push({ x: vx2, y: vy2, z: vz2, c: colorMap[v.c] || v.c });
    }
  } else {
    clipped++;
  }
}

// 結果を表示
console.log(`\nRemapped: ${remapped.length} voxels (from ${ceBody.voxels.length}), clipped: ${clipped}`);

// リマップ結果をVOXファイルとして書き出し
const dstPath = path.join(BASE, 'public/box3-new/highpriestess_blender_rigged_body.vox');
writeVox(dstPath, TX, TY, TZ, remapped, hpOldBody.palette);
console.log(`Written: ${dstPath}`);

// パーツマニフェストのボクセル数を更新
const manifestPath = path.join(BASE, 'public/box3-new/highpriestess_blender_rigged_parts.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const bodyEntry = manifest.find(p => p.key === 'body');
if (bodyEntry) bodyEntry.voxels = remapped.length;
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
console.log('Updated manifest.');
console.log('\nDone!');
