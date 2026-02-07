/**
 * カメラマネージャー
 * カメラの追従、ターゲット切り替え、モード管理を担当
 */

import { ArcRotateCamera, Vector3 } from "@babylonjs/core";
import { Character } from "../../entities/Character";
import { Ball } from "../../entities/Ball";
import { CAMERA_CONFIG } from "../../config/gameConfig";

/**
 * カメラマネージャー用コンテキスト
 */
export interface CameraManagerContext {
  camera: ArcRotateCamera;
  ball: Ball;
  getAllyCharacters: () => Character[];
  getEnemyCharacters: () => Character[];
}

/**
 * カメラマネージャー
 */
export class CameraManager {
  private context: CameraManagerContext;

  // カメラモード（on_ball: オンボールプレイヤー自動追従, manual: 手動選択）
  private cameraMode: 'on_ball' | 'manual' = 'on_ball';

  // カメラターゲット切り替え用
  private currentTargetTeam: 'ally' | 'enemy' = 'ally';
  private currentTargetIndex: number = 0;

  constructor(context: CameraManagerContext) {
    this.context = context;
  }

  /**
   * カメラの追従更新
   */
  public update(_deltaTime: number): void {
    const targetCharacter = this.getCurrentTargetCharacter();
    if (!targetCharacter) return;

    const characterPosition = targetCharacter.getPosition();
    const followSpeed = CAMERA_CONFIG.followSpeed;

    this.context.camera.target.x +=
      (characterPosition.x - this.context.camera.target.x) * followSpeed;
    this.context.camera.target.y +=
      (characterPosition.y - this.context.camera.target.y) * followSpeed;
    this.context.camera.target.z +=
      (characterPosition.z - this.context.camera.target.z) * followSpeed;
  }

  /**
   * 現在のターゲットキャラクターを取得
   */
  public getCurrentTargetCharacter(): Character | null {
    const allyCharacters = this.context.getAllyCharacters();
    const enemyCharacters = this.context.getEnemyCharacters();

    // オンボールモードの場合、ボール保持者を返す
    if (this.cameraMode === 'on_ball') {
      const holder = this.context.ball.getHolder();
      if (holder) {
        return holder;
      }
      // ボール保持者がいない場合はボールに最も近いキャラクターを返す
      const ballPos = this.context.ball.getPosition();
      let closestChar: Character | null = null;
      let closestDist = Infinity;
      for (const char of [...allyCharacters, ...enemyCharacters]) {
        const dist = Vector3.Distance(char.getPosition(), ballPos);
        if (dist < closestDist) {
          closestDist = dist;
          closestChar = char;
        }
      }
      return closestChar;
    }

    // マニュアルモードの場合、選択されたキャラクターを返す
    const characters = this.currentTargetTeam === 'ally' ? allyCharacters : enemyCharacters;
    if (characters.length === 0) return null;
    if (this.currentTargetIndex >= characters.length) {
      this.currentTargetIndex = 0;
    }
    return characters[this.currentTargetIndex];
  }

  /**
   * カメラターゲットを次のキャラクターに切り替え
   */
  public switchToNextCharacter(): void {
    const characters = this.currentTargetTeam === 'ally'
      ? this.context.getAllyCharacters()
      : this.context.getEnemyCharacters();
    if (characters.length === 0) return;

    this.currentTargetIndex = (this.currentTargetIndex + 1) % characters.length;
  }

  /**
   * カメラターゲットを前のキャラクターに切り替え
   */
  public switchToPreviousCharacter(): void {
    const characters = this.currentTargetTeam === 'ally'
      ? this.context.getAllyCharacters()
      : this.context.getEnemyCharacters();
    if (characters.length === 0) return;

    this.currentTargetIndex = (this.currentTargetIndex - 1 + characters.length) % characters.length;
  }

  /**
   * カメラターゲットのチームを切り替え
   */
  public switchTeam(): void {
    this.currentTargetTeam = this.currentTargetTeam === 'ally' ? 'enemy' : 'ally';
    this.currentTargetIndex = 0;
  }

  /**
   * 現在のターゲット情報を取得
   */
  public getCurrentTargetInfo(): {
    team: 'ally' | 'enemy';
    index: number;
    character: Character | null;
    cameraMode: 'on_ball' | 'manual';
  } {
    return {
      team: this.currentTargetTeam,
      index: this.currentTargetIndex,
      character: this.getCurrentTargetCharacter(),
      cameraMode: this.cameraMode,
    };
  }

  /**
   * カメラモードを設定
   */
  public setCameraMode(mode: 'on_ball' | 'manual'): void {
    this.cameraMode = mode;
  }

  /**
   * カメラモードを取得
   */
  public getCameraMode(): 'on_ball' | 'manual' {
    return this.cameraMode;
  }
}
