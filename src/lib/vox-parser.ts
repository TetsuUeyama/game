// 共有VOXパーサー
// 型定義は types/vox.ts を参照

import type { VoxModel, VoxelEntry } from '@/types/vox';
export type { VoxModel, VoxelEntry };

// ArrayBufferからVOXファイルをパースする関数
export function parseVox(buf: ArrayBuffer): VoxModel {
  // DataViewでバイナリデータにアクセス
  const view = new DataView(buf);
  // 読み取り位置のオフセット
  let offset = 0;
  // 4バイト符号なし整数をリトルエンディアンで読み取り、オフセットを進める
  const readU32 = () => { const v = view.getUint32(offset, true); offset += 4; return v; };
  // 1バイト符号なし整数を読み取り、オフセットを進める
  const readU8 = () => { const v = view.getUint8(offset); offset += 1; return v; };
  // nバイトのASCII文字列を読み取り、オフセットを進める
  const readStr = (n: number) => {
    let s = ''; for (let i = 0; i < n; i++) s += String.fromCharCode(view.getUint8(offset + i));
    offset += n; return s;
  };
  // マジックナンバー'VOX 'を確認（VOXファイル形式の識別子）
  if (readStr(4) !== 'VOX ') throw new Error('Not a VOX file');
  // バージョン番号を読み飛ばす
  readU32();
  // モデルサイズの初期化
  let sizeX = 0, sizeY = 0, sizeZ = 0;
  // ボクセルデータの配列
  const voxels: VoxModel['voxels'] = [];
  // カラーパレット（nullの場合はデフォルトパレットを使用）
  let palette: VoxModel['palette'] | null = null;
  // チャンクを再帰的に読み取る関数
  const readChunks = (end: number) => {
    // 終端に達するまでチャンクを処理
    while (offset < end) {
      // チャンクヘッダー: ID(4B) + コンテンツサイズ(4B) + 子チャンクサイズ(4B)
      const id = readStr(4); const cs = readU32(); const ccs = readU32(); const ce = offset + cs;
      // SIZEチャンク: グリッドサイズを読み取り
      if (id === 'SIZE') { sizeX = readU32(); sizeY = readU32(); sizeZ = readU32(); }
      // XYZIチャンク: ボクセルの座標とカラーインデックスを読み取り
      else if (id === 'XYZI') { const n = readU32(); for (let i = 0; i < n; i++) voxels.push({ x: readU8(), y: readU8(), z: readU8(), colorIndex: readU8() }); }
      // RGBAチャンク: 256色パレットを読み取り（各色RGBA、Aは無視、0-255→0.0-1.0に正規化）
      else if (id === 'RGBA') { palette = []; for (let i = 0; i < 256; i++) { const r = readU8(), g = readU8(), b = readU8(); readU8(); palette.push({ r: r / 255, g: g / 255, b: b / 255 }); } }
      // コンテンツ終端にオフセットを移動し、子チャンクがあれば再帰処理
      offset = ce; if (ccs > 0) readChunks(offset + ccs);
    }
  };
  // MAINチャンクの確認（VOXファイルのルートチャンク）
  if (readStr(4) !== 'MAIN') throw new Error('Expected MAIN');
  // MAINチャンクのコンテンツサイズと子チャンクサイズを読み取り
  const mc = readU32(); const mcc = readU32(); offset += mc;
  // 全子チャンクを再帰的に読み取り
  readChunks(offset + mcc);
  // パレットが見つからなかった場合はデフォルトのグレーパレットを生成
  if (!palette) { palette = []; for (let i = 0; i < 256; i++) palette.push({ r: 0.8, g: 0.8, b: 0.8 }); }
  // パース結果を返す
  return { sizeX, sizeY, sizeZ, voxels, palette };
}

// URLからVOXファイルを読み込み、パースしてモデルとボクセルエントリを返す非同期関数
export async function loadVoxFile(url: string): Promise<{ model: VoxModel; voxels: VoxelEntry[] }> {
  // キャッシュバスティング付きでVOXファイルをフェッチ
  const resp = await fetch(url + `?v=${Date.now()}`);
  // レスポンスが正常でなければエラー
  if (!resp.ok) throw new Error(`Failed: ${url} (${resp.status})`);
  // ArrayBufferとしてレスポンスを取得しパース
  const model = parseVox(await resp.arrayBuffer());
  // 各ボクセルにパレットから色を適用してVoxelEntry配列を生成（カラーインデックスは1始まり）
  const voxels: VoxelEntry[] = model.voxels.map(v => {
    const col = model.palette[v.colorIndex - 1] ?? { r: 0.8, g: 0.8, b: 0.8 };  // インデックス-1でパレット参照、なければデフォルトグレー
    return { x: v.x, y: v.y, z: v.z, r: col.r, g: col.g, b: col.b };
  });
  // モデルデータと色付きボクセル配列を返す
  return { model, voxels };
}

// メッシュ構築用定数

// 1ボクセルのワールド空間スケール（0.01 = 1ボクセルが0.01ワールド単位）
export const SCALE = 0.01;
// ボクセルの6面の方向ベクトル（+X, -X, +Y, -Y, +Z, -Z）
export const FACE_DIRS = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
// 各面を構成する4頂点のローカル座標オフセット
export const FACE_VERTS = [
  [[1, 0, 0], [1, 1, 0], [1, 1, 1], [1, 0, 1]], [[0, 0, 1], [0, 1, 1], [0, 1, 0], [0, 0, 0]],  // +X面, -X面
  [[0, 1, 0], [0, 1, 1], [1, 1, 1], [1, 1, 0]], [[0, 0, 1], [0, 0, 0], [1, 0, 0], [1, 0, 1]],  // +Y面, -Y面
  [[0, 0, 1], [0, 1, 1], [1, 1, 1], [1, 0, 1]], [[1, 0, 0], [1, 1, 0], [0, 1, 0], [0, 0, 0]],  // +Z面, -Z面
];
// 各面の法線ベクトル（面の向き）
export const FACE_NORMALS = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
