'use client';

import { useEffect, useRef, useState } from 'react';
import { GameScene } from '@/character-move/scenes/GameScene';
import { MotionConfirmationPanel } from './MotionConfirmationPanel';

/**
 * モーション確認ゲームコンポーネント
 */
export default function MotionConfirmationGame() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameSceneRef = useRef<GameScene | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [gameSceneReady, setGameSceneReady] = useState<boolean>(false);

  useEffect(() => {
    if (!canvasRef.current) return;

    try {

      
      // ゲームシーンの初期化（追加キャラクターなし）
      gameSceneRef.current = new GameScene(canvasRef.current, { showAdditionalCharacters: false });

      // モーション確認モードのため、モーション再生を停止
      gameSceneRef.current.stopMotionPlayback();

      setError(null);
      setGameSceneReady(true);
    } catch (err) {
      console.error('[MotionConfirmationGame] Initialization failed:', err);
      setError(err instanceof Error ? err.message : 'Failed to initialize 3D game');
    }

    // クリーンアップ
    return () => {
      if (gameSceneRef.current) {
        gameSceneRef.current.dispose();
        gameSceneRef.current = null;
      }
    };
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

        {/* モーション確認パネル */}
        {gameSceneReady && <MotionConfirmationPanel gameScene={gameSceneRef.current} />}
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
