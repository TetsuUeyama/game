import {Vector3} from "@babylonjs/core";
import {Action, GameContext} from "../Action";
import {Player, HandPose} from "../../entities/Player";

/**
 * 目標地点への移動アクション
 * プレイヤーの状態に応じて腕のポーズも変更する
 */
export class MoveToTargetAction extends Action {
  readonly name = "MoveToTarget";

  private targetPosition: Vector3;
  private armPose: HandPose;

  /**
   * コンストラクタ
   * @param targetPosition 目標位置
   * @param armPose 移動中の腕のポーズ（デフォルト: NEUTRAL）
   */
  constructor(targetPosition: Vector3, armPose: HandPose = HandPose.NEUTRAL) {
    super();
    this.targetPosition = targetPosition;
    this.armPose = armPose;
  }

  canExecute(player: Player, _context: GameContext): boolean {
    // プレイヤーの現在位置
    const currentPos = player.getPosition();

    // 目標地点との水平距離を計算
    const dx = this.targetPosition.x - currentPos.x;
    const dz = this.targetPosition.z - currentPos.z;
    const horizontalDistance = Math.sqrt(dx * dx + dz * dz);

    // 距離が0.5m以上ある場合のみ移動可能
    return horizontalDistance >= 0.5;
  }

  execute(player: Player, context: GameContext): void {
    // 腕のポーズを設定
    this.setArmPose(player, this.armPose);

    // 目標地点を向く
    const currentPos = player.getPosition();
    const dx = this.targetPosition.x - currentPos.x;
    const dz = this.targetPosition.z - currentPos.z;
    const angleToTarget = Math.atan2(dx, dz);
    player.setDirection(angleToTarget);

    // 移動（既存のmoveTowards()を使用）
    const moved = player.moveTowards(this.targetPosition, context.deltaTime);

    // デバッグログ（5%の確率で出力）
    if (moved && Math.random() < 0.05) {
      this.log(player, `Moving to (${this.targetPosition.x.toFixed(1)}, ${this.targetPosition.z.toFixed(1)})`);
    }
  }

  /**
   * 目標位置を更新
   * @param newTarget 新しい目標位置
   */
  setTarget(newTarget: Vector3): void {
    this.targetPosition = newTarget;
  }

  /**
   * 腕のポーズタイプを変更
   * @param pose 新しいポーズ
   */
  setArmPoseType(pose: HandPose): void {
    this.armPose = pose;
  }
}
