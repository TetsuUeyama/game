'use client'; // クライアントサイドコンポーネントとして宣言

// React フックのインポート（状態管理・副作用・参照・メモ化コールバック・サスペンス）
import { useEffect, useRef, useState, useCallback, Suspense } from 'react';
// Babylon.js コアモジュール群のインポート
import {
  Engine,           // 描画エンジン
  Scene,            // 3Dシーン
  ArcRotateCamera,  // アークロテートカメラ
  HemisphericLight, // 半球ライト
  DirectionalLight, // ディレクショナルライト
  Vector3,          // 3Dベクトル
  Color3,           // RGB色
  Color4,           // RGBA色
  Mesh,             // メッシュ
  VertexData,       // 頂点データ
  StandardMaterial, // 標準マテリアル
  MeshBuilder,      // メッシュビルダー
  Matrix,           // 4x4行列
} from '@babylonjs/core';

// ========================================================================
// VOX parser + mesh builder（VOXパーサー + メッシュビルダー）
// vox-viewer2と同じ実装
// ========================================================================

// VOXモデルデータの型定義（サイズ・ボクセル・パレット）
interface VoxModel {
  sizeX: number; sizeY: number; sizeZ: number;  // グリッドサイズ
  voxels: { x: number; y: number; z: number; colorIndex: number }[];  // ボクセル配列
  palette: { r: number; g: number; b: number }[];  // カラーパレット（0-1正規化）
}

// MagicaVoxel形式のバイナリデータを解析する関数
function parseVox(buf: ArrayBuffer): VoxModel {
  const view = new DataView(buf);  // バイナリデータビュー
  let offset = 0;  // 読み取りオフセット
  // 4バイト符号なし整数読み取りヘルパー（リトルエンディアン）
  const readU32 = () => { const v = view.getUint32(offset, true); offset += 4; return v; };
  // 1バイト符号なし整数読み取りヘルパー
  const readU8 = () => { const v = view.getUint8(offset); offset += 1; return v; };
  // n文字のASCII文字列読み取りヘルパー
  const readStr = (n: number) => {
    let s = ''; for (let i = 0; i < n; i++) s += String.fromCharCode(view.getUint8(offset + i));
    offset += n; return s;
  };
  // マジックナンバー "VOX " を検証
  if (readStr(4) !== 'VOX ') throw new Error('Not a VOX file');
  readU32();  // バージョン番号をスキップ
  let sizeX = 0, sizeY = 0, sizeZ = 0;  // グリッドサイズ
  const voxels: VoxModel['voxels'] = [];  // ボクセルデータ配列
  let palette: VoxModel['palette'] | null = null;  // パレット（未読み込み時はnull）
  // チャンクを再帰的に読み取る内部関数
  const readChunks = (end: number) => {
    while (offset < end) {
      const id = readStr(4); const cs = readU32(); const ccs = readU32(); const ce = offset + cs;  // チャンクID・サイズ・子サイズ・データ終端
      if (id === 'SIZE') { sizeX = readU32(); sizeY = readU32(); sizeZ = readU32(); }  // SIZEチャンク: グリッド寸法
      else if (id === 'XYZI') { const n = readU32(); for (let i = 0; i < n; i++) voxels.push({ x: readU8(), y: readU8(), z: readU8(), colorIndex: readU8() }); }  // XYZIチャンク: ボクセルデータ
      else if (id === 'RGBA') { palette = []; for (let i = 0; i < 256; i++) { const r = readU8(), g = readU8(), b = readU8(); readU8(); palette.push({ r: r / 255, g: g / 255, b: b / 255 }); } }  // RGBAチャンク: パレット
      offset = ce; if (ccs > 0) readChunks(offset + ccs);  // 子チャンクがあれば再帰処理
    }
  };
  if (readStr(4) !== 'MAIN') throw new Error('Expected MAIN');  // MAINチャンクの検証
  const mc = readU32(); const mcc = readU32(); offset += mc;  // MAINのコンテンツサイズと子チャンクサイズ
  readChunks(offset + mcc);  // 子チャンクを処理
  // パレットがない場合はデフォルトの灰色パレットを生成
  if (!palette) { palette = []; for (let i = 0; i < 256; i++) palette.push({ r: 0.8, g: 0.8, b: 0.8 }); }
  return { sizeX, sizeY, sizeZ, voxels, palette };  // 解析結果を返却
}

// 6方向の面オフセット（+X, -X, +Y, -Y, +Z, -Z）
const FACE_DIRS = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
// 各面の4頂点のローカル座標（四角形面を構成）
const FACE_VERTS = [
  [[1, 0, 0], [1, 1, 0], [1, 1, 1], [1, 0, 1]], [[0, 0, 1], [0, 1, 1], [0, 1, 0], [0, 0, 0]],  // +X面, -X面
  [[0, 1, 0], [0, 1, 1], [1, 1, 1], [1, 1, 0]], [[0, 0, 1], [0, 0, 0], [1, 0, 0], [1, 0, 1]],  // +Y面, -Y面
  [[0, 0, 1], [0, 1, 1], [1, 1, 1], [1, 0, 1]], [[1, 0, 0], [1, 1, 0], [0, 1, 0], [0, 0, 0]],  // +Z面, -Z面
];
// 各面の法線ベクトル
const FACE_NORMALS = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
const SCALE = 0.010;  // デフォルトのボクセルスケール（1ボクセル = 0.01ワールド単位）

// VOXモデルからBabylon.jsメッシュを構築する関数（隣接面カリング付き）
function buildVoxMesh(model: VoxModel, scene: Scene, name: string, scale: number = SCALE): Mesh {
  // 占有セットを構築（隣接ボクセルの存在チェック用）
  const occupied = new Set<string>();
  for (const v of model.voxels) occupied.add(`${v.x},${v.y},${v.z}`);
  const cx = model.sizeX / 2, cy = model.sizeY / 2;  // グリッド中心座標
  const positions: number[] = [], normals: number[] = [], colors: number[] = [], indices: number[] = [];  // 頂点データ配列
  // 全ボクセルをループ
  for (const voxel of model.voxels) {
    const col = model.palette[voxel.colorIndex - 1] ?? { r: 0.8, g: 0.8, b: 0.8 };  // パレットから色取得（1始まりインデックス）
    // 6方向の面をチェック
    for (let f = 0; f < 6; f++) {
      const [dx, dy, dz] = FACE_DIRS[f];
      if (occupied.has(`${voxel.x + dx},${voxel.y + dy},${voxel.z + dz}`)) continue;  // 隣接ボクセルがあればスキップ
      const bi = positions.length / 3, fv = FACE_VERTS[f], fn = FACE_NORMALS[f];  // 頂点インデックスベース
      // 四角形の4頂点を追加（VOX→Babylon座標系変換）
      for (let vi = 0; vi < 4; vi++) {
        const rx = (voxel.x + fv[vi][0] - cx) * scale;   // X座標（中心基準）
        const ry = (voxel.y + fv[vi][1] - cy) * scale;   // Y座標（中心基準）
        const rz = (voxel.z + fv[vi][2]) * scale;         // Z座標（底面基準）
        positions.push(rx, rz, -ry);                       // VOX(x,y,z)→Babylon(x,z,-y)
        normals.push(fn[0], fn[2], -fn[1]);                // 法線も座標変換
        colors.push(col.r, col.g, col.b, 1);              // RGBA頂点カラー
      }
      // 四角形を2つの三角形に分割してインデックス追加
      indices.push(bi, bi + 1, bi + 2, bi, bi + 2, bi + 3);
    }
  }
  // VertexDataを作成してメッシュに適用
  const vd = new VertexData();
  vd.positions = positions; vd.normals = normals; vd.colors = colors; vd.indices = indices;
  const mesh = new Mesh(name, scene);
  vd.applyToMesh(mesh, true);  // updatable=true（アニメーション用）
  return mesh;
}

// セグメントバンドルデータの型定義（全ボーンのボクセルを1ファイルに格納）
interface SegmentBundleData {
  grid: { gx: number; gy: number; gz: number };  // グリッドサイズ
  palette: number[][];    // [[r,g,b], ...] 正規化0-1
  segments: Record<string, number[]>;  // ボーン名 -> フラット配列 [x,y,z,ci, ...]
}

/** バンドルされたセグメントファイルからボーンごとのメッシュを構築する関数。
 *  頂点単位のアニメーションは不要 — メッシュのワールド行列で制御。 */
function buildBundleMeshes(
  bundle: SegmentBundleData, scene: Scene, mat: StandardMaterial, scale: number
): Record<string, Mesh> {
  const cx = bundle.grid.gx / 2, cy = bundle.grid.gy / 2;  // グリッド中心座標
  const meshes: Record<string, Mesh> = {};  // ボーン名→メッシュのマップ

  // 各ボーンのセグメントを処理
  for (const [boneName, flat] of Object.entries(bundle.segments)) {
    const numVoxels = flat.length / 4;  // ボクセル数（4要素ずつ: x,y,z,ci）
    if (numVoxels === 0) continue;      // ボクセルがなければスキップ

    // 面カリング用の占有セットを構築
    const occupied = new Set<string>();
    for (let i = 0; i < numVoxels; i++) {
      occupied.add(`${flat[i*4]},${flat[i*4+1]},${flat[i*4+2]}`);
    }

    const positions: number[] = [], normals: number[] = [], colors: number[] = [], indices: number[] = [];
    // 全ボクセルをループ
    for (let i = 0; i < numVoxels; i++) {
      const vx = flat[i*4], vy = flat[i*4+1], vz = flat[i*4+2], ci = flat[i*4+3];  // 座標とカラーインデックス
      const col = bundle.palette[ci] ?? [0.8, 0.8, 0.8];  // パレットから色取得
      // 6方向の面をチェック
      for (let f = 0; f < 6; f++) {
        const [dx, dy, dz] = FACE_DIRS[f];
        if (occupied.has(`${vx+dx},${vy+dy},${vz+dz}`)) continue;  // 隣接面はスキップ
        const bi = positions.length / 3, fv = FACE_VERTS[f], fn = FACE_NORMALS[f];
        // 4頂点を追加（VOX→Babylon座標変換）
        for (let vi = 0; vi < 4; vi++) {
          positions.push((vx + fv[vi][0] - cx) * scale, (vz + fv[vi][2]) * scale, -(vy + fv[vi][1] - cy) * scale);
          normals.push(fn[0], fn[2], -fn[1]);
          colors.push(col[0], col[1], col[2], 1);
        }
        indices.push(bi, bi+1, bi+2, bi, bi+2, bi+3);
      }
    }

    if (positions.length === 0) continue;  // 面が生成されなければスキップ
    const vd = new VertexData();
    vd.positions = positions; vd.normals = normals; vd.colors = colors; vd.indices = indices;
    const mesh = new Mesh(`seg_${boneName}`, scene);
    vd.applyToMesh(mesh, false);  // updatable=false（ワールド行列でアニメーション）
    mesh.material = mat;
    meshes[boneName] = mesh;
  }

  return meshes;
}

// キャッシュバスター（リクエストURLにタイムスタンプを付与してキャッシュ回避）
const CACHE_BUST = `?v=${Date.now()}`;

// VOXファイルをURLからロードしてメッシュを構築する非同期関数
async function loadVoxMesh(scene: Scene, url: string, name: string, scale: number = SCALE): Promise<Mesh> {
  const resp = await fetch(url + CACHE_BUST);  // VOXファイルをフェッチ
  if (!resp.ok) throw new Error(`Failed: ${url}`);
  const model = parseVox(await resp.arrayBuffer());  // バイナリを解析
  return buildVoxMesh(model, scene, name, scale);    // メッシュを構築して返却
}

// ========================================================================
// Part manifest type & character config（パーツマニフェスト型とキャラクター設定）
// ========================================================================

// パーツエントリの型定義（マニフェストJSONの1要素）
interface PartEntry {
  key: string;         // パーツキー（一意識別子）
  file: string;        // VOXファイルのパス
  voxels: number;      // ボクセル数
  default_on: boolean; // デフォルト表示フラグ
  meshes: string[];    // 元メッシュ名のリスト
  is_body: boolean;    // ボディパーツかどうか
  category?: string;   // カテゴリ（body/hair/clothing等）
}

// グリッド情報の型定義
interface GridInfo {
  voxel_size: number;  // ボクセルサイズ（メートル）
  gx: number;          // X方向グリッド数
  gy: number;          // Y方向グリッド数
  gz: number;          // Z方向グリッド数
}

// キャラクターカテゴリ型
type CharCategory = 'female' | 'male' | 'base' | 'weapons';

// キャラクター設定の型定義
interface CharacterConfig {
  label: string;          // 表示ラベル
  manifest: string;       // パーツマニフェストJSONのURL
  gridJson: string;       // グリッド情報JSONのURL
  gender: 'female' | 'male';  // 性別
  category: CharCategory; // カテゴリ
}

// 髪スワップオプションの型定義
interface HairOption {
  label: string;       // 表示ラベル
  charKey: string;     // キャラクターキー
  file: string;        // VOXファイルのフルAPIパス
  partKey: string;     // parts.json内のパーツキー
  voxels: number;      // ボクセル数
  anchorsUrl: string;  // hair_anchors.jsonのURL
}

// アンカーポイントの型定義（髪のアライメント用）
interface AnchorPoints {
  top: number[];    // 頭頂部のアンカー座標
  front: number[];  // 前面のアンカー座標
  back: number[];   // 背面のアンカー座標
  left: number[];   // 左側のアンカー座標
  right: number[];  // 右側のアンカー座標
  width: number;    // 頭部の幅
  depth: number;    // 頭部の奥行
}

// 髪アンカーデータの型定義
interface HairAnchorsData {
  voxel_size: number;                        // ボクセルサイズ
  body_head?: AnchorPoints;                  // ボディの頭部アンカー
  hairs?: Record<string, AnchorPoints>;      // 髪パーツごとのアンカー
}

// モーションデータの型定義（アニメーション用）
interface MotionData {
  fps: number;            // フレームレート
  frame_count: number;    // フレーム数
  babylonFormat?: boolean; // true: 行列がBabylon.js形式（転置不要）
  bones: Record<string, {
    matrices: number[][];  // フレームごとのフラット16要素スキニング行列
  }>;
}

/** Blenderからの生モーションデータ（座標変換未適用）の型定義 */
interface RawMotionData {
  format: 'blender_raw';                             // フォーマット識別子
  fps: number;                                        // フレームレート
  frame_count: number;                                // フレーム数
  bind_pose_rest: Record<string, number[]>;           // bone.matrix_localワールド空間、行優先
  bind_pose_eval: Record<string, number[]>;           // 評価済みポーズ、行優先
  animated: Record<string, { matrices: number[][] }>; // フレームごとのワールド空間行列、行優先
}

/**
 * Blender行優先（列ベクトル規約）の16要素配列を
 * Babylon.js Matrix（行ベクトル規約）に変換する関数。
 * Blender: M*v, 平行移動はm[3],m[7],m[11]
 * Babylon: v*M, 平行移動はm[12],m[13],m[14]
 * → 転置が必要
 */
function blenderToBabylonMatrix(m: number[]): Matrix {
  return Matrix.FromArray([
    m[0], m[4], m[8],  m[12],  // 転置された行列の第1行
    m[1], m[5], m[9],  m[13],  // 第2行
    m[2], m[6], m[10], m[14],  // 第3行
    m[3], m[7], m[11], m[15],  // 第4行（平行移動成分）
  ]);
}

/**
 * 座標変換: Blender Z-up右手系 → Babylon Y-up左手系
 * Blender (x,y,z) → Babylon (x,z,-y)
 * Babylon.js行列（Babylon規約）として定義
 */
const COORD_BLENDER_TO_VIEWER = Matrix.FromArray([
  1,  0,  0,  0,  // X軸: そのまま
  0,  0, -1,  0,  // Y軸: -Z方向に（Blender Zが手前→Babylon Zが奥）
  0,  1,  0,  0,  // Z軸: Y方向に（Blender Yが奥→Babylon Yが上）
  0,  0,  0,  1,  // 平行移動なし
]);

/**
 * Blenderの生モーションデータをBabylon.js対応の行列に変換する関数。
 * 各ボーン×各フレーム:
 *   skinMat = animated_world × bind_rest_inverse  (Blender空間)
 *   viewerMat = C × skinMat × C_inv               (ビューア空間に変換)
 * 全てBabylon.js Matrix APIで計算（規約の一貫性のため）
 */
function processRawMotionData(raw: RawMotionData): MotionData {
  const coordInv = COORD_BLENDER_TO_VIEWER.clone();  // 座標変換行列のコピー
  coordInv.invert();  // 逆行列を計算

  // ボーンごとのバインドポーズ選択: 評価済みポーズ（IK/FK適用）がレストポーズと
  // 大きく異なる場合、IKがそのボーンに適用されていたことを示す。
  // ボクセルメッシュは評価済みポーズから抽出されるため、該当ボーンはevalを使用する必要がある
  const hasEval = raw.bind_pose_eval && Object.keys(raw.bind_pose_eval).length > 0;
  const bindInvCache: Record<string, Matrix> = {};  // バインドポーズ逆行列のキャッシュ
  for (const [name, restMat] of Object.entries(raw.bind_pose_rest)) {
    let useMat = restMat;  // デフォルトはレストポーズ
    if (hasEval && raw.bind_pose_eval[name]) {
      const evalMat = raw.bind_pose_eval[name];
      // evalがrestと異なるかチェック（IKがこのボーンに作用しているか）
      let diff = 0;
      for (let i = 0; i < 16; i++) diff += Math.abs(restMat[i] - evalMat[i]);
      if (diff > 0.01) useMat = evalMat;  // 差異があればevalを使用
    }
    const bjsMat = blenderToBabylonMatrix(useMat);  // Babylon形式に変換
    const inv = new Matrix();
    bjsMat.invertToRef(inv);  // 逆行列を計算
    bindInvCache[name] = inv;  // キャッシュに保存
  }

  const bones: MotionData['bones'] = {};  // 変換済みモーションデータ

  // 各ボーンのアニメーションデータを処理
  for (const [boneName, animData] of Object.entries(raw.animated)) {
    const bindInv = bindInvCache[boneName];
    if (!bindInv) continue;  // バインドポーズがないボーンはスキップ

    const matrices: number[][] = [];
    for (const frameMat of animData.matrices) {
      const animBjs = blenderToBabylonMatrix(frameMat);  // フレーム行列をBabylon形式に変換

      // スキニング行列 = anim × bind_inv（Blender列ベクトル規約）
      // Babylon行ベクトル規約では: bind_inv.multiply(anim)
      // なぜなら Blender A*B = Babylon B.multiply(A)
      const skinBjs = bindInv.multiply(animBjs);

      // ビューア空間への変換: C × skin × C_inv
      // Blender列ベクトル: v_viewer = C * skin * C_inv * v_viewer_input
      // Babylon行ベクトル: v_viewer_input * M = v_viewer
      // M = transpose(C * skin * C_inv)
      // ただしskinは既にBabylon形式（Blenderから転置済み）。Cも同様。
      // したがって: M_bjs = C_inv_bjs * skin_bjs * C_bjs
      const viewerMat = coordInv.multiply(skinBjs).multiply(COORD_BLENDER_TO_VIEWER);

      // アニメーションループ用にフラット配列として格納
      matrices.push(Array.from(viewerMat.asArray()));
    }
    bones[boneName] = { matrices };
  }

  return { fps: raw.fps, frame_count: raw.frame_count, babylonFormat: true, bones };
}

// ジョイントスフィア設定の型定義（関節の球体表示用）
interface JointSphereConfig {
  position_voxel: number[];   // ボクセル空間での位置
  bone: string;               // 所属ボーン名
  radius_voxels: number | number[];  // 半径（ボクセル単位）
  shape: 'sphere' | 'ellipsoid';    // 形状
  color: { r: number; g: number; b: number };  // 表示色
}

// セグメントデータの型定義（ボーン分割ボクセル情報）
interface SegmentsData {
  voxel_size: number;  // ボクセルサイズ
  grid: { gx: number; gy: number; gz: number };  // グリッドサイズ
  bb_min?: number[];   // バウンディングボックス最小座標
  bb_max?: number[];   // バウンディングボックス最大座標
  bone_positions: Record<string, {
    head_voxel: number[];  // ボーンのヘッド位置（ボクセル座標）
    tail_voxel: number[];  // ボーンのテール位置（ボクセル座標）
  }>;
  segments: Record<string, { file: string; voxels: number }>;  // ボーン名→ファイル・ボクセル数
  joint_spheres?: Record<string, JointSphereConfig>;  // ジョイントスフィア設定
}

// ========================================================================
// Bone hierarchy for joint correction（ジョイント補正用のボーン階層）
// ========================================================================

// ボーン階層エントリの型定義
interface BoneHierarchyEntry {
  bone: string;           // ボーン名
  parent: string | null;  // 親ボーン名（ルートはnull）
  jointPoint: number[];   // ビューア空間でのジョイントポイント [x, y, z]
}

/** ボーン処理順序（ルート→リーフ）を親情報とジョイントポイント付きで構築する関数。
 *  実際のセグメント（ボクセルメッシュ）を持つボーンのみ対象。
 *  最初にテール→ヘッドの完全一致を試み、次に孤立ボーンの近接マッチングを行う。 */
function buildBoneHierarchy(segData: SegmentsData): BoneHierarchyEntry[] {
  const bp = segData.bone_positions;
  const grid = segData.grid;
  const cx = grid.gx / 2, cy = grid.gy / 2;  // グリッド中心
  const scale = segData.voxel_size;
  const segmentBones = new Set(Object.keys(segData.segments));  // セグメントを持つボーン名

  // セグメント名→bone_positionsキーのマッピング構築
  // セグメント名が正規化されている場合がある（例: c_thigh_stretch.l → thigh_stretch.l）
  const bpKeys = new Set(Object.keys(bp));
  const segToBpName: Record<string, string> = {};
  for (const seg of segmentBones) {
    if (bpKeys.has(seg)) { segToBpName[seg] = seg; continue; }  // 完全一致
    let alt = seg.replace(/^c_/, '');  // c_プレフィックスを除去して試行
    if (bpKeys.has(alt)) { segToBpName[seg] = alt; continue; }
    alt = seg.replace(/^c_/, '').replace(/_bend/, '');  // c_プレフィックスと_bendサフィックスを除去
    if (bpKeys.has(alt)) { segToBpName[seg] = alt; continue; }
  }
  // セグメント名からbone_positionsを取得するヘルパー
  const getBp = (seg: string) => bp[segToBpName[seg]];

  // テール位置→ボーン名のマップを構築（親子関係の特定用）
  const tailMap = new Map<string, string>();
  for (const name of segmentBones) {
    const pos = getBp(name);
    if (!pos) continue;
    const t = pos.tail_voxel;
    tailMap.set(`${t[0]},${t[1]},${t[2]}`, name);
  }

  // 親子関係の構築（ヘッド位置がテール位置に一致するボーンが親）
  const parentOf: Record<string, string | null> = {};
  const children: Record<string, string[]> = {};
  for (const name of segmentBones) { parentOf[name] = null; children[name] = []; }
  for (const name of segmentBones) {
    const pos = getBp(name); if (!pos) continue;
    const h = pos.head_voxel;
    const parentName = tailMap.get(`${h[0]},${h[1]},${h[2]}`);
    if (parentName && parentName !== name) { parentOf[name] = parentName; children[parentName].push(name); }
  }

  // 孤立ボーンの近接マッチング（テール→ヘッドの完全一致がなかったボーン）
  const THRESHOLD = 20;  // 近接マッチングの閾値（ボクセル距離）
  // 祖先チェック関数（循環参照防止）
  const isAncestor = (bone: string, ancestor: string): boolean => {
    let cur = bone; const visited = new Set<string>();
    while (cur) { if (visited.has(cur)) return false; if (cur === ancestor) return true; visited.add(cur); cur = parentOf[cur]!; }
    return false;
  };
  // 最大10ラウンドの近接マッチング
  for (let round = 0; round < 10; round++) {
    const orphanSet = new Set([...segmentBones].filter(n => !parentOf[n] && getBp(n)));  // 孤立ボーン
    if (orphanSet.size === 0) break;
    const inTree = new Set<string>();  // 既にツリーに含まれるボーン
    for (const n of segmentBones) { if (parentOf[n] || children[n].length > 0) inTree.add(n); }
    let attached = 0;
    for (const name of orphanSet) {
      const h = getBp(name)!.head_voxel;
      let bestParent: string | null = null, bestDist = THRESHOLD;
      // ツリー内の全ボーンのテールとの距離を計算
      for (const candidate of segmentBones) {
        if (candidate === name || !inTree.has(candidate) || isAncestor(candidate, name)) continue;
        const cPos = getBp(candidate);
        if (!cPos) continue;
        const t = cPos.tail_voxel;
        const d = Math.sqrt((t[0] - h[0]) ** 2 + (t[1] - h[1]) ** 2 + (t[2] - h[2]) ** 2);
        if (d < bestDist) { bestDist = d; bestParent = candidate; }
      }
      if (bestParent) { parentOf[name] = bestParent; children[bestParent].push(name); attached++; }
    }
    if (attached === 0) break;  // 追加接続がなければ終了
  }

  // ルートからリーフへの処理順序を構築（BFS）
  const roots = [...segmentBones].filter(n => !parentOf[n]);  // ルートボーン
  const order: BoneHierarchyEntry[] = [];
  const queue = [...roots];
  while (queue.length > 0) {
    const bone = queue.shift()!;
    const pos = getBp(bone); if (!pos) continue;
    const h = pos.head_voxel;
    // ジョイントポイントをビューア空間に変換（VOX→Babylon座標系）
    order.push({ bone, parent: parentOf[bone], jointPoint: [(h[0] - cx) * scale, h[2] * scale, -(h[1] - cy) * scale] });
    for (const child of children[bone]) queue.push(child);
  }
  return order;
}

/**
 * セグメントのボーン名をモーションのボーン名に解決する関数。
 * ARPリグではコントロールボーン（セグメント）とデフォームボーン（モーション）で命名が異なる:
 *   c_arm_stretch.l → arm_stretch.l  (c_プレフィックスを除去)
 *   c_spine_01_bend.x → spine_01.x   (c_プレフィックスと_bendサフィックスを除去)
 */
function resolveMotionBoneName(segName: string, motionBones: Set<string>): string | null {
  if (motionBones.has(segName)) return segName;  // 完全一致
  let alt = segName.replace(/^c_/, '');  // c_プレフィックスを除去
  if (motionBones.has(alt)) return alt;
  alt = segName.replace(/^c_/, '').replace(/_bend/, '');  // c_プレフィックスと_bendを除去
  if (motionBones.has(alt)) return alt;
  return null;  // 解決できず
}

/** 行優先列ベクトル規約の4x4行列を3D点に適用する関数（Blender規約） */
function applyMatPointBlender(m: number[], p: number[]): number[] {
  return [
    p[0] * m[0] + p[1] * m[1] + p[2] * m[2] + m[3],   // X成分
    p[0] * m[4] + p[1] * m[5] + p[2] * m[6] + m[7],   // Y成分
    p[0] * m[8] + p[1] * m[9] + p[2] * m[10] + m[11], // Z成分
  ];
}

/** Babylon.js形式（行ベクトル規約）の4x4行列を3D点に適用する関数 */
function applyMatPointBabylon(m: number[], p: number[]): number[] {
  return [
    p[0] * m[0] + p[1] * m[4] + p[2] * m[8] + m[12],  // X成分
    p[0] * m[1] + p[1] * m[5] + p[2] * m[9] + m[13],  // Y成分
    p[0] * m[2] + p[1] * m[6] + p[2] * m[10] + m[14], // Z成分
  ];
}

// API エンドポイント定数
const GAME_ASSETS_API = '/api/game-assets';  // ゲームアセットAPI
const VOX_API = '/api/vox';                  // VOXファイルAPI

// キャラクター設定の定義（全キャラクター）
const CHARACTERS: Record<string, CharacterConfig> = {
  // ---- ベースボディ（単一モデル、全モーション互換） ----
  base_female: { label: 'Base Female (CyberpunkElf)', manifest: `${VOX_API}/female/CyberpunkElf-Detailed/parts.json`, gridJson: `${VOX_API}/female/CyberpunkElf-Detailed/grid.json`, gender: 'female', category: 'base' },
  base_bunnyakali: { label: 'Base Female (BunnyAkali)', manifest: `${VOX_API}/female/BunnyAkali-Base/parts.json`, gridJson: `${VOX_API}/female/BunnyAkali-Base/grid.json`, gender: 'female', category: 'base' },
  base_darkelfblader: { label: 'Base Female (DarkElfBlader)', manifest: `${VOX_API}/female/DarkElfBlader-Base/parts.json`, gridJson: `${VOX_API}/female/DarkElfBlader-Base/grid.json`, gender: 'female', category: 'base' },
  // ---- 女性キャラクター ----
  cyberpunkelf: { label: 'CyberpunkElf', manifest: `${VOX_API}/female/realistic/parts.json`, gridJson: `${VOX_API}/female/realistic/grid.json`, gender: 'female', category: 'female' },
  darkelfblader: { label: 'DarkElfBlader', manifest: `${VOX_API}/female/realistic-darkelf/parts.json`, gridJson: `${VOX_API}/female/realistic-darkelf/grid.json`, gender: 'female', category: 'female' },
  highpriestess: { label: 'HighPriestess', manifest: `${VOX_API}/female/realistic-highpriestess/parts.json`, gridJson: `${VOX_API}/female/realistic-highpriestess/grid.json`, gender: 'female', category: 'female' },
  pillarwoman: { label: 'PillarWoman', manifest: `${VOX_API}/female/realistic-pillarwoman/parts.json`, gridJson: `${VOX_API}/female/realistic-pillarwoman/grid.json`, gender: 'female', category: 'female' },
  bunnyirelia: { label: 'BunnyIrelia', manifest: `${VOX_API}/female/realistic-bunnyirelia/parts.json`, gridJson: `${VOX_API}/female/realistic-bunnyirelia/grid.json`, gender: 'female', category: 'female' },
  daemongirl: { label: 'DaemonGirl', manifest: `${VOX_API}/female/realistic-daemongirl/parts.json`, gridJson: `${VOX_API}/female/realistic-daemongirl/grid.json`, gender: 'female', category: 'female' },
  daemongirl_default: { label: 'DaemonGirl Default', manifest: `${VOX_API}/female/realistic-daemongirl-default/parts.json`, gridJson: `${VOX_API}/female/realistic-daemongirl-default/grid.json`, gender: 'female', category: 'female' },
  daemongirl_bunny: { label: 'DaemonGirl Bunny', manifest: `${VOX_API}/female/realistic-daemongirl-bunny/parts.json`, gridJson: `${VOX_API}/female/realistic-daemongirl-bunny/grid.json`, gender: 'female', category: 'female' },
  daemongirl_bunnysuit: { label: 'DaemonGirl BunnySuit', manifest: `${VOX_API}/female/realistic-daemongirl-bunnysuit/parts.json`, gridJson: `${VOX_API}/female/realistic-daemongirl-bunnysuit/grid.json`, gender: 'female', category: 'female' },
  daemongirl_ponytail: { label: 'DaemonGirl Ponytail', manifest: `${VOX_API}/female/realistic-daemongirl-ponytail/parts.json`, gridJson: `${VOX_API}/female/realistic-daemongirl-ponytail/grid.json`, gender: 'female', category: 'female' },
  primrose_egypt: { label: 'Primrose Egypt', manifest: `${VOX_API}/female/realistic-primrose-egypt/parts.json`, gridJson: `${VOX_API}/female/realistic-primrose-egypt/grid.json`, gender: 'female', category: 'female' },
  primrose_officelady: { label: 'Primrose OfficeLady', manifest: `${VOX_API}/female/realistic-primrose-officelady/parts.json`, gridJson: `${VOX_API}/female/realistic-primrose-officelady/grid.json`, gender: 'female', category: 'female' },
  primrose_bunnysuit: { label: 'Primrose Bunnysuit', manifest: `${VOX_API}/female/realistic-primrose-bunnysuit/parts.json`, gridJson: `${VOX_API}/female/realistic-primrose-bunnysuit/grid.json`, gender: 'female', category: 'female' },
  primrose_swimsuit: { label: 'Primrose Swimsuit', manifest: `${VOX_API}/female/realistic-primrose-swimsuit/parts.json`, gridJson: `${VOX_API}/female/realistic-primrose-swimsuit/grid.json`, gender: 'female', category: 'female' },
  primrose_milkapron: { label: 'Primrose MilkApron', manifest: `${VOX_API}/female/realistic-primrose-milkapron/parts.json`, gridJson: `${VOX_API}/female/realistic-primrose-milkapron/grid.json`, gender: 'female', category: 'female' },
  queenmarika_default: { label: 'QueenMarika Default', manifest: `${VOX_API}/female/realistic-queenmarika-default/parts.json`, gridJson: `${VOX_API}/female/realistic-queenmarika-default/grid.json`, gender: 'female', category: 'female' },
  queenmarika_goldenbikini: { label: 'QueenMarika GoldenBikini', manifest: `${VOX_API}/female/realistic-queenmarika-goldenbikini/parts.json`, gridJson: `${VOX_API}/female/realistic-queenmarika-goldenbikini/grid.json`, gender: 'female', category: 'female' },
  bunnyakali: { label: 'BunnyAkali', manifest: `${VOX_API}/female/realistic-bunnyakali/parts.json`, gridJson: `${VOX_API}/female/realistic-bunnyakali/grid.json`, gender: 'female', category: 'female' },
  artorialancer_default: { label: 'ArtoriaLancer Default', manifest: `${VOX_API}/female/realistic-artorialancer-default/parts.json`, gridJson: `${VOX_API}/female/realistic-artorialancer-default/grid.json`, gender: 'female', category: 'female' },
  artorialancer_alter: { label: 'ArtoriaLancer Alter', manifest: `${VOX_API}/female/realistic-artorialancer-alter/parts.json`, gridJson: `${VOX_API}/female/realistic-artorialancer-alter/grid.json`, gender: 'female', category: 'female' },
  artorialancer_bunnysuit: { label: 'ArtoriaLancer BunnySuit', manifest: `${VOX_API}/female/realistic-artorialancer-bunnysuit/parts.json`, gridJson: `${VOX_API}/female/realistic-artorialancer-bunnysuit/grid.json`, gender: 'female', category: 'female' },
  elfpaladin: { label: 'ElfPaladin', manifest: `${VOX_API}/female/realistic-elfpaladin/parts.json`, gridJson: `${VOX_API}/female/realistic-elfpaladin/grid.json`, gender: 'female', category: 'female' },
  // ---- 男性キャラクター ----
  radagon: { label: 'Radagon', manifest: `${VOX_API}/male/realistic-radagon/parts.json`, gridJson: `${VOX_API}/male/realistic-radagon/grid.json`, gender: 'male', category: 'male' },
  vagrant: { label: 'Vagrant', manifest: `${VOX_API}/male/realistic-vagrant/parts.json`, gridJson: `${VOX_API}/male/realistic-vagrant/grid.json`, gender: 'male', category: 'male' },
  spartanhoplite: { label: 'SpartanHoplite', manifest: `${VOX_API}/male/realistic-spartanhoplite/parts.json`, gridJson: `${VOX_API}/male/realistic-spartanhoplite/grid.json`, gender: 'male', category: 'male' },
  radagon_tall: { label: 'Radagon (Tall)', manifest: `${VOX_API}/male/realistic-radagon-tall/parts.json`, gridJson: `${VOX_API}/male/realistic-radagon-tall/grid.json`, gender: 'male', category: 'male' },
  spartanhoplite_tall: { label: 'SpartanHoplite (Tall)', manifest: `${VOX_API}/male/realistic-spartanhoplite-tall/parts.json`, gridJson: `${VOX_API}/male/realistic-spartanhoplite-tall/grid.json`, gender: 'male', category: 'male' },
  vagrant_tall: { label: 'Vagrant (Tall)', manifest: `${VOX_API}/male/realistic-vagrant-tall/parts.json`, gridJson: `${VOX_API}/male/realistic-vagrant-tall/grid.json`, gender: 'male', category: 'male' },
  dido: { label: 'Dido (MaleSmall2)', manifest: `${VOX_API}/male/realistic-dido/parts.json`, gridJson: `${VOX_API}/male/realistic-dido/grid.json`, gender: 'male', category: 'male' },
  // ---- 武器 ----
  artorialancer_weapons: { label: 'ArtoriaLancer Weapons', manifest: `${VOX_API}/female/realistic-artorialancer-weapons/parts.json`, gridJson: `${VOX_API}/female/realistic-artorialancer-weapons/grid.json`, gender: 'female', category: 'weapons' },
  elfpaladin_weapons: { label: 'ElfPaladin Weapons', manifest: `${VOX_API}/female/realistic-elfpaladin-weapons/parts.json`, gridJson: `${VOX_API}/female/realistic-elfpaladin-weapons/grid.json`, gender: 'female', category: 'weapons' },
  radagon_weapons: { label: 'Radagon Weapons', manifest: `${VOX_API}/male/realistic-radagon-weapons/parts.json`, gridJson: `${VOX_API}/male/realistic-radagon-weapons/grid.json`, gender: 'male', category: 'weapons' },
  spartanhoplite_weapons: { label: 'SpartanHoplite Weapons', manifest: `${VOX_API}/male/realistic-spartanhoplite-weapons/parts.json`, gridJson: `${VOX_API}/male/realistic-spartanhoplite-weapons/grid.json`, gender: 'male', category: 'weapons' },
  radagon_tall_weapons: { label: 'Radagon (Tall) Weapons', manifest: `${VOX_API}/male/realistic-radagon-weapons-tall/parts.json`, gridJson: `${VOX_API}/male/realistic-radagon-weapons-tall/grid.json`, gender: 'male', category: 'weapons' },
  spartanhoplite_tall_weapons: { label: 'SpartanHoplite (Tall) Weapons', manifest: `${VOX_API}/male/realistic-spartanhoplite-weapons-tall/parts.json`, gridJson: `${VOX_API}/male/realistic-spartanhoplite-weapons-tall/grid.json`, gender: 'male', category: 'weapons' },
};

// ========================================================================
// Component（コンポーネント）
// ========================================================================

// ラッパーコンポーネント（Suspenseでローディングフォールバックを提供）
export default function RealisticViewerWrapper() {
  return (
    <Suspense fallback={<div style={{ background: '#12121f', width: '100vw', height: '100vh' }} />}>
      <RealisticViewerPage />
    </Suspense>
  );
}

// リアリスティックビューアのメインページコンポーネント
function RealisticViewerPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);          // 3D描画用キャンバスの参照
  const sceneRef = useRef<Scene | null>(null);               // Babylon.jsシーンの参照
  const bodyMatRef = useRef<StandardMaterial | null>(null);   // ボディ用マテリアルの参照
  const partMatRef = useRef<StandardMaterial | null>(null);   // パーツ用マテリアルの参照（zOffset付き）

  const meshesRef = useRef<Record<string, Mesh>>({});        // パーツキー→メッシュのマップ

  const [selectedCategory, setSelectedCategory] = useState<CharCategory>('base');  // 選択中のカテゴリ
  const [charKey, setCharKey] = useState('base_female');      // 選択中のキャラクターキー
  const [parts, setParts] = useState<PartEntry[]>([]);        // パーツ一覧
  const [partVisibility, setPartVisibility] = useState<Record<string, boolean>>({});  // パーツ表示状態
  const [loading, setLoading] = useState(true);              // 読み込み中フラグ
  const [error, setError] = useState<string | null>(null);   // エラーメッセージ

  // 髪スワップ関連の状態
  const [hairOptions, setHairOptions] = useState<HairOption[]>([]);  // 利用可能な髪オプション
  const [selectedHair, setSelectedHair] = useState<string>('');      // 選択中の髪（"charKey::partKey" または空文字）
  const [hairLoading, setHairLoading] = useState(false);             // 髪読み込み中フラグ

  // アニメーション関連の状態
  const [animPlaying, setAnimPlaying] = useState(false);      // アニメーション再生中フラグ
  const [animReady, setAnimReady] = useState(false);          // アニメーションデータ読み込み完了フラグ
  const [selectedMotion, setSelectedMotion] = useState('');    // 選択中のモーションA
  const [selectedMotionB, setSelectedMotionB] = useState(''); // 選択中のモーションB（ブレンド用）
  const [blendDuration, setBlendDuration] = useState(30);     // クロスフェードのフレーム数
  const motionDataRef = useRef<MotionData | null>(null);      // モーションAデータの参照
  const motionDataBRef = useRef<MotionData | null>(null);     // モーションBデータの参照
  const segmentsDataRef = useRef<SegmentsData | null>(null);  // セグメントデータの参照
  const boneHierarchyRef = useRef<BoneHierarchyEntry[]>([]);  // ボーン階層の参照
  const animFrameRef = useRef(0);                             // 現在のアニメーションフレーム
  const frameDisplayRef = useRef<HTMLSpanElement>(null);       // フレーム表示用DOM要素の参照
  // restVoxelsRef削除済み — アニメーションにはfreezeWorldMatrixを使用
  const [hairSizeDiff, setHairSizeDiff] = useState<string>('');  // 髪スワップ時のサイズ差表示
  const voxelScaleRef = useRef<number>(SCALE);                // 現在のボクセルスケール
  const jointBonesRef = useRef<Record<string, [string, string]>>({}); // ジョイントキー→[ボーンA, ボーンB]
  const bodyAnchorsRef = useRef<AnchorPoints | null>(null);   // ボディの頭部アンカーポイント

  // 個別パーツの表示/非表示トグル関数
  const togglePart = useCallback((key: string) => {
    setPartVisibility(prev => {
      const next = { ...prev, [key]: !prev[key] };
      const mesh = meshesRef.current[key];
      if (mesh) mesh.setEnabled(next[key]);  // メッシュの有効/無効を切り替え
      return next;
    });
  }, []);

  // 全パーツの一括表示/非表示トグル関数
  const toggleAll = useCallback((on: boolean) => {
    setPartVisibility(prev => {
      const next: Record<string, boolean> = {};
      for (const key in prev) {
        next[key] = on;
        const mesh = meshesRef.current[key];
        if (mesh) mesh.setEnabled(on);
      }
      return next;
    });
  }, []);

  // カテゴリ別（ボディ/パーツ）の一括表示/非表示トグル関数
  const toggleCategory = useCallback((isBody: boolean, on: boolean) => {
    setPartVisibility(prev => {
      const next = { ...prev };
      for (const p of parts) {
        if (p.is_body === isBody) {
          next[p.key] = on;
          const mesh = meshesRef.current[p.key];
          if (mesh) mesh.setEnabled(on);
        }
      }
      return next;
    });
  }, [parts]);

  // 同性別の全キャラクターから髪オプションを収集する副作用
  useEffect(() => {
    const currentGender = CHARACTERS[charKey]?.gender;
    if (!currentGender) return;
    let cancelled = false;  // キャンセルフラグ

    (async () => {
      // 同性別のキャラクターをフィルタ
      const sameGenderChars = Object.entries(CHARACTERS).filter(
        ([, cfg]) => cfg.gender === currentGender
      );

      const options: HairOption[] = [];
      // 全キャラクターのマニフェストを並行読み込み
      await Promise.all(
        sameGenderChars.map(async ([ck, cfg]) => {
          try {
            const resp = await fetch(cfg.manifest + CACHE_BUST);
            if (!resp.ok) return;
            const allParts: PartEntry[] = await resp.json();
            const manifestPath = cfg.manifest.replace(VOX_API + '/', '');
            const genderPrefix = manifestPath.split('/')[0];
            // 髪カテゴリのパーツを抽出
            const hairParts = allParts.filter(
              p => p.category === 'hair' || (p.key.includes('hair') && p.key !== 'body_hair' && !p.is_body)
            );
            // マニフェストパスからアンカーURLを構築
            const charFolder = manifestPath.split('/').slice(0, -1).join('/');
            const anchorsUrl = `${VOX_API}/${charFolder}/hair_anchors.json`;
            // 各髪パーツをオプションに追加
            for (const hp of hairParts) {
              const fullFile = hp.file.startsWith(VOX_API)
                ? hp.file
                : `${VOX_API}/${genderPrefix}${hp.file}`;
              options.push({
                label: `${cfg.label} - ${hp.meshes[0] || hp.key}`,
                charKey: ck,
                file: fullFile,
                partKey: hp.key,
                voxels: hp.voxels,
                anchorsUrl,
              });
            }
          } catch {
            // マニフェストが読み込めないキャラクターはスキップ
          }
        })
      );

      if (!cancelled) {
        options.sort((a, b) => a.label.localeCompare(b.label));  // ラベル順にソート
        setHairOptions(options);
      }
    })();

    return () => { cancelled = true; };  // クリーンアップ
  }, [charKey]);

  // 髪スワップ: 現在の髪メッシュを破棄し、選択された髪をロードしてアンカーベースでアライメント
  const swapHair = useCallback(async (hairId: string) => {
    const scene = sceneRef.current;
    const partMat = partMatRef.current;
    if (!scene || !partMat) return;

    setSelectedHair(hairId);
    setHairSizeDiff('');

    // 現在の髪パーツキーを全て検索して破棄
    const hairPartKeys = parts
      .filter(p => p.category === 'hair' || (p.key.includes('hair') && p.key !== 'body_hair' && !p.is_body))
      .map(p => p.key);
    for (const hk of hairPartKeys) {
      const mesh = meshesRef.current[hk];
      if (mesh) { mesh.dispose(); delete meshesRef.current[hk]; }
    }

    if (hairId === '') {
      // デフォルト髪に戻す: 現在のキャラクターの元の髪をリロード
      const config = CHARACTERS[charKey];
      if (!config) return;
      setHairLoading(true);
      try {
        const resp = await fetch(config.manifest + CACHE_BUST);
        if (!resp.ok) return;
        const allParts: PartEntry[] = await resp.json();
        const manifestPath = config.manifest.replace(VOX_API + '/', '');
        const genderPrefix = manifestPath.split('/')[0];
        // 髪パーツを再読み込み
        for (const hp of allParts) {
          if (!(hp.category === 'hair' || (hp.key.includes('hair') && hp.key !== 'body_hair' && !hp.is_body))) continue;
          const fullFile = hp.file.startsWith(VOX_API) ? hp.file : `${VOX_API}/${genderPrefix}${hp.file}`;
          try {
            const mesh = await loadVoxMesh(scene, fullFile, `part_${hp.key}`, voxelScaleRef.current);
            mesh.material = partMat;
            mesh.setEnabled(true);
            meshesRef.current[hp.key] = mesh;
            setPartVisibility(prev => ({ ...prev, [hp.key]: true }));
          } catch (e) {
            console.error(`Failed to reload hair ${fullFile}:`, e);
          }
        }
      } finally {
        setHairLoading(false);
      }
      return;
    }

    // 選択された髪をアンカーベースのアライメントでロード
    const option = hairOptions.find(o => `${o.charKey}::${o.partKey}` === hairId);
    if (!option) return;

    setHairLoading(true);
    try {
      // ソースキャラクターのアンカーを読み込み
      let sourceHairAnchors: AnchorPoints | null = null;
      let sourceBodyAnchors: AnchorPoints | null = null;
      let sourceVoxelSize = voxelScaleRef.current;
      try {
        const anchResp = await fetch(option.anchorsUrl + CACHE_BUST);
        if (anchResp.ok) {
          const anchData: HairAnchorsData = await anchResp.json();
          sourceHairAnchors = anchData.hairs?.[option.partKey] ?? null;
          sourceBodyAnchors = anchData.body_head ?? null;
          sourceVoxelSize = anchData.voxel_size;
        }
      } catch { /* アンカーが利用できない場合、現在のキャラクターのスケールにフォールバック */ }

      const targetBodyAnchors = bodyAnchorsRef.current;
      const swapKey = `swapped_hair_${option.partKey}`;  // スワップ後のパーツキー

      // 髪のVOXメッシュをロード
      const mesh = await loadVoxMesh(scene, option.file, `part_${swapKey}`, sourceVoxelSize);
      mesh.material = partMat;

      // アンカーベースのアライメントを適用
      if (targetBodyAnchors && sourceHairAnchors) {
        // スケール: ターゲットボディの頭部サイズ vs ソースボディの頭部サイズ
        const srcBody = sourceBodyAnchors || targetBodyAnchors;
        const scaleW = targetBodyAnchors.width / srcBody.width;   // 幅のスケール比
        const scaleD = targetBodyAnchors.depth / srcBody.depth;   // 奥行のスケール比
        const uniformScale = (scaleW + scaleD) / 2;               // 均一スケール（平均）

        mesh.scaling = new Vector3(uniformScale, uniformScale, uniformScale);  // スケーリング適用

        // 位置オフセット: 髪の接触頭頂部をターゲットボディの頭頂部に合わせる
        const offsetX = targetBodyAnchors.top[0] - sourceHairAnchors.top[0] * uniformScale;
        const offsetY = targetBodyAnchors.top[1] - sourceHairAnchors.top[1] * uniformScale + 2 * sourceVoxelSize;
        const offsetZ = targetBodyAnchors.top[2] - sourceHairAnchors.top[2] * uniformScale - 2 * sourceVoxelSize;
        mesh.position = new Vector3(offsetX, offsetY, offsetZ);

        // サイズ差をパーセンテージで表示
        const pctDiff = Math.round((uniformScale - 1) * 100);
        setHairSizeDiff(pctDiff === 0 ? '' : `${pctDiff > 0 ? '+' : ''}${pctDiff}%`);
      } else {
        // アンカーなし: 変換なし
        mesh.position = Vector3.Zero();
      }

      mesh.setEnabled(true);
      meshesRef.current[swapKey] = mesh;
      setPartVisibility(prev => ({ ...prev, [swapKey]: true }));

      // パーツリストを更新（既存の髪を除去し、スワップした髪を追加）
      setParts(prev => {
        const nonHair = prev.filter(
          p => !(p.category === 'hair' || (p.key.includes('hair') && p.key !== 'body_hair' && !p.is_body))
        );
        return [...nonHair, {
          key: swapKey,
          file: option.file,
          voxels: option.voxels,
          default_on: true,
          meshes: [option.label],
          is_body: false,
          category: 'hair',
        }];
      });
    } catch (e) {
      console.error(`Failed to load swapped hair:`, e);
    } finally {
      setHairLoading(false);
    }
  }, [parts, charKey, hairOptions]);

  // シーン初期化の副作用（マウント時に1回実行）
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Babylon.jsエンジンを作成（アンチエイリアスなし、パフォーマンス重視）
    const engine = new Engine(canvas, false, { preserveDrawingBuffer: false });
    const scene = new Scene(engine);
    sceneRef.current = scene;
    scene.clearColor = new Color4(0.06, 0.06, 0.10, 1);  // 暗い背景色

    // アークロテートカメラの作成と設定
    const camera = new ArcRotateCamera('cam', -Math.PI / 4, Math.PI / 3, 3.0, new Vector3(0, 0.8, 0), scene);
    camera.attachControl(canvas, true);
    camera.lowerRadiusLimit = 0.3;   // 最小ズーム距離
    camera.upperRadiusLimit = 15;    // 最大ズーム距離
    camera.wheelPrecision = 80;      // ズーム感度

    // 半球ライト（環境光）
    const hemi = new HemisphericLight('hemi', new Vector3(0.3, 1, 0.5), scene);
    hemi.intensity = 0.85;
    hemi.groundColor = new Color3(0.2, 0.2, 0.25);  // 地面反射色

    // ディレクショナルライト
    const dir = new DirectionalLight('dir', new Vector3(-0.5, -1, -0.8), scene);
    dir.intensity = 0.45;

    // グラウンドメッシュ（ワイヤーフレームグリッド）
    const ground = MeshBuilder.CreateGround('ground', { width: 10, height: 10, subdivisions: 10 }, scene);
    const gm = new StandardMaterial('gm', scene);
    gm.diffuseColor = new Color3(0.12, 0.12, 0.16);
    gm.specularColor = Color3.Black();
    gm.wireframe = true;
    gm.freeze();  // マテリアルをフリーズ（パフォーマンス最適化）
    ground.material = gm;
    ground.freezeWorldMatrix();  // ワールド行列をフリーズ

    // ボディ用マテリアル（照明無効、頂点カラーで表示）
    const bodyMat = new StandardMaterial('bodyMat', scene);
    bodyMat.emissiveColor = Color3.White();   // エミッシブを白に（照明の影響なし）
    bodyMat.disableLighting = true;           // ライティング無効
    bodyMat.backFaceCulling = false;          // 両面描画
    bodyMat.freeze();
    bodyMatRef.current = bodyMat;

    // パーツ用マテリアル（ボディの上に描画するためzOffset付き）
    const partMat = new StandardMaterial('partMat', scene);
    partMat.emissiveColor = Color3.White();
    partMat.disableLighting = true;
    partMat.backFaceCulling = false;
    partMat.zOffset = -2;  // Zオフセットでボディの手前に描画
    partMat.freeze();
    partMatRef.current = partMat;

    engine.runRenderLoop(() => scene.render());  // レンダリングループ開始
    const onResize = () => engine.resize();
    window.addEventListener('resize', onResize);

    // クリーンアップ
    return () => {
      window.removeEventListener('resize', onResize);
      engine.dispose();
      sceneRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // キャラクター変更時にパーツを読み込む副作用
  useEffect(() => {
    const scene = sceneRef.current;
    const bodyMat = bodyMatRef.current;
    const partMat = partMatRef.current;
    if (!scene || !bodyMat || !partMat) return;

    let cancelled = false;

    (async () => {
      setLoading(true);
      setError(null);
      setSelectedHair('');
      setHairSizeDiff('');
      bodyAnchorsRef.current = null;

      // 既存メッシュを破棄
      for (const mesh of Object.values(meshesRef.current)) {
        mesh.dispose();
      }
      meshesRef.current = {};

      const config = CHARACTERS[charKey];
      if (!config) {
        setError(`Unknown character: ${charKey}`);
        setLoading(false);
        return;
      }

      try {
        // grid.jsonを読み込んでボクセルサイズを取得（正しい物理スケール）
        const gridResp = await fetch(config.gridJson + CACHE_BUST);
        let voxelScale = SCALE;
        if (gridResp.ok) {
          const grid: GridInfo = await gridResp.json();
          voxelScale = grid.voxel_size;
        }
        voxelScaleRef.current = voxelScale;

        const manifestPath = config.manifest.replace(VOX_API + '/', '');
        const genderPrefix = manifestPath.split('/')[0];
        const charFolder = manifestPath.split('/').slice(0, -1).join('/');

        // バンドルベースの高速ロードを最初に試行（単一ファイル）
        const bundleUrl = `${VOX_API}/${charFolder}/segments_bundle.json`;
        const bundleResp = await fetch(bundleUrl + CACHE_BUST);

        if (bundleResp.ok && config.category === 'base') {
          // 高速パス: バンドルファイルから全ボーンメッシュを一括構築
          const bundle: SegmentBundleData = await bundleResp.json();
          if (cancelled) return;

          const builtMeshes = buildBundleMeshes(bundle, scene, bodyMat, voxelScale);
          const vis: Record<string, boolean> = {};
          const partEntries: PartEntry[] = [];
          for (const boneName of Object.keys(builtMeshes)) {
            meshesRef.current[boneName] = builtMeshes[boneName];
            vis[boneName] = true;
            partEntries.push({ key: boneName, file: '', voxels: 0, default_on: true, meshes: [boneName], is_body: true });
          }
          setParts(partEntries);
          setPartVisibility(vis);
          jointBonesRef.current = {};
        } else {
          // フォールバック: 個別VOXファイルの読み込み（非ベースキャラクター）
          const resp = await fetch(config.manifest + CACHE_BUST);
          if (!resp.ok) {
            setError(`${config.label}: parts.json not found.`);
            setLoading(false);
            return;
          }
          const allParts: PartEntry[] = await resp.json();
          if (cancelled) return;
          // ファイルパスにAPIプレフィックスを付与
          for (const p of allParts) {
            if (!p.file.startsWith(VOX_API)) {
              p.file = `${VOX_API}/${genderPrefix}${p.file}`;
            }
          }
          setParts(allParts);

          // パーツの表示状態とジョイントボーンマッピングを構築
          const vis: Record<string, boolean> = {};
          const jointBonesMap: Record<string, [string, string]> = {};
          for (const part of allParts) {
            vis[part.key] = part.default_on;
            const partAnyJ = part as unknown as Record<string, unknown>;
            if (partAnyJ.joint_bones && Array.isArray(partAnyJ.joint_bones)) {
              jointBonesMap[part.key] = partAnyJ.joint_bones as [string, string];
            }
          }

          // 全パーツのVOXメッシュを並行読み込み
          const meshResults = await Promise.all(
            allParts.map(async (part) => {
              try {
                return { part, mesh: await loadVoxMesh(scene, part.file, `part_${part.key}`, voxelScale) };
              } catch { return null; }
            })
          );
          if (cancelled) { for (const r of meshResults) if (r) r.mesh.dispose(); return; }
          // メッシュにマテリアルを設定して登録
          for (const r of meshResults) {
            if (!r) continue;
            r.mesh.material = (r.part.is_body && r.part.key !== 'eyes') ? bodyMat : partMat;
            r.mesh.setEnabled(vis[r.part.key] ?? true);
            meshesRef.current[r.part.key] = r.mesh;
          }
          setPartVisibility(vis);
          jointBonesRef.current = jointBonesMap;
        }
        setLoading(false);
      } catch (e) {
        if (!cancelled) {
          setError('Failed to load parts manifest');
          setLoading(false);
          console.error(e);
        }
      }
    })();

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [charKey]);

  // ベースボディ/分割キャラクター用のアニメーションデータ読み込み
  useEffect(() => {
    if (CHARACTERS[charKey]?.category !== 'base') return;  // ベースカテゴリ以外はスキップ
    const config = CHARACTERS[charKey];
    if (!config) return;
    // マニフェストパスからフォルダ名を抽出
    const manifestPath = config.manifest.replace(VOX_API + '/', '');
    const pathParts = manifestPath.split('/');
    const gender = pathParts[0];
    const folderName = pathParts[1];

    // モデルごとのデフォルトモーション
    const defaultMotion: Record<string, string> = {
      'CyberpunkElf-Detailed': 'walk_cycle_arp.motion.json',
      'BunnyAkali-Base': 'bunnyakali_cozywinter.motion.json',
      'DarkElfBlader-Base': 'darkelfblader_titsuck.motion.json',
    };
    const motionFile = selectedMotion || defaultMotion[folderName] || 'walk_cycle_arp.motion.json';

    (async () => {
      try {
        // segments.json（ボーン位置情報）を読み込み
        const segResp = await fetch(`${VOX_API}/${gender}/${folderName}/segments.json${CACHE_BUST}`);
        if (segResp.ok) {
          const segData: SegmentsData = await segResp.json();
          segmentsDataRef.current = segData;
          boneHierarchyRef.current = buildBoneHierarchy(segData);  // ボーン階層を構築
        }
        // 選択されたモーションファイルを読み込み
        const motionResp = await fetch(`${GAME_ASSETS_API}/motion/${motionFile}${CACHE_BUST}`);
        if (motionResp.ok) {
          const motionJson = await motionResp.json();
          // 生フォーマットの場合はBabylon.js形式に変換
          if (motionJson.format === 'blender_raw') {
            motionDataRef.current = processRawMotionData(motionJson as RawMotionData);
          } else {
            motionDataRef.current = motionJson;
          }
          setAnimReady(true);
        }
      } catch (e) {
        console.error('Failed to load animation data:', e);
      }
    })();

    // クリーンアップ
    return () => {
      motionDataRef.current = null;
      segmentsDataRef.current = null;
      boneHierarchyRef.current = [];
      setAnimPlaying(false);
      setAnimReady(false);
    };
  }, [charKey, selectedMotion]);

  // ブレンド用モーションBの読み込み
  useEffect(() => {
    if (!selectedMotionB || CHARACTERS[charKey]?.category !== 'base') {
      motionDataBRef.current = null;
      return;
    }
    (async () => {
      try {
        const resp = await fetch(`${GAME_ASSETS_API}/motion/${selectedMotionB}${CACHE_BUST}`);
        if (resp.ok) {
          const json = await resp.json();
          // 生フォーマットの場合は変換
          motionDataBRef.current = json.format === 'blender_raw'
            ? processRawMotionData(json as RawMotionData) : json;
        }
      } catch (e) {
        console.error('Failed to load Motion B:', e);
      }
    })();
    return () => { motionDataBRef.current = null; };
  }, [charKey, selectedMotionB]);

  // Note: レストポーズ頂点の保存は削除済み — アニメーションにはfreezeWorldMatrixを使用（頂点単位の変換なし）

  // アニメーションループ — requestAnimationFrameとフレームレート制限、React状態更新なし
  useEffect(() => {
    if (!animPlaying) return;  // 再生中でなければスキップ
    const motion = motionDataRef.current;
    if (!motion) return;

    let frameCounter = animFrameRef.current;  // フレームカウンター
    const motionB = motionDataBRef.current;
    const frameDuration = 1000 / (motion.fps || 30);  // 1フレームの時間（ミリ秒）
    const blendFrames = blendDuration;
    // 合計フレーム: モーションA全体 + ブレンド遷移 + モーションB全体（B存在時）
    const totalFramesA = motion.frame_count;
    const totalFrames = motionB
      ? totalFramesA + motionB.frame_count
      : totalFramesA;

    // ボーン名マッピングの構築（セグメント名→モーションボーン名）
    const allBoneSets = [new Set(Object.keys(motion.bones))];
    if (motionB) allBoneSets.push(new Set(Object.keys(motionB.bones)));
    const boneNameMap: Record<string, string> = {};
    // メッシュキーからモーションボーン名を解決
    for (const segKey of Object.keys(meshesRef.current)) {
      for (const boneSet of allBoneSets) {
        const resolved = resolveMotionBoneName(segKey, boneSet);
        if (resolved) { boneNameMap[segKey] = resolved; break; }
      }
    }
    // ボーン階層エントリからもモーションボーン名を解決
    for (const entry of boneHierarchyRef.current) {
      if (!boneNameMap[entry.bone]) {
        for (const boneSet of allBoneSets) {
          const resolved = resolveMotionBoneName(entry.bone, boneSet);
          if (resolved) { boneNameMap[entry.bone] = resolved; break; }
        }
      }
    }
    let lastTime = 0;
    let rafId = 0;

    // 行列配列→Babylon.js Matrixへの変換関数
    // babylonFormat: 既にBabylon規約、直接使用
    // レガシーフォーマット: Blender行優先、転置が必要
    const isBabylon = motion.babylonFormat === true;
    const toMatrix = (m: number[]) => isBabylon
      ? Matrix.FromArray(m)
      : Matrix.FromArray([
          m[0], m[4], m[8],  m[12],
          m[1], m[5], m[9],  m[13],
          m[2], m[6], m[10], m[14],
          m[3], m[7], m[11], m[15],
        ]);

    // アニメーションティック関数（requestAnimationFrameコールバック）
    const tick = (now: number) => {
      rafId = requestAnimationFrame(tick);
      const elapsed = now - lastTime;
      if (elapsed < frameDuration) return;  // フレーム時間未満なら描画をスキップ
      lastTime = now - (elapsed % frameDuration);

      frameCounter = (frameCounter + 1) % totalFrames;  // フレームカウンターを進める（ループ）
      animFrameRef.current = frameCounter;

      // サンプルするモーションとブレンド比率の決定
      let frameA = -1, frameB = -1, blendT = 0;
      if (!motionB) {
        frameA = frameCounter;  // 単一モーション: Aをループ
      } else if (frameCounter < totalFramesA - blendFrames) {
        frameA = frameCounter;  // 純粋なモーションA
      } else if (frameCounter < totalFramesA) {
        // A→Bのクロスフェード区間
        frameA = frameCounter;
        frameB = frameCounter - (totalFramesA - blendFrames);
        blendT = (frameCounter - (totalFramesA - blendFrames)) / blendFrames;
      } else {
        frameB = frameCounter - totalFramesA + blendFrames;  // 純粋なモーションB
      }

      // フレーム表示をDOM直接操作で更新（React再レンダリングを回避）
      if (frameDisplayRef.current) {
        const phase = blendT > 0 ? ` [blend ${Math.round(blendT*100)}%]` : (frameB >= 0 && frameA < 0 ? ' [B]' : '');
        frameDisplayRef.current.textContent = `Frame: ${frameCounter}/${totalFrames}${phase}`;
      }

      // ボクセル→バインドポーズのオフセット補正（babylonFormat/blender_raw処理済み行列のみ）
      const segData = segmentsDataRef.current;
      let ox = 0, oy = 0, oz = 0;
      if (isBabylon && segData?.bb_min) {
        const g = segData.grid, sc = segData.voxel_size;
        ox = -(g.gx / 2) * sc - segData.bb_min[0];  // Xオフセット
        oy = -segData.bb_min[2];                       // Yオフセット
        oz = (g.gy / 2) * sc + segData.bb_min[1];     // Zオフセット
      }
      const hasOffset = isBabylon && (Math.abs(ox) > 0.001 || Math.abs(oy) > 0.001 || Math.abs(oz) > 0.001);

      // Babylon形式のスキン行列にボクセル-バインドオフセット補正を適用する関数
      const correctMatrix = (m: number[]): number[] => {
        if (!hasOffset) return m;
        const c = m.slice();  // コピーを作成
        // 平行移動成分を補正
        c[12] = m[12] - (ox * m[0] + oy * m[4] + oz * m[8]) + ox;
        c[13] = m[13] - (ox * m[1] + oy * m[5] + oz * m[9]) + oy;
        c[14] = m[14] - (ox * m[2] + oy * m[6] + oz * m[10]) + oz;
        return c;
      };

      // 現在のフレームでのブレンド済み行列を取得する関数
      const getBlendedRaw = (boneName: string): number[] | undefined => {
        const motionName = boneNameMap[boneName] || boneName;
        let matA: number[] | undefined;
        let matBm: number[] | undefined;
        // モーションAのフレーム行列を取得
        if (frameA >= 0) {
          const d = motion.bones[motionName];
          if (d) matA = d.matrices[Math.min(frameA, d.matrices.length - 1)];
        }
        // モーションBのフレーム行列を取得
        if (frameB >= 0 && motionB) {
          const d = motionB.bones[motionName];
          if (d) matBm = d.matrices[Math.min(frameB, d.matrices.length - 1)];
        }
        // 両方存在しブレンド中なら線形補間
        if (matA && matBm && blendT > 0) {
          return matA.map((v, i) => v * (1 - blendT) + matBm[i] * blendT);
        }
        return matA || matBm;  // 片方のみならそちらを返す
      };

      // ジョイント補正カスケード（ルート→リーフ順にオフセット補正済み行列を適用）
      const hierarchy = boneHierarchyRef.current;
      const applyPoint = isBabylon ? applyMatPointBabylon : applyMatPointBlender;
      const correctedMats: Record<string, number[]> = {};
      if (hierarchy.length > 0) {
        for (const entry of hierarchy) {
          const blendedRaw = getBlendedRaw(entry.bone);
          let raw: number[] | undefined;
          if (blendedRaw) {
            raw = correctMatrix(blendedRaw);  // オフセット補正を適用
          } else if (entry.parent && correctedMats[entry.parent]) {
            raw = correctedMats[entry.parent];  // 親の行列を継承
          }
          if (!raw) continue;
          if (!entry.parent || !correctedMats[entry.parent]) {
            correctedMats[entry.bone] = raw;  // ルートボーンはそのまま
          } else {
            // 親子間のジョイント補正: ジョイントポイントでの位置ずれを解消
            const parentMat = correctedMats[entry.parent];
            const jp = entry.jointPoint;
            const pByParent = applyPoint(parentMat, jp);  // 親行列でジョイントポイントを変換
            const pByChild = applyPoint(raw, jp);          // 子行列でジョイントポイントを変換
            const corrected = raw.slice();
            // 平行移動成分を補正して位置ずれを解消
            corrected[12] += pByParent[0] - pByChild[0];
            corrected[13] += pByParent[1] - pByChild[1];
            corrected[14] += pByParent[2] - pByChild[2];
            correctedMats[entry.bone] = corrected;
          }
        }
      }

      // 行列をメッシュに適用
      for (const [segKey, mesh] of Object.entries(meshesRef.current)) {
        let skinMat: Matrix | null = null;
        const jointBones = jointBonesRef.current[segKey];
        if (jointBones) {
          // ジョイントボーンの場合: 2つのボーン行列を平均
          const [boneJA, boneJB] = jointBones;
          const matJA = correctedMats[boneJA] || getBlendedRaw(boneJA);
          const matJB = correctedMats[boneJB] || getBlendedRaw(boneJB);
          if (matJA && matJB) {
            const blended = matJA.map((v: number, i: number) => (v + matJB[i]) / 2);
            skinMat = toMatrix(blended);
          } else if (matJA) {
            skinMat = toMatrix(matJA);
          } else if (matJB) {
            skinMat = toMatrix(matJB);
          }
        } else {
          // 通常のボーン: 補正済みまたはブレンド済み行列を使用
          const mat = correctedMats[segKey] || getBlendedRaw(segKey);
          if (!mat) continue;
          skinMat = toMatrix(mat);
        }
        if (!skinMat) continue;
        mesh.freezeWorldMatrix(skinMat);  // ワールド行列をフリーズ（パフォーマンス最適化）
      }
    };

    rafId = requestAnimationFrame(tick);  // アニメーションループ開始
    return () => cancelAnimationFrame(rafId);  // クリーンアップ
  }, [animPlaying]);

  // パーツキーを表示用ラベルに変換する関数（アンダースコア→スペース、先頭大文字化）
  const partLabel = (key: string) => {
    return key.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
      .replace('  ', ' ').trim();
  };

  // ボディパーツとそれ以外（衣装・アクセサリ）を分類
  const bodyParts = parts.filter(p => p.is_body);
  const clothingParts = parts.filter(p => !p.is_body);

  // JSXレンダリング
  return (
    // 全画面フレックスレイアウト（サイドパネル＋3Dキャンバス）
    <div style={{ width: '100vw', height: '100vh', overflow: 'hidden', background: '#101018', display: 'flex' }}>
      {/* サイドパネル */}
      <div style={{
        width: 280, minWidth: 280, padding: '14px 16px', overflowY: 'auto',
        background: 'rgba(0,0,0,0.55)', color: '#ddd', fontFamily: 'monospace', fontSize: 12,
        borderRight: '1px solid rgba(255,255,255,0.08)',
      }}>
        {/* タイトル */}
        <h2 style={{ margin: '0 0 6px', fontSize: 16, color: '#fff' }}>
          Realistic Viewer
        </h2>
        <p style={{ margin: '0 0 8px', fontSize: 10, color: '#888' }}>
          Original proportions - no deformation
        </p>

        {/* カテゴリセレクター（base/female/male/weapons） */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
          {(['base', 'female', 'male', 'weapons'] as CharCategory[]).map(cat => (
            <button key={cat} onClick={() => {
              setSelectedCategory(cat);
              // カテゴリ内の最初のキャラクターを自動選択
              const first = Object.entries(CHARACTERS).find(([, c]) => c.category === cat);
              if (first) setCharKey(first[0]);
            }} style={{
              flex: 1, padding: '5px 0', fontSize: 11, fontWeight: selectedCategory === cat ? 'bold' : 'normal',
              border: selectedCategory === cat ? '2px solid #fa0' : '1px solid #555',
              borderRadius: 4, cursor: 'pointer',
              background: selectedCategory === cat ? 'rgba(180,120,0,0.25)' : 'rgba(40,40,60,0.4)',
              color: selectedCategory === cat ? '#fda' : '#999',
              textTransform: 'capitalize',
            }}>
              {cat}
            </button>
          ))}
        </div>
        {/* キャラクターセレクター（ドロップダウン） */}
        <select
          value={charKey}
          onChange={(e) => setCharKey(e.target.value)}
          style={{
            width: '100%', padding: '6px 8px', fontSize: 12, marginBottom: 14,
            background: '#1a1a2e', color: '#fda', border: '1px solid #fa0',
            borderRadius: 4, cursor: 'pointer', fontFamily: 'monospace',
          }}
        >
          {/* 選択中のカテゴリのキャラクターのみ表示 */}
          {Object.entries(CHARACTERS)
            .filter(([, c]) => c.category === selectedCategory)
            .map(([key, config]) => (
              <option key={key} value={key}>{config.label}</option>
            ))}
        </select>

        {/* アニメーションコントロール（ベースボディのみ表示） */}
        {CHARACTERS[charKey]?.category === 'base' && !loading && animReady && (
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontWeight: 'bold', color: '#fa0', fontSize: 13, marginBottom: 6 }}>
              Animation
            </div>
            {/* モーションAセレクター */}
            <select
              value={selectedMotion}
              onChange={(e) => { setAnimPlaying(false); setSelectedMotion(e.target.value); }}
              style={{
                width: '100%', padding: '4px 6px', fontSize: 11, marginBottom: 6,
                background: '#1a1a2e', color: '#ddd', border: '1px solid #555',
                borderRadius: 4, fontFamily: 'monospace',
              }}
            >
              <option value="">Walk Cycle (default)</option>
              <option value="ero_pose_01.motion.json">Ero Pose 01</option>
              <option value="ero_pose_02.motion.json">Ero Pose 02</option>
              <option value="ero_pose_03.motion.json">Ero Pose 03</option>
              <option value="nursing_handjob.motion.json">Nursing Handjob (CE)</option>
              <option value="nursing_handjob_qm.motion.json">Nursing Handjob (QM)</option>
              <option value="doggy_qm.motion.json">Doggy (QM)</option>
              <option value="blowjob_qm.motion.json">Blowjob (QM)</option>
              <option value="reverse_cowgirl_qm.motion.json">Reverse Cowgirl (QM)</option>
              <option value="amazon_qm.motion.json">Amazon (QM)</option>
              <option value="missionary_qm.motion.json">Missionary (QM)</option>
              <option value="tall_qm.motion.json">Tall (QM)</option>
              <option value="tallqueenspooning_qm_detailed.motion.json">TallQueen Spooning (QM Detailed)</option>
              <option value="spin_qm_detailed.motion.json">Spin (QM Detailed)</option>
              <option value="riding_default.motion.json">Riding Default</option>
              <option value="riding_full_start.motion.json">Riding Full Start</option>
              <option value="riding_mid.motion.json">Riding Mid</option>
              <option value="riding_loop_extended.motion.json">Riding Loop Extended</option>
              <option value="riding_loop_extended_raw.motion.json">Riding Loop Extended (RAW/New)</option>
              <option value="bunnyakali_cozywinter.motion.json">BunnyAkali CozyWinter</option>
              <option value="bunnyakali_reversecowgirl.motion.json">BunnyAkali ReverseCowgirl</option>
              <option value="darkelfblader_titsuck.motion.json">DarkElfBlader TitSuck</option>
            </select>
            {/* モーションBセレクター（ブレンド先） */}
            <div style={{ fontSize: 10, color: '#888', marginBottom: 2 }}>Motion B (blend to)</div>
            <select
              value={selectedMotionB}
              onChange={(e) => { setAnimPlaying(false); setSelectedMotionB(e.target.value); }}
              style={{
                width: '100%', padding: '4px 6px', fontSize: 11, marginBottom: 4,
                background: '#1a1a2e', color: '#adf', border: '1px solid #446',
                borderRadius: 4, fontFamily: 'monospace',
              }}
            >
              <option value="">(none - loop A)</option>
              <option value="walk_cycle_arp.motion.json">Walk Cycle</option>
              <option value="bunnyakali_cozywinter.motion.json">BunnyAkali CozyWinter</option>
              <option value="bunnyakali_reversecowgirl.motion.json">BunnyAkali ReverseCowgirl</option>
              <option value="darkelfblader_titsuck.motion.json">DarkElfBlader TitSuck</option>
              <option value="riding_loop_extended_raw.motion.json">Riding Loop Extended (RAW)</option>
            </select>
            {/* ブレンド持続時間スライダー（モーションB選択時のみ表示） */}
            {selectedMotionB && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 4 }}>
                <span style={{ fontSize: 10, color: '#888' }}>Blend:</span>
                <input
                  type="range" min={5} max={120} value={blendDuration}
                  onChange={(e) => setBlendDuration(Number(e.target.value))}
                  style={{ flex: 1 }}
                />
                <span style={{ fontSize: 10, color: '#adf', minWidth: 35 }}>{blendDuration}f</span>
              </div>
            )}
            {/* 再生/停止ボタンとフレーム表示 */}
            <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
              <button
                onClick={() => setAnimPlaying(!animPlaying)}
                style={{
                  padding: '6px 16px', fontSize: 12, fontWeight: 'bold',
                  border: animPlaying ? '2px solid #f44' : '2px solid #4f4',
                  borderRadius: 4, cursor: 'pointer', fontFamily: 'monospace',
                  background: animPlaying ? 'rgba(80,20,20,0.4)' : 'rgba(20,80,20,0.4)',
                  color: animPlaying ? '#faa' : '#afa',
                }}
              >
                {animPlaying ? 'Stop' : 'Play'}
              </button>
              {/* フレーム表示（DOM直接更新用ref） */}
              <span ref={frameDisplayRef} style={{ fontSize: 10, color: '#888' }}>
                Frame: {animFrameRef.current}/{motionDataRef.current?.frame_count || 0}
              </span>
            </div>
          </div>
        )}

        {/* ローディング表示 */}
        {loading && (
          <div style={{ color: '#8af', fontSize: 13, padding: '20px 0' }}>
            Loading parts...
          </div>
        )}

        {/* エラー表示 */}
        {error && (
          <div style={{ color: '#f88', fontSize: 12, padding: '10px', background: 'rgba(200,50,50,0.15)', borderRadius: 4 }}>
            {error}
          </div>
        )}

        {/* 読み込み完了後の操作パネル */}
        {!loading && !error && (
          <>
            {/* 全パーツ一括ON/OFFボタン */}
            <div style={{ display: 'flex', gap: 4, marginBottom: 14 }}>
              <button onClick={() => toggleAll(true)} style={{
                flex: 1, padding: '6px 0', fontSize: 11, fontWeight: 'bold',
                border: '1px solid #4a4', borderRadius: 4,
                background: 'rgba(40,80,40,0.3)', color: '#afa', cursor: 'pointer',
              }}>
                All ON
              </button>
              <button onClick={() => toggleAll(false)} style={{
                flex: 1, padding: '6px 0', fontSize: 11, fontWeight: 'bold',
                border: '1px solid #a44', borderRadius: 4,
                background: 'rgba(80,40,40,0.3)', color: '#faa', cursor: 'pointer',
              }}>
                All OFF
              </button>
            </div>

            {/* 髪スワップセクション */}
            {hairOptions.length > 0 && (
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontWeight: 'bold', color: '#f8c', fontSize: 13, marginBottom: 6 }}>
                  Hair Swap {hairLoading && <span style={{ fontSize: 10, color: '#8af' }}>(loading...)</span>}
                  {/* サイズ差表示（30%以上で赤、それ以下で緑） */}
                  {hairSizeDiff && (
                    <span style={{
                      fontSize: 10, marginLeft: 6,
                      color: Math.abs(parseInt(hairSizeDiff)) > 30 ? '#f88' : '#8f8',
                    }}>
                      size: {hairSizeDiff}
                    </span>
                  )}
                </div>
                {/* 髪選択ドロップダウン */}
                <select
                  value={selectedHair}
                  onChange={(e) => swapHair(e.target.value)}
                  disabled={hairLoading}
                  style={{
                    width: '100%', padding: '6px 8px', fontSize: 11,
                    background: '#1a1a2e', color: '#ddd', border: '1px solid #555',
                    borderRadius: 4, cursor: 'pointer', fontFamily: 'monospace',
                  }}
                >
                  <option value="">-- Default (own hair) --</option>
                  {hairOptions.map((opt, idx) => (
                    <option key={`${opt.charKey}::${opt.partKey}::${idx}`} value={`${opt.charKey}::${opt.partKey}`}>
                      {opt.label} ({opt.voxels.toLocaleString()})
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* ボディセクション */}
            {bodyParts.length > 0 && (
              <>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                  <span style={{ fontWeight: 'bold', color: '#8c8', fontSize: 13 }}>
                    Body ({bodyParts.length})
                  </span>
                  {/* ボディ一括ON/OFFボタン */}
                  <div style={{ display: 'flex', gap: 3 }}>
                    <button onClick={() => toggleCategory(true, true)} style={{
                      padding: '2px 6px', fontSize: 9, border: '1px solid #4a4', borderRadius: 3,
                      background: 'transparent', color: '#8c8', cursor: 'pointer',
                    }}>ON</button>
                    <button onClick={() => toggleCategory(true, false)} style={{
                      padding: '2px 6px', fontSize: 9, border: '1px solid #a44', borderRadius: 3,
                      background: 'transparent', color: '#c88', cursor: 'pointer',
                    }}>OFF</button>
                  </div>
                </div>
                {/* ボディパーツ一覧（クリックでトグル） */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 3, marginBottom: 14 }}>
                  {bodyParts.map(part => (
                    <button key={part.key} onClick={() => togglePart(part.key)} style={{
                      padding: '5px 10px', fontSize: 11, textAlign: 'left',
                      border: partVisibility[part.key] ? '2px solid #6a6' : '1px solid #444',
                      borderRadius: 4,
                      background: partVisibility[part.key] ? 'rgba(40,80,40,0.35)' : 'rgba(30,30,50,0.6)',
                      color: partVisibility[part.key] ? '#cec' : '#666',
                      cursor: 'pointer',
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    }}>
                      <span>{partLabel(part.key)}</span>
                      <span style={{ fontSize: 9, opacity: 0.5 }}>{part.voxels.toLocaleString()}</span>
                    </button>
                  ))}
                </div>
              </>
            )}

            {/* 衣装・アクセサリセクション */}
            {clothingParts.length > 0 && (
              <>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                  <span style={{ fontWeight: 'bold', color: '#8af', fontSize: 13 }}>
                    Parts ({clothingParts.length})
                  </span>
                  {/* パーツ一括ON/OFFボタン */}
                  <div style={{ display: 'flex', gap: 3 }}>
                    <button onClick={() => toggleCategory(false, true)} style={{
                      padding: '2px 6px', fontSize: 9, border: '1px solid #48f', borderRadius: 3,
                      background: 'transparent', color: '#8af', cursor: 'pointer',
                    }}>ON</button>
                    <button onClick={() => toggleCategory(false, false)} style={{
                      padding: '2px 6px', fontSize: 9, border: '1px solid #a44', borderRadius: 3,
                      background: 'transparent', color: '#c88', cursor: 'pointer',
                    }}>OFF</button>
                  </div>
                </div>
                {/* パーツ一覧（クリックでトグル） */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                  {clothingParts.map(part => (
                    <button key={part.key} onClick={() => togglePart(part.key)} style={{
                      padding: '5px 10px', fontSize: 11, textAlign: 'left',
                      border: partVisibility[part.key] ? '2px solid #68f' : '1px solid #444',
                      borderRadius: 4,
                      background: partVisibility[part.key] ? 'rgba(60,60,180,0.35)' : 'rgba(30,30,50,0.6)',
                      color: partVisibility[part.key] ? '#fff' : '#666',
                      cursor: 'pointer',
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                        <span>{partLabel(part.key)}</span>
                        {/* 複数メッシュがある場合はメッシュ名を表示 */}
                        {part.meshes.length > 1 && (
                          <span style={{ fontSize: 9, opacity: 0.4 }}>
                            {part.meshes.join(', ')}
                          </span>
                        )}
                      </div>
                      <span style={{ fontSize: 9, opacity: 0.5 }}>{part.voxels.toLocaleString()}</span>
                    </button>
                  ))}
                </div>
              </>
            )}

            {/* フッター: 合計ボクセル数と操作説明 */}
            <div style={{
              marginTop: 16, paddingTop: 10,
              borderTop: '1px solid rgba(255,255,255,0.08)',
              fontSize: 10, opacity: 0.4, lineHeight: 1.6,
            }}>
              Total: {parts.reduce((s, p) => s + p.voxels, 0).toLocaleString()} voxels
              <br />
              Click parts to toggle on/off
            </div>
          </>
        )}

        {/* 操作ガイド */}
        <div style={{
          marginTop: 20, paddingTop: 12,
          borderTop: '1px solid rgba(255,255,255,0.08)',
          opacity: 0.4, fontSize: 10, lineHeight: 1.6,
        }}>
          Drag to rotate / Scroll to zoom / Right-drag to pan
        </div>
      </div>

      {/* 3Dキャンバス（フレックスで残り全幅を使用） */}
      <canvas ref={canvasRef} style={{ flex: 1, height: '100%' }} />
    </div>
  );
}
