/**
 * Create 3D voxel art face features on the CE body surface.
 * Features are placed at the actual body surface positions (following face curvature).
 * Uses x2 grid (170x68x204) — same coordinate system as CE ears.
 *
 * Usage: node scripts/create_face_voxels.js <name> <output.vox>
 */
const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const NAME = args[0] || 'qm';
const OUTPUT = args[1] || 'public/box4/queenmarika_face.vox';

// ========================================================================
// Read CE base body to find face surface
// ========================================================================
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
const body = readVox(path.join(BASE, 'public/box2/cyberpunk_elf_body_base.vox'));
console.log(`CE body: ${body.sx}x${body.sy}x${body.sz}`);

// Build surface map: for each (x,z), find minimum Y (front surface)
const surfaceY = {};
for (const v of body.voxels) {
  const key = `${v.x},${v.z}`;
  if (surfaceY[key] === undefined || v.y < surfaceY[key]) {
    surfaceY[key] = v.y;
  }
}

// Face center X — find from actual face surface (x range at face z=85-92)
// CE body face spans x=33-47, center=40 (NOT body grid center 42.5)
let faceMinX = body.sx, faceMaxX = 0;
for (const v of body.voxels) {
  if (v.z >= 85 && v.z <= 92 && v.y <= 10) {
    if (v.x < faceMinX) faceMinX = v.x;
    if (v.x > faceMaxX) faceMaxX = v.x;
  }
}
const bodyCenterX = (faceMinX + faceMaxX) / 2 + 0.5; // 40.5 for CE (fine-tuned)
console.log(`Face X range: ${faceMinX}-${faceMaxX}, center: ${bodyCenterX}`);

// ========================================================================
// Color palette (from QM reference photo)
// ========================================================================
const PALETTES = {
  qm: {
    eye_white:   [220, 210, 205],
    iris_outer:  [180, 140, 55],
    iris_inner:  [140, 100, 35],
    pupil:       [30, 18, 15],
    eyelid:      [110, 75, 70],
    eyelash:     [45, 28, 22],
    eyebrow:     [85, 55, 45],
    nose_shadow: [150, 115, 110],
    nostril:     [125, 88, 82],
    lip_upper:   [170, 90, 85],
    lip_lower:   [150, 85, 78],
    lip_dark:    [130, 70, 65],
    lip_line:    [110, 65, 60],
  }
};
const colors = PALETTES[NAME] || PALETTES.qm;

// ========================================================================
// x2 grid (170x68x204) — same as CE ears
// ========================================================================
const MULT = 2;
const GX = body.sx * MULT; // 170
const GY = body.sy * MULT; // 68
const GZ = body.sz * MULT; // 204

// Get surface Y at x2 coords by interpolating body surface
function getSurfaceY2(x2, z2) {
  const bx = Math.floor(x2 / MULT);
  const bz = Math.floor(z2 / MULT);
  const sy = surfaceY[`${bx},${bz}`];
  if (sy === undefined) return -1;
  return sy * MULT; // front surface in x2 coords
}

// Feature voxels: array of {x2, z2, colorName}
// All patterns defined relative to body center, symmetric
const featureVoxels = [];

// Helper: add symmetric feature (mirrors around bodyCenterX)
function addSymmetric(offsetFromCenter, z_body, colorName) {
  // offsetFromCenter: positive = right of center
  // Converts to x2 coords
  const x2_right = Math.round(bodyCenterX * MULT + offsetFromCenter);
  const x2_left = Math.round(bodyCenterX * MULT - offsetFromCenter - 1);
  const z2 = z_body * MULT;
  featureVoxels.push({ x2: x2_right, z2, color: colorName });
  if (x2_left !== x2_right) {
    featureVoxels.push({ x2: x2_left, z2, color: colorName });
  }
}

// Helper: draw a symmetric pixel art row
// pattern: string from center outward, e.g. "PPIIIWW" means pupil-pupil-iris-iris-iris-white-white
// Each char is mirrored. Center column(s) are not duplicated.
function drawSymRow(z_body, z_sub, pattern, charMap) {
  const z2 = z_body * MULT + z_sub;
  const cx2 = Math.round(bodyCenterX * MULT); // center in x2 = 85

  for (let i = 0; i < pattern.length; i++) {
    const ch = pattern[i];
    if (ch === '.' || ch === ' ') continue;
    const colorName = charMap[ch];
    if (!colorName) continue;

    // Right side: cx2 + i
    const xR = cx2 + i;
    // Left side: cx2 - 1 - i
    const xL = cx2 - 1 - i;

    if (xR < GX) featureVoxels.push({ x2: xR, z2, color: colorName });
    if (xL >= 0 && xL !== xR) featureVoxels.push({ x2: xL, z2, color: colorName });
  }
}

// Helper: draw symmetric row with offset from center (for eyes that aren't at center)
function drawEyeRow(z_body, z_sub, eyeCenterOffset, pattern, charMap) {
  const z2 = z_body * MULT + z_sub;
  const cx2 = Math.round(bodyCenterX * MULT); // 85

  for (let i = 0; i < pattern.length; i++) {
    const ch = pattern[i];
    if (ch === '.' || ch === ' ') continue;
    const colorName = charMap[ch];
    if (!colorName) continue;

    // Right eye: center + eyeCenterOffset + i (and mirror within eye)
    // Left eye: center - eyeCenterOffset - i (mirrored)
    const rEyeCenter = cx2 + eyeCenterOffset;
    const lEyeCenter = cx2 - 1 - eyeCenterOffset;

    // Right eye, right half
    featureVoxels.push({ x2: rEyeCenter + i, z2, color: colorName });
    // Right eye, left half (mirror within eye)
    if (i > 0) featureVoxels.push({ x2: rEyeCenter - i, z2, color: colorName });
    // Left eye, left half
    featureVoxels.push({ x2: lEyeCenter - i, z2, color: colorName });
    // Left eye, right half (mirror within eye)
    if (i > 0) featureVoxels.push({ x2: lEyeCenter + i, z2, color: colorName });
  }
}

const eyeMap = {
  'W': 'eye_white', 'o': 'iris_outer', 'i': 'iris_inner',
  'P': 'pupil', 'L': 'eyelid', 'l': 'eyelash',
};

// ========================================================================
// EYES — centered at body z≈89-90, offset ±5 from center
// Each eye is ~5 wide at x1, 10 at x2
// ========================================================================
const EYE_OFF = 5; // offset from center in x2 coords

// Eye pattern: each char is center-outward (i=0=center of eye, mirrored to both sides)
// Pattern 'PioWL' → L,W,o,i,P,i,o,W,L  (9px per eye, pupil at center)
// z=88 (body) = z2=176
drawEyeRow(85, 0, EYE_OFF, 'llll.',  eyeMap); // bottom lash: .,l,l,l,l,l,l,l,.
drawEyeRow(85, 1, EYE_OFF, 'LLLLl',  eyeMap); // lower lid:   l,L,L,L,L,L,L,L,l
drawEyeRow(86, 0, EYE_OFF, 'WWWLl',  eyeMap); // lower white:  l,L,W,W,W,W,W,L,l
drawEyeRow(86, 1, EYE_OFF, 'ooWLl',  eyeMap); // iris lower:   l,L,W,o,o,o,W,L,l
drawEyeRow(87, 0, EYE_OFF, 'PioWL',  eyeMap); // pupil row:    L,W,o,i,P,i,o,W,L
drawEyeRow(87, 1, EYE_OFF, 'ooWLl',  eyeMap); // iris upper:   l,L,W,o,o,o,W,L,l
drawEyeRow(88, 0, EYE_OFF, 'WWWLl',  eyeMap); // upper white:  l,L,W,W,W,W,W,L,l
drawEyeRow(88, 1, EYE_OFF, 'LLLLl',  eyeMap); // upper lid:    l,L,L,L,L,L,L,L,l
drawEyeRow(89, 0, EYE_OFF, 'llll.',  eyeMap); // top lash:     .,l,l,l,l,l,l,l,.

// ========================================================================
// EYEBROWS — z≈93-94, offset ±4-8 from center
// ========================================================================
const browMap = { 'B': 'eyebrow' };
// Center-outward: 'BBBB.' = 7px solid brow, 'BBBBB' = 9px solid brow
drawEyeRow(90, 0, EYE_OFF, 'BBBB.',  browMap); // 7px each brow
drawEyeRow(90, 1, EYE_OFF, 'BBBBB',  browMap); // 9px each brow (thickest)
drawEyeRow(91, 0, EYE_OFF, 'BBBB.',  browMap); // 7px each brow

// ========================================================================
// NOSE — centered, z≈84-87
// ========================================================================
const noseMap = { 's': 'nose_shadow', 'N': 'nostril' };
drawSymRow(84, 0, '.N',  noseMap);  // nostrils
drawSymRow(84, 1, '.s',  noseMap);
drawSymRow(85, 0, '.s',  noseMap);  // nose sides
drawSymRow(85, 1, '.s',  noseMap);
drawSymRow(86, 0, 's',   noseMap);  // nose bridge
drawSymRow(86, 1, 's',   noseMap);

// ========================================================================
// MOUTH — centered, z≈81-83
// ========================================================================
const mouthMap = {
  'U': 'lip_upper', 'L': 'lip_lower', 'D': 'lip_dark',
  'l': 'lip_line', 'c': 'lip_dark',
};
// Mouth: center-outward. drawSymRow i=0 maps to center PAIR (cx2 and cx2-1).
// Pattern 'LLc' → c,L,L,L,L,c (6px), 'LLLLc' → c,L,L,L,L,L,L,L,L,c (10px)
drawSymRow(81, 0, 'LLc',     mouthMap);  // bottom:    c,L,L,L,L,c  (6px)
drawSymRow(81, 1, 'LLLc',    mouthMap);  // wider:     c,L,L,L,L,L,L,c  (8px)
drawSymRow(82, 0, 'LLLLc',   mouthMap);  // widest:    c,L,L,L,L,L,L,L,L,c  (10px)
drawSymRow(82, 1, 'lllll',   mouthMap);  // lip line:  l,l,l,l,l,l,l,l,l,l  (10px)
drawSymRow(83, 0, 'UUUUD',   mouthMap);  // upper lip: D,U,U,U,U,U,U,U,U,D  (10px)
drawSymRow(83, 1, 'UUU',     mouthMap);  // top peak:  U,U,U,U,U,U  (6px)

// ========================================================================
// Build final voxels on body surface
// ========================================================================
const colorIndexMap = {};
const palette = [];
const voxels = [];

function getColorIdx(name) {
  if (colorIndexMap[name] !== undefined) return colorIndexMap[name];
  const c = colors[name];
  if (!c) return 1;
  palette.push(c);
  colorIndexMap[name] = palette.length;
  return palette.length;
}

// Deduplicate by position
const posSet = new Set();

for (const fv of featureVoxels) {
  const { x2, z2, color } = fv;
  if (x2 < 0 || x2 >= GX || z2 < 0 || z2 >= GZ) continue;

  const surfY = getSurfaceY2(x2, z2);
  if (surfY < 0) continue; // no body surface here

  const ci = getColorIdx(color);

  // Place at surface and 1 in front (y = surfY - 1 and surfY)
  for (const dy of [-1, 0]) {
    const vy = surfY + dy;
    if (vy < 0 || vy >= GY) continue;
    const posKey = `${x2},${vy},${z2}`;
    if (posSet.has(posKey)) continue;
    posSet.add(posKey);
    voxels.push({ x: x2, y: vy, z: z2, c: ci });
  }
}

console.log(`Face voxels: ${voxels.length}, Palette: ${palette.length} colors`);
console.log(`Grid: ${GX}x${GY}x${GZ} (same as CE x2)`);

// ========================================================================
// Write .vox
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

writeVox(OUTPUT, GX, GY, GZ, voxels, palette);
console.log(`Written: ${OUTPUT}`);
console.log(`\nViewer: scale=SCALE/2, offset=FACE_FLOAT [0, 0, 0.004]`);
