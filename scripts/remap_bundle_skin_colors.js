/**
 * Remap segments_bundle.json palette colors to match a skin-colored body.vox
 * using world-space spatial mapping.
 *
 * Usage: node scripts/remap_bundle_skin_colors.js <base_model_dir> <skin_body_vox> <skin_grid_json>
 *
 * Example:
 *   node scripts/remap_bundle_skin_colors.js \
 *     C:/Users/user/developsecond/game-assets/vox/female/CyberpunkElf-Detailed \
 *     C:/Users/user/developsecond/game-assets/vox/female/realistic/body/body.vox \
 *     C:/Users/user/developsecond/game-assets/vox/female/realistic/grid.json
 */

const fs = require('fs');
const path = require('path');

const BASE_DIR = process.argv[2];
const SKIN_VOX = process.argv[3];
const SKIN_GRID_JSON = process.argv[4];

if (!BASE_DIR || !SKIN_VOX || !SKIN_GRID_JSON) {
  console.log('Usage: node remap_bundle_skin_colors.js <base_model_dir> <skin_body_vox> <skin_grid_json>');
  process.exit(1);
}

function readVox(filepath) {
  const buf = fs.readFileSync(filepath);
  let off = 0;
  const r4 = () => { const v = buf.readUInt32LE(off); off += 4; return v; };
  const r1 = () => buf[off++];
  const rs = (n) => { let s = ''; for (let i = 0; i < n; i++) s += String.fromCharCode(buf[off + i]); off += n; return s; };
  rs(4); r4(); // VOX + version
  rs(4); const mc = r4(); const mcc = r4(); off += mc;
  const end = off + mcc;
  let palette = null;
  const voxels = [];
  while (off < end) {
    const id = rs(4), cs = r4(); r4(); const ce = off + cs;
    if (id === 'XYZI') {
      const n = r4();
      for (let i = 0; i < n; i++) voxels.push({ x: r1(), y: r1(), z: r1(), c: r1() });
    }
    if (id === 'RGBA') {
      palette = [];
      for (let i = 0; i < 256; i++) { palette.push([r1() / 255, r1() / 255, r1() / 255]); r1(); }
    }
    off = ce;
  }
  if (!palette) palette = Array.from({ length: 256 }, () => [0.8, 0.8, 0.8]);
  return { voxels, palette };
}

// Load grids
const baseGrid = JSON.parse(fs.readFileSync(path.join(BASE_DIR, 'grid.json'), 'utf8'));
const skinGrid = JSON.parse(fs.readFileSync(SKIN_GRID_JSON, 'utf8'));

// Load skin body vox
console.log('Loading skin body vox...');
const skinVox = readVox(SKIN_VOX);
console.log(`  Skin voxels: ${skinVox.voxels.length}`);

// Build world-space color lookup with bucketing
const BUCKET = 0.004; // 4mm buckets
const skinColorMap = new Map();
for (const v of skinVox.voxels) {
  const wx = Math.round((skinGrid.grid_origin[0] + v.x * skinGrid.voxel_size) / BUCKET);
  const wy = Math.round((skinGrid.grid_origin[1] + v.y * skinGrid.voxel_size) / BUCKET);
  const wz = Math.round((skinGrid.grid_origin[2] + v.z * skinGrid.voxel_size) / BUCKET);
  skinColorMap.set(`${wx},${wy},${wz}`, skinVox.palette[v.c - 1] || [0.8, 0.8, 0.8]);
}
console.log(`  Skin color buckets: ${skinColorMap.size}`);

// Load existing bundle
const bundlePath = path.join(BASE_DIR, 'segments_bundle.json');
const bundle = JSON.parse(fs.readFileSync(bundlePath, 'utf8'));
console.log(`\nOriginal bundle: ${Object.keys(bundle.segments).length} segments, ${bundle.palette.length} palette colors`);

// Remap each voxel's color by spatial lookup
const newPalette = [];
const paletteMap = new Map(); // "r,g,b" -> index

function getColorIndex(rgb) {
  const key = `${rgb[0].toFixed(4)},${rgb[1].toFixed(4)},${rgb[2].toFixed(4)}`;
  if (paletteMap.has(key)) return paletteMap.get(key);
  const idx = newPalette.length;
  paletteMap.set(key, idx);
  newPalette.push(rgb);
  return idx;
}

function findSkinColor(vx, vy, vz) {
  const wx = Math.round((baseGrid.grid_origin[0] + vx * baseGrid.voxel_size) / BUCKET);
  const wy = Math.round((baseGrid.grid_origin[1] + vy * baseGrid.voxel_size) / BUCKET);
  const wz = Math.round((baseGrid.grid_origin[2] + vz * baseGrid.voxel_size) / BUCKET);
  // Try exact match first
  const exact = skinColorMap.get(`${wx},${wy},${wz}`);
  if (exact) return exact;
  // Neighbor search (radius 2)
  let bestColor = null;
  let bestDist = Infinity;
  for (let dx = -2; dx <= 2; dx++) {
    for (let dy = -2; dy <= 2; dy++) {
      for (let dz = -2; dz <= 2; dz++) {
        const c = skinColorMap.get(`${wx + dx},${wy + dy},${wz + dz}`);
        if (c) {
          const d = dx * dx + dy * dy + dz * dz;
          if (d < bestDist) { bestDist = d; bestColor = c; }
        }
      }
    }
  }
  return bestColor;
}

let totalVoxels = 0, remappedVoxels = 0;

for (const [boneName, flat] of Object.entries(bundle.segments)) {
  const numVoxels = flat.length / 4;
  const newFlat = new Array(flat.length);

  for (let i = 0; i < numVoxels; i++) {
    const vx = flat[i * 4], vy = flat[i * 4 + 1], vz = flat[i * 4 + 2], ci = flat[i * 4 + 3];
    const origColor = bundle.palette[ci] || [0.8, 0.8, 0.8];

    totalVoxels++;
    const skinColor = findSkinColor(vx, vy, vz);
    const finalColor = skinColor || origColor;
    if (skinColor) remappedVoxels++;

    newFlat[i * 4] = vx;
    newFlat[i * 4 + 1] = vy;
    newFlat[i * 4 + 2] = vz;
    newFlat[i * 4 + 3] = getColorIndex(finalColor);
  }

  bundle.segments[boneName] = newFlat;
}

bundle.palette = newPalette;

// Write output
const outPath = path.join(BASE_DIR, 'segments_bundle.json');
// Backup original
const backupPath = path.join(BASE_DIR, 'segments_bundle.backup.json');
if (!fs.existsSync(backupPath)) {
  fs.copyFileSync(outPath, backupPath);
  console.log(`\nBackup saved: ${backupPath}`);
}

fs.writeFileSync(outPath, JSON.stringify(bundle));
const fileSizeMB = (fs.statSync(outPath).size / (1024 * 1024)).toFixed(2);

console.log(`\n=== Done ===`);
console.log(`  Remapped: ${remappedVoxels}/${totalVoxels} (${(remappedVoxels / totalVoxels * 100).toFixed(1)}%)`);
console.log(`  New palette: ${newPalette.length} colors`);
console.log(`  File size: ${fileSizeMB} MB`);
console.log(`  Output: ${outPath}`);
