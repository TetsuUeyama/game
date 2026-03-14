/**
 * compute_hair_anchors.js
 *
 * 各キャラクターの body.vox と hair.vox を解析し、
 * ヘアスワップ用のアンカーポイント（頭頂部・前後左右）を自動計算して
 * hair_anchors.json として保存する。
 *
 * Usage: node scripts/compute_hair_anchors.js
 */

const fs = require('fs');
const path = require('path');

const VOX_BASE = 'C:/Users/user/developsecond/vox';

// ========================================================================
// VOX parser (Node.js Buffer version)
// ========================================================================

function parseVox(filePath) {
  const buf = fs.readFileSync(filePath);
  const magic = buf.toString('ascii', 0, 4);
  if (magic !== 'VOX ') throw new Error(`Not a VOX file: ${filePath}`);

  let offset = 8; // skip magic + version
  let sizeX = 0, sizeY = 0, sizeZ = 0;
  const voxels = [];

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
      const n = buf.readInt32LE(chunk.dataOffset);
      for (let i = 0; i < n; i++) {
        const base = chunk.dataOffset + 4 + i * 4;
        voxels.push({
          x: buf.readUInt8(base),
          y: buf.readUInt8(base + 1),
          z: buf.readUInt8(base + 2),
        });
      }
    }
    offset += 12 + chunk.contentSize + chunk.childrenSize;
  }

  return { sizeX, sizeY, sizeZ, voxels };
}

// ========================================================================
// Anchor computation
// ========================================================================

/**
 * Body の頭部表面5点を計算
 * vox座標系: X=左右, Y=前後, Z=上下（上が大きい）
 *
 * 5点:
 *   top   = Z最大のボクセル（頭頂）
 *   front = 頭部領域でY最小のボクセル（最前面）
 *   back  = 頭部領域でY最大のボクセル（最後面）
 *   left  = 頭部領域でX最小のボクセル（最左面）
 *   right = 頭部領域でX最大のボクセル（最右面）
 *
 * ワールド座標変換（buildVoxMeshと同じ）:
 *   wx = (vx - sizeX/2) * scale
 *   wy = vz * scale           (Z up)
 *   wz = -(vy - sizeY/2) * scale
 */
function computeBodyHeadAnchors(model, voxelSize) {
  const { sizeX, sizeY, voxels } = model;
  if (voxels.length === 0) return null;

  // Find Z range
  let maxZ = 0;
  for (const v of voxels) {
    if (v.z > maxZ) maxZ = v.z;
  }

  // Head region: top 12% of the model height
  const headMinZ = Math.floor(maxZ * 0.88);
  const headVoxels = voxels.filter(v => v.z >= headMinZ);
  if (headVoxels.length === 0) return null;

  // Find the 5 extreme surface voxels
  let topVoxel = headVoxels[0];
  let frontVoxel = headVoxels[0];
  let backVoxel = headVoxels[0];
  let leftVoxel = headVoxels[0];
  let rightVoxel = headVoxels[0];

  for (const v of headVoxels) {
    if (v.z > topVoxel.z) topVoxel = v;
    if (v.y < frontVoxel.y) frontVoxel = v;
    if (v.y > backVoxel.y) backVoxel = v;
    if (v.x < leftVoxel.x) leftVoxel = v;
    if (v.x > rightVoxel.x) rightVoxel = v;
  }

  const cx = sizeX / 2;
  const cy = sizeY / 2;

  function toWorld(vx, vy, vz) {
    return [
      (vx - cx) * voxelSize,
      vz * voxelSize,
      -(vy - cy) * voxelSize,
    ];
  }

  return {
    top: toWorld(topVoxel.x, topVoxel.y, topVoxel.z),
    front: toWorld(frontVoxel.x, frontVoxel.y, frontVoxel.z),
    back: toWorld(backVoxel.x, backVoxel.y, backVoxel.z),
    left: toWorld(leftVoxel.x, leftVoxel.y, leftVoxel.z),
    right: toWorld(rightVoxel.x, rightVoxel.y, rightVoxel.z),
    // width/depth from extreme voxels
    width: (rightVoxel.x - leftVoxel.x) * voxelSize,
    depth: (backVoxel.y - frontVoxel.y) * voxelSize,
  };
}

/**
 * Hair の内側接触面5点を計算
 *
 * Bodyの頭部表面5点それぞれに最も近いhairボクセルを探す。
 * これがhairの内側面（頭と接する面）の基準点になる。
 *
 * swap時はこの内側面点をターゲットbodyの表面点に合わせることで
 * 正しい位置・サイズにアライメントされる。
 */
function computeHairAnchors(hairModel, voxelSize, bodyHeadSurfaceVoxels) {
  const { sizeX, sizeY, voxels } = hairModel;
  if (voxels.length === 0 || !bodyHeadSurfaceVoxels) return null;

  const cx = sizeX / 2;
  const cy = sizeY / 2;

  // Find nearest hair voxel to each body surface point
  function findNearest(targetX, targetY, targetZ) {
    let best = null;
    let bestDist = Infinity;
    for (const v of voxels) {
      const dx = v.x - targetX;
      const dy = v.y - targetY;
      const dz = v.z - targetZ;
      const dist = dx * dx + dy * dy + dz * dz;
      if (dist < bestDist) {
        bestDist = dist;
        best = v;
      }
    }
    return best;
  }

  const topContact = findNearest(bodyHeadSurfaceVoxels.top.x, bodyHeadSurfaceVoxels.top.y, bodyHeadSurfaceVoxels.top.z);
  const frontContact = findNearest(bodyHeadSurfaceVoxels.front.x, bodyHeadSurfaceVoxels.front.y, bodyHeadSurfaceVoxels.front.z);
  const backContact = findNearest(bodyHeadSurfaceVoxels.back.x, bodyHeadSurfaceVoxels.back.y, bodyHeadSurfaceVoxels.back.z);
  const leftContact = findNearest(bodyHeadSurfaceVoxels.left.x, bodyHeadSurfaceVoxels.left.y, bodyHeadSurfaceVoxels.left.z);
  const rightContact = findNearest(bodyHeadSurfaceVoxels.right.x, bodyHeadSurfaceVoxels.right.y, bodyHeadSurfaceVoxels.right.z);

  if (!topContact || !frontContact || !backContact || !leftContact || !rightContact) return null;

  function toWorld(vx, vy, vz) {
    return [
      (vx - cx) * voxelSize,
      vz * voxelSize,
      -(vy - cy) * voxelSize,
    ];
  }

  return {
    top: toWorld(topContact.x, topContact.y, topContact.z),
    front: toWorld(frontContact.x, frontContact.y, frontContact.z),
    back: toWorld(backContact.x, backContact.y, backContact.z),
    left: toWorld(leftContact.x, leftContact.y, leftContact.z),
    right: toWorld(rightContact.x, rightContact.y, rightContact.z),
    width: (rightContact.x - leftContact.x) * voxelSize,
    depth: (backContact.y - frontContact.y) * voxelSize,
  };
}

// ========================================================================
// Main: process all characters
// ========================================================================

function findBodyVox(charDir) {
  const bodyDir = path.join(charDir, 'body');
  if (!fs.existsSync(bodyDir)) return null;
  const bodyFile = path.join(bodyDir, 'body.vox');
  if (fs.existsSync(bodyFile)) return bodyFile;
  return null;
}

function findHairVoxFiles(charDir, partsJson) {
  if (!partsJson) return [];
  const hairParts = partsJson.filter(
    p => p.category === 'hair' || (p.key && p.key.includes('hair') && p.key !== 'body_hair' && !p.is_body)
  );
  const result = [];
  for (const hp of hairParts) {
    // hp.file is like "/realistic-darkelf/hair/hair.vox"
    // We need to resolve it relative to the gender directory
    const genderDir = path.dirname(charDir);
    const fullPath = path.join(genderDir, hp.file);
    if (fs.existsSync(fullPath)) {
      result.push({ key: hp.key, file: fullPath, relFile: hp.file });
    }
  }
  return result;
}

function processCharacter(charDir) {
  const gridFile = path.join(charDir, 'grid.json');
  const partsFile = path.join(charDir, 'parts.json');

  if (!fs.existsSync(gridFile) || !fs.existsSync(partsFile)) return null;

  const grid = JSON.parse(fs.readFileSync(gridFile, 'utf8'));
  const partsJson = JSON.parse(fs.readFileSync(partsFile, 'utf8'));
  const voxelSize = grid.voxel_size;

  const result = { voxel_size: voxelSize };

  // Body head anchors + surface voxels (for hair contact computation)
  let bodyHeadSurfaceVoxels = null;
  const bodyVoxPath = findBodyVox(charDir);
  if (bodyVoxPath) {
    try {
      const bodyModel = parseVox(bodyVoxPath);
      const bodyAnchors = computeBodyHeadAnchors(bodyModel, voxelSize);
      if (bodyAnchors) {
        result.body_head = bodyAnchors;

        // Find the actual extreme voxels in vox coordinates (for hair contact search)
        let maxZ = 0;
        for (const v of bodyModel.voxels) {
          if (v.z > maxZ) maxZ = v.z;
        }
        const headMinZ = Math.floor(maxZ * 0.88);
        const headVoxels = bodyModel.voxels.filter(v => v.z >= headMinZ);

        let topV = headVoxels[0], frontV = headVoxels[0], backV = headVoxels[0], leftV = headVoxels[0], rightV = headVoxels[0];
        for (const v of headVoxels) {
          if (v.z > topV.z) topV = v;
          if (v.y < frontV.y) frontV = v;
          if (v.y > backV.y) backV = v;
          if (v.x < leftV.x) leftV = v;
          if (v.x > rightV.x) rightV = v;
        }
        bodyHeadSurfaceVoxels = { top: topV, front: frontV, back: backV, left: leftV, right: rightV };
      }
    } catch (e) {
      console.error(`  Error parsing body: ${e.message}`);
    }
  }

  // Hair anchors: find inner contact points closest to body surface
  const hairFiles = findHairVoxFiles(charDir, partsJson);
  if (hairFiles.length > 0) {
    result.hairs = {};
    for (const hf of hairFiles) {
      try {
        const hairModel = parseVox(hf.file);
        const hairAnchors = computeHairAnchors(hairModel, voxelSize, bodyHeadSurfaceVoxels);
        if (hairAnchors) {
          result.hairs[hf.key] = hairAnchors;
        }
      } catch (e) {
        console.error(`  Error parsing hair ${hf.key}: ${e.message}`);
      }
    }
  }

  return result;
}

// Process all characters
let totalProcessed = 0;
let totalGenerated = 0;

for (const gender of ['female', 'male']) {
  const genderDir = path.join(VOX_BASE, gender);
  if (!fs.existsSync(genderDir)) continue;

  console.log(`\n=== ${gender.toUpperCase()} ===`);

  for (const charName of fs.readdirSync(genderDir).sort()) {
    const charDir = path.join(genderDir, charName);
    if (!fs.statSync(charDir).isDirectory()) continue;

    const partsFile = path.join(charDir, 'parts.json');
    if (!fs.existsSync(partsFile)) continue;

    totalProcessed++;
    console.log(`Processing: ${gender}/${charName}`);

    const anchors = processCharacter(charDir);
    if (anchors && (anchors.body_head || (anchors.hairs && Object.keys(anchors.hairs).length > 0))) {
      const outFile = path.join(charDir, 'hair_anchors.json');
      fs.writeFileSync(outFile, JSON.stringify(anchors, null, 2));
      totalGenerated++;
      console.log(`  -> hair_anchors.json written`);
      if (anchors.body_head) {
        console.log(`     body head: width=${anchors.body_head.width.toFixed(4)}, depth=${anchors.body_head.depth.toFixed(4)}`);
      }
      if (anchors.hairs) {
        for (const [k, h] of Object.entries(anchors.hairs)) {
          console.log(`     hair "${k}": width=${h.width.toFixed(4)}, depth=${h.depth.toFixed(4)}`);
        }
      }
    } else {
      console.log(`  -> skipped (no body or hair)`);
    }
  }
}

console.log(`\nDone: ${totalGenerated}/${totalProcessed} characters processed.`);
