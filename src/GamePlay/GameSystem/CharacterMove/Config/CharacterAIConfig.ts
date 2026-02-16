/**
 * キャラクターAI関連の設定を一元管理するファイル
 * AIの動作制御に関する定数を提供
 */

/**
 * ボール保持位置設定
 * 八角形の面番号に対応
 * 0: 前面, 1: 右前, 2: 右, 3: 右後, 4: 後面, 5: 左後, 6: 左, 7: 左前
 */
export const BALL_HOLDING_CONFIG = {
  // オフェンス側のボール保持位置（ディフェンスから遠い位置）
  // 緑(3)・シアン(4)・青(5)以外の5箇所を使用
  // つまり、赤(0)・オレンジ(1)・黄色(2)・紫(6)・マゼンタ(7)
  OFFENSE_HOLDING_FACES: [0, 1, 2, 6, 7] as readonly number[],

  // ディフェンス側のボール保持位置（全方向）
  DEFENSE_HOLDING_FACES: [0, 1, 2, 3, 4, 5, 6, 7] as readonly number[],
} as const;

/**
 * AI状態遷移設定
 */
export const AI_STATE_CONFIG = {
  // アクション中の移動スキップ判定
  SKIP_MOVEMENT_DURING_ACTION: true,
} as const;
