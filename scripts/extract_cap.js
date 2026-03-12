/**
 * Extract cap voxels from edited body_with_cap.vox
 * Finds voxels with palette colors (200,50,50) and (150,35,40),
 * saves them as knit_cap.vox.
 *
 * Usage: node scripts/extract_cap.js
 */
const fs = require('fs');

const INPUT_PATH = 'public/box2/body_with_cap.vox';
const OUT_PATH   = 'public/box2/knit_cap.vox';

// Cap colors to match
const CAP_COLORS = [
  { r: 200, g: 50, b: 50 },
  { r: 150, g: 35, b: 40 },
];

// ── Parse VOX ───────────────────────────────────────────────────────
function parseVox(buffer) {
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  let off = 0;
  const r32 = () => { const v = view.getUint32(off, true); off += 4; return v; };
  const r8 = () => view.getUint8(off++);
  const rStr = n => { let s = ''; for (let i = 0; i < n; i++) s += String.fromCharCode(view.getUint8(off + i)); off += n; return s; };

  rStr(4); r32();
  let sx = 0, sy = 0, sz = 0;
  const voxels = [];
  let palette = null;

  function readChunks(end) {
    while (off < end) {
      const id = rStr(4), cs = r32(), ccs = r32(), ce = off + cs;
      if (id === 'SIZE') { sx = r32(); sy = r32(); sz = r32(); }
      else if (id === 'XYZI') { const n = r32(); for (let i = 0; i < n; i++) voxels.push({ x: r8(), y: r8(), z: r8(), ci: r8() }); }
      else if (id === 'RGBA') { palette = []; for (let i = 0; i < 256; i++) { palette.push({ r: r8(), g: r8(), b: r8() }); r8(); } }
      off = ce; if (ccs > 0) readChunks(off + ccs);
    }
  }
  rStr(4); const mc = r32(), mcc = r32(); off += mc; readChunks(off + mcc);
  return { sx, sy, sz, voxels, palette };
}

// ── Write VOX ───────────────────────────────────────────────────────
function writeVox(filepath, sizeX, sizeY, sizeZ, voxels, palette) {
  function makeChunk(id, data) {
    const header = Buffer.alloc(12);
    header.write(id, 0);
    header.writeUInt32LE(data.length, 4);
    header.writeUInt32LE(0, 8);
    return Buffer.concat([header, data]);
  }

  const sizeBuf = Buffer.alloc(12);
  sizeBuf.writeUInt32LE(sizeX, 0);
  sizeBuf.writeUInt32LE(sizeY, 4);
  sizeBuf.writeUInt32LE(sizeZ, 8);

  const xyziBuf = Buffer.alloc(4 + voxels.length * 4);
  xyziBuf.writeUInt32LE(voxels.length, 0);
  for (let i = 0; i < voxels.length; i++) {
    const v = voxels[i];
    xyziBuf.writeUInt8(v.x, 4 + i * 4);
    xyziBuf.writeUInt8(v.y, 4 + i * 4 + 1);
    xyziBuf.writeUInt8(v.z, 4 + i * 4 + 2);
    xyziBuf.writeUInt8(v.ci, 4 + i * 4 + 3);
  }

  const rgbaBuf = Buffer.alloc(256 * 4);
  for (let i = 0; i < 256; i++) {
    const c = palette[i] || { r: 0, g: 0, b: 0 };
    rgbaBuf.writeUInt8(c.r, i * 4);
    rgbaBuf.writeUInt8(c.g, i * 4 + 1);
    rgbaBuf.writeUInt8(c.b, i * 4 + 2);
    rgbaBuf.writeUInt8(255, i * 4 + 3);
  }

  const mainContent = Buffer.concat([
    makeChunk('SIZE', sizeBuf),
    makeChunk('XYZI', xyziBuf),
    makeChunk('RGBA', rgbaBuf),
  ]);

  const header = Buffer.alloc(8);
  header.write('VOX ', 0);
  header.writeUInt32LE(150, 4);

  const mainHeader = Buffer.alloc(12);
  mainHeader.write('MAIN', 0);
  mainHeader.writeUInt32LE(0, 4);
  mainHeader.writeUInt32LE(mainContent.length, 8);

  fs.writeFileSync(filepath, Buffer.concat([header, mainHeader, mainContent]));
  console.log(`Written: ${filepath} (${voxels.length} voxels, ${sizeX}x${sizeY}x${sizeZ})`);
}

// ── Main ────────────────────────────────────────────────────────────
console.log('Loading:', INPUT_PATH);
const data = parseVox(fs.readFileSync(INPUT_PATH));
console.log(`Loaded: ${data.sx}x${data.sy}x${data.sz}, ${data.voxels.length} voxels, palette: ${data.palette ? 'yes' : 'no'}`);

// Find palette indices that match cap colors
const capIndices = new Set();
if (data.palette) {
  for (let i = 0; i < 256; i++) {
    const pc = data.palette[i];
    for (const cc of CAP_COLORS) {
      if (pc.r === cc.r && pc.g === cc.g && pc.b === cc.b) {
        capIndices.add(i + 1); // VOX palette index is 1-based in XYZI
        console.log(`  Palette match: index ${i + 1} = (${pc.r},${pc.g},${pc.b})`);
      }
    }
  }
}

console.log(`Cap palette indices: [${[...capIndices].join(', ')}]`);

// Extract cap voxels
const capVoxels = [];
for (const v of data.voxels) {
  if (capIndices.has(v.ci)) {
    capVoxels.push(v);
  }
}

console.log(`Extracted ${capVoxels.length} cap voxels`);

// Build cap palette (reuse the 2 cap colors)
const capPalette = [];
capPalette[0] = { r: 200, g: 50, b: 50 };   // main cap
capPalette[1] = { r: 150, g: 35, b: 40 };    // brim
for (let i = 2; i < 256; i++) capPalette[i] = { r: 0, g: 0, b: 0 };

// Remap cap voxel ci to new palette (1=main, 2=brim)
const indexMap = new Map();
let newIdx = 1;
for (const ci of capIndices) {
  const pc = data.palette[ci - 1];
  // Match to cap color
  if (pc.r === 200 && pc.g === 50 && pc.b === 50) indexMap.set(ci, 1);
  else if (pc.r === 150 && pc.g === 35 && pc.b === 40) indexMap.set(ci, 2);
  else indexMap.set(ci, newIdx++);
}

const outputVoxels = capVoxels.map(v => ({
  x: v.x, y: v.y, z: v.z,
  ci: indexMap.get(v.ci) || 1,
}));

writeVox(OUT_PATH, data.sx, data.sy, data.sz, outputVoxels, capPalette);
console.log('Done!');
