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
  BALL_DIAMETER,
  LAUNCHER_RADIUS,
  TARGET_RADIUS,
  OBSTACLE_RADIUS,
  DEFLECT_IMPULSE,
  DEFLECT_COOLDOWN,
  TARGET_STOP_DIST,
  HAND_CATCH_RADIUS,
  SIM_FIELD_X_HALF,
  SIM_FIELD_Z_HALF,
  SIM_MARGIN,
  BALL_TIMEOUT,
  LOOSE_BALL_PICKUP_RADIUS,
  LOOSE_BALL_GRACE_PERIOD,
  ON_BALL_SPEED_MULT,
  ONBALL_BLOCK_RADIUS,
  GOAL_RIM_X,
  GOAL_RIM_Y,
  GOAL_RIM_Z,
  GOAL_RIM_RADIUS,
} from "./Config/FieldConfig";

import {
  LAUNCHER_SPEED,
  TARGET_RANDOM_SPEED,
  TARGET_INTERCEPT_SPEED,
  SOLVER_CFG_3D,
  INIT_LAUNCHER,
  INIT_TARGETS,
  INIT_OBSTACLES,
} from "./Config/EntityConfig";

import {
  ROLE_ASSIGNMENTS,
  SPAWN_PAINT_X_HALF,
  SPAWN_PAINT_Z_MIN,
  SPAWN_PAINT_Z_MAX,
  SPAWN_BASELINE_Z,
} from "./Config/RoleConfig";

import type {
  SimState,
  SimMover,
  TrackingSimScore,
  BallFireContext,
} from "./Types/TrackingSimTypes";

import {
  makeMover,
  makeScanMemory,
  moveWithFacing,
  separateEntities,
  setChaserVelocity,
  dist2d,
  blockOnBallByDefenders,
} from "./Movement/MovementCore";

import {
  moveLauncherSmart,
  moveTransitToHome,
} from "./Movement/RoleMovement";

import { createIdleAction, startAction, forceRecovery } from "./Action/ActionCore";
import { evaluatePreFire, attemptFire, detectBallResult, checkObstacleDeflection, PASS_TIMING } from "./Action/PassAction";
import { CATCH_TIMING } from "./Action/CatchAction";
import { canShoot, computeShotTarget, SHOOT_TIMING } from "./Action/ShootAction";

import { tickAndTransitionActions, canEntityMove, applyMoveAction } from "./Update/SimActionManager";
import { deactivateBall, executePendingFire, executePendingShot, resetAfterResult, resetOffenseToBackcourt, OB_INT_SPEEDS } from "./Update/SimBallManager";
import { updateTargetRoleMovements, updateObstacleMovements, updateScans, updateOffenseTorsoNeckFacing, computePushObstructions } from "./Update/SimEntityUpdate";

import { SimVisualization, type OverlayVisibility } from "./Visualization/SimVisualization";
import { SimPlayerStateManager } from "./State/SimPlayerStateManager";
import { OB_CONFIGS, OBSTACLE_COUNT } from "./Config/ObstacleDefenseConfig";
import { Ball } from "@/GamePlay/Object/Entities/Ball";

// =========================================================================
// Helper: on-ball / receiver info
// =========================================================================

/** エンティティインデックスからオフェンス mover を取得 */
function getOffenseMover(state: SimState, entityIdx: number): SimMover {
  return entityIdx === 0 ? state.launcher : state.targets[entityIdx - 1];
}

/** 現在のパッサー以外のオフェンスをレシーバーとして返す */
function getReceiverInfo(state: SimState): { movers: SimMover[]; entityIndices: number[]; roles: string[] } {
  const allOffense = [state.launcher, ...state.targets];
  const allRoles = [ROLE_ASSIGNMENTS.launcher.role, ...ROLE_ASSIGNMENTS.targets.map(t => t.role)];
  const movers: SimMover[] = [];
  const entityIndices: number[] = [];
  const roles: string[] = [];
  for (let i = 0; i < allOffense.length; i++) {
    if (i !== state.onBallEntityIdx) {
      movers.push(allOffense[i]);
      entityIndices.push(i);
      roles.push(allRoles[i]);
    }
  }
  return { movers, entityIndices, roles };
}

export class TrackingSimulation3D {
  private scene: Scene;
  private ball: Ball;
  private observer: Observer<Scene> | null = null;
  private vis: SimVisualization;
  private playerStateManager: SimPlayerStateManager;

  private ballTrailPositions: Vector3[] = [];
  private static readonly BALL_TRAIL_MAX = 40;

  /** キャッチ保持中の情報（ボールを手に表示し続ける） */
  private catchHoldInfo: { entityIdx: number } | null = null;

  private state!: SimState;
  private prevTime = 0;
  private lastDt = 0;

  constructor(scene: Scene, ball: Ball) {
    this.scene = scene;
    this.ball = ball;
    this.ball.mesh.setEnabled(false);
    this.vis = new SimVisualization(scene);
    this.playerStateManager = new SimPlayerStateManager();
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
    this.catchHoldInfo = null;
    deactivateBall(this.state, this.ball, this.ballTrailPositions);
    this.vis.disposeMeshes();
  }

  public getScore(): TrackingSimScore {
    return { ...this.state.score };
  }

  public getPlayerStateManager(): SimPlayerStateManager {
    return this.playerStateManager;
  }

  public setGlobalOverlayVisible(visible: boolean): void {
    this.vis.setGlobalOverlayVisible(visible);
  }

  public setEntityOverlayVisible(entityIdx: number, visible: boolean): void {
    this.vis.setEntityOverlayVisible(entityIdx, visible);
  }

  public getOverlayVisibility(): OverlayVisibility {
    return this.vis.getVisibility();
  }

  public reset(): void {
    this.catchHoldInfo = null;
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
      launcher: makeMover(0, SPAWN_BASELINE_Z, LAUNCHER_SPEED),
      targets: INIT_TARGETS.map(() => makeMover(
        (Math.random() * 2 - 1) * SPAWN_PAINT_X_HALF,
        SPAWN_PAINT_Z_MIN + Math.random() * (SPAWN_PAINT_Z_MAX - SPAWN_PAINT_Z_MIN),
        TARGET_RANDOM_SPEED,
      )),
      obstacles: INIT_OBSTACLES.map((p, oi) =>
        makeMover(p.x, p.z, OB_CONFIGS[oi].idleSpeed),
      ),
      ballActive: false,
      ballAge: 0,
      score: { hit: 0, block: 0, miss: 0, steal: 0, goal: 0, shotMiss: 0 },
      cooldown: 2.0,
      onBallEntityIdx: 0,
      selectedReceiverEntityIdx: 1,
      preFire: null,
      interceptPt: null,
      obReacting: Array.from({ length: OBSTACLE_COUNT }, () => false),
      actionStates: Array.from({ length: 1 + INIT_TARGETS.length + OBSTACLE_COUNT }, () => createIdleAction()),
      pendingFire: null,
      pendingCooldown: 0,
      moveDistAccum: new Array(1 + INIT_TARGETS.length).fill(0),
      obScanAtLauncher: OB_CONFIGS.map(c => c.scanInitial.atLauncher),
      obScanTimers: OB_CONFIGS.map(c => c.scanInitial.timer),
      obFocusDists: OB_CONFIGS.map(c => c.scanInitial.focusDist),
      obMems: OB_CONFIGS.map(c => {
        const watchIdx = c.scanWatchTargetIdx;
        return makeScanMemory(lx, lz, INIT_TARGETS[watchIdx].x, INIT_TARGETS[watchIdx].z);
      }),
      targetDests: INIT_TARGETS.map(() => null),
      targetReevalTimers: [0.5, 0.7, 0.9, 1.1],
      launcherState: { dest: null, reevalTimer: 0, bestPassTargetIdx: 0 },
      slasherState: { dest: null, reevalTimer: 0, vcutPhase: 0, vcutActive: false },
      screenerState: { dest: null, reevalTimer: 0, screenSet: false, holdTimer: 0 },
      dunkerState: { dest: null, reevalTimer: 0, sealing: false },
      obstacleDeflectCooldowns: new Array(OBSTACLE_COUNT).fill(0),
      pushObstructions: [],
      looseBall: false,
      offenseInTransit: new Array(1 + INIT_TARGETS.length).fill(true),
      pendingShot: null,
      prevBallY: 0,
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
    for (let i = 0; i < s.targets.length; i++) {
      this.vis.targetMeshes[i].position.set(s.targets[i].x, yh, s.targets[i].z);
      this.vis.targetMeshes[i].rotation.y = Math.PI / 2 - s.targets[i].facing;
    }

    // Obstacles
    for (let i = 0; i < s.obstacles.length; i++) {
      this.vis.obstacleMeshes[i].position.set(s.obstacles[i].x, yh, s.obstacles[i].z);
      this.vis.obstacleMeshes[i].rotation.y = Math.PI / 2 - s.obstacles[i].facing;
    }

    // ボール表示: キャッチ保持中 or オンボール保持中 or 飛行中
    let ballHeldPosition: Vector3 | null = null;
    const allMovers = [s.launcher, ...s.targets, ...s.obstacles];
    const allHands = this.vis.getHandWorldPositions(allMovers);

    if (this.catchHoldInfo) {
      // キャッチ保持中: ボールをキャッチャーの両手中間位置に追従させる
      const hands = allHands[this.catchHoldInfo.entityIdx];
      if (hands) {
        const midX = (hands.left.x + hands.right.x) / 2;
        const midY = (hands.left.y + hands.right.y) / 2;
        const midZ = (hands.left.z + hands.right.z) / 2;

        const mover = allMovers[this.catchHoldInfo.entityIdx];
        const dx = midX - mover.x;
        const dy = midY - yh;
        const dz = midZ - mover.z;
        const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
        const ballR = BALL_DIAMETER / 2;

        if (len > 0.01) {
          ballHeldPosition = new Vector3(
            midX + (dx / len) * ballR,
            midY + (dy / len) * ballR,
            midZ + (dz / len) * ballR,
          );
        } else {
          ballHeldPosition = new Vector3(midX, midY, midZ);
        }
        this.ball.mesh.position.copyFrom(ballHeldPosition);
      }
    } else if (!s.ballActive) {
      // オンボールプレイヤーの右手にボールを表示
      const hands = allHands[s.onBallEntityIdx];
      if (hands) {
        const rh = hands.right;
        const mover = allMovers[s.onBallEntityIdx];
        const dx = rh.x - mover.x;
        const dy = rh.y - yh;
        const dz = rh.z - mover.z;
        const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
        const ballR = BALL_DIAMETER / 2;

        if (len > 0.01) {
          ballHeldPosition = new Vector3(
            rh.x + (dx / len) * ballR,
            rh.y + (dy / len) * ballR,
            rh.z + (dz / len) * ballR,
          );
        } else {
          ballHeldPosition = new Vector3(rh.x, rh.y, rh.z);
        }
        this.ball.mesh.position.copyFrom(ballHeldPosition);
      }
    }

    // Ball visibility: 飛行中、キャッチ保持中、またはオンボール保持中は常に表示
    this.ball.mesh.setEnabled(s.ballActive || ballHeldPosition !== null);

    // オンボールディフェンス パスレーン守備スタンス: 左右腕を別々のターゲットに向ける
    // マーク対象がオンボールの障害物のみ適用
    let ballMarkerLeftArmTarget: Vector3 | null = null;
    let ballMarkerRightArmTarget: Vector3 | null = null;
    let ballMarkerEntityIdx: number | null = null;
    const obstacleEntityStart = 1 + s.targets.length;
    for (let oi = 0; oi < OB_CONFIGS.length; oi++) {
      const cfg = OB_CONFIGS[oi];
      if (cfg.markTargetEntityIdx !== s.onBallEntityIdx) continue;
      if (s.obMems[oi].searching) continue;
      ballMarkerEntityIdx = obstacleEntityStart + oi;
      const ob = s.obstacles[oi];
      const onBallMover = getOffenseMover(s, s.onBallEntityIdx);
      const selReceiver = getOffenseMover(s, s.selectedReceiverEntityIdx);

      // ボール側: オンボール選手位置の頭上（ボールを遮る）
      const ballArm = new Vector3(onBallMover.x, ENTITY_HEIGHT * 1.3, onBallMover.z);
      // ディナイ側: 選択レシーバー方向、肩高さ（パスレーンを塞ぐ）
      const denyArm = new Vector3(selReceiver.x, ENTITY_HEIGHT * 0.9, selReceiver.z);

      // レシーバーが障害物の facing に対してどちら側かを外積で判定
      const tdx = selReceiver.x - ob.x;
      const tdz = selReceiver.z - ob.z;
      const cross = Math.cos(ob.facing) * tdz - Math.sin(ob.facing) * tdx;

      if (cross >= 0) {
        ballMarkerLeftArmTarget = denyArm;
        ballMarkerRightArmTarget = ballArm;
      } else {
        ballMarkerLeftArmTarget = ballArm;
        ballMarkerRightArmTarget = denyArm;
      }
      break;  // オンボールマーカーは1体のみ
    }

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
        ballHeldPosition,
        ballMarkerLeftArmTarget,
        ballMarkerRightArmTarget,
        ballMarkerEntityIdx,
        pushObstructions: s.pushObstructions,
        onBallEntityIdx: s.onBallEntityIdx,
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
    // passer は tick 時点の on-ball entity（catch hold 変更前）
    const passer = getOffenseMover(s, s.onBallEntityIdx);
    const { shouldFireBall, shouldShootBall } = tickAndTransitionActions(s, dt);
    if (shouldFireBall) {
      executePendingFire(s, this.ball, passer);
    }
    if (shouldShootBall) {
      executePendingShot(s, this.ball, passer);
    }

    // === キャッチ保持の終了判定 → ボール保持者切替 ===
    if (this.catchHoldInfo) {
      const action = s.actionStates[this.catchHoldInfo.entityIdx];
      if (action.type !== 'catch') {
        // キャッチ完了 → 新しいボール保持者
        s.onBallEntityIdx = this.catchHoldInfo.entityIdx;
        s.cooldown = 1.5;
        this.catchHoldInfo = null;
      }
    }

    // === キャッチ保持中の弾き（スティール） ===
    if (this.catchHoldInfo) {
      const allMovers = [s.launcher, ...s.targets, ...s.obstacles];
      const allHands = this.vis.getHandWorldPositions(allMovers);
      const obStart = 1 + s.targets.length;
      const obstacleHands = allHands.slice(obStart, obStart + s.obstacles.length);
      const heldPos = this.ball.mesh.position;

      const stealDeflection = checkObstacleDeflection(
        heldPos.x, heldPos.y, heldPos.z,
        obstacleHands, s.obstacleDeflectCooldowns,
      );
      if (stealDeflection.deflected) {
        // 保持解除
        const catcherIdx = this.catchHoldInfo.entityIdx;
        this.catchHoldInfo = null;
        s.actionStates[catcherIdx] = forceRecovery(s.actionStates[catcherIdx]);

        // Havok DYNAMIC モードに復帰 → インパルスで弾く
        this.ball.startFlight();
        this.ball.applyImpulse(stealDeflection.direction.scale(DEFLECT_IMPULSE));

        s.ballActive = true;
        s.ballAge = 0;
        s.obstacleDeflectCooldowns[stealDeflection.obstacleIdx] = DEFLECT_COOLDOWN;

        // ルーズボール突入
        s.looseBall = true;
        s.interceptPt = null;
        for (let i = 0; i < s.actionStates.length; i++) s.actionStates[i] = createIdleAction();
        for (let i = 0; i < s.moveDistAccum.length; i++) s.moveDistAccum[i] = 0;
      }
    }

    if (!s.looseBall) {
      // === Compute push obstructions (before target movements) ===
      computePushObstructions(s);

      // === Launcher: role-based smart movement ===
      // ボール飛行中に launcher がレシーバーの場合はインターセプト移動を優先（後述）
      const launcherIsReceiver = s.ballActive && s.selectedReceiverEntityIdx === 0;
      if (!launcherIsReceiver) {
        const launcherIsOnBall = s.onBallEntityIdx === 0;
        const prevLX = s.launcher.x, prevLZ = s.launcher.z;

        if (canEntityMove(s.actionStates, 0)) {
          if (s.offenseInTransit[0]) {
            const arrived = moveTransitToHome(s.launcher, 0, dt);
            if (arrived) s.offenseInTransit[0] = false;
          } else {
            moveLauncherSmart(s.launcher, s.launcherState, s.targets, s.obstacles, dt);
          }
        }
        applyMoveAction(s, 0, s.launcher, dt);

        // ボール保持時: 移動速度を0.75倍に制限 + ディフェンダー方向ブロック
        if (launcherIsOnBall && !s.ballActive) {
          const dlx = s.launcher.x - prevLX, dlz = s.launcher.z - prevLZ;
          s.launcher.x = prevLX + dlx * ON_BALL_SPEED_MULT;
          s.launcher.z = prevLZ + dlz * ON_BALL_SPEED_MULT;
          blockOnBallByDefenders(s.launcher, prevLX, prevLZ, s.obstacles, ONBALL_BLOCK_RADIUS);
        }
      }
    }

    if (!s.ballActive && !this.catchHoldInfo) {
      // === オンボール保持中のファンブル（スティール）判定 ===
      // クールダウン減算（ボール非飛行時はball-in-flightブランチで減算されないため）
      for (let oi = 0; oi < s.obstacleDeflectCooldowns.length; oi++) {
        if (s.obstacleDeflectCooldowns[oi] > 0) {
          s.obstacleDeflectCooldowns[oi] = Math.max(0, s.obstacleDeflectCooldowns[oi] - dt);
        }
      }

      const heldPos = this.ball.mesh.position;  // 前フレームの syncMeshes でオンボールプレイヤーの手位置にセット済み
      const allMoversForFumble = [s.launcher, ...s.targets, ...s.obstacles];
      const allHandsForFumble = this.vis.getHandWorldPositions(allMoversForFumble);
      const obStartForFumble = 1 + s.targets.length;
      const obstacleHandsForFumble = allHandsForFumble.slice(obStartForFumble, obStartForFumble + s.obstacles.length);

      const fumbleDeflection = checkObstacleDeflection(
        heldPos.x, heldPos.y, heldPos.z,
        obstacleHandsForFumble, s.obstacleDeflectCooldowns,
      );
      if (fumbleDeflection.deflected) {
        // Havok DYNAMIC モードに復帰 → インパルスで弾く
        this.ball.startFlight();
        this.ball.applyImpulse(fumbleDeflection.direction.scale(DEFLECT_IMPULSE));

        s.ballActive = true;
        s.ballAge = 0;
        s.obstacleDeflectCooldowns[fumbleDeflection.obstacleIdx] = DEFLECT_COOLDOWN;

        // ルーズボール突入
        s.looseBall = true;
        s.interceptPt = null;
        for (let i = 0; i < s.actionStates.length; i++) s.actionStates[i] = createIdleAction();
        for (let i = 0; i < s.moveDistAccum.length; i++) s.moveDistAccum[i] = 0;
      }

      // === Ball not active & not held: evaluate pre-fire ===
      // ファンブルが発生した場合は ballActive = true になるためスキップ
      if (!s.ballActive) {
        // On-ball target: skip role movement (they hold the ball)
        const onBallSkipTargetIdx = s.onBallEntityIdx > 0 ? s.onBallEntityIdx - 1 : -1;
        updateTargetRoleMovements(s, dt, onBallSkipTargetIdx);
        // On-ball target: transit or applyMoveAction（updateTargetRoleMovements でスキップされた分）
        if (s.onBallEntityIdx > 0) {
          const onBallTgt = s.targets[s.onBallEntityIdx - 1];
          const prevTX = onBallTgt.x, prevTZ = onBallTgt.z;

          if (s.offenseInTransit[s.onBallEntityIdx]) {
            const arrived = moveTransitToHome(onBallTgt, s.onBallEntityIdx, dt);
            if (arrived) s.offenseInTransit[s.onBallEntityIdx] = false;
          }
          applyMoveAction(s, s.onBallEntityIdx, onBallTgt, dt);

          // ボール保持時: 移動速度を0.75倍に制限 + ディフェンダー方向ブロック
          const dtx = onBallTgt.x - prevTX, dtz = onBallTgt.z - prevTZ;
          onBallTgt.x = prevTX + dtx * ON_BALL_SPEED_MULT;
          onBallTgt.z = prevTZ + dtz * ON_BALL_SPEED_MULT;
          blockOnBallByDefenders(onBallTgt, prevTX, prevTZ, s.obstacles, ONBALL_BLOCK_RADIUS);
        }

        // Build dynamic receiver context (exclude on-ball entity)
        const currentPasser = getOffenseMover(s, s.onBallEntityIdx);
        const { movers: receivers, entityIndices: receiverEntityIndices, roles: receiverRoles } = getReceiverInfo(s);
        const ctx: BallFireContext = {
          launcher: currentPasser, targets: receivers,
          obstacles: s.obstacles, obIntSpeeds: OB_INT_SPEEDS,
        };
        const evalResult = evaluatePreFire(ctx, receiverRoles);
        s.selectedReceiverEntityIdx = receiverEntityIndices[evalResult.selectedTargetIdx];
        s.preFire = evalResult.preFire;

        // Fire/Shoot cooldown (on-ball entity can act when idle or move-active)
        if (canEntityMove(s.actionStates, s.onBallEntityIdx)) {
          s.cooldown -= dt;
          if (s.cooldown <= 0) {
            // シュート優先: ペイントエリア内 → シュート（トランジット中でも即打ち可）
            if (canShoot(currentPasser)) {
              s.pendingShot = computeShotTarget();
              s.pendingCooldown = 2.0;
              s.actionStates[s.onBallEntityIdx] = startAction('shoot', SHOOT_TIMING);
              s.moveDistAccum[s.onBallEntityIdx] = 0;
            } else {
              // パス評価・実行（味方がポジションにつくまでパスは出さない）
              const anyInTransit = s.offenseInTransit.some(t => t);
              if (!anyInTransit) {
                const fireResult = attemptFire(ctx, evalResult.selectedTargetIdx, SOLVER_CFG_3D);
                if (fireResult.fired && fireResult.solution) {
                  // receiver-array index → entity index にマッピング
                  fireResult.solution.targetIdx = receiverEntityIndices[fireResult.solution.targetIdx];
                  s.pendingFire = fireResult.solution;
                  s.pendingCooldown = fireResult.newCooldown;
                  s.actionStates[s.onBallEntityIdx] = startAction('pass', PASS_TIMING);
                  s.moveDistAccum[s.onBallEntityIdx] = 0;
                } else {
                  s.cooldown = fireResult.newCooldown;
                }
              }
            }
          }
        }
      }
    } else if (s.ballActive) {
      if (s.looseBall) {
        // === LOOSE BALL ===
        s.preFire = null;

        // ボール物理更新
        this.ball.update(dt);
        s.ballAge += dt;

        const ballPos = this.ball.getPosition();

        // Trail 更新
        this.ballTrailPositions.push(ballPos.clone());
        if (this.ballTrailPositions.length > TrackingSimulation3D.BALL_TRAIL_MAX) {
          this.ballTrailPositions.shift();
        }

        // 弾きクールダウン減算
        for (let oi = 0; oi < s.obstacleDeflectCooldowns.length; oi++) {
          if (s.obstacleDeflectCooldowns[oi] > 0) {
            s.obstacleDeflectCooldowns[oi] = Math.max(0, s.obstacleDeflectCooldowns[oi] - dt);
          }
        }

        // 全10エンティティがボールを追跡
        const allMoversLB = [s.launcher, ...s.targets, ...s.obstacles];
        const offenseCount = 1 + s.targets.length;  // 5
        for (let ei = 0; ei < allMoversLB.length; ei++) {
          const mover = allMoversLB[ei];
          const isOffense = ei < offenseCount;
          const chaseSpeed = isOffense
            ? TARGET_INTERCEPT_SPEED
            : OB_CONFIGS[ei - offenseCount].interceptSpeed;
          setChaserVelocity(mover, ballPos.x, ballPos.z, chaseSpeed, 0.1, dt);
          moveWithFacing(mover, chaseSpeed, dt);
        }

        // 回収判定（grace period 中はスキップ — ボールが離れる時間を確保）
        const ballInFlight = this.ball.isInFlight();
        const allHandsLB = this.vis.getHandWorldPositions(allMoversLB);
        const ballR = BALL_DIAMETER / 2;
        const handCatchDist = HAND_CATCH_RADIUS + ballR;
        let recoveredIdx = -1;
        const pastGrace = s.ballAge > LOOSE_BALL_GRACE_PERIOD;

        if (pastGrace && ballInFlight) {
          // ボール飛行中: 全エンティティの手で3D距離チェック
          let minHandDist = Infinity;
          for (let ei = 0; ei < allMoversLB.length; ei++) {
            const hands = allHandsLB[ei];
            const dl = Math.sqrt(
              (ballPos.x - hands.left.x) ** 2 +
              (ballPos.y - hands.left.y) ** 2 +
              (ballPos.z - hands.left.z) ** 2,
            );
            const dr = Math.sqrt(
              (ballPos.x - hands.right.x) ** 2 +
              (ballPos.y - hands.right.y) ** 2 +
              (ballPos.z - hands.right.z) ** 2,
            );
            const d = Math.min(dl, dr);
            if (d < handCatchDist && d < minHandDist) {
              minHandDist = d;
              recoveredIdx = ei;
            }
          }
        } else if (pastGrace) {
          // ボール着地後: 全エンティティの2Dボディ距離チェック
          let minBodyDist = Infinity;
          for (let ei = 0; ei < allMoversLB.length; ei++) {
            const d = dist2d(allMoversLB[ei].x, allMoversLB[ei].z, ballPos.x, ballPos.z);
            if (d < LOOSE_BALL_PICKUP_RADIUS && d < minBodyDist) {
              minBodyDist = d;
              recoveredIdx = ei;
            }
          }
        }

        // OOB/タイムアウト: 最寄りエンティティが自動回収
        const isOOB = Math.abs(ballPos.x) > SIM_FIELD_X_HALF + SIM_MARGIN
                   || Math.abs(ballPos.z) > SIM_FIELD_Z_HALF + SIM_MARGIN;
        if (recoveredIdx < 0 && (isOOB || s.ballAge > BALL_TIMEOUT)) {
          let minDist2 = Infinity;
          for (let ei = 0; ei < allMoversLB.length; ei++) {
            const d = dist2d(allMoversLB[ei].x, allMoversLB[ei].z, ballPos.x, ballPos.z);
            if (d < minDist2) { minDist2 = d; recoveredIdx = ei; }
          }
        }

        // 回収処理
        if (recoveredIdx >= 0) {
          deactivateBall(s, this.ball, this.ballTrailPositions);
          s.looseBall = false;
          for (let i = 0; i < s.actionStates.length; i++) s.actionStates[i] = createIdleAction();
          resetAfterResult(s);

          const isOffenseRecovery = recoveredIdx < offenseCount;
          if (isOffenseRecovery) {
            // オフェンス回収: そのプレイヤーが新しいボール保持者
            s.onBallEntityIdx = recoveredIdx;
            s.cooldown = 1.5;
            // Enable transit for smooth return to zones (no backcourt teleport)
            for (let i = 0; i < s.offenseInTransit.length; i++) s.offenseInTransit[i] = true;
          } else {
            // ディフェンス回収: スティール成功 → バックコートからリスタート
            s.score.steal++;
            s.onBallEntityIdx = 0;
            s.cooldown = 1.5;
            resetOffenseToBackcourt(s);
          }
        }
      } else if (s.interceptPt) {
        // === NORMAL PASS FLIGHT (既存コード) ===
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

        // Selected receiver: move toward intercept point
        const selReceiverIdx = s.selectedReceiverEntityIdx;
        const selTgt = getOffenseMover(s, selReceiverIdx);
        if (canEntityMove(s.actionStates, selReceiverIdx)) {
          if (s.interceptPt) {
            const ipDx = s.interceptPt.x - selTgt.x;
            const ipDz = s.interceptPt.z - selTgt.z;
            if (Math.sqrt(ipDx * ipDx + ipDz * ipDz) > TARGET_STOP_DIST) {
              moveWithFacing(selTgt, TARGET_INTERCEPT_SPEED, dt);
            } else {
              selTgt.vx = 0;
              selTgt.vz = 0;
            }
          }
        }
        applyMoveAction(s, selReceiverIdx, selTgt, dt);

        // Other targets continue role-based movement during ball flight
        // skipIdx: selected receiver が target なら skip（既に上で処理済み）
        const skipTargetIdx = selReceiverIdx > 0 ? selReceiverIdx - 1 : -1;
        updateTargetRoleMovements(s, dt, skipTargetIdx);

        // 手のワールド座標を取得（前フレームの腕方向ベクトルに基づく）
        const allMovers = [s.launcher, ...s.targets, ...s.obstacles];
        const allHands = this.vis.getHandWorldPositions(allMovers);
        const obStartIdx = 1 + s.targets.length;
        const obstacleHands = allHands.slice(obStartIdx, obStartIdx + s.obstacles.length);

        // レシーバーの手でキャッチ判定（パッサーを除く全オフェンス）
        const { entityIndices: receiverEntityIndices } = getReceiverInfo(s);
        const receiverHands = receiverEntityIndices.map(ei => allHands[ei]);

        // ① 弾きクールダウン更新
        for (let oi = 0; oi < s.obstacleDeflectCooldowns.length; oi++) {
          if (s.obstacleDeflectCooldowns[oi] > 0) {
            s.obstacleDeflectCooldowns[oi] = Math.max(0, s.obstacleDeflectCooldowns[oi] - dt);
          }
        }

        // ② 障害物の手によるボール弾き判定
        const deflection = checkObstacleDeflection(
          ballPos.x, ballPos.y, ballPos.z,
          obstacleHands, s.obstacleDeflectCooldowns,
        );
        if (deflection.deflected) {
          this.ball.applyImpulse(deflection.direction.scale(DEFLECT_IMPULSE));
          s.obstacleDeflectCooldowns[deflection.obstacleIdx] = DEFLECT_COOLDOWN;

          // ルーズボール突入
          s.looseBall = true;
          s.ballAge = 0;  // grace period 用にリセット
          s.interceptPt = null;
          for (let i = 0; i < s.actionStates.length; i++) s.actionStates[i] = createIdleAction();
          for (let i = 0; i < s.moveDistAccum.length; i++) s.moveDistAccum[i] = 0;
        }

        // ③ Ball result detection — レシーバーの手で判定（ルーズボール突入時はスキップ）
        if (!s.looseBall) {
          const detection = detectBallResult(
            ballPos.x, ballPos.y, ballPos.z,
            this.ball.isInFlight(), s.ballAge,
            receiverHands,
          );
          if (detection.result !== 'none') {
            deactivateBall(s, this.ball, this.ballTrailPositions);
            s.score[detection.result]++;

            // Hit → 最も近い手を持つレシーバーにキャッチアクションを設定
            if (detection.result === 'hit') {
              let hitReceiverArrayIdx = 0;
              let minDist = Infinity;
              for (let ri = 0; ri < receiverHands.length; ri++) {
                const lh = receiverHands[ri].left;
                const rh = receiverHands[ri].right;
                const dl = Math.sqrt((ballPos.x - lh.x) ** 2 + (ballPos.y - lh.y) ** 2 + (ballPos.z - lh.z) ** 2);
                const dr = Math.sqrt((ballPos.x - rh.x) ** 2 + (ballPos.y - rh.y) ** 2 + (ballPos.z - rh.z) ** 2);
                const d = Math.min(dl, dr);
                if (d < minDist) { minDist = d; hitReceiverArrayIdx = ri; }
              }
              const hitEntityIdx = receiverEntityIndices[hitReceiverArrayIdx];
              s.actionStates[hitEntityIdx] = startAction('catch', CATCH_TIMING);
              this.catchHoldInfo = { entityIdx: hitEntityIdx };
            }

            // ミス時: launcher に戻す
            if (detection.result === 'miss') {
              s.onBallEntityIdx = 0;
            }

            // Force obstacles/targets to recovery (passer runs independently, catch preserved)
            for (let i = 1; i < s.actionStates.length; i++) {
              if (s.actionStates[i].type === 'catch') continue;
              if (s.actionStates[i].phase !== 'idle') {
                s.actionStates[i] = forceRecovery(s.actionStates[i]);
              }
            }
            for (let i = 0; i < s.moveDistAccum.length; i++) s.moveDistAccum[i] = 0;
            resetAfterResult(s);

            // Miss/block: バックコートからリスタート（hit はキャッチ継続なのでスキップ）
            if (detection.result !== 'hit') {
              resetOffenseToBackcourt(s);
            }
          }
        }
      } else {
        // === SHOT FLIGHT (interceptPt === null) ===
        s.preFire = null;

        // Update Ball physics
        this.ball.update(dt);
        s.ballAge += dt;

        const ballPos = this.ball.getPosition();

        // Trail 更新
        this.ballTrailPositions.push(ballPos.clone());
        if (this.ballTrailPositions.length > TrackingSimulation3D.BALL_TRAIL_MAX) {
          this.ballTrailPositions.shift();
        }

        // Targets continue role movement during shot flight
        updateTargetRoleMovements(s, dt, -1);

        // ゴール判定: Y がリム高さを上→下に通過 & XZ距離がリム半径内
        const curBallY = ballPos.y;
        const crossedDown = s.prevBallY > GOAL_RIM_Y && curBallY <= GOAL_RIM_Y;
        const xzDist = Math.sqrt(
          (ballPos.x - GOAL_RIM_X) ** 2 + (ballPos.z - GOAL_RIM_Z) ** 2,
        );
        let shotResolved = false;

        if (crossedDown && xzDist < GOAL_RIM_RADIUS) {
          // ゴール成功
          deactivateBall(s, this.ball, this.ballTrailPositions);
          s.score.goal++;
          shotResolved = true;
        } else {
          // ミス判定: 着地 / OOB / タイムアウト
          const ballLanded = !this.ball.isInFlight();
          const margin = SIM_MARGIN * 2;
          const isOOB = ballPos.x < -SIM_FIELD_X_HALF - margin || ballPos.x > SIM_FIELD_X_HALF + margin
            || ballPos.z < -SIM_FIELD_Z_HALF - margin || ballPos.z > SIM_FIELD_Z_HALF + margin;
          if ((ballLanded && s.ballAge > 1.0) || isOOB || s.ballAge > BALL_TIMEOUT) {
            deactivateBall(s, this.ball, this.ballTrailPositions);
            s.score.shotMiss++;
            shotResolved = true;
          }
        }

        s.prevBallY = curBallY;

        if (shotResolved) {
          // シュート結果後のリセット
          for (let i = 0; i < s.actionStates.length; i++) s.actionStates[i] = createIdleAction();
          for (let i = 0; i < s.moveDistAccum.length; i++) s.moveDistAccum[i] = 0;
          resetAfterResult(s);
          resetOffenseToBackcourt(s);
          s.cooldown = 1.0;
        }
      }
    } else {
      // === Catch hold 中: targets continue role movement ===
      updateTargetRoleMovements(s, dt, -1);
    }

    // === Gated processing (skip during loose ball — handled in branch above) ===
    if (!s.looseBall) {
      // === All 5 obstacles movement (unified for all branches) ===
      updateObstacleMovements(s, dt, getOffenseMover(s, s.onBallEntityIdx));

      // === Scan updates ===
      const scanBallPos = s.ballActive ? this.ball.getPosition() : Vector3.Zero();
      updateScans(s, s.ballActive, scanBallPos, dt);

      // === Offense neck facing ===
      const offenseBallPos = s.ballActive ? this.ball.getPosition() : null;
      updateOffenseTorsoNeckFacing(s, s.ballActive, offenseBallPos, dt);
    }

    // === Separate overlapping entities (always) ===
    separateEntities([
      { mover: s.launcher, radius: LAUNCHER_RADIUS },
      ...s.targets.map(t => ({ mover: t, radius: TARGET_RADIUS })),
      ...s.obstacles.map(o => ({ mover: o, radius: OBSTACLE_RADIUS })),
    ]);

    // === Player state snapshot (always) ===
    this.playerStateManager.update(s);
  }
}
