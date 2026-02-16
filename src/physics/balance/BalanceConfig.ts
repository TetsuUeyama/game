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
  BASE_RADIUS: 0.1,
  /** 体重による半径スケール（重い選手ほど大きい） */
  WEIGHT_RADIUS_SCALE: 0.0005,
  /** 股関節の高さ係数（身長に対する比率） */
  HIP_HEIGHT_RATIO: 0.52,
} as const;

/**
 * 復元力（バネ）パラメータ
 */
export const BALANCE_SPRING = {
  /** 基本バネ定数（軽い選手ほど強い = 素早く戻れる） */
  BASE_CONSTANT: 800,
  /** 体重によるバネ定数減衰（重い選手ほどバネが弱い） */
  WEIGHT_REDUCTION: 0.2,
  /** 身長による不安定性係数（高い選手ほどバネが弱い） */
  HEIGHT_INSTABILITY: 0.1,
} as const;

/**
 * 減衰（摩擦）パラメータ
 */
export const BALANCE_DAMPING = {
  /** 基本減衰係数 */
  BASE_VALUE: 60,
  /** 体重による減衰減少（重い選手は止まりにくい） */
  WEIGHT_REDUCTION: 0.02,
} as const;

/**
 * 遷移閾値
 */
export const BALANCE_THRESHOLD = {
  /** 遷移可能な重心オフセット距離（m）- 水平方向 */
  TRANSITION: 0.02,
  /** 遷移可能な重心オフセット距離（m）- 垂直方向 */
  TRANSITION_VERTICAL: 0.01,
  /** 完全にニュートラルとみなす距離（m） */
  NEUTRAL: 0.005,
  /** 遷移可能な重心速度（m/s）- 水平方向 */
  VELOCITY: 0.05,
  /** 遷移可能な重心速度（m/s）- 垂直方向 */
  VELOCITY_VERTICAL: 0.02,
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
  MAX_HORIZONTAL: 0.1,
  /** 重心の最大垂直オフセット（m） */
  MAX_VERTICAL: 0.05,
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
 *
 * forceのベクトル（単位: N、80kgの選手基準）:
 *   X: 左右（正=右、負=左）
 *   Y: 上下（正=上、負=下）
 *   Z: 前後（正=前、負=後）
 *
 * 目安: 800Nで約0.1m/sの速度変化（80kg選手、0.1秒適用時）
 */
export const ACTION_TYPE_FORCES: Record<string, ActionForceConfig> = {
  // ==============================
  // オフェンスアクション
  // ==============================

  // 3ポイントシュート（大きなジャンプ、後ろに少し反る）
  'shoot_3pt': {
    force: new Vector3(0, 2000, -400),
    duration: 0.15,
    lock: true,
  },

  // ミドルレンジシュート
  'shoot_midrange': {
    force: new Vector3(0, 1600, -300),
    duration: 0.12,
    lock: true,
  },

  // レイアップ（前への勢い、右利き想定で少し右へ）
  'shoot_layup': {
    force: new Vector3(400, 1500, 1200),
    duration: 0.1,
    lock: true,
  },

  // チェストパス（前に押し出す）
  'pass_chest': {
    force: new Vector3(0, -200, 1000),
    duration: 0.08,
  },

  // バウンスパス（下に押し込む）
  'pass_bounce': {
    force: new Vector3(0, -600, 800),
    duration: 0.1,
  },

  // オーバーヘッドパス（上に持ち上げて後ろに反る）
  'pass_overhead': {
    force: new Vector3(0, 1000, -400),
    duration: 0.1,
  },

  // ドリブル突破（前への強い加速、少し下に重心を落とす）
  'dribble_breakthrough': {
    force: new Vector3(0, -400, 2500),
    duration: 0.2,
  },

  // ==============================
  // フェイントアクション
  // ==============================

  // シュートフェイント（軽く上に、素早く次へ）
  'shoot_feint': {
    force: new Vector3(0, 600, 200),
    duration: 0.08,
  },

  // ==============================
  // ドリブルムーブ
  // ==============================

  // クロスオーバー（左から右へ大きく移動）
  'dribble_crossover': {
    force: new Vector3(2000, -300, 400),
    duration: 0.15,
  },

  // ビハインドザバック（後ろを通して逆側へ）
  'dribble_behind_back': {
    force: new Vector3(-1600, -200, -400),
    duration: 0.18,
  },

  // スピンムーブ（回転による遠心力）
  'dribble_spin': {
    force: new Vector3(1200, 0, 800),
    duration: 0.2,
  },

  // ヘジテーション（急停止で前のめり）
  'dribble_hesitation': {
    force: new Vector3(0, 300, -1200),
    duration: 0.1,
  },

  // ステップバック（後ろへ大きく下がる）
  'dribble_stepback': {
    force: new Vector3(0, 400, -2000),
    duration: 0.15,
  },

  // ==============================
  // ディフェンスアクション
  // ==============================

  // シュートブロック（大きなジャンプ、前へ飛び出す）
  'block_shot': {
    force: new Vector3(0, 2200, 1200),
    duration: 0.12,
    lock: true,
  },

  // スティール試行（前への突進、リスク大）
  'steal_attempt': {
    force: new Vector3(600, -400, 2400),
    duration: 0.15,
  },

  // パスカット姿勢（軽い構え）
  'pass_intercept': {
    force: new Vector3(0, 200, 400),
    duration: 0.08,
  },

  // ディフェンススライド左
  'defense_slide_left': {
    force: new Vector3(-1200, -200, 0),
    duration: 0.1,
  },

  // ディフェンススライド右
  'defense_slide_right': {
    force: new Vector3(1200, -200, 0),
    duration: 0.1,
  },

  // ==============================
  // 移動・姿勢アクション
  // ==============================

  // ディフェンス構え（低く安定）
  'defense_stance': {
    force: new Vector3(0, -400, 0),
    duration: 0.05,
  },

  // 急停止（前のめりになる）
  'sudden_stop': {
    force: new Vector3(0, 300, -1600),
    duration: 0.12,
  },

  // 方向転換左
  'cut_left': {
    force: new Vector3(-2400, 0, 400),
    duration: 0.12,
  },

  // 方向転換右
  'cut_right': {
    force: new Vector3(2400, 0, 400),
    duration: 0.12,
  },

  // ==============================
  // ジャンプボールアクション
  // ==============================

  // ジャンプボール（大きな垂直ジャンプ）
  'jump_ball': {
    force: new Vector3(0, 2000, 200),
    duration: 0.15,
    lock: true,
  },

  // リバウンドジャンプ（垂直ジャンプのみ、前方移動なし）
  'rebound_jump': {
    force: new Vector3(0, 2000, 0),
    duration: 0.15,
    lock: true,
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

/**
 * 移動による重心への影響設定
 * 歩行や方向転換で重心がどの程度ずれるか
 */
export const MOVEMENT_BALANCE = {
  // ==========================================================================
  // 歩行・走行による重心力
  // ==========================================================================

  /**
   * 歩行時の重心力（N）
   * 継続的に移動している間、進行方向に重心が傾く
   */
  WALK_FORCE: 400,

  /**
   * 走行時の重心力（N）
   * 歩行より大きな力が加わる
   */
  RUN_FORCE: 800,

  /**
   * ダッシュ時の重心力（N）
   * 高速移動では重心が大きくずれる
   */
  DASH_FORCE: 1200,

  /**
   * 移動速度に応じた力のスケール
   * 速度 * SPEED_FORCE_SCALE = 追加の力
   */
  SPEED_FORCE_SCALE: 200,

  // ==========================================================================
  // 方向転換による重心力
  // ==========================================================================

  /**
   * 軽い方向転換閾値（ラジアン）
   * この角度以下の変化は軽微とみなす（約30度）
   */
  LIGHT_TURN_THRESHOLD: 0.52,

  /**
   * 急な方向転換閾値（ラジアン）
   * この角度以上の変化は急激とみなす（約90度）
   */
  SHARP_TURN_THRESHOLD: 1.57,

  /**
   * 軽い方向転換の重心力（N）
   */
  LIGHT_TURN_FORCE: 600,

  /**
   * 急な方向転換の重心力（N）
   */
  SHARP_TURN_FORCE: 2000,

  /**
   * 完全な逆方向転換（180度）の重心力（N）
   */
  REVERSE_TURN_FORCE: 3000,

  /**
   * 方向転換の力の適用時間（秒）
   */
  TURN_FORCE_DURATION: 0.12,

  // ==========================================================================
  // 停止時の重心力
  // ==========================================================================

  /**
   * 急停止時の重心力（N）
   * 走っている状態から止まると前のめりになる
   */
  SUDDEN_STOP_FORCE: 1600,

  /**
   * 急停止判定の速度閾値（m/s）
   * この速度以上で移動中に停止すると急停止とみなす
   */
  SUDDEN_STOP_VELOCITY_THRESHOLD: 2.0,

  /**
   * 急停止の力の適用時間（秒）
   */
  STOP_FORCE_DURATION: 0.1,

  // ==========================================================================
  // 移動開始時の重心力
  // ==========================================================================

  /**
   * 移動開始時の重心力（N）
   * 静止状態から動き出す際の慣性
   */
  START_FORCE: 500,

  /**
   * 移動開始の力の適用時間（秒）
   */
  START_FORCE_DURATION: 0.08,

  /**
   * 移動開始判定の静止時間閾値（秒）
   * この時間以上静止していた場合、次の移動は「開始」とみなす
   */
  IDLE_TIME_THRESHOLD: 0.3,

  // ==========================================================================
  // 移動方向制限（重心ボールの慣性による）
  // ==========================================================================

  /**
   * 重心ボール水平速度がこの値未満なら制限なし（ほぼ静止状態）
   * 静止からの発進を妨げない
   */
  DIRECTION_RESTRICT_SPEED_THRESHOLD: 0.3,

  /**
   * この速度で制限が100%効く（m/s）
   * ボール速度が高いほど方向転換時の減速が大きい
   */
  DIRECTION_RESTRICT_FULL_SPEED: 2.0,

  /**
   * 逆方向移動時の最低速度係数（0に近いほど逆方向移動が困難）
   * 完全停止（0.0）にすると操作感が悪いので最低限を確保
   */
  DIRECTION_RESTRICT_MIN_FACTOR: 0.05,

  // ==========================================================================
  // 回転速度制限（重心ボールの慣性による）
  // ==========================================================================

  /**
   * 基本回転速度（rad/s）
   * quicknessで 2〜10 の範囲にスケールされる
   */
  BASE_TURN_RATE: 2.0,

  /**
   * quickness による回転速度ボーナス（rad/s）
   * 実効回転速度 = BASE_TURN_RATE + (quickness/100) * TURN_RATE_QUICKNESS_BONUS
   */
  TURN_RATE_QUICKNESS_BONUS: 8.0,

  /**
   * 回転時に重心ボールに加える力（N / radian）
   * 大きな回転ほど大きな力がバランスに影響する
   */
  TURN_FORCE_PER_RAD: 600,

  /**
   * 重心不安定時の回転速度最低係数
   * バランスが完全に崩れていてもこの割合の回転速度は確保
   */
  TURN_MIN_FACTOR: 0.15,
} as const;
