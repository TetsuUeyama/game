// ファイルシステムモジュール
const fs = require('fs');
// パス操作モジュール
const path = require('path');

// 武器VOXファイルのベースディレクトリ
const BASE = String.raw`C:\Users\user\developsecond\game-assets\wapons`;
// ボクセルサイズ（メートル単位）
const VS = 0.007;

// トランケーションされた武器のリスト
const truncated = [];

// カテゴリディレクトリを走査
for (const cat of fs.readdirSync(BASE).sort()) {
  const catPath = path.join(BASE, cat);
  // ディレクトリでなければスキップ
  if (!fs.statSync(catPath).isDirectory()) continue;

  // カテゴリ内の各武器ディレクトリを走査
  for (const weapon of fs.readdirSync(catPath).sort()) {
    const wPath = path.join(catPath, weapon);
    // ディレクトリでなければスキップ
    if (!fs.statSync(wPath).isDirectory()) continue;

    // grid.jsonファイルのパスを構築
    const gridFile = path.join(wPath, 'grid.json');
    // grid.jsonが存在しなければスキップ
    if (!fs.existsSync(gridFile)) continue;

    // grid.jsonからグリッド情報を読み込み
    const g = JSON.parse(fs.readFileSync(gridFile, 'utf8'));

    // いずれかの軸が256（VOXフォーマットの上限）に達しているかチェック
    const axes = [];
    if (g.gx >= 256) axes.push('X');  // X軸がトランケーション
    if (g.gy >= 256) axes.push('Y');  // Y軸がトランケーション
    if (g.gz >= 256) axes.push('Z');  // Z軸がトランケーション

    // トランケーションが検出された場合
    if (axes.length > 0) {
      // バウンディングボックスから実際のモデルサイズを計算（メートル）
      const actual_w = (g.bb_max[0] - g.bb_min[0]);  // 幅
      const actual_d = (g.bb_max[1] - g.bb_min[1]);  // 奥行き
      const actual_h = (g.bb_max[2] - g.bb_min[2]);  // 高さ
      // クランプなしで必要なグリッドサイズを計算
      const needed_gx = Math.ceil(actual_w / VS) + 2;
      const needed_gy = Math.ceil(actual_d / VS) + 2;
      const needed_gz = Math.ceil(actual_h / VS) + 2;

      // トランケーション情報をリストに追加
      truncated.push({
        cat, weapon,
        grid: `${g.gx}x${g.gy}x${g.gz}`,                                    // 現在のグリッドサイズ
        actual_cm: `${(actual_w*100).toFixed(1)} x ${(actual_d*100).toFixed(1)} x ${(actual_h*100).toFixed(1)}`, // 実際のサイズ（cm）
        needed: `${needed_gx}x${needed_gy}x${needed_gz}`,                    // 必要なグリッドサイズ
        truncAxes: axes.join(','),                                             // トランケーション軸
        actual_h_m: actual_h,                                                  // 実際の高さ（m）
        max_dim: Math.max(actual_w, actual_d, actual_h),                       // 最大寸法（m）
      });
    }
  }
}

// 結果を表示
if (truncated.length === 0) {
  // トランケーションなし
  console.log('No truncated weapons found.');
} else {
  // トランケーションされた武器一覧を表形式で表示
  console.log(`=== ${truncated.length} weapons hitting 256 voxel limit (TRUNCATED) ===\n`);
  // テーブルヘッダー
  console.log('Category'.padEnd(15) + 'Weapon'.padEnd(40) + 'Current Grid'.padEnd(16) + 'Needed Grid'.padEnd(16) + 'Actual Size (cm)'.padEnd(35) + 'Cut Axis');
  console.log('-'.repeat(130));

  // 各トランケーション武器の詳細を表示
  for (const t of truncated) {
    console.log(
      t.cat.padEnd(15) +
      t.weapon.padEnd(40) +
      t.grid.padEnd(16) +
      t.needed.padEnd(16) +
      t.actual_cm.padEnd(35) +
      t.truncAxes
    );
  }

  // 参考情報を表示
  console.log(`\nWith voxel_size=0.007, max representable length = 256 * 0.007 = 1.792m`);
  console.log(`\nLongest actual weapon: ${(Math.max(...truncated.map(t=>t.max_dim))*100).toFixed(1)}cm`);
  console.log(`\nTo fix: either increase voxel_size for these weapons, or split into parts.`);
}
