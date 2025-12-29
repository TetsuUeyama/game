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
} from "../data/LandingMotion";
import { CROUCH_MOTION_CONFIG } from "../data/CrouchMotion";
import { JumpChargeGauge } from "../ui/JumpChargeGauge";

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

  constructor(scene: Scene, character: Character) {
    this.scene = scene;
    this.character = character;

    // ジャンプチャージゲージを初期化
    this.jumpChargeGauge = new JumpChargeGauge(scene);

    // 入力状態を初期化
    this.inputState = {
      forward: false,
      backward: false,
      left: false,
      right: false,
      rotateLeft: false,
      rotateRight: false,
      jump: false,
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
          // 現在のモーションを停止してからcrouchを再生（ブレンドなしで即座に切り替え）
          this.character.stopMotion();
          this.motionManager.play("crouch", true); // forceで強制再生
          // すぐに一時停止して初期状態（時間0）に設定
          this.character.pauseMotion();
          this.character.setMotionTime(0);
          // ジャンプチャージゲージを表示
          this.jumpChargeGauge.show();
        }
        this.inputState.jump = true;
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
    }
  }

  /**
   * ジャンプを実行
   * @param pressDuration ボタン押下時間（秒）
   */
  private executeJump(pressDuration: number): void {
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

    // しゃがみ込み中の処理
    if (this.isJumpPressed) {
      // 押下時間を計算（ミリ秒→秒）
      const pressDuration = (performance.now() - this.jumpPressStartTime) / 1000;
      const targetTime = Math.min(pressDuration, 0.3);

      // しゃがみ込みモーションの時間を押下時間に応じて設定（最大0.3秒）
      // モーション名に関わらず、一時停止して時間を設定
      this.character.pauseMotion(); // 一時停止
      this.character.setMotionTime(targetTime);

      // ジャンプチャージゲージを更新
      this.jumpChargeGauge.updatePosition(this.character.getPosition());
      this.jumpChargeGauge.updateCharge(pressDuration);

      // 回転のみ許可
      this.handleRotation(deltaTime);
      return;
    }

    // ジャンプが終了して着地硬直が待機中の場合
    if (this.pendingLandingMotion && currentMotion === "jump" && !isPlaying) {
      // 着地硬直モーションを再生
      this.motionManager.play(this.pendingLandingMotion, true); // forceで強制再生
      this.pendingLandingMotion = null;
      // モーション更新は着地硬直が自動的にidleに戻るため不要
      this.handleRotation(deltaTime);
      return;
    }

    // モーションマネージャーの更新（モーション終了検知）
    this.motionManager.update();

    // 現在のモーション状態を再取得
    const updatedMotion = this.motionManager.getCurrentMotionName();
    const isJumping = updatedMotion === "jump";
    const isLanding = updatedMotion === "landing_small" || updatedMotion === "landing" || updatedMotion === "landing_large";

    // ジャンプ中または着地硬直中は移動不可
    if (!isJumping && !isLanding) {
      // 移動方向を計算
      const moveDirection = this.calculateMoveDirection();

      // キャラクターを移動
      const isMoving = moveDirection.length() > 0.01;

      if (isMoving) {
        moveDirection.normalize();
        this.character.move(moveDirection, deltaTime);

        // 入力方向に応じて適切なモーションを再生
        const motionName = this.determineMotionFromInput();
        this.motionManager.play(motionName);
      } else {
        // 移動していない場合はデフォルトモーション（アイドル）に戻る
        this.motionManager.playDefault();
      }
    }

    // 回転処理（Q/Eキーのみで回転）
    this.handleRotation(deltaTime);
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
   * 回転処理
   */
  private handleRotation(deltaTime: number): void {
    const rotationSpeed = 2.0; // ラジアン/秒

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
    // イベントリスナーの削除は省略（必要に応じて実装）
  }
}
