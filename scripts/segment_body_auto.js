/**
 * segment_body_auto.js
 *
 * ボクセルの形状から自動的にボーン位置を検出し、部位別に分割。
 * 各Z高さのスライスの幅・形状から関節位置を推定。
 *
 * Usage: node scripts/segment_body_auto.js
 */

const fs = require('fs');
const path = require('path');

// ========================================================================
// VOX parser
// ========================================================================
function parseVox(filePath) {
  const buf = fs.readFileSync(filePath);
  let offset = 8;
  let sizeX = 0, sizeY = 0, sizeZ = 0;
  const voxels = [];
  let palette = null;

  function readChunk(off) {
    const id = buf.toString('ascii', off, off + 4);
    const cs = buf.readInt32LE(off + 4);
    const ccs = buf.readInt32LE(off + 8);
    return { id, cs, ccs, data: off + 12 };
  }

  const main = readChunk(offset); offset += 12;
  const end = offset + main.ccs;
  while (offset < end) {
    const c = readChunk(offset);
    if (c.id === 'SIZE') {
      sizeX = buf.readInt32LE(c.data); sizeY = buf.readInt32LE(c.data + 4); sizeZ = buf.readInt32LE(c.data + 8);
    } else if (c.id === 'XYZI') {
      const n = buf.readInt32LE(c.data);
      for (let i = 0; i < n; i++) {
        const b = c.data + 4 + i * 4;
        voxels.push({ x: buf.readUInt8(b), y: buf.readUInt8(b+1), z: buf.readUInt8(b+2), c: buf.readUInt8(b+3) });
      }
    } else if (c.id === 'RGBA') {
      palette = [];
      for (let i = 0; i < 256; i++) {
        const b = c.data + i * 4;
        palette.push({ r: buf.readUInt8(b), g: buf.readUInt8(b+1), b: buf.readUInt8(b+2), a: buf.readUInt8(b+3) });
      }
    }
    offset += 12 + c.cs + c.ccs;
  }
  return { sizeX, sizeY, sizeZ, voxels, palette };
}

// ========================================================================
// VOX writer
// ========================================================================
function writeVox(filePath, sizeX, sizeY, sizeZ, voxels, palette) {
  const n = voxels.length;
  const xyziSize = 4 + n * 4;
  const sizeSize = 12;
  const rgbaSize = 256 * 4;
  const chunks = [];

  const sizeBuf = Buffer.alloc(12 + sizeSize);
  sizeBuf.write('SIZE', 0); sizeBuf.writeInt32LE(sizeSize, 4); sizeBuf.writeInt32LE(0, 8);
  sizeBuf.writeInt32LE(sizeX, 12); sizeBuf.writeInt32LE(sizeY, 16); sizeBuf.writeInt32LE(sizeZ, 20);
  chunks.push(sizeBuf);

  const xyziBuf = Buffer.alloc(12 + xyziSize);
  xyziBuf.write('XYZI', 0); xyziBuf.writeInt32LE(xyziSize, 4); xyziBuf.writeInt32LE(0, 8);
  xyziBuf.writeInt32LE(n, 12);
  for (let i = 0; i < n; i++) {
    const v = voxels[i]; const o = 16 + i * 4;
    xyziBuf.writeUInt8(v.x, o); xyziBuf.writeUInt8(v.y, o+1); xyziBuf.writeUInt8(v.z, o+2); xyziBuf.writeUInt8(v.c, o+3);
  }
  chunks.push(xyziBuf);

  if (palette) {
    const rgbaBuf = Buffer.alloc(12 + rgbaSize);
    rgbaBuf.write('RGBA', 0); rgbaBuf.writeInt32LE(rgbaSize, 4); rgbaBuf.writeInt32LE(0, 8);
    for (let i = 0; i < 256; i++) {
      const p = palette[i] || { r:0, g:0, b:0, a:255 }; const o = 12 + i * 4;
      rgbaBuf.writeUInt8(p.r, o); rgbaBuf.writeUInt8(p.g, o+1); rgbaBuf.writeUInt8(p.b, o+2); rgbaBuf.writeUInt8(p.a, o+3);
    }
    chunks.push(rgbaBuf);
  }

  const childSize = chunks.reduce((s, b) => s + b.length, 0);
  const out = Buffer.alloc(8 + 12 + childSize);
  out.write('VOX ', 0); out.writeInt32LE(150, 4);
  out.write('MAIN', 8); out.writeInt32LE(0, 12); out.writeInt32LE(childSize, 16);
  let pos = 20;
  for (const c of chunks) { c.copy(out, pos); pos += c.length; }
  fs.writeFileSync(filePath, out);
}

// ========================================================================
// Auto-detect body landmarks from voxel shape
// ========================================================================
function detectLandmarks(model) {
  const { sizeX, sizeY, sizeZ, voxels } = model;

  // Build per-Z-slice data: count, minX, maxX, width
  const slices = [];
  for (let z = 0; z < sizeZ; z++) {
    const zVoxels = voxels.filter(v => v.z === z);
    if (zVoxels.length === 0) {
      slices.push({ z, count: 0, minX: 0, maxX: 0, width: 0 });
      continue;
    }
    const xs = zVoxels.map(v => v.x);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    slices.push({ z, count: zVoxels.length, minX, maxX, width: maxX - minX });
  }

  // Find top of model
  let topZ = 0;
  for (const s of slices) if (s.count > 0 && s.z > topZ) topZ = s.z;

  // Find center X of body (median of occupied X across all voxels)
  const allX = voxels.map(v => v.x).sort((a, b) => a - b);
  const centerX = allX[Math.floor(allX.length / 2)];

  // --- Neck detection: find narrowest point in upper 30% of body ---
  const upperStart = Math.floor(topZ * 0.70);
  const upperEnd = Math.floor(topZ * 0.95);
  let neckZ = upperStart;
  let neckMinWidth = Infinity;
  for (let z = upperStart; z <= upperEnd; z++) {
    const s = slices[z];
    if (s && s.count > 0 && s.width < neckMinWidth) {
      neckMinWidth = s.width;
      neckZ = z;
    }
  }

  // --- Waist/Hips detection: find width change in middle area ---
  // Hips: widest point in lower 40-60% range
  const hipStart = Math.floor(topZ * 0.35);
  const hipEnd = Math.floor(topZ * 0.55);
  let hipsZ = hipStart;
  let hipsMaxWidth = 0;
  for (let z = hipStart; z <= hipEnd; z++) {
    const s = slices[z];
    if (s && s.width > hipsMaxWidth) {
      hipsMaxWidth = s.width;
      hipsZ = z;
    }
  }

  // --- Crotch detection: where legs split (below hips, width drops then has gap in center) ---
  let crotchZ = hipsZ;
  for (let z = hipsZ; z >= 0; z--) {
    const zVoxels = voxels.filter(v => v.z === z);
    // Check if center column is empty (legs have split)
    const centerVoxels = zVoxels.filter(v => Math.abs(v.x - centerX) <= 2);
    if (centerVoxels.length === 0 && zVoxels.length > 10) {
      crotchZ = z + 1;
      break;
    }
  }

  // --- Knee detection: narrowest point between crotch and feet ---
  const kneeSearchStart = Math.floor(crotchZ * 0.3);
  const kneeSearchEnd = Math.floor(crotchZ * 0.7);
  // Measure left leg width only (left of center)
  let kneeZ = kneeSearchStart;
  let kneeMinCount = Infinity;
  for (let z = kneeSearchStart; z <= kneeSearchEnd; z++) {
    const leftVoxels = voxels.filter(v => v.z === z && v.x < centerX);
    if (leftVoxels.length > 0 && leftVoxels.length < kneeMinCount) {
      kneeMinCount = leftVoxels.length;
      kneeZ = z;
    }
  }

  // --- Shoulder detection: widest point between neck and hips ---
  const shoulderStart = Math.floor(neckZ * 0.85);
  const shoulderEnd = neckZ;
  let shoulderZ = shoulderStart;
  let shoulderMaxWidth = 0;
  for (let z = shoulderStart; z <= shoulderEnd; z++) {
    const s = slices[z];
    if (s && s.width > shoulderMaxWidth) {
      shoulderMaxWidth = s.width;
      shoulderZ = z;
    }
  }

  // Shoulder X boundaries (where arms start)
  const shoulderSlice = voxels.filter(v => v.z === shoulderZ);
  // Find the "torso" width by looking at the densest X region
  const xHist = {};
  for (const v of shoulderSlice) {
    const bx = Math.floor(v.x / 3) * 3;
    xHist[bx] = (xHist[bx] || 0) + 1;
  }
  // Torso is roughly the middle 60% of the width at shoulder height
  const shoulderMinX = slices[shoulderZ].minX;
  const shoulderMaxX = slices[shoulderZ].maxX;
  const torsoMargin = Math.floor((shoulderMaxX - shoulderMinX) * 0.20);
  const armLeftX = shoulderMinX + torsoMargin;
  const armRightX = shoulderMaxX - torsoMargin;

  // --- Elbow: midpoint between shoulder and hand (approximate) ---
  const elbowZ = Math.floor((shoulderZ + hipsZ) / 2);

  // --- Foot: lowest non-zero slice ---
  let footZ = 0;
  for (let z = 0; z < sizeZ; z++) {
    if (slices[z].count > 0) { footZ = z; break; }
  }
  const ankleZ = Math.floor(footZ + (kneeZ - footZ) * 0.1);

  const landmarks = {
    topZ, footZ, centerX,
    neckZ, shoulderZ, hipsZ, crotchZ, kneeZ, elbowZ, ankleZ,
    armLeftX, armRightX,
  };

  console.log('  Landmarks:');
  for (const [k, v] of Object.entries(landmarks)) {
    console.log(`    ${k}: ${v}`);
  }

  return landmarks;
}

// ========================================================================
// Assign segment based on auto-detected landmarks
// ========================================================================
function assignSegment(vx, vy, vz, lm) {
  const { neckZ, shoulderZ, hipsZ, crotchZ, kneeZ, ankleZ, centerX, armLeftX, armRightX, elbowZ } = lm;

  // Head
  if (vz >= neckZ) return 'head';

  // Above crotch
  if (vz >= crotchZ) {
    // Arms
    if (vx < armLeftX) {
      return vz >= elbowZ ? 'left_upper_arm' : 'left_forearm';
    }
    if (vx > armRightX) {
      return vz >= elbowZ ? 'right_upper_arm' : 'right_forearm';
    }
    // Torso
    return vz >= shoulderZ ? 'upper_torso' : 'lower_torso';
  }

  // Legs (below crotch)
  if (vx <= centerX) {
    if (vz < ankleZ) return 'left_foot';
    if (vz < kneeZ) return 'left_calf';
    return 'left_thigh';
  } else {
    if (vz < ankleZ) return 'right_foot';
    if (vz < kneeZ) return 'right_calf';
    return 'right_thigh';
  }
}

// ========================================================================
// Main
// ========================================================================
function processBody(bodyVoxPath, gridJsonPath, outputDir, label) {
  console.log(`\nProcessing: ${label}`);
  const model = parseVox(bodyVoxPath);
  const grid = JSON.parse(fs.readFileSync(gridJsonPath, 'utf8'));
  const { sizeX, sizeY, sizeZ, voxels, palette } = model;
  console.log(`  Model: ${sizeX}x${sizeY}x${sizeZ}, ${voxels.length} voxels`);

  const lm = detectLandmarks(model);

  const segments = {};
  for (const v of voxels) {
    const seg = assignSegment(v.x, v.y, v.z, lm);
    if (!segments[seg]) segments[seg] = [];
    segments[seg].push(v);
  }

  const segDir = path.join(outputDir, 'segments');
  fs.mkdirSync(segDir, { recursive: true });

  const segmentMeta = {};
  for (const [segName, segVoxels] of Object.entries(segments)) {
    const filename = `${segName}.vox`;
    writeVox(path.join(segDir, filename), sizeX, sizeY, sizeZ, segVoxels, palette);
    segmentMeta[segName] = { file: `/segments/${filename}`, voxels: segVoxels.length };
    console.log(`  ${segName}: ${segVoxels.length} voxels`);
  }

  const meta = {
    label,
    voxel_size: grid.voxel_size,
    grid: { gx: sizeX, gy: sizeY, gz: sizeZ },
    landmarks: lm,
    segments: segmentMeta,
    total_voxels: voxels.length,
  };
  fs.writeFileSync(path.join(outputDir, 'segments.json'), JSON.stringify(meta, null, 2));

  const partsEntries = Object.entries(segmentMeta).map(([key, info]) => ({
    key, file: `/${path.basename(outputDir)}${info.file}`,
    voxels: info.voxels, default_on: true, meshes: [key], is_body: true, category: 'body_segment',
  }));
  fs.writeFileSync(path.join(outputDir, 'parts.json'), JSON.stringify(partsEntries, null, 2));
  fs.copyFileSync(gridJsonPath, path.join(outputDir, 'grid.json'));

  console.log(`  -> ${Object.keys(segments).length} segments saved`);
}

const voxBase = 'C:/Users/user/developsecond/game-assets/vox';

processBody(
  path.join(voxBase, 'female/BasicBodyFemale/body/body.vox'),
  path.join(voxBase, 'female/BasicBodyFemale/grid.json'),
  path.join(voxBase, 'female/BasicBodyFemale'),
  'BasicBodyFemale'
);

processBody(
  path.join(voxBase, 'male/BasicBodyMale/body/body.vox'),
  path.join(voxBase, 'male/BasicBodyMale/grid.json'),
  path.join(voxBase, 'male/BasicBodyMale'),
  'BasicBodyMale'
);

console.log('\nDone.');
