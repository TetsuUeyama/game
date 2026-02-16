/**
 * モーション関連の設定を一元管理するファイル
 * キーフレームアニメーションのブレンド・再生に関する定数を提供
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
