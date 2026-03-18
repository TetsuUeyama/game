/**
 * Bundle all segment .vox files into a single JSON for fast loading.
 *
 * Output: segments_bundle.json containing all voxels grouped by bone,
 * with palette colors pre-normalized to 0-1 range.
 *
 * Usage: node scripts/bundle_segments.js <model_dir>
 */

const fs = require('fs');
const path = require('path');

const MODEL_DIR = process.argv[2];
if (!MODEL_DIR) {
  console.log('Usage: node bundle_segments.js <model_dir>');
  process.exit(1);
}

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
      else if (id === 'RGBA') { palette = []; for (let i = 0; i < 256; i++) { palette.push([readU8() / 255, readU8() / 255, readU8() / 255]); readU8(); } }
      offset = ce; if (ccs > 0) readChunks(offset + ccs);
    }
  };
  if (readStr(4) !== 'MAIN') throw new Error('No MAIN');
  const mc = readU32(), mcc = readU32();
  offset += mc;
  readChunks(offset + mcc);
  if (!palette) { palette = []; for (let i = 0; i < 256; i++) palette.push([0.8, 0.8, 0.8]); }
  return { sizeX, sizeY, sizeZ, voxels, palette };
}

const segmentsJson = JSON.parse(fs.readFileSync(path.join(MODEL_DIR, 'segments.json'), 'utf8'));
const { segments, grid } = segmentsJson;

console.log('Bundling segments...');

// Merge all palettes into a unified palette
const unifiedPalette = [];
const paletteMap = new Map(); // "r,g,b" -> index

function getUnifiedColorIndex(r, g, b) {
  const key = `${r.toFixed(4)},${g.toFixed(4)},${b.toFixed(4)}`;
  if (paletteMap.has(key)) return paletteMap.get(key);
  const idx = unifiedPalette.length;
  paletteMap.set(key, idx);
  unifiedPalette.push([r, g, b]);
  return idx;
}

const bundleSegments = {};
let totalVoxels = 0;

for (const [boneName, segInfo] of Object.entries(segments)) {
  const voxPath = path.join(MODEL_DIR, segInfo.file);
  if (!fs.existsSync(voxPath)) {
    console.log(`  SKIP ${boneName}: file not found`);
    continue;
  }

  const vox = readVox(voxPath);
  // Compact format: flat array [x,y,z,ci, x,y,z,ci, ...]
  const flat = new Array(vox.voxels.length * 4);
  for (let i = 0; i < vox.voxels.length; i++) {
    const v = vox.voxels[i];
    const pal = vox.palette[v.c - 1] || [0.8, 0.8, 0.8];
    flat[i * 4] = v.x;
    flat[i * 4 + 1] = v.y;
    flat[i * 4 + 2] = v.z;
    flat[i * 4 + 3] = getUnifiedColorIndex(pal[0], pal[1], pal[2]);
  }

  bundleSegments[boneName] = flat;
  totalVoxels += vox.voxels.length;
}

const bundle = {
  grid: { gx: grid.gx, gy: grid.gy, gz: grid.gz },
  palette: unifiedPalette,
  segments: bundleSegments,
};

const outPath = path.join(MODEL_DIR, 'segments_bundle.json');
fs.writeFileSync(outPath, JSON.stringify(bundle));

const fileSizeMB = (fs.statSync(outPath).size / (1024 * 1024)).toFixed(2);
console.log(`\n=== Done ===`);
console.log(`  Segments: ${Object.keys(bundleSegments).length}`);
console.log(`  Total voxels: ${totalVoxels}`);
console.log(`  Palette colors: ${unifiedPalette.length}`);
console.log(`  File size: ${fileSizeMB} MB`);
console.log(`  Output: ${outPath}`);
