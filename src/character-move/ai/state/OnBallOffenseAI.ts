import { Vector3 } from "@babylonjs/core";
import { Character } from "../../entities/Character";
import { Ball } from "../../entities/Ball";
import { Field } from "../../entities/Field";
import { BaseStateAI } from "./BaseStateAI";
import { ShootingController } from "../../controllers/action/ShootingController";
import { FeintController } from "../../controllers/action/FeintController";
import { SHOOT_COOLDOWN, ShootingUtils } from "../../config/action/ShootingConfig";
import { DEFENSE_DISTANCE, DefenseUtils } from "../../config/DefenseConfig";
import { PASS_COOLDOWN, PassUtils } from "../../config/PassConfig";
import { IDLE_MOTION } from "../../motion/IdleMotion";
import { WALK_FORWARD_MOTION } from "../../motion/WalkMotion";

/**
 * パス実行時のコールバック型
 */
export type PassCallback = (
  passer: Character,
  target: Character,
  passType: 'pass_chest' | 'pass_bounce' | 'pass_overhead'
) => { success: boolean; message: string };

/**
 * オンボールオフェンス時のAI
 * ボール保持者として攻撃を組み立てる
 */
export class OnBallOffenseAI extends BaseStateAI {
  private shootingController: ShootingController | null = null;
  private feintController: FeintController | null = null;
  private passCallback: PassCallback | null = null;

  // シュートクールダウン（連続シュート防止）
  private shootCooldown: number = 0;
  // フェイントクールダウン（連続フェイント防止）
  private feintCooldown: number = 0;
  // パスクールダウン（連続パス防止）
  private passCooldown: number = 0;

  // 目標位置オーバーライド（設定時はゴールではなくこの位置に向かう）
  private targetPositionOverride: Vector3 | null = null;

  constructor(
    character: Character,
    ball: Ball,
    allCharacters: Character[],
    field: Field
  ) {
    super(character, ball, allCharacters, field);
  }

  /**
   * ShootingControllerを設定
   */
  public setShootingController(controller: ShootingController): void {
    this.shootingController = controller;
  }

  /**
   * FeintControllerを設定
   */
  public setFeintController(controller: FeintController): void {
    this.feintController = controller;
  }

  /**
   * パスコールバックを設定
   */
  public setPassCallback(callback: PassCallback): void {
    this.passCallback = callback;
  }

  /**
   * 目標位置オーバーライドを設定
   * 設定するとゴールではなくこの位置に向かい、シュートは行わない
   */
  public setTargetPositionOverride(position: Vector3 | null): void {
    this.targetPositionOverride = position;
  }

  /**
   * 目標位置オーバーライドをクリア
   */
  public clearTargetPositionOverride(): void {
    this.targetPositionOverride = null;
  }

  /**
   * クールダウンを更新
   */
  public updateCooldowns(deltaTime: number): void {
    if (this.shootCooldown > 0) {
      this.shootCooldown -= deltaTime;
    }
    if (this.feintCooldown > 0) {
      this.feintCooldown -= deltaTime;
    }
    if (this.passCooldown > 0) {
      this.passCooldown -= deltaTime;
    }
  }

  /**
   * AIの更新処理
   */
  public update(deltaTime: number): void {
    // フェイント成功後のドリブル突破ウィンドウ内ならドリブル突破を試みる
    if (this.feintController && this.feintController.isInBreakthroughWindow(this.character)) {
      if (this.tryBreakthroughAfterFeint()) {
        return;
      }
    }

    // 目標位置を決定（オーバーライドがあればそれを使用、なければゴール）
    const targetPosition = this.getTargetPosition();

    // 目の前にディフェンダーがいるかチェック
    const onBallDefender = this.findOnBallDefender();

    if (onBallDefender) {
      const myPosition = this.character.getPosition();
      const defenderPosition = onBallDefender.getPosition();

      // ディフェンダーとの距離をチェック
      const distance = Vector3.Distance(myPosition, defenderPosition);

      // DefenseUtilsを使用してサークルが重なる距離を計算
      const offenseRadius = DEFENSE_DISTANCE.OFFENSE_CIRCLE_RADIUS;
      const defenderRadius = onBallDefender.getFootCircleRadius();
      const minDistance = DefenseUtils.calculateContactDistance(offenseRadius, defenderRadius);

      // サークルが重なったら1on1状態で停止
      if (distance <= minDistance) {
        // 停止時は待機モーションを再生
        if (this.character.getCurrentMotionName() !== 'idle') {
          this.character.playMotion(IDLE_MOTION);
        }

        // オフェンス側は常に目標方向を向く（最優先）
        const toTarget = new Vector3(
          targetPosition.x - myPosition.x,
          0,
          targetPosition.z - myPosition.z
        );
        if (toTarget.length() > 0.01) {
          const angle = Math.atan2(toTarget.x, toTarget.z);
          this.character.setRotation(angle);
        }

        // 1on1状態: まずパスを試みる（ポジションに応じた判定）
        // ただし目標位置オーバーライド時はパスしない（1on1テスト用）
        if (!this.targetPositionOverride && this.tryPass()) {
          return;
        }

        // 目標位置オーバーライド時（1on1テスト）は、ランダムにアクションを選択
        if (this.targetPositionOverride) {
          const actionChoice = Math.random();
          if (actionChoice < 0.3) {
            // 30%: フェイント
            if (this.tryFeint()) {
              return;
            }
          } else if (actionChoice < 0.7) {
            // 40%: ドリブルムーブ
            if (this.tryDribbleMove()) {
              return;
            }
          }
          // 30%: 何もしない（プレッシャーをかけられている状態）
          return;
        }

        // 通常時: フェイントを試みる（確率でフェイントまたはシュートを選択）
        if (this.tryFeint()) {
          return; // フェイント実行した場合、シュートは打たない
        }

        // フェイントを選択しなかった場合、シュートを試みる
        if (this.tryShoot()) {
          return;
        }

        return;
      }

      // ディフェンダーのサークルに入らないように、ディフェンダーから離れる方向に移動
      // DefenseUtilsを使用して近づきすぎをチェック
      if (DefenseUtils.isTooCloseToOffense(distance, offenseRadius, defenderRadius)) {
        // ディフェンダーから離れる方向を計算
        const awayDirection = new Vector3(
          myPosition.x - defenderPosition.x,
          0,
          myPosition.z - defenderPosition.z
        );

        if (awayDirection.length() > 0.01) {
          awayDirection.normalize();

          // 目標方向とディフェンダーから離れる方向を組み合わせる
          const toTarget = new Vector3(
            targetPosition.x - myPosition.x,
            0,
            targetPosition.z - myPosition.z
          );
          toTarget.normalize();

          // 60%目標方向、40%ディフェンダーから離れる方向
          const combinedDirection = toTarget.scale(0.6).add(awayDirection.scale(0.4));
          combinedDirection.normalize();

          // 境界チェック（オフェンスはフィールド外に出ない）
          const boundaryAdjusted = this.adjustDirectionForBoundary(combinedDirection, deltaTime);
          if (!boundaryAdjusted) {
            // 境界に達したら停止
            if (this.character.getCurrentMotionName() !== 'idle') {
              this.character.playMotion(IDLE_MOTION);
            }
            return;
          }

          // 衝突を考慮して移動
          const adjustedDirection = this.adjustDirectionForCollision(boundaryAdjusted, deltaTime);

          if (adjustedDirection) {
            this.character.move(adjustedDirection, deltaTime);

            if (this.character.getCurrentMotionName() !== 'walk_forward') {
              this.character.playMotion(WALK_FORWARD_MOTION);
            }
          } else {
            if (this.character.getCurrentMotionName() !== 'idle') {
              this.character.playMotion(IDLE_MOTION);
            }
          }
        }
        return;
      }
    }

    // ディフェンダーがいないか遠い場合
    // まずシュートを試みる（ディフェンダーなしでシュートレンジ内なら打つ）
    // 目標位置オーバーライド時はシュートしない
    if (!this.targetPositionOverride && this.tryShoot()) {
      return;
    }

    // シュートできない場合、パスを試みる
    // 目標位置オーバーライド時はパスしない
    if (!this.targetPositionOverride && this.tryPass()) {
      return;
    }

    // 目標位置に向かって移動（境界チェック付き）
    const stopDistance = this.targetPositionOverride ? 0.5 : 2.0; // オーバーライド時は目標近くまで行く
    this.moveTowardsWithBoundary(targetPosition, deltaTime, stopDistance);
  }

  /**
   * 目標位置を取得（オーバーライドがあればそれを、なければゴール位置を返す）
   */
  private getTargetPosition(): Vector3 {
    if (this.targetPositionOverride) {
      return this.targetPositionOverride;
    }
    const attackingGoal = this.character.team === "ally" ? this.field.getGoal1Backboard() : this.field.getGoal2Backboard();
    return attackingGoal.position;
  }

  /**
   * シュートを試みる
   * @returns シュートを打った場合true
   */
  private tryShoot(): boolean {
    // ShootingControllerがない場合はスキップ
    if (!this.shootingController) {
      return false;
    }

    // クールダウン中はスキップ
    if (this.shootCooldown > 0) {
      return false;
    }

    // ゴールまでの距離を計算（向きに関係なく）
    // 攻めるべきゴールを取得（allyは+Z側のgoal1、enemyは-Z側のgoal2）
    const attackingGoal = this.character.team === 'ally'
      ? this.field.getGoal1Rim()
      : this.field.getGoal2Rim();
    const goalPosition = attackingGoal.position;
    const myPos = this.character.getPosition();
    const dx = goalPosition.x - myPos.x;
    const dz = goalPosition.z - myPos.z;
    const distanceToGoal = Math.sqrt(dx * dx + dz * dz);

    // ShootingUtilsを使用してレンジ判定
    if (!ShootingUtils.isInShootRange(distanceToGoal)) {
      return false;
    }

    // シュートレンジ内に入ったらゴール方向を向く
    const angle = Math.atan2(dx, dz);
    this.character.setRotation(angle);

    // 向きを変えた後、正式にチェック
    const rangeInfo = this.shootingController.getShootRangeInfo(this.character);

    if (!rangeInfo.inRange || !rangeInfo.facingGoal) {
      return false;
    }

    // シュートタイプに応じた処理（rangeInfo.shootTypeを使用）
    let shouldShoot = false;

    switch (rangeInfo.shootType) {
      case '3pt':
      case 'midrange':
      case 'layup':
        shouldShoot = true;
        break;
    }

    if (shouldShoot) {
      // シュート実行（ActionController経由でアニメーション付き）
      const result = this.shootingController.startShootAction(this.character);
      if (result.success) {
        // SHOOT_COOLDOWN.AFTER_SHOTを使用してクールダウンを設定
        this.shootCooldown = SHOOT_COOLDOWN.AFTER_SHOT;
        return true;
      }
    }

    return false;
  }

  /**
   * シュートフェイントを試みる
   * 条件: ボールが0面にある、シュートレンジ内（または目標位置オーバーライド時）、フェイントクールダウン終了
   * 条件合致時に確率でフェイントを選択
   * @returns フェイントを実行した場合true
   */
  private tryFeint(): boolean {
    // FeintControllerがない場合は実行不可
    if (!this.feintController) {
      return false;
    }

    // フェイントクールダウン中は実行不可
    if (this.feintCooldown > 0) {
      return false;
    }

    // ボールを持っているか確認
    if (this.ball.getHolder() !== this.character) {
      return false;
    }

    // ボールが0面にあるか確認
    const currentBallFace = this.character.getCurrentBallFace();
    if (currentBallFace !== 0) {
      return false;
    }

    // 目標位置オーバーライド時はシュートレンジチェックをスキップ
    if (!this.targetPositionOverride) {
      // シュートレンジ内か確認
      if (!this.shootingController) {
        return false;
      }

      const rangeInfo = this.shootingController.getShootRangeInfo(this.character);
      if (!rangeInfo || !rangeInfo.inRange) {
        return false;
      }
    }

    // 条件が揃った場合、確率でフェイントを選択
    // 目標位置オーバーライド時は30%、通常時は50%
    const feintChance = this.targetPositionOverride ? 0.3 : 0.5;
    if (Math.random() > feintChance) {
      return false; // フェイントを選択しなかった
    }

    // フェイント実行
    const result = this.feintController.performShootFeint(this.character);
    if (result && result.success) {
      // フェイントクールダウンを設定
      this.feintCooldown = 2.0; // 2秒間フェイント不可
      return true;
    }

    return false;
  }

  /**
   * フェイント成功後のドリブル突破を試みる
   * @returns ドリブル突破を実行した場合true
   */
  private tryBreakthroughAfterFeint(): boolean {
    if (!this.feintController) {
      return false;
    }

    // ドリブル突破方向をランダムに決定（左か右）
    const direction = Math.random() < 0.5 ? 'left' : 'right';

    return this.feintController.performBreakthroughAfterFeint(this.character, direction);
  }

  /**
   * ドリブルムーブを試みる
   * @returns ドリブルムーブを実行した場合true
   */
  private tryDribbleMove(): boolean {
    // ボールを持っているか確認
    if (this.ball.getHolder() !== this.character) {
      return false;
    }

    // ドリブル突破アクションを実行
    const actionController = this.character.getActionController();
    const result = actionController.startAction('dribble_breakthrough');

    return result.success;
  }

  /**
   * パスを試みる
   * - センター(C)がゴール下以外でボールを持ったらPGにパス
   * - PGがゴール下にいるCにパスを通す
   * @returns パスを実行した場合true
   */
  private tryPass(): boolean {
    // パスコールバックがない場合は実行不可
    if (!this.passCallback) {
      return false;
    }

    // パスクールダウン中は実行不可
    if (this.passCooldown > 0) {
      return false;
    }

    // ボールを持っているか確認
    if (this.ball.getHolder() !== this.character) {
      return false;
    }

    const myPosition = this.character.playerPosition;
    const myPos = this.character.getPosition();

    // 攻めるべきゴールを取得
    const attackingGoal = this.character.team === 'ally'
      ? this.field.getGoal1Rim()
      : this.field.getGoal2Rim();
    const goalPosition = attackingGoal.position;

    // 自分がゴール下にいるかどうかを判定
    const amINearGoal = PassUtils.isNearGoal(
      { x: myPos.x, z: myPos.z },
      { x: goalPosition.x, z: goalPosition.z }
    );

    // チームメイトを取得
    const teammates = this.allCharacters.filter(
      c => c.team === this.character.team && c !== this.character
    );

    let passTarget: Character | null = null;

    // センター(C)がゴール下以外でボールを持っている場合 → PGにパス
    if (myPosition === 'C' && !amINearGoal) {
      passTarget = teammates.find(c => c.playerPosition === 'PG') || null;
    }

    // PGがボールを持っている場合 → ゴール下にいるCにパス
    if (myPosition === 'PG' && !passTarget) {
      const centerPlayer = teammates.find(c => c.playerPosition === 'C');
      if (centerPlayer) {
        const centerPos = centerPlayer.getPosition();
        const isCenterNearGoal = PassUtils.isNearGoal(
          { x: centerPos.x, z: centerPos.z },
          { x: goalPosition.x, z: goalPosition.z }
        );
        if (isCenterNearGoal) {
          passTarget = centerPlayer;
        }
      }
    }

    // パスターゲットがいない場合は実行しない
    if (!passTarget) {
      return false;
    }

    // パス先との距離を確認
    const targetPos = passTarget.getPosition();
    const distance = Vector3.Distance(myPos, targetPos);
    if (!PassUtils.isPassableDistance(distance)) {
      return false;
    }

    // パスターゲットの方を向く
    const toTarget = new Vector3(
      targetPos.x - myPos.x,
      0,
      targetPos.z - myPos.z
    );
    if (toTarget.length() > 0.01) {
      const angle = Math.atan2(toTarget.x, toTarget.z);
      this.character.setRotation(angle);
    }

    // パス実行（コールバック経由）
    const result = this.passCallback(this.character, passTarget, 'pass_chest');
    if (result.success) {
      this.passCooldown = PASS_COOLDOWN.AFTER_PASS;
      return true;
    }

    return false;
  }
}
