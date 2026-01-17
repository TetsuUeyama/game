import { Vector3 } from "@babylonjs/core";

/**
 * 衝突判定ユーティリティ関数
 * 距離計算、衝突判定、衝突解決のための純粋関数を提供
 */

// ============================================
// 距離計算
// ============================================

/**
 * 2D距離を計算（XZ平面、Y軸を無視）
 * @param pos1 位置1
 * @param pos2 位置2
 * @returns XZ平面上の距離
 */
export function getDistance2D(pos1: Vector3, pos2: Vector3): number {
  const dx = pos2.x - pos1.x;
  const dz = pos2.z - pos1.z;
  return Math.sqrt(dx * dx + dz * dz);
}

/**
 * 3D距離を計算
 * @param pos1 位置1
 * @param pos2 位置2
 * @returns 3D空間での距離
 */
export function getDistance3D(pos1: Vector3, pos2: Vector3): number {
  return Vector3.Distance(pos1, pos2);
}

/**
 * 2D距離の2乗を計算（sqrt を避けてパフォーマンス向上）
 * @param pos1 位置1
 * @param pos2 位置2
 * @returns XZ平面上の距離の2乗
 */
export function getDistanceSquared2D(pos1: Vector3, pos2: Vector3): number {
  const dx = pos2.x - pos1.x;
  const dz = pos2.z - pos1.z;
  return dx * dx + dz * dz;
}

/**
 * 3D距離の2乗を計算（sqrt を避けてパフォーマンス向上）
 * @param pos1 位置1
 * @param pos2 位置2
 * @returns 3D空間での距離の2乗
 */
export function getDistanceSquared3D(pos1: Vector3, pos2: Vector3): number {
  const dx = pos2.x - pos1.x;
  const dy = pos2.y - pos1.y;
  const dz = pos2.z - pos1.z;
  return dx * dx + dy * dy + dz * dz;
}

// ============================================
// 衝突判定
// ============================================

/**
 * 2つの円が衝突しているか判定（2D、XZ平面）
 * @param pos1 円1の中心位置
 * @param radius1 円1の半径
 * @param pos2 円2の中心位置
 * @param radius2 円2の半径
 * @returns 衝突している場合true
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
 * @param pos1 球1の中心位置
 * @param radius1 球1の半径
 * @param pos2 球2の中心位置
 * @param radius2 球2の半径
 * @returns 衝突している場合true
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
 * @param point 判定する点
 * @param center 円の中心
 * @param radius 円の半径
 * @returns 点が円の内側にある場合true
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
 * @param point 判定する点
 * @param center 球の中心
 * @param radius 球の半径
 * @returns 点が球の内側にある場合true
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
 * 2D円衝突の詳細情報を取得
 */
export interface CircleCollisionInfo {
  isColliding: boolean;
  distance: number;
  overlap: number; // 重なり量（衝突していない場合は負の値）
  direction: Vector3; // pos1からpos2への正規化方向（XZ平面）
}

/**
 * 2つの円の衝突情報を取得（2D、XZ平面）
 * @param pos1 円1の中心位置
 * @param radius1 円1の半径
 * @param pos2 円2の中心位置
 * @param radius2 円2の半径
 * @returns 衝突情報
 */
export function getCircleCollisionInfo(
  pos1: Vector3,
  radius1: number,
  pos2: Vector3,
  radius2: number
): CircleCollisionInfo {
  const dx = pos2.x - pos1.x;
  const dz = pos2.z - pos1.z;
  const distance = Math.sqrt(dx * dx + dz * dz);
  const combinedRadius = radius1 + radius2;
  const overlap = combinedRadius - distance;

  // 方向ベクトル（距離が0に近い場合はデフォルト方向）
  let direction: Vector3;
  if (distance > 0.001) {
    direction = new Vector3(dx / distance, 0, dz / distance);
  } else {
    direction = new Vector3(1, 0, 0); // デフォルト方向
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
  direction: Vector3; // pos1からpos2への正規化方向（3D）
}

/**
 * 2つの球の衝突情報を取得（3D）
 * @param pos1 球1の中心位置
 * @param radius1 球1の半径
 * @param pos2 球2の中心位置
 * @param radius2 球2の半径
 * @returns 衝突情報
 */
export function getSphereCollisionInfo(
  pos1: Vector3,
  radius1: number,
  pos2: Vector3,
  radius2: number
): SphereCollisionInfo {
  const dx = pos2.x - pos1.x;
  const dy = pos2.y - pos1.y;
  const dz = pos2.z - pos1.z;
  const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
  const combinedRadius = radius1 + radius2;
  const overlap = combinedRadius - distance;

  let direction: Vector3;
  if (distance > 0.001) {
    direction = new Vector3(dx / distance, dy / distance, dz / distance);
  } else {
    direction = new Vector3(0, 1, 0); // デフォルト方向（上）
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
 * @param pos1 円1の位置
 * @param radius1 円1の半径
 * @param pos2 円2の位置
 * @param radius2 円2の半径
 * @param margin 追加の余裕（オプション）
 * @returns 新しい位置
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
 * @param pos1 円1の位置
 * @param radius1 円1の半径
 * @param power1 円1のパワー値
 * @param pos2 円2の位置
 * @param radius2 円2の半径
 * @param power2 円2のパワー値
 * @param margin 追加の余裕
 * @returns 新しい位置
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

  // パワー差に基づいて押し戻し量を分配
  // powerDiff > 0: pos1の方が強い → pos2が多く押される
  // powerDiff < 0: pos2の方が強い → pos1が多く押される
  const powerDiff = power1 - power2;
  const pushRatio = Math.max(-1, Math.min(1, powerDiff / 100)); // -1〜+1の範囲にクランプ

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
 * @param from 始点
 * @param to 終点
 * @returns 正規化された方向ベクトル（Y=0）
 */
export function getDirection2D(from: Vector3, to: Vector3): Vector3 {
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  const length = Math.sqrt(dx * dx + dz * dz);

  if (length < 0.001) {
    return new Vector3(0, 0, 1); // デフォルト方向
  }

  return new Vector3(dx / length, 0, dz / length);
}

/**
 * 2点間の角度を取得（ラジアン、+Z軸を0度として時計回り）
 * @param from 始点
 * @param to 終点
 * @returns 角度（ラジアン）
 */
export function getAngle2D(from: Vector3, to: Vector3): number {
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  return Math.atan2(dx, dz);
}

/**
 * 2つの方向ベクトル間の角度差を取得
 * @param dir1 方向1（正規化済み）
 * @param dir2 方向2（正規化済み）
 * @returns 角度差（ラジアン、0〜π）
 */
export function getAngleBetween(dir1: Vector3, dir2: Vector3): number {
  const dot = Vector3.Dot(dir1, dir2);
  // 数値誤差で-1〜1の範囲を超える場合があるためクランプ
  const clampedDot = Math.max(-1, Math.min(1, dot));
  return Math.acos(clampedDot);
}

/**
 * 方向ベクトルが指定角度範囲内にあるか判定
 * @param direction 判定する方向
 * @param targetDirection 目標方向
 * @param maxAngle 許容角度（ラジアン）
 * @returns 範囲内の場合true
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
// 線分との距離計算
// ============================================

/**
 * 点から線分までの最短距離を計算（2D、XZ平面）
 * @param point 点の位置
 * @param lineStart 線分の始点
 * @param lineEnd 線分の終点
 * @returns 最短距離
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
    // 線分の長さがほぼ0の場合、始点との距離を返す
    return getDistance2D(point, lineStart);
  }

  // 点から線分への射影パラメータ t（0〜1）
  const t = Math.max(
    0,
    Math.min(
      1,
      ((point.x - lineStart.x) * lineDx + (point.z - lineStart.z) * lineDz) /
        lineLengthSquared
    )
  );

  // 線分上の最近接点
  const closestX = lineStart.x + t * lineDx;
  const closestZ = lineStart.z + t * lineDz;

  // 点と最近接点の距離
  const dx = point.x - closestX;
  const dz = point.z - closestZ;
  return Math.sqrt(dx * dx + dz * dz);
}

// ============================================
// 範囲チェック
// ============================================

/**
 * 値が範囲内にあるか判定
 * @param value 判定する値
 * @param min 最小値
 * @param max 最大値
 * @returns 範囲内の場合true
 */
export function isInRange(value: number, min: number, max: number): boolean {
  return value >= min && value <= max;
}

/**
 * 点が矩形範囲内にあるか判定（2D、XZ平面）
 * @param point 判定する点
 * @param minX X最小値
 * @param maxX X最大値
 * @param minZ Z最小値
 * @param maxZ Z最大値
 * @returns 範囲内の場合true
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
 * @param point 判定する点
 * @param boxCenter ボックスの中心
 * @param halfWidth X方向の半幅
 * @param halfHeight Y方向の半高
 * @param halfDepth Z方向の半奥行
 * @returns 範囲内の場合true
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
