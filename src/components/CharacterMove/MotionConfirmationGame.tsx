'use client';

import { useEffect, useRef, useState } from 'react';
import { GameScene } from '@/character-move/scenes/GameScene';
import { MotionConfirmationPanel } from './MotionConfirmationPanel';
import { PlayerDataPanel } from './PlayerDataPanel';
import { PlayerDataLoader } from '@/character-move/utils/PlayerDataLoader';
import { PlayerData } from '@/character-move/types/PlayerData';

/**
 * モーション確認ゲームコンポーネント
 */
export default function MotionConfirmationGame() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameSceneRef = useRef<GameScene | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [gameSceneReady, setGameSceneReady] = useState<boolean>(false);
  const [playerData, setPlayerData] = useState<Record<string, PlayerData> | null>(null);

  // デバッグ: コンポーネントがマウントされたことを確認
  console.log('[MotionConfirmationGame] Component rendered');

  useEffect(() => {
    console.log('[MotionConfirmationGame] useEffect triggered');
    if (!canvasRef.current) {
      console.warn('[MotionConfirmationGame] canvasRef.current is null, waiting...');
      return;
    }
    console.log('[MotionConfirmationGame] Canvas is ready');

    let mounted = true;

    const initializeGame = async () => {
      try {
        setLoading(true);
        console.log('[MotionConfirmationGame] Starting initialization...');

        // 選手データを読み込む
        console.log('[MotionConfirmationGame] Loading player data...');
        const playerDataResult = await PlayerDataLoader.loadPlayerData();
        console.log('[MotionConfirmationGame] Player data loaded:', Object.keys(playerDataResult).length, 'players');

        if (!mounted || !canvasRef.current) {
          console.log('[MotionConfirmationGame] Component unmounted or canvas not ready');
          return;
        }

        setPlayerData(playerDataResult);

        // ゲームシーンの初期化（追加キャラクターなし）
        console.log('[MotionConfirmationGame] Initializing GameScene...');
        gameSceneRef.current = new GameScene(canvasRef.current, {
          showAdditionalCharacters: false,
        });
        console.log('[MotionConfirmationGame] GameScene initialized');

        // モーション確認モードのため、モーション再生を停止
        gameSceneRef.current.stopMotionPlayback();

        setError(null);
        setLoading(false);
        setGameSceneReady(true);
        console.log('[MotionConfirmationGame] Initialization complete!');
      } catch (err) {
        console.error('[MotionConfirmationGame] Initialization failed:', err);
        console.error('[MotionConfirmationGame] Error stack:', err instanceof Error ? err.stack : 'No stack trace');
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

  return (
    <div className="w-full h-screen flex flex-col bg-gradient-to-br from-purple-600 to-indigo-700">
      {/* ヘッダー */}
      <div className="p-4 bg-black/50 backdrop-blur-sm text-white">
        <h1 className="text-2xl font-bold text-center">
          モーション確認ツール
        </h1>
        <p className="text-sm text-center text-gray-200 mt-2">
          各モーションの詳細確認と調整
        </p>
      </div>

      {/* キャンバス */}
      <div className="flex-1 relative">
        <canvas
          ref={canvasRef}
          className="w-full h-full outline-none"
          style={{ touchAction: 'none' }}
        />

        {/* ローディング画面（オーバーレイ） */}
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-purple-600 to-indigo-700 z-50">
            <div className="text-center">
              <div className="inline-block animate-spin rounded-full h-16 w-16 border-t-4 border-b-4 border-white mb-4"></div>
              <p className="text-white text-xl font-bold">選手データを読み込み中...</p>
              <p className="text-white/70 text-sm mt-2">4000人以上の選手データを読み込んでいます...</p>
            </div>
          </div>
        )}

        {/* エラー画面（オーバーレイ） */}
        {error && (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-900 z-50">
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
        )}

        {/* モーション確認パネル */}
        {gameSceneReady && <MotionConfirmationPanel gameScene={gameSceneRef.current} />}

        {/* 選手データパネル */}
        {playerData && <PlayerDataPanel playerData={playerData} />}
      </div>

      {/* フッター */}
      <div className="p-2 bg-black/50 backdrop-blur-sm text-white text-center text-sm">
        <p className="text-gray-200">
          モーション確認ツール - 各関節の角度を確認・調整できます
        </p>
      </div>
    </div>
  );
}
