/**
 * ボールキャッチシステムの設定
 *
 * シナリオ別のデフォルトキャッチ設定を定義。
 * 各シナリオに応じた体距離、手距離、速度チェック、高さチェック、優先度を設定。
 */

import { CatchScenario, type CatchConfig } from "@/GamePlay/GameSystem/BallCatchSystem/BallCatchTypes";

/**
 * シナリオ別デフォルトキャッチ設定
 *
 * | シナリオ     | 体距離 | 手距離 | 速度チェック | 高さチェック | 優先度 |
 * |-------------|-------|-------|------------|------------|-------|
 * | PASS_TARGET | 1.5m  | 2.0m  | スキップ    | スキップ    | 10    |
 * | INTERCEPTOR | 3.0m  | 3.0m  | スキップ    | あり       | 8     |
 * | JUMP_BALL   | 1.0m  | 1.5m  | あり        | あり       | 5     |
 * | REBOUND     | 1.0m  | 1.5m  | あり        | あり       | 5     |
 * | LOOSE_BALL  | 0.6m  | 0.5m  | あり        | あり       | 1     |
 */
export const CATCH_SCENARIO_CONFIGS: Record<CatchScenario, CatchConfig> = {
  [CatchScenario.PASS_TARGET]: {
    scenario: CatchScenario.PASS_TARGET,
    bodyDistanceThreshold: 1.5,
    handDistanceThreshold: 2.0,
    skipVelocityCheck: true,
    skipHeightCheck: true,
    priority: 10,
  },
  [CatchScenario.INTERCEPTOR]: {
    scenario: CatchScenario.INTERCEPTOR,
    bodyDistanceThreshold: 3.0,
    handDistanceThreshold: 3.0,
    skipVelocityCheck: true,
    skipHeightCheck: false,
    priority: 8,
  },
  [CatchScenario.JUMP_BALL]: {
    scenario: CatchScenario.JUMP_BALL,
    bodyDistanceThreshold: 1.0,
    handDistanceThreshold: 1.5,
    skipVelocityCheck: false,
    skipHeightCheck: false,
    priority: 5,
  },
  [CatchScenario.REBOUND]: {
    scenario: CatchScenario.REBOUND,
    bodyDistanceThreshold: 1.0,
    handDistanceThreshold: 1.5,
    skipVelocityCheck: false,
    skipHeightCheck: true,     // ジャンプ中は手距離チェックで十分
    priority: 5,
  },
  [CatchScenario.LOOSE_BALL]: {
    scenario: CatchScenario.LOOSE_BALL,
    bodyDistanceThreshold: 0.6,
    handDistanceThreshold: 0.5,
    skipVelocityCheck: false,
    skipHeightCheck: false,
    priority: 1,
  },
};

/**
 * キャッチ物理設定
 */
export const BALL_CATCH_PHYSICS = {
  /** 制御可能な最大相対速度（m/s）- これより速いとファンブル */
  MAX_CONTROLLABLE_VELOCITY: 15.0,

  /** 低速ボールと判定する閾値（m/s）- この速度以下なら体が近いだけでキャッチ可能 */
  SLOW_ROLLING_THRESHOLD: 5.0,

  /** 足元のボール判定閾値（身長比） */
  FEET_HEIGHT_RATIO: 0.25,

  /** 足元の高速ボール閾値（m/s）- これ以上ならファンブル */
  FEET_FAST_BALL_THRESHOLD: 10.0,

  /** キャッチ判定の最小高さ（身長比） */
  MIN_CATCH_HEIGHT_RATIO: 0.0,

  /** キャッチ判定の最大高さ（身長比） */
  MAX_CATCH_HEIGHT_RATIO: 1.3,

  /** 引き寄せインパルスの強さ（N・s） */
  PULL_IMPULSE_STRENGTH: 0.5,

  /** ファンブル時のインパルスの強さ（N・s） */
  FUMBLE_IMPULSE_STRENGTH: 3.0,

  /** 体に近い判定の追加オフセット（m） */
  NEAR_BODY_OFFSET: 0.4,

  /** リーチ範囲（m）- 手を伸ばせる最大距離 */
  REACH_RANGE: 1.5,

  /** キャプチャ距離（m）- この距離以下で完全にキャッチ */
  CAPTURE_DISTANCE: 0.5,

  /** 視野角（ラジアン）- 視野内キャッチ判定 */
  FIELD_OF_VIEW_ANGLE: Math.PI / 2, // 90度

  /** 視野内キャッチの最大距離（m） */
  VIEW_CATCH_MAX_DISTANCE: 3.0,
} as const;

/**
 * ボール半径（CollisionConfigから参照）
 */
export const BALL_RADIUS = 0.15;


/**
 * 手のひらキャッチ設定
 * 手の物理球がボールに触れた瞬間にキャッチ判定を行う
 */
export const PALM_CATCH = {
  /** 接触判定距離（m）= 手の物理球半径(0.08) + ボール半径(0.12) + バッファ(0.05) */
  CONTACT_DISTANCE: 0.25,

  // === 片手キャッチ衝撃吸収判定 ===
  /** 基準吸収可能速度 (m/s) — 能力値補正前のベース閾値 */
  BASE_ABSORPTION_SPEED: 8.0,
  /** power による吸収閾値ボーナス係数 (power 1あたり m/s) */
  POWER_COEFFICIENT: 0.04,
  /** technique による吸収閾値ボーナス係数 */
  TECHNIQUE_COEFFICIENT: 0.03,
  /** 最大吸収可能速度 (m/s) — 上限キャップ */
  MAX_ABSORPTION_SPEED: 14.0,
} as const;
