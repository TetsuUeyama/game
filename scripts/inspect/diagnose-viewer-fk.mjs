/**
 * FK数学の診断: FBXグラウンドトゥルースの位置とビューアFKアルゴリズムを比較。
 * 胴体の傾き反転やギャップが、コンバーター（motion.jsonデータ）起因か
 * ビューア（FK適用）起因かを明らかにする。
 *
 * Diagnose FK math: compare FBX ground truth positions with our viewer FK algorithm.
 * This will reveal whether the torso lean inversion and gaps are caused by
 * the converter (motion.json data) or the viewer (FK application).
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

// ── ファイルパス設定 ──
const __dirname = path.dirname(fileURLToPath(import.meta.url)); // スクリプトのディレクトリ
const fbxPath = path.join(__dirname, '..', 'public', 'models', 'character-motion', 'Hip Hop Dancing.fbx'); // FBXファイル（メッシュなし版）
const motionPath = path.join(__dirname, '..', 'public', 'models', 'character-motion', 'Hip Hop Dancing.motion.json'); // モーションJSON

// モーションJSONの読み込み
const motionData = JSON.parse(fs.readFileSync(path.resolve(motionPath), 'utf-8'));

// FBXの読み込み
const loader = new FBXLoader(); // FBXローダー
const group = await new Promise((resolve, reject) => {
  loader.load(path.resolve(fbxPath), resolve, undefined, reject); // FBX読み込み
});

// ボーン名→ボーンオブジェクトのマップ
const boneByName = {};
group.traverse((obj) => { if (obj.isBone) boneByName[cleanBoneName(obj.name)] = obj; });

// ========================================================================
// ステップ1: バインドポーズのキャプチャ（アニメーション適用前）
// ========================================================================
group.updateMatrixWorld(true); // ワールド行列更新
const bindWorldPos = {}; // バインドポーズの位置
const bindWorldQuat = {}; // バインドポーズのクォータニオン
for (const name of Object.keys(boneByName)) {
  const bone = boneByName[name]; // ボーンオブジェクト
  const pos = new THREE.Vector3(); // 位置格納用
  const quat = new THREE.Quaternion(); // クォータニオン格納用
  bone.getWorldPosition(pos); // ワールド位置取得
  bone.getWorldQuaternion(quat); // ワールドクォータニオン取得
  bindWorldPos[name] = pos.clone(); // 位置を保存
  bindWorldQuat[name] = quat.clone(); // クォータニオンを保存
}

// ── アニメーションの設定 ──
const clip = group.animations[0]; // 最初のアニメーションクリップ
const mixer = new THREE.AnimationMixer(group); // ミキサー
const action = mixer.clipAction(clip); // アクション
action.play(); // 再生

// ========================================================================
// 比較対象の主要ボーン
// ========================================================================
const KEY_BONES = [
  'Hips', 'Spine', 'Spine1', 'Spine2', 'Neck', 'Head', // 体幹
  'LeftShoulder', 'LeftArm', 'LeftForeArm', 'LeftHand', // 左腕
  'RightShoulder', 'RightArm', 'RightForeArm', 'RightHand', // 右腕
  'LeftUpLeg', 'LeftLeg', 'LeftFoot', // 左脚
  'RightUpLeg', 'RightLeg', 'RightFoot', // 右脚
];

// ── 実際のFBXボーン階層から親子関係を構築 ──
const HIERARCHY = {};
for (const name of KEY_BONES) {
  const bone = boneByName[name]; // ボーンオブジェクト
  if (bone?.parent?.isBone) {
    HIERARCHY[name] = cleanBoneName(bone.parent.name); // 親ボーン名を登録
  }
}

// ── ビューア座標変換関数 ──
// 位置をビューア座標に変換: (-x, y, -z)
const toViewerPos = (p) => ({ x: -p.x, y: p.y, z: -p.z });
// クォータニオンをビューア座標に変換: (-x, y, -z, w)
const toViewerQuat = (q) => ({ x: -q.x, y: q.y, z: -q.z, w: q.w });

// ── クォータニオン演算関数 ──
// クォータニオンの乗算: a × b（ハミルトン積）
function qMul(a, b) {
  return {
    x: a.x*b.w + a.w*b.x + a.y*b.z - a.z*b.y, // X成分
    y: a.y*b.w + a.w*b.y + a.z*b.x - a.x*b.z, // Y成分
    z: a.z*b.w + a.w*b.z + a.x*b.y - a.y*b.x, // Z成分
    w: a.w*b.w - a.x*b.x - a.y*b.y - a.z*b.z, // W成分
  };
}

// クォータニオンの逆（共役、正規化済み前提）
function qInv(q) { return { x: -q.x, y: -q.y, z: -q.z, w: q.w }; }

// クォータニオンでベクトルを回転: q × v × q⁻¹
function qRotVec(q, v) {
  const vq = { x: v.x, y: v.y, z: v.z, w: 0 }; // ベクトルを純粋クォータニオンに
  const r = qMul(qMul(q, vq), qInv(q)); // q × v × q⁻¹
  return { x: r.x, y: r.y, z: r.z }; // ベクトル部分を返す
}

// ========================================================================
// テストフレーム
// ========================================================================
const testFrames = [0, 10, 20, 30, 40, 50, 60]; // 分析対象フレーム

// バインドポーズのボーンベクトル（ビューア空間）を事前計算
// ※ 後のクロージャ内で使用するためここで宣言
let bindVecViewer = {};

for (const frameIdx of testFrames) {
  if (frameIdx >= motionData.frameCount) continue; // 範囲外スキップ
  const time = frameIdx / motionData.fps; // 秒に変換（fpsから）
  mixer.setTime(time); // 時刻設定
  group.updateMatrixWorld(true); // 行列更新

  console.log(`\n${'='.repeat(80)}`);
  console.log(`FRAME ${frameIdx} (t=${r(time)}s)`);
  console.log(`${'='.repeat(80)}`);

  // ── FBXグラウンドトゥルースの位置を取得（ビューア空間） ──
  const fbxPositions = {};
  for (const name of KEY_BONES) {
    const bone = boneByName[name]; // ボーンオブジェクト
    if (!bone) continue; // 存在しなければスキップ
    const wp = new THREE.Vector3(); // ワールド位置
    bone.getWorldPosition(wp); // 取得
    fbxPositions[name] = toViewerPos(wp); // ビューア座標に変換して保存
  }

  // ── motion.jsonのデルタクォータニオンを取得（ビューア空間） ──
  const frame = motionData.frames[frameIdx]; // フレームデータ
  const worldDeltas = {};
  for (const name of KEY_BONES) {
    const data = frame[name]; // ボーンのデータ
    if (data) {
      // dq配列をビューア空間クォータニオンに変換
      worldDeltas[name] = toViewerQuat({ x: data.dq[0], y: data.dq[1], z: data.dq[2], w: data.dq[3] });
    } else {
      worldDeltas[name] = { x: 0, y: 0, z: 0, w: 1 }; // データなしなら恒等回転
    }
  }

  // ── FKで位置を計算 ──
  // 方法A: localDQ = parentWorldDQ⁻¹ × worldDQ（現在のコード）
  // 方法B: localDQ = worldDQ × parentWorldDQ⁻¹（代替案）
  const fkPositionsA = {}; // 方法Aの結果位置
  const fkPositionsB = {}; // 方法Bの結果位置

  // バインドポーズのボーンベクトルをビューア空間で計算
  bindVecViewer = {};
  for (const name of KEY_BONES) {
    const parentName = HIERARCHY[name]; // 親ボーン名
    if (parentName && bindWorldPos[name] && bindWorldPos[parentName]) {
      // Three.js空間でのボーンベクトル
      const bv = {
        x: bindWorldPos[name].x - bindWorldPos[parentName].x, // X差分
        y: bindWorldPos[name].y - bindWorldPos[parentName].y, // Y差分
        z: bindWorldPos[name].z - bindWorldPos[parentName].z, // Z差分
      };
      bindVecViewer[name] = toViewerPos(bv); // ビューア座標に変換
    }
  }

  // ── FK方法A: localDQ = parentInv × worldDQ ──
  const accWorldA = {}; // 累積ワールドクォータニオン
  for (const name of KEY_BONES) {
    const parentName = HIERARCHY[name]; // 親ボーン名
    const worldDQ = worldDeltas[name]; // ワールドデルタ

    if (!parentName) {
      // ルートボーン（Hips）
      accWorldA[name] = worldDQ; // ワールドデルタをそのまま使用
      const data = frame[name]; // フレームデータ
      const hipsBindV = toViewerPos(bindWorldPos[name]); // バインドポーズ位置（ビューア）
      if (data?.dp) {
        // 位置デルタを適用
        fkPositionsA[name] = {
          x: hipsBindV.x + (-data.dp[0]), // X反転
          y: hipsBindV.y + data.dp[1], // Y維持
          z: hipsBindV.z + (-data.dp[2]), // Z反転
        };
      } else {
        fkPositionsA[name] = hipsBindV; // デルタなしならバインド位置
      }
    } else {
      // 子ボーン
      accWorldA[name] = worldDQ; // ワールドデルタを記録
      const parentWorldDQ = accWorldA[parentName] ?? { x: 0, y: 0, z: 0, w: 1 }; // 親のワールドクォータニオン
      const boneVec = bindVecViewer[name]; // バインドポーズのボーンベクトル
      if (boneVec && fkPositionsA[parentName]) {
        // 親の回転でボーンベクトルを回転
        const rotatedVec = qRotVec(parentWorldDQ, boneVec);
        // 子の位置 = 親の位置 + 回転済みベクトル
        fkPositionsA[name] = {
          x: fkPositionsA[parentName].x + rotatedVec.x, // X座標
          y: fkPositionsA[parentName].y + rotatedVec.y, // Y座標
          z: fkPositionsA[parentName].z + rotatedVec.z, // Z座標
        };
      }
    }
  }

  // FK方法B（サニティチェック用）は方法Aと同じ結果になるはず
  // 位置の計算ではどちらの方法でもparentDQ.rotate(boneVec)を使うため

  // ── FBXグラウンドトゥルースとFK方法Aの比較 ──
  console.log('\nBone               | FBX viewer pos                 | FK-A viewer pos                | Error');
  console.log('-'.repeat(100));

  let totalError = 0; // 合計誤差
  let count = 0; // ボーン数
  for (const name of KEY_BONES) {
    const fbx = fbxPositions[name]; // FBXの位置
    const fk = fkPositionsA[name]; // FKの位置
    if (!fbx || !fk) continue; // データなしならスキップ

    // 位置誤差の計算（ユークリッド距離）
    const ex = fbx.x - fk.x; // X差分
    const ey = fbx.y - fk.y; // Y差分
    const ez = fbx.z - fk.z; // Z差分
    const err = Math.sqrt(ex*ex + ey*ey + ez*ez); // 距離
    totalError += err; // 合計に加算
    count++; // カウント

    // 結果を表示
    console.log(
      `${name.padEnd(20)}` +
      `| (${r(fbx.x).toString().padStart(8)}, ${r(fbx.y).toString().padStart(8)}, ${r(fbx.z).toString().padStart(8)})` +
      `| (${r(fk.x).toString().padStart(8)}, ${r(fk.y).toString().padStart(8)}, ${r(fk.z).toString().padStart(8)})` +
      `| ${r(err)}`
    );
  }
  console.log(`\nAverage position error: ${r(totalError / count)}`); // 平均誤差を表示

  // ── 背骨方向のチェック ──
  console.log('\n--- SPINE DIRECTION CHECK ---');
  const hipsP = fbxPositions['Hips']; // FBXの腰位置
  const spine2P = fbxPositions['Spine2']; // FBXのSpine2位置
  if (hipsP && spine2P) {
    // 背骨の方向ベクトルを計算
    const spineDir = {
      x: spine2P.x - hipsP.x, // X差分
      y: spine2P.y - hipsP.y, // Y差分
      z: spine2P.z - hipsP.z, // Z差分
    };
    const len = Math.sqrt(spineDir.x**2 + spineDir.y**2 + spineDir.z**2); // ベクトルの長さ
    console.log(`FBX Spine2-Hips viewer direction: (${r(spineDir.x/len)}, ${r(spineDir.y/len)}, ${r(spineDir.z/len)})`);
    // Z成分で前後方向を判定
    console.log(`  Z component: ${r(spineDir.z/len)} → ${spineDir.z > 0 ? 'BACKWARD (away from camera)' : 'FORWARD (toward camera)'}`);
  }

  // FK方法Aでの背骨方向
  const hipsFK = fkPositionsA['Hips']; // FKの腰位置
  const spine2FK = fkPositionsA['Spine2']; // FKのSpine2位置
  if (hipsFK && spine2FK) {
    const spineDir = {
      x: spine2FK.x - hipsFK.x, // X差分
      y: spine2FK.y - hipsFK.y, // Y差分
      z: spine2FK.z - hipsFK.z, // Z差分
    };
    const len = Math.sqrt(spineDir.x**2 + spineDir.y**2 + spineDir.z**2); // 長さ
    console.log(`FK  Spine2-Hips viewer direction: (${r(spineDir.x/len)}, ${r(spineDir.y/len)}, ${r(spineDir.z/len)})`);
    console.log(`  Z component: ${r(spineDir.z/len)} → ${spineDir.z > 0 ? 'BACKWARD (away from camera)' : 'FORWARD (toward camera)'}`);
  }
}

// ========================================================================
// 追加検証: Babylon.jsの階層分解が重要かどうか
// テスト: parentInv × worldDQ vs worldDQ × parentInv
// ========================================================================
console.log('\n\n' + '='.repeat(80));
console.log('LOCAL DECOMPOSITION TEST: parentInv×world vs world×parentInv');
console.log('='.repeat(80));

const testFrame = 30; // フレーム30をテスト
const frame30 = motionData.frames[testFrame]; // フレーム30のデータ
mixer.setTime(testFrame / motionData.fps); // 時刻設定
group.updateMatrixWorld(true); // 行列更新

// ワールドデルタをビューア空間に変換
const worldDQs = {};
for (const name of KEY_BONES) {
  const data = frame30[name]; // ボーンデータ
  if (data) {
    worldDQs[name] = toViewerQuat({ x: data.dq[0], y: data.dq[1], z: data.dq[2], w: data.dq[3] }); // ビューア変換
  } else {
    worldDQs[name] = { x: 0, y: 0, z: 0, w: 1 }; // 恒等回転
  }
}

console.log('\nBone               | Method A: pInv×w              | Method B: w×pInv              | Same?');
console.log('-'.repeat(100));

// ── 2つの分解方法でローカルクォータニオンを計算し比較 ──
for (const name of KEY_BONES) {
  const parentName = HIERARCHY[name]; // 親ボーン名
  if (!parentName) continue; // ルートはスキップ
  const worldDQ = worldDQs[name]; // ワールドデルタ
  const parentDQ = worldDQs[parentName] ?? { x: 0, y: 0, z: 0, w: 1 }; // 親ワールドデルタ
  const pInv = qInv(parentDQ); // 親の逆クォータニオン

  const localA = qMul(pInv, worldDQ);       // 方法A: parentInv × worldDQ
  const localB = qMul(worldDQ, pInv);       // 方法B: worldDQ × parentInv

  // 回転済みボーンベクトルで結果を検証
  const boneVec = bindVecViewer[name]; // ボーンベクトル
  if (!boneVec) continue; // データなしならスキップ

  // 各方法でボーンベクトルを回転
  const rotA = qRotVec(localA, boneVec); // 方法Aでのローカル回転
  const rotB = qRotVec(localB, boneVec); // 方法Bでのローカル回転

  // 実際に必要なもの: parentWorldDQ.rotate(localDQ.rotate(boneVec))
  // 方法A: parent.rotate(localA.rotate(boneVec)) は worldDQ.rotate(boneVec) と一致すべき
  const parentRotA = qRotVec(parentDQ, rotA); // 方法A: 親回転(ローカルA回転(ベクトル))
  const parentRotB = qRotVec(parentDQ, rotB); // 方法B: 親回転(ローカルB回転(ベクトル))
  const worldRot = qRotVec(worldDQ, boneVec); // ワールドデルタで直接回転した結果

  // worldQuat = parentQuat × localQuat の場合:
  //   worldQuat.rotate(v) = parentQuat.rotate(localQuat.rotate(v))
  // worldQuat = localQuat × parentQuat の場合:
  //   worldQuat.rotate(v) ≠ parentQuat.rotate(localQuat.rotate(v))

  // テスト: parent.rotate(localA.rotate(v)) = world.rotate(v) ?
  const errA = Math.sqrt(
    (parentRotA.x - worldRot.x)**2 +
    (parentRotA.y - worldRot.y)**2 +
    (parentRotA.z - worldRot.z)**2
  ); // 方法Aの誤差
  // テスト: parent.rotate(localB.rotate(v)) = world.rotate(v) ?
  const errB = Math.sqrt(
    (parentRotB.x - worldRot.x)**2 +
    (parentRotB.y - worldRot.y)**2 +
    (parentRotB.z - worldRot.z)**2
  ); // 方法Bの誤差

  // Babylonの実際の動作を検証
  // Babylonでは worldRot = parentRot × localRot
  // だから parent.rotate(local.rotate(v)) = world.rotate(v) のはず
  // これは方法A (parentInv × world) をテスト

  // 代替: worldRot = localRot × parentRot の場合
  // local.rotate(parent.rotate(v)) = world.rotate(v) のはず
  const altA = qRotVec(localA, qRotVec(parentDQ, boneVec)); // localA.rotate(parent.rotate(v))
  const altB = qRotVec(localB, qRotVec(parentDQ, boneVec)); // localB.rotate(parent.rotate(v))
  const altErrA = Math.sqrt(
    (altA.x - worldRot.x)**2 + (altA.y - worldRot.y)**2 + (altA.z - worldRot.z)**2
  ); // 代替方法Aの誤差
  const altErrB = Math.sqrt(
    (altB.x - worldRot.x)**2 + (altB.y - worldRot.y)**2 + (altB.z - worldRot.z)**2
  ); // 代替方法Bの誤差

  // どの方法が正しいか判定して表示
  console.log(
    `${name.padEnd(20)}` +
    `| p(A(v))err=${r(errA).toString().padStart(6)} l(p(v))err=${r(altErrA).toString().padStart(6)}` +
    `| p(B(v))err=${r(errB).toString().padStart(6)} l(p(v))err=${r(altErrB).toString().padStart(6)}` +
    `| ${errA < 0.001 ? 'A=standard' : altErrA < 0.001 ? 'A=reversed' : errB < 0.001 ? 'B=standard' : altErrB < 0.001 ? 'B=reversed' : 'NEITHER??'}`
  );
}

// ── 位置チェック: どの分解方法がFBXと一致するか ──
console.log('\n\n--- POSITION CHECK: which decomposition matches FBX? ---');
console.log('Bone               | FBX pos (viewer)               | MethodA pos                    | MethodB pos                    | Winner');
console.log('-'.repeat(140));

// フレーム30のFBXグラウンドトゥルース位置を取得
const fbxPos30 = {};
for (const name of KEY_BONES) {
  const wp = new THREE.Vector3(); // ワールド位置
  boneByName[name]?.getWorldPosition(wp); // 取得
  fbxPos30[name] = toViewerPos(wp); // ビューア座標に変換
}

// ── 両方法でFK位置を計算 ──
const posA = {}; // 方法Aの位置
const posB = {}; // 方法Bの位置
for (const name of KEY_BONES) {
  const parentName = HIERARCHY[name]; // 親ボーン名
  if (!parentName) {
    // ルートボーン（Hips）
    const hipsBindV = toViewerPos(bindWorldPos[name]); // バインド位置（ビューア）
    const data = frame30[name]; // フレームデータ
    const pos = data?.dp ? {
      x: hipsBindV.x + (-data.dp[0]), // X反転デルタ
      y: hipsBindV.y + data.dp[1], // Yデルタ
      z: hipsBindV.z + (-data.dp[2]), // Z反転デルタ
    } : hipsBindV; // デルタなしならバインド位置
    posA[name] = pos; // 方法Aの位置
    posB[name] = pos; // 方法Bの位置
    continue;
  }

  const boneVec = bindVecViewer[name]; // ボーンベクトル
  if (!boneVec) continue; // データなしならスキップ

  const parentDQ = worldDQs[parentName] ?? { x: 0, y: 0, z: 0, w: 1 }; // 親ワールドデルタ

  // 方法A: Babylon規約 worldRot = parent × local
  // 子位置 = 親位置 + parentWorldRot.rotate(boneVec)
  if (posA[parentName]) {
    const rotVec = qRotVec(parentDQ, boneVec); // 親回転でベクトルを回転
    posA[name] = {
      x: posA[parentName].x + rotVec.x, // X座標
      y: posA[parentName].y + rotVec.y, // Y座標
      z: posA[parentName].z + rotVec.z, // Z座標
    };
  }

  // 方法B: 代替規約 worldRot = local × parent
  // 位置計算では両方法とも parentDQ.rotate(boneVec) を使用
  // localDQの値が異なるだけで、ノードに設定するローカル値が変わる
  // 位置に関しては両方法で同じ結果になる
  if (posB[parentName]) {
    const rotVec = qRotVec(parentDQ, boneVec); // 同じ回転
    posB[name] = {
      x: posB[parentName].x + rotVec.x, // X座標
      y: posB[parentName].y + rotVec.y, // Y座標
      z: posB[parentName].z + rotVec.z, // Z座標
    };
  }
}

// ── 結果表示 ──
for (const name of KEY_BONES) {
  const fbx = fbxPos30[name]; // FBXの位置
  const a = posA[name]; // 方法Aの位置
  const b = posB[name]; // 方法Bの位置
  if (!fbx || !a) continue; // データなしならスキップ

  // 各方法の誤差を計算
  const errA = Math.sqrt((fbx.x-a.x)**2 + (fbx.y-a.y)**2 + (fbx.z-a.z)**2); // 方法Aの誤差
  const errB = b ? Math.sqrt((fbx.x-b.x)**2 + (fbx.y-b.y)**2 + (fbx.z-b.z)**2) : 999; // 方法Bの誤差

  // 結果を表示
  console.log(
    `${name.padEnd(20)}` +
    `| (${r(fbx.x).toString().padStart(8)}, ${r(fbx.y).toString().padStart(8)}, ${r(fbx.z).toString().padStart(8)})` +
    `| (${r(a.x).toString().padStart(8)}, ${r(a.y).toString().padStart(8)}, ${r(a.z).toString().padStart(8)})` +
    `| (${r(b?.x).toString().padStart(8)}, ${r(b?.y).toString().padStart(8)}, ${r(b?.z).toString().padStart(8)})` +
    `| errA=${r(errA)} errB=${r(errB)}`
  );
}

// ── クリーンアップ ──
mixer.stopAllAction(); // アニメーション停止
mixer.uncacheRoot(group); // キャッシュクリア
