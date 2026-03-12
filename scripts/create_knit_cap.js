/**
 * Generate a 1-voxel thick knit cap for the hires body.
 * - Covers the top/crown of the head
 * - Does NOT cover the ears
 * - Front comes down further (covers forehead)
 * - Back comes down much further (covers back of head/scalp)
 *
 * Usage: node scripts/create_knit_cap.js
 */
const fs = require('fs');

// ── Config ──────────────────────────────────────────────────────────
const BODY_PATH = 'public/box2/cyberpunk_elf_body_base_hires_sym.vox';
const OUT_PATH = 'public/box2/knit_cap.vox';

// Head center (from analysis)
const HEAD_CENTER_X = 92;
const HEAD_CENTER_Y = 27;

// Cap Z limits (varies by position around the head)
const CAP_TOP_Z = 999;      // no limit on top
const CAP_FRONT_BOTTOM_Z = 180;  // front (forehead) - lower
const CAP_BACK_BOTTOM_Z = 168;   // back (nape area) - much lower
const CAP_SIDE_BOTTOM_Z = 196;   // sides - stops above ears

// Ear exclusion: at z=195 area, head X extends to 60-123 (ears).
// The "core head" at mid-Y is about 73-110 wide. Ears stick out beyond that.
// Exclude voxels with X outside this core range at ear Z levels
const EAR_Z_TOP = 197;
const EAR_Z_BOTTOM = 186;
const EAR_X_INNER_LEFT = 70;   // left ear starts below this X
const EAR_X_INNER_RIGHT = 113; // right ear starts above this X

// Cap colors
const CAP_COLOR = { r: 160, g: 40, b: 45 };
const BRIM_COLOR = { r: 130, g: 30, b: 35 };
const BRIM_HEIGHT = 5;

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

// ── Determine cap bottom Z for a given position ─────────────────────
function getCapBottomZ(x, y) {
  // Determine direction from head center
  const dx = x - HEAD_CENTER_X;
  const dy = y - HEAD_CENTER_Y;

  // Angle: 0=front (low Y), PI=back (high Y)
  const angle = Math.atan2(dy, dx);
  // Normalize: front = dy < 0, back = dy > 0

  // Front-back interpolation based on Y relative to center
  const yNorm = (y - HEAD_CENTER_Y) / 20; // roughly -1 (front) to +1 (back)

  // Side factor: how far out in X from center
  const xDist = Math.abs(dx);
  const sideNorm = Math.min(1, xDist / 20); // 0=center, 1=far side

  if (sideNorm > 0.6) {
    // Side region → stop above ears
    return CAP_SIDE_BOTTOM_Z;
  }

  if (yNorm < -0.2) {
    // Front region
    const frontFactor = Math.min(1, (-yNorm - 0.2) / 0.6);
    return Math.round(CAP_SIDE_BOTTOM_Z + (CAP_FRONT_BOTTOM_Z - CAP_SIDE_BOTTOM_Z) * frontFactor);
  }

  if (yNorm > 0.2) {
    // Back region
    const backFactor = Math.min(1, (yNorm - 0.2) / 0.6);
    return Math.round(CAP_SIDE_BOTTOM_Z + (CAP_BACK_BOTTOM_Z - CAP_SIDE_BOTTOM_Z) * backFactor);
  }

  // Transition zone
  return CAP_SIDE_BOTTOM_Z;
}

// ── Check if position is in ear region ──────────────────────────────
function isEarRegion(x, y, z) {
  if (z < EAR_Z_BOTTOM || z > EAR_Z_TOP) return false;
  // Ears are at the sides (low/high X) at mid-to-back Y
  if (x < EAR_X_INNER_LEFT || x > EAR_X_INNER_RIGHT) return true;
  return false;
}

// ── Main ────────────────────────────────────────────────────────────
console.log('Loading body:', BODY_PATH);
const bodyBuf = fs.readFileSync(BODY_PATH);
const body = parseVox(bodyBuf);
console.log(`Body: ${body.sx}x${body.sy}x${body.sz}, ${body.voxels.length} voxels`);

const bodySet = new Set();
for (const v of body.voxels) {
  bodySet.add(`${v.x},${v.y},${v.z}`);
}

let maxZ = 0;
for (const v of body.voxels) { if (v.z > maxZ) maxZ = v.z; }
console.log(`Head top Z: ${maxZ}`);

// Find surface voxels in the cap region
const DIRS = [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]];
const capSet = new Set();
const capVoxels = [];

// For each body voxel in the head region, check if it's a surface voxel
// and if so, place cap voxels outside it
for (const v of body.voxels) {
  // Get the cap bottom Z for this XY position
  const bottomZ = getCapBottomZ(v.x, v.y);
  if (v.z < bottomZ) continue;

  // Skip ear region
  if (isEarRegion(v.x, v.y, v.z)) continue;

  // Check if surface voxel
  let isSurface = false;
  for (const [dx, dy, dz] of DIRS) {
    if (!bodySet.has(`${v.x+dx},${v.y+dy},${v.z+dz}`)) {
      isSurface = true;
      break;
    }
  }
  if (!isSurface) continue;

  // Place cap voxels in empty neighbor positions (outside body)
  for (const [dx, dy, dz] of DIRS) {
    const nx = v.x + dx, ny = v.y + dy, nz = v.z + dz;
    const nBottomZ = getCapBottomZ(nx, ny);
    if (nz < nBottomZ) continue;
    if (isEarRegion(nx, ny, nz)) continue;

    const key = `${nx},${ny},${nz}`;
    if (bodySet.has(key)) continue;
    if (capSet.has(key)) continue;
    capSet.add(key);
    capVoxels.push({ x: nx, y: ny, z: nz });
  }
}

console.log(`Cap voxels: ${capVoxels.length}`);

// Assign colors
const palette = [CAP_COLOR, BRIM_COLOR];
while (palette.length < 256) palette.push({ r: 0, g: 0, b: 0 });

// Find lowest Z per direction for brim coloring
let minCapZ = 999;
for (const v of capVoxels) { if (v.z < minCapZ) minCapZ = v.z; }

const outputVoxels = capVoxels.map(v => {
  // Brim: bottom N rows relative to that position's local bottom
  const localBottom = getCapBottomZ(v.x, v.y);
  const isBrim = v.z < localBottom + BRIM_HEIGHT;
  return { x: v.x, y: v.y, z: v.z, ci: isBrim ? 2 : 1 };
});

writeVox(OUT_PATH, body.sx, body.sy, body.sz, outputVoxels, palette);
console.log('Done!');
