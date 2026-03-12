/**
 * diff_body_apply.js — CE hires_sym をベースに target の色＋表面形状差分を反映
 *
 * 使い方:
 *   node scripts/diff_body_apply.js <target.vox> <target_grid.json> <output.vox>
 *
 * 処理:
 *   Phase 1: 色リマップ（CE ボクセル位置そのまま、target の色を反映）
 *   Phase 2: 表面削除（CE 表面ボクセルで target に対応なし → 削除）
 *   Phase 3: 表面追加（target にあり CE にない、かつ CE 表面に隣接 → 追加）
 *   ※ 内部ボクセルは一切触らない → 断面なし
 */

const fs = require('fs');
const path = require('path');

const BASE = path.resolve(__dirname, '..');
const CE_GRID = path.join(BASE, 'public/box2/cyberpunk_elf_body_base_hires_grid.json');
const CE_SYM = path.join(BASE, 'public/box2/cyberpunk_elf_body_base_hires_sym.vox');

const DIRS6 = [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]];

// ========================================================================
// VOX parser / writer
// ========================================================================
function parseVox(buf) {
  const magic = buf.toString('ascii', 0, 4);
  if (magic !== 'VOX ') throw new Error('Not a valid .vox file');
  let offset = 8;
  let sizeX = 0, sizeY = 0, sizeZ = 0;
  const voxels = [];
  let palette = null;
  function readChunk(off) {
    return {
      id: buf.toString('ascii', off, off + 4),
      contentSize: buf.readInt32LE(off + 4),
      childrenSize: buf.readInt32LE(off + 8),
      dataOffset: off + 12,
    };
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
      const n = buf.readInt32LE(chunk.dataOffset);
      for (let i = 0; i < n; i++) {
        const b = chunk.dataOffset + 4 + i * 4;
        voxels.push({ x: buf.readUInt8(b), y: buf.readUInt8(b+1), z: buf.readUInt8(b+2), colorIndex: buf.readUInt8(b+3) });
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
  const sizeCS = 12, xyziCS = 4 + voxels.length * 4, palCS = palette ? palette.length : 0;
  let childrenSize = (12+sizeCS) + (12+xyziCS);
  if (palette) childrenSize += 12 + palCS;
  const buf = Buffer.alloc(8 + 12 + childrenSize);
  let o = 0;
  buf.write('VOX ', o); o += 4; buf.writeInt32LE(200, o); o += 4;
  buf.write('MAIN', o); o += 4; buf.writeInt32LE(0, o); o += 4; buf.writeInt32LE(childrenSize, o); o += 4;
  buf.write('SIZE', o); o += 4; buf.writeInt32LE(sizeCS, o); o += 4; buf.writeInt32LE(0, o); o += 4;
  buf.writeInt32LE(sizeX, o); o += 4; buf.writeInt32LE(sizeY, o); o += 4; buf.writeInt32LE(sizeZ, o); o += 4;
  buf.write('XYZI', o); o += 4; buf.writeInt32LE(xyziCS, o); o += 4; buf.writeInt32LE(0, o); o += 4;
  buf.writeInt32LE(voxels.length, o); o += 4;
  for (const v of voxels) { buf.writeUInt8(v.x, o++); buf.writeUInt8(v.y, o++); buf.writeUInt8(v.z, o++); buf.writeUInt8(v.colorIndex, o++); }
  if (palette) { buf.write('RGBA', o); o += 4; buf.writeInt32LE(palCS, o); o += 4; buf.writeInt32LE(0, o); o += 4; palette.copy(buf, o); }
  fs.writeFileSync(outputPath, buf);
}

// ========================================================================
// Helpers
// ========================================================================
function getPaletteColor(palette, ci) {
  const idx = (ci - 1) * 4;
  if (!palette || idx < 0 || idx + 3 > palette.length) return [128, 128, 128];
  return [palette[idx], palette[idx+1], palette[idx+2]];
}

function findClosestPaletteIndex(palette, r, g, b) {
  let bestDist = Infinity, bestIdx = 1;
  const count = Math.min(255, palette.length / 4);
  for (let i = 0; i < count; i++) {
    const d = (palette[i*4]-r)**2 + (palette[i*4+1]-g)**2 + (palette[i*4+2]-b)**2;
    if (d < bestDist) { bestDist = d; bestIdx = i + 1; }
  }
  return bestIdx;
}

function computeAlignment(voxels) {
  let sx = 0, sy = 0, minZ = Infinity, maxZ = -Infinity;
  for (const v of voxels) {
    sx += v.x; sy += v.y;
    if (v.z < minZ) minZ = v.z;
    if (v.z > maxZ) maxZ = v.z;
  }
  const n = voxels.length;
  return { cx: sx / n, cy: sy / n, minZ, maxZ, height: maxZ - minZ };
}

function k(x, y, z) { return `${x},${y},${z}`; }

/** CE pos → target pos */
function ceToTarget(x, y, z, ceAlign, tgAlign, xyScale, zScale) {
  return [
    Math.round(tgAlign.cx + (x - ceAlign.cx) / xyScale),
    Math.round(tgAlign.cy + (y - ceAlign.cy) / xyScale),
    Math.round(tgAlign.minZ + (z - ceAlign.minZ) / zScale),
  ];
}

/** target pos → CE pos */
function targetToCe(x, y, z, ceAlign, tgAlign, xyScale, zScale) {
  return [
    Math.round(ceAlign.cx + (x - tgAlign.cx) * xyScale),
    Math.round(ceAlign.cy + (y - tgAlign.cy) * xyScale),
    Math.round(ceAlign.minZ + (z - tgAlign.minZ) * zScale),
  ];
}

/** Search target color at (tx,ty,tz), fallback to nearest within R */
function findTargetColor(tx, ty, tz, targetColorMap, R) {
  const exact = targetColorMap.get(k(tx, ty, tz));
  if (exact) return exact;
  let bestDist = Infinity, bestColor = null;
  for (let dz = -R; dz <= R; dz++)
    for (let dx = -R; dx <= R; dx++)
      for (let dy = -R; dy <= R; dy++) {
        const c = targetColorMap.get(k(tx+dx, ty+dy, tz+dz));
        if (c) { const d = dx*dx+dy*dy+dz*dz; if (d < bestDist) { bestDist = d; bestColor = c; } }
      }
  return bestColor;
}

// ========================================================================
// Main
// ========================================================================
function main() {
  const args = process.argv.slice(2);
  if (args.length < 3) {
    console.log('Usage: node diff_body_apply.js <target.vox> <target_grid.json> <output.vox>');
    process.exit(1);
  }

  const targetVoxPath = args[0];
  const targetGridPath = args[1];
  const outputPath = args[2];

  // Load
  console.log('Loading CE hires_sym...');
  const symVox = parseVox(fs.readFileSync(CE_SYM));
  const ceGrid = JSON.parse(fs.readFileSync(CE_GRID, 'utf8'));
  console.log(`  CE: ${symVox.sizeX}x${symVox.sizeY}x${symVox.sizeZ}, ${symVox.voxels.length} voxels`);

  console.log(`Loading target: ${targetVoxPath}`);
  const targetVox = parseVox(fs.readFileSync(targetVoxPath));
  const tgGrid = JSON.parse(fs.readFileSync(targetGridPath, 'utf8'));
  console.log(`  Target: ${targetVox.sizeX}x${targetVox.sizeY}x${targetVox.sizeZ}, ${targetVox.voxels.length} voxels`);

  // Alignment
  const ceAlign = computeAlignment(symVox.voxels);
  const tgAlign = computeAlignment(targetVox.voxels);
  const zScale = ceAlign.height / tgAlign.height;
  const xyScale = tgGrid.voxel_size / ceGrid.voxel_size;

  console.log(`\nAlignment:`);
  console.log(`  CE:     cx=${ceAlign.cx.toFixed(1)} cy=${ceAlign.cy.toFixed(1)} minZ=${ceAlign.minZ} h=${ceAlign.height}`);
  console.log(`  Target: cx=${tgAlign.cx.toFixed(1)} cy=${tgAlign.cy.toFixed(1)} minZ=${tgAlign.minZ} h=${tgAlign.height}`);
  console.log(`  Z scale: ${zScale.toFixed(4)}, XY scale: ${xyScale.toFixed(4)}`);

  // Build target color map (target grid space)
  const targetColorMap = new Map();
  const targetPosSet = new Set();
  for (const v of targetVox.voxels) {
    const key = k(v.x, v.y, v.z);
    targetColorMap.set(key, getPaletteColor(targetVox.palette, v.colorIndex));
    targetPosSet.add(key);
  }

  // Build target position set in CE grid space
  const targetInCeSpace = new Set();
  for (const v of targetVox.voxels) {
    const [cx, cy, cz] = targetToCe(v.x, v.y, v.z, ceAlign, tgAlign, xyScale, zScale);
    targetInCeSpace.add(k(cx, cy, cz));
  }

  // ================================================================
  // Phase 1: Color remap (all CE voxels keep position, get target color)
  // ================================================================
  console.log('\n--- Phase 1: Color remap ---');
  const resultMap = new Map(); // key → { x, y, z, colorIndex }
  const cePositions = new Set();
  let recolored = 0, keptColor = 0;

  for (const v of symVox.voxels) {
    const key = k(v.x, v.y, v.z);
    cePositions.add(key);

    const [tx, ty, tz] = ceToTarget(v.x, v.y, v.z, ceAlign, tgAlign, xyScale, zScale);
    const targetColor = findTargetColor(tx, ty, tz, targetColorMap, 2);

    if (targetColor) {
      const ci = findClosestPaletteIndex(symVox.palette, targetColor[0], targetColor[1], targetColor[2]);
      resultMap.set(key, { x: v.x, y: v.y, z: v.z, colorIndex: ci });
      recolored++;
    } else {
      resultMap.set(key, { x: v.x, y: v.y, z: v.z, colorIndex: v.colorIndex });
      keptColor++;
    }
  }
  console.log(`  Recolored: ${recolored} (${(recolored/symVox.voxels.length*100).toFixed(1)}%)`);
  console.log(`  Kept CE color: ${keptColor}`);

  // ================================================================
  // Phase 2: Surface removal
  //   CE 表面ボクセルで、target（CE空間）に対応がない → 削除
  //   表面 = 6方向隣接のうち少なくとも1つが空きセル
  // ================================================================
  console.log('\n--- Phase 2: Surface removal ---');
  let surfaceCount = 0, removedCount = 0;

  // Identify surface voxels
  const surfaceKeys = [];
  for (const key of cePositions) {
    const [x, y, z] = key.split(',').map(Number);
    let isSurface = false;
    for (const [dx, dy, dz] of DIRS6) {
      if (!cePositions.has(k(x+dx, y+dy, z+dz))) { isSurface = true; break; }
    }
    if (isSurface) surfaceKeys.push(key);
  }
  surfaceCount = surfaceKeys.length;

  // Remove surface voxels that have no target correspondence
  for (const key of surfaceKeys) {
    if (!targetInCeSpace.has(key)) {
      // Also check neighbors — if ANY neighbor in target space, keep it (tolerance)
      const [x, y, z] = key.split(',').map(Number);
      let nearbyTarget = false;
      for (const [dx, dy, dz] of DIRS6) {
        if (targetInCeSpace.has(k(x+dx, y+dy, z+dz))) { nearbyTarget = true; break; }
      }
      if (!nearbyTarget) {
        resultMap.delete(key);
        cePositions.delete(key);
        removedCount++;
      }
    }
  }
  console.log(`  Surface voxels: ${surfaceCount}`);
  console.log(`  Removed: ${removedCount}`);

  // ================================================================
  // Phase 3: Surface addition
  //   target（CE空間）にあるが CE にない、かつ CE 表面に隣接 → 追加
  // ================================================================
  console.log('\n--- Phase 3: Surface addition ---');
  let addedCount = 0;

  // Re-detect surface after removals
  const currentSurface = new Set();
  for (const key of cePositions) {
    const [x, y, z] = key.split(',').map(Number);
    for (const [dx, dy, dz] of DIRS6) {
      if (!cePositions.has(k(x+dx, y+dy, z+dz))) { currentSurface.add(key); break; }
    }
  }

  // Candidate positions: empty cells adjacent to current CE surface
  const candidates = new Set();
  for (const skey of currentSurface) {
    const [x, y, z] = skey.split(',').map(Number);
    for (const [dx, dy, dz] of DIRS6) {
      const nk = k(x+dx, y+dy, z+dz);
      if (!cePositions.has(nk)) candidates.add(nk);
    }
  }

  // Add candidates that exist in target space
  for (const cand of candidates) {
    if (targetInCeSpace.has(cand)) {
      const [x, y, z] = cand.split(',').map(Number);
      // Bounds check
      if (x < 0 || x >= symVox.sizeX || y < 0 || y >= symVox.sizeY || z < 0 || z >= symVox.sizeZ) continue;

      // Get color from target
      const [tx, ty, tz] = ceToTarget(x, y, z, ceAlign, tgAlign, xyScale, zScale);
      const targetColor = findTargetColor(tx, ty, tz, targetColorMap, 2);

      let ci;
      if (targetColor) {
        ci = findClosestPaletteIndex(symVox.palette, targetColor[0], targetColor[1], targetColor[2]);
      } else {
        // Fallback: use nearest existing voxel's color
        let bestCI = 1, bestDist = Infinity;
        for (const [dx, dy, dz] of DIRS6) {
          const nv = resultMap.get(k(x+dx, y+dy, z+dz));
          if (nv) { bestCI = nv.colorIndex; break; }
        }
        ci = bestCI;
      }

      resultMap.set(cand, { x, y, z, colorIndex: ci });
      cePositions.add(cand);
      addedCount++;
    }
  }
  console.log(`  Candidates checked: ${candidates.size}`);
  console.log(`  Added: ${addedCount}`);

  // ================================================================
  // Summary & Write
  // ================================================================
  const resultVoxels = Array.from(resultMap.values());
  const delta = resultVoxels.length - symVox.voxels.length;
  console.log(`\nResult: ${resultVoxels.length} voxels (CE was ${symVox.voxels.length}, delta ${delta >= 0 ? '+' : ''}${delta})`);

  writeVox(outputPath, symVox.sizeX, symVox.sizeY, symVox.sizeZ, resultVoxels, symVox.palette);
  console.log(`Output: ${outputPath}`);
}

main();
