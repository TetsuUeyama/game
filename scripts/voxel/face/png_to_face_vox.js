/**
 * png_to_face_vox.js
 *
 * 顔のPNG画像をCEボディの顔表面用.voxファイルに変換するスクリプト。
 *
 * Usage: node scripts/png_to_face_vox.js <input.png> <output.vox> [multiplier]
 *
 * - input.png: 正面向きの顔写真（背景は自動検出・除去）
 * - output.vox: 出力voxファイル
 * - multiplier: 解像度倍率（デフォルト: 4、SCALE/4の意味）
 *
 * ボクセルはCEボディの顔表面に薄いレイヤーとして配置される。
 * グリッドはコンパクト（顔エリアのみ）、SCALE/multiplierでレンダリング。
 */
// ファイルシステムモジュール
const fs = require('fs');
// パス操作モジュール
const path = require('path');
// 画像処理ライブラリ（リサイズ・クロップ・ピクセル操作）
const sharp = require('sharp');

// コマンドライン引数を取得
const args = process.argv.slice(2);
// 引数が不足していればUsageを表示して終了
if (args.length < 2) {
  console.log('Usage: node scripts/png_to_face_vox.js <input.png> <output.vox> [multiplier]');
  process.exit(1);
}

// 入力PNG、出力VOX、解像度倍率
const INPUT_PNG = args[0];
const OUTPUT_VOX = args[1];
const MULT = parseInt(args[2] || '4');  // デフォルト4倍

// CEボディの顔エリア（ボディグリッド座標、grid=85x34x102）
const FACE_X_MIN = 33, FACE_X_MAX = 47;  // 幅15ボクセル
const FACE_Z_MIN = 81, FACE_Z_MAX = 96;  // 高さ16ボクセル
const FACE_W = FACE_X_MAX - FACE_X_MIN + 1;  // 15
const FACE_H = FACE_Z_MAX - FACE_Z_MIN + 1;  // 16

// 出力グリッドサイズ（顔エリア × 解像度倍率）
const GX = FACE_W * MULT;  // 例: 60（4倍時）
const GZ = FACE_H * MULT;  // 例: 64（4倍時）
const GY = 2;               // 薄い: 2ボクセル厚（表面レイヤー）

console.log(`Face area: body x=${FACE_X_MIN}-${FACE_X_MAX}, z=${FACE_Z_MIN}-${FACE_Z_MAX}`);
console.log(`Grid: ${GX}x${GY}x${GZ}, multiplier=${MULT}`);

// ボクセルデータをVOXファイルとして書き出す関数
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

// メイン処理（非同期）
(async () => {
  // PNGを読み込んでメタデータを取得
  const img = sharp(INPUT_PNG);
  const meta = await img.metadata();
  console.log(`Input: ${meta.width}x${meta.height}`);

  // 画像内の顔領域を検出:
  // 1. 生ピクセルデータを取得（アルファチャンネル付き）
  const { data: rawData, info } = await img.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const imgW = info.width, imgH = info.height;

  // 2. 四隅のピクセルから背景色を自動検出
  const getPixel = (x, y) => {
    const i = (y * imgW + x) * 4;
    return [rawData[i], rawData[i + 1], rawData[i + 2], rawData[i + 3]];
  };
  // 四隅のピクセルを取得
  const corners = [getPixel(2, 2), getPixel(imgW - 3, 2), getPixel(2, imgH - 3), getPixel(imgW - 3, imgH - 3)];
  // 四隅の平均RGB値を背景色とする
  const bgR = Math.round(corners.reduce((s, c) => s + c[0], 0) / 4);
  const bgG = Math.round(corners.reduce((s, c) => s + c[1], 0) / 4);
  const bgB = Math.round(corners.reduce((s, c) => s + c[2], 0) / 4);
  console.log(`Background color: RGB(${bgR},${bgG},${bgB})`);

  // 背景色判定関数（アルファ<128 or 色差<30で背景と判定）
  const isBg = (r, g, b, a) => {
    if (a < 128) return true;
    const dr = r - bgR, dg = g - bgG, db = b - bgB;
    return Math.sqrt(dr * dr + dg * dg + db * db) < 30;
  };

  // 3. 非背景領域のバウンディングボックスを検出（顔の範囲）
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

  // 4. 顔領域をクロップしてターゲットグリッドサイズにリサイズ
  const fImgW = fImgMaxX - fImgMinX + 1;
  const fImgH = fImgMaxY - fImgMinY + 1;
  const { data: faceData } = await sharp(INPUT_PNG)
    .extract({ left: fImgMinX, top: fImgMinY, width: fImgW, height: fImgH })
    .resize(GX, GZ, { fit: 'fill' })  // ターゲットグリッドサイズにフィル
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  // 5. ボクセルとパレットを構築
  const colorMap = {};    // 量子化カラーキー → パレットインデックス
  const palette = [];     // カラーパレット
  const voxels = [];      // ボクセルリスト

  for (let gz = 0; gz < GZ; gz++) {
    for (let gx = 0; gx < GX; gx++) {
      // 画像のy=0が上 = ボクセル空間のZ最大値
      const imgY = gz;
      const i = (imgY * GX + gx) * 4;
      const r = faceData[i], g = faceData[i + 1], b = faceData[i + 2], a = faceData[i + 3];
      // 背景ピクセルはスキップ
      if (isBg(r, g, b, a)) continue;

      // パレットサイズを抑えるため色を4刻みに量子化
      const qr = Math.round(r / 4) * 4, qg = Math.round(g / 4) * 4, qb = Math.round(b / 4) * 4;
      const cKey = `${qr},${qg},${qb}`;
      if (!(cKey in colorMap)) {
        if (palette.length >= 255) {
          // パレット上限に達した場合、最寄りの既存色を使用
          let bestI = 0, bestD = Infinity;
          for (let pi = 0; pi < palette.length; pi++) {
            const d = (palette[pi][0] - qr) ** 2 + (palette[pi][1] - qg) ** 2 + (palette[pi][2] - qb) ** 2;
            if (d < bestD) { bestD = d; bestI = pi; }
          }
          colorMap[cKey] = bestI + 1;
        } else {
          // 新しい色をパレットに追加（1インデックス）
          palette.push([qr, qg, qb]);
          colorMap[cKey] = palette.length;
        }
      }

      // ボクセル座標: x=左右, y=奥行き(0=前面), z=高さ(0=底)
      // 画像の上 = 高いz（顔の上部）、画像の下 = 低いz
      const vz = GZ - 1 - gz;  // 画像Y→ボクセルZ（上下反転）
      const vx = gx;
      // y=0（前面表面）に配置
      voxels.push({ x: vx, y: 0, z: vz, c: colorMap[cKey] });
      // y=1にも配置（若干の厚みを持たせる）
      voxels.push({ x: vx, y: 1, z: vz, c: colorMap[cKey] });
    }
  }

  console.log(`Voxels: ${voxels.length}, Palette: ${palette.length} colors`);

  // VOXファイルとして書き出し
  writeVox(OUTPUT_VOX, GX, GY, GZ, voxels, palette);
  console.log(`Written: ${OUTPUT_VOX}`);

  // ビューア用の配置情報を出力
  const SCALE = 0.01;
  const voxelSize = SCALE / MULT;                         // 1ボクセルのワールドサイズ
  const bodyCx = 85 / 2;                                  // CEボディのX中心
  const bodyCy = 34 / 2;                                  // CEボディのY中心
  const faceCenterX = (FACE_X_MIN + FACE_X_MAX) / 2;      // 顔中心X (40)
  const faceCenterZ = (FACE_Z_MIN + FACE_Z_MAX) / 2;      // 顔中心Z (88.5)
  // コンパクトグリッドの中心
  const gridCx = GX / 2;
  const gridCy = GY / 2;
  // コンパクトグリッド中心がボディ上の顔中心に合うようにオフセット計算
  const offsetX = (faceCenterX - bodyCx) * SCALE;          // 顔中心のボディ中心からの相対位置
  const offsetY = faceCenterZ * SCALE;                      // 高さ（ボクセルZ→BabylonのY、中心化なし）
  const offsetZ = -(0 - bodyCy) * SCALE + 0.004;           // 前面表面Y=0 + 顔の浮き量
  console.log(`\nViewer config:`);
  console.log(`  scale: SCALE / ${MULT}  (${voxelSize})`);
  console.log(`  offset: [${offsetX.toFixed(4)}, ${(offsetY - GZ/2 * voxelSize).toFixed(4)}, ${(offsetZ - gridCy * voxelSize).toFixed(4)}]`);
})();
