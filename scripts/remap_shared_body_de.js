/**
 * Remap CyberpunkElf body → DarkElfBlader grid via TRANSLATION ONLY.
 * Body size is preserved (no scaling) so the same body can be shared.
 *
 * Usage: node scripts/remap_shared_body_de.js
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

// Grids
const ceGrid = JSON.parse(fs.readFileSync(path.join(BASE, 'public/box2-new/cyberpunkelf_grid.json'), 'utf8'));
const deGrid = JSON.parse(fs.readFileSync(path.join(BASE, 'public/box4/darkelfblader_arp_grid.json'), 'utf8'));

// Read CE body
const ceBody = readVox(path.join(BASE, 'public/box2-new/cyberpunkelf_body.vox'));
console.log(`CE body: ${ceBody.sx}x${ceBody.sy}x${ceBody.sz}, ${ceBody.voxels.length} voxels`);

// Read DE body original (from Blender backup, NOT the remapped body.vox)
// body.vox gets overwritten by this script, so we use the backup
const deBodyOrigPath = path.join(BASE, 'public/box4/originals/darkelfblader_arp_body_original.vox');
const deBodyPath = path.join(BASE, 'public/box4/darkelfblader_arp_body.vox');
// If original backup doesn't exist, current body.vox IS the original (first run)
const deBodySrc = fs.existsSync(deBodyOrigPath) ? deBodyOrigPath : deBodyPath;
const deBody = readVox(deBodySrc);
const deFull = readVox(path.join(BASE, 'public/box4/darkelfblader_arp.vox'));
console.log(`DE body (from ${path.basename(deBodySrc)}): ${deBody.sx}x${deBody.sy}x${deBody.sz}, ${deBody.voxels.length} voxels`);

// Compute body centroids in world space from voxel positions
function voxelCentroidWorld(voxels, grid) {
  let sx = 0, sy = 0, sz = 0;
  for (const v of voxels) {
    sx += grid.def_min[0] + (v.x + 0.5) * grid.voxel_size;
    sy += grid.def_min[1] + (v.y + 0.5) * grid.voxel_size;
    sz += grid.def_min[2] + (v.z + 0.5) * grid.voxel_size;
  }
  const n = voxels.length;
  return [sx / n, sy / n, sz / n];
}

const ceCenter = voxelCentroidWorld(ceBody.voxels, ceGrid);
const deCenter = voxelCentroidWorld(deBody.voxels, deGrid);

const translation = [
  deCenter[0] - ceCenter[0],
  deCenter[1] - ceCenter[1],
  deCenter[2] - ceCenter[2],
];

console.log('CE body center:', ceCenter.map(v => v.toFixed(4)));
console.log('DE body center:', deCenter.map(v => v.toFixed(4)));
console.log('Translation (world):', translation.map(v => v.toFixed(4)));

// --- Color mapping: CE skin → DE skin by luminance rank ---
const deBodyColors = {};
for (const v of deBody.voxels) deBodyColors[v.c] = (deBodyColors[v.c] || 0) + 1;
const deSkinIndices = Object.entries(deBodyColors).sort((a, b) => b[1] - a[1]).map(([c]) => parseInt(c));

const deSkinColors = deSkinIndices.slice(0, 20).map(idx => ({
  idx,
  ...deBody.palette[idx - 1],
  lum: deBody.palette[idx - 1].r * 0.299 + deBody.palette[idx - 1].g * 0.587 + deBody.palette[idx - 1].b * 0.114
}));
deSkinColors.sort((a, b) => a.lum - b.lum);

const ceUsedColors = {};
for (const v of ceBody.voxels) ceUsedColors[v.c] = (ceUsedColors[v.c] || 0) + 1;
const ceSortedByCount = Object.entries(ceUsedColors).sort((a, b) => b[1] - a[1]).map(([c]) => parseInt(c));

const ceLumSorted = ceSortedByCount.map(idx => ({
  idx,
  lum: ceBody.palette[idx - 1].r * 0.299 + ceBody.palette[idx - 1].g * 0.587 + ceBody.palette[idx - 1].b * 0.114
}));
ceLumSorted.sort((a, b) => a.lum - b.lum);

const colorMap = {};
for (let i = 0; i < ceLumSorted.length; i++) {
  const ratio = ceLumSorted.length > 1 ? i / (ceLumSorted.length - 1) : 0;
  const hpI = Math.round(ratio * (deSkinColors.length - 1));
  colorMap[ceLumSorted[i].idx] = deSkinColors[hpI].idx;
}

console.log('Color mapping (CE→DE, top 5):');
for (const ce of ceSortedByCount.slice(0, 5)) {
  const de = colorMap[ce];
  const ceC = ceBody.palette[ce - 1];
  const deC = deBody.palette[de - 1];
  console.log(`  CE idx${ce} RGB(${ceC.r},${ceC.g},${ceC.b}) → DE idx${de} RGB(${deC.r},${deC.g},${deC.b})`);
}

// --- Build per-Z Y correction from DE original body ---
// CE body and DE body have different chibi proportions, causing
// head and body to have different Y offsets. Correct per-Z level.
const deOrigYByZ = {};
for (const v of deBody.voxels) {
  if (!deOrigYByZ[v.z]) deOrigYByZ[v.z] = { sumY: 0, n: 0 };
  deOrigYByZ[v.z].sumY += v.y;
  deOrigYByZ[v.z].n++;
}

// --- Remap ---
const TX = deGrid.gx, TY = deGrid.gy, TZ = deGrid.gz;
const ceVs = ceGrid.voxel_size;
const deVs = deGrid.voxel_size;

// First pass: remap without Y correction to get CE body Z positions
const firstPass = [];
for (const v of ceBody.voxels) {
  const wx = ceGrid.def_min[0] + (v.x + 0.5) * ceVs;
  const wy = ceGrid.def_min[1] + (v.y + 0.5) * ceVs;
  const wz = ceGrid.def_min[2] + (v.z + 0.5) * ceVs;
  const hx = wx + translation[0];
  const hy = wy + translation[1];
  const hz = wz + translation[2];
  const vx2 = Math.round((hx - deGrid.def_min[0]) / deVs - 0.5);
  const vy2 = Math.round((hy - deGrid.def_min[1]) / deVs - 0.5);
  const vz2 = Math.round((hz - deGrid.def_min[2]) / deVs - 0.5);
  firstPass.push({ x: vx2, y: vy2, z: vz2, c: v.c });
}

// Compute per-Z Y centroid of remapped CE body
const ceRemapYByZ = {};
for (const v of firstPass) {
  if (v.z < 0 || v.z >= TZ) continue;
  if (!ceRemapYByZ[v.z]) ceRemapYByZ[v.z] = { sumY: 0, n: 0 };
  ceRemapYByZ[v.z].sumY += v.y;
  ceRemapYByZ[v.z].n++;
}

// Per-Z Y correction: align CE body Y centroid to DE body Y centroid
// Manual region offset
const BODY_EXTRA_Y = -3;  // body/arms/legs: negative Y = backward
const BODY_EXTRA_Z = -4;  // body/arms/legs: lower by 4
const HEAD_EXTRA_Y = 5;   // head: positive Y = forward
const HEAD_EXTRA_Z = -6;  // head: lower
const NECK_Z = 80;        // transition zone
const HEAD_Z = 85;        // head starts here

const yCorrection = {};
for (const zStr in deOrigYByZ) {
  const z = +zStr;
  if (ceRemapYByZ[z] && ceRemapYByZ[z].n > 0) {
    const deAvgY = deOrigYByZ[z].sumY / deOrigYByZ[z].n;
    const ceAvgY = ceRemapYByZ[z].sumY / ceRemapYByZ[z].n;
    let extra = 0;
    if (z < NECK_Z) {
      extra = BODY_EXTRA_Y;
    } else if (z >= HEAD_Z) {
      extra = HEAD_EXTRA_Y;
    } else {
      // Neck transition: interpolate
      const t = (z - NECK_Z) / (HEAD_Z - NECK_Z);
      extra = Math.round(BODY_EXTRA_Y + (HEAD_EXTRA_Y - BODY_EXTRA_Y) * t);
    }
    yCorrection[z] = Math.round(deAvgY - ceAvgY) + extra;
  }
}
console.log('Y correction samples:');
const sampleZ = [10, 20, 30, 50, 70, 80, 90, 100];
for (const z of sampleZ) {
  if (yCorrection[z] !== undefined) console.log(`  z=${z}: shift Y by ${yCorrection[z]}`);
}

// Second pass: apply per-Z Y correction + head Z correction
const remapped = [];
const seen = new Set();
let clipped = 0;

for (const v of firstPass) {
  const vx2 = v.x;
  const vy2 = v.y + (yCorrection[v.z] || 0);
  // Z correction per region
  let zShift = 0;
  if (v.z >= HEAD_Z) {
    zShift = HEAD_EXTRA_Z;
  } else if (v.z >= NECK_Z) {
    const t = (v.z - NECK_Z) / (HEAD_Z - NECK_Z);
    zShift = Math.round(BODY_EXTRA_Z + (HEAD_EXTRA_Z - BODY_EXTRA_Z) * t);
  } else {
    zShift = BODY_EXTRA_Z;
  }
  const vz2 = v.z + zShift;

  if (vx2 >= 0 && vx2 < TX && vy2 >= 0 && vy2 < TY && vz2 >= 0 && vz2 < TZ) {
    const key = `${vx2},${vy2},${vz2}`;
    if (!seen.has(key)) {
      seen.add(key);
      remapped.push({ x: vx2, y: vy2, z: vz2, c: colorMap[v.c] || v.c });
    }
  } else {
    clipped++;
  }
}

console.log(`\nRemapped: ${remapped.length} voxels (from ${ceBody.voxels.length}), clipped: ${clipped}`);

const dstPath = path.join(BASE, 'public/box4/darkelfblader_arp_body.vox');
writeVox(dstPath, TX, TY, TZ, remapped, deBody.palette);
console.log(`Written: ${dstPath}`);

// Update manifest
const manifestPath = path.join(BASE, 'public/box4/darkelfblader_arp_parts.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const bodyEntry = manifest.find(p => p.key === 'body');
if (bodyEntry) bodyEntry.voxels = remapped.length;
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
console.log('Updated manifest.');
console.log('\nDone!');
