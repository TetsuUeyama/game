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
import { CharacterState } from "@/GamePlay/GameSystem/CharacterMove/Types/CharacterState";
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
  LOOSE_BALL_PICKUP,
  PALM_CATCH,
} from "@/GamePlay/GameSystem/CharacterMove/Config/BallCatchConfig";
import { getDistance2D, getDistance3D } from "@/GamePlay/Object/Physics/Spatial/SpatialUtils";

/**
 * ボールキャッチシステム
 */
export class BallCatchSystem {
  private ball: Ball;
  private allCharacters: Character[];
  private callbacks: BallCatchCallbacks = {};

  /** ルーズボール滞在時間追跡（キャラクター → サークル内滞在時間(秒)） */
  private looseBallDwellTimes: Map<Character, number> = new Map();

  /** ボールが完全にサークル内にあるかどうか（キャラクター → boolean） */
  private ballCompletelyInside: Map<Character, boolean> = new Map();

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
  public update(deltaTime: number): BallCatchEvent | null {
    // すでにボールが保持されている場合は滞在時間をリセットしてスキップ
    if (this.ball.isHeld()) {
      this.looseBallDwellTimes.clear();
      this.ballCompletelyInside.clear();
      return null;
    }

    // 手のひら接触チェック（最優先）
    const palmCheck = this.checkPalmCatch();
    if (palmCheck.handled) {
      return palmCheck.result;
    }

    // ルーズボール滞在時間を更新
    this.updateLooseBallDwellTimes(deltaTime);

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
   * 全キャラクターの両手をチェックし、ボールに触れていたら即キャッチ。
   * 複数キャラクターが同時に触れている場合はボールを弾く。
   */
  private checkPalmCatch(): { result: BallCatchEvent | null; handled: boolean } {
    const ballPosition = this.ball.getPosition();
    const contactDistance = PALM_CATCH.CONTACT_DISTANCE;

    const touchingCharacters: Character[] = [];

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

      if (distRight <= contactDistance || distLeft <= contactDistance) {
        touchingCharacters.push(character);
      }
    }

    if (touchingCharacters.length === 0) {
      return { result: null, handled: false };
    }

    if (touchingCharacters.length === 1) {
      // 1人だけ → 即キャッチ
      const catcher = touchingCharacters[0];
      const scenario = this.determineCatchScenario(catcher, ballPosition)
        ?? CatchScenario.LOOSE_BALL;
      return {
        result: this.executeCatch(catcher, scenario, ballPosition),
        handled: true,
      };
    }

    // 複数人 → 弾く
    const firstToucher = touchingCharacters[0];
    const handPosition = firstToucher.getBallHoldingPosition();
    this.executeFumble(firstToucher, handPosition, ballPosition);
    return { result: null, handled: true };
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
   * ルーズボール滞在時間を更新
   * 各キャラクターのサークル（円柱）内にボールがあるかチェックし、滞在時間を更新
   */
  private updateLooseBallDwellTimes(deltaTime: number): void {
    const ballPosition = this.ball.getPosition();

    for (const character of this.allCharacters) {
      const cylinderState = this.checkBallCylinderState(character, ballPosition);
      const currentTime = this.looseBallDwellTimes.get(character) || 0;

      if (cylinderState === 'outside') {
        // サークル外に出た場合、滞在時間をリセット
        this.looseBallDwellTimes.set(character, 0);
        this.ballCompletelyInside.set(character, false);
      } else {
        // サークル内（完全 or 一部）にいる場合、滞在時間を加算
        const newTime = currentTime + deltaTime;
        this.looseBallDwellTimes.set(character, newTime);
        // 完全に内側かどうかを記録
        this.ballCompletelyInside.set(character, cylinderState === 'inside');
      }
    }
  }

  /**
   * ボールとキャラクターの円柱の位置関係をチェック
   * @returns 'inside' = ボールが完全に内側, 'touching' = 一部触れている, 'outside' = 完全に外
   */
  private checkBallCylinderState(
    character: Character,
    ballPosition: Vector3
  ): 'inside' | 'touching' | 'outside' {
    const characterPos = character.getPosition();
    const characterHeight = character.config.physical.height;
    const ballRadius = BALL_RADIUS;

    // 円柱の高さ範囲（地面=0から身長+マージンまで）
    const minHeight = 0;
    const maxHeight = characterHeight + LOOSE_BALL_PICKUP.HEIGHT_MARGIN;

    // ボール方向での円柱半径を取得
    const dirToBall = {
      x: ballPosition.x - characterPos.x,
      z: ballPosition.z - characterPos.z,
    };
    const circleRadius = character.getFootCircleRadiusInDirection(dirToBall);

    // 水平距離（ボール中心からキャラクター中心）
    const horizontalDistance = getDistance2D(ballPosition, characterPos);

    // 高さ判定（ボールの上端と下端を考慮）
    const ballTop = ballPosition.y + ballRadius;
    const ballBottom = Math.max(0, ballPosition.y - ballRadius); // 地面より下にはならない

    // 完全に外側かチェック
    // 高さ: ボールの下端が円柱の上より上、またはボールの上端が地面より下
    if (ballBottom > maxHeight || ballTop < minHeight) {
      return 'outside';
    }

    // 水平方向で完全に外側（ボールの端が円柱に触れていない）
    if (horizontalDistance - ballRadius > circleRadius) {
      return 'outside';
    }

    // 完全に内側かチェック
    // 高さ: ボールの上端が円柱内、ボールの下端が地面以上
    // 水平: ボールの端（中心+半径）が円柱内
    const isHeightInside = ballTop <= maxHeight && ballBottom >= minHeight;
    const isHorizontalInside = horizontalDistance + ballRadius <= circleRadius;

    if (isHeightInside && isHorizontalInside) {
      return 'inside';
    }

    // 一部触れている
    return 'touching';
  }

  /**
   * キャラクターのルーズボール滞在時間を取得
   */
  public getLooseBallDwellTime(character: Character): number {
    return this.looseBallDwellTimes.get(character) || 0;
  }

  /**
   * ボールがキャラクターのサークルに完全に収まっているかを取得
   */
  public isBallCompletelyInside(character: Character): boolean {
    return this.ballCompletelyInside.get(character) || false;
  }

  /**
   * 指定したキャラクターの周囲に相手チームの選手がいるかチェック
   * @param character チェック対象のキャラクター
   * @param radius チェック半径（m）
   * @returns 相手チームの選手がいる場合true
   */
  private hasOpponentWithinRadius(character: Character, radius: number): boolean {
    const characterPos = character.getPosition();
    const opponentTeam = character.team === 'ally' ? 'enemy' : 'ally';

    for (const other of this.allCharacters) {
      if (other.team !== opponentTeam) continue;

      const otherPos = other.getPosition();
      const distance = getDistance2D(characterPos, otherPos);

      if (distance < radius) {
        return true;
      }
    }

    return false;
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

    // ルーズボールの場合: サークル内滞在時間チェック
    // 滞在時間が満たされたら即座に保持状態に移行
    if (config.scenario === CatchScenario.LOOSE_BALL) {
      // まずボールが円柱と重なっているかチェック
      const cylinderState = this.checkBallCylinderState(character, ballPosition);

      if (cylinderState === 'outside') {
        // サークル外の場合はスキップ
        return null;
      }

      // 周囲1m以内に相手チームの選手がいないかチェック
      const hasNearbyOpponent = this.hasOpponentWithinRadius(
        character,
        LOOSE_BALL_PICKUP.NO_OPPONENT_RADIUS
      );

      // 相手がいない + ボールがサークルと重なっている → 即保持
      if (!hasNearbyOpponent && (cylinderState === 'inside' || cylinderState === 'touching')) {
        return this.executeCatch(character, config.scenario, ballPosition);
      }

      // 相手がいる場合は従来の滞在時間チェック
      const dwellTime = this.looseBallDwellTimes.get(character) || 0;
      const isCompletelyInside = this.ballCompletelyInside.get(character) || false;

      // ボールが完全にサークル内にある場合は0.3秒、一部触れている場合は1秒
      const requiredTime = isCompletelyInside
        ? LOOSE_BALL_PICKUP.REQUIRED_DWELL_TIME_INSIDE
        : LOOSE_BALL_PICKUP.REQUIRED_DWELL_TIME_TOUCHING;

      if (dwellTime >= requiredTime) {
        // 滞在時間を満たしたら即座にキャッチ
        return this.executeCatch(character, config.scenario, ballPosition);
      }
      // 滞在時間が足りない場合は他の条件もチェックせずスキップ
      return null;
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
