/**
 * パイプラインが各ボーンに正しいワールド回転を生成するか検証するスクリプト。
 *
 * パイプライン: worldDelta → toViewer(worldDelta) → 階層分解 → Babylon.js worldQ
 * 期待値: boneViewerWorldQ は toViewer(boneWorldDelta) と等しいはず
 *
 * テレスコーピング特性が保持され、最終的な視覚結果が正しいことを確認する。
 *
 * Verify that our pipeline produces the correct WORLD rotation for each bone.
 *
 * Pipeline: worldDelta → toViewer(worldDelta) → hierarchy decomposition → Babylon.js worldQ
 * Expected: boneViewerWorldQ should equal toViewer(boneWorldDelta)
 *
 * This verifies that the telescoping property holds and the final visual result is correct.
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
    if (this.responseType === 'arraybuffer') {
      setTimeout(() => onLoad(ab), 0); // バイナリコールバック
    } else {
      setTimeout(() => onLoad(buf.toString('utf-8')), 0); // テキストコールバック
    }
  } catch (e) {
    if (onError) onError(e); // エラーコールバック
    else console.error(e); // コンソール出力
  }
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
// ラジアン→度変換定数
const rad2deg = 180 / Math.PI;

// ── ボーン階層定義 ──
const HIERARCHY = {
  'Hips': null, // ルートボーン
  'Spine': 'Hips', 'Spine1': 'Spine', 'Spine2': 'Spine1', // 背骨チェーン
  'Neck': 'Spine2', 'Head': 'Neck', // 首・頭チェーン
  'LeftShoulder': 'Spine2', 'LeftArm': 'LeftShoulder', 'LeftForeArm': 'LeftArm', 'LeftHand': 'LeftForeArm', // 左腕チェーン
  'RightShoulder': 'Spine2', 'RightArm': 'RightShoulder', 'RightForeArm': 'RightArm', 'RightHand': 'RightForeArm', // 右腕チェーン
  'LeftUpLeg': 'Hips', 'LeftLeg': 'LeftUpLeg', 'LeftFoot': 'LeftLeg', 'LeftToeBase': 'LeftFoot', // 左脚チェーン
  'RightUpLeg': 'Hips', 'RightLeg': 'RightUpLeg', 'RightFoot': 'RightLeg', 'RightToeBase': 'RightFoot', // 右脚チェーン
};

// ── ファイルパス設定 ──
const __dirname = path.dirname(fileURLToPath(import.meta.url)); // スクリプトのディレクトリ
const fbxPath = path.join(__dirname, '..', 'public', 'models', 'character-motion', 'Hip Hop Dancing (1).fbx'); // FBXファイル
const motionPath = path.join(__dirname, '..', 'public', 'models', 'character-motion', 'Hip Hop Dancing.motion.json'); // モーションJSON

// ── FBXの読み込み ──
console.log('Loading FBX...');
const loader = new FBXLoader(); // FBXローダー
const group = await new Promise((resolve, reject) => {
  loader.load(path.resolve(fbxPath), resolve, undefined, reject); // FBX読み込み
});

// ボーン名→ボーンオブジェクトのマップ
const boneByName = {};
group.traverse((obj) => { if (obj.isBone) boneByName[cleanBoneName(obj.name)] = obj; });

// アニメーションの設定
const clip = group.animations[0]; // 最初のクリップ
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
    restWorldQuat[name] = wq.clone(); // 保存
  }
}

// ── 変換式: Conv1 (-x, -y, z, w) - Z反転変換 ──
const toViewer = (q) => new THREE.Quaternion(-q.x, -q.y, q.z, q.w); // クォータニオン変換
const toViewerArr = (dq) => new THREE.Quaternion(-dq[0], -dq[1], dq[2], dq[3]); // dq配列からの変換

// ========================================================================
// ワールド回転の検証
// ========================================================================
console.log('\n=== WORLD ROTATION VERIFICATION ===');
console.log('Checking: does our pipeline produce correct world rotations?\n');

// フレーム67を検証
const frameIdx = 67; // 検証フレーム
const time = frameIdx / 30; // 秒に変換
mixer.setTime(time); // 時刻設定
group.updateMatrixWorld(true); // 行列更新

const motionFrame = motionData.frames[frameIdx]; // モーションフレーム

// ── ステップ1: FBXのグラウンドトゥルース（ワールドデルタ） ──
const fbxWorldDeltas = {};
for (const name of keyBones) {
  const bone = boneByName[name]; // ボーンオブジェクト
  if (!bone || !restWorldQuat[name]) continue; // データなしならスキップ
  const wq = new THREE.Quaternion(); // 現在のワールドクォータニオン
  bone.getWorldQuaternion(wq); // 取得
  // デルタ = restInv × current（レストからの回転差分）
  fbxWorldDeltas[name] = restWorldQuat[name].clone().invert().multiply(wq);
}

// ── ステップ2: パイプラインの出力（motion.jsonから） ──
// 全ワールドデルタをビューア空間に変換
const viewerWorldDeltas = {};
for (const [boneName, data] of Object.entries(motionFrame)) {
  viewerWorldDeltas[boneName] = toViewerArr(data.dq); // ビューア空間に変換
}

// 階層を使ってローカルデルタに分解
const viewerLocals = {};
for (const name of keyBones) {
  const worldDQ = viewerWorldDeltas[name]; // ワールドデルタ
  if (!worldDQ) continue; // データなしならスキップ
  const parentName = HIERARCHY[name]; // 親ボーン名
  if (!parentName) {
    viewerLocals[name] = worldDQ.clone(); // ルートはそのまま
  } else {
    const parentWorldDQ = viewerWorldDeltas[parentName]; // 親のワールドデルタ
    if (parentWorldDQ) {
      const parentInv = parentWorldDQ.clone().invert(); // 親の逆
      viewerLocals[name] = parentInv.multiply(worldDQ); // ローカル = 親Inv × 子ワールド
    } else {
      viewerLocals[name] = worldDQ.clone(); // 親データなしならそのまま
    }
  }
}

// ローカルからワールドを再合成（Babylon.js階層シミュレーション）
const recomputedWorld = {};
for (const name of keyBones) {
  const parentName = HIERARCHY[name]; // 親ボーン名
  const localQ = viewerLocals[name]; // ローカルクォータニオン
  if (!localQ) continue; // データなしならスキップ
  if (!parentName || !recomputedWorld[parentName]) {
    recomputedWorld[name] = localQ.clone(); // ルートはそのまま
  } else {
    // ワールド = 親ワールド × ローカル
    recomputedWorld[name] = recomputedWorld[parentName].clone().multiply(localQ);
  }
}

// ── 結果の比較 ──
console.log('Bone               | FBX WorldDelta euler (Three.js)   | Viewer recomputed world euler    | Match?');
console.log('-'.repeat(110));

let allMatch = true; // 全ボーン一致フラグ
for (const name of keyBones) {
  const fbxDelta = fbxWorldDeltas[name]; // FBXのワールドデルタ
  const viewerWorld = recomputedWorld[name]; // 再合成されたワールド
  if (!fbxDelta || !viewerWorld) continue; // データなしならスキップ

  const fbxViewer = toViewer(fbxDelta); // FBXデルタをビューア空間に変換（比較用）

  // オイラー角に変換して可読性を向上
  const fbxEuler = new THREE.Euler().setFromQuaternion(fbxViewer, 'XYZ'); // FBXオイラー角
  const viewerEuler = new THREE.Euler().setFromQuaternion(viewerWorld, 'XYZ'); // 再合成オイラー角

  // クォータニオン距離で角度誤差を計算
  const dot = Math.abs(
    fbxViewer.x * viewerWorld.x + fbxViewer.y * viewerWorld.y +
    fbxViewer.z * viewerWorld.z + fbxViewer.w * viewerWorld.w
  ); // 内積の絶対値
  const angError = r(2 * Math.acos(Math.min(1, dot)) * rad2deg); // 角度誤差（度）
  const ok = angError < 0.1; // 0.1度以内なら一致
  if (!ok) allMatch = false; // 不一致があればフラグ更新

  // 結果を表示
  console.log(
    `${name.padEnd(20)}` +
    `| X:${r(fbxEuler.x*rad2deg)}° Y:${r(fbxEuler.y*rad2deg)}° Z:${r(fbxEuler.z*rad2deg)}°`.padEnd(38) +
    `| X:${r(viewerEuler.x*rad2deg)}° Y:${r(viewerEuler.y*rad2deg)}° Z:${r(viewerEuler.z*rad2deg)}°`.padEnd(38) +
    `| ${ok ? 'OK' : 'MISMATCH'} (${angError}°)`
  );
}

// 全体結果を表示
console.log(`\nAll world rotations match: ${allMatch ? 'YES ✓' : 'NO ✗'}`);

// ========================================================================
// 視覚的比較: ボーンの幾何学的な動きを確認
// ========================================================================
console.log('\n\n=== VISUAL COMPARISON ===');
console.log('For key bones: FBX rest→anim rotation DIRECTION vs viewer rotation DIRECTION');
console.log('A "tip" vector points along the bone axis. We rotate it and check the result.\n');

// ── レストポーズのワールド位置を取得 ──
const restWorldPos = {};
mixer.setTime(0); // レストポーズに戻す
group.updateMatrixWorld(true); // 行列更新
for (const name of keyBones) {
  const bone = boneByName[name]; // ボーンオブジェクト
  if (bone) {
    const wp = new THREE.Vector3(); // 位置格納用
    bone.getWorldPosition(wp); // 取得
    restWorldPos[name] = wp.clone(); // 保存
  }
}

// ── アニメーション時のワールド位置を取得 ──
mixer.setTime(time); // アニメーションフレームに戻す
group.updateMatrixWorld(true); // 行列更新

const animWorldPos = {};
for (const name of keyBones) {
  const bone = boneByName[name]; // ボーンオブジェクト
  if (bone) {
    const wp = new THREE.Vector3(); // 位置格納用
    bone.getWorldPosition(wp); // 取得
    animWorldPos[name] = wp.clone(); // 保存
  }
}

// ── 主要エンドポイントの変位を表示 ──
console.log('Bone          | FBX anim pos (Three.js)         | FBX delta pos (from rest)       | Viewer equivalent delta');
console.log('-'.repeat(120));

for (const name of ['LeftHand', 'RightHand', 'LeftFoot', 'RightFoot', 'Head']) {
  const restP = restWorldPos[name]; // レストポーズ位置
  const animP = animWorldPos[name]; // アニメーション位置
  if (!restP || !animP) continue; // データなしならスキップ

  const dp = animP.clone().sub(restP); // 位置デルタ
  // ビューア座標に変換: viewerZ = -ThreeZ なので z座標を反転
  const viewerDp = { x: r(dp.x), y: r(dp.y), z: r(-dp.z) };

  // 結果を表示
  console.log(
    `${name.padEnd(14)}` +
    `| (${r(animP.x)}, ${r(animP.y)}, ${r(animP.z)})`.padEnd(35) +
    `| (${r(dp.x)}, ${r(dp.y)}, ${r(dp.z)})`.padEnd(35) +
    `| (${viewerDp.x}, ${viewerDp.y}, ${viewerDp.z})`
  );
}

// 説明コメント
console.log('\nIf the viewer character has the same proportions, these endpoint deltas');
console.log('should match the viewer-side movement (scaled by voxelHeight/fbxHeight).');

// ── クリーンアップ ──
mixer.stopAllAction(); // アニメーション停止
mixer.uncacheRoot(group); // キャッシュクリア
