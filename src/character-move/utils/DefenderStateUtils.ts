import { Vector3 } from "@babylonjs/core";
import { Character } from "../entities/Character";

/**
 * ディフェンダー状態判定ユーティリティ
 * 重心システムと連携してディフェンダーの能力を判定
 */
export class DefenderStateUtils {
  /**
   * ディフェンダーが今すぐジャンプ可能か
   * 重心が安定していて、ロック中でなければジャンプ可能
   */
  static canJumpNow(defender: Character): boolean {
    const balance = defender.getBalanceController();
    if (!balance) return true;
    return balance.canTransition() && !balance.isLocked();
  }

  /**
   * ジャンプ可能になるまでの時間（秒）
   */
  static getTimeUntilCanJump(defender: Character): number {
    const balance = defender.getBalanceController();
    if (!balance) return 0;
    if (this.canJumpNow(defender)) return 0;
    return balance.getEstimatedRecoveryTime();
  }

  /**
   * ディフェンダーの有効ブロック高さ（ジャンプ可否を考慮）
   * @param defender ディフェンダー
   * @param jumpHeight ジャンプ高さ（デフォルト0.5m）
   * @returns ブロック可能な最大高さ（m）
   */
  static getEffectiveBlockHeight(defender: Character, jumpHeight: number = 0.5): number {
    const baseHeight = defender.config.physical.height;
    const armReach = baseHeight * 0.4; // 腕の長さ（身長の約40%）

    if (this.canJumpNow(defender)) {
      return baseHeight + armReach + jumpHeight;
    }
    return baseHeight + armReach;
  }

  /**
   * 指定時間後のディフェンダー予測位置
   * 現在の速度ベクトルと重心状態を考慮
   * @param defender ディフェンダー
   * @param timeAhead 予測時間（秒）
   * @returns 予測位置
   */
  static predictPosition(defender: Character, timeAhead: number): Vector3 {
    const currentPos = defender.getPosition();
    const velocity = defender.velocity || Vector3.Zero();

    // 重心状態を考慮（不安定だと移動が制限される）
    const balance = defender.getBalanceController();
    let mobilityFactor = 1.0;

    if (balance) {
      // ロック中は移動不可
      if (balance.isLocked()) {
        mobilityFactor = 0;
      } else {
        // 安定性に応じて移動能力を調整
        mobilityFactor = balance.getStability();
      }
    }

    return currentPos.add(velocity.scale(timeAhead * mobilityFactor));
  }

  /**
   * ディフェンダーが指定位置に到達可能か判定
   * @param defender ディフェンダー
   * @param targetPos 目標位置
   * @param timeLimit 制限時間（秒）
   * @returns 到達可能ならtrue
   */
  static canReachPosition(
    defender: Character,
    targetPos: Vector3,
    timeLimit: number
  ): boolean {
    const currentPos = defender.getPosition();
    const distance = Vector3.Distance(currentPos, targetPos);

    // ディフェンダーの移動速度（statsから取得）
    const baseSpeed = 5.0; // m/s
    const speedStat = defender.playerData?.stats?.speed ?? 50;
    const defenderSpeed = baseSpeed * (speedStat / 50);

    // 重心状態による移動開始遅延
    const startDelay = this.getTimeUntilCanJump(defender);

    // 移動可能時間
    const availableTime = Math.max(0, timeLimit - startDelay);

    // 到達可能距離
    const reachableDistance = defenderSpeed * availableTime;

    return distance <= reachableDistance;
  }

  /**
   * ディフェンダーの反応時間を計算
   * quickness ステータスに基づく
   */
  static getReactionTime(defender: Character): number {
    const baseReactionTime = 0.3; // 秒
    const quickness = defender.playerData?.stats?.quickness ?? 50;
    return baseReactionTime * (100 / quickness);
  }
}
