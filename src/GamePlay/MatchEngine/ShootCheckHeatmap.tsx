'use client';

import { useMemo } from 'react';
import { CellShootResult } from '@/GamePlay/MatchEngine/CheckControllers/ShootCheckController';
import { GRID_CONFIG } from '@/GamePlay/GameSystem/CharacterMove/Config/FieldGridConfig';

interface ShootCheckHeatmapProps {
  results: CellShootResult[];
  targetGoal: 'goal1' | 'goal2';
  onCellHover: (cellName: string | null) => void;
  fullSize?: boolean;
}

/**
 * シュートチェック結果のヒートマップ表示
 */
export function ShootCheckHeatmap({
  results,
  targetGoal,
  onCellHover,
  fullSize = false,
}: ShootCheckHeatmapProps) {
  // 結果をマップに変換
  const resultMap = useMemo(() => {
    const map = new Map<string, CellShootResult>();
    for (const result of results) {
      map.set(result.cellName, result);
    }
    return map;
  }, [results]);

  // セルの色を計算
  const getCellColor = (cellName: string): string => {
    const result = resultMap.get(cellName);

    if (!result) {
      // 未テスト
      return 'bg-gray-700';
    }

    if (result.shootType === 'out_of_range') {
      // レンジ外
      return 'bg-gray-600';
    }

    // 成功率に基づいて色を決定
    const rate = result.successRate;

    if (rate >= 80) {
      return 'bg-green-500';
    } else if (rate >= 60) {
      return 'bg-green-400';
    } else if (rate >= 40) {
      return 'bg-yellow-400';
    } else if (rate >= 20) {
      return 'bg-orange-400';
    } else if (rate > 0) {
      return 'bg-red-400';
    } else {
      return 'bg-red-600';
    }
  };

  // シュートタイプに基づいてボーダー色を決定
  const getCellBorder = (cellName: string): string => {
    const result = resultMap.get(cellName);

    if (!result || result.shootType === 'out_of_range') {
      return 'border-gray-800';
    }

    switch (result.shootType) {
      case '3pt':
        return 'border-purple-500';
      case 'midrange':
        return 'border-blue-500';
      case 'layup':
        return 'border-green-600';
      default:
        return 'border-gray-600';
    }
  };

  // グリッドサイズ
  const cols = GRID_CONFIG.cell.colCount; // 15
  const rows = GRID_CONFIG.cell.rowCount; // 30

  // セルサイズ
  const cellSize = fullSize ? 'w-6 h-4' : 'w-2 h-1.5';
  const fontSize = fullSize ? 'text-[8px]' : 'text-[4px]';

  return (
    <div className={`${fullSize ? 'p-4' : 'p-2'} bg-gray-900 rounded-lg`}>
      {fullSize && (
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-white font-bold">シュートマップ</h3>
          <div className="flex items-center gap-4 text-xs text-gray-300">
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 bg-green-500 rounded" />
              <span>80%+</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 bg-yellow-400 rounded" />
              <span>40-60%</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 bg-red-400 rounded" />
              <span>0-20%</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 bg-gray-600 rounded" />
              <span>レンジ外</span>
            </div>
          </div>
        </div>
      )}

      {/* ゴール位置表示 */}
      <div className="flex flex-col items-center">
        {targetGoal === 'goal1' && (
          <div className={`${fullSize ? 'mb-2 text-sm' : 'mb-1 text-[6px]'} text-yellow-400 font-bold`}>
            ゴール1 (+Z)
          </div>
        )}

        {/* グリッド */}
        <div
          className="grid gap-px"
          style={{
            gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
            // ゴール1を攻める場合は上が+Z（row30側）
            // ゴール2を攻める場合は上が-Z（row1側）
            transform: targetGoal === 'goal1' ? 'scaleY(-1)' : 'none',
          }}
        >
          {/* 行を逆順に表示（下がrow1、上がrow30） */}
          {Array.from({ length: rows }, (_, rowIdx) => {
            const row = rowIdx + 1;
            return Array.from({ length: cols }, (_, colIdx) => {
              const col = GRID_CONFIG.cell.colLabels[colIdx];
              const cellName = `${col}${row}`;
              const result = resultMap.get(cellName);

              return (
                <div
                  key={cellName}
                  className={`${cellSize} ${getCellColor(cellName)} ${getCellBorder(cellName)} border cursor-pointer hover:opacity-80 transition-opacity flex items-center justify-center`}
                  style={{
                    // スケールを戻す（親のscaleYを打ち消す）
                    transform: targetGoal === 'goal1' ? 'scaleY(-1)' : 'none',
                  }}
                  onMouseEnter={() => onCellHover(cellName)}
                  onMouseLeave={() => onCellHover(null)}
                  title={result ? `${cellName}: ${result.successRate.toFixed(1)}%` : cellName}
                >
                  {fullSize && result && result.totalShots > 0 && (
                    <span className={`${fontSize} text-white font-bold`}>
                      {Math.round(result.successRate)}
                    </span>
                  )}
                </div>
              );
            });
          })}
        </div>

        {targetGoal === 'goal2' && (
          <div className={`${fullSize ? 'mt-2 text-sm' : 'mt-1 text-[6px]'} text-yellow-400 font-bold`}>
            ゴール2 (-Z)
          </div>
        )}
      </div>

      {/* 列ラベル */}
      {fullSize && (
        <div
          className="grid gap-px mt-1"
          style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
        >
          {GRID_CONFIG.cell.colLabels.map((col) => (
            <div key={col} className="text-center text-[8px] text-gray-400">
              {col}
            </div>
          ))}
        </div>
      )}

      {/* シュートタイプ凡例 */}
      {fullSize && (
        <div className="mt-4 flex items-center justify-center gap-6 text-xs text-gray-300">
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 border-2 border-purple-500 rounded" />
            <span>3P</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 border-2 border-blue-500 rounded" />
            <span>ミドル</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 border-2 border-green-600 rounded" />
            <span>レイアップ</span>
          </div>
        </div>
      )}
    </div>
  );
}
