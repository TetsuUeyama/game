import { Vector3 } from "@babylonjs/core";
import { Character } from "@/GamePlay/Object/Entities/Character";
import { Ball } from "@/GamePlay/Object/Entities/Ball";

/**
 * ルーズボール確保システム
 *
 * loose_ball_scramble アクションの active フェーズ中に：
 * 1. 敵チーム同士のヒットボックス衝突 → ボールがランダム方向にバウンド
 * 2. ヒットボックスとボールの重なり → 即保持（setHolder）
 *
 * 衝突チェックを確保判定より先に行う（同時に飛び込んだらバウンドが優先）
 */
export class LooseBallScrambleSystem {
  private ball: Ball;
  private allCharacters: Character[];

  /** バウンドインパルスの強さ（N·s） */
  private static readonly BOUNCE_IMPULSE = 5.0;
  /** バウンド上方向成分 */
  private static readonly BOUNCE_UP_COMPONENT = 0.4;
  /** ランダム角度の範囲（ラジアン） */
  private static readonly RANDOM_ANGLE_RANGE = Math.PI / 4; // 45度

  constructor(ball: Ball, characters: Character[]) {
    this.ball = ball;
    this.allCharacters = characters;
  }

  /**
   * 毎フレーム呼び出し
   */
  public update(_deltaTime: number): void {
    // ボールが保持中 or 飛行中 → 何もしない
    if (this.ball.isHeld() || this.ball.isInFlight()) {
      return;
    }

    // loose_ball_scramble の active フェーズ中のキャラクターを収集
    const activeScrambleChars = this.collectActiveScrambleCharacters();
    if (activeScrambleChars.length === 0) {
      return;
    }

    // 1. 敵チーム同士の衝突チェック（確保判定より先に行う）
    const bounced = this.checkScrambleCollisions(activeScrambleChars);

    // バウンドが発生した場合は確保判定をスキップ
    if (bounced) {
      return;
    }

    // 2. ボール確保判定
    this.checkBallCapture(activeScrambleChars);
  }

  /**
   * loose_ball_scramble の active フェーズ中のキャラクターを収集
   */
  private collectActiveScrambleCharacters(): Character[] {
    const result: Character[] = [];

    for (const char of this.allCharacters) {
      const actionController = char.getActionController();
      if (
        actionController.getCurrentAction() === 'loose_ball_scramble' &&
        actionController.getCurrentPhase() === 'active'
      ) {
        result.push(char);
      }
    }

    return result;
  }

  /**
   * 敵チーム同士のヒットボックス衝突チェック
   * @returns バウンドが発生した場合 true
   */
  private checkScrambleCollisions(activeChars: Character[]): boolean {
    for (let i = 0; i < activeChars.length; i++) {
      for (let j = i + 1; j < activeChars.length; j++) {
        const charA = activeChars[i];
        const charB = activeChars[j];

        // 同じチームはスキップ
        if (charA.team === charB.team) {
          continue;
        }

        // 両者のヒットボックスを取得
        const hitboxA = charA.getActionController().getActiveHitbox();
        const hitboxB = charB.getActionController().getActiveHitbox();

        if (!hitboxA || !hitboxB) {
          continue;
        }

        // 球同士の距離チェック
        const dist = Vector3.Distance(hitboxA.worldPosition, hitboxB.worldPosition);
        const combinedRadius = hitboxA.config.radius + hitboxB.config.radius;

        if (dist < combinedRadius) {
          // 衝突 → ボールをランダム方向にバウンド
          this.bounceLooseBall(charA, charB);
          return true;
        }
      }
    }

    return false;
  }

  /**
   * ヒットボックスとボールの重なりチェック → 即保持
   */
  private checkBallCapture(activeChars: Character[]): void {
    const ballPos = this.ball.getPosition();

    for (const char of activeChars) {
      const hitbox = char.getActionController().getActiveHitbox();
      if (!hitbox) {
        continue;
      }

      // ヒットボックス（球）とボール位置の距離チェック
      const dist = Vector3.Distance(hitbox.worldPosition, ballPos);

      if (dist < hitbox.config.radius) {
        // 即保持
        this.ball.setHolder(char);
        return;
      }
    }
  }

  /**
   * ボールをランダム方向にバウンドさせる
   * 2人の中間点からボール方向 + ランダム角度(-45〜+45度)
   */
  private bounceLooseBall(charA: Character, charB: Character): void {
    const posA = charA.getPosition();
    const posB = charB.getPosition();
    const ballPos = this.ball.getPosition();

    // 2人の中間点
    const midPoint = new Vector3(
      (posA.x + posB.x) / 2,
      (posA.y + posB.y) / 2,
      (posA.z + posB.z) / 2
    );

    // 中間点からボール方向
    let direction = ballPos.subtract(midPoint);
    direction.y = 0; // 水平方向のみ

    // ゼロベクトルの場合はランダム方向を生成
    if (direction.length() < 0.001) {
      const randomAngle = Math.random() * Math.PI * 2;
      direction = new Vector3(Math.cos(randomAngle), 0, Math.sin(randomAngle));
    } else {
      direction.normalize();
    }

    // ランダム角度を加える(-45〜+45度)
    const randomOffset = (Math.random() - 0.5) * 2 * LooseBallScrambleSystem.RANDOM_ANGLE_RANGE;
    const cos = Math.cos(randomOffset);
    const sin = Math.sin(randomOffset);
    const rotatedX = direction.x * cos - direction.z * sin;
    const rotatedZ = direction.x * sin + direction.z * cos;

    // インパルスベクトル（上方向成分を加える）
    const impulse = new Vector3(
      rotatedX * LooseBallScrambleSystem.BOUNCE_IMPULSE,
      LooseBallScrambleSystem.BOUNCE_UP_COMPONENT * LooseBallScrambleSystem.BOUNCE_IMPULSE,
      rotatedZ * LooseBallScrambleSystem.BOUNCE_IMPULSE
    );

    // ボールにインパルスを適用
    this.ball.applyImpulse(impulse);

    // デフレクションクールダウンを設定（即再キャッチ不可）
    this.ball.setDeflectionCooldown();
  }

  /**
   * 破棄
   */
  public dispose(): void {
    // 特にクリーンアップ不要
  }
}
