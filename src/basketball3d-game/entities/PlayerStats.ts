/**
 * プレイヤーの能力値パラメーター
 */
export interface PlayerStats {
  // オフェンス能力
  ballHandling: number; // ボール保持能力 (0-100)
  shooting: number; // シュート精度 (0-100)
  speed: number; // 移動速度倍率 (0.5-2.0)

  // ディフェンス能力
  steal: number; // スティール成功率 (0-100)
  defense: number; // ディフェンス範囲・反応速度 (0-100)

  // フィジカル
  strength: number; // 接触時の強さ (0-100)
  stamina: number; // スタミナ（将来の実装用） (0-100)
}

/**
 * デフォルトのプレイヤーステータス
 */
export const DEFAULT_PLAYER_STATS: PlayerStats = {
  ballHandling: 50,
  shooting: 50,
  speed: 1.0,
  steal: 50,
  defense: 50,
  strength: 50,
  stamina: 100,
};

/**
 * ステータスに基づいてファンブル確率を計算
 * @param offenseBallHandling オフェンスのボール保持能力
 * @param defenseSteal ディフェンスのスティール能力
 * @returns ファンブル確率 (0.0-1.0)
 */
export function calculateFumbleChance(
  offenseBallHandling: number,
  defenseSteal: number
): number {
  // ベース確率: 50%
  const baseChance = 0.5;

  // オフェンスのボール保持能力が高いほどファンブル率が下がる
  // ballHandling 100 → -0.3 (確率20%)
  // ballHandling 0 → +0.3 (確率80%)
  const offenseModifier = (50 - offenseBallHandling) / 100 * 0.6;

  // ディフェンスのスティール能力が高いほどファンブル率が上がる
  // steal 100 → +0.3 (確率80%)
  // steal 0 → -0.3 (確率20%)
  const defenseModifier = (defenseSteal - 50) / 100 * 0.6;

  // 最終確率を計算（0.1 ~ 0.9の範囲に制限）
  const finalChance = Math.max(0.1, Math.min(0.9, baseChance + offenseModifier + defenseModifier));

  return finalChance;
}
