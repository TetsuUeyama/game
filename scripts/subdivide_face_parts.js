/**
 * subdivide_face_parts.js
 *
 * 低解像度の顔パーツを2x2x2の細かいボクセルに分割するスクリプト。
 * 各元ボクセルが同じ色の8個のサブボクセルに変換される。
 * グリッドサイズは2倍になり、SCALEを半分にすることで同じ物理サイズを維持。
 *
 * Usage: node scripts/subdivide_face_parts.js
 */
// ファイルシステムモジュール
const fs = require('fs');
// パス操作モジュール
const path = require('path');

// VOXファイルを読み込んでパースする関数
function readVox(filePath) {
  // ファイルをバイナリとして読み込み
  const buf = fs.readFileSync(filePath);
  let off = 0;
  // 4バイト符号なし整数（リトルエンディアン）を読み取り
  const readU32 = () => { const v = buf.readUInt32LE(off); off += 4; return v; };
  // 1バイト符号なし整数を読み取り
  const readU8 = () => buf[off++];
  // nバイトのASCII文字列を読み取り
  const readStr = (n) => { let s = ''; for (let i = 0; i < n; i++) s += String.fromCharCode(buf[off + i]); off += n; return s; };
  // マジックナンバー確認
  if (readStr(4) !== 'VOX ') throw new Error('Not VOX');
  // バージョン番号をスキップ
  readU32();
  // MAINチャンクヘッダーを確認
  if (readStr(4) !== 'MAIN') throw new Error('No MAIN');
  // MAINチャンクのコンテンツサイズと子チャンクサイズを読み取り
  const mc = readU32(); const mcc = readU32(); off += mc;
  // データ終端位置を計算
  const end = off + mcc;
  // モデルサイズの初期化
  let sx = 0, sy = 0, sz = 0;
  // ボクセルとパレットの配列
  const voxels = []; let palette = null;
  // 全子チャンクを処理
  while (off < end) {
    // チャンクヘッダーを読み取り（ID、コンテンツサイズ、子チャンクサイズ）
    const id = readStr(4); const cs = readU32(); readU32(); const ce = off + cs;
    // SIZEチャンク: モデルサイズを取得
    if (id === 'SIZE') { sx = readU32(); sy = readU32(); sz = readU32(); }
    // XYZIチャンク: ボクセル座標とカラーインデックスを取得
    else if (id === 'XYZI') { const n = readU32(); for (let i = 0; i < n; i++) voxels.push({ x: readU8(), y: readU8(), z: readU8(), c: readU8() }); }
    // RGBAチャンク: カラーパレット（256色）を取得
    else if (id === 'RGBA') { palette = []; for (let i = 0; i < 256; i++) palette.push({ r: readU8(), g: readU8(), b: readU8(), a: readU8() }); }
    // 次のチャンクへ移動
    off = ce;
  }
  // パース結果を返す
  return { sx, sy, sz, voxels, palette };
}

// ボクセルデータをVOXファイルとして書き出す関数
function writeVox(filePath, sx, sy, sz, voxels, palette) {
  // SIZEチャンクのデータバッファ（12バイト: X, Y, Z各4バイト）
  const sizeData = Buffer.alloc(12);
  sizeData.writeUInt32LE(sx, 0); sizeData.writeUInt32LE(sy, 4); sizeData.writeUInt32LE(sz, 8);
  // XYZIチャンクのデータバッファ（4バイト個数 + ボクセル数×4バイト）
  const xyziData = Buffer.alloc(4 + voxels.length * 4);
  xyziData.writeUInt32LE(voxels.length, 0);
  // 各ボクセルのx, y, z, colorIndexを書き込み
  for (let i = 0; i < voxels.length; i++) {
    const v = voxels[i];
    xyziData[4 + i * 4] = v.x; xyziData[4 + i * 4 + 1] = v.y;
    xyziData[4 + i * 4 + 2] = v.z; xyziData[4 + i * 4 + 3] = v.c;
  }
  // RGBAチャンクのデータバッファ（256色×4バイト = 1024バイト）
  const rgbaData = Buffer.alloc(1024);
  // パレットがあれば書き込み
  if (palette) for (let i = 0; i < 256; i++) {
    rgbaData[i*4] = palette[i].r; rgbaData[i*4+1] = palette[i].g;
    rgbaData[i*4+2] = palette[i].b; rgbaData[i*4+3] = palette[i].a;
  }
  // チャンクヘッダー＋データを結合するヘルパー関数
  function makeChunk(id, data) {
    const h = Buffer.alloc(12); h.write(id, 0, 4, 'ascii');
    h.writeUInt32LE(data.length, 4); h.writeUInt32LE(0, 8);
    return Buffer.concat([h, data]);
  }
  // 全子チャンクを結合
  const children = Buffer.concat([makeChunk('SIZE', sizeData), makeChunk('XYZI', xyziData), makeChunk('RGBA', rgbaData)]);
  // MAINチャンクヘッダーを作成
  const mainH = Buffer.alloc(12); mainH.write('MAIN', 0, 4, 'ascii');
  mainH.writeUInt32LE(0, 4); mainH.writeUInt32LE(children.length, 8);
  // VOXファイルヘッダーを作成（マジックナンバー + バージョン）
  const voxH = Buffer.alloc(8); voxH.write('VOX ', 0, 4, 'ascii'); voxH.writeUInt32LE(150, 4);
  // ファイルに書き出し
  fs.writeFileSync(filePath, Buffer.concat([voxH, mainH, children]));
}

// --- メイン処理 ---
// プロジェクトルートディレクトリ
const BASE = path.join(__dirname, '..');
// VOXファイルが格納されているディレクトリ
const DIR = path.join(BASE, 'public/box2');

// 分割対象の顔パーツ名リスト
const PARTS = ['ears', 'eyes', 'nose', 'mouth'];

// 各顔パーツを処理
for (const part of PARTS) {
  // 入力ファイルパス（元の低解像度VOX）
  const srcPath = path.join(DIR, `cyberpunk_elf_body_${part}.vox`);
  // 出力ファイルパス（2倍解像度の_x2サフィックス付き）
  const dstPath = path.join(DIR, `cyberpunk_elf_body_${part}_x2.vox`);

  // VOXファイルを読み込み
  const model = readVox(srcPath);
  // 元のサイズとボクセル数を表示
  console.log(`${part}: ${model.sx}x${model.sy}x${model.sz}, ${model.voxels.length} voxels`);

  // 分割: 各ボクセルを2x2x2の8サブボクセルに変換
  const newSx = model.sx * 2;  // X方向のサイズを2倍
  const newSy = model.sy * 2;  // Y方向のサイズを2倍
  const newSz = model.sz * 2;  // Z方向のサイズを2倍
  const newVoxels = [];

  // 元の各ボクセルについて
  for (const v of model.voxels) {
    // 2倍座標でのベース位置
    const bx = v.x * 2, by = v.y * 2, bz = v.z * 2;
    // 2x2x2の8個のサブボクセルを生成（同じ色）
    for (let dx = 0; dx < 2; dx++) {
      for (let dy = 0; dy < 2; dy++) {
        for (let dz = 0; dz < 2; dz++) {
          newVoxels.push({ x: bx + dx, y: by + dy, z: bz + dz, c: v.c });
        }
      }
    }
  }

  // 分割結果をVOXファイルとして書き出し
  writeVox(dstPath, newSx, newSy, newSz, newVoxels, model.palette);
  // 結果を表示
  console.log(`  → ${newSx}x${newSy}x${newSz}, ${newVoxels.length} voxels → ${dstPath}`);
}

// 完了メッセージ
console.log('\nDone!');
