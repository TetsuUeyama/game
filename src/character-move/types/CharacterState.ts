/**
 * キャラクターの状態
 */
export enum CharacterState {
  /** ボールロスト状態（ボールが誰の保持でもない） */
  BALL_LOST = "BALL_LOST",
  /** オンボールプレイヤー（ボール保持者） */
  ON_BALL_PLAYER = "ON_BALL_PLAYER",
  /** オフボールプレイヤー（ボール保持者の味方） */
  OFF_BALL_PLAYER = "OFF_BALL_PLAYER",
  /** オンボールディフェンダー（ボール保持者に一番近い敵） */
  ON_BALL_DEFENDER = "ON_BALL_DEFENDER",
  /** オフボールディフェンダー（ボール保持者から遠い敵） */
  OFF_BALL_DEFENDER = "OFF_BALL_DEFENDER",
  /** スローインスローワー（スローインを投げる人） */
  THROW_IN_THROWER = "THROW_IN_THROWER",
  /** スローインレシーバー（スローインを受ける人） */
  THROW_IN_RECEIVER = "THROW_IN_RECEIVER",
  /** スローイン中の他のプレイヤー（スローイン中に待機する人） */
  THROW_IN_OTHER = "THROW_IN_OTHER",
  /** ジャンプボール参加者（2名） */
  JUMP_BALL_JUMPER = "JUMP_BALL_JUMPER",
  /** ジャンプボール中の待機選手 */
  JUMP_BALL_OTHER = "JUMP_BALL_OTHER",
}

/**
 * 状態ごとの色設定（RGB）
 */
export const CHARACTER_STATE_COLORS: Record<CharacterState, { r: number; g: number; b: number }> = {
  [CharacterState.BALL_LOST]: { r: 0.5, g: 0.5, b: 0.5 }, // グレー
  [CharacterState.ON_BALL_PLAYER]: { r: 1.0, g: 1.0, b: 0.0 }, // 黄色
  [CharacterState.OFF_BALL_PLAYER]: { r: 0.0, g: 1.0, b: 0.0 }, // 緑
  [CharacterState.ON_BALL_DEFENDER]: { r: 1.0, g: 0.0, b: 0.0 }, // 赤
  [CharacterState.OFF_BALL_DEFENDER]: { r: 1.0, g: 0.5, b: 0.0 }, // オレンジ
  [CharacterState.THROW_IN_THROWER]: { r: 0.0, g: 0.8, b: 1.0 }, // シアン
  [CharacterState.THROW_IN_RECEIVER]: { r: 0.8, g: 0.0, b: 1.0 }, // マゼンタ
  [CharacterState.THROW_IN_OTHER]: { r: 0.3, g: 0.3, b: 0.6 }, // 暗い青
  [CharacterState.JUMP_BALL_JUMPER]: { r: 1.0, g: 0.8, b: 0.0 }, // 金色
  [CharacterState.JUMP_BALL_OTHER]: { r: 0.4, g: 0.4, b: 0.4 }, // 濃いグレー
};
