import { Vector3 } from "@babylonjs/core";
import { Character } from "../entities/Character";
import { Ball } from "../entities/Ball";
import { CharacterState } from "../types/CharacterState";

/**
 * 衝突判定の設定
 */
const BALL_RADIUS = 0.15; // ボールの半径（m）
const CHARACTER_RADIUS = 0.3; // キャラクターの半径（m）
const BALL_CHARACTER_DISTANCE = BALL_RADIUS + CHARACTER_RADIUS; // ボールとキャラクターの衝突判定距離
const CHARACTER_CHARACTER_DISTANCE = CHARACTER_RADIUS * 2; // キャラクター同士の衝突判定距離

/**
 * 衝突判定コントローラー
 * ボールとキャラクター、キャラクター同士の接触を検出し、重ならないように押し戻す
 */
export class CollisionHandler {
  private ball: Ball;
  private player: Character;
  private ally?: Character;
  private enemy1?: Character;
  private enemy2?: Character;

  constructor(
    ball: Ball,
    player: Character,
    ally?: Character,
    enemy1?: Character,
    enemy2?: Character
  ) {
    this.ball = ball;
    this.player = player;
    this.ally = ally;
    this.enemy1 = enemy1;
    this.enemy2 = enemy2;
  }

  /**
   * 衝突判定を更新
   */
  public update(_deltaTime: number): void {
    // ボールとキャラクターの衝突判定
    this.resolveBallCharacterCollision(this.player);
    if (this.ally) {
      this.resolveBallCharacterCollision(this.ally);
    }
    if (this.enemy1) {
      this.resolveBallCharacterCollision(this.enemy1);
    }
    if (this.enemy2) {
      this.resolveBallCharacterCollision(this.enemy2);
    }

    // キャラクター同士の衝突判定
    this.resolveCharacterCharacterCollision(this.player, this.ally);
    this.resolveCharacterCharacterCollision(this.player, this.enemy1);
    this.resolveCharacterCharacterCollision(this.player, this.enemy2);
    this.resolveCharacterCharacterCollision(this.ally, this.enemy1);
    this.resolveCharacterCharacterCollision(this.ally, this.enemy2);
    this.resolveCharacterCharacterCollision(this.enemy1, this.enemy2);

    // キャラクターの状態を更新
    this.updateCharacterStates();
  }

  /**
   * ボールとキャラクターの衝突を解決
   */
  private resolveBallCharacterCollision(character: Character): void {
    // すでにボールが保持されている場合は衝突判定をスキップ
    if (this.ball.isHeld()) {
      return;
    }

    const ballPosition = this.ball.getPosition();
    const characterPosition = character.getPosition();

    // 2D平面上の距離を計算（XZ平面）
    const dx = ballPosition.x - characterPosition.x;
    const dz = ballPosition.z - characterPosition.z;
    const distance = Math.sqrt(dx * dx + dz * dz);

    // 衝突判定
    if (distance < BALL_CHARACTER_DISTANCE && distance > 0.001) {
      // ボールを保持させる
      this.ball.setHolder(character);
      console.log(`[CollisionHandler] Ball picked up by character`);
    }
  }

  /**
   * キャラクター同士の衝突を解決
   */
  private resolveCharacterCharacterCollision(
    character1: Character | undefined,
    character2: Character | undefined
  ): void {
    // どちらかが存在しない場合はスキップ
    if (!character1 || !character2) {
      return;
    }

    const pos1 = character1.getPosition();
    const pos2 = character2.getPosition();

    // 2D平面上の距離を計算（XZ平面）
    const dx = pos2.x - pos1.x;
    const dz = pos2.z - pos1.z;
    const distance = Math.sqrt(dx * dx + dz * dz);

    // 衝突判定
    if (distance < CHARACTER_CHARACTER_DISTANCE && distance > 0.001) {
      // 重なっている距離
      const overlap = CHARACTER_CHARACTER_DISTANCE - distance;

      // 押し戻す方向（正規化）
      const directionX = dx / distance;
      const directionZ = dz / distance;

      // 両方のキャラクターを半分ずつ押し戻す
      const halfOverlap = overlap / 2;

      const newPos1 = new Vector3(
        pos1.x - directionX * halfOverlap,
        pos1.y,
        pos1.z - directionZ * halfOverlap
      );

      const newPos2 = new Vector3(
        pos2.x + directionX * halfOverlap,
        pos2.y,
        pos2.z + directionZ * halfOverlap
      );

      character1.setPosition(newPos1);
      character2.setPosition(newPos2);
    }
  }

  /**
   * キャラクターの状態を更新
   */
  private updateCharacterStates(): void {
    const holder = this.ball.getHolder();

    // ボールが誰も保持していない場合、全員BALL_LOST
    if (!holder) {
      this.player.setState(CharacterState.BALL_LOST);
      if (this.ally) {
        this.ally.setState(CharacterState.BALL_LOST);
      }
      if (this.enemy1) {
        this.enemy1.setState(CharacterState.BALL_LOST);
      }
      if (this.enemy2) {
        this.enemy2.setState(CharacterState.BALL_LOST);
      }
      return;
    }

    // ボール保持者をON_BALL_PLAYERに設定
    holder.setState(CharacterState.ON_BALL_PLAYER);

    // ボール保持者のチームを判定
    const holderTeam = holder.team;

    // 全キャラクターをリスト化
    const allCharacters: Character[] = [this.player];
    if (this.ally) allCharacters.push(this.ally);
    if (this.enemy1) allCharacters.push(this.enemy1);
    if (this.enemy2) allCharacters.push(this.enemy2);

    // 味方と敵を分類
    const teammates: Character[] = [];
    const opponents: Character[] = [];

    allCharacters.forEach((char) => {
      if (char === holder) {
        return; // 保持者自身はスキップ
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
        const distA = Vector3.Distance(holderPosition, a.getPosition());
        const distB = Vector3.Distance(holderPosition, b.getPosition());
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
