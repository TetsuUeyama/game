/**
 * fix_suit_top.js
 *
 * suit_topを修正するスクリプト: CEボディの腕+肩表面にシェルを生成。
 * suit_top = 指先から肩までのフィットした衣装。
 * カバレッジ: 全CEボディ腕表面ボクセル + 肩遷移領域。
 * 色はオリジナルHPのsuit_topから最寄り色を使用。
 *
 * Usage: node scripts/fix_suit_top.js
 */
// ファイルシステムモジュール
const fs = require('fs');
// パス操作モジュール
const path = require('path');

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

// CEボディ（HPグリッドにリマップ済み）とオリジナルsuit_topを読み込み
const body = readVox(path.join(BASE, 'public/box3-new/highpriestess_blender_rigged_body.vox'));
const suitTop = readVox(path.join(BASE, 'public/box3-new/highpriestess_blender_rigged_suit_top.vox'));
const SX = body.sx, SY = body.sy, SZ = body.sz;

console.log(`CE Body: ${body.voxels.length} voxels, grid: ${SX}x${SY}x${SZ}`);
console.log(`suit_top (original HP): ${suitTop.voxels.length} voxels`);

// ボディ構造を構築
const bodySet = new Set();
for (const v of body.voxels) bodySet.add(`${v.x},${v.y},${v.z}`);

// 6方向の隣接オフセット
const DIRS = [[-1,0,0],[1,0,0],[0,-1,0],[0,1,0],[0,0,-1],[0,0,1]];
// ボディ表面ボクセルを検出（少なくとも1つの空き隣接を持つボクセル）
const bodySurface = [];
for (const v of body.voxels) {
  for (const [dx, dy, dz] of DIRS) {
    if (!bodySet.has(`${v.x+dx},${v.y+dy},${v.z+dz}`)) {
      bodySurface.push(v);
      break;
    }
  }
}
console.log(`CE Body surface: ${bodySurface.length} voxels`);

// Z値ごとのボディ幅を分析して腕領域と体幹中心を検出
const bodyByZ = {};
for (const v of body.voxels) {
  if (!bodyByZ[v.z]) bodyByZ[v.z] = { xmin: v.x, xmax: v.x, sumX: 0, sumY: 0, n: 0 };
  const d = bodyByZ[v.z];
  d.xmin = Math.min(d.xmin, v.x);
  d.xmax = Math.max(d.xmax, v.x);
  d.sumX += v.x;
  d.sumY += v.y;
  d.n++;
}
// 各Z断面の幅と中心を計算
for (const z in bodyByZ) {
  const d = bodyByZ[z];
  d.w = d.xmax - d.xmin;     // X方向の幅
  d.cx = d.sumX / d.n;       // X中心
  d.cy = d.sumY / d.n;       // Y中心
}

// 体幹の中央値幅を計算（腕以外の基準）
const widths = Object.values(bodyByZ).map(d => d.w).sort((a, b) => a - b);
const medianW = widths[Math.floor(widths.length / 2)];
// 腕の閾値: 中央値の1.5倍以上の幅 = 腕が広がっているZ断面
const armThreshold = medianW * 1.5;

// 腕のZ断面と肩遷移のZ断面を識別
const armZLevels = new Set();
const shoulderZLevels = new Set();
for (const [zStr, d] of Object.entries(bodyByZ)) {
  const z = +zStr;
  if (d.w > armThreshold) {
    armZLevels.add(z);  // 幅が閾値を超えている = 腕レベル
  }
}

// 肩: 腕領域の上下3-4Z断面を遷移領域として追加
const armZmin = armZLevels.size > 0 ? Math.min(...armZLevels) : 0;
const armZmax = armZLevels.size > 0 ? Math.max(...armZLevels) : 0;
for (let z = armZmax + 1; z <= armZmax + 4; z++) {
  if (bodyByZ[z]) shoulderZLevels.add(z);
}
// 手首/手の遷移領域（腕の下2断面）も追加
for (let z = armZmin - 2; z < armZmin; z++) {
  if (bodyByZ[z]) shoulderZLevels.add(z);
}

console.log(`Arm Z: ${armZmin}~${armZmax} (${armZLevels.size} levels), threshold: w>${armThreshold.toFixed(0)}, median=${medianW}`);
console.log(`Shoulder Z: ${[...shoulderZLevels].sort((a,b)=>a-b).join(',')}`);

// 体幹のX範囲を決定（腕領域に近い非腕断面から）
const torsoRef = [];
for (let z = armZmax + 1; z <= armZmax + 5; z++) {
  if (bodyByZ[z] && !armZLevels.has(z)) torsoRef.push(bodyByZ[z]);
}
for (let z = armZmin - 1; z >= armZmin - 5; z--) {
  if (bodyByZ[z] && !armZLevels.has(z)) torsoRef.push(bodyByZ[z]);
}
let torsoXmin = 999, torsoXmax = 0;
if (torsoRef.length > 0) {
  torsoXmin = Math.min(...torsoRef.map(d => d.xmin));
  torsoXmax = Math.max(...torsoRef.map(d => d.xmax));
} else {
  // フォールバック: 中央値幅で中心配置
  const cx = Object.values(bodyByZ)[0].cx;
  torsoXmin = Math.round(cx - medianW / 2);
  torsoXmax = Math.round(cx + medianW / 2);
}
console.log(`Torso X boundaries: ${torsoXmin}~${torsoXmax}`);

// オリジナルHPのsuit_topから色を検索するマップ
const colorByZ = {};
for (const v of suitTop.voxels) {
  if (!colorByZ[v.z]) colorByZ[v.z] = [];
  colorByZ[v.z].push(v);
}
// 最寄りの衣装色を検索する関数
function getNearestColor(x, y, z) {
  let bestDist = Infinity, bestC = suitTop.voxels[0].c;
  for (let dz = 0; dz <= 15; dz++) {
    for (const sz of [z + dz, z - dz]) {
      const slice = colorByZ[sz];
      if (!slice) continue;
      for (const v of slice) {
        const d = Math.abs(v.x - x) + Math.abs(v.y - y) + Math.abs(v.z - z);
        if (d < bestDist) { bestDist = d; bestC = v.c; }
      }
      if (bestDist <= 3) return bestC;
    }
  }
  return bestC;
}

// 腕 + 肩表面にシェルを生成
const result = [];
const placed = new Set();
let armCount = 0, shoulderCount = 0;

for (const sv of bodySurface) {
  let cover = false;

  if (armZLevels.has(sv.z)) {
    // 腕のZ断面: 体幹中心の外側の表面ボクセルをカバー
    // （腕レベルの体幹中心は腕とボディの接続部分 — そこはカバーしない）
    const isArmX = (sv.x < torsoXmin) || (sv.x > torsoXmax);
    if (isArmX) cover = true;
  }

  if (shoulderZLevels.has(sv.z)) {
    // 肩遷移: より広い範囲をカバー
    cover = true;
  }

  if (!cover) continue;

  // 空き隣接にシェルボクセルを配置
  for (const [dx, dy, dz] of DIRS) {
    const nx = sv.x + dx, ny = sv.y + dy, nz = sv.z + dz;
    if (nx < 0 || nx >= SX || ny < 0 || ny >= SY || nz < 0 || nz >= SZ) continue;
    const nkey = `${nx},${ny},${nz}`;
    if (bodySet.has(nkey) || placed.has(nkey)) continue;
    placed.add(nkey);
    result.push({ x: nx, y: ny, z: nz, c: getNearestColor(nx, ny, nz) });
    if (armZLevels.has(sv.z)) armCount++;
    else shoulderCount++;
  }
}

console.log(`Arm shell: ${armCount}, Shoulder shell: ${shoulderCount}`);
console.log(`Total: ${result.length} voxels`);

// デバッグ: Z値ごとの分布を表示
const resultByZ = {};
for (const v of result) { resultByZ[v.z] = (resultByZ[v.z] || 0) + 1; }
const rZs = Object.keys(resultByZ).map(Number).sort((a,b)=>a-b);
console.log('Z distribution:');
for (const z of rZs) console.log(`  z=${z}: ${resultByZ[z]} voxels`);

// 結果をVOXファイルとして書き出し
writeVox(path.join(BASE, 'public/box3-new/highpriestess_blender_rigged_suit_top.vox'),
  SX, SY, SZ, result, suitTop.palette);
console.log('Written suit_top.vox');

// パーツマニフェストを更新
const manifestPath = path.join(BASE, 'public/box3-new/highpriestess_blender_rigged_parts.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const entry = manifest.find(p => p.key === 'suit_top');
if (entry) entry.voxels = result.length;
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
console.log('Updated manifest. Done!');
