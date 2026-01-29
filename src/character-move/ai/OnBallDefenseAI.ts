import { Vector3 } from "@babylonjs/core";
import { Character } from "../entities/Character";
import { Ball } from "../entities/Ball";
import { Field } from "../entities/Field";
import { BaseStateAI } from "./BaseStateAI";
import { DEFENSE_DISTANCE, DefenseUtils } from "../config/DefenseConfig";
import { ActionConfigUtils } from "../config/ActionConfig";
import { IDLE_MOTION } from "../motion/IdleMotion";

/**
 * オンボールディフェンダー時のAI
 * ボール保持者に対してディフェンスする
 */
export class OnBallDefenseAI extends BaseStateAI {
  constructor(
    character: Character,
    ball: Ball,
    allCharacters: Character[],
    field: Field
  ) {
    super(character, ball, allCharacters, field);
  }

  /**
   * AIの更新処理
   */
  public update(deltaTime: number): void {
    // オンボールプレイヤーを探す
    const onBallPlayer = this.findOnBallPlayer();
    if (!onBallPlayer) {
      return;
    }

    // 相手がシュートを打とうとしているかチェックし、ブロックを試みる
    if (this.tryBlockShot(onBallPlayer)) {
      return; // ブロックアクション開始したので他の処理をスキップ
    }

    const myPosition = this.character.getPosition();
    const onBallPosition = onBallPlayer.getPosition();

    // 現在の距離をチェック
    const currentDistance = Vector3.Distance(myPosition, onBallPosition);

    // DefenseUtilsを使用してサークルが重なる距離を計算
    const defenderRadius = this.character.getFootCircleRadius();
    const offenseRadius = DEFENSE_DISTANCE.OFFENSE_CIRCLE_RADIUS;
    const targetDistance = DefenseUtils.calculateContactDistance(defenderRadius, offenseRadius);

    // サークルが重なったら1on1状態で停止
    if (currentDistance <= targetDistance) {
      // 停止時は待機モーションを再生
      if (this.character.getCurrentMotionName() !== 'idle') {
        this.character.playMotion(IDLE_MOTION);
      }

      // ディフェンス側はオフェンス側の0ポジションに自分の0ポジションを合わせる
      // オフェンス側の向きと反対方向（対面する向き）を向く
      const offenseRotation = onBallPlayer.getRotation();
      const defenseRotation = offenseRotation + Math.PI; // 180度反対方向
      this.character.setRotation(defenseRotation);

      return;
    }

    // サークルが重なっていない場合は、オンボールプレイヤーに近づく
    // 守るべきゴールを決定（自チームのゴールを守る）
    const defendingGoal = this.character.team === "ally" ? this.field.getGoal2Backboard() : this.field.getGoal1Backboard();
    const goalPosition = defendingGoal.position;

    // オンボールプレイヤーからゴールへの方向ベクトルを計算
    const toGoal = new Vector3(
      goalPosition.x - onBallPosition.x,
      0,
      goalPosition.z - onBallPosition.z
    );

    // 方向を正規化
    const direction = toGoal.normalize();

    // オンボールプレイヤーから目標距離離れた位置（ゴール方向）
    const targetPosition = new Vector3(
      onBallPosition.x + direction.x * targetDistance,
      onBallPosition.y,
      onBallPosition.z + direction.z * targetDistance
    );

    // 目標位置に向かって移動（サークルが重なる距離まで近づく）
    this.moveTowards(targetPosition, deltaTime, 0.1);

    // 常にオンボールプレイヤーの方を向く
    this.faceTowards(onBallPlayer);
  }

  /**
   * シュートブロックを試みる（物理判定ベース）
   * ディフェンダーがジャンプして手を上げ、ボールに当たったらルーズボールになる
   * シューターの方向に向かって斜めに飛び、ボールの軌道をブロックする
   * @param shooter シュートを打っている（または打とうとしている）プレイヤー
   * @returns ブロックアクションを開始した場合true
   */
  private tryBlockShot(shooter: Character): boolean {
    // シューターのActionController状態を確認
    const shooterActionController = shooter.getActionController();
    const shooterAction = shooterActionController.getCurrentAction();
    const shooterPhase = shooterActionController.getCurrentPhase();

    // シューターがシュートアクション中かチェック（3pt、ミドルレンジのみ）
    if (!shooterAction || !ActionConfigUtils.isShootAction(shooterAction)) {
      return false;
    }

    // レイアップはブロックしない（近距離で素早いため）
    if (shooterAction === 'shoot_layup') {
      return false;
    }

    // startupまたはactiveフェーズでブロックを試みる
    if (shooterPhase !== 'startup' && shooterPhase !== 'active') {
      return false;
    }

    // 距離チェック：近くにいないとブロックできない（3m以内）
    const myPosition = this.character.getPosition();
    const shooterPosition = shooter.getPosition();
    const distance = Vector3.Distance(myPosition, shooterPosition);
    const blockRange = 3.0; // ブロック可能距離

    if (distance > blockRange) {
      return false;
    }

    // 50%の確率でブロックを試みる
    const blockChance = 0.5;
    if (Math.random() > blockChance) {
      return false;
    }

    // シューターの方向に向きを変える（ボールの軌道に手を入れるため）
    const toShooter = shooterPosition.subtract(myPosition);
    toShooter.y = 0;
    if (toShooter.length() > 0.01) {
      const angle = Math.atan2(toShooter.x, toShooter.z);
      this.character.setRotation(angle);
    }

    // ブロックアクションを開始
    const actionController = this.character.getActionController();
    const result = actionController.startAction('block_shot');

    if (result.success) {
      // ブロックジャンプ情報を設定（シューターの方向に飛ぶ）
      this.character.setBlockJumpTarget(shooter);

      return true;
    }

    return false;
  }
}
