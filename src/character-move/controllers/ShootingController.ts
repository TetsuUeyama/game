import { Vector3, Scene, Mesh, VertexData, StandardMaterial, Color3 } from "@babylonjs/core";
import { Character } from "../entities/Character";
import { Ball } from "../entities/Ball";
import { Field } from "../entities/Field";
import { GOAL_CONFIG, FIELD_CONFIG } from "../config/gameConfig";
import { PhysicsConstants } from "../../physics/PhysicsConfig";
import {
  SHOOT_RANGE,
  SHOOT_ANGLE,
  SHOOT_PHYSICS,
  SHOOT_START_OFFSET,
  ShootingUtils,
} from "../config/ShootingConfig";
import {
  getDistance2D,
  getDirection2D,
  isDirectionWithinAngle,
} from "../utils/CollisionUtils";
import { ActionType, ActionConfigUtils } from "../config/ActionConfig";

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
  position: Vector3; // リング中心位置
  team: 'ally' | 'enemy';
}

// SHOOT_RANGE, SHOOT_ANGLEはShootingConfigからインポート

/**
 * ゴールのZ位置（Field.tsと同じ計算ロジックで算出）
 * rimZ = zSign * (fieldHalfLength - backboardDistance - rimOffset)
 */
const FIELD_HALF_LENGTH = FIELD_CONFIG.length / 2; // 30 / 2 = 15m
const GOAL_Z_OFFSET = FIELD_HALF_LENGTH - GOAL_CONFIG.backboardDistance - GOAL_CONFIG.rimOffset;
// = 15 - 1.2 - 0.4 = 13.4m

const GOAL_Z_POSITIONS = {
  GOAL_1: GOAL_Z_OFFSET,   // +Z方向（敵チームのゴール = 味方が攻める）= 13.4m
  GOAL_2: -GOAL_Z_OFFSET,  // -Z方向（味方チームのゴール = 敵が攻める）= -13.4m
};

/**
 * シュートを管理するコントローラー
 */
export class ShootingController {
  private scene: Scene;
  private ball: Ball;
  private field: Field;
  private getAllCharacters: () => Character[];

  // ゴール判定用の状態
  private lastBallY: number = 0;
  private checkingGoal: boolean = false;
  private currentShootGoal: 'goal1' | 'goal2' | null = null; // シュート中のゴール

  // シュートレンジ可視化用メッシュ
  private threePtRangeMesh: Mesh | null = null;
  private midRangeMesh: Mesh | null = null;
  private layupRangeMesh: Mesh | null = null;
  private shootRangeVisible: boolean = true;

  // ゴール時のコールバック（シューターのチームを引数に渡す）
  private onGoalCallback: ((scoringTeam: 'ally' | 'enemy') => void) | null = null;

  // 現在のシューターのチーム（ゴール判定用）
  private currentShooterTeam: 'ally' | 'enemy' | null = null;

  constructor(scene: Scene, ball: Ball, field: Field, getAllCharacters: () => Character[]) {
    this.scene = scene;
    this.ball = ball;
    this.field = field;
    this.getAllCharacters = getAllCharacters;

    // シュートレンジメッシュを作成
    this.createShootRangeMeshes();
  }

  /**
   * シュートレンジの可視化メッシュを作成
   */
  private createShootRangeMeshes(): void {
    // 3Pレンジメッシュ（紫色）: 6.75m〜10m
    this.threePtRangeMesh = this.createFanMesh(
      "shooter-3pt-range",
      SHOOT_RANGE.THREE_POINT_LINE,
      SHOOT_RANGE.THREE_POINT_MAX,
      SHOOT_ANGLE.THREE_POINT,
      new Color3(0.6, 0.2, 0.8), // 紫色
      0.4
    );

    // ミドルレンジメッシュ（オレンジ色）: 2.0m〜6.75m
    this.midRangeMesh = this.createFanMesh(
      "shooter-mid-range",
      SHOOT_RANGE.MIDRANGE_MIN,
      SHOOT_RANGE.MIDRANGE_MAX,
      SHOOT_ANGLE.MIDRANGE,
      new Color3(1.0, 0.6, 0.2), // オレンジ色
      0.4
    );

    // レイアップレンジメッシュ（緑色）: 0.5m〜2.0m
    this.layupRangeMesh = this.createFanMesh(
      "shooter-layup-range",
      SHOOT_RANGE.LAYUP_MIN,
      SHOOT_RANGE.LAYUP_MAX,
      SHOOT_ANGLE.LAYUP,
      new Color3(0.2, 0.8, 0.3), // 緑色
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

    // 扇形の角度範囲（-halfAngle から +halfAngle）
    const startAngle = -halfAngle;
    const endAngle = halfAngle;
    const angleStep = (endAngle - startAngle) / segments;

    // 頂点を生成（0番面方向 = +Z方向を基準）
    for (let i = 0; i <= segments; i++) {
      const angle = startAngle + i * angleStep;

      // 内側の頂点
      const innerX = Math.sin(angle) * innerRadius;
      const innerZ = Math.cos(angle) * innerRadius;
      positions.push(innerX, 0.03, innerZ);
      normals.push(0, 1, 0);

      // 外側の頂点
      const outerX = Math.sin(angle) * outerRadius;
      const outerZ = Math.cos(angle) * outerRadius;
      positions.push(outerX, 0.03, outerZ);
      normals.push(0, 1, 0);
    }

    // インデックスを生成（三角形を作成）
    for (let i = 0; i < segments; i++) {
      const baseIndex = i * 2;
      // 第1三角形
      indices.push(baseIndex, baseIndex + 1, baseIndex + 3);
      // 第2三角形
      indices.push(baseIndex, baseIndex + 3, baseIndex + 2);
    }

    // メッシュを作成
    const mesh = new Mesh(name, this.scene);
    const vertexData = new VertexData();
    vertexData.positions = positions;
    vertexData.indices = indices;
    vertexData.normals = normals;
    vertexData.applyToMesh(mesh);

    // マテリアル
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

    // ボール保持者を取得（直接ballから取得）
    const holder = this.ball.getHolder();

    if (!holder) {
      // ボール保持者がいない場合は非表示
      this.hideShootRangeMeshes();
      return;
    }

    // メッシュを表示
    this.showShootRangeMeshes();

    // キャラクターの位置と回転を取得
    const position = holder.getPosition();
    const rotation = holder.getRotation();

    // メッシュの位置と回転を更新
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

  /**
   * シュートレンジメッシュを表示
   */
  private showShootRangeMeshes(): void {
    if (this.threePtRangeMesh) {
      this.threePtRangeMesh.isVisible = true;
    }
    if (this.midRangeMesh) {
      this.midRangeMesh.isVisible = true;
    }
    if (this.layupRangeMesh) {
      this.layupRangeMesh.isVisible = true;
    }
  }

  /**
   * シュートレンジメッシュを非表示
   */
  private hideShootRangeMeshes(): void {
    if (this.threePtRangeMesh) {
      this.threePtRangeMesh.isVisible = false;
    }
    if (this.midRangeMesh) {
      this.midRangeMesh.isVisible = false;
    }
    if (this.layupRangeMesh) {
      this.layupRangeMesh.isVisible = false;
    }
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
   * シュートレンジ表示の切り替え
   */
  public toggleShootRange(): void {
    if (this.shootRangeVisible) {
      this.hideShootRange();
    } else {
      this.showShootRange();
    }
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
   * @param shooter シュートを打つキャラクター
   * @returns シュート結果（startupフェーズの開始）
   */
  public startShootAction(shooter: Character): ShootResult {
    // 基本チェック
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

    // シュートレンジ判定
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

    // アクションタイプを取得
    const actionType = this.getShootActionType(shootType);
    if (!actionType) {
      return {
        success: false,
        shootType,
        distance,
        message: 'シュートタイプが不正です',
      };
    }

    // ActionControllerでシュートアクションを開始
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

    // activeフェーズに入ったらボールを発射するコールバックを設定
    actionController.setCallbacks({
      onActive: (action) => {
        if (ActionConfigUtils.isShootAction(action)) {
          this.performShoot(shooter);
        }
      },
      onInterrupt: (_action, _interruptedBy) => {
        // シュートが中断された
      },
    });

    return {
      success: true,
      shootType,
      distance,
      message: `${ShootingUtils.getShootTypeName(shootType)}モーション開始`,
    };
  }

  /**
   * シュートがstartup中かどうかをチェック
   * ブロック可能な時間帯かどうかを判定
   */
  public isShootInStartup(shooter: Character): boolean {
    const actionController = shooter.getActionController();
    return actionController.isShootInStartup();
  }

  /**
   * シュートをブロックで中断
   * startup中のシュートをキャンセルする
   */
  public interruptShootByBlock(shooter: Character): boolean {
    const actionController = shooter.getActionController();
    return actionController.interruptShootByBlock();
  }

  /**
   * シュートを実行
   * @param shooter シュートを打つキャラクター
   * @returns シュート結果
   */
  public performShoot(shooter: Character): ShootResult {
    // ボール保持チェック
    if (this.ball.getHolder() !== shooter) {
      return {
        success: false,
        shootType: 'out_of_range',
        distance: 0,
        message: 'ボールを保持していません',
      };
    }

    // 飛行中チェック
    if (this.ball.isInFlight()) {
      return {
        success: false,
        shootType: 'out_of_range',
        distance: 0,
        message: 'ボールは既に飛行中です',
      };
    }

    // 0番面の方向を取得
    const shootDirection = this.getShootDirection(shooter);

    // シュートする目標ゴールを決定
    const targetGoal = this.getTargetGoal(shooter);

    // シュートレンジを判定（0番面方向からゴールまでの距離）
    const { shootType, distance, inRange } = this.checkShootRange(shooter, targetGoal, shootDirection);

    if (!inRange) {
      return {
        success: false,
        shootType: 'out_of_range',
        distance,
        message: `シュートレンジ外です（距離: ${distance.toFixed(2)}m）`,
      };
    }

    // 0番面がゴール方向を向いているかチェック
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

    // シューターの頭上前方からボールを発射（相手に取られないように）
    // キャラクターの向いている方向（0番面方向）に0.3mオフセット
    const shooterHeight = shooter.config.physical.height; // キャラクターの身長
    const shooterRotation = shooter.getRotation();
    const forwardOffsetDistance = 0.3; // 前方へのオフセット距離
    const forwardOffsetX = Math.sin(shooterRotation) * forwardOffsetDistance;
    const forwardOffsetZ = Math.cos(shooterRotation) * forwardOffsetDistance;
    const headPosition = new Vector3(
      shooterPos.x + forwardOffsetX,
      shooterPos.y + shooterHeight * 0.5 + SHOOT_START_OFFSET.HEAD_OFFSET,
      shooterPos.z + forwardOffsetZ
    );

    // ShootingUtilsを使用してシュート精度を計算
    const accuracy3pValue = shooter.playerData?.stats['3paccuracy'] ?? 50;
    const accuracy = ShootingUtils.getAccuracyByShootType(shootType, accuracy3pValue);
    const { x: offsetX, z: offsetZ } = ShootingUtils.generateRandomOffset(accuracy);

    // リング奥側を狙うためのオフセット（シューター中心からリムへの方向に0.12m追加）
    // ※ターゲット位置はシューター中心から計算（発射位置ではない）
    const toRim = new Vector3(
      baseTargetPosition.x - shooterPos.x,
      0,
      baseTargetPosition.z - shooterPos.z
    );
    if (toRim.length() > 0.01) {
      toRim.normalize();
    }
    const backRimOffset = 0.04 // リング半径の約半分（リング奥側を狙う）

    const targetPosition = new Vector3(
      baseTargetPosition.x + offsetX + toRim.x * backRimOffset,
      baseTargetPosition.y,
      baseTargetPosition.z + offsetZ + toRim.z * backRimOffset
    );

    // 発射位置からターゲットまでの実際の水平距離で発射角度を計算
    const actualHorizontalDistance = Math.sqrt(
      Math.pow(targetPosition.x - headPosition.x, 2) +
      Math.pow(targetPosition.z - headPosition.z, 2)
    );
    const launchAngle = ShootingUtils.getLaunchAngleWithDistance(shootType, actualHorizontalDistance);

    // デバッグ: シュートパラメータをログ出力（値の一貫性を確認用）
    console.log(`[ShootDebug] shooterPos: (${shooterPos.x.toFixed(4)}, ${shooterPos.z.toFixed(4)})`);
    console.log(`[ShootDebug] rotation: ${shooterRotation.toFixed(6)} rad`);
    console.log(`[ShootDebug] headPos: (${headPosition.x.toFixed(4)}, ${headPosition.y.toFixed(4)}, ${headPosition.z.toFixed(4)})`);
    console.log(`[ShootDebug] target: (${targetPosition.x.toFixed(4)}, ${targetPosition.y.toFixed(4)}, ${targetPosition.z.toFixed(4)})`);
    console.log(`[ShootDebug] accuracy: ${accuracy.toFixed(6)}, offset: (${offsetX.toFixed(6)}, ${offsetZ.toFixed(6)})`);
    console.log(`[ShootDebug] launchAngle: ${(launchAngle * 180 / Math.PI).toFixed(4)} deg, distance: ${actualHorizontalDistance.toFixed(4)}m`);

    // シューターのcurve値を取得（バックスピンの強さに影響）
    const curveValue = shooter.playerData?.stats.curve ?? 50;
    const shootStarted = this.ball.shoot(targetPosition, launchAngle, headPosition, curveValue);

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

    // シュートするゴールとシューターのチームを記録
    const isAlly = shooter.team === 'ally';
    this.currentShootGoal = isAlly ? 'goal1' : 'goal2';
    this.currentShooterTeam = shooter.team;

    return {
      success: true,
      shootType,
      distance,
      message: `${ShootingUtils.getShootTypeName(shootType)}シュート！`,
    };
  }

  /**
   * 更新処理（毎フレーム）
   * ゴール判定とシュートレンジ表示を行う
   */
  public update(_deltaTime: number): void {
    // シュートレンジの可視化を更新
    this.updateShootRangeVisual();

    // ネットとボールの衝突判定（毎フレーム）
    this.updateNetCollisions();

    // リムとバックボードの衝突判定はHavok物理エンジンが自動処理
    // Field.tsで設定された物理ボディ（rim1Physics, rim2Physics, backboard1Physics, backboard2Physics）が衝突を処理

    if (!this.checkingGoal || !this.ball.isInFlight()) {
      this.checkingGoal = false;
      return;
    }

    const ballPosition = this.ball.getPosition();
    const ballY = ballPosition.y;

    // リングの高さ付近を通過中かチェック
    const rimHeight = GOAL_CONFIG.rimHeight;
    const rimRadius = GOAL_CONFIG.rimDiameter / 2;

    // ボールが下降中でリングの高さを通過したか
    if (this.lastBallY > rimHeight && ballY <= rimHeight) {
      // 両方のゴールについてチェック
      const goals = [
        { z: GOAL_Z_POSITIONS.GOAL_1, name: 'ゴール1' },
        { z: GOAL_Z_POSITIONS.GOAL_2, name: 'ゴール2' },
      ];

      for (const goal of goals) {
        // ボールのXZ位置とゴールリング中心との距離
        const distanceFromCenter = Math.sqrt(
          ballPosition.x * ballPosition.x +
          (ballPosition.z - goal.z) * (ballPosition.z - goal.z)
        );

        // ボールがリング内を通過したか（ボールの中心がリム内にあればゴール）
        if (distanceFromCenter <= rimRadius) {
          this.onGoalScored(goal.name);
          this.checkingGoal = false;
          return;
        }
      }
    }

    this.lastBallY = ballY;

    // ボールが地面に落ちた場合、ゴール判定を終了
    if (!this.ball.isInFlight()) {
      this.checkingGoal = false;
    }
  }

  /**
   * キャラクターの0番面方向を取得
   */
  private getShootDirection(character: Character): Vector3 {
    const rotation = character.getRotation();
    // 0番面は正面方向
    return new Vector3(Math.sin(rotation), 0, Math.cos(rotation));
  }

  /**
   * シュートする目標ゴールを取得
   * @param shooter シューター
   * @returns ゴール情報
   */
  private getTargetGoal(shooter: Character): GoalInfo {
    // 味方チームは敵ゴール（+Z方向）を攻める
    // 敵チームは味方ゴール（-Z方向）を攻める
    const isAlly = shooter.team === 'ally';
    const goalZ = isAlly ? GOAL_Z_POSITIONS.GOAL_1 : GOAL_Z_POSITIONS.GOAL_2;

    // ターゲット位置はリム中心の、ボール半径分高い位置
    // ボールの中心がこの点を通過するように狙う
    const targetY = GOAL_CONFIG.rimHeight + PhysicsConstants.BALL.RADIUS + 0.55;

    return {
      position: new Vector3(0, targetY, goalZ),
      team: isAlly ? 'enemy' : 'ally',
    };
  }

  /**
   * シュートレンジを判定
   */
  private checkShootRange(
    shooter: Character,
    targetGoal: GoalInfo,
    shootDirection: Vector3
  ): { shootType: ShootType; distance: number; inRange: boolean } {
    const shooterPos = shooter.getPosition();

    // シューターからゴールまでの水平距離
    const distance = getDistance2D(shooterPos, targetGoal.position);

    // ShootingUtilsを使用してシュートタイプを判定
    const shootType = ShootingUtils.getShootTypeByDistance(distance);
    let inRange = shootType !== 'out_of_range';

    // ゴールの前方にいるかチェック（バックボードの裏からは打てない）
    // allyはgoal1（+Z）を攻める → shooterPos.z < goalPos.z なら前方
    // enemyはgoal2（-Z）を攻める → shooterPos.z > goalPos.z なら前方
    const isInFrontOfGoal = this.isShooterInFrontOfGoal(shooter, targetGoal);
    if (!isInFrontOfGoal) {
      inRange = false;
    }

    // ゴールへの方向を取得
    const toGoal = getDirection2D(shooterPos, targetGoal.position);

    // ShootingUtilsを使用してシュートタイプに応じた角度範囲を取得
    const requiredAngle = ShootingUtils.getAngleRangeByShootType(shootType);

    // 0番面の方向がゴール方向と合っているかチェック
    if (!isDirectionWithinAngle(shootDirection, toGoal, requiredAngle)) {
      // レンジ外として扱う（0番面から伸びる範囲外）
      inRange = false;
    }

    return { shootType, distance, inRange };
  }

  /**
   * シューターがゴールの前方（コート内側）にいるかチェック
   * バックボードの裏からはシュートを打てない
   */
  private isShooterInFrontOfGoal(shooter: Character, targetGoal: GoalInfo): boolean {
    const shooterPos = shooter.getPosition();
    const goalZ = targetGoal.position.z;

    // allyチームは+Z方向のゴールを攻める（shooter.z < goal.z なら前方）
    // enemyチームは-Z方向のゴールを攻める（shooter.z > goal.z なら前方）
    const isAlly = shooter.team === 'ally';

    if (isAlly) {
      // goal1（+Z側）を攻める場合、シューターはゴールより手前（-Z側）にいる必要がある
      return shooterPos.z < goalZ;
    } else {
      // goal2（-Z側）を攻める場合、シューターはゴールより奥（+Z側）にいる必要がある
      return shooterPos.z > goalZ;
    }
  }

  /**
   * 0番面がゴール方向を向いているかチェック
   */
  private isFacingGoal(shooter: Character, targetGoal: GoalInfo, shootDirection: Vector3): boolean {
    const shooterPos = shooter.getPosition();
    const toGoal = getDirection2D(shooterPos, targetGoal.position);

    // SHOOT_ANGLE.FACING_GOAL（45度）以内ならOK
    return isDirectionWithinAngle(shootDirection, toGoal, SHOOT_ANGLE.FACING_GOAL);
  }

  // calculateLaunchAngle, getShootAccuracy, getShootTypeNameはShootingUtilsに移行済み
  // - ShootingUtils.getLaunchAngle(shootType)
  // - ShootingUtils.getAccuracyByShootType(shootType, accuracy3p)
  // - ShootingUtils.getShootTypeName(shootType)

  /**
   * ネットとボールの衝突判定（毎フレーム呼び出し）
   */
  private updateNetCollisions(): void {
    // ボールが飛行中でなければスキップ
    if (!this.ball.isInFlight()) {
      return;
    }

    const ballPosition = this.ball.getPosition();
    const ballVelocity = this.ball.getVelocity();
    const ballRadius = this.ball.getRadius();

    // 各ネットとの衝突を確認
    const nets = [
      { net: this.field.getGoal1Net(), name: 'goal1' },
      { net: this.field.getGoal2Net(), name: 'goal2' },
    ];

    for (const { net } of nets) {
      if (net.checkBallCollision(ballPosition, ballRadius)) {
        // ボールがネットを通過している場合、ネットに力を加える
        // SHOOT_PHYSICSを使用
        const force = ballVelocity.scale(SHOOT_PHYSICS.NET_FORCE_MULTIPLIER);
        const influenceRadius = ballRadius * SHOOT_PHYSICS.NET_INFLUENCE_RADIUS;
        net.applyForce(ballPosition, force, influenceRadius);
      }
    }
  }

  /**
   * ゴール成功時のコールバック
   */
  private onGoalScored(_goalName: string): void {
    // ゴール時のコールバックを呼び出し
    if (this.onGoalCallback && this.currentShooterTeam) {
      this.onGoalCallback(this.currentShooterTeam);
    }

    // シュートゴールとシューターチームをリセット
    this.currentShootGoal = null;
    this.currentShooterTeam = null;
  }

  /**
   * ゴール時のコールバックを設定
   */
  public setOnGoalCallback(callback: (scoringTeam: 'ally' | 'enemy') => void): void {
    this.onGoalCallback = callback;
  }

  /**
   * シュート可能かどうかをチェック
   * @param shooter シューター候補
   * @returns シュート可能な場合true
   */
  public canShoot(shooter: Character): boolean {
    // ボール保持チェック
    if (this.ball.getHolder() !== shooter) {
      return false;
    }

    // 飛行中チェック
    if (this.ball.isInFlight()) {
      return false;
    }

    // レンジチェック
    const shootDirection = this.getShootDirection(shooter);
    const targetGoal = this.getTargetGoal(shooter);
    const { inRange } = this.checkShootRange(shooter, targetGoal, shootDirection);

    return inRange;
  }

  /**
   * 現在のシュートレンジ情報を取得
   * @param shooter シューター候補
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
   */
  public findOnBallPlayer(): Character | null {
    const allCharacters = this.getAllCharacters();
    for (const char of allCharacters) {
      if (char.getState() === "ON_BALL_PLAYER") {
        return char;
      }
    }
    return null;
  }

  /**
   * 破棄
   */
  public dispose(): void {
    // シュートレンジメッシュを破棄
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
