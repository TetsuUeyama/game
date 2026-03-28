// child_processモジュールからexecSyncをインポート（同期的にシェルコマンドを実行）
const { execSync } = require('child_process');
// パス操作モジュール
const path = require('path');

// Blender実行ファイルのパス
const BLENDER = String.raw`C:\Program Files\Blender Foundation\Blender 5.0\blender.exe`;
// 武器構造調査用Pythonスクリプトのパス
const SCRIPT = String.raw`C:\Users\user\developsecond\contactform\scripts\inspect_weapon_structure.py`;
// 武器GLBファイルが格納されているソースディレクトリ
const SRC_DIR = String.raw`C:\Users\user\Downloads\uploads_files_5754997_+100+Fantasy+Weapons+Basemesh+Pack+V1\+100 Fantasy Weapons Basemesh Pack V1\GLB`;

// 調査対象の武器名リスト（以前トランケーション問題があった武器）
const weapons = [
  "Adventurer's Halberd",
  "Adventurer's Spear",
  "Ash Spear",
  "Claymore",
  "Crossed Spear",
  "CurvKatana",
  "Giant Great Ax of the Fallen",
  "Imperial GreatSword",
  "Jagged Spear",
  "LongKatana",
  "Spear of the Fang",
  "Straight Sword",
  "Wyvern's Thorn",
];

// 各武器についてBlenderでPythonスクリプトを実行し、構造を調査
for (const name of weapons) {
  // GLBファイルのフルパスを構築
  const glb = path.join(SRC_DIR, name + '.glb');
  try {
    // Blenderをバックグラウンドモードで起動し、調査スクリプトを実行（タイムアウト60秒）
    const out = execSync(`"${BLENDER}" --background --python "${SCRIPT}" -- "${glb}"`, {
      timeout: 60000, encoding: 'utf8'
    });
    // 出力から調査結果部分のみを抽出（"===="マーカー以降の行）
    const lines = out.split('\n');
    let capture = false;  // キャプチャ開始フラグ
    for (const line of lines) {
      // "===="を含む行が見つかったらキャプチャ開始
      if (line.includes('====')) capture = true;
      // キャプチャ中の行を表示
      if (capture) console.log(line);
    }
    // 武器間の区切り空行
    console.log('');
  } catch(e) {
    // エラー時はエラーメッセージの先頭200文字を表示
    console.log(`ERROR: ${name}: ${e.message.slice(0,200)}`);
  }
}
