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
 * ON_BALL_PLAYERのみcircleRadius（getFootCircleRadius）を使用。
 * それ以外の選手はBODY_COLLISION_RADIUS（体の物理的な大きさ）で衝突する。
 */
export const CHARACTER_COLLISION_CONFIG = {
  // 衝突解決時の余裕マージン（m）
  COLLISION_MARGIN: 0.05,
  // 体の物理的な衝突半径（m）- ON_BALL_PLAYER以外の選手が使用
  BODY_COLLISION_RADIUS: 0.2,
} as const;
