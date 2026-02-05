/**
 * ボールキャッチシステム
 *
 * ボールキャッチ処理を統一するシステム。
 * シナリオベースの設計で、パス、スローイン、ルーズボール等の
 * 異なるキャッチ条件を明確に分離。
 *
 * 処理フロー:
 * 1. ボール保持チェック → 保持中なら終了
 * 2. 各キャラクターのシナリオ判定
 * 3. 前提条件チェック（クールダウン、スロワー除外等）
 * 4. 優先度順にキャッチ判定
 * 5. キャッチ成功 → executeCatch()
 *    速すぎる → executeFumble()
 *    引き寄せ可能 → executePullToHand()
 */

import { Vector3 } from "@babylonjs/core";
import { Ball } from "../entities/Ball";
import { Character } from "../entities/Character";
import { CharacterState } from "../types/CharacterState";
import {
  CatchScenario,
  type CatchCandidate,
  type BallCatchEvent,
  type BallCatchCallbacks,
} from "../types/BallCatchTypes";
import {
  CATCH_SCENARIO_CONFIGS,
  BALL_CATCH_PHYSICS,
  BALL_RADIUS,
} from "../config/BallCatchConfig";
import { normalizeAngle, getDistance2D, getDistance3D } from "../utils/CollisionUtils";

/**
 * ボールキャッチシステム
 */
export class BallCatchSystem {
  private ball: Ball;
  private allCharacters: Character[];
  private callbacks: BallCatchCallbacks = {};

  constructor(ball: Ball, characters: Character[]) {
    this.ball = ball;
    this.allCharacters = characters;
  }

  /**
   * コールバックを設定
   */
  public setCallbacks(callbacks: BallCatchCallbacks): void {
    this.callbacks = callbacks;
  }

  /**
   * メイン更新処理
   * @returns キャッチイベント（キャッチ成功時）、またはnull
   */
  public update(_deltaTime: number): BallCatchEvent | null {
    // すでにボールが保持されている場合はスキップ
    if (this.ball.isHeld()) {
      return null;
    }

    // キャッチ候補者を収集
    const candidates = this.collectCatchCandidates();

    // 候補者がいない場合は終了
    if (candidates.length === 0) {
      console.log(`[BallCatch] No candidates found`);
      return null;
    }

    console.log(`[BallCatch] ${candidates.length} candidates found`);

    // 優先度順にソート（高い順）
    candidates.sort((a, b) => b.config.priority - a.config.priority);

    // 優先度順にキャッチ判定
    for (const candidate of candidates) {
      const result = this.tryCatch(candidate);
      if (result) {
        return result;
      }
    }

    return null;
  }

  /**
   * キャッチ候補者を収集
   */
  private collectCatchCandidates(): CatchCandidate[] {
    const candidates: CatchCandidate[] = [];
    const ballPosition = this.ball.getPosition();
    const ballVelocity = this.ball.getVelocity();

    // デバッグ: ボール状態
    console.log(`[BallCatch] Ball pos=(${ballPosition.x.toFixed(2)}, ${ballPosition.y.toFixed(2)}, ${ballPosition.z.toFixed(2)}), isHeld=${this.ball.isHeld()}, physicsEnabled=${this.ball.isPhysicsEnabled()}`);

    for (const character of this.allCharacters) {
      const characterPos = character.getPosition();
      const distanceToBody = getDistance2D(ballPosition, characterPos);

      // 前提条件チェック
      if (!this.passesPreConditions(character)) {
        if (distanceToBody < 2.0) {
          console.log(`[BallCatch] ${character.playerPosition} failed preConditions, dist=${distanceToBody.toFixed(2)}`);
        }
        continue;
      }

      // シナリオ判定
      const scenario = this.determineCatchScenario(character, ballPosition);
      if (scenario === null) {
        if (distanceToBody < 2.0) {
          console.log(`[BallCatch] ${character.playerPosition} scenario=null, dist=${distanceToBody.toFixed(2)}`);
        }
        continue;
      }

      // シナリオ設定を取得
      const config = CATCH_SCENARIO_CONFIGS[scenario];

      // 距離計算
      const handPosition = character.getBallHoldingPosition();

      const distanceToHand = getDistance3D(ballPosition, handPosition);

      // 相対速度計算
      const characterVelocity = character.velocity || Vector3.Zero();
      const relativeVelocity = ballVelocity.subtract(characterVelocity);
      const relativeSpeed = relativeVelocity.length();

      console.log(`[BallCatch] ${character.playerPosition} scenario=${CatchScenario[scenario]}, bodyDist=${distanceToBody.toFixed(2)}, handDist=${distanceToHand.toFixed(2)}, speed=${relativeSpeed.toFixed(2)}`);

      candidates.push({
        character,
        config,
        distanceToBody,
        distanceToHand,
        relativeSpeed,
      });
    }

    return candidates;
  }

  /**
   * 前提条件チェック
   * キャッチ判定の前に確認する共通条件
   */
  private passesPreConditions(character: Character): boolean {
    // スローイン中のスロワーは衝突判定をスキップ
    if (character.getIsThrowInThrower()) {
      return false;
    }

    // クールダウン中はキャッチできない
    if (!this.ball.canBeCaughtBy(character)) {
      return false;
    }

    // シュートリカバリー中はキャッチできない
    const actionController = character.getActionController();
    if (actionController && actionController.isInShootRecovery()) {
      return false;
    }

    return true;
  }

  /**
   * シナリオ判定
   * キャラクターの状態からキャッチシナリオを決定
   */
  private determineCatchScenario(
    character: Character,
    ballPosition: Vector3
  ): CatchScenario | null {
    const passTarget = this.ball.getPassTarget();
    // playerPositionで比較（オブジェクト参照が異なる場合でも正しく判定）
    const isPassTarget = passTarget !== null &&
      passTarget.playerPosition === character.playerPosition;
    const lastToucher = this.ball.getLastToucher();
    const isThrowIn = lastToucher && lastToucher.getIsThrowInThrower();

    // バウンスパス保護: バウンド前はパスターゲットのみがキャッチ可能
    if (this.ball.getIsBouncePass() && !this.ball.getHasBounced() && !isPassTarget) {
      return null;
    }

    // スローイン保護: スローイン中はパスターゲットのみがキャッチ可能
    // （他のプレイヤーがボールを弾くのを防ぐ）
    // passTargetがnullの場合は保護をスキップ（ルーズボールとして処理）
    if (isThrowIn && passTarget && !isPassTarget) {
      return null;
    }

    // パスターゲットの場合
    if (isPassTarget) {
      // スローインの場合はTHROW_INシナリオを使用（より広い判定距離）
      if (isThrowIn) {
        return CatchScenario.THROW_IN;
      }
      return CatchScenario.PASS_TARGET;
    }

    // スローイン時の視野内キャッチ判定
    if (this.isThrowInReceiverWithBallInView(character, ballPosition)) {
      return CatchScenario.INTERCEPTOR;
    }

    // ジャンプボール状態のキャラクター
    const state = character.getState();
    if (
      state === CharacterState.JUMP_BALL_JUMPER ||
      state === CharacterState.JUMP_BALL_OTHER
    ) {
      return CatchScenario.JUMP_BALL;
    }

    // デフォルト: ルーズボール
    return CatchScenario.LOOSE_BALL;
  }

  /**
   * キャッチ試行
   * キャッチ条件を満たすかチェックし、満たす場合は実行
   */
  private tryCatch(candidate: CatchCandidate): BallCatchEvent | null {
    const { character, config, distanceToBody, distanceToHand, relativeSpeed } = candidate;
    const ballPosition = this.ball.getPosition();
    const characterPos = character.getPosition();
    const handPosition = character.getBallHoldingPosition();
    const characterHeight = character.config.physical.height;

    // 高さチェック（skipHeightCheckがfalseの場合のみ）
    if (!config.skipHeightCheck) {
      const ballHeight = ballPosition.y;
      const minCatchHeight = characterHeight * BALL_CATCH_PHYSICS.MIN_CATCH_HEIGHT_RATIO;
      const maxCatchHeight = characterHeight * BALL_CATCH_PHYSICS.MAX_CATCH_HEIGHT_RATIO;

      if (ballHeight < minCatchHeight || ballHeight > maxCatchHeight) {
        console.log(`[TryCatch] ${character.playerPosition} FAIL height: ball=${ballHeight.toFixed(2)}, min=${minCatchHeight.toFixed(2)}, max=${maxCatchHeight.toFixed(2)}`);
        return null;
      }
    }

    // キャラクターの体の半径（ボール方向）
    const bodyRadius = character.getFootCircleRadiusInDirection({
      x: ballPosition.x - characterPos.x,
      z: ballPosition.z - characterPos.z,
    });

    // パスターゲット/スローイン/インターセプターの場合: 速度チェックなし
    if (config.skipVelocityCheck) {
      const nearBodyThreshold = Math.max(bodyRadius + 1.0, config.bodyDistanceThreshold);
      const nearHandThreshold = config.handDistanceThreshold;

      const isNearBody = distanceToBody < nearBodyThreshold;
      const isNearHand = distanceToHand < nearHandThreshold;

      if (isNearBody || isNearHand) {
        console.log(`[TryCatch] ${character.playerPosition} CATCH (skipVelocity) nearBody=${isNearBody}, nearHand=${isNearHand}`);
        return this.executeCatch(character, config.scenario, ballPosition);
      }
      return null;
    }

    // 通常のキャッチ処理（ルーズボール、ジャンプボール、リバウンド）

    // リーチ範囲外ならスキップ
    if (distanceToHand > BALL_CATCH_PHYSICS.REACH_RANGE) {
      console.log(`[TryCatch] ${character.playerPosition} FAIL reach: handDist=${distanceToHand.toFixed(2)}, REACH_RANGE=${BALL_CATCH_PHYSICS.REACH_RANGE}`);
      return null;
    }

    // 体に近い判定の閾値を計算
    const nearBodyThreshold =
      bodyRadius + BALL_RADIUS + BALL_CATCH_PHYSICS.NEAR_BODY_OFFSET;
    const isNearBody = distanceToBody < nearBodyThreshold;

    // 足元のボール判定
    const ballHeight = ballPosition.y;
    const isAtFeetLevel = ballHeight < characterHeight * BALL_CATCH_PHYSICS.FEET_HEIGHT_RATIO;
    const isAtFeet = isAtFeetLevel && isNearBody;

    console.log(`[TryCatch] ${character.playerPosition} bodyRadius=${bodyRadius.toFixed(2)}, nearBodyThresh=${nearBodyThreshold.toFixed(2)}, isNearBody=${isNearBody}, isAtFeet=${isAtFeet}, ballH=${ballHeight.toFixed(2)}, feetH=${(characterHeight * BALL_CATCH_PHYSICS.FEET_HEIGHT_RATIO).toFixed(2)}`);

    // ボールが静止状態（キネマティックモード）の場合は直接キャプチャ判定
    if (!this.ball.isPhysicsEnabled()) {
      console.log(`[TryCatch] ${character.playerPosition} physics disabled, nearBody=${isNearBody}, handCapture=${distanceToHand < BALL_CATCH_PHYSICS.CAPTURE_DISTANCE}`);
      if (isNearBody || distanceToHand < BALL_CATCH_PHYSICS.CAPTURE_DISTANCE) {
        return this.executeCatch(character, config.scenario, ballPosition);
      }
      return null;
    }

    // 物理モード（動いているボール）の場合
    if (relativeSpeed < BALL_CATCH_PHYSICS.MAX_CONTROLLABLE_VELOCITY) {
      // 制御可能な速度
      const isSlowRolling = relativeSpeed < BALL_CATCH_PHYSICS.SLOW_ROLLING_THRESHOLD;

      console.log(`[TryCatch] ${character.playerPosition} physics mode: speed=${relativeSpeed.toFixed(2)}, isSlowRolling=${isSlowRolling}, captureDist=${BALL_CATCH_PHYSICS.CAPTURE_DISTANCE}`);

      if (distanceToHand < BALL_CATCH_PHYSICS.CAPTURE_DISTANCE) {
        // 手元まで来た - 完全にキャプチャ
        console.log(`[TryCatch] ${character.playerPosition} CATCH (hand capture)`);
        return this.executeCatch(character, config.scenario, ballPosition);
      } else if (isSlowRolling && isNearBody) {
        // 低速ボールが体の近くにある - キャプチャ
        console.log(`[TryCatch] ${character.playerPosition} CATCH (slow+nearBody)`);
        return this.executeCatch(character, config.scenario, ballPosition);
      } else if (isAtFeet) {
        // 足元のボール
        if (relativeSpeed < BALL_CATCH_PHYSICS.FEET_FAST_BALL_THRESHOLD) {
          console.log(`[TryCatch] ${character.playerPosition} CATCH (at feet)`);
          return this.executeCatch(character, config.scenario, ballPosition);
        } else {
          console.log(`[TryCatch] ${character.playerPosition} FUMBLE (feet too fast)`);
          this.executeFumble(character, handPosition, ballPosition);
          return null;
        }
      } else {
        // 手の方向に少しずつ引き寄せる
        console.log(`[TryCatch] ${character.playerPosition} PULL (not close enough)`);
        this.executePullToHand(character, handPosition, ballPosition);
        return null;
      }
    } else {
      // 速すぎて捕れない - ファンブル
      console.log(`[TryCatch] ${character.playerPosition} FUMBLE (too fast: ${relativeSpeed.toFixed(2)})`);
      this.executeFumble(character, handPosition, ballPosition);
      return null;
    }
  }

  /**
   * キャッチ実行
   */
  private executeCatch(
    character: Character,
    scenario: CatchScenario,
    position: Vector3
  ): BallCatchEvent {
    this.ball.setHolder(character);

    const event: BallCatchEvent = {
      catcher: character,
      scenario,
      position: position.clone(),
    };

    // コールバック呼び出し
    if (this.callbacks.onCatch) {
      this.callbacks.onCatch(event);
    }

    return event;
  }

  /**
   * ファンブル実行
   * 速すぎるボールを弾いてランダムな方向に飛ばす
   */
  private executeFumble(
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
    const randomAngle = (Math.random() - 0.5) * (Math.PI / 3);
    const cosAngle = Math.cos(randomAngle);
    const sinAngle = Math.sin(randomAngle);

    // Y軸周りの回転を適用
    const rotatedX = deflectDirection.x * cosAngle - deflectDirection.z * sinAngle;
    const rotatedZ = deflectDirection.x * sinAngle + deflectDirection.z * cosAngle;

    // 少し上向きにも弾く
    const fumbleDirection = new Vector3(
      rotatedX,
      Math.abs(deflectDirection.y) + 0.3,
      rotatedZ
    );
    fumbleDirection.normalize();

    // ファンブルインパルスを適用
    const fumbleImpulse = fumbleDirection.scale(BALL_CATCH_PHYSICS.FUMBLE_IMPULSE_STRENGTH);
    this.ball.applyImpulse(fumbleImpulse, ballPosition);

    // ファンブル後のクールダウンを設定
    this.ball.setDeflectionCooldown();

    // コールバック呼び出し
    if (this.callbacks.onFumble) {
      this.callbacks.onFumble(character);
    }
  }

  /**
   * ボールを手の方向に引き寄せる
   */
  private executePullToHand(
    _character: Character,
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
    const distanceFactor = Math.min(1.0, distance / BALL_CATCH_PHYSICS.REACH_RANGE);
    const impulseStrength = BALL_CATCH_PHYSICS.PULL_IMPULSE_STRENGTH * distanceFactor;

    // インパルスを適用
    const impulse = direction.scale(impulseStrength);
    this.ball.applyImpulse(impulse, ballPosition);
  }

  /**
   * スローイン時に視野内にボールがあるレシーバーかどうかを判定
   */
  private isThrowInReceiverWithBallInView(
    character: Character,
    ballPosition: Vector3
  ): boolean {
    // スローイン中かチェック（ボールのパスターゲットがいて、飛行中）
    if (!this.ball.isInFlight()) {
      return false;
    }

    const passTarget = this.ball.getPassTarget();
    if (!passTarget) {
      return false;
    }

    // 味方チームかチェック
    if (character.team !== passTarget.team) {
      return false;
    }

    // パスターゲット自身は通常のパスターゲット処理で扱う（playerPositionで比較）
    if (character.playerPosition === passTarget.playerPosition) {
      return false;
    }

    // スロワーを取得（lastToucher）
    const thrower = this.ball.getLastToucher();
    if (!thrower || !thrower.getIsThrowInThrower()) {
      return false;
    }

    // キャラクターがスロワーの方を向いているかチェック
    const characterPos = character.getPosition();
    const throwerPos = thrower.getPosition();
    const characterRotation = character.getRotation();

    // スロワーへの方向
    const toThrowerX = throwerPos.x - characterPos.x;
    const toThrowerZ = throwerPos.z - characterPos.z;
    const angleToThrower = Math.atan2(toThrowerX, toThrowerZ);

    // キャラクターの向きとスロワー方向の角度差
    const angleDiff = normalizeAngle(angleToThrower - characterRotation);

    // 視野角チェック
    if (Math.abs(angleDiff) > BALL_CATCH_PHYSICS.FIELD_OF_VIEW_ANGLE) {
      return false; // スロワーを見ていない
    }

    // ボールが視野内にあるかチェック
    const toBallX = ballPosition.x - characterPos.x;
    const toBallZ = ballPosition.z - characterPos.z;
    const angleToBall = Math.atan2(toBallX, toBallZ);

    const ballAngleDiff = normalizeAngle(angleToBall - characterRotation);

    if (Math.abs(ballAngleDiff) > BALL_CATCH_PHYSICS.FIELD_OF_VIEW_ANGLE) {
      return false; // ボールが視野外
    }

    // ボールまでの距離が適切かチェック
    const distanceToBall = getDistance2D(characterPos, ballPosition);

    return distanceToBall < BALL_CATCH_PHYSICS.VIEW_CATCH_MAX_DISTANCE;
  }

  /**
   * 破棄
   */
  public dispose(): void {
    this.callbacks = {};
  }
}
