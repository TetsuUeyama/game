/**
 * FBXアニメーションをJSONモーションデータに変換するスクリプト。
 * 各ボーン×各フレームのワールド空間デルタクォータニオンとデルタ位置を出力する。
 * デルタ = レストポーズ（フレーム0）からの差分。
 *
 * 使用方法: node scripts/convert-fbx-motion.mjs <input.fbx> [output.json]
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

// fetchポリフィル（ローカルファイル読み込み用）
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
    if (this.responseType === 'arraybuffer') {
      setTimeout(() => onLoad(ab), 0);
    } else {
      setTimeout(() => onLoad(buf.toString('utf-8')), 0);
    }
  } catch (e) {
    if (onError) onError(e);
    else console.error(e);
  }
  return {};
};

// TextureLoaderのスタブ
THREE.TextureLoader.prototype.load = function () {
  return new THREE.Texture();
};

const { FBXLoader } = await import('three/examples/jsm/loaders/FBXLoader.js');

// mixamorigプレフィックスを除去するヘルパー
function cleanBoneName(name) {
  return name.replace(/^mixamorig/, '');
}

// 小数点4桁に丸めるヘルパー
function round4(v) {
  return Math.round(v * 10000) / 10000;
}

// FBXファイルを読み込み、モーションデータに変換するメイン関数
async function convertFBX(inputPath, outputPath) {
  console.log(`Loading FBX: ${inputPath}`);

  // FBXファイルを読み込み
  const loader = new FBXLoader();
  const group = await new Promise((resolve, reject) => {
    loader.load(inputPath, resolve, undefined, reject);
  });

  // 全ボーンを収集してマップに格納
  const allBones = [];
  const boneByName = {};
  group.traverse((obj) => {
    if (obj.isBone) {
      allBones.push(obj);
      boneByName[cleanBoneName(obj.name)] = obj;
    }
  });
  console.log(`Bones found: ${allBones.length}`);

  // ボーン階層情報を構築
  const hierarchy = [];
  for (const bone of allBones) {
    const name = cleanBoneName(bone.name);
    const parentName = bone.parent?.isBone ? cleanBoneName(bone.parent.name) : null;  // 親ボーン名
    const pos = bone.position;  // ローカル位置
    hierarchy.push({
      name,
      parent: parentName,
      restPosition: { x: round4(pos.x), y: round4(pos.y), z: round4(pos.z) },
    });
  }

  // アニメーションクリップの存在確認
  const clips = group.animations;
  if (!clips || clips.length === 0) {
    console.error('No animation clips found!');
    process.exit(1);
  }

  const results = [];  // 変換結果を格納する配列

  // 各アニメーションクリップを処理
  for (const clip of clips) {
    console.log(`\nProcessing: "${clip.name}" (${clip.duration.toFixed(2)}s, ${clip.tracks.length} tracks)`);

    // ソースFPSを最初のクォータニオントラックから決定
    let sourceFps = 30;
    for (const track of clip.tracks) {
      if (track.name.endsWith('.quaternion') && track.times.length > 1) {
        sourceFps = Math.round(1 / (track.times[1] - track.times[0]));
        break;
      }
    }
    // ターゲットFPS（40fps超の場合は30fpsにダウンサンプル）
    const targetFps = sourceFps > 40 ? 30 : sourceFps;
    const dt = 1.0 / targetFps;                        // 1フレームの時間間隔
    const totalFrames = Math.ceil(clip.duration * targetFps);  // 総フレーム数
    console.log(`  Source FPS: ${sourceFps}, Target FPS: ${targetFps}, Frames: ${totalFrames}`);

    // アニメーショントラックを持つボーンを特定
    const trackedBoneNames = new Set();
    for (const track of clip.tracks) {
      const dotIdx = track.name.lastIndexOf('.');
      const rawName = track.name.substring(0, dotIdx);
      trackedBoneNames.add(cleanBoneName(rawName));
    }

    // バインドポーズ（Tポーズ、アニメーション前）をレスト基準としてキャプチャ
    // 重要: ボクセルビューアのモデルはTポーズなので、デルタクォータニオンは
    // フレーム0からではなくTポーズ（バインドポーズ）からの変化を表す必要がある
    group.updateMatrixWorld(true);

    // レスト（バインド）ポーズのワールド位置・回転を保存
    const restWorldPos = {};
    const restWorldQuat = {};
    for (const bone of allBones) {
      const name = cleanBoneName(bone.name);
      const pos = new THREE.Vector3();
      const quat = new THREE.Quaternion();
      bone.getWorldPosition(pos);
      bone.getWorldQuaternion(quat);
      restWorldPos[name] = pos.clone();
      restWorldQuat[name] = quat.clone();
    }

    // アニメーションミキサーを設定
    const mixer = new THREE.AnimationMixer(group);
    const action = mixer.clipAction(clip);
    action.play();

    // FBXボディスケール（Hips→Headのワールド距離）をバインドポーズから計算
    const hipsRestY = restWorldPos['Hips']?.y ?? 0;
    const headRestY = restWorldPos['Head']?.y ?? 1;
    const fbxBodyHeight = headRestY - hipsRestY;
    console.log(`  FBX body height (Hips→Head): ${fbxBodyHeight.toFixed(3)}`);

    // 出力するボーンを決定（トラックを持つボーンのみ）
    const outputBones = allBones
      .map(b => cleanBoneName(b.name))
      .filter(name => trackedBoneNames.has(name));
    console.log(`  Output bones (${outputBones.length}): ${outputBones.join(', ')}`);

    // 各フレームを評価 — レストポーズからのワールド空間デルタ
    const frames = [];
    for (let f = 0; f < totalFrames; f++) {
      const time = f * dt;
      mixer.setTime(time);              // フレーム時間を設定
      group.updateMatrixWorld(true);     // ワールド行列を更新

      const frame = {};
      for (const name of outputBones) {
        const bone = boneByName[name];
        if (!bone) continue;

        const worldPos = new THREE.Vector3();
        const worldQuat = new THREE.Quaternion();
        bone.getWorldPosition(worldPos);     // アニメーション後のワールド位置
        bone.getWorldQuaternion(worldQuat);  // アニメーション後のワールド回転

        // デルタ位置 = アニメーション後 - レスト（FBXワールド空間）
        const dp = worldPos.clone().sub(restWorldPos[name]);

        // デルタ回転 = animated × restInverse（右側乗算）
        // これにより dq.rotate(bindBoneVec) = Q_anim.rotate(localOffset) が保証される
        // バインドポーズのボーンベクトルを使った正しいFK位置計算に必要
        const dq = worldQuat.clone().multiply(restWorldQuat[name].clone().invert());

        const entry = {
          dq: [round4(dq.x), round4(dq.y), round4(dq.z), round4(dq.w)],  // デルタクォータニオン
        };

        // ルートモーション用のデルタ位置を含める（Hips等）
        if (Math.abs(dp.x) > 0.0001 || Math.abs(dp.y) > 0.0001 || Math.abs(dp.z) > 0.0001) {
          entry.dp = [round4(dp.x), round4(dp.y), round4(dp.z)];
        }

        frame[name] = entry;
      }
      frames.push(frame);  // フレームデータを追加
    }

    // ミキサーのクリーンアップ
    mixer.stopAllAction();
    mixer.uncacheRoot(group);

    // サンプルフレームの内容を表示
    console.log(`  Frame 0 Hips: ${JSON.stringify(frames[0].Hips)}`);
    const mid = Math.floor(totalFrames / 2);
    console.log(`  Frame ${mid} Hips: ${JSON.stringify(frames[mid].Hips)}`);
    console.log(`  Frame ${mid} Head: ${JSON.stringify(frames[mid].Head)}`);

    // FKボーンベクトル計算用のバインドポーズワールド位置
    // ビューアが正しいボーン方向を計算するために必要
    const bindWorldPositions = {};
    for (const bone of allBones) {
      const name = cleanBoneName(bone.name);
      if (!outputBones.includes(name)) continue;
      const wp = restWorldPos[name];
      bindWorldPositions[name] = [round4(wp.x), round4(wp.y), round4(wp.z)];
    }

    // 結果オブジェクトを追加
    results.push({
      name: clip.name || path.basename(inputPath, '.fbx'),  // クリップ名
      label: path.basename(inputPath, '.fbx'),               // 表示ラベル
      duration: clip.duration,                               // アニメーション長（秒）
      fps: targetFps,                                        // フレームレート
      frameCount: frames.length,                             // フレーム数
      fbxBodyHeight,                                         // FBXボディ高さ
      hierarchy,                                             // ボーン階層情報
      outputBones,                                           // 出力ボーンリスト
      bindWorldPositions,                                    // バインドポーズ位置
      frames,                                                // フレームデータ
    });
  }

  // JSONファイルに書き出し（単一クリップならオブジェクト、複数なら配列）
  const output = results.length === 1 ? results[0] : results;
  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));
  console.log(`\nWritten to: ${outputPath}`);
  const stat = fs.statSync(outputPath);
  console.log(`File size: ${(stat.size / 1024 / 1024).toFixed(2)} MB`);
}

// ── CLI引数の処理 ──
const args = process.argv.slice(2);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
// 入力ファイル（引数なしの場合はデフォルトのHip Hop Dancing.fbx）
const inputFile = args[0] || path.join(__dirname, '..', 'public', 'models', 'character-motion', 'Hip Hop Dancing.fbx');
// 出力ファイル（.fbx → .motion.json に変換）
const defaultOutput = inputFile.replace(/\.fbx$/i, '.motion.json');
const outputFile = args[1] || defaultOutput;

// 変換を実行
convertFBX(path.resolve(inputFile), path.resolve(outputFile));
