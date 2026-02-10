import { Vector3 } from "@babylonjs/core";
import { Character } from "../../entities/Character";
import { Ball } from "../../entities/Ball";

/** アクション開始距離（m） */
const PICKUP_TRIGGER_DISTANCE = 1.5;
/** 敵チェック半径（m） */
const ENEMY_CHECK_RADIUS = 3.0;
/** スクランブル失敗後のクールダウン（秒） */
const SCRAMBLE_COOLDOWN = 0.5;

/**
 * ルーズボール確保コントローラー
 *
 * LooseBallAIから呼ばれ、状況に応じて2つの確保行動を使い分ける:
 * - 敵が近くにいない → loose_ball_pickup（落ち着いてピックアップ）
 * - 敵が近くにいる → loose_ball_scramble（ダイブで奪取）
 */
export class LooseBallController {
  private ball: Ball;
  private getAllCharacters: () => Character[];

  /** スクランブルのクールダウン追跡 */
  private lastScrambleTime: Map<Character, number> = new Map();

  constructor(
    ball: Ball,
    getAllCharacters: () => Character[]
  ) {
    this.ball = ball;
    this.getAllCharacters = getAllCharacters;
  }

  /**
   * ボール確保アクションを試行
   * @returns アクション開始に成功した場合true
   */
  public trySecureBall(character: Character): boolean {
    // バリデーション: ボールが未保持
    if (this.ball.isHeld()) {
      return false;
    }

    // バリデーション: ボールが飛行中でない
    if (this.ball.isInFlight()) {
      return false;
    }

    // バリデーション: 距離チェック
    const ballPos = this.ball.getPosition();
    const charPos = character.getPosition();
    const dist = Vector3.Distance(
      new Vector3(ballPos.x, 0, ballPos.z),
      new Vector3(charPos.x, 0, charPos.z)
    );
    if (dist > PICKUP_TRIGGER_DISTANCE) {
      return false;
    }

    // 敵チェック
    if (this.hasNearbyEnemy(character, ENEMY_CHECK_RADIUS)) {
      return this.performScramble(character);
    } else {
      return this.performPickup(character);
    }
  }

  /**
   * 穏やかなピックアップ（敵が近くにいない場合）
   */
  private performPickup(character: Character): boolean {
    const actionController = character.getActionController();
    const result = actionController.startAction('loose_ball_pickup');

    if (result.success) {
      // startAction内部でcallbacksがクリアされるため、startActionの後にsetCallbacksを呼ぶ
      const ball = this.ball;
      actionController.setCallbacks({
        onActive: () => {
          // アクティブ時点でまだボールが未保持なら保持する
          if (!ball.isHeld()) {
            ball.setHolder(character);
          }
        },
      });
    }

    return result.success;
  }

  /**
   * ダイブで奪取（敵が近くにいる場合）
   * scrambleの確保判定はLooseBallScrambleSystemが処理（hitbox重なりで保持）
   */
  private performScramble(character: Character): boolean {
    // クールダウンチェック
    const now = Date.now();
    const lastTime = this.lastScrambleTime.get(character) ?? 0;
    if (now - lastTime < SCRAMBLE_COOLDOWN * 1000) {
      return false;
    }

    const actionController = character.getActionController();
    const result = actionController.startAction('loose_ball_scramble');

    if (result.success) {
      this.lastScrambleTime.set(character, now);
    }

    return result.success;
  }

  /**
   * 状態をリセット（ゲーム再開時等）
   */
  public reset(): void {
    this.lastScrambleTime.clear();
  }

  /**
   * 指定半径以内に敵チームの選手がいるかチェック
   */
  private hasNearbyEnemy(character: Character, radius: number): boolean {
    const myPos = character.getPosition();
    const myTeam = character.team;

    for (const other of this.getAllCharacters()) {
      if (other === character) continue;
      if (other.team === myTeam) continue;

      const dist = Vector3.Distance(
        new Vector3(myPos.x, 0, myPos.z),
        new Vector3(other.getPosition().x, 0, other.getPosition().z)
      );
      if (dist <= radius) {
        return true;
      }
    }

    return false;
  }
}
