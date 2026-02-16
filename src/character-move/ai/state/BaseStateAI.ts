import { Vector3 } from "@babylonjs/core";
import { Character } from "../../entities/Character";
import { Ball } from "../../entities/Ball";
import { Field } from "../../entities/Field";
import { CharacterState } from "../../types/CharacterState";
import { IDLE_MOTION } from "../../motion/IdleMotion";
import { WALK_FORWARD_MOTION } from "../../motion/WalkMotion";
import { DASH_FORWARD_MOTION } from "../../motion/DashMotion";
import { FIELD_CONFIG } from "../../config/gameConfig";
import { getDistance2DSimple } from "@/physics/spatial/SpatialUtils";
import { PlayerStateManager } from "../../state";

/**
 * 状態別AIの基底クラス
 * 共通のプロパティとユーティリティメソッドを提供
 */
export abstract class BaseStateAI {
  protected character: Character;
  protected ball: Ball;
  protected allCharacters: Character[];
  protected field: Field;
  protected playerState: PlayerStateManager | null;

  constructor(
    character: Character,
    ball: Ball,
    allCharacters: Character[],
    field: Field,
    playerState?: PlayerStateManager
  ) {
    this.character = character;
    this.ball = ball;
    this.allCharacters = allCharacters;
    this.field = field;
    this.playerState = playerState ?? null;
  }

  /**
   * AIの更新処理（各サブクラスで実装）
   */
  public abstract update(deltaTime: number): void;

  /**
   * 状態に入った時の処理（サブクラスでオーバーライド可能）
   */
  public onEnterState(): void {
    // デフォルトでは何もしない
  }

  /**
   * 状態から出る時の処理（サブクラスでオーバーライド可能）
   */
  public onExitState(): void {
    // デフォルトでは何もしない
  }

  /**
   * 目標位置に向かって移動
   */
  protected moveTowards(targetPosition: Vector3, deltaTime: number, stopDistance: number = 0.3): void {
    const myPosition = this.character.getPosition();

    // 目標位置への方向ベクトルを計算（XZ平面上）
    const direction = new Vector3(
      targetPosition.x - myPosition.x,
      0,
      targetPosition.z - myPosition.z
    );

    // 距離が十分近い場合は移動しない
    const distance = direction.length();
    if (distance < stopDistance) {
      // 停止時は待機モーションを再生し、重心に停止力を適用
      if (this.character.getCurrentMotionName() !== 'idle') {
        this.character.playMotion(IDLE_MOTION);
      }
      this.character.stopMovement();
      return;
    }

    // 方向ベクトルを正規化
    direction.normalize();

    // 衝突を考慮して移動方向を調整
    const adjustedDirection = this.adjustDirectionForCollision(direction, deltaTime);

    // 移動できない場合は停止
    if (!adjustedDirection) {
      // 停止時は待機モーションを再生し、重心に停止力を適用
      if (this.character.getCurrentMotionName() !== 'idle') {
        this.character.playMotion(IDLE_MOTION);
      }
      this.character.stopMovement();
      return;
    }

    // 移動方向を向く（グラデーション回転）
    const angle = Math.atan2(adjustedDirection.x, adjustedDirection.z);
    this.character.rotateTowards(angle, deltaTime);

    // 距離に応じた移動速度とモーション
    const isDashing = distance > 5.0;
    const isRunning = distance > 2.0;

    // 移動（重心力も適用）
    this.character.move(adjustedDirection, deltaTime, isRunning, isDashing);

    // 距離に応じたモーション再生
    if (isDashing) {
      // 遠い場合は走る
      if (this.character.getCurrentMotionName() !== 'dash_forward') {
        this.character.playMotion(DASH_FORWARD_MOTION);
      }
    } else {
      // 近い場合は歩く
      if (this.character.getCurrentMotionName() !== 'walk_forward') {
        this.character.playMotion(WALK_FORWARD_MOTION);
      }
    }
  }

  /**
   * 目標位置に向かって移動（境界チェック付き）
   * オフェンス時に使用 - フィールド外に出ないように移動
   * @param targetPosition 目標位置
   * @param deltaTime デルタタイム
   * @param stopDistance 停止距離（デフォルト0.3m）
   * @param keepRotation trueの場合、向きを変更しない（OnBallOffenseAI用）
   */
  protected moveTowardsWithBoundary(targetPosition: Vector3, deltaTime: number, stopDistance: number = 0.3, keepRotation: boolean = false): void {
    const myPosition = this.character.getPosition();

    // 目標位置への方向ベクトルを計算（XZ平面上）
    const direction = new Vector3(
      targetPosition.x - myPosition.x,
      0,
      targetPosition.z - myPosition.z
    );

    // 距離が十分近い場合は移動しない
    const distance = direction.length();
    if (distance < stopDistance) {
      if (this.character.getCurrentMotionName() !== 'idle') {
        this.character.playMotion(IDLE_MOTION);
      }
      this.character.stopMovement();
      return;
    }

    // 方向ベクトルを正規化
    direction.normalize();

    // 境界チェック（オフェンスはフィールド外に出ない）
    const boundaryAdjusted = this.adjustDirectionForBoundary(direction, deltaTime);
    if (!boundaryAdjusted) {
      // 境界に達したら停止
      if (this.character.getCurrentMotionName() !== 'idle') {
        this.character.playMotion(IDLE_MOTION);
      }
      this.character.stopMovement();
      return;
    }

    // 衝突を考慮して移動方向を調整
    const adjustedDirection = this.adjustDirectionForCollision(boundaryAdjusted, deltaTime);

    if (!adjustedDirection) {
      if (this.character.getCurrentMotionName() !== 'idle') {
        this.character.playMotion(IDLE_MOTION);
      }
      this.character.stopMovement();
      return;
    }

    // 移動方向を向く（keepRotationがfalseの場合のみ、グラデーション回転）
    if (!keepRotation) {
      const angle = Math.atan2(adjustedDirection.x, adjustedDirection.z);
      this.character.rotateTowards(angle, deltaTime);
    }

    // 距離に応じた移動速度とモーション
    const isDashing = distance > 5.0;
    const isRunning = distance > 2.0;

    // 移動（重心力も適用）
    this.character.move(adjustedDirection, deltaTime, isRunning, isDashing);

    // 距離に応じたモーション再生
    if (isDashing) {
      if (this.character.getCurrentMotionName() !== 'dash_forward') {
        this.character.playMotion(DASH_FORWARD_MOTION);
      }
    } else {
      if (this.character.getCurrentMotionName() !== 'walk_forward') {
        this.character.playMotion(WALK_FORWARD_MOTION);
      }
    }
  }

  /**
   * 指定したキャラクターの方向を向く
   */
  protected faceTowards(target: Character, deltaTime: number): void {
    const myPosition = this.character.getPosition();
    const targetPosition = target.getPosition();

    // ターゲットへの方向ベクトルを計算（XZ平面上）
    const direction = new Vector3(
      targetPosition.x - myPosition.x,
      0,
      targetPosition.z - myPosition.z
    );

    // 方向ベクトルが0でない場合のみ回転（グラデーション回転）
    if (direction.length() > 0.01) {
      // Y軸周りの回転角度を計算
      const angle = Math.atan2(direction.x, direction.z);

      // quicknessベースのスムーズ回転
      this.character.rotateTowards(angle, deltaTime);
    }
  }

  /**
   * 衝突チェック - 他のキャラクターと衝突するかチェック
   * footCircleRadiusを使用（選手間衝突統一）
   * @param newPosition 移動先の位置
   * @returns 衝突する場合true
   */
  protected checkCollision(newPosition: Vector3): boolean {
    const myRadius = this.character.getFootCircleRadius();

    for (const other of this.allCharacters) {
      // 自分自身はスキップ
      if (other === this.character) continue;

      const otherPosition = other.getPosition();
      const otherRadius = other.getFootCircleRadius();

      // XZ平面上での距離を計算
      const distance = getDistance2DSimple(newPosition, otherPosition);

      // 衝突半径の合計より近い場合は衝突
      const minDistance = myRadius + otherRadius;
      if (distance < minDistance) {
        return true;
      }
    }

    return false;
  }

  /**
   * 衝突を考慮した移動方向の調整
   * @param direction 元の移動方向
   * @param deltaTime デルタタイム
   * @returns 調整後の移動方向（移動不可の場合はnull）
   */
  protected adjustDirectionForCollision(direction: Vector3, deltaTime: number): Vector3 | null {
    const currentPosition = this.character.getPosition();
    const speed = this.character.config.movement.walkSpeed;
    const moveDistance = speed * deltaTime;

    // 元の方向での移動先をチェック
    const newPosition = new Vector3(
      currentPosition.x + direction.x * moveDistance,
      currentPosition.y,
      currentPosition.z + direction.z * moveDistance
    );

    if (!this.checkCollision(newPosition)) {
      // 衝突しない場合はそのまま移動
      return direction;
    }

    // 衝突する場合、左右に回避を試みる
    const avoidanceAngles = [30, -30, 60, -60, 90, -90]; // 度数
    for (const angleDeg of avoidanceAngles) {
      const angleRad = (angleDeg * Math.PI) / 180;
      const cos = Math.cos(angleRad);
      const sin = Math.sin(angleRad);

      // 回転後の方向ベクトル
      const rotatedDirection = new Vector3(
        direction.x * cos - direction.z * sin,
        0,
        direction.x * sin + direction.z * cos
      );

      const avoidPosition = new Vector3(
        currentPosition.x + rotatedDirection.x * moveDistance,
        currentPosition.y,
        currentPosition.z + rotatedDirection.z * moveDistance
      );

      if (!this.checkCollision(avoidPosition)) {
        // 衝突しない方向が見つかった
        return rotatedDirection;
      }
    }

    // どの方向にも移動できない場合はnull
    return null;
  }

  /**
   * オフェンス時の境界チェック - フィールド外に出ないように移動方向を調整
   * A列〜O列、1行目〜30行目の範囲内に留まる
   * @param direction 移動方向
   * @param _deltaTime デルタタイム
   * @returns 調整後の移動方向（移動不可の場合はnull）
   */
  protected adjustDirectionForBoundary(direction: Vector3, _deltaTime: number): Vector3 | null {
    const currentPosition = this.character.getPosition();

    // フィールド境界
    const halfWidth = FIELD_CONFIG.width / 2;   // 7.5m
    const halfLength = FIELD_CONFIG.length / 2; // 15m
    const margin = 0.5; // 境界からのマージン（少し内側で止まる）

    const minX = -halfWidth + margin;
    const maxX = halfWidth - margin;
    const minZ = -halfLength + margin;
    const maxZ = halfLength - margin;

    let adjustedX = direction.x;
    let adjustedZ = direction.z;

    // 現在位置が左端に近く、さらに左に行こうとしている場合
    if (currentPosition.x <= minX && direction.x < 0) {
      adjustedX = 0;
    }
    // 現在位置が右端に近く、さらに右に行こうとしている場合
    if (currentPosition.x >= maxX && direction.x > 0) {
      adjustedX = 0;
    }
    // 現在位置が手前端に近く、さらに手前に行こうとしている場合
    if (currentPosition.z <= minZ && direction.z < 0) {
      adjustedZ = 0;
    }
    // 現在位置が奥端に近く、さらに奥に行こうとしている場合
    if (currentPosition.z >= maxZ && direction.z > 0) {
      adjustedZ = 0;
    }

    // 両方止まったら移動不可
    if (adjustedX === 0 && adjustedZ === 0) {
      return null;
    }

    // 調整後の方向を正規化
    const adjustedDirection = new Vector3(adjustedX, 0, adjustedZ);
    if (adjustedDirection.length() > 0.01) {
      adjustedDirection.normalize();
      return adjustedDirection;
    }

    return null;
  }

  /**
   * オンボールプレイヤーを見つける
   * Ball.getHolder() を使用してボール保持者を取得
   */
  protected findOnBallPlayer(): Character | null {
    return this.ball.getHolder();
  }

  /**
   * オンボールディフェンダーを見つける
   */
  protected findOnBallDefender(): Character | null {
    for (const char of this.allCharacters) {
      if (char.getState() === CharacterState.ON_BALL_DEFENDER) {
        return char;
      }
    }
    return null;
  }

  /**
   * オフボールディフェンダーを見つける
   */
  protected findOffBallDefender(): Character | null {
    for (const char of this.allCharacters) {
      if (char.getState() === CharacterState.OFF_BALL_DEFENDER) {
        return char;
      }
    }
    return null;
  }

  /**
   * オフボールプレイヤーを見つける
   */
  protected findOffBallPlayer(): Character | null {
    for (const char of this.allCharacters) {
      if (char.getState() === CharacterState.OFF_BALL_PLAYER) {
        return char;
      }
    }
    return null;
  }

  /**
   * 現在位置がフィールド境界に近いかチェック
   * @returns 境界に近い場合true
   */
  protected isNearBoundary(): boolean {
    const currentPosition = this.character.getPosition();
    const halfWidth = FIELD_CONFIG.width / 2;
    const halfLength = FIELD_CONFIG.length / 2;
    const threshold = 1.0; // 境界から1m以内

    return (
      currentPosition.x < -halfWidth + threshold ||
      currentPosition.x > halfWidth - threshold ||
      currentPosition.z < -halfLength + threshold ||
      currentPosition.z > halfLength - threshold
    );
  }

  /**
   * 射線上に敵がいるかチェック
   */
  protected hasEnemyInLine(start: Vector3, end: Vector3, enemies: Character[], lineThreshold: number): boolean {
    for (const enemy of enemies) {
      const enemyPos = enemy.getPosition();

      // 線分と点の距離を計算
      const distance = this.pointToLineDistance(start, end, enemyPos);

      // 敵が射線上にいるかチェック（距離が閾値以下）
      if (distance < lineThreshold) {
        // さらに、敵が線分の範囲内にいるかチェック
        if (this.isPointBetweenLineSegment(start, end, enemyPos)) {
          return true;
        }
      }
    }

    return false;
  }

  /**
   * 点から線分への最短距離を計算
   */
  protected pointToLineDistance(lineStart: Vector3, lineEnd: Vector3, point: Vector3): number {
    // XZ平面上で計算
    const x0 = point.x;
    const z0 = point.z;
    const x1 = lineStart.x;
    const z1 = lineStart.z;
    const x2 = lineEnd.x;
    const z2 = lineEnd.z;

    const dx = x2 - x1;
    const dz = z2 - z1;
    const lengthSquared = dx * dx + dz * dz;

    if (lengthSquared === 0) {
      // 線分の始点と終点が同じ場合
      return getDistance2DSimple({ x: x0, z: z0 }, { x: x1, z: z1 });
    }

    // 線分上の最近点のパラメータt（0から1の範囲）
    let t = ((x0 - x1) * dx + (z0 - z1) * dz) / lengthSquared;
    t = Math.max(0, Math.min(1, t));

    // 線分上の最近点
    const nearestX = x1 + t * dx;
    const nearestZ = z1 + t * dz;

    // 点から最近点までの距離
    return getDistance2DSimple({ x: x0, z: z0 }, { x: nearestX, z: nearestZ });
  }

  /**
   * 点が線分の範囲内にあるかチェック
   */
  protected isPointBetweenLineSegment(lineStart: Vector3, lineEnd: Vector3, point: Vector3): boolean {
    // 線分の長さ
    const lineLength = Vector3.Distance(lineStart, lineEnd);

    // 始点から点までの距離
    const distStart = Vector3.Distance(lineStart, point);

    // 終点から点までの距離
    const distEnd = Vector3.Distance(lineEnd, point);

    // 点が線分の範囲内にある場合、distStart + distEnd ≈ lineLength
    const tolerance = 0.5; // 許容誤差
    return Math.abs(distStart + distEnd - lineLength) < tolerance;
  }

  /**
   * 待機モーションを再生
   */
  protected playIdleMotion(): void {
    if (this.character.getCurrentMotionName() !== 'idle') {
      this.character.playMotion(IDLE_MOTION);
    }
  }

  /**
   * 歩行モーションを再生
   */
  protected playWalkMotion(): void {
    if (this.character.getCurrentMotionName() !== 'walk_forward') {
      this.character.playMotion(WALK_FORWARD_MOTION);
    }
  }

  /**
   * ダッシュモーションを再生
   */
  protected playDashMotion(): void {
    if (this.character.getCurrentMotionName() !== 'dash_forward') {
      this.character.playMotion(DASH_FORWARD_MOTION);
    }
  }

  /**
   * リバウンドジャンプを試みる
   * ゴール下でボールが下降中の場合にジャンプしてリバウンドを狙う
   * @returns アクション開始に成功した場合true
   */
  protected tryReboundJump(): boolean {
    // ボールが飛行中でない場合はスキップ
    if (!this.ball.isInFlight()) return false;

    // 別アクション実行中ならスキップ
    const actionController = this.character.getActionController();
    if (actionController.getCurrentAction() !== null) return false;

    const ballPos = this.ball.getPosition();
    const ballVel = this.ball.getVelocity();
    const myPos = this.character.getPosition();

    // ボールが下降中でなければスキップ
    if (ballVel.y >= 0) return false;

    // ボールとの水平距離が近い場合のみ（3m以内）
    const horizDistSq =
      (ballPos.x - myPos.x) ** 2 + (ballPos.z - myPos.z) ** 2;
    if (horizDistSq > 3.0 * 3.0) return false;

    const height = this.character.config.physical.height;

    // ジャンプ頂点到達時のボール予測高さで判断
    // startup(0.15s) + 上昇時間(~0.30s) = 約0.45s後にジャンプ頂点
    const TIME_TO_JUMP_PEAK = 0.45;
    const GRAVITY = 9.81;
    const predictedBallY = ballPos.y
      + ballVel.y * TIME_TO_JUMP_PEAK
      - 0.5 * GRAVITY * TIME_TO_JUMP_PEAK * TIME_TO_JUMP_PEAK;

    // 立ったまま手が届く高さ（身長 × 1.1 ≒ 頭上に手を伸ばした到達点）
    const standingReach = height * 1.1;

    // 予測高さが立ったまま届く → ジャンプ不要（飛ばない方が取れる）
    if (predictedBallY <= standingReach) return false;

    // 予測高さがジャンプでも届かない → 間に合わないので飛ばない
    const maxJumpReach = height + 1.5;
    if (predictedBallY > maxJumpReach) return false;

    // ボールの方を向く
    const toBall = new Vector3(ballPos.x - myPos.x, 0, ballPos.z - myPos.z);
    if (toBall.length() > 0.01) {
      const angle = Math.atan2(toBall.x, toBall.z);
      this.character.setRotation(angle);
    }

    // リバウンドジャンプ実行
    const result = actionController.startAction('rebound_jump');
    return result.success;
  }

  /**
   * 判断間隔を取得（選手のalignmentに基づく）
   * 計算式: 1 - (alignment / 50) 秒
   * alignment=50 → 0秒（毎フレーム判断）
   * alignment=0 → 1秒
   */
  protected getDecisionInterval(): number {
    const alignment = this.character.playerData?.stats.alignment ?? 50;
    return Math.max(0, 1 - alignment / 50);
  }

  /**
   * 守るべきゴールの位置を取得
   * ディフェンダーのチームに応じて自チームのゴール位置を返す
   * （攻めるゴールの逆が守るゴール）
   */
  protected getDefendingGoalPosition(): Vector3 {
    // allyチームはgoal1を攻める → goal2を守る
    // enemyチームはgoal2を攻める → goal1を守る
    return this.field.getDefendingGoalRim(this.character.team);
  }

  /**
   * シュート中にボールを見守る
   * シュート結果が出るまでその場で待機
   */
  protected handleWatchShot(): void {
    const myPosition = this.character.getPosition();
    const ballPosition = this.ball.getPosition();

    // ボールの方を向く
    const toBall = new Vector3(
      ballPosition.x - myPosition.x,
      0,
      ballPosition.z - myPosition.z
    );

    if (toBall.length() > 0.01) {
      const angle = Math.atan2(toBall.x, toBall.z);
      this.character.setRotation(angle);
    }

    // 停止してボールを見守る
    this.character.velocity = Vector3.Zero();
    this.character.stopMovement();

    // アイドルモーション
    if (this.character.getCurrentMotionName() !== 'idle') {
      this.character.playMotion(IDLE_MOTION);
    }
  }
}
