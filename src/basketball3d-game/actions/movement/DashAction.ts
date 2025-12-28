import {Vector3} from "@babylonjs/core";
import {Action, GameContext} from "../Action";
import {Player, HandPose} from "../../entities/Player";
import {ActionFrameData, ActionFrameState, ActionPhase} from "../ActionFrame";

/**
 * ダッシュアクション
 * 短時間の爆発的な加速を行う
 */
export class DashAction extends Action {
  readonly name = "Dash";

  private targetPosition: Vector3;
  private armPose: HandPose;
  private frameState: ActionFrameState | null = null;

  // ダッシュのフレームデータ
  private static readonly FRAME_DATA: ActionFrameData = {
    startup: 12,    // 待機（ダッシュ開始前）
    windup: 3,     // 構え（体を前傾）
    active: 15,    // 発生（実際の加速期間）
    recovery: 10,  // フォロースルー（減速・姿勢を戻す）
  };

  /**
   * コンストラクタ
   * @param targetPosition ダッシュ先の目標位置
   * @param armPose ダッシュ中の腕のポーズ（デフォルト: NEUTRAL）
   */
  constructor(targetPosition: Vector3, armPose: HandPose = HandPose.NEUTRAL) {
    super();
    this.targetPosition = targetPosition;
    this.armPose = armPose;
  }

  canExecute(player: Player, _context: GameContext): boolean {
    // フレーム実行中の場合は継続実行可能
    if (this.frameState && !this.frameState.isCompleted()) {
      return true;
    }

    // ダッシュ中でない、かつクールダウンが終わっている場合のみ新規実行可能
    return !player.isDashing();
  }

  execute(player: Player, context: GameContext): void {
    // フレーム状態が初期化されていない場合は初期化
    if (!this.frameState) {
      this.frameState = new ActionFrameState(DashAction.FRAME_DATA);
      this.log(player, `Dash action started! Total frames: ${this.frameState.getTotalFrames()}`);
    }

    // フレームを進める
    const completed = this.frameState.advance(context.deltaTime);

    // 完了した場合はリセット
    if (completed) {
      this.log(player, "Dash action completed!");
      this.frameState = null;
      return;
    }

    // 現在の段階を取得
    const currentPhase = this.frameState.getCurrentPhase();

    // 段階に応じた処理
    switch (currentPhase) {
      case ActionPhase.STARTUP:
        // 待機段階：何もしない（硬直）
        break;

      case ActionPhase.WINDUP:
        // 構え段階：腕のポーズを設定、目標地点を向く
        this.setArmPose(player, this.armPose);
        const currentPos = player.getPosition();
        const dx = this.targetPosition.x - currentPos.x;
        const dz = this.targetPosition.z - currentPos.z;
        const angleToTarget = Math.atan2(dx, dz);
        player.setDirection(angleToTarget);
        break;

      case ActionPhase.ACTIVE:
        // 発生段階：実際にダッシュを開始・移動
        if (this.frameState.getCurrentFrame() === DashAction.FRAME_DATA.startup + DashAction.FRAME_DATA.windup) {
          // ACTIVE段階の最初のフレームでダッシュ開始
          player.startDash();
          this.log(player, "Dash ACTIVE phase - accelerating!");
        }
        // 移動
        player.moveTowards(this.targetPosition, context.deltaTime);
        break;

      case ActionPhase.RECOVERY:
        // フォロースルー段階：減速しながら移動継続
        player.moveTowards(this.targetPosition, context.deltaTime);
        break;
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

  /**
   * 現在のフレーム段階を取得
   */
  getCurrentPhase(): ActionPhase | null {
    return this.frameState ? this.frameState.getCurrentPhase() : null;
  }

  /**
   * アクションが実行中か
   */
  isInProgress(): boolean {
    return this.frameState !== null && !this.frameState.isCompleted();
  }

  /**
   * 現在のフレーム数を取得
   */
  getCurrentFrame(): number {
    return this.frameState ? this.frameState.getCurrentFrame() : 0;
  }

  /**
   * フレーム状態をリセット
   */
  resetFrameState(): void {
    this.frameState = null;
  }
}
