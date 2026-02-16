import { Vector3, Scalar } from "@babylonjs/core";

/**
 * 衝突判定ユーティリティ関数
 * Babylon.js標準APIを活用した衝突判定・距離計算
 */

// ============================================
// 距離計算（Babylon.js Vector3 API使用）
// ============================================

/**
 * 2D距離を計算（XZ平面、Y軸を無視）
 */
export function getDistance2D(pos1: Vector3, pos2: Vector3): number {
  const flatPos1 = new Vector3(pos1.x, 0, pos1.z);
  const flatPos2 = new Vector3(pos2.x, 0, pos2.z);
  return Vector3.Distance(flatPos1, flatPos2);
}

/**
 * 3D距離を計算
 */
export function getDistance3D(pos1: Vector3, pos2: Vector3): number {
  return Vector3.Distance(pos1, pos2);
}

/**
 * 2D距離の2乗を計算（パフォーマンス最適化用）
 */
export function getDistanceSquared2D(pos1: Vector3, pos2: Vector3): number {
  const flatPos1 = new Vector3(pos1.x, 0, pos1.z);
  const flatPos2 = new Vector3(pos2.x, 0, pos2.z);
  return Vector3.DistanceSquared(flatPos1, flatPos2);
}

/**
 * 3D距離の2乗を計算（パフォーマンス最適化用）
 */
export function getDistanceSquared3D(pos1: Vector3, pos2: Vector3): number {
  return Vector3.DistanceSquared(pos1, pos2);
}

// ============================================
// シンプル型用の距離計算
// ============================================

/**
 * シンプルな座標オブジェクト用の2D距離計算（XZ平面）
 * { x: number; z: number } 型または Vec3 型に対応
 */
export function getDistance2DSimple(
  pos1: { x: number; z: number },
  pos2: { x: number; z: number }
): number {
  const dx = pos1.x - pos2.x;
  const dz = pos1.z - pos2.z;
  return Math.sqrt(dx * dx + dz * dz);
}

/**
 * シンプルな座標オブジェクト用の2D距離の2乗（パフォーマンス最適化用）
 */
export function getDistanceSquared2DSimple(
  pos1: { x: number; z: number },
  pos2: { x: number; z: number }
): number {
  const dx = pos1.x - pos2.x;
  const dz = pos1.z - pos2.z;
  return dx * dx + dz * dz;
}

// ============================================
// 衝突判定
// ============================================

/**
 * 2つの円が衝突しているか判定（2D、XZ平面）
 */
export function checkCircleCollision(
  pos1: Vector3,
  radius1: number,
  pos2: Vector3,
  radius2: number
): boolean {
  const distanceSquared = getDistanceSquared2D(pos1, pos2);
  const combinedRadius = radius1 + radius2;
  return distanceSquared < combinedRadius * combinedRadius;
}

/**
 * 2つの球が衝突しているか判定（3D）
 */
export function checkSphereCollision(
  pos1: Vector3,
  radius1: number,
  pos2: Vector3,
  radius2: number
): boolean {
  const distanceSquared = getDistanceSquared3D(pos1, pos2);
  const combinedRadius = radius1 + radius2;
  return distanceSquared < combinedRadius * combinedRadius;
}

/**
 * 点が円の内側にあるか判定（2D、XZ平面）
 */
export function isPointInCircle(
  point: Vector3,
  center: Vector3,
  radius: number
): boolean {
  const distanceSquared = getDistanceSquared2D(point, center);
  return distanceSquared < radius * radius;
}

/**
 * 点が球の内側にあるか判定（3D）
 */
export function isPointInSphere(
  point: Vector3,
  center: Vector3,
  radius: number
): boolean {
  const distanceSquared = getDistanceSquared3D(point, center);
  return distanceSquared < radius * radius;
}

// ============================================
// 衝突情報取得
// ============================================

/**
 * 2D円衝突の詳細情報
 */
export interface CircleCollisionInfo {
  isColliding: boolean;
  distance: number;
  overlap: number;
  direction: Vector3;
}

/**
 * 2つの円の衝突情報を取得（2D、XZ平面）
 */
export function getCircleCollisionInfo(
  pos1: Vector3,
  radius1: number,
  pos2: Vector3,
  radius2: number
): CircleCollisionInfo {
  const flatPos1 = new Vector3(pos1.x, 0, pos1.z);
  const flatPos2 = new Vector3(pos2.x, 0, pos2.z);

  const distance = Vector3.Distance(flatPos1, flatPos2);
  const combinedRadius = radius1 + radius2;
  const overlap = combinedRadius - distance;

  let direction: Vector3;
  if (distance > 0.001) {
    direction = flatPos2.subtract(flatPos1).normalize();
  } else {
    direction = new Vector3(1, 0, 0);
  }

  return {
    isColliding: overlap > 0,
    distance,
    overlap,
    direction,
  };
}

/**
 * 3D球衝突の詳細情報
 */
export interface SphereCollisionInfo {
  isColliding: boolean;
  distance: number;
  overlap: number;
  direction: Vector3;
}

/**
 * 2つの球の衝突情報を取得（3D）
 */
export function getSphereCollisionInfo(
  pos1: Vector3,
  radius1: number,
  pos2: Vector3,
  radius2: number
): SphereCollisionInfo {
  const distance = Vector3.Distance(pos1, pos2);
  const combinedRadius = radius1 + radius2;
  const overlap = combinedRadius - distance;

  let direction: Vector3;
  if (distance > 0.001) {
    direction = pos2.subtract(pos1).normalize();
  } else {
    direction = new Vector3(0, 1, 0);
  }

  return {
    isColliding: overlap > 0,
    distance,
    overlap,
    direction,
  };
}

// ============================================
// 衝突解決
// ============================================

/**
 * 衝突解決結果
 */
export interface CollisionResolution {
  newPos1: Vector3;
  newPos2: Vector3;
  overlap: number;
}

/**
 * 2つの円の衝突を解決（両方を均等に押し戻す）
 */
export function resolveCircleCollision(
  pos1: Vector3,
  radius1: number,
  pos2: Vector3,
  radius2: number,
  margin: number = 0
): CollisionResolution {
  const info = getCircleCollisionInfo(pos1, radius1, pos2, radius2);

  if (!info.isColliding && margin === 0) {
    return { newPos1: pos1.clone(), newPos2: pos2.clone(), overlap: 0 };
  }

  const totalPush = info.overlap + margin;
  const pushAmount = totalPush / 2;

  const newPos1 = new Vector3(
    pos1.x - info.direction.x * pushAmount,
    pos1.y,
    pos1.z - info.direction.z * pushAmount
  );

  const newPos2 = new Vector3(
    pos2.x + info.direction.x * pushAmount,
    pos2.y,
    pos2.z + info.direction.z * pushAmount
  );

  return { newPos1, newPos2, overlap: info.overlap };
}

/**
 * 2つの円の衝突を解決（パワー値に基づいて押し戻し量を分配）
 */
export function resolveCircleCollisionWithPower(
  pos1: Vector3,
  radius1: number,
  power1: number,
  pos2: Vector3,
  radius2: number,
  power2: number,
  margin: number = 0
): CollisionResolution {
  const info = getCircleCollisionInfo(pos1, radius1, pos2, radius2);

  if (!info.isColliding && margin === 0) {
    return { newPos1: pos1.clone(), newPos2: pos2.clone(), overlap: 0 };
  }

  const totalPush = info.overlap + margin;

  const powerDiff = power1 - power2;
  const pushRatio = Scalar.Clamp(powerDiff / 100, -1, 1);

  const push1Amount = totalPush * (0.5 - pushRatio * 0.5);
  const push2Amount = totalPush * (0.5 + pushRatio * 0.5);

  const newPos1 = new Vector3(
    pos1.x - info.direction.x * push1Amount,
    pos1.y,
    pos1.z - info.direction.z * push1Amount
  );

  const newPos2 = new Vector3(
    pos2.x + info.direction.x * push2Amount,
    pos2.y,
    pos2.z + info.direction.z * push2Amount
  );

  return { newPos1, newPos2, overlap: info.overlap };
}

// ============================================
// 角度・方向計算
// ============================================

/**
 * 2点間の方向ベクトルを取得（2D、XZ平面、正規化済み）
 */
export function getDirection2D(from: Vector3, to: Vector3): Vector3 {
  const direction = new Vector3(to.x - from.x, 0, to.z - from.z);
  const length = direction.length();

  if (length < 0.001) {
    return new Vector3(0, 0, 1);
  }

  return direction.normalize();
}

/**
 * 2点間の角度を取得（ラジアン、+Z軸を0度として時計回り）
 */
export function getAngle2D(from: Vector3, to: Vector3): number {
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  return Math.atan2(dx, dz);
}

/**
 * 2つの方向ベクトル間の角度差を取得
 */
export function getAngleBetween(dir1: Vector3, dir2: Vector3): number {
  const dot = Vector3.Dot(dir1, dir2);
  const clampedDot = Scalar.Clamp(dot, -1, 1);
  return Math.acos(clampedDot);
}

/**
 * 角度を [-PI, PI] の範囲に正規化
 * @param angle 正規化する角度（ラジアン）
 * @returns 正規化された角度
 */
export function normalizeAngle(angle: number): number {
  while (angle > Math.PI) angle -= 2 * Math.PI;
  while (angle < -Math.PI) angle += 2 * Math.PI;
  return angle;
}

/**
 * 方向ベクトルが指定角度範囲内にあるか判定
 */
export function isDirectionWithinAngle(
  direction: Vector3,
  targetDirection: Vector3,
  maxAngle: number
): boolean {
  const angle = getAngleBetween(direction, targetDirection);
  return angle <= maxAngle;
}

// ============================================
// 視野判定
// ============================================

/**
 * ターゲットが視野内にあるか判定（2D、XZ平面）
 * @param observerPos オブザーバーの位置
 * @param observerRotation オブザーバーの回転（Y軸、ラジアン）
 * @param targetPos ターゲットの位置
 * @param fovHalfAngleRad 視野角の半分（ラジアン）
 * @param maxDistance 最大距離（メートル）
 * @returns 視野内かつ距離内の場合true
 */
export function isInFieldOfView2D(
  observerPos: Vector3,
  observerRotation: number,
  targetPos: Vector3,
  fovHalfAngleRad: number,
  maxDistance: number
): boolean {
  // 距離チェック
  const distance = getDistance2D(observerPos, targetPos);
  if (distance > maxDistance) {
    return false;
  }

  // 距離がほぼ0の場合は視野内とみなす
  if (distance < 0.01) {
    return true;
  }

  // オブザーバーの正面方向
  const forwardDirection = new Vector3(
    Math.sin(observerRotation),
    0,
    Math.cos(observerRotation)
  );

  // ターゲットへの方向ベクトル（2D）
  const toTarget = new Vector3(
    targetPos.x - observerPos.x,
    0,
    targetPos.z - observerPos.z
  ).normalize();

  // 角度チェック
  const angle = getAngleBetween(forwardDirection, toTarget);
  return angle <= fovHalfAngleRad;
}

// ============================================
// 線分との距離計算
// ============================================

/**
 * 点から線分までの最短距離を計算（2D、XZ平面）
 */
export function getDistanceToLineSegment2D(
  point: Vector3,
  lineStart: Vector3,
  lineEnd: Vector3
): number {
  const lineDx = lineEnd.x - lineStart.x;
  const lineDz = lineEnd.z - lineStart.z;
  const lineLengthSquared = lineDx * lineDx + lineDz * lineDz;

  if (lineLengthSquared < 0.001) {
    return getDistance2D(point, lineStart);
  }

  // 射影パラメータ t（0〜1）
  const t = Scalar.Clamp(
    ((point.x - lineStart.x) * lineDx + (point.z - lineStart.z) * lineDz) /
      lineLengthSquared,
    0,
    1
  );

  // 線分上の最近接点
  const closestX = lineStart.x + t * lineDx;
  const closestZ = lineStart.z + t * lineDz;

  const dx = point.x - closestX;
  const dz = point.z - closestZ;
  return Math.sqrt(dx * dx + dz * dz);
}

// ============================================
// 範囲チェック
// ============================================

/**
 * 値が範囲内にあるか判定
 */
export function isInRange(value: number, min: number, max: number): boolean {
  return value >= min && value <= max;
}

/**
 * 点が矩形範囲内にあるか判定（2D、XZ平面）
 */
export function isPointInRect(
  point: Vector3,
  minX: number,
  maxX: number,
  minZ: number,
  maxZ: number
): boolean {
  return isInRange(point.x, minX, maxX) && isInRange(point.z, minZ, maxZ);
}

/**
 * 点がボックス範囲内にあるか判定（3D）
 */
export function isPointInBox(
  point: Vector3,
  boxCenter: Vector3,
  halfWidth: number,
  halfHeight: number,
  halfDepth: number
): boolean {
  return (
    isInRange(point.x, boxCenter.x - halfWidth, boxCenter.x + halfWidth) &&
    isInRange(point.y, boxCenter.y - halfHeight, boxCenter.y + halfHeight) &&
    isInRange(point.z, boxCenter.z - halfDepth, boxCenter.z + halfDepth)
  );
}

// ============================================
// 補間（Babylon.js Scalar API使用）
// ============================================

/**
 * 線形補間
 */
export function lerp(from: number, to: number, t: number): number {
  return Scalar.Lerp(from, to, t);
}

/**
 * 値をクランプ
 */
export function clamp(value: number, min: number, max: number): number {
  return Scalar.Clamp(value, min, max);
}
