/**
 * Split CE body into: base body + ears + eyes + nose + mouth
 * - Eyes/Mouth/Nose: non-skin voxels extracted as overlay parts
 *   → their positions in base are REPLACED with skin-colored voxels
 * - Ears: geometric protrusion
 * - Base body always has a smooth skin face (no holes)
 *
 * Usage: node scripts/split_body_parts.js
 */
const fs = require('fs');
const path = require('path');

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

// --- Main ---
const BASE = path.join(__dirname, '..');
const SRC = path.join(BASE, 'public/box2/cyberpunk_elf_body.vox');
const OUT_DIR = path.join(BASE, 'public/box2');

const body = readVox(SRC);
const { sx, sy, sz, palette } = body;
console.log(`Body: ${sx}x${sy}x${sz}, ${body.voxels.length} voxels`);

// --- Skin color detection ---
// Strict skin: warm tones typical of the body
function isSkinColor(c) {
  const col = palette[c - 1];
  if (!col) return true;
  const { r, g, b } = col;
  // Warm skin: R dominant, G/B moderate, not gray
  if (r >= 150 && g >= 110 && b >= 90 && (r - b) >= 15 && (r - g) <= 60) return true;
  return false;
}

// Non-skin in face context: anything that's NOT a warm skin tone
function isFeatureColor(c) {
  return !isSkinColor(c);
}

// --- Find dominant skin palette index per Z-slice of face ---
// This will be used to fill holes where features were extracted
const faceSkinByZ = {};
for (const v of body.voxels) {
  if (v.z >= 80 && v.z <= 95 && v.y <= 12 && v.x >= 33 && v.x <= 47) {
    if (isSkinColor(v.c)) {
      if (!faceSkinByZ[v.z]) faceSkinByZ[v.z] = {};
      faceSkinByZ[v.z][v.c] = (faceSkinByZ[v.z][v.c] || 0) + 1;
    }
  }
}
const skinColorByZ = {};
for (const z in faceSkinByZ) {
  const colors = faceSkinByZ[z];
  let bestC = null, bestN = 0;
  for (const [c, n] of Object.entries(colors)) {
    if (n > bestN) { bestN = n; bestC = parseInt(c); }
  }
  skinColorByZ[z] = bestC;
}
// Fallback: overall most common skin color in head
const allSkinCounts = {};
for (const z in faceSkinByZ) for (const [c, n] of Object.entries(faceSkinByZ[z])) allSkinCounts[c] = (allSkinCounts[c] || 0) + n;
let fallbackSkin = 20; // default
let bestCount = 0;
for (const [c, n] of Object.entries(allSkinCounts)) {
  if (n > bestCount) { bestCount = n; fallbackSkin = parseInt(c); }
}
console.log(`Fallback skin color index: ${fallbackSkin} RGB(${palette[fallbackSkin-1].r},${palette[fallbackSkin-1].g},${palette[fallbackSkin-1].b})`);

// Pick a BRIGHT skin color: use top 3 brightest skin tones by luminance
const brightSkinCandidates = Object.entries(allSkinCounts)
  .map(([c, n]) => ({ c: parseInt(c), n, col: palette[parseInt(c) - 1] }))
  .filter(e => e.n >= 10) // at least 10 voxels (not a rare outlier)
  .sort((a, b) => (b.col.r + b.col.g + b.col.b) - (a.col.r + a.col.g + a.col.b));
const brightSkin = brightSkinCandidates.length > 0 ? brightSkinCandidates[0].c : fallbackSkin;
console.log(`Bright skin fill: idx${brightSkin} RGB(${palette[brightSkin-1].r},${palette[brightSkin-1].g},${palette[brightSkin-1].b})`);

function getSkinColor(z) {
  // Use bright skin for face fill (eyes/mouth/nose areas)
  return brightSkin;
}

// --- Region definitions ---
// Ears: protrude beyond head width
const EAR_Z_MIN = 85, EAR_Z_MAX = 93;
const EAR_INNER_LEFT = 33;
const EAR_INNER_RIGHT = 47;

// Eye region (wider to catch surrounding eye-related colors)
const EYE_Z_MIN = 86, EYE_Z_MAX = 92;
const EYE_Y_MAX = 7;
const EYE_X_MIN = 31, EYE_X_MAX = 49;

// Nose region
const NOSE_Z_MIN = 84, NOSE_Z_MAX = 87;
const NOSE_Y_MAX = 4;
const NOSE_X_MIN = 37, NOSE_X_MAX = 43;

// Mouth region (wider to catch all lip colors)
const MOUTH_Z_MIN = 80, MOUTH_Z_MAX = 84;
const MOUTH_Y_MAX = 6;
const MOUTH_X_MIN = 35, MOUTH_X_MAX = 45;

// --- Build nose front detection ---
const noseMinY = {};
for (const v of body.voxels) {
  if (v.z >= NOSE_Z_MIN && v.z <= NOSE_Z_MAX &&
      v.x >= NOSE_X_MIN && v.x <= NOSE_X_MAX && v.y <= NOSE_Y_MAX) {
    const key = `${v.x},${v.z}`;
    if (noseMinY[key] === undefined || v.y < noseMinY[key]) noseMinY[key] = v.y;
  }
}

// --- Classify voxels ---
const parts = { ears: [], eyes: [], nose: [], mouth: [] };
const featurePositions = new Set(); // positions where features were extracted

for (const v of body.voxels) {
  const key = `${v.x},${v.y},${v.z}`;

  // 1. Ears: geometric protrusion
  if (v.z >= EAR_Z_MIN && v.z <= EAR_Z_MAX &&
      (v.x < EAR_INNER_LEFT || v.x > EAR_INNER_RIGHT)) {
    parts.ears.push(v);
    featurePositions.add(key);
    continue;
  }

  // 2. Eyes: ALL non-skin voxels in eye region
  if (v.z >= EYE_Z_MIN && v.z <= EYE_Z_MAX &&
      v.y <= EYE_Y_MAX &&
      v.x >= EYE_X_MIN && v.x <= EYE_X_MAX &&
      isFeatureColor(v.c)) {
    parts.eyes.push(v);
    featurePositions.add(key);
    continue;
  }

  // 3. Nose: front 2 layers of nose area (geometric protrusion)
  if (v.z >= NOSE_Z_MIN && v.z <= NOSE_Z_MAX &&
      v.x >= NOSE_X_MIN && v.x <= NOSE_X_MAX &&
      v.y <= NOSE_Y_MAX) {
    const nKey = `${v.x},${v.z}`;
    if (noseMinY[nKey] !== undefined && v.y <= noseMinY[nKey] + 1) {
      parts.nose.push(v);
      featurePositions.add(key);
      continue;
    }
  }

  // 4. Mouth: ALL non-skin voxels in mouth region
  if (v.z >= MOUTH_Z_MIN && v.z < MOUTH_Z_MAX &&
      v.y <= MOUTH_Y_MAX &&
      v.x >= MOUTH_X_MIN && v.x <= MOUTH_X_MAX &&
      isFeatureColor(v.c)) {
    parts.mouth.push(v);
    featurePositions.add(key);
    continue;
  }
}

// --- Define "surrounding area" for skin brightening ---
// Slightly larger than feature regions to cover shadow areas
const BRIGHTEN_ZONES = [
  { zMin: EYE_Z_MIN - 1, zMax: EYE_Z_MAX + 1, yMax: EYE_Y_MAX + 2, xMin: EYE_X_MIN - 1, xMax: EYE_X_MAX + 1 },
  { zMin: MOUTH_Z_MIN - 1, zMax: MOUTH_Z_MAX + 1, yMax: MOUTH_Y_MAX + 2, xMin: MOUTH_X_MIN - 1, xMax: MOUTH_X_MAX + 1 },
];

function isInBrightenZone(x, y, z) {
  for (const zone of BRIGHTEN_ZONES) {
    if (z >= zone.zMin && z <= zone.zMax && y <= zone.yMax && x >= zone.xMin && x <= zone.xMax) return true;
  }
  return false;
}

// Threshold: skin darker than this luminance gets brightened
const BRIGHT_LUM = palette[brightSkin - 1].r * 0.299 + palette[brightSkin - 1].g * 0.587 + palette[brightSkin - 1].b * 0.114;

function isDarkSkin(c) {
  if (!isSkinColor(c)) return false;
  const col = palette[c - 1];
  const lum = col.r * 0.299 + col.g * 0.587 + col.b * 0.114;
  return lum < BRIGHT_LUM - 2;
}

// --- Build base body ---
// All non-extracted voxels + skin-colored replacements for extracted positions
const baseVoxels = [];
let brightenedCount = 0;

for (const v of body.voxels) {
  const key = `${v.x},${v.y},${v.z}`;
  if (featurePositions.has(key)) continue;

  // Brighten dark skin around eye/mouth areas
  if (isInBrightenZone(v.x, v.y, v.z) && isDarkSkin(v.c)) {
    baseVoxels.push({ x: v.x, y: v.y, z: v.z, c: brightSkin });
    brightenedCount++;
  } else {
    baseVoxels.push(v);
  }
}

// Fill extracted feature positions with bright skin (except ears)
for (const v of [...parts.eyes, ...parts.mouth, ...parts.nose]) {
  baseVoxels.push({ x: v.x, y: v.y, z: v.z, c: brightSkin });
}

console.log(`Brightened ${brightenedCount} dark skin voxels around eyes/mouth`);

parts.base = baseVoxels;

// --- Write outputs ---
for (const [name, voxels] of Object.entries(parts)) {
  const outPath = path.join(OUT_DIR, `cyberpunk_elf_body_${name}.vox`);
  writeVox(outPath, sx, sy, sz, voxels, palette);
  console.log(`  ${name}: ${voxels.length} voxels`);
}

const extractedTotal = parts.ears.length + parts.eyes.length + parts.nose.length + parts.mouth.length;
console.log(`\nExtracted features: ${extractedTotal}`);
console.log(`Base body: ${parts.base.length} (original ${body.voxels.length} + ${parts.eyes.length + parts.mouth.length + parts.nose.length} skin fills - ${extractedTotal} extracted)`);

// Show what was extracted
for (const name of ['eyes', 'mouth', 'nose']) {
  const pvoxels = parts[name];
  if (pvoxels.length === 0) continue;
  const colors = {};
  for (const v of pvoxels) colors[v.c] = (colors[v.c] || 0) + 1;
  const top = Object.entries(colors).sort((a, b) => b[1] - a[1]).slice(0, 5);
  console.log(`\n${name} colors:`);
  for (const [idx, cnt] of top) {
    const c = palette[idx - 1];
    console.log(`  idx${idx}: ${cnt}v RGB(${c.r},${c.g},${c.b}) ${isSkinColor(parseInt(idx)) ? '[skin]' : '[feature]'}`);
  }
}

console.log('\nDone!');
