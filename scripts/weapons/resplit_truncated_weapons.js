// child_processモジュールからexecSyncをインポート
const { execSync } = require('child_process');
// パス操作モジュール
const path = require('path');
// ファイルシステムモジュール
const fs = require('fs');

// Blender実行ファイルのパス
const BLENDER = String.raw`C:\Program Files\Blender Foundation\Blender 5.0\blender.exe`;
// 武器分割ボクセル化Pythonスクリプトのパス
const SCRIPT = String.raw`C:\Users\user\developsecond\contactform\scripts\voxelize_weapon_split.py`;
// 武器GLBファイルのソースディレクトリ
const SRC_DIR = String.raw`C:\Users\user\Downloads\uploads_files_5754997_+100+Fantasy+Weapons+Basemesh+Pack+V1\+100 Fantasy Weapons Basemesh Pack V1\GLB`;
// ボクセル化結果の出力ベースディレクトリ
const OUT_BASE = String.raw`C:\Users\user\developsecond\game-assets\wapons`;

// 全13個のトランケーション武器リスト [ファイル名, カテゴリ, 安全なファイル名]
const weapons = [
  ["Giant Great Ax of the Fallen", "axes", "Giant_Great_Ax_of_the_Fallen"],
  ["Claymore", "greatswords", "Claymore"],
  ["Imperial GreatSword", "greatswords", "Imperial_GreatSword"],
  ["Adventurer's Halberd", "halberds", "Adventurers_Halberd"],
  ["CurvKatana", "katanas", "CurvKatana"],
  ["LongKatana", "katanas", "LongKatana"],
  ["Adventurer's Spear", "spears", "Adventurers_Spear"],
  ["Ash Spear", "spears", "Ash_Spear"],
  ["Crossed Spear", "spears", "Crossed_Spear"],
  ["Jagged Spear", "spears", "Jagged_Spear"],
  ["Spear of the Fang", "spears", "Spear_of_the_Fang"],
  ["Straight Sword", "swords", "Straight_Sword"],
  ["Wyvern's Thorn", "swords", "Wyverns_Thorn"],
];

// 成功/失敗カウンター
let success = 0;
let fail = 0;

// 各武器を分割ボクセル化
for (const [name, category, safeName] of weapons) {
  // GLBファイルのフルパス
  const glb = path.join(SRC_DIR, name + '.glb');
  // 出力ディレクトリのパス
  const outDir = path.join(OUT_BASE, category, safeName);

  // 進捗を表示
  console.log(`\n[${success + fail + 1}/${weapons.length}] ${name} -> ${category}/${safeName}`);

  // 古い単一VOXファイルが存在すれば削除
  const oldVox = path.join(outDir, safeName + '.vox');
  if (fs.existsSync(oldVox)) {
    fs.unlinkSync(oldVox);
    console.log(`  Removed old: ${safeName}.vox`);
  }

  // 古い分割ディレクトリが存在すれば削除
  const splitDir = outDir + '_split';
  if (fs.existsSync(splitDir)) {
    fs.rmSync(splitDir, { recursive: true });
    console.log(`  Removed old split dir`);
  }

  // 出力ディレクトリを作成
  fs.mkdirSync(outDir, { recursive: true });

  try {
    // Blenderで分割ボクセル化スクリプトを実行（タイムアウト120秒）
    const cmd = `"${BLENDER}" --background --python "${SCRIPT}" -- "${glb}" "${outDir}" 0.007`;
    const out = execSync(cmd, { timeout: 120000, encoding: 'utf8' });

    // 出力から重要な行をフィルタして表示
    const lines = out.split('\n').filter(l =>
      l.includes('Split point') || l.includes('Handle:') || l.includes('Blade:') ||
      l.includes('Generated') || l.includes('Written') || l.includes('Grid:') ||
      l.includes('parts generated')
    );
    lines.forEach(l => console.log('  ' + l.trim()));

    // 出力結果を検証（ハンドルとブレードのVOXファイルが生成されたか）
    const handleVox = fs.readdirSync(outDir).filter(f => f.endsWith('_handle.vox'));
    const bladeVox = fs.readdirSync(outDir).filter(f => f.endsWith('_blade.vox'));
    if (handleVox.length > 0 && bladeVox.length > 0) {
      // 両方生成された場合
      console.log(`  OK: handle + blade`);
      success++;
    } else {
      // 片方のみ生成された場合（部分的成功）
      console.log(`  PARTIAL: handle=${handleVox.length}, blade=${bladeVox.length}`);
      success++;
    }
  } catch (e) {
    // エラー時はメッセージの先頭300文字を表示
    console.log(`  ERROR: ${e.message.slice(0, 300)}`);
    fail++;
  }
}

// 最終結果サマリー
console.log(`\n=== Summary ===`);
console.log(`Success: ${success}, Failed: ${fail}`);
