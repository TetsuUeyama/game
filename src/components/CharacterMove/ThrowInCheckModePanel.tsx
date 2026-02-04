'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { GameScene } from '@/character-move/scenes/GameScene';
import {
  ThrowInCheckController,
  ThrowInCheckProgress,
  ThrowInTestResult,
  OuterCellResult,
  ThrowInCheckConfig,
} from '@/character-move/controllers/check/ThrowInCheckController';
import { PlayerDataLoader } from '@/character-move/loaders/PlayerDataLoader';
import { PlayerData } from '@/character-move/types/PlayerData';

interface ThrowInCheckModePanelProps {
  gameScene: GameScene | null;
  onClose: () => void;
}

type SetupPhase = 'setup' | 'running' | 'completed';

/**
 * スローインチェックモードパネル
 * 外枠マスからフィールド内へのスローインをテスト
 */
export function ThrowInCheckModePanel({ gameScene, onClose }: ThrowInCheckModePanelProps) {
  const throwInCheckControllerRef = useRef<ThrowInCheckController | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number>(0);

  // セットアップ状態
  const [phase, setPhase] = useState<SetupPhase>('setup');
  const [loading, setLoading] = useState(true);

  // 選手データ
  const [players, setPlayers] = useState<Record<string, PlayerData>>({});
  const [throwerPlayerId, setThrowerPlayerId] = useState<string>('');
  const [receiverPlayerId, setReceiverPlayerId] = useState<string>('');

  // 距離設定
  const [minDistance, setMinDistance] = useState<number>(2.0);
  const [maxDistance, setMaxDistance] = useState<number>(12.0);
  const [timeoutSeconds, setTimeoutSeconds] = useState<number>(5.0);

  // 進捗
  const [progress, setProgress] = useState<ThrowInCheckProgress | null>(null);

  // 結果
  const [results, setResults] = useState<OuterCellResult[]>([]);
  const [recentTests, setRecentTests] = useState<ThrowInTestResult[]>([]);

  // 選手データを読み込む
  useEffect(() => {
    const loadPlayers = async () => {
      try {
        const playerData = await PlayerDataLoader.loadPlayerData();
        setPlayers(playerData);

        const playerIds = Object.keys(playerData);
        if (playerIds.length > 0) {
          setThrowerPlayerId(playerIds[0]);
        }
        if (playerIds.length > 1) {
          setReceiverPlayerId(playerIds[1]);
        }
      } catch (error) {
        console.error('Failed to load player data:', error);
      } finally {
        setLoading(false);
      }
    };

    loadPlayers();
  }, []);

  // 閉じる処理
  const handleClose = useCallback(() => {
    if (throwInCheckControllerRef.current) {
      throwInCheckControllerRef.current.stop();
    }
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    gameScene?.resume();
    gameScene?.exitCheckMode();
    onClose();
  }, [gameScene, onClose]);

  // テストを開始
  const startTest = useCallback(() => {
    if (!gameScene || !throwerPlayerId || !receiverPlayerId) return;

    // GameScene の通常更新ループを一時停止
    gameScene.pause();

    // 初期位置でセットアップ
    const setupResult = gameScene.setupThrowInCheckMode(
      throwerPlayerId,
      receiverPlayerId,
      { col: '@', row: 1 },
      { col: 'A', row: 1 },
      players
    );

    if (!setupResult) {
      console.error('[ThrowInCheckModePanel] セットアップに失敗しました');
      gameScene.resume();
      return;
    }

    // コントローラーを作成
    const config: ThrowInCheckConfig = {
      minDistance,
      maxDistance,
      timeoutSeconds,
    };

    const controller = new ThrowInCheckController(
      setupResult.thrower,
      setupResult.receiver,
      gameScene.getBall(),
      config
    );

    throwInCheckControllerRef.current = controller;

    // コールバックを設定
    controller.setOnProgressCallback((p) => {
      setProgress(p);
    });

    controller.setOnTestCompleteCallback((result) => {
      setRecentTests(prev => [result, ...prev].slice(0, 20)); // 最新20件を保持
    });

    controller.setOnOuterCellCompleteCallback((result) => {
      setResults(prev => [...prev, result]);
    });

    controller.setOnAllCompleteCallback(() => {
      setPhase('completed');
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
    });

    setPhase('running');
    setResults([]);
    setRecentTests([]);
    controller.start();

    // 更新ループを開始
    const updateLoop = (time: number) => {
      const deltaTime = lastTimeRef.current ? (time - lastTimeRef.current) / 1000 : 0.016;
      lastTimeRef.current = time;

      if (throwInCheckControllerRef.current) {
        throwInCheckControllerRef.current.update(deltaTime);

        // GameScene の衝突判定を更新
        gameScene.updateCollisionSystems(deltaTime);
        gameScene.getBall().update(deltaTime);
      }

      if (throwInCheckControllerRef.current?.getState() !== 'completed') {
        animationFrameRef.current = requestAnimationFrame(updateLoop);
      }
    };

    animationFrameRef.current = requestAnimationFrame(updateLoop);
  }, [gameScene, throwerPlayerId, receiverPlayerId, players, minDistance, maxDistance, timeoutSeconds]);

  // 停止
  const stopTest = useCallback(() => {
    if (throwInCheckControllerRef.current) {
      throwInCheckControllerRef.current.stop();
    }
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    setPhase('setup');
  }, []);

  // クリーンアップ
  useEffect(() => {
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      if (throwInCheckControllerRef.current) {
        throwInCheckControllerRef.current.dispose();
      }
    };
  }, []);

  // 結果のサマリーを計算
  const resultSummary = {
    totalOuterCells: results.length,
    totalTests: results.reduce((sum, r) => sum + r.tests.length, 0),
    totalSuccess: results.reduce((sum, r) => sum + r.successCount, 0),
    totalFail: results.reduce((sum, r) => sum + r.failCount, 0),
    averageSuccessRate: results.length > 0
      ? results.reduce((sum, r) => sum + r.successRate, 0) / results.length
      : 0,
  };

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50">
        <div className="text-white text-xl">読み込み中...</div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 pointer-events-none">
      {/* セットアップ画面 */}
      {phase === 'setup' && (
        <div className="absolute inset-0 bg-black/80 flex items-center justify-center pointer-events-auto">
          <div className="bg-gray-800 rounded-xl p-6 max-w-2xl w-full shadow-xl border border-gray-700">
            {/* ヘッダー */}
            <div className="flex justify-between items-center mb-6 pb-4 border-b border-gray-700">
              <h2 className="text-2xl font-bold text-white">スローインチェックモード</h2>
              <button
                onClick={handleClose}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg font-semibold"
              >
                閉じる
              </button>
            </div>

            <div className="space-y-6">
              {/* 説明 */}
              <div className="bg-gray-700 p-4 rounded-lg text-gray-300 text-sm">
                <p>スロワーが外枠マスを1つずつ移動し、各位置からレシーバーにパスを投げます。</p>
                <p>レシーバーは設定された距離範囲内の内側マスを1つずつ移動して受けます。</p>
              </div>

              {/* 選手選択 */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-gray-300 font-medium mb-2">スロワー</label>
                  <select
                    value={throwerPlayerId}
                    onChange={(e) => setThrowerPlayerId(e.target.value)}
                    className="w-full px-3 py-2 bg-gray-700 text-white rounded-lg border border-gray-600 focus:border-cyan-500 focus:outline-none"
                  >
                    {Object.entries(players).map(([id, player]) => (
                      <option key={id} value={id}>
                        {player.basic.NAME}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-gray-300 font-medium mb-2">レシーバー</label>
                  <select
                    value={receiverPlayerId}
                    onChange={(e) => setReceiverPlayerId(e.target.value)}
                    className="w-full px-3 py-2 bg-gray-700 text-white rounded-lg border border-gray-600 focus:border-cyan-500 focus:outline-none"
                  >
                    {Object.entries(players).map(([id, player]) => (
                      <option key={id} value={id}>
                        {player.basic.NAME}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* 距離設定 */}
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-gray-300 font-medium mb-2">最小距離 (m)</label>
                  <input
                    type="number"
                    value={minDistance}
                    onChange={(e) => setMinDistance(parseFloat(e.target.value) || 0)}
                    className="w-full px-3 py-2 bg-gray-700 text-white rounded-lg border border-gray-600"
                    min={0}
                    step={0.5}
                  />
                </div>
                <div>
                  <label className="block text-gray-300 font-medium mb-2">最大距離 (m)</label>
                  <input
                    type="number"
                    value={maxDistance}
                    onChange={(e) => setMaxDistance(parseFloat(e.target.value) || 0)}
                    className="w-full px-3 py-2 bg-gray-700 text-white rounded-lg border border-gray-600"
                    min={0}
                    step={0.5}
                  />
                </div>
                <div>
                  <label className="block text-gray-300 font-medium mb-2">タイムアウト (秒)</label>
                  <input
                    type="number"
                    value={timeoutSeconds}
                    onChange={(e) => setTimeoutSeconds(parseFloat(e.target.value) || 5)}
                    className="w-full px-3 py-2 bg-gray-700 text-white rounded-lg border border-gray-600"
                    min={1}
                    step={1}
                  />
                </div>
              </div>

              <button
                onClick={startTest}
                disabled={!throwerPlayerId || !receiverPlayerId}
                className="w-full py-3 bg-cyan-600 hover:bg-cyan-700 disabled:bg-gray-600 text-white rounded-lg font-semibold text-lg"
              >
                テスト開始
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 実行中のUI（ゲーム画面が見える状態） */}
      {phase === 'running' && (
        <>
          {/* ヘッダー */}
          <div className="flex items-center justify-between p-4 bg-gray-800/90 backdrop-blur-sm border-b border-gray-700 pointer-events-auto">
            <div className="flex items-center gap-4">
              <h2 className="text-xl font-bold text-white">スローインチェック（実行中）</h2>
              {progress && (
                <span className="px-3 py-1 bg-cyan-600/80 rounded-lg text-white font-semibold">
                  {progress.currentOuterCell} → {progress.currentInnerCell}
                </span>
              )}
            </div>
            <div className="flex items-center gap-4">
              {progress && (
                <span className="text-gray-300">
                  {progress.completedTests} / {progress.totalTests}
                  <span className="ml-2 text-green-400">成功: {progress.successCount}</span>
                  <span className="ml-2 text-red-400">失敗: {progress.failCount}</span>
                </span>
              )}
              <button
                onClick={stopTest}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg font-semibold"
              >
                停止
              </button>
            </div>
          </div>

          {/* 右側パネル: 試行結果リスト */}
          {recentTests.length > 0 && (
            <div className="absolute top-20 right-4 w-80 max-h-[60vh] bg-gray-800/90 backdrop-blur-sm border border-gray-700 rounded-lg overflow-y-auto pointer-events-auto">
              <div className="p-4">
                <h3 className="text-lg font-bold text-white mb-4">試行結果</h3>
                <div className="space-y-2">
                  {recentTests.map((result, index) => (
                    <div
                      key={index}
                      className={`p-3 rounded-lg ${
                        result.success
                          ? 'bg-green-900/50 border border-green-700'
                          : 'bg-red-900/50 border border-red-700'
                      }`}
                    >
                      <div className="flex justify-between items-center">
                        <span className="text-white font-semibold text-sm">
                          {result.throwerCell.col}{result.throwerCell.row} → {result.receiverCell.col}{result.receiverCell.row}
                        </span>
                        <span className={result.success ? 'text-green-400' : 'text-red-400'}>
                          {result.success ? '成功' : '失敗'}
                        </span>
                      </div>
                      <div className="text-sm text-gray-400 mt-1">
                        {result.distance.toFixed(1)}m
                        {result.success && result.catchTime && ` / ${result.catchTime.toFixed(2)}秒`}
                        {!result.success && result.error && ` / ${result.error}`}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* 進捗バー */}
          {progress && (
            <div className="absolute bottom-0 left-0 right-0 p-4 bg-gray-800/90 backdrop-blur-sm border-t border-gray-700 pointer-events-auto">
              <div className="flex items-center gap-4">
                <div className="flex-1">
                  <div className="w-full bg-gray-700 rounded-full h-3">
                    <div
                      className="bg-cyan-500 h-3 rounded-full transition-all"
                      style={{ width: progress.totalTests > 0 ? `${(progress.completedTests / progress.totalTests) * 100}%` : '0%' }}
                    />
                  </div>
                </div>
                <span className="text-white text-sm w-24 text-right">
                  {progress.totalTests > 0 ? ((progress.completedTests / progress.totalTests) * 100).toFixed(1) : 0}%
                </span>
              </div>
            </div>
          )}
        </>
      )}

      {/* 完了画面 */}
      {phase === 'completed' && (
        <div className="absolute inset-0 bg-black/70 flex items-center justify-center pointer-events-auto">
          <div className="bg-gray-800 p-8 rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-auto">
            <h3 className="text-2xl font-bold text-white mb-6 text-center">
              テスト完了
            </h3>

            {/* サマリー */}
            <div className="bg-gray-700 p-6 rounded-lg mb-6">
              <div className="grid grid-cols-5 gap-4 text-center">
                <div>
                  <p className="text-2xl font-bold text-white">{resultSummary.totalOuterCells}</p>
                  <p className="text-sm text-gray-400">外側マス</p>
                </div>
                <div>
                  <p className="text-2xl font-bold text-white">{resultSummary.totalTests}</p>
                  <p className="text-sm text-gray-400">総テスト</p>
                </div>
                <div>
                  <p className="text-2xl font-bold text-green-400">{resultSummary.totalSuccess}</p>
                  <p className="text-sm text-gray-400">成功</p>
                </div>
                <div>
                  <p className="text-2xl font-bold text-red-400">{resultSummary.totalFail}</p>
                  <p className="text-sm text-gray-400">失敗</p>
                </div>
                <div>
                  <p className="text-2xl font-bold text-cyan-400">{resultSummary.averageSuccessRate.toFixed(1)}%</p>
                  <p className="text-sm text-gray-400">平均成功率</p>
                </div>
              </div>
            </div>

            {/* 外側マスごとの結果 */}
            <div className="bg-gray-700 p-4 rounded-lg max-h-48 overflow-auto mb-6">
              <h4 className="font-bold text-white mb-3">外側マスごとの結果</h4>
              <div className="space-y-2 text-sm">
                {results.map((r, i) => (
                  <div key={i} className="flex justify-between items-center py-1 border-b border-gray-600">
                    <span className="text-white font-mono">{r.outerCell.col}{r.outerCell.row}</span>
                    <span className="text-gray-400 text-xs">({r.outerCell.type})</span>
                    <span className={r.successRate >= 80 ? 'text-green-400' : r.successRate >= 50 ? 'text-yellow-400' : 'text-red-400'}>
                      {r.successCount}/{r.tests.length} ({r.successRate.toFixed(1)}%)
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* 失敗したテスト */}
            {resultSummary.totalFail > 0 && (
              <div className="bg-red-900/30 p-4 rounded-lg max-h-32 overflow-auto border border-red-700 mb-6">
                <h4 className="font-bold mb-2 text-red-300">失敗したテスト ({resultSummary.totalFail}件)</h4>
                <div className="space-y-1 text-sm text-red-200">
                  {results.flatMap(r => r.tests.filter(t => !t.success)).slice(0, 30).map((t, i) => (
                    <div key={i}>
                      {t.throwerCell.col}{t.throwerCell.row} → {t.receiverCell.col}{t.receiverCell.row} ({t.distance.toFixed(1)}m): {t.error}
                    </div>
                  ))}
                  {resultSummary.totalFail > 30 && (
                    <div className="text-gray-400">...他 {resultSummary.totalFail - 30} 件</div>
                  )}
                </div>
              </div>
            )}

            <div className="flex gap-4">
              <button
                onClick={() => {
                  setPhase('setup');
                  setResults([]);
                  setProgress(null);
                  setRecentTests([]);
                }}
                className="flex-1 py-3 bg-cyan-600 hover:bg-cyan-700 text-white rounded-lg font-semibold"
              >
                新しいテスト
              </button>
              <button
                onClick={handleClose}
                className="flex-1 py-3 bg-gray-600 hover:bg-gray-500 text-white rounded-lg font-semibold"
              >
                閉じる
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
