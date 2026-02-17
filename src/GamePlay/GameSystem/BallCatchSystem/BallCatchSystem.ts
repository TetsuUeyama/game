/**
 * ボールキャッチシステム
 *
 * ボールキャッチ処理を統一するシステム。
 * シナリオベースの設計で、パス、ルーズボール等の
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
import { Ball } from "@/GamePlay/Object/Entities/Ball";
import { Character } from "@/GamePlay/Object/Entities/Character";
import { CharacterState } from "@/GamePlay/GameSystem/StatusCheckSystem/CharacterState";
import {
  CatchScenario,
  type CatchCandidate,
  type BallCatchEvent,
  type BallCatchCallbacks,
} from "@/GamePlay/GameSystem/BallCatchSystem/BallCatchTypes";
import {
  CATCH_SCENARIO_CONFIGS,
  BALL_CATCH_PHYSICS,
  BALL_RADIUS,
  PALM_CATCH,
} from "@/GamePlay/GameSystem/BallCatchSystem/BallCatchConfig";
import { getDistance2D, getDistance3D } from "@/GamePlay/Object/Physics/Spatial/SpatialUtils";

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

    // 手のひら接触チェック（最優先）
    const palmCheck = this.checkPalmCatch();
    if (palmCheck.handled) {
      return palmCheck.result;
    }

    // キャッチ候補者を収集
    const candidates = this.collectCatchCandidates();

    // 候補者がいない場合は終了
    if (candidates.length === 0) {
      return null;
    }

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
   * 手のひら接触チェック（最優先判定）
   * 両手タッチ → 無条件キャッチ、片手タッチ → 衝撃吸収判定。
   * 複数キャラクターが同時に触れている場合はボールを弾く。
   */
  private checkPalmCatch(): { result: BallCatchEvent | null; handled: boolean } {
    const ballPosition = this.ball.getPosition();
    const contactDistance = PALM_CATCH.CONTACT_DISTANCE;

    const catchCandidates: Character[] = [];
    let anyTouching = false;

    for (const character of this.allCharacters) {
      // ON_BALL_PLAYERは対象外
      if (character.getState() === CharacterState.ON_BALL_PLAYER) continue;

      // 前提条件チェック（クールダウン等）
      if (!this.passesPreConditions(character)) continue;

      // 両手をチェック
      const rightHandPos = character.getRightHandPosition();
      const leftHandPos = character.getLeftHandPosition();

      const distRight = getDistance3D(ballPosition, rightHandPos);
      const distLeft = getDistance3D(ballPosition, leftHandPos);

      const rightTouch = distRight <= contactDistance;
      const leftTouch = distLeft <= contactDistance;

      if (!rightTouch && !leftTouch) continue;

      anyTouching = true;

      if (rightTouch && leftTouch) {
        // 両手タッチ → 無条件でキャッチ候補
        catchCandidates.push(character);
      } else {
        // 片手タッチ → 衝撃吸収判定
        const ballVelocity = this.ball.getVelocity();
        const characterVelocity = character.velocity || Vector3.Zero();
        const relativeSpeed = ballVelocity.subtract(characterVelocity).length();
        const threshold = this.calculateAbsorptionThreshold(character);

        if (relativeSpeed <= threshold) {
          catchCandidates.push(character);
        } else {
          // 片手で吸収できない → ファンブル
          const handPosition = character.getBallHoldingPosition();
          this.executeFumble(character, handPosition, ballPosition);
          return { result: null, handled: true };
        }
      }
    }

    if (!anyTouching) {
      return { result: null, handled: false };
    }

    if (catchCandidates.length === 1) {
      // 1人だけ → 即キャッチ
      const catcher = catchCandidates[0];
      const scenario = this.determineCatchScenario(catcher, ballPosition)
        ?? CatchScenario.LOOSE_BALL;
      return {
        result: this.executeCatch(catcher, scenario, ballPosition),
        handled: true,
      };
    }

    if (catchCandidates.length > 1) {
      // 複数人 → 弾く
      const firstToucher = catchCandidates[0];
      const handPosition = firstToucher.getBallHoldingPosition();
      this.executeFumble(firstToucher, handPosition, ballPosition);
      return { result: null, handled: true };
    }

    // anyTouching=true だが catchCandidates=0 のケース
    // （片手タッチで全員ファンブルした場合は上のelse節でreturn済み）
    return { result: null, handled: true };
  }

  /**
   * 片手キャッチの衝撃吸収閾値を計算
   * threshold = clamp(BASE + power × 0.04 + technique × 0.03, BASE, MAX)
   */
  private calculateAbsorptionThreshold(character: Character): number {
    const stats = character.playerData?.stats;
    const power = stats?.power ?? 50;
    const technique = stats?.technique ?? 50;
    const raw = PALM_CATCH.BASE_ABSORPTION_SPEED
      + power * PALM_CATCH.POWER_COEFFICIENT
      + technique * PALM_CATCH.TECHNIQUE_COEFFICIENT;
    return Math.min(raw, PALM_CATCH.MAX_ABSORPTION_SPEED);
  }

  /**
   * キャッチ候補者を収集
   */
  private collectCatchCandidates(): CatchCandidate[] {
    const candidates: CatchCandidate[] = [];
    const ballPosition = this.ball.getPosition();
    const ballVelocity = this.ball.getVelocity();

    for (const character of this.allCharacters) {
      const characterPos = character.getPosition();
      const distanceToBody = getDistance2D(ballPosition, characterPos);

      // 前提条件チェック
      if (!this.passesPreConditions(character)) {
        continue;
      }

      // シナリオ判定
      const scenario = this.determineCatchScenario(character, ballPosition);
      if (scenario === null) {
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
    _ballPosition: Vector3
  ): CatchScenario | null {
    const passTarget = this.ball.getPassTarget();
    // playerPositionで比較（オブジェクト参照が異なる場合でも正しく判定）
    const isPassTarget = passTarget !== null &&
      passTarget.playerPosition === character.playerPosition;

    // バウンスパス保護: バウンド前はパスターゲットのみがキャッチ可能
    if (this.ball.getIsBouncePass() && !this.ball.getHasBounced() && !isPassTarget) {
      return null;
    }

    // パスターゲットの場合
    if (isPassTarget) {
      return CatchScenario.PASS_TARGET;
    }

    // ジャンプボール状態のキャラクター
    const state = character.getState();
    if (
      state === CharacterState.JUMP_BALL_JUMPER ||
      state === CharacterState.JUMP_BALL_OTHER
    ) {
      return CatchScenario.JUMP_BALL;
    }

    // リバウンドジャンプ中のキャラクター
    const actionController = character.getActionController();
    if (actionController && actionController.getCurrentAction() === 'rebound_jump') {
      return CatchScenario.REBOUND;
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
        return this.executeCatch(character, config.scenario, ballPosition);
      }
      return null;
    }

    // 通常のキャッチ処理（ルーズボール、ジャンプボール、リバウンド）

    // リーチ範囲外ならスキップ
    if (distanceToHand > BALL_CATCH_PHYSICS.REACH_RANGE) {
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

    // ボールが静止状態（キネマティックモード）の場合は直接キャプチャ判定
    if (!this.ball.isPhysicsEnabled()) {
      if (isNearBody || distanceToHand < BALL_CATCH_PHYSICS.CAPTURE_DISTANCE) {
        return this.executeCatch(character, config.scenario, ballPosition);
      }
      return null;
    }

    // 物理モード（動いているボール）の場合
    if (relativeSpeed < BALL_CATCH_PHYSICS.MAX_CONTROLLABLE_VELOCITY) {
      // 制御可能な速度
      const isSlowRolling = relativeSpeed < BALL_CATCH_PHYSICS.SLOW_ROLLING_THRESHOLD;

      if (distanceToHand < BALL_CATCH_PHYSICS.CAPTURE_DISTANCE) {
        // 手元まで来た - 完全にキャプチャ
        return this.executeCatch(character, config.scenario, ballPosition);
      } else if (isSlowRolling && isNearBody) {
        // 低速ボールが体の近くにある - キャプチャ
        return this.executeCatch(character, config.scenario, ballPosition);
      } else if (isAtFeet) {
        // 足元のボール
        if (relativeSpeed < BALL_CATCH_PHYSICS.FEET_FAST_BALL_THRESHOLD) {
          return this.executeCatch(character, config.scenario, ballPosition);
        } else {
          this.executeFumble(character, handPosition, ballPosition);
          return null;
        }
      } else {
        // 手の方向に少しずつ引き寄せる
        this.executePullToHand(character, handPosition, ballPosition);
        return null;
      }
    } else {
      // 速すぎて捕れない - ファンブル
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
   * 破棄
   */
  public dispose(): void {
    this.callbacks = {};
  }
}
