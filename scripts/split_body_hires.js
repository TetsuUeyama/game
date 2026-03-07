/**
 * Extract high-resolution face parts from 2x voxelized CE body.
 * Same logic as split_body_parts.js but with scaled thresholds.
 * Face parts are overlays — skin fill replaces extracted positions in base.
 *
 * Usage: node scripts/split_body_hires.js
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
const body = readVox(path.join(BASE, 'public/box2-hires/cyberpunkelf_body.vox'));
const { sx, sy, sz, palette } = body;
const OUT_DIR = path.join(BASE, 'public/box2');

console.log(`Hi-res body: ${sx}x${sy}x${sz}, ${body.voxels.length} voxels`);

// Scale ratio: lo-res was 85x34x102, hi-res is 189x63x208
const R = sz / 102;  // ~2.04
console.log(`Scale ratio: ${R.toFixed(3)}`);

// --- Skin color (CE has blue/purple skin) ---
function isSkinColor(c) {
  const col = palette[c - 1];
  if (!col) return true;
  const { r, g, b } = col;
  // CE blue skin: B >= 230, R and G in 100-150 range, similar to each other
  if (b >= 230 && r >= 100 && r <= 150 && g >= 100 && g <= 150 && Math.abs(r - g) <= 30) return true;
  return false;
}
function isFeatureColor(c) { return !isSkinColor(c); }

// Find bright skin color
const faceSkinCounts = {};
const headZstart = Math.round(80 * R);
for (const v of body.voxels) {
  if (v.z >= headZstart && v.y <= Math.round(12 * R) && v.x >= Math.round(33 * R) && v.x <= Math.round(47 * R)) {
    if (isSkinColor(v.c)) faceSkinCounts[v.c] = (faceSkinCounts[v.c] || 0) + 1;
  }
}
let brightSkin = 1, bestBright = 0;
for (const [c, n] of Object.entries(faceSkinCounts)) {
  if (n < 20) continue;
  const col = palette[parseInt(c) - 1];
  const lum = col.r + col.g + col.b;
  if (lum > bestBright) { bestBright = lum; brightSkin = parseInt(c); }
}
console.log(`Bright skin: idx${brightSkin} RGB(${palette[brightSkin-1].r},${palette[brightSkin-1].g},${palette[brightSkin-1].b})`);

// --- Scaled region thresholds ---
// Lo-res thresholds → hi-res (multiply by R)
const EAR_Z_MIN = Math.round(85 * R), EAR_Z_MAX = Math.round(93 * R);
const EAR_INNER_LEFT = Math.round(33 * R);
const EAR_INNER_RIGHT = Math.round(47 * R);

const EYE_Z_MIN = Math.round(86 * R), EYE_Z_MAX = Math.round(92 * R);
const EYE_Y_MAX = Math.round(7 * R);
const EYE_X_MIN = Math.round(31 * R), EYE_X_MAX = Math.round(49 * R);

const NOSE_Z_MIN = Math.round(84 * R), NOSE_Z_MAX = Math.round(87 * R);
const NOSE_Y_MAX = Math.round(4 * R);
const NOSE_X_MIN = Math.round(37 * R), NOSE_X_MAX = Math.round(43 * R);

const MOUTH_Z_MIN = Math.round(80 * R), MOUTH_Z_MAX = Math.round(84 * R);
const MOUTH_Y_MAX = Math.round(6 * R);
const MOUTH_X_MIN = Math.round(35 * R), MOUTH_X_MAX = Math.round(45 * R);

console.log(`Ears: z=${EAR_Z_MIN}-${EAR_Z_MAX}, x<${EAR_INNER_LEFT} or x>${EAR_INNER_RIGHT}`);
console.log(`Eyes: z=${EYE_Z_MIN}-${EYE_Z_MAX}, y<=${EYE_Y_MAX}, x=${EYE_X_MIN}-${EYE_X_MAX}`);
console.log(`Nose: z=${NOSE_Z_MIN}-${NOSE_Z_MAX}, y<=${NOSE_Y_MAX}, x=${NOSE_X_MIN}-${NOSE_X_MAX}`);
console.log(`Mouth: z=${MOUTH_Z_MIN}-${MOUTH_Z_MAX}, y<=${MOUTH_Y_MAX}, x=${MOUTH_X_MIN}-${MOUTH_X_MAX}`);

// Nose front detection
const noseMinY = {};
for (const v of body.voxels) {
  if (v.z >= NOSE_Z_MIN && v.z <= NOSE_Z_MAX &&
      v.x >= NOSE_X_MIN && v.x <= NOSE_X_MAX && v.y <= NOSE_Y_MAX) {
    const key = `${v.x},${v.z}`;
    if (noseMinY[key] === undefined || v.y < noseMinY[key]) noseMinY[key] = v.y;
  }
}

// Mouth front detection (geometric, since hi-res has no distinct mouth colors)
const mouthMinY = {};
for (const v of body.voxels) {
  if (v.z >= MOUTH_Z_MIN && v.z < MOUTH_Z_MAX &&
      v.x >= MOUTH_X_MIN && v.x <= MOUTH_X_MAX && v.y <= MOUTH_Y_MAX) {
    const key = `${v.x},${v.z}`;
    if (mouthMinY[key] === undefined || v.y < mouthMinY[key]) mouthMinY[key] = v.y;
  }
}

// --- Classify ---
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
    if (noseMinY[nKey] !== undefined && v.y <= noseMinY[nKey] + 2) {
      parts.nose.push(v); featurePositions.add(key); continue;
    }
  }

  if (v.z >= MOUTH_Z_MIN && v.z < MOUTH_Z_MAX &&
      v.x >= MOUTH_X_MIN && v.x <= MOUTH_X_MAX && v.y <= MOUTH_Y_MAX) {
    const mKey = `${v.x},${v.z}`;
    if (mouthMinY[mKey] !== undefined && v.y <= mouthMinY[mKey] + 2) {
      parts.mouth.push(v); featurePositions.add(key); continue;
    }
  }
}

// --- Brighten zones + base ---
const BRIGHTEN_ZONES = [
  { zMin: EYE_Z_MIN - 2, zMax: EYE_Z_MAX + 2, yMax: EYE_Y_MAX + 4, xMin: EYE_X_MIN - 2, xMax: EYE_X_MAX + 2 },
  { zMin: MOUTH_Z_MIN - 2, zMax: MOUTH_Z_MAX + 2, yMax: MOUTH_Y_MAX + 4, xMin: MOUTH_X_MIN - 2, xMax: MOUTH_X_MAX + 2 },
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
  const outPath = path.join(OUT_DIR, `cyberpunk_elf_body_${name}_hires.vox`);
  writeVox(outPath, sx, sy, sz, voxels, palette);
  console.log(`  ${name}: ${voxels.length} voxels`);
}

// --- Compute viewer offset ---
// Lo-res: SCALE=0.010, center=(85/2, 34/2)=(42.5, 17)
// Hi-res: SCALE=0.005, center=(189/2, 63/2)=(94.5, 31.5)
// Viewer coords: x=(vx-cx)*scale, y=vz*scale, z=-(vy-cy)*scale
// For body centroids to align, compute offset
const SCALE_LO = 0.010, SCALE_HI = 0.005;
const loCx = 85/2, loCy = 34/2;
const hiCx = sx/2, hiCy = sy/2;

// Compute centroid of lo-res body
const loBody = readVox(path.join(BASE, 'public/box2/cyberpunk_elf_body.vox'));
let loSum = [0,0,0];
for (const v of loBody.voxels) {
  loSum[0] += (v.x - loCx) * SCALE_LO;
  loSum[1] += v.z * SCALE_LO;
  loSum[2] += -(v.y - loCy) * SCALE_LO;
}
const loCenter = loSum.map(s => s / loBody.voxels.length);

let hiSum = [0,0,0];
for (const v of body.voxels) {
  hiSum[0] += (v.x - hiCx) * SCALE_HI;
  hiSum[1] += v.z * SCALE_HI;
  hiSum[2] += -(v.y - hiCy) * SCALE_HI;
}
const hiCenter = hiSum.map(s => s / body.voxels.length);

const offset = [loCenter[0]-hiCenter[0], loCenter[1]-hiCenter[1], loCenter[2]-hiCenter[2]];
console.log(`\nLo centroid: [${loCenter.map(v=>v.toFixed(4))}]`);
console.log(`Hi centroid: [${hiCenter.map(v=>v.toFixed(4))}]`);
console.log(`Offset for hi-res parts: [${offset.map(v=>v.toFixed(4))}]`);
console.log('\nDone!');
