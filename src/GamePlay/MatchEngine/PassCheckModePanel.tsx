'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { GameScene } from '@/GamePlay/MatchEngine/GameScene';
import {
  PassCheckController,
  PassCheckProgress,
  PassCheckResult,
  PassCheckConfig,
  DefenderPlacement,
} from '@/GamePlay/MatchEngine/CheckControllers/PassCheckController';
import { PlayerDataLoader } from '@/GamePlay/Management/Services/PlayerDataLoader';
import { PlayerData } from '@/GamePlay/GameSystem/CharacterMove/Types/PlayerData';
import { PassType } from '@/GamePlay/GameSystem/CharacterMove/Config/PassTrajectoryConfig';
import { FieldGridUtils } from '@/GamePlay/GameSystem/CharacterMove/Config/FieldGridConfig';

interface PassCheckModePanelProps {
  gameScene: GameScene | null;
  onClose: () => void;
}

type SetupPhase = 'setup' | 'running' | 'completed';

// 列ラベル（A-O）
const COL_LABELS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O'];
// 行ラベル（1-30）
const ROW_LABELS = Array.from({ length: 30 }, (_, i) => i + 1);

// パスタイプのラベル
const PASS_TYPE_LABELS: Record<PassType, string> = {
  [PassType.CHEST]: 'チェストパス',
  [PassType.BOUNCE]: 'バウンスパス',
  [PassType.LOB]: 'ロブパス',
  [PassType.LONG]: 'ロングパス',
  [PassType.ONE_HAND]: 'ワンハンドパス',
};

/**
 * パスチェックモードパネル
 * GameScene を使用して実際のゲームロジックでパスをテスト
 */
export function PassCheckModePanel({ gameScene, onClose }: PassCheckModePanelProps) {
  const passCheckControllerRef = useRef<PassCheckController | null>(null);

  // セットアップ状態
  const [phase, setPhase] = useState<SetupPhase>('setup');
  const [loading, setLoading] = useState(true);

  // 選手データ
  const [players, setPlayers] = useState<Record<string, PlayerData>>({});
  const [passerPlayerId, setPasserPlayerId] = useState<string>('');
  const [receiverPlayerId, setReceiverPlayerId] = useState<string>('');
  const [defenderPlayerIds, setDefenderPlayerIds] = useState<string[]>([]);

  // 設定
  const [targetGoal, setTargetGoal] = useState<'goal1' | 'goal2'>('goal1');
  const [trialsPerConfig] = useState<number>(10);
  const [timeoutSeconds] = useState<number>(10);
  const [passType, setPassType] = useState<PassType | null>(null);

  // マス選択
  const [passerCol, setPasserCol] = useState<string>('H');
  const [passerRow, setPasserRow] = useState<number>(15);
  const [receiverCol, setReceiverCol] = useState<string>('H');
  const [receiverRow, setReceiverRow] = useState<number>(22);

  // ディフェンダー設定
  const [defenders, setDefenders] = useState<DefenderPlacement[]>([]);
  const [showDefenderSetup, setShowDefenderSetup] = useState<boolean>(false);

  // 進捗
  const [progress, setProgress] = useState<PassCheckProgress | null>(null);

  // 結果
  const [results, setResults] = useState<PassCheckResult[]>([]);

  // 距離表示
  const [distance, setDistance] = useState<number | null>(null);

  // 選手データを読み込む
  useEffect(() => {
    const loadPlayers = async () => {
      try {
        const playerData = await PlayerDataLoader.loadPlayerData();
        setPlayers(playerData);

        // 最初の選手を選択
        const playerIds = Object.keys(playerData);
        if (playerIds.length > 0) {
          setPasserPlayerId(playerIds[0]);
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

  // パスチェックを開始
  const startPassCheck = useCallback(() => {
    if (!gameScene || !passerPlayerId || !receiverPlayerId) return;

    // GameScene の通常更新ループを一時停止
    gameScene.pause();

    // セル座標をワールド座標に変換
    const passerWorldPos = FieldGridUtils.cellToWorld(passerCol, passerRow);
    const receiverWorldPos = FieldGridUtils.cellToWorld(receiverCol, receiverRow);

    if (!passerWorldPos || !receiverWorldPos) {
      console.error('[PassCheckModePanel] 座標変換に失敗しました');
      gameScene.resume();
      return;
    }

    // ディフェンダーの配置情報を作成（選手IDベース）
    const defenderPlacements = defenders.map((def, index) => {
      const defWorldPos = FieldGridUtils.cellToWorld(def.cell.col, def.cell.row);
      return {
        defenderPlayerId: defenderPlayerIds[index] || '',
        position: defWorldPos ? { x: defWorldPos.x, z: defWorldPos.z } : { x: 0, z: 0 },
        type: def.type,
      };
    }).filter(p => p.defenderPlayerId && (p.position.x !== 0 || p.position.z !== 0));

    // GameScene でパスチェックモードをセットアップ（選手IDと選手データを渡す）
    const setupResult = gameScene.setupPassCheckMode(
      passerPlayerId,
      receiverPlayerId,
      { x: passerWorldPos.x, z: passerWorldPos.z },
      { x: receiverWorldPos.x, z: receiverWorldPos.z },
      defenderPlacements.length > 0 ? defenderPlacements : undefined,
      players
    );

    if (!setupResult) {
      console.error('[PassCheckModePanel] パスチェックモードのセットアップに失敗しました');
      gameScene.resume();
      return;
    }

    const { passer, receiver, defenders: defenderChars } = setupResult;

    // パスチェックコントローラーを作成
    const config: PassCheckConfig = {
      passerCell: { col: passerCol, row: passerRow },
      receiverCell: { col: receiverCol, row: receiverRow },
      defenders: defenders.length > 0 ? defenders : undefined,
      trialsPerConfig,
      timeoutSeconds,
      targetGoal,
      passType: passType ?? undefined,
    };

    const controller = gameScene.createPassCheckController(passer, receiver, config);
    passCheckControllerRef.current = controller;

    // ディフェンダーを設定
    if (defenderChars.length > 0) {
      controller.setDefenders(defenderChars);
    }

    // コールバック設定
    controller.setOnProgressCallback((p) => {
      setProgress(p);
    });

    controller.setOnTrialCompleteCallback((result) => {
      setResults((prev) => [...prev, result]);
    });

    controller.setOnCompleteCallback((finalResults) => {
      setResults(finalResults);
      setPhase('completed');
    });

    // パスチェックを開始
    controller.start();

    console.log('[PassCheckModePanel] パスチェックを開始しました');
  }, [
    gameScene,
    passerPlayerId,
    receiverPlayerId,
    defenderPlayerIds,
    players,
    passerCol,
    passerRow,
    receiverCol,
    receiverRow,
    defenders,
    trialsPerConfig,
    timeoutSeconds,
    targetGoal,
    passType,
  ]);

  // フェーズが running に変わったらパスチェックを開始
  useEffect(() => {
    if (phase === 'running') {
      startPassCheck();
    }

    return () => {
      // クリーンアップ
      if (passCheckControllerRef.current) {
        passCheckControllerRef.current.dispose();
        passCheckControllerRef.current = null;
      }
      // GameScene の通常更新ループを再開
      if (gameScene) {
        gameScene.resume();
      }
    };
  }, [phase, startPassCheck, gameScene]);

  // 更新ループ
  useEffect(() => {
    if (phase !== 'running' || !passCheckControllerRef.current || !gameScene) return;

    let animationFrameId: number;
    let lastTime = performance.now();

    const updateLoop = (currentTime: number) => {
      const deltaTime = (currentTime - lastTime) / 1000;
      lastTime = currentTime;

      // ボールの更新
      gameScene.getBall().update(deltaTime);

      // 全キャラクターを更新（パサー、レシーバー、ディフェンダーのみ存在）
      const allChars = gameScene.getAllCharacters();
      for (const char of allChars) {
        char.update(deltaTime);
      }

      // フィールドの更新
      gameScene.getField().update(deltaTime);

      // 衝突システムの更新（ボールのキャッチ判定に必要）
      gameScene.updateCollisionSystems(deltaTime);

      // パス軌道可視化の更新
      gameScene.updatePassCheckVisualization();

      // 距離を更新
      const dist = gameScene.getPassCheckDistance();
      if (dist !== null) {
        setDistance(dist);
      }

      // パスチェックコントローラーの更新
      if (passCheckControllerRef.current) {
        passCheckControllerRef.current.update(deltaTime);
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

  // パスチェック開始
  const handleStart = useCallback(() => {
    if (!passerPlayerId || !receiverPlayerId) {
      alert('パサーとレシーバーを選択してください');
      return;
    }
    if (!gameScene) {
      alert('ゲームシーンが初期化されていません');
      return;
    }
    setResults([]);
    setPhase('running');
  }, [passerPlayerId, receiverPlayerId, gameScene]);

  // 中断
  const handleAbort = useCallback(() => {
    if (passCheckControllerRef.current) {
      passCheckControllerRef.current.abort();
    }
    setPhase('completed');
  }, []);

  // 閉じる
  const handleClose = useCallback(() => {
    if (passCheckControllerRef.current) {
      passCheckControllerRef.current.dispose();
      passCheckControllerRef.current = null;
    }
    onClose();
  }, [onClose]);

  // ディフェンダーを追加
  const handleAddDefender = useCallback(() => {
    if (defenders.length >= 3) return; // 最大3人
    setDefenders([
      ...defenders,
      {
        cell: { col: 'H', row: 18 },
        type: 'off_ball',
      },
    ]);
    // ディフェンダー選手も追加
    const playerIds = Object.keys(players);
    const unusedPlayerId = playerIds.find(
      id => id !== passerPlayerId && id !== receiverPlayerId && !defenderPlayerIds.includes(id)
    );
    if (unusedPlayerId) {
      setDefenderPlayerIds([...defenderPlayerIds, unusedPlayerId]);
    }
  }, [defenders, players, passerPlayerId, receiverPlayerId, defenderPlayerIds]);

  // ディフェンダーを削除
  const handleRemoveDefender = useCallback((index: number) => {
    setDefenders(defenders.filter((_, i) => i !== index));
    setDefenderPlayerIds(defenderPlayerIds.filter((_, i) => i !== index));
  }, [defenders, defenderPlayerIds]);

  // ディフェンダー設定を更新
  const handleUpdateDefender = useCallback((
    index: number,
    field: 'col' | 'row' | 'type' | 'playerId',
    value: string | number
  ) => {
    if (field === 'playerId') {
      const newIds = [...defenderPlayerIds];
      newIds[index] = value as string;
      setDefenderPlayerIds(newIds);
    } else {
      const newDefenders = [...defenders];
      if (field === 'col') {
        newDefenders[index] = { ...newDefenders[index], cell: { ...newDefenders[index].cell, col: value as string } };
      } else if (field === 'row') {
        newDefenders[index] = { ...newDefenders[index], cell: { ...newDefenders[index].cell, row: value as number } };
      } else if (field === 'type') {
        newDefenders[index] = { ...newDefenders[index], type: value as 'on_ball' | 'off_ball' };
      }
      setDefenders(newDefenders);
    }
  }, [defenders, defenderPlayerIds]);

  // 統計情報を計算
  const statistics = useCallback(() => {
    const successResults = results.filter(r => r.success);
    const successCount = successResults.length;
    const interceptedCount = results.filter(r => r.reason === 'intercepted').length;
    const missedCount = results.filter(r => r.reason === 'missed').length;
    const timeoutCount = results.filter(r => r.reason === 'timeout').length;
    const outOfBoundsCount = results.filter(r => r.reason === 'out_of_bounds').length;

    const flightTimes = successResults
      .filter(r => r.flightTime !== null)
      .map(r => r.flightTime as number);

    const averageFlightTime = flightTimes.length > 0
      ? flightTimes.reduce((sum, t) => sum + t, 0) / flightTimes.length
      : null;

    return {
      totalTrials: results.length,
      successCount,
      successRate: results.length > 0 ? (successCount / results.length) * 100 : 0,
      averageFlightTime,
      interceptedCount,
      missedCount,
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
          <div className="bg-gray-800 p-8 rounded-xl shadow-xl max-w-3xl w-full max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-2xl font-bold text-white">
                パスチェック設定
              </h3>
              <button
                onClick={handleClose}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg font-semibold"
              >
                閉じる
              </button>
            </div>

            <div className="grid grid-cols-2 gap-6">
              {/* 左列: パサー設定 */}
              <div>
                <h4 className="text-lg font-semibold text-blue-400 mb-4">パサー（オンボール）</h4>

                {/* パサー選手選択 */}
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    選手
                  </label>
                  <select
                    value={passerPlayerId}
                    onChange={(e) => setPasserPlayerId(e.target.value)}
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

                {/* パサー配置マス */}
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    配置マス
                  </label>
                  <div className="flex gap-2">
                    <select
                      value={passerCol}
                      onChange={(e) => setPasserCol(e.target.value)}
                      className="flex-1 px-3 py-2 bg-gray-700 text-white rounded-lg border border-gray-600 text-sm"
                    >
                      {COL_LABELS.map((col) => (
                        <option key={col} value={col}>{col}列</option>
                      ))}
                    </select>
                    <select
                      value={passerRow}
                      onChange={(e) => setPasserRow(Number(e.target.value))}
                      className="flex-1 px-3 py-2 bg-gray-700 text-white rounded-lg border border-gray-600 text-sm"
                    >
                      {ROW_LABELS.map((row) => (
                        <option key={row} value={row}>{row}行</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              {/* 右列: レシーバー設定 */}
              <div>
                <h4 className="text-lg font-semibold text-green-400 mb-4">レシーバー（オフボール）</h4>

                {/* レシーバー選手選択 */}
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    選手
                  </label>
                  <select
                    value={receiverPlayerId}
                    onChange={(e) => setReceiverPlayerId(e.target.value)}
                    className="w-full px-3 py-2 bg-gray-700 text-white rounded-lg border border-gray-600 focus:border-green-500 focus:outline-none text-sm"
                  >
                    <option value="">選手を選択...</option>
                    {Object.entries(players).map(([id, player]) => (
                      <option key={id} value={id}>
                        {player.basic.NAME} ({player.basic.PositionMain})
                      </option>
                    ))}
                  </select>
                </div>

                {/* レシーバー配置マス */}
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    配置マス
                  </label>
                  <div className="flex gap-2">
                    <select
                      value={receiverCol}
                      onChange={(e) => setReceiverCol(e.target.value)}
                      className="flex-1 px-3 py-2 bg-gray-700 text-white rounded-lg border border-gray-600 text-sm"
                    >
                      {COL_LABELS.map((col) => (
                        <option key={col} value={col}>{col}列</option>
                      ))}
                    </select>
                    <select
                      value={receiverRow}
                      onChange={(e) => setReceiverRow(Number(e.target.value))}
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

            {/* パスタイプ選択 */}
            <div className="mt-6 mb-4">
              <label className="block text-sm font-medium text-gray-300 mb-2">
                パスタイプ（指定しない場合はAIが選択）
              </label>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => setPassType(null)}
                  className={`px-3 py-2 rounded-lg font-semibold text-sm transition-all ${
                    passType === null
                      ? 'bg-blue-600 text-white ring-2 ring-blue-400'
                      : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
                  }`}
                >
                  自動
                </button>
                {Object.entries(PASS_TYPE_LABELS).map(([type, label]) => (
                  <button
                    key={type}
                    onClick={() => setPassType(type as PassType)}
                    className={`px-3 py-2 rounded-lg font-semibold text-sm transition-all ${
                      passType === type
                        ? 'bg-blue-600 text-white ring-2 ring-blue-400'
                        : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* ゴール選択 */}
            <div className="mt-4 mb-4">
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

            {/* ディフェンダー設定 */}
            <div className="mt-6 mb-4">
              <div className="flex items-center justify-between mb-4">
                <h4 className="text-lg font-semibold text-red-400">ディフェンダー設定（任意）</h4>
                <button
                  onClick={() => setShowDefenderSetup(!showDefenderSetup)}
                  className="px-3 py-1 bg-gray-700 hover:bg-gray-600 text-white rounded-lg text-sm"
                >
                  {showDefenderSetup ? '折りたたむ' : '展開'}
                </button>
              </div>

              {showDefenderSetup && (
                <div className="space-y-4">
                  {defenders.map((defender, index) => (
                    <div key={index} className="p-4 bg-gray-700 rounded-lg">
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-white font-semibold">ディフェンダー {index + 1}</span>
                        <button
                          onClick={() => handleRemoveDefender(index)}
                          className="px-2 py-1 bg-red-600 hover:bg-red-700 text-white rounded text-xs"
                        >
                          削除
                        </button>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        {/* 選手選択 */}
                        <div>
                          <label className="block text-xs text-gray-400 mb-1">選手</label>
                          <select
                            value={defenderPlayerIds[index] || ''}
                            onChange={(e) => handleUpdateDefender(index, 'playerId', e.target.value)}
                            className="w-full px-2 py-1 bg-gray-600 text-white rounded border border-gray-500 text-sm"
                          >
                            <option value="">選択...</option>
                            {Object.entries(players).map(([id, player]) => (
                              <option key={id} value={id}>
                                {player.basic.NAME}
                              </option>
                            ))}
                          </select>
                        </div>

                        {/* タイプ選択 */}
                        <div>
                          <label className="block text-xs text-gray-400 mb-1">タイプ</label>
                          <select
                            value={defender.type}
                            onChange={(e) => handleUpdateDefender(index, 'type', e.target.value)}
                            className="w-full px-2 py-1 bg-gray-600 text-white rounded border border-gray-500 text-sm"
                          >
                            <option value="on_ball">オンボール（パサーをマーク）</option>
                            <option value="off_ball">オフボール（パスレーンをカバー）</option>
                          </select>
                        </div>

                        {/* 配置マス */}
                        <div className="col-span-2">
                          <label className="block text-xs text-gray-400 mb-1">配置マス</label>
                          <div className="flex gap-2">
                            <select
                              value={defender.cell.col}
                              onChange={(e) => handleUpdateDefender(index, 'col', e.target.value)}
                              className="flex-1 px-2 py-1 bg-gray-600 text-white rounded border border-gray-500 text-sm"
                            >
                              {COL_LABELS.map((col) => (
                                <option key={col} value={col}>{col}列</option>
                              ))}
                            </select>
                            <select
                              value={defender.cell.row}
                              onChange={(e) => handleUpdateDefender(index, 'row', Number(e.target.value))}
                              className="flex-1 px-2 py-1 bg-gray-600 text-white rounded border border-gray-500 text-sm"
                            >
                              {ROW_LABELS.map((row) => (
                                <option key={row} value={row}>{row}行</option>
                              ))}
                            </select>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}

                  {defenders.length < 3 && (
                    <button
                      onClick={handleAddDefender}
                      className="w-full py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg text-sm border border-dashed border-gray-500"
                    >
                      + ディフェンダーを追加
                    </button>
                  )}
                </div>
              )}
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
              disabled={!passerPlayerId || !receiverPlayerId}
              className={`w-full py-4 rounded-lg font-bold text-lg transition-colors ${
                passerPlayerId && receiverPlayerId
                  ? 'bg-green-600 hover:bg-green-700 text-white'
                  : 'bg-gray-600 text-gray-400 cursor-not-allowed'
              }`}
            >
              パスチェック開始
            </button>
          </div>
        </div>
      )}

      {/* 実行中のUI */}
      {(phase === 'running' || phase === 'completed') && (
        <>
          {/* ヘッダー */}
          <div className="flex items-center justify-between p-4 bg-gray-800/90 backdrop-blur-sm border-b border-gray-700 pointer-events-auto">
            <div className="flex items-center gap-4">
              <h2 className="text-xl font-bold text-white">パスチェックモード（実行中）</h2>
              {distance !== null && (
                <span className="px-3 py-1 bg-yellow-600/80 rounded-lg text-white font-semibold">
                  距離: {distance.toFixed(2)}m
                </span>
              )}
            </div>
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
                        {result.success && result.flightTime !== null
                          ? `${result.flightTime.toFixed(2)}秒で到達`
                          : getReasonText(result.reason)}
                        {result.interceptedBy && ` (${result.interceptedBy})`}
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
                        <span className="text-gray-400">成功（キャッチ）:</span>
                        <span className="text-white">{stats.successCount} / {stats.totalTrials}</span>
                      </div>
                      {stats.averageFlightTime !== null && (
                        <div className="flex justify-between">
                          <span className="text-gray-400">平均飛行時間:</span>
                          <span className="text-white">{stats.averageFlightTime.toFixed(2)}秒</span>
                        </div>
                      )}
                      <div className="flex justify-between">
                        <span className="text-gray-400">インターセプト:</span>
                        <span className="text-red-400">{stats.interceptedCount}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-400">ミス:</span>
                        <span className="text-orange-400">{stats.missedCount}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-400">タイムアウト:</span>
                        <span className="text-yellow-400">{stats.timeoutCount}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-400">境界外:</span>
                        <span className="text-gray-400">{stats.outOfBoundsCount}</span>
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
                    <span>
                      {progress.waitingForPass ? 'パス待機中...' : 'パス飛行中'}
                    </span>
                  </div>
                  <div className="w-full h-3 bg-gray-700 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-green-500 transition-all duration-200"
                      style={{ width: `${(progress.completedTrials / progress.totalTrials) * 100}%` }}
                    />
                  </div>
                </div>

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
    case 'caught':
      return 'キャッチ成功';
    case 'intercepted':
      return 'インターセプト';
    case 'timeout':
      return 'タイムアウト';
    case 'out_of_bounds':
      return '境界外';
    case 'missed':
      return 'キャッチミス';
    default:
      return reason;
  }
}
