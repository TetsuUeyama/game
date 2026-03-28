/**
 * fix_hair_de.js
 *
 * DarkElfBladerの髪を修正するスクリプト:
 * 1. パレット色を暗くする（バリエーションは保持）
 * 2. Y+1方向（後方）にシフトする
 *
 * Usage: node scripts/fix_hair_de.js
 */
// ファイルシステムモジュール
const fs = require('fs');
// パス操作モジュール
const path = require('path');

// Y方向のシフト量（+1 = 後方へ）
const DY = 1;
// Z方向のシフト量（0 = 変更なし）
const DZ = 0;

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

// パスの設定
const BASE = path.join(__dirname, '..');
const DIR = path.join(BASE, 'public/box4');
const PREFIX = 'darkelfblader_arp';

// 元の髪VOXファイルのパス（originals/ディレクトリから読み込み）
const srcPath = path.join(DIR, 'originals', `${PREFIX}_hair.vox`);
// 出力先のパス
const dstPath = path.join(DIR, `${PREFIX}_hair.vox`);

// VOXファイルを読み込み
const vox = readVox(srcPath);
console.log(`Hair original: ${vox.voxels.length} voxels`);

// ステップ1: 髪に使用されているパレット色を暗くする
// 使用されているパレットインデックスを収集
const usedIndices = new Set();
for (const v of vox.voxels) usedIndices.add(v.c);
console.log(`Palette indices used: ${[...usedIndices].sort((a,b) => a-b).join(', ')}`);

if (vox.palette) {
  // 使用色の変更前後を表示しながら暗くする
  for (const idx of [...usedIndices].sort((a,b) => a-b)) {
    // パレットは0インデックスだがボクセルのカラーは1インデックス
    const p = vox.palette[idx - 1];
    if (p) {
      // 0.65倍で暗くする（相対的なバリエーションは維持）
      const factor = 0.65;
      const newR = Math.round(Math.max(0, Math.min(255, p.r * factor)));
      const newG = Math.round(Math.max(0, Math.min(255, p.g * factor)));
      const newB = Math.round(Math.max(0, Math.min(255, p.b * factor)));
      console.log(`  idx ${idx}: (${p.r},${p.g},${p.b}) → (${newR},${newG},${newB})`);
      // パレットを更新
      p.r = newR; p.g = newG; p.b = newB;
    }
  }
}

// ステップ2: Y+1方向（後方）にシフト
const shifted = [];
let clipped = 0; // グリッド外にはみ出してクリップされたボクセル数
for (const v of vox.voxels) {
  // シフト後の座標を計算
  const ny = v.y + DY, nz = v.z + DZ;
  // グリッド範囲内なら結果に追加
  if (ny >= 0 && ny < vox.sy && nz >= 0 && nz < vox.sz) {
    shifted.push({ x: v.x, y: ny, z: nz, c: v.c });
  } else { clipped++; } // 範囲外はクリップ
}

// シフト結果をVOXファイルとして書き出し
writeVox(dstPath, vox.sx, vox.sy, vox.sz, shifted, vox.palette);
console.log(`Hair shift Y+${DY}: ${vox.voxels.length} → ${shifted.length} (clipped: ${clipped})`);

// パーツマニフェストのボクセル数を更新
const manifestPath = path.join(DIR, `${PREFIX}_parts.json`);
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const entry = manifest.find(p => p.key === 'hair');
if (entry) entry.voxels = shifted.length;
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
console.log('Done!');
