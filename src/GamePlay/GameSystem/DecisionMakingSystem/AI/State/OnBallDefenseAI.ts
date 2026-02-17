import { Vector3 } from "@babylonjs/core";
import { Character } from "@/GamePlay/Object/Entities/Character";
import { Ball } from "@/GamePlay/Object/Entities/Ball";
import { Field } from "@/GamePlay/Object/Entities/Field";
import { BaseStateAI } from "@/GamePlay/GameSystem/DecisionMakingSystem/AI/State/BaseStateAI";
import { DEFENSE_PRESSURE, DefenseUtils } from "@/GamePlay/GameSystem/DecisionMakingSystem/DefenseConfig";
import { ActionConfigUtils } from "@/GamePlay/GameSystem/CharacterMove/Config/Action/ActionConfig";
import { DASH_FORWARD_MOTION } from "@/GamePlay/GameSystem/CharacterMove/Motion/DashMotion";
import { DEFENSE_STANCE_MOTION } from "@/GamePlay/GameSystem/CharacterMove/Motion/DefenseMotion";
import { PlayerStateManager } from "@/GamePlay/GameSystem/StatusCheckSystem";
import { DefenseActionController } from "@/GamePlay/GameSystem/CharacterMove/Controllers/Action/DefenseActionController";

/**
 * オンボールディフェンダー時のAI
 *
 * 【行動原理】
 * 1. 最優先: オフェンスと自チームゴールの直線上に位置取り（ゴールを守る）
 * 2. シュートブロック判定
 * 3. 1on1状態での対面プレッシャー
 * 4. 機会的: スティール試行
 */
export class OnBallDefenseAI extends BaseStateAI {
  private defenseActionController: DefenseActionController | null = null;

  constructor(
    character: Character,
    ball: Ball,
    allCharacters: Character[],
    field: Field,
    playerState?: PlayerStateManager
  ) {
    super(character, ball, allCharacters, field, playerState);
  }

  /**
   * DefenseActionControllerを設定
   */
  public setDefenseActionController(controller: DefenseActionController): void {
    this.defenseActionController = controller;
  }

  /**
   * オフェンスとゴールを結ぶ直線上の理想的な守備位置を計算
   * @param offensePosition オフェンスの位置
   * @param goalPosition ゴールの位置
   * @param distanceFromOffense オフェンスからの距離
   */
  private calculateGoalLinePosition(
    offensePosition: Vector3,
    goalPosition: Vector3,
    distanceFromOffense: number
  ): Vector3 {
    // オフェンスからゴールへの方向ベクトル
    const toGoal = new Vector3(
      goalPosition.x - offensePosition.x,
      0,
      goalPosition.z - offensePosition.z
    );

    if (toGoal.length() < 0.01) {
      return offensePosition.clone();
    }

    toGoal.normalize();

    // オフェンスからゴール方向に指定距離だけ離れた位置
    return new Vector3(
      offensePosition.x + toGoal.x * distanceFromOffense,
      offensePosition.y,
      offensePosition.z + toGoal.z * distanceFromOffense
    );
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

    // シュートブロック判定
    if (this.tryBlockShot(onBallPlayer)) {
      return;
    }

    const myPosition = this.character.getPosition();
    const offensePosition = onBallPlayer.getPosition();
    const goalPosition = this.getDefendingGoalPosition();

    // サークル半径を取得
    const defenderRadius = this.character.getFootCircleRadius();
    const offenseRadius = onBallPlayer.getFootCircleRadius();
    const contactDistance = defenderRadius + offenseRadius;

    // 【最優先】オフェンスとゴールの直線上に位置取り
    const idealPosition = this.calculateGoalLinePosition(
      offensePosition,
      goalPosition,
      contactDistance
    );

    // 現在位置から理想位置へのベクトル
    const toIdealPosition = new Vector3(
      idealPosition.x - myPosition.x,
      0,
      idealPosition.z - myPosition.z
    );
    const distanceToIdeal = toIdealPosition.length();

    // ゴール方向を向く（オフェンスの方を向く）
    const toOffense = new Vector3(
      offensePosition.x - myPosition.x,
      0,
      offensePosition.z - myPosition.z
    );
    if (toOffense.length() > 0.01) {
      const faceAngle = Math.atan2(toOffense.x, toOffense.z);
      this.character.setRotation(faceAngle);
    }

    // 視野ベースで1on1状態を判定
    const isIn1on1 = DefenseUtils.is1on1StateByFieldOfView(
      { x: offensePosition.x, z: offensePosition.z },
      onBallPlayer.getRotation(),
      { x: myPosition.x, z: myPosition.z }
    );

    // 理想位置からの距離閾値
    const positionThreshold = 0.5;

    if (distanceToIdeal > positionThreshold) {
      // ゴールライン上に位置していない場合、急いで移動
      this.moveToGoalLine(toIdealPosition, distanceToIdeal, deltaTime);
    } else if (isIn1on1) {
      // ゴールライン上にいて、1on1状態
      this.handle1on1State(onBallPlayer, deltaTime);
    } else {
      // ゴールライン上にいるが、オフェンスの視野外
      this.handleApproachState(onBallPlayer, deltaTime);
    }
  }

  /**
   * ゴールライン上の位置へ移動
   */
  private moveToGoalLine(
    toIdealPosition: Vector3,
    distanceToIdeal: number,
    deltaTime: number
  ): void {
    const moveDirection = toIdealPosition.normalize();

    // 距離が遠い場合はダッシュ
    if (distanceToIdeal > 2.0) {
      if (this.character.getCurrentMotionName() !== 'dash_forward') {
        this.character.playMotion(DASH_FORWARD_MOTION);
      }
      this.character.move(moveDirection, deltaTime);
    } else {
      // 近い場合はディフェンスモーションで微調整
      if (this.character.getCurrentMotionName() !== 'defense_stance') {
        this.character.playMotion(DEFENSE_STANCE_MOTION);
      }
      const speedMultiplier = Math.min(1.0, distanceToIdeal / 1.0);
      this.character.move(moveDirection.scale(speedMultiplier), deltaTime);
    }
  }

  /**
   * 1on1状態（オフェンスの視野内にいる時）の処理
   * 互いの0番面（正面）の中心が一致するように位置取りし、プレッシャーをかける
   */
  private handle1on1State(
    onBallPlayer: Character,
    deltaTime: number
  ): void {
    const myPosition = this.character.getPosition();
    const offensePosition = onBallPlayer.getPosition();

    // オフェンスの0方向（正面が向いている方向）を取得
    const offenseRotation = onBallPlayer.getRotation();
    const offenseFacingDirection = new Vector3(
      Math.sin(offenseRotation),
      0,
      Math.cos(offenseRotation)
    );

    // オフェンスの0方向と対面する向きを維持（オフェンスの向きと180度反対）
    const defenseRotation = offenseRotation + Math.PI;
    this.character.setRotation(defenseRotation);

    // 1on1時は常にディフェンスモーションを維持
    if (this.character.getCurrentMotionName() !== 'defense_stance') {
      this.character.playMotion(DEFENSE_STANCE_MOTION);
    }

    // サークル半径を取得
    const defenderRadius = this.character.getFootCircleRadius();
    const offenseRadius = onBallPlayer.getFootCircleRadius();

    // ディフェンダーからオフェンスへの方向
    const defenderToOffense = new Vector3(
      offensePosition.x - myPosition.x,
      0,
      offensePosition.z - myPosition.z
    );
    const distanceToOffense = defenderToOffense.length();

    // オフェンスからディフェンダーへの方向を計算
    const offenseToDefender = defenderToOffense.scale(-1);
    if (offenseToDefender.length() > 0.01) {
      offenseToDefender.normalize();
    }

    // 内積で角度を計算（1 = 正面、0 = 横、-1 = 背後）
    const dotProduct = Vector3.Dot(offenseFacingDirection, offenseToDefender);

    // 正面判定の閾値（cos(45度) ≈ 0.707）
    const frontThreshold = 0.707;

    // サークル接触距離
    const contactDistance = DefenseUtils.calculateContactDistance(defenderRadius, offenseRadius);

    // サークルが接触しているかチェック
    const isInContact = distanceToOffense <= contactDistance + 0.1;

    // 斜めや横から接触している場合は、後ろに下がってスペースを確保
    if (isInContact && dotProduct < frontThreshold) {
      const backupDirection = defenderToOffense.normalize().scale(-1);
      this.character.move(backupDirection.scale(0.8), deltaTime);
      return;
    }

    // 理想的な位置: ディフェンダーの0番面中心がオフェンスの0番面中心と一致する位置
    // = オフェンスの位置 + オフェンスの正面方向 × (オフェンス半径 + ディフェンダー半径)
    const idealPosition = new Vector3(
      offensePosition.x + offenseFacingDirection.x * (offenseRadius + defenderRadius),
      offensePosition.y,
      offensePosition.z + offenseFacingDirection.z * (offenseRadius + defenderRadius)
    );

    // 現在位置から理想位置へのベクトル
    const toIdealPosition = new Vector3(
      idealPosition.x - myPosition.x,
      0,
      idealPosition.z - myPosition.z
    );
    const distanceToIdeal = toIdealPosition.length();

    // 0番面中心が一致していない場合は位置を修正
    // 閾値: 0.3m以上ずれていたら修正が必要
    const positionThreshold = 0.3;
    if (distanceToIdeal > positionThreshold) {
      const repositionDirection = toIdealPosition.normalize();
      const speedMultiplier = Math.min(1.0, distanceToIdeal / 2.0);
      this.character.move(repositionDirection.scale(speedMultiplier), deltaTime);

      if (DefenseUtils.shouldAttemptSteal()) {
        this.tryDefensiveAction();
      }
      return;
    }

    // 正面に位置している場合
    const offenseVelocity = onBallPlayer.velocity;
    const offenseSpeed = offenseVelocity ? offenseVelocity.length() : 0;

    // オフェンスが動いていない場合
    if (offenseSpeed < 0.1) {
      this.character.stopMovement();

      if (DefenseUtils.shouldAttemptSteal()) {
        this.tryDefensiveAction();
      }
      return;
    }

    // オフェンスが動いている場合、追従する
    const defenseValue = this.character.playerData?.stats?.defense;
    const pushStrength = DefenseUtils.calculatePushStrength(defenseValue);

    // オフェンスの0方向に対して押し返す
    const pushDirection = offenseFacingDirection.scale(-1);

    // オフェンスの速度を「縦方向」と「横方向」に分解
    const forwardComponent = Vector3.Dot(offenseVelocity, offenseFacingDirection);
    const lateralVelocity = offenseVelocity.subtract(offenseFacingDirection.scale(forwardComponent));

    if (lateralVelocity.length() > 0.1) {
      const lateralDir = lateralVelocity.normalize();
      const lateralStrength = DEFENSE_PRESSURE.LATERAL_MIRROR_STRENGTH;

      const combinedDirection = pushDirection.scale(pushStrength)
        .add(lateralDir.scale(lateralStrength));

      if (combinedDirection.length() > 0.01) {
        combinedDirection.normalize();
        this.character.move(combinedDirection, deltaTime);
      }
    } else {
      if (pushStrength > 0) {
        this.character.move(pushDirection.scale(pushStrength), deltaTime);
      }
    }
  }

  /**
   * 接近状態（オフェンスの視野外にいる時）の処理
   * 抜かれた状態なので、急いでオフェンスの正面に回り込む
   * 0番面中心が一致する位置を目指す
   * オフェンスのサークルに衝突する場合は横に回り込む
   */
  private handleApproachState(
    onBallPlayer: Character,
    deltaTime: number
  ): void {
    const myPosition = this.character.getPosition();
    const offensePosition = onBallPlayer.getPosition();

    // オフェンスの0方向（正面が向いている方向）を取得
    const offenseRotation = onBallPlayer.getRotation();
    const offenseFacingDirection = new Vector3(
      Math.sin(offenseRotation),
      0,
      Math.cos(offenseRotation)
    );

    // サークル半径を取得
    const defenderRadius = this.character.getFootCircleRadius();
    const offenseRadius = onBallPlayer.getFootCircleRadius();

    // 理想的な位置: ディフェンダーの0番面中心がオフェンスの0番面中心と一致する位置
    // = オフェンスの位置 + オフェンスの正面方向 × (オフェンス半径 + ディフェンダー半径)
    const idealPosition = new Vector3(
      offensePosition.x + offenseFacingDirection.x * (offenseRadius + defenderRadius),
      offensePosition.y,
      offensePosition.z + offenseFacingDirection.z * (offenseRadius + defenderRadius)
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
      this.character.stopMovement();
      // オフェンスの方を向く
      const defenseRotation = offenseRotation + Math.PI;
      this.character.setRotation(defenseRotation);
      return;
    }

    // ディフェンダーからオフェンスへの方向
    const toOffense = new Vector3(
      offensePosition.x - myPosition.x,
      0,
      offensePosition.z - myPosition.z
    );
    const distanceToOffense = toOffense.length();

    // オフェンスのサークルに衝突する距離かチェック
    const collisionDistance = offenseRadius + defenderRadius + 0.3; // 少し余裕を持たせる

    let moveDirection: Vector3;

    if (distanceToOffense < collisionDistance) {
      // オフェンスに近すぎる場合、横に回り込む
      // オフェンスの正面方向に対して垂直な方向（左右）を計算
      const leftDirection = new Vector3(
        -offenseFacingDirection.z,
        0,
        offenseFacingDirection.x
      );
      const rightDirection = new Vector3(
        offenseFacingDirection.z,
        0,
        -offenseFacingDirection.x
      );

      // 理想位置に近い方向を選択
      const leftTarget = offensePosition.add(leftDirection.scale(collisionDistance));
      const rightTarget = offensePosition.add(rightDirection.scale(collisionDistance));

      const distToLeft = Vector3.Distance(myPosition, leftTarget) + Vector3.Distance(leftTarget, idealPosition);
      const distToRight = Vector3.Distance(myPosition, rightTarget) + Vector3.Distance(rightTarget, idealPosition);

      // 短い経路を選択
      if (distToLeft < distToRight) {
        moveDirection = new Vector3(
          leftTarget.x - myPosition.x,
          0,
          leftTarget.z - myPosition.z
        ).normalize();
      } else {
        moveDirection = new Vector3(
          rightTarget.x - myPosition.x,
          0,
          rightTarget.z - myPosition.z
        ).normalize();
      }
    } else {
      // 衝突しない距離なら直接理想位置へ
      moveDirection = toIdealPosition.normalize();
    }

    // 移動方向を向く（正面に回り込むために全力で走る）
    const moveAngle = Math.atan2(moveDirection.x, moveDirection.z);
    this.character.setRotation(moveAngle);

    // 理想位置に向かって全速力で移動
    this.character.move(moveDirection, deltaTime);

    // 常にダッシュモーション（抜かれた状態なので急ぐ）
    if (this.character.getCurrentMotionName() !== 'dash_forward') {
      this.character.playMotion(DASH_FORWARD_MOTION);
    }
  }

  /**
   * ディフェンシブアクションを試みる（スティール等）
   * @returns アクションを実行した場合true
   */
  private tryDefensiveAction(): boolean {
    if (!this.defenseActionController) {
      return false;
    }

    // どのアクションを実行するか選択
    const action = DefenseUtils.selectDefensiveAction();

    if (action === 'steal') {
      return this.defenseActionController.performDefensiveAction(this.character, 'steal_attempt');
    } else {
      return this.defenseActionController.performDefensiveAction(this.character, 'defense_stance');
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

    // ブロックアクションを開始（DefenseActionController経由）
    if (!this.defenseActionController) {
      return false;
    }

    return this.defenseActionController.performBlockShot(this.character, shooter);
  }
}
