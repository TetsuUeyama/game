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

  useEffect(() => {
    if (!canvasRef.current) return;

    try {
      // ゲームシーンの初期化
      gameSceneRef.current = new GameScene(canvasRef.current);
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
      </div>

      {/* フッター（将来的にスコア表示など） */}
      <div className="p-2 bg-gray-800 text-white text-center text-sm">
        <p className="text-gray-400">Phase 2: プレイヤー（顔・手）とボール追加完了</p>
      </div>
    </div>
  );
}
