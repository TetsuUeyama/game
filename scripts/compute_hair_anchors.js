/**
 * compute_hair_anchors.js
 *
 * 各キャラクターの body.vox と hair.vox を解析し、
 * ヘアスワップ用のアンカーポイント（頭頂部・前後左右）を自動計算して
 * hair_anchors.json として保存する。
 *
 * Usage: node scripts/compute_hair_anchors.js
 */

// ファイルシステムモジュールの読み込み
const fs = require('fs');
// パス操作モジュールの読み込み
const path = require('path');

// ボクセルデータのベースディレクトリパス
const VOX_BASE = 'C:/Users/user/developsecond/vox';

// ========================================================================
// VOX parser (Node.js Buffer version)（VOXファイルパーサー）
// ========================================================================

// VOXファイルを解析してボクセルデータを返す関数
function parseVox(filePath) {
  // ファイルをバイナリとして読み込み
  const buf = fs.readFileSync(filePath);
  // 先頭4バイトからマジックナンバーを読み取り
  const magic = buf.toString('ascii', 0, 4);
  // マジックナンバーが'VOX 'でなければエラー
  if (magic !== 'VOX ') throw new Error(`Not a VOX file: ${filePath}`);

  // マジックナンバー(4B)とバージョン(4B)をスキップしてオフセット8から開始
  let offset = 8;
  // モデルのサイズ（X, Y, Z方向のボクセル数）を初期化
  let sizeX = 0, sizeY = 0, sizeZ = 0;
  // ボクセルデータの配列
  const voxels = [];

  // チャンクヘッダーを読み取る内部関数
  function readChunk(off) {
    // チャンクID（4バイトASCII文字列）
    const id = buf.toString('ascii', off, off + 4);
    // チャンクのコンテンツサイズ（4バイトリトルエンディアン整数）
    const contentSize = buf.readInt32LE(off + 4);
    // 子チャンクの合計サイズ（4バイトリトルエンディアン整数）
    const childrenSize = buf.readInt32LE(off + 8);
    // チャンク情報とデータ開始位置を返す（ヘッダーは12バイト固定）
    return { id, contentSize, childrenSize, dataOffset: off + 12 };
  }

  // MAINチャンク（ルートチャンク）を読み取り
  const main = readChunk(offset);
  // MAINチャンクのヘッダー分をスキップ
  offset += 12;
  // 全チャンクの終端位置を計算
  const end = offset + main.childrenSize;

  // 全子チャンクを順番に処理
  while (offset < end) {
    // 現在位置のチャンクを読み取り
    const chunk = readChunk(offset);
    // SIZEチャンク: モデルのボクセルグリッドサイズを取得
    if (chunk.id === 'SIZE') {
      sizeX = buf.readInt32LE(chunk.dataOffset);       // X方向のサイズ
      sizeY = buf.readInt32LE(chunk.dataOffset + 4);   // Y方向のサイズ
      sizeZ = buf.readInt32LE(chunk.dataOffset + 8);   // Z方向のサイズ
    // XYZIチャンク: ボクセルの座標データを取得
    } else if (chunk.id === 'XYZI') {
      // ボクセル数を読み取り
      const n = buf.readInt32LE(chunk.dataOffset);
      // 各ボクセルのX, Y, Z座標を読み取ってリストに追加
      for (let i = 0; i < n; i++) {
        // 各ボクセルは4バイト（x, y, z, colorIndex）
        const base = chunk.dataOffset + 4 + i * 4;
        voxels.push({
          x: buf.readUInt8(base),       // X座標
          y: buf.readUInt8(base + 1),   // Y座標
          z: buf.readUInt8(base + 2),   // Z座標
        });
      }
    }
    // 次のチャンクへ移動（ヘッダー12B + コンテンツ + 子チャンク）
    offset += 12 + chunk.contentSize + chunk.childrenSize;
  }

  // パース結果（サイズとボクセルリスト）を返す
  return { sizeX, sizeY, sizeZ, voxels };
}

// ========================================================================
// Anchor computation（アンカーポイント計算）
// ========================================================================

/**
 * Body の頭部表面5点を計算
 * vox座標系: X=左右, Y=前後, Z=上下（上が大きい）
 *
 * 5点:
 *   top   = Z最大のボクセル（頭頂）
 *   front = 頭部領域でY最小のボクセル（最前面）
 *   back  = 頭部領域でY最大のボクセル（最後面）
 *   left  = 頭部領域でX最小のボクセル（最左面）
 *   right = 頭部領域でX最大のボクセル（最右面）
 *
 * ワールド座標変換（buildVoxMeshと同じ）:
 *   wx = (vx - sizeX/2) * scale
 *   wy = vz * scale           (Z up)
 *   wz = -(vy - sizeY/2) * scale
 */
// ボディモデルの頭部表面アンカーポイントを計算する関数
function computeBodyHeadAnchors(model, voxelSize) {
  // モデルのサイズとボクセルリストを取得
  const { sizeX, sizeY, voxels } = model;
  // ボクセルが空なら計算不可
  if (voxels.length === 0) return null;

  // 全ボクセルのZ座標の最大値（モデルの一番上）を求める
  let maxZ = 0;
  for (const v of voxels) {
    if (v.z > maxZ) maxZ = v.z;
  }

  // 頭部領域: モデル高さの上位12%を頭部とみなす
  const headMinZ = Math.floor(maxZ * 0.88);
  // 頭部領域のボクセルだけをフィルタリング
  const headVoxels = voxels.filter(v => v.z >= headMinZ);
  // 頭部ボクセルがなければ計算不可
  if (headVoxels.length === 0) return null;

  // 5方向の極値ボクセルを初期化（最初の頭部ボクセルで仮設定）
  let topVoxel = headVoxels[0];     // 最も高いボクセル
  let frontVoxel = headVoxels[0];   // 最も前のボクセル
  let backVoxel = headVoxels[0];    // 最も後ろのボクセル
  let leftVoxel = headVoxels[0];    // 最も左のボクセル
  let rightVoxel = headVoxels[0];   // 最も右のボクセル

  // 頭部ボクセルを走査して各方向の極値を更新
  for (const v of headVoxels) {
    if (v.z > topVoxel.z) topVoxel = v;       // Z最大 = 頭頂
    if (v.y < frontVoxel.y) frontVoxel = v;   // Y最小 = 最前面
    if (v.y > backVoxel.y) backVoxel = v;     // Y最大 = 最後面
    if (v.x < leftVoxel.x) leftVoxel = v;     // X最小 = 最左面
    if (v.x > rightVoxel.x) rightVoxel = v;   // X最大 = 最右面
  }

  // グリッド中心のX, Y座標を計算
  const cx = sizeX / 2;
  const cy = sizeY / 2;

  // ボクセル座標をワールド座標に変換する関数
  function toWorld(vx, vy, vz) {
    return [
      (vx - cx) * voxelSize,     // X: 中心からのオフセット × スケール
      vz * voxelSize,            // Y: Z座標をそのまま高さに（Z up → Y up変換）
      -(vy - cy) * voxelSize,    // Z: Y座標を反転して奥行きに
    ];
  }

  // 5点のアンカーをワールド座標に変換して返す
  return {
    top: toWorld(topVoxel.x, topVoxel.y, topVoxel.z),         // 頭頂ポイント
    front: toWorld(frontVoxel.x, frontVoxel.y, frontVoxel.z),  // 前面ポイント
    back: toWorld(backVoxel.x, backVoxel.y, backVoxel.z),      // 後面ポイント
    left: toWorld(leftVoxel.x, leftVoxel.y, leftVoxel.z),      // 左面ポイント
    right: toWorld(rightVoxel.x, rightVoxel.y, rightVoxel.z),  // 右面ポイント
    // 頭部の幅と奥行き（極値ボクセル間の距離）
    width: (rightVoxel.x - leftVoxel.x) * voxelSize,   // 左右の幅
    depth: (backVoxel.y - frontVoxel.y) * voxelSize,    // 前後の奥行き
  };
}

/**
 * Hair の内側接触面5点を計算
 *
 * Bodyの頭部表面5点それぞれに最も近いhairボクセルを探す。
 * これがhairの内側面（頭と接する面）の基準点になる。
 *
 * swap時はこの内側面点をターゲットbodyの表面点に合わせることで
 * 正しい位置・サイズにアライメントされる。
 */
// ヘアモデルの内側接触アンカーポイントを計算する関数
function computeHairAnchors(hairModel, voxelSize, bodyHeadSurfaceVoxels) {
  // ヘアモデルのサイズとボクセルリストを取得
  const { sizeX, sizeY, voxels } = hairModel;
  // ボクセルが空、またはボディの頭部表面データがなければ計算不可
  if (voxels.length === 0 || !bodyHeadSurfaceVoxels) return null;

  // グリッド中心座標
  const cx = sizeX / 2;
  const cy = sizeY / 2;

  // ターゲット座標に最も近いヘアボクセルを見つける関数（ユークリッド距離の二乗で比較）
  function findNearest(targetX, targetY, targetZ) {
    let best = null;       // 最近傍ボクセル
    let bestDist = Infinity; // 最小距離の二乗
    for (const v of voxels) {
      // 各軸の差分を計算
      const dx = v.x - targetX;
      const dy = v.y - targetY;
      const dz = v.z - targetZ;
      // 距離の二乗を計算（sqrtを省略して高速化）
      const dist = dx * dx + dy * dy + dz * dz;
      // これまでの最小距離より近ければ更新
      if (dist < bestDist) {
        bestDist = dist;
        best = v;
      }
    }
    return best;
  }

  // ボディ頭部の各表面点に最も近いヘアボクセルを検索
  const topContact = findNearest(bodyHeadSurfaceVoxels.top.x, bodyHeadSurfaceVoxels.top.y, bodyHeadSurfaceVoxels.top.z);
  const frontContact = findNearest(bodyHeadSurfaceVoxels.front.x, bodyHeadSurfaceVoxels.front.y, bodyHeadSurfaceVoxels.front.z);
  const backContact = findNearest(bodyHeadSurfaceVoxels.back.x, bodyHeadSurfaceVoxels.back.y, bodyHeadSurfaceVoxels.back.z);
  const leftContact = findNearest(bodyHeadSurfaceVoxels.left.x, bodyHeadSurfaceVoxels.left.y, bodyHeadSurfaceVoxels.left.z);
  const rightContact = findNearest(bodyHeadSurfaceVoxels.right.x, bodyHeadSurfaceVoxels.right.y, bodyHeadSurfaceVoxels.right.z);

  // いずれかの接触点が見つからなければ計算不可
  if (!topContact || !frontContact || !backContact || !leftContact || !rightContact) return null;

  // ボクセル座標をワールド座標に変換する関数
  function toWorld(vx, vy, vz) {
    return [
      (vx - cx) * voxelSize,     // X: 中心基準のワールドX
      vz * voxelSize,            // Y: ボクセルZをワールドY（高さ）に
      -(vy - cy) * voxelSize,    // Z: ボクセルYを反転してワールドZ（奥行き）に
    ];
  }

  // 5点の接触アンカーをワールド座標に変換して返す
  return {
    top: toWorld(topContact.x, topContact.y, topContact.z),         // 頭頂接触点
    front: toWorld(frontContact.x, frontContact.y, frontContact.z),  // 前面接触点
    back: toWorld(backContact.x, backContact.y, backContact.z),      // 後面接触点
    left: toWorld(leftContact.x, leftContact.y, leftContact.z),      // 左面接触点
    right: toWorld(rightContact.x, rightContact.y, rightContact.z),  // 右面接触点
    width: (rightContact.x - leftContact.x) * voxelSize,   // ヘア内側の左右幅
    depth: (backContact.y - frontContact.y) * voxelSize,    // ヘア内側の前後奥行き
  };
}

// ========================================================================
// Main: process all characters（メイン処理: 全キャラクターを処理）
// ========================================================================

// キャラクターディレクトリからbody.voxファイルのパスを探す関数
function findBodyVox(charDir) {
  // bodyサブディレクトリのパスを構築
  const bodyDir = path.join(charDir, 'body');
  // bodyディレクトリが存在しなければnull
  if (!fs.existsSync(bodyDir)) return null;
  // body.voxファイルのパスを構築
  const bodyFile = path.join(bodyDir, 'body.vox');
  // ファイルが存在すればパスを返す、なければnull
  if (fs.existsSync(bodyFile)) return bodyFile;
  return null;
}

// parts.jsonからヘア関連のVOXファイルパスを抽出する関数
function findHairVoxFiles(charDir, partsJson) {
  // parts.jsonがなければ空配列
  if (!partsJson) return [];
  // カテゴリが'hair'、またはキーに'hair'を含む（body_hairとis_bodyは除外）パーツをフィルタ
  const hairParts = partsJson.filter(
    p => p.category === 'hair' || (p.key && p.key.includes('hair') && p.key !== 'body_hair' && !p.is_body)
  );
  const result = [];
  for (const hp of hairParts) {
    // hp.fileは"/realistic-darkelf/hair/hair.vox"のような相対パス
    // 性別ディレクトリからの相対パスとして解決する
    const genderDir = path.dirname(charDir);
    const fullPath = path.join(genderDir, hp.file);
    // ファイルが存在すればリストに追加
    if (fs.existsSync(fullPath)) {
      result.push({ key: hp.key, file: fullPath, relFile: hp.file });
    }
  }
  return result;
}

// 1キャラクター分のアンカー計算を実行する関数
function processCharacter(charDir) {
  // grid.jsonとparts.jsonのパスを構築
  const gridFile = path.join(charDir, 'grid.json');
  const partsFile = path.join(charDir, 'parts.json');

  // いずれかが存在しなければスキップ
  if (!fs.existsSync(gridFile) || !fs.existsSync(partsFile)) return null;

  // grid.jsonからボクセルサイズ情報を読み込み
  const grid = JSON.parse(fs.readFileSync(gridFile, 'utf8'));
  // parts.jsonからパーツ情報を読み込み
  const partsJson = JSON.parse(fs.readFileSync(partsFile, 'utf8'));
  // ボクセルサイズを取得
  const voxelSize = grid.voxel_size;

  // 結果オブジェクトを初期化
  const result = { voxel_size: voxelSize };

  // ボディ頭部のアンカーと表面ボクセル（ヘア接触計算用）を算出
  let bodyHeadSurfaceVoxels = null;
  // body.voxファイルのパスを取得
  const bodyVoxPath = findBodyVox(charDir);
  if (bodyVoxPath) {
    try {
      // body.voxを解析
      const bodyModel = parseVox(bodyVoxPath);
      // 頭部のアンカーポイントを計算
      const bodyAnchors = computeBodyHeadAnchors(bodyModel, voxelSize);
      if (bodyAnchors) {
        // 結果にボディ頭部アンカーを格納
        result.body_head = bodyAnchors;

        // ヘア接触検索用に、ボクセル座標系での頭部極値ボクセルを再計算
        let maxZ = 0;
        // 全ボクセルのZ最大値を求める
        for (const v of bodyModel.voxels) {
          if (v.z > maxZ) maxZ = v.z;
        }
        // 頭部領域の下限Z座標（上位12%）
        const headMinZ = Math.floor(maxZ * 0.88);
        // 頭部ボクセルをフィルタリング
        const headVoxels = bodyModel.voxels.filter(v => v.z >= headMinZ);

        // 5方向の極値ボクセルを求める
        let topV = headVoxels[0], frontV = headVoxels[0], backV = headVoxels[0], leftV = headVoxels[0], rightV = headVoxels[0];
        for (const v of headVoxels) {
          if (v.z > topV.z) topV = v;         // 頭頂
          if (v.y < frontV.y) frontV = v;     // 前面
          if (v.y > backV.y) backV = v;       // 後面
          if (v.x < leftV.x) leftV = v;       // 左面
          if (v.x > rightV.x) rightV = v;     // 右面
        }
        // ボクセル座標系での5方向表面ボクセルを保存（ヘアの接触点検索に使用）
        bodyHeadSurfaceVoxels = { top: topV, front: frontV, back: backV, left: leftV, right: rightV };
      }
    } catch (e) {
      // ボディ解析エラー時のログ出力
      console.error(`  Error parsing body: ${e.message}`);
    }
  }

  // ヘアの内側接触アンカーポイントを計算
  const hairFiles = findHairVoxFiles(charDir, partsJson);
  if (hairFiles.length > 0) {
    // ヘアアンカーの格納用オブジェクトを初期化
    result.hairs = {};
    for (const hf of hairFiles) {
      try {
        // ヘアVOXファイルを解析
        const hairModel = parseVox(hf.file);
        // ボディ頭部表面ボクセルに対するヘアの接触アンカーを計算
        const hairAnchors = computeHairAnchors(hairModel, voxelSize, bodyHeadSurfaceVoxels);
        if (hairAnchors) {
          // ヘアキーごとにアンカーを格納
          result.hairs[hf.key] = hairAnchors;
        }
      } catch (e) {
        // ヘア解析エラー時のログ出力
        console.error(`  Error parsing hair ${hf.key}: ${e.message}`);
      }
    }
  }

  // 計算結果を返す
  return result;
}

// 処理カウンターの初期化
let totalProcessed = 0;   // 処理対象キャラクター数
let totalGenerated = 0;   // アンカーJSON生成成功数

// female/maleの両性別ディレクトリを処理
for (const gender of ['female', 'male']) {
  // 性別ディレクトリのパスを構築
  const genderDir = path.join(VOX_BASE, gender);
  // ディレクトリが存在しなければスキップ
  if (!fs.existsSync(genderDir)) continue;

  // 性別ヘッダーを表示
  console.log(`\n=== ${gender.toUpperCase()} ===`);

  // 性別ディレクトリ内の各キャラクターフォルダをソートして処理
  for (const charName of fs.readdirSync(genderDir).sort()) {
    // キャラクターディレクトリのフルパス
    const charDir = path.join(genderDir, charName);
    // ディレクトリでなければスキップ
    if (!fs.statSync(charDir).isDirectory()) continue;

    // parts.jsonが存在しないキャラクターはスキップ
    const partsFile = path.join(charDir, 'parts.json');
    if (!fs.existsSync(partsFile)) continue;

    // 処理カウンターをインクリメント
    totalProcessed++;
    // 処理中のキャラクター名を表示
    console.log(`Processing: ${gender}/${charName}`);

    // キャラクターのアンカーポイントを計算
    const anchors = processCharacter(charDir);
    // ボディ頭部アンカーまたはヘアアンカーが存在する場合
    if (anchors && (anchors.body_head || (anchors.hairs && Object.keys(anchors.hairs).length > 0))) {
      // hair_anchors.jsonとして保存
      const outFile = path.join(charDir, 'hair_anchors.json');
      fs.writeFileSync(outFile, JSON.stringify(anchors, null, 2));
      // 生成成功カウンターをインクリメント
      totalGenerated++;
      console.log(`  -> hair_anchors.json written`);
      // ボディ頭部のサイズ情報を表示
      if (anchors.body_head) {
        console.log(`     body head: width=${anchors.body_head.width.toFixed(4)}, depth=${anchors.body_head.depth.toFixed(4)}`);
      }
      // 各ヘアのサイズ情報を表示
      if (anchors.hairs) {
        for (const [k, h] of Object.entries(anchors.hairs)) {
          console.log(`     hair "${k}": width=${h.width.toFixed(4)}, depth=${h.depth.toFixed(4)}`);
        }
      }
    } else {
      // アンカーが生成できなかった場合
      console.log(`  -> skipped (no body or hair)`);
    }
  }
}

// 最終結果サマリーを表示（生成成功数/処理対象数）
console.log(`\nDone: ${totalGenerated}/${totalProcessed} characters processed.`);
