/** キャッシュ: 一度取得したらメモリに保持 */
let cachedPlayers: Record<string, Record<string, unknown>> | null = null;

/**
 * 選手データをアップロード（no-op: ローカルデータのため不要）
 */
export async function uploadPlayers(
  _players: Record<string, unknown>[]
): Promise<number> {
  return _players.length;
}

/**
 * 全選手データを取得（/data/playerData.json から）
 * @returns ID -> PlayerData のマップ
 */
export async function fetchAllPlayers(): Promise<Record<string, Record<string, unknown>>> {
  if (cachedPlayers) return cachedPlayers;

  const res = await fetch('/data/playerData.json');
  if (!res.ok) throw new Error(`Failed to fetch playerData.json: ${res.status}`);
  const arr: Record<string, unknown>[] = await res.json();

  const players: Record<string, Record<string, unknown>> = {};
  for (const item of arr) {
    const id = String(item.ID);
    players[id] = item;
  }

  cachedPlayers = players;
  return players;
}

/**
 * 特定の選手データを取得
 * @param playerId 選手ID
 */
export async function fetchPlayer(
  playerId: string
): Promise<Record<string, unknown> | undefined> {
  const all = await fetchAllPlayers();
  return all[playerId];
}
