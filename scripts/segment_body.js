/**
 * segment_body.js
 *
 * CyberpunkElfのボーン位置を基準に素体を部位別セグメントに分割。
 * 各セグメントを個別のVOXファイルとして保存し、
 * 結合用メタデータ(segments.json)を出力。
 *
 * Usage: node scripts/segment_body.js
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

  const main = readChunk(offset);
  offset += 12;
  const end = offset + main.ccs;
  while (offset < end) {
    const c = readChunk(offset);
    if (c.id === 'SIZE') {
      sizeX = buf.readInt32LE(c.data);
      sizeY = buf.readInt32LE(c.data + 4);
      sizeZ = buf.readInt32LE(c.data + 8);
    } else if (c.id === 'XYZI') {
      const n = buf.readInt32LE(c.data);
      for (let i = 0; i < n; i++) {
        const b = c.data + 4 + i * 4;
        voxels.push({
          x: buf.readUInt8(b), y: buf.readUInt8(b + 1),
          z: buf.readUInt8(b + 2), c: buf.readUInt8(b + 3),
        });
      }
    } else if (c.id === 'RGBA') {
      palette = [];
      for (let i = 0; i < 256; i++) {
        const b = c.data + i * 4;
        palette.push({
          r: buf.readUInt8(b), g: buf.readUInt8(b + 1),
          b: buf.readUInt8(b + 2), a: buf.readUInt8(b + 3),
        });
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
  const numVoxels = voxels.length;
  const xyziContentSize = 4 + numVoxels * 4;
  const sizeContentSize = 12;
  const rgbaContentSize = 256 * 4;

  const chunks = [];
  // SIZE chunk
  const sizeBuf = Buffer.alloc(12 + sizeContentSize);
  sizeBuf.write('SIZE', 0);
  sizeBuf.writeInt32LE(sizeContentSize, 4);
  sizeBuf.writeInt32LE(0, 8);
  sizeBuf.writeInt32LE(sizeX, 12);
  sizeBuf.writeInt32LE(sizeY, 16);
  sizeBuf.writeInt32LE(sizeZ, 20);
  chunks.push(sizeBuf);

  // XYZI chunk
  const xyziBuf = Buffer.alloc(12 + xyziContentSize);
  xyziBuf.write('XYZI', 0);
  xyziBuf.writeInt32LE(xyziContentSize, 4);
  xyziBuf.writeInt32LE(0, 8);
  xyziBuf.writeInt32LE(numVoxels, 12);
  for (let i = 0; i < numVoxels; i++) {
    const v = voxels[i];
    xyziBuf.writeUInt8(v.x, 16 + i * 4);
    xyziBuf.writeUInt8(v.y, 16 + i * 4 + 1);
    xyziBuf.writeUInt8(v.z, 16 + i * 4 + 2);
    xyziBuf.writeUInt8(v.c, 16 + i * 4 + 3);
  }
  chunks.push(xyziBuf);

  // RGBA chunk
  if (palette) {
    const rgbaBuf = Buffer.alloc(12 + rgbaContentSize);
    rgbaBuf.write('RGBA', 0);
    rgbaBuf.writeInt32LE(rgbaContentSize, 4);
    rgbaBuf.writeInt32LE(0, 8);
    for (let i = 0; i < 256; i++) {
      const p = palette[i] || { r: 0, g: 0, b: 0, a: 255 };
      rgbaBuf.writeUInt8(p.r, 12 + i * 4);
      rgbaBuf.writeUInt8(p.g, 12 + i * 4 + 1);
      rgbaBuf.writeUInt8(p.b, 12 + i * 4 + 2);
      rgbaBuf.writeUInt8(p.a, 12 + i * 4 + 3);
    }
    chunks.push(rgbaBuf);
  }

  const childrenSize = chunks.reduce((s, b) => s + b.length, 0);
  const mainBuf = Buffer.alloc(8 + 12 + childrenSize);
  mainBuf.write('VOX ', 0);
  mainBuf.writeInt32LE(150, 4); // version
  mainBuf.write('MAIN', 8);
  mainBuf.writeInt32LE(0, 12);
  mainBuf.writeInt32LE(childrenSize, 16);
  let pos = 20;
  for (const chunk of chunks) {
    chunk.copy(mainBuf, pos);
    pos += chunk.length;
  }
  fs.writeFileSync(filePath, mainBuf);
}

// ========================================================================
// Segment definitions based on bone positions
// ========================================================================

// Bone positions from CyberpunkElf, converted to normalized ratios
const BONE_RATIOS = {
  Hips:           { rx: 0.223, ry: 0.241, rz: 0.222 },
  Spine:          { rx: 0.225, ry: 0.241, rz: 0.258 },
  Spine2:         { rx: 0.229, ry: 0.241, rz: 0.329 },
  Neck:           { rx: 0.231, ry: 0.241, rz: 0.364 },
  Head:           { rx: 0.231, ry: 0.241, rz: 0.421 },
  LeftShoulder:   { rx: 0.193, ry: 0.241, rz: 0.338 },
  LeftArm:        { rx: 0.172, ry: 0.241, rz: 0.335 },
  LeftForeArm:    { rx: 0.125, ry: 0.241, rz: 0.327 },
  LeftHand:       { rx: 0.049, ry: 0.241, rz: 0.297 },
  RightShoulder:  { rx: 0.267, ry: 0.241, rz: 0.338 },
  RightArm:       { rx: 0.288, ry: 0.241, rz: 0.335 },
  RightForeArm:   { rx: 0.337, ry: 0.241, rz: 0.327 },
  RightHand:      { rx: 0.413, ry: 0.241, rz: 0.297 },
  LeftUpLeg:      { rx: 0.186, ry: 0.241, rz: 0.222 },
  LeftLeg:        { rx: 0.177, ry: 0.287, rz: 0.129 },
  LeftFoot:       { rx: 0.177, ry: 0.213, rz: 0.009 },
  RightUpLeg:     { rx: 0.273, ry: 0.241, rz: 0.222 },
  RightLeg:       { rx: 0.285, ry: 0.287, rz: 0.129 },
  RightFoot:      { rx: 0.285, ry: 0.213, rz: 0.009 },
};

function getBonePos(gx, gy, gz, boneName) {
  const r = BONE_RATIOS[boneName];
  return { x: Math.round(r.rx * gx), y: Math.round(r.ry * gy), z: Math.round(r.rz * gz) };
}

/**
 * Segment assignment: for each voxel, determine which body segment it belongs to.
 * Uses Z-height bands and X-position to distinguish limbs from torso.
 */
function assignSegment(vx, vy, vz, gx, gy, gz) {
  const bones = {};
  for (const [name, ratio] of Object.entries(BONE_RATIOS)) {
    bones[name] = {
      x: ratio.rx * gx,
      y: ratio.ry * gy,
      z: ratio.rz * gz,
    };
  }

  const centerX = gx / 2;
  const neckZ = bones.Neck.z;
  const hipsZ = bones.Hips.z;
  const kneeZ = bones.LeftLeg.z;
  const footZ = bones.LeftFoot.z;
  const shoulderLX = bones.LeftShoulder.x;
  const shoulderRX = bones.RightShoulder.x;
  const elbowZ = bones.LeftForeArm.z;
  const hipLX = bones.LeftUpLeg.x;
  const hipRX = bones.RightUpLeg.x;

  // Head: above neck
  if (vz >= neckZ) return 'head';

  // Above hips
  if (vz >= hipsZ) {
    // Arms: outside shoulder X range
    if (vx < shoulderLX) {
      if (vz >= elbowZ) return 'left_upper_arm';
      return 'left_forearm';
    }
    if (vx > shoulderRX) {
      if (vz >= elbowZ) return 'right_upper_arm';
      return 'right_forearm';
    }
    // Torso
    if (vz >= bones.Spine2.z) return 'upper_torso';
    return 'lower_torso';
  }

  // Below hips: legs
  if (vx < centerX) {
    if (vz >= kneeZ) return 'left_thigh';
    if (vz >= footZ) return 'left_calf';
    return 'left_foot';
  } else {
    if (vz >= kneeZ) return 'right_thigh';
    if (vz >= footZ) return 'right_calf';
    return 'right_foot';
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

  // Assign each voxel to a segment
  const segments = {};
  for (const v of voxels) {
    const seg = assignSegment(v.x, v.y, v.z, sizeX, sizeY, sizeZ);
    if (!segments[seg]) segments[seg] = [];
    segments[seg].push(v);
  }

  // Output directory
  const segDir = path.join(outputDir, 'segments');
  fs.mkdirSync(segDir, { recursive: true });

  // Save each segment as a VOX file (keeping original coordinate system)
  const segmentMeta = {};
  for (const [segName, segVoxels] of Object.entries(segments)) {
    const filename = `${segName}.vox`;
    writeVox(path.join(segDir, filename), sizeX, sizeY, sizeZ, segVoxels, palette);
    segmentMeta[segName] = {
      file: `/segments/${filename}`,
      voxels: segVoxels.length,
    };
    console.log(`  ${segName}: ${segVoxels.length} voxels`);
  }

  // Compute bone positions for this model
  const bonePositions = {};
  for (const [name, ratio] of Object.entries(BONE_RATIOS)) {
    bonePositions[name] = {
      x: Math.round(ratio.rx * sizeX),
      y: Math.round(ratio.ry * sizeY),
      z: Math.round(ratio.rz * sizeZ),
    };
  }

  // Save metadata
  const meta = {
    label,
    voxel_size: grid.voxel_size,
    grid: { gx: sizeX, gy: sizeY, gz: sizeZ },
    bones: bonePositions,
    segments: segmentMeta,
    total_voxels: voxels.length,
  };
  fs.writeFileSync(path.join(outputDir, 'segments.json'), JSON.stringify(meta, null, 2));

  // Also save the combined body parts.json entry for each segment (for viewer)
  const partsEntries = Object.entries(segmentMeta).map(([key, info]) => ({
    key,
    file: `/${path.basename(outputDir)}${info.file}`,
    voxels: info.voxels,
    default_on: true,
    meshes: [key],
    is_body: true,
    category: 'body_segment',
  }));
  fs.writeFileSync(path.join(outputDir, 'parts.json'), JSON.stringify(partsEntries, null, 2));
  fs.copyFileSync(gridJsonPath, path.join(outputDir, 'grid.json'));

  console.log(`  -> Saved ${Object.keys(segments).length} segments to ${segDir}`);
}

const voxBase = 'C:/Users/user/developsecond/game-assets/vox';

// Female BasicBody (ElfPaladin base)
processBody(
  path.join(voxBase, 'female/BasicBodyFemale/body/body.vox'),
  path.join(voxBase, 'female/BasicBodyFemale/grid.json'),
  path.join(voxBase, 'female/BasicBodyFemale'),
  'BasicBodyFemale'
);

// Male BasicBody (MaleSmallSizeModel1 base)
processBody(
  path.join(voxBase, 'male/BasicBodyMale/body/body.vox'),
  path.join(voxBase, 'male/BasicBodyMale/grid.json'),
  path.join(voxBase, 'male/BasicBodyMale'),
  'BasicBodyMale'
);

console.log('\nDone.');
