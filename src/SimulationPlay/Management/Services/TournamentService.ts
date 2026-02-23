import { LeagueTeam } from '@/SimulationPlay/Management/Services/LeagueService';

// ===== 型定義 =====

export interface TournamentEntry {
  label: string;
  division: number;
  isMyTeam: boolean;
  source?: string;
}

export interface TournamentMatch {
  team1: TournamentEntry | null;
  team2: TournamentEntry | null;
  isBye: boolean;
}

export interface PreliminaryRound {
  matches: TournamentMatch[];
  byeTeam?: TournamentEntry;
}

export interface PreliminaryBlock {
  blockLabel: string;          // "A"〜"P"
  seedType: '1部' | '2部';
  teams: TournamentEntry[];    // seed順（index 0 = top seed）
  rounds: PreliminaryRound[];  // 3ラウンド
}

export interface TournamentRound {
  label: string;
  matches: TournamentMatch[];
}

export interface TournamentData {
  blocks: PreliminaryBlock[];
  finalRounds: TournamentRound[];
}

// ===== 定数 =====

const BLOCK_LABELS = 'ABCDEFGHIJKLMNOP'.split('');

// ===== ヘルパー =====

function teamToEntry(team: LeagueTeam, division: number): TournamentEntry {
  return {
    label: team.universityName,
    division,
    isMyTeam: team.isMyTeam,
  };
}

function makePlaceholder(source: string): TournamentEntry {
  return { label: source, division: 0, isMyTeam: false, source };
}

// ===== ユーティリティ =====

function shuffle<T>(array: T[]): T[] {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// ===== メイン =====

/**
 * 120チームトーナメントを構築。
 *
 * 予選（3回戦制・16ブロック）:
 *   ブロック A〜H（1部ブロック）: 1部 + 4部（確定）+ 抽選5チーム = 7チーム（1部はR1 bye）
 *   ブロック I〜P（2部ブロック）: 2部 + 3部（確定）+ 抽選6チーム = 8チーム
 *   抽選プール: 5部〜15部（88チーム）→ 1部ブロックに40, 2部ブロックに48
 *   各ブロック1チーム勝ち上がり → 16チーム
 *
 * 決勝トーナメント（4回戦制）:
 *   1回戦: 16 → 8（1部ブロック勝者 vs 2部ブロック勝者）
 *   準々決勝〜決勝
 */
export function buildTournamentData(leagueTeams: LeagueTeam[]): TournamentData {
  const TEAMS_PER_DIVISION = 8;

  // 部ごとに分割
  const divEntries: TournamentEntry[][] = [];
  for (let i = 0; i < leagueTeams.length; i += TEAMS_PER_DIVISION) {
    const div = i / TEAMS_PER_DIVISION + 1;
    divEntries.push(
      leagueTeams.slice(i, i + TEAMS_PER_DIVISION).map((t) => teamToEntry(t, div))
    );
  }

  const div1 = divEntries[0] ?? []; // 1部（確定: 1部ブロック）
  const div2 = divEntries[1] ?? []; // 2部（確定: 2部ブロック）
  const div3 = divEntries[2] ?? []; // 3部（確定: 2部ブロック）
  const div4 = divEntries[3] ?? []; // 4部（確定: 1部ブロック）

  // 抽選プール: 5部〜15部 = 88チーム
  const lotteryPool = shuffle(divEntries.slice(4).flat());
  // 1部ブロック用: 40チーム(5/block), 2部ブロック用: 48チーム(6/block)
  const lottery1 = lotteryPool.slice(0, 40);
  const lottery2 = lotteryPool.slice(40, 88);

  // --- 予選ブロック構築 ---
  const blocks: PreliminaryBlock[] = [];

  // ブロック A〜H: 1部ブロック（7チーム: 1部 + 4部 + 抽選5）
  for (let b = 0; b < 8; b++) {
    const teams: TournamentEntry[] = [
      div1[b],
      div4[b],
      ...lottery1.slice(b * 5, b * 5 + 5),
    ];
    // seed順にソート（部番号が小さいほど上位）
    teams.sort((a, c) => a.division - c.division);
    blocks.push({
      blockLabel: BLOCK_LABELS[b],
      seedType: '1部',
      teams,
      rounds: build7TeamBracket(teams),
    });
  }

  // ブロック I〜P: 2部ブロック（8チーム: 2部 + 3部 + 抽選6）
  for (let b = 0; b < 8; b++) {
    const teams: TournamentEntry[] = [
      div2[b],
      div3[b],
      ...lottery2.slice(b * 6, b * 6 + 6),
    ];
    teams.sort((a, c) => a.division - c.division);
    blocks.push({
      blockLabel: BLOCK_LABELS[8 + b],
      seedType: '2部',
      teams,
      rounds: build8TeamBracket(teams),
    });
  }

  // --- 決勝トーナメント ---
  const finalRounds = buildFinalRounds(blocks);

  return { blocks, finalRounds };
}

// ===== 7チームブラケット（1部ブロック） =====

/**
 * teams[0] = 1部(top seed, R1 bye)
 * teams[1..6] = 10部〜15部（seed順: 小さい部番号ほど上位）
 *
 * R1 (3試合 + bye):
 *   seed2 vs seed7, seed3 vs seed6, seed4 vs seed5
 *   seed1(1部) → bye
 * R2 (2試合):
 *   seed1(bye通過) vs R1①勝者
 *   R1②勝者 vs R1③勝者
 * R3 (決勝):
 *   R2①勝者 vs R2②勝者
 */
function build7TeamBracket(teams: TournamentEntry[]): PreliminaryRound[] {
  const t = teams;
  return [
    {
      byeTeam: t[0],
      matches: [
        { team1: t[1], team2: t[6], isBye: false },
        { team1: t[2], team2: t[5], isBye: false },
        { team1: t[3], team2: t[4], isBye: false },
      ],
    },
    {
      matches: [
        { team1: t[0], team2: makePlaceholder('1回戦①勝者'), isBye: false },
        { team1: makePlaceholder('1回戦②勝者'), team2: makePlaceholder('1回戦③勝者'), isBye: false },
      ],
    },
    {
      matches: [
        { team1: makePlaceholder('2回戦①勝者'), team2: makePlaceholder('2回戦②勝者'), isBye: false },
      ],
    },
  ];
}

// ===== 8チームブラケット（2部ブロック） =====

/**
 * teams[0] = 2部(top seed)
 * teams[1..7] = 3部〜9部（seed順）
 *
 * R1 (4試合, 標準シード):
 *   seed1(2部) vs seed8, seed4 vs seed5, seed3 vs seed6, seed2 vs seed7
 * R2 (2試合):
 *   R1①勝者 vs R1②勝者, R1③勝者 vs R1④勝者
 * R3 (決勝):
 *   R2①勝者 vs R2②勝者
 */
function build8TeamBracket(teams: TournamentEntry[]): PreliminaryRound[] {
  const t = teams;
  return [
    {
      matches: [
        { team1: t[0], team2: t[7], isBye: false },
        { team1: t[3], team2: t[4], isBye: false },
        { team1: t[2], team2: t[5], isBye: false },
        { team1: t[1], team2: t[6], isBye: false },
      ],
    },
    {
      matches: [
        { team1: makePlaceholder('1回戦①勝者'), team2: makePlaceholder('1回戦②勝者'), isBye: false },
        { team1: makePlaceholder('1回戦③勝者'), team2: makePlaceholder('1回戦④勝者'), isBye: false },
      ],
    },
    {
      matches: [
        { team1: makePlaceholder('2回戦①勝者'), team2: makePlaceholder('2回戦②勝者'), isBye: false },
      ],
    },
  ];
}

// ===== 決勝トーナメント（16チーム） =====

/**
 * 16ブロック勝者 → 標準16シード配置
 * seeds 1-8: 1部ブロック(A-H)勝者
 * seeds 9-16: 2部ブロック(I-P)勝者
 *
 * 1回戦で1部勝者 vs 2部勝者が対戦するようにシード配置:
 *   M1: seed1 vs seed16, M2: seed8 vs seed9,
 *   M3: seed5 vs seed12, M4: seed4 vs seed13,
 *   M5: seed3 vs seed14, M6: seed6 vs seed11,
 *   M7: seed7 vs seed10, M8: seed2 vs seed15
 */
function buildFinalRounds(blocks: PreliminaryBlock[]): TournamentRound[] {
  // seeds[0..15]: block index 順（0-7=1部, 8-15=2部）
  const winners = blocks.map((b) =>
    makePlaceholder(`${b.blockLabel}組勝者`)
  );

  // 標準16シードブラケット配置
  // (seedIdx pair): 0v15, 7v8, 4v11, 3v12, 2v13, 5v10, 6v9, 1v14
  const pairings: [number, number][] = [
    [0, 15], [7, 8], [4, 11], [3, 12],
    [2, 13], [5, 10], [6, 9], [1, 14],
  ];

  const r1Matches = pairings.map(([a, b]) => ({
    team1: winners[a],
    team2: winners[b],
    isBye: false,
  }));

  const qf = buildPlaceholderMatches('1回戦', 4);
  const sf = buildPlaceholderMatches('準々決勝', 2);
  const f = buildPlaceholderMatches('準決勝', 1);

  return [
    { label: '1回戦', matches: r1Matches },
    { label: '準々決勝', matches: qf },
    { label: '準決勝', matches: sf },
    { label: '決勝', matches: f },
  ];
}

function buildPlaceholderMatches(prevLabel: string, count: number): TournamentMatch[] {
  return Array.from({ length: count }, (_, i) => ({
    team1: makePlaceholder(`${prevLabel}${i * 2 + 1}勝者`),
    team2: makePlaceholder(`${prevLabel}${i * 2 + 2}勝者`),
    isBye: false,
  }));
}
