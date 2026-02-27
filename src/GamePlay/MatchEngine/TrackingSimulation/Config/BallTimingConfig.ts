// --- Ball timing ---
export const FIRE_MIN = 1.5;
export const FIRE_MAX = 3.0;
export const TURN_MIN = 1.0;
export const TURN_MAX = 3.0;
export const BALL_TIMEOUT = 6.0;

// --- Loose ball ---
export const LOOSE_BALL_PICKUP_RADIUS = 0.5;  // ルーズボール地面回収半径 (m)
export const LOOSE_BALL_GRACE_PERIOD = 0.6;   // ルーズボール突入後の回収不可時間 (秒)
export const LOOSE_BALL_GIVE_UP_MARGIN = 0.5; // 最速到達者との差がこの秒数以上なら追跡を諦める (秒)
