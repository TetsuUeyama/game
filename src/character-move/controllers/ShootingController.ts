import { Vector3, Scene, Mesh, VertexData, StandardMaterial, Color3 } from "@babylonjs/core";
import { Character } from "../entities/Character";
import { Ball } from "../entities/Ball";
import { Field } from "../entities/Field";
import { GOAL_CONFIG } from "../config/gameConfig";
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
  isPointInBox,
} from "../utils/CollisionUtils";

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
const FIELD_HALF_LENGTH = 28 / 2; // FIELD_CONFIG.length / 2
const GOAL_Z_OFFSET = FIELD_HALF_LENGTH - GOAL_CONFIG.backboardDistance - GOAL_CONFIG.rimOffset;
// = 14 - 1.2 - 0.4 = 12.4m

const GOAL_Z_POSITIONS = {
  GOAL_1: GOAL_Z_OFFSET,   // +Z方向（敵チームのゴール = 味方が攻める）= 12.4m
  GOAL_2: -GOAL_Z_OFFSET,  // -Z方向（味方チームのゴール = 敵が攻める）= -12.4m
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

    console.log(`[ShootingController] ゴールZ位置: GOAL_1=${GOAL_Z_POSITIONS.GOAL_1.toFixed(2)}m, GOAL_2=${GOAL_Z_POSITIONS.GOAL_2.toFixed(2)}m`);
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

    console.log('[ShootingController] シュートレンジメッシュを作成しました');
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

    // デバッグ：初回のみログ出力
    if (this.threePtRangeMesh && !this.threePtRangeMesh.metadata?.logged) {
      console.log(`[ShootingController] シュートレンジ表示中: holder=${holder.playerData?.basic?.NAME || 'unknown'}`);
      this.threePtRangeMesh.metadata = { logged: true };
    }

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
    const launchAngle = ShootingUtils.getLaunchAngle(shootType);

    // ShootingUtilsを使用してシュート精度を計算
    const accuracy3pValue = shooter.playerData?.stats['3paccuracy'] ?? 50;
    const accuracy = ShootingUtils.getAccuracyByShootType(shootType, accuracy3pValue);
    const { x: offsetX, z: offsetZ } = ShootingUtils.generateRandomOffset(accuracy);
    const targetPosition = new Vector3(
      baseTargetPosition.x + offsetX,
      baseTargetPosition.y,
      baseTargetPosition.z + offsetZ
    );

    // リング半径との比較でゴール可能性を計算
    const rimRadius = GOAL_CONFIG.rimDiameter / 2; // 0.225m
    const willScore = ShootingUtils.willScoreByOffset(offsetX, offsetZ, rimRadius);
    const totalOffset = Math.sqrt(offsetX * offsetX + offsetZ * offsetZ);

    console.log(`[ShootingController] シュート精度デバッグ:
      選手: ${shooter.playerData?.basic?.NAME || 'Unknown'}
      3paccuracy: ${accuracy3pValue}
      計算式: 0.05 + 0.75 * (100 - ${accuracy3pValue}) / 100 = ${accuracy.toFixed(3)}m
      オフセット: X=${offsetX.toFixed(3)}m, Z=${offsetZ.toFixed(3)}m
      合計ズレ: ${totalOffset.toFixed(3)}m
      リング半径: ${rimRadius.toFixed(3)}m
      予測: ${willScore ? 'ゴール可能' : 'ゴール外'}`
    );

    // シューターの頭上からボールを発射（相手に取られないように）
    const shooterPos = shooter.getPosition();
    const shooterHeight = shooter.config.physical.height; // キャラクターの身長
    const headPosition = new Vector3(
      shooterPos.x,
      shooterPos.y + shooterHeight * 0.5 + SHOOT_START_OFFSET.HEAD_OFFSET,
      shooterPos.z
    );

    const shootStarted = this.ball.shoot(targetPosition, launchAngle, headPosition);

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

    console.log(`[ShootingController] ${shootType}シュート実行: 距離=${distance.toFixed(2)}m, 目標=(${targetPosition.x.toFixed(2)}, ${targetPosition.y.toFixed(2)}, ${targetPosition.z.toFixed(2)}), ゴール=${this.currentShootGoal}`);

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

    // リムとバックボードの衝突判定（毎フレーム）
    if (this.ball.isInFlight()) {
      this.handleRimCollisions();
      this.handleBackboardCollisions();
    }

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
          console.log(`[ShootingController] ゴール成功！ ${goal.name}にシュート決定！ (距離: ${distanceFromCenter.toFixed(3)}m, リム半径: ${rimRadius.toFixed(3)}m)`);
          this.onGoalScored(goal.name);
          this.checkingGoal = false;
          return;
        }
      }
    }

    this.lastBallY = ballY;

    // ボールが地面に落ちた場合、ゴール判定を終了
    if (!this.ball.isInFlight()) {
      // どのゴールからどれくらいずれていたか確認
      const goals = [
        { z: GOAL_Z_POSITIONS.GOAL_1, name: 'ゴール1' },
        { z: GOAL_Z_POSITIONS.GOAL_2, name: 'ゴール2' },
      ];
      for (const goal of goals) {
        const distanceFromCenter = Math.sqrt(
          ballPosition.x * ballPosition.x +
          (ballPosition.z - goal.z) * (ballPosition.z - goal.z)
        );
        console.log(`[ShootingController] シュート外れ: ${goal.name}からの距離=${distanceFromCenter.toFixed(2)}m (リム半径=${rimRadius.toFixed(2)}m)`);
      }
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

    return {
      position: new Vector3(0, GOAL_CONFIG.rimHeight, goalZ),
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
   * リムとの衝突判定（両ゴール）
   */
  private handleRimCollisions(): void {
    // ゴール1（+Z側）
    this.handleRimCollision(GOAL_Z_POSITIONS.GOAL_1);
    // ゴール2（-Z側）
    this.handleRimCollision(GOAL_Z_POSITIONS.GOAL_2);
  }

  /**
   * 1つのリムとの衝突判定
   */
  private handleRimCollision(rimZ: number): void {
    const ballPosition = this.ball.getPosition();
    const ballVelocity = this.ball.getVelocity();
    const ballRadius = this.ball.getRadius();

    // リムの位置と半径
    const rimPosition = new Vector3(0, GOAL_CONFIG.rimHeight, rimZ);
    const rimRadius = GOAL_CONFIG.rimDiameter / 2;
    const rimThickness = GOAL_CONFIG.rimThickness;

    // ボールがリムの高さ付近にいるかチェック
    const heightDiff = Math.abs(ballPosition.y - rimPosition.y);
    if (heightDiff > ballRadius + rimThickness) {
      return;
    }

    // ボールからリムの中心（XZ平面）への水平距離
    const horizontalDistance = getDistance2D(ballPosition, rimPosition);

    // リムの円周上の最も近い点までの距離
    const distanceFromRimCircle = Math.abs(horizontalDistance - rimRadius);

    // リムとの衝突判定
    if (distanceFromRimCircle <= ballRadius + rimThickness) {
      console.log(`[ShootingController] リムに当たった！`);

      // リムの円周上の最も近い点を計算
      const dx = ballPosition.x - rimPosition.x;
      const dz = ballPosition.z - rimPosition.z;
      const angle = Math.atan2(dz, dx);
      const rimPointX = rimPosition.x + rimRadius * Math.cos(angle);
      const rimPointZ = rimPosition.z + rimRadius * Math.sin(angle);

      // ボールからリム接触点への方向
      const toRimPoint = new Vector3(
        rimPointX - ballPosition.x,
        0,
        rimPointZ - ballPosition.z
      );
      if (toRimPoint.length() > 0.001) {
        toRimPoint.normalize();
      }

      // 速度を反射（水平方向のみ、垂直方向は減衰）
      const horizontalVelocity = new Vector3(ballVelocity.x, 0, ballVelocity.z);
      const velocityAlongNormal = Vector3.Dot(horizontalVelocity, toRimPoint);

      // 反射ベクトルを計算
      const reflection = toRimPoint.scale(velocityAlongNormal * 2);
      const newHorizontalVelocity = horizontalVelocity.subtract(reflection);

      // SHOOT_PHYSICS.RIM_BOUNCE_COEFFICIENTを使用
      const bounciness = SHOOT_PHYSICS.RIM_BOUNCE_COEFFICIENT;

      // 新しい速度（垂直成分も減衰、水平成分は反射）
      const newVelocity = new Vector3(
        newHorizontalVelocity.x * bounciness,
        ballVelocity.y * bounciness,
        newHorizontalVelocity.z * bounciness
      );

      this.ball.setVelocity(newVelocity);

      // ボールをリムから離す
      const separation = toRimPoint.scale(-(ballRadius + rimThickness - distanceFromRimCircle));
      const newPosition = ballPosition.add(separation);
      this.ball.setPosition(newPosition);
    }
  }

  /**
   * バックボードとの衝突判定
   */
  private handleBackboardCollisions(): void {
    const ballPosition = this.ball.getPosition();
    const ballVelocity = this.ball.getVelocity();
    const ballRadius = this.ball.getRadius();

    // 両方のバックボードをチェック
    const backboards = [
      this.field.getGoal1Backboard(),
      this.field.getGoal2Backboard(),
    ];

    for (const backboard of backboards) {
      const backboardPos = backboard.position;
      const backboardWidth = GOAL_CONFIG.backboardWidth;
      const backboardHeight = GOAL_CONFIG.backboardHeight;
      const backboardDepth = GOAL_CONFIG.backboardDepth;

      // ボールがバックボードの範囲内にあるかチェック（ボール半径を考慮）
      const isColliding = isPointInBox(
        ballPosition,
        backboardPos,
        backboardWidth / 2 + ballRadius,
        backboardHeight / 2 + ballRadius,
        backboardDepth / 2 + ballRadius
      );

      if (isColliding) {
        console.log(`[ShootingController] バックボードに当たった！`);

        // SHOOT_PHYSICS.BACKBOARD_BOUNCE_COEFFICIENTを使用
        const bounciness = SHOOT_PHYSICS.BACKBOARD_BOUNCE_COEFFICIENT;

        // Z軸方向の速度を反転（反射）
        const newVelocity = ballVelocity.clone();
        newVelocity.z = -ballVelocity.z * bounciness;
        newVelocity.x *= bounciness;
        newVelocity.y *= bounciness;

        this.ball.setVelocity(newVelocity);

        // ボールをバックボードから離す
        if (ballVelocity.z > 0) {
          // 前から来た場合
          this.ball.setPosition(new Vector3(
            ballPosition.x,
            ballPosition.y,
            backboardPos.z - backboardDepth / 2 - ballRadius
          ));
        } else {
          // 後ろから来た場合
          this.ball.setPosition(new Vector3(
            ballPosition.x,
            ballPosition.y,
            backboardPos.z + backboardDepth / 2 + ballRadius
          ));
        }
        break; // 1フレームで1つのバックボードのみ処理
      }
    }
  }

  /**
   * ゴール成功時のコールバック
   */
  private onGoalScored(goalName: string): void {
    console.log(`[ShootingController] ${goalName}にスコア！`);

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
