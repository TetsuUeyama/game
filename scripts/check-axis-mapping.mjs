/**
 * FBX（Three.js）とボクセルビューア間の実際の軸マッピングを確認するスクリプト。
 * X軸が反転しているかどうかを判定する。
 */

import fs from 'fs';       // ファイルシステムモジュール
import path from 'path';   // パス操作モジュール
import { fileURLToPath } from 'url';  // URL→ファイルパス変換
import { Blob } from 'buffer';        // Blobポリフィル

// ── Three.jsをNode.js環境で動作させるためのブラウザAPIポリフィル ──
global.Blob = Blob;
global.self = global;
global.window = global;
global.document = {
  // SVG/HTML要素作成のスタブ
  createElementNS: (_ns, tag) => {
    if (tag === 'img') return { set src(_v) {}, addEventListener() {} };
    return { style: {} };
  },
  createElement: (tag) => {
    if (tag === 'canvas') return { getContext: () => null, style: {} };
    return { style: {} };
  },
};
// navigatorオブジェクトのポリフィル
try { global.navigator = { userAgent: 'node', platform: 'node' }; } catch {
  Object.defineProperty(global, 'navigator', { value: { userAgent: 'node', platform: 'node' }, writable: true, configurable: true });
}
// URL APIのポリフィル
global.URL = global.URL || {};
global.URL.createObjectURL = global.URL.createObjectURL || (() => '');
global.URL.revokeObjectURL = global.URL.revokeObjectURL || (() => '');
// fetchのポリフィル（ローカルファイル読み込み用）
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

// Three.jsコアモジュールのインポート
const THREE = await import('three');
// FileLoaderをNode.js用にオーバーライド（ファイルシステムから読み込み）
THREE.FileLoader.prototype.load = function (url, onLoad, _onProgress, onError) {
  try {
    const filePath = path.resolve(url);
    const buf = fs.readFileSync(filePath);
    const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
    if (this.responseType === 'arraybuffer') {
      setTimeout(() => onLoad(ab), 0);  // ArrayBufferとして返す
    } else {
      setTimeout(() => onLoad(buf.toString('utf-8')), 0);  // テキストとして返す
    }
  } catch (e) {
    if (onError) onError(e);
    else console.error(e);
  }
  return {};
};
// TextureLoaderのスタブ（ダミーテクスチャを返す）
THREE.TextureLoader.prototype.load = function () { return new THREE.Texture(); };

// FBXLoaderのインポート
const { FBXLoader } = await import('three/examples/jsm/loaders/FBXLoader.js');
// ボーン名からmixamorigプレフィックスを除去するヘルパー
function cleanBoneName(name) { return name.replace(/^mixamorig/, ''); }
// 数値を小数点3桁に丸めるヘルパー
const r = (v) => Math.round(v * 1000) / 1000;

// スクリプトディレクトリとFBXファイルパスの設定
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fbxPath = path.join(__dirname, '..', 'public', 'models', 'character-motion', 'Hip Hop Dancing (1).fbx');

// FBXファイルを読み込み
const loader = new FBXLoader();
const group = await new Promise((resolve, reject) => {
  loader.load(path.resolve(fbxPath), resolve, undefined, reject);
});

// ボーン名→ボーンオブジェクトのマップを構築
const boneByName = {};
group.traverse((obj) => { if (obj.isBone) boneByName[cleanBoneName(obj.name)] = obj; });

// アニメーションクリップを取得してミキサーを設定
const clip = group.animations[0];
const mixer = new THREE.AnimationMixer(group);
const action = mixer.clipAction(clip);
action.play();
mixer.setTime(0);           // レストポーズ（フレーム0）に設定
group.updateMatrixWorld(true);  // ワールド行列を更新

// === FBXレストポーズでのボーン位置を表示 ===
console.log('=== FBX REST POSE BONE POSITIONS (Three.js world space) ===');
console.log('Three.js: X=right, Y=up, Z=toward camera');
console.log('');

// 確認するボーンのリスト
const bones = ['Hips', 'Head', 'LeftArm', 'RightArm', 'LeftHand', 'RightHand',
               'LeftUpLeg', 'RightUpLeg', 'LeftFoot', 'RightFoot'];

// 各ボーンのワールド位置を表示
for (const name of bones) {
  const bone = boneByName[name];
  if (!bone) continue;
  const wp = new THREE.Vector3();
  bone.getWorldPosition(wp);  // ワールド位置を取得
  console.log(`${name.padEnd(15)} X: ${r(wp.x).toString().padStart(8)}  Y: ${r(wp.y).toString().padStart(8)}  Z: ${r(wp.z).toString().padStart(8)}`);
}

// === 軸マッピングの分析 ===
console.log('\n=== ANALYSIS ===');
const leftHand = new THREE.Vector3();
const rightHand = new THREE.Vector3();
boneByName['LeftHand']?.getWorldPosition(leftHand);   // 左手のワールド位置
boneByName['RightHand']?.getWorldPosition(rightHand);  // 右手のワールド位置

// FBX空間での左右の手のX座標の符号を確認
console.log(`LeftHand X:  ${r(leftHand.x)} (${leftHand.x > 0 ? 'POSITIVE' : 'NEGATIVE'})`);
console.log(`RightHand X: ${r(rightHand.x)} (${rightHand.x > 0 ? 'POSITIVE' : 'NEGATIVE'})`);
console.log(`→ In FBX/Three.js: Character LEFT side = ${leftHand.x > 0 ? '+X' : '-X'}`);

// === ボクセルモデルのデフォルトマーカー位置 ===
console.log('\n=== VOXEL MODEL DEFAULT MARKERS ===');
console.log('From getDefaultMarkers(35):');
console.log('LeftWrist  voxel_x = 10  (low X)');       // 左手首: ボクセルX=10（低い値）
console.log('RightWrist voxel_x = 60  (high X, mirrored from left)');  // 右手首: ボクセルX=60（高い値）
console.log('Center     voxel_x = 35');                 // 中心: ボクセルX=35

// === ビューア座標系の計算 ===
console.log('\n=== VIEWER COORDINATES ===');
console.log('viewer_x = (voxel_x - cx) * SCALE');
// 左手首: (10-35)*S = -25*S → 負のX → 画面右側
console.log(`LeftWrist  viewer_x = (10 - 35) * SCALE = -25 * SCALE  (NEGATIVE)`);
// 右手首: (60-35)*S = +25*S → 正のX → 画面左側
console.log(`RightWrist viewer_x = (60 - 35) * SCALE = +25 * SCALE  (POSITIVE)`);

// === カメラ正面ビューの分析 ===
console.log('\n=== CAMERA FRONT VIEW (alpha=PI/2, beta=PI/2) ===');
console.log('Babylon.js ArcRotateCamera position formula:');
console.log('  x = target.x + radius * cos(alpha) * sin(beta)');
console.log('  y = target.y + radius * cos(beta)');
console.log('  z = target.z + radius * sin(alpha) * sin(beta)');
console.log('For alpha=PI/2, beta=PI/2:');
console.log('  x = 0, y = 0, z = radius  → camera at +Z looking toward -Z');  // カメラは+Z位置から-Z方向を見る
console.log('');
console.log('Camera forward = (0, 0, -1), up = (0, 1, 0)');
console.log('Camera right (left-handed cross) = cross(up, forward):');
// 外積計算: cross((0,1,0), (0,0,-1)) = (-1, 0, 0) → 画面右方向 = 負のviewer_x
console.log('  = (-1, 0, 0)  → screen RIGHT = NEGATIVE viewer_x');
console.log('');
// 結果の解釈
console.log('So when user sees front view:');
console.log('  Screen LEFT  = +viewer_x = RightWrist = character RIGHT');  // 画面左 = キャラの右手
console.log('  Screen RIGHT = -viewer_x = LeftWrist  = character LEFT');   // 画面右 = キャラの左手
console.log('  → Character LEFT hand appears on viewer RIGHT side ✓ (mirror image)');  // 鏡像として正しい

// === 軸マッピングの結論 ===
console.log('\n=== AXIS MAPPING ===');
console.log(`FBX/Three.js:  Character LEFT = +Three_x = ${r(leftHand.x)}`);
console.log(`Voxel viewer:  Character LEFT = -viewer_x = (10-35)*S = -25*S`);
console.log('');
// 結論: viewer_x = -Three_x（X軸は反転！）
console.log('CONCLUSION: viewer_x = -Three_x  (X AXIS IS FLIPPED!)');
console.log('            viewer_y =  Three_y  (both up)');           // Y軸はそのまま
console.log('            viewer_z = -Three_z  (Z negated)');         // Z軸も反転
console.log('');
// 完全なマッピング: Y軸周りの180°回転（固有回転、det=+1）
console.log('Full mapping: (x,y,z) → (-x, y, -z)  = 180° rotation around Y');
console.log('This is a PROPER rotation (det=+1), NOT a reflection!');
console.log('');
// クォータニオンの変換公式
console.log('Quaternion conversion for 180° Y rotation:');
console.log('  q_viewer = R_Y(180°) × q_three × R_Y(180°)⁻¹');
console.log('  = (0,1,0,0) × (x,y,z,w) × (0,-1,0,0)');
console.log('  = (-x, y, -z, w)');
console.log('');
console.log('CORRECT CONVERSION: (-x, y, -z, w)');   // 正しい変換式
console.log('CURRENT (WRONG):    (-x, -y, z, w)');    // 現在の（間違った）変換式

// クリーンアップ
mixer.stopAllAction();
mixer.uncacheRoot(group);
