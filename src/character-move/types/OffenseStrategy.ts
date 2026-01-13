/**
 * オフェンス側の攻撃戦術
 */
export enum OffenseStrategy {
  /** ハイリスク - 相手のスティールを誘う（面0のみ使用） */
  HIGH_RISK = "HIGH_RISK",
  /** ドリブル突破 - ドリブルで抜くつもりの場合（面1と7を使用） */
  DRIBBLE_BREAKTHROUGH = "DRIBBLE_BREAKTHROUGH",
  /** ボールキープ - 攻め急がず安全にボールを保持（面2と6を使用） */
  BALL_KEEP = "BALL_KEEP",
}

/**
 * 各攻撃戦術で使用するボール保持面の番号
 */
export const OFFENSE_STRATEGY_FACES: Record<OffenseStrategy, number[]> = {
  [OffenseStrategy.HIGH_RISK]: [0], // 面0のみ（ハイリスク）
  [OffenseStrategy.DRIBBLE_BREAKTHROUGH]: [1, 7], // 面1と7（ドリブル突破）
  [OffenseStrategy.BALL_KEEP]: [2, 6], // 面2と6（ボールキープ）
};

/**
 * 攻撃戦術の説明テキスト
 */
export const OFFENSE_STRATEGY_DESCRIPTIONS: Record<OffenseStrategy, string> = {
  [OffenseStrategy.HIGH_RISK]: "ハイリスク - 相手のスティールを誘う",
  [OffenseStrategy.DRIBBLE_BREAKTHROUGH]: "ドリブル突破 - ドリブルで抜くつもり",
  [OffenseStrategy.BALL_KEEP]: "ボールキープ - 攻め急がずボール保持",
};
