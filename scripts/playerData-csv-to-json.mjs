/**
 * playerData.csv to JSON変換スクリプト
 * サッカー選手データCSVをJSON形式に変換します
 *
 * 使い方:
 * 1. エクセルで選手データを編集
 * 2. 「名前を付けて保存」→「CSV UTF-8 (*.csv)」形式で保存
 *    保存先: public/data/playerData.csv
 * 3. このスクリプトを実行: node scripts/playerData-csv-to-json.mjs
 * 4. public/data/playerData.json が自動生成されます
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// ES Modulesで __dirname を再現
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ファイルパス
const csvPath = path.join(__dirname, '../public/data/playerData.csv');
const jsonPath = path.join(__dirname, '../public/data/playerData.json');

/**
 * CSVファイルを読み込んでJSONに変換
 */
function convertCsvToJson() {
  try {
    console.log('playerData.csv to JSON変換を開始します...');
    console.log(`入力: ${csvPath}`);
    console.log(`出力: ${jsonPath}`);

    // CSVファイルを読み込む
    if (!fs.existsSync(csvPath)) {
      console.error(`エラー: CSVファイルが見つかりません: ${csvPath}`);
      console.log('\nエクセルファイルをCSV形式で保存してください:');
      console.log('1. エクセルで「名前を付けて保存」を選択');
      console.log('2. ファイルの種類で「CSV UTF-8 (*.csv)」を選択');
      console.log(`3. 保存先: ${csvPath}`);
      process.exit(1);
    }

    // UTF-8で読み込み（BOM対応）
    let csvData = fs.readFileSync(csvPath, 'utf-8');

    // BOM（Byte Order Mark）を削除
    if (csvData.charCodeAt(0) === 0xFEFF) {
      csvData = csvData.slice(1);
    }

    const lines = csvData.split('\n').filter(line => line.trim() !== '');

    if (lines.length < 2) {
      console.error('エラー: CSVファイルにデータがありません（ヘッダー行とデータ行が必要です）');
      process.exit(1);
    }

    // ヘッダー行を解析
    const headers = parseCSVLine(lines[0]);
    console.log(`\nカラム数: ${headers.length}`);
    console.log('検出されたカラム（最初の10個）:', headers.slice(0, 10).join(', '), '...');

    // データ行を解析
    const players = [];
    for (let i = 1; i < lines.length; i++) {
      const values = parseCSVLine(lines[i]);

      if (values.length !== headers.length) {
        console.warn(`警告: ${i}行目のカラム数が一致しません（期待: ${headers.length}, 実際: ${values.length}）- スキップします`);
        continue;
      }

      const player = {};
      for (let j = 0; j < headers.length; j++) {
        const key = headers[j];
        let value = values[j];

        // 空文字の場合はスキップ
        if (value === '') {
          continue;
        }

        // 数値に変換できる場合は数値型に（IDとNAMEは除外）
        if (key !== 'ID' && key !== 'NAME' && key !== 'PositionMain' &&
            key !== 'Position2' && key !== 'Position3' && key !== 'Position4' &&
            key !== 'Position5' && key !== 'side' && key !== 'Position' &&
            key !== 'dominanthand' && !key.startsWith('specialabilitiy') &&
            !isNaN(value)) {
          value = parseFloat(value);
        }

        player[key] = value;
      }

      // IDが必須
      if (!player.ID) {
        console.warn(`警告: ${i}行目にはIDがないためスキップします`);
        continue;
      }

      players.push(player);
    }

    console.log(`\n${players.length}人の選手データを変換しました`);

    // JSONファイルとして保存（インデント付き）
    fs.writeFileSync(jsonPath, JSON.stringify(players, null, 2), 'utf-8');
    console.log(`\n✓ 変換完了: ${jsonPath}`);
    console.log('\n変換された選手（最初の10人）:');
    players.slice(0, 10).forEach(player => {
      console.log(`  - ID:${player.ID} ${player.NAME || '(名前なし)'} (${player.PositionMain || 'ポジション不明'})`);
    });

    if (players.length > 10) {
      console.log(`  ... 他 ${players.length - 10} 人`);
    }

  } catch (error) {
    console.error('エラーが発生しました:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

/**
 * CSV行をパースする（カンマ区切り、ダブルクォート対応）
 */
function parseCSVLine(line) {
  const values = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (char === '"') {
      // ダブルクォートの開始/終了
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      // カンマ（クォート外）→ 次のフィールドへ
      values.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }

  // 最後のフィールド
  values.push(current.trim());

  // クォートを除去
  return values.map(v => v.replace(/^"|"$/g, ''));
}

// スクリプト実行
convertCsvToJson();
