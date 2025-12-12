'use client';

import { useEffect, useRef, useState } from 'react';
import { GameScene } from '@/basketball3d-game/scenes/GameScene';

/**
 * 3Dバスケットボールゲームコンポーネント
 */
export default function Basketball3DGame() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameSceneRef = useRef<GameScene | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [player2Enabled, setPlayer2Enabled] = useState<boolean>(true); // デフォルト: true

  useEffect(() => {
    if (!canvasRef.current) return;

    try {
      // ゲームシーンの初期化
      gameSceneRef.current = new GameScene(canvasRef.current);

      // デフォルトのPlayer2の状態を設定
      gameSceneRef.current.setPlayer2Enabled(player2Enabled);

      setError(null);
    } catch (err) {
      console.error('[Basketball3DGame] Initialization failed:', err);
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

  // Player2の表示/非表示を切り替え
  const togglePlayer2 = () => {
    if (gameSceneRef.current) {
      const newState = !player2Enabled;
      setPlayer2Enabled(newState);
      gameSceneRef.current.setPlayer2Enabled(newState);
    }
  };

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
    <div className="w-full h-screen flex flex-col bg-gray-900">
      {/* ヘッダー */}
      <div className="p-4 bg-gray-800 text-white">
        <h1 className="text-2xl font-bold text-center">
          3D Basketball Game - 1vs1
        </h1>
        <p className="text-sm text-center text-gray-400 mt-2">
          マウスドラッグで視点回転 / ホイールでズーム
        </p>
        <p className="text-xs text-center text-gray-500 mt-1">
          キー: 1=通常 / 2=ドリブル / 3=ディフェンス / 4=シュート
        </p>
      </div>

      {/* キャンバス */}
      <div className="flex-1 relative">
        <canvas
          ref={canvasRef}
          className="w-full h-full outline-none"
          style={{ touchAction: 'none' }}
        />

        {/* Player2表示/非表示ボタン */}
        <div className="absolute top-4 right-4 z-10">
          <button
            onClick={togglePlayer2}
            className={`px-4 py-2 rounded-lg font-semibold transition-colors ${
              player2Enabled
                ? 'bg-green-600 hover:bg-green-700 text-white'
                : 'bg-gray-600 hover:bg-gray-700 text-gray-300'
            }`}
          >
            {player2Enabled ? 'Player2: ON' : 'Player2: OFF'}
          </button>
        </div>
      </div>

      {/* フッター（将来的にスコア表示など） */}
      <div className="p-2 bg-gray-800 text-white text-center text-sm">
        <p className="text-gray-400">Phase 3: ボール奪い合い実装完了</p>
      </div>
    </div>
  );
}
