/**
 * fix_cap_outside.js
 *
 * ボディ内部にあるキャップボクセルを修正するスクリプト。
 * ボディと重複するキャップボクセルを表面法線方向に外側へ押し出す。
 * その後、MagicaVoxel編集用にボディと再統合する。
 *
 * Usage: node scripts/fix_cap_outside.js
 */
// ファイルシステムモジュール
const fs = require('fs');

// 入出力ファイルパス
const BODY_PATH = 'public/box2/cyberpunk_elf_body_base_hires_sym.vox';  // ボディ
const CAP_PATH  = 'public/box2/knit_cap.vox';                            // キャップ
const OUT_MERGED = 'public/box2/body_with_cap.vox';                      // 統合出力
const OUT_CAP    = 'public/box2/knit_cap_fixed.vox';                     // 修正済みキャップ出力

// ── VOXパーサー ──────────────────────────────────────────────────────
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

// VOXライター
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
  console.log(`Written: ${filepath} (${voxels.length} voxels, ${sizeX}x${sizeY}x${sizeZ})`);
}

// ── メイン処理 ──────────────────────────────────────────────────────
const body = parseVox(fs.readFileSync(BODY_PATH));
const cap = parseVox(fs.readFileSync(CAP_PATH));
console.log(`Body: ${body.voxels.length} voxels`);
console.log(`Cap: ${cap.voxels.length} voxels`);

// ボディの占有セットを構築
const bodySet = new Set();
for (const v of body.voxels) bodySet.add(`${v.x},${v.y},${v.z}`);

// キャップボクセルのボディ内外の分析
let inside = 0, outside = 0;
for (const v of cap.voxels) {
  if (bodySet.has(`${v.x},${v.y},${v.z}`)) inside++;
  else outside++;
}
console.log(`Cap inside body: ${inside}, outside: ${outside}`);

// 外側への押し出し方向を計算するための頭部中心座標
const HEAD_CX = 92;
const HEAD_CY = 27;
const HEAD_CZ = 195;  // 頭部中心の概算Z座標

// 6方向の隣接オフセット
const DIRS = [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]];

// ボディ内部のボクセルを外側に押し出す関数
// 頭部中心からの放射方向にレイキャストして空きスポットを探す
function findOutwardPosition(x, y, z) {
  // 頭部中心からの方向ベクトル
  const dx = x - HEAD_CX;
  const dy = y - HEAD_CY;
  const dz = z - HEAD_CZ;
  const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
  if (len < 0.001) return null;

  // 正規化した方向ベクトル
  const ndx = dx / len;
  const ndy = dy / len;
  const ndz = dz / len;

  // ボクセル位置から外側にマーチして空きスペースを見つける（最大10ステップ）
  for (let step = 1; step <= 10; step++) {
    const nx = Math.round(x + ndx * step);
    const ny = Math.round(y + ndy * step);
    const nz = Math.round(z + ndz * step);
    if (!bodySet.has(`${nx},${ny},${nz}`)) {
      return { x: nx, y: ny, z: nz };
    }
  }
  return null;
}

// キャップを再構築: 外側のボクセルはそのまま保持、内側のボクセルは外側に押し出す
const newCapSet = new Set();
const newCapVoxels = [];

// まず既に外側にあるキャップボクセルを保持
for (const v of cap.voxels) {
  if (!bodySet.has(`${v.x},${v.y},${v.z}`)) {
    const key = `${v.x},${v.y},${v.z}`;
    if (!newCapSet.has(key)) {
      newCapSet.add(key);
      newCapVoxels.push(v);
    }
  }
}
console.log(`Kept ${newCapVoxels.length} outside cap voxels`);

// 内側のボクセルを外側に押し出す
let pushed = 0, failed = 0;
for (const v of cap.voxels) {
  if (bodySet.has(`${v.x},${v.y},${v.z}`)) {
    const newPos = findOutwardPosition(v.x, v.y, v.z);
    if (newPos) {
      const key = `${newPos.x},${newPos.y},${newPos.z}`;
      if (!newCapSet.has(key) && !bodySet.has(key)) {
        newCapSet.add(key);
        newCapVoxels.push({ x: newPos.x, y: newPos.y, z: newPos.z, ci: v.ci });
        pushed++;
      }
    } else {
      failed++;
    }
  }
}
console.log(`Pushed outward: ${pushed}, failed: ${failed}`);
console.log(`New cap total: ${newCapVoxels.length} voxels`);

// 後頭部の表面キャップを追加して完全なカバレッジを確保
const backCapZ = 168;      // 後頭部のZ下限
const HEAD_TOP_Z = 207;   // 頭頂のZ座標

let surfaceAdded = 0;
for (const v of body.voxels) {
  // 頭部のZ範囲外はスキップ
  if (v.z < backCapZ || v.z > HEAD_TOP_Z) continue;

  // 頭部領域に限定（耳は除外）
  const dx = Math.abs(v.x - HEAD_CX);
  const dy = v.y - HEAD_CY;
  if (dx > 20) continue;  // 横方向に離れすぎ

  // 後頭部のみ（Y > 5 = 後ろ半分）
  if (dy < 5) continue;

  // 耳領域をスキップ
  if (v.z >= 186 && v.z <= 197 && (v.x < 70 || v.x > 113)) continue;

  // 表面ボクセルか確認（空き隣接あり）
  let isSurface = false;
  for (const [ddx, ddy, ddz] of DIRS) {
    if (!bodySet.has(`${v.x+ddx},${v.y+ddy},${v.z+ddz}`)) {
      isSurface = true;
      break;
    }
  }
  if (!isSurface) continue;

  // 空き隣接にキャップボクセルを配置
  for (const [ddx, ddy, ddz] of DIRS) {
    const nx = v.x + ddx, ny = v.y + ddy, nz = v.z + ddz;
    if (nz < backCapZ) continue;
    // 耳領域のZ範囲で横方向にはみ出す場合はスキップ
    if (nx < 70 || nx > 113) { if (nz >= 186 && nz <= 197) continue; }

    const key = `${nx},${ny},${nz}`;
    if (bodySet.has(key)) continue;
    if (newCapSet.has(key)) continue;
    newCapSet.add(key);
    newCapVoxels.push({ x: nx, y: ny, z: nz, ci: 1 }); // キャップ本体色
    surfaceAdded++;
  }
}
console.log(`Back surface cap voxels added: ${surfaceAdded}`);
console.log(`Final cap total: ${newCapVoxels.length} voxels`);

// 修正済みキャップを保存
const capPalette = [
  { r: 200, g: 50, b: 50 },   // キャップ本体
  { r: 150, g: 35, b: 40 },   // ツバ
];
while (capPalette.length < 256) capPalette.push({ r: 0, g: 0, b: 0 });
writeVox(OUT_CAP, body.sx, body.sy, body.sz, newCapVoxels, capPalette);

// MagicaVoxel編集用の統合ファイルを保存
const mergedPalette = [];
for (let i = 0; i < 256; i++) {
  mergedPalette.push(body.palette ? body.palette[i] : { r: 0, g: 0, b: 0 });
}
mergedPalette[253] = { r: 200, g: 50, b: 50 };
mergedPalette[254] = { r: 150, g: 35, b: 40 };

const merged = [];
// ボディを追加
for (const v of body.voxels) merged.push(v);
// キャップを追加（ボディと重ならないもの）
for (const v of newCapVoxels) {
  const key = `${v.x},${v.y},${v.z}`;
  if (bodySet.has(key)) continue;
  const ci = v.ci === 2 ? 255 : 254;
  merged.push({ x: v.x, y: v.y, z: v.z, ci });
}

writeVox(OUT_MERGED, body.sx, body.sy, body.sz, merged, mergedPalette);
console.log('Done!');
