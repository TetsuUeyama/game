/**
 * 左手の軌跡を全フレームにわたって追跡するスクリプト。
 * FBXグラウンドトゥルースのエンドポイント位置（ビューア座標に変換）と
 * クォータニオンパイプラインの出力を比較する。
 *
 * 決定的テスト: 手が右に動くべき時に左に動いていれば、
 * 方向性のエラーがあることがわかる。
 *
 * Trace the LEFT HAND trajectory across all frames.
 * Compare FBX ground truth endpoint positions (converted to viewer coords)
 * with what our quaternion pipeline produces.
 *
 * This is the definitive test: if the hand moves LEFT when it should move RIGHT,
 * we know there's a directional error.
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
// 小数点2桁に丸める
const r = (v) => Math.round(v * 100) / 100;

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

// アニメーションの設定
const clip = group.animations[0]; // 最初のクリップ
const mixer = new THREE.AnimationMixer(group); // ミキサー
const action = mixer.clipAction(clip); // アクション
action.play(); // 再生

// モーションJSONの読み込み
const motionData = JSON.parse(fs.readFileSync(path.resolve(motionPath), 'utf-8'));

// ── レストポーズのキャプチャ ──
mixer.setTime(0); // フレーム0
group.updateMatrixWorld(true); // 行列更新

const restWorldQuat = {}; // レストポーズのワールドクォータニオン
const restWorldPos = {}; // レストポーズのワールド位置
const restBoneLength = {}; // レストポーズのボーン長さ

// 全ボーンのレストポーズデータを取得
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

// ボーン長さの計算（親→子の距離）
for (const name of keyBones) {
  const parentName = HIERARCHY[name]; // 親ボーン名
  if (parentName && restWorldPos[name] && restWorldPos[parentName]) {
    restBoneLength[name] = restWorldPos[name].distanceTo(restWorldPos[parentName]); // 距離を計算
  }
}

// ── 座標変換関数 ──
// 軸マッピング: viewer = (-Three_x, Three_y, -Three_z)
const toViewerPos = (p) => ({ x: -p.x, y: p.y, z: -p.z }); // 位置変換
const toViewerQuat = (dq) => new THREE.Quaternion(-dq[0], dq[1], -dq[2], dq[3]); // dq配列→ビューアクォータニオン

/**
 * ビューアのフレーム処理をシミュレーション:
 * 1. ワールドデルタをビューア空間に変換
 * 2. 階層を使ってローカルデルタに分解
 * 3. ローカルデルタを階層に沿って適用しワールド回転を計算
 * 4. ワールド回転を使ってエンドポイント位置を計算
 * @param {Object} frameData - モーションフレームデータ
 * @returns {Object} ワールドデルタと入力ワールドデルタ
 */
function simulateViewerFrame(frameData) {
  // ワールドデルタの変換
  const worldDeltas = {};
  for (const [boneName, data] of Object.entries(frameData)) {
    worldDeltas[boneName] = toViewerQuat(data.dq); // ビューア空間に変換
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

  // ワールド再合成（Babylon.js階層: worldQ = parentWorldQ × localQ）
  const world = {};
  for (const name of keyBones) {
    const parentName = HIERARCHY[name]; // 親ボーン名
    const localQ = locals[name]; // ローカルクォータニオン
    if (!localQ) continue; // データなしならスキップ
    if (!parentName || !world[parentName]) {
      world[name] = localQ.clone(); // ルートはそのまま
    } else {
      // ワールド = 親ワールド × ローカル
      world[name] = world[parentName].clone().multiply(localQ);
    }
  }

  // エンドポイント位置の計算
  // ビューアでは各ボーン先端のレスト位置からの相対位置は
  // ワールドデルタで回転させたレストポーズのボーン方向で決定される
  //
  // LeftHandの場合:
  //   viewerPos(LeftHand) = viewerPos(Hips) + sum(worldDelta[parent] × boneVector)
  //
  // 簡略化のため、ワールドデルタクォータニオンのみを返す

  return { worldDeltas: world, inputWorldDeltas: worldDeltas }; // 結果を返す
}

// ========================================================================
// 手の軌跡追跡
// ========================================================================

console.log('=== LEFT HAND TRAJECTORY: FBX vs VIEWER PIPELINE ===');
console.log('FBX delta = actual hand displacement from rest (converted to viewer coords)');
console.log('Pipeline = world delta quaternion applied to rest bone chain');
console.log('If X direction is inverted, arm swing direction would be wrong\n');

console.log('Frame | FBX LeftHand delta (viewer)      | FBX Hips delta (viewer)          | Arm swing direction');
console.log('-'.repeat(100));

// 5フレームごとにサンプリング
const sampleFrames = [];
for (let f = 0; f < motionData.frameCount; f += 5) {
  sampleFrames.push(f); // サンプルフレームを追加
}

const trajectoryData = []; // 軌跡データの配列

// ── 各フレームでの左手軌跡を記録 ──
for (const frameIdx of sampleFrames) {
  const time = frameIdx / 30; // 秒に変換
  mixer.setTime(time); // 時刻設定
  group.updateMatrixWorld(true); // 行列更新

  // FBXのグラウンドトゥルース位置を取得
  const leftHandPos = new THREE.Vector3(); // 左手位置
  const hipsPos = new THREE.Vector3(); // 腰位置
  boneByName['LeftHand']?.getWorldPosition(leftHandPos); // 左手のワールド位置
  boneByName['Hips']?.getWorldPosition(hipsPos); // 腰のワールド位置

  // レストポーズからの変位を計算
  const leftHandDelta = leftHandPos.clone().sub(restWorldPos['LeftHand']); // 左手のデルタ
  const hipsDelta = hipsPos.clone().sub(restWorldPos['Hips']); // 腰のデルタ

  // ビューア座標に変換
  const vHandDelta = toViewerPos(leftHandDelta); // 左手デルタ（ビューア）
  const vHipsDelta = toViewerPos(hipsDelta); // 腰デルタ（ビューア）

  // 腰に対する手の相対的な移動方向を計算
  const handRelativeToHips_x = vHandDelta.x - vHipsDelta.x; // X方向（左右）
  const handRelativeToHips_z = vHandDelta.z - vHipsDelta.z; // Z方向（前後）

  // 方向を文字列で表現
  const direction = (handRelativeToHips_x > 0.05 ? 'RIGHT' : handRelativeToHips_x < -0.05 ? 'LEFT' : 'center') +
    ' / ' + (handRelativeToHips_z > 0.05 ? 'BACK' : handRelativeToHips_z < -0.05 ? 'FRONT' : 'center');

  // 軌跡データを保存
  trajectoryData.push({
    frame: frameIdx, // フレーム番号
    handX: vHandDelta.x, // 手のX変位
    handZ: vHandDelta.z, // 手のZ変位
    hipsX: vHipsDelta.x, // 腰のX変位
    relX: handRelativeToHips_x, // 腰相対X変位
    relZ: handRelativeToHips_z, // 腰相対Z変位
  });

  // 結果を表示
  console.log(
    `${String(frameIdx).padStart(5)} ` +
    `| X:${r(vHandDelta.x).toString().padStart(6)} Y:${r(vHandDelta.y).toString().padStart(6)} Z:${r(vHandDelta.z).toString().padStart(6)}` +
    `  | X:${r(vHipsDelta.x).toString().padStart(6)} Y:${r(vHipsDelta.y).toString().padStart(6)} Z:${r(vHipsDelta.z).toString().padStart(6)}` +
    `  | ${direction}`
  );
}

// ========================================================================
// ワールドクォータニオンの比較（主要フレーム）
// ========================================================================
console.log('\n\n=== WORLD QUATERNION COMPARISON (key frames) ===');
console.log('Compare pipeline world delta with FBX world delta (converted to viewer)');
console.log('Focus on LeftArm chain to find directional error\n');

const checkFrames = [0, 20, 40, 60, 80, 100, 120]; // チェック対象フレーム
const checkBones = ['LeftShoulder', 'LeftArm', 'LeftForeArm', 'LeftHand']; // 左腕チェーンのボーン

for (const frameIdx of checkFrames) {
  if (frameIdx >= motionData.frameCount) continue; // 範囲外スキップ
  const time = frameIdx / 30; // 秒に変換
  mixer.setTime(time); // 時刻設定
  group.updateMatrixWorld(true); // 行列更新

  const motionFrame = motionData.frames[frameIdx]; // モーションフレーム
  const result = simulateViewerFrame(motionFrame); // ビューアパイプラインをシミュレーション

  console.log(`--- Frame ${frameIdx} ---`);
  console.log('Bone               | FBX→viewer world quat            | Pipeline world quat              | Error°');

  // 各ボーンのクォータニオンを比較
  for (const name of checkBones) {
    const bone = boneByName[name]; // ボーンオブジェクト
    if (!bone || !restWorldQuat[name]) continue; // データなしならスキップ
    const wq = new THREE.Quaternion(); // 現在のワールドクォータニオン
    bone.getWorldQuaternion(wq); // 取得
    // FBXのワールドデルタを計算
    const fbxDelta = restWorldQuat[name].clone().invert().multiply(wq);
    // ビューア空間に変換
    const fbxViewer = new THREE.Quaternion(-fbxDelta.x, fbxDelta.y, -fbxDelta.z, fbxDelta.w);

    const pipelineQ = result.worldDeltas[name]; // パイプラインのワールドクォータニオン
    if (!pipelineQ) { console.log(`${name.padEnd(20)}| NO DATA`); continue; } // データなし

    // 角度誤差を計算（クォータニオン内積）
    const dot = Math.abs(fbxViewer.x*pipelineQ.x + fbxViewer.y*pipelineQ.y +
                         fbxViewer.z*pipelineQ.z + fbxViewer.w*pipelineQ.w);
    const angErr = r(2 * Math.acos(Math.min(1, dot)) * 180 / Math.PI); // 度に変換

    // 結果を表示
    console.log(
      `${name.padEnd(20)}` +
      `| (${r(fbxViewer.x)}, ${r(fbxViewer.y)}, ${r(fbxViewer.z)}, ${r(fbxViewer.w)})`.padEnd(36) +
      `| (${r(pipelineQ.x)}, ${r(pipelineQ.y)}, ${r(pipelineQ.z)}, ${r(pipelineQ.w)})`.padEnd(36) +
      `| ${angErr}°`
    );
  }
  console.log('');
}

// ========================================================================
// 決定的テスト: FKチェーンでパイプラインクォータニオンを使って手の位置を計算
// FBXのエンドポイントと比較（両方ビューア座標）
// ========================================================================
console.log('\n=== DEFINITIVE FK TEST: Hand endpoint position ===');
console.log('Compute LeftHand position using FK chain with pipeline world quaternions');
console.log('Compare with FBX LeftHand position (converted to viewer coords)\n');

console.log('Frame | FBX hand (viewer)                | FK hand (viewer)                 | Delta');
console.log('-'.repeat(100));

// ── レストポーズのボーンベクトル（ビューア座標） ──
const restBoneVectors = {};
for (const name of keyBones) {
  const parentName = HIERARCHY[name]; // 親ボーン名
  if (parentName && restWorldPos[name] && restWorldPos[parentName]) {
    const diff = restWorldPos[name].clone().sub(restWorldPos[parentName]); // 親→子ベクトル
    restBoneVectors[name] = toViewerPos(diff); // ビューア座標に変換
  }
}

// ── 各フレームでFK位置を計算してFBXと比較 ──
for (const frameIdx of [0, 20, 40, 60, 67, 80, 100, 120]) {
  if (frameIdx >= motionData.frameCount) continue; // 範囲外スキップ
  const time = frameIdx / 30; // 秒に変換
  mixer.setTime(time); // 時刻設定
  group.updateMatrixWorld(true); // 行列更新

  const motionFrame = motionData.frames[frameIdx]; // モーションフレーム
  const result = simulateViewerFrame(motionFrame); // ビューアパイプラインをシミュレーション

  // FBXグラウンドトゥルースの左手位置（ビューア座標）
  const fbxHandPos = new THREE.Vector3(); // 左手位置
  boneByName['LeftHand']?.getWorldPosition(fbxHandPos); // 取得
  const fbxHandDelta = fbxHandPos.clone().sub(restWorldPos['LeftHand']); // レストからのデルタ
  const vFbxHand = toViewerPos(fbxHandDelta); // ビューア座標に変換

  // FKチェーン: Hipsからワールドデルタを使ってLeftHand位置を計算
  // handPos = hipsPos + worldDelta[Hips] × boneVec[Spine] + worldDelta[Spine] × boneVec[Spine1] + ...
  const chain = ['Spine', 'Spine1', 'Spine2', 'LeftShoulder', 'LeftArm', 'LeftForeArm', 'LeftHand'];

  // Hipsから開始（位置デルタを適用）
  const hipsData = motionFrame['Hips']; // Hipsのデータ
  let fkPos = new THREE.Vector3(0, 0, 0); // FK位置の初期化
  if (hipsData?.dp) {
    fkPos.x = -hipsData.dp[0]; // viewer_x = -Three_x
    fkPos.y = hipsData.dp[1];  // viewer_y = Three_y
    fkPos.z = -hipsData.dp[2]; // viewer_z = -Three_z
  }

  // 回転済みボーンベクトルを加算してFKチェーンを構築
  for (const boneName of chain) {
    const parentName = HIERARCHY[boneName]; // 親ボーン名
    const boneVec = restBoneVectors[boneName]; // レストポーズのボーンベクトル
    if (!boneVec || !parentName) continue; // データなしならスキップ

    // 親のワールドデルタを取得
    const parentWorldQ = result.worldDeltas[parentName]; // 親ワールドクォータニオン
    if (!parentWorldQ) {
      // 親のワールドデルタがない場合、回転なしでベクトルを加算
      fkPos.x += boneVec.x;
      fkPos.y += boneVec.y;
      fkPos.z += boneVec.z;
      continue;
    }

    // 親のワールドデルタでボーンベクトルを回転
    const bv = new THREE.Vector3(boneVec.x, boneVec.y, boneVec.z); // Three.jsベクトルに変換
    bv.applyQuaternion(parentWorldQ); // クォータニオンで回転
    // 回転済みベクトルをFK位置に加算
    fkPos.x += bv.x;
    fkPos.y += bv.y;
    fkPos.z += bv.z;
  }

  // fkPosはレスト位置からのデルタ
  // FBXとFKの差分を計算
  const dx = r(vFbxHand.x - fkPos.x); // X差分
  const dy = r(vFbxHand.y - fkPos.y); // Y差分
  const dz = r(vFbxHand.z - fkPos.z); // Z差分

  // 結果を表示
  console.log(
    `${String(frameIdx).padStart(5)} ` +
    `| (${r(vFbxHand.x).toString().padStart(6)}, ${r(vFbxHand.y).toString().padStart(6)}, ${r(vFbxHand.z).toString().padStart(6)})` +
    `  | (${r(fkPos.x).toString().padStart(6)}, ${r(fkPos.y).toString().padStart(6)}, ${r(fkPos.z).toString().padStart(6)})` +
    `  | (${dx}, ${dy}, ${dz})`
  );
}

// ── クリーンアップ ──
mixer.stopAllAction(); // アニメーション停止
mixer.uncacheRoot(group); // キャッシュクリア
