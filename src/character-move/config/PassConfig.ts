/**
 * パス関連の設定
 */

import { getDistance2DSimple } from "../utils/CollisionUtils";

/**
 * パス距離設定
 */
export const PASS_DISTANCE = {
  /** レイアップ可能距離（ゴールからこの距離以内はゴール下とみなす） */
  LAYUP_RANGE: 3.0,
  /** パス可能な最大距離 */
  MAX_PASS_DISTANCE: 15.0,
  /** パス可能な最小距離 */
  MIN_PASS_DISTANCE: 2.0,
} as const;

/**
 * パスクールダウン設定
 */
export const PASS_COOLDOWN = {
  /** パス後のクールダウン（秒） */
  AFTER_PASS: 1.0,
} as const;

/**
 * パスユーティリティ
 */
export class PassUtils {
  /**
   * ゴール下（レイアップ可能距離）にいるかどうかを判定
   * @param characterPosition キャラクターの位置
   * @param goalPosition 攻めるゴールの位置
   * @returns ゴール下にいる場合true
   */
  public static isNearGoal(characterPosition: { x: number; z: number }, goalPosition: { x: number; z: number }): boolean {
    const distance = getDistance2DSimple(characterPosition, goalPosition);
    return distance <= PASS_DISTANCE.LAYUP_RANGE;
  }

  /**
   * パス可能な距離かどうかを判定
   * @param distance 距離
   * @returns パス可能な場合true
   */
  public static isPassableDistance(distance: number): boolean {
    return distance >= PASS_DISTANCE.MIN_PASS_DISTANCE && distance <= PASS_DISTANCE.MAX_PASS_DISTANCE;
  }
}
