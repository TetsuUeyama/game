import {Vector3} from "@babylonjs/core";
import {Player, HandPose} from "../entities/Player";
import {Ball} from "../entities/Ball";
import {COURT_CONFIG} from "../config/gameConfig";
import {calculateShootTrajectory, isShootPhysicallyPossible} from "../utils/shootCalculator";

/**
 * シュート処理を管理するコントローラー
 */
export class ShootController {
  // シュート関連の状態
  private player1ShootCooldown: number = 0; // シュートのクールダウン（秒）
  private player2ShootCooldown: number = 0;
  private player1BallHoldTime: number = 0; // ボール保持時間（秒）
  private player2BallHoldTime: number = 0;
  private player1PickupCooldown: number = 0; // ボール拾得のクールダウン（秒）
  private player2PickupCooldown: number = 0;
  private readonly SHOOT_COOLDOWN_TIME = 2.0; // シュート後のクールダウン（秒）
  private readonly PICKUP_COOLDOWN_TIME = 1.0; // シュート後にボールを拾えるようになるまでの時間（秒）
  private readonly SHOOT_DISTANCE = 5.0; // シュート判定距離（m）ゴールから5m以内
  private readonly SHOOT_HOLD_TIME = 2.0; // ボール保持後のシュートまでの時間（秒）

  // レイアップジャンプ関連の状態
  private player1LayupInProgress: boolean = false; // レイアップジャンプ中か
  private player2LayupInProgress: boolean = false;
  private player1LayupGoalZ: number = 0; // レイアップ時のゴールZ座標
  private player2LayupGoalZ: number = 0;

  private ball: Ball;
  private player1: Player;
  private player2: Player;

  constructor(ball: Ball, player1: Player, player2: Player) {
    this.ball = ball;
    this.player1 = player1;
    this.player2 = player2;
  }

  /**
   * クールダウンを更新
   */
  updateCooldowns(deltaTime: number): void {
    if (this.player1ShootCooldown > 0) {
      this.player1ShootCooldown -= deltaTime;
    }
    if (this.player2ShootCooldown > 0) {
      this.player2ShootCooldown -= deltaTime;
    }
    if (this.player1PickupCooldown > 0) {
      this.player1PickupCooldown -= deltaTime;
    }
    if (this.player2PickupCooldown > 0) {
      this.player2PickupCooldown -= deltaTime;
    }
  }

  /**
   * ボール保持時間を更新
   */
  updateBallHoldTime(playerId: number, deltaTime: number): void {
    if (playerId === 1) {
      this.player1BallHoldTime += deltaTime;
    } else {
      this.player2BallHoldTime += deltaTime;
    }
  }

  /**
   * ボール保持時間をリセット
   */
  resetBallHoldTime(playerId: number): void {
    if (playerId === 1) {
      this.player1BallHoldTime = 0;
    } else {
      this.player2BallHoldTime = 0;
    }
  }

  /**
   * レイアップ状態をリセット
   */
  resetLayupState(playerId: number): void {
    if (playerId === 1) {
      this.player1LayupInProgress = false;
    } else {
      this.player2LayupInProgress = false;
    }
  }

  /**
   * ディフェンダーがブロックを試みる
   */
  private attemptBlock(shooter: Player, defender: Player): void {
    const shooterPos = shooter.getPosition();
    const defenderPos = defender.getPosition();

    // シューターとディフェンダーの距離を計算
    const distance = Vector3.Distance(shooterPos, defenderPos);

    // ブロック可能距離（3m以内）
    const BLOCK_DISTANCE = 3.0;

    console.log(`[BLOCK CHECK] Shooter P${shooter.id} at (${shooterPos.x.toFixed(1)}, ${shooterPos.z.toFixed(1)}), Defender P${defender.id} at (${defenderPos.x.toFixed(1)}, ${defenderPos.z.toFixed(1)}), Distance: ${distance.toFixed(2)}m`);

    if (distance <= BLOCK_DISTANCE) {
      // ディフェンダーがジャンプしてブロックを試みる
      if (!defender.isJumping) {
        defender.startJump();
        defender.setHandPose(HandPose.BLOCK); // 両手を真上に伸ばす
        console.log(`[BLOCK] ★★★ Player ${defender.id} JUMPS TO BLOCK! Distance: ${distance.toFixed(2)}m, Pose: BLOCK ★★★`);
      } else {
        console.log(`[BLOCK] Player ${defender.id} already jumping, cannot block`);
      }
    } else {
      console.log(`[BLOCK] Distance ${distance.toFixed(2)}m > ${BLOCK_DISTANCE}m, too far to block`);
    }
  }

  /**
   * シュート判定（ゴールまでの距離をチェック）
   */
  canShoot(player: Player, goalZ: number): boolean {
    if (!player.hasBall) return false;

    const playerPosition = player.getPosition();

    // ゴールまでの距離を計算
    const dx = 0 - playerPosition.x; // ゴールのX座標は0（コート中央）
    const dz = goalZ - playerPosition.z;
    const distance = Math.sqrt(dx * dx + dz * dz);

    return distance <= this.SHOOT_DISTANCE;
  }

  /**
   * シュート可能かチェック（距離条件のみ）
   */
  shouldShoot(playerId: number, player: Player, goalZ: number): {
    shouldShoot: boolean;
    canShootByDistance: boolean;
    canShootByTime: boolean;
  } {
    const shootCooldown = playerId === 1 ? this.player1ShootCooldown : this.player2ShootCooldown;

    // 距離条件のみでシュート判定（時間条件は削除）
    const canShootByDistance = shootCooldown <= 0 && this.canShoot(player, goalZ);
    const canShootByTime = false; // 時間条件は使用しない
    const shouldShoot = canShootByDistance;

    return {shouldShoot, canShootByDistance, canShootByTime};
  }

  /**
   * レイアップジャンプ中の処理を更新
   */
  updateLayupJump(player: Player, playerId: number, goalZ: number): void {
    const isLayupInProgress = playerId === 1 ? this.player1LayupInProgress : this.player2LayupInProgress;

    if (!isLayupInProgress || !player.isJumping) {
      return;
    }

    // ジャンプの頂点に達したか（速度が負=下降中）、またはある程度の高さに達したかチェック
    const shouldRelease = player.jumpVelocity <= 1.0; // 速度が1m/s以下（ほぼ頂点）

    if (shouldRelease && player.hasBall) {
      console.log(`[LAYUP] Player ${playerId} releasing ball at jump peak!`);

      // シュートポーズに切り替え
      player.setHandPose(HandPose.SHOOT);

      // 腕を伸ばした位置からリリース
      const shooterPosition = player.getExtendedArmBallPosition();

      // ボールを腕を伸ばした位置に移動してからリリース
      this.ball.setPosition(shooterPosition);

      // ボールを手放す
      player.releaseBall();
      this.ball.release();

      // ターゲット（リムリング中心）の位置
      const targetPosition = new Vector3(0, COURT_CONFIG.rimHeight, goalZ);

      console.log(`[LAYUP] Shooter: ${shooterPosition.toString()}`);
      console.log(`[LAYUP] Target: ${targetPosition.toString()}`);

      // シュート軌道を計算
      const shootCalculation = calculateShootTrajectory(shooterPosition, targetPosition);

      console.log(`[LAYUP] Angle: ${shootCalculation.angle.toFixed(1)}°`);
      console.log(`[LAYUP] Initial Speed: ${shootCalculation.initialSpeed.toFixed(2)} m/s`);

      // 計算された速度をボールに設定
      this.ball.setVelocity(shootCalculation.velocity);

      // クールダウンを設定
      if (playerId === 1) {
        this.player1ShootCooldown = this.SHOOT_COOLDOWN_TIME;
        this.player1PickupCooldown = this.PICKUP_COOLDOWN_TIME;
        this.player1LayupInProgress = false;
      } else {
        this.player2ShootCooldown = this.SHOOT_COOLDOWN_TIME;
        this.player2PickupCooldown = this.PICKUP_COOLDOWN_TIME;
        this.player2LayupInProgress = false;
      }
    }
  }

  /**
   * シュートを実行
   */
  performShoot(player: Player, goalZ: number, defender?: Player | null): void {
    console.log(`[GameScene] ★★★ Player ${player.id} is SHOOTING! ★★★`);

    // ディフェンダーがブロックを試みる（近くにいる場合）
    if (defender) {
      this.attemptBlock(player, defender);
    }

    // ターゲット（リムリング中心）の位置
    const targetPosition = new Vector3(0, COURT_CONFIG.rimHeight, goalZ);

    // ゴールまでの水平距離を計算
    const playerPosition = player.getPosition();
    const dx = targetPosition.x - playerPosition.x;
    const dz = targetPosition.z - playerPosition.z;
    const horizontalDistance = Math.sqrt(dx * dx + dz * dz);

    // レイアップ判定：極近距離（1.5m以内）の場合
    const isLayup = horizontalDistance < 1.5;
    console.log(`[SHOOT DEBUG] Player ${player.id} distance to goal: ${horizontalDistance.toFixed(2)}m, isLayup: ${isLayup}`);

    if (isLayup) {
      // レイアップシュート：ジャンプを開始してボールを保持したまま
      console.log(`[LAYUP] Player ${player.id} starting layup jump! Distance: ${horizontalDistance.toFixed(2)}m`);
      player.startJump();
      player.setHandPose(HandPose.LAYUP);

      // レイアップ状態を記録
      if (player.id === 1) {
        this.player1LayupInProgress = true;
        this.player1LayupGoalZ = goalZ;
      } else {
        this.player2LayupInProgress = true;
        this.player2LayupGoalZ = goalZ;
      }

      // レイアップの場合はここで終了（ジャンプ中に updateLayupJump でボールをリリース）
      return;
    }

    // 通常のジャンプシュート：即座にボールをリリース
    // シュートポーズに切り替え
    player.setHandPose(HandPose.SHOOT);

    // ボール位置を現在の保持位置に更新してからリリース
    const ballHoldPosition = player.getBallHoldPosition();
    this.ball.setPosition(ballHoldPosition);

    // ボールを手放す
    player.releaseBall();
    this.ball.release();

    const ballPosition = this.ball.getPosition();

    // 通常のシュート：現在のボール位置から
    const shooterPosition = ballPosition;

    console.log(`[GameScene] Shooter: ${shooterPosition.toString()}`);
    console.log(`[GameScene] Target: ${targetPosition.toString()}`);
    console.log(`[GameScene] Distance: ${horizontalDistance.toFixed(2)}m, Type: JUMP SHOT`);

    // シュートが物理的に可能かチェック
    if (!isShootPhysicallyPossible(shooterPosition, targetPosition)) {
      console.warn("[GameScene] Shot is physically impossible! Using maximum power.");
    }

    // シュート軌道を計算（角度は自動調整）
    const shootCalculation = calculateShootTrajectory(shooterPosition, targetPosition);

    console.log(`[SHOOT] Angle: ${shootCalculation.angle.toFixed(1)}°`);
    console.log(`[SHOOT] Initial Speed: ${shootCalculation.initialSpeed.toFixed(2)} m/s`);
    console.log(`[SHOOT] Flight Time: ${shootCalculation.flightTime.toFixed(2)}s`);
    console.log(`[SHOOT] Max Height: ${shootCalculation.maxHeight.toFixed(2)}m`);
    console.log(`[SHOOT] Velocity: (${shootCalculation.velocity.x.toFixed(2)}, ${shootCalculation.velocity.y.toFixed(2)}, ${shootCalculation.velocity.z.toFixed(2)})`);

    // 計算された速度をボールに設定
    this.ball.setVelocity(shootCalculation.velocity);

    // クールダウンを設定
    if (player.id === 1) {
      this.player1ShootCooldown = this.SHOOT_COOLDOWN_TIME;
      this.player1PickupCooldown = this.PICKUP_COOLDOWN_TIME;
    } else {
      this.player2ShootCooldown = this.SHOOT_COOLDOWN_TIME;
      this.player2PickupCooldown = this.PICKUP_COOLDOWN_TIME;
    }
  }

  /**
   * ゲッター：シュートクールダウン
   */
  getShootCooldown(playerId: number): number {
    return playerId === 1 ? this.player1ShootCooldown : this.player2ShootCooldown;
  }

  /**
   * ゲッター：ピックアップクールダウン
   */
  getPickupCooldown(playerId: number): number {
    return playerId === 1 ? this.player1PickupCooldown : this.player2PickupCooldown;
  }

  /**
   * ゲッター：ボール保持時間
   */
  getBallHoldTime(playerId: number): number {
    return playerId === 1 ? this.player1BallHoldTime : this.player2BallHoldTime;
  }

  /**
   * ゲッター：レイアップ進行中か
   */
  isLayupInProgress(playerId: number): boolean {
    return playerId === 1 ? this.player1LayupInProgress : this.player2LayupInProgress;
  }

  /**
   * ゲッター：レイアップ時のゴールZ座標
   */
  getLayupGoalZ(playerId: number): number {
    return playerId === 1 ? this.player1LayupGoalZ : this.player2LayupGoalZ;
  }
}
