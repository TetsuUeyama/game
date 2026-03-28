/**
 * 正しい変換式 (-x, y, -z, w) の検証スクリプト。
 * 軸マッピング: viewer = (-Three_x, Three_y, -Three_z)
 *
 * Verify the CORRECT conversion formula: (-x, y, -z, w)
 * Axis mapping: viewer = (-Three_x, Three_y, -Three_z)
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
mixer.setTime(0); // フレーム0に設定
group.updateMatrixWorld(true); // 行列更新
const restWorldQuat = {}; // レストポーズのワールドクォータニオン
const restWorldPos = {}; // レストポーズのワールド位置
for (const name of keyBones) {
  const bone = boneByName[name]; // ボーンオブジェクト
  if (bone) {
    const wq = new THREE.Quaternion(); // クォータニオン格納用
    const wp = new THREE.Vector3(); // 位置格納用
    bone.getWorldQuaternion(wq); // ワールドクォータニオン取得
    bone.getWorldPosition(wp); // ワールド位置取得
    restWorldQuat[name] = wq.clone(); // 保存
    restWorldPos[name] = wp.clone(); // 保存
  }
}

// ── 正しい変換式: (-x, y, -z, w) ──
// これはY軸180°回転の共役変換に相当する
const toViewer = (q) => new THREE.Quaternion(-q.x, q.y, -q.z, q.w); // クォータニオン変換
const toViewerArr = (dq) => new THREE.Quaternion(-dq[0], dq[1], -dq[2], dq[3]); // dq配列からの変換
// 位置の変換: (-x, y, -z)
const posToViewer = (p) => ({ x: -p.x, y: p.y, z: -p.z });

// ========================================================================
// 準同型性のチェック（階層分解に必須の性質）
// ========================================================================
console.log('=== HOMOMORPHISM CHECK ===');
// テスト用の2つのクォータニオンを作成
const q1 = new THREE.Quaternion(0.3, 0.4, 0.5, 0.6).normalize(); // テスト値1
const q2 = new THREE.Quaternion(0.1, 0.7, 0.2, 0.5).normalize(); // テスト値2
const prod = q1.clone().multiply(q2); // 積 q1 × q2
const cProd = toViewer(prod); // C(q1 × q2): 積を変換
const cProdFromParts = toViewer(q1).multiply(toViewer(q2)); // C(q1) × C(q2): 個別に変換してから積
// 準同型性の誤差を計算: C(q1×q2) = C(q1)×C(q2) が成り立つか
const homError = Math.abs(cProd.x - cProdFromParts.x) + Math.abs(cProd.y - cProdFromParts.y) +
                 Math.abs(cProd.z - cProdFromParts.z) + Math.abs(cProd.w - cProdFromParts.w);
console.log(`C(q1×q2) vs C(q1)×C(q2): error = ${homError.toFixed(10)}`);
console.log(`Homomorphism: ${homError < 1e-6 ? 'YES ✓' : 'NO ✗'}\n`); // 準同型性の判定

// ========================================================================
// フレーム67でのワールド回転検証
// ========================================================================
const frameIdx = 67; // 検証フレーム
const time = frameIdx / 30; // 秒に変換
mixer.setTime(time); // 時刻設定
group.updateMatrixWorld(true); // 行列更新

const motionFrame = motionData.frames[frameIdx]; // モーションフレーム

console.log(`=== FRAME ${frameIdx}: WORLD ROTATION VERIFICATION ===`);
console.log('Bone               | FBX→viewer euler                  | Pipeline euler                   | Error°');
console.log('-'.repeat(110));

// ── FBXワールドデルタの計算 ──
const fbxWorldDeltas = {};
for (const name of keyBones) {
  const bone = boneByName[name]; // ボーンオブジェクト
  if (!bone || !restWorldQuat[name]) continue; // データなしならスキップ
  const wq = new THREE.Quaternion(); // 現在のワールドクォータニオン
  bone.getWorldQuaternion(wq); // 取得
  // デルタ = restInv × current
  fbxWorldDeltas[name] = restWorldQuat[name].clone().invert().multiply(wq);
}

// ── パイプライン: ワールドデルタ変換 → 階層分解 → ワールド再合成 ──
// ステップ1: ワールドデルタをビューア空間に変換
const viewerWorldDeltas = {};
for (const [boneName, data] of Object.entries(motionFrame)) {
  viewerWorldDeltas[boneName] = toViewerArr(data.dq); // ビューア空間に変換
}

// ステップ2: 階層を使ってローカルデルタに分解
const viewerLocals = {};
for (const name of keyBones) {
  const worldDQ = viewerWorldDeltas[name]; // ワールドデルタ
  if (!worldDQ) continue; // データなしならスキップ
  const parentName = HIERARCHY[name]; // 親ボーン名
  if (!parentName || !viewerWorldDeltas[parentName]) {
    viewerLocals[name] = worldDQ.clone(); // ルートはそのまま
  } else {
    // ローカル = 親ワールドInv × 子ワールド
    viewerLocals[name] = viewerWorldDeltas[parentName].clone().invert().multiply(worldDQ);
  }
}

// ステップ3: ローカルからワールドを再合成
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

// ── FBXグラウンドトゥルースとパイプライン結果の比較 ──
let allOK = true; // 全ボーン一致フラグ
for (const name of keyBones) {
  const fbxDelta = fbxWorldDeltas[name]; // FBXのワールドデルタ
  const viewerWorld = recomputedWorld[name]; // 再合成されたワールドクォータニオン
  if (!fbxDelta || !viewerWorld) continue; // データなしならスキップ

  const fbxViewer = toViewer(fbxDelta); // FBXデルタをビューア空間に変換
  // オイラー角に変換
  const e1 = new THREE.Euler().setFromQuaternion(fbxViewer, 'XYZ'); // FBXのオイラー角
  const e2 = new THREE.Euler().setFromQuaternion(viewerWorld, 'XYZ'); // パイプラインのオイラー角

  // クォータニオン距離で角度誤差を計算
  const dot = Math.abs(fbxViewer.x*viewerWorld.x + fbxViewer.y*viewerWorld.y +
                        fbxViewer.z*viewerWorld.z + fbxViewer.w*viewerWorld.w);
  const angErr = r(2 * Math.acos(Math.min(1, dot)) * rad2deg); // 角度誤差（度）
  const ok = angErr < 1.5; // 1.5度以内なら一致
  if (!ok) allOK = false; // 不一致があればフラグを更新

  // 結果を表示
  console.log(
    `${name.padEnd(20)}` +
    `| X:${r(e1.x*rad2deg)}° Y:${r(e1.y*rad2deg)}° Z:${r(e1.z*rad2deg)}°`.padEnd(38) +
    `| X:${r(e2.x*rad2deg)}° Y:${r(e2.y*rad2deg)}° Z:${r(e2.z*rad2deg)}°`.padEnd(38) +
    `| ${ok ? 'OK' : 'ERR'} (${angErr}°)`
  );
}

// 全ボーンの検証結果を表示
console.log(`\nAll world rotations correct: ${allOK ? 'YES ✓' : 'NO ✗'}`);

// ========================================================================
// エンドポイント位置の比較（ビューア空間に変換）
// ========================================================================
console.log('\n=== ENDPOINT POSITIONS (converted to viewer space) ===');
console.log('Bone          | FBX delta (viewer coords)        | Direction check');
console.log('-'.repeat(80));

// アニメーション時のワールド位置を取得
const animWorldPos = {};
for (const name of keyBones) {
  const bone = boneByName[name]; // ボーンオブジェクト
  if (bone) {
    const wp = new THREE.Vector3(); // ワールド位置
    bone.getWorldPosition(wp); // 取得
    animWorldPos[name] = wp.clone(); // 保存
  }
}

// 主要エンドポイントの位置デルタと移動方向を表示
for (const name of ['LeftHand', 'RightHand', 'LeftFoot', 'RightFoot', 'Head']) {
  const restP = restWorldPos[name]; // レストポーズの位置
  const animP = animWorldPos[name]; // アニメーション時の位置
  if (!restP || !animP) continue; // データなしならスキップ
  const dp = animP.clone().sub(restP); // 位置デルタ
  const vdp = posToViewer(dp); // ビューア座標に変換

  // 結果を表示（移動方向を右/左、上/下、後/前で表記）
  console.log(
    `${name.padEnd(14)}` +
    `| (${r(vdp.x)}, ${r(vdp.y)}, ${r(vdp.z)})`.padEnd(38) +
    `| X:${vdp.x > 0 ? 'right' : 'left'} Y:${vdp.y > 0 ? 'up' : 'down'} Z:${vdp.z > 0 ? 'back' : 'front'}`
  );
}

// ── クリーンアップ ──
mixer.stopAllAction(); // アニメーション停止
mixer.uncacheRoot(group); // キャッシュクリア
