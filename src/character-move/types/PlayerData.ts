/**
 * サッカー選手データの型定義
 * playerData.csv から読み込むデータの構造
 */

import { FaceConfig } from "./FaceConfig";

/**
 * 選手の基本情報
 */
export interface PlayerBasicInfo {
  ID: string;
  NAME: string;
  PositionMain: string;
  Position2?: string;
  Position3?: string;
  Position4?: string;
  Position5?: string;
  side: string; // 両/左/右
  Position: string; // A/B/C
  height: number;
  dominanthand: string; // 右/左
}

/**
 * 選手の能力値
 */
export interface PlayerStats {
  // 基本能力
  offense: number;
  defense: number;
  power: number;
  stamina: number;
  speed: number;
  acceleration: number;
  reflexes: number;
  quickness: number;

  // ドリブル
  dribblingaccuracy: number;
  dribblingspeed: number;

  // パス
  passaccuracy: number;
  passspeed: number;

  // シュート（3ポイント）
  '3paccuracy': number;
  '3pspeed': number;

  // シュート（通常）
  shootccuracy: number;
  shootdistance: number;
  shoottechnique: number;
  freethrow: number;

  // 特殊スキル
  curve: number;
  dunk: number;
  jump: number;
  technique: number;

  // メンタル
  mentality: number;
  aggressive: number;
  alignment: number;
  condition: number;

  // 逆足
  oppositeaccuracy: number;
  oppositefrequency: number;
}

/**
 * 特殊能力（☆または〇）
 */
export interface PlayerSpecialAbilities {
  specialabilitiy1?: string;
  specialabilitiy2?: string;
  specialabilitiy3?: string;
  specialabilitiy4?: string;
  specialabilitiy5?: string;
  specialabilitiy6?: string;
  specialabilitiy7?: string;
  specialabilitiy8?: string;
  specialabilitiy9?: string;
  specialabilitiy10?: string;
  specialabilitiy11?: string;
  specialabilitiy12?: string;
  specialabilitiy13?: string;
  specialabilitiy14?: string;
  specialabilitiy15?: string;
  specialabilitiy16?: string;
  specialabilitiy17?: string;
  specialabilitiy18?: string;
  specialabilitiy19?: string;
  specialabilitiy20?: string;
  specialabilitiy22?: string;
}

/**
 * 選手データの完全な構造
 */
export interface PlayerData {
  basic: PlayerBasicInfo;
  stats: PlayerStats;
  specialAbilities: PlayerSpecialAbilities;
  faceConfig?: FaceConfig;
}

/**
 * JSON上の顔設定（色は [r, g, b] 配列形式）
 */
export interface FaceConfigJSON {
  skinColor?: number[];
  eyeColor?: number[];
  eyeStyle?: number;
  eyeSize?: number;
  eyePositionY?: number;
  mouthColor?: number[];
  mouthStyle?: number;
  mouthWidth?: number;
  mouthPositionY?: number;
  hairStyle?: number;
  hairColor?: number[];
  beardStyle?: number;
  beardColor?: number[];
}

/**
 * JSONファイルから読み込む生データの型
 */
export interface PlayerDataJSON {
  ID: string;
  NAME: string;
  PositionMain: string;
  Position2?: string;
  Position3?: string;
  Position4?: string;
  Position5?: string;
  side: string;
  Position: string;
  height: number;
  dominanthand: string;
  offense: number;
  defense: number;
  power: number;
  stamina: number;
  speed: number;
  acceleration: number;
  reflexes: number;
  quickness: number;
  dribblingaccuracy: number;
  dribblingspeed: number;
  passaccuracy: number;
  passspeed: number;
  '3paccuracy': number;
  '3pspeed': number;
  shootccuracy: number;
  shootdistance: number;
  shoottechnique: number;
  freethrow: number;
  curve: number;
  dunk: number;
  jump: number;
  technique: number;
  mentality: number;
  aggressive: number;
  alignment: number;
  condition: number;
  oppositeaccuracy: number;
  oppositefrequency: number;
  specialabilitiy1?: string;
  specialabilitiy2?: string;
  specialabilitiy3?: string;
  specialabilitiy4?: string;
  specialabilitiy5?: string;
  specialabilitiy6?: string;
  specialabilitiy7?: string;
  specialabilitiy8?: string;
  specialabilitiy9?: string;
  specialabilitiy10?: string;
  specialabilitiy11?: string;
  specialabilitiy12?: string;
  specialabilitiy13?: string;
  specialabilitiy14?: string;
  specialabilitiy15?: string;
  specialabilitiy16?: string;
  specialabilitiy17?: string;
  specialabilitiy18?: string;
  specialabilitiy19?: string;
  specialabilitiy20?: string;
  specialabilitiy22?: string;
  faceConfig?: FaceConfigJSON;
}
