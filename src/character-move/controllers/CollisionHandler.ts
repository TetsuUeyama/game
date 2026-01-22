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
 * ブロック判定結果
 */
export interface BlockResult {
  blocked: boolean;
  blocker: Character | null;
  deflected: boolean;  // 軽く触れて軌道がずれた場合
}

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

  // ブロック成功フラグ（同じフレーム内でのキャッチ判定をスキップ）
  private blockSucceededThisFrame: boolean = false;

  /**
   * 衝突判定を更新
   */
  public update(_deltaTime: number): void {
    // フレーム開始時にフラグをリセット
    this.blockSucceededThisFrame = false;

    // ボールが飛行中の場合、ディフェンダーの体パーツとの接触判定
    if (this.ball.isInFlight()) {
      this.checkDefenderBodyBlock();
    }

    // ブロック成功した場合、このフレームではキャッチ判定をスキップ
    if (this.blockSucceededThisFrame) {
      console.log(`[CollisionHandler] ブロック成功のためキャッチ判定をスキップ`);
    } else {
      // ボールとキャラクターの衝突判定（キャッチ）
      for (const character of this.allCharacters) {
        this.resolveBallCharacterCollision(character);
      }
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
      // デバッグ: キャッチ判定に入ったことをログ出力
      console.log(`★★★ キャッチ判定: ${character.playerData?.basic?.NAME}, 距離=${distanceXZ.toFixed(2)}m, ボール飛行中=${this.ball.isInFlight()}`);

      // シュート直後のシューター自身はキャッチできない（クールダウン中）
      if (!this.ball.canBeCaughtBy(character)) {
        // ボールを弾く（リングに当たった時のように）
        this.deflectBallFromCharacter(character, ballPosition);
        console.log(`[CollisionHandler] クールダウン中のためボールを弾く: ${character.playerData?.basic?.NAME}`);
        return;
      }

      // シュートアクションの硬直中またはクールダウン中はボールを弾く
      const actionController = character.getActionController();
      if (actionController && actionController.isInShootRecoveryOrCooldown()) {
        // ボールを弾く（リングに当たった時のように）
        this.deflectBallFromCharacter(character, ballPosition);
        console.log(`[CollisionHandler] シュート硬直中のためボールを弾く: ${character.playerData?.basic?.NAME}`);
        return;
      }

      // ボールを保持させる
      console.log(`★★★ キャッチ成功: ${character.playerData?.basic?.NAME}, ボール飛行中=${this.ball.isInFlight()}`);
      this.ball.setHolder(character);
    }
  }

  /**
   * キャラクターからボールを弾く（リングに当たった時のように）
   * シュート硬直中のシューターに当たった場合に使用
   * 入射角度とキャラクターとの当たり位置を考慮した反射
   */
  private deflectBallFromCharacter(character: Character, ballPosition: Vector3): void {
    const characterPosition = character.getPosition();
    const characterHeight = character.config.physical.height;

    // ボールの入射速度ベクトル
    const incomingVelocity = this.ball.getVelocity();
    const incomingSpeed = incomingVelocity.length();

    // 法線ベクトル（キャラクターからボールへの方向）
    let normal = ballPosition.subtract(characterPosition);
    if (normal.length() < 0.01) {
      // 同じ位置の場合はランダムな方向
      const randomAngle = Math.random() * Math.PI * 2;
      normal = new Vector3(Math.sin(randomAngle), 0, Math.cos(randomAngle));
    }
    normal.normalize();

    // キャラクターのどの高さに当たったかを計算
    const characterCenterY = characterPosition.y;
    const hitOffsetY = ballPosition.y - characterCenterY; // キャラクター中心からの高さオフセット
    const normalizedHitHeight = hitOffsetY / (characterHeight * 0.5); // -1 ~ 1 の範囲に正規化

    // 物理的な反射を計算: R = I - 2(I・N)N
    let reflectDirection: Vector3;
    if (incomingSpeed > 0.1) {
      const incomingDir = incomingVelocity.clone().normalize();
      const dotProduct = Vector3.Dot(incomingDir, normal);
      reflectDirection = incomingDir.subtract(normal.scale(2 * dotProduct));
    } else {
      // 速度がほぼ0の場合は単純に外側に弾く
      reflectDirection = normal.clone();
    }

    // 当たり位置による補正（高い位置に当たったら上に、低い位置に当たったら下に）
    reflectDirection.y += normalizedHitHeight * 0.4;

    // リングに当たった時のように上方向にしっかり弾く
    // 最低限の上方向成分を確保（0.6でより高く跳ねる）
    if (reflectDirection.y < 0.6) {
      reflectDirection.y = 0.6;
    }

    reflectDirection.normalize();

    // 弾く速度を強化（リングに当たった時のように遠くに弾く）
    // 最低5.0 m/s、入射速度が速い場合はその70%を保持
    const deflectSpeed = Math.max(5.0, incomingSpeed * 0.7);
    const newVelocity = reflectDirection.scale(deflectSpeed);
    this.ball.setVelocity(newVelocity);

    // ボールをキャラクターからしっかり離す（0.5m）
    const newBallPosition = ballPosition.add(reflectDirection.scale(0.5));
    this.ball.setPosition(newBallPosition);

    // ボールを飛行状態にする（停止していた場合も再び動くようにする）
    this.ball.startFlight();

    console.log(`[CollisionHandler] キャラクター反射: 入射速度=${incomingSpeed.toFixed(1)}, 弾き速度=${deflectSpeed.toFixed(1)}, 当たり高さ=${normalizedHitHeight.toFixed(2)}`);

    // 弾き後のクールダウンを設定（一定時間誰も保持できない）
    this.ball.setDeflectionCooldown();
  }

  /**
   * ディフェンダーの体パーツによるボールブロック判定
   */
  private checkDefenderBodyBlock(): void {
    const ballPosition = this.ball.getPosition();
    const ballRadius = this.ball.getRadius();

    for (const character of this.allCharacters) {
      const state = character.getState();

      // ActionControllerを取得（後でも使うので先に取得）
      const actionController = character.getActionController();

      // block_shotアクションがアクティブかどうかをチェック
      const isBlockingActive = actionController?.isActionActive('block_shot') ?? false;

      // ディフェンダー状態、またはblock_shotアクション実行中のみブロック判定
      // （ボール飛行中は全員BALL_LOSTになるため、アクション状態も確認する）
      if (!isBlockingActive && state !== CharacterState.ON_BALL_DEFENDER && state !== CharacterState.OFF_BALL_DEFENDER) {
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
        console.log(`[CollisionHandler] ボールがディフェンダーの頭に当たった！`);

        // ブロック成功フラグを設定（同じフレーム内でのキャッチ判定をスキップ）
        this.blockSucceededThisFrame = true;

        // 飛行を終了してボールを落とす
        this.ball.endFlight();

        // ボールを接触点付近に配置（少し上に）
        this.ball.setPosition(new Vector3(
          ballPosition.x,
          headY + HEAD_RADIUS + ballRadius + 0.1,
          ballPosition.z
        ));

        // 弾き後のクールダウンを設定（一定時間誰も保持できない）
        this.ball.setDeflectionCooldown();

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
          console.log(`[CollisionHandler] ボールがディフェンダーの胴体に当たった！`);

          // ブロック成功フラグを設定（同じフレーム内でのキャッチ判定をスキップ）
          this.blockSucceededThisFrame = true;

          // 飛行を終了してボールを落とす
          this.ball.endFlight();

          // 弾き後のクールダウンを設定（一定時間誰も保持できない）
          this.ball.setDeflectionCooldown();

          return;
        }
      }

      // 手の判定（ActionControllerでblock_shotがアクティブな場合）
      if (actionController) {
        const hitbox = actionController.getActiveHitbox();
        if (hitbox && actionController.isActionActive('block_shot')) {
          const handCollision = getSphereCollisionInfo(
            ballPosition,
            ballRadius,
            hitbox.worldPosition,
            hitbox.config.radius
          );

          if (handCollision.isColliding) {
            // 接触の強さを計算（重なり量から）
            const impactStrength = handCollision.overlap / (ballRadius + hitbox.config.radius);

            // ボールの入射速度ベクトル
            const incomingVelocity = this.ball.getVelocity();
            const incomingSpeed = incomingVelocity.length();

            // 法線ベクトル（手の位置からボールへの方向）
            const normal = handCollision.direction.clone();
            normal.normalize();

            // 手の当たり位置のオフセット（ボールが手のどこに当たったか）
            // handCollision.direction は手の中心からボールへの方向
            const hitOffsetY = ballPosition.y - hitbox.worldPosition.y; // 上に当たったら正、下に当たったら負

            if (impactStrength > 0.3) {
              // しっかり触れた場合：物理的な反射を計算
              console.log(`★★★ シュートブロック成功！ボールがルーズボールに！`);

              // ブロック成功フラグを設定（同じフレーム内でのキャッチ判定をスキップ）
              this.blockSucceededThisFrame = true;

              // 反射ベクトルを計算: R = I - 2(I・N)N
              const incomingDir = incomingVelocity.clone().normalize();
              const dotProduct = Vector3.Dot(incomingDir, normal);
              const reflectDirection = incomingDir.subtract(normal.scale(2 * dotProduct));

              // 手の当たり位置による補正
              // 手の上側に当たった場合 → 上方向に弾く補正
              // 手の下側に当たった場合 → 下方向に弾く補正
              const hitOffsetFactor = hitOffsetY / hitbox.config.radius; // -1 ~ 1 の範囲
              reflectDirection.y += hitOffsetFactor * 0.5; // 当たり位置に応じて上下方向を調整

              // 最低限上方向に弾く（地面に叩きつけないように）
              if (reflectDirection.y < 0.2) {
                reflectDirection.y = 0.2;
              }

              reflectDirection.normalize();

              // 弾く速度（入射速度の一部を保持 + 固定値）
              const deflectSpeed = Math.max(4.0, incomingSpeed * 0.5);
              const deflectVelocity = reflectDirection.scale(deflectSpeed);
              this.ball.setVelocity(deflectVelocity);

              console.log(`[CollisionHandler] 反射: 入射速度=${incomingSpeed.toFixed(1)}, 弾き速度=${deflectSpeed.toFixed(1)}, 当たり位置Y=${hitOffsetY.toFixed(2)}`);

              // 弾き後のクールダウンを設定（一定時間誰も保持できない）
              this.ball.setDeflectionCooldown();

            } else {
              // 軽く触れた場合：入射角度を考慮して軌道をずらす
              console.log(`★★★ ボールがディフェンダーの手に触れて軌道が変わった！`);

              // ブロック成功フラグを設定（軽く触れた場合も同様）
              this.blockSucceededThisFrame = true;

              // 入射方向に対して横にずらす + 当たり位置で上下調整
              const deflection = normal.scale(-incomingSpeed * 0.3);
              deflection.y += hitOffsetY * 0.3 + 0.5; // 当たり位置 + 基本的に上方向

              const newVelocity = incomingVelocity.add(deflection);
              this.ball.setVelocity(newVelocity);

              // 弾き後のクールダウンを設定（一定時間誰も保持できない）
              this.ball.setDeflectionCooldown();
            }

            return;
          }
        }
      }
    }
  }

  /**
   * ディフェンダーの手によるシュートブロック判定
   * ActionControllerと連携してアクティブな block_shot アクションを検出
   * @returns ブロック結果
   */
  public checkHandBlock(): BlockResult {
    const result: BlockResult = {
      blocked: false,
      blocker: null,
      deflected: false,
    };

    if (!this.ball.isInFlight()) {
      return result;
    }

    const ballPosition = this.ball.getPosition();
    const ballRadius = this.ball.getRadius();

    for (const character of this.allCharacters) {
      const state = character.getState();

      // ディフェンダーのみブロック判定
      if (state !== CharacterState.ON_BALL_DEFENDER && state !== CharacterState.OFF_BALL_DEFENDER) {
        continue;
      }

      const actionController = character.getActionController();
      if (!actionController) {
        continue;
      }

      // block_shotアクションがアクティブかチェック
      if (!actionController.isActionActive('block_shot')) {
        continue;
      }

      const hitbox = actionController.getActiveHitbox();
      if (!hitbox) {
        continue;
      }

      // 手とボールの衝突判定
      const handCollision = getSphereCollisionInfo(
        ballPosition,
        ballRadius,
        hitbox.worldPosition,
        hitbox.config.radius
      );

      if (handCollision.isColliding) {
        result.blocker = character;

        // 接触の強さで結果を分ける
        const impactStrength = handCollision.overlap / (ballRadius + hitbox.config.radius);

        if (impactStrength > 0.5) {
          result.blocked = true;
        } else {
          result.deflected = true;
        }

        return result;
      }
    }

    return result;
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
