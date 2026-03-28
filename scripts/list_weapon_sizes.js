// ファイルシステムモジュール
const fs = require('fs');
// パス操作モジュール
const path = require('path');

// 武器VOXファイルのベースディレクトリ
const BASE = String.raw`C:\Users\user\developsecond\game-assets\wapons`;
// 1ボクセルのサイズ（cm単位）: 0.007m = 0.7cm
const VS_CM = 0.7;
// キャラクターの基準身長（cm）: 256ボクセル × 0.7cm ≒ 179.2cm
const CHAR_HEIGHT_CM = 256 * VS_CM;

// 結果格納用配列
const results = [];

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

    // grid.jsonファイルのパス
    const gridFile = path.join(wPath, 'grid.json');
    // grid.jsonが存在しなければスキップ
    if (!fs.existsSync(gridFile)) continue;

    // grid.jsonからグリッド情報を読み込み
    const g = JSON.parse(fs.readFileSync(gridFile, 'utf8'));
    // 各軸のサイズをcmに変換
    const w_cm = (g.gx * VS_CM).toFixed(1);  // 幅（cm）
    const d_cm = (g.gy * VS_CM).toFixed(1);  // 奥行き（cm）
    const h_cm = (g.gz * VS_CM).toFixed(1);  // 高さ（cm）

    // 結果を配列に追加
    results.push({ cat, weapon, gx: g.gx, gy: g.gy, gz: g.gz, w_cm, d_cm, h_cm, voxels: g.voxel_count || 0 });
  }
}

// ヘッダー行を表示
console.log('Category'.padEnd(15) + 'Weapon'.padEnd(45) + 'Grid (WxDxH)'.padEnd(16) + 'Size (WxDxH cm)'.padEnd(30) + 'Voxels');
// 区切り線
console.log('-'.repeat(115));

// 各武器の詳細を表示
for (const r of results) {
  const grid = `${r.gx}x${r.gy}x${r.gz}`;      // グリッドサイズ（ボクセル数）
  const size = `${r.w_cm} x ${r.d_cm} x ${r.h_cm}`; // 実寸サイズ（cm）
  console.log(r.cat.padEnd(15) + r.weapon.padEnd(45) + grid.padEnd(16) + size.padEnd(30) + r.voxels);
}

// カテゴリ別のサイズサマリー
console.log('\n=== Size Summary by Category ===');
console.log('(Height = weapon length along longest axis, compared to character ~179cm)\n');

// カテゴリごとにグループ化
const cats = {};
for (const r of results) {
  if (!cats[r.cat]) cats[r.cat] = [];
  cats[r.cat].push(r);
}

// 各カテゴリの統計情報を表示
for (const [cat, items] of Object.entries(cats).sort()) {
  // 高さ（cm）の配列を取得
  const heights = items.map(i => parseFloat(i.h_cm));
  // 幅（cm）の配列を取得
  const widths = items.map(i => parseFloat(i.w_cm));
  // 最小・最大・平均の高さを計算
  const minH = Math.min(...heights).toFixed(1);
  const maxH = Math.max(...heights).toFixed(1);
  const avgH = (heights.reduce((a,b)=>a+b,0) / heights.length).toFixed(1);
  // カテゴリ統計を表示（アイテム数、高さ範囲、キャラクター比）
  console.log(`${cat.padEnd(15)} ${items.length} items | height: ${minH}~${maxH}cm (avg ${avgH}cm) | vs char: ${(avgH/179.2*100).toFixed(0)}%`);
}

// 基準情報を表示
console.log(`\nCharacter reference height: ${CHAR_HEIGHT_CM.toFixed(1)}cm (256 voxels x 0.7cm)`);
// 総武器数を表示
console.log(`Total weapons: ${results.length}`);
