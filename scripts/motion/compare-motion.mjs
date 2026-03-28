/**
 * オリジナルFBXモーション（モデル付き）と変換済みモーションデータを比較するスクリプト。
 * ボーンごとのワールド回転比較を出力し、座標変換エラーを特定する。
 *
 * Compare original FBX motion (with model) against our converted motion data.
 * Outputs per-bone world rotation comparison to identify coordinate conversion errors.
 */

// ── Three.js Node.jsポリフィル ──
import fs from 'fs'; // ファイルシステムモジュール
import path from 'path'; // パス操作モジュール
import { fileURLToPath } from 'url'; // URL→ファイルパス変換
import { Blob } from 'buffer'; // Blobポリフィル

global.Blob = Blob; // グローバルBlobを設定
global.self = global; // selfをグローバルに設定
global.window = global; // windowをグローバルに設定
// documentオブジェクトのポリフィル
global.document = {
  createElementNS: (_ns, tag) => { // XML名前空間付き要素生成のスタブ
    if (tag === 'img') return { set src(_v) {}, addEventListener() {} }; // img要素のスタブ
    return { style: {} }; // その他の要素のスタブ
  },
  createElement: (tag) => { // 通常の要素生成のスタブ
    if (tag === 'canvas') return { getContext: () => null, style: {} }; // canvas要素のスタブ
    return { style: {} }; // その他の要素のスタブ
  },
};
// navigatorオブジェクトのポリフィル
try { global.navigator = { userAgent: 'node', platform: 'node' }; } catch {
  Object.defineProperty(global, 'navigator', { value: { userAgent: 'node', platform: 'node' }, writable: true, configurable: true });
}
// URLオブジェクトのポリフィル
global.URL = global.URL || {};
global.URL.createObjectURL = global.URL.createObjectURL || (() => ''); // ObjectURL生成のスタブ
global.URL.revokeObjectURL = global.URL.revokeObjectURL || (() => ''); // ObjectURL解放のスタブ
// fetchのポリフィル（ローカルファイル読み込み用）
if (!global.fetch) {
  global.fetch = async (url) => {
    const filePath = url.startsWith('file://') ? fileURLToPath(url) : url; // file://プロトコル対応
    const buf = fs.readFileSync(filePath); // ファイルを同期読み込み
    return {
      ok: true, // レスポンス成功
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
    if (this.responseType === 'arraybuffer') {
      setTimeout(() => onLoad(ab), 0); // バイナリとしてコールバック
    } else {
      setTimeout(() => onLoad(buf.toString('utf-8')), 0); // テキストとしてコールバック
    }
  } catch (e) {
    if (onError) onError(e); // エラーコールバック
    else console.error(e); // コンソールにエラー出力
  }
  return {}; // ダミーリクエストオブジェクト
};
// TextureLoaderのスタブ
THREE.TextureLoader.prototype.load = function () { return new THREE.Texture(); };

// FBXLoaderの動的インポート
const { FBXLoader } = await import('three/examples/jsm/loaders/FBXLoader.js');

// ── ユーティリティ関数 ──

// "mixamorig"プレフィックスを除去
function cleanBoneName(name) {
  return name.replace(/^mixamorig/, '');
}

// 小数点3桁に丸める関数
const r = (v) => Math.round(v * 1000) / 1000;
// ラジアン→度変換定数
const rad2deg = 180 / Math.PI;

/**
 * FBXファイルを分析するメイン関数
 * FBXの各ボーンの回転データを取得し、motion.jsonとの一致を検証する
 * @param {string} fbxPath - FBXファイルのパス
 */
async function analyze(fbxPath) {
  console.log(`Loading: ${fbxPath}`); // ファイルパスを表示
  const loader = new FBXLoader(); // FBXローダーのインスタンス
  const group = await new Promise((resolve, reject) => {
    loader.load(fbxPath, resolve, undefined, reject); // FBXを非同期読み込み
  });

  // モデルにメッシュがあるかチェック（スケルトンのみではないか）
  let hasMesh = false;
  group.traverse((obj) => { if (obj.isMesh) hasMesh = true; }); // メッシュの有無を確認
  console.log(`Has mesh: ${hasMesh}`); // メッシュ有無を表示
  console.log(`Children: ${group.children.length}`); // 子オブジェクト数を表示

  // ── ボーンの収集 ──
  const allBones = []; // 全ボーンの配列
  const boneByName = {}; // ボーン名→ボーンオブジェクトのマップ
  group.traverse((obj) => {
    if (obj.isBone) {
      allBones.push(obj); // ボーンを配列に追加
      boneByName[cleanBoneName(obj.name)] = obj; // マップに登録
    }
  });
  console.log(`Bones: ${allBones.length}`); // ボーン数を表示

  // アニメーションクリップの取得と検証
  const clips = group.animations; // アニメーションクリップ配列
  if (!clips || clips.length === 0) {
    console.error('No animations!'); // アニメーションがない場合エラー
    return;
  }

  const clip = clips[0]; // 最初のクリップを使用
  console.log(`Clip: "${clip.name}", duration: ${clip.duration.toFixed(3)}s`); // クリップ情報を表示

  // アニメーションミキサーの設定
  const mixer = new THREE.AnimationMixer(group); // ミキサー作成
  const action = mixer.clipAction(clip); // アクション作成
  action.play(); // 再生開始

  // ── 分析対象の主要ボーン一覧 ──
  const keyBones = ['Hips', 'Spine', 'Spine1', 'Spine2', 'Neck', 'Head',
    'LeftShoulder', 'LeftArm', 'LeftForeArm', 'LeftHand',
    'RightShoulder', 'RightArm', 'RightForeArm', 'RightHand',
    'LeftUpLeg', 'LeftLeg', 'LeftFoot', 'LeftToeBase',
    'RightUpLeg', 'RightLeg', 'RightFoot', 'RightToeBase'];

  // ── レストポーズ（フレーム0）のキャプチャ ──
  mixer.setTime(0); // フレーム0に設定
  group.updateMatrixWorld(true); // ワールド行列更新

  console.log('\n=== REST POSE (Frame 0) ===');
  console.log('Bone               | WorldPos (x,y,z)          | WorldQuat (x,y,z,w)              | LocalQuat (x,y,z,w)');
  console.log('-'.repeat(130));

  // レストポーズのデータを保存する辞書
  const restWorldPos = {}; // ワールド位置
  const restWorldQuat = {}; // ワールドクォータニオン
  const restLocalQuat = {}; // ローカルクォータニオン

  // 各ボーンのレストポーズデータを取得して表示
  for (const name of keyBones) {
    const bone = boneByName[name]; // ボーンオブジェクト
    if (!bone) continue; // 存在しなければスキップ

    const wp = new THREE.Vector3(); // ワールド位置用ベクトル
    const wq = new THREE.Quaternion(); // ワールドクォータニオン用
    bone.getWorldPosition(wp); // ワールド位置を取得
    bone.getWorldQuaternion(wq); // ワールドクォータニオンを取得
    const lq = bone.quaternion.clone(); // ローカルクォータニオンをコピー

    restWorldPos[name] = wp.clone(); // ワールド位置を保存
    restWorldQuat[name] = wq.clone(); // ワールドクォータニオンを保存
    restLocalQuat[name] = lq.clone(); // ローカルクォータニオンを保存

    // データを整形して表示
    console.log(`${name.padEnd(20)}| ${r(wp.x)}, ${r(wp.y)}, ${r(wp.z)}`.padEnd(50) +
      `| ${r(wq.x)}, ${r(wq.y)}, ${r(wq.z)}, ${r(wq.w)}`.padEnd(40) +
      `| ${r(lq.x)}, ${r(lq.y)}, ${r(lq.z)}, ${r(lq.w)}`);
  }

  // ── 特定フレームの分析 ──
  const framesToCheck = [30, 67, 100]; // 分析対象のフレーム番号
  for (const frameIdx of framesToCheck) {
    const time = frameIdx / 30; // フレーム番号を秒に変換
    mixer.setTime(time); // アニメーション時刻を設定
    group.updateMatrixWorld(true); // ワールド行列を更新

    console.log(`\n=== FRAME ${frameIdx} (t=${time.toFixed(3)}s) ===`);
    console.log('Bone               | WorldDeltaQ (x,y,z,w)             | WorldDeltaEuler (X°,Y°,Z°)     | LocalQ (x,y,z,w)                | DeltaPos (x,y,z)');
    console.log('-'.repeat(170));

    // 各ボーンのアニメーションデータを取得して比較
    for (const name of keyBones) {
      const bone = boneByName[name]; // ボーンオブジェクト
      if (!bone) continue; // 存在しなければスキップ

      const wp = new THREE.Vector3(); // ワールド位置
      const wq = new THREE.Quaternion(); // ワールドクォータニオン
      bone.getWorldPosition(wp); // ワールド位置を取得
      bone.getWorldQuaternion(wq); // ワールドクォータニオンを取得
      const lq = bone.quaternion.clone(); // ローカルクォータニオンをコピー

      // ワールドデルタの計算: restWorldQuat⁻¹ × currentWorldQuat
      const dq = restWorldQuat[name].clone().invert().multiply(wq);
      // 位置デルタの計算
      const dp = wp.clone().sub(restWorldPos[name]);

      // デルタをオイラー角に変換（可読性のため）
      const euler = new THREE.Euler().setFromQuaternion(dq, 'XYZ');
      const ex = r(euler.x * rad2deg); // X軸回転（度）
      const ey = r(euler.y * rad2deg); // Y軸回転（度）
      const ez = r(euler.z * rad2deg); // Z軸回転（度）

      // 結果を整形して表示
      console.log(
        `${name.padEnd(20)}` +
        `| ${r(dq.x)}, ${r(dq.y)}, ${r(dq.z)}, ${r(dq.w)}`.padEnd(38) +
        `| X:${ex}° Y:${ey}° Z:${ez}°`.padEnd(35) +
        `| ${r(lq.x)}, ${r(lq.y)}, ${r(lq.z)}, ${r(lq.w)}`.padEnd(38) +
        `| ${r(dp.x)}, ${r(dp.y)}, ${r(dp.z)}`
      );
    }
  }

  // ========================================================================
  // motion.jsonとの比較
  // ========================================================================
  console.log('\n\n========================================');
  console.log('=== COMPARISON WITH motion.json ===');
  console.log('========================================');

  // FBXファイル名からmotion.jsonのパスを推定（"(1)"を除去して拡張子を変更）
  const motionPath = fbxPath.replace(/\s*\(1\)/, '').replace(/\.fbx$/i, '.motion.json');
  if (!fs.existsSync(motionPath)) {
    console.log(`Motion JSON not found: ${motionPath}`); // ファイルが見つからない場合
    return;
  }

  // motion.jsonデータの読み込み
  const motionData = JSON.parse(fs.readFileSync(motionPath, 'utf-8'));
  console.log(`Motion JSON: ${motionData.frameCount} frames, ${motionData.fps} fps`); // メタ情報を表示

  // 各フレームでFBXのワールドデルタとmotion.jsonのdqを比較
  for (const frameIdx of framesToCheck) {
    if (frameIdx >= motionData.frameCount) continue; // フレーム範囲外ならスキップ
    const time = frameIdx / 30; // フレーム番号を秒に変換
    mixer.setTime(time); // アニメーション時刻を設定
    group.updateMatrixWorld(true); // ワールド行列を更新

    const motionFrame = motionData.frames[frameIdx]; // モーションデータのフレーム

    console.log(`\n--- Frame ${frameIdx} ---`);
    console.log('Bone               | FBX WorldDeltaQ             | JSON dq                        | Match?');
    console.log('-'.repeat(110));

    // 各ボーンについてFBXとmotion.jsonを比較
    for (const name of keyBones) {
      const bone = boneByName[name]; // ボーンオブジェクト
      if (!bone || !motionFrame[name]) continue; // データがなければスキップ

      const wq = new THREE.Quaternion(); // ワールドクォータニオン
      bone.getWorldQuaternion(wq); // ワールドクォータニオンを取得
      // ワールドデルタを計算
      const dq = restWorldQuat[name].clone().invert().multiply(wq);

      const jsonDQ = motionFrame[name].dq; // motion.jsonのデルタクォータニオン

      // 直接比較: 各成分の差が0.01未満なら一致
      const match = Math.abs(dq.x - jsonDQ[0]) < 0.01 &&
                    Math.abs(dq.y - jsonDQ[1]) < 0.01 &&
                    Math.abs(dq.z - jsonDQ[2]) < 0.01 &&
                    Math.abs(dq.w - jsonDQ[3]) < 0.01;

      // 符号反転で比較（クォータニオンqと-qは同じ回転を表す）
      const matchNeg = Math.abs(dq.x + jsonDQ[0]) < 0.01 &&
                       Math.abs(dq.y + jsonDQ[1]) < 0.01 &&
                       Math.abs(dq.z + jsonDQ[2]) < 0.01 &&
                       Math.abs(dq.w + jsonDQ[3]) < 0.01;

      // 一致状態の判定
      const status = match ? 'OK' : matchNeg ? 'OK(neg)' : 'MISMATCH';

      // 結果を表示
      console.log(
        `${name.padEnd(20)}` +
        `| ${r(dq.x)}, ${r(dq.y)}, ${r(dq.z)}, ${r(dq.w)}`.padEnd(32) +
        `| ${jsonDQ.map(v => r(v)).join(', ')}`.padEnd(35) +
        `| ${status}`
      );
    }
  }

  // ========================================================================
  // ビューア変換の分析
  // ========================================================================
  console.log('\n\n========================================');
  console.log('=== VIEWER CONVERSION ANALYSIS ===');
  console.log('========================================');
  console.log('Current: toViewerQuat(dq) = (-dqx, -dqy, dqz, dqw)'); // 現在の変換式
  console.log('');

  // フレーム67で回転方向を検証
  const frameIdx = 67;
  const time = frameIdx / 30; // 秒に変換
  mixer.setTime(time); // 時刻設定
  group.updateMatrixWorld(true); // 行列更新

  console.log(`Frame ${frameIdx} - Checking rotation directions:`);
  // 主要ボーンについて異なるクォータニオン変換式を比較
  for (const name of ['Hips', 'LeftArm', 'RightArm', 'LeftUpLeg', 'RightUpLeg', 'Head']) {
    const bone = boneByName[name]; // ボーンオブジェクト
    if (!bone) continue; // 存在しなければスキップ

    const wq = new THREE.Quaternion(); // ワールドクォータニオン
    bone.getWorldQuaternion(wq); // 取得
    // ワールドデルタを計算
    const dq = restWorldQuat[name].clone().invert().multiply(wq);

    // オイラー角に変換
    const euler = new THREE.Euler().setFromQuaternion(dq, 'XYZ');

    // ビューア座標系の説明:
    // ビューア: X=右, Y=上(ボクセルZ), Z=-奥行き(負のボクセルY)
    // Three.js: X=右, Y=上, Z=カメラ方向
    // マッピング: threeX→viewerX, threeY→viewerY, threeZ→-viewerZ

    // 4つの異なるクォータニオン変換式をテスト
    const conv1 = { x: -dq.x, y: -dq.y, z: dq.z, w: dq.w };   // 現在の変換: x,y反転
    const conv2 = { x: dq.x, y: dq.y, z: -dq.z, w: dq.w };    // zのみ反転
    const conv3 = { x: dq.x, y: dq.y, z: -dq.z, w: -dq.w };   // z,w反転
    const conv4 = { x: -dq.x, y: dq.y, z: dq.z, w: dq.w };    // xのみ反転

    // 各変換結果を表示して比較
    console.log(`\n${name}:`);
    console.log(`  Three.js euler: X:${r(euler.x*rad2deg)}° Y:${r(euler.y*rad2deg)}° Z:${r(euler.z*rad2deg)}°`);
    console.log(`  Three.js dq: (${r(dq.x)}, ${r(dq.y)}, ${r(dq.z)}, ${r(dq.w)})`);
    console.log(`  Conv1 (-x,-y,z,w):  (${r(conv1.x)}, ${r(conv1.y)}, ${r(conv1.z)}, ${r(conv1.w)})`);
    console.log(`  Conv2 (x,y,-z,w):   (${r(conv2.x)}, ${r(conv2.y)}, ${r(conv2.z)}, ${r(conv2.w)})`);
    console.log(`  Conv3 (x,y,-z,-w):  (${r(conv3.x)}, ${r(conv3.y)}, ${r(conv3.z)}, ${r(conv3.w)})`);
    console.log(`  Conv4 (-x,y,z,w):   (${r(conv4.x)}, ${r(conv4.y)}, ${r(conv4.z)}, ${r(conv4.w)})`);
  }

  // ── クリーンアップ ──
  mixer.stopAllAction(); // アニメーション停止
  mixer.uncacheRoot(group); // キャッシュクリア
}

// ── メイン実行 ──
const __dirname = path.dirname(fileURLToPath(import.meta.url)); // 現在のスクリプトのディレクトリ
const fbxFile = path.join(__dirname, '..', 'public', 'models', 'character-motion', 'Hip Hop Dancing (1).fbx'); // FBXファイルパス
analyze(path.resolve(fbxFile)); // 分析を実行
