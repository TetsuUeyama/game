/**
 * シュートチェック関連の設定を一元管理するファイル
 * ShootCheckController用の定数と型定義を提供
 */

import { ShootType } from "../../controllers/action/ShootingController";

/**
 * シュートチェックのタイミング設定
 */
export const SHOOT_CHECK_TIMING = {
  // シュートタイムアウト（ミリ秒）- アニメーション時間含む
  SHOT_TIMEOUT_MS: 8000,

  // 升目間の遅延（ミリ秒）
  CELL_CHANGE_DELAY_MS: 100,

  // シュート間の遅延（ミリ秒）
  SHOT_INTERVAL_DELAY_MS: 200,

  // レンジ外升目のスキップ遅延（ミリ秒）
  OUT_OF_RANGE_SKIP_DELAY_MS: 50,

  // フィルタースキップ遅延（ミリ秒）
  FILTER_SKIP_DELAY_MS: 10,
} as const;

/**
 * シュートチェックの判定設定
 */
export const SHOOT_CHECK_DETECTION = {
  // 床バウンド検知の高さ（m）- ボール半径+マージン
  FLOOR_BOUNCE_HEIGHT: 0.3,
} as const;

/**
 * ゴール位置設定
 */
export const SHOOT_CHECK_GOAL_POSITION = {
  // goal1のZ座標
  GOAL1_Z: 13.4,

  // goal2のZ座標
  GOAL2_Z: -13.4,
} as const;

/**
 * 升目ごとのシュート結果
 */
export interface CellShootResult {
  cellName: string;
  col: string;
  row: number;
  worldX: number;
  worldZ: number;
  shootType: ShootType | 'out_of_range';
  totalShots: number;
  successCount: number;
  failureCount: number;
  successRate: number;
  completed: boolean;
}

/**
 * シュートチェックの進行状態
 */
export type ShootCheckState =
  | 'idle'           // 待機中
  | 'running'        // 実行中
  | 'paused'         // 一時停止
  | 'completed'      // 完了
  | 'aborted';       // 中断

/**
 * シュートタイプフィルター
 */
export type ShotTypeFilter = 'all' | '3pt' | 'midrange' | 'layup' | 'dunk';

/**
 * シュートチェックの設定
 */
export interface ShootCheckConfig {
  shotsPerCell: number;           // 1升目あたりのシュート数
  targetGoal: 'goal1' | 'goal2';  // 攻めるゴール
  shotTypeFilter?: ShotTypeFilter; // シュートタイプフィルター（デフォルト: 'all'）
}

/**
 * シュートチェック進捗情報
 */
export interface ShootCheckProgress {
  totalCells: number;
  completedCells: number;
  currentCell: string;
  currentCellShots: number;
  shotsPerCell: number;
  state: ShootCheckState;
  shotTypeFilter: ShotTypeFilter;
}
