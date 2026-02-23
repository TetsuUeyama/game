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
  SIM_FIELD_X_HALF,
  SIM_FIELD_Z_HALF,
  SIM_MARGIN,
  HIT_RADIUS,
  BLOCK_RADIUS,
  BALL_TIMEOUT,
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
  BALL_SPEED,
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
} from "./Types/TrackingSimTypes";

import {
  makeMover,
  makeScanMemory,
  setChaserVelocity,
  moveKeepFacing,
  moveWithFacing,
  restoreRandom,
  dist2d,
  randFire,
  separateEntities,
} from "./Movement/MovementCore";

import {
  isTrajectoryInFOV,
  canReachTrajectory,
  isPhysicallyClose,
  canTargetReach,
} from "./Decision/TrajectoryAnalysis";

import { canObIntercept, solveLaunch } from "./Decision/LaunchSolver";
import { updateScan } from "./Decision/ScanSystem";

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
/** Max Y for collision detection (entity top + tolerance) */
const BALL_COLLISION_Y_MAX = ENTITY_HEIGHT + 0.5;

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
        const rolePriority: Record<string, number> = {
          DUNKER: 3.0, SECOND_HANDLER: 2.0, SLASHER: 1.5, SPACER: 1.0, SCREENER: 0.5,
        };
        const roleBonus = rolePriority[ROLE_ASSIGNMENTS.targets[ti].role] ?? 0;
        const score = -blockerCount * 10 + (tgtCanReach ? 5 : 0) - estDist * 0.01 + roleBonus;

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
