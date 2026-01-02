/**
 * character-moveゲームの設定
 */

// キャラクター設定
export const CHARACTER_CONFIG = {
  height: 1.8, // キャラクターの身長（m）
  radius: 0.3, // キャラクターの半径（m）
  speed: 5, // 移動速度（m/s）
  rotationSpeed: 3, // 回転速度（rad/s）
  mass: 70, // 質量（kg）

  // 視野設定
  visionAngle: 60, // 視野角（度）
  visionRange: 5, // 視野範囲（m）
};

// フィールド設定
export const FIELD_CONFIG = {
  size: 50, // フィールドのサイズ（m × m）
  floorColor: '#4CAF50', // 床の色（緑）
  gridSize: 10, // グリッドのサイズ
  gridColor: '#2E7D32', // グリッドの色（濃い緑）
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

  // カメラのオフセット（キャラクターからの相対位置）
  offset: {
    x: 0,
    y: 5, // キャラクターの5m上
    z: -8, // キャラクターの8m後ろ
  },

  // カメラの追従速度（0-1、1が即座に追従）
  followSpeed: 0.1,
};

// ライト設定
export const LIGHT_CONFIG = {
  // 環境光
  ambient: {
    intensity: 0.6,
    color: '#FFFFFF',
  },

  // 太陽光
  directional: {
    intensity: 0.8,
    direction: { x: -1, y: -3, z: -1 },
    color: '#FFFFFF',
  },
};

// 3Dモデル設定
export const MODEL_CONFIG = {
  // デフォルトのモデルパス
  defaultModelPath: '/models/character.glb',

  // モデルのスケール
  scale: 1.0,

  // モデルの回転オフセット（度）
  rotationOffset: {
    x: 0,
    y: 0,
    z: 0,
  },
};
