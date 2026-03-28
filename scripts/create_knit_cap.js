/**
 * create_knit_cap.js
 *
 * 高解像度ボディ用の1ボクセル厚のニットキャップを生成するスクリプト。
 * - 頭頂/冠部分をカバー
 * - 耳はカバーしない
 * - 前面はより下まで伸びる（おでこをカバー）
 * - 背面はさらに下まで伸びる（後頭部/うなじをカバー）
 *
 * Usage: node scripts/create_knit_cap.js
 */
// ファイルシステムモジュール
const fs = require('fs');

// ── 設定 ──────────────────────────────────────────────────────────
// 入出力パス
const BODY_PATH = 'public/box2/cyberpunk_elf_body_base_hires_sym.vox';
const OUT_PATH = 'public/box2/knit_cap.vox';

// 頭部中心座標（分析結果から）
const HEAD_CENTER_X = 92;
const HEAD_CENTER_Y = 27;

// キャップのZ制限（頭の位置によって異なる）
const CAP_TOP_Z = 999;             // 上部に制限なし
const CAP_FRONT_BOTTOM_Z = 180;    // 前面（おでこ）- 低い位置まで
const CAP_BACK_BOTTOM_Z = 168;     // 背面（うなじ）- さらに低い位置まで
const CAP_SIDE_BOTTOM_Z = 196;     // 側面 - 耳の上で停止

// 耳の除外範囲: z=195付近で頭部Xがx=60-123（耳含む）
// 「コア頭部」はY中間でx=73-110程度。耳はその外側に突出。
const EAR_Z_TOP = 197;
const EAR_Z_BOTTOM = 186;
const EAR_X_INNER_LEFT = 70;      // 左耳がこのX以下で始まる
const EAR_X_INNER_RIGHT = 113;    // 右耳がこのX以上で始まる

// キャップの色設定
const CAP_COLOR = { r: 160, g: 40, b: 45 };   // キャップ本体色
const BRIM_COLOR = { r: 130, g: 30, b: 35 };   // ツバ色
const BRIM_HEIGHT = 5;                           // ツバの高さ（ボクセル数）

// ── VOXパーサー ──────────────────────────────────────────────────────
function parseVox(buffer) {
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  let off = 0;
  const r32 = () => { const v = view.getUint32(off, true); off += 4; return v; };
  const r8 = () => view.getUint8(off++);
  const rStr = n => { let s = ''; for (let i = 0; i < n; i++) s += String.fromCharCode(view.getUint8(off + i)); off += n; return s; };
  rStr(4); r32();
  let sx = 0, sy = 0, sz = 0;
  const voxels = [];
  let palette = null;
  function readChunks(end) {
    while (off < end) {
      const id = rStr(4), cs = r32(), ccs = r32(), ce = off + cs;
      if (id === 'SIZE') { sx = r32(); sy = r32(); sz = r32(); }
      else if (id === 'XYZI') { const n = r32(); for (let i = 0; i < n; i++) voxels.push({ x: r8(), y: r8(), z: r8(), ci: r8() }); }
      else if (id === 'RGBA') { palette = []; for (let i = 0; i < 256; i++) { palette.push({ r: r8(), g: r8(), b: r8() }); r8(); } }
      off = ce; if (ccs > 0) readChunks(off + ccs);
    }
  }
  rStr(4); const mc = r32(), mcc = r32(); off += mc; readChunks(off + mcc);
  return { sx, sy, sz, voxels, palette };
}

// ── VOXライター ──────────────────────────────────────────────────────
function writeVox(filepath, sizeX, sizeY, sizeZ, voxels, palette) {
  function makeChunk(id, data) {
    const header = Buffer.alloc(12);
    header.write(id, 0);
    header.writeUInt32LE(data.length, 4);
    header.writeUInt32LE(0, 8);
    return Buffer.concat([header, data]);
  }
  const sizeBuf = Buffer.alloc(12);
  sizeBuf.writeUInt32LE(sizeX, 0); sizeBuf.writeUInt32LE(sizeY, 4); sizeBuf.writeUInt32LE(sizeZ, 8);
  const xyziBuf = Buffer.alloc(4 + voxels.length * 4);
  xyziBuf.writeUInt32LE(voxels.length, 0);
  for (let i = 0; i < voxels.length; i++) {
    const v = voxels[i];
    xyziBuf.writeUInt8(v.x, 4 + i * 4);
    xyziBuf.writeUInt8(v.y, 4 + i * 4 + 1);
    xyziBuf.writeUInt8(v.z, 4 + i * 4 + 2);
    xyziBuf.writeUInt8(v.ci, 4 + i * 4 + 3);
  }
  const rgbaBuf = Buffer.alloc(256 * 4);
  for (let i = 0; i < 256; i++) {
    const c = palette[i] || { r: 0, g: 0, b: 0 };
    rgbaBuf.writeUInt8(c.r, i * 4); rgbaBuf.writeUInt8(c.g, i * 4 + 1);
    rgbaBuf.writeUInt8(c.b, i * 4 + 2); rgbaBuf.writeUInt8(255, i * 4 + 3);
  }
  const mainContent = Buffer.concat([makeChunk('SIZE', sizeBuf), makeChunk('XYZI', xyziBuf), makeChunk('RGBA', rgbaBuf)]);
  const header = Buffer.alloc(8); header.write('VOX ', 0); header.writeUInt32LE(150, 4);
  const mainHeader = Buffer.alloc(12); mainHeader.write('MAIN', 0); mainHeader.writeUInt32LE(0, 4); mainHeader.writeUInt32LE(mainContent.length, 8);
  fs.writeFileSync(filepath, Buffer.concat([header, mainHeader, mainContent]));
  console.log(`Written: ${filepath} (${voxels.length} voxels, ${sizeX}x${sizeY}x${sizeZ})`);
}

// ── 位置に応じたキャップ下限Zを計算する関数 ─────────────────────────
function getCapBottomZ(x, y) {
  // 頭部中心からの方向
  const dx = x - HEAD_CENTER_X;
  const dy = y - HEAD_CENTER_Y;

  // 前後方向の補間: Y中心からの相対位置（-1=前面, +1=背面）
  const yNorm = (y - HEAD_CENTER_Y) / 20;

  // 側面方向: X中心からの距離（0=中心, 1=端）
  const xDist = Math.abs(dx);
  const sideNorm = Math.min(1, xDist / 20);

  // 側面領域（X方向に離れている）→ 耳の上で停止
  if (sideNorm > 0.6) {
    return CAP_SIDE_BOTTOM_Z;
  }

  // 前面領域（Y < 中心）→ おでこまで下がる
  if (yNorm < -0.2) {
    const frontFactor = Math.min(1, (-yNorm - 0.2) / 0.6);
    return Math.round(CAP_SIDE_BOTTOM_Z + (CAP_FRONT_BOTTOM_Z - CAP_SIDE_BOTTOM_Z) * frontFactor);
  }

  // 背面領域（Y > 中心）→ うなじまで下がる
  if (yNorm > 0.2) {
    const backFactor = Math.min(1, (yNorm - 0.2) / 0.6);
    return Math.round(CAP_SIDE_BOTTOM_Z + (CAP_BACK_BOTTOM_Z - CAP_SIDE_BOTTOM_Z) * backFactor);
  }

  // 遷移ゾーン
  return CAP_SIDE_BOTTOM_Z;
}

// ── 耳領域の判定関数 ──────────────────────────────────────────────
function isEarRegion(x, y, z) {
  if (z < EAR_Z_BOTTOM || z > EAR_Z_TOP) return false;
  // 耳は側面（低い/高いX）の中~後方Yにある
  if (x < EAR_X_INNER_LEFT || x > EAR_X_INNER_RIGHT) return true;
  return false;
}

// ── メイン処理 ──────────────────────────────────────────────────────
console.log('Loading body:', BODY_PATH);
const bodyBuf = fs.readFileSync(BODY_PATH);
const body = parseVox(bodyBuf);
console.log(`Body: ${body.sx}x${body.sy}x${body.sz}, ${body.voxels.length} voxels`);

// ボディの占有セットを構築
const bodySet = new Set();
for (const v of body.voxels) {
  bodySet.add(`${v.x},${v.y},${v.z}`);
}

// 頭頂のZ座標を取得
let maxZ = 0;
for (const v of body.voxels) { if (v.z > maxZ) maxZ = v.z; }
console.log(`Head top Z: ${maxZ}`);

// キャップ領域の表面ボクセルを検出
const DIRS = [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]];
const capSet = new Set();
const capVoxels = [];

// 頭部領域の各ボディボクセルについて、表面ならキャップボクセルを外側に配置
for (const v of body.voxels) {
  // この位置でのキャップ下限Zを取得
  const bottomZ = getCapBottomZ(v.x, v.y);
  if (v.z < bottomZ) continue;

  // 耳領域はスキップ
  if (isEarRegion(v.x, v.y, v.z)) continue;

  // 表面ボクセルか判定
  let isSurface = false;
  for (const [dx, dy, dz] of DIRS) {
    if (!bodySet.has(`${v.x+dx},${v.y+dy},${v.z+dz}`)) {
      isSurface = true;
      break;
    }
  }
  if (!isSurface) continue;

  // 空き隣接にキャップボクセルを配置
  for (const [dx, dy, dz] of DIRS) {
    const nx = v.x + dx, ny = v.y + dy, nz = v.z + dz;
    // 隣接位置でのキャップ下限を確認
    const nBottomZ = getCapBottomZ(nx, ny);
    if (nz < nBottomZ) continue;
    // 耳領域はスキップ
    if (isEarRegion(nx, ny, nz)) continue;

    const key = `${nx},${ny},${nz}`;
    if (bodySet.has(key)) continue;    // ボディ内部
    if (capSet.has(key)) continue;     // 既にキャップあり
    capSet.add(key);
    capVoxels.push({ x: nx, y: ny, z: nz });
  }
}

console.log(`Cap voxels: ${capVoxels.length}`);

// パレットを設定（キャップ本体色とツバ色）
const palette = [CAP_COLOR, BRIM_COLOR];
while (palette.length < 256) palette.push({ r: 0, g: 0, b: 0 });

// ツバの着色: 各位置のローカル下限からBRIM_HEIGHT以内ならツバ色
let minCapZ = 999;
for (const v of capVoxels) { if (v.z < minCapZ) minCapZ = v.z; }

const outputVoxels = capVoxels.map(v => {
  const localBottom = getCapBottomZ(v.x, v.y);
  const isBrim = v.z < localBottom + BRIM_HEIGHT;
  return { x: v.x, y: v.y, z: v.z, ci: isBrim ? 2 : 1 };  // 2=ツバ, 1=本体
});

// VOXファイルとして書き出し
writeVox(OUT_PATH, body.sx, body.sy, body.sz, outputVoxels, palette);
console.log('Done!');
