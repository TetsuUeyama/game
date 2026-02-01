import { Vector3 } from "@babylonjs/core";
import { Character } from "../entities/Character";
import { Ball } from "../entities/Ball";
import { CharacterState } from "../types/CharacterState";
import {
  getDistance2D,
  getDistance3D,
  getCircleCollisionInfo,
  resolveCircleCollisionWithPower,
  isInRange,
} from "../utils/CollisionUtils";
import {
  BALL_COLLISION_CONFIG,
  CHARACTER_COLLISION_CONFIG,
  BODY_PART_CONFIG,
} from "../config/CollisionConfig";

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
   *
   * 注意: ボールと選手の体パーツ（胴体・手）との衝突はHavok物理エンジンが自動処理
   * ここではキャッチ判定とキャラクター同士の衝突のみを処理
   */
  public update(_deltaTime: number): void {
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
   *
   * 注意: ボールの物理的な反射はHavok物理エンジンが自動処理する
   * ここではキャッチ可能かどうかの判定のみを行う
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
    const maxReachHeight = characterHeight + BODY_PART_CONFIG.HAND_REACH_HEIGHT;

    // ボールの高さ（地面からの高さ）
    const ballHeight = ballPosition.y;

    // 高さが手の届く範囲外ならキャッチできない
    if (!isInRange(ballHeight, 0, maxReachHeight)) {
      return;
    }

    // ボールからキャラクターへの方向を計算
    const ballToCharacter = {
      x: characterPosition.x - ballPosition.x,
      z: characterPosition.z - ballPosition.z
    };

    // その方向でのキャラクターの半径を取得（8方向を考慮）
    const characterRadius = character.getFootCircleRadiusInDirection({
      x: -ballToCharacter.x,  // キャラクターからボールへの方向
      z: -ballToCharacter.z
    });

    // XZ平面上の衝突判定（方向ベースの半径を使用）
    const ballCharacterDistance = BALL_COLLISION_CONFIG.BALL_RADIUS + characterRadius;
    if (distanceXZ < ballCharacterDistance && distanceXZ > 0.001) {
      // シュート直後のシューター自身はキャッチできない（クールダウン中）
      // ボールの弾き処理はHavok物理エンジンが自動で行う
      if (!this.ball.canBeCaughtBy(character)) {
        return;
      }

      // シュートアクション後で重心が不安定な場合はキャッチできない
      // ボールの弾き処理はHavok物理エンジンが自動で行う
      const actionController = character.getActionController();
      if (actionController && actionController.isInShootRecovery()) {
        return;
      }

      // ボールを保持させる
      this.ball.setHolder(character);
    }
  }

  /**
   * キャラクター同士の衝突を解決
   * power値が高い方が低い方を押し出す
   * 8方向ごとの半径を考慮した衝突判定
   */
  private resolveCharacterCharacterCollision(character1: Character, character2: Character): void {
    const pos1 = character1.getPosition();
    const pos2 = character2.getPosition();

    // 各キャラクターから見た相手への方向を計算
    const dir1to2 = { x: pos2.x - pos1.x, z: pos2.z - pos1.z };
    const dir2to1 = { x: pos1.x - pos2.x, z: pos1.z - pos2.z };

    // 各キャラクターの相手方向での半径を取得（8方向を考慮）
    const radius1 = character1.getFootCircleRadiusInDirection(dir1to2);
    const radius2 = character2.getFootCircleRadiusInDirection(dir2to1);

    // 衝突情報を取得
    const collisionInfo = getCircleCollisionInfo(pos1, radius1, pos2, radius2);

    // 衝突していない場合はスキップ
    if (!collisionInfo.isColliding) {
      return;
    }

    // power値を取得（デフォルトは50）
    const power1 = character1.playerData?.stats.power ?? 50;
    const power2 = character2.playerData?.stats.power ?? 50;

    // パワー値に基づいて衝突を解決（方向ベースの半径を使用）
    const resolution = resolveCircleCollisionWithPower(
      pos1, radius1, power1,
      pos2, radius2, power2,
      CHARACTER_COLLISION_CONFIG.COLLISION_MARGIN
    );

    character1.setPosition(resolution.newPos1);
    character2.setPosition(resolution.newPos2);
  }

  /**
   * キャラクターの状態を更新
   */
  private updateCharacterStates(): void {
    const holder = this.ball.getHolder();

    // ボールが飛行中（シュート中）の場合は状態を更新しない
    // シュートが外れて誰かが保持するか、ゲーム再開になるまで現在の状態を維持
    if (this.ball.isInFlight()) {
      return;
    }

    // ボールが誰も保持していない場合（ルーズボール時）、全員BALL_LOST
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

    // 敵の状態を設定（同じポジションの敵がON_BALL_DEFENDER、それ以外がOFF_BALL_DEFENDER）
    if (opponents.length > 0) {
      const holderPosition = holder.playerPosition;

      // ボール保持者と同じポジションの敵を探す
      let onBallDefender: Character | null = null;

      if (holderPosition) {
        onBallDefender = opponents.find(opp => opp.playerPosition === holderPosition) || null;
      }

      // 同じポジションの敵がいない場合は、最も近い敵をON_BALL_DEFENDERにする（フォールバック）
      if (!onBallDefender) {
        const holderPos = holder.getPosition();
        const sortedOpponents = [...opponents].sort((a, b) => {
          const distA = getDistance3D(holderPos, a.getPosition());
          const distB = getDistance3D(holderPos, b.getPosition());
          return distA - distB;
        });
        onBallDefender = sortedOpponents[0];
      }

      // ON_BALL_DEFENDERを設定
      onBallDefender.setState(CharacterState.ON_BALL_DEFENDER);

      // 残りの敵をOFF_BALL_DEFENDER
      for (const opponent of opponents) {
        if (opponent !== onBallDefender) {
          opponent.setState(CharacterState.OFF_BALL_DEFENDER);
        }
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
