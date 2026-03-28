/**
 * fix_clothing_de.js
 *
 * DarkElfBladerの衣装を修正するスクリプト:
 * ボディ内部のボクセルを除去し、ボディ表面にシェルを生成。
 * fix_leotard.jsのロジックを基に（実証済みアプローチ）。
 *
 * Usage: node scripts/fix_clothing_de.js <part_key>
 * 例: node scripts/fix_clothing_de.js armor_-_suit
 */
// ファイルシステムモジュール
const fs = require('fs');
// パス操作モジュール
const path = require('path');

// コマンドライン引数からパーツキーを取得
const PART = process.argv[2];
if (!PART) {
  console.error('Usage: node scripts/fix_clothing_de.js <part_key>');
  process.exit(1);
}

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
const DIR = 'public/box4';
const PREFIX = 'darkelfblader_arp';

// ボディ（CEボディをDEグリッドにリマップ済み）と衣装パーツを読み込み
const body = readVox(path.join(BASE, DIR, `${PREFIX}_body.vox`));
const part = readVox(path.join(BASE, DIR, `${PREFIX}_${PART}.vox`));
const SX = body.sx, SY = body.sy, SZ = body.sz;

console.log(`Body: ${body.voxels.length} voxels, grid: ${SX}x${SY}x${SZ}`);
console.log(`${PART} (original): ${part.voxels.length} voxels`);

// ボディボクセルの座標セットを構築
const bodySet = new Set();
for (const v of body.voxels) bodySet.add(`${v.x},${v.y},${v.z}`);

// 衣装ボクセルをボディ内側/外側に分離
const outsideVoxels = [];  // ボディ外側の衣装ボクセル
const insideVoxels = [];   // ボディ内側（重複）の衣装ボクセル
for (const v of part.voxels) {
  if (bodySet.has(`${v.x},${v.y},${v.z}`)) insideVoxels.push(v);
  else outsideVoxels.push(v);
}
console.log(`  Outside body: ${outsideVoxels.length}, Inside body: ${insideVoxels.length}`);

// ステップ1: ボディ外側の衣装ボクセルを保持
const result = [];
const placed = new Set();
for (const v of outsideVoxels) {
  const key = `${v.x},${v.y},${v.z}`;
  if (!placed.has(key)) { placed.add(key); result.push(v); }
}
console.log(`Step 1 - kept outside: ${result.length}`);

// ステップ2: 衣装のZ/X範囲内でボディ表面にシェルを生成
const DIRS = [[-1,0,0],[1,0,0],[0,-1,0],[0,1,0],[0,0,-1],[0,0,1]];

// Z値ごとの衣装X範囲を計算
const partRangeByZ = {};
for (const v of part.voxels) {
  if (!partRangeByZ[v.z]) partRangeByZ[v.z] = { xmin: v.x, xmax: v.x };
  else {
    partRangeByZ[v.z].xmin = Math.min(partRangeByZ[v.z].xmin, v.x);
    partRangeByZ[v.z].xmax = Math.max(partRangeByZ[v.z].xmax, v.x);
  }
}
// 衣装のZ範囲
const partZmin = Math.min(...part.voxels.map(v => v.z));
const partZmax = Math.max(...part.voxels.map(v => v.z));

// 元の衣装からの色検索マップ構築
const colorByZ = {};
for (const v of part.voxels) {
  if (!colorByZ[v.z]) colorByZ[v.z] = [];
  colorByZ[v.z].push(v);
}
// 最寄り衣装色を検索する関数
function getNearestColor(x, y, z) {
  let bestDist = Infinity, bestC = part.voxels[0].c;
  for (let dz = 0; dz <= 5; dz++) {
    for (const sz of [z + dz, z - dz]) {
      const slice = colorByZ[sz];
      if (!slice) continue;
      for (const v of slice) {
        const d = Math.abs(v.x - x) + Math.abs(v.y - y) + Math.abs(v.z - z);
        if (d < bestDist) { bestDist = d; bestC = v.c; }
      }
      if (bestDist <= 2) return bestC;
    }
  }
  return bestC;
}

// 衣装範囲内のボディ表面ボクセルにシェルを追加
let shellCount = 0;
for (const bv of body.voxels) {
  // 衣装のZ範囲外ならスキップ
  if (bv.z < partZmin || bv.z > partZmax) continue;

  // このZ断面での衣装X範囲を確認（マージン±1）
  const xRange = partRangeByZ[bv.z];
  if (!xRange) continue;
  if (bv.x < xRange.xmin - 1 || bv.x > xRange.xmax + 1) continue;

  // 表面ボクセル判定（少なくとも1つの空き隣接があるか）
  let isSurface = false;
  for (const [dx, dy, dz] of DIRS) {
    if (!bodySet.has(`${bv.x+dx},${bv.y+dy},${bv.z+dz}`)) {
      isSurface = true;
      break;
    }
  }
  if (!isSurface) continue;

  // 空き隣接にシェルボクセルを配置
  for (const [dx, dy, dz] of DIRS) {
    const nx = bv.x + dx, ny = bv.y + dy, nz = bv.z + dz;
    if (nx < 0 || nx >= SX || ny < 0 || ny >= SY || nz < 0 || nz >= SZ) continue;
    const nkey = `${nx},${ny},${nz}`;
    if (bodySet.has(nkey) || placed.has(nkey)) continue;
    placed.add(nkey);
    result.push({ x: nx, y: ny, z: nz, c: getNearestColor(nx, ny, nz) });
    shellCount++;
  }
}
console.log(`Step 2 - shell: ${shellCount}`);
console.log(`Total: ${result.length} voxels`);

// 結果をVOXファイルとして書き出し
const outPath = path.join(BASE, DIR, `${PREFIX}_${PART}.vox`);
writeVox(outPath, SX, SY, SZ, result, part.palette);
console.log(`Written: ${outPath}`);

// パーツマニフェストのボクセル数を更新
const manifestPath = path.join(BASE, DIR, `${PREFIX}_parts.json`);
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const entry = manifest.find(p => p.key === PART);
if (entry) entry.voxels = result.length;
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
console.log('Updated manifest. Done!');
