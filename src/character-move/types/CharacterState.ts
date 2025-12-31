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
};
