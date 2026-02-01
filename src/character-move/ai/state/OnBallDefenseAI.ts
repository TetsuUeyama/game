import { Vector3 } from "@babylonjs/core";
import { Character } from "../../entities/Character";
import { Ball } from "../../entities/Ball";
import { Field } from "../../entities/Field";
import { BaseStateAI } from "./BaseStateAI";
import { DEFENSE_DISTANCE, DEFENSE_PRESSURE, DefenseUtils } from "../../config/DefenseConfig";
import { ActionConfigUtils } from "../../config/action/ActionConfig";
import { WALK_FORWARD_MOTION } from "../../motion/WalkMotion";
import { DASH_FORWARD_MOTION } from "../../motion/DashMotion";

/**
 * オンボールディフェンダー時のAI
 *
 * 【行動原理】
 * 1. 最優先: シュートブロック判定
 * 2. 基本方針: オフェンスをゴールから遠ざける
 *    - 1on1接触時: ゴール方向に立ちはだかり、オフェンスを押し返す
 *    - 非接触時: オフェンスとゴールの間に位置取り
 * 3. 機会的: スティール試行
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

    // 【最優先】シュートブロック判定
    if (this.tryBlockShot(onBallPlayer)) {
      return;
    }

    const myPosition = this.character.getPosition();
    const offensePosition = onBallPlayer.getPosition();

    // 守るべきゴール位置を取得
    const goalPosition = this.getDefendingGoalPosition();

    // オフェンスからゴールへの方向ベクトル（正規化）
    const offenseToGoal = this.calculateOffenseToGoalDirection(offensePosition, goalPosition);

    // 現在の距離をチェック
    const currentDistance = Vector3.Distance(myPosition, offensePosition);

    // サークル接触距離を計算
    const defenderRadius = this.character.getFootCircleRadius();
    const offenseRadius = DEFENSE_DISTANCE.OFFENSE_CIRCLE_RADIUS;
    const contactDistance = DefenseUtils.calculateContactDistance(defenderRadius, offenseRadius);

    // サークルが重なったら1on1状態
    if (currentDistance <= contactDistance) {
      this.handle1on1State(onBallPlayer, offenseToGoal, deltaTime);
    } else {
      this.handleApproachState(onBallPlayer, offensePosition, offenseToGoal, contactDistance, deltaTime);
    }
  }

  /**
   * 守るべきゴール位置を取得
   * 自チームのゴールを守る
   */
  private getDefendingGoalPosition(): Vector3 {
    const defendingGoal = this.character.team === "ally"
      ? this.field.getGoal2Backboard()
      : this.field.getGoal1Backboard();
    return defendingGoal.position;
  }

  /**
   * オフェンスからゴールへの方向ベクトルを計算（正規化済み）
   */
  private calculateOffenseToGoalDirection(offensePosition: Vector3, goalPosition: Vector3): Vector3 {
    const direction = new Vector3(
      goalPosition.x - offensePosition.x,
      0,
      goalPosition.z - offensePosition.z
    );
    if (direction.length() > 0.01) {
      direction.normalize();
    }
    return direction;
  }

  /**
   * 1on1状態（サークル接触時）の処理
   * オフェンスをゴールから遠ざけることを目指す
   */
  private handle1on1State(
    onBallPlayer: Character,
    offenseToGoal: Vector3,
    deltaTime: number
  ): void {
    // オフェンスと対面する向きを維持（オフェンスの向きと180度反対）
    const offenseRotation = onBallPlayer.getRotation();
    const defenseRotation = offenseRotation + Math.PI;
    this.character.setRotation(defenseRotation);

    // オフェンスの動きを取得
    const offenseVelocity = onBallPlayer.velocity;

    // 押し返し強度を計算（defense値に基づく）
    const defenseValue = this.character.playerData?.stats?.defense;
    const pushStrength = DefenseUtils.calculatePushStrength(defenseValue);

    // 【核心】オフェンスをゴールから遠ざける方向に押す
    // = ゴールとは反対方向（offenseToGoalの逆）に向かって移動
    const pushDirection = offenseToGoal.scale(-1);

    // オフェンスが横移動している場合、それに追従しつつ押し返す
    if (offenseVelocity && offenseVelocity.length() > 0.1) {
      // オフェンスの速度を「横方向」と「縦方向」に分解
      // 縦方向 = ゴールへの方向
      // 横方向 = それに垂直な方向
      const forwardComponent = Vector3.Dot(offenseVelocity, offenseToGoal);
      const lateralVelocity = offenseVelocity.subtract(offenseToGoal.scale(forwardComponent));

      if (lateralVelocity.length() > 0.1) {
        // 横方向の移動があれば、ミラーリングして追従
        const lateralDir = lateralVelocity.normalize();
        const lateralStrength = DEFENSE_PRESSURE.LATERAL_MIRROR_STRENGTH;

        // 押し返し方向と横移動を組み合わせる
        // 押し返し（ゴールから遠ざける）+ 横移動（ゴール前に留まる）
        const combinedDirection = pushDirection.scale(pushStrength)
          .add(lateralDir.scale(lateralStrength));

        if (combinedDirection.length() > 0.01) {
          combinedDirection.normalize();
          this.character.move(combinedDirection, deltaTime);

          // 歩行モーションを再生
          if (this.character.getCurrentMotionName() !== 'walk_forward') {
            this.character.playMotion(WALK_FORWARD_MOTION);
          }
        }
        return;
      }
    }

    // オフェンスが停止しているか、縦方向（ゴール方向）のみ移動している場合
    // → 押し返し方向に移動してプレッシャーをかける
    if (pushStrength > 0) {
      this.character.move(pushDirection.scale(pushStrength), deltaTime);

      // 歩行モーションを再生
      if (this.character.getCurrentMotionName() !== 'walk_forward') {
        this.character.playMotion(WALK_FORWARD_MOTION);
      }
    }

    // 機会的にスティール/ディフェンスアクションを試みる
    if (DefenseUtils.shouldAttemptSteal()) {
      this.tryDefensiveAction();
    }
  }

  /**
   * 接近状態（サークル非接触時）の処理
   * オフェンスとゴールの間に位置取りし、0ポジション同士を合わせる
   * 衝突判定はCollisionHandler/ContestControllerに任せる
   */
  private handleApproachState(
    _onBallPlayer: Character,
    offensePosition: Vector3,
    offenseToGoal: Vector3,
    contactDistance: number,
    deltaTime: number
  ): void {
    const myPosition = this.character.getPosition();

    // 理想的な位置 = オフェンスの位置 + ゴール方向に接触距離分
    // つまり、オフェンスとゴールの間に立つ位置
    const idealPosition = new Vector3(
      offensePosition.x + offenseToGoal.x * contactDistance,
      offensePosition.y,
      offensePosition.z + offenseToGoal.z * contactDistance
    );

    // 理想位置への方向を計算
    const toIdealPosition = new Vector3(
      idealPosition.x - myPosition.x,
      0,
      idealPosition.z - myPosition.z
    );

    const distanceToIdeal = toIdealPosition.length();

    // 十分近い場合は移動しない（1on1状態への遷移を待つ）
    if (distanceToIdeal < 0.1) {
      // オフェンスの方を向く（ゴール方向の逆 = オフェンスへの方向）
      const toOffense = offenseToGoal.scale(-1);
      const angle = Math.atan2(toOffense.x, toOffense.z);
      this.character.setRotation(angle);
      return;
    }

    // 方向を正規化
    toIdealPosition.normalize();

    // 移動方向を向く
    const moveAngle = Math.atan2(toIdealPosition.x, toIdealPosition.z);
    this.character.setRotation(moveAngle);

    // 理想位置に向かって直接移動（衝突回避なし）
    // CollisionHandler/ContestControllerが衝突を処理する
    this.character.move(toIdealPosition, deltaTime);

    // 距離に応じたモーション
    if (distanceToIdeal > 5.0) {
      if (this.character.getCurrentMotionName() !== 'dash_forward') {
        this.character.playMotion(DASH_FORWARD_MOTION);
      }
    } else {
      if (this.character.getCurrentMotionName() !== 'walk_forward') {
        this.character.playMotion(WALK_FORWARD_MOTION);
      }
    }
  }

  /**
   * ディフェンシブアクションを試みる（スティール等）
   * @returns アクションを実行した場合true
   */
  private tryDefensiveAction(): boolean {
    const actionController = this.character.getActionController();

    // どのアクションを実行するか選択
    const action = DefenseUtils.selectDefensiveAction();

    if (action === 'steal') {
      const result = actionController.startAction('steal_attempt');
      return result.success;
    } else {
      const result = actionController.startAction('defense_stance');
      return result.success;
    }
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
    const blockRange = 3.0;

    if (distance > blockRange) {
      return false;
    }

    // 50%の確率でブロックを試みる
    const blockChance = 0.5;
    if (Math.random() > blockChance) {
      return false;
    }

    // シューターの方向に向きを変える
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
