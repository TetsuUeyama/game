/**
 * remap_shared_body_de.js
 *
 * CyberpunkElfのボディをDarkElfBladerのグリッドに平行移動のみでリマップするスクリプト。
 * ボディサイズは保持（スケーリングなし）し、同じボディを共有可能にする。
 *
 * Usage: node scripts/remap_shared_body_de.js
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

// グリッド情報を読み込み
const ceGrid = JSON.parse(fs.readFileSync(path.join(BASE, 'public/box2-new/cyberpunkelf_grid.json'), 'utf8'));  // CEグリッド
const deGrid = JSON.parse(fs.readFileSync(path.join(BASE, 'public/box4/darkelfblader_arp_grid.json'), 'utf8'));  // DEグリッド

// CEボディを読み込み
const ceBody = readVox(path.join(BASE, 'public/box2-new/cyberpunkelf_body.vox'));
console.log(`CE body: ${ceBody.sx}x${ceBody.sy}x${ceBody.sz}, ${ceBody.voxels.length} voxels`);

// DEボディのオリジナルを読み込み（バックアップから、リマップ済みのbody.voxではない）
const deBodyOrigPath = path.join(BASE, 'public/box4/originals/darkelfblader_arp_body_original.vox');
const deBodyPath = path.join(BASE, 'public/box4/darkelfblader_arp_body.vox');
// オリジナルバックアップがなければ現在のbody.voxをオリジナルとして使用（初回実行時）
const deBodySrc = fs.existsSync(deBodyOrigPath) ? deBodyOrigPath : deBodyPath;
const deBody = readVox(deBodySrc);
const deFull = readVox(path.join(BASE, 'public/box4/darkelfblader_arp.vox'));
console.log(`DE body (from ${path.basename(deBodySrc)}): ${deBody.sx}x${deBody.sy}x${deBody.sz}, ${deBody.voxels.length} voxels`);

// ボクセル位置からワールド空間での重心を計算する関数
function voxelCentroidWorld(voxels, grid) {
  let sx = 0, sy = 0, sz = 0;
  for (const v of voxels) {
    sx += grid.def_min[0] + (v.x + 0.5) * grid.voxel_size;
    sy += grid.def_min[1] + (v.y + 0.5) * grid.voxel_size;
    sz += grid.def_min[2] + (v.z + 0.5) * grid.voxel_size;
  }
  const n = voxels.length;
  return [sx / n, sy / n, sz / n];
}

// CE/DEボディの重心を計算
const ceCenter = voxelCentroidWorld(ceBody.voxels, ceGrid);
const deCenter = voxelCentroidWorld(deBody.voxels, deGrid);

// 平行移動オフセット: CE重心 → DE重心
const translation = [
  deCenter[0] - ceCenter[0],
  deCenter[1] - ceCenter[1],
  deCenter[2] - ceCenter[2],
];

console.log('CE body center:', ceCenter.map(v => v.toFixed(4)));
console.log('DE body center:', deCenter.map(v => v.toFixed(4)));
console.log('Translation (world):', translation.map(v => v.toFixed(4)));

// --- カラーマッピング: CEスキン → DEスキン（輝度ランク） ---
// DEボディの使用色を頻度順にソート
const deBodyColors = {};
for (const v of deBody.voxels) deBodyColors[v.c] = (deBodyColors[v.c] || 0) + 1;
const deSkinIndices = Object.entries(deBodyColors).sort((a, b) => b[1] - a[1]).map(([c]) => parseInt(c));

// DEスキン色を輝度順にソート
const deSkinColors = deSkinIndices.slice(0, 20).map(idx => ({
  idx,
  ...deBody.palette[idx - 1],
  lum: deBody.palette[idx - 1].r * 0.299 + deBody.palette[idx - 1].g * 0.587 + deBody.palette[idx - 1].b * 0.114
}));
deSkinColors.sort((a, b) => a.lum - b.lum);

// CEボディの使用色
const ceUsedColors = {};
for (const v of ceBody.voxels) ceUsedColors[v.c] = (ceUsedColors[v.c] || 0) + 1;
const ceSortedByCount = Object.entries(ceUsedColors).sort((a, b) => b[1] - a[1]).map(([c]) => parseInt(c));

// CE色を輝度順にソート
const ceLumSorted = ceSortedByCount.map(idx => ({
  idx,
  lum: ceBody.palette[idx - 1].r * 0.299 + ceBody.palette[idx - 1].g * 0.587 + ceBody.palette[idx - 1].b * 0.114
}));
ceLumSorted.sort((a, b) => a.lum - b.lum);

// 輝度ランクでCE→DEのカラーマッピングを構築
const colorMap = {};
for (let i = 0; i < ceLumSorted.length; i++) {
  const ratio = ceLumSorted.length > 1 ? i / (ceLumSorted.length - 1) : 0;
  const hpI = Math.round(ratio * (deSkinColors.length - 1));
  colorMap[ceLumSorted[i].idx] = deSkinColors[hpI].idx;
}

// カラーマッピングの上位5件を表示
console.log('Color mapping (CE→DE, top 5):');
for (const ce of ceSortedByCount.slice(0, 5)) {
  const de = colorMap[ce];
  const ceC = ceBody.palette[ce - 1];
  const deC = deBody.palette[de - 1];
  console.log(`  CE idx${ce} RGB(${ceC.r},${ceC.g},${ceC.b}) → DE idx${de} RGB(${deC.r},${deC.g},${deC.b})`);
}

// --- DEオリジナルボディからZ値ごとのY補正を構築 ---
// CEとDEのチビプロポーションが異なるため、頭と体で異なるYオフセットが必要
const deOrigYByZ = {};
for (const v of deBody.voxels) {
  if (!deOrigYByZ[v.z]) deOrigYByZ[v.z] = { sumY: 0, n: 0 };
  deOrigYByZ[v.z].sumY += v.y;
  deOrigYByZ[v.z].n++;
}

// --- リマップ ---
const TX = deGrid.gx, TY = deGrid.gy, TZ = deGrid.gz;
const ceVs = ceGrid.voxel_size;
const deVs = deGrid.voxel_size;

// 第1パス: Y補正なしでリマップし、CEボディのZ位置を取得
const firstPass = [];
for (const v of ceBody.voxels) {
  // CEボクセル → ワールド座標
  const wx = ceGrid.def_min[0] + (v.x + 0.5) * ceVs;
  const wy = ceGrid.def_min[1] + (v.y + 0.5) * ceVs;
  const wz = ceGrid.def_min[2] + (v.z + 0.5) * ceVs;
  // DE空間に平行移動
  const hx = wx + translation[0];
  const hy = wy + translation[1];
  const hz = wz + translation[2];
  // DEボクセル座標に変換
  const vx2 = Math.round((hx - deGrid.def_min[0]) / deVs - 0.5);
  const vy2 = Math.round((hy - deGrid.def_min[1]) / deVs - 0.5);
  const vz2 = Math.round((hz - deGrid.def_min[2]) / deVs - 0.5);
  firstPass.push({ x: vx2, y: vy2, z: vz2, c: v.c });
}

// リマップ済みCEボディのZ値ごとのY重心を計算
const ceRemapYByZ = {};
for (const v of firstPass) {
  if (v.z < 0 || v.z >= TZ) continue;
  if (!ceRemapYByZ[v.z]) ceRemapYByZ[v.z] = { sumY: 0, n: 0 };
  ceRemapYByZ[v.z].sumY += v.y;
  ceRemapYByZ[v.z].n++;
}

// Z値ごとのY補正: CEボディのY重心をDEボディのY重心に合わせる
// 手動の領域別オフセット
const BODY_EXTRA_Y = 3;   // 体/腕/脚: Y正方向 = 後方
const BODY_EXTRA_Z = -4;  // 体/腕/脚: 4ボクセル下げる
const HEAD_EXTRA_Y = 5;   // 頭: Y正方向 = 前方
const HEAD_EXTRA_Z = -6;  // 頭: 6ボクセル下げる
const NECK_Z = 80;        // 首の遷移開始Z
const HEAD_Z = 85;        // 頭部開始Z

const yCorrection = {};
for (const zStr in deOrigYByZ) {
  const z = +zStr;
  if (ceRemapYByZ[z] && ceRemapYByZ[z].n > 0) {
    const deAvgY = deOrigYByZ[z].sumY / deOrigYByZ[z].n;
    const ceAvgY = ceRemapYByZ[z].sumY / ceRemapYByZ[z].n;
    // 領域に応じた追加オフセット
    let extra = 0;
    if (z < NECK_Z) {
      extra = BODY_EXTRA_Y;
    } else if (z >= HEAD_Z) {
      extra = HEAD_EXTRA_Y;
    } else {
      // 首の遷移ゾーン: 線形補間
      const t = (z - NECK_Z) / (HEAD_Z - NECK_Z);
      extra = Math.round(BODY_EXTRA_Y + (HEAD_EXTRA_Y - BODY_EXTRA_Y) * t);
    }
    yCorrection[z] = Math.round(deAvgY - ceAvgY) + extra;
  }
}
// Y補正のサンプル値を表示
console.log('Y correction samples:');
const sampleZ = [10, 20, 30, 50, 70, 80, 90, 100];
for (const z of sampleZ) {
  if (yCorrection[z] !== undefined) console.log(`  z=${z}: shift Y by ${yCorrection[z]}`);
}

// 第2パス: Z値ごとのY補正 + 頭部Z補正を適用
const remapped = [];
const seen = new Set();
let clipped = 0;

for (const v of firstPass) {
  const vx2 = v.x;
  // Y補正を適用
  const vy2 = v.y + (yCorrection[v.z] || 0);
  // Z補正: 領域に応じた下方シフト
  let zShift = 0;
  if (v.z >= HEAD_Z) {
    zShift = HEAD_EXTRA_Z;
  } else if (v.z >= NECK_Z) {
    const t = (v.z - NECK_Z) / (HEAD_Z - NECK_Z);
    zShift = Math.round(BODY_EXTRA_Z + (HEAD_EXTRA_Z - BODY_EXTRA_Z) * t);
  } else {
    zShift = BODY_EXTRA_Z;
  }
  const vz2 = v.z + zShift;

  // グリッド範囲内なら追加
  if (vx2 >= 0 && vx2 < TX && vy2 >= 0 && vy2 < TY && vz2 >= 0 && vz2 < TZ) {
    const key = `${vx2},${vy2},${vz2}`;
    if (!seen.has(key)) {
      seen.add(key);
      remapped.push({ x: vx2, y: vy2, z: vz2, c: colorMap[v.c] || v.c });
    }
  } else {
    clipped++;
  }
}

// 結果を表示
console.log(`\nRemapped: ${remapped.length} voxels (from ${ceBody.voxels.length}), clipped: ${clipped}`);

// リマップ結果をVOXファイルとして書き出し
const dstPath = path.join(BASE, 'public/box4/darkelfblader_arp_body.vox');
writeVox(dstPath, TX, TY, TZ, remapped, deBody.palette);
console.log(`Written: ${dstPath}`);

// パーツマニフェストを更新
const manifestPath = path.join(BASE, 'public/box4/darkelfblader_arp_parts.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const bodyEntry = manifest.find(p => p.key === 'body');
if (bodyEntry) bodyEntry.voxels = remapped.length;
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
console.log('Updated manifest.');
console.log('\nDone!');
