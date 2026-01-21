import { Vector3 } from "@babylonjs/core";
import { Character } from "../entities/Character";
import { Ball } from "../entities/Ball";
import { CharacterState } from "../types/CharacterState";
import { Field } from "../entities/Field";
import { IDLE_MOTION } from "../data/IdleMotion";
import { WALK_FORWARD_MOTION } from "../data/WalkMotion";
import { DASH_FORWARD_MOTION } from "../data/DashMotion";
import { ShootingController } from "./ShootingController";
import { FeintController } from "./FeintController";
import { SHOOT_COOLDOWN, ShootingUtils } from "../config/ShootingConfig";
import { DEFENSE_DISTANCE, DEFENSE_MOVEMENT, DefenseUtils } from "../config/DefenseConfig";
import { ActionConfigUtils } from "../config/ActionConfig";
import { FieldGridUtils } from "../config/FieldGridConfig";
import { FIELD_CONFIG } from "../config/gameConfig";

/**
 * キャラクターAIコントローラー
 * キャラクターの状態に応じて行動を決定する
 */
export class CharacterAI {
  private character: Character;
  private ball: Ball;
  private allCharacters: Character[];
  private field: Field;
  private shootingController: ShootingController | null = null;
  private feintController: FeintController | null = null;

  // シュートクールダウン（連続シュート防止）
  private shootCooldown: number = 0;
  // フェイントクールダウン（連続フェイント防止）
  private feintCooldown: number = 0;
  // SHOOT_COOLDOWN.AFTER_SHOTを使用（ShootingConfigから）

  constructor(character: Character, ball: Ball, allCharacters: Character[], field: Field) {
    this.character = character;
    this.ball = ball;
    this.allCharacters = allCharacters;
    this.field = field;

    // オフェンス側のボール保持位置を設定
    // 緑(3)・シアン(4)・青(5)以外の5箇所を使用
    // つまり、赤(0)・オレンジ(1)・黄色(2)・紫(6)・マゼンタ(7)
    this.character.setBallHoldingFaces([0, 1, 2, 6, 7]);
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
   * AIの更新処理
   */
  public update(deltaTime: number): void {
    // シュートクールダウンを減少
    if (this.shootCooldown > 0) {
      this.shootCooldown -= deltaTime;
    }

    // フェイントクールダウンを減少
    if (this.feintCooldown > 0) {
      this.feintCooldown -= deltaTime;
    }

    // アクション実行中（シュート等）は移動処理をスキップ
    const actionController = this.character.getActionController();
    const currentAction = actionController.getCurrentAction();
    const currentPhase = actionController.getCurrentPhase();
    if (currentAction !== null || currentPhase !== 'idle') {
      // アクション中は待機モーションも再生しない（アクションモーションが再生中）
      return;
    }

    // ゴールキーパーの場合、ゴール前半径5m以内に位置を制限
    if (this.character.playerPosition === 'GK') {
      this.constrainGoalkeeperPosition();
    }

    const state = this.character.getState();

    switch (state) {
      case CharacterState.BALL_LOST:
        // ボールが誰にも保持されていない場合は、全員がボールを取りに行く
        this.handleBallLostState(deltaTime);
        break;
      case CharacterState.ON_BALL_PLAYER:
        // ボール保持者は動く
        this.handleOnBallPlayerState(deltaTime);
        break;
      case CharacterState.ON_BALL_DEFENDER:
        // ボール保持者に最も近いディフェンダーは動く
        this.handleOnBallDefenderState(deltaTime);
        break;
      case CharacterState.OFF_BALL_PLAYER:
      case CharacterState.OFF_BALL_DEFENDER:
        // その他のキャラクターは停止（待機モーション）
        if (this.character.getCurrentMotionName() !== 'idle') {
          this.character.playMotion(IDLE_MOTION);
        }
        break;
    }
  }

  /**
   * ボールロスト状態の処理
   */
  private handleBallLostState(deltaTime: number): void {
    // ボールの位置を取得
    const ballPosition = this.ball.getPosition();
    const myPosition = this.character.getPosition();

    // ボールへの方向ベクトルを計算（XZ平面上）
    const direction = new Vector3(
      ballPosition.x - myPosition.x,
      0,
      ballPosition.z - myPosition.z
    );

    const distance = direction.length();

    // 方向ベクトルが0でない場合
    if (distance > 0.01) {
      direction.normalize();

      // Y軸周りの回転角度を計算
      const angle = Math.atan2(direction.x, direction.z);

      // キャラクターの回転を設定（ボールの方向を向く）
      this.character.setRotation(angle);

      // ボールに近づく（距離が2m以上の場合）
      if (distance > 2.0) {
        // 衝突を考慮して移動方向を調整
        const adjustedDirection = this.adjustDirectionForCollision(direction, deltaTime);

        if (adjustedDirection) {
          // ボールに向かって移動
          this.character.move(adjustedDirection, deltaTime);

          // 走りモーションを再生
          if (this.character.getCurrentMotionName() !== 'dash_forward') {
            this.character.playMotion(DASH_FORWARD_MOTION);
          }
        } else {
          // 移動できない場合は待機
          if (this.character.getCurrentMotionName() !== 'idle') {
            this.character.playMotion(IDLE_MOTION);
          }
        }
      } else {
        // 近くにいる場合は歩く
        const slowDirection = direction.scale(0.5);
        const adjustedDirection = this.adjustDirectionForCollision(slowDirection, deltaTime);

        if (adjustedDirection) {
          this.character.move(adjustedDirection, deltaTime);

          // 歩きモーションを再生
          if (this.character.getCurrentMotionName() !== 'walk_forward') {
            this.character.playMotion(WALK_FORWARD_MOTION);
          }
        } else {
          // 移動できない場合は待機
          if (this.character.getCurrentMotionName() !== 'idle') {
            this.character.playMotion(IDLE_MOTION);
          }
        }
      }
    } else {
      // ボールの真上にいる場合は待機
      if (this.character.getCurrentMotionName() !== 'idle') {
        this.character.playMotion(IDLE_MOTION);
      }
    }
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
      case '3pt':  // TODO: 一時的に3ptを無効化（フェイント検証用）
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
   * 条件: ボールが0面にある、シュートレンジ内、フェイントクールダウン終了
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

    // シュートレンジ内か確認
    if (!this.shootingController) {
      return false;
    }

    const rangeInfo = this.shootingController.getShootRangeInfo(this.character);
    if (!rangeInfo || !rangeInfo.inRange) {
      return false;
    }

    // 条件が揃った場合、確率でフェイントを選択（50%の確率）
    const feintChance = 0.5;
    if (Math.random() > feintChance) {
      return false; // フェイントを選択しなかった
    }

    // フェイント実行
    const result = this.feintController.performShootFeint(this.character);
    if (result && result.success) {
      // フェイントクールダウンを設定
      this.feintCooldown = 2.0; // 2秒間フェイント不可
      console.log(`[CharacterAI] ${this.character.playerData?.basic?.NAME}: フェイント実行 - ${result.message}`);
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

    const success = this.feintController.performBreakthroughAfterFeint(this.character, direction);
    if (success) {
      console.log(`[CharacterAI] ${this.character.playerData?.basic?.NAME}: フェイント後のドリブル突破（${direction}）`);
    }
    return success;
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
      console.log(`[CharacterAI] ${this.character.team}のディフェンダーがシュートブロックを試みる！（物理判定）`);

      // ブロックジャンプ情報を設定（シューターの方向に飛ぶ）
      this.character.setBlockJumpTarget(shooter);

      return true;
    }

    return false;
  }

  /**
   * オンボールプレイヤー状態の処理
   */
  private handleOnBallPlayerState(deltaTime: number): void {
    // フェイント成功後のドリブル突破ウィンドウ内ならドリブル突破を試みる
    if (this.feintController && this.feintController.isInBreakthroughWindow(this.character)) {
      if (this.tryBreakthroughAfterFeint()) {
        return;
      }
    }

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

        // オフェンス側は常にゴール方向を向く（最優先）
        const attackingGoal = this.character.team === "ally" ? this.field.getGoal1Backboard() : this.field.getGoal2Backboard();
        const goalPosition = attackingGoal.position;
        const toGoal = new Vector3(
          goalPosition.x - myPosition.x,
          0,
          goalPosition.z - myPosition.z
        );
        if (toGoal.length() > 0.01) {
          const angle = Math.atan2(toGoal.x, toGoal.z);
          this.character.setRotation(angle);
        }

        // 1on1状態: フェイントを先に試みる（確率でフェイントまたはシュートを選択）
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

          // 攻めるべきゴールを決定
          const attackingGoal = this.character.team === "ally" ? this.field.getGoal1Backboard() : this.field.getGoal2Backboard();
          const goalPosition = attackingGoal.position;

          // ゴール方向とディフェンダーから離れる方向を組み合わせる
          const toGoal = new Vector3(
            goalPosition.x - myPosition.x,
            0,
            goalPosition.z - myPosition.z
          );
          toGoal.normalize();

          // 60%ゴール方向、40%ディフェンダーから離れる方向
          const combinedDirection = toGoal.scale(0.6).add(awayDirection.scale(0.4));
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
    if (this.tryShoot()) {
      return;
    }

    // シュートレンジ外ならゴールに向かって移動
    const attackingGoal = this.character.team === "ally" ? this.field.getGoal1Backboard() : this.field.getGoal2Backboard();
    const goalPosition = attackingGoal.position;

    // ゴールに向かって移動（境界チェック付き）
    this.moveTowardsWithBoundary(goalPosition, deltaTime, 2.0); // ゴール2m手前で停止
  }

  /**
   * オフボールプレイヤー状態の処理
   */
  private handleOffBallPlayerState(deltaTime: number): void {
    // オンボールプレイヤーを探す
    const onBallPlayer = this.findOnBallPlayer();
    if (!onBallPlayer) {
      return;
    }

    const onBallPosition = onBallPlayer.getPosition();
    // DEFENSE_MOVEMENT.OFF_BALL_MIN_DISTANCEを使用
    const minDistance = DEFENSE_MOVEMENT.OFF_BALL_MIN_DISTANCE;
    const currentPosition = this.character.getPosition();

    // 現在のオンボールプレイヤーからの距離をチェック
    const currentDistance = Vector3.Distance(currentPosition, onBallPosition);

    // 5m以内にいる場合は、まず遠ざかる（オンボールプレイヤーを向きながら）
    if (currentDistance < minDistance) {
      // オンボールプレイヤーから離れる方向を計算
      const awayDirection = new Vector3(
        currentPosition.x - onBallPosition.x,
        0,
        currentPosition.z - onBallPosition.z
      );

      if (awayDirection.length() > 0.01) {
        awayDirection.normalize();

        // 衝突を考慮して移動方向を調整
        const adjustedDirection = this.adjustDirectionForCollision(awayDirection, deltaTime);

        if (adjustedDirection) {
          // オンボールプレイヤーの方を向く
          this.faceTowards(onBallPlayer);

          // 離れる方向に移動（向きは変えない）
          this.character.move(adjustedDirection, deltaTime);
        }
        return; // 距離が確保されるまでは他の処理をスキップ
      }
    }

    // 攻めるべきゴールを決定（敵チームのゴールに向かう）
    const attackingGoal = this.character.team === "ally" ? this.field.getGoal1Backboard() : this.field.getGoal2Backboard();
    const goalPosition = attackingGoal.position;

    // 敵キャラクターをリストアップ
    const enemies = this.allCharacters.filter(
      (char) => char !== this.character && char.team !== this.character.team
    );

    // オンボールプレイヤーからゴールへの方向を計算
    const toGoalDirection = new Vector3(
      goalPosition.x - onBallPosition.x,
      0,
      goalPosition.z - onBallPosition.z
    );
    toGoalDirection.normalize();

    // ゴール方向の角度を計算
    const goalAngle = Math.atan2(toGoalDirection.x, toGoalDirection.z);

    // DEFENSE_FORMATIONを使用して複数の候補位置を生成（ゴール方向を中心に前方180度の範囲）
    const candidatePositions: Vector3[] = [];
    const angleOffsetsRad = DefenseUtils.getFormationAngleOffsetsInRadians();

    for (const offsetRad of angleOffsetsRad) {
      const finalAngle = goalAngle + offsetRad;
      // オンボールプレイヤーから5m離れた位置を計算
      const x = onBallPosition.x + Math.sin(finalAngle) * minDistance;
      const z = onBallPosition.z + Math.cos(finalAngle) * minDistance;
      candidatePositions.push(new Vector3(x, onBallPosition.y, z));
    }

    // 各候補位置について視野チェック、射線チェックを行い、スコアを計算
    let bestPosition: Vector3 | null = null;
    let bestScore = -Infinity;

    for (const candidatePos of candidatePositions) {
      // 射線上に敵がいるかチェック
      const hasEnemyInLine = this.hasEnemyInLine(onBallPosition, candidatePos, enemies);

      if (!hasEnemyInLine) {
        // 射線上に敵がいない場合、ゴールまでの距離でスコア計算（近いほど良い）
        const distanceToGoal = Vector3.Distance(candidatePos, goalPosition);
        const score = -distanceToGoal; // ゴールに近いほど高スコア

        if (score > bestScore) {
          bestScore = score;
          bestPosition = candidatePos;
        }
      }
    }

    // 射線上に敵がいない位置が見つからない場合、ゴールに最も近い位置を選択
    if (!bestPosition) {
      let minDistanceToGoal = Infinity;

      for (const candidatePos of candidatePositions) {
        const distanceToGoal = Vector3.Distance(candidatePos, goalPosition);
        if (distanceToGoal < minDistanceToGoal) {
          minDistanceToGoal = distanceToGoal;
          bestPosition = candidatePos;
        }
      }
    }

    // 目標位置に向かって移動（移動中も常にオンボールプレイヤーを向く）
    if (bestPosition) {
      const currentPosition = this.character.getPosition();

      // 目標位置への方向ベクトルを計算（XZ平面上）
      const direction = new Vector3(
        bestPosition.x - currentPosition.x,
        0,
        bestPosition.z - currentPosition.z
      );

      const distance = direction.length();

      // 距離が十分近い場合は移動せず、オンボールプレイヤーの方を向く
      if (distance < 0.3) {
        this.faceTowards(onBallPlayer);

        // 待機モーションを再生
        if (this.character.getCurrentMotionName() !== 'idle') {
          this.character.playMotion(IDLE_MOTION);
        }
      } else {
        // 移動方向を正規化
        direction.normalize();

        // 衝突を考慮して移動方向を調整
        const adjustedDirection = this.adjustDirectionForCollision(direction, deltaTime);

        if (adjustedDirection) {
          // オンボールプレイヤーの方を向く
          this.faceTowards(onBallPlayer);

          // 移動（向きは変えずに移動）
          this.character.move(adjustedDirection, deltaTime);

          // 距離に応じたモーション再生
          if (distance > 5.0) {
            // 遠い場合は走る
            if (this.character.getCurrentMotionName() !== 'dash_forward') {
              this.character.playMotion(DASH_FORWARD_MOTION);
            }
          } else {
            // 近い場合は歩く
            if (this.character.getCurrentMotionName() !== 'walk_forward') {
              this.character.playMotion(WALK_FORWARD_MOTION);
            }
          }
        } else {
          // 移動できない場合は待機
          if (this.character.getCurrentMotionName() !== 'idle') {
            this.character.playMotion(IDLE_MOTION);
          }
        }
      }
    }
  }

  /**
   * オンボールディフェンダー状態の処理
   */
  private handleOnBallDefenderState(deltaTime: number): void {
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
   * オフボールディフェンダー状態の処理
   */
  private handleOffBallDefenderState(deltaTime: number): void {
    // オンボールプレイヤーを探す
    const onBallPlayer = this.findOnBallPlayer();
    if (!onBallPlayer) {
      return;
    }

    // オフボールプレイヤーを探す
    const offBallPlayer = this.findOffBallPlayer();
    if (!offBallPlayer) {
      return;
    }

    const onBallPosition = onBallPlayer.getPosition();
    const offBallPosition = offBallPlayer.getPosition();

    // オフボールプレイヤーからオンボールプレイヤーへの方向ベクトルを計算
    const direction = new Vector3(
      onBallPosition.x - offBallPosition.x,
      0,
      onBallPosition.z - offBallPosition.z
    );

    // 方向を正規化
    if (direction.length() > 0.01) {
      direction.normalize();

      // DEFENSE_DISTANCE.OFF_BALL_DEFENDER_DISTANCEを使用
      const targetDistance = DEFENSE_DISTANCE.OFF_BALL_DEFENDER_DISTANCE;
      const targetPosition = new Vector3(
        offBallPosition.x + direction.x * targetDistance,
        offBallPosition.y,
        offBallPosition.z + direction.z * targetDistance
      );

      // 目標位置に向かって移動
      this.moveTowards(targetPosition, deltaTime, 0.2); // 停止距離を0.2mに設定

      // オフボールプレイヤーの方を向く
      this.faceTowards(offBallPlayer);
    }
  }

  /**
   * オンボールプレイヤーを見つける
   */
  private findOnBallPlayer(): Character | null {
    for (const char of this.allCharacters) {
      if (char.getState() === CharacterState.ON_BALL_PLAYER) {
        return char;
      }
    }
    return null;
  }

  /**
   * オンボールディフェンダーを見つける
   */
  private findOnBallDefender(): Character | null {
    for (const char of this.allCharacters) {
      if (char.getState() === CharacterState.ON_BALL_DEFENDER) {
        return char;
      }
    }
    return null;
  }

  /**
   * オフボールディフェンダーを見つける
   */
  private findOffBallDefender(): Character | null {
    for (const char of this.allCharacters) {
      if (char.getState() === CharacterState.OFF_BALL_DEFENDER) {
        return char;
      }
    }
    return null;
  }

  /**
   * オフボールプレイヤーを見つける
   */
  private findOffBallPlayer(): Character | null {
    for (const char of this.allCharacters) {
      if (char.getState() === CharacterState.OFF_BALL_PLAYER) {
        return char;
      }
    }
    return null;
  }

  /**
   * 目標位置に向かって移動
   */
  private moveTowards(targetPosition: Vector3, deltaTime: number, stopDistance: number = 0.3): void {
    const myPosition = this.character.getPosition();

    // 目標位置への方向ベクトルを計算（XZ平面上）
    const direction = new Vector3(
      targetPosition.x - myPosition.x,
      0,
      targetPosition.z - myPosition.z
    );

    // 距離が十分近い場合は移動しない
    const distance = direction.length();
    if (distance < stopDistance) {
      // 停止時は待機モーションを再生
      if (this.character.getCurrentMotionName() !== 'idle') {
        this.character.playMotion(IDLE_MOTION);
      }
      return;
    }

    // 方向ベクトルを正規化
    direction.normalize();

    // 衝突を考慮して移動方向を調整
    const adjustedDirection = this.adjustDirectionForCollision(direction, deltaTime);

    // 移動できない場合は停止
    if (!adjustedDirection) {
      // 停止時は待機モーションを再生
      if (this.character.getCurrentMotionName() !== 'idle') {
        this.character.playMotion(IDLE_MOTION);
      }
      return;
    }

    // 移動方向を向く
    const angle = Math.atan2(adjustedDirection.x, adjustedDirection.z);
    this.character.setRotation(angle);

    // 移動
    this.character.move(adjustedDirection, deltaTime);

    // 距離に応じたモーション再生
    if (distance > 5.0) {
      // 遠い場合は走る
      if (this.character.getCurrentMotionName() !== 'dash_forward') {
        this.character.playMotion(DASH_FORWARD_MOTION);
      }
    } else {
      // 近い場合は歩く
      if (this.character.getCurrentMotionName() !== 'walk_forward') {
        this.character.playMotion(WALK_FORWARD_MOTION);
      }
    }
  }

  /**
   * 目標位置に向かって移動（境界チェック付き）
   * オフェンス時に使用 - フィールド外に出ないように移動
   */
  private moveTowardsWithBoundary(targetPosition: Vector3, deltaTime: number, stopDistance: number = 0.3): void {
    const myPosition = this.character.getPosition();

    // 目標位置への方向ベクトルを計算（XZ平面上）
    const direction = new Vector3(
      targetPosition.x - myPosition.x,
      0,
      targetPosition.z - myPosition.z
    );

    // 距離が十分近い場合は移動しない
    const distance = direction.length();
    if (distance < stopDistance) {
      if (this.character.getCurrentMotionName() !== 'idle') {
        this.character.playMotion(IDLE_MOTION);
      }
      return;
    }

    // 方向ベクトルを正規化
    direction.normalize();

    // 境界チェック（オフェンスはフィールド外に出ない）
    const boundaryAdjusted = this.adjustDirectionForBoundary(direction, deltaTime);
    if (!boundaryAdjusted) {
      // 境界に達したら停止
      if (this.character.getCurrentMotionName() !== 'idle') {
        this.character.playMotion(IDLE_MOTION);
      }
      return;
    }

    // 衝突を考慮して移動方向を調整
    const adjustedDirection = this.adjustDirectionForCollision(boundaryAdjusted, deltaTime);

    if (!adjustedDirection) {
      if (this.character.getCurrentMotionName() !== 'idle') {
        this.character.playMotion(IDLE_MOTION);
      }
      return;
    }

    // 移動方向を向く
    const angle = Math.atan2(adjustedDirection.x, adjustedDirection.z);
    this.character.setRotation(angle);

    // 移動
    this.character.move(adjustedDirection, deltaTime);

    // 距離に応じたモーション再生
    if (distance > 5.0) {
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
   * 射線上に敵がいるかチェック
   */
  private hasEnemyInLine(start: Vector3, end: Vector3, enemies: Character[]): boolean {
    // DEFENSE_DISTANCE.LINE_THRESHOLDを使用
    const lineThreshold = DEFENSE_DISTANCE.LINE_THRESHOLD;

    for (const enemy of enemies) {
      const enemyPos = enemy.getPosition();

      // 線分と点の距離を計算
      const distance = this.pointToLineDistance(start, end, enemyPos);

      // 敵が射線上にいるかチェック（距離が閾値以下）
      if (distance < lineThreshold) {
        // さらに、敵が線分の範囲内にいるかチェック
        if (this.isPointBetweenLineSegment(start, end, enemyPos)) {
          return true;
        }
      }
    }

    return false;
  }

  /**
   * 点から線分への最短距離を計算
   */
  private pointToLineDistance(lineStart: Vector3, lineEnd: Vector3, point: Vector3): number {
    // XZ平面上で計算
    const x0 = point.x;
    const z0 = point.z;
    const x1 = lineStart.x;
    const z1 = lineStart.z;
    const x2 = lineEnd.x;
    const z2 = lineEnd.z;

    const dx = x2 - x1;
    const dz = z2 - z1;
    const lengthSquared = dx * dx + dz * dz;

    if (lengthSquared === 0) {
      // 線分の始点と終点が同じ場合
      return Math.sqrt((x0 - x1) * (x0 - x1) + (z0 - z1) * (z0 - z1));
    }

    // 線分上の最近点のパラメータt（0から1の範囲）
    let t = ((x0 - x1) * dx + (z0 - z1) * dz) / lengthSquared;
    t = Math.max(0, Math.min(1, t));

    // 線分上の最近点
    const nearestX = x1 + t * dx;
    const nearestZ = z1 + t * dz;

    // 点から最近点までの距離
    return Math.sqrt((x0 - nearestX) * (x0 - nearestX) + (z0 - nearestZ) * (z0 - nearestZ));
  }

  /**
   * 点が線分の範囲内にあるかチェック
   */
  private isPointBetweenLineSegment(lineStart: Vector3, lineEnd: Vector3, point: Vector3): boolean {
    // 線分の長さ
    const lineLength = Vector3.Distance(lineStart, lineEnd);

    // 始点から点までの距離
    const distStart = Vector3.Distance(lineStart, point);

    // 終点から点までの距離
    const distEnd = Vector3.Distance(lineEnd, point);

    // 点が線分の範囲内にある場合、distStart + distEnd ≈ lineLength
    const tolerance = 0.5; // 許容誤差
    return Math.abs(distStart + distEnd - lineLength) < tolerance;
  }

  /**
   * 指定したキャラクターの方向を向く
   */
  private faceTowards(target: Character): void {
    const myPosition = this.character.getPosition();
    const targetPosition = target.getPosition();

    // ターゲットへの方向ベクトルを計算（XZ平面上）
    const direction = new Vector3(
      targetPosition.x - myPosition.x,
      0,
      targetPosition.z - myPosition.z
    );

    // 方向ベクトルが0でない場合のみ回転
    if (direction.length() > 0.01) {
      // Y軸周りの回転角度を計算
      const angle = Math.atan2(direction.x, direction.z);

      // キャラクターの回転を設定（setRotationメソッドを使用してメッシュにも反映）
      this.character.setRotation(angle);
    }
  }

  /**
   * ゴールキーパーの位置をゴール前半径5m以内に制限
   */
  private constrainGoalkeeperPosition(): void {
    const myPosition = this.character.getPosition();

    // 自チームのゴール位置を取得
    const goal = this.character.team === "ally" ? this.field.getGoal2Backboard() : this.field.getGoal1Backboard();
    const goalPosition = goal.position;

    // ゴールからの距離を計算（XZ平面上）
    const dx = myPosition.x - goalPosition.x;
    const dz = myPosition.z - goalPosition.z;
    const distance = Math.sqrt(dx * dx + dz * dz);

    // DEFENSE_DISTANCE.GOALKEEPER_MAX_RADIUSを超えた場合、位置を制限
    const maxRadius = DEFENSE_DISTANCE.GOALKEEPER_MAX_RADIUS;
    if (distance > maxRadius) {
      // ゴール方向への単位ベクトル
      const dirX = dx / distance;
      const dirZ = dz / distance;

      // 半径5m以内の位置に修正
      const newX = goalPosition.x + dirX * maxRadius;
      const newZ = goalPosition.z + dirZ * maxRadius;

      // キャラクターの位置を更新
      this.character.setPosition(new Vector3(newX, myPosition.y, newZ));
    }
  }

  /**
   * 衝突チェック - 他のキャラクターと衝突するかチェック
   * @param newPosition 移動先の位置
   * @returns 衝突する場合true
   */
  private checkCollision(newPosition: Vector3): boolean {
    const myRadius = this.character.collisionRadius;

    for (const other of this.allCharacters) {
      // 自分自身はスキップ
      if (other === this.character) continue;

      const otherPosition = other.getPosition();
      const otherRadius = other.collisionRadius;

      // XZ平面上での距離を計算
      const dx = newPosition.x - otherPosition.x;
      const dz = newPosition.z - otherPosition.z;
      const distance = Math.sqrt(dx * dx + dz * dz);

      // 衝突半径の合計より近い場合は衝突
      const minDistance = myRadius + otherRadius;
      if (distance < minDistance) {
        return true;
      }
    }

    return false;
  }

  /**
   * 衝突を考慮した移動方向の調整
   * @param direction 元の移動方向
   * @param deltaTime デルタタイム
   * @returns 調整後の移動方向（移動不可の場合はnull）
   */
  private adjustDirectionForCollision(direction: Vector3, deltaTime: number): Vector3 | null {
    const currentPosition = this.character.getPosition();
    const speed = this.character.config.movement.walkSpeed;
    const moveDistance = speed * deltaTime;

    // 元の方向での移動先をチェック
    const newPosition = new Vector3(
      currentPosition.x + direction.x * moveDistance,
      currentPosition.y,
      currentPosition.z + direction.z * moveDistance
    );

    if (!this.checkCollision(newPosition)) {
      // 衝突しない場合はそのまま移動
      return direction;
    }

    // 衝突する場合、左右に回避を試みる
    const avoidanceAngles = [30, -30, 60, -60, 90, -90]; // 度数
    for (const angleDeg of avoidanceAngles) {
      const angleRad = (angleDeg * Math.PI) / 180;
      const cos = Math.cos(angleRad);
      const sin = Math.sin(angleRad);

      // 回転後の方向ベクトル
      const rotatedDirection = new Vector3(
        direction.x * cos - direction.z * sin,
        0,
        direction.x * sin + direction.z * cos
      );

      const avoidPosition = new Vector3(
        currentPosition.x + rotatedDirection.x * moveDistance,
        currentPosition.y,
        currentPosition.z + rotatedDirection.z * moveDistance
      );

      if (!this.checkCollision(avoidPosition)) {
        // 衝突しない方向が見つかった
        return rotatedDirection;
      }
    }

    // どの方向にも移動できない場合はnull
    return null;
  }

  /**
   * オフェンス時の境界チェック - フィールド外に出ないように移動方向を調整
   * A列〜O列、1行目〜30行目の範囲内に留まる
   * @param direction 移動方向
   * @param deltaTime デルタタイム
   * @returns 調整後の移動方向（移動不可の場合はnull）
   */
  private adjustDirectionForBoundary(direction: Vector3, _deltaTime: number): Vector3 | null {
    const currentPosition = this.character.getPosition();

    // フィールド境界
    const halfWidth = FIELD_CONFIG.width / 2;   // 7.5m
    const halfLength = FIELD_CONFIG.length / 2; // 15m
    const margin = 0.5; // 境界からのマージン（少し内側で止まる）

    const minX = -halfWidth + margin;
    const maxX = halfWidth - margin;
    const minZ = -halfLength + margin;
    const maxZ = halfLength - margin;

    let adjustedX = direction.x;
    let adjustedZ = direction.z;

    // 現在位置が左端に近く、さらに左に行こうとしている場合
    if (currentPosition.x <= minX && direction.x < 0) {
      adjustedX = 0;
    }
    // 現在位置が右端に近く、さらに右に行こうとしている場合
    if (currentPosition.x >= maxX && direction.x > 0) {
      adjustedX = 0;
    }
    // 現在位置が手前端に近く、さらに手前に行こうとしている場合
    if (currentPosition.z <= minZ && direction.z < 0) {
      adjustedZ = 0;
    }
    // 現在位置が奥端に近く、さらに奥に行こうとしている場合
    if (currentPosition.z >= maxZ && direction.z > 0) {
      adjustedZ = 0;
    }

    // 両方止まったら移動不可
    if (adjustedX === 0 && adjustedZ === 0) {
      return null;
    }

    // 調整後の方向を正規化
    const adjustedDirection = new Vector3(adjustedX, 0, adjustedZ);
    if (adjustedDirection.length() > 0.01) {
      adjustedDirection.normalize();
      return adjustedDirection;
    }

    return null;
  }

  /**
   * 現在位置がフィールド境界に近いかチェック
   * @returns 境界に近い場合true
   */
  private isNearBoundary(): boolean {
    const currentPosition = this.character.getPosition();
    const halfWidth = FIELD_CONFIG.width / 2;
    const halfLength = FIELD_CONFIG.length / 2;
    const threshold = 1.0; // 境界から1m以内

    return (
      currentPosition.x < -halfWidth + threshold ||
      currentPosition.x > halfWidth - threshold ||
      currentPosition.z < -halfLength + threshold ||
      currentPosition.z > halfLength - threshold
    );
  }

  /**
   * 現在位置の座標情報を取得（デバッグ用）
   */
  public getCurrentCellInfo(): { cell: string; block: string } | null {
    const pos = this.character.getPosition();
    const cell = FieldGridUtils.worldToCell(pos.x, pos.z);
    const block = FieldGridUtils.worldToBlock(pos.x, pos.z);

    if (cell && block) {
      return {
        cell: `${cell.col}${cell.row}`,
        block: `${block.col}${block.row}`,
      };
    }
    return null;
  }

  /**
   * 破棄
   */
  public dispose(): void {
    // 必要に応じてクリーンアップ処理を追加
  }
}
