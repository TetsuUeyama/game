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
  length: 30, // コートの長さ（m）- Z軸方向（5×5大枠が6つ並ぶ）
  width: 15, // コートの幅（m）- X軸方向
  floorColor: '#8B4513', // 床の色（茶色 - バスケットコート）
  gridSize: 10, // グリッドのサイズ
  gridColor: '#6B3510', // グリッドの色（濃い茶色）

  // センターサークル設定
  centerCircleRadius: 1.8, // センターサークル半径（m）- FIBA基準
  centerCircleLineWidth: 0.05, // ラインの太さ（m）
  centerCircleColor: '#FFFFFF', // ラインの色（白）
};

// 安全境界設定（AI移動時のフィールド端からのマージン）
export const SAFE_BOUNDARY_CONFIG = {
  margin: 1.5, // フィールド端からのマージン（m）
  // 計算済みの安全境界（FIELD_CONFIG.width/2 - margin, FIELD_CONFIG.length/2 - margin）
  minX: -6.0,  // -7.5 + 1.5
  maxX: 6.0,   // 7.5 - 1.5
  minZ: -13.5, // -15 + 1.5
  maxZ: 13.5,  // 15 - 1.5
} as const;

// ゴール設定（バスケットゴール）
export const GOAL_CONFIG = {
  // リム（リング）設定
  rimHeight: 3.05, // リムの高さ（m）
  rimDiameter: 0.45, // リムの内径（m）- 実際のサイズに近づける
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
