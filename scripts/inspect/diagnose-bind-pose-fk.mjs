/**
 * バインドポーズベースのデルタクォータニオンでのFKパイプライン問題を診断するスクリプト。
 *
 * 以下を比較:
 * 1. FBXグラウンドトゥルースのボーン方向（ワールド空間、ビューア座標に変換）
 * 2. ビューアパイプライン: worldDelta.rotate(voxel_bone_vec)
 *
 * ボーン方向が異なる場合、ボクセルのボーンベクトルがFBXバインドポーズの
 * ボーンベクトルと一致しておらず、不正なFK結果を引き起こしている。
 *
 * Diagnose the FK pipeline issue with bind-pose-based delta quaternions.
 *
 * Compare:
 * 1. FBX ground truth bone directions (world space, converted to viewer)
 * 2. Viewer pipeline: worldDelta.rotate(voxel_bone_vec)
 *
 * If bone directions differ, it means the voxel bone vectors don't match
 * the FBX bind-pose bone vectors, causing incorrect FK results.
 */

// ── Three.js Node.jsポリフィル ──
import fs from 'fs'; // ファイルシステムモジュール
import path from 'path'; // パス操作モジュール
import { fileURLToPath } from 'url'; // URL→ファイルパス変換
import { Blob } from 'buffer'; // Blobポリフィル

global.Blob = Blob; // グローバルBlobを設定
global.self = global; // selfをグローバルに設定
global.window = global; // windowをグローバルに設定
// documentのポリフィル
global.document = {
  createElementNS: (_ns, tag) => { // XML名前空間付き要素のスタブ
    if (tag === 'img') return { set src(_v) {}, addEventListener() {} }; // imgのスタブ
    return { style: {} }; // その他のスタブ
  },
  createElement: (tag) => { // 要素生成のスタブ
    if (tag === 'canvas') return { getContext: () => null, style: {} }; // canvasのスタブ
    return { style: {} }; // その他のスタブ
  },
};
// navigatorのポリフィル
try { global.navigator = { userAgent: 'node', platform: 'node' }; } catch {
  Object.defineProperty(global, 'navigator', { value: { userAgent: 'node', platform: 'node' }, writable: true, configurable: true });
}
// URLのポリフィル
global.URL = global.URL || {};
global.URL.createObjectURL = global.URL.createObjectURL || (() => ''); // ObjectURL生成スタブ
global.URL.revokeObjectURL = global.URL.revokeObjectURL || (() => ''); // ObjectURL解放スタブ
// fetchのポリフィル
if (!global.fetch) {
  global.fetch = async (url) => {
    const filePath = url.startsWith('file://') ? fileURLToPath(url) : url; // file://対応
    const buf = fs.readFileSync(filePath); // ファイル読み込み
    return {
      ok: true, // 成功
      arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), // ArrayBuffer
      text: async () => buf.toString('utf-8'), // テキスト
      json: async () => JSON.parse(buf.toString('utf-8')), // JSON
    };
  };
}

// Three.jsの動的インポート
const THREE = await import('three');
// FileLoaderのNode.js用オーバーライド
THREE.FileLoader.prototype.load = function (url, onLoad, _onProgress, onError) {
  try {
    const filePath = path.resolve(url); // 絶対パスに変換
    const buf = fs.readFileSync(filePath); // ファイル読み込み
    const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength); // ArrayBuffer変換
    if (this.responseType === 'arraybuffer') setTimeout(() => onLoad(ab), 0); // バイナリコールバック
    else setTimeout(() => onLoad(buf.toString('utf-8')), 0); // テキストコールバック
  } catch (e) { if (onError) onError(e); else console.error(e); } // エラー処理
  return {}; // ダミーオブジェクト
};
// TextureLoaderのスタブ
THREE.TextureLoader.prototype.load = function () { return new THREE.Texture(); };
// FBXLoaderの動的インポート
const { FBXLoader } = await import('three/examples/jsm/loaders/FBXLoader.js');

// ── ユーティリティ関数 ──
// "mixamorig"プレフィックスを除去
function cleanBoneName(name) { return name.replace(/^mixamorig/, ''); }
// 小数点3桁に丸める
const r = (v) => Math.round(v * 1000) / 1000;
// ラジアン→度変換
const rad2deg = 180 / Math.PI;

// ── ボーン階層定義 ──
const HIERARCHY = {
  'Hips': null, // ルートボーン
  'Spine': 'Hips', 'Spine1': 'Spine', 'Spine2': 'Spine1', // 背骨チェーン
  'Neck': 'Spine2', 'Head': 'Neck', // 首・頭チェーン
  'LeftShoulder': 'Spine2', 'LeftArm': 'LeftShoulder', 'LeftForeArm': 'LeftArm', 'LeftHand': 'LeftForeArm', // 左腕チェーン
  'RightShoulder': 'Spine2', 'RightArm': 'RightShoulder', 'RightForeArm': 'RightArm', 'RightHand': 'RightForeArm', // 右腕チェーン
  'LeftUpLeg': 'Hips', 'LeftLeg': 'LeftUpLeg', 'LeftFoot': 'LeftLeg', // 左脚チェーン
  'RightUpLeg': 'Hips', 'RightLeg': 'RightUpLeg', 'RightFoot': 'RightLeg', // 右脚チェーン
};
const keyBones = Object.keys(HIERARCHY); // 全ボーン名のリスト

// ── ファイルパス設定 ──
const __dirname = path.dirname(fileURLToPath(import.meta.url)); // スクリプトのディレクトリ
const fbxPath = path.join(__dirname, '..', 'public', 'models', 'character-motion', 'Hip Hop Dancing (1).fbx'); // FBXファイル
const motionPath = path.join(__dirname, '..', 'public', 'models', 'character-motion', 'Hip Hop Dancing.motion.json'); // モーションJSON

// ── FBXの読み込み ──
const loader = new FBXLoader(); // FBXローダー
const group = await new Promise((resolve, reject) => {
  loader.load(path.resolve(fbxPath), resolve, undefined, reject); // FBX読み込み
});

// ボーン名→ボーンオブジェクトのマップ
const boneByName = {};
group.traverse((obj) => { if (obj.isBone) boneByName[cleanBoneName(obj.name)] = obj; });

// ========================================================================
// ステップ1: バインドポーズのキャプチャ（Tポーズ、アニメーション適用前）
// ========================================================================
group.updateMatrixWorld(true); // ワールド行列更新

// バインドポーズの位置とクォータニオンを保存
const bindWorldPos = {}; // バインドポーズのワールド位置
const bindWorldQuat = {}; // バインドポーズのワールドクォータニオン
for (const name of keyBones) {
  const bone = boneByName[name]; // ボーンオブジェクト
  if (!bone) continue; // 存在しなければスキップ
  const pos = new THREE.Vector3(); // 位置格納用
  const quat = new THREE.Quaternion(); // クォータニオン格納用
  bone.getWorldPosition(pos); // ワールド位置取得
  bone.getWorldQuaternion(quat); // ワールドクォータニオン取得
  bindWorldPos[name] = pos.clone(); // 位置を保存
  bindWorldQuat[name] = quat.clone(); // クォータニオンを保存
}

// FBXバインドポーズのボーンベクトル（親→子、ワールド空間）
const fbxBindBoneVec = {};
for (const name of keyBones) {
  const parentName = HIERARCHY[name]; // 親ボーン名
  // 親子の位置差からボーンベクトルを計算
  if (parentName && bindWorldPos[name] && bindWorldPos[parentName]) {
    fbxBindBoneVec[name] = bindWorldPos[name].clone().sub(bindWorldPos[parentName]);
  }
}

// ── 座標変換関数 ──
// ベクトルをビューア座標に変換: (-x, y, -z)
const toViewerVec = (v) => new THREE.Vector3(-v.x, v.y, -v.z);
// クォータニオンをビューア座標に変換: (-x, y, -z, w)
const toViewerQuat = (q) => new THREE.Quaternion(-q.x, q.y, -q.z, q.w);

// ========================================================================
// ステップ2: ボクセルモデルのボーンベクトル（ビューアが使用するもの）
// ========================================================================

// デフォルトのVagrantマーカー位置（ボクセル座標系）
const cx = 35, cy = 13.5; // 中心座標
const markers = {
  Chin: { x: cx, y: cy, z: 82 }, // 顎の位置
  Groin: { x: cx, y: cy, z: 31 }, // 股間の位置
  LeftWrist: { x: 10, y: cy, z: 34 }, // 左手首の位置
  LeftElbow: { x: 14, y: cy, z: 48 }, // 左肘の位置
  LeftKnee: { x: 24, y: cy, z: 17 }, // 左膝の位置
};
// 右側のマーカーは左側を中心で反転して生成
markers.RightWrist = { x: 2*cx - markers.LeftWrist.x, y: markers.LeftWrist.y, z: markers.LeftWrist.z }; // 右手首
markers.RightElbow = { x: 2*cx - markers.LeftElbow.x, y: markers.LeftElbow.y, z: markers.LeftElbow.z }; // 右肘
markers.RightKnee  = { x: 2*cx - markers.LeftKnee.x, y: markers.LeftKnee.y, z: markers.LeftKnee.z }; // 右膝

// calculateAllBonesロジックを再現してボーン位置を計算
const lerp3 = (a, b, t) => ({ x: a.x+(b.x-a.x)*t, y: a.y+(b.y-a.y)*t, z: a.z+(b.z-a.z)*t }); // 3D線形補間
const chin = markers.Chin, groin = markers.Groin; // 顎と股間
const hips = { ...groin }; // 腰の位置 = 股間
const neck = { x: chin.x, y: chin.y, z: chin.z - 4 }; // 首の位置（顎から少し下）
const head = { x: chin.x, y: chin.y, z: Math.min(chin.z + 8, 103) }; // 頭の位置（顎から上）
const spine  = lerp3(hips, neck, 0.25); // 背骨1（腰→首の25%地点）
const spine1 = lerp3(hips, neck, 0.50); // 背骨2（腰→首の50%地点）
const spine2 = lerp3(hips, neck, 0.75); // 背骨3（腰→首の75%地点）

// 左肩の位置計算
const lShoulderOff = (markers.LeftElbow.x - spine2.x) * 0.35; // 肘からのオフセット
const lShoulder = { x: spine2.x + lShoulderOff, y: spine2.y, z: spine2.z + 2 }; // 左肩
const lArm = lerp3(lShoulder, markers.LeftElbow, 0.3); // 左上腕（肩→肘の30%）
const lForeArm = { ...markers.LeftElbow }; // 左前腕 = 肘位置
const lHand = { ...markers.LeftWrist }; // 左手 = 手首位置

// 右肩の位置計算
const rShoulderOff = (markers.RightElbow.x - spine2.x) * 0.35; // 肘からのオフセット
const rShoulder = { x: spine2.x + rShoulderOff, y: spine2.y, z: spine2.z + 2 }; // 右肩
const rArm = lerp3(rShoulder, markers.RightElbow, 0.3); // 右上腕（肩→肘の30%）
const rForeArm = { ...markers.RightElbow }; // 右前腕 = 肘位置
const rHand = { ...markers.RightWrist }; // 右手 = 手首位置

// 左脚の位置計算
const lLegOff = (markers.LeftKnee.x - groin.x) * 0.8; // 膝からのオフセット
const lUpLeg = { x: groin.x + lLegOff, y: groin.y, z: groin.z }; // 左太もも
const lLeg = { ...markers.LeftKnee }; // 左膝
const lFoot = { x: markers.LeftKnee.x, y: Math.max(markers.LeftKnee.y - 4, 0), z: 2 }; // 左足

// 右脚の位置計算
const rLegOff = (markers.RightKnee.x - groin.x) * 0.8; // 膝からのオフセット
const rUpLeg = { x: groin.x + rLegOff, y: groin.y, z: groin.z }; // 右太もも
const rLeg = { ...markers.RightKnee }; // 右膝
const rFoot = { x: markers.RightKnee.x, y: Math.max(markers.RightKnee.y - 4, 0), z: 2 }; // 右足

// ボクセルボーン位置のマップ
const voxelBones = {
  Hips: hips, Spine: spine, Spine1: spine1, Spine2: spine2, Neck: neck, Head: head, // 体幹
  LeftShoulder: lShoulder, LeftArm: lArm, LeftForeArm: lForeArm, LeftHand: lHand, // 左腕
  RightShoulder: rShoulder, RightArm: rArm, RightForeArm: rForeArm, RightHand: rHand, // 右腕
  LeftUpLeg: lUpLeg, LeftLeg: lLeg, LeftFoot: lFoot, // 左脚
  RightUpLeg: rUpLeg, RightLeg: rLeg, RightFoot: rFoot, // 右脚
};

const SCALE = 0.019; // ボクセル→ビューアのスケール係数（vox-parserから）
// ボクセル座標をビューア座標に変換する関数
function voxelToViewer(vx, vy, vz) {
  return new THREE.Vector3((vx - cx) * SCALE, vz * SCALE, -(vy - cy) * SCALE);
}

// ── ボクセルボーンベクトルをビューア空間で計算 ──
const voxelBoneVec = {};
for (const name of keyBones) {
  const parentName = HIERARCHY[name]; // 親ボーン名
  // 親子の位置差からボーンベクトルを計算（ビューア空間）
  if (parentName && voxelBones[name] && voxelBones[parentName]) {
    const child = voxelToViewer(voxelBones[name].x, voxelBones[name].y, voxelBones[name].z); // 子のビューア座標
    const parent = voxelToViewer(voxelBones[parentName].x, voxelBones[parentName].y, voxelBones[parentName].z); // 親のビューア座標
    voxelBoneVec[name] = child.clone().sub(parent); // ベクトル = 子 - 親
  }
}

// ── FBXバインドボーンベクトルをビューア空間に変換 ──
const fbxBindBoneVecViewer = {};
for (const name of keyBones) {
  if (fbxBindBoneVec[name]) {
    fbxBindBoneVecViewer[name] = toViewerVec(fbxBindBoneVec[name]); // ビューア座標に変換
  }
}

// ========================================================================
// ステップ3: ボーンベクトルの比較
// ========================================================================
console.log('=== BONE VECTOR COMPARISON: FBX bind-pose vs Voxel T-pose ===');
console.log('Both in viewer coordinates. If directions differ, FK will produce wrong results.\n');

console.log('Bone               | FBX bind (viewer, normalized)    | Voxel (viewer, normalized)       | Angle diff');
console.log('-'.repeat(115));

// 各ボーンのFBXベクトルとボクセルベクトルの方向を比較
for (const name of keyBones) {
  const fbxVec = fbxBindBoneVecViewer[name]; // FBXのビューア空間ボーンベクトル
  const voxVec = voxelBoneVec[name]; // ボクセルのビューア空間ボーンベクトル
  if (!fbxVec || !voxVec) continue; // データなしならスキップ

  // 正規化（方向のみ比較するため）
  const fbxLen = fbxVec.length() || 1; // FBXベクトルの長さ
  const voxLen = voxVec.length() || 1; // ボクセルベクトルの長さ
  const fbxN = fbxVec.clone().divideScalar(fbxLen); // FBX正規化ベクトル
  const voxN = voxVec.clone().divideScalar(voxLen); // ボクセル正規化ベクトル

  // 角度差を計算（内積のarccosから）
  const dot = Math.max(-1, Math.min(1, fbxN.dot(voxN))); // 内積（-1〜1にクランプ）
  const angleDiff = r(Math.acos(dot) * rad2deg); // 角度差（度）

  // 結果を表示（15度以上の差は警告）
  console.log(
    `${name.padEnd(20)}` +
    `| (${r(fbxN.x).toString().padStart(7)}, ${r(fbxN.y).toString().padStart(7)}, ${r(fbxN.z).toString().padStart(7)})`.padEnd(36) +
    `| (${r(voxN.x).toString().padStart(7)}, ${r(voxN.y).toString().padStart(7)}, ${r(voxN.z).toString().padStart(7)})`.padEnd(36) +
    `| ${angleDiff}°${angleDiff > 15 ? ' ← LARGE' : ''}`
  );
}

// ========================================================================
// ステップ4: 特定フレームでFKをシミュレーションし位置を比較
// ========================================================================
// モーションJSONの読み込み
const motionData = JSON.parse(fs.readFileSync(path.resolve(motionPath), 'utf-8'));

// アニメーションの設定
const clip = group.animations[0]; // アニメーションクリップ
const mixer = new THREE.AnimationMixer(group); // ミキサー
const action = mixer.clipAction(clip); // アクション
action.play(); // 再生

// ── スケール係数の計算 ──
const hipsBindY = bindWorldPos['Hips']?.y ?? 0; // 腰のバインドポーズY座標
const headBindY = bindWorldPos['Head']?.y ?? 1; // 頭のバインドポーズY座標
const fbxBodyHeight = headBindY - hipsBindY; // FBXの体の高さ
const voxelBodyHeight = (voxelBones['Head'].z - voxelBones['Hips'].z) * SCALE; // ボクセルの体の高さ
const scaleFactor = voxelBodyHeight / fbxBodyHeight; // スケール係数

console.log(`\nScale factor: ${r(scaleFactor)} (voxelHeight=${r(voxelBodyHeight)}, fbxHeight=${r(fbxBodyHeight)})`);

// dq配列をビューア空間クォータニオンに変換
const toViewerQuatArr = (dq) => new THREE.Quaternion(-dq[0], dq[1], -dq[2], dq[3]);

/**
 * ビューアのFKをシミュレーション（ボクセルボーンベクトルを使用）
 * @param {Object} frame - モーションフレームデータ
 * @returns {Object} ワールド位置とワールド回転の辞書
 */
function simulateViewerFK(frame) {
  // ワールドデルタの変換
  const worldDeltas = {};
  for (const [boneName, data] of Object.entries(frame)) {
    worldDeltas[boneName] = toViewerQuatArr(data.dq); // ビューア空間に変換
  }

  // 階層分解でローカルデルタを計算
  const locals = {};
  for (const name of keyBones) {
    const worldDQ = worldDeltas[name]; // ワールドデルタ
    if (!worldDQ) continue; // データなしならスキップ
    const parentName = HIERARCHY[name]; // 親ボーン名
    if (!parentName || !worldDeltas[parentName]) {
      locals[name] = worldDQ.clone(); // ルートはそのまま
    } else {
      // ローカル = 親ワールドInv × 子ワールド
      locals[name] = worldDeltas[parentName].clone().invert().multiply(worldDQ);
    }
  }

  // FK: 階層を使ってワールド位置を計算
  const worldRot = {}; // 累積ワールド回転
  const worldPos = {}; // ワールド位置

  for (const name of keyBones) {
    const localQ = locals[name]; // ローカルクォータニオン
    if (!localQ) continue; // データなしならスキップ
    const parentName = HIERARCHY[name]; // 親ボーン名

    if (!parentName) {
      // ルートボーン（Hips）の処理
      worldRot[name] = localQ.clone(); // ワールド回転 = ローカル
      // ボクセル腰のビューア位置を計算
      const hipsRestViewer = voxelToViewer(voxelBones['Hips'].x, voxelBones['Hips'].y, voxelBones['Hips'].z);
      const data = frame[name]; // フレームデータ
      if (data?.dp) {
        // 位置デルタを適用（座標変換とスケーリング）
        worldPos[name] = new THREE.Vector3(
          hipsRestViewer.x - data.dp[0] * scaleFactor, // X反転してスケーリング
          hipsRestViewer.y + data.dp[1] * scaleFactor, // Y維持してスケーリング
          hipsRestViewer.z - data.dp[2] * scaleFactor, // Z反転してスケーリング
        );
      } else {
        worldPos[name] = hipsRestViewer.clone(); // デルタなしならレスト位置
      }
    } else {
      // 子ボーンの処理
      // ワールド回転の累積: parentWorldRot × localQ
      if (worldRot[parentName]) {
        worldRot[name] = worldRot[parentName].clone().multiply(localQ);
      } else {
        worldRot[name] = localQ.clone(); // 親の回転がなければローカルのまま
      }

      // 位置の計算: parentPos + parentWorldRot.rotate(boneVec)
      const boneVec = voxelBoneVec[name]; // ボクセルのボーンベクトル
      if (worldPos[parentName] && boneVec && worldRot[parentName]) {
        const rotatedVec = boneVec.clone().applyQuaternion(worldRot[parentName]); // 親回転でベクトルを回転
        worldPos[name] = worldPos[parentName].clone().add(rotatedVec); // 親位置 + 回転済みベクトル
      }
    }
  }

  return { worldPos, worldRot }; // 結果を返す
}

/**
 * 理想的なFKをシミュレーション（FBXバインドボーンベクトルを使用）
 * ボクセルベクトルの代わりにFBXのバインドポーズベクトルを使用して比較する
 * @param {Object} frame - モーションフレームデータ
 * @returns {Object} ワールド位置とワールド回転の辞書
 */
function simulateIdealFK(frame) {
  // ワールドデルタの変換
  const worldDeltas = {};
  for (const [boneName, data] of Object.entries(frame)) {
    worldDeltas[boneName] = toViewerQuatArr(data.dq); // ビューア空間に変換
  }
  // 階層分解でローカルデルタを計算
  const locals = {};
  for (const name of keyBones) {
    const worldDQ = worldDeltas[name]; // ワールドデルタ
    if (!worldDQ) continue; // データなしならスキップ
    const parentName = HIERARCHY[name]; // 親ボーン名
    if (!parentName || !worldDeltas[parentName]) {
      locals[name] = worldDQ.clone(); // ルートはそのまま
    } else {
      // ローカル = 親ワールドInv × 子ワールド
      locals[name] = worldDeltas[parentName].clone().invert().multiply(worldDQ);
    }
  }
  const worldRot = {}; // 累積ワールド回転
  const worldPos = {}; // ワールド位置

  for (const name of keyBones) {
    const localQ = locals[name]; // ローカルクォータニオン
    if (!localQ) continue; // データなしならスキップ
    const parentName = HIERARCHY[name]; // 親ボーン名

    if (!parentName) {
      // ルートボーン（Hips）
      worldRot[name] = localQ.clone(); // ワールド回転 = ローカル
      const hipsRestViewer = voxelToViewer(voxelBones['Hips'].x, voxelBones['Hips'].y, voxelBones['Hips'].z); // 腰のビューア位置
      const data = frame[name]; // フレームデータ
      if (data?.dp) {
        worldPos[name] = new THREE.Vector3(
          hipsRestViewer.x - data.dp[0] * scaleFactor, // X反転スケーリング
          hipsRestViewer.y + data.dp[1] * scaleFactor, // Y維持スケーリング
          hipsRestViewer.z - data.dp[2] * scaleFactor, // Z反転スケーリング
        );
      } else {
        worldPos[name] = hipsRestViewer.clone(); // デルタなしならレスト位置
      }
    } else {
      // 子ボーン
      if (worldRot[parentName]) {
        worldRot[name] = worldRot[parentName].clone().multiply(localQ); // 回転累積
      } else {
        worldRot[name] = localQ.clone(); // 親なしならローカルのまま
      }
      // FBXバインドボーンベクトル（スケーリング済み）を使用
      const fbxVec = fbxBindBoneVecViewer[name]; // FBXのビューア空間ボーンベクトル
      if (worldPos[parentName] && fbxVec && worldRot[parentName]) {
        const scaledVec = fbxVec.clone().multiplyScalar(scaleFactor); // スケーリング
        const rotatedVec = scaledVec.clone().applyQuaternion(worldRot[parentName]); // 親回転で回転
        worldPos[name] = worldPos[parentName].clone().add(rotatedVec); // 位置計算
      }
    }
  }
  return { worldPos, worldRot }; // 結果を返す
}

// ── FK位置比較の表示 ──
console.log('\n=== FK POSITION COMPARISON AT KEY FRAMES ===');
console.log('FBX truth vs Viewer (voxel bone vecs) vs Ideal (FBX bind bone vecs, scaled)');
console.log('Focus on endpoints: LeftHand, RightHand, Head\n');

// 比較するボーンとフレーム
const checkBones = ['LeftHand', 'RightHand', 'Head', 'LeftFoot', 'RightFoot']; // 末端ボーン
const testFrames = [0, 20, 40, 60, 67, 80, 100, 120]; // テストフレーム

// 各フレームでの位置比較
for (const frameIdx of testFrames) {
  if (frameIdx >= motionData.frameCount) continue; // 範囲外スキップ
  const time = frameIdx / 30; // 秒に変換
  mixer.setTime(time); // 時刻設定
  group.updateMatrixWorld(true); // 行列更新

  const motionFrame = motionData.frames[frameIdx]; // モーションフレーム
  const viewerResult = simulateViewerFK(motionFrame); // ビューアFK結果
  const idealResult = simulateIdealFK(motionFrame); // 理想FK結果

  console.log(`--- Frame ${frameIdx} ---`);
  console.log('Bone          | FBX truth (viewer)             | Viewer FK (voxel vecs)          | Ideal FK (fbx vecs)            | Voxel err | Ideal err');
  console.log('-'.repeat(155));

  // 各末端ボーンの位置を比較
  for (const name of checkBones) {
    const bone = boneByName[name]; // ボーンオブジェクト
    if (!bone) continue; // 存在しなければスキップ
    const fbxPos = new THREE.Vector3(); // FBXワールド位置
    bone.getWorldPosition(fbxPos); // 取得
    const fbxViewer = toViewerVec(fbxPos); // ビューア座標に変換

    const viewerPos = viewerResult.worldPos[name]; // ビューアFKの位置
    const idealPos = idealResult.worldPos[name]; // 理想FKの位置

    // FBX位置をバインドポーズの腰を基準にスケーリング
    const fbxRelToHips = fbxPos.clone().sub(bindWorldPos['Hips']); // 腰からの相対位置
    const fbxScaled = new THREE.Vector3(
      -fbxRelToHips.x * scaleFactor, // X反転スケーリング
      fbxRelToHips.y * scaleFactor, // Y維持スケーリング
      -fbxRelToHips.z * scaleFactor, // Z反転スケーリング
    );
    // ボクセル腰のビューア位置を加算
    const hipsViewer = voxelToViewer(voxelBones['Hips'].x, voxelBones['Hips'].y, voxelBones['Hips'].z);
    fbxScaled.add(hipsViewer); // 腰のビューア位置を基準に加算

    // 誤差の計算
    const voxErr = viewerPos ? r(viewerPos.distanceTo(fbxScaled)) : 'N/A'; // ボクセルFKの誤差
    const idealErr = idealPos ? r(idealPos.distanceTo(fbxScaled)) : 'N/A'; // 理想FKの誤差

    // 結果を表示
    console.log(
      `${name.padEnd(14)}` +
      `| (${r(fbxScaled.x).toString().padStart(6)}, ${r(fbxScaled.y).toString().padStart(6)}, ${r(fbxScaled.z).toString().padStart(6)})`.padEnd(34) +
      `| (${viewerPos ? r(viewerPos.x).toString().padStart(6) : '  N/A'}, ${viewerPos ? r(viewerPos.y).toString().padStart(6) : '  N/A'}, ${viewerPos ? r(viewerPos.z).toString().padStart(6) : '  N/A'})`.padEnd(34) +
      `| (${idealPos ? r(idealPos.x).toString().padStart(6) : '  N/A'}, ${idealPos ? r(idealPos.y).toString().padStart(6) : '  N/A'}, ${idealPos ? r(idealPos.z).toString().padStart(6) : '  N/A'})`.padEnd(34) +
      `| ${String(voxErr).padStart(6)}  | ${String(idealErr).padStart(6)}`
    );
  }
  console.log('');
}

// ========================================================================
// ステップ5: FBXボーンベクトルを使うと方向の問題が解決されるか確認
// ========================================================================
console.log('\n=== DIRECTION ANALYSIS: LeftHand relative to Hips ===');
console.log('Shows which direction the left hand moves relative to hips over time');
console.log('"FBX" = ground truth, "Voxel" = current viewer, "Ideal" = FBX bone vecs\n');

console.log('Frame | FBX hand-hips direction          | Voxel hand-hips direction        | Ideal hand-hips direction        | Voxel match? | Ideal match?');
console.log('-'.repeat(155));

// 各フレームでの方向分析
for (const frameIdx of testFrames) {
  if (frameIdx >= motionData.frameCount) continue; // 範囲外スキップ
  const time = frameIdx / 30; // 秒に変換
  mixer.setTime(time); // 時刻設定
  group.updateMatrixWorld(true); // 行列更新

  const motionFrame = motionData.frames[frameIdx]; // モーションフレーム
  const viewerResult = simulateViewerFK(motionFrame); // ビューアFK結果
  const idealResult = simulateIdealFK(motionFrame); // 理想FK結果

  // FBXのグラウンドトゥルース
  const fbxHand = new THREE.Vector3(); // 左手位置
  const fbxHips = new THREE.Vector3(); // 腰位置
  boneByName['LeftHand']?.getWorldPosition(fbxHand); // 左手ワールド位置
  boneByName['Hips']?.getWorldPosition(fbxHips); // 腰ワールド位置
  const fbxRel = toViewerVec(fbxHand.clone().sub(fbxHips)); // 腰→左手のビューア座標ベクトル

  // ビューアFK結果
  const voxHand = viewerResult.worldPos['LeftHand']; // ビューアFKの左手位置
  const voxHips = viewerResult.worldPos['Hips']; // ビューアFKの腰位置
  const voxRel = voxHand && voxHips ? voxHand.clone().sub(voxHips) : null; // 腰→左手ベクトル

  // 理想FK結果
  const idealHand = idealResult.worldPos['LeftHand']; // 理想FKの左手位置
  const idealHips = idealResult.worldPos['Hips']; // 理想FKの腰位置
  const idealRel = idealHand && idealHips ? idealHand.clone().sub(idealHips) : null; // 腰→左手ベクトル

  // 方向を文字列で表現する関数（L=左, R=右, U=上, D=下, B=後, F=前）
  const dirStr = (v) => {
    if (!v) return 'N/A'; // データなし
    const lr = v.x > 0.01 ? 'L' : v.x < -0.01 ? 'R' : '-'; // 左右
    const ud = v.y > 0.01 ? 'U' : v.y < -0.01 ? 'D' : '-'; // 上下
    const fb = v.z > 0.01 ? 'B' : v.z < -0.01 ? 'F' : '-'; // 前後
    return `${lr}${ud}${fb} (${r(v.x)},${r(v.y)},${r(v.z)})`; // 方向 + 座標値
  };

  // 2つのベクトルの方向が一致するか判定する関数
  const matchDir = (a, b) => {
    if (!a || !b) return '?'; // データなし
    // X方向の一致チェック
    const sameX = (a.x > 0.01 && b.x > 0.01) || (a.x < -0.01 && b.x < -0.01) || (Math.abs(a.x) <= 0.01 && Math.abs(b.x) <= 0.01);
    // Y方向の一致チェック
    const sameY = (a.y > 0.01 && b.y > 0.01) || (a.y < -0.01 && b.y < -0.01) || (Math.abs(a.y) <= 0.01 && Math.abs(b.y) <= 0.01);
    return sameX && sameY ? 'OK' : `X:${sameX?'ok':'FLIP'} Y:${sameY?'ok':'FLIP'}`; // 結果
  };

  // 結果を表示
  console.log(
    `${String(frameIdx).padStart(5)} ` +
    `| ${dirStr(fbxRel).padEnd(34)}` +
    `| ${dirStr(voxRel).padEnd(34)}` +
    `| ${dirStr(idealRel).padEnd(34)}` +
    `| ${matchDir(fbxRel, voxRel).padEnd(13)}` +
    `| ${matchDir(fbxRel, idealRel)}`
  );
}

// ── クリーンアップ ──
mixer.stopAllAction(); // アニメーション停止
mixer.uncacheRoot(group); // キャッシュクリア
