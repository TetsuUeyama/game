/**
 * fix_hair_shape_de.js
 *
 * DarkElfBladerの髪の形状を修正するスクリプト:
 * 1. 頭頂部（z>=80）: X方向を1.5倍拡大（チビ頭のスケールに合わせる）
 * 2. 垂れ下がり（z<=65）: 内部をエロージョンして細くする
 * 3. 色を暗くする（65%の明るさ、バリエーション維持）
 * 4. Y+1シフト（後方）
 *
 * originals/から読み込み、アクティブファイルに書き出す。
 * Usage: node scripts/fix_hair_shape_de.js
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

// パスの設定
const BASE = path.join(__dirname, '..');
const DIR = path.join(BASE, 'public/box4');
const PREFIX = 'darkelfblader_arp';

// 元の髪VOXを読み込み
const hair = readVox(path.join(DIR, 'originals', `${PREFIX}_hair.vox`));
const SX = hair.sx, SY = hair.sy, SZ = hair.sz;

console.log(`Hair original: ${hair.voxels.length} voxels, grid: ${SX}x${SY}x${SZ}`);

// --- Z値ごとの髪データを構築 ---
const hairByZ = {};
for (const v of hair.voxels) {
  if (!hairByZ[v.z]) hairByZ[v.z] = [];
  hairByZ[v.z].push(v);
}

// --- 処理パラメータ ---
const CROWN_Z_START = 80;       // 頭頂部開始Z
const CROWN_TRANSITION = 78;    // 遷移ゾーン（78-80で徐々にスケール）
const HANGING_Z_END = 65;       // 垂れ下がりの上限Z
const CROWN_SCALE_X = 1.5;      // 頭頂部のX拡大率（チビ頭と一致）

// 結果ボクセルの配列と重複チェック用セット
const resultVoxels = [];
const placed = new Set();

// 範囲チェック付きでボクセルを追加するヘルパー関数
function addVoxel(x, y, z, c) {
  x = Math.round(x);
  if (x < 0 || x >= SX || y < 0 || y >= SY || z < 0 || z >= SZ) return;
  const key = `${x},${y},${z}`;
  if (placed.has(key)) return;
  placed.add(key);
  resultVoxels.push({ x, y, z, c });
}

let crownExpanded = 0;    // 頭頂部で処理されたボクセル数
let hangingEroded = 0;    // 垂れ下がり部で除去されたボクセル数

// 各Z断面を処理
for (let z = 0; z < SZ; z++) {
  const slice = hairByZ[z];
  if (!slice || slice.length === 0) continue;

  if (z >= CROWN_TRANSITION) {
    // --- 頭頂部: スライス中心からX方向に外側にスケーリング ---
    // 遷移ゾーンでは1.0からCROWN_SCALE_Xに徐々にスケール
    let scale;
    if (z >= CROWN_Z_START) {
      scale = CROWN_SCALE_X;  // フルスケール
    } else {
      // 遷移ゾーンでの線形補間
      const t = (z - CROWN_TRANSITION) / (CROWN_Z_START - CROWN_TRANSITION);
      scale = 1.0 + t * (CROWN_SCALE_X - 1.0);
    }

    // このZ断面の髪のX範囲と中心を計算
    const hairXmin = Math.min(...slice.map(v => v.x));
    const hairXmax = Math.max(...slice.map(v => v.x));
    const hairCx = (hairXmin + hairXmax) / 2;

    // 各ボクセルをスケーリングして配置
    for (const v of slice) {
      const relX = v.x - hairCx;  // 中心からの相対X
      const newX = Math.round(hairCx + relX * scale);  // スケール適用
      addVoxel(newX, v.y, v.z, v.c);
      crownExpanded++;

      // ギャップ防止: 中間位置にも充填
      if (scale > 1.1) {
        for (let frac = -0.4; frac <= 0.4; frac += 0.2) {
          const fillX = Math.round(hairCx + (relX + frac) * scale);
          addVoxel(fillX, v.y, v.z, v.c);
        }
      }
    }

    // Y行ごとの水平ギャップを充填
    const rowsByY = {};
    for (const v of resultVoxels) {
      if (v.z !== z) continue;
      if (!rowsByY[v.y]) rowsByY[v.y] = [];
      rowsByY[v.y].push(v.x);
    }
    for (const y in rowsByY) {
      const xs = [...new Set(rowsByY[y])].sort((a, b) => a - b);
      for (let i = 0; i < xs.length - 1; i++) {
        const gap = xs[i + 1] - xs[i];
        // 1-3ボクセルのギャップを充填
        if (gap > 1 && gap <= 3) {
          const nearestV = slice.reduce((best, v2) => {
            const d = Math.abs(v2.y - +y) + Math.abs(v2.x - (xs[i] + xs[i+1]) / 2);
            return d < best.d ? { d, c: v2.c } : best;
          }, { d: Infinity, c: slice[0].c });
          for (let fx = xs[i] + 1; fx < xs[i + 1]; fx++) {
            addVoxel(fx, +y, z, nearestV.c);
          }
        }
      }
    }

  } else if (z <= HANGING_Z_END) {
    // --- 垂れ下がり部: 内部をエロージョンして細くする ---
    const sliceSet = new Set();
    for (const v of slice) sliceSet.add(`${v.x},${v.y}`);

    for (const v of slice) {
      // XY方向の隣接数をカウント
      let neighbors = 0;
      for (const [dx, dy] of [[-1,0],[1,0],[0,-1],[0,1]]) {
        if (sliceSet.has(`${v.x+dx},${v.y+dy}`)) neighbors++;
      }

      // 完全に囲まれたボクセル（4隣接）を除去
      if (neighbors >= 4) {
        hangingEroded++;
        continue;
      }

      // 太いX範囲の内部ボクセルを除去
      let xmin = v.x, xmax = v.x;
      for (let tx = v.x - 1; sliceSet.has(`${tx},${v.y}`); tx--) xmin = tx;
      for (let tx = v.x + 1; sliceSet.has(`${tx},${v.y}`); tx++) xmax = tx;
      const xWidth = xmax - xmin + 1;

      if (xWidth >= 5) {
        const relX = v.x - xmin;
        // 太い房の深い内部（端2ボクセルを除く）を除去
        if (relX >= 2 && relX < xWidth - 2) {
          hangingEroded++;
          continue;
        }
      }

      addVoxel(v.x, v.y, v.z, v.c);
    }
  } else {
    // --- 中間エリア（z=66-77）: 側面の房を細くする ---
    const sliceXs = slice.map(v => v.x);
    const sliceXmin = Math.min(...sliceXs);
    const sliceXmax = Math.max(...sliceXs);
    const sliceCx = Math.round((sliceXmin + sliceXmax) / 2);
    const SIDE_MARGIN = 3;  // 中心から3ボクセル以上離れた領域

    for (const v of slice) {
      const isLeftSide = v.x < sliceCx - SIDE_MARGIN;
      const isRightSide = v.x > sliceCx + SIDE_MARGIN;

      if (isLeftSide || isRightSide) {
        // 側面の房: 端から2ボクセルのみ保持、内部を除去
        if (isLeftSide) {
          let edgeX = v.x;
          for (const sv of slice) {
            if (sv.y === v.y && sv.x < edgeX) edgeX = sv.x;
          }
          if (v.x - edgeX >= 2) {
            // Y方向も太い場合はY内部も除去
            const sameXZ = slice.filter(sv => sv.x === v.x && sv.z === v.z);
            const yMin = Math.min(...sameXZ.map(sv => sv.y));
            const yMax = Math.max(...sameXZ.map(sv => sv.y));
            const yW = yMax - yMin + 1;
            if (yW >= 4 && v.y > yMin + 1 && v.y < yMax - 1) {
              hangingEroded++;
              continue;
            }
            hangingEroded++;
            continue;
          }
        } else {
          // 右側も同じロジック
          let edgeX = v.x;
          for (const sv of slice) {
            if (sv.y === v.y && sv.x > edgeX) edgeX = sv.x;
          }
          if (edgeX - v.x >= 2) {
            const sameXZ = slice.filter(sv => sv.x === v.x && sv.z === v.z);
            const yMin = Math.min(...sameXZ.map(sv => sv.y));
            const yMax = Math.max(...sameXZ.map(sv => sv.y));
            const yW = yMax - yMin + 1;
            if (yW >= 4 && v.y > yMin + 1 && v.y < yMax - 1) {
              hangingEroded++;
              continue;
            }
            hangingEroded++;
            continue;
          }
        }
      }

      addVoxel(v.x, v.y, v.z, v.c);
    }
  }
}

console.log(`Crown expanded: ${crownExpanded} voxels processed`);
console.log(`Hanging eroded: ${hangingEroded} voxels removed`);
console.log(`After crown+erosion: ${resultVoxels.length} voxels`);

// --- 前髪（バング）を生成 ---
// ヘアラインから前方（低いY方向）に垂れ下がる前髪を追加
const BANGS_Z_TOP = 95;       // ヘアライン上端Z
const BANGS_Z_BOTTOM = 82;    // 前髪の垂れ下がり下端Z
const BANGS_X_MIN = 63;       // 前髪のX範囲（おでこの幅、1.5倍拡大後）
const BANGS_X_MAX = 82;
const BANGS_Y_EXTEND = 7;     // 現在の前端からの前方延長ボクセル数

// 各(x,z)での現在の前面エッジ（最小Y）を検出
const frontEdge = {};
for (const v of resultVoxels) {
  if (v.z < BANGS_Z_BOTTOM || v.z > BANGS_Z_TOP) continue;
  if (v.x < BANGS_X_MIN || v.x > BANGS_X_MAX) continue;
  const key = `${v.x},${v.z}`;
  if (!frontEdge[key] || v.y < frontEdge[key].yMin) {
    frontEdge[key] = { yMin: v.y, c: v.c };
  }
}

// 前髪ボクセルを追加
let bangsAdded = 0;
for (let z = BANGS_Z_BOTTOM; z <= BANGS_Z_TOP; z++) {
  const zRatio = (z - BANGS_Z_BOTTOM) / (BANGS_Z_TOP - BANGS_Z_BOTTOM);
  // ベル曲線: z≈87-90（zRatio≈0.4-0.6）で最も長い
  const extend = Math.round(BANGS_Y_EXTEND * (1.0 - Math.abs(zRatio - 0.5) * 1.5));
  if (extend <= 0) continue;

  for (let x = BANGS_X_MIN; x <= BANGS_X_MAX; x++) {
    const key = `${x},${z}`;
    const edge = frontEdge[key];
    if (!edge) continue;

    // 左右端でのテーパー（先細り）
    const xCenter = (BANGS_X_MIN + BANGS_X_MAX) / 2;
    const xDist = Math.abs(x - xCenter) / ((BANGS_X_MAX - BANGS_X_MIN) / 2);
    const xTaper = Math.max(0, Math.round(extend * (1.0 - xDist * 0.6)));
    if (xTaper <= 0) continue;

    // 前方にボクセルを追加
    for (let dy = 1; dy <= xTaper; dy++) {
      addVoxel(x, edge.yMin - dy, z, edge.c);
      bangsAdded++;
    }
  }
}

console.log(`Bangs added: ${bangsAdded} voxels`);

// --- 髪全体をY方向に1ボクセル膨張（前後に厚み追加） ---
const beforeDilate = resultVoxels.length;
const dilateSource = [...resultVoxels];
for (const v of dilateSource) {
  for (const dy of [-1, 1]) {
    addVoxel(v.x, v.y + dy, v.z, v.c);
  }
}
console.log(`Y-dilate: ${beforeDilate} → ${resultVoxels.length} (+${resultVoxels.length - beforeDilate})`);
console.log(`Result before shift: ${resultVoxels.length} voxels`);

// --- パレットを暗くする（65%の明るさ） ---
const usedIndices = new Set();
for (const v of resultVoxels) usedIndices.add(v.c);
if (hair.palette) {
  const factor = 0.65;
  for (const idx of usedIndices) {
    const p = hair.palette[idx - 1];
    if (p) {
      p.r = Math.round(Math.max(0, Math.min(255, p.r * factor)));
      p.g = Math.round(Math.max(0, Math.min(255, p.g * factor)));
      p.b = Math.round(Math.max(0, Math.min(255, p.b * factor)));
    }
  }
  console.log(`Darkened ${usedIndices.size} palette entries (factor=${factor})`);
}

// --- Y+1シフト（後方へ） ---
const DY = 1;
const shifted = [];
let clipped = 0;
for (const v of resultVoxels) {
  const ny = v.y + DY;
  if (ny >= 0 && ny < SY) {
    shifted.push({ x: v.x, y: ny, z: v.z, c: v.c });
  } else { clipped++; }
}
console.log(`After Y+${DY} shift: ${shifted.length} voxels (clipped: ${clipped})`);

// --- 結果を書き出し ---
const dstPath = path.join(DIR, `${PREFIX}_hair.vox`);
writeVox(dstPath, SX, SY, SZ, shifted, hair.palette);
console.log(`Written: ${dstPath}`);

// 検証: Z断面ごとの幅を表示
const byZ = {};
for (const v of shifted) {
  if (!byZ[v.z]) byZ[v.z] = { xmin: v.x, xmax: v.x, n: 0 };
  byZ[v.z].xmin = Math.min(byZ[v.z].xmin, v.x);
  byZ[v.z].xmax = Math.max(byZ[v.z].xmax, v.x);
  byZ[v.z].n++;
}
// 頭頂部の幅を表示
console.log('\nCrown width after fix:');
for (let z = 78; z <= 100; z += 2) {
  const d = byZ[z];
  if (!d) continue;
  console.log(`  z=${z}: w=${d.xmax-d.xmin+1} [${d.xmin},${d.xmax}] n=${d.n}`);
}
// 垂れ下がり部のボクセル数を表示
console.log('Hanging strand count:');
for (let z = 44; z <= 65; z += 3) {
  const d = byZ[z];
  if (!d) continue;
  console.log(`  z=${z}: w=${d.xmax-d.xmin+1} n=${d.n}`);
}

// パーツマニフェストを更新
const manifestPath = path.join(DIR, `${PREFIX}_parts.json`);
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const entry = manifest.find(p => p.key === 'hair');
if (entry) entry.voxels = shifted.length;
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
