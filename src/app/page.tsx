'use client';

import { useState, useEffect, useCallback } from 'react';
import { fetchAllMasterData } from '@/GamePlay/Management/Services/MasterDataService';
import { createUserProfile, checkUserExists } from '@/GamePlay/Management/Services/UserDataService';
import {
  generateLeague,
  fetchLeagueTeams,
  LeagueTeam,
  LeaguePlayer,
} from '@/GamePlay/Management/Services/LeagueService';
import { fetchAllPlayers } from '@/GamePlay/Management/Services/PlayerService';
import { PlayerDetailPanel, SelectedPlayerInfo } from '@/GamePlay/MatchEngine/PlayerDetailPanel';
import { PlayerDataLoader } from '@/GamePlay/Management/Services/PlayerDataLoader';
import { useLeaguePlayers } from '@/GamePlay/Management/Hooks/UseLeaguePlayers';

type PageState = 'loading' | 'start' | 'register' | 'initializing' | 'menu';

const GRADE_LABEL: Record<number, string> = { 1: '1年', 2: '2年', 3: '3年', 4: '4年' };

export default function Home() {
  const [pageState, setPageState] = useState<PageState>('loading');
  const [masterData, setMasterData] = useState<{
    universities: string[];
    teams: string[];
    firstNames: string[];
    lastNames: string[];
  } | null>(null);

  // 登録フォーム
  const [name, setName] = useState('');
  const [universityCustom, setUniversityCustom] = useState(false);
  const [universityValue, setUniversityValue] = useState('');
  const [universityIndex, setUniversityIndex] = useState(0);
  const [teamNameCustom, setTeamNameCustom] = useState(false);
  const [teamNameValue, setTeamNameValue] = useState('');
  const [teamNameIndex, setTeamNameIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);

  // チーム一覧表示
  const [leagueTeams, setLeagueTeams] = useState<LeagueTeam[]>([]);
  const [expandedTeam, setExpandedTeam] = useState<number | null>(null);
  const [leagueLoading, setLeagueLoading] = useState(false);

  // 選手ローカル状態管理（dirty追跡 + DB保存）
  const {
    players: leaguePlayers,
    saveChanges,
    loadPlayers,
    saving,
    isDirty,
    dirtyCount,
  } = useLeaguePlayers();

  // 選手詳細モーダル
  const [selectedPlayer, setSelectedPlayer] = useState<SelectedPlayerInfo | null>(null);
  const [masterPlayerCache, setMasterPlayerCache] = useState<Record<string, Record<string, unknown>>>({});

  // リーグデータ読み込み
  const loadLeagueData = useCallback(async (userId: string) => {
    setLeagueLoading(true);
    try {
      const [teams, masterPlayers] = await Promise.all([
        fetchLeagueTeams(userId),
        fetchAllPlayers(),
      ]);
      setLeagueTeams(teams);
      setMasterPlayerCache(masterPlayers);
      await loadPlayers(userId);
    } catch (e) {
      console.error('リーグデータ取得エラー:', e);
    } finally {
      setLeagueLoading(false);
    }
  }, [loadPlayers]);

  // 選手クリック → 詳細モーダル表示
  const handlePlayerClick = useCallback((player: LeaguePlayer) => {
    const raw = masterPlayerCache[player.playerId];
    if (!raw) return;

    const playerData = PlayerDataLoader.convertToPlayerData(
      raw as unknown as Parameters<typeof PlayerDataLoader.convertToPlayerData>[0]
    );

    setSelectedPlayer({
      playerName: `${player.lastName} ${player.firstName}`,
      position: playerData.basic.PositionMain,
      height: playerData.basic.height,
      dominantHand: playerData.basic.dominanthand,
      stats: playerData.stats,
      team: 'ally',
      dataUrl: '',
    });
  }, [masterPlayerCache]);

  // チームの選手を学年別に取得
  const getTeamPlayersByGrade = useCallback(
    (team: LeagueTeam, grade: number): LeaguePlayer[] => {
      return team.playerIds
        .map((id) => leaguePlayers[id])
        .filter((p): p is LeaguePlayer => p != null && p.grade === grade);
    },
    [leaguePlayers]
  );

  // 初回: localStorageにユーザーがいればメニューへ
  useEffect(() => {
    const userId = localStorage.getItem('userId');
    if (userId) {
      checkUserExists(userId).then((exists) => {
        if (exists) {
          setPageState('menu');
          loadLeagueData(userId);
        } else {
          setPageState('start');
        }
      });
    } else {
      setPageState('start');
    }
  }, [loadLeagueData]);

  // START → masterData取得 → 登録フォームへ
  const handleStart = async () => {
    setPageState('loading');
    try {
      const data = await fetchAllMasterData();
      setMasterData(data);
      setPageState('register');
    } catch (e) {
      console.error('マスターデータ取得エラー:', e);
      setError('データの読み込みに失敗しました');
      setPageState('start');
    }
  };

  // 登録 → ユーザー作成 + リーグ生成 → メニューへ
  const handleRegister = async () => {
    if (!name.trim()) {
      setError('名前を入力してください');
      return;
    }
    const university = universityCustom
      ? universityValue.trim()
      : masterData!.universities[universityIndex];
    const teamName = teamNameCustom
      ? teamNameValue.trim()
      : masterData!.teams[teamNameIndex];

    if (!university) { setError('大学名を入力してください'); return; }
    if (!teamName) { setError('チーム名を入力してください'); return; }

    setError(null);
    setPageState('initializing');
    try {
      const userId = await createUserProfile({
        name: name.trim(),
        university,
        teamName,
      });

      const playersMap = await fetchAllPlayers();
      const allPlayerIds = Object.keys(playersMap);

      await generateLeague(
        userId,
        university,
        teamName,
        masterData!.universities,
        masterData!.teams,
        allPlayerIds,
        masterData!.firstNames,
        masterData!.lastNames
      );

      localStorage.setItem('userId', userId);
      await loadLeagueData(userId);
      setPageState('menu');
    } catch (e) {
      console.error('初期化エラー:', e);
      setError('初期化に失敗しました。もう一度お試しください。');
      setPageState('register');
    }
  };

  // ===== ローディング =====
  if (pageState === 'loading') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-900 text-white">
        <h1 className="text-4xl font-bold mb-12">Basketball Game</h1>
        <p className="text-gray-400">読み込み中...</p>
      </div>
    );
  }

  // ===== START画面 =====
  if (pageState === 'start') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-900 text-white">
        <h1 className="text-4xl font-bold mb-12">Basketball Game</h1>
        {error && <p className="text-red-400 mb-4">{error}</p>}
        <button
          onClick={handleStart}
          className="px-12 py-6 bg-orange-500 hover:bg-orange-400 cursor-pointer rounded-xl text-2xl font-bold text-white shadow-lg shadow-orange-500/30 hover:shadow-orange-400/50 transition-all"
        >
          START
        </button>
      </div>
    );
  }

  // ===== 登録フォーム =====
  if (pageState === 'register') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-900 text-white">
        <h1 className="text-4xl font-bold mb-8">Basketball Game</h1>
        <div className="bg-gray-800 rounded-xl p-8 w-full max-w-md">
          <h2 className="text-xl font-bold mb-6 text-center">アカウント登録</h2>

          {error && <p className="text-red-400 mb-4 text-sm">{error}</p>}

          <div className="space-y-4">
            <div>
              <label className="block text-sm text-gray-400 mb-1">名前</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="あなたの名前"
                className="w-full px-4 py-2 bg-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-yellow-500"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-sm text-gray-400">大学</label>
                <label className="flex items-center gap-1.5 text-xs text-gray-400 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={universityCustom}
                    onChange={(e) => setUniversityCustom(e.target.checked)}
                    className="accent-yellow-500"
                  />
                  オリジナル入力
                </label>
              </div>
              {universityCustom ? (
                <input
                  type="text"
                  value={universityValue}
                  onChange={(e) => setUniversityValue(e.target.value)}
                  placeholder="大学名を入力"
                  className="w-full px-4 py-2 bg-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-yellow-500"
                />
              ) : (
                <select
                  value={universityIndex}
                  onChange={(e) => setUniversityIndex(Number(e.target.value))}
                  className="w-full px-4 py-2 bg-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-yellow-500"
                >
                  {masterData!.universities.map((uni, i) => (
                    <option key={i} value={i}>{uni}</option>
                  ))}
                </select>
              )}
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-sm text-gray-400">チーム名</label>
                <label className="flex items-center gap-1.5 text-xs text-gray-400 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={teamNameCustom}
                    onChange={(e) => setTeamNameCustom(e.target.checked)}
                    className="accent-yellow-500"
                  />
                  オリジナル入力
                </label>
              </div>
              {teamNameCustom ? (
                <input
                  type="text"
                  value={teamNameValue}
                  onChange={(e) => setTeamNameValue(e.target.value)}
                  placeholder="チーム名を入力"
                  className="w-full px-4 py-2 bg-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-yellow-500"
                />
              ) : (
                <select
                  value={teamNameIndex}
                  onChange={(e) => setTeamNameIndex(Number(e.target.value))}
                  className="w-full px-4 py-2 bg-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-yellow-500"
                >
                  {masterData!.teams.map((team, i) => (
                    <option key={i} value={i}>{team}</option>
                  ))}
                </select>
              )}
            </div>
          </div>

          <button
            onClick={handleRegister}
            className="w-full mt-6 px-6 py-3 bg-yellow-500 hover:bg-yellow-400 rounded-lg text-lg font-bold text-black transition-colors cursor-pointer"
          >
            登録してはじめる
          </button>
        </div>
      </div>
    );
  }

  // ===== 初期化中 =====
  if (pageState === 'initializing') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-900 text-white">
        <h1 className="text-4xl font-bold mb-12">Basketball Game</h1>
        <p className="text-xl text-yellow-400">リーグを生成中...</p>
      </div>
    );
  }

  // ===== リーグチーム一覧 =====
  return (
    <div className="min-h-screen bg-gray-900 text-white">
      <div className="max-w-4xl mx-auto px-4 py-8">
        <h1 className="text-3xl font-bold mb-2 text-center">Basketball Game</h1>
        <h2 className="text-lg text-gray-400 mb-4 text-center">
          リーグチーム一覧 ({leagueTeams.length}チーム)
        </h2>

        {isDirty && (
          <div className="flex items-center justify-center gap-3 mb-4">
            <span className="text-sm text-yellow-400">
              {dirtyCount}件の未保存の変更があります
            </span>
            <button
              onClick={saveChanges}
              disabled={saving}
              className="px-4 py-1.5 bg-green-600 hover:bg-green-500 disabled:bg-gray-600 rounded text-sm font-bold transition-colors cursor-pointer"
            >
              {saving ? '保存中...' : '保存'}
            </button>
          </div>
        )}

        {leagueLoading ? (
          <p className="text-center text-gray-400">チームデータを読み込み中...</p>
        ) : (
          <div className="grid gap-2">
            {leagueTeams.map((team, i) => (
              <div
                key={team.id}
                className={`rounded-lg overflow-hidden ${
                  team.isMyTeam
                    ? 'bg-yellow-900/30 border border-yellow-600'
                    : 'bg-gray-800'
                }`}
              >
                <button
                  onClick={() => setExpandedTeam(expandedTeam === i ? null : i)}
                  className="w-full px-4 py-3 flex items-center justify-between hover:bg-white/5 transition-colors text-left cursor-pointer"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-gray-500 text-sm font-mono w-8 text-right">
                      {i + 1}
                    </span>
                    {team.isMyTeam && (
                      <span className="text-xs px-2 py-0.5 bg-yellow-600 rounded text-white font-bold">
                        MY
                      </span>
                    )}
                    <span className="font-semibold">
                      {team.universityName} {team.teamNameLabel}
                    </span>
                    <span className="text-gray-500 text-sm">
                      ({team.playerIds.length}人)
                    </span>
                  </div>
                  <span className="text-gray-500">
                    {expandedTeam === i ? '▲' : '▼'}
                  </span>
                </button>

                {expandedTeam === i && (
                  <div className="px-4 pb-4 border-t border-gray-700">
                    {[4, 3, 2, 1].map((grade) => {
                      const gradePlayers = getTeamPlayersByGrade(team, grade);
                      if (gradePlayers.length === 0) return null;
                      return (
                        <div key={grade} className="mt-3">
                          <h4 className="text-sm font-bold text-gray-400 mb-1">
                            {GRADE_LABEL[grade]} ({gradePlayers.length}人)
                          </h4>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
                            {gradePlayers.map((p) => (
                              <button
                                key={p.id}
                                onClick={() => handlePlayerClick(p)}
                                className="px-3 py-1.5 bg-gray-700/50 rounded text-sm text-left hover:bg-gray-600/50 cursor-pointer transition-colors"
                              >
                                {p.lastName} {p.firstName}
                              </button>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 選手詳細モーダル */}
      {selectedPlayer && (
        <PlayerDetailPanel
          player={selectedPlayer}
          onClose={() => setSelectedPlayer(null)}
        />
      )}
    </div>
  );
}
