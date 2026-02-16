'use client';

import { useState, useMemo } from 'react';
import { CellShootResult } from '@/GamePlay/GameSystem/CharacterMove/Controllers/Check/ShootCheckController';

interface ShootCheckResultsTableProps {
  results: CellShootResult[];
}

type SortKey = 'cellName' | 'shootType' | 'successRate' | 'totalShots';
type SortOrder = 'asc' | 'desc';

/**
 * シュートチェック結果テーブル
 */
export function ShootCheckResultsTable({ results }: ShootCheckResultsTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>('cellName');
  const [sortOrder, setSortOrder] = useState<SortOrder>('asc');
  const [filterType, setFilterType] = useState<string>('all');

  // フィルタリングとソート
  const sortedResults = useMemo(() => {
    let filtered = results;

    // フィルタリング
    if (filterType !== 'all') {
      if (filterType === 'in_range') {
        filtered = results.filter((r) => r.shootType !== 'out_of_range');
      } else {
        filtered = results.filter((r) => r.shootType === filterType);
      }
    }

    // ソート
    return [...filtered].sort((a, b) => {
      let comparison = 0;

      switch (sortKey) {
        case 'cellName':
          // セル名でソート（A1, A2, ... B1, B2, ...）
          const colA = a.col.charCodeAt(0);
          const colB = b.col.charCodeAt(0);
          if (colA !== colB) {
            comparison = colA - colB;
          } else {
            comparison = a.row - b.row;
          }
          break;
        case 'shootType':
          comparison = a.shootType.localeCompare(b.shootType);
          break;
        case 'successRate':
          comparison = a.successRate - b.successRate;
          break;
        case 'totalShots':
          comparison = a.totalShots - b.totalShots;
          break;
      }

      return sortOrder === 'asc' ? comparison : -comparison;
    });
  }, [results, sortKey, sortOrder, filterType]);

  // ソートヘッダーをクリック
  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortOrder('asc');
    }
  };

  // 統計情報
  const stats = useMemo(() => {
    const inRange = results.filter((r) => r.shootType !== 'out_of_range');
    const totalSuccess = inRange.reduce((sum, r) => sum + r.successCount, 0);
    const totalShots = inRange.reduce((sum, r) => sum + r.totalShots, 0);

    return {
      totalCells: results.length,
      inRangeCells: inRange.length,
      outOfRangeCells: results.length - inRange.length,
      totalShots,
      totalSuccess,
      overallRate: totalShots > 0 ? (totalSuccess / totalShots) * 100 : 0,
    };
  }, [results]);

  return (
    <div className="p-4">
      {/* 統計サマリー */}
      <div className="mb-4 p-3 bg-gray-700 rounded-lg">
        <h4 className="text-sm font-bold text-white mb-2">統計</h4>
        <div className="grid grid-cols-2 gap-2 text-xs text-gray-300">
          <div>総マス数: {stats.totalCells}</div>
          <div>レンジ内: {stats.inRangeCells}</div>
          <div>総シュート: {stats.totalShots}</div>
          <div>成功: {stats.totalSuccess}</div>
          <div className="col-span-2 text-sm font-bold text-white">
            総合成功率: {stats.overallRate.toFixed(1)}%
          </div>
        </div>
      </div>

      {/* フィルター */}
      <div className="mb-4">
        <select
          value={filterType}
          onChange={(e) => setFilterType(e.target.value)}
          className="w-full px-3 py-2 bg-gray-700 text-white text-sm rounded border border-gray-600"
        >
          <option value="all">全て表示</option>
          <option value="in_range">レンジ内のみ</option>
          <option value="3pt">3ポイントのみ</option>
          <option value="midrange">ミドルレンジのみ</option>
          <option value="layup">レイアップのみ</option>
          <option value="out_of_range">レンジ外のみ</option>
        </select>
      </div>

      {/* テーブル */}
      <div className="overflow-x-auto">
        <table className="w-full text-xs text-white">
          <thead className="bg-gray-700">
            <tr>
              <th
                className="px-2 py-2 text-left cursor-pointer hover:bg-gray-600"
                onClick={() => handleSort('cellName')}
              >
                マス {sortKey === 'cellName' && (sortOrder === 'asc' ? '▲' : '▼')}
              </th>
              <th
                className="px-2 py-2 text-left cursor-pointer hover:bg-gray-600"
                onClick={() => handleSort('shootType')}
              >
                種類 {sortKey === 'shootType' && (sortOrder === 'asc' ? '▲' : '▼')}
              </th>
              <th
                className="px-2 py-2 text-right cursor-pointer hover:bg-gray-600"
                onClick={() => handleSort('successRate')}
              >
                成功率 {sortKey === 'successRate' && (sortOrder === 'asc' ? '▲' : '▼')}
              </th>
              <th className="px-2 py-2 text-right">成功/失敗</th>
            </tr>
          </thead>
          <tbody>
            {sortedResults.map((result) => (
              <tr
                key={result.cellName}
                className="border-b border-gray-700 hover:bg-gray-700"
              >
                <td className="px-2 py-2 font-mono">{result.cellName}</td>
                <td className="px-2 py-2">
                  <span
                    className={`px-1.5 py-0.5 rounded text-[10px] ${getShootTypeBadgeColor(
                      result.shootType
                    )}`}
                  >
                    {getShootTypeName(result.shootType)}
                  </span>
                </td>
                <td className="px-2 py-2 text-right">
                  {result.shootType !== 'out_of_range' ? (
                    <span className={getSuccessRateColor(result.successRate)}>
                      {result.successRate.toFixed(1)}%
                    </span>
                  ) : (
                    <span className="text-gray-500">-</span>
                  )}
                </td>
                <td className="px-2 py-2 text-right font-mono">
                  {result.totalShots > 0 ? (
                    <>
                      <span className="text-green-400">{result.successCount}</span>
                      <span className="text-gray-500">/</span>
                      <span className="text-red-400">{result.failureCount}</span>
                    </>
                  ) : (
                    <span className="text-gray-500">-</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {sortedResults.length === 0 && (
        <div className="text-center text-gray-400 py-8">
          該当するデータがありません
        </div>
      )}
    </div>
  );
}

/**
 * シュートタイプの日本語名を取得
 */
function getShootTypeName(shootType: string): string {
  switch (shootType) {
    case '3pt':
      return '3P';
    case 'midrange':
      return 'ミドル';
    case 'layup':
      return 'レイアップ';
    case 'out_of_range':
      return 'レンジ外';
    default:
      return shootType;
  }
}

/**
 * シュートタイプのバッジ色を取得
 */
function getShootTypeBadgeColor(shootType: string): string {
  switch (shootType) {
    case '3pt':
      return 'bg-purple-600 text-white';
    case 'midrange':
      return 'bg-blue-600 text-white';
    case 'layup':
      return 'bg-green-600 text-white';
    case 'out_of_range':
      return 'bg-gray-600 text-gray-300';
    default:
      return 'bg-gray-600 text-white';
  }
}

/**
 * 成功率に基づく色を取得
 */
function getSuccessRateColor(rate: number): string {
  if (rate >= 80) return 'text-green-400 font-bold';
  if (rate >= 60) return 'text-green-300';
  if (rate >= 40) return 'text-yellow-400';
  if (rate >= 20) return 'text-orange-400';
  return 'text-red-400';
}
