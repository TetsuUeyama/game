/**
 * Fix DarkElfBlader suit_bra: where body protrusion overlaps suit_bra,
 * push suit_bra voxels forward (Y-1) to prevent see-through.
 *
 * Usage: node scripts/fix_suit_bra_de.js
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
const DIR = path.join(BASE, 'public/box4');
const PREFIX = 'darkelfblader_arp';

// Read body and suit_bra (already dilated+shifted)
const body = readVox(path.join(DIR, `${PREFIX}_body.vox`));
const bra = readVox(path.join(DIR, `${PREFIX}_armor_-_suit_bra.vox`));

console.log(`Body: ${body.voxels.length} voxels`);
console.log(`Suit_bra: ${bra.voxels.length} voxels`);

// Build body set
const bodySet = new Set();
for (const v of body.voxels) bodySet.add(`${v.x},${v.y},${v.z}`);

// For each bra voxel that overlaps with body, push it forward (Y-1)
const result = [];
const placed = new Set();
let pushed = 0;

for (const v of bra.voxels) {
  const key = `${v.x},${v.y},${v.z}`;
  if (bodySet.has(key)) {
    // Body protrusion overlaps - push bra voxel forward (Y-1)
    let ny = v.y - 1;
    // Keep pushing forward until no overlap (max 3 steps)
    for (let step = 0; step < 3; step++) {
      if (ny < 0) break;
      const nkey = `${v.x},${ny},${v.z}`;
      if (!bodySet.has(nkey) && !placed.has(nkey)) {
        placed.add(nkey);
        result.push({ x: v.x, y: ny, z: v.z, c: v.c });
        pushed++;
        break;
      }
      ny--;
    }
  } else {
    if (!placed.has(key)) {
      placed.add(key);
      result.push(v);
    }
  }
}

console.log(`Pushed forward: ${pushed} voxels`);
console.log(`Result: ${result.length} voxels`);

const outPath = path.join(DIR, `${PREFIX}_armor_-_suit_bra.vox`);
writeVox(outPath, bra.sx, bra.sy, bra.sz, result, bra.palette);

// Update manifest
const manifestPath = path.join(DIR, `${PREFIX}_parts.json`);
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const entry = manifest.find(p => p.key === 'armor_-_suit_bra');
if (entry) entry.voxels = result.length;
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
console.log('Done!');
