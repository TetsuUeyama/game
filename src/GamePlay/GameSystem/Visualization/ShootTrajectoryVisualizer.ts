/**
 * シュート軌道可視化クラス
 * オンボールプレイヤーから攻撃ゴールへのシュート軌道を可視化する
 */

import {
  Scene,
  MeshBuilder,
  StandardMaterial,
  Color3,
  Vector3,
  Mesh,
  LinesMesh,
} from "@babylonjs/core";
import { Character } from "@/GamePlay/Object/Entities/Character";
import { Ball } from "@/GamePlay/Object/Entities/Ball";
import { Field } from "@/GamePlay/Object/Entities/Field";
import {
  ShootType,
  SHOOT_TYPE_CONFIGS,
  SHOOT_TRAJECTORY_CONFIG,
  getSuccessRateColor,
} from "@/GamePlay/GameSystem/ShootingSystem/ShootTrajectoryConfig";
import { ParabolaUtils } from "@/GamePlay/Object/Physics/Trajectory/ParabolaUtils";
import { DeterministicTrajectory } from "@/GamePlay/Object/Physics/Trajectory/DeterministicTrajectory";
import { SHOOT_RANGE, SHOOT_ANGLE } from "@/GamePlay/GameSystem/ShootingSystem/ShootingConfig";
import { normalizeAngle, getDistance2D } from "@/GamePlay/Object/Physics/Spatial/SpatialUtils";
import { PhysicsConstants } from "@/GamePlay/Object/Physics/PhysicsConfig";

/**
 * 可視化されたシュートオプション
 */
interface VisualizedShootOption {
  /** シュートタイプ */
  shootType: ShootType;
  /** 軌道ライン */
  trajectoryLine: LinesMesh;
  /** ターゲットマーカー（リム位置） */
  targetMarker: Mesh;
  /** 成功率表示用マーカー */
  successRateMarker?: Mesh;
}

/**
 * シュート軌道可視化クラス
 */
export class ShootTrajectoryVisualizer {
  private scene: Scene;
  private ball: Ball;
  private field: Field;

  // 可視化オプション
  private isEnabled: boolean = true;

  // 現在の可視化
  private currentVisualizations: VisualizedShootOption[] = [];

  // マテリアルキャッシュ
  private materialCache: Map<string, StandardMaterial> = new Map();

  constructor(
    scene: Scene,
    ball: Ball,
    field: Field,
    _allCharacters: Character[]
  ) {
    this.scene = scene;
    this.ball = ball;
    this.field = field;
  }

  /**
   * 可視化を有効/無効にする
   */
  public setEnabled(enabled: boolean): void {
    this.isEnabled = enabled;
    if (!enabled) {
      this.clearVisualizations();
    }
  }

  /**
   * 可視化が有効かどうか
   */
  public getEnabled(): boolean {
    return this.isEnabled;
  }

  /**
   * キャラクターリストを更新
   * 現在未使用 - 将来のブロック判定向け
   */
  public updateCharacters(_allCharacters: Character[]): void {
    // 将来の実装用
  }

  /**
   * 毎フレーム更新
   */
  public update(): void {
    if (!this.isEnabled) {
      return;
    }

    // 前回の可視化をクリア
    this.clearVisualizations();

    // オンボールプレイヤーを取得
    const holder = this.ball.getHolder();
    if (!holder) {
      return;
    }

    // ボールが飛行中は表示しない
    if (this.ball.isInFlight()) {
      return;
    }

    // 攻撃ゴールを取得
    const targetGoal = this.getTargetGoal(holder);
    if (!targetGoal) {
      return;
    }

    // シューターの位置と向き
    const shooterPos = holder.getPosition();
    const shooterHeight = holder.config.physical.height;
    const shooterRotation = holder.getRotation();

    // シュート開始位置（実際のシュートと同じ：前方0.7mオフセット）
    const forwardOffsetDistance = 0.7;
    const forwardOffsetX = Math.sin(shooterRotation) * forwardOffsetDistance;
    const forwardOffsetZ = Math.cos(shooterRotation) * forwardOffsetDistance;
    const startY = shooterPos.y + shooterHeight * SHOOT_TRAJECTORY_CONFIG.HAND_HEIGHT_RATIO + SHOOT_TRAJECTORY_CONFIG.HEAD_OFFSET;
    const startPosition = new Vector3(
      shooterPos.x + forwardOffsetX,
      startY,
      shooterPos.z + forwardOffsetZ
    );

    // ゴールまでの距離
    const distance = this.getDistanceToGoal(shooterPos, targetGoal.position);

    // ジャンプ状態を確認
    const isJumping = this.isCharacterJumping(holder);

    // シュートタイプを判定
    const shootType = this.getShootType(distance, isJumping);

    // レンジ外の場合は表示しない
    if (shootType === 'out_of_range') {
      return;
    }

    // ゴール方向を向いているかチェック
    if (!this.isFacingGoal(shooterRotation, shooterPos, targetGoal.position, shootType)) {
      return;
    }

    // シュート成功率を計算
    const successRate = this.calculateSuccessRate(holder, shootType, distance);

    // 軌道を可視化（実際のシュートと同じパラメータを使用）
    const visualization = this.createVisualization(
      holder,
      startPosition,
      targetGoal.position,
      shootType,
      successRate,
      distance
    );

    if (visualization) {
      this.currentVisualizations.push(visualization);
    }
  }

  /**
   * 攻撃ゴールを取得
   */
  private getTargetGoal(shooter: Character): { position: Vector3; rimHeight: number } | null {
    // allyチームはgoal1、enemyチームはgoal2を攻撃
    const rimPosition = this.field.getAttackingGoalRim(shooter.team);

    // 実際のシュートと同じターゲット高さ（リム高さ + ボール半径）
    const targetY = SHOOT_TRAJECTORY_CONFIG.RIM_HEIGHT + SHOOT_TRAJECTORY_CONFIG.BALL_RADIUS;

    return {
      position: new Vector3(
        rimPosition.x,
        targetY,
        rimPosition.z
      ),
      rimHeight: SHOOT_TRAJECTORY_CONFIG.RIM_HEIGHT,
    };
  }

  /**
   * ゴールまでの水平距離を計算
   */
  private getDistanceToGoal(shooterPos: Vector3, goalPos: Vector3): number {
    return getDistance2D(shooterPos, goalPos);
  }

  /**
   * キャラクターがジャンプ中かどうかを判定
   */
  private isCharacterJumping(character: Character): boolean {
    const pos = character.getPosition();
    return pos.y > 0.5;
  }

  /**
   * シュートタイプを判定
   */
  private getShootType(distance: number, isJumping: boolean = false): ShootType {
    // ジャンプ中でダンクレンジ内ならダンク
    if (isJumping && distance >= (SHOOT_RANGE as { DUNK_MIN?: number }).DUNK_MIN! && distance <= (SHOOT_RANGE as { DUNK_MAX?: number }).DUNK_MAX!) {
      return 'dunk';
    }
    if (distance >= SHOOT_RANGE.THREE_POINT_LINE && distance <= SHOOT_RANGE.THREE_POINT_MAX) {
      return '3pt';
    } else if (distance >= SHOOT_RANGE.MIDRANGE_MIN && distance < SHOOT_RANGE.THREE_POINT_LINE) {
      return 'midrange';
    } else if (distance >= SHOOT_RANGE.LAYUP_MIN && distance < SHOOT_RANGE.LAYUP_MAX) {
      return 'layup';
    }
    return 'out_of_range';
  }

  /**
   * ゴール方向を向いているかチェック
   */
  private isFacingGoal(
    shooterRotation: number,
    shooterPos: Vector3,
    goalPos: Vector3,
    shootType: ShootType
  ): boolean {
    // ゴール方向のベクトル
    const toGoalX = goalPos.x - shooterPos.x;
    const toGoalZ = goalPos.z - shooterPos.z;
    const toGoalAngle = Math.atan2(toGoalX, toGoalZ);

    // シューターの向き
    const facingAngle = shooterRotation;

    // 角度差（-PI から PI の範囲に正規化）
    const angleDiff = normalizeAngle(toGoalAngle - facingAngle);

    // シュートタイプに応じた許容角度
    let allowedAngle: number;
    switch (shootType) {
      case '3pt':
        allowedAngle = SHOOT_ANGLE.THREE_POINT;
        break;
      case 'midrange':
        allowedAngle = SHOOT_ANGLE.MIDRANGE;
        break;
      case 'layup':
        allowedAngle = SHOOT_ANGLE.LAYUP;
        break;
      case 'dunk':
        allowedAngle = (SHOOT_ANGLE as { DUNK?: number }).DUNK ?? SHOOT_ANGLE.LAYUP;
        break;
      default:
        allowedAngle = SHOOT_ANGLE.DEFAULT;
    }

    return Math.abs(angleDiff) <= allowedAngle;
  }

  /**
   * シュート成功率を計算
   */
  private calculateSuccessRate(
    shooter: Character,
    shootType: Exclude<ShootType, 'out_of_range'>,
    distance: number
  ): number {
    const playerData = shooter.playerData;
    if (!playerData) {
      return 50; // デフォルト
    }

    const stats = playerData.stats;
    let baseAccuracy: number;

    switch (shootType) {
      case '3pt':
        baseAccuracy = stats['3paccuracy'] ?? 50;
        break;
      case 'midrange':
        // shootccuracyをミドルレンジ精度として使用
        baseAccuracy = stats.shootccuracy ?? 50;
        break;
      case 'layup':
        // レイアップは通常のシュート精度を使用（高めに設定）
        baseAccuracy = Math.min(100, (stats.shootccuracy ?? 50) + 20);
        break;
      case 'dunk':
        // ダンクは100%成功（ボールを直接リムに置く）
        return 100;
      default:
        baseAccuracy = 50;
    }

    // 距離による減衰（遠いほど成功率低下）
    const config = SHOOT_TYPE_CONFIGS[shootType];
    const distanceRatio = (distance - config.minDistance) / (config.maxDistance - config.minDistance);
    const distancePenalty = distanceRatio * 10; // 最大10%減
    baseAccuracy = Math.max(0, baseAccuracy - distancePenalty);

    return baseAccuracy;
  }

  /**
   * 単一シュートオプションの可視化を作成
   */
  private createVisualization(
    shooter: Character,
    startPosition: Vector3,
    targetPosition: Vector3,
    shootType: Exclude<ShootType, 'out_of_range'>,
    successRate: number,
    distance: number
  ): VisualizedShootOption | null {
    const config = SHOOT_TYPE_CONFIGS[shootType];
    if (!config) {
      return null;
    }

    // 成功率に応じた色をブレンド
    const baseColor = config.color;
    const successColor = getSuccessRateColor(successRate);
    const blendFactor = 0.4; // 成功率色の影響度

    const finalColor = {
      r: baseColor.r * (1 - blendFactor) + successColor.r * blendFactor,
      g: baseColor.g * (1 - blendFactor) + successColor.g * blendFactor,
      b: baseColor.b * (1 - blendFactor) + successColor.b * blendFactor,
    };

    // 実際のシュートと同じアーチ高さ計算（ステータス調整含む）
    const baseArcHeight = ParabolaUtils.getArcHeight(shootType, distance);

    // ステータスによるアーチ高さ調整（ShootingControllerと同じ計算）
    const statValue = shootType === '3pt'
      ? (shooter.playerData?.stats['3paccuracy'] ?? 42)
      : (shooter.playerData?.stats.shootccuracy ?? 42);
    const arcHeightAdjust = (statValue - 42) / 100;

    // 最小アーチ高さを保証（ShootingControllerと同じ）
    const minArcHeight = shootType === 'layup' ? 0.6 : 0.8;
    const arcHeight = Math.max(minArcHeight, baseArcHeight + arcHeightAdjust);

    // 軌道ポイントを計算（ダンピングを考慮したDeterministicTrajectoryを使用）
    const trajectoryPoints = this.calculateTrajectoryPointsWithDamping(
      startPosition,
      targetPosition,
      arcHeight
    );

    // 軌道ラインを作成
    const trajectoryLine = this.createTrajectoryLine(trajectoryPoints, finalColor);

    // ターゲットマーカーを作成（リム位置に円形）
    const targetMarker = this.createTargetMarker(targetPosition, finalColor);

    return {
      shootType,
      trajectoryLine,
      targetMarker,
    };
  }

  /**
   * 軌道ポイントを計算（ダンピングを考慮）
   * 実際のシュートと同じDeterministicTrajectoryを使用
   */
  private calculateTrajectoryPointsWithDamping(
    startPosition: Vector3,
    targetPosition: Vector3,
    arcHeight: number
  ): Vector3[] {
    // DeterministicTrajectoryを使用（実際のシュートと同じ）
    const trajectory = new DeterministicTrajectory({
      start: { x: startPosition.x, y: startPosition.y, z: startPosition.z },
      target: { x: targetPosition.x, y: targetPosition.y, z: targetPosition.z },
      arcHeight,
      gravity: PhysicsConstants.GRAVITY_MAGNITUDE,
      damping: PhysicsConstants.BALL.LINEAR_DAMPING,
    });

    // 軌道をサンプリング
    const segments = SHOOT_TRAJECTORY_CONFIG.TRAJECTORY_SEGMENTS;
    const trajectoryPoints = trajectory.sample(segments);

    return trajectoryPoints.map(
      (p) => new Vector3(p.position.x, p.position.y, p.position.z)
    );
  }

  /**
   * 軌道ラインを作成
   */
  private createTrajectoryLine(
    points: Vector3[],
    color: { r: number; g: number; b: number }
  ): LinesMesh {
    const line = MeshBuilder.CreateLines(
      `shoot-trajectory-${Date.now()}`,
      { points },
      this.scene
    );

    line.color = new Color3(color.r, color.g, color.b);

    return line;
  }

  /**
   * ターゲットマーカーを作成（リム位置にトーラス形状）
   */
  private createTargetMarker(
    position: Vector3,
    color: { r: number; g: number; b: number }
  ): Mesh {
    // リングを表すトーラス
    const marker = MeshBuilder.CreateTorus(
      `shoot-target-marker-${Date.now()}`,
      {
        diameter: SHOOT_TRAJECTORY_CONFIG.TARGET_MARKER_RADIUS * 2,
        thickness: 0.03,
        tessellation: 16,
      },
      this.scene
    );

    marker.position = position.clone();
    marker.rotation.x = Math.PI / 2; // 水平に

    // マテリアル
    const materialKey = `shoot-target-${color.r.toFixed(2)}-${color.g.toFixed(2)}-${color.b.toFixed(2)}`;
    let material = this.materialCache.get(materialKey);

    if (!material) {
      material = new StandardMaterial(materialKey, this.scene);
      material.diffuseColor = new Color3(color.r, color.g, color.b);
      material.emissiveColor = new Color3(color.r * 0.5, color.g * 0.5, color.b * 0.5);
      material.alpha = SHOOT_TRAJECTORY_CONFIG.TARGET_MARKER_ALPHA;
      this.materialCache.set(materialKey, material);
    }

    marker.material = material;

    return marker;
  }

  /**
   * 全ての可視化をクリア
   */
  public clearVisualizations(): void {
    for (const viz of this.currentVisualizations) {
      viz.trajectoryLine.dispose();
      viz.targetMarker.dispose();
      if (viz.successRateMarker) {
        viz.successRateMarker.dispose();
      }
    }
    this.currentVisualizations = [];
  }

  /**
   * 破棄
   */
  public dispose(): void {
    this.clearVisualizations();

    // マテリアルキャッシュをクリア
    for (const material of this.materialCache.values()) {
      material.dispose();
    }
    this.materialCache.clear();
  }
}
