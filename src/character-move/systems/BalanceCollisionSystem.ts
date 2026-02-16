/**
 * BalanceCollisionSystem
 *
 * 複数キャラクター間の重心球（ビー玉）衝突を処理するシステム。
 * 毎フレームの更新で全キャラクターペアの衝突を検出・処理する。
 */

import { Vector3 } from "@babylonjs/core";
import { Character } from "../entities/Character";
import type { CollisionResult } from "../controllers/BalanceController";
import { BALANCE_COLLISION, CONTACT_PLAY } from "@/physics/balance/BalanceConfig";

/**
 * 衝突イベント
 */
export interface BalanceCollisionEvent {
  characterA: Character;
  characterB: Character;
  result: CollisionResult;
  contactPoint: Vector3;
  impactStrength: number;
}

/**
 * 衝突コールバック
 */
export interface BalanceCollisionCallbacks {
  onCollision?: (event: BalanceCollisionEvent) => void;
  onDestabilized?: (character: Character, by: Character) => void;
  onKnockedBack?: (character: Character, by: Character, velocity: Vector3) => void;
  onPushSuccess?: (pusher: Character, pushed: Character, force: number) => void;
}

/**
 * 重心衝突システム
 */
export class BalanceCollisionSystem {
  private characters: Character[] = [];
  private callbacks: BalanceCollisionCallbacks = {};
  private processedPairs: Set<string> = new Set();

  /**
   * コールバックを設定
   */
  setCallbacks(callbacks: BalanceCollisionCallbacks): void {
    this.callbacks = callbacks;
  }

  /**
   * 管理対象のキャラクターを設定
   */
  setCharacters(characters: Character[]): void {
    this.characters = characters;
  }

  /**
   * キャラクターを追加
   */
  addCharacter(character: Character): void {
    if (!this.characters.includes(character)) {
      this.characters.push(character);
    }
  }

  /**
   * キャラクターを削除
   */
  removeCharacter(character: Character): void {
    const index = this.characters.indexOf(character);
    if (index !== -1) {
      this.characters.splice(index, 1);
    }
  }

  /**
   * 更新処理（毎フレーム）
   */
  update(_deltaTime: number): BalanceCollisionEvent[] {
    this.processedPairs.clear();
    const events: BalanceCollisionEvent[] = [];

    for (let i = 0; i < this.characters.length; i++) {
      for (let j = i + 1; j < this.characters.length; j++) {
        const event = this.checkCollision(this.characters[i], this.characters[j]);
        if (event) {
          events.push(event);
          this.handleEvent(event);
        }
      }
    }

    return events;
  }

  /**
   * 2キャラクター間の衝突をチェック
   */
  private checkCollision(charA: Character, charB: Character): BalanceCollisionEvent | null {
    const pairId = this.getPairId(charA, charB);
    if (this.processedPairs.has(pairId)) return null;
    this.processedPairs.add(pairId);

    const posA = charA.getPosition();
    const posB = charB.getPosition();
    const distance = Vector3.Distance(posA, posB);

    // 距離チェック
    if (distance > BALANCE_COLLISION.CHECK_DISTANCE) return null;
    if (distance > BALANCE_COLLISION.BODY_CONTACT_DISTANCE) return null;

    // 重心コントローラー取得
    const balanceA = charA.getBalanceController();
    const balanceB = charB.getBalanceController();
    if (!balanceA || !balanceB) return null;

    // 衝突法線と衝突点
    const contactNormal = posB.subtract(posA).normalize();
    const contactPoint = posA.add(posB).scale(0.5);

    // 衝突処理
    const result = balanceA.collideWith(balanceB, contactNormal);
    if (!result.occurred) return null;

    // 相手側にも速度変化を適用
    balanceB.applyImpulse(result.velocityChangeB);

    return {
      characterA: charA,
      characterB: charB,
      result,
      contactPoint,
      impactStrength: result.impulseMagnitude,
    };
  }

  /**
   * イベント処理
   */
  private handleEvent(event: BalanceCollisionEvent): void {
    this.callbacks.onCollision?.(event);

    const { result, characterA, characterB } = event;

    // バランス崩れ
    if (result.destabilizedA) {
      this.callbacks.onDestabilized?.(characterA, characterB);
    }
    if (result.destabilizedB) {
      this.callbacks.onDestabilized?.(characterB, characterA);
    }

    // 吹き飛ばし
    if (result.knockedBackA) {
      this.callbacks.onKnockedBack?.(characterA, characterB, result.velocityChangeA);
    }
    if (result.knockedBackB) {
      this.callbacks.onKnockedBack?.(characterB, characterA, result.velocityChangeB);
    }

    // 押し込み判定（運動量の差で判定）
    const pushDiff = result.velocityChangeB.length() - result.velocityChangeA.length();
    if (Math.abs(pushDiff) > 0.5) {
      if (pushDiff > 0) {
        this.callbacks.onPushSuccess?.(characterA, characterB, pushDiff);
      } else {
        this.callbacks.onPushSuccess?.(characterB, characterA, -pushDiff);
      }
    }
  }

  /**
   * ペアID生成
   */
  private getPairId(a: Character, b: Character): string {
    // キャラクターを識別するためにチームと選手名を使用
    const idA = `${a.team}_${a.playerData?.basic?.NAME ?? 'unknown'}`;
    const idB = `${b.team}_${b.playerData?.basic?.NAME ?? 'unknown'}`;
    return idA < idB ? `${idA}-${idB}` : `${idB}-${idA}`;
  }

  /**
   * ポストアップ開始
   */
  initiatePostUp(attacker: Character, defender: Character): void {
    const atkBalance = attacker.getBalanceController();
    const defBalance = defender.getBalanceController();
    if (!atkBalance || !defBalance) return;

    const direction = defender.getPosition().subtract(attacker.getPosition()).normalize();
    const pushForce = atkBalance.getPushPower() * CONTACT_PLAY.POST_UP_BONUS;

    defBalance.applyForce(direction.scale(pushForce * 0.5), 0.3);
    atkBalance.applyForce(direction.scale(-pushForce * 0.1), 0.2);
  }

  /**
   * ボックスアウト開始
   */
  initiateBoxOut(boxer: Character, opponent: Character): void {
    const boxerBalance = boxer.getBalanceController();
    const oppBalance = opponent.getBalanceController();
    if (!boxerBalance || !oppBalance) return;

    // 重心を下げて安定させる
    boxerBalance.applyForce(new Vector3(0, -10, 0), 0.5);

    // 相手を押し出す
    const direction = opponent.getPosition().subtract(boxer.getPosition()).normalize();
    const pushForce = boxerBalance.getPushPower() * CONTACT_PLAY.BOX_OUT_BONUS;
    oppBalance.applyForce(direction.scale(pushForce * 0.3), 0.4);
  }

  /**
   * デバッグ情報
   */
  getDebugInfo(): {
    characterCount: number;
    activeContacts: { charA: string; charB: string; distance: number }[];
  } {
    const activeContacts: { charA: string; charB: string; distance: number }[] = [];

    for (let i = 0; i < this.characters.length; i++) {
      for (let j = i + 1; j < this.characters.length; j++) {
        const dist = Vector3.Distance(
          this.characters[i].getPosition(),
          this.characters[j].getPosition()
        );
        if (dist <= BALANCE_COLLISION.BODY_CONTACT_DISTANCE) {
          activeContacts.push({
            charA: this.characters[i].playerData?.basic?.NAME ?? 'Unknown',
            charB: this.characters[j].playerData?.basic?.NAME ?? 'Unknown',
            distance: dist,
          });
        }
      }
    }

    return { characterCount: this.characters.length, activeContacts };
  }
}
