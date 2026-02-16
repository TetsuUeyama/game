import { Vector3 } from "@babylonjs/core";
import { Character } from "../../entities/Character";
import { Ball } from "../../entities/Ball";
import { Field } from "../../entities/Field";
import { BaseStateAI } from "./BaseStateAI";
import { IDLE_MOTION } from "../../motion/IdleMotion";
import { JUMP_BALL_MOTION } from "../../motion/JumpMotion";
import {
  JUMP_BALL_TIMING,
  JUMP_BALL_PHYSICS,
} from "../../config/JumpBallConfig";
import { getDistance2DSimple } from "@/physics/spatial/SpatialUtils";

/**
 * ジャンプボール実行コールバック
 */
export type JumpBallTipCallback = (
  jumper: Character,
  tipDirection: Vector3
) => void;

/**
 * ジャンプボールジャンパーAI
 * ジャンプボールに参加する選手（各チーム1名）の動作を制御
 *
 * 責務:
 * - センターサークル中央で待機
 * - 相手ジャンパーの方を向く
 * - ボール投げ上げ後のタイミングでジャンプ
 * - ボールをチップ（味方方向に弾く）
 */
export class JumpBallJumperAI extends BaseStateAI {
  /** ジャンプボール開始位置（センターサークル内） */
  private jumpPosition: Vector3 | null = null;
  /** 相手ジャンパー */
  private opponentJumper: Character | null = null;
  /** チップ方向（味方チームの方向） */
  private tipDirection: Vector3 | null = null;
  /** ジャンプボール開始フラグ */
  private isJumpBallActive: boolean = false;
  /** ボール投げ上げ開始時刻 */
  private tossStartTime: number = 0;
  /** ジャンプ実行済みフラグ */
  private hasJumped: boolean = false;
  /** チップ実行済みフラグ */
  private hasTipped: boolean = false;
  /** チップコールバック */
  private tipCallback: JumpBallTipCallback | null = null;

  constructor(
    character: Character,
    ball: Ball,
    allCharacters: Character[],
    field: Field
  ) {
    super(character, ball, allCharacters, field);
  }

  /**
   * ジャンプ位置を設定
   */
  public setJumpPosition(position: Vector3): void {
    this.jumpPosition = position;
  }

  /**
   * 相手ジャンパーを設定
   */
  public setOpponentJumper(opponent: Character): void {
    this.opponentJumper = opponent;
  }

  /**
   * チップ方向を設定（味方の方向）
   */
  public setTipDirection(direction: Vector3): void {
    this.tipDirection = direction.normalize();
  }

  /**
   * チップコールバックを設定
   */
  public setTipCallback(callback: JumpBallTipCallback): void {
    this.tipCallback = callback;
  }

  /**
   * ジャンプボールを開始（ボール投げ上げ時に呼び出し）
   */
  public startJumpBall(): void {
    this.isJumpBallActive = true;
    this.tossStartTime = Date.now();
    this.hasJumped = false;
    this.hasTipped = false;
  }

  /**
   * ジャンプボールをリセット
   */
  public reset(): void {
    this.isJumpBallActive = false;
    this.hasJumped = false;
    this.hasTipped = false;
    this.tossStartTime = 0;
  }

  /**
   * 状態に入った時のリセット
   */
  public onEnterState(): void {
    this.reset();
  }

  /**
   * 状態から出る時のリセット
   */
  public onExitState(): void {
    this.reset();
    this.jumpPosition = null;
    this.opponentJumper = null;
    this.tipDirection = null;
    this.tipCallback = null;
  }

  /**
   * AIの更新処理
   */
  public update(_deltaTime: number): void {
    // ジャンプボール位置に移動
    if (this.jumpPosition) {
      const myPos = this.character.getPosition();
      const distanceToPosition = Vector3.Distance(
        new Vector3(myPos.x, 0, myPos.z),
        new Vector3(this.jumpPosition.x, 0, this.jumpPosition.z)
      );

      if (distanceToPosition > 0.3) {
        // 位置に向かって移動
        this.moveTowards(this.jumpPosition, _deltaTime, 0.2);
        return;
      }
    }

    // 相手ジャンパーの方を向く
    if (this.opponentJumper) {
      const myPos = this.character.getPosition();
      const oppPos = this.opponentJumper.getPosition();
      const direction = new Vector3(
        oppPos.x - myPos.x,
        0,
        oppPos.z - myPos.z
      );
      if (direction.length() > 0.01) {
        const angle = Math.atan2(direction.x, direction.z);
        this.character.setRotation(angle);
      }
    }

    // ジャンプボールがアクティブでない場合は待機
    if (!this.isJumpBallActive) {
      // 静止してアイドルモーション
      if (this.character.getCurrentMotionName() !== 'idle') {
        this.character.playMotion(IDLE_MOTION);
      }
      this.character.stopMovement();
      return;
    }

    // ボール投げ上げからの経過時間
    const elapsedTime = (Date.now() - this.tossStartTime) / 1000;

    // ジャンプタイミング
    if (!this.hasJumped && elapsedTime >= JUMP_BALL_TIMING.TOSS_TO_JUMP_DELAY) {
      this.executeJump();
    }

    // チップタイミング（ボールが適切な高さにある場合）
    if (this.hasJumped && !this.hasTipped) {
      this.tryTipBall();
    }
  }

  /**
   * ジャンプを実行
   */
  private executeJump(): void {
    this.hasJumped = true;

    // ジャンプボールモーションを再生
    this.character.playMotion(JUMP_BALL_MOTION);

    // 重心に力を加える（アクションコントローラーがあれば）
    const actionController = this.character.getActionController();
    if (actionController) {
      actionController.startAction('jump_ball');
    }

  }

  /**
   * ボールをチップできるか試行
   */
  private tryTipBall(): void {
    const ballPos = this.ball.getPosition();
    const myPos = this.character.getPosition();

    // ボールが適切な高さにあるかチェック
    if (ballPos.y < JUMP_BALL_TIMING.TIP_ENABLED_MIN_HEIGHT ||
        ballPos.y > JUMP_BALL_TIMING.TIP_ENABLED_MAX_HEIGHT) {
      return;
    }

    // ボールが自分の近くにあるかチェック（水平距離）
    const horizontalDistance = getDistance2DSimple(ballPos, myPos);

    // リーチ範囲内にあるかチェック
    const reachRange = 1.0; // 手の届く範囲
    if (horizontalDistance > reachRange) {
      return;
    }

    // チップを実行
    this.executeTip();
  }

  /**
   * チップを実行
   */
  private executeTip(): void {
    this.hasTipped = true;

    // チップ方向が設定されていない場合、味方側に弾く
    let tipDir = this.tipDirection;
    if (!tipDir) {
      // デフォルト：味方サイドの方向
      const isAlly = this.character.team === 'ally';
      tipDir = new Vector3(0, 0, isAlly ? -1 : 1);
    }

    // チップ方向に水平成分と垂直成分を追加
    const finalDirection = new Vector3(
      tipDir.x * JUMP_BALL_PHYSICS.TIP_HORIZONTAL_RATIO,
      JUMP_BALL_PHYSICS.TIP_VERTICAL_RATIO,
      tipDir.z * JUMP_BALL_PHYSICS.TIP_HORIZONTAL_RATIO
    ).normalize();

    // ボールをチップ
    this.ball.tipBall(finalDirection, JUMP_BALL_PHYSICS.TIP_BALL_SPEED);

    // コールバックを呼び出し
    if (this.tipCallback) {
      this.tipCallback(this.character, finalDirection);
    }

  }

  /**
   * ジャンプボールがアクティブかどうか
   */
  public isActive(): boolean {
    return this.isJumpBallActive;
  }

  /**
   * チップ済みかどうか
   */
  public isTipped(): boolean {
    return this.hasTipped;
  }
}
