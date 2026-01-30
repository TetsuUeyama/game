/**
 * 重心システムの設定値
 */

import { Vector3 } from "@babylonjs/core";

/**
 * 基本物理パラメータ
 */
export const BALANCE_PHYSICS = {
  /** 重力加速度 */
  GRAVITY: 9.8,
  /** 基準となる体重（kg） */
  BASE_WEIGHT: 80,
  /** 基準となる身長（m） */
  BASE_HEIGHT: 1.9,
} as const;

/**
 * 重心球パラメータ
 */
export const BALANCE_SPHERE = {
  /** 重心球の基本半径（m） */
  BASE_RADIUS: 0.15,
  /** 体重による半径スケール（重い選手ほど大きい） */
  WEIGHT_RADIUS_SCALE: 0.001,
  /** 股関節の高さ係数（身長に対する比率） */
  HIP_HEIGHT_RATIO: 0.52,
} as const;

/**
 * 復元力（バネ）パラメータ
 */
export const BALANCE_SPRING = {
  /** 基本バネ定数（軽い選手ほど強い = 素早く戻れる） */
  BASE_CONSTANT: 50,
  /** 体重によるバネ定数減衰（重い選手ほどバネが弱い） */
  WEIGHT_REDUCTION: 0.3,
  /** 身長による不安定性係数（高い選手ほどバネが弱い） */
  HEIGHT_INSTABILITY: 0.15,
} as const;

/**
 * 減衰（摩擦）パラメータ
 */
export const BALANCE_DAMPING = {
  /** 基本減衰係数 */
  BASE_VALUE: 8,
  /** 体重による減衰減少（重い選手は止まりにくい） */
  WEIGHT_REDUCTION: 0.02,
} as const;

/**
 * 遷移閾値
 */
export const BALANCE_THRESHOLD = {
  /** 遷移可能な重心オフセット距離（m） */
  TRANSITION: 0.05,
  /** 完全にニュートラルとみなす距離（m） */
  NEUTRAL: 0.01,
  /** 遷移可能な重心速度（m/s） */
  VELOCITY: 0.1,
} as const;

/**
 * 衝突パラメータ
 */
export const BALANCE_COLLISION = {
  /** 衝突時の反発係数 */
  RESTITUTION: 0.6,
  /** 衝突時の摩擦係数 */
  FRICTION: 0.3,
  /** 高さ差による押さえ込みボーナス（高い方が有利） */
  HEIGHT_ADVANTAGE: 0.3,
  /** 衝突判定を行う距離（最適化用） */
  CHECK_DISTANCE: 2.0,
  /** ボディコンタクト判定距離 */
  BODY_CONTACT_DISTANCE: 0.6,
  /** 吹き飛ばし判定の閾値 */
  KNOCKBACK_THRESHOLD: 8.0,
  /** バランス崩し判定の閾値 */
  DESTABILIZE_THRESHOLD: 5.0,
} as const;

/**
 * 移動可能範囲
 */
export const BALANCE_LIMITS = {
  /** 重心の最大水平オフセット（m） */
  MAX_HORIZONTAL: 0.4,
  /** 重心の最大垂直オフセット（m） */
  MAX_VERTICAL: 0.2,
  /** 体重の最小値（kg） */
  MIN_WEIGHT: 50,
  /** 体重の最大値（kg） */
  MAX_WEIGHT: 150,
  /** 身長の最小値（m） */
  MIN_HEIGHT: 1.6,
  /** 身長の最大値（m） */
  MAX_HEIGHT: 2.3,
} as const;

/**
 * アクションによる力の設定
 */
export interface ActionForceConfig {
  /** 力のベクトル */
  force: Vector3;
  /** 力を加える時間（秒） */
  duration: number;
  /** ロックするか（空中など） */
  lock?: boolean;
}

/**
 * 汎用アクションの力設定
 */
export const ACTION_FORCES: Record<string, ActionForceConfig> = {
  // === 移動系 ===
  'run_forward': { force: new Vector3(0, 0, 15), duration: 0.1 },
  'run_backward': { force: new Vector3(0, 0, -12), duration: 0.1 },
  'run_left': { force: new Vector3(-12, 0, 0), duration: 0.1 },
  'run_right': { force: new Vector3(12, 0, 0), duration: 0.1 },
  'sprint': { force: new Vector3(0, 0, 25), duration: 0.1 },
  'stop_sudden': { force: new Vector3(0, 0, -30), duration: 0.15 },

  // === 方向転換（切り返し） ===
  'cut_left': { force: new Vector3(-35, 0, 0), duration: 0.12 },
  'cut_right': { force: new Vector3(35, 0, 0), duration: 0.12 },

  // === ジャンプ系 ===
  'jump': { force: new Vector3(0, 20, 5), duration: 0.1, lock: true },
  'jump_shot': { force: new Vector3(0, 15, 8), duration: 0.1, lock: true },
  'block_jump': { force: new Vector3(0, 25, 10), duration: 0.1, lock: true },
  'rebound_jump': { force: new Vector3(0, 22, 5), duration: 0.1, lock: true },

  // === ドリブルムーブ ===
  'crossover': { force: new Vector3(20, 0, 5), duration: 0.15 },
  'behind_back': { force: new Vector3(-15, 0, 8), duration: 0.2 },
  'spin_move': { force: new Vector3(10, 0, 15), duration: 0.25 },
  'hesitation': { force: new Vector3(0, 0, -10), duration: 0.1 },

  // === シュート系 ===
  'shoot_standing': { force: new Vector3(0, 5, 3), duration: 0.2 },
  'layup': { force: new Vector3(0, 18, 20), duration: 0.15, lock: true },
  'dunk': { force: new Vector3(0, 20, 25), duration: 0.15, lock: true },

  // === ディフェンス系 ===
  'defensive_slide_left': { force: new Vector3(-8, 0, 0), duration: 0.1 },
  'defensive_slide_right': { force: new Vector3(8, 0, 0), duration: 0.1 },
  'steal_attempt': { force: new Vector3(0, 0, 20), duration: 0.15 },
  'contest': { force: new Vector3(0, 10, 8), duration: 0.12 },

  // === 接触系 ===
  'push': { force: new Vector3(0, 0, 25), duration: 0.2 },
  'box_out': { force: new Vector3(0, -5, -15), duration: 0.3 },
  'post_up': { force: new Vector3(0, -8, -20), duration: 0.25 },
};

/**
 * ActionType別の重心力設定
 * recoveryTimeとcooldownTimeを置き換える
 * 力が大きい = 重心が大きくずれる = 回復に時間がかかる
 */
export const ACTION_TYPE_FORCES: Record<string, ActionForceConfig> = {
  // ==============================
  // オフェンスアクション
  // ==============================

  // 3ポイントシュート（大きなジャンプ、長い回復）
  'shoot_3pt': {
    force: new Vector3(0, 25, 8),
    duration: 0.15,
    lock: true,
  },

  // ミドルレンジシュート
  'shoot_midrange': {
    force: new Vector3(0, 20, 6),
    duration: 0.12,
    lock: true,
  },

  // レイアップ（前への勢い）
  'shoot_layup': {
    force: new Vector3(0, 18, 15),
    duration: 0.1,
    lock: true,
  },

  // チェストパス（軽いアクション）
  'pass_chest': {
    force: new Vector3(0, 0, 8),
    duration: 0.08,
  },

  // バウンスパス（少し重い）
  'pass_bounce': {
    force: new Vector3(0, -3, 10),
    duration: 0.1,
  },

  // オーバーヘッドパス（上への動き）
  'pass_overhead': {
    force: new Vector3(0, 8, 5),
    duration: 0.1,
  },

  // ドリブル突破（前への強い加速）
  'dribble_breakthrough': {
    force: new Vector3(0, 0, 35),
    duration: 0.2,
  },

  // ==============================
  // フェイントアクション
  // ==============================

  // シュートフェイント（軽い動き、素早く次へ）
  'shoot_feint': {
    force: new Vector3(0, 5, 2),
    duration: 0.08,
  },

  // ==============================
  // ディフェンスアクション
  // ==============================

  // シュートブロック（大きなジャンプ）
  'block_shot': {
    force: new Vector3(0, 28, 12),
    duration: 0.12,
    lock: true,
  },

  // スティール試行（前への突進、リスクあり）
  'steal_attempt': {
    force: new Vector3(0, 0, 25),
    duration: 0.15,
  },

  // パスカット姿勢（軽い構え）
  'pass_intercept': {
    force: new Vector3(0, 2, 5),
    duration: 0.08,
  },

  // ==============================
  // 移動アクション
  // ==============================

  // ディフェンス構え（低い姿勢、安定）
  'defense_stance': {
    force: new Vector3(0, -3, 0),
    duration: 0.05,
  },
};

/**
 * ポストプレイ・ボックスアウト用の係数
 */
export const CONTACT_PLAY = {
  /** ポストプレイ時の押し込みボーナス */
  POST_UP_BONUS: 1.5,
  /** ボックスアウト時の安定性ボーナス */
  BOX_OUT_BONUS: 1.3,
} as const;
