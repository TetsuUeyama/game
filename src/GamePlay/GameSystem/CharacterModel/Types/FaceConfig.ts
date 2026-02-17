/**
 * 選手個別の顔設定
 * 肌色、目、口、髪、髭のパラメータを定義
 */

export enum HairStyle {
  NONE = 0,
  SHORT = 1,
  MEDIUM = 2,
  LONG = 3,
  MOHAWK = 4,
  BUZZ = 5,
}

export enum BeardStyle {
  NONE = 0,
  STUBBLE = 1,
  FULL = 2,
  GOATEE = 3,
}

export enum EyeStyle {
  ROUND = 0,    // 丸い目（デフォルト）
  NARROW = 1,   // 細い目（切れ長）
  WIDE = 2,     // 大きい丸目
  SHARP = 3,    // 鋭い目（つり目）
  DROOPY = 4,   // たれ目
}

export enum MouthStyle {
  NORMAL = 0,   // 通常（デフォルト）
  WIDE = 1,     // 横に広い口
  SMALL = 2,    // 小さい口
  SMILE = 3,    // 笑顔（上向きカーブ）
  SERIOUS = 4,  // 真一文字
}

export interface ColorRGB {
  r: number;
  g: number;
  b: number;
}

export interface FaceConfig {
  skinColor: ColorRGB;
  eyeColor: ColorRGB;
  eyeStyle: EyeStyle;
  eyeSize: number;          // 倍率 (1.0 = デフォルト半径0.03)
  eyePositionY: number;     // 頭ローカルY (デフォルト 0.03)
  mouthColor: ColorRGB;
  mouthStyle: MouthStyle;
  mouthWidth: number;       // 幅 (デフォルト 0.06)
  mouthPositionY: number;   // 頭ローカルY (デフォルト -0.04)
  hairStyle: HairStyle;
  hairColor: ColorRGB;
  beardStyle: BeardStyle;
  beardColor: ColorRGB;
}

/** 現在のハードコード値と同一のデフォルト設定 */
export const DEFAULT_FACE_CONFIG: FaceConfig = {
  skinColor: { r: 1.0, g: 0.8, b: 0.7 },
  eyeColor: { r: 0.1, g: 0.1, b: 0.1 },
  eyeStyle: EyeStyle.ROUND,
  eyeSize: 1.0,
  eyePositionY: 0.03,
  mouthColor: { r: 0.8, g: 0.2, b: 0.2 },
  mouthStyle: MouthStyle.NORMAL,
  mouthWidth: 0.06,
  mouthPositionY: -0.04,
  hairStyle: HairStyle.NONE,
  hairColor: { r: 0.15, g: 0.1, b: 0.05 },
  beardStyle: BeardStyle.NONE,
  beardColor: { r: 0.15, g: 0.1, b: 0.05 },
};
