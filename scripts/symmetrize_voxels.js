/**
 * symmetrize_voxels.js — Phase 3-1: ボクセル左右対称化スクリプト
 *
 * 使い方:
 *   node scripts/symmetrize_voxels.js <input.vox> [options]
 *
 * オプション:
 *   --side left|right   基準にする側 (default: left = X小さい側)
 *   --output <path>     出力ファイルパス (default: <input>_sym.vox)
 *   --dry-run           実行せず差分のみ表示
 *
 * 処理:
 *   1. .vox ファイルを読み込み
 *   2. 中心X座標を計算
 *   3. 指定側のボクセルを基準として反対側にミラーコピー
 *   4. 中心線上のボクセルはそのまま保持
 *   5. 新しい .vox ファイルとして保存
 */

const fs = require('fs');
const path = require('path');

// ========================================================================
// VOX file parser / writer
// ========================================================================
function parseVox(buf) {
  const magic = buf.toString('ascii', 0, 4);
  if (magic !== 'VOX ') throw new Error('Not a valid .vox file');
  const version = buf.readInt32LE(4);

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

  return { sizeX, sizeY, sizeZ, voxels, palette, version };
}

function writeVox(outputPath, sizeX, sizeY, sizeZ, voxels, palette) {
  // Calculate chunk sizes
  const sizeContentSize = 12;
  const xyziContentSize = 4 + voxels.length * 4;
  const paletteContentSize = palette ? palette.length : 0;

  let childrenSize = (12 + sizeContentSize) + (12 + xyziContentSize);
  if (palette) childrenSize += 12 + paletteContentSize;

  const totalSize = 8 + 12 + childrenSize; // header + MAIN chunk header + children
  const buf = Buffer.alloc(totalSize);
  let off = 0;

  // Header
  buf.write('VOX ', off); off += 4;
  buf.writeInt32LE(200, off); off += 4;

  // MAIN chunk
  buf.write('MAIN', off); off += 4;
  buf.writeInt32LE(0, off); off += 4;
  buf.writeInt32LE(childrenSize, off); off += 4;

  // SIZE chunk
  buf.write('SIZE', off); off += 4;
  buf.writeInt32LE(sizeContentSize, off); off += 4;
  buf.writeInt32LE(0, off); off += 4;
  buf.writeInt32LE(sizeX, off); off += 4;
  buf.writeInt32LE(sizeY, off); off += 4;
  buf.writeInt32LE(sizeZ, off); off += 4;

  // XYZI chunk
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

  // RGBA chunk (palette)
  if (palette) {
    buf.write('RGBA', off); off += 4;
    buf.writeInt32LE(paletteContentSize, off); off += 4;
    buf.writeInt32LE(0, off); off += 4;
    palette.copy(buf, off); off += paletteContentSize;
  }

  fs.writeFileSync(outputPath, buf);
  return totalSize;
}

// ========================================================================
// Symmetrize logic
// ========================================================================
function symmetrize(voxels, sizeX, side, cxOffset = 0) {
  // Center X coordinate (with optional offset)
  const cx = (sizeX - 1) / 2 + cxOffset;
  const isLeft = side === 'left';

  // Separate voxels into: source side, center, opposite side
  const sourceVoxels = [];
  const centerVoxels = [];

  for (const v of voxels) {
    const distFromCenter = v.x - cx;
    if (Math.abs(distFromCenter) < 0.5) {
      // Center line voxel
      centerVoxels.push(v);
    } else if ((isLeft && v.x < cx) || (!isLeft && v.x > cx)) {
      // Source side
      sourceVoxels.push(v);
    }
    // Opposite side voxels are discarded
  }

  // Mirror source voxels to create the opposite side
  const mirroredVoxels = sourceVoxels.map(v => ({
    x: Math.round(2 * cx - v.x),
    y: v.y,
    z: v.z,
    colorIndex: v.colorIndex,
  }));

  // Combine: source + center + mirrored
  const result = [...sourceVoxels, ...centerVoxels, ...mirroredVoxels];

  // Deduplicate (in case of overlaps at center)
  const seen = new Set();
  const deduplicated = [];
  for (const v of result) {
    const key = `${v.x},${v.y},${v.z}`;
    if (!seen.has(key)) {
      seen.add(key);
      deduplicated.push(v);
    }
  }

  return deduplicated;
}

// ========================================================================
// Main
// ========================================================================
function main() {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.log('Usage: node symmetrize_voxels.js <input.vox> [--side left|right] [--output <path>] [--dry-run]');
    process.exit(1);
  }

  const inputPath = args[0];
  let side = 'left';
  let outputPath = null;
  let dryRun = false;
  let cxOffset = 0;

  for (let i = 1; i < args.length; i++) {
    if (args[i] === '--side' && args[i + 1]) {
      side = args[++i];
      if (side !== 'left' && side !== 'right') {
        console.error('--side must be "left" or "right"');
        process.exit(1);
      }
    } else if (args[i] === '--output' && args[i + 1]) {
      outputPath = args[++i];
    } else if (args[i] === '--cx-offset' && args[i + 1]) {
      cxOffset = parseFloat(args[++i]);
    } else if (args[i] === '--dry-run') {
      dryRun = true;
    }
  }

  if (!outputPath) {
    const ext = path.extname(inputPath);
    const base = inputPath.slice(0, -ext.length);
    outputPath = `${base}_sym${ext}`;
  }

  // Parse
  console.log(`Input: ${inputPath}`);
  const buf = fs.readFileSync(inputPath);
  const vox = parseVox(buf);
  console.log(`Size: ${vox.sizeX} x ${vox.sizeY} x ${vox.sizeZ}`);
  console.log(`Voxels: ${vox.voxels.length}`);
  console.log(`Source side: ${side} (X ${side === 'left' ? '< center' : '> center'})`);

  // Symmetrize
  if (cxOffset !== 0) {
    console.log(`Center offset: ${cxOffset}`);
  }
  const result = symmetrize(vox.voxels, vox.sizeX, side, cxOffset);

  const added = result.length - vox.voxels.length;
  console.log(`\nResult: ${result.length} voxels (${added >= 0 ? '+' : ''}${added})`);

  if (dryRun) {
    console.log('(dry-run: not writing output)');
    return;
  }

  // Write
  writeVox(outputPath, vox.sizeX, vox.sizeY, vox.sizeZ, result, vox.palette);
  console.log(`Output: ${outputPath}`);
}

main();
