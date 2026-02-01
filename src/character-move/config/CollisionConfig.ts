/**
 * 衝突判定関連の設定を一元管理するファイル
 * ボールとキャラクター、キャラクター同士の衝突判定に関する定数を提供
 *
 * 注意: ボールと選手の体パーツ（胴体・手）との衝突はHavok物理エンジンが自動処理
 * 手動の衝突判定コード（checkDefenderBodyBlock等）は削除された
 * PhysicsConfig.ts の CHARACTER セクションで物理パラメータを設定
 */

/**
 * ボール衝突設定
 */
export const BALL_COLLISION_CONFIG = {
  // ボールの半径（m）
  BALL_RADIUS: 0.15,
} as const;

/**
 * キャラクター衝突設定
 * 注意: 選手間衝突はfootCircleRadiusに統一されたため、
 * CHARACTER_RADIUSは削除された。衝突半径はCharacter.getFootCircleRadius()を使用する。
 */
export const CHARACTER_COLLISION_CONFIG = {
  // 衝突解決時の余裕マージン（m）
  COLLISION_MARGIN: 0.05,
} as const;

/**
 * 体パーツ衝突設定
 * 注意: 物理的な衝突はHavok物理エンジンが処理
 * ここではキャッチ判定に使用する高さ範囲のみを定義
 */
export const BODY_PART_CONFIG = {
  // 手を伸ばせる高さ（身長からの追加高さ）（m）- キャッチ判定用
  HAND_REACH_HEIGHT: 0.3,
} as const;
