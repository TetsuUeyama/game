'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { GameScene } from '@/GamePlay/MatchEngine/GameScene';
import { PlayerDataLoader } from '@/GamePlay/Data/PlayerDataLoader';
import { LeagueManager } from '@/SimulationPlay/Management/League/LeagueManager';
import type { MatchConfig } from '@/SimulationPlay/Management/League/Types';
import { FaceAvatarData } from '@/GamePlay/GameSystem/CharacterModel/FaceAvatar/FaceAvatarCapture';
import { OffenseRole, DefenseRole } from '@/GamePlay/GameSystem/StatusCheckSystem/PlayerStateTypes';
import { PlayerFaceAvatar, PlayerGameStatsView } from '@/GamePlay/MatchEngine/PlayerFaceAvatar';
import { PlayerDetailPanel, SelectedPlayerInfo } from '@/GamePlay/MatchEngine/PlayerDetailPanel';

/**
 * リーグ試合用ゲームコンポーネント
 * localStorageからマッチ設定を読み込み、試合を実行する
 */
export function LeagueMatchGame() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameSceneRef = useRef<GameScene | null>(null);
  const matchConfigRef = useRef<MatchConfig | null>(null);
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [score, setScore] = useState<{ ally: number; enemy: number }>({ ally: 0, enemy: 0 });
  const [winner, setWinner] = useState<'ally' | 'enemy' | null>(null);
  const [playerNames, setPlayerNames] = useState<{ ally: string; enemy: string }>({ ally: '', enemy: '' });
  const [shotClock, setShotClock] = useState<number>(24.0);
  const [shotClockOffenseTeam, setShotClockOffenseTeam] = useState<'ally' | 'enemy' | null>(null);
  const [resultSaved, setResultSaved] = useState(false);

  // 顔アバター関連
  const [faceAvatars, setFaceAvatars] = useState<FaceAvatarData[]>([]);
  const [selectedPlayer, setSelectedPlayer] = useState<SelectedPlayerInfo | null>(null);
  const [playerStateColors, setPlayerStateColors] = useState<Record<string, string>>({});
  const [playerGameStats, setPlayerGameStats] = useState<Record<string, { points: number; assists: number }>>({});
  const [gameElapsed, setGameElapsed] = useState<number>(0);
  const lastCharacterVersionRef = useRef<number>(-1);

  useEffect(() => {
    if (!canvasRef.current) return;

    let mounted = true;

    const init = async () => {
      try {
        setLoading(true);

        // マッチ設定を読み込む
        const config = LeagueManager.loadMatchConfig();
        if (!config) {
          setError('試合設定が見つかりません。リーグページに戻ってください。');
          setLoading(false);
          return;
        }
        matchConfigRef.current = config;

        const leagueState = LeagueManager.loadLeagueState();
        if (!leagueState) {
          setError('リーグ状態が見つかりません。');
          setLoading(false);
          return;
        }

        const homeTeam = LeagueManager.getTeam(config.homeTeamId);
        const awayTeam = LeagueManager.getTeam(config.awayTeamId);
        if (!homeTeam || !awayTeam) {
          setError('チーム情報が見つかりません。');
          setLoading(false);
          return;
        }

        // チーム設定を生成
        const teamConfig = LeagueManager.buildTeamConfig(homeTeam, awayTeam);

        // 選手データを読み込む
        const playerData = await PlayerDataLoader.loadPlayerData();

        if (!mounted || !canvasRef.current) return;

        // ゲームシーンを初期化
        gameSceneRef.current = new GameScene(canvasRef.current, {
          showAdditionalCharacters: true,
          teamConfig,
          playerData,
          allyTeamName: homeTeam.abbr,
          enemyTeamName: awayTeam.abbr,
          onReady: () => {
            if (mounted) {
              setError(null);
              setLoading(false);
            }
          },
        });
      } catch (err) {
        if (mounted) {
          setError(err instanceof Error ? err.message : '初期化に失敗しました');
          setLoading(false);
        }
      }
    };

    init();

    return () => {
      mounted = false;
      if (gameSceneRef.current) {
        gameSceneRef.current.dispose();
        gameSceneRef.current = null;
      }
    };
  }, []);

  // スコア・勝者・ステートカラー・ゲームスタッツを定期チェック
  useEffect(() => {
    if (!gameSceneRef.current || loading) return;

    setPlayerNames(gameSceneRef.current.getPlayerNames());

    const interval = setInterval(() => {
      if (!gameSceneRef.current) return;
      setScore(gameSceneRef.current.getScore());
      setWinner(gameSceneRef.current.getWinner());
      setShotClock(gameSceneRef.current.getShotClockRemainingTime());
      setShotClockOffenseTeam(gameSceneRef.current.getShotClockOffenseTeam());
      setPlayerStateColors(gameSceneRef.current.getPlayerStateColors());
      setPlayerGameStats(gameSceneRef.current.getPlayerGameStats());
      setGameElapsed(gameSceneRef.current.getGameElapsedSeconds());
    }, 100);

    return () => clearInterval(interval);
  }, [loading]);

  // フェイスアバターキャプチャ
  useEffect(() => {
    if (!gameSceneRef.current || loading) return;

    let cancelled = false;

    const captureAvatars = async () => {
      if (!gameSceneRef.current || cancelled) return;
      try {
        const avatars = await gameSceneRef.current.capturePlayerFaceAvatars();
        if (!cancelled) {
          setFaceAvatars(avatars);
          lastCharacterVersionRef.current = gameSceneRef.current.getCharacterVersion();
        }
      } catch {
        // キャプチャ失敗は無視
      }
    };

    // 1秒後に初回キャプチャ
    const initTimer = setTimeout(captureAvatars, 1000);

    // characterVersionの変更を監視
    const versionCheck = setInterval(() => {
      if (!gameSceneRef.current) return;
      const currentVersion = gameSceneRef.current.getCharacterVersion();
      if (currentVersion !== lastCharacterVersionRef.current) {
        captureAvatars();
      }
    }, 2000);

    return () => {
      cancelled = true;
      clearTimeout(initTimer);
      clearInterval(versionCheck);
    };
  }, [loading]);

  // 顔クリック時の詳細パネル表示
  const handleFaceClick = useCallback((avatar: FaceAvatarData) => {
    if (!gameSceneRef.current) return;

    const characters = avatar.team === 'ally'
      ? gameSceneRef.current.getAllyCharacters()
      : gameSceneRef.current.getEnemyCharacters();

    const character = characters.find(c => c.playerData?.basic.ID === avatar.characterId);
    if (!character?.playerData) return;

    setSelectedPlayer({
      playerName: character.playerData.basic.NAME,
      position: character.playerPosition ?? '',
      height: character.playerData.basic.height,
      dominantHand: character.playerData.basic.dominanthand,
      stats: character.playerData.stats,
      team: avatar.team,
      dataUrl: avatar.dataUrl,
    });
  }, []);

  // ロール変更ハンドラー
  const handleRoleChange = useCallback((
    characterId: string,
    team: 'ally' | 'enemy',
    field: 'shotPriority' | 'offenseRole' | 'defenseRole',
    value: string,
  ) => {
    if (!gameSceneRef.current) return;

    const characters = team === 'ally'
      ? gameSceneRef.current.getAllyCharacters()
      : gameSceneRef.current.getEnemyCharacters();

    const character = characters.find(c => c.playerData?.basic.ID === characterId);
    if (!character) return;

    if (field === 'shotPriority') {
      const newPriority = value ? Number(value) : null;
      const oldPriority = character.shotPriority;

      if (newPriority !== null && newPriority !== oldPriority) {
        for (const c of characters) {
          if (c === character || c.shotPriority == null) continue;
          if (oldPriority != null) {
            if (newPriority < oldPriority) {
              if (c.shotPriority >= newPriority && c.shotPriority < oldPriority) {
                c.shotPriority++;
              }
            } else {
              if (c.shotPriority > oldPriority && c.shotPriority <= newPriority) {
                c.shotPriority--;
              }
            }
          } else {
            if (c.shotPriority >= newPriority) {
              c.shotPriority++;
            }
          }
        }
      }
      character.shotPriority = newPriority;
    } else if (field === 'offenseRole') {
      character.offenseRole = (value || null) as OffenseRole | null;
    } else if (field === 'defenseRole') {
      character.defenseRole = (value || null) as DefenseRole | null;
    }

    setFaceAvatars(prev => prev.map(a => {
      if (a.team !== team) return a;
      const c = characters.find(ch => ch.playerData?.basic.ID === a.characterId);
      if (!c) return a;
      return {
        ...a,
        shotPriority: c.shotPriority,
        offenseRole: c.offenseRole,
        defenseRole: c.defenseRole,
      };
    }));
  }, []);

  // 経過時間を "MM:SS" に変換
  const formatTime = (seconds: number): string => {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  // 選手ごとのスタッツビューを生成
  const buildStatsView = (charId: string): PlayerGameStatsView | undefined => {
    const raw = playerGameStats[charId];
    if (!raw) return undefined;
    return { points: raw.points, assists: raw.assists, playingTime: formatTime(gameElapsed) };
  };

  // リーグページに戻る（結果保存 → 遷移）
  const handleBackToLeague = useCallback(() => {
    const config = matchConfigRef.current;
    if (!config) return;

    // プレイヤーの試合結果を保存
    if (winner && !resultSaved) {
      const winnerSide: 'home' | 'away' = winner === 'ally' ? 'home' : 'away';
      LeagueManager.saveMatchResult({
        matchId: config.matchId,
        homeScore: score.ally,
        awayScore: score.enemy,
        winner: winnerSide,
      });
      LeagueManager.clearMatchConfig();
      setResultSaved(true);
    }

    // リーグページへ遷移
    router.push('/league');
  }, [winner, score, resultSaved, router]);

  if (error) {
    return (
      <div className="w-full h-screen flex items-center justify-center bg-gray-900">
        <div className="text-center">
          <p className="text-red-400 text-lg mb-4">{error}</p>
          <button
            onClick={() => router.push('/league')}
            className="px-6 py-3 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-lg"
          >
            リーグに戻る
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full h-screen relative bg-gradient-to-br from-purple-600 to-indigo-700">
      {/* キャンバス（フルスクリーン） */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full outline-none"
        style={{ touchAction: 'none' }}
      />

      {/* 画面下部オーバーレイ（スコア・ショットクロック + フェイスアバター） */}
      {!loading && (
        <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 z-30">
          <div className="flex items-center gap-2">
            {/* 敵チーム顔（左端） */}
            <div className="flex flex-row gap-1 items-end bg-white/90 rounded-lg px-2 py-1">
              {faceAvatars
                .filter(a => a.team === 'enemy')
                .map(avatar => (
                  <PlayerFaceAvatar
                    key={avatar.characterId}
                    dataUrl={avatar.dataUrl}
                    playerName={avatar.playerName}
                    position={avatar.position}
                    team="enemy"
                    stateColor={playerStateColors[avatar.characterId]}
                    shotPriority={avatar.shotPriority}
                    offenseRole={avatar.offenseRole}
                    defenseRole={avatar.defenseRole}
                    gameStats={buildStatsView(avatar.characterId)}
                    onClick={() => handleFaceClick(avatar)}
                    onRoleChange={(field, value) => handleRoleChange(avatar.characterId, 'enemy', field, value)}
                  />
                ))}
            </div>

            {/* スコアボード中央 */}
            <div className="flex items-center gap-4 bg-black/70 backdrop-blur-sm rounded-xl px-6 py-3">
              {/* 敵スコア（左側） */}
              <div className="text-center min-w-[80px]">
                <p className="text-xs text-red-300 font-bold">{playerNames.enemy}</p>
                <p className="text-3xl font-black text-red-400">{score.enemy}</p>
              </div>

              {/* ショットクロック表示（中央） */}
              <div className={`px-4 py-2 rounded-lg font-mono ${
                shotClock <= 5
                  ? 'bg-red-600 text-white animate-pulse'
                  : shotClock <= 10
                    ? 'bg-yellow-500 text-black'
                    : 'bg-gray-700/80 text-white'
              }`}>
                <p className="text-xs text-center opacity-80">SHOT</p>
                <p className={`text-2xl font-black text-center ${
                  shotClockOffenseTeam === 'ally' ? 'text-blue-300' : shotClockOffenseTeam === 'enemy' ? 'text-red-300' : ''
                }`}>
                  {Math.ceil(shotClock)}
                </p>
              </div>

              {/* 味方スコア（右側） */}
              <div className="text-center min-w-[80px]">
                <p className="text-xs text-blue-300 font-bold">{playerNames.ally}</p>
                <p className="text-3xl font-black text-blue-400">{score.ally}</p>
              </div>
            </div>

            {/* 味方チーム顔（右端） */}
            <div className="flex flex-row gap-1 items-end bg-white/90 rounded-lg px-2 py-1">
              {faceAvatars
                .filter(a => a.team === 'ally')
                .map(avatar => (
                  <PlayerFaceAvatar
                    key={avatar.characterId}
                    dataUrl={avatar.dataUrl}
                    playerName={avatar.playerName}
                    position={avatar.position}
                    team="ally"
                    stateColor={playerStateColors[avatar.characterId]}
                    shotPriority={avatar.shotPriority}
                    offenseRole={avatar.offenseRole}
                    defenseRole={avatar.defenseRole}
                    gameStats={buildStatsView(avatar.characterId)}
                    onClick={() => handleFaceClick(avatar)}
                    onRoleChange={(field, value) => handleRoleChange(avatar.characterId, 'ally', field, value)}
                  />
                ))}
            </div>
          </div>
          {/* 先取表示 */}
          <p className="text-center text-xs text-yellow-400 font-bold mt-1 drop-shadow-lg">
            5点先取
          </p>
        </div>
      )}

      {/* ローディング */}
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-purple-600 to-indigo-700 z-50">
          <div className="text-center">
            <div className="inline-block animate-spin rounded-full h-16 w-16 border-t-4 border-b-4 border-white mb-4"></div>
            <p className="text-white text-xl font-bold">試合準備中...</p>
          </div>
        </div>
      )}

      {/* 勝利オーバーレイ */}
      {winner && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/70 z-50">
          <div className="text-center">
            <div className={`text-6xl font-black mb-4 ${
              winner === 'ally' ? 'text-blue-400' : 'text-red-400'
            }`}>
              {winner === 'ally' ? playerNames.ally : playerNames.enemy}
            </div>
            <div className="text-4xl font-bold text-yellow-400 mb-6">
              WIN!
            </div>
            <div className="text-2xl text-white mb-8">
              {score.ally} - {score.enemy}
            </div>
            <button
              onClick={handleBackToLeague}
              className="px-8 py-4 bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 text-white text-xl font-bold rounded-xl shadow-lg transition-all"
            >
              リーグに戻る
            </button>
          </div>
        </div>
      )}

      {/* 選手詳細パネル */}
      {selectedPlayer && (
        <PlayerDetailPanel
          player={selectedPlayer}
          onClose={() => setSelectedPlayer(null)}
        />
      )}
    </div>
  );
}
