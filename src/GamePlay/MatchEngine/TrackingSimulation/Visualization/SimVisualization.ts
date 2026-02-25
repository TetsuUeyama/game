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
  ARM_LERP_SPEED,
  NECK_VISUAL_LERP_SPEED,
  NECK_MAX_ANGLE,
  TORSO_VISUAL_LERP_SPEED,
} from "../Config/FieldConfig";

/** 全エンティティの描画サイズを障害物サイズに統一 */
const VISUAL_SIZE = OBSTACLE_SIZE;
import { TARGET_COLORS_3D } from "../Config/EntityConfig";
import type { SimMover, SimScanMemory, SimPreFireInfo, ActionState } from "../Types/TrackingSimTypes";
import { normAngleDiff } from "../Movement/MovementCore";

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
  dt: number;
}

// --- Arm constants (shared by all entities) ---
export const ARM_BODY_RADIUS = VISUAL_SIZE / 2;
export const ARM_LENGTH = VISUAL_SIZE * 1.1;
const ARM_DIAMETER = VISUAL_SIZE * 0.12;
const HAND_DIAMETER = VISUAL_SIZE * 0.22;
export const SHOULDER_Y = ENTITY_HEIGHT * 0.35;
const DEFAULT_ARM_ANGLE = (60 * Math.PI) / 180;
/** ボールがこの距離以内なら両手をボール方向へ向ける */
const BALL_REACT_RADIUS = 2.0;

// Default arm pose offsets (precomputed)
const DEF_ARM_CENTER_DX = ARM_BODY_RADIUS + (ARM_LENGTH / 2) * Math.cos(DEFAULT_ARM_ANGLE);
const DEF_ARM_CENTER_DY = -(ARM_LENGTH / 2) * Math.sin(DEFAULT_ARM_ANGLE);
const DEF_HAND_DX = ARM_BODY_RADIUS + ARM_LENGTH * Math.cos(DEFAULT_ARM_ANGLE);
const DEF_HAND_DY = -ARM_LENGTH * Math.sin(DEFAULT_ARM_ANGLE);
const DEF_ARM_ROT_Z = (Math.PI / 2) - DEFAULT_ARM_ANGLE;

/** デフォルト腕方向ベクトル（ローカル座標: 60度下向き前方） */
const DEF_ARM_DIR = new Vector3(0, -Math.sin(DEFAULT_ARM_ANGLE), Math.cos(DEFAULT_ARM_ANGLE)).normalize();

/** 腕ポーズ補間用: 肩→手方向ベクトル（ローカル座標、正規化済み） */
export interface ArmLerpState {
  leftDir: Vector3;   // 現在の左腕方向
  rightDir: Vector3;  // 現在の右腕方向
}

interface EntityArmSet {
  parent: Mesh;
  pivot: TransformNode;
  leftArm: Mesh; leftHand: Mesh;
  rightArm: Mesh; rightHand: Mesh;
}

export class SimVisualization {
  private scene: Scene;
  private overlay: OverlayRenderer;
  private gaugeRenderer: ActionGaugeRenderer;

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

  /**
   * 上下2段の8角柱エンティティを作成する。
   * 上段は明るめ、下段はやや暗めの色になる。
   * 返すのは親 TransformNode 的な空 Mesh（位置更新用）。
   */
  private createOctEntity(
    name: string, size: number, color: Color3,
  ): { root: Mesh; pivot: TransformNode } {
    const halfH = ENTITY_HEIGHT / 2;
    // 8角柱の外接円半径: size/2 は辺間の幅に近い値なのでそのまま使う
    const radius = size / 2;

    // 上段（明るい色）
    const upper = MeshBuilder.CreateCylinder(`${name}_upper`, {
      height: halfH, diameter: radius * 2, tessellation: 8,
    }, this.scene);
    upper.position.y = halfH / 2; // 中心が halfH/2
    const upperMat = new StandardMaterial(`${name}_upperMat`, this.scene);
    upperMat.diffuseColor = color;
    upperMat.specularColor = Color3.Black();
    upper.material = upperMat;

    // 下段（暗めの色）
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
   */
  private createEntityArms(parent: Mesh, pivot: TransformNode, color: Color3): void {
    const createArmMesh = (side: -1 | 1): { arm: Mesh; hand: Mesh } => {
      // 腕（薄い円柱）— 上半身ピボットの子
      const arm = MeshBuilder.CreateCylinder(`${parent.name}_arm${side}`, {
        height: ARM_LENGTH,
        diameter: ARM_DIAMETER,
        tessellation: 6,
      }, this.scene);
      arm.rotation.z = side * DEF_ARM_ROT_Z;
      arm.position.set(side * DEF_ARM_CENTER_DX, SHOULDER_Y + DEF_ARM_CENTER_DY, 0);
      const armMat = new StandardMaterial(`${parent.name}_armMat${side}`, this.scene);
      armMat.diffuseColor = new Color3(color.r * 0.7, color.g * 0.7, color.b * 0.7);
      armMat.specularColor = Color3.Black();
      arm.material = armMat;
      arm.parent = pivot;
      arm.isPickable = false;

      // 拳（小さな球）— 上半身ピボットの子
      const hand = MeshBuilder.CreateSphere(`${parent.name}_hand${side}`, {
        diameter: HAND_DIAMETER,
        segments: 8,
      }, this.scene);
      hand.position.set(side * DEF_HAND_DX, SHOULDER_Y + DEF_HAND_DY, 0);
      const handMat = new StandardMaterial(`${parent.name}_handMat${side}`, this.scene);
      handMat.diffuseColor = color;
      handMat.specularColor = Color3.Black();
      hand.material = handMat;
      hand.parent = pivot;
      hand.isPickable = false;

      return { arm, hand };
    };

    const left = createArmMesh(-1);
    const right = createArmMesh(1);

    this.entityArmSets.push({
      parent,
      pivot,
      leftArm: left.arm, leftHand: left.hand,
      rightArm: right.arm, rightHand: right.hand,
    });

    this.armLerpStates.push({
      leftDir: DEF_ARM_DIR.clone(),
      rightDir: DEF_ARM_DIR.clone(),
    });
  }

  createMeshes(): void {
    // Launcher (green octagonal prism)
    const launcherColor = new Color3(0.27, 0.8, 0.27);
    const launcherEnt = this.createOctEntity("simLauncher", VISUAL_SIZE, launcherColor);
    this.launcherMesh = launcherEnt.root;
    this.createEntityArms(launcherEnt.root, launcherEnt.pivot, launcherColor);

    // Targets (colored octagonal prisms)
    for (let i = 0; i < 5; i++) {
      const c = TARGET_COLORS_3D[i];
      const color = new Color3(c.r, c.g, c.b);
      const ent = this.createOctEntity(`simTarget${i}`, VISUAL_SIZE, color);
      this.createEntityArms(ent.root, ent.pivot, color);
      this.targetMeshes.push(ent.root);
    }

    // Obstacles (purple octagonal prisms)
    const obColor = new Color3(0.6, 0.4, 0.8);
    for (let i = 0; i < 5; i++) {
      const ent = this.createOctEntity(`simOb${i}`, VISUAL_SIZE, obColor);
      this.createEntityArms(ent.root, ent.pivot, obColor);
      this.obstacleMeshes.push(ent.root);
    }

    // FOV lines (delegated to overlay)
    this.overlay.createFovLines();

    // Facing indicators (vox head on top of each entity) — fire-and-forget async
    this.loadAndAttachHeads();

    // Torso + Neck visual angles for smooth interpolation (1 launcher + 5 targets + 5 obstacles)
    this.torsoVisualAngles = new Array(11).fill(0);
    this.neckVisualAngles = new Array(11).fill(0);

    // Action gauges (1 launcher + 5 targets + 5 obstacles = 11)
    this.gaugeRenderer.create(11);
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
      for (const m of [set.leftArm, set.leftHand, set.rightArm, set.rightHand]) {
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
    this.overlay.syncFov(state);
    this.overlay.syncReach(state);
    this.overlay.syncTrajectory(state);
    this.overlay.syncBallTrail(state);
    this.overlay.syncInterceptMarker(state);
    this.syncTorsoRotation(state);
    this.syncNeckRotation(state);
    this.syncArms(state);
    this.gaugeRenderer.sync(state);
  }

  /**
   * 全エンティティの左右手のワールド座標を返す。
   * 順序: [launcher, targets[0..4], obstacles[0..4]]
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
   * upperBodyPivots: [0]=launcher, [1-5]=targets, [6-10]=obstacles
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
   * facingIndicators: [0]=launcher, [1-5]=targets, [6-10]=obstacles
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

      // 飛行中のボール、またはキャッチ保持中のボールを追跡
      const trackBallPos = (state.ballActive && ballPos) ? ballPos : state.ballHeldPosition;
      if (trackBallPos) {
        const dx = trackBallPos.x - ex;
        const dy = trackBallPos.y - refY;
        const dz = trackBallPos.z - ez;
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

        if (dist < BALL_REACT_RADIUS && dist > 0.01) {
          // 視野判定: ボール方向がneckFacingから±NECK_MAX_ANGLE以内か
          const mover = allMovers[idx];
          const angleToBall = Math.atan2(trackBallPos.z - ez, trackBallPos.x - ex);
          const angleDiff = normAngleDiff(mover.neckFacing, angleToBall);

          if (Math.abs(angleDiff) <= NECK_MAX_ANGLE) {
            // ルート（下半身）のローカル座標でボール位置を計算。
            // ピボット（上半身）空間ではなくルート空間で計算することで、
            // 上半身回転が追いつかない分を腕が横方向にカバーする。
            parent.computeWorldMatrix(true);
            const localBall = Vector3.TransformCoordinates(
              trackBallPos, parent.getWorldMatrix().clone().invert(),
            );

            // ルート空間での腕方向を計算
            const rootLeftDir = this.computeArmDir(-1, localBall);
            const rootRightDir = this.computeArmDir(1, localBall);

            // ルート空間 → ピボット空間に変換（ピボットのローカルY回転を逆適用）
            // ピボットは腕メッシュの親なので、描画にはピボット空間の方向が必要
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

      // 指数減衰Lerpで補間
      Vector3.LerpToRef(lerpState.leftDir, targetLeftDir, alpha, lerpState.leftDir);
      lerpState.leftDir.normalize();
      Vector3.LerpToRef(lerpState.rightDir, targetRightDir, alpha, lerpState.rightDir);
      lerpState.rightDir.normalize();

      // 補間後の方向ベクトルから腕の位置・回転を適用
      this.applyArmFromDir(armSet.leftArm, armSet.leftHand, -1, lerpState.leftDir);
      this.applyArmFromDir(armSet.rightArm, armSet.rightHand, 1, lerpState.rightDir);
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

  /** 方向ベクトルから腕のposition/rotationを設定 */
  private applyArmFromDir(arm: Mesh, hand: Mesh, side: -1 | 1, dir: Vector3): void {
    const shoulderX = side * ARM_BODY_RADIUS;

    // 腕の中心位置と拳の位置
    arm.position.set(
      shoulderX + dir.x * ARM_LENGTH / 2,
      SHOULDER_Y + dir.y * ARM_LENGTH / 2,
      dir.z * ARM_LENGTH / 2,
    );
    hand.position.set(
      shoulderX + dir.x * ARM_LENGTH,
      SHOULDER_Y + dir.y * ARM_LENGTH,
      dir.z * ARM_LENGTH,
    );

    // 円柱をデフォルト軸(Y)からdir方向へ回転
    const yAxis = Vector3.Up();
    const dot = Vector3.Dot(yAxis, dir);

    if (Math.abs(dot) > 0.9999) {
      arm.rotationQuaternion = dot > 0
        ? Quaternion.Identity()
        : Quaternion.RotationAxis(Vector3.Right(), Math.PI);
    } else {
      const cross = Vector3.Cross(yAxis, dir);
      const angle = Math.acos(Math.max(-1, Math.min(1, dot)));
      arm.rotationQuaternion = Quaternion.RotationAxis(cross.normalize(), angle);
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
