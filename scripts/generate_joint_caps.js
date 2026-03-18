/**
 * Generate joint cap voxels to fill gaps between bone segments.
 *
 * For each joint boundary:
 * 1. Find boundary voxels (voxels adjacent to a different segment)
 * 2. Compute the cross-section contour
 * 3. Fill the interior with 1-2 layers
 * 4. Create a joint segment with blended bone transform
 *
 * Usage: node scripts/generate_joint_caps.js <model_dir>
 * Example: node scripts/generate_joint_caps.js C:/Users/user/developsecond/game-assets/vox/female/QueenMarika-Detailed
 */

const fs = require('fs');
const path = require('path');

const MODEL_DIR = process.argv[2];
if (!MODEL_DIR) {
  console.log('Usage: node generate_joint_caps.js <model_dir>');
  process.exit(1);
}

// ========================================================================
// VOX reader/writer
// ========================================================================
function readVox(filepath) {
  const buf = fs.readFileSync(filepath);
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let offset = 0;
  const readU32 = () => { const v = view.getUint32(offset, true); offset += 4; return v; };
  const readU8 = () => view.getUint8(offset++);
  const readStr = (n) => { let s = ''; for (let i = 0; i < n; i++) s += String.fromCharCode(view.getUint8(offset + i)); offset += n; return s; };

  if (readStr(4) !== 'VOX ') throw new Error('Not VOX');
  readU32(); // version
  let sizeX = 0, sizeY = 0, sizeZ = 0;
  const voxels = [];
  let palette = null;

  const readChunks = (end) => {
    while (offset < end) {
      const id = readStr(4), cs = readU32(), ccs = readU32(), ce = offset + cs;
      if (id === 'SIZE') { sizeX = readU32(); sizeY = readU32(); sizeZ = readU32(); }
      else if (id === 'XYZI') { const n = readU32(); for (let i = 0; i < n; i++) voxels.push({ x: readU8(), y: readU8(), z: readU8(), c: readU8() }); }
      else if (id === 'RGBA') { palette = []; for (let i = 0; i < 256; i++) { palette.push({ r: readU8(), g: readU8(), b: readU8() }); readU8(); } }
      offset = ce; if (ccs > 0) readChunks(offset + ccs);
    }
  };

  if (readStr(4) !== 'MAIN') throw new Error('No MAIN');
  const mc = readU32(), mcc = readU32();
  offset += mc;
  readChunks(offset + mcc);
  if (!palette) { palette = []; for (let i = 0; i < 256; i++) palette.push({ r: 200, g: 180, b: 160 }); }
  return { sizeX, sizeY, sizeZ, voxels, palette };
}

function writeVox(filepath, sx, sy, sz, voxels, palette) {
  const numVoxels = voxels.length;
  const bufs = [];

  // SIZE chunk: id(4) + contentSize(4) + childSize(4) + data(12) = 24
  const sizeChunk = Buffer.alloc(4 + 4 + 4 + 12);
  sizeChunk.write('SIZE', 0);
  sizeChunk.writeUInt32LE(12, 4); // content size
  sizeChunk.writeUInt32LE(0, 8);  // child size
  sizeChunk.writeUInt32LE(sx, 12);
  sizeChunk.writeUInt32LE(sy, 16);
  sizeChunk.writeUInt32LE(sz, 20);
  bufs.push(sizeChunk);

  // XYZI chunk: id(4) + contentSize(4) + childSize(4) + numVoxels(4) + voxelData
  const xyziContentSize = 4 + numVoxels * 4;
  const xyziChunk = Buffer.alloc(4 + 4 + 4 + xyziContentSize);
  xyziChunk.write('XYZI', 0);
  xyziChunk.writeUInt32LE(xyziContentSize, 4);
  xyziChunk.writeUInt32LE(0, 8);
  xyziChunk.writeUInt32LE(numVoxels, 12);
  for (let i = 0; i < numVoxels; i++) {
    const v = voxels[i];
    xyziChunk.writeUInt8(v.x & 0xFF, 16 + i * 4);
    xyziChunk.writeUInt8(v.y & 0xFF, 16 + i * 4 + 1);
    xyziChunk.writeUInt8(v.z & 0xFF, 16 + i * 4 + 2);
    xyziChunk.writeUInt8(v.c & 0xFF, 16 + i * 4 + 3);
  }
  bufs.push(xyziChunk);

  // RGBA chunk: id(4) + contentSize(4) + childSize(4) + paletteData(1024)
  const rgbaChunk = Buffer.alloc(4 + 4 + 4 + 256 * 4);
  rgbaChunk.write('RGBA', 0);
  rgbaChunk.writeUInt32LE(256 * 4, 4);
  rgbaChunk.writeUInt32LE(0, 8);
  for (let i = 0; i < 256; i++) {
    const c = i < palette.length ? palette[i] : { r: 0, g: 0, b: 0 };
    rgbaChunk.writeUInt8(c.r, 12 + i * 4);
    rgbaChunk.writeUInt8(c.g, 12 + i * 4 + 1);
    rgbaChunk.writeUInt8(c.b, 12 + i * 4 + 2);
    rgbaChunk.writeUInt8(255, 12 + i * 4 + 3);
  }
  bufs.push(rgbaChunk);

  const allChunks = Buffer.concat(bufs);

  // VOX header + MAIN
  const header = Buffer.alloc(20);
  header.write('VOX ', 0);
  header.writeUInt32LE(150, 4);   // version
  header.write('MAIN', 8);
  header.writeUInt32LE(0, 12);    // MAIN content size
  header.writeUInt32LE(allChunks.length, 16); // MAIN child size

  fs.mkdirSync(path.dirname(filepath), { recursive: true });
  fs.writeFileSync(filepath, Buffer.concat([header, allChunks]));
}

// ========================================================================
// Main
// ========================================================================
const segmentsJson = JSON.parse(fs.readFileSync(path.join(MODEL_DIR, 'segments.json'), 'utf8'));
const partsJson = JSON.parse(fs.readFileSync(path.join(MODEL_DIR, 'parts.json'), 'utf8'));

const { grid, segments, bone_hierarchy, bone_positions } = segmentsJson;
const sx = grid.gx, sy = grid.gy, sz = grid.gz;

// Load all segment voxels into a unified grid
console.log('Loading segments...');
const globalGrid = new Map(); // "x,y,z" -> { bone, colorIndex }
const bonePalettes = {}; // bone -> palette array

for (const [boneName, segInfo] of Object.entries(segments)) {
  const voxPath = path.join(MODEL_DIR, segInfo.file);
  if (!fs.existsSync(voxPath)) continue;

  const vox = readVox(voxPath);
  bonePalettes[boneName] = vox.palette;

  for (const v of vox.voxels) {
    globalGrid.set(`${v.x},${v.y},${v.z}`, { bone: boneName, c: v.c, palette: vox.palette });
  }
}

console.log(`  Total voxels: ${globalGrid.size}`);
console.log(`  Segments: ${Object.keys(segments).length}`);

// ========================================================================
// Find joint boundaries
// ========================================================================
console.log('\nFinding joint boundaries...');
const DIR6 = [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]];

// For each voxel, check if any neighbor belongs to a different bone
const jointPairs = new Map(); // "boneA|boneB" -> [{x,y,z,color}]

for (const [key, info] of globalGrid) {
  const [x, y, z] = key.split(',').map(Number);

  for (const [dx, dy, dz] of DIR6) {
    const nx = x + dx, ny = y + dy, nz = z + dz;
    const nKey = `${nx},${ny},${nz}`;
    const neighbor = globalGrid.get(nKey);

    if (neighbor && neighbor.bone !== info.bone) {
      // Found a boundary between two bones
      const pairKey = [info.bone, neighbor.bone].sort().join('|');
      if (!jointPairs.has(pairKey)) {
        jointPairs.set(pairKey, { boundary: new Set(), colors: new Map() });
      }
      const joint = jointPairs.get(pairKey);

      // The gap voxel is the empty space between them (midpoint)
      // Actually, we need to find EMPTY spaces adjacent to BOTH segments
      // For now, collect boundary voxels from both sides
      joint.boundary.add(key);
      joint.boundary.add(nKey);

      // Store color info
      const pal = info.palette;
      if (pal && info.c > 0 && info.c <= pal.length) {
        joint.colors.set(key, pal[info.c - 1]);
      }
    }
  }
}

console.log(`  Joint pairs found: ${jointPairs.size}`);

// ========================================================================
// Generate gap-fill voxels for each joint
// ========================================================================
console.log('\nGenerating joint caps...');

const jointSegments = {}; // jointName -> [voxels]
// Use a shared palette for joints (skin-like colors from boundary)
const jointPalette = [];
const jointPaletteMap = new Map();

function getJointColorIndex(r, g, b) {
  const key = `${r},${g},${b}`;
  if (jointPaletteMap.has(key)) return jointPaletteMap.get(key);
  const idx = jointPalette.length + 1;
  if (idx > 255) {
    // Find closest
    let bestIdx = 1, bestDist = Infinity;
    for (let i = 0; i < jointPalette.length; i++) {
      const p = jointPalette[i];
      const d = (r-p.r)**2 + (g-p.g)**2 + (b-p.b)**2;
      if (d < bestDist) { bestDist = d; bestIdx = i + 1; }
    }
    return bestIdx;
  }
  jointPaletteMap.set(key, idx);
  jointPalette.push({ r, g, b });
  return idx;
}

for (const [pairKey, joint] of jointPairs) {
  const [boneA, boneB] = pairKey.split('|');

  // Find empty voxels that are adjacent to boundary voxels of BOTH bones
  const boundaryA = new Set();
  const boundaryB = new Set();

  for (const key of joint.boundary) {
    const info = globalGrid.get(key);
    if (!info) continue;
    if (info.bone === boneA) boundaryA.add(key);
    else if (info.bone === boneB) boundaryB.add(key);
  }

  // Find empty positions adjacent to boundary voxels
  const candidates = new Set();
  for (const key of joint.boundary) {
    const [x, y, z] = key.split(',').map(Number);
    for (const [dx, dy, dz] of DIR6) {
      const nx = x + dx, ny = y + dy, nz = z + dz;
      if (nx < 0 || ny < 0 || nz < 0 || nx >= sx || ny >= sy || nz >= sz) continue;
      const nKey = `${nx},${ny},${nz}`;
      if (!globalGrid.has(nKey)) {
        candidates.add(nKey);
      }
    }
  }

  // Filter: only keep candidates that are adjacent to both segments' boundary voxels
  // (within 2 voxels)
  const gapVoxels = [];
  for (const key of candidates) {
    const [x, y, z] = key.split(',').map(Number);

    let nearA = false, nearB = false;
    for (const [dx, dy, dz] of DIR6) {
      const nKey = `${x+dx},${y+dy},${z+dz}`;
      if (boundaryA.has(nKey)) nearA = true;
      if (boundaryB.has(nKey)) nearB = true;
    }
    // Also check 2-step neighbors
    if (!nearA || !nearB) {
      for (let dx = -2; dx <= 2; dx++) {
        for (let dy = -2; dy <= 2; dy++) {
          for (let dz = -2; dz <= 2; dz++) {
            if (Math.abs(dx) + Math.abs(dy) + Math.abs(dz) > 2) continue;
            const nKey = `${x+dx},${y+dy},${z+dz}`;
            if (boundaryA.has(nKey)) nearA = true;
            if (boundaryB.has(nKey)) nearB = true;
          }
        }
      }
    }

    if (nearA && nearB) {
      // Get color from nearest boundary voxel
      let bestColor = { r: 200, g: 180, b: 160 };
      let bestDist = Infinity;
      for (const bKey of joint.boundary) {
        const [bx, by, bz] = bKey.split(',').map(Number);
        const d = (x-bx)**2 + (y-by)**2 + (z-bz)**2;
        if (d < bestDist && joint.colors.has(bKey)) {
          bestDist = d;
          bestColor = joint.colors.get(bKey);
        }
      }

      const ci = getJointColorIndex(bestColor.r, bestColor.g, bestColor.b);
      gapVoxels.push({ x, y, z, c: ci });
    }
  }

  if (gapVoxels.length > 0) {
    const jointName = `joint_${boneA}_${boneB}`.replace(/\./g, '_');
    jointSegments[jointName] = {
      voxels: gapVoxels,
      boneA,
      boneB,
    };
    console.log(`  ${jointName}: ${gapVoxels.length} fill voxels`);
  }
}

// ========================================================================
// Write joint segment files
// ========================================================================
console.log('\nWriting joint segments...');
const jointDir = path.join(MODEL_DIR, 'segments');

const newParts = [];
const jointMeta = {};

for (const [jointName, data] of Object.entries(jointSegments)) {
  const filename = `${jointName}.vox`;
  const filepath = path.join(jointDir, filename);

  writeVox(filepath, sx, sy, sz, data.voxels, jointPalette);

  // Add to parts.json - use boneA as primary bone for transform
  // The viewer will need to blend boneA and boneB transforms
  newParts.push({
    key: jointName,
    file: `/${path.basename(MODEL_DIR)}/segments/${filename}`,
    voxels: data.voxels.length,
    default_on: true,
    meshes: [jointName],
    is_body: true,
    category: 'joint',
    joint_bones: [data.boneA, data.boneB],
  });

  jointMeta[jointName] = {
    file: `segments/${filename}`,
    voxels: data.voxels.length,
    boneA: data.boneA,
    boneB: data.boneB,
  };

  console.log(`  Written: ${filename} (${data.voxels.length} voxels)`);
}

// Update parts.json
const updatedParts = [...partsJson, ...newParts];
fs.writeFileSync(path.join(MODEL_DIR, 'parts.json'), JSON.stringify(updatedParts, null, 2));

// Update segments.json with joint info
segmentsJson.joints = jointMeta;
fs.writeFileSync(path.join(MODEL_DIR, 'segments.json'), JSON.stringify(segmentsJson, null, 2));

console.log(`\n=== Done ===`);
console.log(`  Joint segments: ${Object.keys(jointSegments).length}`);
console.log(`  Total fill voxels: ${Object.values(jointSegments).reduce((s, d) => s + d.voxels.length, 0)}`);
console.log(`  Updated: parts.json, segments.json`);
