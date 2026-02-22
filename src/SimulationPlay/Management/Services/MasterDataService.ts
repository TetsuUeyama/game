type MasterKey = 'firstNames' | 'lastNames' | 'teams' | 'universities';

const KEY_TO_FILE: Record<MasterKey, string> = {
  firstNames: 'FirstName.csv',
  lastNames: 'LastName.csv',
  teams: 'Team.csv',
  universities: 'University.csv',
};

/**
 * マスターデータをアップロード（no-op: ローカルデータのため不要）
 */
export async function uploadMasterData(
  _key: MasterKey,
  _items: string[]
): Promise<void> {
  // no-op
}

/**
 * マスターデータを取得（CSVファイルから）
 * @param key マスターデータのキー
 * @returns 文字列配列
 */
export async function fetchMasterData(key: MasterKey): Promise<string[]> {
  const fileName = KEY_TO_FILE[key];
  const res = await fetch(`/data/${fileName}`);
  if (!res.ok) return [];
  const text = await res.text();
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

/**
 * 全マスターデータを並列取得
 */
export async function fetchAllMasterData(): Promise<{
  firstNames: string[];
  lastNames: string[];
  teams: string[];
  universities: string[];
}> {
  const [firstNames, lastNames, teams, universities] = await Promise.all([
    fetchMasterData('firstNames'),
    fetchMasterData('lastNames'),
    fetchMasterData('teams'),
    fetchMasterData('universities'),
  ]);
  return { firstNames, lastNames, teams, universities };
}
