'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { GameScene } from '@/character-move/scenes/GameScene';
import { TeamConfigLoader } from '@/character-move/utils/TeamConfigLoader';
import { PlayerDataLoader } from '@/character-move/utils/PlayerDataLoader';
import { CameraSwitchPanel } from './CameraSwitchPanel';
import { PositionBoardPanel } from './PositionBoardPanel';
import { BoardPlayerPosition } from '@/character-move/types/PositionBoard';

/**
 * Character Moveゲームコンポーネント
 */
export default function CharacterMoveGame() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameSceneRef = useRef<GameScene | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [isPositionBoardVisible, setIsPositionBoardVisible] = useState<boolean>(false);

  useEffect(() => {
    if (!canvasRef.current) return;

    let mounted = true;

    const initializeGame = async () => {
      try {
        setLoading(true);
        console.log('[CharacterMoveGame] ゲーム初期化開始...');

        // チーム設定を読み込む
        const teamConfig = await TeamConfigLoader.loadTeamConfig();

        // 選手データを読み込む
        const playerData = await PlayerDataLoader.loadPlayerData();

        if (!mounted || !canvasRef.current) return;

        console.log('[CharacterMoveGame] GameScene初期化中...');
        // ゲームシーンの初期化
        gameSceneRef.current = new GameScene(canvasRef.current, {
          showAdditionalCharacters: true,
          teamConfig,
          playerData,
        });

        setError(null);
        setLoading(false);
        console.log('[CharacterMoveGame] ゲーム初期化完了');
      } catch (err) {
        console.error('[CharacterMoveGame] Initialization failed:', err);
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
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!gameSceneRef.current) return;

      switch (e.key.toLowerCase()) {
        case 'z':
          // 前のキャラクター
          gameSceneRef.current.switchToPreviousCharacter();
          break;
        case 'c':
          // 次のキャラクター
          gameSceneRef.current.switchToNextCharacter();
          break;
        case 'tab':
          // チーム切り替え
          e.preventDefault();
          gameSceneRef.current.switchTeam();
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

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
    <div className="w-full h-screen flex flex-col bg-gradient-to-br from-purple-600 to-indigo-700">
      {/* ヘッダー */}
      <div className="p-4 bg-black/50 backdrop-blur-sm text-white">
        <h1 className="text-2xl font-bold text-center">
          Character Move - 3Dキャラクター移動
        </h1>
        <p className="text-sm text-center text-gray-200 mt-2">
          キャラクターを自由に動かして遊ぼう！
        </p>
      </div>

      {/* キャンバス */}
      <div className="flex-1 relative">
        <canvas
          ref={canvasRef}
          className="w-full h-full outline-none"
          style={{ touchAction: 'none' }}
        />

        {/* ローディング画面 */}
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-purple-600 to-indigo-700 z-50">
            <div className="text-center">
              <div className="inline-block animate-spin rounded-full h-16 w-16 border-t-4 border-b-4 border-white mb-4"></div>
              <p className="text-white text-xl font-bold">ゲームデータを読み込み中...</p>
              <p className="text-white/70 text-sm mt-2">選手データとチーム設定を読み込んでいます...</p>
            </div>
          </div>
        )}

        {/* 操作説明パネル */}
        {!loading && (
          <div className="absolute top-4 left-4 bg-black/70 backdrop-blur-sm text-white p-4 rounded-lg max-w-xs">
          <h3 className="text-lg font-bold mb-2">操作方法</h3>
          <ul className="text-sm space-y-1">
            <li><strong>W/S</strong>: 前進/後退</li>
            <li><strong>A/D</strong>: 左移動/右移動</li>
            <li><strong>Q/E</strong>: 左右回転</li>
            <li><strong>Z/C</strong>: カメラターゲット切り替え</li>
            <li><strong>Tab</strong>: チーム切り替え</li>
            <li><strong>マウスドラッグ</strong>: カメラ回転</li>
            <li><strong>ホイール</strong>: ズーム</li>
            <li><strong>Ctrl+ドラッグ</strong>: 関節操作</li>
            <li><strong>R</strong>: 関節リセット</li>
          </ul>
          </div>
        )}

        {/* カメラ切り替えパネル */}
        {!loading && <CameraSwitchPanel gameScene={gameSceneRef.current} />}

        {/* ポジション配置ボードトグルボタン */}
        {!loading && (
          <button
            onClick={() => setIsPositionBoardVisible(!isPositionBoardVisible)}
            className={`absolute top-4 right-4 z-40 px-4 py-2 rounded-lg font-semibold transition-colors shadow-lg ${
              isPositionBoardVisible
                ? 'bg-yellow-500 hover:bg-yellow-600 text-black'
                : 'bg-indigo-600 hover:bg-indigo-700 text-white'
            }`}
          >
            {isPositionBoardVisible ? '配置ボード閉' : '配置ボード'}
          </button>
        )}

        {/* ポジション配置ボードパネル */}
        {!loading && (
          <PositionBoardPanel
            isVisible={isPositionBoardVisible}
            onClose={() => setIsPositionBoardVisible(false)}
            onApplyPositions={handleApplyPositions}
          />
        )}
      </div>

      {/* フッター */}
      <div className="p-2 bg-black/50 backdrop-blur-sm text-white text-center text-sm">
        <p className="text-gray-200">
          キーボードで移動 | マウスでカメラ操作
        </p>
      </div>
    </div>
  );
}
