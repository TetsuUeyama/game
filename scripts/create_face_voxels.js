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
    eyelid:      [185, 135, 118],
    eyelash:     [45, 28, 22],
    eyebrow:     [150, 115, 100],
    nose_shadow: [150, 115, 110],
    nostril:     [125, 88, 82],
    lip_upper:   [200, 125, 118],
    lip_lower:   [185, 115, 108],
    lip_dark:    [170, 105, 98],
    lip_line:    [165, 80, 75],
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
drawEyeRow(85, 1, EYE_OFF, 'LLLL.',  eyeMap); // lower lid:   .,L,L,L,L,L,L,L,.
drawEyeRow(86, 0, EYE_OFF, 'ooWL.',  eyeMap); // iris lower:   .,L,W,o,o,o,W,L,.
drawEyeRow(86, 1, EYE_OFF, 'PioWL',  eyeMap); // pupil row:    L,W,o,i,P,i,o,W,L
drawEyeRow(87, 0, EYE_OFF, 'ooW..',  eyeMap); // iris upper:   ..,.,W,o,o,o,W,.,.

// Outer-only black accents (manually placed, no inner mirror)
{
  const cx2 = Math.round(bodyCenterX * MULT);
  const rEye = cx2 + EYE_OFF;     // right eye center
  const lEye = cx2 - 1 - EYE_OFF; // left eye center
  const z2 = 87 * MULT;           // same row as iris upper
  // Outer black at outermost edge of each eye
  featureVoxels.push({ x2: rEye + 4, z2, color: 'pupil' });    // right eye outer
  featureVoxels.push({ x2: lEye - 4, z2, color: 'pupil' });    // left eye outer
  // Diagonally above-outside
  featureVoxels.push({ x2: rEye + 5, z2: z2 + 1, color: 'pupil' }); // right eye upper-outer
  featureVoxels.push({ x2: lEye - 5, z2: z2 + 1, color: 'pupil' }); // left eye upper-outer
}

// ========================================================================
// EYEBROWS — z≈93-94, offset ±4-8 from center
// ========================================================================
// Angled eyebrows: 1 row thick, rising ~10° from inner to outer
{
  const cx2 = Math.round(bodyCenterX * MULT);
  const rEye = cx2 + EYE_OFF;
  const lEye = cx2 - 1 - EYE_OFF;
  const baseZ2 = 88 * MULT; // lowered position
  const browHalf = 4; // half-width (9px total per brow)
  const angleRise = 2; // total z2 rise from inner to outer (~10°)

  for (let i = -browHalf; i <= browHalf; i++) {
    const t = (i + browHalf) / (2 * browHalf); // 0=inner, 1=outer
    let dz = Math.round(t * angleRise);
    // Outermost pixel: drop 1px
    if (i === browHalf) dz -= 1;
    // Right brow: inner(-) to outer(+)
    featureVoxels.push({ x2: rEye + i, z2: baseZ2 + dz, color: 'eyebrow' });
    // Left brow: mirrored
    featureVoxels.push({ x2: lEye - i, z2: baseZ2 + dz, color: 'eyebrow' });
  }
}

// ========================================================================
// NOSE — centered, z≈84-87
// ========================================================================
const noseMap = { 's': 'nose_shadow', 'N': 'nostril' };
// Nose removed

// ========================================================================
// MOUTH — centered, z≈81-83
// ========================================================================
const mouthMap = {
  'U': 'lip_upper', 'L': 'lip_lower', 'D': 'lip_dark',
  'l': 'lip_line', 'c': 'lip_dark',
};
// Mouth: center-outward. drawSymRow i=0 maps to center PAIR (cx2 and cx2-1).
// Pattern 'LLc' → c,L,L,L,L,c (6px), 'LLLLc' → c,L,L,L,L,L,L,L,L,c (10px)
drawSymRow(81, 1, 'Lc',      mouthMap);  // bottom:     c,L,L,c  (4px)
drawSymRow(82, 0, 'LLc',     mouthMap);  // lower lip:  c,L,L,L,L,c  (6px)
drawSymRow(82, 1, 'llll',    mouthMap);  // lip line:   l,l,l,l,l,l,l,l  (8px)
// Upper lip with slight downward angle at outer edges
{
  const cx2 = Math.round(bodyCenterX * MULT);
  const baseZ2 = 83 * MULT; // z2=166
  const pattern = 'UUUUD'; // 5 chars = 10px total
  for (let i = 0; i < pattern.length; i++) {
    const ch = pattern[i];
    const colorName = mouthMap[ch];
    if (!colorName) continue;
    // Outer 2 pixels drop by 1
    const dz = (i >= 3) ? -1 : 0;
    const xR = cx2 + i;
    const xL = cx2 - 1 - i;
    featureVoxels.push({ x2: xR, z2: baseZ2 + dz, color: colorName });
    if (xL !== xR) featureVoxels.push({ x2: xL, z2: baseZ2 + dz, color: colorName });
  }
}

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

  // Place 1 in front of surface only (1 voxel thick)
  const vy = surfY - 1;
  if (vy < 0 || vy >= GY) continue;
  const posKey = `${x2},${vy},${z2}`;
  if (posSet.has(posKey)) continue;
  posSet.add(posKey);
  voxels.push({ x: x2, y: vy, z: z2, c: ci });
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
