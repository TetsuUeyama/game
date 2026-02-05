/**
 * リスク判定設定
 */
export const RISK_ASSESSMENT_CONFIG = {
  // パスインターセプト設定
  PASS: {
    BASE_REACTION_TIME: 0.3,      // 基本反応時間（秒）
    INTERCEPT_RADIUS: 1.0,        // インターセプト可能半径（m）
    BASE_DEFENDER_SPEED: 5.0,     // 基本移動速度（m/s）
    BASE_PASS_SPEED: 10.0,        // 基本パス速度（m/s）
  },

  // シュートブロック設定
  SHOOT: {
    LAYUP_BLOCK_DISTANCE: 2.0,    // レイアップブロック可能距離（m）
    MIDRANGE_BLOCK_DISTANCE: 1.5, // ミドルレンジブロック可能距離（m）
    THREE_PT_BLOCK_DISTANCE: 1.2, // 3PTブロック可能距離（m）
    SHOOT_MOTION_TIME: 0.4,       // シュートモーション時間（秒）
    BASE_JUMP_HEIGHT: 0.5,        // 基本ジャンプ高さ（m）
    ARM_REACH_RATIO: 0.4,         // 腕の長さ（身長比）
  },

  // リスクレベル閾値
  THRESHOLDS: {
    SAFE: 0.3,
    CAUTION: 0.6,
    DANGER: 0.8,
  },

  // 移動予測設定
  PREDICTION: {
    STABILITY_WEIGHT: 1.0,        // 安定性の重み
    VELOCITY_DECAY: 0.9,          // 速度減衰率
  },
} as const;
