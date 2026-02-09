/**
 * ゲーム全体で使用する定数を統合管理
 *
 * IMPROVEMENT_PLAN.md: フェーズ2 - マジックナンバーの設定化
 *
 * 目的:
 * - 複数ファイルに散在するハードコード値を一元管理
 * - 調整・チューニングを容易に
 * - コードの可読性向上
 */

/**
 * 移動関連の定数
 */
export const MOVEMENT_CONSTANTS = {
  // 移動判定しきい値
  DASH_DISTANCE_THRESHOLD: 5.0,      // ダッシュ開始距離 (m)
  RUN_DISTANCE_THRESHOLD: 2.0,       // 走り開始距離 (m)
  WALK_DISTANCE_THRESHOLD: 0.5,      // 歩き開始距離 (m)
  STOP_DISTANCE_THRESHOLD: 0.3,      // 停止距離 (m)

  // 移動速度倍率
  SLOW_MOVEMENT_SCALE: 0.5,          // 低速移動時の速度倍率
} as const;

/**
 * 衝突関連の定数
 */
export const COLLISION_CONSTANTS = {
  // 衝突判定
  DEFLECTION_Y_OFFSET: 0.3,          // 弾き方向のY軸オフセット
  CHARACTER_PUSH_FORCE: 2.0,         // キャラクター押し出し力
  BALL_DEFLECTION_FORCE: 5.0,        // ボール弾き力

  // 衝突判定距離
  NEAR_BODY_OFFSET: 0.2,             // 体に近いと判定する追加距離
  NEAR_BODY_OFFSET_PASS_TARGET: 0.1, // パスターゲット時の追加距離
} as const;

/**
 * インターセプト確率計算の定数
 */
export const INTERCEPTION_CONSTANTS = {
  // 時間差しきい値
  TIME_DIFF_HIGH_THRESHOLD: -0.3,    // 高確率しきい値
  TIME_DIFF_MED_THRESHOLD: 0.2,      // 中確率しきい値
  TIME_DIFF_LOW_THRESHOLD: 0.5,      // 低確率しきい値

  // 確率値
  PROBABILITY_HIGH: 0.9,             // 高確率
  PROBABILITY_MED: 0.3,              // 中確率
  PROBABILITY_LOW: 0.1,              // 低確率

  // 確率計算係数
  HIGH_PROBABILITY_BONUS: 0.1,       // 高確率時のボーナス上限
  HIGH_PROBABILITY_FACTOR: 0.1,      // 高確率時の係数
  MED_PROBABILITY_FACTOR: 1.5,       // 中確率時の係数
  LOW_PROBABILITY_FACTOR: 0.67,      // 低確率時の係数
} as const;

/**
 * AI判定関連の定数
 */
export const AI_CONSTANTS = {
  // ルーズボール
  LOOSE_BALL_CHASE_RADIUS: 10.0,     // ルーズボール追跡半径 (m)

  // 判定ディレイ
  PASS_DECISION_DELAY: 0.5,          // パス判定ディレイ (秒)
  SHOOT_DECISION_DELAY: 0.3,         // シュート判定ディレイ (秒)

  // リバウンド
  REBOUND_NEAR_GOAL_DISTANCE: 5.0,   // ゴール近くと判定する距離 (m)
  REBOUND_POSITION_THRESHOLD: 1.0,   // リバウンドポジション到着判定 (m)

  // 代替方向探索
  ALTERNATIVE_DIRECTION_ANGLES: [45, -45, 90, -90, 135, -135], // 試す角度 (度)
} as const;

/**
 * ボール関連の定数
 */
export const BALL_CONSTANTS = {
  // クールダウン時間
  SHOOTER_COOLDOWN_TIME: 3.0,        // シュータークールダウン (秒)
  PASSER_COOLDOWN_TIME: 0.5,         // パス送信者クールダウン (秒)
  DEFLECTION_COOLDOWN_TIME: 0.3,     // 弾き後クールダウン (秒)
  BLOCK_COOLDOWN_TIME: 0.8,          // ブロック後クールダウン (秒)

  // 速度しきい値
  MIN_BOUNCE_VELOCITY: 0.5,          // 最小バウンド速度
  STOP_VELOCITY_THRESHOLD: 0.3,      // 停止判定速度
  SLOW_ROLLING_THRESHOLD: 3.0,       // 低速転がり判定速度
} as const;

/**
 * パス関連の定数
 */
export const PASS_CONSTANTS = {
  // アーチ高さ
  CHEST_PASS_MIN_ARC: 0.3,           // チェストパス最小アーチ高さ (m)
  CHEST_PASS_MAX_ARC: 1.0,           // チェストパス最大アーチ高さ (m)
  CHEST_PASS_ARC_FACTOR: 0.1,        // チェストパスアーチ係数

  BOUNCE_PASS_ARC: 0.3,              // バウンドパスアーチ高さ (m)
  BOUNCE_PASS_MID_RATIO: 0.5,        // バウンド位置（中間点）

  OVERHEAD_PASS_MIN_ARC: 0.8,        // オーバーヘッド最小アーチ (m)
  OVERHEAD_PASS_MAX_ARC: 1.5,        // オーバーヘッド最大アーチ (m)
  OVERHEAD_PASS_ARC_FACTOR: 0.15,    // オーバーヘッドアーチ係数

  // バウンド後
  POST_BOUNCE_ARC_FACTOR: 0.08,      // バウンド後アーチ係数
  POST_BOUNCE_MIN_ARC: 0.3,          // バウンド後最小アーチ (m)
} as const;

/**
 * シュート関連の定数
 */
export const SHOOT_CONSTANTS = {
  // バックスピン
  BACKSPIN_MIN_STRENGTH: 5,          // 最小バックスピン (rad/s)
  BACKSPIN_MAX_STRENGTH: 25,         // 最大バックスピン (rad/s)
  BACKSPIN_RANGE: 20,                // バックスピン範囲 (25-5)

  // デフォルト発射角度
  DEFAULT_LAUNCH_ANGLE_DEG: 55,      // デフォルト発射角度 (度)
} as const;

/**
 * キャラクター物理の定数
 */
export const CHARACTER_PHYSICS_CONSTANTS = {
  // 胸の高さ計算
  CHEST_HEIGHT_RATIO: 0.15,          // 身長に対する胸の高さオフセット比率

  // キャッチ高さ
  MIN_CATCH_HEIGHT_RATIO_OFFSET: 0.1, // パスターゲット時のキャッチ高さ下限緩和
  MAX_CATCH_HEIGHT_RATIO_OFFSET: 0.1, // パスターゲット時のキャッチ高さ上限緩和
} as const;

/**
 * 全定数をまとめたオブジェクト
 */
export const GAME_CONSTANTS = {
  MOVEMENT: MOVEMENT_CONSTANTS,
  COLLISION: COLLISION_CONSTANTS,
  INTERCEPTION: INTERCEPTION_CONSTANTS,
  AI: AI_CONSTANTS,
  BALL: BALL_CONSTANTS,
  PASS: PASS_CONSTANTS,
  SHOOT: SHOOT_CONSTANTS,
  CHARACTER_PHYSICS: CHARACTER_PHYSICS_CONSTANTS,
} as const;
