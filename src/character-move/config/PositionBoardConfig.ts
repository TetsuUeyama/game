/**
 * ポジション配置ボードの設定
 */

import {
  PositionBoardType,
  PositionBoardConfig,
  BoardPlayerPosition,
} from '../types/PositionBoard';
import { GRID_CONFIG } from './FieldGridConfig';

/**
 * UI設定
 */
export const POSITION_BOARD_UI_CONFIG = {
  /** パネルサイズ */
  panel: {
    width: 420,
    height: 680,
  },
  /** グリッド設定 */
  grid: {
    cellSize: 16, // ピクセル
    headerHeight: 20,
    rowLabelWidth: 24,
  },
  /** カラー設定 */
  colors: {
    ally: {
      primary: '#3B82F6', // 青
      light: '#93C5FD',
      dark: '#1D4ED8',
    },
    enemy: {
      primary: '#EF4444', // 赤
      light: '#FCA5A5',
      dark: '#B91C1C',
    },
    field: {
      grass: '#4ADE80',
      lines: '#FFFFFF',
      centerCircle: '#FFFFFF',
    },
    grid: {
      border: '#9CA3AF',
      cell: '#E5E7EB',
    },
  },
} as const;

/**
 * デフォルトポジション設定（バスケットボール5人制）
 * 各ボードには1チーム分（5人）のみを表示
 */

// 味方オフェンス時の味方配置（攻撃的）
const createAllyOffensePlayers = (): BoardPlayerPosition[] => [
  { playerId: '1', team: 'ally', position: 'PG', cell: { col: 'H', row: 20 }, worldX: 0, worldZ: 5 },
  { playerId: '2', team: 'ally', position: 'SG', cell: { col: 'E', row: 17 }, worldX: -5, worldZ: 2 },
  { playerId: '3', team: 'ally', position: 'SF', cell: { col: 'K', row: 17 }, worldX: 5, worldZ: 2 },
  { playerId: '4', team: 'ally', position: 'PF', cell: { col: 'F', row: 12 }, worldX: -4, worldZ: -3 },
  { playerId: '5', team: 'ally', position: 'C', cell: { col: 'J', row: 12 }, worldX: 4, worldZ: -3 },
];

// 味方ディフェンス時の味方配置（守備的）
const createAllyDefensePlayers = (): BoardPlayerPosition[] => [
  { playerId: '1', team: 'ally', position: 'PG', cell: { col: 'H', row: 25 }, worldX: 0, worldZ: 10 },
  { playerId: '2', team: 'ally', position: 'SG', cell: { col: 'E', row: 22 }, worldX: -5, worldZ: 7 },
  { playerId: '3', team: 'ally', position: 'SF', cell: { col: 'K', row: 22 }, worldX: 5, worldZ: 7 },
  { playerId: '4', team: 'ally', position: 'PF', cell: { col: 'F', row: 18 }, worldX: -4, worldZ: 3 },
  { playerId: '5', team: 'ally', position: 'C', cell: { col: 'J', row: 18 }, worldX: 4, worldZ: 3 },
];

// 相手オフェンス時の相手配置（攻撃的）
const createEnemyOffensePlayers = (): BoardPlayerPosition[] => [
  { playerId: '7', team: 'enemy', position: 'PG', cell: { col: 'H', row: 11 }, worldX: 0, worldZ: -5 },
  { playerId: '8', team: 'enemy', position: 'SG', cell: { col: 'E', row: 14 }, worldX: -5, worldZ: -2 },
  { playerId: '9', team: 'enemy', position: 'SF', cell: { col: 'K', row: 14 }, worldX: 5, worldZ: -2 },
  { playerId: '10', team: 'enemy', position: 'PF', cell: { col: 'F', row: 19 }, worldX: -4, worldZ: 3 },
  { playerId: '11', team: 'enemy', position: 'C', cell: { col: 'J', row: 19 }, worldX: 4, worldZ: 3 },
];

// 相手ディフェンス時の相手配置（守備的）
const createEnemyDefensePlayers = (): BoardPlayerPosition[] => [
  { playerId: '7', team: 'enemy', position: 'PG', cell: { col: 'H', row: 6 }, worldX: 0, worldZ: -10 },
  { playerId: '8', team: 'enemy', position: 'SG', cell: { col: 'E', row: 9 }, worldX: -5, worldZ: -7 },
  { playerId: '9', team: 'enemy', position: 'SF', cell: { col: 'K', row: 9 }, worldX: 5, worldZ: -7 },
  { playerId: '10', team: 'enemy', position: 'PF', cell: { col: 'F', row: 13 }, worldX: -4, worldZ: -3 },
  { playerId: '11', team: 'enemy', position: 'C', cell: { col: 'J', row: 13 }, worldX: 4, worldZ: -3 },
];

/**
 * デフォルトの配置ボード設定を生成
 * 各ボードには1チーム分（5人）のみを表示
 */
export function createDefaultPositionBoardConfig(): PositionBoardConfig {
  const timestamp = new Date().toISOString();

  return {
    version: '1.0.0',
    allyOffense: {
      type: 'allyOffense',
      name: '味方オフェンス',
      players: createAllyOffensePlayers(),
      createdAt: timestamp,
      updatedAt: timestamp,
    },
    allyDefense: {
      type: 'allyDefense',
      name: '味方ディフェンス',
      players: createAllyDefensePlayers(),
      createdAt: timestamp,
      updatedAt: timestamp,
    },
    enemyOffense: {
      type: 'enemyOffense',
      name: '相手オフェンス',
      players: createEnemyOffensePlayers(),
      createdAt: timestamp,
      updatedAt: timestamp,
    },
    enemyDefense: {
      type: 'enemyDefense',
      name: '相手ディフェンス',
      players: createEnemyDefensePlayers(),
      createdAt: timestamp,
      updatedAt: timestamp,
    },
  };
}

/**
 * ボードタイプからタブのインデックスを取得
 */
export function getBoardTypeIndex(type: PositionBoardType): number {
  const types: PositionBoardType[] = ['allyOffense', 'allyDefense', 'enemyOffense', 'enemyDefense'];
  return types.indexOf(type);
}

/**
 * インデックスからボードタイプを取得
 */
export function getBoardTypeFromIndex(index: number): PositionBoardType {
  const types: PositionBoardType[] = ['allyOffense', 'allyDefense', 'enemyOffense', 'enemyDefense'];
  return types[index] || 'allyOffense';
}

/**
 * 列ラベルを取得
 */
export function getColumnLabels(): string[] {
  return GRID_CONFIG.cell.colLabels;
}

/**
 * 行数を取得
 */
export function getRowCount(): number {
  return GRID_CONFIG.cell.rowCount;
}
