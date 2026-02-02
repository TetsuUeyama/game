import { Vector3 } from "@babylonjs/core";
import { Character } from "../../entities/Character";
import { Ball } from "../../entities/Ball";
import { Field } from "../../entities/Field";
import { BaseStateAI } from "./BaseStateAI";
import { ShootingController } from "../../controllers/action/ShootingController";
import { FeintController } from "../../controllers/action/FeintController";
import { SHOOT_COOLDOWN, ShootingUtils } from "../../config/action/ShootingConfig";
import { DefenseUtils } from "../../config/DefenseConfig";
import { PASS_COOLDOWN, PassUtils } from "../../config/PassConfig";
import { IDLE_MOTION } from "../../motion/IdleMotion";
import { DRIBBLE_STANCE_MOTION } from "../../motion/DribbleMotion";
import { DASH_FORWARD_MOTION } from "../../motion/DashMotion";

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
    // デバッグログ: 現在の状態を出力
    const currentRotation = this.character.getRotation();
    const myPos = this.character.getPosition();
    console.log(`[OnBallOffenseAI] update開始: pos=(${myPos.x.toFixed(2)}, ${myPos.z.toFixed(2)}), rotation=${(currentRotation * 180 / Math.PI).toFixed(1)}°`);

    // フェイント成功後のドリブル突破ウィンドウ内ならドリブル突破を試みる
    if (this.feintController && this.feintController.isInBreakthroughWindow(this.character)) {
      if (this.tryBreakthroughAfterFeint()) {
        return;
      }
    }

    // 目標位置を決定（オーバーライドがあればそれを使用、なければゴール）
    const targetPosition = this.getTargetPosition();
    const myPosition = this.character.getPosition();

    console.log(`[OnBallOffenseAI] 目標位置: (${targetPosition.x.toFixed(2)}, ${targetPosition.z.toFixed(2)})`);

    // 【最優先】常にゴール方向を向く
    const toGoal = new Vector3(
      targetPosition.x - myPosition.x,
      0,
      targetPosition.z - myPosition.z
    );
    if (toGoal.length() > 0.01) {
      const goalAngle = Math.atan2(toGoal.x, toGoal.z);
      console.log(`[OnBallOffenseAI] ゴール方向に回転: ${(goalAngle * 180 / Math.PI).toFixed(1)}°`);
      this.character.setRotation(goalAngle);
    } else {
      console.log(`[OnBallOffenseAI] 目標が近すぎて回転不要: toGoal.length()=${toGoal.length()}`);
    }

    // 目の前にディフェンダーがいるかチェック
    const onBallDefender = this.findOnBallDefender();

    if (onBallDefender) {
      const defenderPosition = onBallDefender.getPosition();
      const distToDefender = Vector3.Distance(myPosition, defenderPosition);
      console.log(`[OnBallOffenseAI] ディフェンダー検出: ${onBallDefender.playerPosition}, 距離=${distToDefender.toFixed(2)}m`);

      // 視野ベースで1on1状態を判定
      // オフェンスプレイヤーの視野内にディフェンダーがいるかどうか
      const isDefenderInFOV = DefenseUtils.is1on1StateByFieldOfView(
        { x: myPosition.x, z: myPosition.z },
        this.character.getRotation(),
        { x: defenderPosition.x, z: defenderPosition.z }
      );

      console.log(`[OnBallOffenseAI] ディフェンダー視野内判定: ${isDefenderInFOV}`);

      if (isDefenderInFOV) {
        // ========================================
        // 1on1状態（ディフェンダーが視野内）
        // ========================================
        console.log(`[OnBallOffenseAI] handle1on1State呼び出し`);
        this.handle1on1State(targetPosition, deltaTime);
        return;
      } else {
        // ========================================
        // ディフェンダーが視野外に外れた瞬間
        // → ダッシュでゴールへ向かう OR シュートを狙う
        // ========================================
        console.log(`[OnBallOffenseAI] handleDefenderOutOfFOV呼び出し`);
        this.handleDefenderOutOfFOV(targetPosition, deltaTime);
        return;
      }
    }

    // ディフェンダーがいない場合
    console.log(`[OnBallOffenseAI] ディフェンダーなし、シュート/パス/移動を試行`);

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
    console.log(`[OnBallOffenseAI] moveTowardsWithBoundary呼び出し: stopDistance=${stopDistance}`);
    this.moveTowardsWithBoundary(targetPosition, deltaTime, stopDistance);
  }

  /**
   * 1on1状態（ディフェンダーが視野内）の処理
   * ドリブルモーションを使用し、アクションを実行
   */
  private handle1on1State(
    targetPosition: Vector3,
    deltaTime: number
  ): void {
    const myPosition = this.character.getPosition();
    console.log(`[OnBallOffenseAI] handle1on1State: myPos=(${myPosition.x.toFixed(2)}, ${myPosition.z.toFixed(2)})`);

    // 1on1時は常にドリブル構えモーションを再生（歩行・アイドル共通）
    if (this.character.getCurrentMotionName() !== 'dribble_stance') {
      this.character.playMotion(DRIBBLE_STANCE_MOTION);
    }

    // 目標への方向ベクトル（update()で既に向きは設定済み）
    const toTarget = new Vector3(
      targetPosition.x - myPosition.x,
      0,
      targetPosition.z - myPosition.z
    );

    // 1on1状態: まずパスを試みる（ポジションに応じた判定）
    // ただし目標位置オーバーライド時はパスしない（1on1テスト用）
    if (!this.targetPositionOverride && this.tryPass()) {
      console.log(`[OnBallOffenseAI] handle1on1State: パス実行`);
      return;
    }

    // アクションをランダムに選択
    const actionChoice = Math.random();
    if (actionChoice < 0.25) {
      // 25%: フェイント
      if (this.tryFeint()) {
        console.log(`[OnBallOffenseAI] handle1on1State: フェイント実行`);
        return;
      }
    } else if (actionChoice < 0.5) {
      // 25%: ドリブル突破
      if (this.tryDribbleMove()) {
        console.log(`[OnBallOffenseAI] handle1on1State: ドリブル突破実行`);
        return;
      }
    } else if (actionChoice < 0.7) {
      // 20%: シュート
      if (!this.targetPositionOverride && this.tryShoot()) {
        console.log(`[OnBallOffenseAI] handle1on1State: シュート実行`);
        return;
      }
    }
    // 30%: 動きながら様子を見る（ドリブルモーションを維持）

    // 1on1中も少し動く（目標方向に向かいながら）
    const distanceToTarget = toTarget.length();
    console.log(`[OnBallOffenseAI] handle1on1State: 目標距離=${distanceToTarget.toFixed(2)}m`);

    if (distanceToTarget > 0.5) {
      const direction = toTarget.normalize();
      // 境界チェック・衝突チェックを試みるが、失敗しても移動する
      let moveDirection = direction;
      const boundaryAdjusted = this.adjustDirectionForBoundary(direction, deltaTime);
      console.log(`[OnBallOffenseAI] handle1on1State: boundaryAdjusted=${boundaryAdjusted ? `(${boundaryAdjusted.x.toFixed(2)}, ${boundaryAdjusted.z.toFixed(2)})` : 'null'}`);

      if (boundaryAdjusted) {
        const adjustedDirection = this.adjustDirectionForCollision(boundaryAdjusted, deltaTime);
        console.log(`[OnBallOffenseAI] handle1on1State: collisionAdjusted=${adjustedDirection ? `(${adjustedDirection.x.toFixed(2)}, ${adjustedDirection.z.toFixed(2)})` : 'null'}`);
        if (adjustedDirection) {
          moveDirection = adjustedDirection;
        }
      }
      // ゆっくり移動（通常速度の50%）
      console.log(`[OnBallOffenseAI] handle1on1State: move(${moveDirection.x.toFixed(2)}, ${moveDirection.z.toFixed(2)}) * 0.5`);
      this.character.move(moveDirection.scale(0.5), deltaTime);
    } else {
      console.log(`[OnBallOffenseAI] handle1on1State: 目標に近いので移動スキップ`);
    }
  }

  /**
   * ディフェンダーが視野外に外れた時の処理
   * ダッシュでゴールへ向かうか、シュートレンジならシュート
   */
  private handleDefenderOutOfFOV(targetPosition: Vector3, deltaTime: number): void {
    const myPosition = this.character.getPosition();
    console.log(`[OnBallOffenseAI] handleDefenderOutOfFOV: myPos=(${myPosition.x.toFixed(2)}, ${myPosition.z.toFixed(2)})`);

    // 目標位置オーバーライド時以外は、まずシュートを試みる
    if (!this.targetPositionOverride && this.tryShoot()) {
      return;
    }

    // ダッシュで目標に向かう（向きはupdate()で既に設定済み）
    const toTarget = new Vector3(
      targetPosition.x - myPosition.x,
      0,
      targetPosition.z - myPosition.z
    );

    const distanceToTarget = toTarget.length();
    console.log(`[OnBallOffenseAI] 目標への距離: ${distanceToTarget.toFixed(2)}m`);

    if (distanceToTarget > 0.5) {
      // ダッシュモーションに切り替え
      if (this.character.getCurrentMotionName() !== 'dash_forward') {
        this.character.playMotion(DASH_FORWARD_MOTION);
      }

      // 移動方向を決定（境界チェック・衝突チェックを試みるが、失敗しても移動する）
      const direction = toTarget.normalize();
      let moveDirection = direction;
      const boundaryAdjusted = this.adjustDirectionForBoundary(direction, deltaTime);
      console.log(`[OnBallOffenseAI] boundaryAdjusted: ${boundaryAdjusted ? `(${boundaryAdjusted.x.toFixed(2)}, ${boundaryAdjusted.z.toFixed(2)})` : 'null'}`);

      if (boundaryAdjusted) {
        const adjustedDirection = this.adjustDirectionForCollision(boundaryAdjusted, deltaTime);
        console.log(`[OnBallOffenseAI] collisionAdjusted: ${adjustedDirection ? `(${adjustedDirection.x.toFixed(2)}, ${adjustedDirection.z.toFixed(2)})` : 'null'}`);
        if (adjustedDirection) {
          moveDirection = adjustedDirection;
        }
      }
      // 全速力でダッシュ
      console.log(`[OnBallOffenseAI] move呼び出し: direction=(${moveDirection.x.toFixed(2)}, ${moveDirection.z.toFixed(2)})`);
      this.character.move(moveDirection, deltaTime);
    } else {
      // 目標に近い場合はアイドル
      console.log(`[OnBallOffenseAI] 目標に近いのでアイドル`);
      if (this.character.getCurrentMotionName() !== 'idle') {
        this.character.playMotion(IDLE_MOTION);
      }
    }
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
