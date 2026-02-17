/**
 * シュートチェック関連の設定を一元管理するファイル
 * ShootCheckController用の定数と型定義を提供
 */

import { ShootType } from "@/GamePlay/GameSystem/ShootingSystem/ShootingController";

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
 * ディフェンダー設定のデフォルト値
 */
export const SHOOT_CHECK_DEFENDER = {
  // ゴール前配置時のゴールからの距離（m）
  DEFAULT_DISTANCE_FROM_GOAL: 1.5,

  // シューター前配置時のシューターからの距離（m）
  DEFAULT_DISTANCE_FROM_SHOOTER: 1.0,

  // ブロックジャンプの反応遅延（ms）
  BLOCK_REACTION_DELAY_MS: 100,

  // ブロック後の着地待機時間（ms）
  BLOCK_LANDING_WAIT_MS: 800,
} as const;

/**
 * ダンクブロック衝突設定
 */
export const DUNK_BLOCK_COLLISION = {
  // 衝突判定半径（m）- ダンカーとブロッカーの距離がこれ以下で衝突
  COLLISION_RADIUS: 0.8,

  // 衝突判定を行う高さ範囲（地面からの高さ, m）
  MIN_COLLISION_HEIGHT: 0.5,
  MAX_COLLISION_HEIGHT: 3.0,

  // POWER差による吹き飛ばし係数
  // 吹き飛ばし距離 = POWER差 * KNOCKBACK_MULTIPLIER
  KNOCKBACK_MULTIPLIER: 0.05,

  // 最小吹き飛ばし距離（m）
  MIN_KNOCKBACK_DISTANCE: 0.5,

  // 最大吹き飛ばし距離（m）
  MAX_KNOCKBACK_DISTANCE: 3.0,

  // ブロック成功に必要な最小POWER差（ディフェンダーが上回る必要がある）
  // 同等以下のPOWERではダンクが成功する
  BLOCK_SUCCESS_POWER_THRESHOLD: 0,

  // 吹き飛ばし後の無力化時間（秒）
  KNOCKBACK_STUN_DURATION: 1.0,

  // 衝突判定を行うダンクモーションのタイミング（0.0〜1.0）
  // ジャンプ中〜叩きつけ直前まで
  COLLISION_START_RATIO: 0.2,
  COLLISION_END_RATIO: 0.6,
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
 * ディフェンダー設定
 */
export interface DefenderConfig {
  enabled: boolean;               // ディフェンダーを配置するか
  position: 'goal_front' | 'shooter_front';  // 配置位置（ゴール前 or シューター前）
  blockTiming: 'on_shot' | 'on_release';     // ブロックタイミング（シュート開始時 or ボールリリース時）
  distanceFromGoal?: number;      // ゴールからの距離（m）- goal_front時のみ
  distanceFromShooter?: number;   // シューターからの距離（m）- shooter_front時のみ
}

/**
 * シュートチェックの設定
 */
export interface ShootCheckConfig {
  shotsPerCell: number;           // 1升目あたりのシュート数
  targetGoal: 'goal1' | 'goal2';  // 攻めるゴール
  shotTypeFilter?: ShotTypeFilter; // シュートタイプフィルター（デフォルト: 'all'）
  defender?: DefenderConfig;      // ディフェンダー設定（オプション）
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
