/**
 * symmetrize_voxels.js — ボクセル左右対称化スクリプト
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

// ファイルシステムモジュール
const fs = require('fs');
// パス操作モジュール
const path = require('path');

// ========================================================================
// VOXファイルパーサー/ライター
// ========================================================================
// VOXファイルをパースする関数
function parseVox(buf) {
  // マジックナンバー確認
  const magic = buf.toString('ascii', 0, 4);
  if (magic !== 'VOX ') throw new Error('Not a valid .vox file');
  // バージョン番号
  const version = buf.readInt32LE(4);

  let offset = 8;
  let sizeX = 0, sizeY = 0, sizeZ = 0;
  const voxels = [];
  let palette = null;

  // チャンクヘッダーを読み取る関数
  function readChunk(off) {
    const id = buf.toString('ascii', off, off + 4);
    const contentSize = buf.readInt32LE(off + 4);
    const childrenSize = buf.readInt32LE(off + 8);
    return { id, contentSize, childrenSize, dataOffset: off + 12 };
  }

  // MAINチャンクを処理
  const main = readChunk(offset);
  offset += 12;
  const end = offset + main.childrenSize;

  // 子チャンクを走査
  while (offset < end) {
    const chunk = readChunk(offset);
    // SIZEチャンク: グリッドサイズ
    if (chunk.id === 'SIZE') {
      sizeX = buf.readInt32LE(chunk.dataOffset);
      sizeY = buf.readInt32LE(chunk.dataOffset + 4);
      sizeZ = buf.readInt32LE(chunk.dataOffset + 8);
    // XYZIチャンク: ボクセルデータ
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
    // RGBAチャンク: パレット（生バイトとして保持）
    } else if (chunk.id === 'RGBA') {
      palette = Buffer.alloc(chunk.contentSize);
      buf.copy(palette, 0, chunk.dataOffset, chunk.dataOffset + chunk.contentSize);
    }
    offset += 12 + chunk.contentSize + chunk.childrenSize;
  }

  return { sizeX, sizeY, sizeZ, voxels, palette, version };
}

// VOXファイルを書き出す関数
function writeVox(outputPath, sizeX, sizeY, sizeZ, voxels, palette) {
  // 各チャンクのサイズを計算
  const sizeContentSize = 12;
  const xyziContentSize = 4 + voxels.length * 4;
  const paletteContentSize = palette ? palette.length : 0;

  // 子チャンク合計サイズ
  let childrenSize = (12 + sizeContentSize) + (12 + xyziContentSize);
  if (palette) childrenSize += 12 + paletteContentSize;

  // バッファ全体のサイズ
  const totalSize = 8 + 12 + childrenSize;
  const buf = Buffer.alloc(totalSize);
  let off = 0;

  // VOXヘッダー（マジックナンバー + バージョン）
  buf.write('VOX ', off); off += 4;
  buf.writeInt32LE(200, off); off += 4;

  // MAINチャンクヘッダー
  buf.write('MAIN', off); off += 4;
  buf.writeInt32LE(0, off); off += 4;
  buf.writeInt32LE(childrenSize, off); off += 4;

  // SIZEチャンク
  buf.write('SIZE', off); off += 4;
  buf.writeInt32LE(sizeContentSize, off); off += 4;
  buf.writeInt32LE(0, off); off += 4;
  buf.writeInt32LE(sizeX, off); off += 4;
  buf.writeInt32LE(sizeY, off); off += 4;
  buf.writeInt32LE(sizeZ, off); off += 4;

  // XYZIチャンク
  buf.write('XYZI', off); off += 4;
  buf.writeInt32LE(xyziContentSize, off); off += 4;
  buf.writeInt32LE(0, off); off += 4;
  buf.writeInt32LE(voxels.length, off); off += 4;
  // 各ボクセルを書き込み
  for (const v of voxels) {
    buf.writeUInt8(v.x, off++);
    buf.writeUInt8(v.y, off++);
    buf.writeUInt8(v.z, off++);
    buf.writeUInt8(v.colorIndex, off++);
  }

  // RGBAチャンク（パレットがある場合）
  if (palette) {
    buf.write('RGBA', off); off += 4;
    buf.writeInt32LE(paletteContentSize, off); off += 4;
    buf.writeInt32LE(0, off); off += 4;
    palette.copy(buf, off); off += paletteContentSize;
  }

  // ファイルに書き出し
  fs.writeFileSync(outputPath, buf);
  return totalSize;
}

// ========================================================================
// 対称化ロジック
// ========================================================================
// ボクセルを左右対称にする関数
function symmetrize(voxels, sizeX, side, cxOffset = 0) {
  // X方向の中心座標（オプションのオフセット付き）
  const cx = (sizeX - 1) / 2 + cxOffset;
  // 基準側がleftかどうか
  const isLeft = side === 'left';

  // ボクセルを分類: 基準側、中心線、反対側
  const sourceVoxels = [];  // 基準側のボクセル
  const centerVoxels = [];  // 中心線上のボクセル

  for (const v of voxels) {
    const distFromCenter = v.x - cx;
    if (Math.abs(distFromCenter) < 0.5) {
      // 中心線上のボクセル → そのまま保持
      centerVoxels.push(v);
    } else if ((isLeft && v.x < cx) || (!isLeft && v.x > cx)) {
      // 基準側のボクセル
      sourceVoxels.push(v);
    }
    // 反対側のボクセルは破棄される
  }

  // 基準側のボクセルをミラーコピーして反対側を生成
  const mirroredVoxels = sourceVoxels.map(v => ({
    x: Math.round(2 * cx - v.x),  // X座標を中心を軸にミラー
    y: v.y,
    z: v.z,
    colorIndex: v.colorIndex,      // 色はそのまま
  }));

  // 結合: 基準側 + 中心線 + ミラー
  const result = [...sourceVoxels, ...centerVoxels, ...mirroredVoxels];

  // 重複排除（中心付近での重なりを防止）
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
// メイン処理
// ========================================================================
function main() {
  // コマンドライン引数を取得
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.log('Usage: node symmetrize_voxels.js <input.vox> [--side left|right] [--output <path>] [--dry-run]');
    process.exit(1);
  }

  // 入力パスとオプションを解析
  const inputPath = args[0];
  let side = 'left';         // デフォルト: 左側が基準
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

  // 出力パスが未指定の場合、_symサフィックスを付加
  if (!outputPath) {
    const ext = path.extname(inputPath);
    const base = inputPath.slice(0, -ext.length);
    outputPath = `${base}_sym${ext}`;
  }

  // VOXファイルを読み込み
  console.log(`Input: ${inputPath}`);
  const buf = fs.readFileSync(inputPath);
  const vox = parseVox(buf);
  console.log(`Size: ${vox.sizeX} x ${vox.sizeY} x ${vox.sizeZ}`);
  console.log(`Voxels: ${vox.voxels.length}`);
  console.log(`Source side: ${side} (X ${side === 'left' ? '< center' : '> center'})`);

  // 対称化を実行
  if (cxOffset !== 0) {
    console.log(`Center offset: ${cxOffset}`);
  }
  const result = symmetrize(vox.voxels, vox.sizeX, side, cxOffset);

  // 結果を表示
  const added = result.length - vox.voxels.length;
  console.log(`\nResult: ${result.length} voxels (${added >= 0 ? '+' : ''}${added})`);

  // ドライランの場合は書き込まない
  if (dryRun) {
    console.log('(dry-run: not writing output)');
    return;
  }

  // VOXファイルとして書き出し
  writeVox(outputPath, vox.sizeX, vox.sizeY, vox.sizeZ, result, vox.palette);
  console.log(`Output: ${outputPath}`);
}

// メイン関数を実行
main();
