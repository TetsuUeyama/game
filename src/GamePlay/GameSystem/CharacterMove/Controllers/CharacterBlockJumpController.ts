/**
 * キャラクターブロックジャンプコントローラー
 * シュートブロック時のターゲット設定と移動計算を管理
 */

import { Vector3 } from "@babylonjs/core";
import { BASE_CIRCLE_SIZE } from "@/GamePlay/GameSystem/CircleSystem/CircleSizeConfig";

/**
 * ブロック対象のインターフェース（Character依存を避けるため）
 */
export interface BlockTarget {
  getPosition(): Vector3;
  getRotation(): number;
  getFootCircleRadius(): number;
}

/**
 * ブロックジャンプ状態
 */
export interface BlockJumpState {
  target: BlockTarget | null;
  lateralDirection: Vector3 | null;
  lateralSpeed: number;
  forwardDirection: Vector3 | null;
  forwardSpeed: number;
}

/**
 * アクションフェーズ情報
 */
export interface ActionPhaseInfo {
  currentAction: string | null;
  currentPhase: 'idle' | 'startup' | 'active';
  isBalanceStable: boolean;
}

/**
 * キャラクターブロックジャンプコントローラー
 */
export class CharacterBlockJumpController {
  // ブロックジャンプ制御
  private blockJumpTarget: BlockTarget | null = null;
  private blockLateralDirection: Vector3 | null = null;
  private blockLateralSpeed: number = 3.0;
  private blockForwardDirection: Vector3 | null = null;
  private blockForwardSpeed: number = 0;

  /**
   * ブロックジャンプのターゲットを設定
   * シューターの向きからシュート軌道を予測し、横移動方向を計算
   * 面0同士が接している場合はサークル縮小分だけ前方に飛ぶ
   */
  public setTarget(
    target: BlockTarget | null,
    myPosition: Vector3,
    myFootCircleRadius: number
  ): void {
    this.blockJumpTarget = target;

    if (target === null) {
      this.blockLateralDirection = null;
      this.blockForwardDirection = null;
      this.blockForwardSpeed = 0;
      return;
    }

    const shooterPos = target.getPosition();
    const shooterRotation = target.getRotation();

    // シューターの向いている方向を計算（シュート方向）
    const shootDirection = new Vector3(
      Math.sin(shooterRotation),
      0,
      Math.cos(shooterRotation)
    ).normalize();

    // シューターからディフェンダーへのベクトル
    const toDefender = myPosition.subtract(shooterPos);
    toDefender.y = 0; // 水平面のみ考慮

    // シュート軌道上のディフェンダーに最も近い点を計算
    // 点から直線への最短距離の公式を使用
    const dot = Vector3.Dot(toDefender, shootDirection);
    const closestPointOnTrajectory = shooterPos.add(shootDirection.scale(dot));

    // ディフェンダーから軌道への横方向ベクトル
    const lateralOffset = closestPointOnTrajectory.subtract(myPosition);
    lateralOffset.y = 0;

    const lateralDistance = lateralOffset.length();

    // 横方向のずれが小さい場合は真っ直ぐ飛ぶ（横移動なし）
    if (lateralDistance < 0.3) {
      this.blockLateralDirection = null;
    } else if (lateralDistance > 2.0) {
      // 横方向のずれが大きすぎる場合はブロック不可
      this.blockLateralDirection = null;
    } else {
      // 横移動方向を正規化
      this.blockLateralDirection = lateralOffset.normalize();
      // 移動速度は横方向のずれに応じて調整
      // ジャンプの最高点到達時間（約0.35秒）を目安に計算
      const jumpPeakTime = 0.35;
      this.blockLateralSpeed = lateralDistance / jumpPeakTime;
    }

    // 面0同士が接しているかチェックし、前方移動を計算
    const distanceToShooter = toDefender.length();
    const shooterCircleRadius = target.getFootCircleRadius();
    const contactDistance = myFootCircleRadius + shooterCircleRadius;

    // サークル接触判定（余裕を持って0.2m以内なら接触とみなす）
    const isCircleContact = distanceToShooter <= contactDistance + 0.2;

    if (isCircleContact) {
      // サークルの縮小分を計算（defense_marking: 1.0m → blocking: 0.3m）
      const normalCircleSize = BASE_CIRCLE_SIZE.defense_marking;
      const blockingCircleSize = BASE_CIRCLE_SIZE.blocking;
      const circleShrinkage = normalCircleSize - blockingCircleSize; // 0.7m

      // シューターへの方向（前方移動方向）
      const toShooter = shooterPos.subtract(myPosition);
      toShooter.y = 0;
      if (toShooter.length() > 0.01) {
        this.blockForwardDirection = toShooter.normalize();
        // ジャンプの最高点到達時間（約0.35秒）を目安に計算
        const jumpPeakTime = 0.35;
        this.blockForwardSpeed = circleShrinkage / jumpPeakTime;
      }
    } else {
      this.blockForwardDirection = null;
      this.blockForwardSpeed = 0;
    }
  }

  /**
   * ブロックジャンプ中の移動を更新
   * block_shotアクションのstartupまたはactiveフェーズ中に呼び出す
   * 横移動（ボール軌道への移動）と前方移動（サークル縮小分）を適用
   * @returns 移動量（Vector3）、移動がない場合はnull
   */
  public update(
    deltaTime: number,
    actionPhaseInfo: ActionPhaseInfo
  ): Vector3 | null {
    const { currentAction, currentPhase, isBalanceStable } = actionPhaseInfo;

    // block_shotアクションのstartupまたはactiveフェーズ中のみ移動
    const isBlockJumping = currentAction === 'block_shot' && (currentPhase === 'startup' || currentPhase === 'active');

    if (!isBlockJumping) {
      // アクションが終了したらターゲットをクリア
      // 重心が安定するまでは着地姿勢を維持
      if (this.blockJumpTarget !== null && isBalanceStable) {
        this.blockJumpTarget = null;
        this.blockLateralDirection = null;
        this.blockForwardDirection = null;
        this.blockForwardSpeed = 0;
      }
      return null;
    }

    // 移動量を計算
    let totalMovement = Vector3.Zero();

    // 横移動を計算
    if (this.blockLateralDirection !== null) {
      const lateralMovement = this.blockLateralDirection.scale(this.blockLateralSpeed * deltaTime);
      totalMovement = totalMovement.add(lateralMovement);
    }

    // 前方移動を計算（サークル縮小分）
    if (this.blockForwardDirection !== null && this.blockForwardSpeed > 0) {
      const forwardMovement = this.blockForwardDirection.scale(this.blockForwardSpeed * deltaTime);
      totalMovement = totalMovement.add(forwardMovement);
    }

    // 移動がある場合のみ返す
    if (totalMovement.length() > 0.001) {
      return totalMovement;
    }

    return null;
  }

  /**
   * ブロックジャンプのターゲットを取得
   */
  public getTarget(): BlockTarget | null {
    return this.blockJumpTarget;
  }

  /**
   * 状態を取得（デバッグ用）
   */
  public getState(): BlockJumpState {
    return {
      target: this.blockJumpTarget,
      lateralDirection: this.blockLateralDirection?.clone() ?? null,
      lateralSpeed: this.blockLateralSpeed,
      forwardDirection: this.blockForwardDirection?.clone() ?? null,
      forwardSpeed: this.blockForwardSpeed,
    };
  }

  /**
   * リセット
   */
  public reset(): void {
    this.blockJumpTarget = null;
    this.blockLateralDirection = null;
    this.blockLateralSpeed = 3.0;
    this.blockForwardDirection = null;
    this.blockForwardSpeed = 0;
  }
}
