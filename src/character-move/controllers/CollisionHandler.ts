import { Vector3 } from "@babylonjs/core";
import { Character } from "../entities/Character";
import { Ball } from "../entities/Ball";
import { CharacterState } from "../types/CharacterState";
import { CHARACTER_CONFIG } from "../config/gameConfig";
import {
  getDistance2D,
  getDistance3D,
  getCircleCollisionInfo,
  getSphereCollisionInfo,
  resolveCircleCollisionWithPower,
  isInRange,
} from "../utils/CollisionUtils";

/**
 * 衝突判定の設定
 */
const BALL_RADIUS = 0.15; // ボールの半径（m）
const CHARACTER_RADIUS = CHARACTER_CONFIG.radius; // キャラクターの半径（m）- gameConfigから取得
const BALL_CHARACTER_DISTANCE = BALL_RADIUS + CHARACTER_RADIUS; // ボールとキャラクターの衝突判定距離

// 体パーツの判定設定
const HEAD_RADIUS = 0.15; // 頭の半径（m）
const HAND_REACH_HEIGHT = 0.3; // 手を伸ばせる高さ（身長からの追加高さ）

/**
 * 衝突判定コントローラー
 * ボールとキャラクター、キャラクター同士の接触を検出し、重ならないように押し戻す
 */
export class CollisionHandler {
  private ball: Ball;
  private allCharacters: Character[];

  constructor(ball: Ball, characters: Character[]) {
    this.ball = ball;
    this.allCharacters = characters;
  }

  /**
   * 衝突判定を更新
   */
  public update(_deltaTime: number): void {
    // ボールが飛行中の場合、ディフェンダーの体パーツとの接触判定
    if (this.ball.isInFlight()) {
      this.checkDefenderBodyBlock();
    }

    // ボールとキャラクターの衝突判定（キャッチ）
    for (const character of this.allCharacters) {
      this.resolveBallCharacterCollision(character);
    }

    // キャラクター同士の衝突判定（全ペアをチェック）
    for (let i = 0; i < this.allCharacters.length; i++) {
      for (let j = i + 1; j < this.allCharacters.length; j++) {
        this.resolveCharacterCharacterCollision(this.allCharacters[i], this.allCharacters[j]);
      }
    }

    // キャラクターの状態を更新
    this.updateCharacterStates();
  }

  /**
   * ボールとキャラクターの衝突を解決（キャッチ判定）
   */
  private resolveBallCharacterCollision(character: Character): void {
    // すでにボールが保持されている場合は衝突判定をスキップ
    if (this.ball.isHeld()) {
      return;
    }

    const ballPosition = this.ball.getPosition();
    const characterPosition = character.getPosition();

    // 2D平面上の距離を計算（XZ平面）
    const distanceXZ = getDistance2D(ballPosition, characterPosition);

    // 高さの判定：ボールがキャラクターの手の届く範囲にあるかチェック
    const characterHeight = character.config.physical.height;
    const maxReachHeight = characterHeight + HAND_REACH_HEIGHT;

    // ボールの高さ（地面からの高さ）
    const ballHeight = ballPosition.y;

    // 高さが手の届く範囲外ならキャッチできない
    if (!isInRange(ballHeight, 0, maxReachHeight)) {
      return;
    }

    // XZ平面上の衝突判定
    if (distanceXZ < BALL_CHARACTER_DISTANCE && distanceXZ > 0.001) {
      // シュート直後のシューター自身はキャッチできない
      if (!this.ball.canBeCaughtBy(character)) {
        return;
      }

      // ボールを保持させる
      this.ball.setHolder(character);
      console.log(`[CollisionHandler] Ball picked up by character (height: ${ballHeight.toFixed(2)}m)`);
    }
  }

  /**
   * ディフェンダーの体パーツによるボールブロック判定
   */
  private checkDefenderBodyBlock(): void {
    const ballPosition = this.ball.getPosition();
    const ballRadius = this.ball.getRadius();

    for (const character of this.allCharacters) {
      const state = character.getState();

      // ディフェンダーのみブロック判定
      if (state !== CharacterState.ON_BALL_DEFENDER && state !== CharacterState.OFF_BALL_DEFENDER) {
        continue;
      }

      const characterPosition = character.getPosition();
      const characterHeight = character.config.physical.height;

      // 頭の位置を計算（キャラクターの中心Y + 身長の半分 - 頭の半径）
      const headY = characterPosition.y + characterHeight / 2 - HEAD_RADIUS;
      const headPosition = new Vector3(characterPosition.x, headY, characterPosition.z);

      // ボールと頭の3D衝突判定
      const headCollision = getSphereCollisionInfo(ballPosition, ballRadius, headPosition, HEAD_RADIUS);

      if (headCollision.isColliding) {
        console.log(`[CollisionHandler] ボールがディフェンダーの頭に接触！ブロック発生`);

        // 飛行を終了してボールを落とす
        this.ball.endFlight();

        // ボールを接触点付近に配置（少し上に）
        this.ball.setPosition(new Vector3(
          ballPosition.x,
          headY + HEAD_RADIUS + ballRadius + 0.1,
          ballPosition.z
        ));

        return;
      }

      // 胴体との接触判定（円柱で近似）
      const bodyTop = characterPosition.y + characterHeight / 2 - HEAD_RADIUS * 2;
      const bodyBottom = characterPosition.y - characterHeight / 2 + 0.1;
      const bodyRadius = 0.25;

      // ボールが胴体の高さ範囲内にあるかチェック
      if (isInRange(ballPosition.y, bodyBottom, bodyTop)) {
        // XZ平面上の衝突判定
        const bodyCollision = getCircleCollisionInfo(ballPosition, ballRadius, characterPosition, bodyRadius);

        if (bodyCollision.isColliding) {
          console.log(`[CollisionHandler] ボールがディフェンダーの胴体に接触！ブロック発生`);

          // 飛行を終了してボールを落とす
          this.ball.endFlight();

          return;
        }
      }
    }
  }

  /**
   * キャラクター同士の衝突を解決
   * power値が高い方が低い方を押し出す
   */
  private resolveCharacterCharacterCollision(character1: Character, character2: Character): void {
    const pos1 = character1.getPosition();
    const pos2 = character2.getPosition();

    // 衝突情報を取得
    const collisionInfo = getCircleCollisionInfo(pos1, CHARACTER_RADIUS, pos2, CHARACTER_RADIUS);

    // 衝突していない場合はスキップ
    if (!collisionInfo.isColliding) {
      return;
    }

    // power値を取得（デフォルトは50）
    const power1 = character1.playerData?.stats.power ?? 50;
    const power2 = character2.playerData?.stats.power ?? 50;

    // パワー値に基づいて衝突を解決
    const resolution = resolveCircleCollisionWithPower(
      pos1, CHARACTER_RADIUS, power1,
      pos2, CHARACTER_RADIUS, power2,
      0.05 // 少し余裕を追加
    );

    character1.setPosition(resolution.newPos1);
    character2.setPosition(resolution.newPos2);

    // デバッグログ（重なり発生時のみ出力）
    if (collisionInfo.overlap > 0.1) {
      const powerDiff = power1 - power2;
      console.log(`[CollisionHandler] 押し合い: ${character1.playerData?.basic?.NAME || 'char1'}(power=${power1}) vs ${character2.playerData?.basic?.NAME || 'char2'}(power=${power2}), 差=${powerDiff}`);
    }
  }

  /**
   * キャラクターの状態を更新
   */
  private updateCharacterStates(): void {
    const holder = this.ball.getHolder();

    // ボールが誰も保持していない場合（飛行中含む）、全員BALL_LOST
    // これにより、ルーズボール時は全員がボールを追いかける
    if (!holder) {
      for (const character of this.allCharacters) {
        character.setState(CharacterState.BALL_LOST);
      }
      return;
    }

    // ボール保持者をON_BALL_PLAYERに設定
    holder.setState(CharacterState.ON_BALL_PLAYER);

    // ボール保持者のチームを判定
    const holderTeam = holder.team;

    // 味方と敵を分類
    const teammates: Character[] = [];
    const opponents: Character[] = [];

    this.allCharacters.forEach((char) => {
      if (char === holder) {
        return; // 保持者自身はスキップ
      }

      // 無力化されたキャラクターはスキップ（状態を変更しない）
      if (char.isDefeated()) {
        return;
      }

      if (char.team === holderTeam) {
        teammates.push(char);
      } else {
        opponents.push(char);
      }
    });

    // 味方は全員OFF_BALL_PLAYER
    teammates.forEach((teammate) => {
      teammate.setState(CharacterState.OFF_BALL_PLAYER);
    });

    // 敵の状態を設定（一番近い敵がON_BALL_DEFENDER、遠い敵がOFF_BALL_DEFENDER）
    if (opponents.length > 0) {
      const holderPosition = holder.getPosition();

      // 敵を距離順にソート
      const sortedOpponents = opponents.sort((a, b) => {
        const distA = getDistance3D(holderPosition, a.getPosition());
        const distB = getDistance3D(holderPosition, b.getPosition());
        return distA - distB;
      });

      // 一番近い敵をON_BALL_DEFENDER
      sortedOpponents[0].setState(CharacterState.ON_BALL_DEFENDER);

      // 残りの敵をOFF_BALL_DEFENDER
      for (let i = 1; i < sortedOpponents.length; i++) {
        sortedOpponents[i].setState(CharacterState.OFF_BALL_DEFENDER);
      }
    }
  }

  /**
   * 破棄
   */
  public dispose(): void {
    // 必要に応じてクリーンアップ処理を追加
  }
}
