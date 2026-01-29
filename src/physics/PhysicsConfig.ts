import { Vector3 } from "@babylonjs/core";

// basketball3d-gameのゲーム設定をインポート（存在する場合）
// 注意: 循環参照を避けるため、直接値を定義し、ゲーム固有の設定は各ゲームで上書き可能にする

/**
 * 物理エンジン共通設定
 * 全ての物理パラメータを一元管理
 *
 * 注意: basketball3d-gameのPLAYER_CONFIG/BALL_CONFIGと整合性を保つこと
 * - PLAYER.MAX_SPEED = PLAYER_CONFIG.speed * 1.5
 * - PLAYER.DEFAULT_MASS = PLAYER_CONFIG.mass
 */
export const PhysicsConstants = {
  // 重力
  GRAVITY: new Vector3(0, -9.81, 0),
  GRAVITY_MAGNITUDE: 9.81,

  // ボール物理パラメータ（character-move用: 実寸）
  // NBA規定: 直径約24cm、質量567-650g、反発係数0.80-0.83（1.8mから落として1.2-1.4mバウンド）
  BALL: {
    RADIUS: 0.12, // バスケットボール半径（m）= 直径24cm（公式サイズ）
    MASS: 0.62, // 質量（kg）= 620g
    RESTITUTION: 0.83, // 反発係数（NBA規定: √(1.3/1.8) ≈ 0.85、コート床で0.80-0.83）
    FRICTION: 0.6, // 摩擦係数（ゴム表面）
    LINEAR_DAMPING: 0.05, // 線形減衰（空気抵抗）- parabolaUtilsで考慮した軌道計算
    ANGULAR_DAMPING: 0.1, // 角度減衰（回転の減衰）
    MIN_BOUNCE_VELOCITY: 0.3, // バウンド停止の最小速度（m/s）
  },

  // プレイヤー物理パラメータ
  // 元の値: PLAYER_CONFIG.speed=5, mass=80, friction=0.8(ハードコード)
  PLAYER: {
    DEFAULT_MASS: 80, // デフォルト質量（kg）= PLAYER_CONFIG.mass
    HEIGHT: 1.9, // デフォルト身長（m）= PLAYER_CONFIG.height
    RADIUS: 0.3, // 衝突半径（m）= PLAYER_CONFIG.radius
    FRICTION: 0.8, // 地面との摩擦（元CenterOfMassのfrictionCoefficient）
    RESTITUTION: 0.1, // 反発係数（ほぼ跳ねない）
    MAX_SPEED: 7.5, // 最大速度（m/s）= PLAYER_CONFIG.speed * 1.5
    BASE_SPEED: 5, // 基準速度（m/s）= PLAYER_CONFIG.speed
    MOVE_FORCE: 2400, // 基準移動力（N）（元PlayerMovementのbaseMoveForce）
  },

  // 地面・コート
  GROUND: {
    FRICTION: 0.8,
    RESTITUTION: 0.5,
  },

  // バックボード
  BACKBOARD: {
    RESTITUTION: 0.6,
    FRICTION: 0.3,
  },

  // リム
  RIM: {
    RESTITUTION: 0.7,
    FRICTION: 0.01,
    RADIUS: 0.225, // リムの半径（m）
  },
} as const;

/**
 * シュート角度設定（距離に応じた最適角度）
 */
export const ShootAngles = {
  // 極近距離（0-2m）
  VERY_CLOSE: 75,
  // 近距離（2-5m）
  CLOSE: 72,
  // 中距離（5-10m）
  MEDIUM: 65,
  // 遠距離（10m以上）
  FAR: 48,
  // パス用（低い弧）
  PASS: 15,
} as const;

/**
 * 距離に応じた最適なシュート角度を取得
 */
export function getOptimalShootAngle(horizontalDistance: number): number {
  if (horizontalDistance < 2) {
    return ShootAngles.VERY_CLOSE;
  } else if (horizontalDistance < 5) {
    return ShootAngles.CLOSE;
  } else if (horizontalDistance < 10) {
    return ShootAngles.MEDIUM;
  } else {
    return ShootAngles.FAR;
  }
}

/**
 * 度数法からラジアンに変換
 */
export function degreesToRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

/**
 * ラジアンから度数法に変換
 */
export function radiansToDegrees(radians: number): number {
  return (radians * 180) / Math.PI;
}
