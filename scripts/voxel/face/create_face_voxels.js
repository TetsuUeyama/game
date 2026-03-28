/**
 * create_face_voxels.js
 *
 * CEボディ表面に3Dボクセルアートの顔パーツを作成するスクリプト。
 * パーツは実際のボディ表面位置（顔の曲率に従う）に配置される。
 * x2グリッド（170x68x204）を使用 — CE耳と同じ座標系。
 *
 * Usage: node scripts/create_face_voxels.js <name> <output.vox>
 */
// ファイルシステムモジュール
const fs = require('fs');
// パス操作モジュール
const path = require('path');

// コマンドライン引数
const args = process.argv.slice(2);
const NAME = args[0] || 'qm';       // パレット名（デフォルト: qm）
const OUTPUT = args[1] || 'public/box4/queenmarika_face.vox';  // 出力パス

// ========================================================================
// CEベースボディを読み込んで顔表面を検出
// ========================================================================
// VOXファイルパーサー
function readVox(fp) {
  const buf = fs.readFileSync(fp);
  let off = 0;
  const readU32 = () => { const v = buf.readUInt32LE(off); off += 4; return v; };
  const readU8 = () => buf[off++];
  const readStr = n => { let s = ''; for (let i = 0; i < n; i++) s += String.fromCharCode(buf[off + i]); off += n; return s; };
  if (readStr(4) !== 'VOX ') throw 'Not VOX'; readU32();
  if (readStr(4) !== 'MAIN') throw 'No MAIN';
  const mc = readU32(); const mcc = readU32(); off += mc;
  const end = off + mcc;
  let sx = 0, sy = 0, sz = 0; const voxels = [];
  while (off < end) {
    const id = readStr(4); const cs = readU32(); readU32(); const ce = off + cs;
    if (id === 'SIZE') { sx = readU32(); sy = readU32(); sz = readU32(); }
    else if (id === 'XYZI') { const n = readU32(); for (let i = 0; i < n; i++) voxels.push({ x: readU8(), y: readU8(), z: readU8(), c: readU8() }); }
    off = ce;
  }
  return { sx, sy, sz, voxels };
}

const BASE = path.join(__dirname, '..');
// CEベースボディを読み込み
const body = readVox(path.join(BASE, 'public/box2/cyberpunk_elf_body_base.vox'));
console.log(`CE body: ${body.sx}x${body.sy}x${body.sz}`);

// 表面マップを構築: 各(x,z)での最小Y（前面表面）
const surfaceY = {};
for (const v of body.voxels) {
  const key = `${v.x},${v.z}`;
  if (surfaceY[key] === undefined || v.y < surfaceY[key]) {
    surfaceY[key] = v.y;
  }
}

// 顔中心Xを実際の顔表面から検出（z=85-92の前面ボクセルのX範囲）
let faceMinX = body.sx, faceMaxX = 0;
for (const v of body.voxels) {
  if (v.z >= 85 && v.z <= 92 && v.y <= 10) {
    if (v.x < faceMinX) faceMinX = v.x;
    if (v.x > faceMaxX) faceMaxX = v.x;
  }
}
// CE顔中心（微調整済み）
const bodyCenterX = (faceMinX + faceMaxX) / 2 + 0.5;
console.log(`Face X range: ${faceMinX}-${faceMaxX}, center: ${bodyCenterX}`);

// ========================================================================
// カラーパレット（QM参照写真から）
// ========================================================================
const PALETTES = {
  qm: {
    eye_white:   [220, 210, 205],  // 白目
    iris_outer:  [180, 140, 55],   // 虹彩外側
    iris_inner:  [140, 100, 35],   // 虹彩内側
    pupil:       [30, 18, 15],     // 瞳孔
    eyelid:      [185, 135, 118],  // まぶた
    eyelash:     [45, 28, 22],     // まつげ
    eyebrow:     [150, 115, 100],  // 眉毛
    nose_shadow: [150, 115, 110],  // 鼻の影
    nostril:     [125, 88, 82],    // 鼻孔
    lip_upper:   [200, 125, 118],  // 上唇
    lip_lower:   [185, 115, 108],  // 下唇
    lip_dark:    [170, 105, 98],   // 唇の暗い部分
    lip_line:    [165, 80, 75],    // 唇のライン
  }
};
const colors = PALETTES[NAME] || PALETTES.qm;

// ========================================================================
// x2グリッド（170x68x204）— CE耳と同じ
// ========================================================================
const MULT = 2;                    // 解像度倍率
const GX = body.sx * MULT;        // 170
const GY = body.sy * MULT;        // 68
const GZ = body.sz * MULT;        // 204

// x2座標でのボディ表面Yを取得する関数（ボディ表面を補間）
function getSurfaceY2(x2, z2) {
  const bx = Math.floor(x2 / MULT);
  const bz = Math.floor(z2 / MULT);
  const sy = surfaceY[`${bx},${bz}`];
  if (sy === undefined) return -1;
  return sy * MULT;  // x2座標での前面表面
}

// パーツボクセルの配列: {x2, z2, colorName}
const featureVoxels = [];

// 左右対称にパーツを追加するヘルパー（bodyCenterXを軸にミラー）
function addSymmetric(offsetFromCenter, z_body, colorName) {
  const x2_right = Math.round(bodyCenterX * MULT + offsetFromCenter);
  const x2_left = Math.round(bodyCenterX * MULT - offsetFromCenter - 1);
  const z2 = z_body * MULT;
  featureVoxels.push({ x2: x2_right, z2, color: colorName });
  if (x2_left !== x2_right) {
    featureVoxels.push({ x2: x2_left, z2, color: colorName });
  }
}

// 対称なピクセルアート行を描画するヘルパー
// pattern: 中心から外側への文字列（各文字はミラーされる）
function drawSymRow(z_body, z_sub, pattern, charMap) {
  const z2 = z_body * MULT + z_sub;
  const cx2 = Math.round(bodyCenterX * MULT);  // x2での中心 = 85

  for (let i = 0; i < pattern.length; i++) {
    const ch = pattern[i];
    if (ch === '.' || ch === ' ') continue;
    const colorName = charMap[ch];
    if (!colorName) continue;

    const xR = cx2 + i;         // 右側
    const xL = cx2 - 1 - i;     // 左側（ミラー）

    if (xR < GX) featureVoxels.push({ x2: xR, z2, color: colorName });
    if (xL >= 0 && xL !== xR) featureVoxels.push({ x2: xL, z2, color: colorName });
  }
}

// 目用の対称行描画ヘルパー（中心からオフセットした位置に目を配置）
function drawEyeRow(z_body, z_sub, eyeCenterOffset, pattern, charMap) {
  const z2 = z_body * MULT + z_sub;
  const cx2 = Math.round(bodyCenterX * MULT);

  for (let i = 0; i < pattern.length; i++) {
    const ch = pattern[i];
    if (ch === '.' || ch === ' ') continue;
    const colorName = charMap[ch];
    if (!colorName) continue;

    // 右目中心と左目中心
    const rEyeCenter = cx2 + eyeCenterOffset;
    const lEyeCenter = cx2 - 1 - eyeCenterOffset;

    // 右目: 右半分
    featureVoxels.push({ x2: rEyeCenter + i, z2, color: colorName });
    // 右目: 左半分（目内でのミラー）
    if (i > 0) featureVoxels.push({ x2: rEyeCenter - i, z2, color: colorName });
    // 左目: 左半分
    featureVoxels.push({ x2: lEyeCenter - i, z2, color: colorName });
    // 左目: 右半分（目内でのミラー）
    if (i > 0) featureVoxels.push({ x2: lEyeCenter + i, z2, color: colorName });
  }
}

// 目のカラーマップ
const eyeMap = {
  'W': 'eye_white', 'o': 'iris_outer', 'i': 'iris_inner',
  'P': 'pupil', 'L': 'eyelid', 'l': 'eyelash',
};

// ========================================================================
// 目 — body z≈89-90中心、中心から±5オフセット
// 各目は x1で約5幅、x2で10幅
// ========================================================================
const EYE_OFF = 5;  // 中心からのオフセット（x2座標）

// 目のパターン: 各文字は目の中心から外側（i=0=目の中心、両側にミラー）
drawEyeRow(85, 1, EYE_OFF, 'LLLL.',  eyeMap); // 下まぶた
drawEyeRow(86, 0, EYE_OFF, 'ooWL.',  eyeMap); // 虹彩下部
drawEyeRow(86, 1, EYE_OFF, 'PioWL',  eyeMap); // 瞳孔の行
drawEyeRow(87, 0, EYE_OFF, 'ooW..',  eyeMap); // 虹彩上部

// 外側の黒アクセント（手動配置、目内ミラーなし）
{
  const cx2 = Math.round(bodyCenterX * MULT);
  const rEye = cx2 + EYE_OFF;       // 右目中心
  const lEye = cx2 - 1 - EYE_OFF;   // 左目中心
  const z2 = 87 * MULT;
  // 各目の最外端に黒点
  featureVoxels.push({ x2: rEye + 4, z2, color: 'pupil' });
  featureVoxels.push({ x2: lEye - 4, z2, color: 'pupil' });
  // 斜め上外側にも黒点
  featureVoxels.push({ x2: rEye + 5, z2: z2 + 1, color: 'pupil' });
  featureVoxels.push({ x2: lEye - 5, z2: z2 + 1, color: 'pupil' });
}

// ========================================================================
// 眉毛 — z≈93-94、中心から±4-8オフセット
// ========================================================================
// 角度付き眉毛: 1行厚、内側から外側に約10°上昇
{
  const cx2 = Math.round(bodyCenterX * MULT);
  const rEye = cx2 + EYE_OFF;
  const lEye = cx2 - 1 - EYE_OFF;
  const baseZ2 = 88 * MULT;         // 下げた位置
  const browHalf = 4;               // 半幅（合計9px/眉）
  const angleRise = 2;              // 内→外のZ上昇量（約10°）

  for (let i = -browHalf; i <= browHalf; i++) {
    const t = (i + browHalf) / (2 * browHalf);  // 0=内側, 1=外側
    let dz = Math.round(t * angleRise);
    // 最外ピクセル: 1px下げる
    if (i === browHalf) dz -= 1;
    // 右眉: 内側(-)→外側(+)
    featureVoxels.push({ x2: rEye + i, z2: baseZ2 + dz, color: 'eyebrow' });
    // 左眉: ミラー
    featureVoxels.push({ x2: lEye - i, z2: baseZ2 + dz, color: 'eyebrow' });
  }
}

// ========================================================================
// 鼻 — 中心、z≈84-87（現在は削除済み）
// ========================================================================
const noseMap = { 's': 'nose_shadow', 'N': 'nostril' };

// ========================================================================
// 口 — 中心、z≈81-83
// ========================================================================
const mouthMap = {
  'U': 'lip_upper', 'L': 'lip_lower', 'D': 'lip_dark',
  'l': 'lip_line', 'c': 'lip_dark',
};
// 口: 中心から外側。drawSymRowのi=0は中心ペア（cx2とcx2-1）にマップ。
drawSymRow(81, 1, 'Lc',      mouthMap);  // 下部:      c,L,L,c (4px)
drawSymRow(82, 0, 'LLc',     mouthMap);  // 下唇:      c,L,L,L,L,c (6px)
drawSymRow(82, 1, 'llll',    mouthMap);  // 唇ライン:  l,l,l,l,l,l,l,l (8px)
// 上唇: 外端がわずかに下がる角度付き
{
  const cx2 = Math.round(bodyCenterX * MULT);
  const baseZ2 = 83 * MULT;
  const pattern = 'UUUUD';  // 5文字 = 合計10px
  for (let i = 0; i < pattern.length; i++) {
    const ch = pattern[i];
    const colorName = mouthMap[ch];
    if (!colorName) continue;
    // 外側2ピクセルは1px下げる
    const dz = (i >= 3) ? -1 : 0;
    const xR = cx2 + i;
    const xL = cx2 - 1 - i;
    featureVoxels.push({ x2: xR, z2: baseZ2 + dz, color: colorName });
    if (xL !== xR) featureVoxels.push({ x2: xL, z2: baseZ2 + dz, color: colorName });
  }
}

// ========================================================================
// ボディ表面上に最終ボクセルを構築
// ========================================================================
const colorIndexMap = {};  // カラー名 → パレットインデックス
const palette = [];        // カラーパレット
const voxels = [];         // 出力ボクセル

// カラー名からパレットインデックスを取得（新色なら追加）
function getColorIdx(name) {
  if (colorIndexMap[name] !== undefined) return colorIndexMap[name];
  const c = colors[name];
  if (!c) return 1;
  palette.push(c);
  colorIndexMap[name] = palette.length;
  return palette.length;
}

// 位置の重複排除セット
const posSet = new Set();

// 各パーツボクセルをボディ表面に配置
for (const fv of featureVoxels) {
  const { x2, z2, color } = fv;
  // グリッド範囲チェック
  if (x2 < 0 || x2 >= GX || z2 < 0 || z2 >= GZ) continue;

  // この位置のボディ表面Yを取得
  const surfY = getSurfaceY2(x2, z2);
  if (surfY < 0) continue;  // ボディ表面なし

  const ci = getColorIdx(color);

  // 表面の1つ手前（前面）にのみ配置（1ボクセル厚）
  const vy = surfY - 1;
  if (vy < 0 || vy >= GY) continue;
  const posKey = `${x2},${vy},${z2}`;
  if (posSet.has(posKey)) continue;  // 重複チェック
  posSet.add(posKey);
  voxels.push({ x: x2, y: vy, z: z2, c: ci });
}

console.log(`Face voxels: ${voxels.length}, Palette: ${palette.length} colors`);
console.log(`Grid: ${GX}x${GY}x${GZ} (same as CE x2)`);

// ========================================================================
// VOXファイルとして書き出し
// ========================================================================
function writeVox(filePath, sx, sy, sz, voxels, pal) {
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
  for (let i = 0; i < pal.length; i++) {
    rgbaData[i * 4] = pal[i][0]; rgbaData[i * 4 + 1] = pal[i][1];
    rgbaData[i * 4 + 2] = pal[i][2]; rgbaData[i * 4 + 3] = 255;
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

// 出力
writeVox(OUTPUT, GX, GY, GZ, voxels, palette);
console.log(`Written: ${OUTPUT}`);
// ビューア設定情報
console.log(`\nViewer: scale=SCALE/2, offset=FACE_FLOAT [0, 0, 0.004]`);
