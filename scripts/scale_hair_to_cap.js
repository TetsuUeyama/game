/**
 * Scale hair by chibi head enlargement factor and position at cap top.
 *
 * The chibi deform scales the head by 1.5x (at base) to 1.8x (at top).
 * The raw hair was voxelized at head_scale_override=1.0 (original size).
 * This script scales the hair up and centers it on the cap.
 *
 * Usage: node scripts/scale_hair_to_cap.js
 */
const fs = require('fs');

const HAIR_PATH = 'public/box2/cyberpunk_elf_hair_hires.vox'; // raw from Blender
const CAP_PATH  = 'public/box2/knit_cap.vox';
const OUT_PATH  = 'public/box2/cyberpunk_elf_hair_hires_processed.vox';

const SCALE_FACTOR = 1.5; // chibi head enlargement (base)

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

function writeVox(filepath, sizeX, sizeY, sizeZ, voxels, palette) {
  function makeChunk(id, data) {
    const header = Buffer.alloc(12);
    header.write(id, 0);
    header.writeUInt32LE(data.length, 4);
    header.writeUInt32LE(0, 8);
    return Buffer.concat([header, data]);
  }
  const sizeBuf = Buffer.alloc(12);
  sizeBuf.writeUInt32LE(sizeX, 0); sizeBuf.writeUInt32LE(sizeY, 4); sizeBuf.writeUInt32LE(sizeZ, 8);
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
    rgbaBuf.writeUInt8(c.r, i * 4); rgbaBuf.writeUInt8(c.g, i * 4 + 1);
    rgbaBuf.writeUInt8(c.b, i * 4 + 2); rgbaBuf.writeUInt8(255, i * 4 + 3);
  }
  const mainContent = Buffer.concat([makeChunk('SIZE', sizeBuf), makeChunk('XYZI', xyziBuf), makeChunk('RGBA', rgbaBuf)]);
  const header = Buffer.alloc(8); header.write('VOX ', 0); header.writeUInt32LE(150, 4);
  const mainHeader = Buffer.alloc(12); mainHeader.write('MAIN', 0); mainHeader.writeUInt32LE(0, 4); mainHeader.writeUInt32LE(mainContent.length, 8);
  fs.writeFileSync(filepath, Buffer.concat([header, mainHeader, mainContent]));
  console.log(`Written: ${filepath} (${voxels.length} voxels)`);
}

// ── Main ──
const hair = parseVox(fs.readFileSync(HAIR_PATH));
const cap = parseVox(fs.readFileSync(CAP_PATH));
console.log(`Hair: ${hair.voxels.length} voxels`);
console.log(`Cap: ${cap.voxels.length} voxels`);

// Find hair center (X, Y) and bottom Z
let hairMinX = 999, hairMaxX = 0, hairMinY = 999, hairMaxY = 0, hairMinZ = 999, hairMaxZ = 0;
for (const v of hair.voxels) {
  if (v.x < hairMinX) hairMinX = v.x;
  if (v.x > hairMaxX) hairMaxX = v.x;
  if (v.y < hairMinY) hairMinY = v.y;
  if (v.y > hairMaxY) hairMaxY = v.y;
  if (v.z < hairMinZ) hairMinZ = v.z;
  if (v.z > hairMaxZ) hairMaxZ = v.z;
}
const hairCx = (hairMinX + hairMaxX) / 2;
const hairCy = (hairMinY + hairMaxY) / 2;
console.log(`Hair bounds: X=${hairMinX}-${hairMaxX}, Y=${hairMinY}-${hairMaxY}, Z=${hairMinZ}-${hairMaxZ}`);
console.log(`Hair center: (${hairCx}, ${hairCy})`);

// Find cap center (X, Y) and top Z
let capMinX = 999, capMaxX = 0, capMinY = 999, capMaxY = 0, capMinZ = 999, capMaxZ = 0;
for (const v of cap.voxels) {
  if (v.x < capMinX) capMinX = v.x;
  if (v.x > capMaxX) capMaxX = v.x;
  if (v.y < capMinY) capMinY = v.y;
  if (v.y > capMaxY) capMaxY = v.y;
  if (v.z < capMinZ) capMinZ = v.z;
  if (v.z > capMaxZ) capMaxZ = v.z;
}
const capCx = (capMinX + capMaxX) / 2;
const capCy = (capMinY + capMaxY) / 2;
console.log(`Cap bounds: X=${capMinX}-${capMaxX}, Y=${capMinY}-${capMaxY}, Z=${capMinZ}-${capMaxZ}`);
console.log(`Cap center: (${capCx}, ${capCy}), top Z: ${capMaxZ}`);

// Scale hair around its center by SCALE_FACTOR, then reposition
// Hair root (where it connects to head) is around the top of the head (high Z in hair)
// The hair hangs DOWN from the head top → hairMaxZ is the root area
// Cap top is capMaxZ → align hair root to cap top

// Scale XY only (横方向), Z stays 1.0 (長さ方向はそのまま)
const dx = Math.round(capCx - hairCx);
const dy = Math.round(capCy - hairCy) + 10;  // 後頭部方向にシフト（Y+ = 後ろ）
// Align hair top (root/scalp area) to cap top — Z is not scaled
const dz = capMaxZ - hairMaxZ + 11;  // 少し下げる

console.log(`Translation: dx=${dx}, dy=${dy}, dz=${dz}`);
console.log(`Scale XY=${SCALE_FACTOR}, Z=1.0`);

// Pass 1: scale and collect, filling gaps by iterating sub-voxels
const seen = new Set();
const outputMap = new Map(); // key -> ci

for (const v of hair.voxels) {
  // For each source voxel, fill the scaled region to avoid gaps
  // A voxel at (x,y) maps to a region of SCALE_FACTOR width
  // We fill all integer coords in that region
  const cx = hairCx + (v.x - hairCx) * SCALE_FACTOR + dx;
  const cy = hairCy + (v.y - hairCy) * SCALE_FACTOR + dy;
  const nz = v.z + dz;

  if (nz < 0 || nz >= hair.sz) continue;

  // Fill a SCALE_FACTOR x SCALE_FACTOR area to prevent gaps
  const half = SCALE_FACTOR / 2;
  const xMin = Math.floor(cx - half + 0.5);
  const xMax = Math.floor(cx + half + 0.5);
  const yMin = Math.floor(cy - half + 0.5);
  const yMax = Math.floor(cy + half + 0.5);

  for (let fx = xMin; fx <= xMax; fx++) {
    for (let fy = yMin; fy <= yMax; fy++) {
      if (fx < 0 || fx >= 256 || fy < 0 || fy >= 256) continue;
      if (nz < 0 || nz >= 256) continue;
      const key = `${fx},${fy},${nz}`;
      if (!seen.has(key)) {
        seen.add(key);
        outputMap.set(key, v.ci);
      }
    }
  }
}

console.log(`Before push-out: ${outputMap.size} voxels`);

// Load body to push hair out of body/cap
const BODY_PATH = 'public/box2/cyberpunk_elf_body_base_hires_sym.vox';
const body = parseVox(fs.readFileSync(BODY_PATH));
const bodySet = new Set();
for (const v of body.voxels) bodySet.add(`${v.x},${v.y},${v.z}`);
const capSet = new Set();
for (const v of cap.voxels) capSet.add(`${v.x},${v.y},${v.z}`);

// Head center for push-out direction
const HEAD_CX = 92;
const HEAD_CY = 27;
const HEAD_CZ = 195;

// Push hair voxels inside body/cap outward along radial direction
const finalMap = new Map();
for (const [key, ci] of outputMap) {
  const [x, y, z] = key.split(',').map(Number);
  if (!bodySet.has(key) && !capSet.has(key)) {
    finalMap.set(key, ci);
    continue;
  }
  // Push outward from head center
  const ddx = x - HEAD_CX;
  const ddy = y - HEAD_CY;
  const ddz = z - HEAD_CZ;
  const len = Math.sqrt(ddx * ddx + ddy * ddy + ddz * ddz);
  if (len < 0.001) continue;
  const nx = ddx / len, ny = ddy / len, nz2 = ddz / len;
  // March outward until we find a free spot
  for (let step = 1; step <= 15; step++) {
    const px = Math.round(x + nx * step);
    const py = Math.round(y + ny * step);
    const pz = Math.round(z + nz2 * step);
    const pk = `${px},${py},${pz}`;
    if (px < 0 || px >= 256 || py < 0 || py >= 256 || pz < 0 || pz >= 256) break;
    if (!bodySet.has(pk) && !capSet.has(pk)) {
      if (!finalMap.has(pk)) {
        finalMap.set(pk, ci);
      }
      break;
    }
  }
}

console.log(`After push-out: ${finalMap.size} voxels`);

// Compute actual bounds for output grid
let maxX = 0, maxY = 0, maxZ = 0;
const output = [];
for (const [key, ci] of finalMap) {
  const [x, y, z] = key.split(',').map(Number);
  if (x > maxX) maxX = x;
  if (y > maxY) maxY = y;
  if (z > maxZ) maxZ = z;
  output.push({ x, y, z, ci });
}

// Grid size: must be at least as big as body grid, and fit all hair
const outSx = Math.max(hair.sx, maxX + 1);
const outSy = Math.max(hair.sy, maxY + 1);
const outSz = Math.max(hair.sz, maxZ + 1);
console.log(`Output grid: ${outSx}x${outSy}x${outSz}`);
console.log(`Output: ${output.length} voxels`);
writeVox(OUT_PATH, outSx, outSy, outSz, output, hair.palette);
console.log('Done!');
