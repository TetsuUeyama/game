/**
 * モーション関連の設定を一元管理するファイル
 * キーフレームアニメーションのブレンド・再生・移動速度に関する定数を提供
 */

/**
 * モーションブレンド設定
 */
export const MOTION_BLEND_CONFIG = {
  // デフォルトのブレンド時間（秒）
  DEFAULT_BLEND_DURATION: 0.3,

  // 短いブレンド時間（秒）- 素早い切り替え用
  SHORT_BLEND_DURATION: 0.1,

  // 長いブレンド時間（秒）- 滑らかな切り替え用
  LONG_BLEND_DURATION: 0.5,
} as const;

/**
 * モーション速度設定
 */
export const MOTION_SPEED_CONFIG = {
  // デフォルトの再生速度
  DEFAULT_SPEED: 1.0,

  // スロー再生速度
  SLOW_SPEED: 0.5,

  // 高速再生速度
  FAST_SPEED: 1.5,
} as const;

/**
 * モーション位置スケール設定
 */
export const MOTION_POSITION_CONFIG = {
  // デフォルトの位置スケール
  DEFAULT_POSITION_SCALE: 1.0,
} as const;

/**
 * 歩行速度倍率設定
 */
export const WALK_SPEED_MULTIPLIERS = {
  // 前進（基準）
  FORWARD: 1.0,

  // 後退
  BACKWARD: 0.5,

  // 左右移動
  SIDE: 0.8,

  // 斜め前進
  DIAGONAL_FORWARD: 0.9,

  // 斜め後退
  DIAGONAL_BACKWARD: 0.65,
} as const;

/**
 * ダッシュ速度倍率設定
 */
export const DASH_SPEED_MULTIPLIERS = {
  // 前進（基準）
  FORWARD: 1.0,

  // 後退
  BACKWARD: 0.4,

  // 左右
  SIDE: 0.7,
} as const;

/**
 * ジャンプ設定
 */
export const JUMP_CONFIG = {
  // 小ジャンプの押下時間閾値（秒）
  SMALL_JUMP_THRESHOLD: 0.05,

  // 中ジャンプの押下時間閾値（秒）
  MEDIUM_JUMP_THRESHOLD: 0.2,

  // 小ジャンプの高さスケール
  SMALL_JUMP_SCALE: 0.5,

  // 中ジャンプの高さスケール
  MEDIUM_JUMP_SCALE: 1.0,

  // 大ジャンプの高さスケール
  LARGE_JUMP_SCALE: 1.5,

  // しゃがみ込みモーションの最大時間（秒）
  MAX_CROUCH_TIME: 0.3,
} as const;

/**
 * ダッシュ設定
 */
export const DASH_CONFIG = {
  // 最大加速時間（秒）
  MAX_ACCELERATION_TIME: 1.0,

  // 基準速度（移動計算用の正規化値）
  BASE_SPEED_NORMALIZER: 5.0,
} as const;

/**
 * 着地設定
 */
export const LANDING_CONFIG = {
  // 小ジャンプ着地硬直時間（秒）
  SMALL_LANDING_DURATION: 0.1,

  // 中ジャンプ着地硬直時間（秒）
  MEDIUM_LANDING_DURATION: 0.3,

  // 大ジャンプ着地硬直時間（秒）
  LARGE_LANDING_DURATION: 0.3,

  // ダッシュ慣性があると判断する速度閾値（m/s）
  DASH_MOMENTUM_THRESHOLD: 0.5,
} as const;
