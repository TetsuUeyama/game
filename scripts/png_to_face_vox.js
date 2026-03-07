/**
 * Convert a face PNG image to a .vox file for the CE body face surface.
 *
 * Usage: node scripts/png_to_face_vox.js <input.png> <output.vox> [multiplier]
 *
 * - input.png: Front-facing face photo (background auto-detected and removed)
 * - output.vox: Output vox file
 * - multiplier: Resolution multiplier (default: 4, meaning SCALE/4)
 *
 * The voxels are placed as a thin layer on the CE body face surface.
 * Grid is compact (face area only), rendered at SCALE/multiplier.
 */
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const args = process.argv.slice(2);
if (args.length < 2) {
  console.log('Usage: node scripts/png_to_face_vox.js <input.png> <output.vox> [multiplier]');
  process.exit(1);
}

const INPUT_PNG = args[0];
const OUTPUT_VOX = args[1];
const MULT = parseInt(args[2] || '4');

// CE body face area (in body grid coords, grid=85x34x102)
const FACE_X_MIN = 33, FACE_X_MAX = 47;  // 15 wide
const FACE_Z_MIN = 81, FACE_Z_MAX = 96;  // 16 tall
const FACE_W = FACE_X_MAX - FACE_X_MIN + 1;  // 15
const FACE_H = FACE_Z_MAX - FACE_Z_MIN + 1;  // 16

// Output grid dimensions
const GX = FACE_W * MULT;  // e.g. 60 at x4
const GZ = FACE_H * MULT;  // e.g. 64 at x4
const GY = 2;               // thin: 2 voxels deep (surface layer)

console.log(`Face area: body x=${FACE_X_MIN}-${FACE_X_MAX}, z=${FACE_Z_MIN}-${FACE_Z_MAX}`);
console.log(`Grid: ${GX}x${GY}x${GZ}, multiplier=${MULT}`);

function writeVox(filePath, sx, sy, sz, voxels, palette) {
  const sizeData = Buffer.alloc(12);
  sizeData.writeUInt32LE(sx, 0); sizeData.writeUInt32LE(sy, 4); sizeData.writeUInt32LE(sz, 8);
  const xyziData = Buffer.alloc(4 + voxels.length * 4);
  xyziData.writeUInt32LE(voxels.length, 0);
  for (let i = 0; i < voxels.length; i++) {
    const v = voxels[i];
    xyziData[4 + i * 4] = v.x; xyziData[4 + i * 4 + 1] = v.y;
    xyziData[4 + i * 4 + 2] = v.z; xyziData[4 + i * 4 + 3] = v.c;
  }
  const rgbaData = Buffer.alloc(1024);
  for (let i = 0; i < palette.length && i < 256; i++) {
    rgbaData[i * 4] = palette[i][0]; rgbaData[i * 4 + 1] = palette[i][1];
    rgbaData[i * 4 + 2] = palette[i][2]; rgbaData[i * 4 + 3] = 255;
  }
  function makeChunk(id, data) {
    const h = Buffer.alloc(12); h.write(id, 0, 4, 'ascii');
    h.writeUInt32LE(data.length, 4); h.writeUInt32LE(0, 8);
    return Buffer.concat([h, data]);
  }
  const children = Buffer.concat([makeChunk('SIZE', sizeData), makeChunk('XYZI', xyziData), makeChunk('RGBA', rgbaData)]);
  const mainH = Buffer.alloc(12); mainH.write('MAIN', 0, 4, 'ascii');
  mainH.writeUInt32LE(0, 4); mainH.writeUInt32LE(children.length, 8);
  const voxH = Buffer.alloc(8); voxH.write('VOX ', 0, 4, 'ascii'); voxH.writeUInt32LE(150, 4);
  fs.writeFileSync(filePath, Buffer.concat([voxH, mainH, children]));
}

(async () => {
  // Read PNG and resize to target grid dimensions
  const img = sharp(INPUT_PNG);
  const meta = await img.metadata();
  console.log(`Input: ${meta.width}x${meta.height}`);

  // Detect face region in the image:
  // 1. Get raw pixels
  const { data: rawData, info } = await img.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const imgW = info.width, imgH = info.height;

  // 2. Detect background color from corners
  const getPixel = (x, y) => {
    const i = (y * imgW + x) * 4;
    return [rawData[i], rawData[i + 1], rawData[i + 2], rawData[i + 3]];
  };
  const corners = [getPixel(2, 2), getPixel(imgW - 3, 2), getPixel(2, imgH - 3), getPixel(imgW - 3, imgH - 3)];
  const bgR = Math.round(corners.reduce((s, c) => s + c[0], 0) / 4);
  const bgG = Math.round(corners.reduce((s, c) => s + c[1], 0) / 4);
  const bgB = Math.round(corners.reduce((s, c) => s + c[2], 0) / 4);
  console.log(`Background color: RGB(${bgR},${bgG},${bgB})`);

  const isBg = (r, g, b, a) => {
    if (a < 128) return true;
    const dr = r - bgR, dg = g - bgG, db = b - bgB;
    return Math.sqrt(dr * dr + dg * dg + db * db) < 30;
  };

  // 3. Find face bounding box (non-background region)
  let fImgMinX = imgW, fImgMaxX = 0, fImgMinY = imgH, fImgMaxY = 0;
  for (let y = 0; y < imgH; y++) {
    for (let x = 0; x < imgW; x++) {
      const [r, g, b, a] = getPixel(x, y);
      if (!isBg(r, g, b, a)) {
        fImgMinX = Math.min(fImgMinX, x); fImgMaxX = Math.max(fImgMaxX, x);
        fImgMinY = Math.min(fImgMinY, y); fImgMaxY = Math.max(fImgMaxY, y);
      }
    }
  }
  console.log(`Face bbox in image: x=${fImgMinX}-${fImgMaxX}, y=${fImgMinY}-${fImgMaxY}`);

  // 4. Crop and resize to target grid
  const fImgW = fImgMaxX - fImgMinX + 1;
  const fImgH = fImgMaxY - fImgMinY + 1;
  const { data: faceData } = await sharp(INPUT_PNG)
    .extract({ left: fImgMinX, top: fImgMinY, width: fImgW, height: fImgH })
    .resize(GX, GZ, { fit: 'fill' })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  // 5. Build voxels and palette
  const colorMap = {};
  const palette = [];
  const voxels = [];

  for (let gz = 0; gz < GZ; gz++) {
    for (let gx = 0; gx < GX; gx++) {
      // Image y=0 is top = highest Z in voxel space
      const imgY = gz;
      const i = (imgY * GX + gx) * 4;
      const r = faceData[i], g = faceData[i + 1], b = faceData[i + 2], a = faceData[i + 3];
      if (isBg(r, g, b, a)) continue;

      // Quantize color to reduce palette size
      const qr = Math.round(r / 4) * 4, qg = Math.round(g / 4) * 4, qb = Math.round(b / 4) * 4;
      const cKey = `${qr},${qg},${qb}`;
      if (!(cKey in colorMap)) {
        if (palette.length >= 255) {
          // Find nearest existing color
          let bestI = 0, bestD = Infinity;
          for (let pi = 0; pi < palette.length; pi++) {
            const d = (palette[pi][0] - qr) ** 2 + (palette[pi][1] - qg) ** 2 + (palette[pi][2] - qb) ** 2;
            if (d < bestD) { bestD = d; bestI = pi; }
          }
          colorMap[cKey] = bestI + 1;
        } else {
          palette.push([qr, qg, qb]);
          colorMap[cKey] = palette.length;  // 1-indexed
        }
      }

      // voxel coords: x=left-right, y=depth(0=front), z=height(0=bottom)
      // Image top = high z (top of face), image bottom = low z
      const vz = GZ - 1 - gz;
      const vx = gx;
      // Place at y=0 (front surface)
      voxels.push({ x: vx, y: 0, z: vz, c: colorMap[cKey] });
      // Also y=1 for slight depth
      voxels.push({ x: vx, y: 1, z: vz, c: colorMap[cKey] });
    }
  }

  console.log(`Voxels: ${voxels.length}, Palette: ${palette.length} colors`);

  writeVox(OUTPUT_VOX, GX, GY, GZ, voxels, palette);
  console.log(`Written: ${OUTPUT_VOX}`);

  // Output positioning info for the viewer
  const SCALE = 0.01;
  const voxelSize = SCALE / MULT;
  const bodyCx = 85 / 2;  // CE body center X
  const bodyCy = 34 / 2;  // CE body center Y
  const faceCenterX = (FACE_X_MIN + FACE_X_MAX) / 2;  // 40
  const faceCenterZ = (FACE_Z_MIN + FACE_Z_MAX) / 2;  // 88.5
  // Compact grid center
  const gridCx = GX / 2;
  const gridCy = GY / 2;
  // Offset so compact grid center aligns with face center on body
  const offsetX = (faceCenterX - bodyCx) * SCALE;  // face center relative to body center
  const offsetY = faceCenterZ * SCALE;              // height (voxel Z -> Babylon Y, no centering)
  const offsetZ = -(0 - bodyCy) * SCALE + 0.004;   // front surface Y=0, + face float
  console.log(`\nViewer config:`);
  console.log(`  scale: SCALE / ${MULT}  (${voxelSize})`);
  console.log(`  offset: [${offsetX.toFixed(4)}, ${(offsetY - GZ/2 * voxelSize).toFixed(4)}, ${(offsetZ - gridCy * voxelSize).toFixed(4)}]`);
})();
