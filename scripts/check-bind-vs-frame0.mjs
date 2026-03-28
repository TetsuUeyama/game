/**
 * バインドポーズ（Tポーズ、アニメーション前）とフレーム0（最初のアニメーションフレーム）を比較するスクリプト。
 * レストポーズの不一致が腕の方向の問題を引き起こしているかどうかを判定する。
 *
 * バインドポーズのボーンベクトル ≠ フレーム0のボーンベクトルの場合、
 * フレーム0を「レスト」として使用しているのにボクセルモデルがTポーズ（バインドポーズ）だと
 * 方向エラーが発生する。
 */

import fs from 'fs';       // ファイルシステムモジュール
import path from 'path';   // パス操作モジュール
import { fileURLToPath } from 'url';  // URL→ファイルパス変換
import { Blob } from 'buffer';        // Blobポリフィル

// ── Three.js Node.js環境ポリフィル ──
global.Blob = Blob;
global.self = global;
global.window = global;
global.document = {
  createElementNS: (_ns, tag) => {
    if (tag === 'img') return { set src(_v) {}, addEventListener() {} };
    return { style: {} };
  },
  createElement: (tag) => {
    if (tag === 'canvas') return { getContext: () => null, style: {} };
    return { style: {} };
  },
};
try { global.navigator = { userAgent: 'node', platform: 'node' }; } catch {
  Object.defineProperty(global, 'navigator', { value: { userAgent: 'node', platform: 'node' }, writable: true, configurable: true });
}
global.URL = global.URL || {};
global.URL.createObjectURL = global.URL.createObjectURL || (() => '');
global.URL.revokeObjectURL = global.URL.revokeObjectURL || (() => '');
if (!global.fetch) {
  global.fetch = async (url) => {
    const filePath = url.startsWith('file://') ? fileURLToPath(url) : url;
    const buf = fs.readFileSync(filePath);
    return {
      ok: true,
      arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength),
      text: async () => buf.toString('utf-8'),
      json: async () => JSON.parse(buf.toString('utf-8')),
    };
  };
}

const THREE = await import('three');
// FileLoaderをNode.js対応にオーバーライド
THREE.FileLoader.prototype.load = function (url, onLoad, _onProgress, onError) {
  try {
    const filePath = path.resolve(url);
    const buf = fs.readFileSync(filePath);
    const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
    if (this.responseType === 'arraybuffer') setTimeout(() => onLoad(ab), 0);
    else setTimeout(() => onLoad(buf.toString('utf-8')), 0);
  } catch (e) { if (onError) onError(e); else console.error(e); }
  return {};
};
THREE.TextureLoader.prototype.load = function () { return new THREE.Texture(); };
const { FBXLoader } = await import('three/examples/jsm/loaders/FBXLoader.js');

// ヘルパー関数
function cleanBoneName(name) { return name.replace(/^mixamorig/, ''); }  // mixamorigプレフィックス除去
const r = (v) => Math.round(v * 1000) / 1000;  // 小数点3桁丸め
const rad2deg = 180 / Math.PI;  // ラジアン→度変換定数

// FBXファイルパスの設定
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fbxPath = path.join(__dirname, '..', 'public', 'models', 'character-motion', 'Hip Hop Dancing (1).fbx');

// FBXファイルを読み込み
const loader = new FBXLoader();
const group = await new Promise((resolve, reject) => {
  loader.load(path.resolve(fbxPath), resolve, undefined, reject);
});

// ボーンマップを構築
const boneByName = {};
group.traverse((obj) => { if (obj.isBone) boneByName[cleanBoneName(obj.name)] = obj; });

// 確認対象のキーボーンリスト
const keyBones = [
  'Hips', 'Spine', 'Spine1', 'Spine2', 'Neck', 'Head',
  'LeftShoulder', 'LeftArm', 'LeftForeArm', 'LeftHand',
  'RightShoulder', 'RightArm', 'RightForeArm', 'RightHand',
  'LeftUpLeg', 'LeftLeg', 'LeftFoot',
  'RightUpLeg', 'RightLeg', 'RightFoot',
];

// ========================================================================
// ステップ1: バインドポーズ（アニメーション前のTポーズ）をキャプチャ
// ========================================================================
console.log('=== BIND POSE (T-pose, before animation) ===');
group.updateMatrixWorld(true);  // ワールド行列を強制更新

// バインドポーズのワールド位置とクォータニオンを保存
const bindWorldPos = {};
const bindWorldQuat = {};
for (const name of keyBones) {
  const bone = boneByName[name];
  if (!bone) continue;
  const pos = new THREE.Vector3();
  const quat = new THREE.Quaternion();
  bone.getWorldPosition(pos);     // ワールド位置取得
  bone.getWorldQuaternion(quat);  // ワールド回転取得
  bindWorldPos[name] = pos.clone();
  bindWorldQuat[name] = quat.clone();
}

// バインドポーズのボーン情報を表示
console.log('Bone               | World Position (Three)             | World Quat euler (deg)');
console.log('-'.repeat(95));
for (const name of keyBones) {
  const p = bindWorldPos[name];
  const q = bindWorldQuat[name];
  if (!p || !q) continue;
  const e = new THREE.Euler().setFromQuaternion(q, 'XYZ');  // クォータニオン→オイラー角変換
  console.log(
    `${name.padEnd(20)}` +
    `| (${r(p.x).toString().padStart(7)}, ${r(p.y).toString().padStart(7)}, ${r(p.z).toString().padStart(7)})` +
    `  | X:${r(e.x*rad2deg).toString().padStart(8)}° Y:${r(e.y*rad2deg).toString().padStart(8)}° Z:${r(e.z*rad2deg).toString().padStart(8)}°`
  );
}

// ========================================================================
// ステップ2: フレーム0ポーズ（アニメーション適用後）をキャプチャ
// ========================================================================
const clip = group.animations[0];           // アニメーションクリップ取得
const mixer = new THREE.AnimationMixer(group);  // ミキサー作成
const action = mixer.clipAction(clip);
action.play();
mixer.setTime(0);              // フレーム0に設定
group.updateMatrixWorld(true); // ワールド行列更新

console.log('\n=== FRAME 0 POSE (animation applied) ===');
// フレーム0のワールド位置とクォータニオンを保存
const frame0WorldPos = {};
const frame0WorldQuat = {};
for (const name of keyBones) {
  const bone = boneByName[name];
  if (!bone) continue;
  const pos = new THREE.Vector3();
  const quat = new THREE.Quaternion();
  bone.getWorldPosition(pos);
  bone.getWorldQuaternion(quat);
  frame0WorldPos[name] = pos.clone();
  frame0WorldQuat[name] = quat.clone();
}

// フレーム0のボーン情報を表示
console.log('Bone               | World Position (Three)             | World Quat euler (deg)');
console.log('-'.repeat(95));
for (const name of keyBones) {
  const p = frame0WorldPos[name];
  const q = frame0WorldQuat[name];
  if (!p || !q) continue;
  const e = new THREE.Euler().setFromQuaternion(q, 'XYZ');
  console.log(
    `${name.padEnd(20)}` +
    `| (${r(p.x).toString().padStart(7)}, ${r(p.y).toString().padStart(7)}, ${r(p.z).toString().padStart(7)})` +
    `  | X:${r(e.x*rad2deg).toString().padStart(8)}° Y:${r(e.y*rad2deg).toString().padStart(8)}° Z:${r(e.z*rad2deg).toString().padStart(8)}°`
  );
}

// ========================================================================
// ステップ3: バインドポーズとフレーム0の差異を比較
// ========================================================================
console.log('\n=== DIFFERENCE: BIND vs FRAME 0 ===');
console.log('Bone               | Position delta                    | Rotation delta (deg) | Is T-pose?');
console.log('-'.repeat(100));

let allSame = true;  // 全ボーンが同一かどうかのフラグ
for (const name of keyBones) {
  const bp = bindWorldPos[name];
  const fp = frame0WorldPos[name];
  const bq = bindWorldQuat[name];
  const fq = frame0WorldQuat[name];
  if (!bp || !fp || !bq || !fq) continue;

  // 位置の差分を計算
  const dp = fp.clone().sub(bp);
  const posDelta = dp.length();

  // 回転の差分を計算（クォータニオン距離→度に変換）
  const dot = Math.abs(bq.x*fq.x + bq.y*fq.y + bq.z*fq.z + bq.w*fq.w);
  const rotDelta = r(2 * Math.acos(Math.min(1, dot)) * rad2deg);

  // 同一かどうかの判定（位置差0.01未満かつ回転差1度未満）
  const isSame = posDelta < 0.01 && rotDelta < 1;
  if (!isSame) allSame = false;

  console.log(
    `${name.padEnd(20)}` +
    `| (${r(dp.x).toString().padStart(7)}, ${r(dp.y).toString().padStart(7)}, ${r(dp.z).toString().padStart(7)}) len=${r(posDelta)}` .padEnd(39) +
    `| ${rotDelta.toString().padStart(8)}°` +
    `       | ${isSame ? 'SAME' : '*** DIFFERENT ***'}`
  );
}

// 結論表示
console.log(`\nBind pose === Frame 0: ${allSame ? 'YES (same)' : 'NO (DIFFERENT!) ← This is the problem!'}`);

// 差異がある場合、腕チェーンのボーンベクトルを詳細比較
if (!allSame) {
  console.log('\n=== BONE VECTOR COMPARISON (arm chain) ===');
  console.log('Shows how the arm bone vectors differ between bind (T-pose) and frame 0');
  console.log('The viewer uses T-pose vectors, but the delta quaternions assume frame-0 vectors\n');

  // 腕チェーンの階層定義
  const HIERARCHY = {
    'LeftShoulder': 'Spine2', 'LeftArm': 'LeftShoulder', 'LeftForeArm': 'LeftArm', 'LeftHand': 'LeftForeArm',
    'RightShoulder': 'Spine2', 'RightArm': 'RightShoulder', 'RightForeArm': 'RightArm', 'RightHand': 'RightForeArm',
  };

  console.log('Bone               | Bind bone vec (viewer)           | Frame0 bone vec (viewer)         | Angle diff');
  console.log('-'.repeat(110));

  // 各子→親のボーンベクトルを比較
  for (const [child, parent] of Object.entries(HIERARCHY)) {
    const bChild = bindWorldPos[child];    // バインドポーズの子位置
    const bParent = bindWorldPos[parent];  // バインドポーズの親位置
    const fChild = frame0WorldPos[child];   // フレーム0の子位置
    const fParent = frame0WorldPos[parent]; // フレーム0の親位置
    if (!bChild || !bParent || !fChild || !fParent) continue;

    // Three.js空間でのボーンベクトル
    const bVec = bChild.clone().sub(bParent);  // バインドポーズのボーンベクトル
    const fVec = fChild.clone().sub(fParent);  // フレーム0のボーンベクトル

    // ビューア座標系に変換: (-x, y, -z)
    const bView = { x: -bVec.x, y: bVec.y, z: -bVec.z };
    const fView = { x: -fVec.x, y: fVec.y, z: -fVec.z };

    // 方向比較のために正規化
    const bLen = Math.sqrt(bView.x**2 + bView.y**2 + bView.z**2) || 1;
    const fLen = Math.sqrt(fView.x**2 + fView.y**2 + fView.z**2) || 1;
    const bNorm = { x: bView.x/bLen, y: bView.y/bLen, z: bView.z/bLen };
    const fNorm = { x: fView.x/fLen, y: fView.y/fLen, z: fView.z/fLen };

    // 方向の角度差を計算
    const dotProduct = bNorm.x*fNorm.x + bNorm.y*fNorm.y + bNorm.z*fNorm.z;
    const angleDiff = r(Math.acos(Math.min(1, Math.max(-1, dotProduct))) * rad2deg);

    console.log(
      `${child.padEnd(20)}` +
      `| (${r(bView.x).toString().padStart(6)}, ${r(bView.y).toString().padStart(6)}, ${r(bView.z).toString().padStart(6)})`.padEnd(36) +
      `| (${r(fView.x).toString().padStart(6)}, ${r(fView.y).toString().padStart(6)}, ${r(fView.z).toString().padStart(6)})`.padEnd(36) +
      `| ${angleDiff}°`
    );
  }

  // 結論と修正方針
  console.log('\n=== CONCLUSION ===');
  console.log('If bind pose ≠ frame 0, the current motion.json uses frame-0 as "rest"');
  console.log('but the voxel viewer uses T-pose (bind pose) bone vectors.');
  console.log('FIX: Use BIND pose (before animation) as rest when generating motion.json,');
  console.log('so delta quaternions represent changes from T-pose instead of from frame 0.');
}

// クリーンアップ
mixer.stopAllAction();
mixer.uncacheRoot(group);
