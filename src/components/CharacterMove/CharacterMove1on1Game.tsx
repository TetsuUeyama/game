'use client';

import { useEffect, useRef, useState } from 'react';
import { GameScene } from '@/character-move/scenes/GameScene';
import { TeamConfigLoader } from '@/character-move/utils/TeamConfigLoader';
import { PlayerDataLoader } from '@/character-move/utils/PlayerDataLoader';
import { CameraSwitchPanel } from './CameraSwitchPanel';

/**
 * Character Move 1対1ゲームコンポーネント
 */
export default function CharacterMove1on1Game() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameSceneRef = useRef<GameScene | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [is1on1, setIs1on1] = useState<boolean>(false);
  const [in1on1Battle, setIn1on1Battle] = useState<boolean>(false);
  const [diceResult, setDiceResult] = useState<{ winner: 'offense' | 'defense'; offenseDice: number; defenseDice: number } | null>(null);
  const [defenderRadius, setDefenderRadius] = useState<number>(1.0);

  useEffect(() => {
    if (!canvasRef.current) return;

    let mounted = true;

    const initializeGame = async () => {
      try {
        setLoading(true);
        console.log('[CharacterMove1on1Game] ゲーム初期化開始...');

        // 1対1用のチーム設定を読み込む
        const teamConfig = await TeamConfigLoader.loadTeamConfig('/data/teamConfig1on1.json');

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

  // 1on1状態を定期的にチェック
  useEffect(() => {
    if (!gameSceneRef.current || loading) return;

    const checkInterval = setInterval(() => {
      if (gameSceneRef.current) {
        const is1on1State = gameSceneRef.current.is1on1State();
        if (is1on1State !== is1on1) {
          console.log(`[CharacterMove1on1Game] 1on1状態変更: ${is1on1State}`);
        }
        setIs1on1(is1on1State);
      }
    }, 100); // 100msごとにチェック

    return () => clearInterval(checkInterval);
  }, [loading, is1on1]);

  // 1on1バトル状態とサークル半径を定期的にチェック
  useEffect(() => {
    if (!gameSceneRef.current || loading) return;

    const checkInterval = setInterval(() => {
      if (gameSceneRef.current) {
        const battleState = gameSceneRef.current.isIn1on1Battle();
        const radius = gameSceneRef.current.getDefenderCircleRadius();

        setIn1on1Battle(battleState);
        setDefenderRadius(radius);
      }
    }, 100); // 100msごとにチェック

    return () => clearInterval(checkInterval);
  }, [loading]);

  // サイコロ勝負の結果を定期的にチェック
  useEffect(() => {
    if (!gameSceneRef.current || loading) return;

    const checkInterval = setInterval(() => {
      if (gameSceneRef.current) {
        const result = gameSceneRef.current.get1on1Result();
        if (result) {
          console.log(`[CharacterMove1on1Game] サイコロ勝負結果:`, result);
          setDiceResult(result);

          // 1秒後に結果をクリア（繰り返しの勝負に対応）
          setTimeout(() => {
            if (gameSceneRef.current) {
              gameSceneRef.current.clear1on1Result();
              setDiceResult(null);
            }
          }, 1000);
        }
      }
    }, 100); // 100msごとにチェック

    return () => clearInterval(checkInterval);
  }, [loading]);

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
          Character Move - 1対1テスト
        </h1>
        <p className="text-sm text-center text-gray-200 mt-2">
          1対1の対決を観察しよう！
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
              <p className="text-white/70 text-sm mt-2">1対1の設定を準備しています...</p>
            </div>
          </div>
        )}

        {/* 操作説明パネル */}
        {!loading && (
          <div className="absolute top-4 left-4 bg-black/70 backdrop-blur-sm text-white p-4 rounded-lg max-w-xs">
          <h3 className="text-lg font-bold mb-2">操作方法</h3>
          <ul className="text-sm space-y-1">
            <li><strong>Z/C</strong>: カメラターゲット切り替え</li>
            <li><strong>Tab</strong>: チーム切り替え</li>
            <li><strong>V</strong>: 8角形の頂点番号表示</li>
            <li><strong>マウスドラッグ</strong>: カメラ回転</li>
            <li><strong>ホイール</strong>: ズーム</li>
          </ul>
          <div className="mt-3 pt-3 border-t border-white/20">
            <p className="text-xs text-gray-300">
              ※1対1のテスト環境です
            </p>
          </div>
          </div>
        )}

        {/* カメラ切り替えパネル */}
        {!loading && <CameraSwitchPanel gameScene={gameSceneRef.current} />}

        {/* 1on1バトル状態表示（サークル半径込み） */}
        {!loading && in1on1Battle && (
          <div className="absolute top-4 right-4 bg-black/80 backdrop-blur-sm text-white p-6 rounded-xl shadow-2xl border-2 border-yellow-400 z-40">
            <div className="text-center mb-4">
              <p className="text-3xl font-black text-yellow-400 animate-pulse">
                1on1 バトル中！
              </p>
            </div>

            {/* サークル半径表示 */}
            <div className="bg-gradient-to-r from-blue-600 to-purple-600 rounded-lg p-4 mb-2">
              <p className="text-sm font-bold mb-2 text-center">ディフェンダーのサークル</p>
              <div className="flex items-center justify-between">
                <span className="text-xs">0m</span>
                <div className="flex-1 mx-3 bg-gray-700 rounded-full h-6 relative overflow-hidden">
                  <div
                    className="absolute left-0 top-0 h-full bg-gradient-to-r from-green-500 via-yellow-500 to-red-500 transition-all duration-300"
                    style={{ width: `${(defenderRadius / 1.0) * 100}%` }}
                  ></div>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="text-xs font-bold text-white drop-shadow-lg">
                      {defenderRadius.toFixed(2)}m
                    </span>
                  </div>
                </div>
                <span className="text-xs">1.0m</span>
              </div>
              <div className="mt-2 text-xs text-center text-gray-200">
                {defenderRadius <= 0
                  ? '⚡ 突破成功！'
                  : defenderRadius >= 1.0
                  ? '🛡️ 完全防御'
                  : `🎲 ${((1.0 - defenderRadius) / 0.2).toFixed(0)}回勝利 / 5回中`
                }
              </div>
            </div>

            {/* 説明 */}
            <div className="text-xs text-gray-300 space-y-1 border-t border-gray-600 pt-2">
              <p>• オフェンス勝利: サークル縮小</p>
              <p>• ディフェンス勝利: サークル拡大</p>
              <p>• サークル0m: 突破成功</p>
              <p>• 最大時に防御成功: ボール奪取</p>
            </div>
          </div>
        )}

        {/* サイコロ勝負結果表示（コンパクト版） */}
        {!loading && diceResult && (
          <div className="absolute top-1/3 left-1/2 transform -translate-x-1/2 -translate-y-1/2 pointer-events-none z-50">
            <div className="bg-black/90 backdrop-blur-sm text-white px-8 py-6 rounded-2xl shadow-2xl border-4 border-yellow-400">
              <div className="flex gap-6 items-center justify-center mb-3">
                <div className="text-center">
                  <p className="text-lg font-bold mb-1 text-blue-300">攻撃</p>
                  <div className="bg-white text-black text-4xl font-black w-16 h-16 flex items-center justify-center rounded-xl shadow-lg">
                    {diceResult.offenseDice}
                  </div>
                </div>
                <p className="text-3xl font-black text-yellow-400">VS</p>
                <div className="text-center">
                  <p className="text-lg font-bold mb-1 text-red-300">守備</p>
                  <div className="bg-white text-black text-4xl font-black w-16 h-16 flex items-center justify-center rounded-xl shadow-lg">
                    {diceResult.defenseDice}
                  </div>
                </div>
              </div>
              <div className={`text-3xl font-black text-center py-3 px-6 rounded-xl ${
                diceResult.winner === 'offense'
                  ? 'bg-gradient-to-r from-blue-500 to-blue-600 animate-pulse'
                  : 'bg-gradient-to-r from-red-500 to-red-600 animate-pulse'
              }`}>
                {diceResult.winner === 'offense' ? '⚔️ 攻撃成功!' : '🛡️ 防御成功!'}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* フッター */}
      <div className="p-2 bg-black/50 backdrop-blur-sm text-white text-center text-sm">
        <p className="text-gray-200">
          1対1の対決を観察 | マウスでカメラ操作
        </p>
      </div>
    </div>
  );
}
