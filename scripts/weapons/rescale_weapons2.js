// child_processモジュールからexecSyncをインポート
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
// リスケール倍率
const SCALE = "0.5";

// リスケール対象のカテゴリ（斧と大鎌のみ）
const CATEGORIES = ["axes", "scythes"];

// 武器リストを構築
const weapons = [];
for (const cat of CATEGORIES) {
  const catDir = path.join(OUT_BASE, cat);
  // カテゴリディレクトリが存在しなければスキップ
  if (!fs.existsSync(catDir)) continue;
  // カテゴリ内の各武器ディレクトリを走査
  for (const weapon of fs.readdirSync(catDir)) {
    const wDir = path.join(catDir, weapon);
    // ディレクトリでなければスキップ
    if (!fs.statSync(wDir).isDirectory()) continue;
    // 安全な名前からソースファイル名を復元（アンダースコア→スペース）
    let sourceName = weapon.replace(/_/g, ' ');
    // grid.jsonにソース名が記録されていればそれを使用
    const gridFile = path.join(wDir, 'grid.json');
    if (fs.existsSync(gridFile)) {
      const g = JSON.parse(fs.readFileSync(gridFile, 'utf8'));
      if (g.source) sourceName = g.source;
    }
    // parts.jsonにソース名が記録されていればそれを使用
    const partsFile = path.join(wDir, 'parts.json');
    if (fs.existsSync(partsFile)) {
      try {
        const p = JSON.parse(fs.readFileSync(partsFile, 'utf8'));
        if (p.source) sourceName = p.source;
      } catch(e) {} // パースエラーは無視
    }
    // 武器情報をリストに追加
    weapons.push({ cat, safeName: weapon, sourceName, outDir: wDir });
  }
}

// 処理開始メッセージ
console.log(`=== Rescaling ${weapons.length} weapons (axes, scythes) at scale=${SCALE} ===\n`);

// 成功/失敗カウンター
let success = 0, fail = 0;

// 各武器を再ボクセル化
for (const { cat, safeName, sourceName, outDir } of weapons) {
  // ソースGLBファイルのパス
  const glb = path.join(SRC_DIR, sourceName + '.glb');
  // GLBが存在しなければスキップ
  if (!fs.existsSync(glb)) { console.log(`SKIP: ${sourceName}`); fail++; continue; }

  // 既存のVOXとJSONファイルを削除（再生成のため）
  for (const f of fs.readdirSync(outDir)) {
    if (f.endsWith('.vox') || f.endsWith('.json')) fs.unlinkSync(path.join(outDir, f));
  }

  // 進捗を表示
  console.log(`[${success+fail+1}/${weapons.length}] ${cat}/${safeName}`);
  try {
    // Blenderで武器をリスケール付きでボクセル化
    const cmd = `"${BLENDER}" --background --python "${SCRIPT}" -- "${glb}" "${outDir}" 0.007 ${SCALE}`;
    const out = execSync(cmd, { timeout: 120000, encoding: 'utf8' });
    // 出力から重要な行をフィルタして表示
    const lines = out.split('\n').filter(l => l.includes('Generated') || l.includes('Written'));
    lines.forEach(l => console.log('  ' + l.trim()));
    success++;
  } catch(e) {
    // エラー時はメッセージの先頭200文字を表示
    console.log(`  ERROR: ${e.message.slice(0, 200)}`);
    fail++;
  }
}

// 最終結果サマリー
console.log(`\n=== Done! Success: ${success}, Failed: ${fail} ===`);
