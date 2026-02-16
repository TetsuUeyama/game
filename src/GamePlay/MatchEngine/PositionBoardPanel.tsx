'use client';

import { useState, useCallback } from 'react';
import {
  PositionBoardType,
  BoardPlayerPosition,
} from '@/GamePlay/GameSystem/CharacterMove/Types/PositionBoard';
import {
  POSITION_BOARD_UI_CONFIG,
} from '@/GamePlay/GameSystem/CharacterMove/Config/PositionBoardConfig';
import { createDefaultConfig } from '@/GamePlay/GameSystem/CharacterMove/Loaders/PositionBoardLoader';
import { PositionBoardGrid } from './PositionBoardGrid';
import { PositionBoardToolbar } from './PositionBoardToolbar';

interface PositionBoardPanelProps {
  isVisible: boolean;
  onClose: () => void;
  onApplyPositions?: (allyPositions: BoardPlayerPosition[], enemyPositions: BoardPlayerPosition[]) => void;
}

/**
 * ポジション配置ボードのメインパネル
 * 設定ファイルから読み込み、タブで切り替えて表示
 */
export function PositionBoardPanel({
  isVisible,
  onClose,
  onApplyPositions,
}: PositionBoardPanelProps) {
  // 設定ファイルから読み込み（読み取り専用）
  const config = createDefaultConfig();

  // 現在表示中のボードタイプ
  const [activeBoard, setActiveBoard] = useState<PositionBoardType>('allyOffense');
  const [hoveredCell, setHoveredCell] = useState<{ col: string; row: number } | null>(null);

  // 現在のボードのプレイヤーリスト
  const currentPlayers = config[activeBoard].players;

  // ボード切り替え
  const handleBoardChange = useCallback((board: PositionBoardType) => {
    setActiveBoard(board);
  }, []);

  // セルホバー
  const handleCellHover = useCallback((col: string, row: number) => {
    setHoveredCell({ col, row });
  }, []);

  // セルホバー終了
  const handleCellLeave = useCallback(() => {
    setHoveredCell(null);
  }, []);

  // 適用
  const handleApply = useCallback(() => {
    if (!onApplyPositions) return;

    const board = config[activeBoard];
    const allyPlayers = board.players.filter(p => p.team === 'ally');
    const enemyPlayers = board.players.filter(p => p.team === 'enemy');
    onApplyPositions(allyPlayers, enemyPlayers);
  }, [config, activeBoard, onApplyPositions]);

  if (!isVisible) {
    return null;
  }

  return (
    <div
      className="fixed top-20 right-4 bg-white rounded-lg shadow-2xl z-50 overflow-hidden"
      style={{ width: POSITION_BOARD_UI_CONFIG.panel.width }}
    >
      {/* ヘッダー */}
      <div className="flex items-center justify-between px-4 py-2 bg-gray-800 text-white">
        <h2 className="text-sm font-bold">ポジション配置ボード</h2>
        <button
          onClick={onClose}
          className="w-6 h-6 flex items-center justify-center rounded hover:bg-gray-700 transition-colors"
        >
          x
        </button>
      </div>

      {/* ツールバー（タブ切り替え） */}
      <div className="px-4 py-2 bg-gray-100 border-b">
        <PositionBoardToolbar
          activeBoard={activeBoard}
          onBoardChange={handleBoardChange}
          onApply={handleApply}
        />
      </div>

      {/* グリッド（読み取り専用） */}
      <div className="p-4 overflow-auto" style={{ maxHeight: 560 }}>
        <PositionBoardGrid
          players={currentPlayers}
          selectedPlayerId={null}
          onSelectPlayer={() => {}}
          onDragStart={() => {}}
          onDragMove={() => {}}
          onDragEnd={() => {}}
          hoveredCell={hoveredCell}
          onCellHover={handleCellHover}
          onCellLeave={handleCellLeave}
        />
      </div>

      {/* フッター - ホバー中の座標表示 */}
      <div className="px-4 py-2 bg-gray-100 border-t text-xs text-gray-600">
        {hoveredCell ? (
          <span>座標: {hoveredCell.col}{hoveredCell.row}</span>
        ) : (
          <span>セル上にカーソルを移動すると座標が表示されます</span>
        )}
      </div>
    </div>
  );
}
