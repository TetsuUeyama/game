'use client'; // Next.jsでクライアントサイドレンダリングを有効化するディレクティブ

// React の基本フック群をインポート
import { useEffect, useRef, useState, useCallback } from 'react';
// Babylon.js の3Dエンジン関連クラスをインポート
import {
  Engine,              // レンダリングエンジン本体
  Scene,               // 3Dシーン（オブジェクト・ライト・カメラを保持）
  ArcRotateCamera,     // ターゲットを中心に回転するカメラ
  HemisphericLight,    // 半球ライト（環境光）
  DirectionalLight,    // 平行光源（太陽光のような指向性ライト）
  Vector3,             // 3次元ベクトル
  Color4,              // RGBA カラー値
  Mesh,                // 3Dメッシュオブジェクト
  VertexData,          // 頂点データ（位置・法線・色・インデックス）
  StandardMaterial,    // 標準マテリアル
  Matrix,              // 4x4 変換行列
  Quaternion,          // クォータニオン（回転表現）
} from '@babylonjs/core';

// ========================================================================
// Types & constants（型定義と定数）
// ========================================================================

// ボクセルの6面の方向ベクトル（+X, -X, +Y, -Y, +Z, -Z）
const FACE_DIRS = [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]];
// 各面を構成する4頂点のローカル座標（キューブの各面の頂点オフセット）
const FACE_VERTS = [
  [[1,0,0],[1,1,0],[1,1,1],[1,0,1]],   // +X面の4頂点
  [[0,0,1],[0,1,1],[0,1,0],[0,0,0]],   // -X面の4頂点
  [[0,1,0],[0,1,1],[1,1,1],[1,1,0]],   // +Y面（上面）の4頂点
  [[0,0,1],[0,0,0],[1,0,0],[1,0,1]],   // -Y面（底面）の4頂点
  [[0,0,1],[0,1,1],[1,1,1],[1,0,1]],   // +Z面の4頂点
  [[1,0,0],[1,1,0],[0,1,0],[0,0,0]],   // -Z面の4頂点
];
// 各面の法線ベクトル（面の向き）
const FACE_NORMALS = [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]];
// ブラウザキャッシュを回避するためのクエリパラメータ（現在時刻をバージョンとして付与）
const CACHE_BUST = `?v=${Date.now()}`;
// ボクセルデータを取得するAPIのベースパス
const VOX_API = '/api/vox';
// 度→ラジアン変換定数（1度あたりのラジアン値）
const DEG = Math.PI / 180;
// 角速度の減衰係数（1フレームごとに速度が93%に減衰）
const ANG_DAMPING = 0.93;
// 角度のバネ定数（元の位置に戻ろうとする力の強さ）
const ANG_SPRING = 0.08;

// セグメントバンドルデータの型定義（全ボーンのボクセルデータを1ファイルにまとめた形式）
interface SegmentBundleData {
  grid: { gx: number; gy: number; gz: number };   // グリッドサイズ（X, Y, Z方向のボクセル数）
  palette: number[][];                              // カラーパレット（色インデックス→[r,g,b]の配列）
  segments: Record<string, number[]>;               // ボーン名→ボクセルデータ配列（[x,y,z,colorIndex]のフラット配列）
}
// セグメント情報の型定義（ボーン位置やグリッド情報を含むメタデータ）
interface SegmentsData {
  voxel_size: number;                                                            // 1ボクセルのワールド空間でのサイズ
  grid: { gx: number; gy: number; gz: number };                                 // グリッドサイズ
  bone_positions: Record<string, { head_voxel: number[]; tail_voxel: number[] }>; // 各ボーンのヘッド・テール位置（ボクセル座標）
  segments: Record<string, { file: string; voxels: number }>;                    // 各セグメントのファイル名とボクセル数
}
// ボーン階層の1エントリ分の型定義
interface BoneHierarchyEntry {
  bone: string;              // ボーン名
  parent: string | null;     // 親ボーン名（ルートの場合はnull）
  jointPoint: number[];      // 関節位置（ワールド空間座標 [x, y, z]）
  children: string[];        // 子ボーン名の配列
}
// ポーズデータの型定義（ボーン名→オイラー角回転[度]のマップ）
type PoseData = Record<string, { rx: number; ry: number; rz: number }>;
// キーフレームの型定義（ラベルとポーズデータを持つ）
interface Keyframe { label: string; pose: PoseData; }

// ボーンごとの角度物理演算パラメータの型定義
interface BonePhysics {
  ox: number; oy: number; oz: number; // 現在の角度オフセット（ラジアン）
  vx: number; vy: number; vz: number; // 角速度（ラジアン/フレーム）
  mass: number;                        // ボーンの質量（慣性に影響）
  locked: boolean;                     // ロック状態（trueなら物理演算の影響を受けない）
}

// ボーン名に基づいて質量を返す関数（体の部位ごとに異なる慣性を表現）
function getBoneMass(bone: string): number {
  // ルートと脊椎は最も重い（動きにくい）
  if (bone.includes('root') || bone.includes('spine')) return 5.0;
  // 太ももは重め
  if (bone.includes('thigh')) return 4.0;
  // 脛は中程度
  if (bone.includes('leg')) return 3.0;
  // 肩と首は軽め
  if (bone.includes('shoulder') || bone.includes('neck')) return 2.0;
  // 腕と前腕
  if (bone.includes('arm') || bone.includes('forearm')) return 1.5;
  // 頭
  if (bone.includes('head')) return 1.5;
  // 手と足先は軽い
  if (bone.includes('hand') || bone.includes('foot')) return 1.0;
  // 胸（揺れもの用）
  if (bone.includes('breast')) return 0.5;
  // 耳と顎は最も軽い
  if (bone.includes('ear') || bone.includes('jaw')) return 0.3;
  // デフォルトの質量
  return 1.0;
}

// ========================================================================
// ARP Hierarchy（Auto-Rig Pro ボーン階層定義）
// ========================================================================

// ARP（Auto-Rig Pro）リグのボーン親子関係をマップで定義
// キー=子ボーン名、値=親ボーン名
const ARP_HIERARCHY: Record<string, string> = {
  // 脊椎チェーン: root → spine01 → spine02 → spine03
  'c_spine_01_bend.x': 'c_root_bend.x',
  'c_spine_02_bend.x': 'c_spine_01_bend.x',
  'c_spine_03_bend.x': 'c_spine_02_bend.x',
  // 頭部チェーン: spine03 → neck → head → jawbone
  'neck.x': 'c_spine_03_bend.x', 'head.x': 'neck.x', 'jawbone.x': 'head.x',
  // 耳: head から分岐（左右それぞれ ear_01 → ear_02）
  'c_ear_01.l': 'head.x', 'c_ear_01.r': 'head.x',
  'c_ear_02.l': 'c_ear_01.l', 'c_ear_02.r': 'c_ear_01.r',
  // 胸: spine03 から分岐（左右独立）
  'breast.l': 'c_spine_03_bend.x', 'breast.r': 'c_spine_03_bend.x',
  // 左腕チェーン: spine03 → shoulder → arm_twist → arm_twist_2 → arm_stretch → forearm_stretch → forearm_twist_2 → forearm_twist → hand
  'shoulder.l': 'c_spine_03_bend.x',
  'c_arm_twist.l': 'shoulder.l', 'c_arm_twist_2.l': 'shoulder.l',
  'c_arm_stretch.l': 'c_arm_twist_2.l', 'elbow.l': 'c_arm_stretch.l',
  'c_forearm_stretch.l': 'c_arm_stretch.l',
  'c_forearm_twist_2.l': 'c_forearm_stretch.l', 'c_forearm_twist.l': 'c_forearm_twist_2.l',
  'hand.l': 'c_forearm_twist.l',
  // 右腕チェーン: 左腕と同じ構造
  'shoulder.r': 'c_spine_03_bend.x',
  'c_arm_twist.r': 'shoulder.r', 'c_arm_twist_2.r': 'shoulder.r',
  'c_arm_stretch.r': 'c_arm_twist_2.r', 'elbow.r': 'c_arm_stretch.r',
  'c_forearm_stretch.r': 'c_arm_stretch.r',
  'c_forearm_twist_2.r': 'c_forearm_stretch.r', 'c_forearm_twist.r': 'c_forearm_twist_2.r',
  'hand.r': 'c_forearm_twist.r',
  // 左脚チェーン: root → thigh_twist → thigh_twist_2 → thigh_stretch → leg_stretch → leg_twist_2 → leg_twist → foot → toes
  'c_thigh_twist.l': 'c_root_bend.x', 'c_thigh_twist_2.l': 'c_thigh_twist.l',
  'c_thigh_stretch.l': 'c_thigh_twist_2.l', 'knee.l': 'c_thigh_stretch.l',
  'c_leg_stretch.l': 'c_thigh_stretch.l', 'c_leg_twist_2.l': 'c_leg_stretch.l',
  'c_leg_twist.l': 'c_leg_twist_2.l', 'foot.l': 'c_leg_twist.l', 'toes_01.l': 'foot.l',
  // 右脚チェーン: 左脚と同じ構造
  'c_thigh_twist.r': 'c_root_bend.x', 'c_thigh_twist_2.r': 'c_thigh_twist.r',
  'c_thigh_stretch.r': 'c_thigh_twist_2.r', 'knee.r': 'c_thigh_stretch.r',
  'c_leg_stretch.r': 'c_thigh_stretch.r', 'c_leg_twist_2.r': 'c_leg_stretch.r',
  'c_leg_twist.r': 'c_leg_twist_2.r', 'foot.r': 'c_leg_twist.r', 'toes_01.r': 'foot.r',
  // 左手の指: hand.l → 各指の関節チェーン（thumb, index, middle, ring, pinky）
  'thumb1.l': 'hand.l', 'c_thumb2.l': 'thumb1.l', 'c_thumb3.l': 'c_thumb2.l',
  'c_index1_base.l': 'hand.l', 'index1.l': 'c_index1_base.l', 'c_index2.l': 'index1.l', 'c_index3.l': 'c_index2.l',
  'c_middle1_base.l': 'hand.l', 'middle1.l': 'c_middle1_base.l', 'c_middle2.l': 'middle1.l', 'c_middle3.l': 'c_middle2.l',
  'c_ring1_base.l': 'hand.l', 'ring1.l': 'c_ring1_base.l', 'c_ring2.l': 'ring1.l', 'c_ring3.l': 'c_ring2.l',
  'c_pinky1_base.l': 'hand.l', 'pinky1.l': 'c_pinky1_base.l', 'c_pinky2.l': 'pinky1.l', 'c_pinky3.l': 'c_pinky2.l',
  // 右手の指: hand.r → 各指の関節チェーン（左手と同じ構造）
  'thumb1.r': 'hand.r', 'c_thumb2.r': 'thumb1.r', 'c_thumb3.r': 'c_thumb2.r',
  'c_index1_base.r': 'hand.r', 'index1.r': 'c_index1_base.r', 'c_index2.r': 'index1.r', 'c_index3.r': 'c_index2.r',
  'c_middle1_base.r': 'hand.r', 'middle1.r': 'c_middle1_base.r', 'c_middle2.r': 'middle1.r', 'c_middle3.r': 'c_middle2.r',
  'c_ring1_base.r': 'hand.r', 'ring1.r': 'c_ring1_base.r', 'c_ring2.r': 'ring1.r', 'c_ring3.r': 'c_ring2.r',
  'c_pinky1_base.r': 'hand.r', 'pinky1.r': 'c_pinky1_base.r', 'c_pinky2.r': 'pinky1.r', 'c_pinky3.r': 'c_pinky2.r',
};

// ========================================================================
// Mesh builder + hierarchy（メッシュ生成とボーン階層構築）
// ========================================================================

// セグメントバンドルデータからボーンごとのボクセルメッシュを生成する関数
function buildBundleMeshes(
  bundle: SegmentBundleData,  // バンドルデータ（全ボーンのボクセル情報）
  scene: Scene,                // Babylon.jsシーン
  mat: StandardMaterial,       // 共有マテリアル
  scale: number                // ボクセルサイズ（ワールド空間スケール）
): Record<string, Mesh> {
  // グリッドの中心座標を算出（ボクセルをワールド原点中心に配置するため）
  const cx = bundle.grid.gx / 2, cy = bundle.grid.gy / 2;
  // ボーン名→メッシュのマップ（戻り値）
  const meshes: Record<string, Mesh> = {};
  // 各ボーンのボクセルデータを処理
  for (const [boneName, flat] of Object.entries(bundle.segments)) {
    // ボクセル数を計算（フラット配列は [x,y,z,colorIdx] の4要素ずつ）
    const n = flat.length / 4; if (n === 0) continue;
    // 隣接ボクセルの存在チェック用セット（面のカリングに使用）
    const occ = new Set<string>();
    // 全ボクセルの座標をセットに登録
    for (let i = 0; i < n; i++) occ.add(`${flat[i*4]},${flat[i*4+1]},${flat[i*4+2]}`);
    // メッシュ頂点データの配列（位置、法線、色、インデックス）
    const pos: number[] = [], nrm: number[] = [], col: number[] = [], idx: number[] = [];
    // 各ボクセルを処理
    for (let i = 0; i < n; i++) {
      // ボクセルの座標とカラーインデックスを取得
      const vx = flat[i*4], vy = flat[i*4+1], vz = flat[i*4+2], ci = flat[i*4+3];
      // パレットから色を取得（存在しなければデフォルトのグレー）
      const c = bundle.palette[ci] ?? [0.8, 0.8, 0.8];
      // 6面それぞれについて処理
      for (let f = 0; f < 6; f++) {
        // 面の方向ベクトルを取得
        const [dx,dy,dz] = FACE_DIRS[f];
        // 隣接ボクセルが存在する場合はこの面を描画しない（内部面カリング）
        if (occ.has(`${vx+dx},${vy+dy},${vz+dz}`)) continue;
        // 現在の頂点インデックスの基点と、面の頂点・法線データを取得
        const bi = pos.length/3, fv = FACE_VERTS[f], fn = FACE_NORMALS[f];
        // 面の4頂点を追加（ボクセル座標→ビューア座標系に変換）
        for (let vi = 0; vi < 4; vi++) {
          // X: (voxelX - centerX) * scale, Y: voxelZ * scale（上方向）, Z: -(voxelY - centerY) * scale（奥行き反転）
          pos.push((vx+fv[vi][0]-cx)*scale,(vz+fv[vi][2])*scale,-(vy+fv[vi][1]-cy)*scale);
          // 法線もビューア座標系に変換（Y↔Z入れ替え、Z反転）
          nrm.push(fn[0],fn[2],-fn[1]);
          // 頂点カラー（RGBA、Aは常に1.0）
          col.push(c[0],c[1],c[2],1);
        }
        // 2つの三角形でクワッド（四角面）を構成するインデックスを追加
        idx.push(bi,bi+1,bi+2,bi,bi+2,bi+3);
      }
    }
    // 頂点が1つもなければスキップ（全面がカリングされた場合）
    if (pos.length === 0) continue;
    // VertexDataオブジェクトを作成し、頂点データを設定
    const vd = new VertexData(); vd.positions=pos; vd.normals=nrm; vd.colors=col; vd.indices=idx;
    // メッシュを作成し、頂点データを適用、マテリアルを設定
    const m = new Mesh(`seg_${boneName}`, scene); vd.applyToMesh(m, false); m.material=mat;
    // ボーン名でメッシュを登録
    meshes[boneName] = m;
  }
  // 全ボーンのメッシュマップを返す
  return meshes;
}

// セグメントデータからボーン階層構造を構築する関数
function buildBoneHierarchy(segData: SegmentsData): BoneHierarchyEntry[] {
  // ボーン位置データとグリッド情報を取得
  const bp = segData.bone_positions, grid = segData.grid;
  // グリッド中心座標とスケールを算出
  const cx = grid.gx/2, cy = grid.gy/2, scale = segData.voxel_size;
  // セグメントとして存在するボーン名のセット
  const segs = new Set(Object.keys(segData.segments));
  // bone_positionsに存在するキーのセット
  const bpKeys = new Set(Object.keys(bp));
  // セグメント名からbone_positionsのキーを解決する関数（名前の揺れを吸収）
  const resolve = (seg: string) => {
    // そのまま一致するか確認
    if (bpKeys.has(seg)) return seg;
    // "c_"プレフィックスを除去して確認
    let a = seg.replace(/^c_/,''); if (bpKeys.has(a)) return a;
    // さらに"_bend"サフィックスも除去して確認
    a = seg.replace(/^c_/,'').replace(/_bend/,''); if (bpKeys.has(a)) return a;
    // 一致しない場合はnull
    return null;
  };
  // ボーン位置データを取得するヘルパー関数
  const getBp = (seg: string) => { const n = resolve(seg); return n ? bp[n] : null; };
  // 各ボーンの親ボーンを格納するマップ
  const parentOf: Record<string,string|null> = {};
  // 各ボーンの子ボーンリストを格納するマップ
  const childrenOf: Record<string,string[]> = {};
  // ARP_HIERARCHYから親子関係を構築（セグメントとして存在するもののみ）
  for (const s of segs) {
    const p = ARP_HIERARCHY[s];
    // 親がARP_HIERARCHYに定義されていて、かつセグメントとして存在する場合のみ親を設定
    parentOf[s] = (p && segs.has(p)) ? p : null;
    // 子ボーンリストを空で初期化
    childrenOf[s] = [];
  }
  // 親子関係から子ボーンリストを構築
  for (const [n,p] of Object.entries(parentOf)) { if (p) childrenOf[p]?.push(n); }
  // 親を持たないボーン群をルートとして抽出
  const roots = [...segs].filter(n => !parentOf[n]);
  // BFS（幅優先探索）でボーン階層を走査し、順序付きリストを構築
  const order: BoneHierarchyEntry[] = [];
  const queue = [...roots];
  while (queue.length > 0) {
    // キューから次のボーンを取り出す
    const bone = queue.shift()!;
    // ボーンの位置データを取得
    const pos = getBp(bone);
    // head_voxelからジョイントポイントを算出（なければグリッド中心を使用）
    const h = pos ? pos.head_voxel : [cx, cy, 0];
    // ボクセル座標→ビューア座標系に変換してエントリを追加
    order.push({ bone, parent: parentOf[bone], jointPoint: [(h[0]-cx)*scale, h[2]*scale, -(h[1]-cy)*scale], children: childrenOf[bone] });
    // 子ボーンをキューに追加
    for (const child of childrenOf[bone]) queue.push(child);
  }
  // 親→子の順に並んだ階層リストを返す
  return order;
}

// ========================================================================
// FK pose（フォワードキネマティクス ポーズ適用）
// localTransform × parentTransform — 関節は常に接続状態を維持
// ========================================================================

// ボーン階層にポーズを適用し、各ボーンのワールド変換行列を計算する関数
function applyPose(hierarchy: BoneHierarchyEntry[], pose: PoseData): Record<string, number[]> {
  // ボーン名→変換行列（16要素のフラット配列）のマップ
  const result: Record<string, number[]> = {};
  // 階層順（親→子）に処理（親の行列が先に計算されていることを保証）
  for (const entry of hierarchy) {
    // 関節位置を取得
    const jp = entry.jointPoint;
    // ポーズデータからこのボーンの回転角度を取得（なければゼロ回転）
    const a = pose[entry.bone] || { rx: 0, ry: 0, rz: 0 };
    // オイラー角（度→ラジアン変換済み）からクォータニオンを生成
    const localRot = Quaternion.FromEulerAngles(a.rx*DEG, a.ry*DEG, a.rz*DEG);
    // クォータニオンを回転行列に変換
    const rotMat = new Matrix();
    Matrix.FromQuaternionToRef(localRot, rotMat);
    // ローカル変換行列を構築: 関節位置を原点に移動→回転→元の位置に戻す（ピボット回転）
    const local = Matrix.Translation(-jp[0],-jp[1],-jp[2]).multiply(rotMat).multiply(Matrix.Translation(jp[0],jp[1],jp[2]));
    // 親がいない or 親の行列がまだ計算されていない場合
    if (!entry.parent || !result[entry.parent]) {
      // ローカル変換行列をそのままワールド行列として使用
      result[entry.bone] = Array.from(local.asArray());
    } else {
      // ローカル変換に親のワールド変換を乗算してワールド行列を算出（FK連鎖）
      result[entry.bone] = Array.from(local.multiply(Matrix.FromArray(result[entry.parent])).asArray());
    }
  }
  // 全ボーンのワールド変換行列マップを返す
  return result;
}

// 2つのポーズデータを線形補間（Lerp）でブレンドする関数
function blendPoseData(a: PoseData, b: PoseData, t: number): PoseData {
  const r: PoseData = {};
  // 両ポーズに含まれる全ボーン名のユニオンを走査
  for (const bone of new Set([...Object.keys(a), ...Object.keys(b)])) {
    // 各ポーズのボーン角度を取得（存在しなければゼロ回転）
    const aa = a[bone]||{rx:0,ry:0,rz:0}, bb = b[bone]||{rx:0,ry:0,rz:0};
    // 各軸を線形補間: result = a*(1-t) + b*t
    r[bone] = { rx: aa.rx*(1-t)+bb.rx*t, ry: aa.ry*(1-t)+bb.ry*t, rz: aa.rz*(1-t)+bb.rz*t };
  }
  return r;
}

// ========================================================================
// Angular physics（角度物理演算）
// ========================================================================

// 物理演算でロックすべきボーン（下半身の安定性を保つため動かさない）かどうかを判定する関数
function isLockedBone(bone: string): boolean {
  return bone.includes('root') || bone.includes('spine') ||     // 体幹部はロック
    bone.includes('foot') || bone.includes('toes') ||            // 足先はロック
    bone.includes('leg_twist') || bone.includes('leg_stretch') || // 脛のツイスト・ストレッチはロック
    bone.includes('thigh') || bone.includes('knee');              // 太もも・膝はロック
}

// 全ボーンの物理パラメータを初期化する関数
function initAngularPhysics(hierarchy: BoneHierarchyEntry[]): Record<string, BonePhysics> {
  const r: Record<string, BonePhysics> = {};
  for (const e of hierarchy) {
    // 各ボーンに対して角度オフセット=0、角速度=0、質量とロック状態を設定
    r[e.bone] = { ox:0,oy:0,oz:0, vx:0,vy:0,vz:0, mass: getBoneMass(e.bone), locked: isLockedBone(e.bone) };
  }
  return r;
}

// 物理演算を1フレーム分ステップ実行する関数（バネ＋減衰モデル）
function stepAngularPhysics(physics: Record<string, BonePhysics>) {
  for (const bp of Object.values(physics)) {
    // ロックされたボーンはオフセットと速度をゼロにリセットしてスキップ
    if (bp.locked) { bp.ox=0; bp.oy=0; bp.oz=0; bp.vx=0; bp.vy=0; bp.vz=0; continue; }
    // バネ力: 現在のオフセットに比例した復元力を角速度に加算（0に戻ろうとする）
    bp.vx -= bp.ox * ANG_SPRING; bp.vy -= bp.oy * ANG_SPRING; bp.vz -= bp.oz * ANG_SPRING;
    // 減衰: 角速度を係数倍して徐々に減速
    bp.vx *= ANG_DAMPING; bp.vy *= ANG_DAMPING; bp.vz *= ANG_DAMPING;
    // 速度を位置（角度オフセット）に積分
    bp.ox += bp.vx; bp.oy += bp.vy; bp.oz += bp.vz;
    // 角度オフセットを最大値でクランプ（過大な変位を防止）
    const max = 0.8;
    bp.ox = Math.max(-max, Math.min(max, bp.ox));
    bp.oy = Math.max(-max, Math.min(max, bp.oy));
    bp.oz = Math.max(-max, Math.min(max, bp.oz));
  }
}

// ボーンにヒットインパルス（衝撃力）を適用する関数（ヒットリアクション用）
function applyHitImpulse(bone: string, force: Vector3, physics: Record<string, BonePhysics>, hierarchy: BoneHierarchyEntry[]) {
  // 対象ボーンの物理パラメータを取得（ロックされていたら何もしない）
  const bp = physics[bone]; if (!bp || bp.locked) return;
  // 質量の逆数（軽いボーンほど大きく動く）
  const inv = 1 / bp.mass;
  // 力ベクトルを質量で割って角速度に加算
  bp.vx += force.x * inv; bp.vy += force.y * inv; bp.vz += force.z * inv;
  // 子ボーンのマップを構築（衝撃の伝播用）
  const childrenOf: Record<string,string[]> = {};
  for (const e of hierarchy) childrenOf[e.bone] = e.children;
  // 再帰的に子ボーンへ衝撃を伝播する関数
  const propagate = (b: string, s: number, d: number) => {
    // 深さ4を超えるか、強さが0.02未満なら伝播を停止
    if (d > 4 || s < 0.02) return;
    // 各子ボーンに減衰した衝撃を適用
    for (const c of (childrenOf[b]||[])) {
      const cp = physics[c]; if (!cp || cp.locked) continue;
      // 子ボーンの質量で割って角速度に加算
      const ci = s / cp.mass;
      cp.vx += force.x*ci; cp.vy += force.y*ci; cp.vz += force.z*ci;
      // さらに子ボーンへ半分の強さで再帰伝播
      propagate(c, s*0.5, d+1);
    }
  };
  // ヒットボーンの子ボーンへ衝撃を伝播開始
  propagate(bone, 0.5*inv*bp.mass, 0);
}

// ========================================================================
// Component（Reactコンポーネント）
// ========================================================================

// 利用可能なモデルの定義（キー→ラベルとフォルダパス）
const MODELS: Record<string, { label: string; folder: string }> = {
  ce: { label: 'CyberpunkElf', folder: 'female/CyberpunkElf-Detailed' },       // サイバーパンクエルフ（詳細モデル）
  ba: { label: 'BunnyAkali', folder: 'female/BunnyAkali-Base' },               // バニーアカリ（ベースモデル）
  de: { label: 'DarkElfBlader', folder: 'female/DarkElfBlader-Base' },          // ダークエルフブレイダー（ベースモデル）
};

// UIに表示するボーングループの定義（グループ名→ボーン名配列）
const BONE_GROUPS: Record<string, string[]> = {
  'Spine': ['c_root_bend.x','c_spine_01_bend.x','c_spine_02_bend.x','c_spine_03_bend.x'], // 脊椎グループ
  'Head': ['neck.x','head.x','jawbone.x'],                                                  // 頭部グループ
  'Arm L': ['shoulder.l','c_arm_twist.l','c_arm_stretch.l','c_forearm_stretch.l','hand.l'],  // 左腕グループ
  'Arm R': ['shoulder.r','c_arm_twist.r','c_arm_stretch.r','c_forearm_stretch.r','hand.r'],  // 右腕グループ
  'Leg L': ['c_thigh_twist.l','c_thigh_stretch.l','c_leg_stretch.l','foot.l'],               // 左脚グループ
  'Leg R': ['c_thigh_twist.r','c_thigh_stretch.r','c_leg_stretch.r','foot.r'],               // 右脚グループ
};

// Motion Lab ページのメインコンポーネント
export default function MotionLabPage() {
  // キャンバス要素へのRef（Babylon.jsのレンダリング先）
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // Babylon.jsシーンへのRef
  const sceneRef = useRef<Scene | null>(null);
  // ボーン名→メッシュのマップへのRef
  const meshesRef = useRef<Record<string, Mesh>>({});
  // ボーン階層データへのRef
  const hierarchyRef = useRef<BoneHierarchyEntry[]>([]);
  // ボーンごとの角度物理演算パラメータへのRef
  const angPhysicsRef = useRef<Record<string, BonePhysics>>({});

  // 現在選択中のモデルキー（'ce', 'ba', 'de'のいずれか）
  const [modelKey, setModelKey] = useState('ce');
  // モデルの読み込みが完了してポーズ操作可能な状態かどうか
  const [ready, setReady] = useState(false);
  // モデル読み込み中かどうか
  const [loading, setLoading] = useState(false);
  // 現在UIで選択されているボーン名（null=未選択）
  const [selectedBone, setSelectedBone] = useState<string | null>(null);
  // 現在展開されているボーングループ名（null=全て閉じている）
  const [openGroup, setOpenGroup] = useState<string | null>('Spine');
  // キーフレームの配列（デフォルトでPose AとPose Bの2つ、初期ポーズは空=Tポーズ）
  const [keyframes, setKeyframes] = useState<Keyframe[]>([
    { label: 'Pose A', pose: {} }, { label: 'Pose B', pose: {} },
  ]);
  // 現在編集中のキーフレームインデックス（0=Pose A, 1=Pose B）
  const [editingKf, setEditingKf] = useState(0);
  // アニメーション再生中かどうか
  const [playing, setPlaying] = useState(false);
  // トランジション（ポーズ間遷移）のフレーム数
  const [transitionDuration, setTransitionDuration] = useState(60);
  // ループモード（'once'=A→Bの一方向ループ, 'pingpong'=A→B→Aの往復ループ）
  const [loopMode, setLoopMode] = useState<'once'|'pingpong'>('pingpong');
  // 現在のアニメーションフレーム番号（UIに表示用、Refで管理してリレンダリングを避ける）
  const frameRef = useRef(0);
  // フレーム番号表示用のspan要素へのRef（直接DOM操作でパフォーマンスを最適化）
  const frameDisplayRef = useRef<HTMLSpanElement>(null);

  // シーン初期化のエフェクト（コンポーネントマウント時に1回だけ実行）
  useEffect(() => {
    // キャンバス要素を取得（なければ終了）
    const canvas = canvasRef.current; if (!canvas) return;
    // Babylon.jsエンジンを作成（第2引数trueでアンチエイリアス有効）
    const engine = new Engine(canvas, true);
    // 新しいシーンを作成
    const scene = new Scene(engine);
    // 背景色を暗い紺色に設定
    scene.clearColor = new Color4(0.06, 0.06, 0.1, 1);
    // シーンをRefに保存（他のエフェクトからアクセスするため）
    sceneRef.current = scene;
    // アークローテートカメラを設定: 水平角-90°、仰角72°、距離2.5、注視点(0, 0.85, 0)
    const cam = new ArcRotateCamera('cam', -Math.PI/2, Math.PI/2.5, 2.5, new Vector3(0,0.85,0), scene);
    // カメラのコントロールを有効化し、ズーム範囲と精度を設定
    cam.attachControl(canvas, true); cam.lowerRadiusLimit=0.5; cam.upperRadiusLimit=8; cam.wheelPrecision=80; cam.minZ=0.01;
    // 半球ライト（環境光）を追加（上方向から照射、強度0.7）
    new HemisphericLight('h', new Vector3(0,1,0), scene).intensity = 0.7;
    // 平行光源を追加（左上奥から照射、強度0.8）
    const d = new DirectionalLight('d', new Vector3(-1,-2,1), scene); d.intensity=0.8; d.position=new Vector3(3,5,-3);
    // レンダリングループを開始（毎フレームシーンを描画）
    engine.runRenderLoop(() => scene.render());
    // ウィンドウリサイズ時にエンジンをリサイズするイベントリスナー
    const resize = () => engine.resize();
    window.addEventListener('resize', resize);
    // クリーンアップ関数（コンポーネントアンマウント時にリソースを解放）
    return () => { window.removeEventListener('resize', resize); engine.dispose(); };
  }, []); // 依存配列が空なので初回マウント時のみ実行

  // モデル読み込みのエフェクト（modelKeyが変わるたびに実行）
  useEffect(() => {
    // シーンが初期化されていなければ終了
    const scene = sceneRef.current; if (!scene) return;
    // 状態をリセット: ローディング開始、準備完了をfalseに、再生を停止
    setLoading(true); setReady(false); setPlaying(false);
    // 既存のメッシュを全て破棄（前のモデルのリソース解放）
    for (const m of Object.values(meshesRef.current)) m.dispose();
    // メッシュマップをクリア
    meshesRef.current = {};
    // モデル設定を取得（存在しなければローディング解除して終了）
    const config = MODELS[modelKey]; if (!config) { setLoading(false); return; }
    // 非同期でモデルデータを読み込み
    (async () => {
      try {
        // セグメントメタデータ（ボーン位置情報等）をAPIから取得
        const segData: SegmentsData = await (await fetch(`${VOX_API}/${config.folder}/segments.json${CACHE_BUST}`)).json();
        // ボーン階層構造を構築
        hierarchyRef.current = buildBoneHierarchy(segData);
        // セグメントバンドル（全ボーンのボクセルデータ）をAPIから取得
        const bundle: SegmentBundleData = await (await fetch(`${VOX_API}/${config.folder}/segments_bundle.json${CACHE_BUST}`)).json();
        // 頂点カラーを使用するマテリアルを作成
        const mat = new StandardMaterial('m', scene);
        // vertexColorEnabledプロパティを有効化（型安全のためキャスト）
        (mat as unknown as {vertexColorEnabled:boolean}).vertexColorEnabled = true;
        // バンドルデータからボーンごとのメッシュを生成
        meshesRef.current = buildBundleMeshes(bundle, scene, mat, segData.voxel_size);
        // 角度物理演算パラメータを初期化
        angPhysicsRef.current = initAngularPhysics(hierarchyRef.current);
        // 準備完了状態に設定
        setReady(true);
        // レストポーズ（初期姿勢）を適用
        const mats = applyPose(hierarchyRef.current, {});
        // 各メッシュにワールド変換行列を設定（freezeWorldMatrixで静的最適化）
        for (const [s, mesh] of Object.entries(meshesRef.current)) {
          const m = mats[s]; mesh.freezeWorldMatrix(m ? Matrix.FromArray(m) : Matrix.Identity());
        }
      } catch (e) { console.error('Load failed:', e); } // 読み込みエラー時のログ出力
      // ローディング完了
      setLoading(false);
    })();
  }, [modelKey]); // modelKeyが変更されるたびにモデルを再読み込み

  // 現在のポーズをモデルに適用するコールバック関数
  const applyCurrentPose = useCallback(() => {
    // 階層データがなければ何もしない
    if (hierarchyRef.current.length === 0) return;
    // 現在編集中のキーフレームのポーズデータでFK計算を実行
    const mats = applyPose(hierarchyRef.current, keyframes[editingKf]?.pose || {});
    // 各メッシュにワールド変換行列を適用
    for (const [s, mesh] of Object.entries(meshesRef.current)) {
      const m = mats[s]; mesh.freezeWorldMatrix(m ? Matrix.FromArray(m) : Matrix.Identity());
    }
  }, [keyframes, editingKf]); // keyframesまたはeditingKfが変わったら関数を再生成

  // 再生中でない時にポーズが変更されたらモデルに反映するエフェクト
  useEffect(() => { if (!playing && ready) applyCurrentPose(); }, [keyframes, editingKf, ready, playing, applyCurrentPose]);

  // ボーンの回転角度を更新するコールバック関数
  const updateBoneAngle = useCallback((bone: string, axis: 'rx'|'ry'|'rz', value: number) => {
    setKeyframes(prev => {
      // キーフレーム配列をコピー
      const next = [...prev]; const kf = {...next[editingKf]};
      // ポーズデータをコピーし、指定ボーン・軸の値を更新
      const pose = {...kf.pose}; const a = {...(pose[bone]||{rx:0,ry:0,rz:0})};
      a[axis] = value; pose[bone] = a; kf.pose = pose; next[editingKf] = kf; return next;
    });
  }, [editingKf]); // editingKfが変わったら関数を再生成

  // キャンバスクリックのハンドラー（ボーン選択 or ヒットリアクション）
  const handleCanvasClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    // シーンがなければ終了
    const scene = sceneRef.current; if (!scene) return;
    // クリック位置でレイキャスト（3D空間のオブジェクトとの交差判定）
    const pick = scene.pick(e.nativeEvent.offsetX, e.nativeEvent.offsetY);
    // メッシュにヒットしなかった場合は終了
    if (!pick?.hit || !pick.pickedMesh) return;
    // メッシュ名から"seg_"プレフィックスを除去してボーン名を取得
    const boneName = pick.pickedMesh.name.replace('seg_', '');
    // 再生中でない場合: ボーンを選択し、対応するグループを展開
    if (!playing) {
      setSelectedBone(boneName);
      // クリックされたボーンが属するグループを探して展開
      for (const [g, bones] of Object.entries(BONE_GROUPS)) { if (bones.includes(boneName)) { setOpenGroup(g); break; } }
      return;
    }
    // 再生中の場合: ヒットリアクションを発動
    let dir: Vector3;
    // ヒット法線が取得できればそれを使用、なければランダムな方向を生成
    if (pick.getNormal) { const n = pick.getNormal(); dir = n ? n.normalize() : Vector3.Right(); }
    else dir = new Vector3(Math.random()-0.5, 0.2, Math.random()-0.5).normalize();
    // ヒットインパルスを適用（力の大きさに若干のランダム性を付与）
    applyHitImpulse(boneName, dir.scale(0.15+Math.random()*0.1), angPhysicsRef.current, hierarchyRef.current);
  }, [playing]); // playingが変わったら関数を再生成

  // アニメーションループのエフェクト（再生中のみ動作）
  useEffect(() => {
    // 再生中でない、またはモデルが準備できていなければ何もしない
    if (!playing || !ready) return;
    // 現在のボーン階層データを取得
    const hierarchy = hierarchyRef.current;
    // キーフレームAとBのポーズデータを取得
    const poseA = keyframes[0]?.pose || {}, poseB = keyframes[1]?.pose || {};
    // トランジションフレーム数
    const dur = transitionDuration;
    // 総フレーム数（ピンポンなら往復分で2倍、onceならそのまま）
    const total = loopMode === 'pingpong' ? dur*2 : dur;
    // 物理演算パラメータの参照を取得
    const angPhys = angPhysicsRef.current;
    // フレームカウンターと前回時刻、requestAnimationFrameのIDを初期化
    let frame = 0, lastTime = 0, rafId = 0;

    // 毎フレーム呼ばれるアニメーションティック関数
    const tick = (now: number) => {
      // 次のフレームをリクエスト
      rafId = requestAnimationFrame(tick);
      // 30FPS制限: 前回から1/30秒経過していなければスキップ
      if (now - lastTime < 1000/30) return;
      // 前回時刻を更新
      lastTime = now;
      // フレームカウンターを進めてループ
      frame = (frame+1) % total; frameRef.current = frame;
      // 補間パラメータtを計算: ピンポンなら前半は0→1、後半は1→0。onceなら0→1
      const t = loopMode === 'pingpong' ? (frame < dur ? frame/dur : (total-frame)/dur) : frame/dur;

      // 物理演算を1ステップ実行（バネ減衰による揺れの更新）
      stepAngularPhysics(angPhys);
      // 2つのポーズをtで線形補間
      const blended = blendPoseData(poseA, poseB, t);
      // 物理オフセットを加算した最終ポーズを構築
      const finalPose: PoseData = {};
      for (const e of hierarchy) {
        // ブレンドされた基本ポーズを取得
        const base = blended[e.bone] || {rx:0,ry:0,rz:0};
        // 物理演算によるオフセットを取得
        const p = angPhys[e.bone];
        // 基本ポーズに物理オフセットを加算（ラジアン→度に変換して加算）
        finalPose[e.bone] = p ? { rx: base.rx+p.ox/DEG, ry: base.ry+p.oy/DEG, rz: base.rz+p.oz/DEG } : base;
      }
      // 最終ポーズでFK計算を実行し、各ボーンのワールド変換行列を取得
      const mats = applyPose(hierarchy, finalPose);
      // 各メッシュにワールド変換行列を適用
      for (const [s, mesh] of Object.entries(meshesRef.current)) {
        const m = mats[s]; if (m) mesh.freezeWorldMatrix(Matrix.FromArray(m));
      }
      // フレーム番号と補間率の表示を更新（DOM直接操作でリレンダリングを回避）
      if (frameDisplayRef.current) frameDisplayRef.current.textContent = `${frame}/${total} (${Math.round(t*100)}%)`;
    };
    // アニメーションループを開始
    rafId = requestAnimationFrame(tick);
    // クリーンアップ関数（停止時にアニメーションフレームをキャンセル）
    return () => cancelAnimationFrame(rafId);
  }, [playing, ready, keyframes, transitionDuration, loopMode]); // これらの値が変わるとアニメーションを再開

  // ========================================================================
  // UI レンダリング
  // ========================================================================

  // 現在編集中のキーフレームのポーズデータを取得
  const curPose = keyframes[editingKf]?.pose || {};
  // 指定ボーンの角度を取得するヘルパー関数（存在しなければゼロ回転）
  const getAngles = (bone: string) => curPose[bone] || {rx:0,ry:0,rz:0};
  // セレクトボックス等の共通スタイル定義
  const ss = { width:'100%', padding:'4px 6px', fontSize:11, marginBottom:6, background:'#1a1a2e', color:'#ddd', border:'1px solid #555', borderRadius:4, fontFamily:'monospace' as const };

  return (
    // ルートコンテナ: 画面全体を使用、横並びフレックスレイアウト
    <div style={{width:'100vw',height:'100vh',overflow:'hidden',background:'#101018',display:'flex'}}>
      {/* 左サイドパネル: コントロールUI（幅300px固定、スクロール可能） */}
      <div style={{width:300,minWidth:300,padding:'14px 16px',overflowY:'auto',background:'rgba(0,0,0,0.55)',color:'#ddd',fontFamily:'monospace',fontSize:12,borderRight:'1px solid rgba(255,255,255,0.08)'}}>
        {/* タイトル */}
        <h2 style={{margin:'0 0 4px',fontSize:16,color:'#fff'}}>Motion Lab</h2>
        {/* サブタイトル（機能説明） */}
        <p style={{margin:'0 0 8px',fontSize:10,color:'#888'}}>Pose editor + keyframe blend + hit reaction</p>
        {/* モデル選択ラベル */}
        <div style={{fontWeight:'bold',color:'#fa0',fontSize:11,marginBottom:4}}>Model</div>
        {/* モデル選択ドロップダウン */}
        <select value={modelKey} onChange={e=>setModelKey(e.target.value)} style={ss}>
          {/* MODELSオブジェクトからオプションを動的生成 */}
          {Object.entries(MODELS).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}
        </select>
        {/* ローディング中の表示 */}
        {loading && <div style={{color:'#8af',padding:'10px 0'}}>Loading...</div>}
        {/* モデル読み込み完了後のUI */}
        {ready && (<>
          {/* キーフレーム選択ボタン群（Pose A / Pose B） */}
          <div style={{display:'flex',gap:4,marginBottom:8,marginTop:4}}>
            {keyframes.map((kf,i)=>(
              // キーフレーム選択ボタン: クリックで編集対象を切り替え、再生を停止
              <button key={i} onClick={()=>{setEditingKf(i);setPlaying(false);}} style={{
                flex:1,padding:'5px',fontSize:11,borderRadius:4,cursor:'pointer',fontFamily:'monospace',
                // 選択中のキーフレームはオレンジの枠と背景で強調表示
                border:editingKf===i?'2px solid #fa0':'1px solid #555',
                background:editingKf===i?'rgba(180,120,0,0.25)':'rgba(40,40,60,0.4)',
                color:editingKf===i?'#fda':'#999',
              }}>{kf.label}</button>
            ))}
          </div>
          {/* ボーン回転セクションのタイトル（編集中のキーフレーム名を表示） */}
          <div style={{fontWeight:'bold',color:'#4f4',fontSize:11,marginBottom:4}}>Bone Rotations ({keyframes[editingKf].label})</div>
          {/* 操作説明テキスト */}
          <div style={{fontSize:9,color:'#888',marginBottom:6}}>Click bone on model or expand group</div>
          {/* ボーングループのアコーディオンUI */}
          {Object.entries(BONE_GROUPS).map(([group,bones])=>{
            // 現在のモデルに実際に存在するボーンのみフィルタリング
            const avail = bones.filter(b=>meshesRef.current[b]);
            // 利用可能なボーンがなければこのグループは表示しない
            if (!avail.length) return null;
            // このグループが現在展開されているかどうか
            const isOpen = openGroup===group;
            return (<div key={group} style={{marginBottom:4}}>
              {/* グループヘッダー: クリックで展開/折りたたみ切り替え */}
              <div onClick={()=>setOpenGroup(isOpen?null:group)} style={{cursor:'pointer',padding:'4px 6px',borderRadius:3,background:isOpen?'rgba(100,150,200,0.15)':'transparent',color:isOpen?'#8cf':'#999',fontSize:11}}>
                {/* 展開/折りたたみインジケーターとグループ名、利用可能ボーン数 */}
                {isOpen?'- ':'+ '}{group} ({avail.length})
              </div>
              {/* グループが展開されている場合、各ボーンの回転スライダーを表示 */}
              {isOpen && avail.map(bone=>{
                // このボーンの現在の角度を取得
                const ang = getAngles(bone);
                // このボーンが選択されているかどうか
                const isSel = selectedBone===bone;
                return (<div key={bone} style={{padding:'4px 8px',marginLeft:8,background:isSel?'rgba(255,200,0,0.1)':'transparent',borderLeft:isSel?'2px solid #fa0':'2px solid transparent'}}>
                  {/* ボーン名（クリックで選択） */}
                  <div onClick={()=>setSelectedBone(bone)} style={{fontSize:10,color:isSel?'#fda':'#aaa',cursor:'pointer',marginBottom:2}}>{bone}</div>
                  {/* X, Y, Z 各軸の回転スライダー */}
                  {(['rx','ry','rz'] as const).map(ax=>(
                    <div key={ax} style={{display:'flex',alignItems:'center',gap:4}}>
                      {/* 軸ラベル（X=赤, Y=緑, Z=青で色分け） */}
                      <span style={{fontSize:9,color:ax==='rx'?'#f88':ax==='ry'?'#8f8':'#88f',width:14}}>{ax.toUpperCase().slice(1)}</span>
                      {/* 回転角度スライダー（-180°〜+180°） */}
                      <input type="range" min={-180} max={180} value={ang[ax]} onChange={e=>updateBoneAngle(bone,ax,Number(e.target.value))} style={{width:'100%',margin:'2px 0'}}/>
                      {/* 現在の角度値を数値表示 */}
                      <span style={{fontSize:9,color:'#888',minWidth:28,textAlign:'right'}}>{ang[ax]}</span>
                    </div>
                  ))}
                </div>);
              })}
            </div>);
          })}
          {/* ポーズリセットボタン: 現在編集中のキーフレームのポーズを空に戻す */}
          <button onClick={()=>setKeyframes(p=>{const n=[...p];n[editingKf]={...n[editingKf],pose:{}};return n;})} style={{width:'100%',padding:'4px',fontSize:10,marginTop:8,marginBottom:12,background:'rgba(200,50,50,0.2)',color:'#faa',border:'1px solid #a44',borderRadius:4,cursor:'pointer',fontFamily:'monospace'}}>Reset {keyframes[editingKf].label}</button>
          {/* トランジション設定セクションのタイトル */}
          <div style={{fontWeight:'bold',color:'#c8a',fontSize:11,marginBottom:4}}>Transition</div>
          {/* トランジション時間（フレーム数）のスライダー */}
          <div style={{display:'flex',alignItems:'center',gap:4,marginBottom:4}}>
            <span style={{fontSize:10,color:'#888'}}>Duration:</span>
            {/* 10〜300フレームの範囲で設定可能 */}
            <input type="range" min={10} max={300} value={transitionDuration} onChange={e=>setTransitionDuration(Number(e.target.value))} style={{flex:1}}/>
            {/* 現在のフレーム数を表示 */}
            <span style={{fontSize:10,color:'#c8a',minWidth:30}}>{transitionDuration}f</span>
          </div>
          {/* ループモード切り替えボタン群 */}
          <div style={{display:'flex',gap:4,marginBottom:8}}>
            {(['pingpong','once'] as const).map(m=>(
              // ループモードボタン: 選択中は紫の枠と背景で強調
              <button key={m} onClick={()=>setLoopMode(m)} style={{flex:1,padding:'3px',fontSize:10,borderRadius:3,cursor:'pointer',fontFamily:'monospace',border:loopMode===m?'1px solid #c8a':'1px solid #555',background:loopMode===m?'rgba(150,100,200,0.2)':'transparent',color:loopMode===m?'#c8a':'#888'}}>{m==='pingpong'?'Ping-Pong':'A→B Loop'}</button>
            ))}
          </div>
          {/* 再生/停止ボタンとフレーム表示 */}
          <div style={{display:'flex',gap:4,alignItems:'center',marginBottom:8}}>
            {/* Play/Stopボタン: フレームカウンターをリセットして再生状態をトグル */}
            <button onClick={()=>{frameRef.current=0;setPlaying(!playing);}} style={{padding:'6px 16px',fontSize:12,fontWeight:'bold',borderRadius:4,cursor:'pointer',fontFamily:'monospace',border:playing?'2px solid #f44':'2px solid #4f4',background:playing?'rgba(80,20,20,0.4)':'rgba(20,80,20,0.4)',color:playing?'#faa':'#afa'}}>{playing?'Stop':'Play'}</button>
            {/* フレーム番号と補間率の表示（DOM直接操作で更新される） */}
            <span ref={frameDisplayRef} style={{fontSize:10,color:'#888'}}>0/0</span>
          </div>
          {/* ヒットリアクション説明パネル */}
          <div style={{padding:'8px',background:'rgba(60,30,80,0.3)',borderRadius:4,border:'1px solid rgba(150,100,200,0.3)'}}>
            {/* ヒットリアクションセクションのタイトル */}
            <div style={{fontSize:11,color:'#c8a',fontWeight:'bold',marginBottom:4}}>Hit Reaction</div>
            {/* 再生状態に応じた操作説明テキスト */}
            <div style={{fontSize:10,color:'#999'}}>{playing?'Click any body part to apply hit impulse.':'Click a body part to select for editing. Start playback for hit reactions.'}</div>
          </div>
        </>)}
      </div>
      {/* Babylon.jsの3Dレンダリングキャンバス: フレックスで残りスペースを使用、再生中はcrosshairカーソル */}
      <canvas ref={canvasRef} onClick={handleCanvasClick} style={{flex:1,cursor:playing?'crosshair':'pointer'}}/>
    </div>
  );
}
