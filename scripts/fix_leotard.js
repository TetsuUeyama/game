/**
 * Fix leotard: combine original leotard voxels (outside body) with
 * a body-surface shell in the leotard coverage zone.
 * Colors are taken from nearest original leotard voxel.
 *
 * Usage: node scripts/fix_leotard.js
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
const DIR = 'public/box3-new';
const PREFIX = 'highpriestess_blender_rigged';

// Read original (freshly re-voxelized) leotard
const leotard = readVox(path.join(BASE, DIR, `${PREFIX}_leotard.vox`));
const body = readVox(path.join(BASE, DIR, `${PREFIX}_body.vox`));
const SX = leotard.sx, SY = leotard.sy, SZ = leotard.sz;

console.log(`Body: ${body.voxels.length} voxels`);
console.log(`Leotard (original): ${leotard.voxels.length} voxels`);

// Build body set
const bodySet = new Set();
for (const v of body.voxels) bodySet.add(`${v.x},${v.y},${v.z}`);

// Separate leotard voxels: outside vs inside body
const outsideVoxels = [];
const insideVoxels = [];
for (const v of leotard.voxels) {
  if (bodySet.has(`${v.x},${v.y},${v.z}`)) {
    insideVoxels.push(v);
  } else {
    outsideVoxels.push(v);
  }
}
console.log(`  Outside body: ${outsideVoxels.length}, Inside body: ${insideVoxels.length}`);

// Determine leotard coverage zone from ALL original leotard voxels
const leoZmin = Math.min(...leotard.voxels.map(v => v.z));
const leoZmax = Math.max(...leotard.voxels.map(v => v.z));

// Per-Z: leotard X range (from original voxels, both inside and outside)
const leoXByZ = {};
for (const v of leotard.voxels) {
  if (!leoXByZ[v.z]) leoXByZ[v.z] = { xmin: v.x, xmax: v.x };
  else {
    leoXByZ[v.z].xmin = Math.min(leoXByZ[v.z].xmin, v.x);
    leoXByZ[v.z].xmax = Math.max(leoXByZ[v.z].xmax, v.x);
  }
}

// Build color map from original leotard: for each Z, store colors by X fraction
const leoColorByZ = {};
for (const v of leotard.voxels) {
  if (!leoColorByZ[v.z]) leoColorByZ[v.z] = [];
  leoColorByZ[v.z].push(v);
}

// Find nearest leotard color for a position
function getNearestColor(x, y, z) {
  let bestDist = Infinity;
  let bestC = leotard.voxels[0].c;
  // Search in nearby Z slices
  for (let dz = 0; dz <= 3; dz++) {
    for (const sz of [z + dz, z - dz]) {
      const slice = leoColorByZ[sz];
      if (!slice) continue;
      for (const v of slice) {
        const d = Math.abs(v.x - x) + Math.abs(v.y - y) + Math.abs(v.z - z);
        if (d < bestDist) { bestDist = d; bestC = v.c; }
      }
      if (bestDist <= 2) return bestC;
    }
  }
  return bestC;
}

const DIRS = [[-1,0,0],[1,0,0],[0,-1,0],[0,1,0],[0,0,-1],[0,0,1]];

// Step 1: Keep all outside-body leotard voxels
const result = [];
const placed = new Set();
for (const v of outsideVoxels) {
  const key = `${v.x},${v.y},${v.z}`;
  if (!placed.has(key)) {
    placed.add(key);
    result.push(v);
  }
}
console.log(`Step 1 - kept outside: ${result.length}`);

// Step 2: For each body surface voxel in the leotard zone,
// add leotard voxels in empty neighbors (forming a shell)
let shellAdded = 0;
for (const bv of body.voxels) {
  if (bv.z < leoZmin || bv.z > leoZmax) continue;

  // Check X coverage at this Z
  const xRange = leoXByZ[bv.z];
  if (!xRange) continue;
  if (bv.x < xRange.xmin || bv.x > xRange.xmax) continue;

  // Check if this body voxel is on the surface (has empty neighbor)
  for (const [dx, dy, dz] of DIRS) {
    const nx = bv.x + dx, ny = bv.y + dy, nz = bv.z + dz;
    if (nx < 0 || nx >= SX || ny < 0 || ny >= SY || nz < 0 || nz >= SZ) continue;
    const nkey = `${nx},${ny},${nz}`;
    if (bodySet.has(nkey)) continue; // neighbor is inside body
    if (placed.has(nkey)) continue;  // already have leotard there

    placed.add(nkey);
    const c = getNearestColor(nx, ny, nz);
    result.push({ x: nx, y: ny, z: nz, c });
    shellAdded++;
  }
}
console.log(`Step 2 - shell added: ${shellAdded}`);
console.log(`Total: ${result.length} voxels`);

const dstPath = path.join(BASE, DIR, `${PREFIX}_leotard.vox`);
writeVox(dstPath, SX, SY, SZ, result, leotard.palette);
console.log(`Written: ${dstPath}`);

// Update manifest
const manifestPath = path.join(BASE, DIR, `${PREFIX}_parts.json`);
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const entry = manifest.find(p => p.key === 'leotard');
if (entry) entry.voxels = result.length;
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
console.log('Updated manifest.');
console.log('Done!');
