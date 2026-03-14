/**
 * merge_segments_head_body.js
 *
 * セグメント版のBasicBodyから、ボーン名で頭パーツと体パーツを判定し、
 * それぞれ1つのVOXファイルに統合。
 * 頭パーツはZをシフトして0起点にし、表示時にオフセットで結合。
 *
 * Usage: node scripts/merge_segments_head_body.js
 */
const fs = require('fs');
const path = require('path');

// Head segments: neck and above
const HEAD_SEGMENTS = new Set([
  'neck.x', 'head.x', 'jawbone.x',
  'c_ear_01.l', 'c_ear_02.l', 'c_ear_01.r', 'c_ear_02.r',
  'c_eye.l', 'c_eye.r',
]);

function parseVox(filePath) {
  const buf = fs.readFileSync(filePath);
  let offset = 8, sizeX = 0, sizeY = 0, sizeZ = 0;
  const voxels = []; let palette = null;
  const rc = (off) => ({ id: buf.toString('ascii', off, off+4), cs: buf.readInt32LE(off+4), ccs: buf.readInt32LE(off+8), data: off+12 });
  const main = rc(offset); offset += 12;
  const end = offset + main.ccs;
  while (offset < end) {
    const c = rc(offset);
    if (c.id === 'SIZE') { sizeX = buf.readInt32LE(c.data); sizeY = buf.readInt32LE(c.data+4); sizeZ = buf.readInt32LE(c.data+8); }
    else if (c.id === 'XYZI') { const n = buf.readInt32LE(c.data); for (let i = 0; i < n; i++) { const b = c.data+4+i*4; voxels.push({x:buf.readUInt8(b),y:buf.readUInt8(b+1),z:buf.readUInt8(b+2),c:buf.readUInt8(b+3)}); } }
    else if (c.id === 'RGBA') { palette = []; for (let i = 0; i < 256; i++) { const b = c.data+i*4; palette.push({r:buf.readUInt8(b),g:buf.readUInt8(b+1),b:buf.readUInt8(b+2),a:buf.readUInt8(b+3)}); } }
    offset += 12 + c.cs + c.ccs;
  }
  return { sizeX, sizeY, sizeZ, voxels, palette };
}

function writeVox(filePath, sizeX, sizeY, sizeZ, voxels, palette) {
  const n = voxels.length;
  const chunks = [];
  const sb = Buffer.alloc(24); sb.write('SIZE',0); sb.writeInt32LE(12,4); sb.writeInt32LE(0,8);
  sb.writeInt32LE(sizeX,12); sb.writeInt32LE(sizeY,16); sb.writeInt32LE(sizeZ,20); chunks.push(sb);
  const xb = Buffer.alloc(16+n*4); xb.write('XYZI',0); xb.writeInt32LE(4+n*4,4); xb.writeInt32LE(0,8); xb.writeInt32LE(n,12);
  for (let i = 0; i < n; i++) { const v = voxels[i], o = 16+i*4; xb.writeUInt8(v.x,o); xb.writeUInt8(v.y,o+1); xb.writeUInt8(v.z,o+2); xb.writeUInt8(v.c,o+3); }
  chunks.push(xb);
  if (palette) { const rb = Buffer.alloc(12+256*4); rb.write('RGBA',0); rb.writeInt32LE(256*4,4); rb.writeInt32LE(0,8); for (let i = 0; i < 256; i++) { const p = palette[i]||{r:0,g:0,b:0,a:255}, o = 12+i*4; rb.writeUInt8(p.r,o); rb.writeUInt8(p.g,o+1); rb.writeUInt8(p.b,o+2); rb.writeUInt8(p.a,o+3); } chunks.push(rb); }
  const cs = chunks.reduce((s,b) => s+b.length, 0);
  const out = Buffer.alloc(20+cs); out.write('VOX ',0); out.writeInt32LE(150,4);
  out.write('MAIN',8); out.writeInt32LE(0,12); out.writeInt32LE(cs,16);
  let pos = 20; for (const c of chunks) { c.copy(out,pos); pos += c.length; }
  fs.writeFileSync(filePath, out);
}

const voxBase = 'C:/Users/user/developsecond/game-assets/vox';
const models = [
  { gender: 'female', dir: 'BasicBodyFemale', label: 'Female' },
  { gender: 'male', dir: 'BasicBodyMale-Vagrant', label: 'Vagrant' },
  { gender: 'male', dir: 'BasicBodyMale-Radagon', label: 'Radagon' },
  { gender: 'male', dir: 'BasicBodyMale-Spartan', label: 'Spartan' },
];

for (const model of models) {
  const baseDir = path.join(voxBase, model.gender, model.dir);
  const segJson = path.join(baseDir, 'segments.json');
  if (!fs.existsSync(segJson)) { console.log(`SKIP ${model.label}`); continue; }

  const meta = JSON.parse(fs.readFileSync(segJson, 'utf8'));
  const vs = meta.voxel_size;
  const neckZ = meta.bone_positions['neck.x']?.head_voxel[2] || 0;

  console.log(`\n=== ${model.label} (neck Z=${neckZ}) ===`);

  const headVoxels = [];
  const bodyVoxels = [];
  let palette = null;

  for (const [segName, segInfo] of Object.entries(meta.segments)) {
    const segFile = path.join(baseDir, segInfo.file);
    if (!fs.existsSync(segFile)) continue;
    const segModel = parseVox(segFile);
    if (!palette) palette = segModel.palette;

    const isHead = HEAD_SEGMENTS.has(segName);
    if (isHead) {
      headVoxels.push(...segModel.voxels);
      console.log(`  HEAD: ${segName} (${segModel.voxels.length} voxels)`);
    } else {
      bodyVoxels.push(...segModel.voxels);
    }
  }

  // Head: shift Z so it starts from 0
  const headMinZ = Math.min(...headVoxels.map(v => v.z));
  const headShifted = headVoxels.map(v => ({ ...v, z: v.z - headMinZ }));
  const headMaxZ = Math.max(...headShifted.map(v => v.z)) + 1;
  const headOffsetY = headMinZ * vs; // viewer Y offset

  // Body max Z
  const bodyMaxZ = Math.max(...bodyVoxels.map(v => v.z)) + 1;

  console.log(`  Body: ${bodyVoxels.length} voxels (gz=${bodyMaxZ}, ${bodyMaxZ <= 256 ? 'OK' : 'OVER!'})` );
  console.log(`  Head: ${headVoxels.length} voxels (gz=${headMaxZ}, offset_y=${headOffsetY.toFixed(4)})`);

  // Write to merged/ directory
  const mergedDir = path.join(baseDir, 'merged');
  fs.mkdirSync(mergedDir, { recursive: true });

  writeVox(path.join(mergedDir, 'body.vox'), meta.grid.gx, meta.grid.gy, Math.min(bodyMaxZ, 256), bodyVoxels, palette);
  writeVox(path.join(mergedDir, 'head.vox'), meta.grid.gx, meta.grid.gy, Math.min(headMaxZ, 256), headShifted, palette);

  // Write parts.json
  const parts = [
    { key: 'body', file: `/${model.dir}/merged/body.vox`, voxels: bodyVoxels.length, default_on: true, meshes: ['body'], is_body: true, category: 'body' },
    { key: 'head', file: `/${model.dir}/merged/head.vox`, voxels: headVoxels.length, default_on: true, meshes: ['head'], is_body: true, category: 'body', head_offset_y: headOffsetY },
  ];
  fs.writeFileSync(path.join(mergedDir, 'parts.json'), JSON.stringify(parts, null, 2));

  // Write grid.json
  const grid = JSON.parse(fs.readFileSync(path.join(baseDir, 'grid.json'), 'utf8'));
  grid.neck_z = neckZ;
  grid.head_offset_y = headOffsetY;
  fs.writeFileSync(path.join(mergedDir, 'grid.json'), JSON.stringify(grid, null, 2));
}

console.log('\nDone.');
