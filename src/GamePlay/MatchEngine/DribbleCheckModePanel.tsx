'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { GameScene } from '@/GamePlay/MatchEngine/GameScene';
import {
  DribbleCheckController,
  DribbleCheckProgress,
  DribbleCheckResult,
  DribbleCheckConfig,
} from '@/GamePlay/MatchEngine/CheckControllers/DribbleCheckController';
import { PlayerDataLoader } from '@/GamePlay/Management/Services/PlayerDataLoader';
import { PlayerData } from '@/GamePlay/Management/Types/PlayerData';
import { FieldGridUtils } from '@/GamePlay/GameSystem/FieldSystem/FieldGridConfig';
import { FeintController } from '@/GamePlay/GameSystem/CharacterMove/Controllers/Action/FeintController';

interface DribbleCheckModePanelProps {
  gameScene: GameScene | null;
  onClose: () => void;
}

type SetupPhase = 'setup' | 'running' | 'completed';

// 列ラベル（A-O）
const COL_LABELS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O'];
// 行ラベル（1-30）
const ROW_LABELS = Array.from({ length: 30 }, (_, i) => i + 1);

/**
 * ドリブルチェックモードパネル
 * GameScene を使用して実際のゲームロジックでドリブルをテスト
 */
export function DribbleCheckModePanel({ gameScene, onClose }: DribbleCheckModePanelProps) {
  const dribbleCheckControllerRef = useRef<DribbleCheckController | null>(null);
  const feintControllerRef = useRef<FeintController | null>(null);

  // セットアップ状態
  const [phase, setPhase] = useState<SetupPhase>('setup');
  const [loading, setLoading] = useState(true);

  // 選手データ
  const [players, setPlayers] = useState<Record<string, PlayerData>>({});
  const [dribblerPlayerId, setDribblerPlayerId] = useState<string>('');
  const [defenderPlayerId, setDefenderPlayerId] = useState<string>('');

  // 設定
  const [targetGoal, setTargetGoal] = useState<'goal1' | 'goal2'>('goal1');
  const [trialsPerConfig] = useState<number>(10);
  const [timeoutSeconds] = useState<number>(30);

  // マス選択
  const [dribblerCol, setDribblerCol] = useState<string>('H');
  const [dribblerRow, setDribblerRow] = useState<number>(20);
  const [defenderCol, setDefenderCol] = useState<string>('H');
  const [defenderRow, setDefenderRow] = useState<number>(25);
  const [targetCol, setTargetCol] = useState<string>('H');
  const [targetRow, setTargetRow] = useState<number>(29);

  // 進捗
  const [progress, setProgress] = useState<DribbleCheckProgress | null>(null);

  // 結果
  const [results, setResults] = useState<DribbleCheckResult[]>([]);

  // 重心可視化モード
  const [balanceVisualizationEnabled, setBalanceVisualizationEnabled] = useState<boolean>(true);

  // 選手データを読み込む
  useEffect(() => {
    const loadPlayers = async () => {
      try {
        const playerData = await PlayerDataLoader.loadPlayerData();
        setPlayers(playerData);

        // 最初の2選手を選択
        const playerIds = Object.keys(playerData);
        if (playerIds.length > 0) {
          setDribblerPlayerId(playerIds[0]);
        }
        if (playerIds.length > 1) {
          setDefenderPlayerId(playerIds[1]);
        }
      } catch (error) {
        console.error('Failed to load player data:', error);
      } finally {
        setLoading(false);
      }
    };

    loadPlayers();
  }, []);

  // ドリブルチェックを開始
  const startDribbleCheck = useCallback(() => {
    if (!gameScene || !dribblerPlayerId || !defenderPlayerId) return;

    // セル座標をワールド座標に変換
    const dribblerWorldPos = FieldGridUtils.cellToWorld(dribblerCol, dribblerRow);
    const defenderWorldPos = FieldGridUtils.cellToWorld(defenderCol, defenderRow);
    const targetWorldPos = FieldGridUtils.cellToWorld(targetCol, targetRow);

    if (!dribblerWorldPos || !defenderWorldPos || !targetWorldPos) {
      console.error('[DribbleCheckModePanel] 座標変換に失敗しました');
      return;
    }

    // GameScene の通常更新ループを一時停止（二重更新を防ぐ）
    gameScene.pause();

    // GameScene のドリブルチェックモードをセットアップ（選手IDと選手データを渡す）
    const setupResult = gameScene.setupDribbleCheckMode(
      dribblerPlayerId,
      defenderPlayerId,
      { x: dribblerWorldPos.x, z: dribblerWorldPos.z },
      { x: defenderWorldPos.x, z: defenderWorldPos.z },
      { x: targetWorldPos.x, z: targetWorldPos.z },
      players
    );

    if (!setupResult) {
      console.error('[DribbleCheckModePanel] ドリブルチェックモードのセットアップに失敗しました');
      gameScene.resume(); // 失敗時は再開
      return;
    }

    const { dribbler, defender } = setupResult;

    // シュートレンジ表示を非表示にする
    const shootingController = gameScene.getShootingController();
    if (shootingController) {
      shootingController.hideShootRange();
    }

    // シュート時の飛行を停止する
    const ball = gameScene.getBall();
    if (ball.isInFlight()) {
      ball.endFlight();
    }

    // フェイントコントローラーを作成
    feintControllerRef.current = new FeintController(
      () => gameScene.getAllCharacters(),
      gameScene.getBall()
    );

    // ドリブルチェックコントローラーを作成
    const config: DribbleCheckConfig = {
      dribblerCell: { col: dribblerCol, row: dribblerRow },
      defenderCell: { col: defenderCol, row: defenderRow },
      targetCell: { col: targetCol, row: targetRow },
      trialsPerConfig,
      timeoutSeconds,
      targetGoal,
    };

    dribbleCheckControllerRef.current = new DribbleCheckController(
      dribbler,
      defender,
      gameScene.getBall(),
      gameScene.getField(),
      () => gameScene.getAllCharacters(),
      config,
      feintControllerRef.current,
      () => gameScene.isCirclesInContact() // 試合モードと同じスキップ処理用
    );

    // コールバック設定
    dribbleCheckControllerRef.current.setOnProgressCallback((p) => {
      setProgress(p);
    });

    dribbleCheckControllerRef.current.setOnTrialCompleteCallback((result) => {
      setResults((prev) => [...prev, result]);
    });

    dribbleCheckControllerRef.current.setOnCompleteCallback((finalResults) => {
      setResults(finalResults);
      setPhase('completed');
    });

    // 重心可視化を設定
    dribbler.setBodyTransparency(balanceVisualizationEnabled ? 0.4 : 1.0);
    dribbler.setBalanceSphereVisible(balanceVisualizationEnabled);
    defender.setBodyTransparency(balanceVisualizationEnabled ? 0.4 : 1.0);
    defender.setBalanceSphereVisible(balanceVisualizationEnabled);

    // ドリブルチェックを開始
    dribbleCheckControllerRef.current.start();

    console.log('[DribbleCheckModePanel] ドリブルチェックを開始しました（GameScene使用）');
  }, [
    gameScene,
    dribblerPlayerId,
    defenderPlayerId,
    players,
    dribblerCol,
    dribblerRow,
    defenderCol,
    defenderRow,
    targetCol,
    targetRow,
    trialsPerConfig,
    timeoutSeconds,
    targetGoal,
    balanceVisualizationEnabled,
  ]);

  // フェーズが running に変わったらドリブルチェックを開始
  useEffect(() => {
    if (phase === 'running') {
      startDribbleCheck();
    }

    return () => {
      // クリーンアップ
      if (dribbleCheckControllerRef.current) {
        dribbleCheckControllerRef.current.dispose();
        dribbleCheckControllerRef.current = null;
      }
      if (feintControllerRef.current) {
        feintControllerRef.current = null;
      }
      // GameScene の通常更新ループを再開
      if (gameScene) {
        gameScene.resume();
      }
    };
  }, [phase, startDribbleCheck, gameScene]);

  // 更新ループ（ドリブルチェックコントローラーとゲームシーンの更新）
  useEffect(() => {
    if (phase !== 'running' || !dribbleCheckControllerRef.current || !gameScene) return;

    let animationFrameId: number;
    let lastTime = performance.now();

    const updateLoop = (currentTime: number) => {
      const deltaTime = (currentTime - lastTime) / 1000;
      lastTime = currentTime;

      // ボールの更新
      gameScene.getBall().update(deltaTime);

      // ドリブラーとディフェンダーのみ更新（他のキャラクターは非表示なので更新不要）
      const dribbler = gameScene.getAllyCharacters()[0];
      const defender = gameScene.getEnemyCharacters()[0];
      if (dribbler) dribbler.update(deltaTime);
      if (defender) defender.update(deltaTime);

      // フィールドの更新
      gameScene.getField().update(deltaTime);

      // 衝突システムの更新（キャラクター同士の衝突判定・押し合い）
      gameScene.updateCollisionSystems(deltaTime);

      // ドリブルチェックコントローラーの更新
      if (dribbleCheckControllerRef.current) {
        dribbleCheckControllerRef.current.update(deltaTime);
      }

      animationFrameId = requestAnimationFrame(updateLoop);
    };

    animationFrameId = requestAnimationFrame(updateLoop);

    return () => {
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
      }
    };
  }, [phase, gameScene]);

  // 重心可視化の切り替え
  const handleToggleBalanceVisualization = useCallback(() => {
    const newValue = !balanceVisualizationEnabled;
    setBalanceVisualizationEnabled(newValue);

    if (gameScene && phase === 'running') {
      const alpha = newValue ? 0.4 : 1.0;
      const allChars = gameScene.getAllCharacters();
      for (const char of allChars) {
        char.setBodyTransparency(alpha);
        char.setBalanceSphereVisible(newValue);
      }
    }
  }, [balanceVisualizationEnabled, gameScene, phase]);

  // ドリブルチェック開始
  const handleStart = useCallback(() => {
    if (!dribblerPlayerId || !defenderPlayerId) {
      alert('ドリブラーとディフェンダーを選択してください');
      return;
    }
    if (!gameScene) {
      alert('ゲームシーンが初期化されていません');
      return;
    }
    setResults([]);
    setPhase('running');
  }, [dribblerPlayerId, defenderPlayerId, gameScene]);

  // 中断
  const handleAbort = useCallback(() => {
    if (dribbleCheckControllerRef.current) {
      dribbleCheckControllerRef.current.abort();
    }
    setPhase('completed');
  }, []);

  // 閉じる
  const handleClose = useCallback(() => {
    if (dribbleCheckControllerRef.current) {
      dribbleCheckControllerRef.current.dispose();
      dribbleCheckControllerRef.current = null;
    }
    onClose();
  }, [onClose]);

  // 統計情報を計算
  const statistics = useCallback(() => {
    const successResults = results.filter(r => r.success);
    const successCount = successResults.length;
    const stealCount = results.filter(r => r.reason === 'steal').length;
    const timeoutCount = results.filter(r => r.reason === 'timeout').length;
    const outOfBoundsCount = results.filter(r => r.reason === 'out_of_bounds').length;

    const averageTime = successCount > 0
      ? successResults.reduce((sum, r) => sum + (r.timeToReach ?? 0), 0) / successCount
      : null;

    return {
      totalTrials: results.length,
      successCount,
      successRate: results.length > 0 ? (successCount / results.length) * 100 : 0,
      averageTime,
      stealCount,
      timeoutCount,
      outOfBoundsCount,
    };
  }, [results]);

  if (loading) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90">
        <div className="text-white text-xl">読み込み中...</div>
      </div>
    );
  }

  if (!gameScene) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90">
        <div className="bg-red-900/20 border border-red-500 p-6 rounded-lg">
          <p className="text-red-400 text-xl mb-4">ゲームシーンが初期化されていません</p>
          <button
            onClick={handleClose}
            className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg"
          >
            閉じる
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col pointer-events-none">
      {/* セットアップ画面（オーバーレイ） */}
      {phase === 'setup' && (
        <div className="absolute inset-0 bg-black/80 flex items-center justify-center pointer-events-auto">
          <div className="bg-gray-800 p-8 rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-2xl font-bold text-white">
                ドリブルチェック設定
              </h3>
              <button
                onClick={handleClose}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg font-semibold"
              >
                閉じる
              </button>
            </div>

            <div className="grid grid-cols-2 gap-6">
              {/* 左列: ドリブラー設定 */}
              <div>
                <h4 className="text-lg font-semibold text-blue-400 mb-4">ドリブラー（攻撃側）</h4>

                {/* ドリブラー選手選択 */}
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    選手
                  </label>
                  <select
                    value={dribblerPlayerId}
                    onChange={(e) => setDribblerPlayerId(e.target.value)}
                    className="w-full px-3 py-2 bg-gray-700 text-white rounded-lg border border-gray-600 focus:border-blue-500 focus:outline-none text-sm"
                  >
                    <option value="">選手を選択...</option>
                    {Object.entries(players).map(([id, player]) => (
                      <option key={id} value={id}>
                        {player.basic.NAME} ({player.basic.PositionMain})
                      </option>
                    ))}
                  </select>
                </div>

                {/* ドリブラー配置マス */}
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    配置マス
                  </label>
                  <div className="flex gap-2">
                    <select
                      value={dribblerCol}
                      onChange={(e) => setDribblerCol(e.target.value)}
                      className="flex-1 px-3 py-2 bg-gray-700 text-white rounded-lg border border-gray-600 text-sm"
                    >
                      {COL_LABELS.map((col) => (
                        <option key={col} value={col}>{col}列</option>
                      ))}
                    </select>
                    <select
                      value={dribblerRow}
                      onChange={(e) => setDribblerRow(Number(e.target.value))}
                      className="flex-1 px-3 py-2 bg-gray-700 text-white rounded-lg border border-gray-600 text-sm"
                    >
                      {ROW_LABELS.map((row) => (
                        <option key={row} value={row}>{row}行</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* 目標マス */}
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    目標マス
                  </label>
                  <div className="flex gap-2">
                    <select
                      value={targetCol}
                      onChange={(e) => setTargetCol(e.target.value)}
                      className="flex-1 px-3 py-2 bg-gray-700 text-white rounded-lg border border-gray-600 text-sm"
                    >
                      {COL_LABELS.map((col) => (
                        <option key={col} value={col}>{col}列</option>
                      ))}
                    </select>
                    <select
                      value={targetRow}
                      onChange={(e) => setTargetRow(Number(e.target.value))}
                      className="flex-1 px-3 py-2 bg-gray-700 text-white rounded-lg border border-gray-600 text-sm"
                    >
                      {ROW_LABELS.map((row) => (
                        <option key={row} value={row}>{row}行</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              {/* 右列: ディフェンダー設定 */}
              <div>
                <h4 className="text-lg font-semibold text-red-400 mb-4">ディフェンダー（守備側）</h4>

                {/* ディフェンダー選手選択 */}
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    選手
                  </label>
                  <select
                    value={defenderPlayerId}
                    onChange={(e) => setDefenderPlayerId(e.target.value)}
                    className="w-full px-3 py-2 bg-gray-700 text-white rounded-lg border border-gray-600 focus:border-red-500 focus:outline-none text-sm"
                  >
                    <option value="">選手を選択...</option>
                    {Object.entries(players).map(([id, player]) => (
                      <option key={id} value={id}>
                        {player.basic.NAME} ({player.basic.PositionMain})
                      </option>
                    ))}
                  </select>
                </div>

                {/* ディフェンダー配置マス */}
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    配置マス
                  </label>
                  <div className="flex gap-2">
                    <select
                      value={defenderCol}
                      onChange={(e) => setDefenderCol(e.target.value)}
                      className="flex-1 px-3 py-2 bg-gray-700 text-white rounded-lg border border-gray-600 text-sm"
                    >
                      {COL_LABELS.map((col) => (
                        <option key={col} value={col}>{col}列</option>
                      ))}
                    </select>
                    <select
                      value={defenderRow}
                      onChange={(e) => setDefenderRow(Number(e.target.value))}
                      className="flex-1 px-3 py-2 bg-gray-700 text-white rounded-lg border border-gray-600 text-sm"
                    >
                      {ROW_LABELS.map((row) => (
                        <option key={row} value={row}>{row}行</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            </div>

            {/* ゴール選択 */}
            <div className="mt-6 mb-6">
              <label className="block text-sm font-medium text-gray-300 mb-2">
                攻めるゴール
              </label>
              <div className="flex gap-4">
                <button
                  onClick={() => setTargetGoal('goal1')}
                  className={`flex-1 py-2 rounded-lg font-semibold text-sm transition-all ${
                    targetGoal === 'goal1'
                      ? 'bg-blue-600 text-white ring-2 ring-blue-400'
                      : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
                  }`}
                >
                  ゴール1（+Z側）
                </button>
                <button
                  onClick={() => setTargetGoal('goal2')}
                  className={`flex-1 py-2 rounded-lg font-semibold text-sm transition-all ${
                    targetGoal === 'goal2'
                      ? 'bg-blue-600 text-white ring-2 ring-blue-400'
                      : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
                  }`}
                >
                  ゴール2（-Z側）
                </button>
              </div>
            </div>

            {/* 試行回数・タイムアウト表示 */}
            <div className="grid grid-cols-2 gap-4 mb-6">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  試行回数
                </label>
                <div className="px-3 py-2 bg-gray-700 text-white rounded-lg text-center font-bold">
                  {trialsPerConfig}回
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  タイムアウト
                </label>
                <div className="px-3 py-2 bg-gray-700 text-white rounded-lg text-center font-bold">
                  {timeoutSeconds}秒
                </div>
              </div>
            </div>

            {/* 開始ボタン */}
            <button
              onClick={handleStart}
              disabled={!dribblerPlayerId || !defenderPlayerId}
              className={`w-full py-4 rounded-lg font-bold text-lg transition-colors ${
                dribblerPlayerId && defenderPlayerId
                  ? 'bg-green-600 hover:bg-green-700 text-white'
                  : 'bg-gray-600 text-gray-400 cursor-not-allowed'
              }`}
            >
              ドリブルチェック開始
            </button>
          </div>
        </div>
      )}

      {/* 実行中のUI */}
      {(phase === 'running' || phase === 'completed') && (
        <>
          {/* ヘッダー */}
          <div className="flex items-center justify-between p-4 bg-gray-800/90 backdrop-blur-sm border-b border-gray-700 pointer-events-auto">
            <h2 className="text-xl font-bold text-white">ドリブルチェックモード（実行中）</h2>
            <button
              onClick={handleClose}
              className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg font-semibold"
            >
              閉じる
            </button>
          </div>

          {/* 右側パネル: 試行結果リスト */}
          {results.length > 0 && (
            <div className="absolute top-20 right-4 w-80 max-h-[60vh] bg-gray-800/90 backdrop-blur-sm border border-gray-700 rounded-lg overflow-y-auto pointer-events-auto">
              <div className="p-4">
                <h3 className="text-lg font-bold text-white mb-4">試行結果</h3>
                <div className="space-y-2">
                  {results.map((result, index) => (
                    <div
                      key={index}
                      className={`p-3 rounded-lg ${
                        result.success
                          ? 'bg-green-900/50 border border-green-700'
                          : 'bg-red-900/50 border border-red-700'
                      }`}
                    >
                      <div className="flex justify-between items-center">
                        <span className="text-white font-semibold">
                          #{result.trialNumber}
                        </span>
                        <span className={result.success ? 'text-green-400' : 'text-red-400'}>
                          {result.success ? '成功' : '失敗'}
                        </span>
                      </div>
                      <div className="text-sm text-gray-400 mt-1">
                        {result.success && result.timeToReach !== null
                          ? `${result.timeToReach.toFixed(2)}秒で到達`
                          : getReasonText(result.reason)}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* 結果オーバーレイ（完了後） */}
          {phase === 'completed' && (
            <div className="absolute inset-0 bg-black/70 flex items-center justify-center pointer-events-auto">
              <div className="bg-gray-800 p-8 rounded-xl shadow-xl max-w-md w-full">
                <h3 className="text-2xl font-bold text-white mb-6 text-center">
                  結果
                </h3>

                {(() => {
                  const stats = statistics();
                  return (
                    <div className="space-y-4">
                      <div className="flex justify-between text-lg">
                        <span className="text-gray-400">成功率:</span>
                        <span className="text-green-400 font-bold">
                          {stats.successRate.toFixed(1)}%
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-400">成功（目標到達）:</span>
                        <span className="text-white">{stats.successCount} / {stats.totalTrials}</span>
                      </div>
                      {stats.averageTime !== null && (
                        <div className="flex justify-between">
                          <span className="text-gray-400">平均到達時間:</span>
                          <span className="text-white">{stats.averageTime.toFixed(2)}秒</span>
                        </div>
                      )}
                      <div className="flex justify-between">
                        <span className="text-gray-400">スティール:</span>
                        <span className="text-red-400">{stats.stealCount}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-400">タイムアウト:</span>
                        <span className="text-yellow-400">{stats.timeoutCount}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-400">境界外:</span>
                        <span className="text-orange-400">{stats.outOfBoundsCount}</span>
                      </div>
                    </div>
                  );
                })()}

                <div className="mt-6 flex gap-2">
                  <button
                    onClick={() => {
                      setPhase('setup');
                      setResults([]);
                    }}
                    className="flex-1 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold"
                  >
                    やり直し
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* フッター: 進捗とコントロール */}
          <div className="absolute bottom-0 left-0 right-0 p-4 bg-gray-800/90 backdrop-blur-sm border-t border-gray-700 pointer-events-auto">
            {phase === 'running' && progress && (
              <div className="flex items-center justify-between">
                {/* 進捗バー */}
                <div className="flex-1 mr-4">
                  <div className="flex items-center justify-between text-sm text-gray-300 mb-1">
                    <span>
                      試行: {progress.completedTrials} / {progress.totalTrials}
                    </span>
                    <span>
                      経過時間: {progress.elapsedTime.toFixed(1)}秒
                    </span>
                  </div>
                  <div className="w-full h-3 bg-gray-700 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-blue-500 transition-all duration-200"
                      style={{ width: `${(progress.completedTrials / progress.totalTrials) * 100}%` }}
                    />
                  </div>
                </div>

                {/* 重心可視化トグル */}
                <button
                  onClick={handleToggleBalanceVisualization}
                  className={`px-4 py-2 rounded-lg font-semibold mr-2 ${
                    balanceVisualizationEnabled
                      ? 'bg-purple-600 hover:bg-purple-700 text-white'
                      : 'bg-gray-600 hover:bg-gray-500 text-gray-300'
                  }`}
                >
                  重心表示: {balanceVisualizationEnabled ? 'ON' : 'OFF'}
                </button>

                {/* 中断ボタン */}
                <button
                  onClick={handleAbort}
                  className="px-6 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg font-semibold"
                >
                  中断
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

/**
 * 結果理由のテキストを取得
 */
function getReasonText(reason: string): string {
  switch (reason) {
    case 'reached':
      return '目標に到達';
    case 'timeout':
      return 'タイムアウト';
    case 'steal':
      return 'スティールされた';
    case 'out_of_bounds':
      return '境界外に出た';
    default:
      return reason;
  }
}
