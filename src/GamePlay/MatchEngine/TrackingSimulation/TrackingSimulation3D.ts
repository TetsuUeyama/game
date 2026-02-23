/**
 * TrackingSimulation3D - Orchestrator for 3D tracking simulation
 * Delegates visualization to SimVisualization, AI to specialized modules
 */

import {
  Scene,
  Vector3,
  Observer,
} from "@babylonjs/core";

import {
  ENTITY_HEIGHT,
  LAUNCHER_RADIUS,
  TARGET_RADIUS,
  OBSTACLE_RADIUS,
} from "./Config/FieldConfig";

import {
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
  OB_A_HOVER_RADIUS,
  OB_B_HOVER_RADIUS,
  OB_C_HOVER_RADIUS,
  OB_D_HOVER_RADIUS,
  OB_E_HOVER_RADIUS,
  SOLVER_CFG_3D,
  INIT_LAUNCHER,
  INIT_TARGETS,
  INIT_OBSTACLES,
} from "./Config/EntityConfig";

import { ROLE_ASSIGNMENTS } from "./Config/RoleConfig";

import type {
  SimMover,
  SimBall,
  SimScanMemory,
  SimPreFireInfo,
  TrackingSimScore,
  LauncherState,
  SlasherState,
  ScreenerState,
  DunkerState,
  BallFireContext,
} from "./Types/TrackingSimTypes";

import {
  makeMover,
  makeScanMemory,
  setChaserVelocity,
  moveKeepFacing,
  moveWithFacing,
  restoreRandom,
  dist2d,
  separateEntities,
} from "./Movement/MovementCore";

import { updateScan } from "./Decision/ScanSystem";

import {
  evaluatePreFire,
  attemptFire,
  computeObstacleReactions,
  detectBallResult,
} from "./Action/PassAction";

import {
  moveLauncherSmart,
  moveSecondHandler,
  moveSlasher,
  moveScreener,
  moveDunker,
  moveSpacer,
} from "./Movement/RoleMovement";

import { SimVisualization } from "./Visualization/SimVisualization";
import { Ball } from "@/GamePlay/Object/Entities/Ball";

/** Ball launch/target Y height (upper portion of entity boxes) */
const BALL_LAUNCH_Y = ENTITY_HEIGHT * 0.7;

export class TrackingSimulation3D {
  private scene: Scene;
  private ball: Ball;
  private observer: Observer<Scene> | null = null;
  private vis: SimVisualization;

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

  // Role-based state
  private launcherState!: LauncherState;
  private slasherState!: SlasherState;
  private screenerState!: ScreenerState;
  private dunkerState!: DunkerState;

  private prevTime = 0;

  constructor(scene: Scene, ball: Ball) {
    this.scene = scene;
    this.ball = ball;
    this.ball.mesh.setEnabled(false);
    this.vis = new SimVisualization(scene);
  }

  public start(): void {
    this.initState();
    this.vis.createMeshes();
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
    this.vis.disposeMeshes();
  }

  public getScore(): TrackingSimScore {
    return { ...this.score };
  }

  public reset(): void {
    this.deactivateBall();
    this.vis.disposeMeshes();
    this.initState();
    this.vis.createMeshes();
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

  private fireBallArc(startX: number, startZ: number, targetX: number, targetZ: number): boolean {
    const startPos = new Vector3(startX, BALL_LAUNCH_Y, startZ);
    const targetPos = new Vector3(targetX, BALL_LAUNCH_Y, targetZ);
    const distance = dist2d(startX, startZ, targetX, targetZ);
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

    // Reset role states
    this.launcherState = { dest: null, reevalTimer: 0, bestPassTargetIdx: 0 };
    this.slasherState = { dest: null, reevalTimer: 0, vcutPhase: this.slasherState.vcutPhase, vcutActive: false };
    this.screenerState = { dest: null, reevalTimer: 0, screenSet: false, holdTimer: 0 };
    this.dunkerState = { dest: null, reevalTimer: 0, sealing: false };
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

    // Role-based state
    this.launcherState = { dest: null, reevalTimer: 0, bestPassTargetIdx: 0 };
    this.slasherState = { dest: null, reevalTimer: 0, vcutPhase: 0, vcutActive: false };
    this.screenerState = { dest: null, reevalTimer: 0, screenSet: false, holdTimer: 0 };
    this.dunkerState = { dest: null, reevalTimer: 0, sealing: false };
  }

  // =========================================================================
  // Sync state -> meshes
  // =========================================================================

  private syncMeshes(): void {
    const yh = ENTITY_HEIGHT / 2;

    // Launcher
    this.vis.launcherMesh.position.set(this.launcher.x, yh, this.launcher.z);
    this.vis.launcherMesh.rotation.y = -this.launcher.facing;

    // Targets
    for (let i = 0; i < 5; i++) {
      this.vis.targetMeshes[i].position.set(this.targets[i].x, yh, this.targets[i].z);
      this.vis.targetMeshes[i].rotation.y = -this.targets[i].facing;
    }

    // Obstacles
    for (let i = 0; i < 5; i++) {
      this.vis.obstacleMeshes[i].position.set(this.obstacles[i].x, yh, this.obstacles[i].z);
      this.vis.obstacleMeshes[i].rotation.y = -this.obstacles[i].facing;
    }

    // Ball visibility (position controlled by Havok physics when in flight)
    this.ball.mesh.setEnabled(this.ballActive);

    // Visualization (wrapped in try-catch to prevent silent failures)
    try {
      this.vis.syncAll({
        launcher: this.launcher,
        targets: this.targets,
        obstacles: this.obstacles,
        obMems: this.obMems,
        obFocusDists: this.obFocusDists,
        preFire: this.preFire,
        ballActive: this.ballActive,
        interceptPt: this.interceptPt,
        ballTrailPositions: this.ballTrailPositions,
      });
    } catch (e) {
      console.error('[TrackingSimulation3D] visualization error:', e);
    }
  }

  // =========================================================================
  // Main update
  // =========================================================================

  private update(dt: number): void {
    const { launcher, targets, obstacles } = this;
    const allObs = obstacles;
    const obIntSpeeds = [
      OB_A_INTERCEPT_SPEED, OB_B_CHASE_SPEED, OB_C_INTERCEPT_SPEED,
      OB_D_INTERCEPT_SPEED, OB_E_INTERCEPT_SPEED,
    ];

    // Launcher: role-based smart movement (PG / MAIN_HANDLER)
    moveLauncherSmart(launcher, this.launcherState, targets, allObs, dt);

    // Obstacle B: chase launcher (unless searching)
    if (!this.obMems[1].searching) {
      setChaserVelocity(allObs[1], launcher.x, launcher.z, OB_B_CHASE_SPEED, OB_B_HOVER_RADIUS, dt);
      moveKeepFacing(allObs[1], OB_B_CHASE_SPEED, dt);
    }

    const selTarget = targets[this.selectedTargetIdx];

    // Helper: get other targets (excluding index ti)
    const getOtherTargets = (ti: number): SimMover[] =>
      targets.filter((_, i) => i !== ti);

    if (!this.ballActive) {
      // === Role-based target movement ===
      // Target 0: SG / SECOND_HANDLER
      {
        const res = moveSecondHandler(
          targets[0], this.targetDests[0], this.targetReevalTimers[0],
          dt, launcher, allObs, getOtherTargets(0),
        );
        this.targetDests[0] = res.dest;
        this.targetReevalTimers[0] = res.reevalTimer;
      }
      // Target 1: SF / SLASHER
      moveSlasher(targets[1], this.slasherState, dt, launcher, allObs, getOtherTargets(1));
      // Target 2: C / SCREENER
      moveScreener(targets[2], this.screenerState, dt, launcher, allObs, getOtherTargets(2));
      // Target 3: PF / DUNKER
      moveDunker(targets[3], this.dunkerState, dt, launcher, allObs, getOtherTargets(3));
      // Target 4: SG / SPACER
      {
        const res = moveSpacer(
          targets[4], this.targetDests[4], this.targetReevalTimers[4],
          dt, launcher, allObs, getOtherTargets(4),
        );
        this.targetDests[4] = res.dest;
        this.targetReevalTimers[4] = res.reevalTimer;
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

      // === Separate overlapping entities ===
      separateEntities([
        { mover: launcher, radius: LAUNCHER_RADIUS },
        ...targets.map(t => ({ mover: t, radius: TARGET_RADIUS })),
        ...obstacles.map(o => ({ mover: o, radius: OBSTACLE_RADIUS })),
      ]);

      // === Pre-fire evaluation ===
      const ctx: BallFireContext = { launcher, targets, obstacles: allObs, obIntSpeeds };
      const evalResult = evaluatePreFire(ctx, ROLE_ASSIGNMENTS);
      this.selectedTargetIdx = evalResult.selectedTargetIdx;
      this.preFire = evalResult.preFire;

      // === Fire cooldown ===
      this.cooldown -= dt;
      if (this.cooldown <= 0) {
        const fireResult = attemptFire(ctx, this.selectedTargetIdx, SOLVER_CFG_3D);
        if (fireResult.fired && fireResult.solution) {
          const sol = fireResult.solution;
          const success = this.fireBallArc(launcher.x, launcher.z, sol.interceptX, sol.interceptZ);
          if (success) {
            this.interceptPt = { x: sol.interceptX, z: sol.interceptZ };
            this.selectedTargetIdx = sol.targetIdx;
            this.preFire = null;

            // Selected target: move toward intercept point
            const tgt = targets[sol.targetIdx];
            tgt.vx = sol.targetVelocity.vx;
            tgt.vz = sol.targetVelocity.vz;

            // Reacting obstacles
            const bPos = this.ball.getPosition();
            const bVel = this.ball.getVelocity();
            const reactions = computeObstacleReactions(
              allObs, obIntSpeeds, sol.obInFOVs,
              bPos.x, bPos.z, bVel.x, bVel.z, SOLVER_CFG_3D,
            );
            const reactingObs = [false, false, false, false, false];
            for (const r of reactions) {
              reactingObs[r.obstacleIdx] = r.reacting;
              if (r.reacting) {
                allObs[r.obstacleIdx].vx = r.vx;
                allObs[r.obstacleIdx].vz = r.vz;
              }
            }
            this.obReacting = reactingObs;
            this.cooldown = fireResult.newCooldown;
          } else {
            this.cooldown = fireResult.newCooldown;
          }
        } else {
          this.cooldown = fireResult.newCooldown;
        }
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

      // Other targets continue role-based movement during ball flight
      for (let ti = 0; ti < targets.length; ti++) {
        if (ti === this.selectedTargetIdx) continue;
        const others = getOtherTargets(ti);
        switch (ti) {
          case 0: {
            const res = moveSecondHandler(
              targets[0], this.targetDests[0], this.targetReevalTimers[0],
              dt, launcher, allObs, others,
            );
            this.targetDests[0] = res.dest;
            this.targetReevalTimers[0] = res.reevalTimer;
            break;
          }
          case 1:
            moveSlasher(targets[1], this.slasherState, dt, launcher, allObs, others);
            break;
          case 2:
            moveScreener(targets[2], this.screenerState, dt, launcher, allObs, others);
            break;
          case 3:
            moveDunker(targets[3], this.dunkerState, dt, launcher, allObs, others);
            break;
          case 4: {
            const res = moveSpacer(
              targets[4], this.targetDests[4], this.targetReevalTimers[4],
              dt, launcher, allObs, others,
            );
            this.targetDests[4] = res.dest;
            this.targetReevalTimers[4] = res.reevalTimer;
            break;
          }
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

      // === Separate overlapping entities ===
      separateEntities([
        { mover: launcher, radius: LAUNCHER_RADIUS },
        ...targets.map(t => ({ mover: t, radius: TARGET_RADIUS })),
        ...obstacles.map(o => ({ mover: o, radius: OBSTACLE_RADIUS })),
      ]);

      // === Ball result detection (block → hit → miss) ===
      const detection = detectBallResult(
        ballPos.x, ballPos.y, ballPos.z,
        this.ball.isInFlight(), this.ballAge,
        targets, allObs,
      );
      if (detection.result !== 'none') {
        this.deactivateBall();
        this.score[detection.result]++;
        this.resetAfterResult(detection.cooldownTime);
      }
    }

    // === Scan updates ===
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
