/**
 * remap_bundle_skin_colors.js
 *
 * segments_bundle.jsonのパレットカラーを、スキンカラー付きbody.voxの色に
 * ワールド空間の空間マッピングを使ってリマップするスクリプト。
 *
 * Usage: node scripts/remap_bundle_skin_colors.js <base_model_dir> <skin_body_vox> <skin_grid_json>
 *
 * 例:
 *   node scripts/remap_bundle_skin_colors.js \
 *     C:/Users/user/developsecond/game-assets/vox/female/CyberpunkElf-Detailed \
 *     C:/Users/user/developsecond/game-assets/vox/female/realistic/body/body.vox \
 *     C:/Users/user/developsecond/game-assets/vox/female/realistic/grid.json
 */

// ファイルシステムモジュール
const fs = require('fs');
// パス操作モジュール
const path = require('path');

// コマンドライン引数からパスを取得
const BASE_DIR = process.argv[2];        // ベースモデルディレクトリ
const SKIN_VOX = process.argv[3];        // スキンカラー付きbody.voxのパス
const SKIN_GRID_JSON = process.argv[4];  // スキンモデルのgrid.jsonパス

// 引数が不足している場合はUsageを表示して終了
if (!BASE_DIR || !SKIN_VOX || !SKIN_GRID_JSON) {
  console.log('Usage: node remap_bundle_skin_colors.js <base_model_dir> <skin_body_vox> <skin_grid_json>');
  process.exit(1);
}

// VOXファイルを読み込んでパースする関数
function readVox(filepath) {
  const buf = fs.readFileSync(filepath);
  let off = 0;
  const r4 = () => { const v = buf.readUInt32LE(off); off += 4; return v; };
  const r1 = () => buf[off++];
  const rs = (n) => { let s = ''; for (let i = 0; i < n; i++) s += String.fromCharCode(buf[off + i]); off += n; return s; };
  // VOXヘッダーとバージョンをスキップ
  rs(4); r4();
  // MAINチャンクヘッダーを読み取り
  rs(4); const mc = r4(); const mcc = r4(); off += mc;
  const end = off + mcc;
  let palette = null;
  const voxels = [];
  // 子チャンクを処理
  while (off < end) {
    const id = rs(4), cs = r4(); r4(); const ce = off + cs;
    // XYZIチャンク: ボクセルデータ
    if (id === 'XYZI') {
      const n = r4();
      for (let i = 0; i < n; i++) voxels.push({ x: r1(), y: r1(), z: r1(), c: r1() });
    }
    // RGBAチャンク: パレット（0-1正規化）
    if (id === 'RGBA') {
      palette = [];
      for (let i = 0; i < 256; i++) { palette.push([r1() / 255, r1() / 255, r1() / 255]); r1(); }
    }
    off = ce;
  }
  // パレットがなければデフォルトグレー
  if (!palette) palette = Array.from({ length: 256 }, () => [0.8, 0.8, 0.8]);
  return { voxels, palette };
}

// グリッド情報を読み込み
const baseGrid = JSON.parse(fs.readFileSync(path.join(BASE_DIR, 'grid.json'), 'utf8'));  // ベースモデルのグリッド
const skinGrid = JSON.parse(fs.readFileSync(SKIN_GRID_JSON, 'utf8'));                      // スキンモデルのグリッド

// スキンボディのVOXを読み込み
console.log('Loading skin body vox...');
const skinVox = readVox(SKIN_VOX);
console.log(`  Skin voxels: ${skinVox.voxels.length}`);

// ワールド空間カラールックアップテーブルを構築（バケティングで高速化）
const BUCKET = 0.004; // 4mmバケット（空間解像度）
const skinColorMap = new Map();  // "wx,wy,wz" → [r,g,b]
for (const v of skinVox.voxels) {
  // ボクセル座標をワールド座標に変換してバケットインデックスに丸める
  const wx = Math.round((skinGrid.grid_origin[0] + v.x * skinGrid.voxel_size) / BUCKET);
  const wy = Math.round((skinGrid.grid_origin[1] + v.y * skinGrid.voxel_size) / BUCKET);
  const wz = Math.round((skinGrid.grid_origin[2] + v.z * skinGrid.voxel_size) / BUCKET);
  // パレットインデックスは1始まりなので-1
  skinColorMap.set(`${wx},${wy},${wz}`, skinVox.palette[v.c - 1] || [0.8, 0.8, 0.8]);
}
console.log(`  Skin color buckets: ${skinColorMap.size}`);

// 既存のバンドルを読み込み
const bundlePath = path.join(BASE_DIR, 'segments_bundle.json');
const bundle = JSON.parse(fs.readFileSync(bundlePath, 'utf8'));
console.log(`\nOriginal bundle: ${Object.keys(bundle.segments).length} segments, ${bundle.palette.length} palette colors`);

// 新しい統一パレットを構築
const newPalette = [];
const paletteMap = new Map(); // "r,g,b" → 新パレットインデックス

// 色のパレットインデックスを取得（新色なら追加）
function getColorIndex(rgb) {
  const key = `${rgb[0].toFixed(4)},${rgb[1].toFixed(4)},${rgb[2].toFixed(4)}`;
  if (paletteMap.has(key)) return paletteMap.get(key);
  const idx = newPalette.length;
  paletteMap.set(key, idx);
  newPalette.push(rgb);
  return idx;
}

// ベースモデルのボクセル座標に対応するスキン色をワールド空間で検索する関数
function findSkinColor(vx, vy, vz) {
  // ベースモデルのボクセル座標をワールド座標に変換してバケットインデックスに丸める
  const wx = Math.round((baseGrid.grid_origin[0] + vx * baseGrid.voxel_size) / BUCKET);
  const wy = Math.round((baseGrid.grid_origin[1] + vy * baseGrid.voxel_size) / BUCKET);
  const wz = Math.round((baseGrid.grid_origin[2] + vz * baseGrid.voxel_size) / BUCKET);
  // まず完全一致を試行
  const exact = skinColorMap.get(`${wx},${wy},${wz}`);
  if (exact) return exact;
  // 見つからなければ半径2の近傍探索
  let bestColor = null;
  let bestDist = Infinity;
  for (let dx = -2; dx <= 2; dx++) {
    for (let dy = -2; dy <= 2; dy++) {
      for (let dz = -2; dz <= 2; dz++) {
        const c = skinColorMap.get(`${wx + dx},${wy + dy},${wz + dz}`);
        if (c) {
          // ユークリッド距離の二乗で最近傍を選択
          const d = dx * dx + dy * dy + dz * dz;
          if (d < bestDist) { bestDist = d; bestColor = c; }
        }
      }
    }
  }
  return bestColor;
}

// 各セグメントのボクセルをスキン色にリマップ
let totalVoxels = 0, remappedVoxels = 0;

for (const [boneName, flat] of Object.entries(bundle.segments)) {
  const numVoxels = flat.length / 4;
  const newFlat = new Array(flat.length);

  for (let i = 0; i < numVoxels; i++) {
    // 元のボクセルデータを取得
    const vx = flat[i * 4], vy = flat[i * 4 + 1], vz = flat[i * 4 + 2], ci = flat[i * 4 + 3];
    // 元のパレット色を取得
    const origColor = bundle.palette[ci] || [0.8, 0.8, 0.8];

    totalVoxels++;
    // ワールド空間でスキン色を検索
    const skinColor = findSkinColor(vx, vy, vz);
    // スキン色が見つかればそれを使用、なければ元の色を維持
    const finalColor = skinColor || origColor;
    if (skinColor) remappedVoxels++;

    // 新しいフラット配列にデータを格納
    newFlat[i * 4] = vx;
    newFlat[i * 4 + 1] = vy;
    newFlat[i * 4 + 2] = vz;
    newFlat[i * 4 + 3] = getColorIndex(finalColor);
  }

  // セグメントデータを更新
  bundle.segments[boneName] = newFlat;
}

// パレットを更新
bundle.palette = newPalette;

// 出力（元ファイルをバックアップしてから上書き）
const outPath = path.join(BASE_DIR, 'segments_bundle.json');
const backupPath = path.join(BASE_DIR, 'segments_bundle.backup.json');
// バックアップが存在しなければ作成
if (!fs.existsSync(backupPath)) {
  fs.copyFileSync(outPath, backupPath);
  console.log(`\nBackup saved: ${backupPath}`);
}

// JSONファイルとして書き出し
fs.writeFileSync(outPath, JSON.stringify(bundle));
const fileSizeMB = (fs.statSync(outPath).size / (1024 * 1024)).toFixed(2);

// 結果サマリーを表示
console.log(`\n=== Done ===`);
console.log(`  Remapped: ${remappedVoxels}/${totalVoxels} (${(remappedVoxels / totalVoxels * 100).toFixed(1)}%)`);
console.log(`  New palette: ${newPalette.length} colors`);
console.log(`  File size: ${fileSizeMB} MB`);
console.log(`  Output: ${outPath}`);
