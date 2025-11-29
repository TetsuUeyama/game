import * as Phaser from 'phaser';
import { Fighter } from './Fighter';

export type MovementType = 'walk' | 'dash' | 'jump' | 'dashJump';

/**
 * MovementEntity - 移動アクションの基底クラス
 *
 * すべての移動アクション（歩行、ダッシュ、ジャンプ等）の基本機能を提供
 */
export abstract class MovementEntity {
  protected owner: Fighter;
  protected scene: Phaser.Scene;
  public movementType: MovementType;
  public isActive: boolean;
  protected startTime: number;
  protected duration: number;

  // 速度ベクトル
  public velocityX: number;
  public velocityY: number;

  // 慣性フラグ
  public hasMomentum: boolean;

  constructor(
    scene: Phaser.Scene,
    owner: Fighter,
    movementType: MovementType,
    duration: number = 0
  ) {
    this.scene = scene;
    this.owner = owner;
    this.movementType = movementType;
    this.isActive = true;
    this.startTime = Date.now();
    this.duration = duration;
    this.velocityX = 0;
    this.velocityY = 0;
    this.hasMomentum = false;
  }

  /**
   * 毎フレーム更新
   * @returns true: 終了, false: 継続中
   */
  abstract update(): boolean;

  /**
   * 移動アクション開始時の処理
   */
  abstract start(): void;

  /**
   * 移動アクション終了時の処理
   */
  abstract end(): void;

  /**
   * 経過時間を取得（ミリ秒）
   */
  protected getElapsedTime(): number {
    return Date.now() - this.startTime;
  }

  /**
   * 継続時間を超えたかチェック
   */
  protected isExpired(): boolean {
    if (this.duration === 0) return false;
    return this.getElapsedTime() >= this.duration;
  }

  /**
   * 移動アクションを終了
   */
  public terminate(): void {
    this.isActive = false;
    this.end();
  }
}
