/**
 * trim_cap_back.js
 *
 * キャップ背面の下部4行（低いZ値）を削除するスクリプト。
 * 背面 = Y値が大きい領域。
 *
 * Usage: node scripts/trim_cap_back.js
 */
// ファイルシステムモジュール
const fs = require('fs');

// キャップVOXファイルのパス
const CAP_PATH = 'public/box2/knit_cap.vox';

// VOXファイルをパースする関数
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
      const id = rStr(4), cs = r32(), ccs = r32(), ce = off + cs;
      // SIZEチャンク: グリッドサイズ
      if (id === 'SIZE') { sx = r32(); sy = r32(); sz = r32(); }
      // XYZIチャンク: ボクセルデータ
      else if (id === 'XYZI') { const n = r32(); for (let i = 0; i < n; i++) voxels.push({ x: r8(), y: r8(), z: r8(), ci: r8() }); }
      // RGBAチャンク: カラーパレット
      else if (id === 'RGBA') { palette = []; for (let i = 0; i < 256; i++) { palette.push({ r: r8(), g: r8(), b: r8() }); r8(); } }
      off = ce; if (ccs > 0) readChunks(off + ccs);
    }
  }
  // MAINチャンクを処理
  rStr(4); const mc = r32(), mcc = r32(); off += mc; readChunks(off + mcc);
  return { sx, sy, sz, voxels, palette };
}

// ボクセルデータをVOXファイルとして書き出す関数
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
  sizeBuf.writeUInt32LE(sizeX, 0); sizeBuf.writeUInt32LE(sizeY, 4); sizeBuf.writeUInt32LE(sizeZ, 8);
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
  // RGBAチャンクデータ
  const rgbaBuf = Buffer.alloc(256 * 4);
  for (let i = 0; i < 256; i++) {
    const c = palette[i] || { r: 0, g: 0, b: 0 };
    rgbaBuf.writeUInt8(c.r, i * 4); rgbaBuf.writeUInt8(c.g, i * 4 + 1);
    rgbaBuf.writeUInt8(c.b, i * 4 + 2); rgbaBuf.writeUInt8(255, i * 4 + 3);
  }
  // 全チャンクを結合
  const mainContent = Buffer.concat([makeChunk('SIZE', sizeBuf), makeChunk('XYZI', xyziBuf), makeChunk('RGBA', rgbaBuf)]);
  // VOXファイルヘッダー
  const header = Buffer.alloc(8); header.write('VOX ', 0); header.writeUInt32LE(150, 4);
  // MAINチャンクヘッダー
  const mainHeader = Buffer.alloc(12); mainHeader.write('MAIN', 0); mainHeader.writeUInt32LE(0, 4); mainHeader.writeUInt32LE(mainContent.length, 8);
  // ファイルに書き出し
  fs.writeFileSync(filepath, Buffer.concat([header, mainHeader, mainContent]));
  console.log(`Written: ${filepath} (${voxels.length} voxels)`);
}

// ── メイン処理 ──
// キャップVOXファイルを読み込み
const cap = parseVox(fs.readFileSync(CAP_PATH));
console.log(`Cap: ${cap.voxels.length} voxels`);

// 背面領域の分析: 頭部中心Y座標
const HEAD_CY = 27;
// Z範囲の初期値
let minZ = 999, maxZ = 0;
// 背面ボクセル（Y > HEAD_CY）をフィルタ
const backVoxels = cap.voxels.filter(v => v.y > HEAD_CY);
// 背面ボクセルのZ範囲を求める
for (const v of backVoxels) {
  if (v.z < minZ) minZ = v.z;
  if (v.z > maxZ) maxZ = v.z;
}
console.log(`Back voxels: ${backVoxels.length}, Z range: ${minZ}-${maxZ}`);
// 下部4行分のカットオフZ値を設定
console.log(`Removing Z < ${minZ + 4} on back (Y > ${HEAD_CY})`);

// カットオフ以下の背面ボクセルを除去
const cutoffZ = minZ + 4;
const filtered = cap.voxels.filter(v => {
  // 背面かつZ < カットオフなら除去
  if (v.y > HEAD_CY && v.z < cutoffZ) return false;
  return true;
});

// 結果を表示して書き出し
console.log(`Removed: ${cap.voxels.length - filtered.length} voxels`);
writeVox(CAP_PATH, cap.sx, cap.sy, cap.sz, filtered, cap.palette);
console.log('Done!');
