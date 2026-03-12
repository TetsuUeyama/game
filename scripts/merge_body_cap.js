/**
 * Merge body + cap into a single .vox file for MagicaVoxel editing.
 * Body keeps its original palette colors (indices 1..N).
 * Cap voxels use palette index 255 (bright red) so they're easy to select/edit.
 *
 * Usage: node scripts/merge_body_cap.js
 */
const fs = require('fs');

const BODY_PATH = 'public/box2/cyberpunk_elf_body_base_hires_sym.vox';
const CAP_PATH  = 'public/box2/knit_cap.vox';
const OUT_PATH  = 'public/box2/body_with_cap.vox';

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
console.log('Loading body:', BODY_PATH);
const body = parseVox(fs.readFileSync(BODY_PATH));
console.log(`Body: ${body.sx}x${body.sy}x${body.sz}, ${body.voxels.length} voxels`);

console.log('Loading cap:', CAP_PATH);
const cap = parseVox(fs.readFileSync(CAP_PATH));
console.log(`Cap: ${cap.voxels.length} voxels`);

// Build merged palette: body palette + cap color at index 254 and 255
const palette = [];
for (let i = 0; i < 256; i++) {
  palette.push(body.palette ? body.palette[i] : { r: 0, g: 0, b: 0 });
}
// Cap main color at palette index 254 (bright red, easy to spot)
palette[253] = { r: 200, g: 50, b: 50 };
// Cap brim color at palette index 255
palette[254] = { r: 150, g: 35, b: 40 };

// Collect body voxels with overlap check
const occupied = new Set();
const merged = [];

for (const v of body.voxels) {
  const key = `${v.x},${v.y},${v.z}`;
  occupied.add(key);
  merged.push(v);
}

// Add cap voxels (skip if overlapping body)
let capAdded = 0;
let capSkipped = 0;
for (const v of cap.voxels) {
  const key = `${v.x},${v.y},${v.z}`;
  if (occupied.has(key)) {
    capSkipped++;
    continue;
  }
  // Map cap palette: ci=1 → 254 (main), ci=2 → 255 (brim)
  const ci = v.ci === 2 ? 255 : 254;
  merged.push({ x: v.x, y: v.y, z: v.z, ci });
  capAdded++;
}

console.log(`Cap voxels added: ${capAdded}, skipped (overlap): ${capSkipped}`);
console.log(`Total merged: ${merged.length} voxels`);

writeVox(OUT_PATH, body.sx, body.sy, body.sz, merged, palette);
console.log('Done! Open in MagicaVoxel:', OUT_PATH);
