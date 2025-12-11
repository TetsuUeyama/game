/**
 * 3Dバスケットゲームの設定
 */

// コート設定（実寸スケール）
// 実際のバスケットコート: 28m × 15m
export const COURT_CONFIG = {
  length: 28, // コートの長さ（m）
  width: 15, // コートの幅（m）
  floorColor: '#8B4513', // 床の色（茶色）
  lineColor: '#FFFFFF', // ラインの色（白）
  lineWidth: 0.05, // ラインの幅（m）

  // ゴール設定
  rimHeight: 3.05, // リムの高さ（m）
  rimDiameter: 0.45, // リムの直径（m）
  backboardHeight: 1.05, // バックボードの高さ（m）
  backboardWidth: 1.8, // バックボードの幅（m）
  backboardDistance: 1.2, // エンドラインからバックボードまでの距離（m）
};

// プレイヤー設定
export const PLAYER_CONFIG = {
  height: 1.9, // プレイヤーの身長（m）
  radius: 0.3, // プレイヤーの半径（m）
  speed: 5, // 移動速度（m/s）
  mass: 80, // 質量（kg）

  // 視野設定
  visionAngle: 120, // 視野角（度）
  visionRange: 10, // 視野範囲（m）
};

// ボール設定
export const BALL_CONFIG = {
  radius: 0.25, // ボールの半径（m）
  mass: 0.6, // ボールの質量（kg）
  bounciness: 0.7, // 反発係数
  friction: 0.5, // 摩擦係数
};

// 物理演算設定
export const PHYSICS_CONFIG = {
  gravity: -9.81, // 重力加速度（m/s²）
  timeStep: 1 / 60, // 物理演算のタイムステップ
};

// カメラ設定
export const CAMERA_CONFIG = {
  fov: 60, // 視野角（度）
  minZ: 0.1, // 最小描画距離
  maxZ: 1000, // 最大描画距離

  // 初期位置（コートを見下ろす位置）
  initialPosition: {
    x: 0,
    y: 20, // 高さ20m
    z: -25, // コート端から25m後ろ
  },

  // 見る対象（コート中央）
  initialTarget: {
    x: 0,
    y: 0,
    z: 0,
  },
};

// ライト設定
export const LIGHT_CONFIG = {
  // ヘミスフェリックライト（環境光）
  hemispheric: {
    intensity: 0.7,
    direction: { x: 0, y: 1, z: 0 },
  },

  // ディレクショナルライト（太陽光）
  directional: {
    intensity: 0.5,
    direction: { x: -1, y: -2, z: -1 },
  },
};

// ゲーム設定
export const GAME_CONFIG = {
  scoreToWin: 11, // 勝利条件の得点
  pointsPerGoal: 2, // 1ゴールあたりの得点
};
