import {
  Scene,
  MeshBuilder,
  StandardMaterial,
  Color3,
  Vector3,
  Mesh,
  TransformNode,
  VertexBuffer,
} from "@babylonjs/core";

import { loadVoxHeadMesh } from "./VoxHeadMesh";
import { OverlayRenderer } from "./OverlayRenderer";
import { ActionGaugeRenderer } from "./ActionGaugeRenderer";
import { ArmRenderer } from "./ArmRenderer";
import { LegRenderer } from "./LegRenderer";

import {
  ENTITY_HEIGHT,
  OBSTACLE_SIZE,
} from "../Config/FieldConfig";
import {
  NECK_VISUAL_LERP_SPEED,
  TORSO_VISUAL_LERP_SPEED,
} from "../Config/BodyDynamicsConfig";

/** 全エンティティの描画サイズを障害物サイズに統一 */
const VISUAL_SIZE = OBSTACLE_SIZE;

/** 上半身八角形の斜め頂点を内側に寄せる割合 (0=正八角形, 1=菱形) */
const DIAGONAL_SHRINK = 0.15;
import { TARGET_COLORS_3D, INIT_TARGETS } from "../Config/EntityConfig";
import { OBSTACLE_COUNT } from "../Decision/ObstacleRoleAssignment";
import type { SimMover } from "../Types/TrackingSimTypes";

// Re-export for backward compatibility
export { ARM_BODY_RADIUS, ARM_LENGTH, SHOULDER_Y, HAND_DIAMETER } from "./ArmRenderer";
export type { ArmLerpState } from "./ArmRenderer";

export interface OverlayVisibility {
  global: boolean;       // 一括トグル
  entities: boolean[];   // 10要素: 個別エンティティ
  actionGauge: boolean;  // アクションゲージ独立トグル
}

export interface SimVisState {
  allPlayers: SimMover[];         // 10要素: 固定順 (0-4=TeamA, 5-9=TeamB)
  offenseBase: number;            // オフェンス側の allPlayers 開始インデックス (0 or 5)
  defenseBase: number;            // ディフェンス側の allPlayers 開始インデックス (5 or 0)
  obstacles: SimMover[];
  obMems: import("../Types/TrackingSimTypes").SimScanMemory[];
  obFocusDists: number[];
  preFire: import("../Types/TrackingSimTypes").SimPreFireInfo | null;
  ballActive: boolean;
  interceptPt: { x: number; z: number } | null;
  ballTrailPositions: Vector3[];
  actionStates: import("../Types/TrackingSimTypes").ActionState[];
  ballPosition: Vector3 | null;
  ballHeldPosition: Vector3 | null;
  ballMarkerLeftArmTarget: Vector3 | null;
  ballMarkerRightArmTarget: Vector3 | null;
  ballMarkerEntityIdx: number | null;
  pushObstructions: import("../Types/TrackingSimTypes").PushObstructionInfo[];
  onBallAbsIdx: number;           // ボール保持者の allPlayers 絶対インデックス
  dt: number;
  dribbleBounceH: number;
}

export class SimVisualization {
  private scene: Scene;
  private overlay: OverlayRenderer;
  private gaugeRenderer: ActionGaugeRenderer;
  private armRenderer: ArmRenderer;
  private legRenderer: LegRenderer;
  private visibility: OverlayVisibility = {
    global: false,
    entities: Array(10).fill(true) as boolean[],
    actionGauge: true,
  };

  // Meshes
  launcherMesh!: Mesh;
  targetMeshes: Mesh[] = [];
  obstacleMeshes: Mesh[] = [];
  private facingIndicators: Mesh[] = [];
  private upperBodyPivots: TransformNode[] = [];
  private upperBodyCylinders: Mesh[] = [];
  private pendingHeadScales: number[] = [];
  private torsoVisualAngles: number[] = [];
  private neckVisualAngles: number[] = [];

  constructor(scene: Scene) {
    this.scene = scene;
    this.overlay = new OverlayRenderer(scene);
    this.gaugeRenderer = new ActionGaugeRenderer(scene);
    this.armRenderer = new ArmRenderer(scene);
    this.legRenderer = new LegRenderer(scene);
  }

  setGlobalOverlayVisible(visible: boolean): void {
    this.visibility.global = visible;
  }

  setEntityOverlayVisible(entityIdx: number, visible: boolean): void {
    if (entityIdx >= 0 && entityIdx < this.visibility.entities.length) {
      this.visibility.entities[entityIdx] = visible;
    }
  }

  setActionGaugeVisible(visible: boolean): void {
    this.visibility.actionGauge = visible;
  }

  getVisibility(): OverlayVisibility {
    return this.visibility;
  }

  /**
   * 上下2段の8角柱エンティティを作成する。
   * 上段はチームカラー、下段はベースカラーのやや暗めになる。
   * 返すのは親 TransformNode 的な空 Mesh（位置更新用）。
   *
   * @param upperColor 上半身のチームカラー（省略時は color と同じ）
   */
  private createOctEntity(
    name: string, size: number, color: Color3, upperColor?: Color3,
  ): {
    root: Mesh; pivot: TransformNode; upper: Mesh;
    hipBox: Mesh; leftHipJoint: TransformNode; rightHipJoint: TransformNode;
    leftLeg: Mesh; rightLeg: Mesh; leftFoot: Mesh; rightFoot: Mesh;
  } {
    const halfH = ENTITY_HEIGHT / 2;
    const radius = size / 2;
    const uc = upperColor ?? color;

    // 上段（チームカラー）
    const upper = MeshBuilder.CreateCylinder(`${name}_upper`, {
      height: halfH, diameter: radius * 2, tessellation: 8,
    }, this.scene);
    upper.position.y = halfH / 2;

    // 斜め頂点(45°,135°,225°,315°)だけ内側に寄せる
    const positions = upper.getVerticesData(VertexBuffer.PositionKind);
    if (positions) {
      for (let vi = 0; vi < positions.length; vi += 3) {
        const vx = positions[vi];
        const vz = positions[vi + 2];
        if (vx * vx + vz * vz < 0.0001) continue; // cap center skip
        const angle = Math.atan2(vz, vx);
        const diag = Math.abs(Math.sin(2 * angle)); // 0=正面/横, 1=斜め
        const s = 1 - diag * DIAGONAL_SHRINK;
        positions[vi] = vx * s;
        positions[vi + 2] = vz * s;
      }
      upper.setVerticesData(VertexBuffer.PositionKind, positions);
    }

    const upperMat = new StandardMaterial(`${name}_upperMat`, this.scene);
    upperMat.diffuseColor = uc;
    upperMat.specularColor = Color3.Black();
    upper.material = upperMat;

    // 脚メッシュ生成を LegRenderer に委譲
    const legs = this.legRenderer.createLegs(name, size, color);

    // 親メッシュ（位置制御用の空ノード）
    const root = new Mesh(name, this.scene);
    legs.hipBox.parent = root;
    legs.leftHipJoint.parent = root;
    legs.rightHipJoint.parent = root;

    // 上半身ピボット（torso回転用）— root の子、upper はピボットの子
    const pivot = new TransformNode(`${name}_upperBodyPivot`, this.scene);
    pivot.parent = root;
    upper.parent = pivot;

    this.upperBodyPivots.push(pivot);
    this.upperBodyCylinders.push(upper);

    return {
      root, pivot, upper,
      hipBox: legs.hipBox,
      leftHipJoint: legs.leftHipJoint, rightHipJoint: legs.rightHipJoint,
      leftLeg: legs.leftLeg, rightLeg: legs.rightLeg,
      leftFoot: legs.leftFoot, rightFoot: legs.rightFoot,
    };
  }

  createMeshes(): void {
    // チーム固定カラー（攻守に関係なく常に同じ色）
    const teamAColor = new Color3(0.2, 0.4, 0.9);      // 青
    const teamABaseColor = new Color3(0.15, 0.3, 0.7);  // 青（やや暗め）
    const teamBColor = new Color3(0.9, 0.25, 0.25);     // 赤
    const teamBBaseColor = new Color3(0.7, 0.2, 0.2);   // 赤（やや暗め）

    // Team A [0]: launcher
    const launcherEnt = this.createOctEntity("simLauncher", VISUAL_SIZE, teamABaseColor, teamAColor);
    this.launcherMesh = launcherEnt.root;
    this.armRenderer.createArms(launcherEnt.root, launcherEnt.pivot, teamABaseColor, teamAColor);
    this.legRenderer.storeLegSet(launcherEnt);

    // Team A [1-4]: targets
    for (let i = 0; i < TARGET_COLORS_3D.length; i++) {
      const ent = this.createOctEntity(`simTarget${i}`, VISUAL_SIZE, teamABaseColor, teamAColor);
      this.armRenderer.createArms(ent.root, ent.pivot, teamABaseColor, teamAColor);
      this.targetMeshes.push(ent.root);
      this.legRenderer.storeLegSet(ent);
    }

    // Team B [5-9]: obstacles
    for (let i = 0; i < OBSTACLE_COUNT; i++) {
      const ent = this.createOctEntity(`simOb${i}`, VISUAL_SIZE, teamBBaseColor, teamBColor);
      this.armRenderer.createArms(ent.root, ent.pivot, teamBBaseColor, teamBColor);
      this.obstacleMeshes.push(ent.root);
      this.legRenderer.storeLegSet(ent);
    }

    // FOV lines (delegated to overlay)
    this.overlay.createFovLines();

    // Facing indicators (vox head on top of each entity) — fire-and-forget async
    this.loadAndAttachHeads();

    // Torso + Neck visual angles for smooth interpolation
    const totalEntities = 1 + INIT_TARGETS.length + OBSTACLE_COUNT;
    this.torsoVisualAngles = new Array(totalEntities).fill(0);
    this.neckVisualAngles = new Array(totalEntities).fill(0);

    // Action gauges
    this.gaugeRenderer.create(totalEntities);
  }

  /**
   * 身長スケールに基づいてサブメッシュの逆スケールを適用。
   * ルートは setAll(scale) で均一拡大されるが、太さは元サイズに保つ。
   * シリンダー類: (1/s, 1, 1/s) → 直径そのまま、長さスケール
   * 球体/頭: setAll(1/s) → 元サイズ維持
   */
  applyHeightScales(scales: number[]): void {
    // 頭メッシュは非同期ロードのため保存しておく
    this.pendingHeadScales = [...scales];

    for (let i = 0; i < scales.length; i++) {
      const s = scales[i];
      if (Math.abs(s - 1) < 0.001) continue;
      const inv = 1 / s;

      // 上半身シリンダー: 直径そのまま、高さスケール
      if (i < this.upperBodyCylinders.length) {
        this.upperBodyCylinders[i].scaling.set(inv, 1, inv);
      }

      // 頭: 元サイズ維持（既にロード済みの場合）
      if (i < this.facingIndicators.length) {
        this.facingIndicators[i].scaling.setAll(inv);
      }
    }

    // 脚・腕の逆スケール
    this.legRenderer.applyHeightScales(scales);
    this.armRenderer.applyHeightScales(scales);
  }

  disposeMeshes(): void {
    this.launcherMesh?.dispose();
    this.targetMeshes.forEach(m => m.dispose());
    this.targetMeshes = [];
    this.obstacleMeshes.forEach(m => m.dispose());
    this.obstacleMeshes = [];
    this.overlay.dispose();
    for (const ind of this.facingIndicators) {
      ind.material?.dispose();
      ind.dispose();
    }
    this.facingIndicators = [];
    this.armRenderer.dispose();
    this.legRenderer.dispose();
    for (const pivot of this.upperBodyPivots) {
      pivot.dispose();
    }
    this.upperBodyPivots = [];
    this.upperBodyCylinders = [];
    this.pendingHeadScales = [];
    this.torsoVisualAngles = [];
    this.neckVisualAngles = [];
    this.gaugeRenderer.dispose();
  }

  syncAll(state: SimVisState): void {
    if (this.visibility.global) {
      const obstacleVisible = this.visibility.entities.slice(5, 10);
      this.overlay.syncFov(state, obstacleVisible);
      this.overlay.syncReach(state, obstacleVisible);
      this.overlay.syncTrajectory(state);
      this.overlay.syncBallTrail(state);
      this.overlay.syncInterceptMarker(state);
    } else {
      this.overlay.syncFov(state, [false, false, false, false, false]);
      this.overlay.syncReach(state, [false, false, false, false, false]);
      this.overlay.disposeTrajectory();
      this.overlay.disposeBallTrail();
      this.overlay.disposeInterceptMarker();
    }

    // アクションゲージは独立トグル
    if (this.visibility.actionGauge) {
      this.gaugeRenderer.sync(state, this.visibility.entities);
    } else {
      this.gaugeRenderer.sync(state, Array(10).fill(false) as boolean[]);
    }
    this.syncTorsoRotation(state);
    this.syncNeckRotation(state);

    // allPlayers は固定順 (0-9) でメッシュ作成順と一致
    this.legRenderer.syncLegs(state.allPlayers, state.dt, state.onBallAbsIdx, state.ballActive);
    this.armRenderer.syncArms(
      state.allPlayers,
      this.upperBodyPivots,
      this.torsoVisualAngles,
      state.ballPosition,
      state.ballActive,
      state.ballHeldPosition,
      state.ballMarkerEntityIdx,
      state.ballMarkerLeftArmTarget,
      state.ballMarkerRightArmTarget,
      state.onBallAbsIdx,
      state.defenseBase,
      state.pushObstructions,
      state.dt,
      state.dribbleBounceH,
      state.actionStates,
    );
  }

  /**
   * 全エンティティの左右手のワールド座標を返す。
   */
  getHandWorldPositions(allPlayers: SimMover[]): { left: Vector3; right: Vector3 }[] {
    return this.armRenderer.getHandWorldPositions(allPlayers);
  }

  /**
   * 現在のドリブルハンド（左/右）を返す。
   */
  getDribbleHand(): 'left' | 'right' {
    return this.armRenderer.dribbleHand;
  }

  /**
   * 全エンティティの上半身ピボットに torso 回転を適用（スムーズ補間付き）。
   */
  private syncTorsoRotation(state: SimVisState): void {
    const alpha = 1 - Math.exp(-TORSO_VISUAL_LERP_SPEED * state.dt);

    for (let i = 0; i < state.allPlayers.length; i++) {
      if (i >= this.upperBodyPivots.length) continue;
      if (i >= this.torsoVisualAngles.length) continue;
      const pivot = this.upperBodyPivots[i];
      const mover = state.allPlayers[i];
      const target = mover.facing - mover.torsoFacing;
      this.torsoVisualAngles[i] += (target - this.torsoVisualAngles[i]) * alpha;
      pivot.rotation.y = this.torsoVisualAngles[i];
    }
  }

  /**
   * 全エンティティの頭メッシュに首の相対回転を適用（スムーズ補間付き）。
   */
  private syncNeckRotation(state: SimVisState): void {
    const alpha = 1 - Math.exp(-NECK_VISUAL_LERP_SPEED * state.dt);

    for (let i = 0; i < state.allPlayers.length; i++) {
      if (i >= this.facingIndicators.length) continue;
      if (i >= this.neckVisualAngles.length) continue;
      const head = this.facingIndicators[i];
      const mover = state.allPlayers[i];
      const target = mover.torsoFacing - mover.neckFacing;
      this.neckVisualAngles[i] += (target - this.neckVisualAngles[i]) * alpha;
      head.rotation.y = this.neckVisualAngles[i];
    }
  }

  // =========================================================================
  // Facing indicator (VOX head on top of each entity)
  // =========================================================================

  /** VOXヘッドモデルを読み込み、全エンティティにクローンしてアタッチ */
  private async loadAndAttachHeads(): Promise<void> {
    try {
      const result = await loadVoxHeadMesh(this.scene, "/box/head.vox");
      result.mesh.setEnabled(false);

      this.overlay.headFaceForwardOffset = result.faceForwardOffset;
      this.overlay.headFaceCenterY = ENTITY_HEIGHT / 2 + result.faceCenterHeight;

      const mat = new StandardMaterial("voxHeadMat", this.scene);
      mat.emissiveColor = Color3.White();
      mat.disableLighting = true;
      mat.backFaceCulling = false;

      for (let i = 0; i < this.upperBodyPivots.length; i++) {
        const clone = result.mesh.clone(`facingHead_${i}`);
        clone.material = mat;
        clone.parent = this.upperBodyPivots[i];
        clone.position.y = ENTITY_HEIGHT / 2;
        clone.setEnabled(true);
        // 身長スケールの逆補正（頭サイズ維持）
        if (i < this.pendingHeadScales.length) {
          const s = this.pendingHeadScales[i];
          if (Math.abs(s - 1) > 0.001) {
            clone.scaling.setAll(1 / s);
          }
        }
        this.facingIndicators.push(clone);
      }

      result.mesh.dispose();
    } catch (e) {
      console.error("[SimVisualization] Failed to load VOX head:", e);
    }
  }
}
