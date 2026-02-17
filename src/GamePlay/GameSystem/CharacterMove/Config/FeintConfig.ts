/**
 * フェイント関連の設定を一元管理するファイル
 * フェイント動作、反応確率に関する定数を提供
 */

/**
 * フェイント設定
 */
export const FEINT_CONFIG = {
  // フェイント反応距離（この距離内のディフェンダーが反応する可能性がある）
  REACTION_DISTANCE: 2.5,          // 2.5m以内

  // ディフェンダーの反応確率ベース（0-1）
  BASE_REACTION_CHANCE: 0.7,       // 70%の確率で反応

  // ステータスによる補正
  OFFENSE_STAT_INFLUENCE: 0.003,   // offense値1あたり反応確率-0.3%
  DEFENSE_STAT_INFLUENCE: 0.003,   // defense値1あたり反応確率+0.3%

  // フェイント成功後のドリブル突破ボーナス時間（秒）
  BREAKTHROUGH_WINDOW: 1.0,        // 1秒以内にドリブル突破すると成功しやすい

  // 連続フェイント防止クールダウン（秒）
  FEINT_COOLDOWN: 1.5,
} as const;

/**
 * フェイント結果
 */
export interface FeintResult {
  success: boolean;
  defenderReacted: boolean;      // ディフェンダーが反応したか
  defender: import("@/GamePlay/Object/Entities/Character").Character | null;    // 反応したディフェンダー
  message: string;
}
