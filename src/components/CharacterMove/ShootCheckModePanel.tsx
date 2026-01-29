'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { ShootCheckScene } from '@/character-move/scenes/ShootCheckScene';
import { ShootCheckProgress, CellShootResult, ShootCheckConfig, ShotTypeFilter } from '@/character-move/controllers/check/ShootCheckController';
import { PlayerDataLoader } from '@/character-move/utils/PlayerDataLoader';
import { PlayerData } from '@/character-move/types/PlayerData';
import { ShootCheckHeatmap } from './ShootCheckHeatmap';
import { ShootCheckResultsTable } from './ShootCheckResultsTable';

interface ShootCheckModePanelProps {
  onClose: () => void;
}

type SetupPhase = 'setup' | 'running' | 'completed';
type CheckMode = 'all' | 'single';

// 列ラベル（A-O）
const COL_LABELS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O'];
// 行ラベル（1-30）
const ROW_LABELS = Array.from({ length: 30 }, (_, i) => i + 1);

/**
 * シュートチェックモードパネル
 */
export function ShootCheckModePanel({ onClose }: ShootCheckModePanelProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<ShootCheckScene | null>(null);

  // セットアップ状態
  const [phase, setPhase] = useState<SetupPhase>('setup');
  const [loading, setLoading] = useState(true);

  // 選手データ
  const [players, setPlayers] = useState<Record<string, PlayerData>>({});
  const [selectedPlayerId, setSelectedPlayerId] = useState<string>('');

  // 設定
  const [targetGoal, setTargetGoal] = useState<'goal1' | 'goal2'>('goal1');
  const [shotsPerCell] = useState<number>(100);
  const [shotTypeFilter, setShotTypeFilter] = useState<ShotTypeFilter>('all');

  // チェックモード（全マス or 単一セル）
  const [checkMode, setCheckMode] = useState<CheckMode>('all');
  const [selectedCol, setSelectedCol] = useState<string>('H');
  const [selectedRow, setSelectedRow] = useState<number>(25);

  // 進捗
  const [progress, setProgress] = useState<ShootCheckProgress | null>(null);

  // 結果
  const [results, setResults] = useState<CellShootResult[]>([]);
  const [hoveredCell, setHoveredCell] = useState<string | null>(null);

  // 表示モード
  const [showTable, setShowTable] = useState(false);

  // 選手データを読み込む
  useEffect(() => {
    const loadPlayers = async () => {
      try {
        const playerData = await PlayerDataLoader.loadPlayerData();
        setPlayers(playerData);

        // 最初の選手を選択
        const playerIds = Object.keys(playerData);
        if (playerIds.length > 0) {
          setSelectedPlayerId(playerIds[0]);
        }
      } catch (error) {
        console.error('Failed to load player data:', error);
      } finally {
        setLoading(false);
      }
    };

    loadPlayers();
  }, []);

  // シーンの初期化
  useEffect(() => {
    if (!canvasRef.current || phase !== 'running') return;

    let mounted = true;

    const initScene = async () => {
      try {
        const scene = new ShootCheckScene(canvasRef.current!);
        sceneRef.current = scene;

        // 物理エンジンの初期化を待つ
        await new Promise(resolve => setTimeout(resolve, 500));

        if (!mounted) return;

        // 選手データを設定
        if (selectedPlayerId && players[selectedPlayerId]) {
          scene.setPlayerData(players[selectedPlayerId]);
        }

        // シュートチェック設定
        const config: ShootCheckConfig = {
          shotsPerCell,
          targetGoal,
          shotTypeFilter,
        };

        // モードに応じてシュートチェックを開始
        if (checkMode === 'single') {
          scene.startSingleCellCheck(config, selectedCol, selectedRow);
        } else {
          scene.startShootCheck(config);
        }

        // コールバック設定（startShootCheck後に取得）
        const controller = scene.getShootCheckController();
        if (controller) {
          controller.setOnProgressCallback((p) => {
            if (mounted) setProgress(p);
          });

          controller.setOnCellCompleteCallback((result) => {
            if (mounted) setResults((prev) => [...prev, result]);
          });

          controller.setOnCompleteCallback((finalResults) => {
            if (mounted) {
              setResults(finalResults);
              setPhase('completed');
            }
          });
        }
      } catch (error) {
        console.error('Failed to initialize shoot check scene:', error);
      }
    };

    initScene();

    return () => {
      mounted = false;
      if (sceneRef.current) {
        sceneRef.current.dispose();
        sceneRef.current = null;
      }
    };
  }, [phase, selectedPlayerId, players, shotsPerCell, targetGoal, checkMode, selectedCol, selectedRow, shotTypeFilter]);

  // シュートチェック開始
  const handleStart = useCallback(() => {
    if (!selectedPlayerId) {
      alert('選手を選択してください');
      return;
    }
    setResults([]);
    setPhase('running');
  }, [selectedPlayerId]);

  // 中断
  const handleAbort = useCallback(() => {
    if (sceneRef.current) {
      sceneRef.current.abortShootCheck();
    }
    setPhase('completed');
  }, []);

  // 閉じる
  const handleClose = useCallback(() => {
    if (sceneRef.current) {
      sceneRef.current.dispose();
      sceneRef.current = null;
    }
    onClose();
  }, [onClose]);

  // セルのホバー
  const handleCellHover = useCallback((cellName: string | null) => {
    setHoveredCell(cellName);
  }, []);

  // ホバー中のセルの結果を取得
  const hoveredResult = hoveredCell
    ? results.find((r) => r.cellName === hoveredCell)
    : null;

  if (loading) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90">
        <div className="text-white text-xl">読み込み中...</div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-gray-900">
      {/* ヘッダー */}
      <div className="flex items-center justify-between p-4 bg-gray-800 border-b border-gray-700">
        <h2 className="text-xl font-bold text-white">シュートチェックモード</h2>
        <button
          onClick={handleClose}
          className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg font-semibold"
        >
          閉じる
        </button>
      </div>

      {/* メインコンテンツ */}
      <div className="flex-1 flex overflow-hidden">
        {/* 左側: 3Dビューまたはヒートマップ */}
        <div className="flex-1 relative">
          {phase === 'setup' ? (
            // セットアップ画面
            <div className="flex items-center justify-center h-full">
              <div className="bg-gray-800 p-8 rounded-xl shadow-xl max-w-md w-full">
                <h3 className="text-2xl font-bold text-white mb-6 text-center">
                  シュートチェック設定
                </h3>

                {/* 選手選択 */}
                <div className="mb-6">
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    選手
                  </label>
                  <select
                    value={selectedPlayerId}
                    onChange={(e) => setSelectedPlayerId(e.target.value)}
                    className="w-full px-4 py-3 bg-gray-700 text-white rounded-lg border border-gray-600 focus:border-blue-500 focus:outline-none"
                  >
                    <option value="">選手を選択...</option>
                    {Object.entries(players).map(([id, player]) => (
                      <option key={id} value={id}>
                        {player.basic.NAME} ({player.basic.PositionMain}) - 3P:{player.stats['3paccuracy']}
                      </option>
                    ))}
                  </select>
                </div>

                {/* ゴール選択 */}
                <div className="mb-6">
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    攻めるゴール
                  </label>
                  <div className="flex gap-4">
                    <button
                      onClick={() => setTargetGoal('goal1')}
                      className={`flex-1 py-3 rounded-lg font-semibold transition-all ${
                        targetGoal === 'goal1'
                          ? 'bg-blue-600 text-white ring-2 ring-blue-400 ring-offset-2 ring-offset-gray-800'
                          : 'bg-gray-800 text-gray-500 hover:bg-gray-700 hover:text-gray-300'
                      }`}
                    >
                      {targetGoal === 'goal1' && '● '}ゴール1（+Z側）
                    </button>
                    <button
                      onClick={() => setTargetGoal('goal2')}
                      className={`flex-1 py-3 rounded-lg font-semibold transition-all ${
                        targetGoal === 'goal2'
                          ? 'bg-blue-600 text-white ring-2 ring-blue-400 ring-offset-2 ring-offset-gray-800'
                          : 'bg-gray-800 text-gray-500 hover:bg-gray-700 hover:text-gray-300'
                      }`}
                    >
                      {targetGoal === 'goal2' && '● '}ゴール2（-Z側）
                    </button>
                  </div>
                </div>

                {/* チェックモード選択 */}
                <div className="mb-6">
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    チェックモード
                  </label>
                  <div className="flex gap-4">
                    <button
                      onClick={() => setCheckMode('all')}
                      className={`flex-1 py-3 rounded-lg font-semibold transition-all ${
                        checkMode === 'all'
                          ? 'bg-purple-600 text-white ring-2 ring-purple-400 ring-offset-2 ring-offset-gray-800'
                          : 'bg-gray-800 text-gray-500 hover:bg-gray-700 hover:text-gray-300'
                      }`}
                    >
                      {checkMode === 'all' && '● '}全マス
                    </button>
                    <button
                      onClick={() => setCheckMode('single')}
                      className={`flex-1 py-3 rounded-lg font-semibold transition-all ${
                        checkMode === 'single'
                          ? 'bg-purple-600 text-white ring-2 ring-purple-400 ring-offset-2 ring-offset-gray-800'
                          : 'bg-gray-800 text-gray-500 hover:bg-gray-700 hover:text-gray-300'
                      }`}
                    >
                      {checkMode === 'single' && '● '}指定マス
                    </button>
                  </div>
                </div>

                {/* 単一セル選択（指定マスモード時のみ表示） */}
                {checkMode === 'single' && (
                  <div className="mb-6">
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      マス選択
                    </label>
                    <div className="flex gap-4">
                      <select
                        value={selectedCol}
                        onChange={(e) => setSelectedCol(e.target.value)}
                        className="flex-1 px-4 py-3 bg-gray-700 text-white rounded-lg border border-gray-600 focus:border-purple-500 focus:outline-none"
                      >
                        {COL_LABELS.map((col) => (
                          <option key={col} value={col}>
                            {col}列
                          </option>
                        ))}
                      </select>
                      <select
                        value={selectedRow}
                        onChange={(e) => setSelectedRow(Number(e.target.value))}
                        className="flex-1 px-4 py-3 bg-gray-700 text-white rounded-lg border border-gray-600 focus:border-purple-500 focus:outline-none"
                      >
                        {ROW_LABELS.map((row) => (
                          <option key={row} value={row}>
                            {row}行
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="mt-2 text-center text-sm text-gray-400">
                      選択中: {selectedCol}{selectedRow}
                    </div>
                  </div>
                )}

                {/* シュートタイプフィルター（全マスモード時のみ表示） */}
                {checkMode === 'all' && (
                  <div className="mb-6">
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      シュートタイプ
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      {([
                        { value: 'all', label: '全シュート' },
                        { value: '3pt', label: '3Pのみ' },
                        { value: 'midrange', label: 'ミドルのみ' },
                        { value: 'layup', label: 'レイアップのみ' },
                      ] as const).map(({ value, label }) => (
                        <button
                          key={value}
                          onClick={() => setShotTypeFilter(value)}
                          className={`py-2 rounded-lg font-semibold text-sm transition-all ${
                            shotTypeFilter === value
                              ? 'bg-cyan-500 text-white ring-2 ring-cyan-400 ring-offset-2 ring-offset-gray-800'
                              : 'bg-gray-700 text-gray-400 hover:bg-gray-600 hover:text-gray-200'
                          }`}
                        >
                          {shotTypeFilter === value && '● '}{label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* シュート数表示 */}
                <div className="mb-8">
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    {checkMode === 'single' ? '指定マスでのシュート数' : '1升目あたりのシュート数'}
                  </label>
                  <div className="px-4 py-3 bg-gray-700 text-white rounded-lg text-center text-lg font-bold">
                    {shotsPerCell}本
                  </div>
                </div>

                {/* 開始ボタン */}
                <button
                  onClick={handleStart}
                  disabled={!selectedPlayerId}
                  className={`w-full py-4 rounded-lg font-bold text-lg transition-colors ${
                    selectedPlayerId
                      ? 'bg-green-600 hover:bg-green-700 text-white'
                      : 'bg-gray-600 text-gray-400 cursor-not-allowed'
                  }`}
                >
                  {checkMode === 'single'
                    ? `${selectedCol}${selectedRow}で${shotsPerCell}本シュート`
                    : 'シュートチェック開始（全マス）'}
                </button>
              </div>
            </div>
          ) : (
            // 実行中または完了後
            <>
              {/* 3Dキャンバス（実行中のみ表示） */}
              {phase === 'running' && (
                <canvas
                  ref={canvasRef}
                  className="w-full h-full outline-none"
                  style={{ touchAction: 'none' }}
                />
              )}

              {/* ヒートマップ */}
              {(phase === 'completed' || results.length > 0) && (
                <div className={phase === 'running' ? 'absolute bottom-4 left-4 w-64' : 'w-full h-full'}>
                  <ShootCheckHeatmap
                    results={results}
                    targetGoal={targetGoal}
                    onCellHover={handleCellHover}
                    fullSize={phase === 'completed'}
                  />
                </div>
              )}

              {/* ホバー情報 */}
              {hoveredResult && (
                <div className="absolute top-4 left-4 bg-black/80 p-4 rounded-lg text-white">
                  <div className="text-lg font-bold mb-2">{hoveredResult.cellName}</div>
                  <div className="text-sm space-y-1">
                    <div>種類: {getShootTypeName(hoveredResult.shootType)}</div>
                    <div>成功: {hoveredResult.successCount}本</div>
                    <div>失敗: {hoveredResult.failureCount}本</div>
                    <div>成功率: {hoveredResult.successRate.toFixed(1)}%</div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* 右側: 結果テーブル（完了後のみ） */}
        {showTable && phase === 'completed' && (
          <div className="w-96 bg-gray-800 border-l border-gray-700 overflow-y-auto">
            <ShootCheckResultsTable results={results} />
          </div>
        )}
      </div>

      {/* フッター: 進捗とコントロール */}
      <div className="p-4 bg-gray-800 border-t border-gray-700">
        {phase === 'running' && progress && (
          <div className="flex items-center justify-between">
            {/* 進捗バー */}
            <div className="flex-1 mr-4">
              <div className="flex items-center justify-between text-sm text-gray-300 mb-1">
                <span>
                  進捗: {progress.completedCells} / {progress.totalCells} マス
                  {progress.shotTypeFilter !== 'all' && (
                    <span className="ml-2 px-2 py-0.5 bg-cyan-500/20 text-cyan-400 rounded text-xs">
                      {getShotTypeFilterLabel(progress.shotTypeFilter)}
                    </span>
                  )}
                </span>
                <span>現在: {progress.currentCell} ({progress.currentCellShots}/{progress.shotsPerCell}本)</span>
              </div>
              <div className="w-full h-3 bg-gray-700 rounded-full overflow-hidden">
                <div
                  className="h-full bg-blue-500 transition-all duration-200"
                  style={{ width: `${(progress.completedCells / progress.totalCells) * 100}%` }}
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

        {phase === 'completed' && (
          <div className="flex items-center justify-between">
            <div className="text-white">
              <span className="font-bold">完了!</span>
              <span className="ml-4">
                テスト済み: {results.filter(r => r.totalShots > 0).length}マス /
                レンジ外: {results.filter(r => r.shootType === 'out_of_range').length}マス
              </span>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setShowTable(!showTable)}
                className={`px-4 py-2 rounded-lg font-semibold ${
                  showTable
                    ? 'bg-yellow-500 hover:bg-yellow-600 text-black'
                    : 'bg-gray-600 hover:bg-gray-700 text-white'
                }`}
              >
                {showTable ? '表を非表示' : '表を表示'}
              </button>
              <button
                onClick={() => {
                  setPhase('setup');
                  setResults([]);
                }}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold"
              >
                やり直し
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * シュートタイプの日本語名を取得
 */
function getShootTypeName(shootType: string): string {
  switch (shootType) {
    case '3pt':
      return '3ポイント';
    case 'midrange':
      return 'ミドルレンジ';
    case 'layup':
      return 'レイアップ';
    case 'out_of_range':
      return 'レンジ外';
    default:
      return shootType;
  }
}

/**
 * シュートタイプフィルターのラベルを取得
 */
function getShotTypeFilterLabel(filter: ShotTypeFilter): string {
  switch (filter) {
    case 'all':
      return '全シュート';
    case '3pt':
      return '3Pのみ';
    case 'midrange':
      return 'ミドルのみ';
    case 'layup':
      return 'レイアップのみ';
    default:
      return filter;
  }
}
