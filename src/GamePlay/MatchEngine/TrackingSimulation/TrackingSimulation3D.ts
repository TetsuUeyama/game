/**
 * TrackingSimulation3D - Thin orchestrator for 3D tracking simulation.
 * Delegates to SimActionManager, SimBallManager, SimEntityUpdate for update logic.
 * Visualization is handled by SimVisualization.
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
  OB_B_CHASE_SPEED,
  OB_C_IDLE_SPEED,
  OB_D_IDLE_SPEED,
  OB_E_IDLE_SPEED,
  OB_B_HOVER_RADIUS,
  SOLVER_CFG_3D,
  INIT_LAUNCHER,
  INIT_TARGETS,
  INIT_OBSTACLES,
} from "./Config/EntityConfig";

import { ROLE_ASSIGNMENTS } from "./Config/RoleConfig";

import type {
  SimState,
  TrackingSimScore,
  BallFireContext,
} from "./Types/TrackingSimTypes";

import {
  makeMover,
  makeScanMemory,
  setChaserVelocity,
  moveKeepFacing,
  moveWithFacing,
  separateEntities,
} from "./Movement/MovementCore";

import {
  moveLauncherSmart,
} from "./Movement/RoleMovement";

import { createIdleAction, startAction, forceRecovery } from "./Action/ActionCore";
import { evaluatePreFire, attemptFire, detectBallResult } from "./Action/PassAction";
import { CATCH_TIMING } from "./Action/CatchAction";

import { tickAndTransitionActions, canEntityMove, applyMoveAction } from "./Update/SimActionManager";
import { deactivateBall, executePendingFire, resetAfterResult, OB_INT_SPEEDS, PASS_TIMING } from "./Update/SimBallManager";
import { updateTargetRoleMovements, updateObstacleMovements, updateScans, updateOffenseTorsoNeckFacing } from "./Update/SimEntityUpdate";

import { SimVisualization } from "./Visualization/SimVisualization";
import { Ball } from "@/GamePlay/Object/Entities/Ball";

export class TrackingSimulation3D {
  private scene: Scene;
  private ball: Ball;
  private observer: Observer<Scene> | null = null;
  private vis: SimVisualization;

  private ballTrailPositions: Vector3[] = [];
  private static readonly BALL_TRAIL_MAX = 40;

  private state!: SimState;
  private prevTime = 0;
  private lastDt = 0;

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
      this.lastDt = dt;
      this.update(dt);
      this.syncMeshes();
    });
  }

  public dispose(): void {
    if (this.observer) {
      this.scene.onBeforeRenderObservable.remove(this.observer);
      this.observer = null;
    }
    deactivateBall(this.state, this.ball, this.ballTrailPositions);
    this.vis.disposeMeshes();
  }

  public getScore(): TrackingSimScore {
    return { ...this.state.score };
  }

  public reset(): void {
    deactivateBall(this.state, this.ball, this.ballTrailPositions);
    this.vis.disposeMeshes();
    this.initState();
    this.vis.createMeshes();
  }

  // =========================================================================
  // State init
  // =========================================================================

  private initState(): void {
    const lx = INIT_LAUNCHER.x;
    const lz = INIT_LAUNCHER.z;

    this.state = {
      launcher: makeMover(INIT_LAUNCHER.x, INIT_LAUNCHER.z, LAUNCHER_SPEED),
      targets: INIT_TARGETS.map(p => makeMover(p.x, p.z, TARGET_RANDOM_SPEED)),
      obstacles: [
        makeMover(INIT_OBSTACLES[0].x, INIT_OBSTACLES[0].z, OB_A_IDLE_SPEED),
        makeMover(INIT_OBSTACLES[1].x, INIT_OBSTACLES[1].z, OB_B_CHASE_SPEED),
        makeMover(INIT_OBSTACLES[2].x, INIT_OBSTACLES[2].z, OB_C_IDLE_SPEED),
        makeMover(INIT_OBSTACLES[3].x, INIT_OBSTACLES[3].z, OB_D_IDLE_SPEED),
        makeMover(INIT_OBSTACLES[4].x, INIT_OBSTACLES[4].z, OB_E_IDLE_SPEED),
      ],
      ballActive: false,
      ballAge: 0,
      score: { hit: 0, block: 0, miss: 0 },
      cooldown: 2.0,
      selectedTargetIdx: 0,
      preFire: null,
      interceptPt: null,
      obReacting: [false, false, false, false, false],
      actionStates: Array.from({ length: 11 }, () => createIdleAction()),
      pendingFire: null,
      pendingCooldown: 0,
      moveDistAccum: new Array(6).fill(0),
      obScanAtLauncher: [true, true, false, false, true],
      obScanTimers: [2.0, 1.5, 1.0, 1.8, 1.2],
      obFocusDists: [4.5, 2.25, 3.0, 3.75, 3.0],
      obMems: [
        makeScanMemory(lx, lz, INIT_TARGETS[0].x, INIT_TARGETS[0].z),
        makeScanMemory(lx, lz, INIT_TARGETS[0].x, INIT_TARGETS[0].z),
        makeScanMemory(lx, lz, INIT_TARGETS[0].x, INIT_TARGETS[0].z),
        makeScanMemory(lx, lz, INIT_TARGETS[3].x, INIT_TARGETS[3].z),
        makeScanMemory(lx, lz, INIT_TARGETS[4].x, INIT_TARGETS[4].z),
      ],
      targetDests: [null, null, null, null, null],
      targetReevalTimers: [0.5, 0.7, 0.9, 1.1, 0.6],
      launcherState: { dest: null, reevalTimer: 0, bestPassTargetIdx: 0 },
      slasherState: { dest: null, reevalTimer: 0, vcutPhase: 0, vcutActive: false },
      screenerState: { dest: null, reevalTimer: 0, screenSet: false, holdTimer: 0 },
      dunkerState: { dest: null, reevalTimer: 0, sealing: false },
    };
  }

  // =========================================================================
  // Sync state -> meshes
  // =========================================================================

  private syncMeshes(): void {
    const s = this.state;
    const yh = ENTITY_HEIGHT / 2;

    // Launcher
    // rotation.y = π/2 - facing で local+Z を game facing (cos,sin) に一致させる
    this.vis.launcherMesh.position.set(s.launcher.x, yh, s.launcher.z);
    this.vis.launcherMesh.rotation.y = Math.PI / 2 - s.launcher.facing;

    // Targets
    for (let i = 0; i < 5; i++) {
      this.vis.targetMeshes[i].position.set(s.targets[i].x, yh, s.targets[i].z);
      this.vis.targetMeshes[i].rotation.y = Math.PI / 2 - s.targets[i].facing;
    }

    // Obstacles
    for (let i = 0; i < 5; i++) {
      this.vis.obstacleMeshes[i].position.set(s.obstacles[i].x, yh, s.obstacles[i].z);
      this.vis.obstacleMeshes[i].rotation.y = Math.PI / 2 - s.obstacles[i].facing;
    }

    // Ball visibility (position controlled by Havok physics when in flight)
    this.ball.mesh.setEnabled(s.ballActive);

    // Visualization (wrapped in try-catch to prevent silent failures)
    try {
      this.vis.syncAll({
        launcher: s.launcher,
        targets: s.targets,
        obstacles: s.obstacles,
        obMems: s.obMems,
        obFocusDists: s.obFocusDists,
        preFire: s.preFire,
        ballActive: s.ballActive,
        interceptPt: s.interceptPt,
        ballTrailPositions: this.ballTrailPositions,
        actionStates: s.actionStates,
        ballPosition: s.ballActive ? this.ball.getPosition() : null,
        dt: this.lastDt,
      });
    } catch (e) {
      console.error('[TrackingSimulation3D] visualization error:', e);
    }
  }

  // =========================================================================
  // Main update
  // =========================================================================

  private update(dt: number): void {
    const s = this.state;

    // === Tick action states ===
    const shouldFireBall = tickAndTransitionActions(s, dt);
    if (shouldFireBall) {
      executePendingFire(s, this.ball);
    }

    // === Launcher: role-based smart movement ===
    if (canEntityMove(s.actionStates, 0)) {
      moveLauncherSmart(s.launcher, s.launcherState, s.targets, s.obstacles, dt);
    }
    applyMoveAction(s, 0, s.launcher, dt);

    // === Obstacle B: chase launcher (unless searching) ===
    if (!s.obMems[1].searching) {
      setChaserVelocity(s.obstacles[1], s.launcher.x, s.launcher.z, OB_B_CHASE_SPEED, OB_B_HOVER_RADIUS, dt);
      moveKeepFacing(s.obstacles[1], OB_B_CHASE_SPEED, dt);
    }

    if (!s.ballActive) {
      // === Ball not active: all targets move, evaluate pre-fire ===
      updateTargetRoleMovements(s, dt, -1);

      // Pre-fire evaluation
      const ctx: BallFireContext = {
        launcher: s.launcher, targets: s.targets,
        obstacles: s.obstacles, obIntSpeeds: OB_INT_SPEEDS,
      };
      const evalResult = evaluatePreFire(ctx, ROLE_ASSIGNMENTS);
      s.selectedTargetIdx = evalResult.selectedTargetIdx;
      s.preFire = evalResult.preFire;

      // Fire cooldown (idle or move-active can fire)
      if (canEntityMove(s.actionStates, 0)) {
        s.cooldown -= dt;
        if (s.cooldown <= 0) {
          const fireResult = attemptFire(ctx, s.selectedTargetIdx, SOLVER_CFG_3D);
          if (fireResult.fired && fireResult.solution) {
            s.pendingFire = fireResult.solution;
            s.pendingCooldown = fireResult.newCooldown;
            s.actionStates[0] = startAction('pass', PASS_TIMING);
            s.moveDistAccum[0] = 0;
          } else {
            s.cooldown = fireResult.newCooldown;
          }
        }
      }
    } else {
      // === Ball in flight ===
      s.preFire = null;

      // Update Ball physics (Havok handles trajectory)
      this.ball.update(dt);
      s.ballAge += dt;

      // Get ball 3D position for collision checks
      const ballPos = this.ball.getPosition();

      // Track ball trail positions
      this.ballTrailPositions.push(ballPos.clone());
      if (this.ballTrailPositions.length > TrackingSimulation3D.BALL_TRAIL_MAX) {
        this.ballTrailPositions.shift();
      }

      // Selected target: move toward intercept point
      const selTgt = s.targets[s.selectedTargetIdx];
      if (canEntityMove(s.actionStates, 1 + s.selectedTargetIdx)) {
        if (s.interceptPt) {
          const idx = s.interceptPt.x - selTgt.x;
          const idz = s.interceptPt.z - selTgt.z;
          if (Math.sqrt(idx * idx + idz * idz) > 5 * 0.015) {
            moveWithFacing(selTgt, TARGET_INTERCEPT_SPEED, dt);
          } else {
            selTgt.vx = 0;
            selTgt.vz = 0;
          }
        }
      }
      applyMoveAction(s, 1 + s.selectedTargetIdx, selTgt, dt);

      // Other targets continue role-based movement during ball flight
      updateTargetRoleMovements(s, dt, s.selectedTargetIdx);

      // 手のワールド座標を取得（前フレームの腕方向ベクトルに基づく）
      const allMovers = [s.launcher, ...s.targets, ...s.obstacles];
      const allHands = this.vis.getHandWorldPositions(allMovers);
      const targetHands = allHands.slice(1, 6);    // targets[0..4]
      const obstacleHands = allHands.slice(6, 11); // obstacles[0..4]

      // Ball result detection (block → hit → miss)
      const detection = detectBallResult(
        ballPos.x, ballPos.y, ballPos.z,
        this.ball.isInFlight(), s.ballAge,
        s.targets, s.obstacles,
        targetHands, obstacleHands,
      );
      if (detection.result !== 'none') {
        deactivateBall(s, this.ball, this.ballTrailPositions);
        s.score[detection.result]++;

        // Hit → 最も近い手を持つターゲットにキャッチアクションを設定
        if (detection.result === 'hit') {
          let hitIdx = 0;
          let minDist = Infinity;
          for (let ti = 0; ti < s.targets.length; ti++) {
            const lh = targetHands[ti].left;
            const rh = targetHands[ti].right;
            const dl = Math.sqrt((ballPos.x - lh.x) ** 2 + (ballPos.y - lh.y) ** 2 + (ballPos.z - lh.z) ** 2);
            const dr = Math.sqrt((ballPos.x - rh.x) ** 2 + (ballPos.y - rh.y) ** 2 + (ballPos.z - rh.z) ** 2);
            const d = Math.min(dl, dr);
            if (d < minDist) { minDist = d; hitIdx = ti; }
          }
          s.actionStates[1 + hitIdx] = startAction('catch', CATCH_TIMING);
        }

        // Force obstacles/targets to recovery (launcher runs independently, catch preserved)
        for (let i = 1; i < s.actionStates.length; i++) {
          if (s.actionStates[i].type === 'catch') continue;
          if (s.actionStates[i].phase !== 'idle') {
            s.actionStates[i] = forceRecovery(s.actionStates[i]);
          }
        }
        for (let i = 0; i < s.moveDistAccum.length; i++) s.moveDistAccum[i] = 0;
        resetAfterResult(s);
      }
    }

    // === Obstacle A/C/D/E movement (unified for both branches) ===
    updateObstacleMovements(s, dt);

    // === Separate overlapping entities ===
    separateEntities([
      { mover: s.launcher, radius: LAUNCHER_RADIUS },
      ...s.targets.map(t => ({ mover: t, radius: TARGET_RADIUS })),
      ...s.obstacles.map(o => ({ mover: o, radius: OBSTACLE_RADIUS })),
    ]);

    // === Scan updates ===
    const scanBallPos = s.ballActive ? this.ball.getPosition() : Vector3.Zero();
    updateScans(s, s.ballActive, scanBallPos, dt);

    // === Offense neck facing ===
    const offenseBallPos = s.ballActive ? this.ball.getPosition() : null;
    updateOffenseTorsoNeckFacing(s, s.ballActive, offenseBallPos, dt);
  }
}
