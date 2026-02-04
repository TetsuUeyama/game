/**
 * パス軌道可視化クラス
 * オンボールプレイヤーから全オフボールチームメイトへのパス軌道を可視化する
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
import { Character } from "../entities/Character";
import { Ball } from "../entities/Ball";
import {
  PassType,
  DESTINATION_PREDICTION_THRESHOLD,
  isPassDirectionValid,
  InterceptionRiskLevel,
} from "../config/PassTrajectoryConfig";
import {
  PassTrajectoryCalculator,
  Vec3,
  ValidPassOption,
} from "../physics/PassTrajectoryCalculator";
import {
  InterceptionAnalyzer,
  TrajectoryRiskAnalysis,
} from "../ai/analysis/InterceptionAnalyzer";
import { getTeammates } from "../utils/TeamUtils";

/**
 * 可視化されたパスオプション
 */
interface VisualizedPassOption {
  /** ターゲットキャラクター */
  target: Character;
  /** パスタイプ */
  passType: PassType;
  /** 軌道ライン */
  trajectoryLine: LinesMesh;
  /** ターゲットマーカー */
  targetMarker: Mesh;
  /** バウンスポイントマーカー（バウンスパス用） */
  bounceMarker?: Mesh;
  /** リスク分析結果 */
  riskAnalysis: TrajectoryRiskAnalysis;
}

/**
 * パス軌道可視化クラス
 */
export class PassTrajectoryVisualizer {
  private scene: Scene;
  private ball: Ball;
  private allCharacters: Character[];

  private trajectoryCalculator: PassTrajectoryCalculator;
  private interceptionAnalyzer: InterceptionAnalyzer;

  // 可視化オプション
  private isEnabled: boolean = true;
  private useDestinationPrediction: boolean = true;

  // 現在の可視化
  private currentVisualizations: VisualizedPassOption[] = [];

  // マテリアルキャッシュ
  private materialCache: Map<string, StandardMaterial> = new Map();

  constructor(
    scene: Scene,
    ball: Ball,
    allCharacters: Character[]
  ) {
    this.scene = scene;
    this.ball = ball;
    this.allCharacters = allCharacters;

    this.trajectoryCalculator = new PassTrajectoryCalculator();
    this.interceptionAnalyzer = new InterceptionAnalyzer();
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
   * 移動先予測のON/OFFを設定
   */
  public setUseDestinationPrediction(use: boolean): void {
    this.useDestinationPrediction = use;
  }

  /**
   * 移動先予測が有効かどうか
   */
  public getUseDestinationPrediction(): boolean {
    return this.useDestinationPrediction;
  }

  /**
   * 毎フレーム更新
   * @param getOffBallAITargetPosition オフボールAIの目標位置を取得するコールバック
   */
  public update(
    getOffBallAITargetPosition?: (character: Character) => { x: number; z: number } | null
  ): void {
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

    // オンボールプレイヤーのpassaccuracyを取得
    const passAccuracy = holder.playerData?.stats?.passaccuracy ?? 50;
    const canUsePrediction = this.useDestinationPrediction &&
      passAccuracy >= DESTINATION_PREDICTION_THRESHOLD.MIN_PASSACCURACY;

    // 同チームのオフボールプレイヤーを取得
    const teammates = getTeammates(this.allCharacters, holder);

    // パサーの位置（キャラクターのposition.yはheight/2、胸の高さはheight*0.65なのでオフセットはheight*0.15）
    const passerPos = holder.getPosition();
    const passerHeight = holder.config.physical.height;
    const passerVec: Vec3 = { x: passerPos.x, y: passerPos.y + passerHeight * 0.15, z: passerPos.z }; // 胸の高さ

    // 各チームメイトへのパス軌道を計算・可視化
    for (const teammate of teammates) {
      // チームメイトの身長から胸の高さオフセットを計算
      const teammateHeight = teammate.config.physical.height;
      const chestOffset = teammateHeight * 0.15;

      // ターゲット位置を決定
      let targetPosition: Vector3;

      if (canUsePrediction && getOffBallAITargetPosition) {
        // 移動先予測を使用
        const predictedPos = getOffBallAITargetPosition(teammate);
        if (predictedPos) {
          targetPosition = new Vector3(
            predictedPos.x,
            teammate.getPosition().y + chestOffset, // 胸の高さ
            predictedPos.z
          );
        } else {
          // 予測位置がない場合は現在位置
          const currentPos = teammate.getPosition();
          targetPosition = new Vector3(currentPos.x, currentPos.y + chestOffset, currentPos.z);
        }
      } else {
        // 現在位置を使用
        const currentPos = teammate.getPosition();
        targetPosition = new Vector3(currentPos.x, currentPos.y + chestOffset, currentPos.z);
      }

      const targetVec: Vec3 = { x: targetPosition.x, y: targetPosition.y, z: targetPosition.z };

      // パス方向チェック（後ろ斜め・真後ろは不可）
      // ただし、スローインスロワーの場合は方向チェックをスキップ（投げる前に向きを変えるため）
      const isThrowInThrower = holder.getIsThrowInThrower();
      if (!isThrowInThrower) {
        const passerRotation = holder.getRotation();
        if (!isPassDirectionValid(
          passerRotation,
          passerPos.x,
          passerPos.z,
          targetPosition.x,
          targetPosition.z
        )) {
          // パス不可能な方向なのでスキップ
          continue;
        }
      }

      // 利き腕チェック（簡易的に常にtrue）
      const hasDominantHand = true;

      // 全有効パスタイプを計算
      const validOptions = this.trajectoryCalculator.calculateAllPassTypes(
        passerVec,
        targetVec,
        hasDominantHand,
        20 // セグメント数
      );

      // 各パスオプションを可視化
      for (const option of validOptions) {
        // インターセプトリスクを分析
        const riskAnalysis = this.interceptionAnalyzer.analyzeTrajectoryRisk(
          option.trajectory,
          this.allCharacters,
          holder.team
        );

        // 危険度が高い（DANGER以上: 60%+）パスは表示しない
        if (riskAnalysis.overallRiskLevel === InterceptionRiskLevel.DANGER ||
            riskAnalysis.overallRiskLevel === InterceptionRiskLevel.HIGH_DANGER) {
          continue;
        }

        // 可視化を作成
        const visualization = this.createVisualization(
          teammate,
          option,
          riskAnalysis,
          targetPosition
        );

        if (visualization) {
          this.currentVisualizations.push(visualization);
        }
      }
    }
  }

  /**
   * 単一パスオプションの可視化を作成
   */
  private createVisualization(
    target: Character,
    option: ValidPassOption,
    riskAnalysis: TrajectoryRiskAnalysis,
    targetPosition: Vector3
  ): VisualizedPassOption | null {
    const { trajectory, config, passType } = option;

    // 軌道の色（リスクに応じて変化）
    const baseColor = config.color;
    const riskColor = riskAnalysis.overallRiskColor;

    // リスクが高い場合は色をブレンド
    const riskProbability = riskAnalysis.maxRisk?.probability ?? 0;
    const blendFactor = Math.min(1, riskProbability);
    const finalColor = {
      r: baseColor.r * (1 - blendFactor) + riskColor.r * blendFactor,
      g: baseColor.g * (1 - blendFactor) + riskColor.g * blendFactor,
      b: baseColor.b * (1 - blendFactor) + riskColor.b * blendFactor,
    };

    // 軌道ラインを作成
    const trajectoryLine = this.createTrajectoryLine(trajectory.points, finalColor);

    // ターゲットマーカーを作成
    const targetMarker = this.createTargetMarker(targetPosition, finalColor);

    // バウンスポイントマーカー（バウンスパスの場合）
    let bounceMarker: Mesh | undefined;
    if (passType === PassType.BOUNCE && trajectory.bouncePoint) {
      bounceMarker = this.createBouncePointMarker(trajectory.bouncePoint);
    }

    return {
      target,
      passType,
      trajectoryLine,
      targetMarker,
      bounceMarker,
      riskAnalysis,
    };
  }

  /**
   * 軌道ラインを作成
   */
  private createTrajectoryLine(
    points: Array<{ position: Vec3 }>,
    color: { r: number; g: number; b: number }
  ): LinesMesh {
    const linePoints = points.map(p => new Vector3(p.position.x, p.position.y, p.position.z));

    const line = MeshBuilder.CreateLines(
      `pass-trajectory-${Date.now()}`,
      { points: linePoints },
      this.scene
    );

    line.color = new Color3(color.r, color.g, color.b);

    return line;
  }

  /**
   * ターゲットマーカーを作成
   */
  private createTargetMarker(
    position: Vector3,
    color: { r: number; g: number; b: number }
  ): Mesh {
    // ディスク形状のマーカー
    const marker = MeshBuilder.CreateDisc(
      `pass-target-marker-${Date.now()}`,
      { radius: 0.3, tessellation: 16 },
      this.scene
    );

    marker.position = new Vector3(position.x, 0.1, position.z);
    marker.rotation.x = Math.PI / 2; // 地面に平行

    // マテリアル
    const materialKey = `target-${color.r.toFixed(2)}-${color.g.toFixed(2)}-${color.b.toFixed(2)}`;
    let material = this.materialCache.get(materialKey);

    if (!material) {
      material = new StandardMaterial(materialKey, this.scene);
      material.diffuseColor = new Color3(color.r, color.g, color.b);
      material.emissiveColor = new Color3(color.r * 0.5, color.g * 0.5, color.b * 0.5);
      material.alpha = 0.7;
      this.materialCache.set(materialKey, material);
    }

    marker.material = material;

    return marker;
  }

  /**
   * バウンスポイントマーカーを作成
   */
  private createBouncePointMarker(bouncePoint: Vec3): Mesh {
    // 小さな球体マーカー
    const marker = MeshBuilder.CreateSphere(
      `bounce-point-marker-${Date.now()}`,
      { diameter: 0.15 },
      this.scene
    );

    marker.position = new Vector3(bouncePoint.x, bouncePoint.y, bouncePoint.z);

    // シアン色（バウンスパスの色）
    const materialKey = 'bounce-point';
    let material = this.materialCache.get(materialKey);

    if (!material) {
      material = new StandardMaterial(materialKey, this.scene);
      material.diffuseColor = new Color3(0, 1, 1);
      material.emissiveColor = new Color3(0, 0.5, 0.5);
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
      if (viz.bounceMarker) {
        viz.bounceMarker.dispose();
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
