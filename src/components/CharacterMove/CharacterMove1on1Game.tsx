'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { GameScene } from '@/character-move/scenes/GameScene';
import { TeamConfigLoader } from '@/character-move/loaders/TeamConfigLoader';
import { PlayerDataLoader } from '@/character-move/loaders/PlayerDataLoader';
import { HamburgerMenu } from './HamburgerMenu';
import { PositionBoardPanel } from './PositionBoardPanel';
import { BoardPlayerPosition } from '@/character-move/types/PositionBoard';
import { ShootCheckModePanel } from './ShootCheckModePanel';
import { DribbleCheckModePanel } from './DribbleCheckModePanel';
import { PassCheckModePanel } from './PassCheckModePanel';
import { ThrowInCheckModePanel } from './ThrowInCheckModePanel';

type GameModeType = 'game' | 'shoot_check' | 'dribble_check' | 'pass_check' | 'throw_in_check';

/**
 * Character Move 1対1ゲームコンポーネント
 */
export default function CharacterMove1on1Game() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameSceneRef = useRef<GameScene | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [score, setScore] = useState<{ ally: number; enemy: number }>({ ally: 0, enemy: 0 });
  const [winner, setWinner] = useState<'ally' | 'enemy' | null>(null);
  const [winningScore, setWinningScore] = useState<number>(5);
  const [playerNames, setPlayerNames] = useState<{ ally: string; enemy: string }>({ ally: 'ATM', enemy: 'BTM' });
  const [shotClock, setShotClock] = useState<number>(24.0);
  const [shotClockOffenseTeam, setShotClockOffenseTeam] = useState<'ally' | 'enemy' | null>(null);
  const [isPositionBoardVisible, setIsPositionBoardVisible] = useState<boolean>(false);
  const [currentMode, setCurrentMode] = useState<GameModeType>('game');

  useEffect(() => {
    if (!canvasRef.current) return;

    let mounted = true;

    const initializeGame = async () => {
      try {
        setLoading(true);
        console.log('[CharacterMove1on1Game] ゲーム初期化開始...');

        // 5対5用のチーム設定を読み込む
        const teamConfig = await TeamConfigLoader.loadTeamConfig('/data/teamConfig5on5.json');

        // 選手データを読み込む
        const playerData = await PlayerDataLoader.loadPlayerData();

        if (!mounted || !canvasRef.current) return;

        console.log('[CharacterMove1on1Game] GameScene初期化中...');
        // ゲームシーンの初期化
        gameSceneRef.current = new GameScene(canvasRef.current, {
          showAdditionalCharacters: true,
          teamConfig,
          playerData,
        });

        setError(null);
        setLoading(false);
        console.log('[CharacterMove1on1Game] ゲーム初期化完了');
      } catch (err) {
        console.error('[CharacterMove1on1Game] Initialization failed:', err);
        if (mounted) {
          setError(err instanceof Error ? err.message : 'Failed to initialize 3D game');
          setLoading(false);
        }
      }
    };

    initializeGame();

    // クリーンアップ
    return () => {
      mounted = false;
      if (gameSceneRef.current) {
        gameSceneRef.current.dispose();
        gameSceneRef.current = null;
      }
    };
  }, []);

  // キーボードショートカット（カメラ切り替え）
  useEffect(() => {
    let vertexNumbersVisible = false;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (!gameSceneRef.current) return;

      switch (e.key.toLowerCase()) {
        case 'z':
          // 前のキャラクター（手動モードに切り替え）
          gameSceneRef.current.setCameraMode('manual');
          gameSceneRef.current.switchToPreviousCharacter();
          break;
        case 'c':
          // 次のキャラクター（手動モードに切り替え）
          gameSceneRef.current.setCameraMode('manual');
          gameSceneRef.current.switchToNextCharacter();
          break;
        case 'tab':
          // チーム切り替え（手動モードに切り替え）
          e.preventDefault();
          gameSceneRef.current.setCameraMode('manual');
          gameSceneRef.current.switchTeam();
          break;
        case 'v':
          // 頂点番号の表示/非表示を切り替え
          vertexNumbersVisible = !vertexNumbersVisible;
          if (vertexNumbersVisible) {
            gameSceneRef.current.showOctagonVertexNumbers();
            console.log('[CharacterMove1on1Game] 頂点番号を表示');
          } else {
            gameSceneRef.current.hideOctagonVertexNumbers();
            console.log('[CharacterMove1on1Game] 頂点番号を非表示');
          }
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // スコアと勝者を定期的にチェック
  useEffect(() => {
    if (!gameSceneRef.current || loading) return;

    // 勝利に必要な得点と選手名を取得
    setWinningScore(gameSceneRef.current.getWinningScore());
    setPlayerNames(gameSceneRef.current.getPlayerNames());

    const checkInterval = setInterval(() => {
      if (gameSceneRef.current) {
        const currentScore = gameSceneRef.current.getScore();
        const currentWinner = gameSceneRef.current.getWinner();
        const currentShotClock = gameSceneRef.current.getShotClockRemainingTime();
        const currentOffenseTeam = gameSceneRef.current.getShotClockOffenseTeam();

        setScore(currentScore);
        setWinner(currentWinner);
        setShotClock(currentShotClock);
        setShotClockOffenseTeam(currentOffenseTeam);
      }
    }, 100); // 100msごとにチェック

    return () => clearInterval(checkInterval);
  }, [loading]);

  // ゲームをリセット
  const handleResetGame = () => {
    if (gameSceneRef.current) {
      gameSceneRef.current.resetGame();
      setScore({ ally: 0, enemy: 0 });
      setWinner(null);
    }
  };

  // ポジション配置を適用
  const handleApplyPositions = useCallback((
    allyPositions: BoardPlayerPosition[],
    enemyPositions: BoardPlayerPosition[]
  ) => {
    if (!gameSceneRef.current) return;

    const allyPosArray = allyPositions.map(p => ({
      playerId: p.playerId,
      worldX: p.worldX,
      worldZ: p.worldZ,
    }));

    const enemyPosArray = enemyPositions.map(p => ({
      playerId: p.playerId,
      worldX: p.worldX,
      worldZ: p.worldZ,
    }));

    gameSceneRef.current.applyTeamPositions(allyPosArray, enemyPosArray);
  }, []);

  // モード変更ハンドラー
  const handleModeChange = useCallback((mode: GameModeType) => {
    if (!gameSceneRef.current) return;

    // 現在のチェックモードを終了
    if (currentMode !== 'game') {
      gameSceneRef.current.exitCheckMode();
      gameSceneRef.current.resume();
    }

    // 新しいモードを設定
    if (mode !== 'game') {
      gameSceneRef.current.pause();
    }
    setCurrentMode(mode);
  }, [currentMode]);

  // チェックモードを閉じる
  const handleCloseCheckMode = useCallback(() => {
    if (gameSceneRef.current) {
      gameSceneRef.current.exitCheckMode();
      gameSceneRef.current.resume();
    }
    setCurrentMode('game');
  }, []);

  // エラー表示
  if (error) {
    return (
      <div className="w-full h-screen flex items-center justify-center bg-gray-900">
        <div className="max-w-md p-6 bg-red-900/20 border border-red-500 rounded-lg">
          <h2 className="text-xl font-bold text-red-400 mb-4">
            3D Game Initialization Error
          </h2>
          <p className="text-white mb-4">{error}</p>
          <div className="text-sm text-gray-300">
            <p className="mb-2">Possible solutions:</p>
            <ul className="list-disc list-inside space-y-1">
              <li>Use a modern browser (Chrome, Firefox, Edge, Safari)</li>
              <li>Enable hardware acceleration in browser settings</li>
              <li>Update your graphics drivers</li>
              <li>Check if WebGL is enabled in your browser</li>
            </ul>
          </div>
          <button
            onClick={() => window.location.reload()}
            className="mt-4 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded"
          >
            Retry
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

      {/* 画面下部オーバーレイ（スコア・ショットクロック） */}
      {!loading && (
        <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 z-30">
          <div className="flex items-center gap-4 bg-black/70 backdrop-blur-sm rounded-xl px-6 py-3">
            {/* 敵スコア（左側） */}
            <div className="text-center min-w-[80px]">
              <p className="text-xs text-red-300 font-bold">{playerNames.enemy}</p>
              <p className="text-3xl font-black text-red-400">{score.enemy}</p>
            </div>

            {/* ショットクロック（中央） */}
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
          {/* 先取表示 */}
          <p className="text-center text-xs text-yellow-400 font-bold mt-1 drop-shadow-lg">
            {winningScore}点先取
          </p>
        </div>
      )}

      {/* ローディング画面 */}
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-purple-600 to-indigo-700 z-50">
          <div className="text-center">
            <div className="inline-block animate-spin rounded-full h-16 w-16 border-t-4 border-b-4 border-white mb-4"></div>
            <p className="text-white text-xl font-bold">ゲームデータを読み込み中...</p>
            <p className="text-white/70 text-sm mt-2">1対1の設定を準備しています...</p>
          </div>
        </div>
      )}

      {/* ハンバーガーメニュー */}
      {!loading && (
        <HamburgerMenu
          gameScene={gameSceneRef.current}
          currentMode={currentMode}
          onModeChange={handleModeChange}
          isPositionBoardVisible={isPositionBoardVisible}
          onTogglePositionBoard={() => setIsPositionBoardVisible(!isPositionBoardVisible)}
        />
      )}

      {/* ポジション配置ボードパネル */}
      {!loading && (
        <PositionBoardPanel
          isVisible={isPositionBoardVisible}
          onClose={() => setIsPositionBoardVisible(false)}
          onApplyPositions={handleApplyPositions}
        />
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
              {score.enemy} - {score.ally}
            </div>
            <button
              onClick={handleResetGame}
              className="px-8 py-4 bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 text-white text-xl font-bold rounded-xl shadow-lg transition-all"
            >
              もう一度プレイ
            </button>
          </div>
        </div>
      )}

      {/* シュートチェックモードパネル */}
      {currentMode === 'shoot_check' && (
        <ShootCheckModePanel
          gameScene={gameSceneRef.current}
          onClose={handleCloseCheckMode}
        />
      )}

      {/* ドリブルチェックモードパネル */}
      {currentMode === 'dribble_check' && (
        <DribbleCheckModePanel
          gameScene={gameSceneRef.current}
          onClose={handleCloseCheckMode}
        />
      )}

      {/* パスチェックモードパネル */}
      {currentMode === 'pass_check' && (
        <PassCheckModePanel
          gameScene={gameSceneRef.current}
          onClose={handleCloseCheckMode}
        />
      )}

      {/* スローインチェックモードパネル */}
      {currentMode === 'throw_in_check' && (
        <ThrowInCheckModePanel
          gameScene={gameSceneRef.current}
          onClose={handleCloseCheckMode}
        />
      )}
    </div>
  );
}
