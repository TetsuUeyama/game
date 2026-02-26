/**
 * ObstacleDefenseConfig — 障害物（守備側）のロール設定テーブル
 *
 * 全5障害物をMAN_MARKERに統一。各自に1人のマーク対象を割り当て。
 * マーク対象がオンボールになった際はBALL_MARKER的挙動（パスコース遮断スタンス）に自動切替。
 */

import { S } from "./FieldConfig";

/** 障害物（守備側）の行動設定 */
export interface ObstacleRoleConfig {
  /** マーク対象 entityIdx (0=launcher, 1-4=targets) */
  markTargetEntityIdx: number;
  /** スキャン有効 (false = 常にマーク対象を注視、スキャンスキップ) */
  scanEnabled: boolean;
  /** スキャン監視ターゲット targets[n] (scanEnabled=trueの場合のみ使用) */
  scanWatchTargetIdx: number;
  /** ボールリアクション可能 (false = パスに対してインターセプトしない) */
  reactive: boolean;
  /** アイドル速度 (m/s) */
  idleSpeed: number;
  /** インターセプト速度 (m/s) */
  interceptSpeed: number;
  /** ホバー半径 (m) */
  hoverRadius: number;
  /** リセット時にランダムウォーク復帰するか */
  restoreRandomOnReset: boolean;
  /** スキャン初期値 */
  scanInitial: {
    atLauncher: boolean;
    timer: number;
    focusDist: number;
  };
}

const OB_CONFIGS: readonly ObstacleRoleConfig[] = [
  // OB A: マンマーカー — launcher (PG)
  {
    markTargetEntityIdx: 0,
    scanEnabled: true,
    scanWatchTargetIdx: 0,
    reactive: true,
    idleSpeed: 80 * S,         // 1.20 (= TARGET_RANDOM_SPEED)
    interceptSpeed: 180 * S,   // 2.70 (= TARGET_INTERCEPT_SPEED)
    hoverRadius: 60 * S,       // 0.90
    restoreRandomOnReset: true,
    scanInitial: { atLauncher: true, timer: 2.0, focusDist: 4.5 },
  },
  // OB B: マンマーカー — targets[1] (SF/SLASHER)
  {
    markTargetEntityIdx: 2,
    scanEnabled: true,
    scanWatchTargetIdx: 1,
    reactive: true,
    idleSpeed: 80 * S,        // 1.20 (= TARGET_RANDOM_SPEED)
    interceptSpeed: 180 * S,  // 2.70 (= TARGET_INTERCEPT_SPEED)
    hoverRadius: 50 * S,      // 0.75
    restoreRandomOnReset: true,
    scanInitial: { atLauncher: true, timer: 1.5, focusDist: 2.25 },
  },
  // OB C: マンマーカー — targets[0] (SG/SECOND_HANDLER)
  {
    markTargetEntityIdx: 1,
    scanEnabled: true,
    scanWatchTargetIdx: 0,
    reactive: true,
    idleSpeed: 80 * S,        // 1.20 (= TARGET_RANDOM_SPEED)
    interceptSpeed: 180 * S,  // 2.70 (= TARGET_INTERCEPT_SPEED)
    hoverRadius: 50 * S,      // 0.75
    restoreRandomOnReset: true,
    scanInitial: { atLauncher: false, timer: 1.0, focusDist: 3.0 },
  },
  // OB D: マンマーカー — targets[3] (PF/DUNKER)
  {
    markTargetEntityIdx: 4,
    scanEnabled: true,
    scanWatchTargetIdx: 3,
    reactive: true,
    idleSpeed: 80 * S,        // 1.20 (= TARGET_RANDOM_SPEED)
    interceptSpeed: 180 * S,  // 2.70 (= TARGET_INTERCEPT_SPEED)
    hoverRadius: 55 * S,      // 0.825
    restoreRandomOnReset: true,
    scanInitial: { atLauncher: false, timer: 1.8, focusDist: 3.75 },
  },
  // OB E: マンマーカー — targets[2] (C/SCREENER)
  {
    markTargetEntityIdx: 3,
    scanEnabled: true,
    scanWatchTargetIdx: 2,
    reactive: true,
    idleSpeed: 80 * S,        // 1.20 (= TARGET_RANDOM_SPEED)
    interceptSpeed: 180 * S,  // 2.70 (= TARGET_INTERCEPT_SPEED)
    hoverRadius: 60 * S,      // 0.90
    restoreRandomOnReset: true,
    scanInitial: { atLauncher: true, timer: 1.2, focusDist: 3.0 },
  },
];

/** 障害物の総数 */
export const OBSTACLE_COUNT = OB_CONFIGS.length;

export { OB_CONFIGS };
