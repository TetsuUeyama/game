/**
 * 関節操作関連の設定を一元管理するファイル
 * キャラクターの関節操作に関する定数を提供
 */

/**
 * 関節操作設定
 */
export const JOINT_CONFIG = {
  // 回転速度（マウス移動量に対する係数）
  ROTATION_SPEED: 0.01,

  // 最小移動閾値（この値未満の移動は無視）
  MIN_MOVEMENT_THRESHOLD: 0.1,
} as const;

/**
 * 操作可能な関節名のリスト
 */
export const JOINT_NAMES = [
  "head",
  "upperBody",
  "lowerBody",
  "leftShoulder",
  "rightShoulder",
  "leftElbow",
  "rightElbow",
  "leftHip",
  "rightHip",
  "leftKnee",
  "rightKnee",
] as const;

/**
 * 関節名の型
 */
export type JointName = typeof JOINT_NAMES[number];

/**
 * 関節判定用のメッシュ名パターン
 */
export const JOINT_MESH_PATTERNS = [
  "shoulder",
  "elbow",
  "hip",
  "knee",
  "head",
  "upper-body",
  "lower-body",
  "waist-joint",
] as const;

/**
 * 強調表示の色設定
 */
export const JOINT_HIGHLIGHT = {
  ACTIVE_COLOR: { r: 0.5, g: 0.5, b: 0.0 },
  INACTIVE_COLOR: { r: 0, g: 0, b: 0 },
} as const;
