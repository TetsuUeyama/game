/**
 * merge_body_cap.js
 *
 * ボディとキャップを1つの.voxファイルに統合してMagicaVoxelで編集可能にするスクリプト。
 * ボディは元のパレットカラー（インデックス1..N）を維持。
 * キャップボクセルはパレットインデックス255（明るい赤）を使用して選択・編集しやすくする。
 *
 * Usage: node scripts/merge_body_cap.js
 */
// ファイルシステムモジュール
const fs = require('fs');

// ボディVOXファイルのパス（高解像度・左右対称版）
const BODY_PATH = 'public/box2/cyberpunk_elf_body_base_hires_sym.vox';
// キャップVOXファイルのパス
const CAP_PATH  = 'public/box2/knit_cap.vox';
// 統合結果の出力パス
const OUT_PATH  = 'public/box2/body_with_cap.vox';

// ── VOXファイルパーサー ───────────────────────────────────────────────
function parseVox(buffer) {
  // Node.jsのBufferからDataViewを作成
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  let off = 0;
  // 読み取りヘルパー関数群
  const r32 = () => { const v = view.getUint32(off, true); off += 4; return v; };
  const r8 = () => view.getUint8(off++);
  const rStr = n => { let s = ''; for (let i = 0; i < n; i++) s += String.fromCharCode(view.getUint8(off + i)); off += n; return s; };

  // マジックナンバーとバージョンをスキップ
  rStr(4); r32();
  // モデルサイズの初期化
  let sx = 0, sy = 0, sz = 0;
  const voxels = [];
  let palette = null;

  // チャンクを再帰的に読み取る関数
  function readChunks(end) {
    while (off < end) {
      // チャンクヘッダー: ID、コンテンツサイズ、子チャンクサイズ
      const id = rStr(4), cs = r32(), ccs = r32(), ce = off + cs;
      // SIZEチャンク: グリッドサイズ
      if (id === 'SIZE') { sx = r32(); sy = r32(); sz = r32(); }
      // XYZIチャンク: ボクセルデータ
      else if (id === 'XYZI') { const n = r32(); for (let i = 0; i < n; i++) voxels.push({ x: r8(), y: r8(), z: r8(), ci: r8() }); }
      // RGBAチャンク: カラーパレット
      else if (id === 'RGBA') { palette = []; for (let i = 0; i < 256; i++) { palette.push({ r: r8(), g: r8(), b: r8() }); r8(); } }
      // 次のチャンクへ移動、子チャンクがあれば再帰
      off = ce; if (ccs > 0) readChunks(off + ccs);
    }
  }
  // MAINチャンクを処理
  rStr(4); const mc = r32(), mcc = r32(); off += mc; readChunks(off + mcc);
  return { sx, sy, sz, voxels, palette };
}

// ── VOXファイルライター ──────────────────────────────────────────────
function writeVox(filepath, sizeX, sizeY, sizeZ, voxels, palette) {
  // チャンクを構築するヘルパー関数
  function makeChunk(id, data) {
    const header = Buffer.alloc(12);
    header.write(id, 0);
    header.writeUInt32LE(data.length, 4);
    header.writeUInt32LE(0, 8);
    return Buffer.concat([header, data]);
  }

  // SIZEチャンクデータ
  const sizeBuf = Buffer.alloc(12);
  sizeBuf.writeUInt32LE(sizeX, 0);
  sizeBuf.writeUInt32LE(sizeY, 4);
  sizeBuf.writeUInt32LE(sizeZ, 8);

  // XYZIチャンクデータ
  const xyziBuf = Buffer.alloc(4 + voxels.length * 4);
  xyziBuf.writeUInt32LE(voxels.length, 0);
  for (let i = 0; i < voxels.length; i++) {
    const v = voxels[i];
    xyziBuf.writeUInt8(v.x, 4 + i * 4);
    xyziBuf.writeUInt8(v.y, 4 + i * 4 + 1);
    xyziBuf.writeUInt8(v.z, 4 + i * 4 + 2);
    xyziBuf.writeUInt8(v.ci, 4 + i * 4 + 3);
  }

  // RGBAチャンクデータ（パレット256色×4バイト）
  const rgbaBuf = Buffer.alloc(256 * 4);
  for (let i = 0; i < 256; i++) {
    const c = palette[i] || { r: 0, g: 0, b: 0 };
    rgbaBuf.writeUInt8(c.r, i * 4);
    rgbaBuf.writeUInt8(c.g, i * 4 + 1);
    rgbaBuf.writeUInt8(c.b, i * 4 + 2);
    rgbaBuf.writeUInt8(255, i * 4 + 3);  // アルファは常に255
  }

  // 全子チャンクを結合
  const mainContent = Buffer.concat([
    makeChunk('SIZE', sizeBuf),
    makeChunk('XYZI', xyziBuf),
    makeChunk('RGBA', rgbaBuf),
  ]);

  // VOXファイルヘッダー（マジックナンバー + バージョン）
  const header = Buffer.alloc(8);
  header.write('VOX ', 0);
  header.writeUInt32LE(150, 4);

  // MAINチャンクヘッダー
  const mainHeader = Buffer.alloc(12);
  mainHeader.write('MAIN', 0);
  mainHeader.writeUInt32LE(0, 4);
  mainHeader.writeUInt32LE(mainContent.length, 8);

  // ファイルに書き出し
  fs.writeFileSync(filepath, Buffer.concat([header, mainHeader, mainContent]));
  console.log(`Written: ${filepath} (${voxels.length} voxels, ${sizeX}x${sizeY}x${sizeZ})`);
}

// ── メイン処理 ──────────────────────────────────────────────────────
// ボディVOXを読み込み
console.log('Loading body:', BODY_PATH);
const body = parseVox(fs.readFileSync(BODY_PATH));
console.log(`Body: ${body.sx}x${body.sy}x${body.sz}, ${body.voxels.length} voxels`);

// キャップVOXを読み込み
console.log('Loading cap:', CAP_PATH);
const cap = parseVox(fs.readFileSync(CAP_PATH));
console.log(`Cap: ${cap.voxels.length} voxels`);

// 統合パレットを構築: ボディパレット + キャップ用カラーをインデックス254, 255に設定
const palette = [];
for (let i = 0; i < 256; i++) {
  // ボディのパレットをベースにコピー
  palette.push(body.palette ? body.palette[i] : { r: 0, g: 0, b: 0 });
}
// キャップ本体カラーをパレットインデックス254に設定（明るい赤、見つけやすい色）
palette[253] = { r: 200, g: 50, b: 50 };
// キャップのツバカラーをパレットインデックス255に設定
palette[254] = { r: 150, g: 35, b: 40 };

// ボディボクセルを収集（重複チェック用のセットも構築）
const occupied = new Set();
const merged = [];

for (const v of body.voxels) {
  const key = `${v.x},${v.y},${v.z}`;
  occupied.add(key);  // 座標を占有セットに登録
  merged.push(v);     // 統合リストに追加
}

// キャップボクセルを追加（ボディと重なるものはスキップ）
let capAdded = 0;    // 追加されたキャップボクセル数
let capSkipped = 0;  // スキップされた（重複）ボクセル数
for (const v of cap.voxels) {
  const key = `${v.x},${v.y},${v.z}`;
  // ボディと重なる場合はスキップ
  if (occupied.has(key)) {
    capSkipped++;
    continue;
  }
  // キャップのパレットインデックスをマッピング: ci=1→254（本体）、ci=2→255（ツバ）
  const ci = v.ci === 2 ? 255 : 254;
  merged.push({ x: v.x, y: v.y, z: v.z, ci });
  capAdded++;
}

// 結果サマリーを表示
console.log(`Cap voxels added: ${capAdded}, skipped (overlap): ${capSkipped}`);
console.log(`Total merged: ${merged.length} voxels`);

// 統合結果をVOXファイルとして書き出し
writeVox(OUT_PATH, body.sx, body.sy, body.sz, merged, palette);
console.log('Done! Open in MagicaVoxel:', OUT_PATH);
