/**
 * bundle_segments.js
 *
 * 全セグメント.voxファイルを1つのJSONにバンドルして高速読み込みを実現するスクリプト。
 *
 * 出力: segments_bundle.json（全ボクセルをボーンごとにグループ化、
 * パレットカラーは0-1範囲に正規化済み）
 *
 * Usage: node scripts/bundle_segments.js <model_dir>
 */

// ファイルシステムモジュール
const fs = require('fs');
// パス操作モジュール
const path = require('path');

// コマンドライン引数からモデルディレクトリを取得
const MODEL_DIR = process.argv[2];
// 未指定の場合はUsageを表示して終了
if (!MODEL_DIR) {
  console.log('Usage: node bundle_segments.js <model_dir>');
  process.exit(1);
}

// VOXファイルを読み込んでパースする関数
function readVox(filepath) {
  // ファイルをバイナリとして読み込み
  const buf = fs.readFileSync(filepath);
  // Node.jsのBufferからDataViewを作成
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let offset = 0;
  // 4バイト符号なし整数を読み取り
  const readU32 = () => { const v = view.getUint32(offset, true); offset += 4; return v; };
  // 1バイト符号なし整数を読み取り
  const readU8 = () => view.getUint8(offset++);
  // nバイトのASCII文字列を読み取り
  const readStr = (n) => { let s = ''; for (let i = 0; i < n; i++) s += String.fromCharCode(view.getUint8(offset + i)); offset += n; return s; };
  // マジックナンバー確認
  if (readStr(4) !== 'VOX ') throw new Error('Not VOX');
  // バージョンをスキップ
  readU32();
  // モデルサイズの初期化
  let sizeX = 0, sizeY = 0, sizeZ = 0;
  // ボクセルとパレットの配列
  const voxels = [];
  let palette = null;
  // チャンクを再帰的に読み取る関数
  const readChunks = (end) => {
    while (offset < end) {
      // チャンクヘッダー: ID、コンテンツサイズ、子チャンクサイズ
      const id = readStr(4), cs = readU32(), ccs = readU32(), ce = offset + cs;
      // SIZEチャンク: グリッドサイズを取得
      if (id === 'SIZE') { sizeX = readU32(); sizeY = readU32(); sizeZ = readU32(); }
      // XYZIチャンク: ボクセル座標とカラーインデックスを取得
      else if (id === 'XYZI') { const n = readU32(); for (let i = 0; i < n; i++) voxels.push({ x: readU8(), y: readU8(), z: readU8(), c: readU8() }); }
      // RGBAチャンク: パレットを0-1正規化して取得
      else if (id === 'RGBA') { palette = []; for (let i = 0; i < 256; i++) { palette.push([readU8() / 255, readU8() / 255, readU8() / 255]); readU8(); } }
      // コンテンツ終端に移動し、子チャンクがあれば再帰処理
      offset = ce; if (ccs > 0) readChunks(offset + ccs);
    }
  };
  // MAINチャンクの確認
  if (readStr(4) !== 'MAIN') throw new Error('No MAIN');
  // MAINチャンクのサイズを読み取り
  const mc = readU32(), mcc = readU32();
  offset += mc;
  // 全子チャンクを読み取り
  readChunks(offset + mcc);
  // パレットがなければデフォルトのグレーパレットを生成
  if (!palette) { palette = []; for (let i = 0; i < 256; i++) palette.push([0.8, 0.8, 0.8]); }
  return { sizeX, sizeY, sizeZ, voxels, palette };
}

// segments.jsonからセグメント情報を読み込み
const segmentsJson = JSON.parse(fs.readFileSync(path.join(MODEL_DIR, 'segments.json'), 'utf8'));
// セグメント定義とグリッド情報を取得
const { segments, grid } = segmentsJson;

console.log('Bundling segments...');

// 全セグメントのパレットを統一するための配列とマップ
const unifiedPalette = [];           // 統一パレット配列
const paletteMap = new Map();         // "r,g,b"文字列→統一パレットインデックス

// 統一パレットのカラーインデックスを取得する関数（新色なら追加）
function getUnifiedColorIndex(r, g, b) {
  // 色をキー文字列に変換
  const key = `${r.toFixed(4)},${g.toFixed(4)},${b.toFixed(4)}`;
  // 既に登録済みならそのインデックスを返す
  if (paletteMap.has(key)) return paletteMap.get(key);
  // 新しいインデックスを割り当てて登録
  const idx = unifiedPalette.length;
  paletteMap.set(key, idx);
  unifiedPalette.push([r, g, b]);
  return idx;
}

// バンドルされたセグメントデータ（ボーン名→フラット配列）
const bundleSegments = {};
// 総ボクセル数のカウンター
let totalVoxels = 0;

// 各セグメント（ボーン）を処理
for (const [boneName, segInfo] of Object.entries(segments)) {
  // VOXファイルのパスを構築
  const voxPath = path.join(MODEL_DIR, segInfo.file);
  // ファイルが存在しなければスキップ
  if (!fs.existsSync(voxPath)) {
    console.log(`  SKIP ${boneName}: file not found`);
    continue;
  }

  // VOXファイルを読み込み
  const vox = readVox(voxPath);
  // コンパクト形式のフラット配列 [x,y,z,ci, x,y,z,ci, ...] を作成
  const flat = new Array(vox.voxels.length * 4);
  for (let i = 0; i < vox.voxels.length; i++) {
    const v = vox.voxels[i];
    // パレットから色を取得（カラーインデックスは1始まりなので-1）
    const pal = vox.palette[v.c - 1] || [0.8, 0.8, 0.8];
    // 座標を格納
    flat[i * 4] = v.x;
    flat[i * 4 + 1] = v.y;
    flat[i * 4 + 2] = v.z;
    // 統一パレットのインデックスを格納
    flat[i * 4 + 3] = getUnifiedColorIndex(pal[0], pal[1], pal[2]);
  }

  // ボーン名でフラット配列を登録
  bundleSegments[boneName] = flat;
  // 総ボクセル数を加算
  totalVoxels += vox.voxels.length;
}

// バンドルデータオブジェクトを構築
const bundle = {
  grid: { gx: grid.gx, gy: grid.gy, gz: grid.gz },  // グリッドサイズ
  palette: unifiedPalette,                              // 統一カラーパレット
  segments: bundleSegments,                              // ボーンごとのボクセルデータ
};

// JSONファイルとして出力
const outPath = path.join(MODEL_DIR, 'segments_bundle.json');
fs.writeFileSync(outPath, JSON.stringify(bundle));

// 結果サマリーを表示
const fileSizeMB = (fs.statSync(outPath).size / (1024 * 1024)).toFixed(2);
console.log(`\n=== Done ===`);
console.log(`  Segments: ${Object.keys(bundleSegments).length}`);    // セグメント数
console.log(`  Total voxels: ${totalVoxels}`);                        // 総ボクセル数
console.log(`  Palette colors: ${unifiedPalette.length}`);            // パレット色数
console.log(`  File size: ${fileSizeMB} MB`);                         // ファイルサイズ
console.log(`  Output: ${outPath}`);                                   // 出力パス
