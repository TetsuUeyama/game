'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { fetchAllPlayers } from '@/GamePlay/Management/Services/PlayerService';
import { fetchAllMasterData } from '@/GamePlay/Management/Services/MasterDataService';
import { DocumentData } from 'firebase/firestore';

type Rank = 'S' | 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G';

const RANK_MULTIPLIER: Record<Rank, number> = {
  S: 1.0,
  A: 0.95,
  B: 0.9,
  C: 0.85,
  D: 0.8,
  E: 0.75,
  F: 0.7,
  G: 0.65,
};

const RANK_COLOR: Record<Rank, string> = {
  S: 'text-red-400 bg-red-900/40 border-red-500',
  A: 'text-orange-400 bg-orange-900/40 border-orange-500',
  B: 'text-yellow-400 bg-yellow-900/40 border-yellow-500',
  C: 'text-green-400 bg-green-900/40 border-green-500',
  D: 'text-cyan-400 bg-cyan-900/40 border-cyan-500',
  E: 'text-blue-400 bg-blue-900/40 border-blue-500',
  F: 'text-purple-400 bg-purple-900/40 border-purple-500',
  G: 'text-gray-400 bg-gray-700/40 border-gray-500',
};

function getRanksForTeamPosition(teamIndex: number): Rank[] {
  const pos = teamIndex + 1; // 1-based
  if (pos <= 8) return ['S', 'A'];
  if (pos <= 16) return ['S', 'A', 'B'];
  if (pos <= 24) return ['A', 'B', 'C'];
  if (pos <= 32) return ['B', 'C', 'D'];
  if (pos <= 40) return ['C', 'D', 'E'];
  if (pos <= 56) return ['D', 'E', 'F'];
  if (pos <= 72) return ['E', 'F'];
  return ['F', 'G'];
}

interface PlayerData {
  ID: string;
  NAME: string;
  PositionMain: string;
  Position?: string;
  height: number;
  dominanthand: string;
  offense: number;
  defense: number;
  power: number;
  stamina: number;
  speed: number;
  acceleration: number;
  reflexes: number;
  quickness: number;
  dribblingaccuracy: number;
  dribblingspeed: number;
  passaccuracy: number;
  passspeed: number;
  '3paccuracy': number;
  '3pspeed': number;
  shootccuracy: number;
  shootdistance: number;
  shoottechnique: number;
  freethrow: number;
  curve: number;
  dunk: number;
  jump: number;
  technique: number;
  mentality: number;
  aggressive: number;
  alignment: number;
}

interface Player {
  lastName: string;
  firstName: string;
  rank: Rank;
  stats: PlayerData;
}

interface Team {
  university: string;
  teamName: string;
  players: Player[];
}

const STAT_KEYS = [
  'offense', 'defense', 'power', 'stamina', 'speed', 'acceleration',
  'reflexes', 'quickness', 'dribblingaccuracy', 'dribblingspeed',
  'passaccuracy', 'passspeed', '3paccuracy', '3pspeed',
  'shootccuracy', 'shootdistance', 'shoottechnique', 'freethrow',
  'curve', 'dunk', 'jump', 'technique', 'mentality', 'aggressive', 'alignment',
] as const;

const PARAM_LABELS: Record<string, string> = {
  offense: 'オフェンス',
  defense: 'ディフェンス',
  power: 'パワー',
  stamina: 'スタミナ',
  speed: 'スピード',
  acceleration: '加速',
  reflexes: '反射神経',
  quickness: '俊敏性',
  dribblingaccuracy: 'ドリブル精度',
  dribblingspeed: 'ドリブル速度',
  passaccuracy: 'パス精度',
  passspeed: 'パス速度',
  '3paccuracy': '3P精度',
  '3pspeed': '3P速度',
  shootccuracy: 'シュート精度',
  shootdistance: 'シュート距離',
  shoottechnique: 'シュート技術',
  freethrow: 'フリースロー',
  curve: 'カーブ',
  dunk: 'ダンク',
  jump: 'ジャンプ',
  technique: 'テクニック',
  mentality: 'メンタル',
  aggressive: 'アグレッシブ',
  alignment: 'アライメント',
};

const POSITION_LABELS: Record<string, string> = {
  PG: 'PG', SG: 'SG', SF: 'SF', PF: 'PF', C: 'C',
  CF: 'CF', WG: 'WG', ST: 'ST', OMF: 'OMF', SMF: 'SMF',
  DMF: 'DMF', CB: 'CB', SB: 'SB', GK: 'GK',
};

function shuffle<T>(array: T[]): T[] {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function pickRandom<T>(array: T[]): T {
  return array[Math.floor(Math.random() * array.length)];
}

function getBarColor(value: number): string {
  if (value >= 90) return 'bg-red-500';
  if (value >= 80) return 'bg-orange-500';
  if (value >= 70) return 'bg-yellow-500';
  if (value >= 60) return 'bg-green-500';
  return 'bg-gray-500';
}

function applyRankToStats(base: PlayerData, rank: Rank): PlayerData {
  const multiplier = RANK_MULTIPLIER[rank];
  const result = { ...base };
  for (const key of STAT_KEYS) {
    const original = base[key as keyof PlayerData];
    if (typeof original === 'number') {
      (result as Record<string, unknown>)[key] = Math.round(original * multiplier);
    }
  }
  return result;
}

function generateTeams(
  universities: string[],
  teamNames: string[],
  lastNames: string[],
  firstNames: string[],
  playerDataList: PlayerData[],
  count: number
): Team[] {
  const shuffledUni = shuffle(universities);
  const shuffledTeam = shuffle(teamNames);
  const shuffledPlayers = shuffle(playerDataList);

  const teams: Team[] = [];
  let playerIdx = 0;

  for (let i = 0; i < count; i++) {
    const university = shuffledUni[i % shuffledUni.length];
    const teamName = shuffledTeam[i % shuffledTeam.length];
    const allowedRanks = getRanksForTeamPosition(i);
    const players: Player[] = [];
    for (let j = 0; j < 10; j++) {
      const baseStats = shuffledPlayers[playerIdx % shuffledPlayers.length];
      playerIdx++;
      const rank = pickRandom(allowedRanks);
      const stats = applyRankToStats(baseStats, rank);
      players.push({
        lastName: pickRandom(lastNames),
        firstName: pickRandom(firstNames),
        rank,
        stats,
      });
    }
    teams.push({ university, teamName, players });
  }
  return teams;
}

function RankBadge({ rank }: { rank: Rank }) {
  return (
    <span
      className={`inline-flex items-center justify-center w-7 h-7 rounded border text-xs font-bold ${RANK_COLOR[rank]}`}
    >
      {rank}
    </span>
  );
}

function PlayerStatsPanel({ stats, rank }: { stats: PlayerData; rank: Rank }) {
  return (
    <div className="mt-2 bg-gray-900/80 rounded-lg p-4 border border-gray-600">
      <div className="flex flex-wrap gap-x-6 gap-y-1 mb-3 text-sm">
        <span>
          <span className="text-gray-400">ランク:</span>{' '}
          <RankBadge rank={rank} />
          <span className="ml-1 text-gray-500 text-xs">
            (x{(RANK_MULTIPLIER[rank] * 100).toFixed(0)}%)
          </span>
        </span>
        <span>
          <span className="text-gray-400">ポジション:</span>{' '}
          <span className="font-semibold text-blue-400">
            {POSITION_LABELS[stats.PositionMain] || stats.PositionMain}
          </span>
        </span>
        <span>
          <span className="text-gray-400">身長:</span>{' '}
          <span className="font-semibold">{stats.height}cm</span>
        </span>
        <span>
          <span className="text-gray-400">利き手:</span>{' '}
          <span className="font-semibold">{stats.dominanthand}</span>
        </span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1">
        {STAT_KEYS.map((key) => {
          const value = stats[key as keyof PlayerData] as number;
          if (typeof value !== 'number') return null;
          return (
            <div key={key} className="flex items-center gap-2 text-sm">
              <span className="text-gray-400 w-28 shrink-0 text-right">
                {PARAM_LABELS[key]}
              </span>
              <div className="flex-1 bg-gray-700 rounded-full h-3 overflow-hidden">
                <div
                  className={`h-full rounded-full ${getBarColor(value)}`}
                  style={{ width: `${value}%` }}
                />
              </div>
              <span className="w-8 text-right font-mono text-xs">{value}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function TeamsPage() {
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedTeam, setExpandedTeam] = useState<number | null>(null);
  const [expandedPlayer, setExpandedPlayer] = useState<string | null>(null);

  useEffect(() => {
    async function loadData() {
      try {
        const [masterData, playersMap] = await Promise.all([
          fetchAllMasterData(),
          fetchAllPlayers(),
        ]);

        const playerDataList: PlayerData[] = Object.values(playersMap).map(
          (d: DocumentData) => d as PlayerData
        );

        const generated = generateTeams(
          masterData.universities,
          masterData.teams,
          masterData.lastNames,
          masterData.firstNames,
          playerDataList,
          100
        );
        setTeams(generated);
      } catch (e) {
        console.error('データ読み込みエラー:', e);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  const toggleTeam = (index: number) => {
    setExpandedTeam(expandedTeam === index ? null : index);
    setExpandedPlayer(null);
  };

  const togglePlayer = (teamIdx: number, playerIdx: number) => {
    const key = `${teamIdx}-${playerIdx}`;
    setExpandedPlayer(expandedPlayer === key ? null : key);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-900 text-white">
        <p className="text-xl">チームデータを生成中...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      <div className="max-w-5xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-3xl font-bold">チーム一覧 (100チーム)</h1>
          <Link
            href="/"
            className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-sm transition-colors"
          >
            ホームに戻る
          </Link>
        </div>

        <div className="grid gap-3">
          {teams.map((team, i) => {
            const allowedRanks = getRanksForTeamPosition(i);
            return (
              <div key={i} className="bg-gray-800 rounded-lg overflow-hidden">
                <button
                  onClick={() => toggleTeam(i)}
                  className="w-full px-5 py-4 flex items-center justify-between hover:bg-gray-750 transition-colors text-left"
                >
                  <div className="flex items-center gap-4">
                    <span className="text-gray-400 text-sm font-mono w-8 text-right">
                      {i + 1}
                    </span>
                    <span className="text-lg font-semibold">
                      {team.university} {team.teamName}
                    </span>
                    <span className="flex gap-1">
                      {allowedRanks.map((r) => (
                        <span key={r} className={`text-xs px-1.5 py-0.5 rounded border ${RANK_COLOR[r]}`}>
                          {r}
                        </span>
                      ))}
                    </span>
                  </div>
                  <span className="text-gray-400 text-xl">
                    {expandedTeam === i ? '▲' : '▼'}
                  </span>
                </button>

                {expandedTeam === i && (
                  <div className="px-5 pb-4 border-t border-gray-700">
                    <table className="w-full mt-3">
                      <thead>
                        <tr className="text-gray-400 text-sm">
                          <th className="text-left py-1 w-12">#</th>
                          <th className="text-center py-1 w-10">Rank</th>
                          <th className="text-left py-1">選手名</th>
                          <th className="text-left py-1 w-16">Pos</th>
                          <th className="text-right py-1 w-16">身長</th>
                        </tr>
                      </thead>
                      <tbody>
                        {team.players.map((player, j) => {
                          const playerKey = `${i}-${j}`;
                          const isExpanded = expandedPlayer === playerKey;
                          return (
                            <tr key={j} className="border-t border-gray-700/50">
                              <td className="py-2 text-gray-400 text-sm align-top">
                                {j + 1}
                              </td>
                              {!isExpanded && (
                                <td className="py-2 text-center align-top">
                                  <RankBadge rank={player.rank} />
                                </td>
                              )}
                              <td className="py-2" colSpan={isExpanded ? 4 : 1}>
                                <button
                                  onClick={() => togglePlayer(i, j)}
                                  className="text-left hover:text-yellow-400 transition-colors cursor-pointer"
                                >
                                  {isExpanded && (
                                    <RankBadge rank={player.rank} />
                                  )}{' '}
                                  <span className={isExpanded ? 'text-yellow-400 font-semibold' : ''}>
                                    {player.lastName} {player.firstName}
                                  </span>
                                  <span className="ml-2 text-gray-500 text-xs">
                                    {isExpanded ? '▲ 閉じる' : '▶ 能力値'}
                                  </span>
                                </button>
                                {isExpanded && (
                                  <PlayerStatsPanel stats={player.stats} rank={player.rank} />
                                )}
                              </td>
                              {!isExpanded && (
                                <>
                                  <td className="py-2 text-sm text-blue-400 align-top">
                                    {POSITION_LABELS[player.stats.PositionMain] || player.stats.PositionMain}
                                  </td>
                                  <td className="py-2 text-sm text-right text-gray-300 align-top">
                                    {player.stats.height}cm
                                  </td>
                                </>
                              )}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
