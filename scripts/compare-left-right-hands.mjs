/**
 * FBXの右手の軌跡とビューアの左手の軌跡、
 * FBXの左手とビューアの右手を比較するスクリプト。
 *
 * FBXのRightHandがビューアのLeftHandと一致すれば、左右の入れ替わりが証明される。
 *
 * 座標マッピング: viewer = (-Three_x, Three_y, -Three_z)
 *
 * Compare FBX RIGHT hand trajectory with viewer LEFT hand trajectory
 * and FBX LEFT hand with viewer RIGHT hand.
 *
 * If FBX RightHand matches viewer LeftHand, it proves a left/right swap.
 *
 * Coordinate mapping: viewer = (-Three_x, Three_y, -Three_z)
 */

// ── Three.js Node.jsポリフィル ──
import fs from 'fs'; // ファイルシステムモジュール
import path from 'path'; // パス操作モジュール
import { fileURLToPath } from 'url'; // URL→ファイルパス変換
import { Blob } from 'buffer'; // Blobポリフィル

global.Blob = Blob; // グローバルBlobを設定
global.self = global; // selfをグローバルに設定（ブラウザAPI互換）
global.window = global; // windowをグローバルに設定（ブラウザAPI互換）
// documentオブジェクトのポリフィル（DOM操作のスタブ）
global.document = {
  // XML名前空間付き要素生成のスタブ
  createElementNS: (_ns, tag) => {
    if (tag === 'img') return { set src(_v) {}, addEventListener() {} }; // img要素のスタブ
    return { style: {} }; // その他の要素のスタブ
  },
  // 通常の要素生成のスタブ
  createElement: (tag) => {
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
// fetchのポリフィル（ローカルファイルを読み込む）
if (!global.fetch) {
  global.fetch = async (url) => {
    const filePath = url.startsWith('file://') ? fileURLToPath(url) : url; // file://プロトコルを処理
    const buf = fs.readFileSync(filePath); // ファイルを同期的に読み込み
    return {
      ok: true, // レスポンス成功
      arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), // ArrayBufferとして返す
      text: async () => buf.toString('utf-8'), // テキストとして返す
      json: async () => JSON.parse(buf.toString('utf-8')), // JSONとして返す
    };
  };
}

// Three.jsライブラリの動的インポート
const THREE = await import('three');
// FileLoaderのloadメソッドをNode.js用にオーバーライド
THREE.FileLoader.prototype.load = function (url, onLoad, _onProgress, onError) {
  try {
    const filePath = path.resolve(url); // 絶対パスに変換
    const buf = fs.readFileSync(filePath); // ファイルを同期的に読み込み
    const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength); // ArrayBufferに変換
    if (this.responseType === 'arraybuffer') setTimeout(() => onLoad(ab), 0); // バイナリデータとしてコールバック
    else setTimeout(() => onLoad(buf.toString('utf-8')), 0); // テキストデータとしてコールバック
  } catch (e) { if (onError) onError(e); else console.error(e); } // エラーハンドリング
  return {}; // ダミーのリクエストオブジェクトを返す
};
// TextureLoaderのスタブ（Node.jsではテクスチャ読み込み不要）
THREE.TextureLoader.prototype.load = function () { return new THREE.Texture(); };
// FBXLoaderの動的インポート
const { FBXLoader } = await import('three/examples/jsm/loaders/FBXLoader.js');

// ── ユーティリティ関数 ──

// ボーン名から"mixamorig"プレフィックスを除去する関数
function cleanBoneName(name) { return name.replace(/^mixamorig/, ''); }
// 小数点2桁に丸める関数
const r = (v) => Math.round(v * 100) / 100;

// ── ファイルパスの設定 ──
const __dirname = path.dirname(fileURLToPath(import.meta.url)); // 現在のスクリプトのディレクトリ
const fbxPath = path.join(__dirname, '..', 'public', 'models', 'character-motion', 'Hip Hop Dancing (1).fbx'); // FBXファイルパス（モデル付き）
const motionPath = path.join(__dirname, '..', 'public', 'models', 'character-motion', 'Hip Hop Dancing.motion.json'); // モーションJSONファイルパス

// ── FBXファイルの読み込み ──
const loader = new FBXLoader(); // FBXローダーのインスタンス
const group = await new Promise((resolve, reject) => {
  loader.load(path.resolve(fbxPath), resolve, undefined, reject); // FBXファイルをPromiseでラップして読み込み
});

// ボーン名→ボーンオブジェクトのマップを作成
const boneByName = {};
group.traverse((obj) => { if (obj.isBone) boneByName[cleanBoneName(obj.name)] = obj; }); // 全ボーンを走査してマップに登録

// ── アニメーションの設定 ──
const clip = group.animations[0]; // 最初のアニメーションクリップを取得
const mixer = new THREE.AnimationMixer(group); // アニメーションミキサーを作成
const action = mixer.clipAction(clip); // アクションを作成
action.play(); // アニメーション再生開始

// モーションJSONデータの読み込み
const motionData = JSON.parse(fs.readFileSync(path.resolve(motionPath), 'utf-8'));

// ── レストポーズの取得 ──
mixer.setTime(0); // フレーム0（レストポーズ）に設定
group.updateMatrixWorld(true); // ワールド行列を更新

// 主要ボーンのレストポーズでのワールド位置を記録
const restWorldPos = {};
for (const name of ['Hips', 'LeftHand', 'RightHand', 'LeftFoot', 'RightFoot']) {
  const bone = boneByName[name]; // ボーンオブジェクトを取得
  if (bone) {
    const wp = new THREE.Vector3(); // ワールド位置用ベクトル
    bone.getWorldPosition(wp); // ワールド位置を取得
    restWorldPos[name] = wp.clone(); // クローンして保存
  }
}

// ── ビューア座標への変換関数 ──
// Three.js座標 → ビューア座標: X反転、Y維持、Z反転
const toViewerPos = (p) => ({ x: -p.x, y: p.y, z: -p.z });

// ── スクリーン上の左右とFBXボーン名の対応関係 ──
// スクリーンの右 = ビューアの-x方向、スクリーンの左 = ビューアの+x方向
// FBXの"Left"（Three_xが正）→ viewer_x = -Three_x（負）→ スクリーン右側
// FBXの"Right"（Three_xが負）→ viewer_x = -Three_x（正）→ スクリーン左側

// ── レストポーズでの手の位置を表示 ──
console.log('=== REST POSE HAND POSITIONS ===');
console.log('(Shows which FBX hand maps to which screen side)\n');

// 各ボーンのレストポーズ位置をビューア座標に変換して表示
for (const name of ['LeftHand', 'RightHand', 'Hips']) {
  const p = restWorldPos[name]; // Three.jsでのワールド位置
  const vp = toViewerPos(p); // ビューア座標に変換
  const screenSide = vp.x > 0 ? 'Screen LEFT' : 'Screen RIGHT'; // スクリーン上の左右を判定
  console.log(`FBX ${name.padEnd(12)} Three: (${r(p.x)}, ${r(p.y)}, ${r(p.z)}) → Viewer: (${r(vp.x)}, ${r(vp.y)}, ${r(vp.z)}) → ${screenSide}`);
}

// ── 座標マッピングの説明を表示 ──
console.log('\n=== KEY INSIGHT ===');
console.log('FBX LeftHand has positive Three_x → Viewer: negative x → Screen RIGHT');
console.log('FBX RightHand has negative Three_x → Viewer: positive x → Screen LEFT');
console.log('So FBX "Left" appears on screen RIGHT, FBX "Right" appears on screen LEFT');
console.log('This is EXPECTED for a character facing the camera (mirrored).\n');

// ── 重要な検証: motion.jsonのボーンラベルが正しいかチェック ──
// motion.jsonの"LeftHand"がFBXの"LeftHand"と一致するか"RightHand"と一致するか？

console.log('=== TRAJECTORY COMPARISON: motion.json LeftHand vs FBX hands ===');
console.log('If motion.json "LeftHand" matches FBX "LeftHand" → names are consistent');
console.log('If motion.json "LeftHand" matches FBX "RightHand" → LEFT/RIGHT SWAP!\n');

// テーブルヘッダーの表示
console.log('Frame | FBX LeftHand delta (viewer)    | FBX RightHand delta (viewer)   | motion.json LeftHand dq matches?');
console.log('-'.repeat(120));

// 10フレームごとにサンプリング
const sampleFrames = [];
for (let f = 0; f < motionData.frameCount; f += 10) sampleFrames.push(f);

// ── 各フレームでの軌跡比較 ──
for (const frameIdx of sampleFrames) {
  const time = frameIdx / 30; // フレーム番号を秒に変換（30fps）
  mixer.setTime(time); // アニメーション時刻を設定
  group.updateMatrixWorld(true); // ワールド行列を更新

  // FBXでの各手の位置を取得
  const fbxLeftHand = new THREE.Vector3(); // 左手ワールド位置
  const fbxRightHand = new THREE.Vector3(); // 右手ワールド位置
  const fbxHips = new THREE.Vector3(); // 腰ワールド位置
  boneByName['LeftHand']?.getWorldPosition(fbxLeftHand); // 左手のワールド位置を取得
  boneByName['RightHand']?.getWorldPosition(fbxRightHand); // 右手のワールド位置を取得
  boneByName['Hips']?.getWorldPosition(fbxHips); // 腰のワールド位置を取得

  // レストポーズからの変位をビューア座標に変換
  const leftDelta = toViewerPos(fbxLeftHand.clone().sub(restWorldPos['LeftHand'])); // 左手の変位
  const rightDelta = toViewerPos(fbxRightHand.clone().sub(restWorldPos['RightHand'])); // 右手の変位
  const hipsDelta = toViewerPos(fbxHips.clone().sub(restWorldPos['Hips'])); // 腰の変位

  // 腰に対する相対的なX方向の変位（体に対する手の動き）
  const leftRelX = r(leftDelta.x - hipsDelta.x); // 左手の腰相対X変位
  const rightRelX = r(rightDelta.x - hipsDelta.x); // 右手の腰相対X変位

  // motion.jsonのデータを取得
  const motionFrame = motionData.frames[frameIdx]; // 該当フレームのモーションデータ
  const motionLeft = motionFrame?.['LeftHand']; // motion.jsonの左手データ
  const motionRight = motionFrame?.['RightHand']; // motion.jsonの右手データ

  // スクリーン上での移動方向を判定
  const leftDir = leftRelX > 0.5 ? 'L→ScrnLEFT' : leftRelX < -0.5 ? 'L→ScrnRIGHT' : 'L→center'; // 左手の方向
  const rightDir = rightRelX > 0.5 ? 'R→ScrnLEFT' : rightRelX < -0.5 ? 'R→ScrnRIGHT' : 'R→center'; // 右手の方向

  // 結果を表示
  console.log(
    `${String(frameIdx).padStart(5)} ` +
    `| X:${r(leftDelta.x).toString().padStart(7)} relX:${leftRelX.toString().padStart(6)} ${leftDir.padEnd(12)}` +
    `| X:${r(rightDelta.x).toString().padStart(7)} relX:${rightRelX.toString().padStart(6)} ${rightDir.padEnd(12)}` +
    `| L_dq:(${motionLeft ? motionLeft.dq.map(v => r(v)).join(',') : 'N/A'})`
  );
}

// ========================================================================
// 決定的テスト: FBX RightHandのワールドクォータニオンデルタと
// motion.json LeftHandのワールドクォータニオンデルタを比較（逆も同様）
// ========================================================================

console.log('\n\n=== DEFINITIVE TEST: FBX bone world delta vs motion.json bone data ===');
console.log('Compare world quaternion deltas to see if names match or are swapped\n');

// レストポーズでの各ボーンのワールドクォータニオンを記録
const restWorldQuat = {};
mixer.setTime(0); // レストポーズに戻す
group.updateMatrixWorld(true); // ワールド行列を更新
// 腕チェーンのボーンのワールドクォータニオンを取得
for (const name of ['LeftShoulder', 'LeftArm', 'LeftForeArm', 'LeftHand',
                     'RightShoulder', 'RightArm', 'RightForeArm', 'RightHand']) {
  const bone = boneByName[name]; // ボーンオブジェクトを取得
  if (bone) {
    const wq = new THREE.Quaternion(); // ワールドクォータニオン用
    bone.getWorldQuaternion(wq); // ワールドクォータニオンを取得
    restWorldQuat[name] = wq.clone(); // クローンして保存
  }
}

// テスト用フレーム
const testFrames = [20, 40, 60, 67, 80, 100];
// motion.jsonのdqをビューア空間のクォータニオンに変換する関数
const toViewerQuat = (dq) => new THREE.Quaternion(-dq[0], dq[1], -dq[2], dq[3]);

// ── 各フレームでクォータニオンの一致を検証 ──
for (const frameIdx of testFrames) {
  if (frameIdx >= motionData.frameCount) continue; // フレーム範囲外ならスキップ
  const time = frameIdx / 30; // フレーム番号を秒に変換
  mixer.setTime(time); // アニメーション時刻を設定
  group.updateMatrixWorld(true); // ワールド行列を更新

  const motionFrame = motionData.frames[frameIdx]; // モーションデータのフレーム

  console.log(`--- Frame ${frameIdx} ---`);
  console.log('                    | FBX→viewer delta quat              | motion.json→viewer delta quat     | Match?');

  // 左手と右手のそれぞれについて比較
  for (const fbxName of ['LeftHand', 'RightHand']) {
    const bone = boneByName[fbxName]; // ボーンオブジェクトを取得
    if (!bone || !restWorldQuat[fbxName]) continue; // データがなければスキップ
    const wq = new THREE.Quaternion(); // ワールドクォータニオン取得用
    bone.getWorldQuaternion(wq); // 現在フレームのワールドクォータニオンを取得
    // レストポーズからのデルタクォータニオンを計算: restInv × current
    const fbxDelta = restWorldQuat[fbxName].clone().invert().multiply(wq);
    // Three.js空間からビューア空間に変換
    const fbxViewer = new THREE.Quaternion(-fbxDelta.x, fbxDelta.y, -fbxDelta.z, fbxDelta.w);

    // motion.jsonの同名ボーンと比較
    const motionSame = motionFrame?.[fbxName]; // 同名のモーションデータ
    // motion.jsonの反対名ボーンと比較
    const oppName = fbxName === 'LeftHand' ? 'RightHand' : 'LeftHand'; // 反対側のボーン名
    const motionOpp = motionFrame?.[oppName]; // 反対側のモーションデータ

    // クォータニオンの内積で類似度を計算
    let sameDot = 0, oppDot = 0; // 同名・反対名との内積
    if (motionSame) {
      const mqSame = toViewerQuat(motionSame.dq); // 同名のビューア空間クォータニオン
      // 内積の絶対値（クォータニオンの類似度）
      sameDot = Math.abs(fbxViewer.x*mqSame.x + fbxViewer.y*mqSame.y +
                         fbxViewer.z*mqSame.z + fbxViewer.w*mqSame.w);
    }
    if (motionOpp) {
      const mqOpp = toViewerQuat(motionOpp.dq); // 反対名のビューア空間クォータニオン
      // 内積の絶対値（クォータニオンの類似度）
      oppDot = Math.abs(fbxViewer.x*mqOpp.x + fbxViewer.y*mqOpp.y +
                        fbxViewer.z*mqOpp.z + fbxViewer.w*mqOpp.w);
    }

    // 角度誤差を度数で計算（クォータニオン距離）
    const sameErr = r(2 * Math.acos(Math.min(1, sameDot)) * 180 / Math.PI); // 同名との角度誤差
    const oppErr = r(2 * Math.acos(Math.min(1, oppDot)) * 180 / Math.PI); // 反対名との角度誤差

    // 2度未満なら一致と判定
    const matchesSame = sameErr < 2; // 同名と一致するか
    const matchesOpp = oppErr < 2; // 反対名と一致するか

    // 判定結果を決定
    let verdict;
    if (matchesSame && !matchesOpp) verdict = `SAME name OK (err=${sameErr}°)`; // 同名が一致 → 正常
    else if (!matchesSame && matchesOpp) verdict = `*** SWAPPED! *** (opp err=${oppErr}°, same err=${sameErr}°)`; // 反対名が一致 → 左右入替！
    else if (matchesSame && matchesOpp) verdict = `Both match?? (same=${sameErr}°, opp=${oppErr}°)`; // 両方一致 → 不明
    else verdict = `Neither matches (same=${sameErr}°, opp=${oppErr}°)`; // どちらも不一致

    // 結果を表示
    console.log(
      `FBX ${fbxName.padEnd(15)}` +
      `| (${r(fbxViewer.x)}, ${r(fbxViewer.y)}, ${r(fbxViewer.z)}, ${r(fbxViewer.w)})`.padEnd(40) +
      `| same=${sameErr}° opp=${oppErr}°`.padEnd(40) +
      `| ${verdict}`
    );
  }
  console.log('');
}

// ========================================================================
// 位置の比較: FBX RightHandの位置 vs ビューア LeftHandの位置
// ========================================================================
console.log('\n=== POSITION COMPARISON: FBX hand positions in viewer coords ===');
console.log('If the viewer shows "LeftHand" where FBX RightHand actually is, we have a swap\n');

// テーブルヘッダーの表示
console.log('Frame | FBX LeftHand viewer pos         | FBX RightHand viewer pos        | FBX Left screen side | FBX Right screen side');
console.log('-'.repeat(130));

// 各フレームでの手の位置をビューア座標で比較
for (const frameIdx of [0, 20, 40, 60, 67, 80, 100]) {
  if (frameIdx >= motionData.frameCount) continue; // フレーム範囲外ならスキップ
  const time = frameIdx / 30; // フレーム番号を秒に変換
  mixer.setTime(time); // アニメーション時刻を設定
  group.updateMatrixWorld(true); // ワールド行列を更新

  // 各手のワールド位置を取得
  const leftP = new THREE.Vector3(); // 左手位置用
  const rightP = new THREE.Vector3(); // 右手位置用
  boneByName['LeftHand']?.getWorldPosition(leftP); // 左手のワールド位置
  boneByName['RightHand']?.getWorldPosition(rightP); // 右手のワールド位置

  // ビューア座標に変換
  const vLeft = toViewerPos(leftP); // 左手のビューア座標
  const vRight = toViewerPos(rightP); // 右手のビューア座標

  // スクリーン上の左右を判定: ビューアの正のx = スクリーン左（キャラの右手側）
  const leftScreen = vLeft.x > 0 ? 'Screen LEFT' : 'Screen RIGHT'; // 左手のスクリーン位置
  const rightScreen = vRight.x > 0 ? 'Screen LEFT' : 'Screen RIGHT'; // 右手のスクリーン位置

  // 結果を表示
  console.log(
    `${String(frameIdx).padStart(5)} ` +
    `| (${r(vLeft.x).toString().padStart(6)}, ${r(vLeft.y).toString().padStart(6)}, ${r(vLeft.z).toString().padStart(6)})`.padEnd(34) +
    `| (${r(vRight.x).toString().padStart(6)}, ${r(vRight.y).toString().padStart(6)}, ${r(vRight.z).toString().padStart(6)})`.padEnd(34) +
    `| ${leftScreen.padEnd(21)}| ${rightScreen}`
  );
}

// ── 最終まとめ ──
console.log('\n=== SUMMARY ===');
console.log('In FBX (Three.js), LeftHand = character\'s actual left hand'); // FBXではLeftHandがキャラの実際の左手
console.log('After conversion to viewer coords: viewer_x = -Three_x'); // ビューア変換後: viewer_x = -Three_x
console.log('So FBX LeftHand (positive Three_x) → negative viewer_x → Screen RIGHT'); // FBX左手 → スクリーン右
console.log('This means: what the VIEWER shows on Screen LEFT should be the FBX RightHand'); // ビューアのスクリーン左はFBX右手であるべき
console.log('If motion.json "LeftHand" data actually drives the Screen LEFT bone,'); // motion.jsonの"LeftHand"がスクリーン左を制御している場合
console.log('then it\'s using LEFT name for what is visually the RIGHT hand → LEFT/RIGHT SWAP!'); // 左の名前で視覚的に右手を使っている → 左右入替！

// ── クリーンアップ ──
mixer.stopAllAction(); // アニメーション停止
mixer.uncacheRoot(group); // キャッシュをクリア
