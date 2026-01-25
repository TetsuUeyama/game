/**
 * ポジション配置ボードの型定義
 * サッカーゲームの戦術配置を管理するデータ構造
 */

import { CellCoord } from '../config/FieldGridConfig';

/**
 * ボードの種類
 */
export type PositionBoardType = 'allyOffense' | 'allyDefense' | 'enemyOffense' | 'enemyDefense';

/**
 * チームの種類
 */
export type TeamType = 'ally' | 'enemy';

/**
 * ポジション種別（バスケットボール）
 */
export type PlayerPosition = 'PG' | 'SG' | 'SF' | 'PF' | 'C';

/**
 * ボード上のプレイヤー位置情報
 */
export interface BoardPlayerPosition {
  /** 選手ID */
  playerId: string;
  /** チーム（味方/敵） */
  team: TeamType;
  /** ポジション（GK/DF/MF/FW） */
  position: PlayerPosition;
  /** セル座標 */
  cell: CellCoord;
  /** ワールドX座標 */
  worldX: number;
  /** ワールドZ座標 */
  worldZ: number;
}

/**
 * 配置ボードデータ
 */
export interface PositionBoardData {
  /** ボードタイプ */
  type: PositionBoardType;
  /** ボード名 */
  name: string;
  /** プレイヤー配置リスト */
  players: BoardPlayerPosition[];
  /** 作成日時 */
  createdAt?: string;
  /** 更新日時 */
  updatedAt?: string;
}

/**
 * 配置ボード設定全体
 */
export interface PositionBoardConfig {
  /** バージョン */
  version: string;
  /** 味方攻撃時の配置 */
  allyOffense: PositionBoardData;
  /** 味方守備時の配置 */
  allyDefense: PositionBoardData;
  /** 敵攻撃時の配置 */
  enemyOffense: PositionBoardData;
  /** 敵守備時の配置 */
  enemyDefense: PositionBoardData;
}

/**
 * ボードタイプの表示名
 */
export const BOARD_TYPE_LABELS: Record<PositionBoardType, string> = {
  allyOffense: '味方OF',
  allyDefense: '味方DF',
  enemyOffense: '相手OF',
  enemyDefense: '相手DF',
};

/**
 * ポジションの表示名
 */
export const POSITION_LABELS: Record<PlayerPosition, string> = {
  PG: 'PG',
  SG: 'SG',
  SF: 'SF',
  PF: 'PF',
  C: 'C',
};
