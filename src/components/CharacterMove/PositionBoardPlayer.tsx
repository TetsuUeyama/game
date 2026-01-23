'use client';

import { BoardPlayerPosition, POSITION_LABELS } from '@/character-move/types/PositionBoard';
import { POSITION_BOARD_UI_CONFIG } from '@/character-move/config/PositionBoardConfig';

interface PositionBoardPlayerProps {
  player: BoardPlayerPosition;
  x: number;
  y: number;
  isSelected: boolean;
  onSelect: (playerId: string) => void;
  onDragStart: (playerId: string, e: React.MouseEvent) => void;
}

/**
 * ポジション配置ボードのプレイヤーマーカー
 */
export function PositionBoardPlayer({
  player,
  x,
  y,
  isSelected,
  onSelect,
  onDragStart,
}: PositionBoardPlayerProps) {
  const { colors } = POSITION_BOARD_UI_CONFIG;
  const teamColors = player.team === 'ally' ? colors.ally : colors.enemy;
  const radius = 12;

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    onSelect(player.playerId);
    onDragStart(player.playerId, e);
  };

  return (
    <g
      transform={`translate(${x}, ${y})`}
      style={{ cursor: 'grab' }}
      onMouseDown={handleMouseDown}
    >
      {/* 選択時のハイライト */}
      {isSelected && (
        <circle
          r={radius + 4}
          fill="none"
          stroke="#FBBF24"
          strokeWidth={2}
          strokeDasharray="4 2"
        />
      )}

      {/* プレイヤー円 */}
      <circle
        r={radius}
        fill={teamColors.primary}
        stroke={teamColors.dark}
        strokeWidth={2}
      />

      {/* ポジション文字 */}
      <text
        x={0}
        y={1}
        textAnchor="middle"
        dominantBaseline="middle"
        fill="white"
        fontSize={8}
        fontWeight="bold"
        style={{ pointerEvents: 'none', userSelect: 'none' }}
      >
        {POSITION_LABELS[player.position]}
      </text>

      {/* プレイヤーID（下部） */}
      <text
        x={0}
        y={radius + 10}
        textAnchor="middle"
        fill={teamColors.dark}
        fontSize={8}
        fontWeight="bold"
        style={{ pointerEvents: 'none', userSelect: 'none' }}
      >
        #{player.playerId}
      </text>
    </g>
  );
}
