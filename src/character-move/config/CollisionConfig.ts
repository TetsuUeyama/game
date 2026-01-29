/**
 * 衝突判定関連の設定を一元管理するファイル
 * ボールとキャラクター、キャラクター同士の衝突判定に関する定数を提供
 */

import { CHARACTER_CONFIG } from "./gameConfig";

/**
 * ボール衝突設定
 */
export const BALL_COLLISION_CONFIG = {
  // ボールの半径（m）
  BALL_RADIUS: 0.15,

  // 弾き後の最低速度（m/s）
  DEFLECT_MIN_SPEED: 5.0,

  // 弾き時の速度保持率
  DEFLECT_SPEED_RETENTION: 0.7,

  // 弾き後のボール分離距離（m）
  DEFLECT_SEPARATION: 0.5,
} as const;

/**
 * キャラクター衝突設定
 */
export const CHARACTER_COLLISION_CONFIG = {
  // キャラクターの半径（m）- gameConfigから取得
  CHARACTER_RADIUS: CHARACTER_CONFIG.radius,

  // 衝突解決時の余裕マージン（m）
  COLLISION_MARGIN: 0.05,
} as const;

/**
 * 体パーツ衝突設定
 */
export const BODY_PART_CONFIG = {
  // 頭の半径（m）
  HEAD_RADIUS: 0.15,

  // 手を伸ばせる高さ（身長からの追加高さ）（m）
  HAND_REACH_HEIGHT: 0.3,

  // 胴体の半径（m）
  BODY_RADIUS: 0.25,

  // 胴体下端のオフセット（m）
  BODY_BOTTOM_OFFSET: 0.1,
} as const;

/**
 * ブロック判定設定
 */
export const BLOCK_CONFIG = {
  // 頭に当たった時の反発係数
  HEAD_BOUNCINESS: 0.6,

  // 胴体に当たった時の反発係数
  BODY_BOUNCINESS: 0.5,

  // 頭に当たった時の最低上方向速度（m/s）
  HEAD_MIN_UPWARD_VELOCITY: 1.0,

  // 胴体に当たった時の垂直方向減衰率
  BODY_VERTICAL_DAMPING: 0.8,

  // 手でブロック時のインパクト閾値（しっかり触れた判定）
  HAND_IMPACT_THRESHOLD: 0.3,

  // 手でブロック時の強インパクト閾値
  HAND_STRONG_IMPACT_THRESHOLD: 0.5,

  // 手でブロック成功時の最低弾き速度（m/s）
  HAND_DEFLECT_MIN_SPEED: 4.0,

  // 手でブロック成功時の速度保持率
  HAND_DEFLECT_SPEED_RETENTION: 0.5,

  // 手でブロック時の最低上方向速度（m/s）
  HAND_MIN_UPWARD_VELOCITY: 0.2,

  // 軽く触れた時の基本上方向速度（m/s）
  LIGHT_TOUCH_UPWARD_VELOCITY: 0.5,

  // 軽く触れた時の速度調整係数
  LIGHT_TOUCH_SPEED_FACTOR: 0.3,
} as const;

/**
 * 反射設定
 */
export const REFLECTION_CONFIG = {
  // 当たり位置による上下方向補正係数
  HIT_OFFSET_FACTOR: 0.4,

  // 最低上方向成分
  MIN_UPWARD_COMPONENT: 0.6,

  // 当たり位置補正係数（手）
  HAND_HIT_OFFSET_FACTOR: 0.5,
} as const;

/**
 * ブロック判定結果
 */
export interface BlockResult {
  blocked: boolean;
  blocker: import("../entities/Character").Character | null;
  deflected: boolean;  // 軽く触れて軌道がずれた場合
}
