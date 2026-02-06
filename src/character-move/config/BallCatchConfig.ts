/**
 * ボールキャッチシステムの設定
 *
 * シナリオ別のデフォルトキャッチ設定を定義。
 * 各シナリオに応じた体距離、手距離、速度チェック、高さチェック、優先度を設定。
 */

import { CatchScenario, type CatchConfig } from "../types/BallCatchTypes";

/**
 * シナリオ別デフォルトキャッチ設定
 *
 * | シナリオ     | 体距離 | 手距離 | 速度チェック | 高さチェック | 優先度 |
 * |-------------|-------|-------|------------|------------|-------|
 * | PASS_TARGET | 1.5m  | 2.0m  | スキップ    | スキップ    | 10    |
 * | THROW_IN    | 3.0m  | 3.5m  | スキップ    | スキップ    | 9     |
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
  [CatchScenario.THROW_IN]: {
    scenario: CatchScenario.THROW_IN,
    bodyDistanceThreshold: 5.0,  // スローインは長距離で着地誤差が大きいため広めに
    handDistanceThreshold: 5.5,  // レシーバーが少し離れていても反応できるように
    skipVelocityCheck: true,
    skipHeightCheck: true,
    priority: 9,
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
    skipHeightCheck: false,
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

  /** 視野角（ラジアン）- スローイン時の視野内キャッチ判定 */
  FIELD_OF_VIEW_ANGLE: Math.PI / 2, // 90度

  /** 視野内キャッチの最大距離（m） */
  VIEW_CATCH_MAX_DISTANCE: 3.0,
} as const;

/**
 * ボール半径（CollisionConfigから参照）
 */
export const BALL_RADIUS = 0.15;

/**
 * ルーズボール保持条件設定
 */
export const LOOSE_BALL_PICKUP = {
  /** ボールが完全にサークル内にある場合の滞在時間（秒） */
  REQUIRED_DWELL_TIME_INSIDE: 0.3,

  /** ボールが一部サークルに触れている場合の滞在時間（秒） */
  REQUIRED_DWELL_TIME_TOUCHING: 1.0,

  /** 高さ判定の追加マージン（m）- 身長に加算 */
  HEIGHT_MARGIN: 0.5,

  /** 即時保持判定の相手チームプレイヤー不在距離（m） */
  NO_OPPONENT_RADIUS: 1.0,
} as const;
