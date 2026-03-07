/**
 * Dilate (expand) body-covering parts by 1 voxel in all directions,
 * then shift by specified Z/Y amount.
 *
 * Usage: node scripts/dilate_parts_de.js <dz> [dy]
 * Example: node scripts/dilate_parts_de.js -5
 */
const fs = require('fs');
const path = require('path');

const DZ = parseInt(process.argv[2]);
const DY = parseInt(process.argv[3] || '0');
if (isNaN(DZ)) { console.error('Usage: node scripts/dilate_parts_de.js <dz> [dy]'); process.exit(1); }

// Parts that cover the body → dilate by 1 voxel
const DILATE_PARTS = [
  'armor_-_suit',
  'armor_-_suit_bra',
  'armor_-_suit_plates',
  'armor_-_arms',
  'armor_-_legs',
  'armor_-_shoulders',
  'armor_-_shoulders_clavice',
];

// Other parts → shift only (no dilation)
const SHIFT_ONLY_PARTS = [
  'armor_-_belt_inner',
  'armor_-_belt_outer',
  'armor_-_belt_cape',
  'armor_-_belt_scabbards',
  'armor_-_cape',
];

const DIRS6 = [[-1,0,0],[1,0,0],[0,-1,0],[0,1,0],[0,0,-1],[0,0,1]];

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

function dilate(voxels, sx, sy, sz) {
  // First pass: dilate 1 voxel in all 6 directions (XYZ)
  let occupied = new Set();
  for (const v of voxels) occupied.add(`${v.x},${v.y},${v.z}`);

  let result = [...voxels];
  let added = new Set();

  for (const v of voxels) {
    for (const [dx, dy, dz] of DIRS6) {
      const nx = v.x + dx, ny = v.y + dy, nz = v.z + dz;
      if (nx < 0 || nx >= sx || ny < 0 || ny >= sy || nz < 0 || nz >= sz) continue;
      const nkey = `${nx},${ny},${nz}`;
      if (occupied.has(nkey) || added.has(nkey)) continue;
      added.add(nkey);
      result.push({ x: nx, y: ny, z: nz, c: v.c });
    }
  }

  // Second pass: dilate 1 more voxel in Y direction only
  occupied = new Set();
  for (const v of result) occupied.add(`${v.x},${v.y},${v.z}`);
  added = new Set();
  const yDirs = [[0,-1,0],[0,1,0]];
  const extra = [];

  for (const v of result) {
    for (const [dx, dy, dz] of yDirs) {
      const nx = v.x + dx, ny = v.y + dy, nz = v.z + dz;
      if (ny < 0 || ny >= sy) continue;
      const nkey = `${nx},${ny},${nz}`;
      if (occupied.has(nkey) || added.has(nkey)) continue;
      added.add(nkey);
      extra.push({ x: nx, y: ny, z: nz, c: v.c });
    }
  }
  return result.concat(extra);
}

function shiftVoxels(voxels, dy, dz, sy, sz) {
  const shifted = [];
  let clipped = 0;
  for (const v of voxels) {
    const ny = v.y + dy, nz = v.z + dz;
    if (ny >= 0 && ny < sy && nz >= 0 && nz < sz) {
      shifted.push({ x: v.x, y: ny, z: nz, c: v.c });
    } else { clipped++; }
  }
  return { shifted, clipped };
}

const BASE = path.join(__dirname, '..');
const DIR = path.join(BASE, 'public/box4');
const PREFIX = 'darkelfblader_arp';

console.log(`Dilate + Shift: Z${DZ >= 0 ? '+' : ''}${DZ}, Y${DY >= 0 ? '+' : ''}${DY}`);
console.log(`(Z: - = down, + = up | Y: + = backward, - = forward)\n`);

const manifestPath = path.join(DIR, `${PREFIX}_parts.json`);
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

function processPart(partKey, shouldDilate) {
  const srcPath = path.join(DIR, 'originals', `${PREFIX}_${partKey}.vox`);
  const dstPath = path.join(DIR, `${PREFIX}_${partKey}.vox`);

  if (!fs.existsSync(srcPath)) {
    if (fs.existsSync(dstPath)) {
      fs.copyFileSync(dstPath, srcPath);
      console.log(`  Backed up: ${partKey}`);
    } else {
      console.log(`  SKIP (not found): ${partKey}`);
      return;
    }
  }

  const vox = readVox(srcPath);
  let voxels = vox.voxels;
  const origCount = voxels.length;

  if (shouldDilate) {
    voxels = dilate(voxels, vox.sx, vox.sy, vox.sz);
  }

  const { shifted, clipped } = shiftVoxels(voxels, DY, DZ, vox.sy, vox.sz);
  writeVox(dstPath, vox.sx, vox.sy, vox.sz, shifted, vox.palette);

  const entry = manifest.find(p => p.key === partKey);
  if (entry) entry.voxels = shifted.length;

  const tag = shouldDilate ? '[dilate+shift]' : '[shift only]';
  console.log(`  ${tag} ${partKey}: ${origCount} → ${shifted.length} (clipped: ${clipped})`);
}

for (const p of DILATE_PARTS) processPart(p, true);
for (const p of SHIFT_ONLY_PARTS) processPart(p, false);

fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
console.log('\nDone!');
