import {
  Scene,
  MeshBuilder,
  StandardMaterial,
  Color3,
  Vector3,
  Quaternion,
  Mesh,
  LinesMesh,
  TransformNode,
} from "@babylonjs/core";

import { loadVoxHeadMesh } from "./VoxHeadMesh";

import {
  ENTITY_HEIGHT,
  OBSTACLE_SIZE,
  FOV_FULL_LEN,
  FOV_WINDOW_LEN,
  ARM_LERP_SPEED,
  NECK_VISUAL_LERP_SPEED,
} from "../Config/FieldConfig";

/** 全エンティティの描画サイズを障害物サイズに統一 */
const VISUAL_SIZE = OBSTACLE_SIZE;
import { TARGET_COLORS_3D } from "../Config/EntityConfig";
import type { SimMover, SimPreFireInfo, SimScanMemory, ActionState } from "../Types/TrackingSimTypes";
import { dirSpeedMult } from "../Movement/MovementCore";
import { isTrajectoryInFOV, fovHalfAtDist } from "../Decision/TrajectoryAnalysis";

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
  dt: number;
}

// --- Arm constants (shared by all entities) ---
const ARM_BODY_RADIUS = VISUAL_SIZE / 2;
const ARM_LENGTH = VISUAL_SIZE * 1.1;
const ARM_DIAMETER = VISUAL_SIZE * 0.12;
const HAND_DIAMETER = VISUAL_SIZE * 0.22;
const SHOULDER_Y = ENTITY_HEIGHT * 0.35;
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
interface ArmLerpState {
  leftDir: Vector3;   // 現在の左腕方向
  rightDir: Vector3;  // 現在の右腕方向
}

interface EntityArmSet {
  parent: Mesh;
  leftArm: Mesh; leftHand: Mesh;
  rightArm: Mesh; rightHand: Mesh;
}

// --- Action gauge constants ---
const GAUGE_W = 0.5;
const GAUGE_H = 0.04;
const GAUGE_Y_OFFSET = 0.7;

interface ActionGaugeMeshes {
  root: TransformNode;
  bg: Mesh;
  phases: [Mesh, Mesh, Mesh];
  phaseMats: [StandardMaterial, StandardMaterial, StandardMaterial];
}

export class SimVisualization {
  private scene: Scene;

  // Meshes
  launcherMesh!: Mesh;
  targetMeshes: Mesh[] = [];
  obstacleMeshes: Mesh[] = [];
  fovLines: LinesMesh[] = [];
  fovWindowLines: LinesMesh[] = [];
  reachLines: LinesMesh[] = [];
  trajectoryLine: LinesMesh | null = null;
  ballTrailLine: LinesMesh | null = null;
  interceptMarkerLine: LinesMesh | null = null;
  private gauges: ActionGaugeMeshes[] = [];
  private facingIndicators: Mesh[] = [];
  private entityArmSets: EntityArmSet[] = [];
  private armLerpStates: ArmLerpState[] = [];
  private neckVisualAngles: number[] = [];
  /** 顔前面までの距離（メッシュ中心からローカルZ+方向） */
  private headFaceForwardOffset = 0;
  /** 顔中心のワールドY座標（entity root基準からの高さ） */
  private headFaceCenterY = 0;

  constructor(scene: Scene) {
    this.scene = scene;
  }

  /**
   * 上下2段の8角柱エンティティを作成する。
   * 上段は明るめ、下段はやや暗めの色になる。
   * 返すのは親 TransformNode 的な空 Mesh（位置更新用）。
   */
  private createOctEntity(
    name: string, size: number, color: Color3,
  ): Mesh {
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

    // 親メッシュ（位置制御用の空ノード）
    const root = new Mesh(name, this.scene);
    upper.parent = root;
    lower.parent = root;

    return root;
  }

  /**
   * エンティティの両サイドに腕（棒）と拳（球）を付ける。
   * デフォルトは60度下向きのポーズ。ボールが近いと動的に向きを変える。
   */
  private createEntityArms(parent: Mesh, color: Color3): void {
    const createArmMesh = (side: -1 | 1): { arm: Mesh; hand: Mesh } => {
      // 腕（薄い円柱）
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
      arm.parent = parent;
      arm.isPickable = false;

      // 拳（小さな球）
      const hand = MeshBuilder.CreateSphere(`${parent.name}_hand${side}`, {
        diameter: HAND_DIAMETER,
        segments: 8,
      }, this.scene);
      hand.position.set(side * DEF_HAND_DX, SHOULDER_Y + DEF_HAND_DY, 0);
      const handMat = new StandardMaterial(`${parent.name}_handMat${side}`, this.scene);
      handMat.diffuseColor = color;
      handMat.specularColor = Color3.Black();
      hand.material = handMat;
      hand.parent = parent;
      hand.isPickable = false;

      return { arm, hand };
    };

    const left = createArmMesh(-1);
    const right = createArmMesh(1);

    this.entityArmSets.push({
      parent,
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
    this.launcherMesh = this.createOctEntity("simLauncher", VISUAL_SIZE, launcherColor);
    this.createEntityArms(this.launcherMesh, launcherColor);

    // Targets (colored octagonal prisms)
    for (let i = 0; i < 5; i++) {
      const c = TARGET_COLORS_3D[i];
      const color = new Color3(c.r, c.g, c.b);
      const mesh = this.createOctEntity(`simTarget${i}`, VISUAL_SIZE, color);
      this.createEntityArms(mesh, color);
      this.targetMeshes.push(mesh);
    }

    // Obstacles (purple octagonal prisms)
    const obColor = new Color3(0.6, 0.4, 0.8);
    for (let i = 0; i < 5; i++) {
      const mesh = this.createOctEntity(`simOb${i}`, VISUAL_SIZE, obColor);
      this.createEntityArms(mesh, obColor);
      this.obstacleMeshes.push(mesh);
    }

    // FOV lines (one pair per obstacle)
    for (let i = 0; i < 5; i++) {
      const line = MeshBuilder.CreateLines(`simFov${i}`, {
        points: [Vector3.Zero(), Vector3.Zero(), Vector3.Zero()],
        updatable: true,
      }, this.scene);
      line.color = new Color3(0.6, 0.4, 0.8);
      this.fovLines.push(line);
    }

    // Facing indicators (vox head on top of each entity) — fire-and-forget async
    this.loadAndAttachHeads();

    // Neck visual angles for smooth interpolation (1 launcher + 5 targets + 5 obstacles)
    this.neckVisualAngles = new Array(11).fill(0);

    // Action gauges (1 launcher + 5 targets + 5 obstacles = 11)
    this.createActionGauges(11);
  }

  disposeMeshes(): void {
    this.launcherMesh?.dispose();
    this.targetMeshes.forEach(m => m.dispose());
    this.targetMeshes = [];
    this.obstacleMeshes.forEach(m => m.dispose());
    this.obstacleMeshes = [];
    this.fovLines.forEach(l => l.dispose());
    this.fovLines = [];
    this.fovWindowLines.forEach(l => l.dispose());
    this.fovWindowLines = [];
    this.reachLines.forEach(l => l.dispose());
    this.reachLines = [];
    if (this.trajectoryLine) {
      this.trajectoryLine.dispose();
      this.trajectoryLine = null;
    }
    if (this.ballTrailLine) {
      this.ballTrailLine.dispose();
      this.ballTrailLine = null;
    }
    if (this.interceptMarkerLine) {
      this.interceptMarkerLine.dispose();
      this.interceptMarkerLine = null;
    }
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
    this.neckVisualAngles = [];
    this.disposeActionGauges();
  }

  syncAll(state: SimVisState): void {
    this.syncFovVisualization(state);
    this.syncReachVisualization(state);
    this.syncTrajectoryVisualization(state);
    this.syncBallTrailVisualization(state);
    this.syncInterceptMarker(state);
    this.syncNeckRotation(state);
    this.syncArms(state);
    this.syncActionGauges(state);
  }

  private createLine(name: string, points: Vector3[], r: number, g: number, b: number, alpha = 1.0): LinesMesh {
    const line = MeshBuilder.CreateLines(name, { points }, this.scene);
    line.color = new Color3(r, g, b);
    if (alpha < 1.0) {
      line.alpha = alpha;
    }
    return line;
  }

  /**
   * 全エンティティの頭メッシュに首の相対回転を適用（スムーズ補間付き）。
   * facingIndicators: [0]=launcher, [1-5]=targets, [6-10]=obstacles
   * 指数減衰Lerpで角度を補間し、カクつきを防ぐ。
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
      // Head is child of body mesh which has rotation.y = PI/2 - facing.
      // To make head face neckFacing: local Y rotation = facing - neckFacing
      const target = mover.facing - mover.neckFacing;
      this.neckVisualAngles[i] += (target - this.neckVisualAngles[i]) * alpha;
      head.rotation.y = this.neckVisualAngles[i];
    }
  }

  private syncFovVisualization(state: SimVisState): void {
    // FOV発生位置: 顔の前面（顔高さ + facing方向にオフセット）
    const faceY = this.headFaceCenterY;
    const fwd = this.headFaceForwardOffset;

    for (let i = 0; i < 5; i++) {
      const ob = state.obstacles[i];
      const mem = state.obMems[i];
      const searching = mem.searching;
      const fovHalf = searching
        ? Math.PI / 6
        : fovHalfAtDist(state.obFocusDists[i]);

      // 顔前面のワールド座標（neckFacing方向にオフセット）
      const cosF = Math.cos(ob.neckFacing);
      const sinF = Math.sin(ob.neckFacing);
      const faceX = ob.x + cosF * fwd;
      const faceZ = ob.z + sinF * fwd;

      // --- Edge lines (full length FOV boundaries) ---
      const len = FOV_FULL_LEN;
      const leftAngle = ob.neckFacing + fovHalf;
      const rightAngle = ob.neckFacing - fovHalf;
      const origin = new Vector3(faceX, faceY, faceZ);
      const leftEnd = new Vector3(
        faceX + Math.cos(leftAngle) * len, faceY,
        faceZ + Math.sin(leftAngle) * len,
      );
      const rightEnd = new Vector3(
        faceX + Math.cos(rightAngle) * len, faceY,
        faceZ + Math.sin(rightAngle) * len,
      );

      this.fovLines[i].dispose();
      if (searching) {
        this.fovLines[i] = this.createLine(`simFov${i}`, [leftEnd, origin, rightEnd], 1.0, 0.78, 0.39, 0.5);
      } else {
        this.fovLines[i] = this.createLine(`simFov${i}`, [leftEnd, origin, rightEnd], 0.6, 0.4, 0.8, 0.5);
      }

      // --- Sliding window (annular sector at focus distance) ---
      if (this.fovWindowLines[i]) this.fovWindowLines[i].dispose();

      const focusDist = state.obFocusDists[i];
      const halfWin = FOV_WINDOW_LEN / 2;
      const innerR = Math.max(0.1, focusDist - halfWin);
      const outerR = focusDist + halfWin;
      const arcSteps = 20;

      // Check if trajectory is in FOV for highlight color
      let trajInFov = false;
      if (state.preFire) {
        trajInFov = isTrajectoryInFOV(ob, state.launcher.x, state.launcher.z,
          state.preFire.estIPx, state.preFire.estIPz);
      }

      // Build window outline: inner arc -> right radial -> outer arc (reversed) -> left radial
      // ウィンドウも顔前面を基点にする
      const windowPoints: Vector3[] = [];

      // Inner arc (left to right)
      for (let s = 0; s <= arcSteps; s++) {
        const t = s / arcSteps;
        const angle = ob.neckFacing - fovHalf + (2 * fovHalf) * t;
        windowPoints.push(new Vector3(
          faceX + Math.cos(angle) * innerR, faceY - 0.01,
          faceZ + Math.sin(angle) * innerR,
        ));
      }
      // Right radial (inner to outer)
      windowPoints.push(new Vector3(
        faceX + Math.cos(ob.neckFacing + fovHalf) * outerR, faceY - 0.01,
        faceZ + Math.sin(ob.neckFacing + fovHalf) * outerR,
      ));
      // Outer arc (right to left, reversed)
      for (let s = arcSteps; s >= 0; s--) {
        const t = s / arcSteps;
        const angle = ob.neckFacing - fovHalf + (2 * fovHalf) * t;
        windowPoints.push(new Vector3(
          faceX + Math.cos(angle) * outerR, faceY - 0.01,
          faceZ + Math.sin(angle) * outerR,
        ));
      }
      // Left radial (outer to inner, close the shape)
      windowPoints.push(new Vector3(
        faceX + Math.cos(ob.neckFacing - fovHalf) * innerR, faceY - 0.01,
        faceZ + Math.sin(ob.neckFacing - fovHalf) * innerR,
      ));

      const [wr, wg, wb, wa] = trajInFov
        ? [1.0, 0.6, 0.2, 0.8]
        : searching
          ? [1.0, 0.78, 0.39, 0.6]
          : [0.6, 0.4, 0.8, 0.6];

      this.fovWindowLines[i] = this.createLine(
        `simFovWin${i}`, windowPoints, wr, wg, wb, wa,
      );
    }
  }

  private syncReachVisualization(state: SimVisState): void {
    for (let i = 0; i < this.reachLines.length; i++) {
      if (this.reachLines[i]) this.reachLines[i].dispose();
    }
    this.reachLines = [];

    // Only draw reach circles when pre-fire info is available
    if (!state.preFire) return;

    const pf = state.preFire;
    const VIS_Y = 0.12;

    for (let i = 0; i < 5; i++) {
      const ob = state.obstacles[i];
      const baseReach = pf.obReaches[i];
      const isBlocking = pf.obBlocks[i];
      const segments = 32;
      const points: Vector3[] = [];

      for (let s = 0; s <= segments; s++) {
        const angle = (s / segments) * Math.PI * 2;
        const mult = dirSpeedMult(ob.facing, angle);
        const r = baseReach * mult;
        points.push(new Vector3(
          ob.x + Math.cos(angle) * r, VIS_Y,
          ob.z + Math.sin(angle) * r,
        ));
      }

      if (isBlocking) {
        this.reachLines.push(this.createLine(`simReach${i}`, points, 1.0, 0.3, 0.3, 0.7));
      } else {
        this.reachLines.push(this.createLine(`simReach${i}`, points, 0.6, 0.4, 0.8, 0.4));
      }
    }
  }

  private syncTrajectoryVisualization(state: SimVisState): void {
    if (this.trajectoryLine) {
      this.trajectoryLine.dispose();
      this.trajectoryLine = null;
    }
    if (state.preFire) {
      const pf = state.preFire;
      const VIS_Y = 0.18;
      const from = new Vector3(state.launcher.x, VIS_Y, state.launcher.z);
      const to = new Vector3(pf.estIPx, VIS_Y, pf.estIPz);
      if (pf.blocked) {
        this.trajectoryLine = this.createLine("simTraj", [from, to], 1.0, 0.3, 0.3, 1.0);
      } else {
        this.trajectoryLine = this.createLine("simTraj", [from, to], 0.4, 1.0, 0.4, 1.0);
      }
    }
  }

  private syncBallTrailVisualization(state: SimVisState): void {
    if (this.ballTrailLine) {
      this.ballTrailLine.dispose();
      this.ballTrailLine = null;
    }

    if (state.ballTrailPositions.length >= 2) {
      this.ballTrailLine = this.createLine(
        "simBallTrail", state.ballTrailPositions,
        1.0, 0.85, 0.2, 0.6,
      );
    }
  }

  private syncInterceptMarker(state: SimVisState): void {
    if (this.interceptMarkerLine) {
      this.interceptMarkerLine.dispose();
      this.interceptMarkerLine = null;
    }

    if (state.interceptPt && state.ballActive) {
      const ix = state.interceptPt.x;
      const iz = state.interceptPt.z;
      const s = 0.3;
      const VIS_Y = 0.16;
      this.interceptMarkerLine = this.createLine(
        "simIntercept",
        [
          new Vector3(ix - s, VIS_Y, iz - s),
          new Vector3(ix + s, VIS_Y, iz + s),
          new Vector3(ix, VIS_Y, iz),
          new Vector3(ix + s, VIS_Y, iz - s),
          new Vector3(ix - s, VIS_Y, iz + s),
        ],
        1.0, 0.4, 0.4, 0.8,
      );
    }
  }

  // =========================================================================
  // Arm dynamic sync — ボール方向に手を向ける（スムーズ補間付き）
  // =========================================================================

  /**
   * 全エンティティの腕を更新。
   * ボールが上半身基準点から2m以内なら両手をボール方向へ向ける。
   * 指数減衰Lerpで方向ベクトルを補間し、スムーズに遷移する。
   */
  private syncArms(state: SimVisState): void {
    const ballPos = state.ballPosition;
    const alpha = 1 - Math.exp(-ARM_LERP_SPEED * state.dt);

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

      if (ballPos && state.ballActive) {
        const dx = ballPos.x - ex;
        const dy = ballPos.y - refY;
        const dz = ballPos.z - ez;
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

        if (dist < BALL_REACT_RADIUS && dist > 0.01) {
          // ボールが範囲内 → エンティティのローカル座標に変換
          parent.computeWorldMatrix(true);
          const localBall = Vector3.TransformCoordinates(
            ballPos, parent.getWorldMatrix().clone().invert(),
          );

          // 各肩からボールへの方向ベクトルを計算
          targetLeftDir = this.computeArmDir(-1, localBall);
          targetRightDir = this.computeArmDir(1, localBall);
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

      // 顔寸法を保存（FOV描画で使用）
      this.headFaceForwardOffset = result.faceForwardOffset;
      // 顔中心のワールドY = entity root offset(ENTITY_HEIGHT/2) + head child offset(ENTITY_HEIGHT/2) + faceCenterHeight
      this.headFaceCenterY = ENTITY_HEIGHT / 2 + result.faceCenterHeight;

      const mat = new StandardMaterial("voxHeadMat", this.scene);
      mat.emissiveColor = Color3.White();
      mat.disableLighting = true;
      mat.backFaceCulling = false;

      const parents = [
        this.launcherMesh,
        ...this.targetMeshes,
        ...this.obstacleMeshes,
      ];

      for (let i = 0; i < parents.length; i++) {
        const clone = result.mesh.clone(`facingHead_${i}`);
        clone.material = mat;
        clone.parent = parents[i];
        clone.position.y = ENTITY_HEIGHT / 2;
        clone.setEnabled(true);
        this.facingIndicators.push(clone);
      }

      result.mesh.dispose();
    } catch (e) {
      console.error("[SimVisualization] Failed to load VOX head:", e);
    }
  }

  // =========================================================================
  // Action gauge visualization
  // =========================================================================

  private createActionGauges(count: number): void {
    const phaseColors = [
      new Color3(1.0, 0.85, 0.0),   // startup: yellow
      new Color3(0.0, 0.8, 1.0),    // active: cyan
      new Color3(1.0, 0.25, 0.25),  // recovery: red
    ];

    for (let i = 0; i < count; i++) {
      const root = new TransformNode(`gaugeRoot_${i}`, this.scene);
      root.billboardMode = TransformNode.BILLBOARDMODE_ALL;
      root.setEnabled(false);

      // Background
      const bgMat = new StandardMaterial(`gaugeBgMat_${i}`, this.scene);
      bgMat.diffuseColor = new Color3(0.12, 0.12, 0.12);
      bgMat.specularColor = Color3.Black();
      bgMat.alpha = 0.7;
      const bg = MeshBuilder.CreatePlane(`gaugeBg_${i}`, { width: GAUGE_W, height: GAUGE_H }, this.scene);
      bg.material = bgMat;
      bg.parent = root;
      bg.position.z = 0.001; // slightly behind fill planes
      bg.isPickable = false;

      // Phase fill planes
      const phases: Mesh[] = [];
      const phaseMats: StandardMaterial[] = [];
      for (let p = 0; p < 3; p++) {
        const mat = new StandardMaterial(`gaugePhMat_${i}_${p}`, this.scene);
        mat.diffuseColor = phaseColors[p];
        mat.specularColor = Color3.Black();
        mat.emissiveColor = phaseColors[p].scale(0.3);
        mat.alpha = 1.0;

        const plane = MeshBuilder.CreatePlane(`gaugePh_${i}_${p}`, {
          width: 1, height: GAUGE_H * 0.85,
        }, this.scene);
        plane.material = mat;
        plane.parent = root;
        plane.isPickable = false;

        phases.push(plane);
        phaseMats.push(mat);
      }

      this.gauges.push({
        root,
        bg,
        phases: phases as [Mesh, Mesh, Mesh],
        phaseMats: phaseMats as [StandardMaterial, StandardMaterial, StandardMaterial],
      });
    }
  }

  private disposeActionGauges(): void {
    for (const g of this.gauges) {
      g.phases.forEach(p => { p.material?.dispose(); p.dispose(); });
      g.bg.material?.dispose();
      g.bg.dispose();
      g.root.dispose();
    }
    this.gauges = [];
  }

  private syncActionGauges(state: SimVisState): void {
    const entities: { x: number; z: number }[] = [
      state.launcher,
      ...state.targets,
      ...state.obstacles,
    ];

    for (let i = 0; i < this.gauges.length && i < state.actionStates.length; i++) {
      const g = this.gauges[i];
      const as = state.actionStates[i];
      const ent = entities[i];

      // idle / move は常時発生するためゲージ非表示
      if (as.phase === 'idle' || !as.timing || as.type === 'move') {
        g.root.setEnabled(false);
        continue;
      }

      g.root.setEnabled(true);
      g.root.position.set(ent.x, ENTITY_HEIGHT + GAUGE_Y_OFFSET, ent.z);

      const t = as.timing;
      const total = t.startup + t.active + t.recovery;
      if (total <= 0) { g.root.setEnabled(false); continue; }

      const phaseWidths = [
        GAUGE_W * (t.startup / total),
        GAUGE_W * (t.active / total),
        GAUGE_W * (t.recovery / total),
      ];
      const phaseDurations = [t.startup, t.active, t.recovery];
      const phaseIdx = as.phase === 'startup' ? 0 : as.phase === 'active' ? 1 : 2;

      let xOffset = -GAUGE_W / 2;

      for (let p = 0; p < 3; p++) {
        const pw = phaseWidths[p];
        const dur = phaseDurations[p];

        if (pw < 0.001 || dur <= 0) {
          g.phases[p].setEnabled(false);
          xOffset += pw;
          continue;
        }

        g.phases[p].setEnabled(true);

        let fillRatio: number;
        if (p < phaseIdx) {
          // Past phase: fully filled
          fillRatio = 1.0;
          g.phaseMats[p].alpha = 0.6;
        } else if (p === phaseIdx) {
          // Current phase: partial fill
          fillRatio = Math.min(as.elapsed / dur, 1.0);
          g.phaseMats[p].alpha = 1.0;
        } else {
          // Future phase: dim outline
          fillRatio = 1.0;
          g.phaseMats[p].alpha = 0.15;
        }

        const fillW = pw * fillRatio;
        g.phases[p].scaling.x = Math.max(fillW, 0.002);
        g.phases[p].position.x = xOffset + fillW / 2;

        xOffset += pw;
      }
    }
  }
}
