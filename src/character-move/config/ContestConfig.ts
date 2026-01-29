/**
 * 競り合い関連の設定を一元管理するファイル
 * キャラクター同士の押し合いに関する定数を提供
 */

/**
 * 競り合い設定
 */
export const CONTEST_CONFIG = {
  // 押し出し速度（m/s）
  PUSH_SPEED_BASE: 1.0,           // 基本押し出し速度
  PUSH_SPEED_MAX: 2.0,            // 最大押し出し速度

  // ステータス差による影響（オフェンス vs ディフェンス）
  STAT_DIFF_MULTIPLIER: 0.01,     // ステータス差1あたりの速度増加率

  // 同等ステータス時の処理
  EQUAL_STAT_PUSH_RATIO: 0.5,     // 同等ステータス時のお互いの押し出し比率

  // 判定マージン
  OVERLAP_MARGIN: 0.01,           // 重なり解消判定のマージン（m）
} as const;
