/**
 * 腕の回転問題の診断スクリプト:
 * Three.jsのグラウンドトゥルース（正解データ）と
 * Babylon.jsビューアが計算する結果を比較する。
 * Babylon.jsのQuaternionクラスを使用して検証。
 *
 * page.tsxのapplyFrameと全く同じロジックをシミュレートし、
 * 結果がThree.jsと一致するか検証する。
 *
 * Diagnose arm rotation issue: compare Three.js ground truth with
 * what Babylon.js viewer would compute, using Babylon.js Quaternion class.
 *
 * This script simulates the EXACT same logic as page.tsx applyFrame,
 * but using Babylon.js Quaternion to verify the result matches Three.js.
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
// FileLoaderをNode.js用にオーバーライド
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

// ── Babylon.jsのQuaternionクラスもインポート ──
const BABYLON = await import('@babylonjs/core/Maths/math.vector.js'); // Babylon.jsの数学ライブラリ
const BQ = BABYLON.Quaternion; // Babylon.jsのQuaternionクラスの短縮名

// ── ユーティリティ関数 ──
// "mixamorig"プレフィックスを除去
function cleanBoneName(name) { return name.replace(/^mixamorig/, ''); }
// 小数点3桁に丸める関数
const r = (v) => Math.round(v * 1000) / 1000;
// ラジアン→度変換定数
const rad2deg = 180 / Math.PI;

// ── ボーン階層定義（Mixamoスケルトン） ──
const HIERARCHY = {
  'Hips': null, // ルートボーン（親なし）
  'Spine': 'Hips', 'Spine1': 'Spine', 'Spine2': 'Spine1', // 背骨チェーン
  'Neck': 'Spine2', 'Head': 'Neck', // 首・頭チェーン
  'LeftShoulder': 'Spine2', 'LeftArm': 'LeftShoulder', 'LeftForeArm': 'LeftArm', 'LeftHand': 'LeftForeArm', // 左腕チェーン
  'RightShoulder': 'Spine2', 'RightArm': 'RightShoulder', 'RightForeArm': 'RightArm', 'RightHand': 'RightForeArm', // 右腕チェーン
  'LeftUpLeg': 'Hips', 'LeftLeg': 'LeftUpLeg', 'LeftFoot': 'LeftLeg', 'LeftToeBase': 'LeftFoot', // 左脚チェーン
  'RightUpLeg': 'Hips', 'RightLeg': 'RightUpLeg', 'RightFoot': 'RightLeg', 'RightToeBase': 'RightFoot', // 右脚チェーン
};

// ── ファイルパスの設定 ──
const __dirname = path.dirname(fileURLToPath(import.meta.url)); // 現在のスクリプトのディレクトリ
const fbxPath = path.join(__dirname, '..', 'public', 'models', 'character-motion', 'Hip Hop Dancing (1).fbx'); // FBXファイル
const motionPath = path.join(__dirname, '..', 'public', 'models', 'character-motion', 'Hip Hop Dancing.motion.json'); // モーションJSON

// ── FBXの読み込み ──
const loader = new FBXLoader(); // FBXローダー
const group = await new Promise((resolve, reject) => {
  loader.load(path.resolve(fbxPath), resolve, undefined, reject); // FBX読み込み
});

// ボーン名→ボーンオブジェクトのマップを作成
const boneByName = {};
group.traverse((obj) => { if (obj.isBone) boneByName[cleanBoneName(obj.name)] = obj; });

// ── アニメーションの設定 ──
const clip = group.animations[0]; // 最初のアニメーションクリップ
const mixer = new THREE.AnimationMixer(group); // ミキサー
const action = mixer.clipAction(clip); // アクション
action.play(); // 再生

// モーションJSONの読み込み
const motionData = JSON.parse(fs.readFileSync(path.resolve(motionPath), 'utf-8'));
const keyBones = Object.keys(HIERARCHY); // 全ボーン名のリスト

// ── レストポーズのキャプチャ ──
mixer.setTime(0); // フレーム0
group.updateMatrixWorld(true); // 行列更新
const restWorldQuat = {}; // レストポーズのワールドクォータニオン
for (const name of keyBones) {
  const bone = boneByName[name]; // ボーンオブジェクト
  if (bone) {
    const wq = new THREE.Quaternion(); // クォータニオン格納用
    bone.getWorldQuaternion(wq); // ワールドクォータニオン取得
    restWorldQuat[name] = wq.clone(); // クローンして保存
  }
}

// ── Three.jsでの変換関数（リファレンス） ──
// クォータニオンをビューア空間に変換（Three.js Quaternionで）
const toViewerThree = (q) => new THREE.Quaternion(-q.x, q.y, -q.z, q.w);
// dq配列をビューア空間のThree.js Quaternionに変換
const toViewerArrThree = (dq) => new THREE.Quaternion(-dq[0], dq[1], -dq[2], dq[3]);

// ── Babylon.jsでの変換関数（ビューアが実際に行う処理） ──
// dq配列をビューア空間のBabylon.js Quaternionに変換
const toViewerArrBabylon = (dq) => new BQ(-dq[0], dq[1], -dq[2], dq[3]);

// ── テスト対象フレーム ──
const frameIdx = 67; // フレーム67を分析
const time = frameIdx / 30; // 秒に変換
mixer.setTime(time); // 時刻設定
group.updateMatrixWorld(true); // 行列更新

const motionFrame = motionData.frames[frameIdx]; // モーションデータのフレーム

// ── FBXのワールドデルタを計算（グラウンドトゥルース） ──
const fbxWorldDeltas = {};
for (const name of keyBones) {
  const bone = boneByName[name]; // ボーンオブジェクト
  if (!bone || !restWorldQuat[name]) continue; // データなしならスキップ
  const wq = new THREE.Quaternion(); // 現在のワールドクォータニオン
  bone.getWorldQuaternion(wq); // 取得
  // デルタ = restInv × current（レストからの回転差分）
  fbxWorldDeltas[name] = restWorldQuat[name].clone().invert().multiply(wq);
}

// ===== Three.jsパイプライン（リファレンス実装） =====
// ワールドデルタをビューア空間に変換
const threeWorldDeltas = {};
for (const [boneName, data] of Object.entries(motionFrame)) {
  threeWorldDeltas[boneName] = toViewerArrThree(data.dq); // Three.jsのQuaternionに変換
}

// 階層を使ってローカルデルタに分解
const threeLocals = {};
for (const name of keyBones) {
  const worldDQ = threeWorldDeltas[name]; // ワールドデルタ
  if (!worldDQ) continue; // データなしならスキップ
  const parentName = HIERARCHY[name]; // 親ボーン名
  if (!parentName || !threeWorldDeltas[parentName]) {
    threeLocals[name] = worldDQ.clone(); // ルートはそのまま
  } else {
    // ローカル = 親ワールドInv × 子ワールド
    threeLocals[name] = threeWorldDeltas[parentName].clone().invert().multiply(worldDQ);
  }
}

// ===== Babylon.jsパイプライン（ビューアの実際の処理） =====
// ワールドデルタをBabylon.jsのQuaternionに変換
const babylonWorldDeltas = {};
for (const [boneName, data] of Object.entries(motionFrame)) {
  babylonWorldDeltas[boneName] = toViewerArrBabylon(data.dq); // Babylon.jsのQuaternionに変換
}

// Babylon.jsの階層分解でローカルデルタを計算
const babylonLocals = {};
for (const name of keyBones) {
  const worldDQ = babylonWorldDeltas[name]; // ワールドデルタ
  if (!worldDQ) continue; // データなしならスキップ
  const parentName = HIERARCHY[name]; // 親ボーン名
  if (!parentName || !babylonWorldDeltas[parentName]) {
    babylonLocals[name] = worldDQ.clone(); // ルートはそのまま
  } else {
    // Babylon.jsのinvertInPlace()で親の逆クォータニオンを計算
    const parentInv = babylonWorldDeltas[parentName].clone();
    parentInv.invertInPlace(); // インプレースで逆転
    babylonLocals[name] = parentInv.multiply(worldDQ); // ローカル = 親Inv × 子ワールド
  }
}

// ── ローカルからワールドを再合成（Babylon.jsの階層シミュレーション） ──
const babylonRecomposedWorld = {};
for (const name of keyBones) {
  const parentName = HIERARCHY[name]; // 親ボーン名
  const localQ = babylonLocals[name]; // ローカルクォータニオン
  if (!localQ) continue; // データなしならスキップ
  if (!parentName || !babylonRecomposedWorld[parentName]) {
    babylonRecomposedWorld[name] = localQ.clone(); // ルートはそのまま
  } else {
    // Babylon.jsの階層: worldQ = parentWorldQ × localQ
    babylonRecomposedWorld[name] = babylonRecomposedWorld[parentName].multiply(localQ);
  }
}

// ── 比較結果の表示 ──
console.log('=== FRAME 67: THREE.JS vs BABYLON.JS PIPELINE COMPARISON ===');
console.log('Focus on arm bones to find discrepancy\n');

console.log('--- LOCAL QUATERNION VALUES (parentWorldInv × worldDelta) ---');
console.log('Bone               | Three.js local quat              | Babylon.js local quat            | Match?');
console.log('-'.repeat(110));

// 重点分析するボーンのリスト
const focusBones = [
  'Hips', 'Spine', 'Spine2', // 体幹
  'LeftShoulder', 'LeftArm', 'LeftForeArm', 'LeftHand', // 左腕
  'RightShoulder', 'RightArm', 'RightForeArm', 'RightHand', // 右腕
  'LeftUpLeg', 'LeftLeg', 'LeftFoot', // 左脚
  'RightUpLeg', 'RightLeg', 'RightFoot', // 右脚
];

// ── Three.js vs Babylon.jsのローカルクォータニオンを比較 ──
for (const name of focusBones) {
  const tq = threeLocals[name]; // Three.jsのローカルクォータニオン
  const bq = babylonLocals[name]; // Babylon.jsのローカルクォータニオン
  if (!tq || !bq) continue; // データなしならスキップ

  // 各成分の差の絶対値を計算
  const dx = Math.abs(tq.x - bq.x); // X成分の差
  const dy = Math.abs(tq.y - bq.y); // Y成分の差
  const dz = Math.abs(tq.z - bq.z); // Z成分の差
  const dw = Math.abs(tq.w - bq.w); // W成分の差
  const maxDiff = Math.max(dx, dy, dz, dw); // 最大差
  const ok = maxDiff < 1e-6; // 一致判定（微小誤差以下か）

  // 結果を表示
  console.log(
    `${name.padEnd(20)}` +
    `| (${r(tq.x)}, ${r(tq.y)}, ${r(tq.z)}, ${r(tq.w)})`.padEnd(36) +
    `| (${r(bq.x)}, ${r(bq.y)}, ${r(bq.z)}, ${r(bq.w)})`.padEnd(36) +
    `| ${ok ? 'OK' : `DIFF ${r(maxDiff)}`}`
  );
}

// ── 再合成されたワールドクォータニオンの比較 ──
console.log('\n--- RECOMPOSED WORLD QUATERNION (Babylon.js hierarchy: parent × local) ---');
console.log('Bone               | Expected (converted FBX)         | Babylon recomposed               | Error°');
console.log('-'.repeat(110));

for (const name of focusBones) {
  const expected = threeWorldDeltas[name]; // 期待値（変換済みFBXデルタ）
  const actual = babylonRecomposedWorld[name]; // 実際の再合成結果
  if (!expected || !actual) continue; // データなしならスキップ

  // 角度誤差を計算（クォータニオンの内積から）
  const dot = Math.abs(expected.x * actual.x + expected.y * actual.y +
                       expected.z * actual.z + expected.w * actual.w);
  const angErr = r(2 * Math.acos(Math.min(1, dot)) * rad2deg); // 度に変換

  // 結果を表示
  console.log(
    `${name.padEnd(20)}` +
    `| (${r(expected.x)}, ${r(expected.y)}, ${r(expected.z)}, ${r(expected.w)})`.padEnd(36) +
    `| (${r(actual.x)}, ${r(actual.y)}, ${r(actual.z)}, ${r(actual.w)})`.padEnd(36) +
    `| ${angErr < 0.5 ? 'OK' : 'ERR'} (${angErr}°)`
  );
}

// ===== 重要テスト: Babylon.jsのQuaternion.multiplyがThree.jsと一致するか検証 =====
console.log('\n--- QUATERNION MULTIPLY CROSS-CHECK ---');
// テスト用のクォータニオンを作成
const tA = new THREE.Quaternion(0.3, 0.5, -0.2, 0.8).normalize(); // Three.jsのテスト値A
const tB = new THREE.Quaternion(-0.1, 0.7, 0.4, 0.5).normalize(); // Three.jsのテスト値B
const tAB = tA.clone().multiply(tB); // Three.jsでの乗算結果 A×B

// 同じ値でBabylon.jsのQuaternionを作成
const bA = new BQ(tA.x, tA.y, tA.z, tA.w); // Babylon.jsのテスト値A
const bB = new BQ(tB.x, tB.y, tB.z, tB.w); // Babylon.jsのテスト値B
const bAB = bA.multiply(bB); // Babylon.jsでの乗算結果 A×B

// 結果を比較
console.log(`Three.js A×B: (${r(tAB.x)}, ${r(tAB.y)}, ${r(tAB.z)}, ${r(tAB.w)})`);
console.log(`Babylon  A×B: (${r(bAB.x)}, ${r(bAB.y)}, ${r(bAB.z)}, ${r(bAB.w)})`);
// 最大差を計算
const mulDiff = Math.max(
  Math.abs(tAB.x - bAB.x), Math.abs(tAB.y - bAB.y),
  Math.abs(tAB.z - bAB.z), Math.abs(tAB.w - bAB.w)
);
console.log(`Max difference: ${mulDiff.toExponential(3)} → ${mulDiff < 1e-10 ? 'IDENTICAL' : 'DIFFERENT!'}`);

// ===== 重要テスト: Babylon.jsのinvertがThree.jsと一致するか検証 =====
console.log('\n--- QUATERNION INVERT CROSS-CHECK ---');
const tInv = tA.clone().invert(); // Three.jsでの逆クォータニオン
const bInv = bA.clone(); // Babylon.jsのクローン
bInv.invertInPlace(); // Babylon.jsのインプレース逆転

// 結果を比較
console.log(`Three.js inv(A): (${r(tInv.x)}, ${r(tInv.y)}, ${r(tInv.z)}, ${r(tInv.w)})`);
console.log(`Babylon  inv(A): (${r(bInv.x)}, ${r(bInv.y)}, ${r(bInv.z)}, ${r(bInv.w)})`);
// 最大差を計算
const invDiff = Math.max(
  Math.abs(tInv.x - bInv.x), Math.abs(tInv.y - bInv.y),
  Math.abs(tInv.z - bInv.z), Math.abs(tInv.w - bInv.w)
);
console.log(`Max difference: ${invDiff.toExponential(3)} → ${invDiff < 1e-10 ? 'IDENTICAL' : 'DIFFERENT!'}`);

// ===== FBXローカルデルタとビューアローカルデルタの比較 =====
console.log('\n--- FBX LOCAL DELTA vs VIEWER LOCAL DELTA (Euler angles) ---');
console.log('Shows how the viewer-space local rotation relates to the FBX local rotation');
console.log('Bone               | FBX local Euler                  | Viewer local Euler               | Description');
console.log('-'.repeat(120));

// FBXのレストポーズでのローカルクォータニオンを取得
mixer.setTime(0); // レストポーズに戻す
group.updateMatrixWorld(true); // 行列更新
const restLocalQ = {}; // レストポーズのローカルクォータニオン
for (const name of keyBones) {
  const bone = boneByName[name]; // ボーンオブジェクト
  if (bone) restLocalQ[name] = bone.quaternion.clone(); // ローカルクォータニオンを保存
}
// アニメーションフレームでのローカルクォータニオンを取得
mixer.setTime(time); // アニメーション時刻に設定
group.updateMatrixWorld(true); // 行列更新
const animLocalQ = {}; // アニメーション時のローカルクォータニオン
for (const name of keyBones) {
  const bone = boneByName[name]; // ボーンオブジェクト
  if (bone) animLocalQ[name] = bone.quaternion.clone(); // ローカルクォータニオンを保存
}
// FBXローカルデルタの計算: restLocalInv × animLocal
const fbxLocalDelta = {};
for (const name of keyBones) {
  if (!restLocalQ[name] || !animLocalQ[name]) continue; // データなしならスキップ
  fbxLocalDelta[name] = restLocalQ[name].clone().invert().multiply(animLocalQ[name]); // デルタ計算
}

// ── 各ボーンのローカルデルタをオイラー角で比較 ──
for (const name of focusBones) {
  const fbx = fbxLocalDelta[name]; // FBXのローカルデルタ
  const viewer = threeLocals[name]; // ビューア空間のローカルデルタ（Three.jsで計算）
  if (!fbx || !viewer) continue; // データなしならスキップ

  // オイラー角に変換
  const fe = new THREE.Euler().setFromQuaternion(fbx, 'XYZ'); // FBXのオイラー角
  const ve = new THREE.Euler().setFromQuaternion(viewer, 'XYZ'); // ビューアのオイラー角

  // 度に変換
  const fx = r(fe.x * rad2deg), fy = r(fe.y * rad2deg), fz = r(fe.z * rad2deg); // FBX各軸（度）
  const vx = r(ve.x * rad2deg), vy = r(ve.y * rad2deg), vz = r(ve.z * rad2deg); // ビューア各軸（度）

  // 各軸の関係性を記述（一致/反転/その他）
  let desc = '';
  const xMatch = Math.abs(fx - vx) < 2; // X軸が一致するか
  const xNeg = Math.abs(fx + vx) < 2; // X軸が反転しているか
  const yMatch = Math.abs(fy - vy) < 2; // Y軸が一致するか
  const yNeg = Math.abs(fy + vy) < 2; // Y軸が反転しているか
  const zMatch = Math.abs(fz - vz) < 2; // Z軸が一致するか
  const zNeg = Math.abs(fz + vz) < 2; // Z軸が反転しているか

  // 関係性の文字列を構築
  const parts = [];
  if (xMatch) parts.push('X=same'); // X同じ
  else if (xNeg) parts.push('X=negated'); // X反転
  else parts.push(`X: ${fx}→${vx}`); // Xの値の変化
  if (yMatch) parts.push('Y=same'); // Y同じ
  else if (yNeg) parts.push('Y=negated'); // Y反転
  else parts.push(`Y: ${fy}→${vy}`); // Yの値の変化
  if (zMatch) parts.push('Z=same'); // Z同じ
  else if (zNeg) parts.push('Z=negated'); // Z反転
  else parts.push(`Z: ${fz}→${vz}`); // Zの値の変化
  desc = parts.join(', '); // カンマで結合

  // 結果を表示
  console.log(
    `${name.padEnd(20)}` +
    `| X:${fx}° Y:${fy}° Z:${fz}°`.padEnd(36) +
    `| X:${vx}° Y:${vy}° Z:${vz}°`.padEnd(36) +
    `| ${desc}`
  );
}

// ── クリーンアップ ──
mixer.stopAllAction(); // アニメーション停止
mixer.uncacheRoot(group); // キャッシュクリア
