import {Action, GameContext} from "../Action";
import {Player, HandPose} from "../../entities/Player";
import {ActionFrameData, ActionFrameState, ActionPhase} from "../ActionFrame";

/**
 * ジャンプアクション
 * プレイヤーをジャンプさせる
 */
export class JumpAction extends Action {
  readonly name = "Jump";

  private armPose: HandPose;
  private frameState: ActionFrameState | null = null;

  // ジャンプのフレームデータ
  private static readonly FRAME_DATA: ActionFrameData = {
    startup: 18,     // 待機（ジャンプ準備前）
    windup: 10,     // 構え（膝を曲げる）
    active: 20,     // 発生（空中滞空時間）
    recovery: 12,   // フォロースルー（着地の硬直）
  };

  /**
   * コンストラクタ
   * @param armPose ジャンプ中の腕のポーズ（デフォルト: NEUTRAL）
   */
  constructor(armPose: HandPose = HandPose.NEUTRAL) {
    super();
    this.armPose = armPose;
  }

  canExecute(player: Player, _context: GameContext): boolean {
    // フレーム実行中の場合は継続実行可能
    if (this.frameState && !this.frameState.isCompleted()) {
      return true;
    }

    // ジャンプ中でない、かつ地面にいる場合のみ新規実行可能
    return !player.isJumping;
  }

  execute(player: Player, context: GameContext): void {
    // フレーム状態が初期化されていない場合は初期化
    if (!this.frameState) {
      this.frameState = new ActionFrameState(JumpAction.FRAME_DATA);
      this.log(player, `Jump action started! Total frames: ${this.frameState.getTotalFrames()}`);
    }

    // フレームを進める
    const completed = this.frameState.advance(context.deltaTime);

    // 完了した場合はリセット
    if (completed) {
      this.log(player, "Jump action completed!");
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
        // 構え段階：腕のポーズを設定（膝を曲げるモーション）
        this.setArmPose(player, this.armPose);
        break;

      case ActionPhase.ACTIVE:
        // 発生段階：実際にジャンプを開始
        const startupWindupFrames = JumpAction.FRAME_DATA.startup + JumpAction.FRAME_DATA.windup;
        if (this.frameState.getCurrentFrame() >= startupWindupFrames &&
            this.frameState.getCurrentFrame() < startupWindupFrames + 1) {
          // ACTIVE段階の最初のフレームでジャンプ開始
          player.startJump();
          this.log(player, "Jump ACTIVE phase - in the air!");
        }
        break;

      case ActionPhase.RECOVERY:
        // フォロースルー段階：着地後の硬直
        // プレイヤーは自動的に地面に戻る
        break;
    }
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
