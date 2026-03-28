/**
 * fix_clothing.js
 *
 * 衣装パーツを修正するスクリプト: CEボディ表面にシェルを生成。
 * HPとCEボディ間の腕/体幹領域の不一致を処理する。
 *
 * Usage: node scripts/fix_clothing.js <part_key> [--arm-only]
 * 例: node scripts/fix_clothing.js suit_top
 */
// ファイルシステムモジュール
const fs = require('fs');
// パス操作モジュール
const path = require('path');

// コマンドライン引数からパーツキーを取得
const PART = process.argv[2];
if (!PART) {
  console.error('Usage: node scripts/fix_clothing.js <part_key> [--arm-only]');
  process.exit(1);
}
// --arm-onlyフラグ: 腕部分のみを処理するオプション
const armOnly = process.argv.includes('--arm-only');

// VOXファイルパーサー
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

// VOXファイルライター
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

// 衣装パーツとCEボディを読み込み
const part = readVox(path.join(BASE, DIR, `${PREFIX}_${PART}.vox`));
const body = readVox(path.join(BASE, DIR, `${PREFIX}_body.vox`));
const SX = part.sx, SY = part.sy, SZ = part.sz;

console.log(`Body: ${body.voxels.length} voxels`);
console.log(`${PART} (original): ${part.voxels.length} voxels`);

// ボディセットとボディ表面を構築
const bodySet = new Set();
for (const v of body.voxels) bodySet.add(`${v.x},${v.y},${v.z}`);

const DIRS = [[-1,0,0],[1,0,0],[0,-1,0],[0,1,0],[0,0,-1],[0,0,1]];
const bodySurface = [];
for (const v of body.voxels) {
  for (const [dx, dy, dz] of DIRS) {
    if (!bodySet.has(`${v.x+dx},${v.y+dy},${v.z+dz}`)) {
      bodySurface.push(v);
      break;
    }
  }
}
console.log(`Body surface: ${bodySurface.length} voxels`);

// --- ボディ領域を検出 ---
// Z値ごとのボディX幅を計算
const bodyXByZ = {};
for (const v of body.voxels) {
  if (!bodyXByZ[v.z]) bodyXByZ[v.z] = { min: v.x, max: v.x, count: 0 };
  bodyXByZ[v.z].min = Math.min(bodyXByZ[v.z].min, v.x);
  bodyXByZ[v.z].max = Math.max(bodyXByZ[v.z].max, v.x);
  bodyXByZ[v.z].count++;
}
const bodyWidths = Object.entries(bodyXByZ).map(([z, d]) => ({ z: +z, w: d.max - d.min }));
bodyWidths.sort((a, b) => a.w - b.w);
const medianWidth = bodyWidths[Math.floor(bodyWidths.length / 2)].w;

// 腕のZ断面: 中央値の1.8倍以上の幅
const armZLevels = new Set();
for (const { z, w } of bodyWidths) {
  if (w > medianWidth * 1.8) armZLevels.add(z);
}
const armZmin = armZLevels.size > 0 ? Math.min(...armZLevels) : 999;
const armZmax = armZLevels.size > 0 ? Math.max(...armZLevels) : 0;
if (armZLevels.size > 0) {
  console.log(`Detected arm Z levels: ${armZmin}~${armZmax} (width > ${(medianWidth * 1.8).toFixed(0)}, median=${medianWidth})`);
}

// 体幹のX範囲（腕以外のZ断面から）
const torsoXs = [];
for (const [zStr, data] of Object.entries(bodyXByZ)) {
  if (!armZLevels.has(+zStr) && data.count > 5) {
    torsoXs.push({ min: data.min, max: data.max });
  }
}
torsoXs.sort((a, b) => (a.max - a.min) - (b.max - b.min));
const refTorso = torsoXs[Math.floor(torsoXs.length / 2)];
const torsoXmin = refTorso ? refTorso.min : 0;
const torsoXmax = refTorso ? refTorso.max : SX;
console.log(`Torso X range: ${torsoXmin}~${torsoXmax}`);

// --- 衣装の分析 ---
// Z値ごとの衣装X範囲
const partXByZ = {};
for (const v of part.voxels) {
  if (!partXByZ[v.z]) partXByZ[v.z] = { xmin: v.x, xmax: v.x };
  else {
    partXByZ[v.z].xmin = Math.min(partXByZ[v.z].xmin, v.x);
    partXByZ[v.z].xmax = Math.max(partXByZ[v.z].xmax, v.x);
  }
}
const partZmin = Math.min(...part.voxels.map(v => v.z));
const partZmax = Math.max(...part.voxels.map(v => v.z));
// 衣装が腕を覆っているか判定（X幅が中央値の1.3倍超）
const clothingCoversArms = Object.values(partXByZ).some(r => (r.xmax - r.xmin) > medianWidth * 1.3);
console.log(`Clothing Z range: ${partZmin}~${partZmax}, covers arms: ${clothingCoversArms}`);

// 衣装からの色検索マップ
const clothingColorByZ = {};
for (const v of part.voxels) {
  if (!clothingColorByZ[v.z]) clothingColorByZ[v.z] = [];
  clothingColorByZ[v.z].push(v);
}
function getNearestColor(x, y, z) {
  let bestDist = Infinity, bestC = part.voxels[0].c;
  for (let dz = 0; dz <= 5; dz++) {
    for (const sz of [z + dz, z - dz]) {
      const slice = clothingColorByZ[sz];
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

// --- ボディ内側/外側を分離 ---
const outsideVoxels = [];
const insideVoxels = [];
for (const v of part.voxels) {
  if (bodySet.has(`${v.x},${v.y},${v.z}`)) insideVoxels.push(v);
  else outsideVoxels.push(v);
}
console.log(`  Outside body: ${outsideVoxels.length}, Inside body: ${insideVoxels.length}`);

// --- ステップ1: ボディ外側のボクセルを保持 ---
const result = [];
const placed = new Set();
if (!armOnly) {
  for (const v of outsideVoxels) {
    // CEボディ腕レベル以下の浮遊ボクセル（HPの腕位置）をスキップ
    if (clothingCoversArms && v.z < armZmin) continue;
    const key = `${v.x},${v.y},${v.z}`;
    if (!placed.has(key)) { placed.add(key); result.push(v); }
  }
}
console.log(`Step 1 - kept outside: ${result.length}${armOnly ? ' (arm-only)' : ''}`);

// --- ステップ2: ボディ表面にシェルを生成 ---
let shellArm = 0, shellTorso = 0;
for (const sv of bodySurface) {
  const isArmZ = armZLevels.has(sv.z);
  const isArmX = (sv.x < torsoXmin - 2) || (sv.x > torsoXmax + 2);
  const isInPartZ = (sv.z >= partZmin && sv.z <= partZmax);

  if (armOnly) {
    // arm-onlyモード: 腕のZ断面かつ腕のX位置のみ
    if (!isArmZ || !isArmX) continue;
  } else if (isArmZ && clothingCoversArms && isArmX) {
    // 腕表面: 衣装が腕を覆っている場合は常にカバー
  } else if (isInPartZ && sv.z >= armZmin) {
    // 体幹/肩（腕レベル以上）: Z断面ごとのX範囲を使用
    const xRange = partXByZ[sv.z];
    if (!xRange) continue;
    const effXmin = Math.max(xRange.xmin, torsoXmin - 3);
    const effXmax = Math.min(xRange.xmax, torsoXmax + 3);
    if (sv.x < effXmin || sv.x > effXmax) continue;
  } else {
    continue;
  }

  // 空き隣接にシェルボクセルを配置
  for (const [dx, dy, dz] of DIRS) {
    const nx = sv.x + dx, ny = sv.y + dy, nz = sv.z + dz;
    if (nx < 0 || nx >= SX || ny < 0 || ny >= SY || nz < 0 || nz >= SZ) continue;
    const nkey = `${nx},${ny},${nz}`;
    if (bodySet.has(nkey) || placed.has(nkey)) continue;
    placed.add(nkey);
    result.push({ x: nx, y: ny, z: nz, c: getNearestColor(nx, ny, nz) });
    if (isArmX && isArmZ) shellArm++; else shellTorso++;
  }
}
console.log(`Step 2 - shell arm: ${shellArm}, shell torso: ${shellTorso}`);
console.log(`Total: ${result.length} voxels`);

// 結果をVOXファイルとして書き出し
writeVox(path.join(BASE, DIR, `${PREFIX}_${PART}.vox`), SX, SY, SZ, result, part.palette);
console.log(`Written: ${PREFIX}_${PART}.vox`);

// パーツマニフェストを更新
const manifestPath = path.join(BASE, DIR, `${PREFIX}_parts.json`);
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const entry = manifest.find(p => p.key === PART);
if (entry) entry.voxels = result.length;
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
console.log('Updated manifest. Done!');
