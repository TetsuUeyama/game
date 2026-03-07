/**
 * Extract face parts from Queen Marika body vox.
 * Same logic as split_body_parts.js but adapted for QM body.
 * QM grid: 84x31x103, CE grid: 85x34x102 (very similar)
 *
 * Usage: node scripts/split_qm_face_parts.js
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
const SRC = path.join(BASE, 'public/box4/queenmarika_rigged_mustardui_body.vox');
const OUT_DIR = path.join(BASE, 'public/box4');

const body = readVox(SRC);
const { sx, sy, sz, palette } = body;
console.log(`QM Body: ${sx}x${sy}x${sz}, ${body.voxels.length} voxels`);

// --- Skin color detection (QM has warm skin tones) ---
function isSkinColor(c) {
  const col = palette[c - 1];
  if (!col) return true;
  const { r, g, b } = col;
  if (r >= 100 && g >= 70 && b >= 60 && (r - b) >= 10 && (r - g) <= 60) return true;
  return false;
}
function isFeatureColor(c) { return !isSkinColor(c); }

// --- Find bright skin color ---
const faceSkinCounts = {};
for (const v of body.voxels) {
  if (v.z >= 80 && v.y <= 10 && v.x >= 33 && v.x <= 47) {
    if (isSkinColor(v.c)) faceSkinCounts[v.c] = (faceSkinCounts[v.c] || 0) + 1;
  }
}
let brightSkin = 1, bestBright = 0;
for (const [c, n] of Object.entries(faceSkinCounts)) {
  if (n < 10) continue;
  const col = palette[parseInt(c) - 1];
  const lum = col.r + col.g + col.b;
  if (lum > bestBright) { bestBright = lum; brightSkin = parseInt(c); }
}
console.log(`Bright skin: idx${brightSkin} RGB(${palette[brightSkin-1].r},${palette[brightSkin-1].g},${palette[brightSkin-1].b})`);

// --- Region definitions (similar to CE, adapted for QM 84x31x103 grid) ---
// QM grid is almost identical to CE (85x34x102), so same thresholds work
const EAR_Z_MIN = 85, EAR_Z_MAX = 93;
const EAR_INNER_LEFT = 33;
const EAR_INNER_RIGHT = 47;

const EYE_Z_MIN = 86, EYE_Z_MAX = 92;
const EYE_Y_MAX = 7;
const EYE_X_MIN = 31, EYE_X_MAX = 49;

const NOSE_Z_MIN = 84, NOSE_Z_MAX = 87;
const NOSE_Y_MAX = 4;
const NOSE_X_MIN = 37, NOSE_X_MAX = 43;

const MOUTH_Z_MIN = 80, MOUTH_Z_MAX = 84;
const MOUTH_Y_MAX = 6;
const MOUTH_X_MIN = 35, MOUTH_X_MAX = 45;

console.log(`Ears: z=${EAR_Z_MIN}-${EAR_Z_MAX}, x<${EAR_INNER_LEFT} or x>${EAR_INNER_RIGHT}`);
console.log(`Eyes: z=${EYE_Z_MIN}-${EYE_Z_MAX}, y<=${EYE_Y_MAX}, x=${EYE_X_MIN}-${EYE_X_MAX}`);
console.log(`Nose: z=${NOSE_Z_MIN}-${NOSE_Z_MAX}, y<=${NOSE_Y_MAX}, x=${NOSE_X_MIN}-${NOSE_X_MAX}`);
console.log(`Mouth: z=${MOUTH_Z_MIN}-${MOUTH_Z_MAX}, y<=${MOUTH_Y_MAX}, x=${MOUTH_X_MIN}-${MOUTH_X_MAX}`);

// Build nose front detection
const noseMinY = {};
for (const v of body.voxels) {
  if (v.z >= NOSE_Z_MIN && v.z <= NOSE_Z_MAX &&
      v.x >= NOSE_X_MIN && v.x <= NOSE_X_MAX && v.y <= NOSE_Y_MAX) {
    const key = `${v.x},${v.z}`;
    if (noseMinY[key] === undefined || v.y < noseMinY[key]) noseMinY[key] = v.y;
  }
}

// Build mouth front detection (geometric, like nose)
const mouthMinY = {};
for (const v of body.voxels) {
  if (v.z >= MOUTH_Z_MIN && v.z <= MOUTH_Z_MAX &&
      v.x >= MOUTH_X_MIN && v.x <= MOUTH_X_MAX && v.y <= MOUTH_Y_MAX) {
    const key = `${v.x},${v.z}`;
    if (mouthMinY[key] === undefined || v.y < mouthMinY[key]) mouthMinY[key] = v.y;
  }
}

// --- Classify voxels ---
const parts = { ears: [], eyes: [], nose: [], mouth: [] };
const featurePositions = new Set();

for (const v of body.voxels) {
  const key = `${v.x},${v.y},${v.z}`;

  if (v.z >= EAR_Z_MIN && v.z <= EAR_Z_MAX &&
      (v.x < EAR_INNER_LEFT || v.x > EAR_INNER_RIGHT)) {
    parts.ears.push(v); featurePositions.add(key); continue;
  }

  if (v.z >= EYE_Z_MIN && v.z <= EYE_Z_MAX &&
      v.y <= EYE_Y_MAX && v.x >= EYE_X_MIN && v.x <= EYE_X_MAX &&
      isFeatureColor(v.c)) {
    parts.eyes.push(v); featurePositions.add(key); continue;
  }

  if (v.z >= NOSE_Z_MIN && v.z <= NOSE_Z_MAX &&
      v.x >= NOSE_X_MIN && v.x <= NOSE_X_MAX && v.y <= NOSE_Y_MAX) {
    const nKey = `${v.x},${v.z}`;
    if (noseMinY[nKey] !== undefined && v.y <= noseMinY[nKey] + 1) {
      parts.nose.push(v); featurePositions.add(key); continue;
    }
  }

  if (v.z >= MOUTH_Z_MIN && v.z < MOUTH_Z_MAX &&
      v.y <= MOUTH_Y_MAX && v.x >= MOUTH_X_MIN && v.x <= MOUTH_X_MAX) {
    const mKey = `${v.x},${v.z}`;
    if (mouthMinY[mKey] !== undefined && v.y <= mouthMinY[mKey] + 2) {
      parts.mouth.push(v); featurePositions.add(key); continue;
    }
  }
}

// --- Brighten zones + base ---
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
const bsCol = palette[brightSkin - 1];
const BRIGHT_LUM = bsCol.r * 0.299 + bsCol.g * 0.587 + bsCol.b * 0.114;
function isDarkSkin(c) {
  if (!isSkinColor(c)) return false;
  const col = palette[c - 1];
  return (col.r * 0.299 + col.g * 0.587 + col.b * 0.114) < BRIGHT_LUM - 2;
}

const baseVoxels = [];
let brightenedCount = 0;
for (const v of body.voxels) {
  if (featurePositions.has(`${v.x},${v.y},${v.z}`)) continue;
  if (isInBrightenZone(v.x, v.y, v.z) && isDarkSkin(v.c)) {
    baseVoxels.push({ x: v.x, y: v.y, z: v.z, c: brightSkin });
    brightenedCount++;
  } else {
    baseVoxels.push(v);
  }
}
for (const v of [...parts.eyes, ...parts.mouth, ...parts.nose]) {
  baseVoxels.push({ x: v.x, y: v.y, z: v.z, c: brightSkin });
}
parts.base = baseVoxels;

console.log(`\nBrightened: ${brightenedCount} surrounding skin voxels`);

// --- Write ---
for (const [name, voxels] of Object.entries(parts)) {
  const outPath = path.join(OUT_DIR, `queenmarika_face_${name}.vox`);
  writeVox(outPath, sx, sy, sz, voxels, palette);
  console.log(`  ${name}: ${voxels.length} voxels → ${outPath}`);
}

// --- Subdivide face parts (2x2x2) ---
console.log('\nSubdividing...');
for (const name of ['ears', 'eyes', 'nose', 'mouth']) {
  const srcVoxels = parts[name];
  const newSx = sx * 2, newSy = sy * 2, newSz = sz * 2;
  const newVoxels = [];
  for (const v of srcVoxels) {
    const bx = v.x * 2, by = v.y * 2, bz = v.z * 2;
    for (let dx = 0; dx < 2; dx++)
      for (let dy = 0; dy < 2; dy++)
        for (let dz = 0; dz < 2; dz++)
          newVoxels.push({ x: bx+dx, y: by+dy, z: bz+dz, c: v.c });
  }
  const outPath = path.join(OUT_DIR, `queenmarika_face_${name}_x2.vox`);
  writeVox(outPath, newSx, newSy, newSz, newVoxels, palette);
  console.log(`  ${name}_x2: ${newVoxels.length} voxels → ${outPath}`);
}

console.log('\nDone!');
