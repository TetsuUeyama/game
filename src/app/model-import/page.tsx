'use client'; // クライアントサイドコンポーネントとして宣言

// React フックのインポート（状態管理・副作用・参照・メモ化コールバック）
import { useEffect, useRef, useState, useCallback } from 'react';
// Babylon.js コアモジュール群のインポート（3Dエンジン・シーン・カメラ・ライト・メッシュ・マテリアル等）
import {
  Engine, Scene, ArcRotateCamera, HemisphericLight, DirectionalLight,
  Vector3, Color3, Color4, Mesh, MeshBuilder, StandardMaterial,
  SceneLoader, AbstractMesh, HighlightLayer, Bone, Skeleton,
  Matrix, VertexData, Effect, ShaderMaterial,
} from '@babylonjs/core';
import '@babylonjs/loaders/glTF'; // glTF/GLBローダーの登録
import '@babylonjs/loaders/OBJ'; // OBJローダーの登録

// ========================================================================
// Types（型定義）
// ========================================================================
// テンプレートカテゴリの種別（体・髪・上半身・下半身・靴・手袋・全身スーツ・装飾品・除外）
type TemplateCategory =
  | 'body' | 'hair' | 'upper_body' | 'lower_body' | 'footwear'
  | 'gloves' | 'full_body_suit' | 'accessory' | 'exclude';

// パーツ設定: カテゴリ・メッシュ名・頂点数・表示状態
interface PartConfig {
  category: TemplateCategory; // パーツのカテゴリ分類
  meshName: string;           // メッシュの名前
  vertexCount: number;        // 頂点数
  visible: boolean;           // 表示/非表示フラグ
}

// インポート設定: ファイル名・パーツ情報・Tポーズ検出結果・タイムスタンプ
interface ImportConfig {
  fileName: string;                      // 読み込んだファイル名
  parts: Record<string, PartConfig>;     // パーツ名→設定のマップ
  tPoseStatus: TPoseStatus | null;       // Tポーズ検出状態
  timestamp: string;                     // 保存日時
}

// Tポーズ検出結果: 検出有無・Tポーズかどうか・両腕角度・ポーズ種別
interface TPoseStatus {
  detected: boolean;       // スケルトンが検出されたか
  isTPose: boolean;        // Tポーズと判定されたか
  leftArmAngle: number;    // 左腕の角度（度）
  rightArmAngle: number;   // 右腕の角度（度）
  poseType: 'T-pose' | 'A-pose' | 'other'; // ポーズの種類
}

// ボクセルエントリ: 3D座標(x,y,z)とRGB色値
interface VoxelEntry { x: number; y: number; z: number; r: number; g: number; b: number; }

const VSCALE = 0.01; // 1ボクセル = 0.01ワールド単位のスケール定数
const BODY_SIZE = { x: 85, y: 34, z: 102 }; // ボクセルグリッドのサイズ（幅85・奥行34・高さ102）

// カテゴリ情報: 各カテゴリの英語ラベル・日本語ラベル・表示色
const CATEGORY_INFO: Record<TemplateCategory, { label: string; labelJa: string; color: string }> = {
  body:           { label: 'Body',           labelJa: '体',           color: '#888888' }, // 体（灰色）
  hair:           { label: 'Hair',           labelJa: '髪',           color: '#cc8833' }, // 髪（茶色）
  upper_body:     { label: 'Upper Body',     labelJa: '上半身衣装',   color: '#4488cc' }, // 上半身衣装（青）
  lower_body:     { label: 'Lower Body',     labelJa: '下半身衣装',   color: '#44cc88' }, // 下半身衣装（緑）
  footwear:       { label: 'Footwear',       labelJa: 'ブーツ/靴',    color: '#885533' }, // 靴（暗い茶色）
  gloves:         { label: 'Gloves',         labelJa: '手袋',         color: '#aa6644' }, // 手袋（オレンジ茶）
  full_body_suit: { label: 'Full Body Suit', labelJa: '全身スーツ',   color: '#6644aa' }, // 全身スーツ（紫）
  accessory:      { label: 'Accessory',      labelJa: '装飾品',       color: '#ccaa44' }, // 装飾品（黄色）
  exclude:        { label: 'Exclude',        labelJa: '除外',         color: '#444444' }, // 除外（暗い灰色）
};

// カテゴリキーの配列を生成
const CATEGORIES = Object.keys(CATEGORY_INFO) as TemplateCategory[];

// カテゴリ→テンプレートVOXファイルのマッピング（シェルテンプレート）
const TEMPLATE_MAP: Record<string, string> = {
  hair: '/templates/hair_cap.vox',              // 髪用テンプレート
  upper_body: '/templates/shirt_shell.vox',     // 上半身用テンプレート
  lower_body: '/templates/pants_shell.vox',     // 下半身用テンプレート
  footwear: '/templates/boots_shell.vox',       // 靴用テンプレート
  gloves: '/templates/gloves_shell.vox',        // 手袋用テンプレート
  full_body_suit: '/templates/full_body_shell.vox', // 全身スーツ用テンプレート
};

// ========================================================================
// Auto-classify（メッシュ名からカテゴリを自動推定）
// ========================================================================
// メッシュ名のパターンマッチでカテゴリを推測する関数
function guessCategory(name: string): TemplateCategory {
  const n = name.toLowerCase(); // 小文字に変換して比較
  if (/body|skin|torso/.test(n)) return 'body';               // 体関連のキーワード
  if (/hair|bangs|ponytail|braid/.test(n)) return 'hair';     // 髪関連のキーワード
  if (/shoe|boot|foot|feet|sandal/.test(n)) return 'footwear'; // 靴関連のキーワード
  if (/glove|gauntlet|hand_wear/.test(n)) return 'gloves';    // 手袋関連のキーワード
  if (/pant|trouser|skirt|leg_wear|shorts|stocking|legging/.test(n)) return 'lower_body'; // 下半身衣装キーワード
  if (/shirt|jacket|coat|vest|top|chest|armor|bra|corset/.test(n)) return 'upper_body';   // 上半身衣装キーワード
  if (/suit|bodysuit|leotard/.test(n)) return 'full_body_suit'; // 全身スーツキーワード
  if (/necklace|earring|ring|belt|buckle|strap|cape|cloak|scarf|ribbon|bow|crown|tiara|helmet|hat|mask|visor|glasses|wing/.test(n)) return 'accessory'; // 装飾品キーワード
  if (/armature|skeleton|bone|rig|root|null|empty/.test(n)) return 'exclude'; // 除外対象（リグ・ボーン等）
  return 'accessory'; // どのパターンにも該当しない場合はアクセサリに分類
}

// ========================================================================
// T-pose detection（Tポーズ検出）
// ========================================================================
// スケルトンから腕のボーンを見つけてTポーズかどうかを判定する関数
function detectTPose(skeletons: Skeleton[]): TPoseStatus | null {
  if (skeletons.length === 0) return null; // スケルトンがなければnull返却
  // 左腕ボーンの名前パターン候補
  const leftPats = [/left.*upper.*arm/i, /left.*arm$/i, /l_upperarm/i, /leftarm/i, /arm\.l/i, /upperarm\.l/i];
  // 右腕ボーンの名前パターン候補
  const rightPats = [/right.*upper.*arm/i, /right.*arm$/i, /r_upperarm/i, /rightarm/i, /arm\.r/i, /upperarm\.r/i];

  let leftBone: Bone | null = null, rightBone: Bone | null = null; // 左右の腕ボーンを格納する変数
  // 全スケルトン・全ボーンを走査してパターンに一致するボーンを探す
  for (const sk of skeletons) {
    for (const bone of sk.bones) {
      // 左腕ボーンが未発見ならパターンマッチを試行
      if (!leftBone) for (const p of leftPats) { if (p.test(bone.name)) { leftBone = bone; break; } }
      // 右腕ボーンが未発見ならパターンマッチを試行
      if (!rightBone) for (const p of rightPats) { if (p.test(bone.name)) { rightBone = bone; break; } }
      if (leftBone && rightBone) break; // 両方見つかったらループ終了
    }
    if (leftBone && rightBone) break; // 外側ループも終了
  }
  // どちらのボーンも見つからなかった場合
  if (!leftBone && !rightBone) return { detected: false, isTPose: false, leftArmAngle: 0, rightArmAngle: 0, poseType: 'other' };

  // ボーンの水平面からの角度を計算する内部関数
  const getAngle = (bone: Bone | null) => {
    if (!bone) return 0; // ボーンがnullなら0度
    const dir = new Vector3(); // 方向ベクトル格納用
    // 親ボーンのワールド行列を取得（なければ単位行列）
    const pm = bone.getParent()?.getWorldMatrix() ?? Matrix.Identity();
    // ローカル行列×親行列でワールド変換行列を計算
    const fm = bone.getLocalMatrix().multiply(pm);
    // Y軸方向をワールド座標に変換して方向ベクトルを得る
    Vector3.TransformNormalToRef(new Vector3(0, 1, 0), fm, dir);
    dir.normalize(); // 正規化
    // 水平面への射影長を計算
    const hLen = Math.sqrt(dir.x * dir.x + dir.z * dir.z);
    // 水平面からの仰角（度）を返す
    return Math.atan2(Math.abs(dir.y), hLen) * (180 / Math.PI);
  };

  const la = getAngle(leftBone), ra = getAngle(rightBone); // 左右の腕角度を計算
  const avg = (la + ra) / 2; // 平均角度
  let poseType: TPoseStatus['poseType'] = 'other'; // デフォルトは不明ポーズ
  if (avg <= 15) poseType = 'T-pose';                    // 15度以下ならTポーズ
  else if (avg >= 25 && avg <= 55) poseType = 'A-pose';  // 25-55度ならAポーズ
  // 検出結果を返却（角度は四捨五入）
  return { detected: true, isTPose: poseType === 'T-pose', leftArmAngle: Math.round(la), rightArmAngle: Math.round(ra), poseType };
}

// ========================================================================
// VOX parser (browser)（ブラウザ用VOXファイルパーサー）
// ========================================================================
// ArrayBufferからMagicaVoxel形式のボクセルデータとパレットを解析する関数
function parseVoxBrowser(buf: ArrayBuffer): { voxels: { x: number; y: number; z: number; colorIndex: number }[]; palette: { r: number; g: number; b: number }[] } {
  const view = new DataView(buf); // バイナリデータビューを作成
  let off = 0; // 読み取りオフセット
  // 4バイト符号なし整数読み取りヘルパー（リトルエンディアン）
  const r32 = () => { const v = view.getUint32(off, true); off += 4; return v; };
  // 1バイト符号なし整数読み取りヘルパー
  const r8 = () => { const v = view.getUint8(off); off += 1; return v; };
  // n文字のASCII文字列読み取りヘルパー
  const rStr = (n: number) => { let s = ''; for (let i = 0; i < n; i++) s += String.fromCharCode(view.getUint8(off + i)); off += n; return s; };

  // マジックナンバー "VOX " の検証
  if (rStr(4) !== 'VOX ') throw new Error('Invalid VOX');
  r32(); // バージョン番号をスキップ
  rStr(4); const mc = r32(); const mch = r32(); // MAINチャンクのヘッダ読み取り（ID・コンテンツサイズ・子チャンクサイズ）
  const end = off + mch + mc; // データ終端位置を計算
  const voxels: { x: number; y: number; z: number; colorIndex: number }[] = []; // ボクセルデータ配列
  const palette: { r: number; g: number; b: number }[] = []; // パレット配列

  // 子チャンクを順次読み取り
  while (off < end) {
    const id = rStr(4); const cs = r32(); const chs = r32(); const ds = off; // チャンクID・サイズ・子サイズ・データ開始位置
    // XYZIチャンク: ボクセルデータ（個数＋各ボクセルのx,y,z,colorIndex）
    if (id === 'XYZI') { const n = r32(); for (let i = 0; i < n; i++) voxels.push({ x: r8(), y: r8(), z: r8(), colorIndex: r8() }); }
    // RGBAチャンク: カラーパレット（256色、各RGBA 4バイト）
    else if (id === 'RGBA') { for (let i = 0; i < 256; i++) { palette.push({ r: r8() / 255, g: r8() / 255, b: r8() / 255 }); r8(); } }
    off = ds + cs + chs; // 次のチャンクへオフセットを進める
  }
  // パレットが未定義の場合はデフォルトの灰色パレットを生成
  if (palette.length === 0) for (let i = 0; i < 256; i++) palette.push({ r: 0.8, g: 0.8, b: 0.8 });
  return { voxels, palette }; // 解析結果を返却
}

// テンプレートVOXファイルをURLからロードしてボクセル配列に変換する非同期関数
async function loadTemplateVox(url: string): Promise<VoxelEntry[]> {
  try {
    // キャッシュ回避のためにタイムスタンプクエリパラメータを付与してフェッチ
    const resp = await fetch(url + `?v=${Date.now()}`);
    if (!resp.ok) return []; // HTTPエラーの場合は空配列を返す
    // レスポンスをArrayBufferとして取得し、VOXフォーマットを解析
    const { voxels, palette } = parseVoxBrowser(await resp.arrayBuffer());
    // ボクセルデータにパレット色を適用してVoxelEntry形式に変換
    return voxels.map(v => {
      const c = palette[v.colorIndex - 1] ?? { r: 0.8, g: 0.8, b: 0.8 }; // カラーインデックスは1始まり
      return { x: v.x, y: v.y, z: v.z, r: c.r, g: c.g, b: c.b };
    });
  } catch { return []; } // エラー時は空配列
}

// ========================================================================
// EC Body Standard Chibi Deformation（ECボディ標準デフォルメ変形）
// blender_voxelize.py の deform_point に対応 — ECボディプロポーション
// 領域: 頭部(t>0.85), 胴体(0.50<t≤0.85), 脚部(t≤0.50)
// Babylon座標: Y=上, X=右, Z=奥行
// ========================================================================
// デフォルメ変形用のバウンディングボックス情報
interface DeformBounds {
  minY: number;     // モデル底面（足元）のBabylon Y座標
  modelH: number;   // モデルの高さ
  centerX: number;  // ボディバウンディングボックスのX中心
  centerZ: number;  // ボディバウンディングボックスのZ中心
}

// メッシュマップとパーツ設定からモデルのバウンディングボックスを計算する関数
function computeModelBounds(
  meshMap: Map<string, AbstractMesh[]>,  // パーツ名→メッシュ配列のマップ
  partsCfg: Record<string, PartConfig>,  // パーツ設定
): DeformBounds | null {
  // bodyカテゴリのメッシュを優先的に使用（Blenderと同じ: body-onlyバウンディングボックス）
  let targets: AbstractMesh[] = [];
  for (const [name, meshes] of meshMap) {
    // 表示中のbodyカテゴリメッシュを収集
    if (partsCfg[name]?.category === 'body' && partsCfg[name]?.visible) targets.push(...meshes);
  }
  // bodyメッシュがない場合は、除外以外の全表示メッシュをフォールバックとして使用
  if (targets.length === 0) {
    for (const [name, meshes] of meshMap) {
      if (partsCfg[name]?.visible && partsCfg[name]?.category !== 'exclude') targets.push(...meshes);
    }
  }

  // 全対象メッシュの頂点からバウンディングボックスを計算
  let minX = Infinity, maxX = -Infinity;  // X軸の最小・最大
  let minY = Infinity, maxY = -Infinity;  // Y軸の最小・最大
  let minZ = Infinity, maxZ = -Infinity;  // Z軸の最小・最大
  for (const mesh of targets) {
    if (!(mesh instanceof Mesh)) continue; // Meshインスタンスのみ処理
    const pos = mesh.getVerticesData('position'); // 頂点位置データを取得
    if (!pos) continue; // 頂点データがなければスキップ
    const wm = mesh.getWorldMatrix(); // ワールド変換行列を取得
    // 全頂点をワールド座標に変換してバウンディングボックスを更新
    for (let i = 0; i < pos.length; i += 3) {
      const wp = Vector3.TransformCoordinates(new Vector3(pos[i], pos[i + 1], pos[i + 2]), wm);
      minX = Math.min(minX, wp.x); maxX = Math.max(maxX, wp.x); // X範囲更新
      minY = Math.min(minY, wp.y); maxY = Math.max(maxY, wp.y); // Y範囲更新
      minZ = Math.min(minZ, wp.z); maxZ = Math.max(maxZ, wp.z); // Z範囲更新
    }
  }
  if (!isFinite(minY)) return null; // 有効な頂点がなかった場合はnull
  // バウンディングボックス情報を返却（高さ・中心座標）
  return { minY, modelH: maxY - minY, centerX: (minX + maxX) / 2, centerZ: (minZ + maxZ) / 2 };
}

/**
 * ECボディのデフォルメ変形をBabylonワールド空間の点に適用する関数
 * headScale: 頭部領域のXYスケールオーバーライド（1.0 = 髪用、拡大なし）
 */
function chibiDeform(
  px: number, py: number, pz: number, // 入力座標（ワールド空間）
  b: DeformBounds,                     // バウンディングボックス情報
  headScale?: number,                  // 頭部スケール（省略時は1.5〜1.8）
): [number, number, number] {
  let x = px, y = py, z = pz; // 変形後の座標（初期値は入力座標）
  // 体全体における相対位置t（0=足元, 1=頭頂）をクランプして計算
  const t = b.modelH > 0 ? Math.max(0, Math.min(1, (y - b.minY) / b.modelH)) : 0.5;

  if (t > 0.85) {
    // 頭部領域: XZ方向に拡大（1.5→1.8倍）、Y方向に押し上げ
    const ht = (t - 0.85) / 0.15; // 頭部内の相対位置（0〜1）
    const s = headScale ?? (1.5 + ht * 0.3); // スケール係数（上に行くほど拡大）
    x = b.centerX + (x - b.centerX) * s; // X方向に中心から拡大
    z = b.centerZ + (z - b.centerZ) * s; // Z方向に中心から拡大
    y = y + ht * b.modelH * 0.06;        // Y方向に微量押し上げ
  } else if (t > 0.50) {
    // 胴体領域: XZ方向に微拡大（1.1倍）
    x = b.centerX + (x - b.centerX) * 1.1; // X方向微拡大
    z = b.centerZ + (z - b.centerZ) * 1.1; // Z方向微拡大
  } else {
    // 脚部領域: Y方向を二次関数で圧縮、ハの字に外側へ広げる
    const legT = t / 0.50; // 脚部内の相対位置（0〜1）
    const f = 0.70 * legT + 0.30 * legT * legT; // 二次関数による非線形圧縮
    y = b.minY + f * 0.50 * b.modelH;           // 圧縮後のY座標
    x = b.centerX + (x - b.centerX) * 1.1;      // X方向微拡大
    z = b.centerZ + (z - b.centerZ) * 1.1;      // Z方向微拡大
    const sign = x > b.centerX ? 1.0 : -1.0;    // 中心からの左右方向
    x += sign * 0.06 * (1.0 - legT);             // 下に行くほどハの字に広げる
  }

  return [x, y, z]; // 変形後の座標を返却
}

// ========================================================================
// Mesh → Voxel (triangle rasterization)（メッシュ→ボクセル変換、三角形ラスタライズ）
// ========================================================================
// メッシュをボクセルグリッドにラスタライズする関数
function voxelizeMesh(
  mesh: AbstractMesh,    // 対象メッシュ
  gridX: number, gridY: number, gridZ: number, // ボクセルグリッドサイズ
  offX: number, offY: number, offZ: number,     // グリッド内オフセット
  scale: number,                                 // ボクセルスケール（ワールド単位/ボクセル）
  deform?: { bounds: DeformBounds; headScale?: number }, // デフォルメ変形パラメータ（オプション）
): VoxelEntry[] {
  if (!(mesh instanceof Mesh)) return []; // Meshインスタンスでなければ空配列
  const positions = mesh.getVerticesData('position'); // 頂点位置データ
  const indices = mesh.getIndices();                  // インデックスデータ（三角形の頂点参照）
  const colors = mesh.getVerticesData('color');        // 頂点カラーデータ（あれば）
  if (!positions || !indices) return [];               // 必要データがなければ空配列

  const voxelSet = new Map<string, VoxelEntry>(); // 重複排除用のボクセルマップ
  const wm = mesh.getWorldMatrix();                // ワールド変換行列

  // 全三角形をループ（インデックス3個ずつで1三角形）
  for (let i = 0; i < indices.length; i += 3) {
    const tv: Vector3[] = [], tc: { r: number; g: number; b: number }[] = []; // 三角形の頂点座標と色
    // 三角形の3頂点を処理
    for (let vi = 0; vi < 3; vi++) {
      const idx = indices[i + vi]; // 頂点インデックス
      // 頂点位置をワールド座標に変換
      tv.push(Vector3.TransformCoordinates(new Vector3(positions[idx * 3], positions[idx * 3 + 1], positions[idx * 3 + 2]), wm));
      // 頂点カラーを取得（頂点カラーがなければマテリアルのdiffuseColorを使用）
      if (colors) tc.push({ r: colors[idx * 4], g: colors[idx * 4 + 1], b: colors[idx * 4 + 2] });
      else {
        const mat = mesh.material; // メッシュのマテリアル
        const dc = mat && 'diffuseColor' in mat ? (mat as StandardMaterial).diffuseColor : new Color3(0.7, 0.7, 0.7); // diffuseColor取得
        tc.push({ r: dc.r, g: dc.g, b: dc.b }); // マテリアル色を使用
      }
    }
    // 三角形をラスタライズ（辺の長さに基づくステップ数で重心座標系を走査）
    const e0 = tv[1].subtract(tv[0]).length(), e1 = tv[2].subtract(tv[1]).length(), e2 = tv[0].subtract(tv[2]).length(); // 3辺の長さ
    const steps = Math.max(Math.ceil(Math.max(e0, e1, e2) / scale), 1); // スケールに応じたステップ数
    // 重心座標系(u,v,w)で三角形内の点をサンプリング
    for (let si = 0; si <= steps; si++) {
      for (let sj = 0; sj <= steps - si; sj++) {
        const u = si / steps, v = sj / steps, w = 1 - u - v; // 重心座標
        if (w < 0) continue; // 三角形外ならスキップ
        // 重心座標で頂点位置を補間してワールド座標を計算
        const px = tv[0].x * w + tv[1].x * u + tv[2].x * v;
        const py = tv[0].y * w + tv[1].y * u + tv[2].y * v;
        const pz = tv[0].z * w + tv[1].z * u + tv[2].z * v;
        let rx = px, ry = py, rz = pz; // デフォルメ適用後の座標
        // デフォルメ変形が有効なら適用
        if (deform) [rx, ry, rz] = chibiDeform(px, py, pz, deform.bounds, deform.headScale);
        // ワールド座標→ボクセルグリッド座標に変換（Babylon→VOX座標系変換含む）
        const vx = Math.round(rx / scale + offX);      // X座標
        const vy = Math.round(-rz / scale + offY);      // Y座標（BabylonのZ→VOXのY、符号反転）
        const vz = Math.round(ry / scale + offZ);       // Z座標（BabylonのY→VOXのZ）
        // グリッド範囲外ならスキップ
        if (vx < 0 || vy < 0 || vz < 0 || vx >= gridX || vy >= gridY || vz >= gridZ) continue;
        const key = `${vx},${vy},${vz}`; // 重複チェック用キー
        if (!voxelSet.has(key)) {
          // 重心座標で頂点カラーを補間してボクセルエントリを格納
          voxelSet.set(key, { x: vx, y: vy, z: vz,
            r: tc[0].r * w + tc[1].r * u + tc[2].r * v, // R色補間
            g: tc[0].g * w + tc[1].g * u + tc[2].g * v, // G色補間
            b: tc[0].b * w + tc[1].b * u + tc[2].b * v, // B色補間
          });
        }
      }
    }
  }
  return Array.from(voxelSet.values()); // マップからボクセル配列に変換して返却
}

// ========================================================================
// Voxel mesh builder (unlit, face-culled)（ボクセルメッシュビルダー、無照明・面カリング対応）
// ========================================================================
// 6方向の面オフセット（+X, -X, +Y, -Y, +Z, -Z）
const FACE_DIRS = [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]];
// 各面の4頂点のローカル座標（四角形面を構成）
const FACE_VERTS = [
  [[1,0,0],[1,1,0],[1,1,1],[1,0,1]],[[0,0,1],[0,1,1],[0,1,0],[0,0,0]], // +X面, -X面
  [[0,1,0],[0,1,1],[1,1,1],[1,1,0]],[[0,0,1],[0,0,0],[1,0,0],[1,0,1]], // +Y面, -Y面
  [[0,0,1],[1,0,1],[1,1,1],[0,1,1]],[[1,0,0],[0,0,0],[0,1,0],[1,1,0]], // +Z面, -Z面
];
// 各面の法線ベクトル
const FACE_NORMALS = [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]];

// 無照明（アンリット）シェーダーマテリアルを作成する関数
function createUnlit(scene: Scene, name: string): ShaderMaterial {
  // 頂点シェーダー: 位置変換とカラー受け渡し
  Effect.ShadersStore[name + 'VertexShader'] = `precision highp float;attribute vec3 position;attribute vec4 color;uniform mat4 worldViewProjection;varying vec4 vColor;void main(){gl_Position=worldViewProjection*vec4(position,1.0);vColor=color;}`;
  // フラグメントシェーダー: 頂点カラーをそのまま出力
  Effect.ShadersStore[name + 'FragmentShader'] = `precision highp float;varying vec4 vColor;void main(){gl_FragColor=vColor;}`;
  // ShaderMaterialを作成して返却
  const mat = new ShaderMaterial(name, scene, { vertex: name, fragment: name }, { attributes: ['position', 'color'], uniforms: ['worldViewProjection'] });
  mat.backFaceCulling = false; // 背面カリングを無効化（両面描画）
  return mat;
}

// ボクセル配列からBabylon.jsメッシュを構築する関数（隣接面カリング付き）
function buildVoxelMesh(voxels: VoxelEntry[], scene: Scene, name: string, cx: number, cy: number): Mesh {
  // 占有セットを構築（隣接ボクセルの存在チェック用）
  const occ = new Set<string>();
  for (const v of voxels) occ.add(`${v.x},${v.y},${v.z}`);
  const pos: number[] = [], nrm: number[] = [], col: number[] = [], idx: number[] = []; // 頂点データ配列
  // 全ボクセルをループ
  for (const vx of voxels) {
    // 6方向の面をチェック
    for (let f = 0; f < 6; f++) {
      const [dx, dy, dz] = FACE_DIRS[f]; // 面の方向
      // 隣接ボクセルが存在する面はスキップ（内部面は描画不要）
      if (occ.has(`${vx.x+dx},${vx.y+dy},${vx.z+dz}`)) continue;
      const bi = pos.length / 3; // 現在の頂点インデックスベース
      const fv = FACE_VERTS[f], fn = FACE_NORMALS[f]; // 面の頂点座標と法線
      // 四角形の4頂点を追加（VOX→Babylon座標系変換含む）
      for (let vi = 0; vi < 4; vi++) {
        // VOX座標→Babylon座標: X=(vox_x-cx)*scale, Y=vox_z*scale, Z=-(vox_y-cy)*scale
        pos.push((vx.x+fv[vi][0]-cx)*VSCALE, (vx.z+fv[vi][2])*VSCALE, -(vx.y+fv[vi][1]-cy)*VSCALE);
        nrm.push(fn[0], fn[2], -fn[1]); // 法線もVOX→Babylon変換
        col.push(vx.r, vx.g, vx.b, 1);  // RGBA頂点カラー
      }
      // 四角形を2つの三角形に分割してインデックスを追加
      idx.push(bi, bi+1, bi+2, bi, bi+2, bi+3);
    }
  }
  // VertexDataオブジェクトを作成してメッシュに適用
  const vd = new VertexData();
  vd.positions = pos; vd.normals = nrm; vd.colors = col; vd.indices = idx;
  const m = new Mesh(name, scene); // メッシュ作成
  vd.applyToMesh(m);               // 頂点データ適用
  m.material = createUnlit(scene, name + '_u'); // 無照明マテリアルを設定
  return m; // 完成したメッシュを返却
}

// ========================================================================
// VOX export (browser)（ブラウザ用VOXファイルエクスポート）
// ========================================================================
// ボクセル配列をMagicaVoxel形式のBlobに変換する関数
function exportVoxBlob(voxels: VoxelEntry[], sizeX: number, sizeY: number, sizeZ: number): Blob {
  // 色→パレットインデックスのマッピングを構築（最大255色）
  const cMap = new Map<string, number>(); const pal: { r: number; g: number; b: number }[] = [];
  for (const v of voxels) {
    const k = `${Math.round(v.r*255)},${Math.round(v.g*255)},${Math.round(v.b*255)}`; // 色キー
    if (!cMap.has(k) && pal.length < 255) { cMap.set(k, pal.length + 1); pal.push({ r: v.r, g: v.g, b: v.b }); } // 新色を登録
  }
  // 各ボクセルにパレットインデックスを割り当て
  const vd = voxels.map(v => ({ x: v.x, y: v.y, z: v.z, ci: cMap.get(`${Math.round(v.r*255)},${Math.round(v.g*255)},${Math.round(v.b*255)}`) ?? 1 }));
  // VOXファイルの各チャンクサイズを計算
  const szC = 12, xyC = 4 + vd.length * 4, rgC = 1024; // SIZE=12bytes, XYZI=4+ボクセル数*4, RGBA=1024bytes
  const chSz = (12+szC)+(12+xyC)+(12+rgC); // 全子チャンクの合計サイズ
  const buf = new ArrayBuffer(8+12+chSz); const dv = new DataView(buf); let o = 0; // バッファ作成
  // 文字列書き込みヘルパー
  const ws = (s: string) => { for (let i = 0; i < s.length; i++) dv.setUint8(o++, s.charCodeAt(i)); };
  // 4バイト整数書き込みヘルパー（リトルエンディアン）
  const w32 = (v: number) => { dv.setUint32(o, v, true); o += 4; };
  // 1バイト書き込みヘルパー
  const w8 = (v: number) => { dv.setUint8(o, v); o += 1; };
  // ファイルヘッダ: "VOX " + バージョン200
  ws('VOX '); w32(200); ws('MAIN'); w32(0); w32(chSz);
  // SIZEチャンク: ボクセルグリッドサイズ（X,Y,Z）
  ws('SIZE'); w32(szC); w32(0); w32(sizeX); w32(sizeY); w32(sizeZ);
  // XYZIチャンク: ボクセルデータ（個数＋各x,y,z,colorIndex）
  ws('XYZI'); w32(xyC); w32(0); w32(vd.length);
  for (const v of vd) { w8(v.x); w8(v.y); w8(v.z); w8(v.ci); }
  // RGBAチャンク: カラーパレット（256エントリ×4バイト）
  ws('RGBA'); w32(rgC); w32(0);
  for (let i = 0; i < 256; i++) { const c = pal[i] ?? { r: 0, g: 0, b: 0 }; w8(Math.round(c.r*255)); w8(Math.round(c.g*255)); w8(Math.round(c.b*255)); w8(255); }
  return new Blob([buf], { type: 'application/octet-stream' }); // Blobとして返却
}

// ========================================================================
// Component（Reactコンポーネント）
// ========================================================================
// モデルインポートページのメインコンポーネント
export default function ModelImportPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);                // 3D描画用canvasの参照
  const sceneRef = useRef<Scene | null>(null);                     // Babylon.jsシーンの参照
  const engineRef = useRef<Engine | null>(null);                   // Babylon.jsエンジンの参照
  const highlightRef = useRef<HighlightLayer | null>(null);        // ハイライトレイヤーの参照
  const meshMapRef = useRef<Map<string, AbstractMesh[]>>(new Map()); // パーツ名→メッシュ配列のマップ
  const voxelMeshesRef = useRef<Mesh[]>([]);                       // ボクセルメッシュ配列の参照

  const [initialized, setInitialized] = useState(false);           // エンジン初期化完了フラグ
  const [loading, setLoading] = useState(false);                   // モデル読み込み中フラグ
  const [error, setError] = useState<string | null>(null);         // エラーメッセージ
  const [fileName, setFileName] = useState<string | null>(null);   // 読み込んだファイル名
  const [parts, setParts] = useState<Record<string, PartConfig>>({}); // パーツ設定マップ
  const [selectedPart, setSelectedPart] = useState<string | null>(null); // 選択中のパーツ名
  const [dragOver, setDragOver] = useState(false);                 // ドラッグオーバー状態
  const [tPoseStatus, setTPoseStatus] = useState<TPoseStatus | null>(null); // Tポーズ検出状態

  // ボクセル化関連の状態
  const [mode, setMode] = useState<'classify' | 'voxelize'>('classify'); // 画面モード（分類/ボクセル化）
  const [voxelizing, setVoxelizing] = useState(false);                   // ボクセル化処理中フラグ
  const [voxelResult, setVoxelResult] = useState<Record<string, VoxelEntry[]>>({}); // パーツ別ボクセル結果
  const [showGlb, setShowGlb] = useState(true);        // 3Dモデル表示フラグ
  const [showVoxels, setShowVoxels] = useState(true);   // ボクセル表示フラグ
  const [scaleMul, setScaleMul] = useState(1.0);        // スケール倍率
  const [offX, setOffX] = useState(0);                  // Xオフセット
  const [offY, setOffY] = useState(0);                  // Yオフセット
  const [offZ, setOffZ] = useState(0);                  // Zオフセット
  const [voxRes, setVoxRes] = useState(VSCALE);         // ボクセル解像度
  const [voxStatus, setVoxStatus] = useState('');        // ボクセル化ステータスメッセージ
  const [chibiEnabled, setChibiEnabled] = useState(true); // デフォルメ変形有効フラグ

  // エンジン初期化（マウント時に1回実行）
  useEffect(() => {
    const canvas = canvasRef.current; // canvas要素を取得
    if (!canvas) return; // canvasが未準備ならスキップ
    // Babylon.jsエンジンを作成（アンチエイリアス・描画バッファ保持・ステンシル有効）
    const engine = new Engine(canvas, true, { preserveDrawingBuffer: true, stencil: true });
    const scene = new Scene(engine); // シーン作成
    scene.clearColor = new Color4(0.1, 0.1, 0.15, 1); // 背景色（暗い紺色）

    // グラウンドメッシュ（ワイヤーフレームグリッド）を作成
    const ground = MeshBuilder.CreateGround('ground', { width: 10, height: 10 }, scene);
    const gMat = new StandardMaterial('gMat', scene);
    gMat.diffuseColor = new Color3(0.2, 0.2, 0.25); gMat.alpha = 0.3; gMat.wireframe = true; // 半透明ワイヤーフレーム
    ground.material = gMat; ground.isPickable = false; // ピッキング無効

    // アークロテートカメラ（対象を中心に回転するカメラ）を作成
    const camera = new ArcRotateCamera('cam', Math.PI / 2, Math.PI / 3, 5, new Vector3(0, 1, 0), scene);
    camera.attachControl(canvas, true); camera.lowerRadiusLimit = 0.5; camera.upperRadiusLimit = 20; camera.wheelPrecision = 40; // ズーム制限

    // 半球ライト（上方向からの環境光）
    const hemi = new HemisphericLight('hemi', new Vector3(0, 1, 0), scene);
    hemi.intensity = 0.6; hemi.groundColor = new Color3(0.1, 0.1, 0.15); // 地面反射色
    // ディレクショナルライト（方向光源）
    const dir = new DirectionalLight('dir', new Vector3(-1, -2, 1), scene);
    dir.intensity = 0.5; // 強度

    highlightRef.current = new HighlightLayer('hl', scene); // ハイライトレイヤー作成
    sceneRef.current = scene; engineRef.current = engine; setInitialized(true); // 参照を保存、初期化完了

    engine.runRenderLoop(() => scene.render()); // レンダリングループ開始
    const onResize = () => engine.resize(); // リサイズハンドラ
    window.addEventListener('resize', onResize); // リサイズイベント登録
    // クリーンアップ: リサイズイベント解除、エンジン破棄
    return () => { window.removeEventListener('resize', onResize); engine.dispose(); };
  }, []);

  // モデルファイル読み込み処理（メモ化コールバック）
  const loadModel = useCallback(async (file: File) => {
    const scene = sceneRef.current;
    if (!scene || !initialized) return; // シーン未初期化ならスキップ
    // 各種状態をリセット
    setLoading(true); setError(null); setFileName(file.name); setSelectedPart(null); setTPoseStatus(null);
    setMode('classify'); setVoxelResult({}); setVoxStatus('');
    // 既存のボクセルメッシュを破棄
    for (const m of voxelMeshesRef.current) m.dispose(); voxelMeshesRef.current = [];
    // 既存のインポートメッシュを破棄
    for (const meshes of meshMapRef.current.values()) for (const m of meshes) m.dispose();
    meshMapRef.current.clear();
    // グラウンド以外のメッシュを破棄
    const toDispose = scene.meshes.filter(m => m.name !== 'ground');
    for (const m of toDispose) m.dispose();
    // カメラ以外のトランスフォームノードを破棄
    const nodesToDispose = scene.transformNodes.filter(n => n.name !== 'cam');
    for (const n of nodesToDispose) n.dispose();

    try {
      const url = URL.createObjectURL(file); // ファイルからBlob URLを生成
      const ext = file.name.split('.').pop()?.toLowerCase() ?? ''; // 拡張子取得
      let result: { meshes: AbstractMesh[] }; // インポート結果
      // 拡張子に応じてローダーを選択してインポート
      if (ext === 'glb' || ext === 'gltf') result = await SceneLoader.ImportMeshAsync('', url, '', scene, null, '.glb');
      else if (ext === 'obj') result = await SceneLoader.ImportMeshAsync('', url, '', scene, null, '.obj');
      else throw new Error(`Unsupported: .${ext}`); // 非対応形式
      URL.revokeObjectURL(url); // Blob URLを解放

      // 全メッシュを初期状態で非表示・ピッキング無効に設定
      for (const mesh of result.meshes) { mesh.isVisible = false; mesh.isPickable = false; }

      const partMap = new Map<string, AbstractMesh[]>();           // パーツ名→メッシュ配列マップ
      const partConfigs: Record<string, PartConfig> = {};          // パーツ設定マップ

      // インポートされた各メッシュを分類
      for (const mesh of result.meshes) {
        if (!mesh.name || mesh.name === '__root__') continue;      // ルートノードはスキップ
        if (mesh instanceof Mesh && mesh.getTotalVertices() === 0) continue; // 頂点なしメッシュはスキップ
        if (!(mesh instanceof Mesh)) continue;                     // Meshインスタンス以外はスキップ
        // アーマチュア・スケルトン・ボーン等のリグ要素はスキップ
        if (/^(armature|skeleton|bone|rig|root|null|empty|camera|light|lamp)/i.test(mesh.name.toLowerCase())) continue;
        if (mesh.getTotalVertices() < 3) continue;                 // 頂点が3未満ならスキップ

        // メッシュ名からmixamoプレフィックスや末尾番号を除去してパーツ名を生成
        let partName = mesh.name.replace(/^mixamorig:?/i, '').replace(/\.\d+$/, '').trim();
        if (!partName) partName = mesh.name; // 空の場合は元の名前を使用
        if (!partMap.has(partName)) partMap.set(partName, []); // 初回はエントリ作成
        partMap.get(partName)!.push(mesh); // メッシュをパーツに追加
        mesh.isVisible = true; mesh.isPickable = true; // 表示・ピッキング有効化
      }

      // 各パーツの設定を構築（自動カテゴリ分類含む）
      for (const [name, meshes] of partMap) {
        const totalVerts = meshes.reduce((s, m) => s + (m instanceof Mesh ? m.getTotalVertices() : 0), 0); // 合計頂点数
        partConfigs[name] = { category: guessCategory(name), meshName: name, vertexCount: totalVerts, visible: true };
      }

      meshMapRef.current = partMap;  // パーツマップを保存
      setParts(partConfigs);          // パーツ設定を状態に反映
      setTPoseStatus(detectTPose(scene.skeletons)); // Tポーズ検出を実行

      // カメラをモデル全体が見えるように調整
      const bounds = scene.getWorldExtends(); // シーン全体のバウンディングボックス
      const center = bounds.min.add(bounds.max).scale(0.5); // 中心座標
      const size = bounds.max.subtract(bounds.min).length(); // 対角線長
      const cam = scene.activeCamera as ArcRotateCamera;
      if (cam) { cam.target = center; cam.radius = Math.max(size * 1.2, 2); } // ターゲットと距離を設定

      // クリックでパーツを選択するイベントハンドラを設定
      scene.onPointerDown = (_evt, pick) => {
        if (pick?.hit && pick.pickedMesh) {
          // クリックされたメッシュが属するパーツを検索
          for (const [pn, ms] of meshMapRef.current) {
            if (ms.includes(pick.pickedMesh)) { setSelectedPart(pn); return; }
          }
        }
      };
      setLoading(false); // 読み込み完了
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); setLoading(false); } // エラーハンドリング
  }, [initialized]);

  // 選択パーツのハイライト表示（selectedPart変更時に実行）
  useEffect(() => {
    const hl = highlightRef.current; if (!hl) return; // ハイライトレイヤーがなければスキップ
    hl.removeAllMeshes(); // 既存ハイライトをクリア
    // 選択パーツのメッシュにハイライト色を適用
    if (selectedPart && meshMapRef.current.has(selectedPart)) {
      for (const m of meshMapRef.current.get(selectedPart)!) if (m instanceof Mesh) hl.addMesh(m, Color3.FromHexString('#44aaff'));
    }
  }, [selectedPart]);

  // Deleteキーでパーツを非表示にするキーボードハンドラ
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Delete' && selectedPart) { // Deleteキー＋パーツ選択中
        const ms = meshMapRef.current.get(selectedPart);
        if (ms) for (const m of ms) { m.isVisible = false; m.isPickable = false; } // メッシュを非表示化
        // パーツ設定のvisibleをfalseに更新
        setParts(p => ({ ...p, [selectedPart]: { ...p[selectedPart], visible: false } }));
        setSelectedPart(null); // 選択解除
      }
    };
    window.addEventListener('keydown', onKey); // キーダウンイベント登録
    return () => window.removeEventListener('keydown', onKey); // クリーンアップ
  }, [selectedPart]);

  // パーツの表示/非表示をトグルする関数
  const toggleVisibility = (name: string) => {
    const ms = meshMapRef.current.get(name); if (!ms) return; // メッシュ取得
    // パーツ設定のvisibleを反転し、メッシュの表示状態も更新
    setParts(p => { const n = { ...p }; n[name] = { ...n[name], visible: !n[name].visible }; for (const m of ms) m.isVisible = n[name].visible; return n; });
  };

  // パーツのカテゴリを変更する関数
  const setCategory = (name: string, cat: TemplateCategory) => setParts(p => ({ ...p, [name]: { ...p[name], category: cat } }));

  // 設定をJSONファイルとしてエクスポートする関数
  const exportConfig = () => {
    if (!fileName) return; // ファイル名がなければスキップ
    const cfg: ImportConfig = { fileName, parts, tPoseStatus, timestamp: new Date().toISOString() }; // 設定オブジェクト構築
    const blob = new Blob([JSON.stringify(cfg, null, 2)], { type: 'application/json' }); // JSON Blob作成
    const url = URL.createObjectURL(blob); // ダウンロードURL生成
    const a = document.createElement('a'); a.href = url; a.download = `${fileName.replace(/\.[^.]+$/, '')}_config.json`; a.click(); // ダウンロード実行
    URL.revokeObjectURL(url); // URL解放
  };

  // 設定JSONファイルをインポートする関数
  const importConfig = (file: File) => {
    const reader = new FileReader(); // FileReader作成
    reader.onload = () => {
      try {
        const cfg: ImportConfig = JSON.parse(reader.result as string); // JSONパース
        // パーツ設定のカテゴリをインポートした値で上書き
        if (cfg.parts) setParts(p => { const n = { ...p }; for (const [k, v] of Object.entries(cfg.parts)) if (n[k]) n[k] = { ...n[k], category: v.category }; return n; });
      } catch { /* パースエラーは無視 */ }
    };
    reader.readAsText(file); // テキストとして読み込み
  };

  // 3Dモデルの表示/非表示切り替え（showGlb変更時）
  useEffect(() => { for (const ms of meshMapRef.current.values()) for (const m of ms) if (parts[Array.from(meshMapRef.current.entries()).find(([_, v]) => v.includes(m))?.[0] ?? '']?.visible) m.isVisible = showGlb; }, [showGlb]);
  // ボクセルメッシュの表示/非表示切り替え（showVoxels変更時）
  useEffect(() => { for (const m of voxelMeshesRef.current) m.isVisible = showVoxels; }, [showVoxels]);

  // ボクセル化処理のメインロジック（メモ化コールバック）
  const doVoxelize = useCallback(async () => {
    const scene = sceneRef.current; if (!scene) return; // シーンがなければスキップ
    setVoxelizing(true); setVoxStatus('Starting...'); // 処理開始状態に設定
    // 既存のボクセルメッシュを破棄
    for (const m of voxelMeshesRef.current) m.dispose(); voxelMeshesRef.current = [];
    const cx = BODY_SIZE.x / 2, cy = BODY_SIZE.y / 2; // グリッドの中心座標
    const results: Record<string, VoxelEntry[]> = {}; // パーツ別結果格納用
    // ボクセル化対象パーツをフィルタ（表示中・除外とbody以外）
    const entries = Object.entries(parts).filter(([_, p]) => p.visible && p.category !== 'exclude' && p.category !== 'body');

    // デフォルメ変形のバウンディングボックスを計算（有効時のみ）
    const deformBounds = chibiEnabled ? computeModelBounds(meshMapRef.current, parts) : null;
    if (chibiEnabled && deformBounds) setVoxStatus('Chibi deform enabled'); // デフォルメ有効を表示
    let i = 0; // パーツカウンター

    // 各パーツを順次ボクセル化
    for (const [name, partCfg] of entries) {
      setVoxStatus(`${name} (${++i}/${entries.length})${chibiEnabled ? ' [chibi]' : ''}`); // 進捗表示

      // 髪パーツの場合はheadScale=1.0（頭部拡大なし、Blenderのhead_scale_overrideに対応）
      const isHair = partCfg.category === 'hair';
      const deform = deformBounds ? { bounds: deformBounds, headScale: isHair ? 1.0 : undefined } : undefined;

      // パーツに属する全メッシュを取得
      const meshes = meshMapRef.current.get(name) ?? [];
      let partVoxels: VoxelEntry[] = []; // パーツのボクセルデータ
      // 各メッシュをボクセル化して結合
      for (const mesh of meshes) {
        const mv = voxelizeMesh(mesh, BODY_SIZE.x, BODY_SIZE.y, BODY_SIZE.z, cx + offX, cy + offY, offZ, voxRes * scaleMul, deform);
        partVoxels.push(...mv);
      }

      // テンプレートVOXとマージ（カテゴリに対応するテンプレートがある場合）
      const tmplUrl = TEMPLATE_MAP[partCfg.category];
      if (tmplUrl) {
        const tmplVoxels = await loadTemplateVox(tmplUrl); // テンプレートを読み込み
        if (tmplVoxels.length > 0 && partVoxels.length > 0) {
          // メッシュボクセルが存在する位置はスキップして、テンプレートの残りを暗めの色で追加
          const meshSet = new Set(partVoxels.map(v => `${v.x},${v.y},${v.z}`));
          for (const tv of tmplVoxels) if (!meshSet.has(`${tv.x},${tv.y},${tv.z}`)) partVoxels.push({ ...tv, r: tv.r * 0.4, g: tv.g * 0.4, b: tv.b * 0.4 });
        } else if (partVoxels.length === 0) partVoxels = tmplVoxels; // メッシュボクセルがなければテンプレートをそのまま使用
      }

      // ボクセルが生成された場合、結果を保存しメッシュを構築
      if (partVoxels.length > 0) {
        results[name] = partVoxels;
        const vm = buildVoxelMesh(partVoxels, scene, `vox_${name}`, cx, cy); // ボクセルメッシュ構築
        voxelMeshesRef.current.push(vm); // メッシュ参照を保存
      }
      await new Promise(r => setTimeout(r, 10)); // UIの応答性のために短い待機
    }

    setVoxelResult(results); // ボクセル化結果を状態に保存
    setVoxelizing(false);     // 処理完了
    // 合計ボクセル数を計算してステータス表示
    const total = Object.values(results).reduce((s, a) => s + a.length, 0);
    setVoxStatus(`${Object.keys(results).length} parts, ${total} voxels`);
    setMode('voxelize'); // ボクセル化モードに切り替え
  }, [parts, scaleMul, offX, offY, offZ, voxRes, chibiEnabled]);

  // 全パーツの結合VOXファイルをエクスポートする関数
  const doExportAll = useCallback(() => {
    const all: VoxelEntry[] = []; for (const v of Object.values(voxelResult)) all.push(...v); // 全パーツのボクセルを結合
    if (all.length === 0) return; // ボクセルがなければスキップ
    // 重複ボクセルを除去
    const seen = new Set<string>(); const dedup: VoxelEntry[] = [];
    for (const v of all) { const k = `${v.x},${v.y},${v.z}`; if (!seen.has(k)) { seen.add(k); dedup.push(v); } }
    const blob = exportVoxBlob(dedup, BODY_SIZE.x, BODY_SIZE.y, BODY_SIZE.z); // VOX形式Blob生成
    // ダウンロードリンクを作成して実行
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = `${fileName?.replace(/\.[^.]+$/, '') ?? 'output'}_voxelized.vox`; a.click();
  }, [voxelResult, fileName]);

  // 個別パーツのVOXファイルをエクスポートする関数
  const doExportPart = useCallback((name: string) => {
    const v = voxelResult[name]; if (!v?.length) return; // ボクセルがなければスキップ
    const blob = exportVoxBlob(v, BODY_SIZE.x, BODY_SIZE.y, BODY_SIZE.z); // VOX形式Blob生成
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `${name}.vox`; a.click(); // ダウンロード実行
  }, [voxelResult]);

  // ドラッグ&ドロップイベントハンドラ
  const onDragOver = (e: React.DragEvent) => { e.preventDefault(); setDragOver(true); };  // ドラッグオーバー（デフォルト動作抑制＋状態更新）
  const onDragLeave = () => setDragOver(false);                                             // ドラッグ離脱
  const onDrop = (e: React.DragEvent) => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f) loadModel(f); }; // ドロップ（ファイル読み込み実行）

  // パーツ名リストをソート（除外パーツは末尾、それ以外はアルファベット順）
  const partNames = Object.keys(parts).sort((a, b) => {
    const ca = parts[a].category === 'exclude' ? 1 : 0, cb = parts[b].category === 'exclude' ? 1 : 0;
    if (ca !== cb) return ca - cb; return a.localeCompare(b);
  });

  // カテゴリ別のパーツ数を集計
  const categoryCounts: Record<string, number> = {};
  for (const p of Object.values(parts)) categoryCounts[p.category] = (categoryCounts[p.category] ?? 0) + 1;

  const hasModel = partNames.length > 0; // モデルが読み込まれているか

  // JSXレンダリング
  return (
    // 全画面フレックスレイアウト（左パネル＋3Dキャンバス）
    <div style={{ width: '100vw', height: '100vh', display: 'flex', background: '#1a1a2e' }}>
      {/* 左パネル: パーツリスト・設定 */}
      <div style={{ width: 380, minWidth: 380, background: '#0f0f23', color: '#ccc', borderRight: '1px solid #333', display: 'flex', flexDirection: 'column' }}>
        {/* ヘッダー: タイトル・モード切替・ファイル選択 */}
        <div style={{ padding: '12px', borderBottom: '1px solid #333' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <div style={{ fontWeight: 'bold', fontSize: 16 }}>Model Import</div>
            {/* モデル読み込み済みの場合、Classify/Voxelizeモード切替ボタンを表示 */}
            {hasModel && (
              <div style={{ display: 'flex', gap: 4, marginLeft: 'auto' }}>
                {/* 分類モードボタン */}
                <button onClick={() => setMode('classify')} style={{
                  padding: '3px 8px', fontSize: 10, borderRadius: 3, cursor: 'pointer',
                  background: mode === 'classify' ? '#48f' : '#234', color: '#fff', border: 'none',
                }}>Classify</button>
                {/* ボクセル化モードボタン */}
                <button onClick={() => setMode('voxelize')} style={{
                  padding: '3px 8px', fontSize: 10, borderRadius: 3, cursor: 'pointer',
                  background: mode === 'voxelize' ? '#48f' : '#234', color: '#fff', border: 'none',
                }}>Voxelize</button>
              </div>
            )}
          </div>

          {/* ファイル選択ボタンとファイル名表示 */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 4 }}>
            <label style={{ padding: '6px 16px', borderRadius: 4, background: '#234', color: '#8cf', border: '1px solid #48f', cursor: 'pointer', fontSize: 12 }}>
              Open File
              {/* 非表示のファイル入力（GLB/GLTF/OBJ対応） */}
              <input type="file" accept=".glb,.gltf,.obj" style={{ display: 'none' }}
                onChange={e => { const f = e.target.files?.[0]; if (f) loadModel(f); }} />
            </label>
            {/* 読み込み済みファイル名を表示 */}
            {fileName && <span style={{ fontSize: 11, color: '#888', alignSelf: 'center', overflow: 'hidden', textOverflow: 'ellipsis' }}>{fileName}</span>}
          </div>
          {/* 対応フォーマット表示 */}
          <div style={{ fontSize: 10, color: '#666' }}>Supported: .glb, .gltf, .obj</div>
        </div>

        {/* Tポーズ検出結果の表示 */}
        {tPoseStatus && (
          <div style={{ padding: '8px 12px', borderBottom: '1px solid #333' }}>
            <div style={{ fontSize: 11, color: '#888', marginBottom: 4 }}>Pose Detection</div>
            {/* スケルトン未検出の場合 */}
            {!tPoseStatus.detected ? (
              <div style={{ fontSize: 12, color: '#888' }}>Skeleton not found</div>
            ) : tPoseStatus.isTPose ? (
              // Tポーズ検出成功（緑色表示）
              <div style={{ fontSize: 12, padding: '4px 8px', borderRadius: 4, background: '#1a3a1a', color: '#4c4', border: '1px solid #2a5a2a' }}>
                T-pose OK (L:{tPoseStatus.leftArmAngle} R:{tPoseStatus.rightArmAngle})
              </div>
            ) : (
              // Aポーズまたは非Tポーズ（黄色警告表示）
              <div style={{ fontSize: 12, padding: '4px 8px', borderRadius: 4, background: '#3a2a1a', color: '#ca4', border: '1px solid #5a3a1a' }}>
                {tPoseStatus.poseType === 'A-pose' ? 'A-pose' : 'Non-T-pose'} (L:{tPoseStatus.leftArmAngle} R:{tPoseStatus.rightArmAngle})
                {/* Blenderでの修正手順を案内 */}
                <div style={{ fontSize: 10, color: '#a86', marginTop: 2 }}>Fix in Blender: Pose Mode &rarr; Arms horizontal &rarr; Apply as Rest Pose</div>
              </div>
            )}
          </div>
        )}

        {/* 分類モード（CLASSIFY）の表示内容 */}
        {mode === 'classify' && (
          <>
            {/* カテゴリサマリー: 各カテゴリのパーツ数をバッジ表示 */}
            {hasModel && (
              <div style={{ padding: '8px 12px', borderBottom: '1px solid #333' }}>
                <div style={{ fontSize: 11, color: '#888', marginBottom: 4 }}>Categories</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                  {/* パーツが存在するカテゴリのみ表示 */}
                  {CATEGORIES.filter(c => categoryCounts[c]).map(c => (
                    <span key={c} style={{ fontSize: 10, padding: '2px 6px', borderRadius: 3, background: CATEGORY_INFO[c].color + '33', color: CATEGORY_INFO[c].color, border: `1px solid ${CATEGORY_INFO[c].color}55` }}>
                      {CATEGORY_INFO[c].labelJa} ({categoryCounts[c]})
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* パーツリスト: 各パーツの表示/非表示トグル・カテゴリ選択 */}
            <div style={{ flex: 1, overflow: 'auto' }}>
              {/* 読み込み中表示 */}
              {loading && <div style={{ padding: 16, color: '#88f' }}>Loading...</div>}
              {/* エラー表示 */}
              {error && <div style={{ padding: 16, color: '#f88', fontSize: 12 }}>{error}</div>}
              {/* パーツ一覧をマップ */}
              {partNames.map(name => {
                const part = parts[name];              // パーツ設定取得
                const isSelected = selectedPart === name; // 選択状態チェック
                const ci = CATEGORY_INFO[part.category];  // カテゴリ情報取得
                return (
                  // パーツ行（クリックで選択、選択時は背景色変更、非表示時は半透明）
                  <div key={name} onClick={() => setSelectedPart(name)} style={{
                    padding: '8px 12px', borderBottom: '1px solid #1a1a2e',
                    background: isSelected ? '#1a2a3a' : 'transparent', cursor: 'pointer', opacity: part.visible ? 1 : 0.4,
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                      {/* 表示/非表示トグルボタン */}
                      <button onClick={e => { e.stopPropagation(); toggleVisibility(name); }} style={{
                        width: 20, height: 20, border: 'none', borderRadius: 3, background: part.visible ? '#3a3a4a' : '#222',
                        color: part.visible ? '#aaa' : '#555', cursor: 'pointer', fontSize: 12, lineHeight: '20px', padding: 0,
                      }}>{part.visible ? '\u25C9' : '\u25CB'}</button>
                      {/* パーツ名 */}
                      <span style={{ fontSize: 12, fontWeight: isSelected ? 'bold' : 'normal', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
                      {/* 頂点数表示 */}
                      <span style={{ fontSize: 9, color: '#666' }}>{part.vertexCount > 0 ? `${part.vertexCount}v` : ''}</span>
                    </div>
                    {/* カテゴリ選択ドロップダウン */}
                    <select value={part.category} onClick={e => e.stopPropagation()} onChange={e => setCategory(name, e.target.value as TemplateCategory)}
                      style={{ width: '100%', fontSize: 11, padding: '3px 6px', borderRadius: 3, background: ci.color + '22', color: ci.color, border: `1px solid ${ci.color}55` }}>
                      {CATEGORIES.map(c => <option key={c} value={c}>{CATEGORY_INFO[c].labelJa} ({CATEGORY_INFO[c].label})</option>)}
                    </select>
                  </div>
                );
              })}
            </div>

            {/* 分類モードの下部ボタン: 設定読み込み・エクスポート・次のステップ */}
            {hasModel && (
              <div style={{ padding: '12px', borderTop: '1px solid #333', display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ display: 'flex', gap: 8 }}>
                  {/* 設定ファイル読み込みボタン */}
                  <label style={{ flex: 1, padding: '6px 12px', borderRadius: 4, background: '#2a2a3a', color: '#aaa', border: '1px solid #444', cursor: 'pointer', fontSize: 11, textAlign: 'center' }}>
                    Load Config
                    <input type="file" accept=".json" style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) importConfig(f); }} />
                  </label>
                  {/* 設定エクスポートボタン */}
                  <button onClick={exportConfig} style={{ flex: 1, padding: '6px 12px', borderRadius: 4, background: '#234', color: '#8cf', border: '1px solid #48f', cursor: 'pointer', fontSize: 11 }}>
                    Export Config
                  </button>
                </div>
                {/* ボクセル化ステップへ進むボタン */}
                <button onClick={() => setMode('voxelize')} style={{
                  padding: '10px 16px', borderRadius: 4, background: '#253', color: '#8cf', border: '1px solid #48f', cursor: 'pointer', fontSize: 14, fontWeight: 'bold',
                }}>
                  Next: Voxelize &rarr;
                </button>
              </div>
            )}
          </>
        )}

        {/* ボクセル化モード（VOXELIZE）の表示内容 */}
        {mode === 'voxelize' && (
          <>
            {/* アライメント調整パネル: スケール・オフセット・解像度のスライダー */}
            <div style={{ padding: '8px 12px', borderBottom: '1px solid #333' }}>
              <div style={{ fontSize: 11, color: '#888', marginBottom: 6 }}>Alignment</div>
              <div style={{ display: 'grid', gridTemplateColumns: '70px 1fr 40px', gap: '4px', alignItems: 'center', fontSize: 11 }}>
                {/* スケール倍率スライダー（0.1〜5倍） */}
                <span>Scale</span>
                <input type="range" min="0.1" max="5" step="0.05" value={scaleMul} onChange={e => setScaleMul(Number(e.target.value))} />
                <span style={{ color: '#8cf' }}>{scaleMul.toFixed(2)}</span>
                {/* Xオフセットスライダー（-50〜50） */}
                <span>Offset X</span>
                <input type="range" min="-50" max="50" step="1" value={offX} onChange={e => setOffX(Number(e.target.value))} />
                <span style={{ color: '#8cf' }}>{offX}</span>
                {/* Yオフセットスライダー（-50〜50） */}
                <span>Offset Y</span>
                <input type="range" min="-50" max="50" step="1" value={offY} onChange={e => setOffY(Number(e.target.value))} />
                <span style={{ color: '#8cf' }}>{offY}</span>
                {/* Zオフセットスライダー（-50〜50） */}
                <span>Offset Z</span>
                <input type="range" min="-50" max="50" step="1" value={offZ} onChange={e => setOffZ(Number(e.target.value))} />
                <span style={{ color: '#8cf' }}>{offZ}</span>
                {/* 解像度スライダー（0.005〜0.03） */}
                <span>Resolution</span>
                <input type="range" min="0.005" max="0.03" step="0.001" value={voxRes} onChange={e => setVoxRes(Number(e.target.value))} />
                <span style={{ color: '#8cf' }}>{voxRes.toFixed(3)}</span>
              </div>
            </div>

            {/* デフォルメ変形の有効/無効トグル */}
            <div style={{ padding: '8px 12px', borderBottom: '1px solid #333' }}>
              <label style={{ fontSize: 11, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
                <input type="checkbox" checked={chibiEnabled} onChange={e => setChibiEnabled(e.target.checked)} />
                <span>EC Body Chibi Deform</span>
              </label>
              {/* デフォルメパラメータの説明 */}
              <div style={{ fontSize: 9, color: '#666', marginTop: 2, marginLeft: 20 }}>
                Head 1.5-1.8x, Torso 1.1x, Legs compress+spread
              </div>
            </div>

            {/* 3Dモデルとボクセルの表示/非表示チェックボックス */}
            <div style={{ padding: '8px 12px', borderBottom: '1px solid #333', display: 'flex', gap: 16 }}>
              <label style={{ fontSize: 11, cursor: 'pointer' }}>
                <input type="checkbox" checked={showGlb} onChange={e => setShowGlb(e.target.checked)} /> 3D Model
              </label>
              <label style={{ fontSize: 11, cursor: 'pointer' }}>
                <input type="checkbox" checked={showVoxels} onChange={e => setShowVoxels(e.target.checked)} /> Voxels
              </label>
            </div>

            {/* ボクセル化対象パーツリスト（ボクセル数・個別エクスポートボタン付き） */}
            <div style={{ flex: 1, overflow: 'auto' }}>
              {Object.entries(parts).filter(([_, p]) => p.visible && p.category !== 'exclude' && p.category !== 'body').map(([name, part]) => (
                <div key={name} style={{ padding: '6px 12px', borderBottom: '1px solid #1a1a2e', display: 'flex', alignItems: 'center', gap: 8 }}>
                  {/* カテゴリ色の小さなインジケーター */}
                  <span style={{ width: 8, height: 8, borderRadius: 2, background: CATEGORY_INFO[part.category].color, display: 'inline-block', flexShrink: 0 }} />
                  {/* パーツ名 */}
                  <span style={{ fontSize: 11, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
                  {/* カテゴリ名 */}
                  <span style={{ fontSize: 9, color: '#666' }}>{part.category}</span>
                  {/* ボクセル化結果がある場合、ボクセル数と個別エクスポートボタンを表示 */}
                  {voxelResult[name] && (
                    <>
                      <span style={{ fontSize: 9, color: '#4c4' }}>{voxelResult[name].length}v</span>
                      <button onClick={() => doExportPart(name)} style={{ padding: '1px 6px', fontSize: 9, background: '#234', color: '#8cf', border: '1px solid #48f', borderRadius: 3, cursor: 'pointer' }}>
                        .vox
                      </button>
                    </>
                  )}
                </div>
              ))}
            </div>

            {/* ボクセル化モードの下部: ステータス・戻るボタン・実行ボタン・エクスポートボタン */}
            <div style={{ padding: '12px', borderTop: '1px solid #333', display: 'flex', flexDirection: 'column', gap: 8 }}>
              {/* ステータスメッセージ */}
              {voxStatus && <div style={{ fontSize: 11, color: '#888' }}>{voxStatus}</div>}
              {/* 分類モードに戻るボタン */}
              <button onClick={() => setMode('classify')} style={{
                padding: '6px 12px', borderRadius: 4, background: '#2a2a3a', color: '#aaa', border: '1px solid #444', cursor: 'pointer', fontSize: 11,
              }}>&larr; Back to Classify</button>
              {/* ボクセル化実行ボタン（処理中はdisabled） */}
              <button onClick={doVoxelize} disabled={voxelizing} style={{
                padding: '10px 16px', borderRadius: 4, background: voxelizing ? '#532' : '#253',
                color: '#8cf', border: '1px solid #48f', cursor: voxelizing ? 'wait' : 'pointer', fontSize: 14, fontWeight: 'bold',
              }}>{voxelizing ? 'Voxelizing...' : 'Voxelize'}</button>
              {/* ボクセル化結果がある場合、全パーツ一括エクスポートボタンを表示 */}
              {Object.keys(voxelResult).length > 0 && (
                <button onClick={doExportAll} style={{
                  padding: '8px 16px', borderRadius: 4, background: '#234', color: '#8cf', border: '1px solid #48f', cursor: 'pointer', fontSize: 13, fontWeight: 'bold',
                }}>Export All (.vox)</button>
              )}
            </div>
          </>
        )}
      </div>

      {/* 3Dキャンバス領域（ドラッグ&ドロップ対応） */}
      <div style={{ flex: 1, position: 'relative' }} onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop}>
        {/* Babylon.js描画用キャンバス */}
        <canvas ref={canvasRef} style={{ width: '100%', height: '100%', outline: 'none' }} />
        {/* ドラッグオーバー時のオーバーレイ表示 */}
        {dragOver && (
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(40,80,160,0.3)', border: '3px dashed #48f', display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
            <div style={{ fontSize: 24, color: '#8cf', fontWeight: 'bold' }}>Drop model file here</div>
          </div>
        )}
        {/* モデル未読み込み時のプレースホルダー（ドラッグ&ドロップ案内） */}
        {!fileName && !loading && (
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
            <div style={{ fontSize: 48, color: '#333', marginBottom: 16 }}>+</div>
            <div style={{ fontSize: 16, color: '#555' }}>Drag & drop a 3D model file</div>
            <div style={{ fontSize: 12, color: '#444', marginTop: 8 }}>.glb / .gltf / .obj</div>
          </div>
        )}
        {/* 分類モードで選択パーツがある場合、画面下部にパーツ情報パネルを表示 */}
        {selectedPart && parts[selectedPart] && mode === 'classify' && (
          <div style={{ position: 'absolute', bottom: 16, left: 16, right: 16, background: 'rgba(15,15,35,0.9)', border: '1px solid #333', borderRadius: 8, padding: '12px 16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              {/* カテゴリ色インジケーター */}
              <span style={{ width: 12, height: 12, borderRadius: 2, display: 'inline-block', background: CATEGORY_INFO[parts[selectedPart].category].color }} />
              {/* パーツ名 */}
              <span style={{ fontSize: 14, fontWeight: 'bold', color: '#ccc' }}>{selectedPart}</span>
              {/* カテゴリ日本語名 */}
              <span style={{ fontSize: 11, color: '#888' }}>{CATEGORY_INFO[parts[selectedPart].category].labelJa}</span>
              {/* 頂点数 */}
              <span style={{ fontSize: 11, color: '#666' }}>{parts[selectedPart].vertexCount} vertices</span>
              {/* 選択解除ボタン */}
              <button onClick={() => setSelectedPart(null)} style={{ marginLeft: 'auto', padding: '2px 8px', border: '1px solid #555', borderRadius: 3, background: '#2a2a3a', color: '#888', cursor: 'pointer', fontSize: 11 }}>Deselect</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
