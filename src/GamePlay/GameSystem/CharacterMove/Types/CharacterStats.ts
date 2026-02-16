/**
 * キャラクター設定の型定義
 * 将来的にデータベースから読み込む際に使用する型
 */

/**
 * キャラクターID
 * 一意の識別子
 */
export type CharacterId = string;

/**
 * キャラクターの基本情報
 */
export interface CharacterBasicInfo {
  id: CharacterId;
  name: string; // キャラクター名
  description?: string; // 説明文
}

/**
 * キャラクターの物理的特性
 */
export interface CharacterPhysicalStats {
  height: number; // 身長（m）
  weight: number; // 体重（kg）
  radius: number; // 当たり判定の半径（m）
}

/**
 * キャラクターの移動性能
 */
export interface CharacterMovementStats {
  walkSpeed: number; // 歩行速度（m/s）
  dashSpeedMin: number; // ダッシュ最低速度倍率
  dashSpeedMax: number; // ダッシュ最高速度倍率
  dashAccelerationTime: number; // ダッシュ最高速度到達時間（秒）
  rotationSpeed: number; // 回転速度（rad/s）
}

/**
 * キャラクターのジャンプ性能
 */
export interface CharacterJumpStats {
  jumpPowerMultiplier: number; // ジャンプ力倍率（1.0が標準）
  airControlMultiplier: number; // 空中制御倍率（1.0が標準）
}

/**
 * キャラクターの視野設定
 */
export interface CharacterVisionStats {
  visionAngle: number; // 視野角（度）
  visionRange: number; // 視野範囲（m）
}

/**
 * キャラクターのその他の能力値
 * 将来的に追加される可能性のある項目
 */
export interface CharacterAdditionalStats {
  stamina?: number; // スタミナ（将来実装予定）
  agility?: number; // 機敏性（将来実装予定）
  strength?: number; // 筋力（将来実装予定）
  // 他のステータスを追加可能
  [key: string]: number | undefined;
}

/**
 * キャラクター設定の完全な定義
 */
export interface CharacterConfig {
  basic: CharacterBasicInfo;
  physical: CharacterPhysicalStats;
  movement: CharacterMovementStats;
  jump: CharacterJumpStats;
  vision: CharacterVisionStats;
  additional?: CharacterAdditionalStats;
}

/**
 * デフォルトのキャラクター設定
 */
export const DEFAULT_CHARACTER_CONFIG: CharacterConfig = {
  basic: {
    id: "default",
    name: "デフォルトキャラクター",
    description: "標準的な体格と能力を持つキャラクター",
  },
  physical: {
    height: 1.8, // 180cm
    weight: 70, // 70kg
    radius: 0.3, // 30cm
  },
  movement: {
    walkSpeed: 5.0, // 5m/s
    dashSpeedMin: 2.0, // 2倍
    dashSpeedMax: 3.5, // 3.5倍
    dashAccelerationTime: 1.0, // 1秒
    rotationSpeed: 3.0, // 3rad/s
  },
  jump: {
    jumpPowerMultiplier: 1.0, // 標準
    airControlMultiplier: 1.0, // 標準
  },
  vision: {
    visionAngle: 60, // 60度
    visionRange: 5, // 5m
  },
  additional: {},
};
