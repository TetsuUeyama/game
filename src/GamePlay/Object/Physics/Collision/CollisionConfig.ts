/**
 * 衝突判定関連の設定
 * キャラクター同士の衝突解決に関する定数を提供
 *
 * 注意: ボールと選手の体パーツ（胴体・手）との衝突はHavok物理エンジンが自動処理
 * 手動の衝突判定コード（checkDefenderBodyBlock等）は削除された
 * PhysicsConfig.ts の CHARACTER セクションで物理パラメータを設定
 *
 * ボール関連の定数は BallCatchConfig.ts に一元化
 */

/**
 * キャラクター衝突設定
 * 注意: 選手間衝突はfootCircleRadiusに統一されたため、
 * CHARACTER_RADIUSは削除された。衝突半径はCharacter.getFootCircleRadius()を使用する。
 */
export const CHARACTER_COLLISION_CONFIG = {
  // 衝突解決時の余裕マージン（m）
  COLLISION_MARGIN: 0.05,
} as const;
