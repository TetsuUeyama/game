'use client';

import { useMemo } from 'react';
import { BoardPlayerPosition } from '@/character-move/types/PositionBoard';
import {
  POSITION_BOARD_UI_CONFIG,
  getColumnLabels,
  getRowCount,
} from '@/character-move/config/PositionBoardConfig';
import { PositionBoardPlayer } from './PositionBoardPlayer';

interface PositionBoardGridProps {
  players: BoardPlayerPosition[];
  selectedPlayerId: string | null;
  onSelectPlayer: (playerId: string) => void;
  onDragStart: (playerId: string, e: React.MouseEvent) => void;
  onDragMove: (e: React.MouseEvent) => void;
  onDragEnd: () => void;
  hoveredCell: { col: string; row: number } | null;
  onCellHover: (col: string, row: number) => void;
  onCellLeave: () => void;
}

/**
 * ポジション配置ボードのグリッド描画
 */
export function PositionBoardGrid({
  players,
  selectedPlayerId,
  onSelectPlayer,
  onDragStart,
  onDragMove,
  onDragEnd,
  hoveredCell,
  onCellHover,
  onCellLeave,
}: PositionBoardGridProps) {
  const { grid, colors } = POSITION_BOARD_UI_CONFIG;
  const columns = getColumnLabels();
  const rowCount = getRowCount();

  // グリッドの総サイズを計算
  const gridWidth = columns.length * grid.cellSize;
  const gridHeight = rowCount * grid.cellSize;
  const totalWidth = gridWidth + grid.rowLabelWidth;
  const totalHeight = gridHeight + grid.headerHeight;

  // セル座標からピクセル座標への変換
  const cellToPixel = useMemo(() => {
    return (col: string, row: number) => {
      const colIndex = columns.indexOf(col);
      if (colIndex === -1) return null;
      return {
        x: grid.rowLabelWidth + colIndex * grid.cellSize + grid.cellSize / 2,
        y: grid.headerHeight + (row - 1) * grid.cellSize + grid.cellSize / 2,
      };
    };
  }, [columns, grid.cellSize, grid.headerHeight, grid.rowLabelWidth]);

  // ピクセル座標からセル座標への変換
  const pixelToCell = (clientX: number, clientY: number, svgRect: DOMRect) => {
    const x = clientX - svgRect.left - grid.rowLabelWidth;
    const y = clientY - svgRect.top - grid.headerHeight;

    if (x < 0 || y < 0) return null;

    const colIndex = Math.floor(x / grid.cellSize);
    const rowIndex = Math.floor(y / grid.cellSize);

    if (colIndex >= columns.length || rowIndex >= rowCount) return null;

    return {
      col: columns[colIndex],
      row: rowIndex + 1,
    };
  };

  // マウス移動時のセルホバー検出
  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    onDragMove(e);
    const svg = e.currentTarget;
    const rect = svg.getBoundingClientRect();
    const cell = pixelToCell(e.clientX, e.clientY, rect);
    if (cell) {
      onCellHover(cell.col, cell.row);
    } else {
      onCellLeave();
    }
  };

  // センターライン（15行目）
  const centerLineY = grid.headerHeight + 14.5 * grid.cellSize;

  // ペナルティエリアの描画
  const penaltyAreaWidth = 7 * grid.cellSize; // E-K列 (7列)
  const penaltyAreaHeight = 5 * grid.cellSize; // 5行
  const penaltyAreaX = grid.rowLabelWidth + 4 * grid.cellSize; // E列から

  return (
    <svg
      width={totalWidth}
      height={totalHeight}
      onMouseMove={handleMouseMove}
      onMouseUp={onDragEnd}
      onMouseLeave={() => {
        onDragEnd();
        onCellLeave();
      }}
      style={{ display: 'block', backgroundColor: '#f3f4f6' }}
    >
      {/* 全体背景 */}
      <rect
        x={0}
        y={0}
        width={totalWidth}
        height={totalHeight}
        fill="#f3f4f6"
      />

      {/* 背景（フィールド） */}
      <rect
        x={grid.rowLabelWidth}
        y={grid.headerHeight}
        width={gridWidth}
        height={gridHeight}
        fill={colors.field.grass}
      />

      {/* グリッドライン - 縦 */}
      {columns.map((_, index) => (
        <line
          key={`v-${index}`}
          x1={grid.rowLabelWidth + index * grid.cellSize}
          y1={grid.headerHeight}
          x2={grid.rowLabelWidth + index * grid.cellSize}
          y2={grid.headerHeight + gridHeight}
          stroke={colors.grid.cell}
          strokeWidth={0.5}
          opacity={0.5}
        />
      ))}

      {/* グリッドライン - 横 */}
      {Array.from({ length: rowCount + 1 }, (_, index) => (
        <line
          key={`h-${index}`}
          x1={grid.rowLabelWidth}
          y1={grid.headerHeight + index * grid.cellSize}
          x2={grid.rowLabelWidth + gridWidth}
          y2={grid.headerHeight + index * grid.cellSize}
          stroke={colors.grid.cell}
          strokeWidth={0.5}
          opacity={0.5}
        />
      ))}

      {/* センターライン */}
      <line
        x1={grid.rowLabelWidth}
        y1={centerLineY}
        x2={grid.rowLabelWidth + gridWidth}
        y2={centerLineY}
        stroke={colors.field.lines}
        strokeWidth={2}
      />

      {/* センターサークル */}
      <circle
        cx={grid.rowLabelWidth + gridWidth / 2}
        cy={centerLineY}
        r={3 * grid.cellSize}
        fill="none"
        stroke={colors.field.lines}
        strokeWidth={2}
      />

      {/* ペナルティエリア - 上側（敵ゴール側） */}
      <rect
        x={penaltyAreaX}
        y={grid.headerHeight}
        width={penaltyAreaWidth}
        height={penaltyAreaHeight}
        fill="none"
        stroke={colors.field.lines}
        strokeWidth={2}
      />

      {/* ペナルティエリア - 下側（味方ゴール側） */}
      <rect
        x={penaltyAreaX}
        y={grid.headerHeight + gridHeight - penaltyAreaHeight}
        width={penaltyAreaWidth}
        height={penaltyAreaHeight}
        fill="none"
        stroke={colors.field.lines}
        strokeWidth={2}
      />

      {/* ゴールエリア - 上側 */}
      <rect
        x={grid.rowLabelWidth + 5 * grid.cellSize}
        y={grid.headerHeight}
        width={5 * grid.cellSize}
        height={2 * grid.cellSize}
        fill="none"
        stroke={colors.field.lines}
        strokeWidth={1.5}
      />

      {/* ゴールエリア - 下側 */}
      <rect
        x={grid.rowLabelWidth + 5 * grid.cellSize}
        y={grid.headerHeight + gridHeight - 2 * grid.cellSize}
        width={5 * grid.cellSize}
        height={2 * grid.cellSize}
        fill="none"
        stroke={colors.field.lines}
        strokeWidth={1.5}
      />

      {/* 列ヘッダー（A-O） */}
      {columns.map((col, index) => (
        <text
          key={`col-${col}`}
          x={grid.rowLabelWidth + index * grid.cellSize + grid.cellSize / 2}
          y={grid.headerHeight / 2 + 2}
          textAnchor="middle"
          dominantBaseline="middle"
          fill="#000000"
          fontSize={10}
          fontWeight="bold"
        >
          {col}
        </text>
      ))}

      {/* 行番号（1-30） */}
      {Array.from({ length: rowCount }, (_, index) => (
        <text
          key={`row-${index + 1}`}
          x={grid.rowLabelWidth / 2}
          y={grid.headerHeight + index * grid.cellSize + grid.cellSize / 2 + 1}
          textAnchor="middle"
          dominantBaseline="middle"
          fill="#000000"
          fontSize={8}
        >
          {index + 1}
        </text>
      ))}

      {/* ホバー中のセルをハイライト */}
      {hoveredCell && (
        <rect
          x={grid.rowLabelWidth + columns.indexOf(hoveredCell.col) * grid.cellSize}
          y={grid.headerHeight + (hoveredCell.row - 1) * grid.cellSize}
          width={grid.cellSize}
          height={grid.cellSize}
          fill="rgba(255, 255, 255, 0.3)"
          stroke="#FBBF24"
          strokeWidth={2}
        />
      )}

      {/* プレイヤーマーカー */}
      {players.map((player) => {
        const pos = cellToPixel(player.cell.col, player.cell.row);
        if (!pos) return null;
        return (
          <PositionBoardPlayer
            key={player.playerId}
            player={player}
            x={pos.x}
            y={pos.y}
            isSelected={selectedPlayerId === player.playerId}
            onSelect={onSelectPlayer}
            onDragStart={onDragStart}
          />
        );
      })}
    </svg>
  );
}
