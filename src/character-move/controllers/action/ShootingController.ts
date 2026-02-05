


import { Vector3, Scene, Mesh, VertexData, StandardMaterial, Color3 } from "@babylonjs/core";
import { Character } from "../../entities/Character";
import { Ball } from "../../entities/Ball";
import { Field } from "../../entities/Field";
import { GOAL_CONFIG, FIELD_CONFIG } from "../../config/gameConfig";
import { PhysicsConstants } from "../../../physics/PhysicsConfig";
import {
  SHOOT_RANGE,
  SHOOT_ANGLE,
  SHOOT_PHYSICS,
  SHOOT_START_OFFSET,
  ShootingUtils,
} from "../../config/action/ShootingConfig";
import { ParabolaUtils } from "../../utils/parabolaUtils";
import {
  getDistance2D,
  getDirection2D,
  isDirectionWithinAngle,
} from "../../utils/CollisionUtils";
import { ActionType, ActionConfigUtils } from "../../config/action/ActionConfig";

/**
 * シュートの種類
 */
export type ShootType = '3pt' | 'midrange' | 'layup' | 'out_of_range';

/**
 * シュート結果
 */
export interface ShootResult {
  success: boolean;
  shootType: ShootType;
  distance: number;
  message: string;
}

/**
 * ゴール情報
 */
interface GoalInfo {
  position: Vector3;
  team: 'ally' | 'enemy';
}

/**
 * ゴールのZ位置（Field.tsと同じ計算ロジックで算出）
 */
const FIELD_HALF_LENGTH = FIELD_CONFIG.length / 2;
const GOAL_Z_OFFSET = FIELD_HALF_LENGTH - GOAL_CONFIG.backboardDistance - GOAL_CONFIG.rimOffset;

const GOAL_Z_POSITIONS = {
  GOAL_1: GOAL_Z_OFFSET,
  GOAL_2: -GOAL_Z_OFFSET,
};

/**
 * シュートを管理するコントローラー
 */
export class ShootingController {
  private scene: Scene;
  private ball: Ball;
  private field: Field;

  // ゴール判定用の状態
  private lastBallY: number = 0;
  private checkingGoal: boolean = false;

  // シュートレンジ可視化用メッシュ
  private threePtRangeMesh: Mesh | null = null;
  private midRangeMesh: Mesh | null = null;
  private layupRangeMesh: Mesh | null = null;
  private shootRangeVisible: boolean = true;

  // ゴール時のコールバック
  private onGoalCallback: ((scoringTeam: 'ally' | 'enemy') => void) | null = null;
  private currentShooterTeam: 'ally' | 'enemy' | null = null;

  // シュート試行時のコールバック（ショットクロック用）
  private onShotAttemptCallback: (() => void) | null = null;

  constructor(scene: Scene, ball: Ball, field: Field, _getAllCharacters: () => Character[]) {
    this.scene = scene;
    this.ball = ball;
    this.field = field;
    this.createShootRangeMeshes();
  }

  /**
   * シュートレンジの可視化メッシュを作成
   */
  private createShootRangeMeshes(): void {
    this.threePtRangeMesh = this.createFanMesh(
      "shooter-3pt-range",
      SHOOT_RANGE.THREE_POINT_LINE,
      SHOOT_RANGE.THREE_POINT_MAX,
      SHOOT_ANGLE.THREE_POINT,
      new Color3(0.6, 0.2, 0.8),
      0.4
    );

    this.midRangeMesh = this.createFanMesh(
      "shooter-mid-range",
      SHOOT_RANGE.MIDRANGE_MIN,
      SHOOT_RANGE.MIDRANGE_MAX,
      SHOOT_ANGLE.MIDRANGE,
      new Color3(1.0, 0.6, 0.2),
      0.4
    );

    this.layupRangeMesh = this.createFanMesh(
      "shooter-layup-range",
      SHOOT_RANGE.LAYUP_MIN,
      SHOOT_RANGE.LAYUP_MAX,
      SHOOT_ANGLE.LAYUP,
      new Color3(0.2, 0.8, 0.3),
      0.4
    );
  }

  /**
   * 扇形メッシュを作成
   */
  private createFanMesh(
    name: string,
    innerRadius: number,
    outerRadius: number,
    halfAngle: number,
    color: Color3,
    alpha: number
  ): Mesh {
    const segments = 24;
    const positions: number[] = [];
    const indices: number[] = [];
    const normals: number[] = [];

    const startAngle = -halfAngle;
    const endAngle = halfAngle;
    const angleStep = (endAngle - startAngle) / segments;

    for (let i = 0; i <= segments; i++) {
      const angle = startAngle + i * angleStep;

      const innerX = Math.sin(angle) * innerRadius;
      const innerZ = Math.cos(angle) * innerRadius;
      positions.push(innerX, 0.03, innerZ);
      normals.push(0, 1, 0);

      const outerX = Math.sin(angle) * outerRadius;
      const outerZ = Math.cos(angle) * outerRadius;
      positions.push(outerX, 0.03, outerZ);
      normals.push(0, 1, 0);
    }

    for (let i = 0; i < segments; i++) {
      const baseIndex = i * 2;
      indices.push(baseIndex, baseIndex + 1, baseIndex + 3);
      indices.push(baseIndex, baseIndex + 3, baseIndex + 2);
    }

    const mesh = new Mesh(name, this.scene);
    const vertexData = new VertexData();
    vertexData.positions = positions;
    vertexData.indices = indices;
    vertexData.normals = normals;
    vertexData.applyToMesh(mesh);

    const material = new StandardMaterial(`${name}-material`, this.scene);
    material.diffuseColor = color;
    material.emissiveColor = color.scale(0.5);
    material.alpha = alpha;
    material.backFaceCulling = false;
    mesh.material = material;

    return mesh;
  }

  /**
   * シュートレンジ表示を更新（毎フレーム呼び出し）
   */
  private updateShootRangeVisual(): void {
    if (!this.shootRangeVisible) {
      return;
    }

    const holder = this.ball.getHolder();

    if (!holder) {
      this.hideShootRangeMeshes();
      return;
    }

    this.showShootRangeMeshes();

    const position = holder.getPosition();
    const rotation = holder.getRotation();

    if (this.threePtRangeMesh) {
      this.threePtRangeMesh.position.x = position.x;
      this.threePtRangeMesh.position.z = position.z;
      this.threePtRangeMesh.rotation.y = rotation;
    }

    if (this.midRangeMesh) {
      this.midRangeMesh.position.x = position.x;
      this.midRangeMesh.position.z = position.z;
      this.midRangeMesh.rotation.y = rotation;
    }

    if (this.layupRangeMesh) {
      this.layupRangeMesh.position.x = position.x;
      this.layupRangeMesh.position.z = position.z;
      this.layupRangeMesh.rotation.y = rotation;
    }
  }

  private showShootRangeMeshes(): void {
    if (this.threePtRangeMesh) this.threePtRangeMesh.isVisible = true;
    if (this.midRangeMesh) this.midRangeMesh.isVisible = true;
    if (this.layupRangeMesh) this.layupRangeMesh.isVisible = true;
  }

  private hideShootRangeMeshes(): void {
    if (this.threePtRangeMesh) this.threePtRangeMesh.isVisible = false;
    if (this.midRangeMesh) this.midRangeMesh.isVisible = false;
    if (this.layupRangeMesh) this.layupRangeMesh.isVisible = false;
  }

  /**
   * シュートレンジ表示を有効化
   */
  public showShootRange(): void {
    this.shootRangeVisible = true;
  }

  /**
   * シュートレンジ表示を無効化
   */
  public hideShootRange(): void {
    this.shootRangeVisible = false;
    this.hideShootRangeMeshes();
  }

  /**
   * シュートタイプから対応するアクションタイプを取得
   */
  private getShootActionType(shootType: ShootType): ActionType | null {
    switch (shootType) {
      case '3pt':
        return 'shoot_3pt';
      case 'midrange':
        return 'shoot_midrange';
      case 'layup':
        return 'shoot_layup';
      default:
        return null;
    }
  }

  /**
   * ActionControllerを使用したシュート開始
   * startup時間中はブロック可能
   */
  public startShootAction(shooter: Character): ShootResult {
    if (this.ball.getHolder() !== shooter) {
      return {
        success: false,
        shootType: 'out_of_range',
        distance: 0,
        message: 'ボールを保持していません',
      };
    }

    if (this.ball.isInFlight()) {
      return {
        success: false,
        shootType: 'out_of_range',
        distance: 0,
        message: 'ボールは既に飛行中です',
      };
    }

    const shootDirection = this.getShootDirection(shooter);
    const targetGoal = this.getTargetGoal(shooter);
    const { shootType, distance, inRange } = this.checkShootRange(shooter, targetGoal, shootDirection);

    if (!inRange) {
      return {
        success: false,
        shootType: 'out_of_range',
        distance,
        message: `シュートレンジ外です（距離: ${distance.toFixed(2)}m）`,
      };
    }

    if (!this.isFacingGoal(shooter, targetGoal, shootDirection)) {
      return {
        success: false,
        shootType,
        distance,
        message: '0番面がゴール方向を向いていません',
      };
    }

    const actionType = this.getShootActionType(shootType);
    if (!actionType) {
      return {
        success: false,
        shootType,
        distance,
        message: 'シュートタイプが不正です',
      };
    }

    const actionController = shooter.getActionController();
    const actionResult = actionController.startAction(actionType);

    if (!actionResult.success) {
      return {
        success: false,
        shootType,
        distance,
        message: actionResult.message,
      };
    }

    actionController.setCallbacks({
      onActive: (action) => {
        if (ActionConfigUtils.isShootAction(action)) {
          this.performShoot(shooter);
        }
      },
      onInterrupt: () => {},
    });

    return {
      success: true,
      shootType,
      distance,
      message: `${ShootingUtils.getShootTypeName(shootType)}モーション開始`,
    };
  }

  /**
   * シュートを実行（内部用）
   */
  private performShoot(shooter: Character): ShootResult {
    if (this.ball.getHolder() !== shooter) {
      return {
        success: false,
        shootType: 'out_of_range',
        distance: 0,
        message: 'ボールを保持していません',
      };
    }

    if (this.ball.isInFlight()) {
      return {
        success: false,
        shootType: 'out_of_range',
        distance: 0,
        message: 'ボールは既に飛行中です',
      };
    }

    const shootDirection = this.getShootDirection(shooter);
    const targetGoal = this.getTargetGoal(shooter);
    const { shootType, distance, inRange } = this.checkShootRange(shooter, targetGoal, shootDirection);

    if (!inRange) {
      return {
        success: false,
        shootType: 'out_of_range',
        distance,
        message: `シュートレンジ外です（距離: ${distance.toFixed(2)}m）`,
      };
    }

    if (!this.isFacingGoal(shooter, targetGoal, shootDirection)) {
      return {
        success: false,
        shootType,
        distance,
        message: '0番面がゴール方向を向いていません',
      };
    }

    // シュート実行
    const baseTargetPosition = targetGoal.position;
    const shooterPos = shooter.getPosition();

    // シューターの頭上前方からボールを発射
    const shooterHeight = shooter.config.physical.height;
    const shooterRotation = shooter.getRotation();
    const forwardOffsetDistance = 0.3;
    const forwardOffsetX = Math.sin(shooterRotation) * forwardOffsetDistance;
    const forwardOffsetZ = Math.cos(shooterRotation) * forwardOffsetDistance;
    const headPosition = new Vector3(
      shooterPos.x + forwardOffsetX,
      shooterPos.y + shooterHeight * 0.5 + SHOOT_START_OFFSET.HEAD_OFFSET,
      shooterPos.z + forwardOffsetZ
    );

    // シュート精度を計算
    // 3Pとミドルシュートは非利き腕使用時に精度が低下（レイアップは持ち替えて打つため影響なし）
    const accuracy3pValue = shooter.playerData?.stats['3paccuracy'] ?? 50;
    let accuracy = ShootingUtils.getAccuracyByShootType(shootType, accuracy3pValue);
    if (shootType === '3pt' || shootType === 'midrange') {
      // 非利き腕による精度低下
      const handMultiplier = shooter.getHandAccuracyMultiplier();
      accuracy = accuracy * handMultiplier;

      // 1対1有利/不利による精度調整（オフェンス有利→精度UP、不利→精度DOWN）
      // accuracyは小さいほど精度が高いので、有利時は減少、不利時は増加
      const advantageStatus = shooter.getAdvantageStatus();
      if (advantageStatus.state === 'offense') {
        // オフェンス有利：精度向上（accuracyを減少）
        accuracy = accuracy * (1 - advantageStatus.multiplier * 0.5);
      } else if (advantageStatus.state === 'defense') {
        // ディフェンス有利：精度低下（accuracyを増加）
        accuracy = accuracy * (1 + advantageStatus.multiplier * 0.5);
      }
    }
    const { x: offsetX, z: offsetZ } = ShootingUtils.generateRandomOffset(accuracy);

    // リング奥側を狙うためのオフセット
    const toRim = new Vector3(
      baseTargetPosition.x - shooterPos.x,
      0,
      baseTargetPosition.z - shooterPos.z
    );
    if (toRim.length() > 0.01) {
      toRim.normalize();
    }
    const backRimOffset = 0.04;

    const targetPosition = new Vector3(
      baseTargetPosition.x + offsetX + toRim.x * backRimOffset,
      baseTargetPosition.y,
      baseTargetPosition.z + offsetZ + toRim.z * backRimOffset
    );

    const actualHorizontalDistance = Math.sqrt(
      Math.pow(targetPosition.x - headPosition.x, 2) +
      Math.pow(targetPosition.z - headPosition.z, 2)
    );

    // アーチ高さから初速度を計算
    const baseArcHeight = ParabolaUtils.getArcHeight(shootType, actualHorizontalDistance);

    // 選手データによるアーチ高さ・ボール半径の調整
    const statValue = shootType === '3pt'
      ? (shooter.playerData?.stats['3paccuracy'] ?? 42)
      : (shooter.playerData?.stats.shootccuracy ?? 42);
    const arcHeightAdjust = (statValue - 42) / 100;
    const radiusAdjust = (statValue - 42) / 3000;
    const arcHeight = baseArcHeight + arcHeightAdjust;

    const curveValue = shooter.playerData?.stats.curve ?? 50;
    const shootStarted = this.ball.shootWithArcHeight(targetPosition, arcHeight, headPosition, curveValue, radiusAdjust);

    if (!shootStarted) {
      return {
        success: false,
        shootType,
        distance,
        message: 'シュートの開始に失敗しました',
      };
    }

    // ゴール判定の監視を開始
    this.checkingGoal = true;
    this.lastBallY = this.ball.getPosition().y;
    this.currentShooterTeam = shooter.team;

    // シュート試行をショットクロックに通知
    if (this.onShotAttemptCallback) {
      this.onShotAttemptCallback();
    }

    return {
      success: true,
      shootType,
      distance,
      message: `${ShootingUtils.getShootTypeName(shootType)}シュート！`,
    };
  }

  /**
   * 更新処理（毎フレーム）
   */
  public update(_deltaTime: number): void {
    this.updateShootRangeVisual();
    this.updateNetCollisions();

    if (!this.checkingGoal || !this.ball.isInFlight()) {
      this.checkingGoal = false;
      return;
    }

    const ballPosition = this.ball.getPosition();
    const ballY = ballPosition.y;

    const rimHeight = GOAL_CONFIG.rimHeight;
    const rimRadius = GOAL_CONFIG.rimDiameter / 2;

    if (this.lastBallY > rimHeight && ballY <= rimHeight) {
      const goals = [
        { z: GOAL_Z_POSITIONS.GOAL_1, name: 'ゴール1' },
        { z: GOAL_Z_POSITIONS.GOAL_2, name: 'ゴール2' },
      ];

      for (const goal of goals) {
        const distanceFromCenter = Math.sqrt(
          ballPosition.x * ballPosition.x +
          (ballPosition.z - goal.z) * (ballPosition.z - goal.z)
        );

        if (distanceFromCenter <= rimRadius) {
          this.onGoalScored();
          this.checkingGoal = false;
          return;
        }
      }
    }

    this.lastBallY = ballY;

    if (!this.ball.isInFlight()) {
      this.checkingGoal = false;
    }
  }

  private getShootDirection(character: Character): Vector3 {
    const rotation = character.getRotation();
    return new Vector3(Math.sin(rotation), 0, Math.cos(rotation));
  }

  private getTargetGoal(shooter: Character): GoalInfo {
    const isAlly = shooter.team === 'ally';
    const goalZ = isAlly ? GOAL_Z_POSITIONS.GOAL_1 : GOAL_Z_POSITIONS.GOAL_2;
    const targetY = GOAL_CONFIG.rimHeight + PhysicsConstants.BALL.RADIUS;

    return {
      position: new Vector3(0, targetY, goalZ),
      team: isAlly ? 'enemy' : 'ally',
    };
  }

  private checkShootRange(
    shooter: Character,
    targetGoal: GoalInfo,
    shootDirection: Vector3
  ): { shootType: ShootType; distance: number; inRange: boolean } {
    const shooterPos = shooter.getPosition();
    const distance = getDistance2D(shooterPos, targetGoal.position);
    const shootType = ShootingUtils.getShootTypeByDistance(distance);
    let inRange = shootType !== 'out_of_range';

    const isInFrontOfGoal = this.isShooterInFrontOfGoal(shooter, targetGoal);
    if (!isInFrontOfGoal) {
      inRange = false;
    }

    const toGoal = getDirection2D(shooterPos, targetGoal.position);
    const requiredAngle = ShootingUtils.getAngleRangeByShootType(shootType);

    if (!isDirectionWithinAngle(shootDirection, toGoal, requiredAngle)) {
      inRange = false;
    }

    return { shootType, distance, inRange };
  }

  private isShooterInFrontOfGoal(shooter: Character, targetGoal: GoalInfo): boolean {
    const shooterPos = shooter.getPosition();
    const goalZ = targetGoal.position.z;
    const isAlly = shooter.team === 'ally';

    if (isAlly) {
      return shooterPos.z < goalZ;
    } else {
      return shooterPos.z > goalZ;
    }
  }

  private isFacingGoal(shooter: Character, targetGoal: GoalInfo, shootDirection: Vector3): boolean {
    const shooterPos = shooter.getPosition();
    const toGoal = getDirection2D(shooterPos, targetGoal.position);
    return isDirectionWithinAngle(shootDirection, toGoal, SHOOT_ANGLE.FACING_GOAL);
  }

  private updateNetCollisions(): void {
    if (!this.ball.isInFlight()) {
      return;
    }

    const ballPosition = this.ball.getPosition();
    const ballVelocity = this.ball.getVelocity();
    const ballRadius = this.ball.getRadius();

    const nets = [
      { net: this.field.getGoal1Net() },
      { net: this.field.getGoal2Net() },
    ];

    for (const { net } of nets) {
      if (net.checkBallCollision(ballPosition, ballRadius)) {
        const force = ballVelocity.scale(SHOOT_PHYSICS.NET_FORCE_MULTIPLIER);
        const influenceRadius = ballRadius * SHOOT_PHYSICS.NET_INFLUENCE_RADIUS;
        net.applyForce(ballPosition, force, influenceRadius);
      }
    }
  }

  private onGoalScored(): void {
    if (this.onGoalCallback && this.currentShooterTeam) {
      this.onGoalCallback(this.currentShooterTeam);
    }
    this.currentShooterTeam = null;
  }

  /**
   * ゴール時のコールバックを設定
   */
  public setOnGoalCallback(callback: (scoringTeam: 'ally' | 'enemy') => void): void {
    this.onGoalCallback = callback;
  }

  /**
   * シュート試行時のコールバックを設定（ショットクロック用）
   */
  public setOnShotAttemptCallback(callback: () => void): void {
    this.onShotAttemptCallback = callback;
  }

  /**
   * シュート可能かどうかをチェック
   */
  public canShoot(shooter: Character): boolean {
    if (this.ball.getHolder() !== shooter) {
      return false;
    }

    if (this.ball.isInFlight()) {
      return false;
    }

    const shootDirection = this.getShootDirection(shooter);
    const targetGoal = this.getTargetGoal(shooter);
    const { inRange } = this.checkShootRange(shooter, targetGoal, shootDirection);

    return inRange;
  }

  /**
   * 現在のシュートレンジ情報を取得
   */
  public getShootRangeInfo(shooter: Character): { shootType: ShootType; distance: number; inRange: boolean; facingGoal: boolean } {
    const shootDirection = this.getShootDirection(shooter);
    const targetGoal = this.getTargetGoal(shooter);
    const { shootType, distance, inRange } = this.checkShootRange(shooter, targetGoal, shootDirection);
    const facingGoal = this.isFacingGoal(shooter, targetGoal, shootDirection);

    return { shootType, distance, inRange, facingGoal };
  }

  /**
   * オンボールプレイヤーを取得
   * Ball.getHolder() を使用してボール保持者を取得
   */
  public findOnBallPlayer(): Character | null {
    return this.ball.getHolder();
  }

  /**
   * 破棄
   */
  public dispose(): void {
    if (this.threePtRangeMesh) {
      this.threePtRangeMesh.dispose();
      this.threePtRangeMesh = null;
    }
    if (this.midRangeMesh) {
      this.midRangeMesh.dispose();
      this.midRangeMesh = null;
    }
    if (this.layupRangeMesh) {
      this.layupRangeMesh.dispose();
      this.layupRangeMesh = null;
    }
  }
}
