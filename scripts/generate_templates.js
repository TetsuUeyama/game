/**
 * generate_templates.js — Phase 2: Bodyからテンプレートシェルを自動生成
 *
 * 使い方:
 *   node scripts/generate_templates.js
 *
 * 出力:
 *   public/templates/hair_cap.vox       — ヘアキャップ（頭部球殻）
 *   public/templates/shirt_shell.vox    — 上半身シェル
 *   public/templates/pants_shell.vox    — 下半身シェル
 *   public/templates/boots_shell.vox    — 足元シェル
 *   public/templates/gloves_shell.vox   — 手シェル
 *   public/templates/full_body_shell.vox — 全身シェル
 *
 * 処理:
 *   1. Body vox を読み込み
 *   2. ボーン設定から部位を分類
 *   3. 各部位の表面ボクセルを検出
 *   4. 表面から外側にオフセットしてシェルを生成
 *   5. .vox ファイルとして保存
 */

const fs = require('fs');
const path = require('path');

// ========================================================================
// Config
// ========================================================================
const BODY_VOX_PATH = path.join(__dirname, '../public/box2/cyberpunk_elf_body_base.vox');
const BONE_CONFIG_PATH = path.join(__dirname, '../public/box2/bone-config.json');
const OUTPUT_DIR = path.join(__dirname, '../public/templates');

// Shell expansion: how many voxels outward from body surface
const SHELL_OFFSET = 2;

// Body part Z/X boundaries (from fbx-viewer analysis)
const REGIONS = {
  head:       { zMin: 79, zMax: 999, xMin: 0, xMax: 999 },
  torso:      { zMin: 35, zMax: 79,  xMin: 28, xMax: 54 },
  leftArm:    { zMin: 35, zMax: 79,  xMin: 0,  xMax: 28 },
  rightArm:   { zMin: 35, zMax: 79,  xMin: 54, xMax: 999 },
  leftLeg:    { zMin: 0,  zMax: 35,  xMin: 0,  xMax: 41 },
  rightLeg:   { zMin: 0,  zMax: 35,  xMin: 41, xMax: 999 },
};

// ========================================================================
// VOX parser / writer (shared with symmetrize_voxels.js)
// ========================================================================
function parseVox(buf) {
  const magic = buf.toString('ascii', 0, 4);
  if (magic !== 'VOX ') throw new Error('Not a valid .vox file');

  let offset = 8;
  let sizeX = 0, sizeY = 0, sizeZ = 0;
  const voxels = [];
  let palette = null;

  function readChunk(off) {
    const id = buf.toString('ascii', off, off + 4);
    const contentSize = buf.readInt32LE(off + 4);
    const childrenSize = buf.readInt32LE(off + 8);
    return { id, contentSize, childrenSize, dataOffset: off + 12 };
  }

  const main = readChunk(offset);
  offset += 12;
  const end = offset + main.childrenSize;

  while (offset < end) {
    const chunk = readChunk(offset);
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
          colorIndex: buf.readUInt8(base + 3),
        });
      }
    } else if (chunk.id === 'RGBA') {
      palette = Buffer.alloc(chunk.contentSize);
      buf.copy(palette, 0, chunk.dataOffset, chunk.dataOffset + chunk.contentSize);
    }
    offset += 12 + chunk.contentSize + chunk.childrenSize;
  }

  return { sizeX, sizeY, sizeZ, voxels, palette };
}

function writeVox(outputPath, sizeX, sizeY, sizeZ, voxels, palette) {
  const sizeContentSize = 12;
  const xyziContentSize = 4 + voxels.length * 4;
  const paletteContentSize = palette ? palette.length : 0;

  let childrenSize = (12 + sizeContentSize) + (12 + xyziContentSize);
  if (palette) childrenSize += 12 + paletteContentSize;

  const buf = Buffer.alloc(8 + 12 + childrenSize);
  let off = 0;

  buf.write('VOX ', off); off += 4;
  buf.writeInt32LE(200, off); off += 4;

  buf.write('MAIN', off); off += 4;
  buf.writeInt32LE(0, off); off += 4;
  buf.writeInt32LE(childrenSize, off); off += 4;

  buf.write('SIZE', off); off += 4;
  buf.writeInt32LE(sizeContentSize, off); off += 4;
  buf.writeInt32LE(0, off); off += 4;
  buf.writeInt32LE(sizeX, off); off += 4;
  buf.writeInt32LE(sizeY, off); off += 4;
  buf.writeInt32LE(sizeZ, off); off += 4;

  buf.write('XYZI', off); off += 4;
  buf.writeInt32LE(xyziContentSize, off); off += 4;
  buf.writeInt32LE(0, off); off += 4;
  buf.writeInt32LE(voxels.length, off); off += 4;
  for (const v of voxels) {
    buf.writeUInt8(v.x, off++);
    buf.writeUInt8(v.y, off++);
    buf.writeUInt8(v.z, off++);
    buf.writeUInt8(v.colorIndex, off++);
  }

  if (palette) {
    buf.write('RGBA', off); off += 4;
    buf.writeInt32LE(paletteContentSize, off); off += 4;
    buf.writeInt32LE(0, off); off += 4;
    palette.copy(buf, off);
  }

  fs.writeFileSync(outputPath, buf);
}

// ========================================================================
// 3D voxel grid utilities
// ========================================================================
function buildOccupancySet(voxels) {
  const set = new Set();
  for (const v of voxels) {
    set.add(`${v.x},${v.y},${v.z}`);
  }
  return set;
}

/** 6-connected neighbors */
const NEIGHBORS_6 = [
  [1, 0, 0], [-1, 0, 0],
  [0, 1, 0], [0, -1, 0],
  [0, 0, 1], [0, 0, -1],
];

/** Find surface voxels: voxels that have at least one empty neighbor */
function findSurface(voxels, occupied) {
  const surface = [];
  for (const v of voxels) {
    for (const [dx, dy, dz] of NEIGHBORS_6) {
      const key = `${v.x + dx},${v.y + dy},${v.z + dz}`;
      if (!occupied.has(key)) {
        surface.push(v);
        break;
      }
    }
  }
  return surface;
}

/** Expand surface outward by given offset, excluding body interior */
function generateShell(surfaceVoxels, bodyOccupied, offset, sizeX, sizeY, sizeZ, colorIndex) {
  // BFS expansion from surface outward
  const shellSet = new Set();
  let frontier = [];

  // Start from empty neighbors of surface (outside the body)
  for (const v of surfaceVoxels) {
    for (const [dx, dy, dz] of NEIGHBORS_6) {
      const nx = v.x + dx, ny = v.y + dy, nz = v.z + dz;
      if (nx < 0 || ny < 0 || nz < 0 || nx >= sizeX || ny >= sizeY || nz >= sizeZ) continue;
      const key = `${nx},${ny},${nz}`;
      if (!bodyOccupied.has(key) && !shellSet.has(key)) {
        shellSet.add(key);
        frontier.push({ x: nx, y: ny, z: nz, dist: 1 });
      }
    }
  }

  // BFS expand up to offset distance
  for (let d = 2; d <= offset; d++) {
    const nextFrontier = [];
    for (const f of frontier) {
      for (const [dx, dy, dz] of NEIGHBORS_6) {
        const nx = f.x + dx, ny = f.y + dy, nz = f.z + dz;
        if (nx < 0 || ny < 0 || nz < 0 || nx >= sizeX || ny >= sizeY || nz >= sizeZ) continue;
        const key = `${nx},${ny},${nz}`;
        if (!bodyOccupied.has(key) && !shellSet.has(key)) {
          shellSet.add(key);
          nextFrontier.push({ x: nx, y: ny, z: nz, dist: d });
        }
      }
    }
    frontier = nextFrontier;
  }

  // Convert to voxel array
  const result = [];
  for (const key of shellSet) {
    const [x, y, z] = key.split(',').map(Number);
    result.push({ x, y, z, colorIndex });
  }
  return result;
}

/** Filter voxels by region */
function filterByRegion(voxels, region) {
  return voxels.filter(v =>
    v.z >= region.zMin && v.z < region.zMax &&
    v.x >= region.xMin && v.x < region.xMax
  );
}

// ========================================================================
// Hair cap: sphere shell around head
// ========================================================================
function generateHairCap(headVoxels, bodyOccupied, sizeX, sizeY, sizeZ) {
  // Find head center and radius
  let sumX = 0, sumY = 0, sumZ = 0;
  for (const v of headVoxels) {
    sumX += v.x; sumY += v.y; sumZ += v.z;
  }
  const n = headVoxels.length;
  if (n === 0) return [];
  const cx = sumX / n, cy = sumY / n, cz = sumZ / n;

  // Find max radius from center
  let maxR = 0;
  for (const v of headVoxels) {
    const dx = v.x - cx, dy = v.y - cy, dz = v.z - cz;
    const r = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (r > maxR) maxR = r;
  }

  // Generate sphere shell: voxels at radius maxR+1 to maxR+3
  // Only upper hemisphere (z >= cz - 2) for cap shape
  const innerR = maxR + 0.5;
  const outerR = maxR + 3.5;
  const capVoxels = [];

  const minX = Math.max(0, Math.floor(cx - outerR));
  const maxX = Math.min(sizeX - 1, Math.ceil(cx + outerR));
  const minY = Math.max(0, Math.floor(cy - outerR));
  const maxY = Math.min(sizeY - 1, Math.ceil(cy + outerR));
  const minZ = Math.max(0, Math.floor(cz - 2));
  const maxZ = Math.min(sizeZ - 1, Math.ceil(cz + outerR));

  for (let x = minX; x <= maxX; x++) {
    for (let y = minY; y <= maxY; y++) {
      for (let z = minZ; z <= maxZ; z++) {
        const dx = x - cx, dy = y - cy, dz = z - cz;
        const r = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (r >= innerR && r <= outerR && !bodyOccupied.has(`${x},${y},${z}`)) {
          capVoxels.push({ x, y, z, colorIndex: 1 }); // colorIndex 1 = template color
        }
      }
    }
  }

  return capVoxels;
}

// ========================================================================
// Main
// ========================================================================
function main() {
  console.log('=== Template Shell Generator ===\n');

  // Read body
  const bodyBuf = fs.readFileSync(BODY_VOX_PATH);
  const body = parseVox(bodyBuf);
  console.log(`Body: ${body.sizeX}x${body.sizeY}x${body.sizeZ}, ${body.voxels.length} voxels`);

  const bodyOccupied = buildOccupancySet(body.voxels);

  // Find surface voxels
  const surface = findSurface(body.voxels, bodyOccupied);
  console.log(`Surface voxels: ${surface.length}`);

  // Generate templates per region
  const templates = {
    hair_cap: {
      generate: () => {
        const headVoxels = filterByRegion(body.voxels, REGIONS.head);
        console.log(`  Head voxels: ${headVoxels.length}`);
        return generateHairCap(headVoxels, bodyOccupied, body.sizeX, body.sizeY, body.sizeZ);
      },
    },
    shirt_shell: {
      generate: () => {
        const torsoSurface = filterByRegion(surface, REGIONS.torso);
        const armLSurface = filterByRegion(surface, REGIONS.leftArm);
        const armRSurface = filterByRegion(surface, REGIONS.rightArm);
        const upperSurface = [...torsoSurface, ...armLSurface, ...armRSurface];
        console.log(`  Upper body surface: ${upperSurface.length}`);
        return generateShell(upperSurface, bodyOccupied, SHELL_OFFSET, body.sizeX, body.sizeY, body.sizeZ, 2);
      },
    },
    pants_shell: {
      generate: () => {
        const legLSurface = filterByRegion(surface, REGIONS.leftLeg);
        const legRSurface = filterByRegion(surface, REGIONS.rightLeg);
        // Include hips area (lower torso)
        const hipSurface = filterByRegion(surface, { zMin: 35, zMax: 50, xMin: 0, xMax: 999 });
        const lowerSurface = [...legLSurface, ...legRSurface, ...hipSurface];
        console.log(`  Lower body surface: ${lowerSurface.length}`);
        return generateShell(lowerSurface, bodyOccupied, SHELL_OFFSET, body.sizeX, body.sizeY, body.sizeZ, 3);
      },
    },
    boots_shell: {
      generate: () => {
        const feetRegion = { zMin: 0, zMax: 12, xMin: 0, xMax: 999 };
        const feetSurface = filterByRegion(surface, feetRegion);
        console.log(`  Feet surface: ${feetSurface.length}`);
        return generateShell(feetSurface, bodyOccupied, SHELL_OFFSET, body.sizeX, body.sizeY, body.sizeZ, 4);
      },
    },
    gloves_shell: {
      generate: () => {
        // Hands: lowest Z of arms (wrist area and below)
        const handRegion = { zMin: 55, zMax: 70, xMin: 0, xMax: 999 };
        const handVoxels = [
          ...filterByRegion(surface, { ...handRegion, xMax: 20 }),   // left hand
          ...filterByRegion(surface, { ...handRegion, xMin: 65 }),   // right hand
        ];
        console.log(`  Hand surface: ${handVoxels.length}`);
        return generateShell(handVoxels, bodyOccupied, SHELL_OFFSET, body.sizeX, body.sizeY, body.sizeZ, 5);
      },
    },
    full_body_shell: {
      generate: () => {
        console.log(`  Full body surface: ${surface.length}`);
        return generateShell(surface, bodyOccupied, SHELL_OFFSET, body.sizeX, body.sizeY, body.sizeZ, 6);
      },
    },
  };

  // Generate and save each template
  for (const [name, tmpl] of Object.entries(templates)) {
    console.log(`\nGenerating ${name}...`);
    const voxels = tmpl.generate();
    console.log(`  Result: ${voxels.length} shell voxels`);

    if (voxels.length === 0) {
      console.log(`  (skipped: no voxels)`);
      continue;
    }

    const outPath = path.join(OUTPUT_DIR, `${name}.vox`);
    writeVox(outPath, body.sizeX, body.sizeY, body.sizeZ, voxels, body.palette);
    console.log(`  Saved: ${outPath}`);
  }

  console.log('\nDone!');
}

main();
