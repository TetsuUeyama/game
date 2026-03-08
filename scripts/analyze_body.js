const fs = require('fs');

const filePath = 'C:/Users/user/developsecond/contactform/public/box4/darkelfblader_arp_body.vox';
const buf = fs.readFileSync(filePath);

// Parse VOX header
const magic = buf.toString('ascii', 0, 4);
const version = buf.readInt32LE(4);
console.log(`Magic: ${magic}, Version: ${version}`);

let offset = 8;

function readChunk(buf, off) {
  const id = buf.toString('ascii', off, off + 4);
  const contentSize = buf.readInt32LE(off + 4);
  const childrenSize = buf.readInt32LE(off + 8);
  return { id, contentSize, childrenSize, dataOffset: off + 12 };
}

let sizeX, sizeY, sizeZ;
const voxels = [];

// Read MAIN chunk
const main = readChunk(buf, offset);
offset += 12; // skip MAIN header, children follow

// Parse children
const end = offset + main.childrenSize;
while (offset < end) {
  const chunk = readChunk(buf, offset);
  if (chunk.id === 'SIZE') {
    sizeX = buf.readInt32LE(chunk.dataOffset);
    sizeY = buf.readInt32LE(chunk.dataOffset + 4);
    sizeZ = buf.readInt32LE(chunk.dataOffset + 8);
  } else if (chunk.id === 'XYZI') {
    const numVoxels = buf.readInt32LE(chunk.dataOffset);
    for (let i = 0; i < numVoxels; i++) {
      const base = chunk.dataOffset + 4 + i * 4;
      voxels.push({
        x: buf.readUInt8(base),
        y: buf.readUInt8(base + 1),
        z: buf.readUInt8(base + 2),
        colorIndex: buf.readUInt8(base + 3)
      });
    }
  }
  offset += 12 + chunk.contentSize + chunk.childrenSize;
}

console.log(`\n=== Model Size ===`);
console.log(`sizeX: ${sizeX}, sizeY: ${sizeY}, sizeZ: ${sizeZ}`);
console.log(`Total voxel count: ${voxels.length}`);

// Ranges
let minX = 255, maxX = 0, minY = 255, maxY = 0, minZ = 255, maxZ = 0;
for (const v of voxels) {
  if (v.x < minX) minX = v.x;
  if (v.x > maxX) maxX = v.x;
  if (v.y < minY) minY = v.y;
  if (v.y > maxY) maxY = v.y;
  if (v.z < minZ) minZ = v.z;
  if (v.z > maxZ) maxZ = v.z;
}
console.log(`\n=== Voxel Ranges ===`);
console.log(`X range: ${minX} - ${maxX}`);
console.log(`Y range: ${minY} - ${maxY}`);
console.log(`Z range: ${minZ} - ${maxZ}`);

const centerX = (minX + maxX) / 2;
const centerY = (minY + maxY) / 2;
console.log(`Center X: ${centerX}, Center Y: ${centerY}`);

// === Body Structure Analysis ===
console.log(`\n=== Body Structure Analysis ===`);

// Group voxels by Z for cross-section analysis
const byZ = {};
for (const v of voxels) {
  if (!byZ[v.z]) byZ[v.z] = [];
  byZ[v.z].push(v);
}

// 1. Narrowest X cross-section above z=60 (neck area)
console.log(`\n--- Neck Area (narrowest X cross-section above z=60) ---`);
let narrowestWidth = Infinity;
let narrowestZ = -1;
for (let z = 61; z <= maxZ; z++) {
  if (!byZ[z]) continue;
  const xs = byZ[z].map(v => v.x);
  const w = Math.max(...xs) - Math.min(...xs) + 1;
  if (w < narrowestWidth) {
    narrowestWidth = w;
    narrowestZ = z;
  }
}
if (narrowestZ >= 0) {
  const xs = byZ[narrowestZ].map(v => v.x);
  console.log(`Narrowest at z=${narrowestZ}: width=${narrowestWidth}, x range: ${Math.min(...xs)}-${Math.max(...xs)}, voxel count: ${byZ[narrowestZ].length}`);
}

// Show cross-section widths for z > 60
console.log(`\nCross-section X widths above z=60:`);
for (let z = maxZ; z > 60; z--) {
  if (!byZ[z]) continue;
  const xs = byZ[z].map(v => v.x);
  const xMin = Math.min(...xs);
  const xMax = Math.max(...xs);
  console.log(`  z=${z}: xMin=${xMin}, xMax=${xMax}, width=${xMax - xMin + 1}, count=${byZ[z].length}`);
}

// 2. Arm detection above z=30
console.log(`\n--- Arm Detection (above z=30) ---`);
// For each Z level, find leftmost and rightmost extent
for (let z = maxZ; z > 30; z -= 5) {
  if (!byZ[z]) continue;
  const xs = byZ[z].map(v => v.x);
  const xMin = Math.min(...xs);
  const xMax = Math.max(...xs);
  console.log(`  z=${z}: leftmost x=${xMin}, rightmost x=${xMax}, width=${xMax - xMin + 1}`);
}

// Find widest cross-section (likely shoulder/arm level)
let widestWidth = 0;
let widestZ = -1;
for (let z = 31; z <= maxZ; z++) {
  if (!byZ[z]) continue;
  const xs = byZ[z].map(v => v.x);
  const w = Math.max(...xs) - Math.min(...xs) + 1;
  if (w > widestWidth) {
    widestWidth = w;
    widestZ = z;
  }
}
console.log(`\nWidest cross-section: z=${widestZ}, width=${widestWidth}`);
if (byZ[widestZ]) {
  const xs = byZ[widestZ].map(v => v.x);
  console.log(`  x range: ${Math.min(...xs)} - ${Math.max(...xs)}`);
}

// 3. Leg separation gap below z=30
console.log(`\n--- Leg Separation (below z=30) ---`);
for (let z = Math.min(30, maxZ); z >= minZ; z--) {
  if (!byZ[z]) {
    console.log(`  z=${z}: NO VOXELS`);
    continue;
  }
  const xs = byZ[z].map(v => v.x).sort((a, b) => a - b);
  const xMin = xs[0];
  const xMax = xs[xs.length - 1];

  // Find gaps in X
  const xSet = new Set(xs);
  const gaps = [];
  for (let x = xMin + 1; x < xMax; x++) {
    // Check if there are no voxels at this x for this z (across all y)
    const hasVoxel = byZ[z].some(v => v.x === x);
    if (!hasVoxel) {
      gaps.push(x);
    }
  }
  if (gaps.length > 0) {
    // Find contiguous gap ranges
    const gapRanges = [];
    let gStart = gaps[0];
    let gEnd = gaps[0];
    for (let i = 1; i < gaps.length; i++) {
      if (gaps[i] === gEnd + 1) {
        gEnd = gaps[i];
      } else {
        gapRanges.push([gStart, gEnd]);
        gStart = gaps[i];
        gEnd = gaps[i];
      }
    }
    gapRanges.push([gStart, gEnd]);
    console.log(`  z=${z}: x range ${xMin}-${xMax}, gaps: ${gapRanges.map(r => `${r[0]}-${r[1]}`).join(', ')}`);
  } else {
    console.log(`  z=${z}: x range ${xMin}-${xMax}, no gap`);
  }
}
