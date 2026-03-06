/**
 * バスケ選手のボディパーツ + 頭サブパーツ .vox 生成スクリプト
 *
 * node scripts/generateVoxParts.js
 *
 * VOX座標系: X=左右, Y=奥行き(前方=-Y), Z=上(→localY)
 *
 * 頭サブパーツはすべて同一グリッド座標で生成し、
 * 同じ位置に重ねて表示するだけで正しくアラインする。
 */

const fs = require("fs");
const path = require("path");

const OUT_DIR = path.join(__dirname, "..", "public", "box");

// ========================================================================
// Palette
// ========================================================================
function makePalette() {
  const pal = new Uint8Array(256 * 4);
  const set = (idx, r, g, b) => {
    const i = (idx - 1) * 4;
    pal[i] = r; pal[i + 1] = g; pal[i + 2] = b; pal[i + 3] = 255;
  };
  set(1, 51, 102, 230);   // 1: team primary
  set(2, 38, 77, 179);    // 2: team dark
  set(3, 245, 204, 163);  // 3: skin
  set(4, 51, 102, 230);   // 4: shorts
  set(5, 240, 240, 240);  // 5: shoe white
  set(6, 255, 255, 255);  // 6: white
  set(7, 30, 30, 30);     // 7: black
  set(8, 240, 240, 240);  // 8: socks
  set(9, 200, 200, 200);  // 9: sole gray
  set(10, 220, 180, 140); // 10: skin shadow
  set(11, 40, 30, 20);    // 11: hair dark
  set(12, 60, 45, 30);    // 12: hair highlight
  set(13, 255, 255, 255); // 13: eye white
  set(14, 20, 20, 20);    // 14: pupil / eyebrow
  set(15, 200, 80, 80);   // 15: lip
  set(16, 230, 185, 145); // 16: skin mid
  set(17, 200, 160, 120); // 17: skin dark
  set(18, 180, 50, 50);   // 18: headband red
  set(19, 80, 60, 40);    // 19: hair medium brown
  set(20, 20, 15, 10);    // 20: hair very dark
  set(21, 100, 80, 55);   // 21: hair light brown
  set(22, 150, 120, 80);  // 22: hair blonde-ish
  set(23, 245, 245, 245); // 23: teeth white
  return pal;
}

// ========================================================================
// VOX writer
// ========================================================================
function writeVox(filePath, sizeX, sizeY, sizeZ, voxels, palette) {
  const xyziContentSize = 4 + voxels.length * 4;
  const mainChildrenSize = (12 + 12) + (12 + xyziContentSize) + (12 + 1024);
  const totalSize = 8 + 12 + mainChildrenSize;
  const buf = Buffer.alloc(totalSize);
  let off = 0;
  const ws = (s) => { buf.write(s, off, "ascii"); off += 4; };
  const w32 = (v) => { buf.writeUInt32LE(v, off); off += 4; };
  const w8 = (v) => { buf.writeUInt8(v, off); off += 1; };

  ws("VOX "); w32(150);
  ws("MAIN"); w32(0); w32(mainChildrenSize);
  ws("SIZE"); w32(12); w32(0); w32(sizeX); w32(sizeY); w32(sizeZ);
  ws("XYZI"); w32(xyziContentSize); w32(0); w32(voxels.length);
  for (const v of voxels) { w8(v.x); w8(v.y); w8(v.z); w8(v.colorIndex); }
  ws("RGBA"); w32(1024); w32(0);
  for (let i = 0; i < 256 * 4; i++) w8(palette[i] || 0);

  fs.writeFileSync(filePath, buf);
  console.log(`  ${path.relative(OUT_DIR, filePath)}: ${sizeX}x${sizeY}x${sizeZ}, ${voxels.length} voxels`);
}

// ========================================================================
// Shape helpers (VOX: X=LR, Y=depth, Z=up)
// ========================================================================
function cylinder(cx, cy, cz, radius, height, colorIndex, voxels) {
  const r2 = radius * radius;
  for (let z = 0; z < height; z++)
    for (let x = -radius; x <= radius; x++)
      for (let y = -radius; y <= radius; y++)
        if (x * x + y * y <= r2)
          voxels.push({ x: cx + x, y: cy + y, z: cz + z, colorIndex });
}

function octCylinder(cx, cy, cz, radius, height, colorIndex, voxels, shrink = 0.15) {
  for (let z = 0; z < height; z++)
    for (let x = -radius; x <= radius; x++)
      for (let y = -radius; y <= radius; y++) {
        const d = Math.sqrt(x * x + y * y);
        if (d > radius) continue;
        const a = Math.atan2(y, x);
        if (d <= radius * (1 - Math.abs(Math.sin(2 * a)) * shrink))
          voxels.push({ x: cx + x, y: cy + y, z: cz + z, colorIndex });
      }
}

function sphere(cx, cy, cz, radius, colorIndex, voxels) {
  const r2 = radius * radius;
  for (let x = -radius; x <= radius; x++)
    for (let y = -radius; y <= radius; y++)
      for (let z = -radius; z <= radius; z++)
        if (x * x + y * y + z * z <= r2)
          voxels.push({ x: cx + x, y: cy + y, z: cz + z, colorIndex });
}

function box(x0, y0, z0, w, d, h, colorIndex, voxels) {
  for (let x = 0; x < w; x++)
    for (let y = 0; y < d; y++)
      for (let z = 0; z < h; z++)
        voxels.push({ x: x0 + x, y: y0 + y, z: z0 + z, colorIndex });
}

function dedup(voxels) {
  const map = new Map();
  for (const v of voxels) map.set(`${v.x},${v.y},${v.z}`, v);
  return [...map.values()];
}

function normalize(voxels) {
  if (!voxels.length) return { voxels: [], sx: 0, sy: 0, sz: 0 };
  let mnX = Infinity, mnY = Infinity, mnZ = Infinity;
  let mxX = -Infinity, mxY = -Infinity, mxZ = -Infinity;
  for (const v of voxels) {
    if (v.x < mnX) mnX = v.x; if (v.x > mxX) mxX = v.x;
    if (v.y < mnY) mnY = v.y; if (v.y > mxY) mxY = v.y;
    if (v.z < mnZ) mnZ = v.z; if (v.z > mxZ) mxZ = v.z;
  }
  return {
    voxels: voxels.map(v => ({ x: v.x - mnX, y: v.y - mnY, z: v.z - mnZ, colorIndex: v.colorIndex })),
    sx: mxX - mnX + 1, sy: mxY - mnY + 1, sz: mxZ - mnZ + 1,
  };
}

// ========================================================================
// 頭パーツ共通グリッド
// 全サブパーツを同じ座標空間で生成し、同一グリッドに正規化する
// ========================================================================
const HEAD_R = 12;
const HEAD_SY = 0.85;
const HEAD_SZ = 1.1;

// 固定グリッド (全サブパーツ共通)
const HG = { mnX: -18, mxX: 18, mnY: -16, mxY: 16, mnZ: -4, mxZ: 32 };

/** 固定グリッドに正規化（アンカーボクセル2つで境界固定） */
function normalizeToHeadGrid(rawVoxels) {
  // フィルタ: グリッド外のボクセルを除去
  const voxels = rawVoxels.filter(v =>
    v.x >= HG.mnX && v.x <= HG.mxX &&
    v.y >= HG.mnY && v.y <= HG.mxY &&
    v.z >= HG.mnZ && v.z <= HG.mxZ
  );

  // グリッド原点にシフト
  const shifted = voxels.map(v => ({
    x: v.x - HG.mnX, y: v.y - HG.mnY, z: v.z - HG.mnZ, colorIndex: v.colorIndex,
  }));

  return {
    voxels: shifted,
    sx: HG.mxX - HG.mnX + 1,
    sy: HG.mxY - HG.mnY + 1,
    sz: HG.mxZ - HG.mnZ + 1,
  };
}

// ========================================================================
// 頭ベース（肌色球体 + 首 + 耳）
// ========================================================================
function headBase() {
  const voxels = [];
  const R = HEAD_R;
  for (let x = -R; x <= R; x++)
    for (let y = -R; y <= R; y++)
      for (let z = -R; z <= R; z++) {
        const nx = x / R, ny = y / (R * HEAD_SY), nz = z / (R * HEAD_SZ);
        if (nx * nx + ny * ny + nz * nz <= 1.0)
          voxels.push({ x, y, z: z + R, colorIndex: 3 });
      }
  // 首
  for (let z = -3; z < 0; z++)
    for (let x = -5; x <= 5; x++)
      for (let y = -5; y <= 5; y++)
        if (x * x + y * y <= 25)
          voxels.push({ x, y, z: z + R, colorIndex: 3 });
  // 耳
  for (let ez = R - 1; ez <= R + 2; ez++) {
    for (const side of [-1, 1]) {
      voxels.push({ x: side * (R + 1), y: 0, z: ez, colorIndex: 17 });
      voxels.push({ x: side * (R + 2), y: 0, z: ez, colorIndex: 17 });
      voxels.push({ x: side * (R + 1), y: 1, z: ez, colorIndex: 3 });
    }
  }
  return voxels;
}

function generateHeadBase() {
  return normalizeToHeadGrid(dedup(headBase()));
}

// ========================================================================
// 目バリエーション
// ========================================================================
const faceY0 = -Math.floor(HEAD_R * HEAD_SY) - 1; // 顔表面Y（頭表面の1ボクセル前方）

function eyesNormal(v) {
  const z = HEAD_R + 2;
  for (const sx of [-1, 1]) {
    const cx = sx * 4.5;
    for (let ex = -2; ex <= 1; ex++)
      for (let ez = 0; ez <= 1; ez++) {
        v.push({ x: Math.round(cx + ex), y: faceY0, z: z + ez, colorIndex: 13 });
        v.push({ x: Math.round(cx + ex), y: faceY0 - 1, z: z + ez, colorIndex: 13 });
      }
    // 瞳
    v.push({ x: Math.round(cx), y: faceY0, z: z, colorIndex: 14 });
    v.push({ x: Math.round(cx + sx * -1), y: faceY0, z: z, colorIndex: 14 });
    v.push({ x: Math.round(cx), y: faceY0, z: z + 1, colorIndex: 14 });
    v.push({ x: Math.round(cx + sx * -1), y: faceY0, z: z + 1, colorIndex: 14 });
    v.push({ x: Math.round(cx), y: faceY0, z: z + 1, colorIndex: 13 }); // highlight
  }
}

function eyesNarrow(v) {
  const z = HEAD_R + 2;
  for (const sx of [-1, 1]) {
    const cx = sx * 4.5;
    for (let ex = -2; ex <= 1; ex++) {
      v.push({ x: Math.round(cx + ex), y: faceY0, z: z, colorIndex: 13 });
      v.push({ x: Math.round(cx + ex), y: faceY0 - 1, z: z, colorIndex: 13 });
    }
    v.push({ x: Math.round(cx), y: faceY0, z: z, colorIndex: 14 });
    v.push({ x: Math.round(cx + sx * -1), y: faceY0, z: z, colorIndex: 14 });
  }
}

function eyesRound(v) {
  const z = HEAD_R + 1;
  for (const sx of [-1, 1]) {
    const cx = sx * 4.5;
    // 3x3 白目
    for (let ex = -1; ex <= 1; ex++)
      for (let ez = 0; ez <= 2; ez++) {
        v.push({ x: Math.round(cx + ex), y: faceY0, z: z + ez, colorIndex: 13 });
        v.push({ x: Math.round(cx + ex), y: faceY0 - 1, z: z + ez, colorIndex: 13 });
      }
    // 追加: 角を丸くする外周
    v.push({ x: Math.round(cx - 2), y: faceY0, z: z + 1, colorIndex: 13 });
    v.push({ x: Math.round(cx + 2), y: faceY0, z: z + 1, colorIndex: 13 });
    // 瞳
    v.push({ x: Math.round(cx), y: faceY0, z: z + 1, colorIndex: 14 });
    v.push({ x: Math.round(cx), y: faceY0, z: z, colorIndex: 14 });
    v.push({ x: Math.round(cx + sx * -1), y: faceY0, z: z + 1, colorIndex: 14 });
    // highlight
    v.push({ x: Math.round(cx - sx), y: faceY0, z: z + 2, colorIndex: 13 });
  }
}

function eyesFierce(v) {
  const z = HEAD_R + 2;
  for (const sx of [-1, 1]) {
    const cx = sx * 4.5;
    // 斜めの目 (外側が上がる)
    for (let ex = -2; ex <= 1; ex++) {
      const slant = ex * sx > 0 ? 1 : 0;
      v.push({ x: Math.round(cx + ex), y: faceY0, z: z + slant, colorIndex: 13 });
      v.push({ x: Math.round(cx + ex), y: faceY0 - 1, z: z + slant, colorIndex: 13 });
    }
    v.push({ x: Math.round(cx), y: faceY0, z: z, colorIndex: 14 });
    v.push({ x: Math.round(cx + sx * -1), y: faceY0, z: z, colorIndex: 14 });
  }
}

function eyesGentle(v) {
  const z = HEAD_R + 2;
  for (const sx of [-1, 1]) {
    const cx = sx * 4.5;
    // 少し垂れ目 (外側が下がる)
    for (let ex = -2; ex <= 1; ex++) {
      const droop = ex * sx > 0 ? -1 : 0;
      for (let ez = 0; ez <= 1; ez++) {
        v.push({ x: Math.round(cx + ex), y: faceY0, z: z + ez + droop, colorIndex: 13 });
        v.push({ x: Math.round(cx + ex), y: faceY0 - 1, z: z + ez + droop, colorIndex: 13 });
      }
    }
    v.push({ x: Math.round(cx), y: faceY0, z: z, colorIndex: 14 });
    v.push({ x: Math.round(cx + sx * -1), y: faceY0, z: z, colorIndex: 14 });
    v.push({ x: Math.round(cx), y: faceY0, z: z + 1, colorIndex: 14 });
    v.push({ x: Math.round(cx), y: faceY0, z: z + 1, colorIndex: 13 }); // highlight
  }
}

const EYES = [
  { name: "normal",  fn: eyesNormal },
  { name: "narrow",  fn: eyesNarrow },
  { name: "round",   fn: eyesRound },
  { name: "fierce",  fn: eyesFierce },
  { name: "gentle",  fn: eyesGentle },
];

// ========================================================================
// 眉バリエーション
// ========================================================================
function browsThick(v) {
  const z = HEAD_R + 4;
  for (const sx of [-1, 1]) {
    for (let bx = 2; bx <= 6; bx++) {
      v.push({ x: sx * bx, y: faceY0, z: z, colorIndex: 14 });
      v.push({ x: sx * bx, y: faceY0 - 1, z: z, colorIndex: 14 });
    }
    v.push({ x: sx * 2, y: faceY0, z: z - 1, colorIndex: 14 });
  }
}

function browsThin(v) {
  const z = HEAD_R + 4;
  for (const sx of [-1, 1])
    for (let bx = 2; bx <= 6; bx++)
      v.push({ x: sx * bx, y: faceY0, z: z, colorIndex: 14 });
}

function browsAngry(v) {
  const z = HEAD_R + 4;
  for (const sx of [-1, 1]) {
    for (let bx = 2; bx <= 6; bx++) {
      const dip = bx <= 3 ? -(3 - bx) : 0; // 内側が大きく下がる
      v.push({ x: sx * bx, y: faceY0, z: z + dip, colorIndex: 14 });
      v.push({ x: sx * bx, y: faceY0 - 1, z: z + dip, colorIndex: 14 });
    }
  }
}

function browsArched(v) {
  const z = HEAD_R + 4;
  for (const sx of [-1, 1]) {
    for (let bx = 2; bx <= 6; bx++) {
      const arch = bx === 4 ? 1 : (bx === 3 || bx === 5) ? 1 : 0;
      v.push({ x: sx * bx, y: faceY0, z: z + arch, colorIndex: 14 });
    }
  }
}

function browsFlat(v) {
  const z = HEAD_R + 4;
  for (const sx of [-1, 1])
    for (let bx = 2; bx <= 6; bx++) {
      v.push({ x: sx * bx, y: faceY0, z: z, colorIndex: 14 });
      v.push({ x: sx * bx, y: faceY0 - 1, z: z, colorIndex: 14 });
    }
}

const BROWS = [
  { name: "thick",  fn: browsThick },
  { name: "thin",   fn: browsThin },
  { name: "angry",  fn: browsAngry },
  { name: "arched", fn: browsArched },
  { name: "flat",   fn: browsFlat },
];

// ========================================================================
// 鼻バリエーション
// ========================================================================
function noseSmall(v) {
  const z = HEAD_R + 1;
  v.push({ x: 0, y: faceY0 - 1, z, colorIndex: 16 });
  v.push({ x: 0, y: faceY0 - 2, z, colorIndex: 16 });
  v.push({ x: 0, y: faceY0 - 2, z: z - 1, colorIndex: 17 });
}

function noseWide(v) {
  const z = HEAD_R + 1;
  for (let x = -1; x <= 1; x++) {
    v.push({ x, y: faceY0 - 1, z, colorIndex: 16 });
    v.push({ x, y: faceY0 - 2, z, colorIndex: 16 });
  }
  v.push({ x: -2, y: faceY0 - 1, z: z - 1, colorIndex: 17 });
  v.push({ x: 2, y: faceY0 - 1, z: z - 1, colorIndex: 17 });
  v.push({ x: 0, y: faceY0 - 2, z: z - 1, colorIndex: 17 });
}

function nosePointed(v) {
  const z = HEAD_R + 1;
  v.push({ x: 0, y: faceY0 - 1, z, colorIndex: 16 });
  v.push({ x: 0, y: faceY0 - 2, z, colorIndex: 16 });
  v.push({ x: 0, y: faceY0 - 3, z, colorIndex: 16 });
  v.push({ x: 0, y: faceY0 - 3, z: z - 1, colorIndex: 17 });
  v.push({ x: 0, y: faceY0 - 2, z: z + 1, colorIndex: 16 });
}

function noseFlat(v) {
  const z = HEAD_R;
  v.push({ x: 0, y: faceY0, z, colorIndex: 17 });
  v.push({ x: -1, y: faceY0, z, colorIndex: 17 });
  v.push({ x: 1, y: faceY0, z, colorIndex: 17 });
}

const NOSES = [
  { name: "small",   fn: noseSmall },
  { name: "wide",    fn: noseWide },
  { name: "pointed", fn: nosePointed },
  { name: "flat",    fn: noseFlat },
];

// ========================================================================
// 口バリエーション
// ========================================================================
function mouthGrin(v) {
  const z = HEAD_R - 2;
  for (let x = -3; x <= 3; x++) v.push({ x, y: faceY0, z, colorIndex: 15 });
  v.push({ x: -4, y: faceY0, z: z + 1, colorIndex: 15 });
  v.push({ x: 4, y: faceY0, z: z + 1, colorIndex: 15 });
}

function mouthSerious(v) {
  const z = HEAD_R - 2;
  for (let x = -3; x <= 3; x++) v.push({ x, y: faceY0, z, colorIndex: 15 });
}

function mouthSmile(v) {
  const z = HEAD_R - 2;
  for (let x = -4; x <= 4; x++) v.push({ x, y: faceY0, z, colorIndex: 15 });
  v.push({ x: -5, y: faceY0, z: z + 1, colorIndex: 15 });
  v.push({ x: 5, y: faceY0, z: z + 1, colorIndex: 15 });
  for (let x = -2; x <= 2; x++) v.push({ x, y: faceY0, z: z + 1, colorIndex: 23 });
}

function mouthOpen(v) {
  const z = HEAD_R - 3;
  for (let x = -2; x <= 2; x++)
    for (let ez = 0; ez <= 1; ez++)
      v.push({ x, y: faceY0, z: z + ez, colorIndex: 7 });
  // 唇
  for (let x = -3; x <= 3; x++) {
    v.push({ x, y: faceY0, z: z + 2, colorIndex: 15 });
    v.push({ x, y: faceY0, z: z - 1, colorIndex: 15 });
  }
}

function mouthFrown(v) {
  const z = HEAD_R - 2;
  for (let x = -3; x <= 3; x++) v.push({ x, y: faceY0, z, colorIndex: 15 });
  v.push({ x: -4, y: faceY0, z: z - 1, colorIndex: 15 });
  v.push({ x: 4, y: faceY0, z: z - 1, colorIndex: 15 });
}

const MOUTHS = [
  { name: "grin",    fn: mouthGrin },
  { name: "serious", fn: mouthSerious },
  { name: "smile",   fn: mouthSmile },
  { name: "open",    fn: mouthOpen },
  { name: "frown",   fn: mouthFrown },
];

// ========================================================================
// 共通: 頬 + 顎ライン
// ========================================================================
function cheeksAndJaw(v) {
  const R = HEAD_R;
  for (const sx of [-1, 1])
    for (let x = 6; x <= 8; x++)
      for (let z = R - 1; z <= R + 1; z++)
        v.push({ x: sx * x, y: faceY0 + 1, z, colorIndex: 16 });
  for (let x = -6; x <= 6; x++)
    v.push({ x, y: faceY0 + 1, z: R - 5, colorIndex: 17 });
}

// ========================================================================
// 髪型バリエーション
// ========================================================================

/** ヘルパー: 頭の外殻条件 */
function headShell(x, y, z, innerR, outerR) {
  const R = HEAD_R;
  const dz = z - R;
  const nx = x / (R + outerR);
  const ny = y / (R * HEAD_SY + outerR);
  const nz = dz / (R * HEAD_SZ + outerR);
  const d2 = nx * nx + ny * ny + nz * nz;
  const nxi = x / (R + innerR);
  const nyi = y / (R * HEAD_SY + innerR);
  const nzi = dz / (R * HEAD_SZ + innerR);
  const d2i = nxi * nxi + nyi * nyi + nzi * nzi;
  return d2 <= 1.0 && d2i > 1.0;
}

function hairShortCrop(v) {
  const R = HEAD_R;
  for (let x = -R - 2; x <= R + 2; x++)
    for (let y = -R; y <= R + 2; y++)
      for (let z = Math.floor(R * -0.1); z <= R + 3; z++) {
        if (!headShell(x, y, z, 0, 2.5)) continue;
        const dz = z - R;
        if (y < -(R * HEAD_SY * 0.45) && dz < R * HEAD_SZ * 0.5) continue;
        const hi = dz > R * HEAD_SZ * 0.6 && Math.abs(x) < 5 && y > -3;
        v.push({ x, y, z, colorIndex: hi ? 12 : 11 });
      }
}

function hairAfro(v) {
  const R = HEAD_R;
  const aR = R + 5;
  for (let x = -aR; x <= aR; x++)
    for (let y = -aR; y <= aR; y++)
      for (let z = 0; z <= aR * 2; z++) {
        const dz = z - R - 2;
        const d2 = (x / aR) ** 2 + (y / (aR * 0.9)) ** 2 + (dz / aR) ** 2;
        if (d2 > 1.0 || d2 <= 0.55) continue;
        if (y < -(R * HEAD_SY * 0.3) && dz < R * 0.3) continue;
        const wave = Math.sin(x * 0.8 + z * 0.6) * Math.cos(y * 0.7);
        v.push({ x, y, z, colorIndex: wave > 0.3 ? 12 : 11 });
      }
}

function hairCornrow(v) {
  const R = HEAD_R;
  for (let x = -R - 1; x <= R + 1; x++)
    for (let y = -R; y <= R + 1; y++)
      for (let z = Math.floor(R * 0.2); z <= R + 2; z++) {
        if (!headShell(x, y, z, 0, 1.5)) continue;
        const dz = z - R;
        if (y < -(R * HEAD_SY * 0.4) && dz < R * HEAD_SZ * 0.5) continue;
        v.push({ x, y, z, colorIndex: Math.abs(x) % 4 === 0 ? 7 : 11 });
      }
  // 後頭部まとめ
  for (let x = -3; x <= 3; x++)
    for (let y = R - 2; y <= R + 3; y++)
      for (let z = R; z <= R + 4; z++)
        if (x * x + (y - R) ** 2 + (z - R - 2) ** 2 <= 12)
          v.push({ x, y, z, colorIndex: 11 });
}

function hairMohawk(v) {
  const R = HEAD_R;
  // サイド刈り込み
  for (let x = -R - 1; x <= R + 1; x++)
    for (let y = -R; y <= R + 1; y++)
      for (let z = Math.floor(R * 0.1); z <= R + 2; z++) {
        if (!headShell(x, y, z, 0, 1.0)) continue;
        const dz = z - R;
        if (y < -(R * HEAD_SY * 0.4) && dz < R * HEAD_SZ * 0.5) continue;
        v.push({ x, y, z, colorIndex: 11 });
      }
  // モヒカン
  for (let x = -2; x <= 2; x++)
    for (let y = -R + 2; y <= R - 2; y++)
      for (let z = R + 2; z <= R + 8; z++) {
        const maxZ = R + 8 - Math.max(0, (y + 2) * 0.5);
        if (z > maxZ) continue;
        if ((x / 3) ** 2 + ((z - R - 5) / 4) ** 2 > 1.0) continue;
        v.push({ x, y, z, colorIndex: z > R + 5 ? 12 : 11 });
      }
}

function hairBuzz(v) {
  const R = HEAD_R;
  for (let x = -R; x <= R; x++)
    for (let y = -R; y <= R + 1; y++)
      for (let z = Math.floor(R * 0.2); z <= R + 2; z++) {
        if (!headShell(x, y, z, 0, 0.8)) continue;
        const dz = z - R;
        if (y < -(R * HEAD_SY * 0.5) && dz < R * HEAD_SZ * 0.5) continue;
        v.push({ x, y, z, colorIndex: 11 });
      }
  // ヘッドバンド
  const bz = R + 5;
  for (let a = 0; a < 360; a += 3) {
    const rad = a * Math.PI / 180;
    const bx = Math.round(R * 1.05 * Math.cos(rad));
    const by = Math.round(R * HEAD_SY * 1.05 * Math.sin(rad));
    v.push({ x: bx, y: by, z: bz, colorIndex: 18 });
    v.push({ x: bx, y: by, z: bz + 1, colorIndex: 18 });
  }
}

function hairFade(v) {
  const R = HEAD_R;
  for (let x = -R - 1; x <= R + 1; x++)
    for (let y = -R; y <= R + 1; y++)
      for (let z = Math.floor(R * -0.1); z <= R + 4; z++) {
        if (!headShell(x, y, z, 0, 2.0)) continue;
        const dz = z - R;
        if (y < -(R * HEAD_SY * 0.45) && dz < R * HEAD_SZ * 0.5) continue;
        // フェード: 下に行くほど薄い
        const fadeLevel = (dz + R * HEAD_SZ) / (2 * R * HEAD_SZ);
        if (fadeLevel < 0.35 && Math.random() > fadeLevel * 2) continue;
        // トップは厚め
        const ci = dz > R * HEAD_SZ * 0.5 ? 11 : (fadeLevel > 0.5 ? 19 : 20);
        v.push({ x, y, z, colorIndex: ci });
      }
}

function hairDreads(v) {
  const R = HEAD_R;
  // ベース
  for (let x = -R - 1; x <= R + 1; x++)
    for (let y = -R; y <= R + 1; y++)
      for (let z = Math.floor(R * 0.3); z <= R + 2; z++) {
        if (!headShell(x, y, z, 0, 1.5)) continue;
        const dz = z - R;
        if (y < -(R * HEAD_SY * 0.4) && dz < R * HEAD_SZ * 0.5) continue;
        v.push({ x, y, z, colorIndex: 11 });
      }
  // ドレッド房 (後頭部〜側面に垂れ下がる)
  const angles = [-150, -120, -90, -60, -30, 0, 30, 60, 90, 120, 150, 180];
  for (const deg of angles) {
    const rad = deg * Math.PI / 180;
    const sx = Math.round(R * 0.9 * Math.cos(rad));
    const sy = Math.round(R * HEAD_SY * 0.9 * Math.sin(rad));
    for (let dz = -8; dz <= 0; dz++) {
      const sway = Math.round(Math.sin(dz * 0.5 + deg * 0.1) * 1.5);
      v.push({ x: sx + sway, y: sy, z: R + 2 + dz, colorIndex: 11 });
      v.push({ x: sx + sway + 1, y: sy, z: R + 2 + dz, colorIndex: 19 });
    }
  }
}

function hairFlatTop(v) {
  const R = HEAD_R;
  // サイドは短く
  for (let x = -R - 1; x <= R + 1; x++)
    for (let y = -R; y <= R + 1; y++)
      for (let z = Math.floor(R * 0.1); z <= R + 1; z++) {
        if (!headShell(x, y, z, 0, 1.0)) continue;
        const dz = z - R;
        if (y < -(R * HEAD_SY * 0.4) && dz < R * HEAD_SZ * 0.5) continue;
        v.push({ x, y, z, colorIndex: 11 });
      }
  // フラットトップ (頭頂部を平らに)
  for (let x = -R + 2; x <= R - 2; x++)
    for (let y = -R + 4; y <= R; y++) {
      // 楕円のフチ内のみ
      const nx = x / (R - 2), ny = y / (R - 3);
      if (nx * nx + ny * ny > 1.0) continue;
      for (let z = R + 2; z <= R + 5; z++)
        v.push({ x, y, z, colorIndex: z === R + 5 ? 12 : 11 });
    }
}

const HAIRS = [
  { name: "short",    fn: hairShortCrop },
  { name: "afro",     fn: hairAfro },
  { name: "cornrow",  fn: hairCornrow },
  { name: "mohawk",   fn: hairMohawk },
  { name: "buzz",     fn: hairBuzz },
  { name: "fade",     fn: hairFade },
  { name: "dreads",   fn: hairDreads },
  { name: "flat_top", fn: hairFlatTop },
];

// ========================================================================
// ボディパーツ (変更なし)
// ========================================================================
function generateTorso() {
  const voxels = [];
  const W = 11, H = 28;
  octCylinder(0, 0, 0, W, H, 1, voxels, 0.15);
  octCylinder(0, 0, H - 2, W + 1, 2, 2, voxels, 0.15);
  octCylinder(0, 0, H - 4, W + 1, 2, 1, voxels, 0.15);
  octCylinder(0, 0, 0, W, 2, 2, voxels, 0.15);
  for (let z = 6; z < H - 4; z++) voxels.push({ x: 0, y: -W, z, colorIndex: 6 });
  for (let z = 2; z < H - 2; z++) {
    voxels.push({ x: -W, y: 0, z, colorIndex: 6 });
    voxels.push({ x: W, y: 0, z, colorIndex: 6 });
  }
  return normalize(dedup(voxels));
}

function generateHip() {
  const voxels = [];
  box(-8, -5, 0, 17, 11, 4, 4, voxels);
  box(-8, -5, 3, 17, 11, 1, 2, voxels);
  return normalize(dedup(voxels));
}

function generateLeg() {
  const voxels = [];
  const R = 5;
  cylinder(0, 0, 0, R, 9, 8, voxels);
  cylinder(0, 0, 8, R, 3, 3, voxels);
  cylinder(0, 0, 10, R + 1, 10, 3, voxels);
  cylinder(0, 0, 20, R + 3, 8, 4, voxels);
  for (let x = -R; x <= R; x++)
    for (let y = -R; y <= R; y++)
      if (x * x + y * y <= R * R)
        voxels.push({ x, y, z: 8, colorIndex: 6 });
  return normalize(dedup(voxels));
}

function generateUpperArm() {
  const voxels = [];
  const R = 4;
  cylinder(0, 0, 0, R, 11, 3, voxels);
  cylinder(0, 0, 10, R + 1, 6, 1, voxels);
  for (let x = -(R + 1); x <= R + 1; x++)
    for (let y = -(R + 1); y <= R + 1; y++)
      if (x * x + y * y <= (R + 1) ** 2)
        voxels.push({ x, y, z: 10, colorIndex: 6 });
  return normalize(dedup(voxels));
}

function generateForearm() {
  const voxels = [];
  cylinder(0, 0, 0, 3, 14, 3, voxels);
  cylinder(0, 0, 0, 4, 2, 6, voxels);
  return normalize(dedup(voxels));
}

function generateHand() {
  const voxels = [];
  sphere(0, 0, 0, 4, 3, voxels);
  voxels.push({ x: 4, y: 0, z: 1, colorIndex: 3 });
  voxels.push({ x: 4, y: 0, z: 2, colorIndex: 3 });
  voxels.push({ x: 5, y: 0, z: 1, colorIndex: 3 });
  for (let x = -2; x <= 2; x++) voxels.push({ x, y: -3, z: 1, colorIndex: 10 });
  return normalize(dedup(voxels));
}

function generateFoot() {
  const voxels = [];
  box(-4, -7, 0, 9, 10, 2, 9, voxels);
  box(-3, -6, 2, 7, 8, 4, 5, voxels);
  box(-2, -8, 2, 5, 2, 3, 5, voxels);
  box(-1, -9, 2, 3, 1, 2, 5, voxels);
  box(-3, 2, 2, 7, 2, 5, 5, voxels);
  for (let y = -4; y < 1; y++) voxels.push({ x: 0, y, z: 5, colorIndex: 7 });
  box(-3, -4, 5, 7, 6, 3, 5, voxels);
  box(-2, -3, 7, 5, 5, 1, 8, voxels);
  return normalize(dedup(voxels));
}

// ========================================================================
// メイン
// ========================================================================
function main() {
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });
  const palette = makePalette();

  console.log("=== Body parts ===\n");
  const bodyParts = [
    { name: "torso", gen: generateTorso },
    { name: "hip", gen: generateHip },
    { name: "leg", gen: generateLeg },
    { name: "upper_arm", gen: generateUpperArm },
    { name: "forearm", gen: generateForearm },
    { name: "hand", gen: generateHand },
    { name: "foot", gen: generateFoot },
  ];
  for (const p of bodyParts) {
    const r = p.gen();
    writeVox(path.join(OUT_DIR, `${p.name}.vox`), r.sx, r.sy, r.sz, r.voxels, palette);
  }

  // Head base
  console.log("\n=== Head base ===\n");
  const hb = generateHeadBase();
  writeVox(path.join(OUT_DIR, "head_base.vox"), hb.sx, hb.sy, hb.sz, hb.voxels, palette);

  // Also write combined head.vox for backward compat
  const combined = dedup([...headBase(), ...(() => { const v = []; hairShortCrop(v); return v; })(), ...(() => { const v = []; eyesNormal(v); browsThick(v); noseSmall(v); mouthGrin(v); cheeksAndJaw(v); return v; })()]);
  const hc = normalize(combined);
  writeVox(path.join(OUT_DIR, "head.vox"), hc.sx, hc.sy, hc.sz, hc.voxels, palette);

  // Sub-parts
  const mkDir = (d) => { const p = path.join(OUT_DIR, d); if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true }); return p; };

  console.log("\n=== Eyes ===\n");
  const eyesDir = mkDir("eyes");
  for (const e of EYES) {
    const v = []; e.fn(v); cheeksAndJaw(v);
    const r = normalizeToHeadGrid(dedup(v));
    writeVox(path.join(eyesDir, `eyes_${e.name}.vox`), r.sx, r.sy, r.sz, r.voxels, palette);
  }

  console.log("\n=== Brows ===\n");
  const browsDir = mkDir("brows");
  for (const b of BROWS) {
    const v = []; b.fn(v);
    const r = normalizeToHeadGrid(dedup(v));
    writeVox(path.join(browsDir, `brows_${b.name}.vox`), r.sx, r.sy, r.sz, r.voxels, palette);
  }

  console.log("\n=== Noses ===\n");
  const nosesDir = mkDir("noses");
  for (const n of NOSES) {
    const v = []; n.fn(v);
    const r = normalizeToHeadGrid(dedup(v));
    writeVox(path.join(nosesDir, `nose_${n.name}.vox`), r.sx, r.sy, r.sz, r.voxels, palette);
  }

  console.log("\n=== Mouths ===\n");
  const mouthsDir = mkDir("mouths");
  for (const m of MOUTHS) {
    const v = []; m.fn(v);
    const r = normalizeToHeadGrid(dedup(v));
    writeVox(path.join(mouthsDir, `mouth_${m.name}.vox`), r.sx, r.sy, r.sz, r.voxels, palette);
  }

  console.log("\n=== Hairs ===\n");
  const hairsDir = mkDir("hairs");
  for (const h of HAIRS) {
    const v = []; h.fn(v);
    const r = normalizeToHeadGrid(dedup(v));
    writeVox(path.join(hairsDir, `hair_${h.name}.vox`), r.sx, r.sy, r.sz, r.voxels, palette);
  }

  console.log("\n=== Summary ===");
  console.log(`  Eyes:   ${EYES.length} (${EYES.map(e => e.name).join(", ")})`);
  console.log(`  Brows:  ${BROWS.length} (${BROWS.map(b => b.name).join(", ")})`);
  console.log(`  Noses:  ${NOSES.length} (${NOSES.map(n => n.name).join(", ")})`);
  console.log(`  Mouths: ${MOUTHS.length} (${MOUTHS.map(m => m.name).join(", ")})`);
  console.log(`  Hairs:  ${HAIRS.length} (${HAIRS.map(h => h.name).join(", ")})`);
  console.log(`  Total combinations: ${EYES.length * BROWS.length * NOSES.length * MOUTHS.length * HAIRS.length}`);
}

main();
