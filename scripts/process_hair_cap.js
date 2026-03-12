/**
 * Post-process voxelized hair to originate from the knit cap.
 *
 * Logic:
 * 1. Load body, cap, and raw hair voxels (all on same hires grid)
 * 2. Remove hair voxels that overlap with body
 * 3. Remove hair voxels that are inside the body (below cap region)
 * 4. Keep hair that connects to cap surface or extends outward from it
 * 5. Output processed hair + merged preview file
 *
 * Usage: node scripts/process_hair_cap.js
 */
const fs = require('fs');

const BODY_PATH = 'public/box2/cyberpunk_elf_body_base_hires_sym.vox';
const CAP_PATH  = 'public/box2/knit_cap.vox';
const HAIR_PATH = 'public/box2/cyberpunk_elf_hair_hires.vox';
const OUT_HAIR  = 'public/box2/cyberpunk_elf_hair_hires_processed.vox';
const OUT_MERGED = 'public/box2/body_cap_hair.vox';

// ── Parse/Write VOX ─────────────────────────────────────────────────
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

// ── Main ────────────────────────────────────────────────────────────
console.log('Loading files...');
const body = parseVox(fs.readFileSync(BODY_PATH));
const cap = parseVox(fs.readFileSync(CAP_PATH));
const hair = parseVox(fs.readFileSync(HAIR_PATH));
console.log(`Body: ${body.voxels.length}, Cap: ${cap.voxels.length}, Hair: ${hair.voxels.length}`);

// Build occupation sets
const bodySet = new Set();
for (const v of body.voxels) bodySet.add(`${v.x},${v.y},${v.z}`);

const capSet = new Set();
for (const v of cap.voxels) capSet.add(`${v.x},${v.y},${v.z}`);

// Cap surface: cap voxels that have at least one empty neighbor (not body, not cap)
const DIRS = [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]];
const capSurface = new Set();
for (const v of cap.voxels) {
  for (const [dx, dy, dz] of DIRS) {
    const key = `${v.x+dx},${v.y+dy},${v.z+dz}`;
    if (!bodySet.has(key) && !capSet.has(key)) {
      capSurface.add(`${v.x},${v.y},${v.z}`);
      break;
    }
  }
}
console.log(`Cap surface voxels: ${capSurface.size}`);

// Step 1: Remove hair that overlaps body or cap
let removed_overlap = 0;
const hairFiltered = [];
for (const v of hair.voxels) {
  const key = `${v.x},${v.y},${v.z}`;
  if (bodySet.has(key) || capSet.has(key)) {
    removed_overlap++;
    continue;
  }
  hairFiltered.push(v);
}
console.log(`Removed overlap with body/cap: ${removed_overlap}`);
console.log(`Hair after overlap removal: ${hairFiltered.length}`);

// Step 2: Flood fill from cap surface to find connected hair
// Hair voxels that are adjacent to cap surface → seed
// Then expand outward through connected hair voxels
const hairSet = new Set();
const hairMap = new Map();
for (const v of hairFiltered) {
  const key = `${v.x},${v.y},${v.z}`;
  hairSet.add(key);
  hairMap.set(key, v);
}

// Find hair voxels adjacent to cap surface (seeds)
const seeds = new Set();
for (const v of cap.voxels) {
  if (!capSurface.has(`${v.x},${v.y},${v.z}`)) continue;
  for (const [dx, dy, dz] of DIRS) {
    const nk = `${v.x+dx},${v.y+dy},${v.z+dz}`;
    if (hairSet.has(nk)) {
      seeds.add(nk);
    }
  }
}
console.log(`Hair seeds (adjacent to cap): ${seeds.size}`);

// Flood fill through hair from seeds
const connected = new Set(seeds);
const queue = [...seeds];
while (queue.length > 0) {
  const key = queue.pop();
  const [x, y, z] = key.split(',').map(Number);
  for (const [dx, dy, dz] of DIRS) {
    const nk = `${x+dx},${y+dy},${z+dz}`;
    if (hairSet.has(nk) && !connected.has(nk)) {
      connected.add(nk);
      queue.push(nk);
    }
  }
}
console.log(`Connected hair voxels (from cap): ${connected.size}`);
console.log(`Disconnected hair removed: ${hairFiltered.length - connected.size}`);

// Build output hair
const outputHair = [];
for (const key of connected) {
  outputHair.push(hairMap.get(key));
}

// Write processed hair
writeVox(OUT_HAIR, hair.sx, hair.sy, hair.sz, outputHair, hair.palette);

// Write merged preview (body + cap + hair)
const mergedPalette = [];
for (let i = 0; i < 256; i++) {
  mergedPalette.push(body.palette ? body.palette[i] : { r: 0, g: 0, b: 0 });
}
// Cap colors at 253-254
mergedPalette[253] = { r: 200, g: 50, b: 50 };
mergedPalette[254] = { r: 150, g: 35, b: 40 };
// Hair color at 252 (use average from hair palette)
if (hair.palette && hair.palette.length > 0) {
  mergedPalette[252] = hair.palette[0]; // first hair color
}

const merged = [];
const mergedSet = new Set();

// Body first
for (const v of body.voxels) {
  const key = `${v.x},${v.y},${v.z}`;
  mergedSet.add(key);
  merged.push(v);
}

// Cap
for (const v of cap.voxels) {
  const key = `${v.x},${v.y},${v.z}`;
  if (!mergedSet.has(key)) {
    mergedSet.add(key);
    merged.push({ x: v.x, y: v.y, z: v.z, ci: v.ci === 2 ? 255 : 254 });
  }
}

// Hair (use original palette index mapped to merged palette)
// For simplicity, map all hair to ci=253 in merged view
for (const v of outputHair) {
  const key = `${v.x},${v.y},${v.z}`;
  if (!mergedSet.has(key)) {
    mergedSet.add(key);
    merged.push({ x: v.x, y: v.y, z: v.z, ci: 253 });
  }
}

writeVox(OUT_MERGED, body.sx, body.sy, body.sz, merged, mergedPalette);

console.log(`\nSummary:`);
console.log(`  Original hair: ${hair.voxels.length}`);
console.log(`  Processed hair: ${outputHair.length}`);
console.log(`  Merged preview: ${merged.length}`);
console.log('Done!');
