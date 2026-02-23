'use client';

import { useState, useEffect, useCallback } from 'react';
import { fetchAllMasterData } from '@/SimulationPlay/Management/Services/MasterDataService';
import { createUserProfile, checkUserExists } from '@/SimulationPlay/Management/Services/UserDataService';
import {
  generateLeague,
  fetchLeagueTeams,
  LeagueTeam,
  LeaguePlayer,
} from '@/SimulationPlay/Management/Services/LeagueService';
import { fetchAllPlayers } from '@/SimulationPlay/Management/Services/PlayerService';
import { PlayerDetailPanel, SelectedPlayerInfo } from '@/GamePlay/MatchEngine/PlayerDetailPanel';
import { PlayerDataLoader } from '@/GamePlay/Data/PlayerDataLoader';
import { useLeaguePlayers } from '@/SimulationPlay/Management/Hooks/UseLeaguePlayers';
import { TournamentBracket } from '@/SimulationPlay/Management/League/TournamentBracket';
import { SeasonCalendar } from '@/SimulationPlay/Management/League/SeasonCalendar';
import { RosterEditor } from '@/SimulationPlay/Management/League/RosterEditor';
import { TrainingSelector } from '@/SimulationPlay/Management/League/TrainingSelector';
import {
  RosterConfig,
  TrainingConfig,
  saveRosterConfig,
  loadRosterConfig,
  saveTrainingConfig,
  loadTrainingConfig,
} from '@/SimulationPlay/Management/Services/UserDataService';

type PageState = 'loading' | 'start' | 'register' | 'initializing' | 'menu' | 'myteam' | 'league' | 'divisions' | 'tournament' | 'calendar' | 'roster' | 'training';

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
  const [lastName, setLastName] = useState('');
  const [firstName, setFirstName] = useState('');
  const [universityValue, setUniversityValue] = useState('');
  const [teamNameValue, setTeamNameValue] = useState('');
  const [error, setError] = useState<string | null>(null);

  // チーム一覧表示
  const [leagueTeams, setLeagueTeams] = useState<LeagueTeam[]>([]);
  const [expandedTeam, setExpandedTeam] = useState<number | null>(null);
  const [leagueLoading, setLeagueLoading] = useState(false);
  const [selectedDivision, setSelectedDivision] = useState(0);

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

  // ロスター & トレーニング
  const [rosterConfig, setRosterConfig] = useState<RosterConfig | null>(null);
  const [trainingConfig, setTrainingConfig] = useState<TrainingConfig | null>(null);

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
      const [roster, training] = await Promise.all([
        loadRosterConfig(userId),
        loadTrainingConfig(userId),
      ]);
      setRosterConfig(roster);
      setTrainingConfig(training);
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

  // ロスター保存
  const handleSaveRoster = useCallback(async (config: RosterConfig) => {
    const userId = localStorage.getItem('userId');
    if (!userId) return;
    await saveRosterConfig(userId, config);
    setRosterConfig(config);
    setPageState('myteam');
  }, []);

  // トレーニング保存
  const handleSaveTraining = useCallback(async (config: TrainingConfig) => {
    const userId = localStorage.getItem('userId');
    if (!userId) return;
    await saveTrainingConfig(userId, config);
    setTrainingConfig(config);
    setPageState('myteam');
  }, []);

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

  // START → masterData取得 → ランダムプリフィル → 登録フォームへ
  const handleStart = async () => {
    setPageState('loading');
    try {
      const data = await fetchAllMasterData();
      setMasterData(data);
      const randPick = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];
      setLastName(randPick(data.lastNames));
      setFirstName(randPick(data.firstNames));
      setUniversityValue(randPick(data.universities));
      setTeamNameValue(randPick(data.teams));
      setPageState('register');
    } catch (e) {
      console.error('マスターデータ取得エラー:', e);
      setError('データの読み込みに失敗しました');
      setPageState('start');
    }
  };

  // 登録 → ユーザー作成 + リーグ生成 → メニューへ
  const handleRegister = async () => {
    if (!lastName.trim()) { setError('姓を入力してください'); return; }
    if (!firstName.trim()) { setError('名を入力してください'); return; }
    if (!universityValue.trim()) { setError('大学名を入力してください'); return; }
    if (!teamNameValue.trim()) { setError('チーム名を入力してください'); return; }

    const university = universityValue.trim();
    const teamName = teamNameValue.trim();

    setError(null);
    setPageState('initializing');
    try {
      const userId = await createUserProfile({
        lastName: lastName.trim(),
        firstName: firstName.trim(),
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
            <div className="flex gap-3">
              <div className="flex-1">
                <label className="block text-sm text-gray-400 mb-1">姓</label>
                <input
                  type="text"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  placeholder="姓"
                  className="w-full px-4 py-2 bg-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-yellow-500"
                />
              </div>
              <div className="flex-1">
                <label className="block text-sm text-gray-400 mb-1">名</label>
                <input
                  type="text"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  placeholder="名"
                  className="w-full px-4 py-2 bg-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-yellow-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm text-gray-400 mb-1">大学</label>
              <input
                type="text"
                value={universityValue}
                onChange={(e) => setUniversityValue(e.target.value)}
                placeholder="大学名"
                className="w-full px-4 py-2 bg-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-yellow-500"
              />
            </div>

            <div>
              <label className="block text-sm text-gray-400 mb-1">チーム名</label>
              <input
                type="text"
                value={teamNameValue}
                onChange={(e) => setTeamNameValue(e.target.value)}
                placeholder="チーム名"
                className="w-full px-4 py-2 bg-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-yellow-500"
              />
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

  // ===== メニュー画面 =====
  if (pageState === 'menu') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-900 text-white">
        <h1 className="text-4xl font-bold mb-12">Basketball Game</h1>
        <div className="flex flex-col gap-4">
          <button
            onClick={() => setPageState('myteam')}
            className="px-12 py-4 bg-yellow-500 hover:bg-yellow-400 cursor-pointer rounded-xl text-xl font-bold text-black shadow-lg shadow-yellow-500/30 hover:shadow-yellow-400/50 transition-all"
          >
            マイチーム
          </button>
          <button
            onClick={() => setPageState('league')}
            className="px-12 py-4 bg-orange-500 hover:bg-orange-400 cursor-pointer rounded-xl text-xl font-bold text-white shadow-lg shadow-orange-500/30 hover:shadow-orange-400/50 transition-all"
          >
            リーグチーム一覧
          </button>
          <button
            onClick={() => setPageState('divisions')}
            className="px-12 py-4 bg-blue-600 hover:bg-blue-500 cursor-pointer rounded-xl text-xl font-bold text-white shadow-lg shadow-blue-600/30 hover:shadow-blue-500/50 transition-all"
          >
            リーグ構成
          </button>
          <button
            onClick={() => setPageState('tournament')}
            className="px-12 py-4 bg-green-600 hover:bg-green-500 cursor-pointer rounded-xl text-xl font-bold text-white shadow-lg shadow-green-600/30 hover:shadow-green-500/50 transition-all"
          >
            トーナメント表
          </button>
          <button
            onClick={() => setPageState('calendar')}
            className="px-12 py-4 bg-purple-600 hover:bg-purple-500 cursor-pointer rounded-xl text-xl font-bold text-white shadow-lg shadow-purple-600/30 hover:shadow-purple-500/50 transition-all"
          >
            シーズンカレンダー
          </button>
        </div>
      </div>
    );
  }

  // ===== マイチーム =====
  if (pageState === 'myteam') {
    const myTeam = leagueTeams.find((t) => t.isMyTeam);
    const divisionIndex = leagueTeams.indexOf(myTeam!);
    const division = myTeam ? Math.floor(divisionIndex / 8) + 1 : 0;

    return (
      <div className="min-h-screen bg-gray-900 text-white">
        <div className="max-w-2xl mx-auto px-4 py-8">
          <div className="flex items-center justify-between mb-4">
            <button
              onClick={() => setPageState('menu')}
              className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-sm font-bold transition-colors cursor-pointer"
            >
              戻る
            </button>
            <h1 className="text-3xl font-bold text-center">Basketball Game</h1>
            <div className="w-16" />
          </div>

          {myTeam ? (
            <>
              <div className="text-center mb-6">
                <h2 className="text-2xl font-bold text-yellow-400">
                  {myTeam.universityName} {myTeam.teamNameLabel}
                </h2>
                <p className="text-sm text-gray-400 mt-1">
                  {division}部 / {myTeam.playerIds.length}人
                </p>
              </div>

              {/* チーム編成 & 練習指示ボタン */}
              <div className="flex gap-3 mb-6">
                <button
                  onClick={() => setPageState('roster')}
                  className="flex-1 py-3 bg-green-600 hover:bg-green-500 rounded-lg font-bold transition-colors cursor-pointer"
                >
                  チーム編成
                </button>
                <button
                  onClick={() => setPageState('training')}
                  className="flex-1 py-3 bg-purple-600 hover:bg-purple-500 rounded-lg font-bold transition-colors cursor-pointer"
                >
                  練習指示
                </button>
              </div>

              {/* スタメンサマリー */}
              {rosterConfig && rosterConfig.starters.length > 0 && (
                <div className="bg-gray-800 rounded-xl p-4 mb-4">
                  <h3 className="text-sm font-bold text-yellow-400 mb-2">スタメン</h3>
                  <div className="flex gap-2">
                    {rosterConfig.starters.map((s) => {
                      const p = leaguePlayers[s.leaguePlayerId];
                      return (
                        <div key={s.position} className="flex-1 text-center bg-gray-700/50 rounded p-2">
                          <p className="text-xs text-yellow-400 font-bold">{s.position}</p>
                          <p className="text-sm font-semibold truncate">
                            {p ? `${p.lastName}` : '?'}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="space-y-4">
                {[4, 3, 2, 1].map((grade) => {
                  const gradePlayers = getTeamPlayersByGrade(myTeam, grade);
                  if (gradePlayers.length === 0) return null;
                  return (
                    <div key={grade} className="bg-gray-800 rounded-xl overflow-hidden">
                      <div className="px-4 py-2 bg-gray-700 font-bold text-sm">
                        {GRADE_LABEL[grade]} ({gradePlayers.length}人)
                      </div>
                      <div className="divide-y divide-gray-700/50">
                        {gradePlayers.map((p) => (
                          <button
                            key={p.id}
                            onClick={() => handlePlayerClick(p)}
                            className="w-full px-4 py-3 flex items-center gap-3 hover:bg-white/5 transition-colors text-left cursor-pointer"
                          >
                            <span className="font-semibold">
                              {p.lastName} {p.firstName}
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          ) : (
            <p className="text-center text-gray-400">チームデータを読み込み中...</p>
          )}
        </div>

        {selectedPlayer && (
          <PlayerDetailPanel
            player={selectedPlayer}
            onClose={() => setSelectedPlayer(null)}
          />
        )}
      </div>
    );
  }

  // ===== チーム編成 =====
  if (pageState === 'roster') {
    const myTeam = leagueTeams.find((t) => t.isMyTeam);
    if (!myTeam) return null;
    return (
      <>
        <RosterEditor
          myTeam={myTeam}
          leaguePlayers={leaguePlayers}
          masterPlayerCache={masterPlayerCache}
          initialRoster={rosterConfig}
          onSave={handleSaveRoster}
          onBack={() => setPageState('myteam')}
          onPlayerClick={handlePlayerClick}
        />
        {selectedPlayer && (
          <PlayerDetailPanel
            player={selectedPlayer}
            onClose={() => setSelectedPlayer(null)}
          />
        )}
      </>
    );
  }

  // ===== 練習指示 =====
  if (pageState === 'training') {
    return (
      <TrainingSelector
        initialConfig={trainingConfig}
        onSave={handleSaveTraining}
        onBack={() => setPageState('myteam')}
      />
    );
  }

  // ===== トーナメント表 =====
  if (pageState === 'tournament') {
    return (
      <TournamentBracket
        leagueTeams={leagueTeams}
        onBack={() => setPageState('menu')}
      />
    );
  }

  // ===== シーズンカレンダー =====
  if (pageState === 'calendar') {
    return (
      <SeasonCalendar onBack={() => setPageState('menu')} />
    );
  }

  // ===== リーグ構成 =====
  if (pageState === 'divisions') {
    const TEAMS_PER_DIVISION = 8;
    const divisions: LeagueTeam[][] = [];
    for (let i = 0; i < leagueTeams.length; i += TEAMS_PER_DIVISION) {
      divisions.push(leagueTeams.slice(i, i + TEAMS_PER_DIVISION));
    }
    const totalDivisions = divisions.length;
    const currentTeams = divisions[selectedDivision] ?? [];

    return (
      <div className="min-h-screen bg-gray-900 text-white">
        <div className="max-w-4xl mx-auto px-4 py-8">
          <div className="flex items-center justify-between mb-4">
            <button
              onClick={() => { setSelectedDivision(0); setPageState('menu'); }}
              className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-sm font-bold transition-colors cursor-pointer"
            >
              戻る
            </button>
            <h1 className="text-3xl font-bold text-center">Basketball Game</h1>
            <div className="w-16" />
          </div>

          {/* 部の切り替えナビ */}
          <div className="flex items-center justify-center gap-3 mb-6">
            <button
              onClick={() => setSelectedDivision((prev) => Math.max(0, prev - 1))}
              disabled={selectedDivision === 0}
              className="px-3 py-2 bg-gray-700 hover:bg-gray-600 disabled:opacity-30 disabled:cursor-default rounded-lg font-bold transition-colors cursor-pointer"
            >
              ◀
            </button>
            <h2 className="text-2xl font-bold min-w-[120px] text-center">
              {selectedDivision + 1}部
            </h2>
            <button
              onClick={() => setSelectedDivision((prev) => Math.min(totalDivisions - 1, prev + 1))}
              disabled={selectedDivision === totalDivisions - 1}
              className="px-3 py-2 bg-gray-700 hover:bg-gray-600 disabled:opacity-30 disabled:cursor-default rounded-lg font-bold transition-colors cursor-pointer"
            >
              ▶
            </button>
          </div>

          {/* 部タブ一覧 */}
          <div className="flex flex-wrap justify-center gap-1.5 mb-6">
            {divisions.map((_, divIdx) => (
              <button
                key={divIdx}
                onClick={() => setSelectedDivision(divIdx)}
                className={`px-3 py-1.5 rounded text-sm font-bold transition-colors cursor-pointer ${
                  divIdx === selectedDivision
                    ? 'bg-orange-500 text-white'
                    : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
                }`}
              >
                {divIdx + 1}部
              </button>
            ))}
          </div>

          {/* チーム一覧 */}
          <div className="bg-gray-800 rounded-xl overflow-hidden">
            <div className="divide-y divide-gray-700">
              {currentTeams.map((team, i) => (
                <div
                  key={team.id}
                  className={`px-4 py-3 flex items-center gap-3 ${
                    team.isMyTeam ? 'bg-yellow-900/30' : ''
                  }`}
                >
                  <span className="text-gray-500 text-sm font-mono w-6 text-right">
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
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ===== リーグチーム一覧 =====
  return (
    <div className="min-h-screen bg-gray-900 text-white">
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-4">
          <button
            onClick={() => setPageState('menu')}
            className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-sm font-bold transition-colors cursor-pointer"
          >
            戻る
          </button>
          <h1 className="text-3xl font-bold text-center">Basketball Game</h1>
          <div className="w-16" />
        </div>
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
