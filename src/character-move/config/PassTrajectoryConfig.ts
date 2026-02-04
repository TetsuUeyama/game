/**
 * パス軌道可視化システムの設定
 */

import { normalizeAngle } from "../utils/CollisionUtils";

/**
 * パスタイプ（5種類）
 */
export enum PassType {
  CHEST = 'chest',        // チェストパス（緑）
  BOUNCE = 'bounce',      // バウンスパス（シアン）
  LOB = 'lob',            // ロブパス（黄）
  LONG = 'long',          // ロングパス（オレンジ）
  ONE_HAND = 'one_hand'   // ワンハンドパス（マゼンタ）
}

/**
 * パスタイプごとの設定
 */
export interface PassTypeConfig {
  /** 軌道表示色 (RGB 0-1) */
  color: { r: number; g: number; b: number };
  /** アーチ高さ（直線からの最大高さ、メートル） */
  arcHeight: number;
  /** 速度倍率（基本速度に対する倍率） */
  speedMultiplier: number;
  /** 最大距離（m） */
  maxDistance: number;
  /** 最小距離（m） */
  minDistance: number;
  /** バウンスポイント（0-1、バウンスパス用） */
  bouncePoint?: number;
  /** 利き腕必須かどうか */
  requiresDominantHand: boolean;
}

/**
 * 各パスタイプの設定
 */
export const PASS_TYPE_CONFIGS: Record<PassType, PassTypeConfig> = {
  [PassType.CHEST]: {
    color: { r: 0, g: 1, b: 0 },       // 緑
    arcHeight: 0.3,
    speedMultiplier: 1.0,
    maxDistance: 10.0,
    minDistance: 2.0,
    requiresDominantHand: false,
  },
  [PassType.BOUNCE]: {
    color: { r: 0, g: 1, b: 1 },       // シアン
    arcHeight: 0.2,
    speedMultiplier: 0.8,
    maxDistance: 8.0,
    minDistance: 2.0,
    bouncePoint: 0.5,                   // 中間点でバウンス
    requiresDominantHand: false,
  },
  [PassType.LOB]: {
    color: { r: 1, g: 1, b: 0 },       // 黄
    arcHeight: 2.0,
    speedMultiplier: 0.7,
    maxDistance: 12.0,
    minDistance: 5.0,
    requiresDominantHand: false,
  },
  [PassType.LONG]: {
    color: { r: 1, g: 0.5, b: 0 },     // オレンジ
    arcHeight: 1.5,
    speedMultiplier: 1.3,
    maxDistance: 15.0,
    minDistance: 8.0,
    requiresDominantHand: true,
  },
  [PassType.ONE_HAND]: {
    color: { r: 1, g: 0, b: 1 },       // マゼンタ
    arcHeight: 0.5,
    speedMultiplier: 1.2,
    maxDistance: 10.0,
    minDistance: 2.0,
    requiresDominantHand: true,
  },
};

/**
 * インターセプト危険度レベル
 */
export enum InterceptionRiskLevel {
  SAFE = 'safe',            // 0-30%（緑）
  CAUTION = 'caution',      // 30-60%（黄）
  DANGER = 'danger',        // 60-80%（オレンジ）
  HIGH_DANGER = 'high_danger' // 80%+（赤）
}

/**
 * インターセプト危険度レベルの閾値
 */
export const INTERCEPTION_THRESHOLDS = {
  SAFE_MAX: 0.3,
  CAUTION_MAX: 0.6,
  DANGER_MAX: 0.8,
} as const;

/**
 * インターセプト危険度レベルの色
 */
export const INTERCEPTION_RISK_COLORS: Record<InterceptionRiskLevel, { r: number; g: number; b: number }> = {
  [InterceptionRiskLevel.SAFE]: { r: 0, g: 1, b: 0 },        // 緑
  [InterceptionRiskLevel.CAUTION]: { r: 1, g: 1, b: 0 },     // 黄
  [InterceptionRiskLevel.DANGER]: { r: 1, g: 0.5, b: 0 },    // オレンジ
  [InterceptionRiskLevel.HIGH_DANGER]: { r: 1, g: 0, b: 0 }, // 赤
};

/**
 * 危険度レベルを判定
 */
export function getInterceptionRiskLevel(probability: number): InterceptionRiskLevel {
  if (probability < INTERCEPTION_THRESHOLDS.SAFE_MAX) {
    return InterceptionRiskLevel.SAFE;
  } else if (probability < INTERCEPTION_THRESHOLDS.CAUTION_MAX) {
    return InterceptionRiskLevel.CAUTION;
  } else if (probability < INTERCEPTION_THRESHOLDS.DANGER_MAX) {
    return InterceptionRiskLevel.DANGER;
  } else {
    return InterceptionRiskLevel.HIGH_DANGER;
  }
}

/**
 * インターセプト計算用の定数
 */
export const INTERCEPTION_CONFIG = {
  /** ディフェンダーの基本反応時間（秒） */
  BASE_REACTION_TIME: 0.3,
  /** インターセプト可能半径（m） */
  INTERCEPT_RADIUS: 1.0,
  /** ディフェンダーの基本移動速度（m/s） */
  BASE_DEFENDER_SPEED: 5.0,
  /** パスの基本速度（m/s） */
  BASE_PASS_SPEED: 10.0,
} as const;

/**
 * ターゲット予測に必要なpassaccuracy閾値
 */
export const DESTINATION_PREDICTION_THRESHOLD = {
  /** この値以上ならターゲットの移動先を予測 */
  MIN_PASSACCURACY: 70,
} as const;

/**
 * パス方向制限の設定
 * パサーの向いている方向を基準に、パス可能な角度範囲を定義
 */
export const PASS_DIRECTION_CONFIG = {
  /** パス可能な角度範囲（度）- パサーの向きから左右にこの角度まで許容 */
  MAX_ANGLE_FROM_FACING: 100,
} as const;

/**
 * パス方向が許容範囲内かどうかを判定
 * @param passerRotation パサーの向き（ラジアン、Y軸回転）
 * @param passerX パサーのX座標
 * @param passerZ パサーのZ座標
 * @param targetX ターゲットのX座標
 * @param targetZ ターゲットのZ座標
 * @returns パス可能な方向であればtrue
 */
export function isPassDirectionValid(
  passerRotation: number,
  passerX: number,
  passerZ: number,
  targetX: number,
  targetZ: number
): boolean {
  // パサーからターゲットへの方向を計算
  const dx = targetX - passerX;
  const dz = targetZ - passerZ;

  // 距離が非常に近い場合は許可
  const distance = Math.sqrt(dx * dx + dz * dz);
  if (distance < 0.5) {
    return true;
  }

  // ターゲットへの角度を計算（atan2は-πからπを返す）
  const angleToTarget = Math.atan2(dx, dz);

  // パサーの向きとターゲット方向の角度差を計算（-πからπの範囲に正規化）
  const angleDiff = normalizeAngle(angleToTarget - passerRotation);

  // 角度差の絶対値を度に変換
  const angleDiffDegrees = Math.abs(angleDiff) * (180 / Math.PI);

  // 許容範囲内かどうかをチェック
  return angleDiffDegrees <= PASS_DIRECTION_CONFIG.MAX_ANGLE_FROM_FACING;
}
