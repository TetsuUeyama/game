/**
 * 1on1バトル関連の設定を一元管理するファイル
 * OneOnOneBattleController用の定数と型定義を提供
 */

/**
 * 1on1バトルの結果
 */
export interface OneOnOneResult {
  winner: 'offense' | 'defense';
  offenseDice: number;
  defenseDice: number;
}

/**
 * 1on1バトル設定
 * 注：タイミング設定は DefenseConfig.ONE_ON_ONE_BATTLE を参照
 */
export const ONE_ON_ONE_BATTLE_CONFIG = {
  // サークル接触判定の余裕（m）
  CONTACT_MARGIN: 0.1,

  // ゴール方向（チーム別）
  ALLY_ATTACK_GOAL_Z: 25,
  ENEMY_ATTACK_GOAL_Z: -25,
  ALLY_DEFEND_GOAL_Z: -25,
  ENEMY_DEFEND_GOAL_Z: 25,

  // サイコロの面数
  DICE_SIDES: 6,

  // ドリブル突破のランダム選択確率（左右）
  BREAKTHROUGH_LEFT_CHANCE: 0.5,
} as const;

/**
 * 位置取り設定
 */
export const POSITIONING_CONFIG = {
  // 目標位置への接近閾値（m）
  TARGET_THRESHOLD: 0.05,

  // ディフェンダーの停止距離（m）
  DEFENDER_STOP_DISTANCE: 0.05,
} as const;
