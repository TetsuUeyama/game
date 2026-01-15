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

// フィールド設定（バスケットコートサイズ）
export const FIELD_CONFIG = {
  length: 28, // コートの長さ（m）- Z軸方向
  width: 15, // コートの幅（m）- X軸方向
  floorColor: '#8B4513', // 床の色（茶色 - バスケットコート）
  gridSize: 10, // グリッドのサイズ
  gridColor: '#6B3510', // グリッドの色（濃い茶色）
};

// ゴール設定（バスケットゴール）
export const GOAL_CONFIG = {
  // リム（リング）設定
  rimHeight: 3.05, // リムの高さ（m）
  rimDiameter: 0.61, // リムの内径（m）
  rimThickness: 0.02, // リムの太さ（m）
  rimColor: '#FF6600', // リムの色（オレンジ）

  // バックボード設定
  backboardHeight: 1.05, // バックボードの高さ（m）
  backboardWidth: 1.8, // バックボードの幅（m）
  backboardDepth: 0.05, // バックボードの厚さ（m）
  backboardDistance: 1.2, // エンドラインからバックボードまでの距離（m）
  rimOffset: 0.4, // バックボードからリム中心までの距離（m）

  // ネット設定
  netSegmentsVertical: 10, // ネットの縦方向セグメント数
  netSegmentsCircular: 16, // ネットの円周方向セグメント数
  netLength: 0.45, // ネットの長さ（m）
  netStiffness: 0.8, // ネットの硬さ（0-1）
  netDamping: 0.85, // ネットの減衰（0-1）
  netColor: '#FFFFFF', // ネットの色（白）
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
