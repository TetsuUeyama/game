/**
 * シュート軌道可視化の設定
 */

/**
 * シュートタイプ
 */
export type ShootType = '3pt' | 'midrange' | 'layup' | 'dunk' | 'out_of_range';

/**
 * シュートタイプごとの設定
 */
export interface ShootTypeConfig {
  /** 表示色 (RGB 0-1) */
  color: { r: number; g: number; b: number };
  /** 最小距離 (m) */
  minDistance: number;
  /** 最大距離 (m) */
  maxDistance: number;
  /** アーク高さ (m) */
  arcHeight: number;
  /** 日本語名 */
  label: string;
}

/**
 * シュートタイプ別設定
 */
export const SHOOT_TYPE_CONFIGS: Record<Exclude<ShootType, 'out_of_range'>, ShootTypeConfig> = {
  '3pt': {
    color: { r: 0.8, g: 0.2, b: 0.8 },  // 紫
    minDistance: 6.75,
    maxDistance: 10.0,
    arcHeight: 2.4,
    label: '3ポイント',
  },
  'midrange': {
    color: { r: 1.0, g: 0.5, b: 0.0 },  // オレンジ
    minDistance: 2.0,
    maxDistance: 6.75,
    arcHeight: 1.5,
    label: 'ミドルレンジ',
  },
  'layup': {
    color: { r: 0.2, g: 0.8, b: 0.2 },  // 緑
    minDistance: 0.5,
    maxDistance: 2.0,
    arcHeight: 0.8,
    label: 'レイアップ',
  },
  'dunk': {
    color: { r: 1.0, g: 0.0, b: 0.0 },  // 赤
    minDistance: 0.0,
    maxDistance: 1.5,
    arcHeight: 0.3,
    label: 'ダンク',
  },
};

/**
 * 成功率に基づく色（ブレンド用）
 */
export const SUCCESS_RATE_COLORS = {
  HIGH: { r: 0.0, g: 1.0, b: 0.0 },     // 80%以上：緑
  MEDIUM: { r: 1.0, g: 1.0, b: 0.0 },   // 50-80%：黄
  LOW: { r: 1.0, g: 0.5, b: 0.0 },      // 30-50%：オレンジ
  VERY_LOW: { r: 1.0, g: 0.0, b: 0.0 }, // 30%未満：赤
} as const;

/**
 * 成功率から色を取得
 */
export function getSuccessRateColor(successRate: number): { r: number; g: number; b: number } {
  if (successRate >= 80) return SUCCESS_RATE_COLORS.HIGH;
  if (successRate >= 50) return SUCCESS_RATE_COLORS.MEDIUM;
  if (successRate >= 30) return SUCCESS_RATE_COLORS.LOW;
  return SUCCESS_RATE_COLORS.VERY_LOW;
}

/**
 * シュート軌道可視化の設定定数
 */
export const SHOOT_TRAJECTORY_CONFIG = {
  /** 軌道のセグメント数 */
  TRAJECTORY_SEGMENTS: 30,
  /** 軌道線のアルファ値 */
  TRAJECTORY_ALPHA: 0.9,
  /** ターゲットマーカーの半径 */
  TARGET_MARKER_RADIUS: 0.25,
  /** ターゲットマーカーのアルファ値 */
  TARGET_MARKER_ALPHA: 0.7,
  /** リムの高さ (m) */
  RIM_HEIGHT: 3.05,
  /** ボール半径 (m) */
  BALL_RADIUS: 0.12,
  /** シューターの手の高さオフセット (身長に対する比率) */
  HAND_HEIGHT_RATIO: 0.5,
  /** シュート開始位置のヘッドオフセット (m) */
  HEAD_OFFSET: 0.3,
} as const;
