import { Vector3 } from "@babylonjs/core";
import { Ball } from "@/GamePlay/Object/Entities/Ball";
import { Character } from "@/GamePlay/Object/Entities/Character";

/**
 * シュートクロック違反時のコールバック型
 * @param offendingTeam 違反したチーム
 * @param ballPosition 違反時のボール位置
 */
export type ShotClockViolationCallback = (offendingTeam: 'ally' | 'enemy', ballPosition: Vector3) => void;

/**
 * シュートクロックコントローラー
 * オフェンス側が24秒以内にシュートを打たないとターンオーバーになる
 */
export class ShotClockController {
  private ball: Ball;
  private shotClockTime: number = 24.0; // シュートクロック（秒）
  private currentTime: number = 0;
  private isRunning: boolean = false;
  private currentOffenseTeam: 'ally' | 'enemy' | null = null;
  private violationCallback: ShotClockViolationCallback | null = null;

  // シュートが打たれたかどうかのフラグ
  private shotAttempted: boolean = false;

  constructor(ball: Ball) {
    this.ball = ball;
  }

  /**
   * 違反時のコールバックを設定
   */
  public setViolationCallback(callback: ShotClockViolationCallback): void {
    this.violationCallback = callback;
  }

  /**
   * シュートクロックをリセットして開始
   * @param offenseTeam オフェンス側のチーム
   */
  public reset(offenseTeam: 'ally' | 'enemy'): void {
    this.currentTime = this.shotClockTime;
    this.currentOffenseTeam = offenseTeam;
    this.isRunning = true;
    this.shotAttempted = false;
  }

  /**
   * シュートクロックを停止
   */
  public stop(): void {
    this.isRunning = false;
    this.currentOffenseTeam = null;
  }

  /**
   * シュートが打たれたことを通知
   * シュートクロックをリセット（リムに当たった場合は14秒にリセット）
   */
  public onShotAttempted(): void {
    this.shotAttempted = true;
    // シュートが打たれたらクロックを停止（ボールが誰かに保持されるまで）
    this.isRunning = false;
  }

  /**
   * ボールの保持者が変わったことを通知
   * @param newHolder 新しいボール保持者
   */
  public onPossessionChange(newHolder: Character | null): void {
    if (!newHolder) {
      // ボールがルーズの場合はクロックを停止
      this.isRunning = false;
      return;
    }

    const newTeam = newHolder.team;

    // シュート後にオフェンスリバウンドを取った場合は14秒にリセット
    if (this.shotAttempted && newTeam === this.currentOffenseTeam) {
      this.currentTime = 14.0;
      this.isRunning = true;
      this.shotAttempted = false;
      return;
    }

    // ターンオーバー（相手にボールが渡った）場合は24秒にリセット
    if (newTeam !== this.currentOffenseTeam) {
      this.reset(newTeam);
      return;
    }

    // 同じチームが保持を継続
    this.isRunning = true;
    this.shotAttempted = false;
  }

  /**
   * 更新処理
   * @param deltaTime 経過時間（秒）
   */
  public update(deltaTime: number): void {
    if (!this.isRunning || !this.currentOffenseTeam) {
      return;
    }

    // ボールが飛行中（シュート中）の場合はカウントダウンを停止
    if (this.ball.isInFlight()) {
      return;
    }

    this.currentTime -= deltaTime;

    // シュートクロック違反
    if (this.currentTime <= 0) {
      this.currentTime = 0;
      this.isRunning = false;

      if (this.violationCallback && this.currentOffenseTeam) {
        // 違反時のボール位置を記録
        const ballPosition = this.ball.getPosition().clone();
        this.violationCallback(this.currentOffenseTeam, ballPosition);
      }
    }
  }

  /**
   * 残り時間を取得
   */
  public getRemainingTime(): number {
    return Math.max(0, this.currentTime);
  }

  /**
   * クロックが動いているかどうか
   */
  public isClockRunning(): boolean {
    return this.isRunning;
  }

  /**
   * 現在のオフェンスチームを取得
   */
  public getCurrentOffenseTeam(): 'ally' | 'enemy' | null {
    return this.currentOffenseTeam;
  }
}
