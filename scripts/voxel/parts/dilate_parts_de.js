/**
 * dilate_parts_de.js
 *
 * ボディを覆うパーツを全方向に1ボクセル膨張（拡大）し、
 * 指定のZ/Y量でシフトするスクリプト。
 *
 * Usage: node scripts/dilate_parts_de.js <dz> [dy]
 * 例: node scripts/dilate_parts_de.js -5
 */
// ファイルシステムモジュール
const fs = require('fs');
// パス操作モジュール
const path = require('path');

// コマンドライン引数からZ, Yシフト量を取得
const DZ = parseInt(process.argv[2]);
const DY = parseInt(process.argv[3] || '0');
if (isNaN(DZ)) { console.error('Usage: node scripts/dilate_parts_de.js <dz> [dy]'); process.exit(1); }

// ボディを覆うパーツ → 1ボクセル膨張してからシフト
const DILATE_PARTS = [
  'armor_-_suit',                // スーツ
  'armor_-_suit_bra',            // スーツブラ
  'armor_-_suit_plates',         // スーツプレート
  'armor_-_arms',                // 腕防具
  'armor_-_legs',                // 脚防具
  'armor_-_shoulders',           // 肩防具
  'armor_-_shoulders_clavice',   // 鎖骨部分の肩防具
];

// その他のパーツ → シフトのみ（膨張なし）
const SHIFT_ONLY_PARTS = [
  'armor_-_belt_inner',          // ベルト（内側）
  'armor_-_belt_outer',          // ベルト（外側）
  'armor_-_belt_cape',           // ベルトケープ
  'armor_-_belt_scabbards',      // ベルト鞘
  'armor_-_cape',                // ケープ
];

// 6方向の隣接オフセット
const DIRS6 = [[-1,0,0],[1,0,0],[0,-1,0],[0,1,0],[0,0,-1],[0,0,1]];

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

// ボクセルを膨張（XYZ全方向に1ボクセル + Y方向にさらに1ボクセル）する関数
function dilate(voxels, sx, sy, sz) {
  // 第1パス: 全6方向に1ボクセル膨張
  let occupied = new Set();
  for (const v of voxels) occupied.add(`${v.x},${v.y},${v.z}`);

  let result = [...voxels];  // 元のボクセルをコピー
  let added = new Set();     // 追加済みの座標

  for (const v of voxels) {
    for (const [dx, dy, dz] of DIRS6) {
      const nx = v.x + dx, ny = v.y + dy, nz = v.z + dz;
      // グリッド範囲外ならスキップ
      if (nx < 0 || nx >= sx || ny < 0 || ny >= sy || nz < 0 || nz >= sz) continue;
      const nkey = `${nx},${ny},${nz}`;
      // 既に占有されているか追加済みならスキップ
      if (occupied.has(nkey) || added.has(nkey)) continue;
      added.add(nkey);
      // 隣接ボクセルの色を継承して追加
      result.push({ x: nx, y: ny, z: nz, c: v.c });
    }
  }

  // 第2パス: Y方向のみにさらに1ボクセル膨張（透け防止の厚み追加）
  occupied = new Set();
  for (const v of result) occupied.add(`${v.x},${v.y},${v.z}`);
  added = new Set();
  const yDirs = [[0,-1,0],[0,1,0]];  // Y方向のみ
  const extra = [];

  for (const v of result) {
    for (const [dx, dy, dz] of yDirs) {
      const nx = v.x + dx, ny = v.y + dy, nz = v.z + dz;
      if (ny < 0 || ny >= sy) continue;
      const nkey = `${nx},${ny},${nz}`;
      if (occupied.has(nkey) || added.has(nkey)) continue;
      added.add(nkey);
      extra.push({ x: nx, y: ny, z: nz, c: v.c });
    }
  }
  // 第1パスと第2パスの結果を結合
  return result.concat(extra);
}

// ボクセルをY, Z方向にシフトする関数
function shiftVoxels(voxels, dy, dz, sy, sz) {
  const shifted = [];
  let clipped = 0;  // グリッド外にクリップされたボクセル数
  for (const v of voxels) {
    const ny = v.y + dy, nz = v.z + dz;
    if (ny >= 0 && ny < sy && nz >= 0 && nz < sz) {
      shifted.push({ x: v.x, y: ny, z: nz, c: v.c });
    } else { clipped++; }
  }
  return { shifted, clipped };
}

// パスの設定
const BASE = path.join(__dirname, '..');
const DIR = path.join(BASE, 'public/box4');
const PREFIX = 'darkelfblader_arp';

// 操作内容を表示
console.log(`Dilate + Shift: Z${DZ >= 0 ? '+' : ''}${DZ}, Y${DY >= 0 ? '+' : ''}${DY}`);
console.log(`(Z: - = down, + = up | Y: + = backward, - = forward)\n`);

// パーツマニフェストを読み込み
const manifestPath = path.join(DIR, `${PREFIX}_parts.json`);
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

// 1パーツを処理する関数
function processPart(partKey, shouldDilate) {
  // 元ファイルのパス（originals/ディレクトリ）
  const srcPath = path.join(DIR, 'originals', `${PREFIX}_${partKey}.vox`);
  // 出力先のパス
  const dstPath = path.join(DIR, `${PREFIX}_${partKey}.vox`);

  // バックアップが存在しない場合は作成
  if (!fs.existsSync(srcPath)) {
    if (fs.existsSync(dstPath)) {
      fs.copyFileSync(dstPath, srcPath);
      console.log(`  Backed up: ${partKey}`);
    } else {
      console.log(`  SKIP (not found): ${partKey}`);
      return;
    }
  }

  // VOXファイルを読み込み
  const vox = readVox(srcPath);
  let voxels = vox.voxels;
  const origCount = voxels.length;

  // 膨張フラグに応じて膨張処理
  if (shouldDilate) {
    voxels = dilate(voxels, vox.sx, vox.sy, vox.sz);
  }

  // シフト処理
  const { shifted, clipped } = shiftVoxels(voxels, DY, DZ, vox.sy, vox.sz);
  // 結果を書き出し
  writeVox(dstPath, vox.sx, vox.sy, vox.sz, shifted, vox.palette);

  // マニフェストのボクセル数を更新
  const entry = manifest.find(p => p.key === partKey);
  if (entry) entry.voxels = shifted.length;

  // 結果を表示
  const tag = shouldDilate ? '[dilate+shift]' : '[shift only]';
  console.log(`  ${tag} ${partKey}: ${origCount} → ${shifted.length} (clipped: ${clipped})`);
}

// 膨張+シフト対象のパーツを処理
for (const p of DILATE_PARTS) processPart(p, true);
// シフトのみのパーツを処理
for (const p of SHIFT_ONLY_PARTS) processPart(p, false);

// マニフェストを保存
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
console.log('\nDone!');
