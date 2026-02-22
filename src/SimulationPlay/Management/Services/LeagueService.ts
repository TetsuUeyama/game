// ===== 型定義 =====

/** players サブコレクションに保存する選手データ */
export interface LeaguePlayer {
  id: string;          // このドキュメントのID (player_0, player_1, ...)
  playerId: string;    // masterData選手参照ID
  lastName: string;
  firstName: string;
  grade: number;       // 1-4 (1年生〜4年生)
  teamId: string;      // 所属チーム (team_0, team_1, ...)
}

/** league サブコレクションに保存するチームデータ */
export interface LeagueTeam {
  id: string;             // このドキュメントのID (team_0, team_1, ...)
  universityIndex: number;
  teamNameIndex: number;
  universityName: string;
  teamNameLabel: string;
  isMyTeam: boolean;
  playerIds: string[];    // players サブコレクションのID参照
}

// ===== インメモリストア =====

const leagueTeamsStore = new Map<string, LeagueTeam[]>();
const leaguePlayersStore = new Map<string, Record<string, LeaguePlayer>>();

// ===== ユーティリティ =====

function shuffle<T>(array: T[]): T[] {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function buildNamePool(
  lastNames: string[],
  firstNames: string[],
  count: number
): { lastName: string; firstName: string }[] {
  const usedKeys = new Set<string>();
  const pool: { lastName: string; firstName: string }[] = [];
  const shuffledLast = shuffle(lastNames);
  const shuffledFirst = shuffle(firstNames);

  for (let i = 0; i < count; i++) {
    const last = shuffledLast[i % shuffledLast.length];
    const first = shuffledFirst[i % shuffledFirst.length];
    const key = `${last}_${first}`;
    if (!usedKeys.has(key)) {
      usedKeys.add(key);
      pool.push({ lastName: last, firstName: first });
    }
  }
  return pool;
}

// ===== リーグ生成 =====

/**
 * チーム1つ分の選手を生成（仮ロジック: ランダム選出）
 * 各学年3〜5人、計12〜20人
 */
function createTeamPlayers(
  teamId: string,
  availableIds: string[],
  namePool: { lastName: string; firstName: string }[],
  playerCounter: { value: number }
): LeaguePlayer[] {
  const players: LeaguePlayer[] = [];
  for (let grade = 1; grade <= 4; grade++) {
    const count = 3 + Math.floor(Math.random() * 3);
    for (let i = 0; i < count; i++) {
      if (availableIds.length === 0 || namePool.length === 0) break;
      const idx = Math.floor(Math.random() * availableIds.length);
      const namePair = namePool.shift()!;
      const id = `player_${playerCounter.value++}`;
      players.push({
        id,
        playerId: availableIds[idx],
        lastName: namePair.lastName,
        firstName: namePair.firstName,
        grade,
        teamId,
      });
      availableIds.splice(idx, 1);
    }
  }
  return players;
}

/**
 * リーグを生成しメモリに保存
 */
export async function generateLeague(
  userId: string,
  myUniversity: string,
  myTeamName: string,
  universities: string[],
  teamNames: string[],
  allPlayerIds: string[],
  firstNames: string[],
  lastNames: string[]
): Promise<void> {
  const TEAM_COUNT = 120;
  const MAX_PLAYERS = TEAM_COUNT * 20;

  const myUniIndex = universities.indexOf(myUniversity);
  const myTeamIndex = teamNames.indexOf(myTeamName);

  const otherUniIndices = shuffle(
    Array.from({ length: universities.length }, (_, i) => i)
      .filter((i) => i !== myUniIndex)
  ).slice(0, TEAM_COUNT - 1);

  const shuffledTeamIndices = shuffle(
    Array.from({ length: teamNames.length }, (_, i) => i)
  );

  const playerPool = shuffle([...allPlayerIds]);
  const namePool = buildNamePool(lastNames, firstNames, MAX_PLAYERS);
  const playerCounter = { value: 0 };

  // チーム & 選手データを構築
  const allTeams: LeagueTeam[] = [];
  const allPlayers: Record<string, LeaguePlayer> = {};

  // 自チーム
  {
    const teamId = 'team_0';
    const players = createTeamPlayers(teamId, playerPool, namePool, playerCounter);
    for (const p of players) allPlayers[p.id] = p;
    allTeams.push({
      id: teamId,
      universityIndex: myUniIndex,
      teamNameIndex: myTeamIndex,
      universityName: myUniversity,
      teamNameLabel: myTeamName,
      isMyTeam: true,
      playerIds: players.map((p) => p.id),
    });
  }

  // 残り119チーム
  for (let i = 0; i < TEAM_COUNT - 1; i++) {
    const teamId = `team_${i + 1}`;
    const uniIdx = otherUniIndices[i];
    const teamIdx = shuffledTeamIndices[i % shuffledTeamIndices.length];
    const players = createTeamPlayers(teamId, playerPool, namePool, playerCounter);
    for (const p of players) allPlayers[p.id] = p;
    allTeams.push({
      id: teamId,
      universityIndex: uniIdx,
      teamNameIndex: teamIdx,
      universityName: universities[uniIdx],
      teamNameLabel: teamNames[teamIdx],
      isMyTeam: false,
      playerIds: players.map((p) => p.id),
    });
  }

  // メモリに保存
  leagueTeamsStore.set(userId, allTeams);
  leaguePlayersStore.set(userId, allPlayers);
}

// ===== データ取得 =====

/**
 * リーグチーム一覧を取得（自チーム先頭、大学名順）
 */
export async function fetchLeagueTeams(
  userId: string
): Promise<LeagueTeam[]> {
  const teams = leagueTeamsStore.get(userId) ?? [];
  return [...teams].sort((a, b) => {
    if (a.isMyTeam) return -1;
    if (b.isMyTeam) return 1;
    return a.universityName.localeCompare(b.universityName, 'ja');
  });
}

/**
 * 全選手データを取得（ID → LeaguePlayer のマップ）
 */
export async function fetchLeaguePlayers(
  userId: string
): Promise<Record<string, LeaguePlayer>> {
  return leaguePlayersStore.get(userId) ?? {};
}
