/**
 * Fix suit_top: generate shell on CE Body arm + shoulder surface.
 * suit_top = fitted garment from fingertips to shoulders.
 * Coverage: all CE Body arm surface voxels + shoulder transition area.
 * Colors from original HP suit_top (nearest color).
 *
 * Usage: node scripts/fix_suit_top.js
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

const BASE = path.join(__dirname, '..');

// Read CE Body (remapped to HP grid) and original suit_top
const body = readVox(path.join(BASE, 'public/box3-new/highpriestess_blender_rigged_body.vox'));
const suitTop = readVox(path.join(BASE, 'public/box3-new/highpriestess_blender_rigged_suit_top.vox'));
const SX = body.sx, SY = body.sy, SZ = body.sz;

console.log(`CE Body: ${body.voxels.length} voxels, grid: ${SX}x${SY}x${SZ}`);
console.log(`suit_top (original HP): ${suitTop.voxels.length} voxels`);

// Build body structures
const bodySet = new Set();
for (const v of body.voxels) bodySet.add(`${v.x},${v.y},${v.z}`);

const DIRS = [[-1,0,0],[1,0,0],[0,-1,0],[0,1,0],[0,0,-1],[0,0,1]];
const bodySurface = [];
for (const v of body.voxels) {
  for (const [dx, dy, dz] of DIRS) {
    if (!bodySet.has(`${v.x+dx},${v.y+dy},${v.z+dz}`)) {
      bodySurface.push(v);
      break;
    }
  }
}
console.log(`CE Body surface: ${bodySurface.length} voxels`);

// Analyze body width per Z to detect arm region and torso center
const bodyByZ = {};
for (const v of body.voxels) {
  if (!bodyByZ[v.z]) bodyByZ[v.z] = { xmin: v.x, xmax: v.x, sumX: 0, sumY: 0, n: 0 };
  const d = bodyByZ[v.z];
  d.xmin = Math.min(d.xmin, v.x);
  d.xmax = Math.max(d.xmax, v.x);
  d.sumX += v.x;
  d.sumY += v.y;
  d.n++;
}
for (const z in bodyByZ) {
  const d = bodyByZ[z];
  d.w = d.xmax - d.xmin;
  d.cx = d.sumX / d.n;
  d.cy = d.sumY / d.n;
}

// Median torso width (non-arm)
const widths = Object.values(bodyByZ).map(d => d.w).sort((a, b) => a - b);
const medianW = widths[Math.floor(widths.length / 2)];
const armThreshold = medianW * 1.5;

// Identify arm Z levels and shoulder transition
const armZLevels = new Set();
const shoulderZLevels = new Set();
for (const [zStr, d] of Object.entries(bodyByZ)) {
  const z = +zStr;
  if (d.w > armThreshold) {
    armZLevels.add(z);
  }
}

// Shoulder: 3 Z levels above and below arm region
const armZmin = armZLevels.size > 0 ? Math.min(...armZLevels) : 0;
const armZmax = armZLevels.size > 0 ? Math.max(...armZLevels) : 0;
for (let z = armZmax + 1; z <= armZmax + 4; z++) {
  if (bodyByZ[z]) shoulderZLevels.add(z);
}
// Also include 2 levels below arm for wrist/hand transition
for (let z = armZmin - 2; z < armZmin; z++) {
  if (bodyByZ[z]) shoulderZLevels.add(z);
}

console.log(`Arm Z: ${armZmin}~${armZmax} (${armZLevels.size} levels), threshold: w>${armThreshold.toFixed(0)}, median=${medianW}`);
console.log(`Shoulder Z: ${[...shoulderZLevels].sort((a,b)=>a-b).join(',')}`);

// Determine torso X boundaries (from non-arm levels near arm region)
const torsoRef = [];
for (let z = armZmax + 1; z <= armZmax + 5; z++) {
  if (bodyByZ[z] && !armZLevels.has(z)) torsoRef.push(bodyByZ[z]);
}
for (let z = armZmin - 1; z >= armZmin - 5; z--) {
  if (bodyByZ[z] && !armZLevels.has(z)) torsoRef.push(bodyByZ[z]);
}
let torsoXmin = 999, torsoXmax = 0;
if (torsoRef.length > 0) {
  torsoXmin = Math.min(...torsoRef.map(d => d.xmin));
  torsoXmax = Math.max(...torsoRef.map(d => d.xmax));
} else {
  // Fallback: use median width centered
  const cx = Object.values(bodyByZ)[0].cx;
  torsoXmin = Math.round(cx - medianW / 2);
  torsoXmax = Math.round(cx + medianW / 2);
}
console.log(`Torso X boundaries: ${torsoXmin}~${torsoXmax}`);

// Color from original HP suit_top
const colorByZ = {};
for (const v of suitTop.voxels) {
  if (!colorByZ[v.z]) colorByZ[v.z] = [];
  colorByZ[v.z].push(v);
}
function getNearestColor(x, y, z) {
  let bestDist = Infinity, bestC = suitTop.voxels[0].c;
  for (let dz = 0; dz <= 15; dz++) {
    for (const sz of [z + dz, z - dz]) {
      const slice = colorByZ[sz];
      if (!slice) continue;
      for (const v of slice) {
        const d = Math.abs(v.x - x) + Math.abs(v.y - y) + Math.abs(v.z - z);
        if (d < bestDist) { bestDist = d; bestC = v.c; }
      }
      if (bestDist <= 3) return bestC;
    }
  }
  return bestC;
}

// Generate shell on arm + shoulder surface
const result = [];
const placed = new Set();
let armCount = 0, shoulderCount = 0;

for (const sv of bodySurface) {
  let cover = false;

  if (armZLevels.has(sv.z)) {
    // Arm Z level: cover all surface voxels OUTSIDE torso center
    // (torso center at arm level is where arms connect to body - don't cover that)
    const isArmX = (sv.x < torsoXmin) || (sv.x > torsoXmax);
    if (isArmX) cover = true;
  }

  if (shoulderZLevels.has(sv.z)) {
    // Shoulder transition: cover wider area
    cover = true;
  }

  if (!cover) continue;

  // Place shell voxels in empty neighbors
  for (const [dx, dy, dz] of DIRS) {
    const nx = sv.x + dx, ny = sv.y + dy, nz = sv.z + dz;
    if (nx < 0 || nx >= SX || ny < 0 || ny >= SY || nz < 0 || nz >= SZ) continue;
    const nkey = `${nx},${ny},${nz}`;
    if (bodySet.has(nkey) || placed.has(nkey)) continue;
    placed.add(nkey);
    result.push({ x: nx, y: ny, z: nz, c: getNearestColor(nx, ny, nz) });
    if (armZLevels.has(sv.z)) armCount++;
    else shoulderCount++;
  }
}

console.log(`Arm shell: ${armCount}, Shoulder shell: ${shoulderCount}`);
console.log(`Total: ${result.length} voxels`);

// Debug: show Z distribution
const resultByZ = {};
for (const v of result) { resultByZ[v.z] = (resultByZ[v.z] || 0) + 1; }
const rZs = Object.keys(resultByZ).map(Number).sort((a,b)=>a-b);
console.log('Z distribution:');
for (const z of rZs) console.log(`  z=${z}: ${resultByZ[z]} voxels`);

writeVox(path.join(BASE, 'public/box3-new/highpriestess_blender_rigged_suit_top.vox'),
  SX, SY, SZ, result, suitTop.palette);
console.log('Written suit_top.vox');

const manifestPath = path.join(BASE, 'public/box3-new/highpriestess_blender_rigged_parts.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const entry = manifest.find(p => p.key === 'suit_top');
if (entry) entry.voxels = result.length;
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
console.log('Updated manifest. Done!');
