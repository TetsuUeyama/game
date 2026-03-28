// ファイルシステムモジュール
const fs = require('fs');

// 解析対象のVOXファイルパス（DarkElfBladerのボディ）
const filePath = 'C:/Users/user/developsecond/contactform/public/box4/darkelfblader_arp_body.vox';
// ファイルをバイナリとして読み込み
const buf = fs.readFileSync(filePath);

// VOXヘッダーの確認
const magic = buf.toString('ascii', 0, 4);   // マジックナンバー（'VOX '）
const version = buf.readInt32LE(4);           // バージョン番号
console.log(`Magic: ${magic}, Version: ${version}`);

// 読み取り開始位置（マジック4B + バージョン4B の後）
let offset = 8;

// チャンクヘッダーを読み取る関数
function readChunk(buf, off) {
  const id = buf.toString('ascii', off, off + 4);       // チャンクID（4バイト）
  const contentSize = buf.readInt32LE(off + 4);          // コンテンツサイズ
  const childrenSize = buf.readInt32LE(off + 8);         // 子チャンクサイズ
  return { id, contentSize, childrenSize, dataOffset: off + 12 };  // データ開始位置はヘッダー12B後
}

// モデルサイズ変数
let sizeX, sizeY, sizeZ;
// ボクセルデータの配列
const voxels = [];

// MAINチャンクを読み取り
const main = readChunk(buf, offset);
offset += 12; // MAINヘッダーをスキップ、子チャンクが続く

// 子チャンクをパース
const end = offset + main.childrenSize;
while (offset < end) {
  const chunk = readChunk(buf, offset);
  // SIZEチャンク: モデルのグリッドサイズを取得
  if (chunk.id === 'SIZE') {
    sizeX = buf.readInt32LE(chunk.dataOffset);
    sizeY = buf.readInt32LE(chunk.dataOffset + 4);
    sizeZ = buf.readInt32LE(chunk.dataOffset + 8);
  // XYZIチャンク: ボクセルの座標とカラーインデックスを取得
  } else if (chunk.id === 'XYZI') {
    const numVoxels = buf.readInt32LE(chunk.dataOffset);
    for (let i = 0; i < numVoxels; i++) {
      const base = chunk.dataOffset + 4 + i * 4;
      voxels.push({
        x: buf.readUInt8(base),          // X座標
        y: buf.readUInt8(base + 1),      // Y座標
        z: buf.readUInt8(base + 2),      // Z座標
        colorIndex: buf.readUInt8(base + 3)  // カラーインデックス
      });
    }
  }
  // 次のチャンクへ移動
  offset += 12 + chunk.contentSize + chunk.childrenSize;
}

// モデルサイズを表示
console.log(`\n=== Model Size ===`);
console.log(`sizeX: ${sizeX}, sizeY: ${sizeY}, sizeZ: ${sizeZ}`);
console.log(`Total voxel count: ${voxels.length}`);

// 各軸のボクセル座標範囲を計算
let minX = 255, maxX = 0, minY = 255, maxY = 0, minZ = 255, maxZ = 0;
for (const v of voxels) {
  if (v.x < minX) minX = v.x;
  if (v.x > maxX) maxX = v.x;
  if (v.y < minY) minY = v.y;
  if (v.y > maxY) maxY = v.y;
  if (v.z < minZ) minZ = v.z;
  if (v.z > maxZ) maxZ = v.z;
}
// 座標範囲を表示
console.log(`\n=== Voxel Ranges ===`);
console.log(`X range: ${minX} - ${maxX}`);
console.log(`Y range: ${minY} - ${maxY}`);
console.log(`Z range: ${minZ} - ${maxZ}`);

// モデルの中心X, Y座標を計算
const centerX = (minX + maxX) / 2;
const centerY = (minY + maxY) / 2;
console.log(`Center X: ${centerX}, Center Y: ${centerY}`);

// === ボディ構造の分析 ===
console.log(`\n=== Body Structure Analysis ===`);

// Z値ごとにボクセルをグループ化（断面分析用）
const byZ = {};
for (const v of voxels) {
  if (!byZ[v.z]) byZ[v.z] = [];
  byZ[v.z].push(v);
}

// 1. z=60以上で最も狭いX断面を探す（首の領域）
console.log(`\n--- Neck Area (narrowest X cross-section above z=60) ---`);
let narrowestWidth = Infinity;  // 最小幅
let narrowestZ = -1;            // 最小幅のZ座標
for (let z = 61; z <= maxZ; z++) {
  if (!byZ[z]) continue;
  const xs = byZ[z].map(v => v.x);
  const w = Math.max(...xs) - Math.min(...xs) + 1;  // X方向の幅
  if (w < narrowestWidth) {
    narrowestWidth = w;
    narrowestZ = z;
  }
}
// 最も狭い断面の情報を表示
if (narrowestZ >= 0) {
  const xs = byZ[narrowestZ].map(v => v.x);
  console.log(`Narrowest at z=${narrowestZ}: width=${narrowestWidth}, x range: ${Math.min(...xs)}-${Math.max(...xs)}, voxel count: ${byZ[narrowestZ].length}`);
}

// z>60の各断面のX幅を表示
console.log(`\nCross-section X widths above z=60:`);
for (let z = maxZ; z > 60; z--) {
  if (!byZ[z]) continue;
  const xs = byZ[z].map(v => v.x);
  const xMin = Math.min(...xs);
  const xMax = Math.max(...xs);
  console.log(`  z=${z}: xMin=${xMin}, xMax=${xMax}, width=${xMax - xMin + 1}, count=${byZ[z].length}`);
}

// 2. z>30での腕の検出
console.log(`\n--- Arm Detection (above z=30) ---`);
// 各Z断面の最左端と最右端を表示（5刻み）
for (let z = maxZ; z > 30; z -= 5) {
  if (!byZ[z]) continue;
  const xs = byZ[z].map(v => v.x);
  const xMin = Math.min(...xs);
  const xMax = Math.max(...xs);
  console.log(`  z=${z}: leftmost x=${xMin}, rightmost x=${xMax}, width=${xMax - xMin + 1}`);
}

// 最も広い断面を探す（肩/腕レベル）
let widestWidth = 0;  // 最大幅
let widestZ = -1;     // 最大幅のZ座標
for (let z = 31; z <= maxZ; z++) {
  if (!byZ[z]) continue;
  const xs = byZ[z].map(v => v.x);
  const w = Math.max(...xs) - Math.min(...xs) + 1;
  if (w > widestWidth) {
    widestWidth = w;
    widestZ = z;
  }
}
// 最も広い断面の情報を表示
console.log(`\nWidest cross-section: z=${widestZ}, width=${widestWidth}`);
if (byZ[widestZ]) {
  const xs = byZ[widestZ].map(v => v.x);
  console.log(`  x range: ${Math.min(...xs)} - ${Math.max(...xs)}`);
}

// 3. z<30での脚の分離ギャップ検出
console.log(`\n--- Leg Separation (below z=30) ---`);
for (let z = Math.min(30, maxZ); z >= minZ; z--) {
  if (!byZ[z]) {
    // このZ断面にボクセルがない
    console.log(`  z=${z}: NO VOXELS`);
    continue;
  }
  // X座標をソートして範囲を取得
  const xs = byZ[z].map(v => v.x).sort((a, b) => a - b);
  const xMin = xs[0];
  const xMax = xs[xs.length - 1];

  // X方向のギャップ（ボクセルがないX座標）を検出
  const xSet = new Set(xs);
  const gaps = [];
  for (let x = xMin + 1; x < xMax; x++) {
    // このxでこのzにボクセルがあるか確認（全yにわたって）
    const hasVoxel = byZ[z].some(v => v.x === x);
    if (!hasVoxel) {
      gaps.push(x);
    }
  }
  if (gaps.length > 0) {
    // 連続するギャップを範囲としてまとめる
    const gapRanges = [];
    let gStart = gaps[0];
    let gEnd = gaps[0];
    for (let i = 1; i < gaps.length; i++) {
      if (gaps[i] === gEnd + 1) {
        gEnd = gaps[i];  // 連続している場合は範囲を拡大
      } else {
        gapRanges.push([gStart, gEnd]);  // 連続が途切れたら範囲を確定
        gStart = gaps[i];
        gEnd = gaps[i];
      }
    }
    gapRanges.push([gStart, gEnd]);
    // ギャップ範囲を表示
    console.log(`  z=${z}: x range ${xMin}-${xMax}, gaps: ${gapRanges.map(r => `${r[0]}-${r[1]}`).join(', ')}`);
  } else {
    // ギャップなし（脚がまだ分離していない）
    console.log(`  z=${z}: x range ${xMin}-${xMax}, no gap`);
  }
}
