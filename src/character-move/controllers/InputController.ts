import { Scene, Vector3 } from "@babylonjs/core";
import { Character } from "../entities/Character";

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
}

/**
 * 入力コントローラー
 * キーボード入力を管理し、キャラクターの移動を制御
 */
export class InputController {
  private scene: Scene;
  private character: Character;
  private inputState: InputState;

  constructor(scene: Scene, character: Character) {
    this.scene = scene;
    this.character = character;

    // 入力状態を初期化
    this.inputState = {
      forward: false,
      backward: false,
      left: false,
      right: false,
      rotateLeft: false,
      rotateRight: false,
    };

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
    }
  }

  /**
   * 更新（毎フレーム呼び出す）
   * @param deltaTime フレーム時間（秒）
   */
  public update(deltaTime: number): void {
    // 移動方向を計算
    const moveDirection = this.calculateMoveDirection();

    // キャラクターを移動
    if (moveDirection.length() > 0.01) {
      moveDirection.normalize();
      this.character.move(moveDirection, deltaTime);
    }

    // 回転処理（Q/Eキーのみで回転）
    this.handleRotation(deltaTime);
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
   * 破棄
   */
  public dispose(): void {
    // イベントリスナーの削除は省略（必要に応じて実装）
  }
}
