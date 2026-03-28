/**
 * fix_leotard.js
 *
 * レオタードを修正するスクリプト:
 * 元のレオタードボクセル（ボディ外側）と、レオタード範囲内のボディ表面シェルを結合。
 * シェルの色は最寄りの元レオタードボクセルから取得。
 *
 * Usage: node scripts/fix_leotard.js
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
const DIR = 'public/box3-new';
const PREFIX = 'highpriestess_blender_rigged';

// 元の（再ボクセル化済み）レオタードとボディを読み込み
const leotard = readVox(path.join(BASE, DIR, `${PREFIX}_leotard.vox`));
const body = readVox(path.join(BASE, DIR, `${PREFIX}_body.vox`));
const SX = leotard.sx, SY = leotard.sy, SZ = leotard.sz;

console.log(`Body: ${body.voxels.length} voxels`);
console.log(`Leotard (original): ${leotard.voxels.length} voxels`);

// ボディボクセルの座標セットを構築
const bodySet = new Set();
for (const v of body.voxels) bodySet.add(`${v.x},${v.y},${v.z}`);

// レオタードボクセルをボディの外側と内側に分離
const outsideVoxels = [];  // ボディ外側のレオタードボクセル
const insideVoxels = [];   // ボディ内側のレオタードボクセル（重複）
for (const v of leotard.voxels) {
  if (bodySet.has(`${v.x},${v.y},${v.z}`)) {
    insideVoxels.push(v);
  } else {
    outsideVoxels.push(v);
  }
}
console.log(`  Outside body: ${outsideVoxels.length}, Inside body: ${insideVoxels.length}`);

// 元のレオタード全ボクセルからカバレッジゾーン（Z範囲）を決定
const leoZmin = Math.min(...leotard.voxels.map(v => v.z));
const leoZmax = Math.max(...leotard.voxels.map(v => v.z));

// Z値ごとのレオタードX範囲を計算
const leoXByZ = {};
for (const v of leotard.voxels) {
  if (!leoXByZ[v.z]) leoXByZ[v.z] = { xmin: v.x, xmax: v.x };
  else {
    leoXByZ[v.z].xmin = Math.min(leoXByZ[v.z].xmin, v.x);
    leoXByZ[v.z].xmax = Math.max(leoXByZ[v.z].xmax, v.x);
  }
}

// Z値ごとのレオタード色マップを構築（最寄り色検索用）
const leoColorByZ = {};
for (const v of leotard.voxels) {
  if (!leoColorByZ[v.z]) leoColorByZ[v.z] = [];
  leoColorByZ[v.z].push(v);
}

// 指定位置に最も近いレオタード色を検索する関数
function getNearestColor(x, y, z) {
  let bestDist = Infinity;
  let bestC = leotard.voxels[0].c;
  // 近傍のZスライスを探索（±3スライス）
  for (let dz = 0; dz <= 3; dz++) {
    for (const sz of [z + dz, z - dz]) {
      const slice = leoColorByZ[sz];
      if (!slice) continue;
      for (const v of slice) {
        // マンハッタン距離で最近傍を選択
        const d = Math.abs(v.x - x) + Math.abs(v.y - y) + Math.abs(v.z - z);
        if (d < bestDist) { bestDist = d; bestC = v.c; }
      }
      // 距離2以内で見つかれば早期リターン
      if (bestDist <= 2) return bestC;
    }
  }
  return bestC;
}

// 6方向の隣接オフセット
const DIRS = [[-1,0,0],[1,0,0],[0,-1,0],[0,1,0],[0,0,-1],[0,0,1]];

// ステップ1: ボディ外側のレオタードボクセルを全て保持
const result = [];
const placed = new Set();  // 配置済み座標の追跡
for (const v of outsideVoxels) {
  const key = `${v.x},${v.y},${v.z}`;
  if (!placed.has(key)) {
    placed.add(key);
    result.push(v);
  }
}
console.log(`Step 1 - kept outside: ${result.length}`);

// ステップ2: レオタードゾーン内のボディ表面ボクセルの空き隣接にシェルを追加
let shellAdded = 0;
for (const bv of body.voxels) {
  // レオタードのZ範囲外ならスキップ
  if (bv.z < leoZmin || bv.z > leoZmax) continue;

  // このZ断面でのレオタードX範囲を確認
  const xRange = leoXByZ[bv.z];
  if (!xRange) continue;
  // レオタードX範囲外ならスキップ
  if (bv.x < xRange.xmin || bv.x > xRange.xmax) continue;

  // ボディ表面（空き隣接あり）の確認とシェル追加
  for (const [dx, dy, dz] of DIRS) {
    const nx = bv.x + dx, ny = bv.y + dy, nz = bv.z + dz;
    // グリッド範囲外ならスキップ
    if (nx < 0 || nx >= SX || ny < 0 || ny >= SY || nz < 0 || nz >= SZ) continue;
    const nkey = `${nx},${ny},${nz}`;
    if (bodySet.has(nkey)) continue;  // 隣接がボディ内部ならスキップ
    if (placed.has(nkey)) continue;   // 既にレオタードボクセルがあるならスキップ

    // シェルボクセルを追加（最寄りレオタード色を使用）
    placed.add(nkey);
    const c = getNearestColor(nx, ny, nz);
    result.push({ x: nx, y: ny, z: nz, c });
    shellAdded++;
  }
}
console.log(`Step 2 - shell added: ${shellAdded}`);
console.log(`Total: ${result.length} voxels`);

// 結果をVOXファイルとして書き出し
const dstPath = path.join(BASE, DIR, `${PREFIX}_leotard.vox`);
writeVox(dstPath, SX, SY, SZ, result, leotard.palette);
console.log(`Written: ${dstPath}`);

// パーツマニフェストのボクセル数を更新
const manifestPath = path.join(BASE, DIR, `${PREFIX}_parts.json`);
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const entry = manifest.find(p => p.key === 'leotard');
if (entry) entry.voxels = result.length;
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
console.log('Updated manifest.');
console.log('Done!');
