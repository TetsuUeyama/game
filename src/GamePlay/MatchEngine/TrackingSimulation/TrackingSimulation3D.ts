/**
 * TrackingSimulation3D - 3D Babylon.js version of the 2D tracking simulation
 * Uses Ball.ts entity with DeterministicTrajectory for projectile physics
 */

import {
  Scene,
  MeshBuilder,
  StandardMaterial,
  Color3,
  Vector3,
  Mesh,
  LinesMesh,
  Observer,
} from "@babylonjs/core";

import {
  ENTITY_HEIGHT,
  LAUNCHER_SIZE,
  TARGET_SIZE,
  OBSTACLE_SIZE,
  HIT_RADIUS,
  BLOCK_RADIUS,
  LAUNCHER_SPEED,
  TARGET_RANDOM_SPEED,
  TARGET_INTERCEPT_SPEED,
  OB_A_IDLE_SPEED,
  OB_A_INTERCEPT_SPEED,
  OB_B_CHASE_SPEED,
  OB_C_IDLE_SPEED,
  OB_C_INTERCEPT_SPEED,
  OB_D_IDLE_SPEED,
  OB_D_INTERCEPT_SPEED,
  OB_E_IDLE_SPEED,
  OB_E_INTERCEPT_SPEED,
  BALL_SPEED,
  OB_A_HOVER_RADIUS,
  OB_B_HOVER_RADIUS,
  OB_C_HOVER_RADIUS,
  OB_D_HOVER_RADIUS,
  OB_E_HOVER_RADIUS,
  BALL_TIMEOUT,
  SIM_FIELD_X_HALF,
  SIM_FIELD_Z_HALF,
  SIM_MARGIN,
  TARGET_COLORS_3D,
  SOLVER_CFG_3D,
  INIT_LAUNCHER,
  INIT_TARGETS,
  INIT_OBSTACLES,
  T4_X1, T4_Z1, T4_X2, T4_Z2,
  T5_X1, T5_Z1, T5_X2, T5_Z2,
  FOV_FULL_LEN,
  FOV_WINDOW_LEN,
} from "./TrackingSimConstants";

import {
  type SimMover,
  type SimBall,
  type SimScanMemory,
  type SimPreFireInfo,
  type TrackingSimScore,
  makeMover,
  makeScanMemory,
  stepMover,
  setChaserVelocity,
  moveKeepFacing,
  moveWithFacing,
  restoreRandom,
  dist2d,
  isTrajectoryInFOV,
  canReachTrajectory,
  isPhysicallyClose,
  canTargetReach,
  canObIntercept,
  moveTargetToOpenSpace,
  randFire,
  updateScan,
  solveLaunch,
  fovHalfAtDist,
  dirSpeedMult,
} from "./TrackingSimAI";

import { Ball } from "@/GamePlay/Object/Entities/Ball";

/** Ball launch/target Y height (upper portion of entity boxes) */
const BALL_LAUNCH_Y = ENTITY_HEIGHT * 0.7;
/** Max Y for collision detection (entity top + tolerance) */
const BALL_COLLISION_Y_MAX = ENTITY_HEIGHT + 0.5;

export class TrackingSimulation3D {
  private scene: Scene;
  private ball: Ball;
  private observer: Observer<Scene> | null = null;

  // Meshes (Ball manages its own mesh via Havok physics)
  private launcherMesh!: Mesh;
  private targetMeshes: Mesh[] = [];
  private obstacleMeshes: Mesh[] = [];
  private fovLines: LinesMesh[] = [];
  private trajectoryLine: LinesMesh | null = null;

  // Additional visualization meshes
  private fovWindowLines: LinesMesh[] = [];
  private reachLines: LinesMesh[] = [];
  private ballTrailLine: LinesMesh | null = null;
  private interceptMarkerLine: LinesMesh | null = null;
  private ballTrailPositions: Vector3[] = [];
  private static readonly BALL_TRAIL_MAX = 40;

  // Simulation state
  private launcher!: SimMover;
  private targets: SimMover[] = [];
  private obstacles: SimMover[] = [];
  private ballActive = false;
  private ballAge = 0;
  private score: TrackingSimScore = { hit: 0, block: 0, miss: 0 };

  private cooldown = 2.0;
  private selectedTargetIdx = 0;
  private preFire: SimPreFireInfo | null = null;
  private interceptPt: { x: number; z: number } | null = null;

  private obReacting = [false, false, false, false, false];

  // Scan state
  private obScanAtLauncher = [true, true, false, false, true];
  private obScanTimers = [2.0, 1.5, 1.0, 1.8, 1.2];
  private obFocusDists = [4.5, 2.25, 3.0, 3.75, 3.0];
  private obMems: SimScanMemory[] = [];

  // Target movement
  private targetDests: ({ x: number; z: number } | null)[] = [null, null, null, null, null];
  private targetReevalTimers = [0.5, 0.7, 0.9, 1.1, 0.6];

  private prevTime = 0;

  constructor(scene: Scene, ball: Ball) {
    this.scene = scene;
    this.ball = ball;
    this.ball.mesh.setEnabled(false);
  }

  public start(): void {
    this.initState();
    this.createMeshes();
    this.prevTime = performance.now();
    this.observer = this.scene.onBeforeRenderObservable.add(() => {
      const now = performance.now();
      const dt = Math.min((now - this.prevTime) / 1000, 0.1);
      this.prevTime = now;
      this.update(dt);
      this.syncMeshes();
    });
  }

  public dispose(): void {
    if (this.observer) {
      this.scene.onBeforeRenderObservable.remove(this.observer);
      this.observer = null;
    }
    this.deactivateBall();
    this.disposeMeshes();
  }

  public getScore(): TrackingSimScore {
    return { ...this.score };
  }

  public reset(): void {
    this.deactivateBall();
    this.disposeMeshes();
    this.initState();
    this.createMeshes();
  }

  // =========================================================================
  // Ball helpers
  // =========================================================================

  private deactivateBall(): void {
    if (this.ball.isInFlight()) {
      this.ball.endFlight();
    }
    this.ball.mesh.setEnabled(false);
    this.ballActive = false;
    this.ballAge = 0;
    this.ballTrailPositions = [];
  }

  /**
   * Fire ball with arc trajectory using Ball.ts's shootWithArcHeight
   * Uses DeterministicTrajectory internally for physics-based parabolic flight
   */
  private fireBallArc(startX: number, startZ: number, targetX: number, targetZ: number): boolean {
    const startPos = new Vector3(startX, BALL_LAUNCH_Y, startZ);
    const targetPos = new Vector3(targetX, BALL_LAUNCH_Y, targetZ);
    const distance = dist2d(startX, startZ, targetX, targetZ);
    // Arc height proportional to distance (higher arc = slower ball)
    const arcHeight = Math.max(0.3, distance * 0.10);

    this.ball.mesh.setEnabled(true);
    const success = this.ball.shootWithArcHeight(targetPos, arcHeight, startPos);
    if (success) {
      this.ballActive = true;
      this.ballAge = 0;
    }
    return success;
  }

  private resetAfterResult(cooldownTime: number): void {
    this.cooldown = cooldownTime;
    this.interceptPt = null;
    this.obReacting = [false, false, false, false, false];
    for (let ti = 0; ti < this.targets.length; ti++) this.targetDests[ti] = null;
    for (const t of this.targets) restoreRandom(t, TARGET_RANDOM_SPEED);
    restoreRandom(this.obstacles[0], OB_A_IDLE_SPEED);
    restoreRandom(this.obstacles[2], OB_C_IDLE_SPEED);
    restoreRandom(this.obstacles[3], OB_D_IDLE_SPEED);
    restoreRandom(this.obstacles[4], OB_E_IDLE_SPEED);
  }

  // =========================================================================
  // State init
  // =========================================================================

  private initState(): void {
    this.launcher = makeMover(INIT_LAUNCHER.x, INIT_LAUNCHER.z, LAUNCHER_SPEED);
    this.targets = INIT_TARGETS.map(p => makeMover(p.x, p.z, TARGET_RANDOM_SPEED));
    this.obstacles = [
      makeMover(INIT_OBSTACLES[0].x, INIT_OBSTACLES[0].z, OB_A_IDLE_SPEED),
      makeMover(INIT_OBSTACLES[1].x, INIT_OBSTACLES[1].z, OB_B_CHASE_SPEED),
      makeMover(INIT_OBSTACLES[2].x, INIT_OBSTACLES[2].z, OB_C_IDLE_SPEED),
      makeMover(INIT_OBSTACLES[3].x, INIT_OBSTACLES[3].z, OB_D_IDLE_SPEED),
      makeMover(INIT_OBSTACLES[4].x, INIT_OBSTACLES[4].z, OB_E_IDLE_SPEED),
    ];
    this.ballActive = false;
    this.ballAge = 0;
    this.score = { hit: 0, block: 0, miss: 0 };
    this.cooldown = 2.0;
    this.selectedTargetIdx = 0;
    this.preFire = null;
    this.interceptPt = null;
    this.obReacting = [false, false, false, false, false];
    this.obScanAtLauncher = [true, true, false, false, true];
    this.obScanTimers = [2.0, 1.5, 1.0, 1.8, 1.2];
    this.obFocusDists = [4.5, 2.25, 3.0, 3.75, 3.0];
    this.targetDests = [null, null, null, null, null];
    this.targetReevalTimers = [0.5, 0.7, 0.9, 1.1, 0.6];

    const lx = INIT_LAUNCHER.x;
    const lz = INIT_LAUNCHER.z;
    this.obMems = [
      makeScanMemory(lx, lz, INIT_TARGETS[0].x, INIT_TARGETS[0].z),
      makeScanMemory(lx, lz, INIT_TARGETS[0].x, INIT_TARGETS[0].z),
      makeScanMemory(lx, lz, INIT_TARGETS[0].x, INIT_TARGETS[0].z),
      makeScanMemory(lx, lz, INIT_TARGETS[3].x, INIT_TARGETS[3].z),
      makeScanMemory(lx, lz, INIT_TARGETS[4].x, INIT_TARGETS[4].z),
    ];
  }

  // =========================================================================
  // Mesh creation / disposal
  // =========================================================================

  private createMeshes(): void {
    // Launcher (green box)
    this.launcherMesh = MeshBuilder.CreateBox("simLauncher", {
      width: LAUNCHER_SIZE, height: ENTITY_HEIGHT, depth: LAUNCHER_SIZE,
    }, this.scene);
    const launcherMat = new StandardMaterial("simLauncherMat", this.scene);
    launcherMat.diffuseColor = new Color3(0.27, 0.8, 0.27);
    launcherMat.specularColor = Color3.Black();
    this.launcherMesh.material = launcherMat;

    // Targets (colored boxes)
    for (let i = 0; i < 5; i++) {
      const mesh = MeshBuilder.CreateBox(`simTarget${i}`, {
        width: TARGET_SIZE, height: ENTITY_HEIGHT, depth: TARGET_SIZE,
      }, this.scene);
      const mat = new StandardMaterial(`simTargetMat${i}`, this.scene);
      const c = TARGET_COLORS_3D[i];
      mat.diffuseColor = new Color3(c.r, c.g, c.b);
      mat.specularColor = Color3.Black();
      mesh.material = mat;
      this.targetMeshes.push(mesh);
    }

    // Obstacles (purple boxes)
    for (let i = 0; i < 5; i++) {
      const mesh = MeshBuilder.CreateBox(`simOb${i}`, {
        width: OBSTACLE_SIZE, height: ENTITY_HEIGHT, depth: OBSTACLE_SIZE,
      }, this.scene);
      const mat = new StandardMaterial(`simObMat${i}`, this.scene);
      mat.diffuseColor = new Color3(0.6, 0.4, 0.8);
      mat.specularColor = Color3.Black();
      mesh.material = mat;
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
  }

  private disposeMeshes(): void {
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
    this.ballTrailPositions = [];
  }

  // =========================================================================
  // Sync state -> meshes
  // =========================================================================

  private syncMeshes(): void {
    const yh = ENTITY_HEIGHT / 2;

    // Launcher
    this.launcherMesh.position.set(this.launcher.x, yh, this.launcher.z);
    this.launcherMesh.rotation.y = -this.launcher.facing;

    // Targets
    for (let i = 0; i < 5; i++) {
      this.targetMeshes[i].position.set(this.targets[i].x, yh, this.targets[i].z);
      this.targetMeshes[i].rotation.y = -this.targets[i].facing;
    }

    // Obstacles
    for (let i = 0; i < 5; i++) {
      this.obstacleMeshes[i].position.set(this.obstacles[i].x, yh, this.obstacles[i].z);
      this.obstacleMeshes[i].rotation.y = -this.obstacles[i].facing;
    }

    // Ball visibility (position controlled by Havok physics when in flight)
    this.ball.mesh.setEnabled(this.ballActive);

    // Visualization (wrapped in try-catch to prevent silent failures)
    try {
      this.syncFovVisualization();
      this.syncReachVisualization();
      this.syncTrajectoryVisualization();
      this.syncBallTrailVisualization();
      this.syncInterceptMarker();
    } catch (e) {
      console.error('[TrackingSimulation3D] visualization error:', e);
    }
  }

  // =========================================================================
  // Helper: create a line mesh with solid color + alpha
  // (More reliable than per-vertex Color4 across WebGL implementations)
  // =========================================================================

  private createLine(name: string, points: Vector3[], r: number, g: number, b: number, alpha = 1.0): LinesMesh {
    const line = MeshBuilder.CreateLines(name, { points }, this.scene);
    line.color = new Color3(r, g, b);
    if (alpha < 1.0) {
      line.alpha = alpha;
    }
    return line;
  }

  // =========================================================================
  // FOV visualization: edge lines + sliding window
  // =========================================================================

  private syncFovVisualization(): void {
    const VIS_Y = 0.15;

    for (let i = 0; i < 5; i++) {
      const ob = this.obstacles[i];
      const mem = this.obMems[i];
      const searching = mem.searching;
      const fovHalf = searching
        ? Math.PI / 6
        : fovHalfAtDist(this.obFocusDists[i]);

      // --- Edge lines (full length FOV boundaries) ---
      const len = FOV_FULL_LEN;
      const leftAngle = ob.facing + fovHalf;
      const rightAngle = ob.facing - fovHalf;
      const origin = new Vector3(ob.x, VIS_Y, ob.z);
      const leftEnd = new Vector3(
        ob.x + Math.cos(leftAngle) * len, VIS_Y,
        ob.z + Math.sin(leftAngle) * len,
      );
      const rightEnd = new Vector3(
        ob.x + Math.cos(rightAngle) * len, VIS_Y,
        ob.z + Math.sin(rightAngle) * len,
      );

      this.fovLines[i].dispose();
      if (searching) {
        this.fovLines[i] = this.createLine(`simFov${i}`, [leftEnd, origin, rightEnd], 1.0, 0.78, 0.39, 0.5);
      } else {
        this.fovLines[i] = this.createLine(`simFov${i}`, [leftEnd, origin, rightEnd], 0.6, 0.4, 0.8, 0.5);
      }

      // --- Sliding window (annular sector at focus distance) ---
      if (this.fovWindowLines[i]) this.fovWindowLines[i].dispose();

      const focusDist = this.obFocusDists[i];
      const halfWin = FOV_WINDOW_LEN / 2;
      const innerR = Math.max(0.1, focusDist - halfWin);
      const outerR = focusDist + halfWin;
      const arcSteps = 20;

      // Check if trajectory is in FOV for highlight color
      let trajInFov = false;
      if (this.preFire) {
        trajInFov = isTrajectoryInFOV(ob, this.launcher.x, this.launcher.z,
          this.preFire.estIPx, this.preFire.estIPz);
      }

      // Build window outline: inner arc → right radial → outer arc (reversed) → left radial
      const windowPoints: Vector3[] = [];

      // Inner arc (left to right)
      for (let s = 0; s <= arcSteps; s++) {
        const t = s / arcSteps;
        const angle = ob.facing - fovHalf + (2 * fovHalf) * t;
        windowPoints.push(new Vector3(
          ob.x + Math.cos(angle) * innerR, VIS_Y - 0.01,
          ob.z + Math.sin(angle) * innerR,
        ));
      }
      // Right radial (inner to outer)
      windowPoints.push(new Vector3(
        ob.x + Math.cos(ob.facing + fovHalf) * outerR, VIS_Y - 0.01,
        ob.z + Math.sin(ob.facing + fovHalf) * outerR,
      ));
      // Outer arc (right to left, reversed)
      for (let s = arcSteps; s >= 0; s--) {
        const t = s / arcSteps;
        const angle = ob.facing - fovHalf + (2 * fovHalf) * t;
        windowPoints.push(new Vector3(
          ob.x + Math.cos(angle) * outerR, VIS_Y - 0.01,
          ob.z + Math.sin(angle) * outerR,
        ));
      }
      // Left radial (outer to inner, close the shape)
      windowPoints.push(new Vector3(
        ob.x + Math.cos(ob.facing - fovHalf) * innerR, VIS_Y - 0.01,
        ob.z + Math.sin(ob.facing - fovHalf) * innerR,
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

  // =========================================================================
  // Directional reach visualization (egg-shaped interception range)
  // =========================================================================

  private syncReachVisualization(): void {
    for (let i = 0; i < this.reachLines.length; i++) {
      if (this.reachLines[i]) this.reachLines[i].dispose();
    }
    this.reachLines = [];

    // Only draw reach circles when pre-fire info is available
    if (!this.preFire) return;

    const pf = this.preFire;
    const VIS_Y = 0.12;

    for (let i = 0; i < 5; i++) {
      const ob = this.obstacles[i];
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

  // =========================================================================
  // Pre-fire trajectory line
  // =========================================================================

  private syncTrajectoryVisualization(): void {
    if (this.trajectoryLine) {
      this.trajectoryLine.dispose();
      this.trajectoryLine = null;
    }
    if (this.preFire) {
      const pf = this.preFire;
      const VIS_Y = 0.18;
      const from = new Vector3(this.launcher.x, VIS_Y, this.launcher.z);
      const to = new Vector3(pf.estIPx, VIS_Y, pf.estIPz);
      if (pf.blocked) {
        this.trajectoryLine = this.createLine("simTraj", [from, to], 1.0, 0.3, 0.3, 1.0);
      } else {
        this.trajectoryLine = this.createLine("simTraj", [from, to], 0.4, 1.0, 0.4, 1.0);
      }
    }
  }

  // =========================================================================
  // Ball trail visualization (3D arc trail during flight)
  // =========================================================================

  private syncBallTrailVisualization(): void {
    if (this.ballTrailLine) {
      this.ballTrailLine.dispose();
      this.ballTrailLine = null;
    }

    if (this.ballTrailPositions.length >= 2) {
      this.ballTrailLine = this.createLine(
        "simBallTrail", this.ballTrailPositions,
        1.0, 0.85, 0.2, 0.6,
      );
    }
  }

  // =========================================================================
  // Intercept point marker (X at predicted intercept)
  // =========================================================================

  private syncInterceptMarker(): void {
    if (this.interceptMarkerLine) {
      this.interceptMarkerLine.dispose();
      this.interceptMarkerLine = null;
    }

    if (this.interceptPt && this.ballActive) {
      const ix = this.interceptPt.x;
      const iz = this.interceptPt.z;
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
  // Main update (ported from 2D lines 829-1367)
  // =========================================================================

  private update(dt: number): void {
    const { launcher, targets, obstacles } = this;
    const allObs = obstacles;
    const obIntSpeeds = [
      OB_A_INTERCEPT_SPEED, OB_B_CHASE_SPEED, OB_C_INTERCEPT_SPEED,
      OB_D_INTERCEPT_SPEED, OB_E_INTERCEPT_SPEED,
    ];

    // Launcher: random movement
    stepMover(launcher, dt);

    // Obstacle B: chase launcher (unless searching)
    if (!this.obMems[1].searching) {
      setChaserVelocity(allObs[1], launcher.x, launcher.z, OB_B_CHASE_SPEED, OB_B_HOVER_RADIUS, dt);
      moveKeepFacing(allObs[1], OB_B_CHASE_SPEED, dt);
    }

    const selTarget = targets[this.selectedTargetIdx];

    if (!this.ballActive) {
      // === All targets: move toward open space ===
      for (let ti = 0; ti < targets.length; ti++) {
        const areaInfo = ti === 3 ? { x1: T4_X1, z1: T4_Z1, x2: T4_X2, z2: T4_Z2 }
          : ti === 4 ? { x1: T5_X1, z1: T5_Z1, x2: T5_X2, z2: T5_Z2 }
          : null;

        if (areaInfo) {
          const tgt = targets[ti];
          this.targetReevalTimers[ti] -= dt;
          const atD = this.targetDests[ti] && dist2d(tgt.x, tgt.z, this.targetDests[ti]!.x, this.targetDests[ti]!.z) < 10 * 0.015;
          if (this.targetReevalTimers[ti] <= 0 || !this.targetDests[ti] || atD) {
            this.targetDests[ti] = {
              x: areaInfo.x1 + Math.random() * (areaInfo.x2 - areaInfo.x1),
              z: areaInfo.z1 + Math.random() * (areaInfo.z2 - areaInfo.z1),
            };
            this.targetReevalTimers[ti] = 0.8 + Math.random() * 0.8;
          }
          const dx = this.targetDests[ti]!.x - tgt.x;
          const dz = this.targetDests[ti]!.z - tgt.z;
          const d = Math.sqrt(dx * dx + dz * dz);
          if (d > 3 * 0.015) {
            tgt.vx = (dx / d) * TARGET_RANDOM_SPEED * 0.5;
            tgt.vz = (dz / d) * TARGET_RANDOM_SPEED * 0.5;
          } else {
            tgt.vx = 0; tgt.vz = 0;
          }
          moveWithFacing(tgt, TARGET_RANDOM_SPEED * 0.5, dt);
          tgt.x = Math.max(areaInfo.x1 + 5 * 0.015, Math.min(areaInfo.x2 - 5 * 0.015, tgt.x));
          tgt.z = Math.max(areaInfo.z1 + 5 * 0.015, Math.min(areaInfo.z2 - 5 * 0.015, tgt.z));
        } else {
          const res = moveTargetToOpenSpace(
            targets[ti], this.targetDests[ti], this.targetReevalTimers[ti], dt, launcher, allObs,
          );
          this.targetDests[ti] = res.dest;
          this.targetReevalTimers[ti] = res.reevalTimer;
        }
      }

      // Obstacle A: move to midpoint of launcher and selected target
      if (!this.obMems[0].searching) {
        const midX = (launcher.x + selTarget.x) / 2;
        const midZ = (launcher.z + selTarget.z) / 2;
        setChaserVelocity(allObs[0], midX, midZ, OB_A_IDLE_SPEED, OB_A_HOVER_RADIUS, dt);
        moveKeepFacing(allObs[0], OB_A_IDLE_SPEED, dt);
      }
      // Obstacle C: chase target 1
      if (!this.obMems[2].searching) {
        setChaserVelocity(allObs[2], targets[0].x, targets[0].z, OB_C_IDLE_SPEED, OB_C_HOVER_RADIUS, dt);
        moveKeepFacing(allObs[2], OB_C_IDLE_SPEED, dt);
      }
      // Obstacle D: chase target 4
      if (!this.obMems[3].searching) {
        setChaserVelocity(allObs[3], targets[3].x, targets[3].z, OB_D_IDLE_SPEED, OB_D_HOVER_RADIUS, dt);
        moveKeepFacing(allObs[3], OB_D_IDLE_SPEED, dt);
      }
      // Obstacle E: chase target 5
      if (!this.obMems[4].searching) {
        setChaserVelocity(allObs[4], targets[4].x, targets[4].z, OB_E_IDLE_SPEED, OB_E_HOVER_RADIUS, dt);
        moveKeepFacing(allObs[4], OB_E_IDLE_SPEED, dt);
      }

      // === Pre-fire evaluation ===
      let bestIdx = 0;
      let bestScore = -Infinity;
      let bestPF: SimPreFireInfo | null = null;

      for (let ti = 0; ti < targets.length; ti++) {
        const tgt = targets[ti];
        const estDist = dist2d(launcher.x, launcher.z, tgt.x, tgt.z);
        const estFT = Math.max(0.3, estDist / BALL_SPEED);
        const estIPx = tgt.x + tgt.vx * estFT;
        const estIPz = tgt.z + tgt.vz * estFT;

        const obReaches = allObs.map((_, oi) => obIntSpeeds[oi] * estFT);
        const targetReach = TARGET_INTERCEPT_SPEED * estFT;
        const tgtCanReach = canTargetReach(tgt, estIPx, estIPz, targetReach);

        const obInFOVs = allObs.map(ob => isTrajectoryInFOV(ob, launcher.x, launcher.z, estIPx, estIPz));
        const obBlocks = allObs.map((ob, oi) =>
          (obInFOVs[oi] && canReachTrajectory(ob, launcher.x, launcher.z, estIPx, estIPz, obReaches[oi]))
          || isPhysicallyClose(ob, launcher.x, launcher.z, estIPx, estIPz));

        const blocked = obBlocks.some(b => b) || !tgtCanReach;
        const blockerCount = obBlocks.filter(b => b).length;
        const score = -blockerCount * 10 + (tgtCanReach ? 5 : 0) - estDist * 0.01;

        const pf: SimPreFireInfo = {
          targetIdx: ti, estFlightTime: estFT, estIPx, estIPz,
          obReaches, obInFOVs, obBlocks,
          targetReach, targetCanReach: tgtCanReach, blocked,
        };

        if (score > bestScore) {
          bestScore = score;
          bestIdx = ti;
          bestPF = pf;
        }
      }

      this.selectedTargetIdx = bestIdx;
      this.preFire = bestPF;

      // === Fire cooldown ===
      this.cooldown -= dt;
      if (this.cooldown <= 0) {
        let fired = false;
        const order = targets.map((_, i) => i).sort((a, b) => {
          if (a === bestIdx) return -1;
          if (b === bestIdx) return 1;
          return 0;
        });

        for (const ti of order) {
          const tgt = targets[ti];
          const sol = solveLaunch(
            launcher.x, launcher.z,
            tgt.x, tgt.z, tgt.vx, tgt.vz,
            BALL_SPEED, SOLVER_CFG_3D,
          );

          const fieldXMin = -SIM_FIELD_X_HALF + SIM_MARGIN;
          const fieldXMax = SIM_FIELD_X_HALF - SIM_MARGIN;
          const fieldZMin = -SIM_FIELD_Z_HALF + SIM_MARGIN;
          const fieldZMax = SIM_FIELD_Z_HALF - SIM_MARGIN;
          const ipInField = sol?.valid
            && sol.interceptPos.x >= fieldXMin && sol.interceptPos.x <= fieldXMax
            && sol.interceptPos.z >= fieldZMin && sol.interceptPos.z <= fieldZMax;

          if (!sol?.valid || !ipInField) continue;

          const bvx = sol.launchVelocity.x;
          const bvz = sol.launchVelocity.z;
          const ft = sol.flightTime;
          const ipx = sol.interceptPos.x;
          const ipz = sol.interceptPos.z;

          const tReach = TARGET_INTERCEPT_SPEED * ft;
          const tCanReach = canTargetReach(tgt, ipx, ipz, tReach);

          const obFOVs = allObs.map(ob => isTrajectoryInFOV(ob, launcher.x, launcher.z, ipx, ipz));
          let anyBlock = false;
          for (let oi = 0; oi < allObs.length; oi++) {
            const canBlock = (obFOVs[oi] && canObIntercept(allObs[oi], launcher.x, launcher.z, bvx, bvz, obIntSpeeds[oi], ft))
              || isPhysicallyClose(allObs[oi], launcher.x, launcher.z, ipx, ipz);
            if (canBlock) { anyBlock = true; break; }
          }

          if (anyBlock || !tCanReach) continue;

          // Fire ball with arc trajectory!
          const success = this.fireBallArc(launcher.x, launcher.z, ipx, ipz);
          if (!success) continue;

          this.interceptPt = { x: ipx, z: ipz };
          this.selectedTargetIdx = ti;
          this.preFire = null;

          // Selected target: move toward intercept point
          const tdx = ipx - tgt.x;
          const tdz = ipz - tgt.z;
          const tdist = Math.sqrt(tdx * tdx + tdz * tdz);
          if (tdist < 5 * 0.015) {
            tgt.vx = 0; tgt.vz = 0;
          } else {
            tgt.vx = (tdx / tdist) * TARGET_INTERCEPT_SPEED;
            tgt.vz = (tdz / tdist) * TARGET_INTERCEPT_SPEED;
          }

          // Reacting obstacles: use actual ball velocity for intercept calculation
          const reactingObs = [false, false, false, false, false];
          const bPos = this.ball.getPosition();
          const bVel = this.ball.getVelocity();
          for (let oi = 0; oi < allObs.length; oi++) {
            if (oi === 1) continue; // obB is not reactive
            if (!obFOVs[oi]) continue;
            reactingObs[oi] = true;
            const obSol = solveLaunch(
              allObs[oi].x, allObs[oi].z,
              bPos.x, bPos.z, bVel.x, bVel.z,
              obIntSpeeds[oi], SOLVER_CFG_3D,
            );
            if (obSol?.valid) {
              allObs[oi].vx = obSol.launchVelocity.x;
              allObs[oi].vz = obSol.launchVelocity.z;
            } else {
              const dx = bPos.x - allObs[oi].x;
              const dz = bPos.z - allObs[oi].z;
              const dd = Math.sqrt(dx * dx + dz * dz) || 1;
              allObs[oi].vx = (dx / dd) * obIntSpeeds[oi];
              allObs[oi].vz = (dz / dd) * obIntSpeeds[oi];
            }
          }
          this.obReacting = reactingObs;
          this.cooldown = randFire();
          fired = true;
          break;
        }

        if (!fired) this.cooldown = 0.3;
      }
    } else {
      // === Ball in flight ===
      this.preFire = null;

      // Update Ball physics (Havok handles trajectory)
      this.ball.update(dt);
      this.ballAge += dt;

      // Get ball 3D position for collision checks
      const ballPos = this.ball.getPosition();

      // Track ball trail positions
      this.ballTrailPositions.push(ballPos.clone());
      if (this.ballTrailPositions.length > TrackingSimulation3D.BALL_TRAIL_MAX) {
        this.ballTrailPositions.shift();
      }

      // Selected target: move toward intercept point
      const selTgt = targets[this.selectedTargetIdx];
      if (this.interceptPt) {
        const idx = this.interceptPt.x - selTgt.x;
        const idz = this.interceptPt.z - selTgt.z;
        if (Math.sqrt(idx * idx + idz * idz) > 5 * 0.015) {
          moveWithFacing(selTgt, TARGET_INTERCEPT_SPEED, dt);
        } else {
          selTgt.vx = 0;
          selTgt.vz = 0;
        }
      }

      // Other targets continue normal movement
      for (let ti = 0; ti < targets.length; ti++) {
        if (ti === this.selectedTargetIdx) continue;
        const areaInfo = ti === 3 ? { x1: T4_X1, z1: T4_Z1, x2: T4_X2, z2: T4_Z2 }
          : ti === 4 ? { x1: T5_X1, z1: T5_Z1, x2: T5_X2, z2: T5_Z2 }
          : null;

        if (areaInfo) {
          const tgt = targets[ti];
          this.targetReevalTimers[ti] -= dt;
          const atD = this.targetDests[ti] && dist2d(tgt.x, tgt.z, this.targetDests[ti]!.x, this.targetDests[ti]!.z) < 10 * 0.015;
          if (this.targetReevalTimers[ti] <= 0 || !this.targetDests[ti] || atD) {
            this.targetDests[ti] = {
              x: areaInfo.x1 + Math.random() * (areaInfo.x2 - areaInfo.x1),
              z: areaInfo.z1 + Math.random() * (areaInfo.z2 - areaInfo.z1),
            };
            this.targetReevalTimers[ti] = 0.8 + Math.random() * 0.8;
          }
          const dx = this.targetDests[ti]!.x - tgt.x;
          const dz = this.targetDests[ti]!.z - tgt.z;
          const d = Math.sqrt(dx * dx + dz * dz);
          if (d > 3 * 0.015) {
            tgt.vx = (dx / d) * TARGET_RANDOM_SPEED * 0.5;
            tgt.vz = (dz / d) * TARGET_RANDOM_SPEED * 0.5;
          } else {
            tgt.vx = 0; tgt.vz = 0;
          }
          moveWithFacing(tgt, TARGET_RANDOM_SPEED * 0.5, dt);
          tgt.x = Math.max(areaInfo.x1 + 5 * 0.015, Math.min(areaInfo.x2 - 5 * 0.015, tgt.x));
          tgt.z = Math.max(areaInfo.z1 + 5 * 0.015, Math.min(areaInfo.z2 - 5 * 0.015, tgt.z));
        } else {
          const res = moveTargetToOpenSpace(
            targets[ti], this.targetDests[ti], this.targetReevalTimers[ti], dt, launcher, allObs,
          );
          this.targetDests[ti] = res.dest;
          this.targetReevalTimers[ti] = res.reevalTimer;
        }
      }

      // Obstacle movement during ball flight
      if (this.obReacting[0]) {
        moveWithFacing(allObs[0], OB_A_INTERCEPT_SPEED, dt);
      } else if (!this.obMems[0].searching) {
        const midX = (launcher.x + selTgt.x) / 2;
        const midZ = (launcher.z + selTgt.z) / 2;
        setChaserVelocity(allObs[0], midX, midZ, OB_A_IDLE_SPEED, OB_A_HOVER_RADIUS, dt);
        moveKeepFacing(allObs[0], OB_A_IDLE_SPEED, dt);
      }
      if (this.obReacting[2]) {
        moveWithFacing(allObs[2], OB_C_INTERCEPT_SPEED, dt);
      } else if (!this.obMems[2].searching) {
        setChaserVelocity(allObs[2], targets[0].x, targets[0].z, OB_C_IDLE_SPEED, OB_C_HOVER_RADIUS, dt);
        moveKeepFacing(allObs[2], OB_C_IDLE_SPEED, dt);
      }
      if (this.obReacting[3]) {
        moveWithFacing(allObs[3], OB_D_INTERCEPT_SPEED, dt);
      } else if (!this.obMems[3].searching) {
        setChaserVelocity(allObs[3], targets[3].x, targets[3].z, OB_D_IDLE_SPEED, OB_D_HOVER_RADIUS, dt);
        moveKeepFacing(allObs[3], OB_D_IDLE_SPEED, dt);
      }
      if (this.obReacting[4]) {
        moveWithFacing(allObs[4], OB_E_INTERCEPT_SPEED, dt);
      } else if (!this.obMems[4].searching) {
        setChaserVelocity(allObs[4], targets[4].x, targets[4].z, OB_E_IDLE_SPEED, OB_E_HOVER_RADIUS, dt);
        moveKeepFacing(allObs[4], OB_E_IDLE_SPEED, dt);
      }

      // Block collision (XZ distance + Y range check)
      for (const ob of allObs) {
        if (dist2d(ballPos.x, ballPos.z, ob.x, ob.z) < BLOCK_RADIUS && ballPos.y < BALL_COLLISION_Y_MAX) {
          this.deactivateBall();
          this.score.block++;
          this.resetAfterResult(1.0);
          break;
        }
      }

      // Hit detection
      if (this.ballActive) {
        for (let ti = 0; ti < targets.length; ti++) {
          if (dist2d(ballPos.x, ballPos.z, targets[ti].x, targets[ti].z) < HIT_RADIUS && ballPos.y < BALL_COLLISION_Y_MAX) {
            this.deactivateBall();
            this.score.hit++;
            this.resetAfterResult(1.5);
            break;
          }
        }
      }

      // Miss: ball landed (physics detected ground), out of bounds, or timeout
      if (this.ballActive) {
        const ballLanded = !this.ball.isInFlight();
        const margin = SIM_MARGIN * 2;
        const out = ballPos.x < -SIM_FIELD_X_HALF - margin || ballPos.x > SIM_FIELD_X_HALF + margin
          || ballPos.z < -SIM_FIELD_Z_HALF - margin || ballPos.z > SIM_FIELD_Z_HALF + margin;
        if (ballLanded || out || this.ballAge > BALL_TIMEOUT) {
          this.deactivateBall();
          this.score.miss++;
          this.resetAfterResult(1.0);
        }
      }
    }

    // === Scan updates ===
    // Create SimBall proxy for updateScan (pure logic module)
    const scanBallPos = this.ballActive ? this.ball.getPosition() : Vector3.Zero();
    const simBall: SimBall = {
      active: this.ballActive,
      x: scanBallPos.x, z: scanBallPos.z,
      vx: 0, vz: 0, age: this.ballAge,
    };
    const watchTargets = [targets[0], targets[0], targets[0], targets[3], targets[4]];
    for (let oi = 0; oi < 5; oi++) {
      const result = updateScan(
        allObs[oi], this.obScanAtLauncher[oi], this.obScanTimers[oi],
        this.obFocusDists[oi], this.obReacting[oi], this.obMems[oi],
        watchTargets[oi], launcher, simBall, dt,
      );
      this.obScanAtLauncher[oi] = result.atLauncher;
      this.obScanTimers[oi] = result.timer;
      this.obFocusDists[oi] = result.focusDist;
    }
  }
}
