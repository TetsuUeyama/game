import { Vector3 } from "@babylonjs/core";
import { Character } from "../../entities/Character";
import { Ball } from "../../entities/Ball";
import { Field } from "../../entities/Field";
import { BaseStateAI } from "./BaseStateAI";
import { DEFENSE_PRESSURE, DefenseUtils } from "../../config/DefenseConfig";
import { ActionConfigUtils } from "../../config/action/ActionConfig";
import { DASH_FORWARD_MOTION } from "../../motion/DashMotion";
import { DEFENSE_STANCE_MOTION } from "../../motion/DefenseMotion";

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

    // 視野ベースで1on1状態を判定
    // オフェンスプレイヤーの視野内にディフェンダー（自分）がいるかどうか
    const isIn1on1 = DefenseUtils.is1on1StateByFieldOfView(
      { x: offensePosition.x, z: offensePosition.z },
      onBallPlayer.getRotation(),
      { x: myPosition.x, z: myPosition.z }
    );

    if (isIn1on1) {
      // 1on1状態（オフェンスの視野内にいる）
      this.handle1on1State(onBallPlayer, deltaTime);
    } else {
      // オフェンスの視野外 → 急いでオフェンスの正面に回り込む
      this.handleApproachState(onBallPlayer, deltaTime);
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

    // 方向を正規化
    const moveDirection = toIdealPosition.normalize();

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
