/**
 * Generate joint sphere VOXELS at segment boundaries.
 *
 * 各セグメント境界の重心（皮膚の内側）にボクセルで球体を生成し、
 * .voxファイルとして出力する。手動でボクセルエディタで修正可能。
 *
 * 2段階方式:
 * 1. ジョイント境界がある箇所 → 境界の重心に球体配置
 * 2. bone_hierarchyで親子だが境界がない箇所 → bone_positionsの関節位置に配置
 *
 * Usage: node scripts/generate_joint_spheres.js <model_dir>
 */

const fs = require('fs');
const path = require('path');

const MODEL_DIR = process.argv[2];
if (!MODEL_DIR) {
  console.log('Usage: node generate_joint_spheres.js <model_dir>');
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
  readU32();
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
  const sizeChunk = Buffer.alloc(24);
  sizeChunk.write('SIZE', 0); sizeChunk.writeUInt32LE(12, 4); sizeChunk.writeUInt32LE(0, 8);
  sizeChunk.writeUInt32LE(sx, 12); sizeChunk.writeUInt32LE(sy, 16); sizeChunk.writeUInt32LE(sz, 20);
  bufs.push(sizeChunk);
  const xyziContentSize = 4 + numVoxels * 4;
  const xyziChunk = Buffer.alloc(4 + 4 + 4 + xyziContentSize);
  xyziChunk.write('XYZI', 0); xyziChunk.writeUInt32LE(xyziContentSize, 4); xyziChunk.writeUInt32LE(0, 8);
  xyziChunk.writeUInt32LE(numVoxels, 12);
  for (let i = 0; i < numVoxels; i++) {
    const v = voxels[i];
    xyziChunk.writeUInt8(v.x & 0xFF, 16 + i * 4);
    xyziChunk.writeUInt8(v.y & 0xFF, 16 + i * 4 + 1);
    xyziChunk.writeUInt8(v.z & 0xFF, 16 + i * 4 + 2);
    xyziChunk.writeUInt8(v.c & 0xFF, 16 + i * 4 + 3);
  }
  bufs.push(xyziChunk);
  const rgbaChunk = Buffer.alloc(4 + 4 + 4 + 256 * 4);
  rgbaChunk.write('RGBA', 0); rgbaChunk.writeUInt32LE(256 * 4, 4); rgbaChunk.writeUInt32LE(0, 8);
  for (let i = 0; i < 256; i++) {
    const c = i < palette.length ? palette[i] : { r: 0, g: 0, b: 0 };
    rgbaChunk.writeUInt8(c.r, 12 + i * 4); rgbaChunk.writeUInt8(c.g, 12 + i * 4 + 1);
    rgbaChunk.writeUInt8(c.b, 12 + i * 4 + 2); rgbaChunk.writeUInt8(255, 12 + i * 4 + 3);
  }
  bufs.push(rgbaChunk);
  const allChunks = Buffer.concat(bufs);
  const header = Buffer.alloc(20);
  header.write('VOX ', 0); header.writeUInt32LE(150, 4); header.write('MAIN', 8);
  header.writeUInt32LE(0, 12); header.writeUInt32LE(allChunks.length, 16);
  fs.mkdirSync(path.dirname(filepath), { recursive: true });
  fs.writeFileSync(filepath, Buffer.concat([header, allChunks]));
}

// ========================================================================
// Config
// ========================================================================
const DIR6 = [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]];
const MIN_BOUNDARY_VOXELS = 10;
const RADIUS_FACTOR = 1.0;

// ========================================================================
// Main
// ========================================================================
const segmentsJson = JSON.parse(fs.readFileSync(path.join(MODEL_DIR, 'segments.json'), 'utf8'));
const { segments, grid } = segmentsJson;
const sx = grid.gx, sy = grid.gy, sz = grid.gz;

console.log('Generating joint sphere voxels...');

// Load all segment voxels into global grid
const globalGrid = new Map();
for (const [boneName, segInfo] of Object.entries(segments)) {
  const voxPath = path.join(MODEL_DIR, segInfo.file);
  if (!fs.existsSync(voxPath)) continue;
  const vox = readVox(voxPath);
  for (const v of vox.voxels) {
    globalGrid.set(`${v.x},${v.y},${v.z}`, { bone: boneName, c: v.c, palette: vox.palette });
  }
}
console.log(`Total voxels loaded: ${globalGrid.size}`);

// Find all boundary pairs
const pairBoundaries = new Map();
for (const [key, info] of globalGrid) {
  const [x, y, z] = key.split(',').map(Number);
  for (const [dx, dy, dz] of DIR6) {
    const nKey = `${x+dx},${y+dy},${z+dz}`;
    const neighbor = globalGrid.get(nKey);
    if (neighbor && neighbor.bone !== info.bone) {
      const pairKey = [info.bone, neighbor.bone].sort().join('|');
      if (!pairBoundaries.has(pairKey)) {
        pairBoundaries.set(pairKey, { voxelsSet: new Set(), voxels: [], colors: [] });
      }
      const pair = pairBoundaries.get(pairKey);
      if (!pair.voxelsSet.has(key)) {
        pair.voxelsSet.add(key);
        pair.voxels.push({ x, y, z });
        const col = info.palette[info.c - 1] || { r: 200, g: 180, b: 160 };
        pair.colors.push(col);
      }
    }
  }
}

console.log(`Boundary pairs: ${pairBoundaries.size} (min ${MIN_BOUNDARY_VOXELS} voxels)`);

// Generate voxel spheres at each boundary
const segDir = path.join(MODEL_DIR, 'segments');
const jointSpheresData = {};
let totalSphereVoxels = 0;

for (const [pairKey, data] of pairBoundaries) {
  if (data.voxels.length < MIN_BOUNDARY_VOXELS) continue;

  const [boneA, boneB] = pairKey.split('|');
  const jointName = `jsphere_${boneA}__${boneB}`.replace(/\./g, '_');

  // Centroid of boundary
  let cx = 0, cy = 0, cz = 0;
  for (const v of data.voxels) { cx += v.x; cy += v.y; cz += v.z; }
  cx = Math.round(cx / data.voxels.length);
  cy = Math.round(cy / data.voxels.length);
  cz = Math.round(cz / data.voxels.length);

  // Radius: 75th percentile distance
  const distances = data.voxels.map(v =>
    Math.sqrt((v.x - cx) ** 2 + (v.y - cy) ** 2 + (v.z - cz) ** 2)
  );
  distances.sort((a, b) => a - b);
  const p75idx = Math.floor(distances.length * 0.75);
  const radius = Math.max((distances[p75idx] || 3) * RADIUS_FACTOR, 2);

  // Median color
  const sortedR = data.colors.map(c => c.r).sort((a, b) => a - b);
  const sortedG = data.colors.map(c => c.g).sort((a, b) => a - b);
  const sortedB = data.colors.map(c => c.b).sort((a, b) => a - b);
  const mid = Math.floor(data.colors.length / 2);
  const color = { r: sortedR[mid], g: sortedG[mid], b: sortedB[mid] };

  // Generate voxel sphere: fill all voxels within radius of centroid
  const sphereVoxels = [];
  const r2 = radius * radius;
  const ri = Math.ceil(radius);
  for (let dx = -ri; dx <= ri; dx++) {
    for (let dy = -ri; dy <= ri; dy++) {
      for (let dz = -ri; dz <= ri; dz++) {
        if (dx * dx + dy * dy + dz * dz <= r2) {
          const vx = cx + dx, vy = cy + dy, vz = cz + dz;
          if (vx >= 0 && vx < sx && vy >= 0 && vy < sy && vz >= 0 && vz < sz) {
            sphereVoxels.push({ x: vx, y: vy, z: vz, c: 1 }); // color index 1
          }
        }
      }
    }
  }

  if (sphereVoxels.length === 0) continue;

  // Write .vox file
  const palette = [color]; // single color palette
  const safeName = jointName.toLowerCase();
  const voxFile = `segments/${safeName}.vox`;
  writeVox(path.join(MODEL_DIR, voxFile), sx, sy, sz, sphereVoxels, palette);

  // Track in segments.json
  segments[jointName] = { file: voxFile, voxels: sphereVoxels.length };
  jointSpheresData[jointName] = {
    position_voxel: [cx, cy, cz],
    bone: boneB, // child bone for tracking
    radius_voxels: Math.round(radius * 10) / 10,
    boneA,
    boneB,
    voxel_count: sphereVoxels.length,
  };

  totalSphereVoxels += sphereVoxels.length;
}

// Save joint_spheres metadata and updated segments
segmentsJson.joint_spheres = jointSpheresData;
fs.writeFileSync(path.join(MODEL_DIR, 'segments.json'), JSON.stringify(segmentsJson, null, 2));

// Update parts.json
const parts = JSON.parse(fs.readFileSync(path.join(MODEL_DIR, 'parts.json'), 'utf8'));
const folderName = path.basename(MODEL_DIR);
for (const [jointName, info] of Object.entries(jointSpheresData)) {
  if (parts.find(p => p.key === jointName)) continue;
  const safeName = jointName.toLowerCase();
  parts.push({
    key: jointName,
    file: `/${folderName}/segments/${safeName}.vox`,
    voxels: info.voxel_count,
    default_on: true,
    meshes: [jointName],
    is_body: true,
    category: 'joint_sphere',
    joint_bones: [info.boneA, info.boneB],
  });
}
fs.writeFileSync(path.join(MODEL_DIR, 'parts.json'), JSON.stringify(parts, null, 2));

console.log(`\n=== Done ===`);
console.log(`  Joint spheres: ${Object.keys(jointSpheresData).length}`);
console.log(`  Total sphere voxels: ${totalSphereVoxels}`);
console.log(`  Updated: segments.json, parts.json`);
