import { Scene, Vector3 } from "@babylonjs/core";
import { Character } from "../entities/Character";
import { MotionManager } from "../managers/MotionManager";
import {
  WALK_FORWARD_MOTION_CONFIG,
  WALK_BACKWARD_MOTION_CONFIG,
  WALK_LEFT_MOTION_CONFIG,
  WALK_RIGHT_MOTION_CONFIG,
} from "../data/WalkMotion";
import { IDLE_MOTION_CONFIG } from "../data/IdleMotion";
import { JUMP_MOTION_CONFIG } from "../data/JumpMotion";
import {
  LANDING_SMALL_MOTION_CONFIG,
  LANDING_MOTION_CONFIG,
  LANDING_LARGE_MOTION_CONFIG,
  createExtendedLandingMotion,
} from "../data/LandingMotion";
import { CROUCH_MOTION_CONFIG } from "../data/CrouchMotion";
import {
  DASH_FORWARD_MOTION_CONFIG,
  DASH_BACKWARD_MOTION_CONFIG,
  DASH_LEFT_MOTION_CONFIG,
  DASH_RIGHT_MOTION_CONFIG,
} from "../data/DashMotion";
import { createDashStopMotion, DASH_STOP_MOTION_CONFIG } from "../data/DashStopMotion";
import { JumpChargeGauge } from "../ui/JumpChargeGauge";
import { DashGauge } from "../ui/DashGauge";
import { CooldownGauge } from "../ui/CooldownGauge";

/**
 * 入力状態
 */
interface InputState {
  forward: boolean; // W
  backward: boolean; // S
  left: boolean; // A
  right: boolean; // D
  rotateLeft: boolean; // Q
  rotateRight: boolean; // E
  jump: boolean; // Space
  dashForward: boolean; // 1
  dashBackward: boolean; // 2
  dashLeft: boolean; // 3
  dashRight: boolean; // 4
}

/**
 * 入力コントローラー
 * キーボード入力を管理し、キャラクターの移動を制御
 */
export class InputController {
  private scene: Scene;
  private character: Character;
  private inputState: InputState;
  private motionManager: MotionManager;
  private jumpPressStartTime: number = 0; // ジャンプボタン押下開始時刻
  private isJumpPressed: boolean = false; // ジャンプボタンが押されているか
  private pendingLandingMotion: string | null = null; // ジャンプ後に再生する着地硬直モーション
  private jumpChargeGauge: JumpChargeGauge; // ジャンプチャージゲージ
  private dashGauge: DashGauge; // ダッシュゲージ
  private cooldownGauge: CooldownGauge; // クールダウンゲージ（硬直時間表示）
  private dashAccelerationTime: number = 0; // ダッシュ加速時間
  private currentDashDirection: string | null = null; // 現在のダッシュ方向
  private dashMomentumDirection: Vector3 | null = null; // ジャンプ時のダッシュ慣性方向
  private dashMomentumSpeed: number = 0; // ジャンプ時のダッシュ慣性速度
  private jumpStartY: number = 0; // ジャンプ開始時のY座標
  private dashJumpDirection: string | null = null; // ジャンプ時のダッシュ方向名

  constructor(scene: Scene, character: Character) {
    this.scene = scene;
    this.character = character;

    // ジャンプチャージゲージを初期化
    this.jumpChargeGauge = new JumpChargeGauge(scene);

    // ダッシュゲージを初期化
    this.dashGauge = new DashGauge(scene);

    // クールダウンゲージを初期化
    this.cooldownGauge = new CooldownGauge(scene);

    // 入力状態を初期化
    this.inputState = {
      forward: false,
      backward: false,
      left: false,
      right: false,
      rotateLeft: false,
      rotateRight: false,
      jump: false,
      dashForward: false,
      dashBackward: false,
      dashLeft: false,
      dashRight: false,
    };

    // モーションマネージャーを初期化
    this.motionManager = new MotionManager(character);

    // モーションを登録
    this.motionManager.registerMotions([
      IDLE_MOTION_CONFIG, // デフォルトモーション
      WALK_FORWARD_MOTION_CONFIG, // 前進モーション
      WALK_BACKWARD_MOTION_CONFIG, // 後退モーション
      WALK_LEFT_MOTION_CONFIG, // 左移動モーション
      WALK_RIGHT_MOTION_CONFIG, // 右移動モーション
      CROUCH_MOTION_CONFIG, // しゃがみ込みモーション
      JUMP_MOTION_CONFIG, // ジャンプモーション
      LANDING_SMALL_MOTION_CONFIG, // 小ジャンプ着地硬直
      LANDING_MOTION_CONFIG, // 中ジャンプ着地硬直
      LANDING_LARGE_MOTION_CONFIG, // 大ジャンプ着地硬直
      DASH_FORWARD_MOTION_CONFIG, // 前進ダッシュ
      DASH_BACKWARD_MOTION_CONFIG, // 後退ダッシュ
      DASH_LEFT_MOTION_CONFIG, // 左ダッシュ
      DASH_RIGHT_MOTION_CONFIG, // 右ダッシュ
      DASH_STOP_MOTION_CONFIG, // ダッシュ停止硬直
    ]);

    // キーボードイベントを登録
    this.setupKeyboardInput();
  }

  /**
   * キーボード入力を設定
   */
  private setupKeyboardInput(): void {
    // キーダウンイベント
    window.addEventListener("keydown", (event) => {
      this.handleKeyDown(event.key);
    });

    // キーアップイベント
    window.addEventListener("keyup", (event) => {
      this.handleKeyUp(event.key);
    });
  }

  /**
   * キーダウン処理
   */
  private handleKeyDown(key: string): void {
    switch (key.toLowerCase()) {
      case "w":
        this.inputState.forward = true;
        break;
      case "s":
        this.inputState.backward = true;
        break;
      case "a":
        this.inputState.left = true;
        break;
      case "d":
        this.inputState.right = true;
        break;
      case "q":
        this.inputState.rotateLeft = true;
        break;
      case "e":
        this.inputState.rotateRight = true;
        break;
      case " ": // Space key
        if (!this.isJumpPressed) {
          this.isJumpPressed = true;
          this.jumpPressStartTime = performance.now();

          // ダッシュ中かどうかをチェック
          const isDashing = this.inputState.dashForward || this.inputState.dashBackward ||
                           this.inputState.dashLeft || this.inputState.dashRight;

          // ダッシュ中の場合、今すぐ慣性を保存（ダッシュボタンを離す前に）
          if (isDashing && this.currentDashDirection !== null) {
            const dashDirection = this.getDashDirection(this.currentDashDirection);
            if (dashDirection) {
              // 方向別の速度倍率を取得
              let directionMultiplier = 1.0;
              if (this.currentDashDirection === "dash_left" || this.currentDashDirection === "dash_right") {
                directionMultiplier = 0.7; // 横方向は0.7倍
              } else if (this.currentDashDirection === "dash_backward") {
                directionMultiplier = 0.4; // 後ろ方向は0.4倍
              }

              // 現在のダッシュ速度を計算
              const accelerationRatio = this.dashAccelerationTime / 1.0;
              const minSpeed = 2.0 * directionMultiplier;
              const maxSpeed = 3.5 * directionMultiplier;
              const currentSpeedMultiplier = minSpeed + (maxSpeed - minSpeed) * accelerationRatio;

              // ダッシュの慣性を保存
              this.dashMomentumDirection = dashDirection.clone().normalize();
              this.dashMomentumSpeed = currentSpeedMultiplier;
              this.dashJumpDirection = this.currentDashDirection; // ダッシュ方向名も保存

              console.log(`[ダッシュ慣性保存] 方向: ${this.currentDashDirection}, 速度: ${this.dashMomentumSpeed.toFixed(2)}`);
            }
          }

          // ダッシュ中でない場合のみcrouchモーションを再生
          if (!isDashing) {
            // 現在のモーションを停止してからcrouchを再生（ブレンドなしで即座に切り替え）
            this.character.stopMotion();
            this.motionManager.play("crouch", true); // forceで強制再生
            // すぐに一時停止して初期状態（時間0）に設定
            this.character.pauseMotion();
            this.character.setMotionTime(0);
          }

          // ジャンプチャージゲージを表示
          this.jumpChargeGauge.show();
        }
        this.inputState.jump = true;
        break;
      case "1":
        this.inputState.dashForward = true;
        break;
      case "2":
        this.inputState.dashBackward = true;
        break;
      case "3":
        this.inputState.dashLeft = true;
        break;
      case "4":
        this.inputState.dashRight = true;
        break;
    }
  }

  /**
   * キーアップ処理
   */
  private handleKeyUp(key: string): void {
    switch (key.toLowerCase()) {
      case "w":
        this.inputState.forward = false;
        break;
      case "s":
        this.inputState.backward = false;
        break;
      case "a":
        this.inputState.left = false;
        break;
      case "d":
        this.inputState.right = false;
        break;
      case "q":
        this.inputState.rotateLeft = false;
        break;
      case "e":
        this.inputState.rotateRight = false;
        break;
      case " ": // Space key
        if (this.isJumpPressed) {
          // 押下時間を計算（ミリ秒→秒）
          const pressDuration = (performance.now() - this.jumpPressStartTime) / 1000;
          this.executeJump(pressDuration);
          this.isJumpPressed = false;
          // ジャンプチャージゲージを非表示
          this.jumpChargeGauge.hide();
        }
        this.inputState.jump = false;
        break;
      case "1":
        this.inputState.dashForward = false;
        break;
      case "2":
        this.inputState.dashBackward = false;
        break;
      case "3":
        this.inputState.dashLeft = false;
        break;
      case "4":
        this.inputState.dashRight = false;
        break;
    }
  }

  /**
   * ジャンプを実行
   * @param pressDuration ボタン押下時間（秒）
   */
  private executeJump(pressDuration: number): void {
    // ジャンプ開始時のY座標を保存
    this.jumpStartY = this.character.getPosition().y;

    // 押下時間に応じてジャンプの高さと着地硬直を決定
    let jumpScale: number;
    let landingMotionName: string;

    if (pressDuration < 0.05) {
      // 小ジャンプ: 0.5倍の高さ、短い硬直
      jumpScale = 0.5;
      landingMotionName = "landing_small";
    } else if (pressDuration < 0.2) {
      // 中ジャンプ: 1.0倍の高さ、中程度の硬直
      jumpScale = 1.0;
      landingMotionName = "landing";
    } else {
      // 大ジャンプ: 1.5倍の高さ、長い硬直
      jumpScale = 1.5;
      landingMotionName = "landing_large";
    }

    // ダッシュ方向に応じてジャンプの高さを調整
    if (this.dashJumpDirection) {
      if (this.dashJumpDirection === "dash_left" || this.dashJumpDirection === "dash_right") {
        jumpScale *= 0.7; // 横方向は0.7倍
      } else if (this.dashJumpDirection === "dash_backward") {
        jumpScale *= 0.4; // 後ろ方向は0.4倍
      }
      console.log(`[ジャンプ高さ調整] 方向: ${this.dashJumpDirection}, 最終スケール: ${jumpScale.toFixed(2)}`);
    }

    // ジャンプモーションを再生（スケール付き）
    this.motionManager.playWithPositionScale("jump", jumpScale);

    // 着地硬直モーション名を保存（ジャンプ終了後に再生）
    this.pendingLandingMotion = landingMotionName;
  }


  /**
   * 更新（毎フレーム呼び出す）
   * @param deltaTime フレーム時間（秒）
   */
  public update(deltaTime: number): void {
    const currentMotion = this.motionManager.getCurrentMotionName();
    const isPlaying = this.character.isPlayingMotion();

    // ダッシュキーが押されているかチェック
    const isDashPressed = this.inputState.dashForward || this.inputState.dashBackward || this.inputState.dashLeft || this.inputState.dashRight;

    // ジャンプが終了して着地硬直が待機中の場合
    if (this.pendingLandingMotion && currentMotion === "jump" && !isPlaying) {
      // 基本の着地時間を取得
      let landingDuration = 0.1; // デフォルト
      if (this.pendingLandingMotion === "landing_small") {
        landingDuration = 0.1;
      } else if (this.pendingLandingMotion === "landing") {
        landingDuration = 0.3;
      } else if (this.pendingLandingMotion === "landing_large") {
        landingDuration = 0.3;
      }

      // ダッシュジャンプの場合、着地モーションの長さを速度に応じて延長
      if (this.dashMomentumSpeed > 0.5) {
        // ダッシュ速度に基づいて着地硬直を延長
        const extendedLandingMotion = createExtendedLandingMotion(this.pendingLandingMotion, this.dashMomentumSpeed);

        // 延長された着地モーションを登録
        this.motionManager.registerMotions([{
          motionData: extendedLandingMotion,
          isDefault: false,
          blendDuration: 0.1,
          priority: 5,
          interruptible: false,
        }]);

        landingDuration = extendedLandingMotion.duration;
        console.log(`[着地硬直延長] ダッシュ速度: ${this.dashMomentumSpeed.toFixed(2)}, 硬直時間: ${landingDuration.toFixed(2)}秒`);
      } else {
        console.log(`[垂直ジャンプ着地] ジャンプタイプ: ${this.pendingLandingMotion}, 硬直時間: ${landingDuration.toFixed(2)}秒`);
      }

      // クールダウンゲージを開始（垂直ジャンプでも表示）
      this.cooldownGauge.start(landingDuration);

      // 着地硬直モーションを再生
      this.motionManager.play(this.pendingLandingMotion, true); // forceで強制再生
      this.pendingLandingMotion = null;
      // モーション更新は着地硬直が自動的にidleに戻るため不要
      this.handleRotation(deltaTime);
      return;
    }

    // ジャンプ中、着地中、ダッシュ停止中はダッシュ処理をスキップ
    const isJumping = currentMotion === "jump";
    const isLanding = currentMotion === "landing_small" || currentMotion === "landing" || currentMotion === "landing_large";
    const isDashStopping = currentMotion === "dash_stop";

    // デバッグ: ジャンプ中かつ慣性がある場合
    if (isJumping && this.dashMomentumDirection !== null) {
      console.log(`[デバッグ] ジャンプ中 - 現在のモーション: ${currentMotion}, 慣性方向: ${this.dashMomentumDirection !== null}, 慣性速度: ${this.dashMomentumSpeed}`);
    }

    // しゃがみ込み中の処理（ジャンプチャージ）
    if (this.isJumpPressed) {
      // 押下時間を計算（ミリ秒→秒）
      const pressDuration = (performance.now() - this.jumpPressStartTime) / 1000;
      const targetTime = Math.min(pressDuration, 0.3);

      // ダッシュ中でない場合のみcrouchモーションを再生
      if (!isDashPressed || isJumping || isLanding) {
        // しゃがみ込みモーションの時間を押下時間に応じて設定（最大0.3秒）
        this.character.pauseMotion(); // 一時停止
        this.character.setMotionTime(targetTime);
      }

      // ジャンプチャージゲージを更新
      this.jumpChargeGauge.updatePosition(this.character.getPosition());
      this.jumpChargeGauge.updateCharge(pressDuration);

      // ダッシュ中（currentDashDirection が設定されている）の場合のみ、下のダッシュ処理に続く
      // それ以外は、ここで処理を終了
      if (this.currentDashDirection === null) {
        this.handleRotation(deltaTime);
        return;
      }
      // ダッシュ中の場合は、下のダッシュ処理に続く
    }

    // ダッシュボタンが押されている場合（ただしジャンプ中・着地中・ダッシュ停止中は除く）
    // ジャンプチャージ中でダッシュ未開始の場合もダッシュを開始できない
    if (isDashPressed && !(this.isJumpPressed && this.currentDashDirection === null) && !isJumping && !isLanding && !isDashStopping) {
      // ダッシュ方向を決定
      let dashMotionName: string | null = null;

      if (this.inputState.dashForward) {
        dashMotionName = "dash_forward";
      } else if (this.inputState.dashBackward) {
        dashMotionName = "dash_backward";
      } else if (this.inputState.dashLeft) {
        dashMotionName = "dash_left";
      } else if (this.inputState.dashRight) {
        dashMotionName = "dash_right";
      }

      if (dashMotionName) {
        // ダッシュ方向が変わった場合、加速時間をリセット
        if (this.currentDashDirection !== dashMotionName) {
          this.dashAccelerationTime = 0;
          this.currentDashDirection = dashMotionName;
          // ダッシュゲージを表示
          this.dashGauge.show();
        }

        // 加速時間を増加（最大1秒）
        this.dashAccelerationTime = Math.min(this.dashAccelerationTime + deltaTime, 1.0);

        // 加速割合を計算（0.0 ~ 1.0）
        const accelerationRatio = this.dashAccelerationTime / 1.0;

        // キャラクター設定から速度倍率を取得
        const dashSpeedMin = this.character.config.movement.dashSpeedMin;
        const dashSpeedMax = this.character.config.movement.dashSpeedMax;

        // 方向別の速度倍率を取得
        let directionMultiplier = 1.0;
        if (dashMotionName === "dash_left" || dashMotionName === "dash_right") {
          directionMultiplier = 0.7; // 横方向は0.7倍
        } else if (dashMotionName === "dash_backward") {
          directionMultiplier = 0.4; // 後ろ方向は0.4倍
        }

        // 速度倍率を計算（キャラクター設定に基づいて加速）
        const minSpeed = dashSpeedMin * directionMultiplier; // ダッシュ開始時の速度
        const maxSpeed = dashSpeedMax * directionMultiplier; // 最高速度
        const currentSpeedMultiplier = minSpeed + (maxSpeed - minSpeed) * accelerationRatio;

        // ダッシュ方向を決定
        const dashDirection = this.getDashDirection(dashMotionName);

        // ジャンプチャージ中でなければダッシュモーションを再生
        if (!this.isJumpPressed && currentMotion !== dashMotionName) {
          this.motionManager.play(dashMotionName, true);
        }

        // ダッシュゲージを更新（ジャンプチャージ中でも表示）
        this.dashGauge.updatePosition(this.character.getPosition());
        this.dashGauge.updateAcceleration(this.dashAccelerationTime);

        // ダッシュ方向に移動
        if (dashDirection) {
          dashDirection.normalize();
          // 加速度に応じた速度で移動
          const scaledDirection = dashDirection.scale(currentSpeedMultiplier);
          this.character.move(scaledDirection, deltaTime);
        }

        // 回転のみ許可
        this.handleRotation(deltaTime);
        return;
      }
    } else {
      // ダッシュボタンが離された場合
      if (this.currentDashDirection !== null) {
        // 加速度に応じたダッシュ停止モーションを生成して再生
        const accelerationRatio = this.dashAccelerationTime / 1.0;
        const dashStopMotion = createDashStopMotion(accelerationRatio);

        // モーションマネージャーに登録してから再生
        this.motionManager.registerMotions([{
          motionData: dashStopMotion,
          isDefault: false,
          blendDuration: 0.05,
          priority: 20,
          interruptible: false,
        }]);

        // ジャンプ中・ジャンプチャージ中でない場合のみ、ダッシュ停止モーションを再生
        if (!isJumping && !this.isJumpPressed) {
          this.motionManager.play("dash_stop", true); // forceで強制再生
          console.log(`[ダッシュ停止] 加速度: ${accelerationRatio.toFixed(2)}, 硬直時間: ${dashStopMotion.duration.toFixed(2)}秒`);

          // クールダウンゲージを開始
          this.cooldownGauge.start(dashStopMotion.duration);
        }

        this.dashAccelerationTime = 0;
        this.currentDashDirection = null;
        this.dashGauge.hide();

        // ジャンプ中またはジャンプチャージ中でない場合は慣性もクリア
        if (!isJumping && !this.isJumpPressed) {
          this.dashMomentumDirection = null;
          this.dashMomentumSpeed = 0;
          this.dashJumpDirection = null;
        }
      }
    }

    // 着地した場合、ダッシュ慣性をクリア
    if (isLanding && this.dashMomentumDirection !== null) {
      this.dashMomentumDirection = null;
      this.dashMomentumSpeed = 0;
      this.dashJumpDirection = null;
    }

    // ジャンプ中はダッシュ慣性で移動
    if (isJumping && this.dashMomentumDirection !== null) {
      // 現在の位置のX/Z座標を保存
      const currentPos = this.character.getPosition();
      const savedX = currentPos.x;
      const savedZ = currentPos.z;
      console.log(`[更新前の位置] x: ${savedX.toFixed(2)}, z: ${savedZ.toFixed(2)}`);

      // モーションマネージャーの更新（ジャンプのY軸移動を適用）
      this.motionManager.update();

      // モーション更新後の位置を取得
      const afterMotionPos = this.character.getPosition();
      console.log(`[更新後の位置] x: ${afterMotionPos.x.toFixed(2)}, y: ${afterMotionPos.y.toFixed(2)}, z: ${afterMotionPos.z.toFixed(2)}`);

      // X/Z座標を元に戻してから、慣性移動を適用
      const newPosition = new Vector3(savedX, afterMotionPos.y, savedZ);
      this.character.setPosition(newPosition);
      console.log(`[復元後の位置] x: ${newPosition.x.toFixed(2)}, y: ${newPosition.y.toFixed(2)}, z: ${newPosition.z.toFixed(2)}`);

      // ダッシュ慣性で移動
      const momentumDirection = this.dashMomentumDirection.clone();
      const scaledDirection = momentumDirection.scale(this.dashMomentumSpeed);
      console.log(`[ジャンプ中の慣性移動] 方向: (${scaledDirection.x.toFixed(2)}, ${scaledDirection.y.toFixed(2)}, ${scaledDirection.z.toFixed(2)})`);
      this.character.move(scaledDirection, deltaTime);

      const finalPos = this.character.getPosition();
      console.log(`[最終位置] x: ${finalPos.x.toFixed(2)}, y: ${finalPos.y.toFixed(2)}, z: ${finalPos.z.toFixed(2)}`);

      // 慣性移動後のX/Z座標だけを基準位置として更新（Y座標はジャンプ開始時のまま）
      const updatedBasePos = new Vector3(finalPos.x, this.jumpStartY, finalPos.z);
      this.character.updateMotionBasePosition(updatedBasePos);
      console.log(`[基準位置更新] x: ${updatedBasePos.x.toFixed(2)}, y: ${updatedBasePos.y.toFixed(2)}, z: ${updatedBasePos.z.toFixed(2)}`);

      this.handleRotation(deltaTime);
      return;
    }

    // ダッシュ中以外はモーションマネージャーの更新（モーション終了検知と位置更新）
    this.motionManager.update();

    // 着地硬直中・ダッシュ停止中は移動不可
    if (!isLanding && !isDashStopping) {
      // 移動方向を計算
      const moveDirection = this.calculateMoveDirection();

      // キャラクターを移動
      const isMoving = moveDirection.length() > 0.01;

      if (isMoving) {
        moveDirection.normalize();

        // 入力方向に応じて適切なモーションを決定
        const motionName = this.determineMotionFromInput();

        // キャラクター設定から歩行速度を取得
        const walkSpeed = this.character.config.movement.walkSpeed;

        // モーション名に基づいて歩行速度倍率を決定
        let speedMultiplier = 1.0; // 前進は1.0倍（基準）
        if (motionName === "walk_backward") {
          speedMultiplier = 0.5; // 後退は0.5倍
        } else if (motionName === "walk_left" || motionName === "walk_right") {
          speedMultiplier = 0.8; // 左右は0.8倍
        }

        // キャラクター設定の速度と方向倍率を適用して移動
        const finalSpeed = walkSpeed * speedMultiplier;
        const scaledDirection = moveDirection.scale(finalSpeed / 5.0); // 5.0で正規化（元の基準速度）
        this.character.move(scaledDirection, deltaTime);

        // モーションを再生
        this.motionManager.play(motionName);
      } else {
        // 移動していない場合はデフォルトモーション（アイドル）に戻る
        this.motionManager.playDefault();
      }
    }

    // 回転処理（Q/Eキーのみで回転）
    this.handleRotation(deltaTime);

    // クールダウンゲージを更新
    if (this.cooldownGauge.isShowing()) {
      this.cooldownGauge.updatePosition(this.character.getPosition());
      this.cooldownGauge.update(deltaTime);
    }
  }

  /**
   * 入力状態から適切なモーション名を決定
   */
  private determineMotionFromInput(): string {
    // 純粋な方向（単一キー）の場合
    if (
      this.inputState.forward &&
      !this.inputState.backward &&
      !this.inputState.left &&
      !this.inputState.right
    ) {
      return "walk_forward";
    }

    if (
      this.inputState.backward &&
      !this.inputState.forward &&
      !this.inputState.left &&
      !this.inputState.right
    ) {
      return "walk_backward";
    }

    if (
      this.inputState.left &&
      !this.inputState.right &&
      !this.inputState.forward &&
      !this.inputState.backward
    ) {
      return "walk_left";
    }

    if (
      this.inputState.right &&
      !this.inputState.left &&
      !this.inputState.forward &&
      !this.inputState.backward
    ) {
      return "walk_right";
    }

    // 斜め移動や複合入力の場合は前後を優先
    if (this.inputState.forward) {
      return "walk_forward";
    }

    if (this.inputState.backward) {
      return "walk_backward";
    }

    if (this.inputState.left) {
      return "walk_left";
    }

    if (this.inputState.right) {
      return "walk_right";
    }

    // デフォルト（通常ここには来ない）
    return "walk_forward";
  }

  /**
   * 移動方向を計算
   */
  private calculateMoveDirection(): Vector3 {
    const forward = this.character.getForwardDirection();
    const right = this.character.getRightDirection();

    let direction = Vector3.Zero();

    // 前後移動
    if (this.inputState.forward) {
      direction = direction.add(forward);
    }
    if (this.inputState.backward) {
      direction = direction.subtract(forward);
    }

    // 左右移動
    if (this.inputState.left) {
      direction = direction.subtract(right);
    }
    if (this.inputState.right) {
      direction = direction.add(right);
    }

    return direction;
  }

  /**
   * ダッシュ方向を取得
   * @param motionName ダッシュモーション名
   * @returns ダッシュ方向ベクトル
   */
  private getDashDirection(motionName: string): Vector3 | null {
    const forward = this.character.getForwardDirection();
    const right = this.character.getRightDirection();

    switch (motionName) {
      case "dash_forward":
        return forward.clone();
      case "dash_backward":
        return forward.clone().negate();
      case "dash_left":
        return right.clone().negate();
      case "dash_right":
        return right.clone();
      default:
        return null;
    }
  }

  /**
   * 回転処理
   */
  private handleRotation(deltaTime: number): void {
    // キャラクター設定から回転速度を取得
    const rotationSpeed = this.character.config.movement.rotationSpeed;

    if (this.inputState.rotateLeft) {
      const newRotation = this.character.getRotation() - rotationSpeed * deltaTime;
      this.character.setRotation(newRotation);
    }

    if (this.inputState.rotateRight) {
      const newRotation = this.character.getRotation() + rotationSpeed * deltaTime;
      this.character.setRotation(newRotation);
    }
  }

  /**
   * モーションマネージャーを取得
   */
  public getMotionManager(): MotionManager {
    return this.motionManager;
  }

  /**
   * 破棄
   */
  public dispose(): void {
    // ジャンプチャージゲージを破棄
    this.jumpChargeGauge.dispose();
    // ダッシュゲージを破棄
    this.dashGauge.dispose();
    // クールダウンゲージを破棄
    this.cooldownGauge.dispose();
    // イベントリスナーの削除は省略（必要に応じて実装）
  }
}
