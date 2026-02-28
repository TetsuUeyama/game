import {
  Scene,
  MeshBuilder,
  StandardMaterial,
  Color3,
  Vector3,
  Quaternion,
  Mesh,
  TransformNode,
} from "@babylonjs/core";

import { loadVoxHeadMesh } from "./VoxHeadMesh";
import { OverlayRenderer } from "./OverlayRenderer";
import { ActionGaugeRenderer } from "./ActionGaugeRenderer";

import {
  ENTITY_HEIGHT,
  OBSTACLE_SIZE,
} from "../Config/FieldConfig";
import {
  ARM_LERP_SPEED,
  NECK_VISUAL_LERP_SPEED,
  NECK_MAX_ANGLE,
  TORSO_VISUAL_LERP_SPEED,
} from "../Config/BodyDynamicsConfig";

/** 全エンティティの描画サイズを障害物サイズに統一 */
const VISUAL_SIZE = OBSTACLE_SIZE;
import { TARGET_COLORS_3D, INIT_TARGETS } from "../Config/EntityConfig";
import { OBSTACLE_COUNT } from "../Decision/ObstacleRoleAssignment";
import type { SimMover, SimScanMemory, SimPreFireInfo, ActionState, PushObstructionInfo } from "../Types/TrackingSimTypes";
import { normAngleDiff } from "../Movement/MovementCore";

export interface OverlayVisibility {
  global: boolean;       // 一括トグル
  entities: boolean[];   // 10要素: 個別エンティティ
}

export interface SimVisState {
  launcher: SimMover;
  targets: SimMover[];
  obstacles: SimMover[];
  obMems: SimScanMemory[];
  obFocusDists: number[];
  preFire: SimPreFireInfo | null;
  ballActive: boolean;
  interceptPt: { x: number; z: number } | null;
  ballTrailPositions: Vector3[];
  actionStates: ActionState[];
  ballPosition: Vector3 | null;
  ballHeldPosition: Vector3 | null;
  ballMarkerLeftArmTarget: Vector3 | null;
  ballMarkerRightArmTarget: Vector3 | null;
  ballMarkerEntityIdx: number | null;
  pushObstructions: PushObstructionInfo[];
  onBallEntityIdx: number;
  dt: number;
}

// --- Arm constants (shared by all entities) ---
export const ARM_BODY_RADIUS = VISUAL_SIZE / 2;
export const ARM_LENGTH = VISUAL_SIZE * 1.1;
const ARM_DIAMETER = VISUAL_SIZE * 0.24;
const HAND_DIAMETER = VISUAL_SIZE * 0.26;
const UPPER_ARM_LENGTH = ARM_LENGTH * 0.5;
const FOREARM_LENGTH = ARM_LENGTH * 0.5;
const ELBOW_DIAMETER = VISUAL_SIZE * 0.18;
/** 腕前面ストライプの幅（腕直径に対する比率） */
const ARM_STRIPE_WIDTH_RATIO = 0.25;
/** 肌色 */
const SKIN_COLOR = new Color3(0.96, 0.80, 0.64);
const MIN_BEND_ANGLE = 5 * Math.PI / 180;
/** 前腕の最大曲げ角度: 伸展(0°)から内側に90°まで */
const MAX_FOREARM_BEND_ANGLE = 90 * Math.PI / 180;
/** 上腕の後方可動域制限: 真上(+Y)から後方(-Z)へ最大10° */
const UPPER_ARM_MAX_BACK_ANGLE = 10 * Math.PI / 180;
export const SHOULDER_Y = ENTITY_HEIGHT * 0.35;
const DEFAULT_ARM_ANGLE = (60 * Math.PI) / 180;
/** ボールがこの距離以内なら両手をボール方向へ向ける */
const BALL_REACT_RADIUS = 2.0;

/** デフォルト腕方向ベクトル（ローカル座標: 60度下向き前方） */
const DEF_ARM_DIR = new Vector3(0, -Math.sin(DEFAULT_ARM_ANGLE), Math.cos(DEFAULT_ARM_ANGLE)).normalize();

/** ドリブル姿勢の腕方向ベクトル（水平やや下: 約15度下向き前方） */
const DRIBBLE_ARM_ANGLE = (15 * Math.PI) / 180;
const DRIBBLE_ARM_DIR = new Vector3(0, -Math.sin(DRIBBLE_ARM_ANGLE), Math.cos(DRIBBLE_ARM_ANGLE)).normalize();

/** 腕ポーズ補間用: 肩→手方向ベクトル（ローカル座標、正規化済み） */
export interface ArmLerpState {
  leftDir: Vector3;   // 現在の左腕方向
  rightDir: Vector3;  // 現在の右腕方向
  leftElbowHint: Vector3;   // 左肘の曲がり方向（ローカル座標）
  rightElbowHint: Vector3;  // 右肘の曲がり方向（ローカル座標）
}

/** デフォルト肘ヒント: 外側+やや下 */
const DEF_LEFT_ELBOW_HINT = new Vector3(-1, -0.3, 0).normalize();
const DEF_RIGHT_ELBOW_HINT = new Vector3(1, -0.3, 0).normalize();

interface EntityArmSet {
  parent: Mesh;
  pivot: TransformNode;
  leftUpperArm: Mesh; leftElbow: Mesh; leftForearm: Mesh; leftHand: Mesh;
  rightUpperArm: Mesh; rightElbow: Mesh; rightForearm: Mesh; rightHand: Mesh;
}

export class SimVisualization {
  private scene: Scene;
  private overlay: OverlayRenderer;
  private gaugeRenderer: ActionGaugeRenderer;
  private visibility: OverlayVisibility = {
    global: true,
    entities: Array(10).fill(true) as boolean[],
  };

  // Meshes
  launcherMesh!: Mesh;
  targetMeshes: Mesh[] = [];
  obstacleMeshes: Mesh[] = [];
  private facingIndicators: Mesh[] = [];
  private entityArmSets: EntityArmSet[] = [];
  private armLerpStates: ArmLerpState[] = [];
  private upperBodyPivots: TransformNode[] = [];
  private torsoVisualAngles: number[] = [];
  private neckVisualAngles: number[] = [];

  constructor(scene: Scene) {
    this.scene = scene;
    this.overlay = new OverlayRenderer(scene);
    this.gaugeRenderer = new ActionGaugeRenderer(scene);
  }

  setGlobalOverlayVisible(visible: boolean): void {
    this.visibility.global = visible;
  }

  setEntityOverlayVisible(entityIdx: number, visible: boolean): void {
    if (entityIdx >= 0 && entityIdx < this.visibility.entities.length) {
      this.visibility.entities[entityIdx] = visible;
    }
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
  ): { root: Mesh; pivot: TransformNode } {
    const halfH = ENTITY_HEIGHT / 2;
    // 8角柱の外接円半径: size/2 は辺間の幅に近い値なのでそのまま使う
    const radius = size / 2;
    const uc = upperColor ?? color;

    // 上段（チームカラー）
    const upper = MeshBuilder.CreateCylinder(`${name}_upper`, {
      height: halfH, diameter: radius * 2, tessellation: 8,
    }, this.scene);
    upper.position.y = halfH / 2; // 中心が halfH/2
    const upperMat = new StandardMaterial(`${name}_upperMat`, this.scene);
    upperMat.diffuseColor = uc;
    upperMat.specularColor = Color3.Black();
    upper.material = upperMat;

    // 下段（ベースカラーの暗め）
    const lower = MeshBuilder.CreateCylinder(`${name}_lower`, {
      height: halfH, diameter: radius * 2, tessellation: 8,
    }, this.scene);
    lower.position.y = -halfH / 2; // 中心が -halfH/2
    const lowerMat = new StandardMaterial(`${name}_lowerMat`, this.scene);
    lowerMat.diffuseColor = new Color3(color.r * 0.55, color.g * 0.55, color.b * 0.55);
    lowerMat.specularColor = Color3.Black();
    lower.material = lowerMat;

    // 前斜め左右の小さな突起（つま先/膝のイメージ）
    const stubSize = size * 0.15;
    const stubY = -halfH * 0.4;           // 下半身やや上寄り
    const stubForward = radius * 0.85;    // 前方オフセット
    const stubSide = radius * 0.45;       // 左右オフセット
    const stubColor = new Color3(color.r * 0.45, color.g * 0.45, color.b * 0.45);

    for (const sx of [-1, 1]) {
      const stub = MeshBuilder.CreateBox(`${name}_stub${sx}`, {
        width: stubSize, height: stubSize, depth: stubSize,
      }, this.scene);
      stub.position.set(sx * stubSide, stubY, stubForward);
      const stubMat = new StandardMaterial(`${name}_stubMat${sx}`, this.scene);
      stubMat.diffuseColor = stubColor;
      stubMat.specularColor = Color3.Black();
      stub.material = stubMat;
      stub.isPickable = false;
      stub.parent = lower;
    }

    // 親メッシュ（位置制御用の空ノード）
    const root = new Mesh(name, this.scene);
    lower.parent = root;

    // 上半身ピボット（torso回転用）— root の子、upper はピボットの子
    const pivot = new TransformNode(`${name}_upperBodyPivot`, this.scene);
    pivot.parent = root;
    upper.parent = pivot;

    this.upperBodyPivots.push(pivot);

    return { root, pivot };
  }

  /**
   * エンティティの両サイドに腕（棒）と拳（球）を付ける。
   * デフォルトは60度下向きのポーズ。ボールが近いと動的に向きを変える。
   *
   * @param upperColor 上半身チームカラー（腕・拳に適用。省略時は color）
   */
  private createEntityArms(parent: Mesh, pivot: TransformNode, color: Color3, upperColor?: Color3): void {
    const uc = upperColor ?? color;
    const createArmMeshes = (side: -1 | 1): { upperArm: Mesh; elbow: Mesh; forearm: Mesh; hand: Mesh } => {
      const armColor = new Color3(uc.r * 0.7, uc.g * 0.7, uc.b * 0.7);

      // 前面ストライプ共通マテリアル（肌色）
      const stripeMat = new StandardMaterial(`${parent.name}_stripeMat${side}`, this.scene);
      stripeMat.diffuseColor = SKIN_COLOR;
      stripeMat.specularColor = Color3.Black();

      // 上腕（薄い円柱）— 上半身ピボットの子
      const upperArm = MeshBuilder.CreateCylinder(`${parent.name}_upperArm${side}`, {
        height: UPPER_ARM_LENGTH,
        diameter: ARM_DIAMETER,
        tessellation: 6,
      }, this.scene);
      const upperArmMat = new StandardMaterial(`${parent.name}_upperArmMat${side}`, this.scene);
      upperArmMat.diffuseColor = armColor;
      upperArmMat.specularColor = Color3.Black();
      upperArm.material = upperArmMat;
      upperArm.parent = pivot;
      upperArm.isPickable = false;

      // 上腕の前面ストライプ（シリンダーの子: ローカルZ+面に配置）
      const upperStripe = MeshBuilder.CreateBox(`${parent.name}_upperStripe${side}`, {
        width: ARM_DIAMETER * ARM_STRIPE_WIDTH_RATIO,
        height: UPPER_ARM_LENGTH * 0.9,
        depth: 0.001,
      }, this.scene);
      upperStripe.position.z = -(ARM_DIAMETER / 2 + 0.0005);
      upperStripe.material = stripeMat;
      upperStripe.parent = upperArm;
      upperStripe.isPickable = false;

      // 肘球 — 上半身ピボットの子
      const elbow = MeshBuilder.CreateSphere(`${parent.name}_elbow${side}`, {
        diameter: ELBOW_DIAMETER,
        segments: 8,
      }, this.scene);
      const elbowMat = new StandardMaterial(`${parent.name}_elbowMat${side}`, this.scene);
      elbowMat.diffuseColor = armColor;
      elbowMat.specularColor = Color3.Black();
      elbow.material = elbowMat;
      elbow.parent = pivot;
      elbow.isPickable = false;

      // 前腕（薄い円柱）— 上半身ピボットの子
      const forearm = MeshBuilder.CreateCylinder(`${parent.name}_forearm${side}`, {
        height: FOREARM_LENGTH,
        diameter: ARM_DIAMETER,
        tessellation: 6,
      }, this.scene);
      const forearmMat = new StandardMaterial(`${parent.name}_forearmMat${side}`, this.scene);
      forearmMat.diffuseColor = armColor;
      forearmMat.specularColor = Color3.Black();
      forearm.material = forearmMat;
      forearm.parent = pivot;
      forearm.isPickable = false;

      // 前腕の前面ストライプ（シリンダーの子: ローカルZ+面に配置）
      const foreStripe = MeshBuilder.CreateBox(`${parent.name}_foreStripe${side}`, {
        width: ARM_DIAMETER * ARM_STRIPE_WIDTH_RATIO,
        height: FOREARM_LENGTH * 0.9,
        depth: 0.001,
      }, this.scene);
      foreStripe.position.z = -(ARM_DIAMETER / 2 + 0.0005);
      foreStripe.material = stripeMat;
      foreStripe.parent = forearm;
      foreStripe.isPickable = false;

      // 拳（小さな球）— 上半身ピボットの子
      const hand = MeshBuilder.CreateSphere(`${parent.name}_hand${side}`, {
        diameter: HAND_DIAMETER,
        segments: 8,
      }, this.scene);
      const handMat = new StandardMaterial(`${parent.name}_handMat${side}`, this.scene);
      handMat.diffuseColor = uc;
      handMat.specularColor = Color3.Black();
      hand.material = handMat;
      hand.parent = pivot;
      hand.isPickable = false;

      return { upperArm, elbow, forearm, hand };
    };

    const left = createArmMeshes(-1);
    const right = createArmMeshes(1);

    const armSet: EntityArmSet = {
      parent,
      pivot,
      leftUpperArm: left.upperArm, leftElbow: left.elbow, leftForearm: left.forearm, leftHand: left.hand,
      rightUpperArm: right.upperArm, rightElbow: right.elbow, rightForearm: right.forearm, rightHand: right.hand,
    };
    this.entityArmSets.push(armSet);

    const lerpState: ArmLerpState = {
      leftDir: DEF_ARM_DIR.clone(),
      rightDir: DEF_ARM_DIR.clone(),
      leftElbowHint: DEF_LEFT_ELBOW_HINT.clone(),
      rightElbowHint: DEF_RIGHT_ELBOW_HINT.clone(),
    };
    this.armLerpStates.push(lerpState);

    // 初期ポーズを適用
    this.applyArmWithElbow(armSet.leftUpperArm, armSet.leftElbow, armSet.leftForearm, armSet.leftHand, -1, lerpState.leftDir, lerpState.leftElbowHint);
    this.applyArmWithElbow(armSet.rightUpperArm, armSet.rightElbow, armSet.rightForearm, armSet.rightHand, 1, lerpState.rightDir, lerpState.rightElbowHint);
  }

  createMeshes(): void {
    // チームカラー: 上半身で攻守を識別
    const offenseTeamColor = new Color3(0.2, 0.4, 0.9);   // 青（攻めチーム）
    const defenseTeamColor = new Color3(0.9, 0.25, 0.25);  // 赤（守りチーム）

    // Launcher (green base / blue upper)
    const launcherColor = new Color3(0.27, 0.8, 0.27);
    const launcherEnt = this.createOctEntity("simLauncher", VISUAL_SIZE, launcherColor, offenseTeamColor);
    this.launcherMesh = launcherEnt.root;
    this.createEntityArms(launcherEnt.root, launcherEnt.pivot, launcherColor, offenseTeamColor);

    // Targets (individual base colors / blue upper)
    for (let i = 0; i < TARGET_COLORS_3D.length; i++) {
      const c = TARGET_COLORS_3D[i];
      const color = new Color3(c.r, c.g, c.b);
      const ent = this.createOctEntity(`simTarget${i}`, VISUAL_SIZE, color, offenseTeamColor);
      this.createEntityArms(ent.root, ent.pivot, color, offenseTeamColor);
      this.targetMeshes.push(ent.root);
    }

    // Obstacles (purple base / red upper)
    const obColor = new Color3(0.6, 0.4, 0.8);
    for (let i = 0; i < OBSTACLE_COUNT; i++) {
      const ent = this.createOctEntity(`simOb${i}`, VISUAL_SIZE, obColor, defenseTeamColor);
      this.createEntityArms(ent.root, ent.pivot, obColor, defenseTeamColor);
      this.obstacleMeshes.push(ent.root);
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
    for (const set of this.entityArmSets) {
      for (const m of [
        set.leftUpperArm, set.leftElbow, set.leftForearm, set.leftHand,
        set.rightUpperArm, set.rightElbow, set.rightForearm, set.rightHand,
      ]) {
        m.material?.dispose();
        m.dispose();
      }
    }
    this.entityArmSets = [];
    this.armLerpStates = [];
    for (const pivot of this.upperBodyPivots) {
      pivot.dispose();
    }
    this.upperBodyPivots = [];
    this.torsoVisualAngles = [];
    this.neckVisualAngles = [];
    this.gaugeRenderer.dispose();
  }

  syncAll(state: SimVisState): void {
    if (this.visibility.global) {
      // obstacle visible: entities[5..9] → obstacleVisible[0..4]
      const obstacleVisible = this.visibility.entities.slice(5, 10);
      this.overlay.syncFov(state, obstacleVisible);
      this.overlay.syncReach(state, obstacleVisible);
      this.overlay.syncTrajectory(state);
      this.overlay.syncBallTrail(state);
      this.overlay.syncInterceptMarker(state);
      this.gaugeRenderer.sync(state, this.visibility.entities);
    } else {
      this.overlay.syncFov(state, [false, false, false, false, false]);
      this.overlay.syncReach(state, [false, false, false, false, false]);
      this.overlay.disposeTrajectory();
      this.overlay.disposeBallTrail();
      this.overlay.disposeInterceptMarker();
      this.gaugeRenderer.sync(state, Array(10).fill(false) as boolean[]);
    }
    this.syncTorsoRotation(state);
    this.syncNeckRotation(state);
    this.syncArms(state);
  }

  /**
   * 全エンティティの左右手のワールド座標を返す。
   * 順序: [launcher, targets[0..N-1], obstacles[0..M-1]]
   * detectBallResult から利用される（前フレームの armLerpStates を使用）。
   */
  getHandWorldPositions(allMovers: SimMover[]): { left: Vector3; right: Vector3 }[] {
    const result: { left: Vector3; right: Vector3 }[] = [];

    for (let idx = 0; idx < allMovers.length; idx++) {
      const lerpState = this.armLerpStates[idx];
      if (!lerpState) {
        // fallback: entity center at shoulder height
        const m = allMovers[idx];
        const pos = new Vector3(m.x, ENTITY_HEIGHT / 2 + SHOULDER_Y, m.z);
        result.push({ left: pos.clone(), right: pos.clone() });
        continue;
      }

      const mover = allMovers[idx];
      // root.rotation.y = PI/2 - facing, pivot.rotation.y = facing - torsoFacing
      // 合成回転角 θ = PI/2 - torsoFacing
      const theta = Math.PI / 2 - mover.torsoFacing;
      const cosT = Math.cos(theta);
      const sinT = Math.sin(theta);

      const computeHand = (side: -1 | 1, dir: Vector3): Vector3 => {
        // ローカル座標での手の位置（肩起点）
        const lx = side * ARM_BODY_RADIUS + dir.x * ARM_LENGTH;
        const ly = SHOULDER_Y + dir.y * ARM_LENGTH;
        const lz = dir.z * ARM_LENGTH;

        // Babylon.js 左手座標系 Y回転行列で変換
        return new Vector3(
          mover.x + lx * cosT + lz * sinT,
          ENTITY_HEIGHT / 2 + ly,
          mover.z - lx * sinT + lz * cosT,
        );
      };

      result.push({
        left: computeHand(-1, lerpState.leftDir),
        right: computeHand(1, lerpState.rightDir),
      });
    }

    return result;
  }

  /**
   * 全エンティティの上半身ピボットに torso 回転を適用（スムーズ補間付き）。
   * upperBodyPivots: [0]=launcher, [1..N]=targets, [N+1..]=obstacles
   * pivot.rotation.y = facing - torsoFacing （下半身ローカル空間での上半身ねじり）
   */
  private syncTorsoRotation(state: SimVisState): void {
    const alpha = 1 - Math.exp(-TORSO_VISUAL_LERP_SPEED * state.dt);
    const allMovers = [state.launcher, ...state.targets, ...state.obstacles];

    for (let i = 0; i < allMovers.length; i++) {
      if (i >= this.upperBodyPivots.length) continue;
      if (i >= this.torsoVisualAngles.length) continue;
      const pivot = this.upperBodyPivots[i];
      const mover = allMovers[i];
      // pivot は root(下半身)の子。root.rotation.y = π/2 - facing
      // 上半身ねじり: facing - torsoFacing
      const target = mover.facing - mover.torsoFacing;
      this.torsoVisualAngles[i] += (target - this.torsoVisualAngles[i]) * alpha;
      pivot.rotation.y = this.torsoVisualAngles[i];
    }
  }

  /**
   * 全エンティティの頭メッシュに首の相対回転を適用（スムーズ補間付き）。
   * facingIndicators: [0]=launcher, [1..N]=targets, [N+1..]=obstacles
   * 指数減衰Lerpで角度を補間し、カクつきを防ぐ。
   * 首は上半身ピボットの子なので、ローカル回転は torsoFacing - neckFacing
   */
  private syncNeckRotation(state: SimVisState): void {
    const alpha = 1 - Math.exp(-NECK_VISUAL_LERP_SPEED * state.dt);

    // 全エンティティをフラット配列として扱う: launcher, targets[0..4], obstacles[0..4]
    const allMovers = [state.launcher, ...state.targets, ...state.obstacles];

    for (let i = 0; i < allMovers.length; i++) {
      if (i >= this.facingIndicators.length) continue;
      if (i >= this.neckVisualAngles.length) continue;
      const head = this.facingIndicators[i];
      const mover = allMovers[i];
      // Head is child of upperBodyPivot which has rotation.y = facing - torsoFacing.
      // To make head face neckFacing: local Y rotation = torsoFacing - neckFacing
      const target = mover.torsoFacing - mover.neckFacing;
      this.neckVisualAngles[i] += (target - this.neckVisualAngles[i]) * alpha;
      head.rotation.y = this.neckVisualAngles[i];
    }
  }

  // =========================================================================
  // Arm dynamic sync — ボール方向に手を向ける（スムーズ補間付き）
  // =========================================================================

  /**
   * 全エンティティの腕を更新。
   * ボールが視野内(neckFacing ±90°)かつ2m以内なら両手をボール方向へ向ける。
   * 指数減衰Lerpで方向ベクトルを補間し、スムーズに遷移する。
   */
  private syncArms(state: SimVisState): void {
    const ballPos = state.ballPosition;
    const alpha = 1 - Math.exp(-ARM_LERP_SPEED * state.dt);

    // エンティティ順: launcher, targets[0..4], obstacles[0..4]
    const allMovers = [state.launcher, ...state.targets, ...state.obstacles];

    for (let idx = 0; idx < this.entityArmSets.length; idx++) {
      const armSet = this.entityArmSets[idx];
      const lerpState = this.armLerpStates[idx];
      if (!lerpState) continue;

      const parent = armSet.parent;
      const ex = parent.position.x;
      const ey = parent.position.y;
      const ez = parent.position.z;

      // 上半身基準点（ワールド座標）
      const refY = ey + SHOULDER_Y;

      let targetLeftDir = DEF_ARM_DIR;
      let targetRightDir = DEF_ARM_DIR;

      if (idx === state.ballMarkerEntityIdx && state.ballMarkerLeftArmTarget && state.ballMarkerRightArmTarget) {
        // オンボールディフェンダー: パスレーン守備スタンス（最優先）
        // 片手 → オンボール選手方向（ボールを遮る）
        // 片手 → 選択レシーバー方向（パスレーンを塞ぐ）
        parent.computeWorldMatrix(true);
        const invMatrix = parent.getWorldMatrix().clone().invert();
        const pivotAngle = this.torsoVisualAngles[idx] || 0;
        const cosA = Math.cos(pivotAngle);
        const sinA = Math.sin(pivotAngle);

        const localLeft = Vector3.TransformCoordinates(state.ballMarkerLeftArmTarget, invMatrix);
        const rootLeft = this.computeArmDir(-1, localLeft);
        targetLeftDir = new Vector3(
          rootLeft.x * cosA - rootLeft.z * sinA,
          rootLeft.y,
          rootLeft.x * sinA + rootLeft.z * cosA,
        ).normalize();

        const localRight = Vector3.TransformCoordinates(state.ballMarkerRightArmTarget, invMatrix);
        const rootRight = this.computeArmDir(1, localRight);
        targetRightDir = new Vector3(
          rootRight.x * cosA - rootRight.z * sinA,
          rootRight.y,
          rootRight.x * sinA + rootRight.z * cosA,
        ).normalize();
      } else {
        // 飛行中のボール、またはキャッチ保持中のボールを追跡
        const trackBallPos = (state.ballActive && ballPos) ? ballPos : state.ballHeldPosition;
        if (trackBallPos) {
          const dx = trackBallPos.x - ex;
          const dy = trackBallPos.y - refY;
          const dz = trackBallPos.z - ez;
          const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

          if (dist < BALL_REACT_RADIUS && dist > 0.01) {
            const mover = allMovers[idx];
            const angleToBall = Math.atan2(trackBallPos.z - ez, trackBallPos.x - ex);
            const angleDiff = normAngleDiff(mover.neckFacing, angleToBall);

            if (Math.abs(angleDiff) <= NECK_MAX_ANGLE) {
              parent.computeWorldMatrix(true);
              const localBall = Vector3.TransformCoordinates(
                trackBallPos, parent.getWorldMatrix().clone().invert(),
              );

              const rootLeftDir = this.computeArmDir(-1, localBall);
              const rootRightDir = this.computeArmDir(1, localBall);

              const pivotAngle = this.torsoVisualAngles[idx] || 0;
              const cosA = Math.cos(pivotAngle);
              const sinA = Math.sin(pivotAngle);

              targetLeftDir = new Vector3(
                rootLeftDir.x * cosA - rootLeftDir.z * sinA,
                rootLeftDir.y,
                rootLeftDir.x * sinA + rootLeftDir.z * cosA,
              ).normalize();

              targetRightDir = new Vector3(
                rootRightDir.x * cosA - rootRightDir.z * sinA,
                rootRightDir.y,
                rootRightDir.x * sinA + rootRightDir.z * cosA,
              ).normalize();
            }
          }
        }

        // プッシュ妨害: 該当 obstacle なら片腕をターゲット方向（肩高さ）に伸ばす
        const obEntityStart = 1 + state.targets.length;
        const pushInfo = (idx >= obEntityStart) ? state.pushObstructions.find(p => p.obstacleIdx === idx - obEntityStart) : undefined;
        if (pushInfo) {
          const pushTarget = new Vector3(pushInfo.armTargetX, ENTITY_HEIGHT * 0.9, pushInfo.armTargetZ);
          parent.computeWorldMatrix(true);
          const invMatrix = parent.getWorldMatrix().clone().invert();
          const pivotAngle = this.torsoVisualAngles[idx] || 0;
          const cosA = Math.cos(pivotAngle);
          const sinA = Math.sin(pivotAngle);

          const localPush = Vector3.TransformCoordinates(pushTarget, invMatrix);
          if (pushInfo.pushArm === 'left') {
            const rootDir = this.computeArmDir(-1, localPush);
            targetLeftDir = new Vector3(
              rootDir.x * cosA - rootDir.z * sinA,
              rootDir.y,
              rootDir.x * sinA + rootDir.z * cosA,
            ).normalize();
          } else {
            const rootDir = this.computeArmDir(1, localPush);
            targetRightDir = new Vector3(
              rootDir.x * cosA - rootDir.z * sinA,
              rootDir.y,
              rootDir.x * sinA + rootDir.z * cosA,
            ).normalize();
          }
        }
      }

      // ボール保持中の移動時: 右腕を水平やや下に構える（ドリブル姿勢）
      if (idx === state.onBallEntityIdx && !state.ballActive) {
        const mover = allMovers[idx];
        const vel = Math.sqrt(mover.vx * mover.vx + mover.vz * mover.vz);
        if (vel > 0.01) {
          targetRightDir = DRIBBLE_ARM_DIR;
        }
      }

      // --- 肘ヒント方向の決定 ---
      let targetLeftHint = DEF_LEFT_ELBOW_HINT;
      let targetRightHint = DEF_RIGHT_ELBOW_HINT;

      // DF守備スタンス: 肘を外側+後方に
      if (idx === state.ballMarkerEntityIdx && state.ballMarkerLeftArmTarget) {
        targetLeftHint = new Vector3(-1, -0.2, -0.5).normalize();
        targetRightHint = new Vector3(1, -0.2, -0.5).normalize();
      }

      // ドリブル時: 右肘を下方に
      if (idx === state.onBallEntityIdx && !state.ballActive) {
        targetRightHint = new Vector3(0.5, -1, 0).normalize();
      }

      // 指数減衰Lerpで補間（方向ベクトル）
      Vector3.LerpToRef(lerpState.leftDir, targetLeftDir, alpha, lerpState.leftDir);
      lerpState.leftDir.normalize();
      Vector3.LerpToRef(lerpState.rightDir, targetRightDir, alpha, lerpState.rightDir);
      lerpState.rightDir.normalize();

      // 指数減衰Lerpで補間（肘ヒント）
      Vector3.LerpToRef(lerpState.leftElbowHint, targetLeftHint, alpha, lerpState.leftElbowHint);
      lerpState.leftElbowHint.normalize();
      Vector3.LerpToRef(lerpState.rightElbowHint, targetRightHint, alpha, lerpState.rightElbowHint);
      lerpState.rightElbowHint.normalize();

      // 補間後の方向ベクトル+肘ヒントから腕の位置・回転を適用
      this.applyArmWithElbow(armSet.leftUpperArm, armSet.leftElbow, armSet.leftForearm, armSet.leftHand, -1, lerpState.leftDir, lerpState.leftElbowHint);
      this.applyArmWithElbow(armSet.rightUpperArm, armSet.rightElbow, armSet.rightForearm, armSet.rightHand, 1, lerpState.rightDir, lerpState.rightElbowHint);
    }
  }

  /** 肩位置からターゲットへの正規化方向ベクトルを計算（ローカル座標系） */
  private computeArmDir(side: -1 | 1, localTarget: Vector3): Vector3 {
    const shoulderX = side * ARM_BODY_RADIUS;
    const dx = localTarget.x - shoulderX;
    const dy = localTarget.y - SHOULDER_Y;
    const dz = localTarget.z;
    const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (len < 0.01) return DEF_ARM_DIR;
    return new Vector3(dx / len, dy / len, dz / len);
  }

  /**
   * 2ボーンIKソルバー: 肩と手の位置から肘の位置を余弦定理で逆算する。
   * @param shoulder 肩位置（ローカル座標）
   * @param handTarget 手ターゲット位置（ローカル座標）
   * @param L1 上腕長
   * @param L2 前腕長
   * @param hint 肘の曲がり方向ヒント（正規化済み）
   * @returns 肘位置（ローカル座標）
   */
  private solve2BoneIK(
    shoulder: Vector3,
    handTarget: Vector3,
    L1: number,
    L2: number,
    hint: Vector3,
  ): Vector3 {
    const shoulderToHand = handTarget.subtract(shoulder);
    let dist = shoulderToHand.length();

    // 距離がゼロに近い場合: 肩位置 + ヒント方向に上腕長だけ伸ばす
    if (dist < 0.001) {
      return shoulder.add(hint.scale(L1));
    }

    // 到達距離制限: 最小曲げ角度を保証
    // 最小曲げ角度での最大距離: 余弦定理 c² = a² + b² - 2ab·cos(π - minBend)
    const maxDist = Math.sqrt(L1 * L1 + L2 * L2 - 2 * L1 * L2 * Math.cos(Math.PI - MIN_BEND_ANGLE));
    if (dist > maxDist) {
      dist = maxDist;
    }
    // 到達不可能（短すぎる）: 最低でも |L1 - L2| を確保
    const minDist = Math.abs(L1 - L2) + 0.001;
    if (dist < minDist) {
      dist = minDist;
    }

    // 余弦定理: cos(θ_shoulder) = (L1² + dist² - L2²) / (2·L1·dist)
    const cosAngle = (L1 * L1 + dist * dist - L2 * L2) / (2 * L1 * dist);
    const clampedCos = Math.max(-1, Math.min(1, cosAngle));
    const angle = Math.acos(clampedCos);

    // 肩→手の正規化方向
    const dirToHand = shoulderToHand.normalize();

    // ヒントベクトルを肩→手軸に垂直な成分に射影
    const hintDotDir = Vector3.Dot(hint, dirToHand);
    const hintPerp = hint.subtract(dirToHand.scale(hintDotDir));
    const hintPerpLen = hintPerp.length();

    let elbowDir: Vector3;
    if (hintPerpLen < 0.001) {
      // ヒントが肩→手と平行 → フォールバック: 任意の垂直ベクトルを生成
      const fallback = Math.abs(dirToHand.y) < 0.9
        ? Vector3.Up()
        : Vector3.Right();
      elbowDir = Vector3.Cross(dirToHand, fallback).normalize();
    } else {
      elbowDir = hintPerp.normalize();
    }

    // 肘位置 = 肩 + (肩→手方向 × cos(θ) + 垂直方向 × sin(θ)) × L1
    const elbow = shoulder.add(
      dirToHand.scale(L1 * Math.cos(angle)).add(
        elbowDir.scale(L1 * Math.sin(angle)),
      ),
    );

    return elbow;
  }

  /**
   * シリンダーメッシュを始点→終点方向に配置する。
   * position は始点と終点の中点、rotation は Y軸→方向ベクトルへの回転。
   */
  private alignCylinder(mesh: Mesh, from: Vector3, to: Vector3): void {
    const mid = from.add(to).scale(0.5);
    mesh.position.copyFrom(mid);

    const dir = to.subtract(from).normalize();
    const yAxis = Vector3.Up();
    const dot = Vector3.Dot(yAxis, dir);

    if (Math.abs(dot) > 0.9999) {
      mesh.rotationQuaternion = dot > 0
        ? Quaternion.Identity()
        : Quaternion.RotationAxis(Vector3.Right(), Math.PI);
    } else {
      const cross = Vector3.Cross(yAxis, dir);
      const angle = Math.acos(Math.max(-1, Math.min(1, dot)));
      mesh.rotationQuaternion = Quaternion.RotationAxis(cross.normalize(), angle);
    }
  }

  /**
   * 上腕の後方可動域制限。
   * 上腕が上方(+Y)かつ後方(-Z)を向いている場合、
   * 真上から後方への角度が UPPER_ARM_MAX_BACK_ANGLE を超えないようクランプする。
   */
  private clampUpperArmBackward(shoulder: Vector3, elbowPos: Vector3): Vector3 {
    const dir = elbowPos.subtract(shoulder);
    const len = dir.length();
    if (len < 0.001) return elbowPos;

    // 下向き or 前方 → 制限不要
    if (dir.y <= 0 || dir.z >= 0) return elbowPos;

    // YZ平面での後方角度（+Yから-Z方向への角度）
    const backAngle = Math.atan2(-dir.z, dir.y);
    if (backAngle <= UPPER_ARM_MAX_BACK_ANGLE) return elbowPos;

    // YZ平面でクランプ（X成分とYZ面の大きさは保持）
    const yzLen = Math.sqrt(dir.y * dir.y + dir.z * dir.z);
    const newY = yzLen * Math.cos(UPPER_ARM_MAX_BACK_ANGLE);
    const newZ = -yzLen * Math.sin(UPPER_ARM_MAX_BACK_ANGLE);

    return shoulder.add(new Vector3(dir.x, newY, newZ));
  }

  /**
   * 前腕の方向制限（前面基準）。
   * ヒントベクトルから「前面」方向を算出し、
   * 前腕が前面方向に 0°〜MAX_FOREARM_BEND_ANGLE の範囲でのみ曲がるよう制限する。
   * 過伸展（後方への曲がり）は許可しない。
   *
   * @param elbowPos 肘位置
   * @param handTarget 手ターゲット位置
   * @param upperDir 上腕方向（肩→肘、正規化済み）
   * @param hint 肘ヒントベクトル
   * @returns 制限適用後の手位置（前腕長を維持）
   */
  private clampForearmDirection(
    elbowPos: Vector3,
    handTarget: Vector3,
    upperDir: Vector3,
    hint: Vector3,
  ): Vector3 {
    const forearmVec = handTarget.subtract(elbowPos);
    if (forearmVec.length() < 0.001) {
      return elbowPos.add(upperDir.scale(FOREARM_LENGTH));
    }
    const forearmDir = forearmVec.normalize();

    // 上腕延長方向に対する前腕の角度
    const dotWithUpper = Vector3.Dot(forearmDir, upperDir);
    const bendAngle = Math.acos(Math.max(-1, Math.min(1, dotWithUpper)));

    // 「前面」方向を計算: ヒントの上腕垂直成分の反対方向
    // ヒント → 肘が突き出す方向、前面 → その反対（内側）
    const hintDotUpper = Vector3.Dot(hint, upperDir);
    const hintPerp = hint.subtract(upperDir.scale(hintDotUpper));
    const hintPerpLen = hintPerp.length();

    if (hintPerpLen < 0.001) {
      // ヒントが上腕と平行 → 角度のみ制限
      if (bendAngle > MAX_FOREARM_BEND_ANGLE) {
        const perpComp = forearmDir.subtract(upperDir.scale(dotWithUpper));
        const perpLen = perpComp.length();
        if (perpLen < 0.001) return elbowPos.add(upperDir.scale(FOREARM_LENGTH));
        const clamped = upperDir.scale(Math.cos(MAX_FOREARM_BEND_ANGLE))
          .add(perpComp.normalize().scale(Math.sin(MAX_FOREARM_BEND_ANGLE)));
        return elbowPos.add(clamped.normalize().scale(FOREARM_LENGTH));
      }
      return elbowPos.add(forearmDir.scale(FOREARM_LENGTH));
    }

    const frontDir = hintPerp.normalize().scale(-1); // 前面 = ヒント反対

    // 過伸展チェック: 前腕が後方（ヒント側）に曲がっている
    const forearmFront = Vector3.Dot(forearmDir, frontDir);
    if (forearmFront < 0 && bendAngle > MIN_BEND_ANGLE) {
      // 最小曲げで前面方向に矯正
      const clamped = upperDir.scale(Math.cos(MIN_BEND_ANGLE))
        .add(frontDir.scale(Math.sin(MIN_BEND_ANGLE)));
      return elbowPos.add(clamped.normalize().scale(FOREARM_LENGTH));
    }

    // 最大曲げ角度チェック
    if (bendAngle > MAX_FOREARM_BEND_ANGLE) {
      // 曲げ方向を維持しつつ角度をクランプ
      const perpComp = forearmDir.subtract(upperDir.scale(dotWithUpper));
      const perpLen = perpComp.length();
      const bendDir = perpLen > 0.001 ? perpComp.normalize() : frontDir;
      const clamped = upperDir.scale(Math.cos(MAX_FOREARM_BEND_ANGLE))
        .add(bendDir.scale(Math.sin(MAX_FOREARM_BEND_ANGLE)));
      return elbowPos.add(clamped.normalize().scale(FOREARM_LENGTH));
    }

    // 制限内: 前腕長を維持
    return elbowPos.add(forearmDir.scale(FOREARM_LENGTH));
  }

  /** 方向ベクトル+肘ヒントから上腕・肘球・前腕・手球の4メッシュを配置 */
  private applyArmWithElbow(
    upperArm: Mesh, elbowMesh: Mesh, forearm: Mesh, hand: Mesh,
    side: -1 | 1, dir: Vector3, hint: Vector3,
  ): void {
    const shoulder = new Vector3(side * ARM_BODY_RADIUS, SHOULDER_Y, 0);
    const handPos = new Vector3(
      shoulder.x + dir.x * ARM_LENGTH,
      shoulder.y + dir.y * ARM_LENGTH,
      dir.z * ARM_LENGTH,
    );

    // IKで肘位置を計算 → 上腕の後方可動域制限を適用
    const elbowPos = this.clampUpperArmBackward(
      shoulder,
      this.solve2BoneIK(shoulder, handPos, UPPER_ARM_LENGTH, FOREARM_LENGTH, hint),
    );

    // 上腕方向
    const upperDir = elbowPos.subtract(shoulder);
    const upperLen = upperDir.length();
    const upperDirN = upperLen > 0.001 ? upperDir.scale(1 / upperLen) : Vector3.Up();

    // 前腕の方向制限: 前面方向に0°〜90°のみ許可、過伸展を防止
    const visualHandPos = this.clampForearmDirection(elbowPos, handPos, upperDirN, hint);

    // 上腕: 肩 → 肘
    this.alignCylinder(upperArm, shoulder, elbowPos);

    // 肘球
    elbowMesh.position.copyFrom(elbowPos);

    // 前腕: 肘 → 手
    this.alignCylinder(forearm, elbowPos, visualHandPos);

    // 手球
    hand.position.copyFrom(visualHandPos);
  }

  // =========================================================================
  // Facing indicator (VOX head on top of each entity)
  // =========================================================================

  /** VOXヘッドモデルを読み込み、全エンティティにクローンしてアタッチ */
  private async loadAndAttachHeads(): Promise<void> {
    try {
      const result = await loadVoxHeadMesh(this.scene, "/box/head.vox");
      result.mesh.setEnabled(false);

      // 顔寸法を保存（FOV描画で使用 — OverlayRenderer に設定）
      this.overlay.headFaceForwardOffset = result.faceForwardOffset;
      // 顔中心のワールドY = entity root offset(ENTITY_HEIGHT/2) + head child offset(ENTITY_HEIGHT/2) + faceCenterHeight
      this.overlay.headFaceCenterY = ENTITY_HEIGHT / 2 + result.faceCenterHeight;

      const mat = new StandardMaterial("voxHeadMat", this.scene);
      mat.emissiveColor = Color3.White();
      mat.disableLighting = true;
      mat.backFaceCulling = false;

      // 頭は上半身ピボットの子（上半身と一緒に回転する）
      for (let i = 0; i < this.upperBodyPivots.length; i++) {
        const clone = result.mesh.clone(`facingHead_${i}`);
        clone.material = mat;
        clone.parent = this.upperBodyPivots[i];
        clone.position.y = ENTITY_HEIGHT / 2;
        clone.setEnabled(true);
        this.facingIndicators.push(clone);
      }

      result.mesh.dispose();
    } catch (e) {
      console.error("[SimVisualization] Failed to load VOX head:", e);
    }
  }
}
