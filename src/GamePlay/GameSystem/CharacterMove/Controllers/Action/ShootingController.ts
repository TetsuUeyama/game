


import { Vector3, Scene, Mesh, VertexData, StandardMaterial, Color3 } from "@babylonjs/core";
import { Character } from "@/GamePlay/Object/Entities/Character";
import { Ball } from "@/GamePlay/Object/Entities/Ball";
import { Field } from "@/GamePlay/Object/Entities/Field";
import { GOAL_CONFIG, FIELD_CONFIG } from "@/GamePlay/GameSystem/CharacterMove/Config/GameConfig";
import { PhysicsConstants } from "@/GamePlay/Object/Physics/PhysicsConfig";
import {
  SHOOT_RANGE,
  SHOOT_ANGLE,
  SHOOT_ACCURACY,
  SHOOT_PHYSICS,
  SHOOT_START_OFFSET,
  SHOOT_COOLDOWN,
  ShootingUtils,
} from "@/GamePlay/GameSystem/CharacterMove/Config/Action/ShootingConfig";
import { ParabolaUtils } from "@/GamePlay/Object/Physics/Trajectory/ParabolaUtils";
import {
  getDistance2D,
  getDirection2D,
  isDirectionWithinAngle,
} from "@/GamePlay/Object/Physics/Spatial/SpatialUtils";
import { ActionType, ActionConfigUtils } from "@/GamePlay/GameSystem/CharacterMove/Config/Action/ActionConfig";

/**
 * シュートの種類
 */
export type ShootType = '3pt' | 'midrange' | 'layup' | 'dunk' | 'out_of_range';

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
  private currentShooterCharacter: Character | null = null;

  // シュート試行時のコールバック（ショットクロック用）
  private onShotAttemptCallback: (() => void) | null = null;

  // シュートクールダウン管理（キャラクター別）
  private lastShootTime: Map<Character, number> = new Map();

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
      case 'dunk':
        return 'shoot_dunk';
      default:
        return null;
    }
  }

  /**
   * ActionControllerを使用したシュート開始
   * startup時間中はブロック可能
   * @param shooter シューター
   * @param forceDunk ダンクレンジ内で強制的にダンクを実行（シュートチェックモード用）
   */
  public startShootAction(shooter: Character, forceDunk: boolean = false): ShootResult {
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
    const { shootType, distance, inRange } = this.checkShootRange(shooter, targetGoal, shootDirection, forceDunk);

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

    // シュートクールダウンを記録
    this.lastShootTime.set(shooter, Date.now() / 1000);

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
    // ダンク時はジャンプ中の実際の高さを使用
    const shooterPos = shootType === 'dunk'
      ? shooter.getVisualPosition()
      : shooter.getPosition();

    // シューターの頭上前方からボールを発射
    // 前方オフセットは体・手の物理体との衝突を避けるため十分な距離が必要
    const shooterHeight = shooter.config.physical.height;
    const shooterRotation = shooter.getRotation();
    const forwardOffsetDistance = 0.7;
    const forwardOffsetX = Math.sin(shooterRotation) * forwardOffsetDistance;
    const forwardOffsetZ = Math.cos(shooterRotation) * forwardOffsetDistance;
    const headPosition = new Vector3(
      shooterPos.x + forwardOffsetX,
      shooterPos.y + shooterHeight * 0.5 + SHOOT_START_OFFSET.HEAD_OFFSET,
      shooterPos.z + forwardOffsetZ
    );

    // シュート精度を計算
    // 3Pとミドル: ステータス値を成功確率(%)として判定し、外れた場合にXYZブレを適用
    // レイアップ・ダンク: 従来通りの固定精度
    let offsetX = 0;
    let offsetY = 0;
    let offsetZ = 0;

    if (shootType === '3pt') {
      const stat = shooter.playerData?.stats['3paccuracy'] ?? 50;
      if (!ShootingUtils.isAccurateShot(stat)) {
        // ブレ発生（非利き腕・1v1不利でブレ幅増大）
        let multiplier = 1.0;
        const handMultiplier = shooter.getHandAccuracyMultiplier();
        if (handMultiplier > 1) {
          multiplier *= handMultiplier;
        }
        const advantageStatus = shooter.getAdvantageStatus();
        if (advantageStatus.state === 'defense') {
          multiplier *= (1 + advantageStatus.multiplier * 0.5);
        }
        const offset = ShootingUtils.generateRandomOffset3D(
          SHOOT_ACCURACY.THREE_POINT_ERROR_X * multiplier,
          SHOOT_ACCURACY.THREE_POINT_ERROR_Y * multiplier,
          SHOOT_ACCURACY.THREE_POINT_ERROR_Z * multiplier
        );
        offsetX = offset.x;
        offsetY = offset.y;
        offsetZ = offset.z;
      }
    } else if (shootType === 'midrange') {
      const stat = shooter.playerData?.stats.shootccuracy ?? 50;
      if (!ShootingUtils.isAccurateShot(stat)) {
        let multiplier = 1.0;
        const handMultiplier = shooter.getHandAccuracyMultiplier();
        if (handMultiplier > 1) {
          multiplier *= handMultiplier;
        }
        const advantageStatus = shooter.getAdvantageStatus();
        if (advantageStatus.state === 'defense') {
          multiplier *= (1 + advantageStatus.multiplier * 0.5);
        }
        const offset = ShootingUtils.generateRandomOffset3D(
          SHOOT_ACCURACY.MIDRANGE_ERROR_X * multiplier,
          SHOOT_ACCURACY.MIDRANGE_ERROR_Y * multiplier,
          SHOOT_ACCURACY.MIDRANGE_ERROR_Z * multiplier
        );
        offsetX = offset.x;
        offsetY = offset.y;
        offsetZ = offset.z;
      }
    } else {
      // レイアップ・ダンク等は従来通り
      const accuracy = ShootingUtils.getAccuracyByShootType(shootType);
      const offset2D = ShootingUtils.generateRandomOffset(accuracy);
      offsetX = offset2D.x;
      offsetZ = offset2D.z;
    }

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
      baseTargetPosition.y + offsetY,
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

    // 最小アーチ高さを保証（シュートタイプごとに設定）
    // 低すぎるとボールがリムに届かない（ダンクは例外：叩き込むので低い軌道）
    let arcHeight: number;
    if (shootType === 'dunk') {
      // ダンクは叩き込むので最小アーチ高さ制限なし
      arcHeight = baseArcHeight;
    } else {
      const minArcHeight = shootType === 'layup' ? 0.6 : 0.8;
      arcHeight = Math.max(minArcHeight, baseArcHeight + arcHeightAdjust);
    }

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
    this.currentShooterCharacter = shooter;

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

  /**
   * シューターがジャンプ中かどうかを判定
   */
  /**
   * シューターがジャンプ中かどうかを判定
   * モーションオフセット（ジャンプ高さ）を含むビジュアル位置を使用
   */
  private isShooterJumping(shooter: Character): boolean {
    const pos = shooter.getVisualPosition();
    return pos.y > 0.5;
  }

  private checkShootRange(
    shooter: Character,
    targetGoal: GoalInfo,
    shootDirection: Vector3,
    forceDunk: boolean = false
  ): { shootType: ShootType; distance: number; inRange: boolean } {
    const shooterPos = shooter.getPosition();
    const distance = getDistance2D(shooterPos, targetGoal.position);
    const isJumping = this.isShooterJumping(shooter);
    const jumpStat = shooter.playerData?.stats.jump ?? 50;
    const shootType = ShootingUtils.getShootTypeByDistance(distance, isJumping, forceDunk, jumpStat);
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
    this.currentShooterCharacter = null;
  }

  /**
   * ゴール時のコールバックを設定
   */
  public setOnGoalCallback(callback: (scoringTeam: 'ally' | 'enemy') => void): void {
    this.onGoalCallback = callback;
  }

  /**
   * 現在のシューター（ゴール判定中のみ有効）
   */
  public getCurrentShooterCharacter(): Character | null {
    return this.currentShooterCharacter;
  }

  /**
   * シュート試行時のコールバックを設定（ショットクロック用）
   */
  public setOnShotAttemptCallback(callback: () => void): void {
    this.onShotAttemptCallback = callback;
  }

  /**
   * シュート可能かどうかをチェック（クールダウン含む）
   */
  public canShoot(shooter: Character): boolean {
    // クールダウンチェック
    const now = Date.now() / 1000;
    const lastShoot = this.lastShootTime.get(shooter) ?? 0;
    if (now - lastShoot < SHOOT_COOLDOWN.AFTER_SHOT) {
      return false;
    }

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
   * シュートクールダウンをリセット（状態遷移時に使用）
   */
  public resetCooldown(character: Character): void {
    this.lastShootTime.delete(character);
  }

  /**
   * 現在のシュートレンジ情報を取得
   * @param shooter シューター
   * @param forceDunk ダンクレンジ内で強制的にダンクを返す（シュートチェックモード用）
   */
  public getShootRangeInfo(shooter: Character, forceDunk: boolean = false): { shootType: ShootType; distance: number; inRange: boolean; facingGoal: boolean } {
    const shootDirection = this.getShootDirection(shooter);
    const targetGoal = this.getTargetGoal(shooter);
    const { shootType, distance, inRange } = this.checkShootRange(shooter, targetGoal, shootDirection, forceDunk);
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
    this.lastShootTime.clear();
  }
}
