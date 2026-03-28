// ファイルシステムモジュール
const fs = require('fs');
// パス操作モジュール
const path = require('path');

// 武器VOXファイルのベースディレクトリ
const BASE = String.raw`C:\Users\user\developsecond\game-assets\wapons`;

// 指定ディレクトリ内のVOXファイルを再帰的に検索する関数
function findVoxFiles(dir) {
  const results = [];
  // ディレクトリ内のエントリを走査
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    // ディレクトリなら再帰的に検索
    if (entry.isDirectory()) results.push(...findVoxFiles(full));
    // .voxファイルならリストに追加
    else if (entry.name.endsWith('.vox')) results.push(full);
  }
  return results;
}

// 全VOXファイルを検索
const voxFiles = findVoxFiles(BASE);
// トランケーションされたファイル数のカウンター
let truncCount = 0;

// 各VOXファイルをチェック
for (const f of voxFiles) {
  // ファイルをバイナリとして読み込み
  const buf = fs.readFileSync(f);
  // マジックナンバー(4B)+バージョン(4B)をスキップしてオフセット8から開始
  let i = 8;
  // チャンクを走査してSIZEチャンクを探す
  while (i < buf.length - 12) {
    // チャンクIDを読み取り
    const id = buf.toString('ascii', i, i + 4);
    // コンテンツサイズを読み取り
    const contentSize = buf.readUInt32LE(i + 4);
    // 子チャンクサイズを読み取り
    const childSize = buf.readUInt32LE(i + 8);
    // SIZEチャンクが見つかった場合
    if (id === 'SIZE') {
      // X, Y, Zサイズを読み取り
      const sx = buf.readUInt32LE(i + 12);
      const sy = buf.readUInt32LE(i + 16);
      const sz = buf.readUInt32LE(i + 20);
      // いずれかの軸が256以上ならトランケーションの可能性あり
      if (sx >= 256 || sy >= 256 || sz >= 256) {
        // ベースディレクトリからの相対パスを表示
        const rel = path.relative(BASE, f);
        console.log(`TRUNCATED: ${rel}  ${sx}x${sy}x${sz}`);
        truncCount++;
      }
      // SIZEチャンクが見つかったらこのファイルの走査を終了
      break;
    }
    // 次のチャンクへ移動（ヘッダー12B + コンテンツ + 子チャンク）
    i += 12 + contentSize + childSize;
  }
}

// 結果サマリーを表示
if (truncCount === 0) console.log('All vox files are within 256 limit!');
else console.log(`\n${truncCount} file(s) still at 256 limit.`);
