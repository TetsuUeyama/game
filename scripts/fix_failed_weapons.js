// child_processモジュールからexecSyncをインポート（同期的にシェルコマンドを実行）
const { execSync } = require('child_process');
// パス操作モジュール
const path = require('path');
// ファイルシステムモジュール
const fs = require('fs');

// Blender実行ファイルのパス
const BLENDER = String.raw`C:\Program Files\Blender Foundation\Blender 5.0\blender.exe`;
// 武器ボクセル化Pythonスクリプトのパス
const SCRIPT = String.raw`C:\Users\user\developsecond\contactform\scripts\voxelize_weapon.py`;
// 武器GLBファイルのソースディレクトリ
const SRC_DIR = String.raw`C:\Users\user\Downloads\uploads_files_5754997_+100+Fantasy+Weapons+Basemesh+Pack+V1\+100 Fantasy Weapons Basemesh Pack V1\GLB`;
// ボクセル化結果の出力ベースディレクトリ
const OUT_BASE = String.raw`C:\Users\user\developsecond\game-assets\wapons`;

// 修正対象の武器リスト [元ファイル名, カテゴリ, 安全なファイル名]
const weapons = [
  ["Adventurer's Spear", "spears", "Adventurers_Spear"],
  ["Executioner's Great Machete", "greatswords", "Executioners_Great_Machete"],
  ["Falconer's White Bow", "bows", "Falconers_White_Bow"],
  ["Knight's Straight Sword", "swords", "Knights_Straight_Sword"],
  ["Knight's Sword", "swords", "Knights_Sword"],
  ["Miner's Pick", "axes", "Miners_Pick"],
  ["Ripper's Harpoon", "spears", "Rippers_Harpoon"],
  ["Ripper's Scythe", "scythes", "Rippers_Scythe"],
  ["Wyvern's Thorn", "swords", "Wyverns_Thorn"],
];

// 成功/失敗カウンター
let success = 0;
let fail = 0;

// 各武器を処理
for (const [name, category, safeName] of weapons) {
  // GLBファイルのフルパスを構築
  const glb = path.join(SRC_DIR, name + '.glb');
  // 出力ディレクトリのパスを構築
  const outDir = path.join(OUT_BASE, category, safeName);
  // 出力ディレクトリを作成（再帰的に、既存なら何もしない）
  fs.mkdirSync(outDir, { recursive: true });

  // 処理中の武器名を表示
  console.log(`Processing: ${name} -> ${category}/${safeName}`);
  try {
    // Blenderをバックグラウンドで起動してボクセル化を実行（タイムアウト120秒）
    const cmd = `"${BLENDER}" --background --python "${SCRIPT}" -- "${glb}" "${outDir}" 0.007`;
    const out = execSync(cmd, { timeout: 120000, encoding: 'utf8' });
    // 出力から重要な行（Generated, Written, Grid）をフィルタして表示
    const lines = out.split('\n').filter(l => l.includes('Generated') || l.includes('Written') || l.includes('Grid:'));
    lines.forEach(l => console.log('  ' + l.trim()));

    // 期待されるVOXファイルパス
    const voxFile = path.join(outDir, safeName + '.vox');
    // VOXファイルが正しい名前で生成されたか確認
    if (fs.existsSync(voxFile)) {
      console.log('  OK');
      success++;
    } else {
      // 別の名前で生成されたVOXファイルを検索
      const files = fs.readdirSync(outDir).filter(f => f.endsWith('.vox'));
      if (files.length > 0) {
        // 見つかったファイルを正しい名前にリネーム
        fs.renameSync(path.join(outDir, files[0]), voxFile);
        console.log('  OK (renamed)');
        success++;
      } else {
        // VOXファイルが全く生成されなかった
        console.log('  FAILED - no vox file');
        fail++;
      }
    }
  } catch(e) {
    // エラー時はメッセージの先頭300文字を表示
    console.log('  ERROR: ' + e.message.slice(0, 300));
    fail++;
  }
}
// 最終結果サマリーを表示
console.log(`\nDone! Success: ${success}, Failed: ${fail}`);
