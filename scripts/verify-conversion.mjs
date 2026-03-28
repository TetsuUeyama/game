/**
 * クォータニオン変換の検証スクリプト:
 * motion.jsonのデルタをFBXの期待されるオイラー角と比較する。
 *
 * モデル付きFBXとmotion.jsonを読み込み、各変換式を適用し、
 * 同じ階層でローカルデルタに分解して比較する。
 *
 * Verify quaternion conversion by comparing motion.json deltas
 * with expected Euler angles from the FBX.
 *
 * Loads the model-attached FBX and motion.json, applies each conversion formula,
 * decomposes to local deltas via the same hierarchy, and compares.
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

// ── ボーン階層定義（page.tsxのBONE_DEFSと一致） ──
const HIERARCHY = {
  'Hips': null, // ルートボーン
  'Spine': 'Hips', 'Spine1': 'Spine', 'Spine2': 'Spine1', // 背骨チェーン
  'Neck': 'Spine2', 'Head': 'Neck', // 首・頭チェーン
  'LeftShoulder': 'Spine2', 'LeftArm': 'LeftShoulder', 'LeftForeArm': 'LeftArm', 'LeftHand': 'LeftForeArm', // 左腕チェーン
  'RightShoulder': 'Spine2', 'RightArm': 'RightShoulder', 'RightForeArm': 'RightArm', 'RightHand': 'RightForeArm', // 右腕チェーン
  'LeftUpLeg': 'Hips', 'LeftLeg': 'LeftUpLeg', 'LeftFoot': 'LeftLeg', 'LeftToeBase': 'LeftFoot', // 左脚チェーン
  'RightUpLeg': 'Hips', 'RightLeg': 'RightUpLeg', 'RightFoot': 'RightLeg', 'RightToeBase': 'RightFoot', // 右脚チェーン
};

// ── テストする変換式の定義 ──
const CONVERSIONS = {
  conv1: (dq) => new THREE.Quaternion(-dq[0], -dq[1], dq[2], dq[3]),  // (-x,-y,z,w): x,y反転
  conv2: (dq) => new THREE.Quaternion(dq[0], dq[1], -dq[2], dq[3]),   // (x,y,-z,w): z反転
  conv3: (dq) => new THREE.Quaternion(dq[0], dq[1], -dq[2], -dq[3]),  // (x,y,-z,-w): z,w反転
  conv4: (dq) => new THREE.Quaternion(-dq[0], dq[1], dq[2], dq[3]),   // (-x,y,z,w): x反転
  identity: (dq) => new THREE.Quaternion(dq[0], dq[1], dq[2], dq[3]), // (x,y,z,w): 無変換
};

// ── ファイルパス設定 ──
const __dirname = path.dirname(fileURLToPath(import.meta.url)); // スクリプトのディレクトリ

// モデル付きFBXのパス（グラウンドトゥルースのローカル回転を取得するため）
const fbxPath = path.join(__dirname, '..', 'public', 'models', 'character-motion', 'Hip Hop Dancing (1).fbx');
const motionPath = path.join(__dirname, '..', 'public', 'models', 'character-motion', 'Hip Hop Dancing.motion.json');

// ── FBXの読み込み ──
console.log('Loading FBX...');
const loader = new FBXLoader(); // FBXローダー
const group = await new Promise((resolve, reject) => {
  loader.load(path.resolve(fbxPath), resolve, undefined, reject); // FBX読み込み
});

// ボーン名→ボーンオブジェクトのマップ
const boneByName = {};
group.traverse((obj) => {
  if (obj.isBone) boneByName[cleanBoneName(obj.name)] = obj; // ボーンをマップに登録
});

// アニメーションの設定
const clip = group.animations[0]; // 最初のアニメーションクリップ
const mixer = new THREE.AnimationMixer(group); // ミキサー
const action = mixer.clipAction(clip); // アクション
action.play(); // 再生

// モーションJSONの読み込み
const motionData = JSON.parse(fs.readFileSync(path.resolve(motionPath), 'utf-8'));

// 分析対象のボーン
const keyBones = ['Hips', 'Spine', 'Spine2', 'LeftArm', 'RightArm', 'LeftForeArm', 'RightForeArm', 'LeftUpLeg', 'RightUpLeg', 'Head'];

// ── フレーム67を分析 ──
const frameIdx = 67; // 分析フレーム
const time = frameIdx / 30; // 秒に変換
mixer.setTime(time); // 時刻設定
group.updateMatrixWorld(true); // 行列更新

console.log(`\n=== Frame ${frameIdx} ===`);
console.log('Comparing FBX LOCAL rotations vs viewer LOCAL rotations (from world deltas + hierarchy decomposition)');
console.log('FBX local = bone.quaternion (the actual local rotation Three.js computed)');
console.log('Viewer local = parentWorldDelta⁻¹ × boneWorldDelta (our decomposition)\n');

// ── FBXレストポーズのローカルクォータニオンを取得 ──
mixer.setTime(0); // レストポーズに戻す
group.updateMatrixWorld(true); // 行列更新

const restLocalQ = {}; // レストポーズのローカルクォータニオン
for (const name of keyBones) {
  const bone = boneByName[name]; // ボーンオブジェクト
  if (bone) restLocalQ[name] = bone.quaternion.clone(); // ローカルクォータニオンを保存
}

// ── アニメーション時のローカルクォータニオンを取得 ──
mixer.setTime(time); // アニメーションフレームに移動
group.updateMatrixWorld(true); // 行列更新

const animLocalQ = {}; // アニメーション時のローカルクォータニオン
for (const name of keyBones) {
  const bone = boneByName[name]; // ボーンオブジェクト
  if (bone) animLocalQ[name] = bone.quaternion.clone(); // ローカルクォータニオンを保存
}

// ── FBXローカルデルタの計算: restLocalQ⁻¹ × animLocalQ ──
const fbxLocalDelta = {};
for (const name of keyBones) {
  if (!restLocalQ[name] || !animLocalQ[name]) continue; // データなしならスキップ
  const invRest = restLocalQ[name].clone().invert(); // レストの逆クォータニオン
  fbxLocalDelta[name] = invRest.multiply(animLocalQ[name]); // デルタ = restInv × anim
}

// ── motion.jsonから各変換式を適用してローカルデルタを計算 ──
const motionFrame = motionData.frames[frameIdx]; // モーションフレームデータ

// 各変換式について比較を実行
for (const [convName, convFn] of Object.entries(CONVERSIONS)) {
  console.log(`\n--- Conversion: ${convName} ---`);
  console.log('Bone               | FBX local delta euler        | Viewer local delta euler       | Error°');
  console.log('-'.repeat(100));

  // ワールドデルタの変換
  const worldDeltas = {};
  for (const [boneName, data] of Object.entries(motionFrame)) {
    worldDeltas[boneName] = convFn(data.dq); // 指定の変換式でクォータニオンに変換
  }

  // 階層分解でローカルデルタを計算
  const viewerLocalDelta = {};
  for (const name of keyBones) {
    const worldDQ = worldDeltas[name]; // ワールドデルタ
    if (!worldDQ) continue; // データなしならスキップ

    const parentName = HIERARCHY[name]; // 親ボーン名
    if (!parentName) {
      viewerLocalDelta[name] = worldDQ.clone(); // ルートはそのまま
    } else {
      const parentWorldDQ = worldDeltas[parentName]; // 親のワールドデルタ
      if (parentWorldDQ) {
        const parentInv = parentWorldDQ.clone().invert(); // 親の逆クォータニオン
        viewerLocalDelta[name] = parentInv.multiply(worldDQ); // ローカル = 親Inv × 子ワールド
      } else {
        viewerLocalDelta[name] = worldDQ.clone(); // 親データなしならそのまま
      }
    }
  }

  // ── FBXとビューアのローカルデルタを比較 ──
  let totalError = 0; // 合計角度誤差
  let count = 0; // ボーン数
  for (const name of keyBones) {
    const fbx = fbxLocalDelta[name]; // FBXのローカルデルタ
    const viewer = viewerLocalDelta[name]; // ビューアのローカルデルタ
    if (!fbx || !viewer) continue; // データなしならスキップ

    // オイラー角に変換
    const fbxEuler = new THREE.Euler().setFromQuaternion(fbx, 'XYZ'); // FBXオイラー角
    const viewerEuler = new THREE.Euler().setFromQuaternion(viewer, 'XYZ'); // ビューアオイラー角

    // 度に変換
    const ex = r(fbxEuler.x * rad2deg); // FBX X軸回転（度）
    const ey = r(fbxEuler.y * rad2deg); // FBX Y軸回転（度）
    const ez = r(fbxEuler.z * rad2deg); // FBX Z軸回転（度）

    const vx = r(viewerEuler.x * rad2deg); // ビューア X軸回転（度）
    const vy = r(viewerEuler.y * rad2deg); // ビューア Y軸回転（度）
    const vz = r(viewerEuler.z * rad2deg); // ビューア Z軸回転（度）

    // 角度誤差の計算（クォータニオン距離）
    const dot = Math.abs(fbx.x * viewer.x + fbx.y * viewer.y + fbx.z * viewer.z + fbx.w * viewer.w); // 内積の絶対値
    const angError = r(2 * Math.acos(Math.min(1, dot)) * rad2deg); // 角度誤差（度）
    totalError += angError; // 合計に加算
    count++; // カウント

    // 結果を表示
    console.log(
      `${name.padEnd(20)}` +
      `| X:${ex}° Y:${ey}° Z:${ez}°`.padEnd(32) +
      `| X:${vx}° Y:${vy}° Z:${vz}°`.padEnd(35) +
      `| ${angError}°`
    );
  }

  // 変換式ごとの合計・平均誤差を表示
  console.log(`  Total angular error: ${r(totalError)}° (avg: ${r(totalError / count)}°)`);
}

// ── クリーンアップ ──
mixer.stopAllAction(); // アニメーション停止
mixer.uncacheRoot(group); // キャッシュクリア
