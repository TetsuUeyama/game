'use client';

import { PositionBoardType, BOARD_TYPE_LABELS } from '@/character-move/types/PositionBoard';

interface PositionBoardToolbarProps {
  activeBoard: PositionBoardType;
  onBoardChange: (board: PositionBoardType) => void;
  onApply: () => void;
}

/**
 * ポジション配置ボードのツールバー
 */
export function PositionBoardToolbar({
  activeBoard,
  onBoardChange,
  onApply,
}: PositionBoardToolbarProps) {
  const boardTypes: PositionBoardType[] = ['allyOffense', 'allyDefense', 'enemyOffense', 'enemyDefense'];

  const getTabColor = (type: PositionBoardType) => {
    if (type === activeBoard) {
      if (type.startsWith('ally')) {
        return 'bg-blue-600 text-white';
      }
      return 'bg-red-600 text-white';
    }
    if (type.startsWith('ally')) {
      return 'bg-blue-100 text-blue-800 hover:bg-blue-200';
    }
    return 'bg-red-100 text-red-800 hover:bg-red-200';
  };

  return (
    <div className="space-y-2">
      {/* タブボタン */}
      <div className="flex flex-wrap gap-1">
        {boardTypes.map((type) => (
          <button
            key={type}
            onClick={() => onBoardChange(type)}
            className={`px-3 py-1.5 text-xs font-semibold rounded transition-colors ${getTabColor(type)}`}
          >
            {BOARD_TYPE_LABELS[type]}
          </button>
        ))}
      </div>

      {/* 適用ボタン */}
      <div className="flex flex-wrap gap-1 pt-2 border-t border-gray-300">
        <button
          onClick={onApply}
          className="px-3 py-1.5 text-xs font-semibold bg-indigo-600 text-white rounded hover:bg-indigo-700 transition-colors"
        >
          適用
        </button>
      </div>
    </div>
  );
}
