/**
 * split_head_body.js
 *
 * ボーンセグメント化済みのBasicBodyからNeckボーンの位置で
 * head部とbody部に分割し、それぞれ別のVOXファイルとして保存。
 * body部はgz<=256に収まり、head部は別ファイルで結合表示。
 *
 * Usage: node scripts/split_head_body.js
 */

const fs = require('fs');
const path = require('path');

// ========================================================================
// VOX parser/writer
// ========================================================================
function parseVox(filePath) {
  const buf = fs.readFileSync(filePath);
  let offset = 8;
  let sizeX = 0, sizeY = 0, sizeZ = 0;
  const voxels = [];
  let palette = null;
  function readChunk(off) {
    return { id: buf.toString('ascii', off, off + 4), cs: buf.readInt32LE(off + 4), ccs: buf.readInt32LE(off + 8), data: off + 12 };
  }
  const main = readChunk(offset); offset += 12;
  const end = offset + main.ccs;
  while (offset < end) {
    const c = readChunk(offset);
    if (c.id === 'SIZE') { sizeX = buf.readInt32LE(c.data); sizeY = buf.readInt32LE(c.data + 4); sizeZ = buf.readInt32LE(c.data + 8); }
    else if (c.id === 'XYZI') {
      const n = buf.readInt32LE(c.data);
      for (let i = 0; i < n; i++) {
        const b = c.data + 4 + i * 4;
        voxels.push({ x: buf.readUInt8(b), y: buf.readUInt8(b + 1), z: buf.readUInt8(b + 2), c: buf.readUInt8(b + 3) });
      }
    } else if (c.id === 'RGBA') {
      palette = [];
      for (let i = 0; i < 256; i++) {
        const b = c.data + i * 4;
        palette.push({ r: buf.readUInt8(b), g: buf.readUInt8(b + 1), b: buf.readUInt8(b + 2), a: buf.readUInt8(b + 3) });
      }
    }
    offset += 12 + c.cs + c.ccs;
  }
  return { sizeX, sizeY, sizeZ, voxels, palette };
}

function writeVox(filePath, sizeX, sizeY, sizeZ, voxels, palette) {
  const n = voxels.length;
  const chunks = [];
  // SIZE
  const sizeBuf = Buffer.alloc(24);
  sizeBuf.write('SIZE', 0); sizeBuf.writeInt32LE(12, 4); sizeBuf.writeInt32LE(0, 8);
  sizeBuf.writeInt32LE(sizeX, 12); sizeBuf.writeInt32LE(sizeY, 16); sizeBuf.writeInt32LE(sizeZ, 20);
  chunks.push(sizeBuf);
  // XYZI
  const xyziBuf = Buffer.alloc(12 + 4 + n * 4);
  xyziBuf.write('XYZI', 0); xyziBuf.writeInt32LE(4 + n * 4, 4); xyziBuf.writeInt32LE(0, 8);
  xyziBuf.writeInt32LE(n, 12);
  for (let i = 0; i < n; i++) {
    const v = voxels[i]; const o = 16 + i * 4;
    xyziBuf.writeUInt8(v.x, o); xyziBuf.writeUInt8(v.y, o + 1); xyziBuf.writeUInt8(v.z, o + 2); xyziBuf.writeUInt8(v.c, o + 3);
  }
  chunks.push(xyziBuf);
  // RGBA
  if (palette) {
    const rgbaBuf = Buffer.alloc(12 + 256 * 4);
    rgbaBuf.write('RGBA', 0); rgbaBuf.writeInt32LE(256 * 4, 4); rgbaBuf.writeInt32LE(0, 8);
    for (let i = 0; i < 256; i++) {
      const p = palette[i] || { r: 0, g: 0, b: 0, a: 255 }; const o = 12 + i * 4;
      rgbaBuf.writeUInt8(p.r, o); rgbaBuf.writeUInt8(p.g, o + 1); rgbaBuf.writeUInt8(p.b, o + 2); rgbaBuf.writeUInt8(p.a, o + 3);
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
// Main
// ========================================================================
const voxBase = 'C:/Users/user/developsecond/game-assets/vox';

const models = [
  { gender: 'female', dir: 'BasicBodyFemale', label: 'Female (CyberpunkElf)' },
  { gender: 'male', dir: 'BasicBodyMale-Vagrant', label: 'Male (Vagrant)' },
  { gender: 'male', dir: 'BasicBodyMale-Radagon', label: 'Male (Radagon)' },
  { gender: 'male', dir: 'BasicBodyMale-Spartan', label: 'Male (Spartan)' },
];

for (const model of models) {
  const baseDir = path.join(voxBase, model.gender, model.dir);
  const segDir = path.join(baseDir, 'segments');
  const segJson = path.join(baseDir, 'segments.json');

  if (!fs.existsSync(segJson)) {
    console.log(`SKIP ${model.label}: no segments.json`);
    continue;
  }

  const meta = JSON.parse(fs.readFileSync(segJson, 'utf8'));
  const neckBone = meta.bone_positions['neck.x'];

  if (!neckBone) {
    console.log(`SKIP ${model.label}: no neck.x bone`);
    continue;
  }

  // Neck Z voxel coordinate = cut point
  const neckZ = neckBone.head_voxel[2];
  console.log(`\n=== ${model.label} ===`);
  console.log(`  Neck Z: ${neckZ} (grid gz: ${meta.grid.gz})`);

  // Create split output directory
  const splitDir = path.join(baseDir, 'split');
  fs.mkdirSync(splitDir, exist_ok = true);

  // Process each segment: split voxels above/below neck Z
  const bodyVoxels = [];
  const headVoxels = [];
  let bodyPalette = null;

  for (const [segName, segInfo] of Object.entries(meta.segments)) {
    const segFile = path.join(baseDir, segInfo.file);
    if (!fs.existsSync(segFile)) continue;

    const segModel = parseVox(segFile);
    if (!bodyPalette) bodyPalette = segModel.palette;

    for (const v of segModel.voxels) {
      if (v.z >= neckZ) {
        headVoxels.push(v);
      } else {
        bodyVoxels.push(v);
      }
    }
  }

  // Body: keep Z as-is (0 to neckZ-1), fits in 256
  const bodyMaxZ = neckZ;
  console.log(`  Body: ${bodyVoxels.length} voxels (Z: 0-${bodyMaxZ - 1})`);
  console.log(`  Head: ${headVoxels.length} voxels (Z: ${neckZ}-${meta.grid.gz - 1})`);

  // Head: shift Z so it starts from 0
  const headShifted = headVoxels.map(v => ({ ...v, z: v.z - neckZ }));
  const headMaxZ = meta.grid.gz - neckZ;

  // Write body.vox and head.vox
  writeVox(path.join(splitDir, 'body.vox'), meta.grid.gx, meta.grid.gy, Math.min(bodyMaxZ, 256), bodyVoxels, bodyPalette);
  writeVox(path.join(splitDir, 'head.vox'), meta.grid.gx, meta.grid.gy, Math.min(headMaxZ, 256), headShifted, bodyPalette);

  // Write parts.json for the split version
  const vs = meta.voxel_size;
  const headOffsetY = neckZ * vs; // viewer Y offset for head (Z in vox = Y in viewer)

  const splitParts = [
    {
      key: 'body',
      file: `/${model.dir}/split/body.vox`,
      voxels: bodyVoxels.length,
      default_on: true,
      meshes: ['body'],
      is_body: true,
      category: 'body',
    },
    {
      key: 'head',
      file: `/${model.dir}/split/head.vox`,
      voxels: headVoxels.length,
      default_on: true,
      meshes: ['head'],
      is_body: true,
      category: 'body',
      head_offset_y: headOffsetY, // Y offset in viewer coords
    },
  ];

  const splitPartsFile = path.join(splitDir, 'parts.json');
  fs.writeFileSync(splitPartsFile, JSON.stringify(splitParts, null, 2));

  // Write grid.json for split version
  const splitGrid = { ...JSON.parse(fs.readFileSync(path.join(baseDir, 'grid.json'), 'utf8')) };
  splitGrid.neck_z = neckZ;
  splitGrid.head_offset_y = headOffsetY;
  fs.writeFileSync(path.join(splitDir, 'grid.json'), JSON.stringify(splitGrid, null, 2));

  console.log(`  -> ${splitDir}`);
  console.log(`  Body gz: ${Math.min(bodyMaxZ, 256)} (${bodyMaxZ <= 256 ? 'OK' : 'OVER 256!'})`);
  console.log(`  Head gz: ${Math.min(headMaxZ, 256)} (${headMaxZ <= 256 ? 'OK' : 'OVER 256!'})`);
}

console.log('\nDone.');
