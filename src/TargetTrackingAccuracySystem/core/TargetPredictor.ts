import { Vec3, MovingTarget, vec3Add, vec3Scale } from "../types";

/**
 * ターゲットの未来位置を予測
 * 等速: P + V*t
 * 加速度あり: P + V*t + 0.5*A*t²
 */
export function predictTargetPosition(target: MovingTarget, t: number): Vec3 {
  const pos = vec3Add(target.position, vec3Scale(target.velocity, t));
  if (target.acceleration) {
    return vec3Add(pos, vec3Scale(target.acceleration, 0.5 * t * t));
  }
  return pos;
}

/**
 * ターゲットの未来速度を予測
 * V + A*t
 */
export function predictTargetVelocity(target: MovingTarget, t: number): Vec3 {
  if (target.acceleration) {
    return vec3Add(target.velocity, vec3Scale(target.acceleration, t));
  }
  return target.velocity;
}
