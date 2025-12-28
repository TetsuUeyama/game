'use client';

import { useEffect, useRef, useState } from 'react';
import { GameScene } from '@/character-move/scenes/GameScene';

/**
 * Character Moveゲームコンポーネント
 */
export default function CharacterMoveGame() {
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
      console.error('[CharacterMoveGame] Initialization failed:', err);
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

        {/* 操作説明パネル */}
        <div className="absolute top-4 left-4 bg-black/70 backdrop-blur-sm text-white p-4 rounded-lg max-w-xs">
          <h3 className="text-lg font-bold mb-2">操作方法</h3>
          <ul className="text-sm space-y-1">
            <li><strong>W/S</strong>: 前進/後退</li>
            <li><strong>A/D</strong>: 左移動/右移動</li>
            <li><strong>Q/E</strong>: 左回転/右回転</li>
            <li><strong>マウスドラッグ</strong>: カメラ回転</li>
            <li><strong>ホイール</strong>: ズーム</li>
          </ul>
        </div>
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
