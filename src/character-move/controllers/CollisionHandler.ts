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
  BALL_PICKUP_CONFIG,
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
   * キャラクターの状態のみを更新（AI更新前に呼び出す）
   * ボール保持者の変化に応じて全キャラクターの状態を適切に設定
   */
  public updateStates(): void {
    this.updateCharacterStates();
  }

  /**
   * ボールとキャラクターの衝突を解決（物理ベースのキャッチ判定）
   *
   * 物理ベースのピックアップシステム:
   * 1. リーチ範囲内でボールを検出
   * 2. 相対速度をチェック（制御可能か判定）
   * 3. 制御可能なら手の方向に引き寄せるインパルスを適用
   * 4. 手元まで来たら完全にキャプチャ
   * 5. 速すぎる場合はファンブル（弾く）
   *
   * パスターゲットの場合:
   * - 拡大されたリーチ範囲で即座にキャッチ
   * - 速度チェックなし（ファンブルしない）
   *
   * IMPROVEMENT_PLAN.md: バグ1修正 - スロワー状態の選手を衝突判定から除外
   */
  private resolveBallCharacterCollision(character: Character): void {
    // すでにボールが保持されている場合は衝突判定をスキップ
    if (this.ball.isHeld()) {
      return;
    }

    // スローイン中のスロワーと他のプレイヤーは衝突判定をスキップ
    // - THROW_IN_THROWER: スロワーが自分の投げたボールにぶつかる問題を防止
    // - THROW_IN_OTHER: レシーバー以外がボールを先に取ってしまう問題を防止
    const characterState = character.getState();
    if (characterState === CharacterState.THROW_IN_THROWER ||
        characterState === CharacterState.THROW_IN_OTHER) {
      return;
    }

    // シュート直後のシューター自身はキャッチできない（クールダウン中）
    // パス送信者も同様にクールダウン中はキャッチできない
    if (!this.ball.canBeCaughtBy(character)) {
      return;
    }

    // シュートアクション後で重心が不安定な場合はキャッチできない
    const actionController = character.getActionController();
    if (actionController && actionController.isInShootRecovery()) {
      return;
    }

    const ballPosition = this.ball.getPosition();
    const handPosition = character.getBallHoldingPosition();
    const characterPos = character.getPosition();
    const characterHeight = character.config.physical.height;

    // パスターゲットかどうかを確認
    const passTarget = this.ball.getPassTarget();
    const isPassTarget = passTarget === character;

    // デバッグ: スローインレシーバーの判定状況を確認
    const isThrowInReceiver = character.getState() === CharacterState.THROW_IN_RECEIVER;
    if (isThrowInReceiver && this.ball.isInFlight()) {
      const ballPos = this.ball.getPosition();
      const charPos = character.getPosition();
      const dist = Math.sqrt(Math.pow(ballPos.x - charPos.x, 2) + Math.pow(ballPos.z - charPos.z, 2));
      console.log(`[CollisionHandler] スローインレシーバー: passTarget=${passTarget?.playerPosition || 'null'}, isPassTarget=${isPassTarget}, dist=${dist.toFixed(2)}, ballY=${ballPos.y.toFixed(2)}`);
    }

    // パスターゲットの場合は緩やかな高さチェック
    const minCatchHeight = isPassTarget
      ? characterHeight * (BALL_PICKUP_CONFIG.MIN_CATCH_HEIGHT_RATIO - 0.1)  // 下限を緩和
      : characterHeight * BALL_PICKUP_CONFIG.MIN_CATCH_HEIGHT_RATIO;
    const maxCatchHeight = isPassTarget
      ? characterHeight * (BALL_PICKUP_CONFIG.MAX_CATCH_HEIGHT_RATIO + 0.1)  // 上限を緩和
      : characterHeight * BALL_PICKUP_CONFIG.MAX_CATCH_HEIGHT_RATIO;
    const ballHeight = ballPosition.y;

    // 高さが手の届く範囲外ならキャッチできない
    if (!isInRange(ballHeight, minCatchHeight, maxCatchHeight)) {
      // パスターゲットの場合は高さチェック失敗をログ出力
      if (isPassTarget) {
        console.log(`[CollisionHandler] パスターゲット高さチェック失敗: ballHeight=${ballHeight.toFixed(2)}, min=${minCatchHeight.toFixed(2)}, max=${maxCatchHeight.toFixed(2)}`);
      }
      return;
    }

    // ボールと手の距離を計算（3D）
    const distanceToHand = getDistance3D(handPosition, ballPosition);

    // ボールとキャラクター中心の距離（XZ平面）
    const distanceToBodyXZ = getDistance2D(ballPosition, characterPos);

    // キャラクターの体の半径（ボール方向）
    const bodyRadius = character.getFootCircleRadiusInDirection({
      x: ballPosition.x - characterPos.x,
      z: ballPosition.z - characterPos.z
    });

    // パスターゲットの場合: 体に当たった時点でキャッチ（速度チェックなし）
    if (isPassTarget) {
      // 体に十分近いか、手に十分近い場合のみキャッチ
      const nearBodyThreshold = bodyRadius + BALL_COLLISION_CONFIG.BALL_RADIUS + 0.1;
      const nearHandThreshold = BALL_PICKUP_CONFIG.CAPTURE_DISTANCE * 1.5;
      const isNearBody = distanceToBodyXZ < nearBodyThreshold;
      const isNearHand = distanceToHand < nearHandThreshold;

      console.log(`[CollisionHandler] パスターゲットキャッチ判定:
        distanceToBodyXZ=${distanceToBodyXZ.toFixed(2)}, bodyRadius=${bodyRadius.toFixed(2)}, nearBodyThreshold=${nearBodyThreshold.toFixed(2)}, isNearBody=${isNearBody}
        distanceToHand=${distanceToHand.toFixed(2)}, nearHandThreshold=${nearHandThreshold.toFixed(2)}, isNearHand=${isNearHand}
        ballPos=(${ballPosition.x.toFixed(2)}, ${ballPosition.y.toFixed(2)}, ${ballPosition.z.toFixed(2)})
        charPos=(${characterPos.x.toFixed(2)}, ${characterPos.y.toFixed(2)}, ${characterPos.z.toFixed(2)})`);

      if (isNearBody || isNearHand) {
        console.log(`[CollisionHandler] パスターゲットがボールをキャッチ！`);
        this.captureBall(character);
      }
      return;
    }

    // リーチ範囲外ならスキップ（通常のキャッチ処理）
    if (distanceToHand > BALL_PICKUP_CONFIG.REACH_RANGE) {
      return;
    }

    // 相対速度を計算（ボール速度 - キャラクター速度）
    const ballVelocity = this.ball.getVelocity();
    const characterVelocity = character.velocity || Vector3.Zero();
    const relativeVelocity = ballVelocity.subtract(characterVelocity);
    const relativeSpeed = relativeVelocity.length();

    // リーチ範囲内の処理
    if (distanceToHand < BALL_PICKUP_CONFIG.REACH_RANGE) {
      // 体に近い判定の閾値を計算
      const nearBodyThreshold = bodyRadius + BALL_COLLISION_CONFIG.BALL_RADIUS + BALL_PICKUP_CONFIG.NEAR_BODY_OFFSET;
      const isNearBody = distanceToBodyXZ < nearBodyThreshold;

      // 足元のボール判定（地面に近いボールで、体の近くにある場合）
      // ボールの高さがキャラクターの膝以下（身長の25%以下）なら足元と判定
      const isAtFeetLevel = ballHeight < characterHeight * 0.25;
      const isAtFeet = isAtFeetLevel && isNearBody;

      // ボールが静止状態（キネマティックモード）の場合は直接キャプチャ判定
      if (!this.ball.isPhysicsEnabled()) {
        // 静止ボールは近づくだけでキャプチャ可能（XZ平面での距離も考慮）
        // キャラクターの体が十分近い、または手が十分近い場合はキャプチャ
        // IMPROVEMENT_PLAN.md: ルーズボール時のキャプチャ条件を緩和
        if (isNearBody || distanceToHand < BALL_PICKUP_CONFIG.CAPTURE_DISTANCE) {
          this.captureBall(character);
        }
        return;
      }

      // 物理モード（動いているボール）の場合
      if (relativeSpeed < BALL_PICKUP_CONFIG.MAX_CONTROLLABLE_VELOCITY) {
        // 制御可能な速度 - 手の方向に引き寄せる

        // IMPROVEMENT_PLAN.md: 低速ボールの閾値を設定から取得
        const slowRollingThreshold = BALL_PICKUP_CONFIG.SLOW_ROLLING_THRESHOLD;
        const isSlowRolling = relativeSpeed < slowRollingThreshold;

        if (distanceToHand < BALL_PICKUP_CONFIG.CAPTURE_DISTANCE) {
          // 手元まで来た - 完全にキャプチャ
          this.captureBall(character);
        } else if (isSlowRolling && isNearBody) {
          // 低速ボールが体の近くにある - キャプチャ
          this.captureBall(character);
        } else if (isAtFeet) {
          // 足元のボール - 速度に関係なくキャプチャ可能（拾い上げ動作）
          // ただし非常に速い場合（10m/s以上）は弾く
          if (relativeSpeed < 10.0) {
            this.captureBall(character);
          } else {
            this.applyFumble(character, handPosition, ballPosition);
          }
        } else {
          // 手の方向に少しずつ引き寄せる（物理的な挙動を残す）
          this.pullBallTowardHand(character, handPosition, ballPosition);
        }
      } else {
        // 速すぎて捕れない - ファンブル（弾く）
        this.applyFumble(character, handPosition, ballPosition);
      }
    }
  }

  /**
   * ボールを完全にキャプチャ（保持状態にする）
   */
  private captureBall(character: Character): void {
    this.ball.setHolder(character);
  }

  /**
   * ボールを手の方向に引き寄せるインパルスを適用
   */
  private pullBallTowardHand(
    character: Character,
    handPosition: Vector3,
    ballPosition: Vector3
  ): void {
    // ボールが物理モードでない場合はスキップ
    if (!this.ball.isPhysicsEnabled()) {
      return;
    }

    // 手の方向への単位ベクトルを計算
    const direction = handPosition.subtract(ballPosition);
    const distance = direction.length();

    if (distance < 0.01) return;

    direction.normalize();

    // 距離に応じたインパルス強度（近いほど弱く）
    const distanceFactor = Math.min(1.0, distance / BALL_PICKUP_CONFIG.REACH_RANGE);
    const impulseStrength = BALL_PICKUP_CONFIG.PULL_IMPULSE_STRENGTH * distanceFactor;

    // インパルスを適用
    const impulse = direction.scale(impulseStrength);
    this.ball.applyImpulse(impulse, ballPosition);
  }

  /**
   * ファンブル（弾き）処理を適用
   * 速すぎるボールを弾いてランダムな方向に飛ばす
   */
  private applyFumble(
    character: Character,
    handPosition: Vector3,
    ballPosition: Vector3
  ): void {
    // ボールが物理モードでない場合はスキップ
    if (!this.ball.isPhysicsEnabled()) {
      return;
    }

    // 手からボールへの方向（弾く方向の基準）
    const deflectDirection = ballPosition.subtract(handPosition);
    if (deflectDirection.length() < 0.01) return;

    deflectDirection.normalize();

    // ランダムな横方向の偏りを追加（-30〜+30度）
    const randomAngle = (Math.random() - 0.5) * Math.PI / 3;
    const cosAngle = Math.cos(randomAngle);
    const sinAngle = Math.sin(randomAngle);

    // Y軸周りの回転を適用
    const rotatedX = deflectDirection.x * cosAngle - deflectDirection.z * sinAngle;
    const rotatedZ = deflectDirection.x * sinAngle + deflectDirection.z * cosAngle;

    // 少し上向きにも弾く
    const fumbleDirection = new Vector3(
      rotatedX,
      Math.abs(deflectDirection.y) + 0.3,  // 上向き成分を追加
      rotatedZ
    );
    fumbleDirection.normalize();

    // ファンブルインパルスを適用
    const fumbleImpulse = fumbleDirection.scale(BALL_PICKUP_CONFIG.FUMBLE_IMPULSE_STRENGTH);
    this.ball.applyImpulse(fumbleImpulse, ballPosition);

    // ファンブル後のクールダウンを設定
    this.ball.setDeflectionCooldown();
  }

  /**
   * キャラクター同士の衝突を解決
   * power値が高い方が低い方を押し出す
   * 8方向ごとの半径を考慮した衝突判定
   *
   * IMPROVEMENT_PLAN.md: バグ1追加修正 - スローイン状態のキャラクターは衝突判定をスキップ
   */
  private resolveCharacterCharacterCollision(character1: Character, character2: Character): void {
    // スローイン状態のキャラクターは衝突判定をスキップ
    // （外側マスにいるため、衝突解決でフィールド内にクランプされるのを防ぐ）
    const state1 = character1.getState();
    const state2 = character2.getState();
    const isThrowInState1 = state1 === CharacterState.THROW_IN_THROWER ||
                            state1 === CharacterState.THROW_IN_RECEIVER ||
                            state1 === CharacterState.THROW_IN_OTHER;
    const isThrowInState2 = state2 === CharacterState.THROW_IN_THROWER ||
                            state2 === CharacterState.THROW_IN_RECEIVER ||
                            state2 === CharacterState.THROW_IN_OTHER;

    if (isThrowInState1 || isThrowInState2) {
      return;
    }

    // ジャンプボール状態のキャラクターも衝突判定をスキップ
    const isJumpBallState1 = state1 === CharacterState.JUMP_BALL_JUMPER ||
                              state1 === CharacterState.JUMP_BALL_OTHER;
    const isJumpBallState2 = state2 === CharacterState.JUMP_BALL_JUMPER ||
                              state2 === CharacterState.JUMP_BALL_OTHER;

    if (isJumpBallState1 || isJumpBallState2) {
      return;
    }

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
   * スローイン状態を全てクリア
   * IMPROVEMENT_PLAN.md: バグ2修正 - レシーバーがキャッチした後に状態をクリア
   */
  private clearThrowInStates(): void {
    for (const character of this.allCharacters) {
      const state = character.getState();
      if (state === CharacterState.THROW_IN_THROWER ||
          state === CharacterState.THROW_IN_RECEIVER ||
          state === CharacterState.THROW_IN_OTHER) {
        // BALL_LOST状態に戻す（後でupdateCharacterStates()が適切な状態に更新）
        character.setState(CharacterState.BALL_LOST);
      }
    }
  }

  /**
   * ジャンプボール状態を全てクリア
   */
  private clearJumpBallStates(): void {
    for (const character of this.allCharacters) {
      const state = character.getState();
      if (state === CharacterState.JUMP_BALL_JUMPER ||
          state === CharacterState.JUMP_BALL_OTHER) {
        // BALL_LOST状態に戻す（後でupdateCharacterStates()が適切な状態に更新）
        character.setState(CharacterState.BALL_LOST);
      }
    }
  }

  /**
   * キャラクターの状態を更新
   * IMPROVEMENT_PLAN.md: バグ2修正 - スローインレシーバーがキャッチした場合に状態をクリア
   */
  private updateCharacterStates(): void {
    const holder = this.ball.getHolder();

    // スローイン状態のキャラクターがいるかチェック
    const hasThrowInState = this.allCharacters.some(char => {
      const state = char.getState();
      return state === CharacterState.THROW_IN_THROWER ||
             state === CharacterState.THROW_IN_RECEIVER ||
             state === CharacterState.THROW_IN_OTHER;
    });

    if (hasThrowInState) {
      // レシーバーがボールをキャッチした場合、全員のスローイン状態をクリア
      // IMPROVEMENT_PLAN.md: バグ2修正
      if (holder && holder.getState() === CharacterState.THROW_IN_RECEIVER) {
        this.clearThrowInStates();
        // 状態クリア後、通常の状態更新を続行
      } else if (!holder || holder.getState() === CharacterState.THROW_IN_THROWER) {
        // スロワーがボールを持っている間、またはボールが飛行中は状態を更新しない
        return;
      }
      // ホルダーがスロワー以外（レシーバーがキャッチした）なら状態更新を続行
    }

    // ジャンプボール状態のキャラクターがいるかチェック
    const hasJumpBallState = this.allCharacters.some(char => {
      const state = char.getState();
      return state === CharacterState.JUMP_BALL_JUMPER ||
             state === CharacterState.JUMP_BALL_OTHER;
    });

    if (hasJumpBallState) {
      // ジャンプボール中は状態を更新しない（GameSceneが管理）
      // ただし、ボールがキャッチされた場合は状態をクリア
      if (holder) {
        this.clearJumpBallStates();
        // 状態クリア後、通常の状態更新を続行
      } else {
        return;
      }
    }

    // ボールが誰も保持していない場合
    if (!holder) {
      // ボールが飛行中（パス中・シュート中）の場合
      if (this.ball.isInFlight()) {
        // パスターゲットがいる場合（パス中）は、パスターゲットに向かう準備をする
        // - パサー（lastToucher）はOFF_BALL_PLAYERに
        // - パスターゲットは一時的にまだOFF_BALL_PLAYERのまま（キャッチ後にON_BALL_PLAYERに）
        // - シュート中の場合はlastToucherもnullまたはシューターなので状態維持
        const passTarget = this.ball.getPassTarget();
        if (passTarget) {
          // パス中: パサーの状態を更新
          const lastToucher = this.ball.getLastToucher();
          if (lastToucher && lastToucher.getState() === CharacterState.ON_BALL_PLAYER) {
            lastToucher.setState(CharacterState.OFF_BALL_PLAYER);
          }
        }
        // シュート中の場合は状態を維持（シュートが外れるまで）
        return;
      }

      // ルーズボール時（飛行中でない、保持者もいない）
      // 全員BALL_LOSTに設定
      for (const character of this.allCharacters) {
        character.setState(CharacterState.BALL_LOST);
      }
      return;
    }

    // ボール保持者をON_BALL_PLAYERに設定
    console.log(`[CollisionHandler] ボール保持者を設定: ${holder.playerPosition}, team=${holder.team}, state→ON_BALL_PLAYER`);
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
