/**
 * ActionDirectionConfig - パス/シュートの方向制約定数
 *
 * シュート: torsoFacing ±SHOOT_HALF_ANGLE の前方コーン内のみ
 * パス: ボール保持ハンド側に広いコーン（反対側は狭い）
 */

/** シュートの前方コーン半角 (rad) — torsoFacing ±30° */
export const SHOOT_HALF_ANGLE = 30 * Math.PI / 180;

/** パスコーン: ボール保持側の最大横角度 (rad) — 100° */
export const PASS_SIDE_ALLOW = 100 * Math.PI / 180;

/** パスコーン: 反対側の許容角度 (rad) — 10° */
export const PASS_FRONT_ALLOW = 10 * Math.PI / 180;

/** 発射時のアラインメント許容誤差 (rad) — 15° */
export const FIRE_ALIGNMENT_TOLERANCE = 15 * Math.PI / 180;
