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

/**
 * ボールピックアップ設定
 * 物理ベースのキャッチシステムの設定
 */
export const BALL_PICKUP_CONFIG = {
  // リーチ範囲（手を伸ばせる最大距離）（m）
  REACH_RANGE: 1.5,

  // キャプチャ距離（この距離以下で完全にキャッチ）（m）
  CAPTURE_DISTANCE: 0.25,

  // 制御可能な最大相対速度（m/s）
  // これより速いとファンブル（弾く）
  MAX_CONTROLLABLE_VELOCITY: 15.0,

  // 引き寄せインパルスの強さ（N・s）
  PULL_IMPULSE_STRENGTH: 0.5,

  // ファンブル時のインパルスの強さ（N・s）
  FUMBLE_IMPULSE_STRENGTH: 3.0,

  // ファンブル後のクールダウン時間（秒）
  FUMBLE_COOLDOWN: 0.5,

  // キャッチ判定の高さ範囲（キャラクターの身長に対する割合）
  MIN_CATCH_HEIGHT_RATIO: 0.0,  // 地面から
  MAX_CATCH_HEIGHT_RATIO: 1.3,  // 身長の130%まで（ジャンプやリーチ考慮）
} as const;
