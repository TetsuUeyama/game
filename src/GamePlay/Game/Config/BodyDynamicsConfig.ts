// --- Body rotation / visual interpolation ---
export const TURN_RATE = 3.0;                        // rad/s
export const NECK_TURN_RATE = 6.0;                    // rad/s (faster than body TURN_RATE)
export const NECK_MAX_ANGLE = Math.PI / 2;            // ±90deg from body facing
export const TORSO_TURN_RATE = 4.5;                   // rad/s（NECK_TURN_RATE より遅い）
export const TORSO_MAX_ANGLE = Math.PI / 2;           // ±90° from lower body facing
export const TORSO_VISUAL_LERP_SPEED = 8.0;           // 視覚補間速度（NECK=12.0 より遅い）
export const ARM_LERP_SPEED = 10.0;          // 腕の補間速度
export const NECK_VISUAL_LERP_SPEED = 12.0;  // 首の視覚補間速度
