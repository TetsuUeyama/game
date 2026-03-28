/**
 * process_hair_cap.js
 *
 * ボクセル化された髪をニット帽を起点として後処理するスクリプト。
 *
 * ロジック:
 * 1. ボディ、キャップ、生の髪ボクセルを読み込み（全て同じ高解像度グリッド上）
 * 2. ボディと重複する髪ボクセルを除去
 * 3. ボディ内部（キャップ領域の下）の髪ボクセルを除去
 * 4. キャップ表面に接続された、または外側に伸びる髪を保持
 * 5. 処理済み髪 + 統合プレビューファイルを出力
 *
 * Usage: node scripts/process_hair_cap.js
 */
// ファイルシステムモジュール
const fs = require('fs');

// 入出力ファイルパス
const BODY_PATH = 'public/box2/cyberpunk_elf_body_base_hires_sym.vox';   // ボディVOX
const CAP_PATH  = 'public/box2/knit_cap.vox';                             // キャップVOX
const HAIR_PATH = 'public/box2/cyberpunk_elf_hair_hires.vox';             // 生の髪VOX
const OUT_HAIR  = 'public/box2/cyberpunk_elf_hair_hires_processed.vox';   // 処理済み髪出力
const OUT_MERGED = 'public/box2/body_cap_hair.vox';                       // 統合プレビュー出力

// ── VOXパーサー/ライター ─────────────────────────────────────────────
function parseVox(buffer) {
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  let off = 0;
  const r32 = () => { const v = view.getUint32(off, true); off += 4; return v; };
  const r8 = () => view.getUint8(off++);
  const rStr = n => { let s = ''; for (let i = 0; i < n; i++) s += String.fromCharCode(view.getUint8(off + i)); off += n; return s; };
  rStr(4); r32();
  let sx = 0, sy = 0, sz = 0;
  const voxels = [];
  let palette = null;
  function readChunks(end) {
    while (off < end) {
      const id = rStr(4), cs = r32(), ccs = r32(), ce = off + cs;
      if (id === 'SIZE') { sx = r32(); sy = r32(); sz = r32(); }
      else if (id === 'XYZI') { const n = r32(); for (let i = 0; i < n; i++) voxels.push({ x: r8(), y: r8(), z: r8(), ci: r8() }); }
      else if (id === 'RGBA') { palette = []; for (let i = 0; i < 256; i++) { palette.push({ r: r8(), g: r8(), b: r8() }); r8(); } }
      off = ce; if (ccs > 0) readChunks(off + ccs);
    }
  }
  rStr(4); const mc = r32(), mcc = r32(); off += mc; readChunks(off + mcc);
  return { sx, sy, sz, voxels, palette };
}

function writeVox(filepath, sizeX, sizeY, sizeZ, voxels, palette) {
  function makeChunk(id, data) {
    const header = Buffer.alloc(12);
    header.write(id, 0);
    header.writeUInt32LE(data.length, 4);
    header.writeUInt32LE(0, 8);
    return Buffer.concat([header, data]);
  }
  const sizeBuf = Buffer.alloc(12);
  sizeBuf.writeUInt32LE(sizeX, 0); sizeBuf.writeUInt32LE(sizeY, 4); sizeBuf.writeUInt32LE(sizeZ, 8);
  const xyziBuf = Buffer.alloc(4 + voxels.length * 4);
  xyziBuf.writeUInt32LE(voxels.length, 0);
  for (let i = 0; i < voxels.length; i++) {
    const v = voxels[i];
    xyziBuf.writeUInt8(v.x, 4 + i * 4);
    xyziBuf.writeUInt8(v.y, 4 + i * 4 + 1);
    xyziBuf.writeUInt8(v.z, 4 + i * 4 + 2);
    xyziBuf.writeUInt8(v.ci, 4 + i * 4 + 3);
  }
  const rgbaBuf = Buffer.alloc(256 * 4);
  for (let i = 0; i < 256; i++) {
    const c = palette[i] || { r: 0, g: 0, b: 0 };
    rgbaBuf.writeUInt8(c.r, i * 4); rgbaBuf.writeUInt8(c.g, i * 4 + 1);
    rgbaBuf.writeUInt8(c.b, i * 4 + 2); rgbaBuf.writeUInt8(255, i * 4 + 3);
  }
  const mainContent = Buffer.concat([makeChunk('SIZE', sizeBuf), makeChunk('XYZI', xyziBuf), makeChunk('RGBA', rgbaBuf)]);
  const header = Buffer.alloc(8); header.write('VOX ', 0); header.writeUInt32LE(150, 4);
  const mainHeader = Buffer.alloc(12); mainHeader.write('MAIN', 0); mainHeader.writeUInt32LE(0, 4); mainHeader.writeUInt32LE(mainContent.length, 8);
  fs.writeFileSync(filepath, Buffer.concat([header, mainHeader, mainContent]));
  console.log(`Written: ${filepath} (${voxels.length} voxels)`);
}

// ── メイン処理 ──────────────────────────────────────────────────────
console.log('Loading files...');
// 3つのVOXファイルを読み込み
const body = parseVox(fs.readFileSync(BODY_PATH));
const cap = parseVox(fs.readFileSync(CAP_PATH));
const hair = parseVox(fs.readFileSync(HAIR_PATH));
console.log(`Body: ${body.voxels.length}, Cap: ${cap.voxels.length}, Hair: ${hair.voxels.length}`);

// 占有セットを構築
const bodySet = new Set();  // ボディボクセルの座標セット
for (const v of body.voxels) bodySet.add(`${v.x},${v.y},${v.z}`);

const capSet = new Set();   // キャップボクセルの座標セット
for (const v of cap.voxels) capSet.add(`${v.x},${v.y},${v.z}`);

// キャップ表面: 少なくとも1つの空き隣接（ボディでもキャップでもない）を持つキャップボクセル
const DIRS = [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]];
const capSurface = new Set();
for (const v of cap.voxels) {
  for (const [dx, dy, dz] of DIRS) {
    const key = `${v.x+dx},${v.y+dy},${v.z+dz}`;
    if (!bodySet.has(key) && !capSet.has(key)) {
      capSurface.add(`${v.x},${v.y},${v.z}`);
      break;
    }
  }
}
console.log(`Cap surface voxels: ${capSurface.size}`);

// ステップ1: ボディまたはキャップと重複する髪を除去
let removed_overlap = 0;
const hairFiltered = [];
for (const v of hair.voxels) {
  const key = `${v.x},${v.y},${v.z}`;
  if (bodySet.has(key) || capSet.has(key)) {
    removed_overlap++;
    continue;
  }
  hairFiltered.push(v);
}
console.log(`Removed overlap with body/cap: ${removed_overlap}`);
console.log(`Hair after overlap removal: ${hairFiltered.length}`);

// ステップ2: キャップ表面からフラッドフィルして接続された髪を検出
// キャップ表面に隣接する髪ボクセル → シード
// シードから接続された髪ボクセルを辿って拡張
const hairSet = new Set();    // 髪ボクセルの座標セット
const hairMap = new Map();    // 座標 → ボクセルデータ
for (const v of hairFiltered) {
  const key = `${v.x},${v.y},${v.z}`;
  hairSet.add(key);
  hairMap.set(key, v);
}

// キャップ表面に隣接する髪ボクセルをシードとして検出
const seeds = new Set();
for (const v of cap.voxels) {
  if (!capSurface.has(`${v.x},${v.y},${v.z}`)) continue;
  for (const [dx, dy, dz] of DIRS) {
    const nk = `${v.x+dx},${v.y+dy},${v.z+dz}`;
    if (hairSet.has(nk)) {
      seeds.add(nk);
    }
  }
}
console.log(`Hair seeds (adjacent to cap): ${seeds.size}`);

// シードから髪ボクセルをフラッドフィル
const connected = new Set(seeds);
const queue = [...seeds];
while (queue.length > 0) {
  const key = queue.pop();
  const [x, y, z] = key.split(',').map(Number);
  for (const [dx, dy, dz] of DIRS) {
    const nk = `${x+dx},${y+dy},${z+dz}`;
    if (hairSet.has(nk) && !connected.has(nk)) {
      connected.add(nk);
      queue.push(nk);
    }
  }
}
console.log(`Connected hair voxels (from cap): ${connected.size}`);
console.log(`Disconnected hair removed: ${hairFiltered.length - connected.size}`);

// 出力用の処理済み髪ボクセルを構築
const outputHair = [];
for (const key of connected) {
  outputHair.push(hairMap.get(key));
}

// 処理済み髪をVOXファイルとして書き出し
writeVox(OUT_HAIR, hair.sx, hair.sy, hair.sz, outputHair, hair.palette);

// 統合プレビュー（ボディ + キャップ + 髪）を作成
const mergedPalette = [];
for (let i = 0; i < 256; i++) {
  mergedPalette.push(body.palette ? body.palette[i] : { r: 0, g: 0, b: 0 });
}
// キャップ色をインデックス253-254に設定
mergedPalette[253] = { r: 200, g: 50, b: 50 };   // キャップ本体
mergedPalette[254] = { r: 150, g: 35, b: 40 };   // キャップのツバ
// 髪色をインデックス252に設定（髪パレットの最初の色を使用）
if (hair.palette && hair.palette.length > 0) {
  mergedPalette[252] = hair.palette[0];
}

const merged = [];
const mergedSet = new Set();

// ボディを最初に追加
for (const v of body.voxels) {
  const key = `${v.x},${v.y},${v.z}`;
  mergedSet.add(key);
  merged.push(v);
}

// キャップを追加（ボディと重複しないもの）
for (const v of cap.voxels) {
  const key = `${v.x},${v.y},${v.z}`;
  if (!mergedSet.has(key)) {
    mergedSet.add(key);
    // キャップのカラーインデックスをリマップ（ci=2はツバ色）
    merged.push({ x: v.x, y: v.y, z: v.z, ci: v.ci === 2 ? 255 : 254 });
  }
}

// 髪を追加（統合プレビューでは全てci=253で表示）
for (const v of outputHair) {
  const key = `${v.x},${v.y},${v.z}`;
  if (!mergedSet.has(key)) {
    mergedSet.add(key);
    merged.push({ x: v.x, y: v.y, z: v.z, ci: 253 });
  }
}

// 統合プレビューをVOXファイルとして書き出し
writeVox(OUT_MERGED, body.sx, body.sy, body.sz, merged, mergedPalette);

// サマリーを表示
console.log(`\nSummary:`);
console.log(`  Original hair: ${hair.voxels.length}`);
console.log(`  Processed hair: ${outputHair.length}`);
console.log(`  Merged preview: ${merged.length}`);
console.log('Done!');
