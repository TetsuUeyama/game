/**
 * shift_parts_de.js
 *
 * DarkElfBladerの衣装パーツボクセルをシフトするスクリプト。
 *
 * Usage: node scripts/shift_parts_de.js <dz> [dy]
 *   dz: Zシフト量（負=下方向、正=上方向）
 *   dy: Yシフト量（正=後方、負=前方）[省略時: 0]
 *
 * 例: node scripts/shift_parts_de.js -2      → 全ボディパーツを2下げる
 *     node scripts/shift_parts_de.js -2 1    → 2下げて1後方へ
 */
// ファイルシステムモジュール
const fs = require('fs');
// パス操作モジュール
const path = require('path');

// コマンドライン引数からZシフト量を取得
const DZ = parseInt(process.argv[2]);
// コマンドライン引数からYシフト量を取得（省略時は0）
const DY = parseInt(process.argv[3] || '0');
// DZが数値でなければUsageを表示して終了
if (isNaN(DZ)) { console.error('Usage: node scripts/shift_parts_de.js <dz> [dy]'); process.exit(1); }

// シフト対象のボディ領域パーツキーリスト
const PARTS = [
  'armor_-_suit',                // スーツ
  'armor_-_suit_bra',            // スーツブラ
  'armor_-_suit_plates',         // スーツプレート
  'armor_-_arms',                // 腕防具
  'armor_-_legs',                // 脚防具
  'armor_-_shoulders',           // 肩防具
  'armor_-_shoulders_clavice',   // 鎖骨部分の肩防具
  'armor_-_belt_inner',          // ベルト（内側）
  'armor_-_belt_outer',          // ベルト（外側）
  'armor_-_belt_cape',           // ベルトケープ
  'armor_-_belt_scabbards',      // ベルト鞘
  'armor_-_cape',                // ケープ
];

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

// シフト方向の説明を表示
console.log(`Shifting body-region parts: Z${DZ >= 0 ? '+' : ''}${DZ}, Y${DY >= 0 ? '+' : ''}${DY}`);
console.log(`(Z: - = down, + = up | Y: + = backward, - = forward)\n`);

// パーツマニフェストを読み込み
const manifestPath = path.join(DIR, `${PREFIX}_parts.json`);
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

// 各パーツを処理
for (const partKey of PARTS) {
  // 元ファイルのパス（originals/ディレクトリ）
  const srcPath = path.join(DIR, 'originals', `${PREFIX}_${partKey}.vox`);
  // 出力先のパス
  const dstPath = path.join(DIR, `${PREFIX}_${partKey}.vox`);

  // バックアップが存在しない場合
  if (!fs.existsSync(srcPath)) {
    // 現在のファイルがあればバックアップとしてコピー
    if (fs.existsSync(dstPath)) {
      fs.copyFileSync(dstPath, srcPath);
      console.log(`  Backed up: ${partKey}`);
    } else {
      // ファイルが見つからない場合はスキップ
      console.log(`  SKIP (not found): ${partKey}`);
      continue;
    }
  }

  // 元ファイルを読み込み
  const vox = readVox(srcPath);
  // シフト処理
  const shifted = [];
  let clipped = 0;
  for (const v of vox.voxels) {
    // Y, Z座標をシフト
    const ny = v.y + DY, nz = v.z + DZ;
    // グリッド範囲内なら結果に追加
    if (ny >= 0 && ny < vox.sy && nz >= 0 && nz < vox.sz) {
      shifted.push({ x: v.x, y: ny, z: nz, c: v.c });
    } else { clipped++; }
  }
  // シフト結果を書き出し
  writeVox(dstPath, vox.sx, vox.sy, vox.sz, shifted, vox.palette);

  // マニフェストのボクセル数を更新
  const entry = manifest.find(p => p.key === partKey);
  if (entry) entry.voxels = shifted.length;

  // 結果を表示
  console.log(`  ${partKey}: ${vox.voxels.length} → ${shifted.length} (clipped: ${clipped})`);
}

// マニフェストを保存
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
console.log('\nDone! Reload browser (Ctrl+Shift+R) to see changes.');
