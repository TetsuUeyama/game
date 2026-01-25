import { Vector3 } from '@babylonjs/core';
import { PhysicsConstants, getOptimalShootAngle, degreesToRadians, radiansToDegrees } from '../../physics/PhysicsConfig';

/**
 * シュート計算の結果
 */
export interface ShootCalculationResult {
  velocity: Vector3; // 初速度ベクトル
  angle: number; // シュート角度（度）
  initialSpeed: number; // 初速度（m/s）
  flightTime: number; // 飛行時間（秒）
  maxHeight: number; // 最高到達点（m）
}

/**
 * バスケットボールのシュート軌道を計算
 * @param shooterPosition シューターの位置
 * @param targetPosition ターゲット（リムリングの中心）の位置
 * @param preferredAngle 希望するシュート角度（度）デフォルト: 距離に応じて自動調整
 * @returns シュート計算結果
 */
export function calculateShootTrajectory(
  shooterPosition: Vector3,
  targetPosition: Vector3,
  preferredAngle?: number
): ShootCalculationResult {
  const gravity = PhysicsConstants.GRAVITY_MAGNITUDE;

  // シューターからターゲットへのベクトル
  const toTarget = targetPosition.subtract(shooterPosition);

  // 水平距離（XZ平面）
  const horizontalDistance = Math.sqrt(toTarget.x * toTarget.x + toTarget.z * toTarget.z);

  // 垂直距離（高さの差）
  const verticalDistance = toTarget.y;

  // 最適なシュート角度を計算
  let shootAngle: number;

  if (preferredAngle !== undefined) {
    // 指定された角度を使用
    shootAngle = degreesToRadians(preferredAngle);
  } else {
    // 距離に応じて最適な角度を自動計算（PhysicsConfigの関数を使用）
    const optimalAngleDegrees = getOptimalShootAngle(horizontalDistance);
    shootAngle = degreesToRadians(optimalAngleDegrees);
  }

  // 放物線運動の公式を使用して初速度を計算
  // 水平距離: R = (v² * sin(2θ)) / g
  // 垂直変位: h = R * tan(θ) - (g * R²) / (2 * v² * cos²(θ))
  // この2つの式から、v²を求める

  const tanAngle = Math.tan(shootAngle);
  const cosAngle = Math.cos(shootAngle);
  const sin2Angle = Math.sin(2 * shootAngle);

  // v² = (g * R²) / (2 * cos²(θ) * (R * tan(θ) - h))
  // ただし、より安定した計算のため、別の公式を使用：
  // v² = (g * R) / (sin(2θ)) (平地の場合)
  // 高さ差を考慮した修正版：
  const numerator = gravity * horizontalDistance * horizontalDistance;
  const denominator = 2 * cosAngle * cosAngle * (horizontalDistance * tanAngle - verticalDistance);

  let initialSpeedSquared: number;

  if (Math.abs(denominator) < 0.01) {
    // デノミネータが0に近い場合は簡易計算
    initialSpeedSquared = (gravity * horizontalDistance) / sin2Angle;
  } else {
    initialSpeedSquared = numerator / denominator;
  }

  // 負の値やNaNの場合は、より大きな角度で再計算
  if (initialSpeedSquared <= 0 || isNaN(initialSpeedSquared)) {
    // フォールバック：60度で計算
    shootAngle = degreesToRadians(60);
    initialSpeedSquared = (gravity * horizontalDistance) / Math.sin(2 * shootAngle);
  }

  const initialSpeed = Math.sqrt(Math.abs(initialSpeedSquared));

  // 初速度を成分に分解
  const horizontalSpeed = initialSpeed * Math.cos(shootAngle);
  const verticalSpeed = initialSpeed * Math.sin(shootAngle);

  // 水平方向の単位ベクトル
  const horizontalDirection = new Vector3(toTarget.x, 0, toTarget.z);
  horizontalDirection.normalize();

  // 最終的な速度ベクトル
  const velocity = new Vector3(
    horizontalDirection.x * horizontalSpeed,
    verticalSpeed,
    horizontalDirection.z * horizontalSpeed
  );

  // 飛行時間を計算
  const flightTime = horizontalDistance / horizontalSpeed;

  // 最高到達点を計算
  const maxHeight = shooterPosition.y + (verticalSpeed * verticalSpeed) / (2 * gravity);

  return {
    velocity,
    angle: radiansToDegrees(shootAngle),
    initialSpeed,
    flightTime,
    maxHeight,
  };
}

/**
 * シュートが物理的に可能かどうかをチェック
 * @param shooterPosition シューターの位置
 * @param targetPosition ターゲット（リム）の位置
 * @param maxSpeed 最大初速度（m/s）デフォルト: 15 m/s
 * @returns 可能かどうか
 */
export function isShootPhysicallyPossible(
  shooterPosition: Vector3,
  targetPosition: Vector3,
  maxSpeed: number = 15
): boolean {
  const gravity = PhysicsConstants.GRAVITY_MAGNITUDE;
  const toTarget = targetPosition.subtract(shooterPosition);
  const horizontalDistance = Math.sqrt(toTarget.x * toTarget.x + toTarget.z * toTarget.z);
  const verticalDistance = toTarget.y;

  // 45度で投げた場合の最大到達距離
  const maxRange = (maxSpeed * maxSpeed) / gravity;

  // 必要な水平距離が最大到達距離より大きい場合は不可能
  if (horizontalDistance > maxRange) {
    return false;
  }

  // 高さ差が大きすぎる場合も不可能
  if (verticalDistance > maxSpeed * maxSpeed / (2 * gravity)) {
    return false;
  }

  return true;
}
