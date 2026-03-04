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
} from "./Config/FieldConfig";
import {
  LAUNCHER_RADIUS,
  TARGET_RADIUS,
  OBSTACLE_RADIUS,
} from "./Config/CollisionConfig";
import {
  DEFLECT_IMPULSE,
  DEFLECT_COOLDOWN,
  ON_BALL_SPEED_MULT,
  ONBALL_BLOCK_RADIUS,
} from "./Config/DefenseConfig";

import {
  LAUNCHER_SPEED,
  TARGET_RANDOM_SPEED,
  SOLVER_CFG_3D,
  INIT_LAUNCHER,
  INIT_TARGETS,
  INIT_OBSTACLES,
} from "./Config/EntityConfig";

import { ROLE_ASSIGNMENTS } from "./Decision/OffenseRoleAssignment";
import {
  SPAWN_PAINT_X_HALF,
  SPAWN_PAINT_Z_MIN,
  SPAWN_PAINT_Z_MAX,
  SPAWN_BASELINE_Z,
} from "./Config/FieldConfig";

import type {
  SimState,
  SimMover,
  TrackingSimScore,
  BallFireContext,
} from "./Types/TrackingSimTypes";

import {
  makeMover,
  makeScanMemory,
  separateEntities,
  blockOnBallByDefenders,
} from "./Movement/MovementCore";

import {
  moveOnBallSmart,
  moveOnBallDrive,
  isDriveLaneClear,
  moveTransitToHome,
} from "./Movement/RoleMovement";
import { tickJumpPhysics, startJump } from "./Movement/JumpPhysics";
import { shouldAttemptBlock, BLOCK_TIMING } from "./Action/BlockAction";
import { BLOCK_JUMP_VY } from "./Config/JumpConfig";

import { createIdleAction, startAction, forceRecovery } from "./Action/ActionCore";
import { computePassTiming } from "./Action/PassAction";
import { evaluatePreFire, attemptFire } from "./Decision/PassEvaluation";
import { checkObstacleDeflection } from "./Update/BallCollision";
import { CATCH_TIMING } from "./Action/CatchAction";
import { computeShotTarget, computeShootTiming, classifyShotType, getJumpVelocity } from "./Action/ShootAction";
import { GOAL_RIM_X, GOAL_RIM_Z } from "./Config/ShootConfig";
import {
  computeDribbleHand,
  computePassAlignCharge,
  computeShootAlignCharge,
  isAlignedForFire,
} from "./Decision/ActionDirectionCheck";

import { tickAndTransitionActions, canEntityMove, applyMoveAction } from "./Update/SimActionManager";
import { deactivateBall, executePendingFire, executePendingShot, resetAfterResult, resetOffenseToBackcourt, OB_INT_SPEEDS } from "./Update/SimBallManager";
import { updateTargetRoleMovements, updateObstacleMovements, updateScans, updateOffenseTorsoNeckFacing, computePushObstructions } from "./Update/SimEntityUpdate";
import { updateLooseBall } from "./Update/LooseBallHandler";
import { updatePassFlight } from "./Update/PassFlightHandler";
import { updateShotFlight } from "./Update/ShotFlightHandler";

import { SimVisualization, HAND_DIAMETER, type OverlayVisibility } from "./Visualization/SimVisualization";

/** ドリブルバウンスの周波数（移動距離あたりの位相進行: 1ステップに1バウンド） */
const DRIBBLE_BOUNCE_FREQ = 7.0;
/** バウンス停止時の位相戻り速度 */
const DRIBBLE_BOUNCE_RETURN_SPEED = 8.0;
import { SimPlayerStateManager } from "./State/SimPlayerStateManager";
import { OB_CONFIGS, OBSTACLE_COUNT } from "./Decision/ObstacleRoleAssignment";
import { Ball } from "@/GamePlay/Object/Entities/Ball";
import { OffBallIntentManager } from "./Decision/OffBallIntent";
import { buildOnBallContext, evaluateActions } from "./Decision/ActionScorer";

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
  private intentManager: OffBallIntentManager;

  private ballTrailPositions: Vector3[] = [];
  private static readonly BALL_TRAIL_MAX = 40;

  /** キャッチ保持中の情報（ボールを手に表示し続ける） */
  private catchHoldInfo: { entityIdx: number } | null = null;

  /** ドリブルバウンス状態 */
  private dribbleBouncePhase = 0;
  private dribblePrevX = 0;
  private dribblePrevZ = 0;
  private dribblePrevEntityIdx = -1;

  private state!: SimState;
  private prevTime = 0;
  private lastDt = 0;

  constructor(scene: Scene, ball: Ball) {
    this.scene = scene;
    this.ball = ball;
    this.ball.mesh.setEnabled(false);
    this.vis = new SimVisualization(scene);
    this.playerStateManager = new SimPlayerStateManager();
    this.intentManager = new OffBallIntentManager();
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

  public setActionGaugeVisible(visible: boolean): void {
    this.vis.setActionGaugeVisible(visible);
  }

  public getOverlayVisibility(): OverlayVisibility {
    return this.vis.getVisibility();
  }

  public reset(): void {
    this.catchHoldInfo = null;
    this.intentManager.reset();
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

    this.dribbleBouncePhase = 0;
    this.dribblePrevEntityIdx = -1;

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
      onBallTargetState: { dest: null, reevalTimer: 0, bestPassTargetIdx: 0 },
      slasherState: { dest: null, reevalTimer: 0, vcutPhase: 0, vcutActive: false },
      screenerState: { dest: null, reevalTimer: 0, screenSet: false, holdTimer: 0 },
      dunkerState: { dest: null, reevalTimer: 0, sealing: false },
      obstacleDeflectCooldowns: new Array(OBSTACLE_COUNT).fill(0),
      pushObstructions: [],
      looseBall: false,
      offenseInTransit: new Array(1 + INIT_TARGETS.length).fill(true),
      pendingShot: null,
      prevBallY: 0,
      lastScorerResult: null,
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
    this.vis.launcherMesh.position.set(s.launcher.x, yh + s.launcher.y, s.launcher.z);
    this.vis.launcherMesh.rotation.y = Math.PI / 2 - s.launcher.facing;

    // Targets
    for (let i = 0; i < s.targets.length; i++) {
      this.vis.targetMeshes[i].position.set(s.targets[i].x, yh + s.targets[i].y, s.targets[i].z);
      this.vis.targetMeshes[i].rotation.y = Math.PI / 2 - s.targets[i].facing;
    }

    // Obstacles
    for (let i = 0; i < s.obstacles.length; i++) {
      this.vis.obstacleMeshes[i].position.set(s.obstacles[i].x, yh + s.obstacles[i].y, s.obstacles[i].z);
      this.vis.obstacleMeshes[i].rotation.y = Math.PI / 2 - s.obstacles[i].facing;
    }

    // --- Phase 1: ballMarker 計算 ---
    const allMovers = [s.launcher, ...s.targets, ...s.obstacles];

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

      const ballArm = new Vector3(onBallMover.x, ENTITY_HEIGHT * 1.3, onBallMover.z);
      const denyArm = new Vector3(selReceiver.x, ENTITY_HEIGHT * 0.9, selReceiver.z);

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
      break;
    }

    // --- Phase 1.5: ドリブルバウンス位相を計算（syncAll の腕ポンプに渡すため） ---
    let dribbleBounceH = 0;
    if (!s.ballActive && !this.catchHoldInfo) {
      const mover = allMovers[s.onBallEntityIdx];

      if (s.onBallEntityIdx !== this.dribblePrevEntityIdx) {
        this.dribblePrevX = mover.x;
        this.dribblePrevZ = mover.z;
        this.dribbleBouncePhase = 0;
        this.dribblePrevEntityIdx = s.onBallEntityIdx;
      }

      const moveDx = mover.x - this.dribblePrevX;
      const moveDz = mover.z - this.dribblePrevZ;
      const moveDist = Math.sqrt(moveDx * moveDx + moveDz * moveDz);
      const vel = Math.sqrt(mover.vx * mover.vx + mover.vz * mover.vz);

      if (vel > 0.01) {
        this.dribbleBouncePhase += moveDist * DRIBBLE_BOUNCE_FREQ;
      } else {
        const nearestNPi = Math.round(this.dribbleBouncePhase / Math.PI) * Math.PI;
        const phaseDiff = nearestNPi - this.dribbleBouncePhase;
        this.dribbleBouncePhase += phaseDiff * (1 - Math.exp(-DRIBBLE_BOUNCE_RETURN_SPEED * this.lastDt));
      }

      this.dribblePrevX = mover.x;
      this.dribblePrevZ = mover.z;

      dribbleBounceH = Math.abs(Math.cos(this.dribbleBouncePhase));
    }

    // --- Phase 2: syncAll で腕・脚・torso を更新 ---
    // 暫定 ballHeldPosition: 前フレームのボール位置を使用（他エンティティの腕追跡用）
    const tentativeBallHeld = (!s.ballActive || this.catchHoldInfo)
      ? this.ball.mesh.position.clone()
      : null;

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
        ballHeldPosition: tentativeBallHeld,
        ballMarkerLeftArmTarget,
        ballMarkerRightArmTarget,
        ballMarkerEntityIdx,
        pushObstructions: s.pushObstructions,
        onBallEntityIdx: s.onBallEntityIdx,
        dt: this.lastDt,
        dribbleBounceH,
      });
    } catch (e) {
      console.error('[TrackingSimulation3D] visualization error:', e);
    }

    // --- Phase 3: 更新後の手の位置でボールを配置 ---
    const allHands = this.vis.getHandWorldPositions(allMovers);
    let ballHeldPosition: Vector3 | null = null;

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
      // オンボールプレイヤーのドリブルハンドにボールを表示（バウンス付き）
      // 手のひらは bounceH に同期してポンプ動作済み（ArmRenderer 内で reach 変動）
      const hands = allHands[s.onBallEntityIdx];
      if (hands) {
        const dribbleHand = this.vis.getDribbleHand();
        const handPos = dribbleHand === 'left' ? hands.left : hands.right;
        const ballR = BALL_DIAMETER / 2;
        const handR = HAND_DIAMETER / 2;

        // バウンス上端: ボール中心が手のひら最下点の高さ（手のひらはポンプで上昇済み）
        const topBallY = handPos.y - handR;
        // バウンス下端: 地面に接するボール中心位置
        const groundBallY = ballR;

        // dribbleBounceH: 1=手のひら直下, 0=地面（Phase 1.5 で計算済み）
        const ballY = groundBallY + dribbleBounceH * (topBallY - groundBallY);

        // X/Z は手の真下（手のXZ座標をそのまま使用）
        ballHeldPosition = new Vector3(handPos.x, ballY, handPos.z);
        this.ball.mesh.position.copyFrom(ballHeldPosition);
      }
    }

    // Ball visibility: 飛行中、キャッチ保持中、またはオンボール保持中は常に表示
    this.ball.mesh.setEnabled(s.ballActive || ballHeldPosition !== null);
  }

  // =========================================================================
  // Main update
  // =========================================================================

  private update(dt: number): void {
    const s = this.state;

    // === Tick action states ===
    // passer は tick 時点の on-ball entity（catch hold 変更前）
    const passer = getOffenseMover(s, s.onBallEntityIdx);
    const transitionResult = tickAndTransitionActions(s, dt);
    let { shouldFireBall, shouldShootBall } = transitionResult;
    const { shooterStartedStartup } = transitionResult;

    // シュート charge→startup 遷移 → シューターのジャンプ開始 + ブロック意思決定
    if (shooterStartedStartup) {
      const shooterMover = getOffenseMover(s, s.onBallEntityIdx);
      const shotType = classifyShotType(shooterMover);
      startJump(shooterMover, getJumpVelocity(shotType));

      // ブロック意思決定: on-ball DF を特定
      const onBallDefOi = OB_CONFIGS.findIndex(c => c.markTargetEntityIdx === s.onBallEntityIdx);
      if (onBallDefOi >= 0) {
        const defEntityIdx = 1 + s.targets.length + onBallDefOi;
        const defender = s.obstacles[onBallDefOi];
        const defAction = s.actionStates[defEntityIdx];
        // idle or move-active のDFのみブロック可能
        if (defAction.phase === 'idle' || (defAction.type === 'move' && defAction.phase === 'active')) {
          if (shouldAttemptBlock(defender, shooterMover)) {
            s.actionStates[defEntityIdx] = startAction('block', BLOCK_TIMING);
            startJump(defender, BLOCK_JUMP_VY);
          }
        }
      }
    }

    // パス発射時アラインメント検証
    if (shouldFireBall) {
      const dribbleHand = computeDribbleHand(passer, s.obstacles);
      if (!s.pendingFire || !isAlignedForFire(passer, s.pendingFire.interceptX, s.pendingFire.interceptZ, 'pass', dribbleHand)) {
        s.actionStates[s.onBallEntityIdx] = forceRecovery(s.actionStates[s.onBallEntityIdx], 0.2);
        s.pendingFire = null;
        s.pendingCooldown = 0.5;
        s.cooldown = 0.5;
        shouldFireBall = false;
      }
    }

    // シュート発射時アラインメント検証
    if (shouldShootBall) {
      if (!isAlignedForFire(passer, GOAL_RIM_X, GOAL_RIM_Z, 'shoot', 'right')) {
        s.actionStates[s.onBallEntityIdx] = forceRecovery(s.actionStates[s.onBallEntityIdx], 0.2);
        s.pendingShot = null;
        s.pendingCooldown = 0.5;
        s.cooldown = 0.5;
        shouldShootBall = false;
      }
    }

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
        const catcherIdx = this.catchHoldInfo.entityIdx;
        s.onBallEntityIdx = catcherIdx;
        this.catchHoldInfo = null;

        // Reset on-ball target state for the new ball holder
        s.onBallTargetState = { dest: null, reevalTimer: 0, bestPassTargetIdx: 0 };

        // intent チェック → 有効なら cooldown = 0 で即行動、無効でも 0.3s で判断開始
        const intent = this.intentManager.consumeIntent(s, catcherIdx);
        s.cooldown = intent ? 0 : 0.3;
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
          } else if (launcherIsOnBall && !this.catchHoldInfo && isDriveLaneClear(s.launcher, s.obstacles)) {
            moveOnBallDrive(s.launcher, dt);
          } else {
            moveOnBallSmart(s.launcher, s.launcherState, s.targets, s.obstacles, ROLE_ASSIGNMENTS.launcher, dt);
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
        // On-ball target: smart movement（updateTargetRoleMovements でスキップされた分）
        if (s.onBallEntityIdx > 0) {
          const onBallTgt = s.targets[s.onBallEntityIdx - 1];
          const prevTX = onBallTgt.x, prevTZ = onBallTgt.z;

          if (canEntityMove(s.actionStates, s.onBallEntityIdx)) {
            if (s.offenseInTransit[s.onBallEntityIdx]) {
              const arrived = moveTransitToHome(onBallTgt, s.onBallEntityIdx, dt);
              if (arrived) s.offenseInTransit[s.onBallEntityIdx] = false;
            } else if (isDriveLaneClear(onBallTgt, s.obstacles)) {
              moveOnBallDrive(onBallTgt, dt);
            } else {
              // Build receivers list: launcher + other targets (excluding self)
              const onBallReceivers: SimMover[] = [s.launcher];
              for (let ti = 0; ti < s.targets.length; ti++) {
                if (ti !== s.onBallEntityIdx - 1) onBallReceivers.push(s.targets[ti]);
              }
              const onBallRole = ROLE_ASSIGNMENTS.targets[s.onBallEntityIdx - 1];
              moveOnBallSmart(onBallTgt, s.onBallTargetState, onBallReceivers, s.obstacles, onBallRole, dt);
            }
          }
          applyMoveAction(s, s.onBallEntityIdx, onBallTgt, dt);

          // ボール保持時: 移動速度を0.75倍に制限 + ディフェンダー方向ブロック
          const dtx = onBallTgt.x - prevTX, dtz = onBallTgt.z - prevTZ;
          onBallTgt.x = prevTX + dtx * ON_BALL_SPEED_MULT;
          onBallTgt.z = prevTZ + dtz * ON_BALL_SPEED_MULT;
          blockOnBallByDefenders(onBallTgt, prevTX, prevTZ, s.obstacles, ONBALL_BLOCK_RADIUS);
        }

        // OffBallIntent 更新（オフボールプレイヤーの行動事前計画）
        this.intentManager.update(s, dt);

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
            // ActionScorer で最適行動を選択
            const scorerCtx = buildOnBallContext(
              s, evalResult.preFire, evalResult.selectedTargetIdx,
              receiverEntityIndices, receiverRoles, ctx, this.intentManager,
            );
            const scorerResult = evaluateActions(scorerCtx);
            s.lastScorerResult = scorerResult;
            s.selectedReceiverEntityIdx = scorerResult.bestPassReceiverEntityIdx;
            s.preFire = scorerResult.preFire;

            if (scorerResult.bestAction === 'shoot') {
              const shootAlignCharge = computeShootAlignCharge(currentPasser, GOAL_RIM_X, GOAL_RIM_Z);
              s.pendingShot = computeShotTarget();
              s.pendingCooldown = 2.0;
              s.actionStates[s.onBallEntityIdx] = startAction('shoot', computeShootTiming(currentPasser, shootAlignCharge));
              s.moveDistAccum[s.onBallEntityIdx] = 0;
            } else if (scorerResult.bestAction === 'pass') {
              const anyInTransit = s.offenseInTransit.some(t => t);
              if (!anyInTransit) {
                const fireResult = attemptFire(ctx, evalResult.selectedTargetIdx, SOLVER_CFG_3D);
                if (fireResult.fired && fireResult.solution) {
                  fireResult.solution.targetIdx = receiverEntityIndices[fireResult.solution.targetIdx];
                  const receiverMover = getOffenseMover(s, fireResult.solution.targetIdx);
                  const dribbleHand = computeDribbleHand(currentPasser, s.obstacles);
                  const passAlignCharge = computePassAlignCharge(currentPasser, receiverMover.x, receiverMover.z, dribbleHand);
                  s.pendingFire = fireResult.solution;
                  s.pendingCooldown = fireResult.newCooldown;
                  s.actionStates[s.onBallEntityIdx] = startAction('pass', computePassTiming(passAlignCharge));
                  s.moveDistAccum[s.onBallEntityIdx] = 0;
                } else {
                  s.cooldown = fireResult.newCooldown;
                }
              }
            } else {
              // hold → 0.1s 後に再評価
              s.cooldown = 0.1;
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

        // ルーズボール移動 + 回収判定
        const allMoversLB = [s.launcher, ...s.targets, ...s.obstacles];
        const allHandsLB = this.vis.getHandWorldPositions(allMoversLB);
        const lbResult = updateLooseBall(s, ballPos, this.ball.isInFlight(), dt, allHandsLB);

        if (lbResult.recovered) {
          deactivateBall(s, this.ball, this.ballTrailPositions);
          s.looseBall = false;
          for (let i = 0; i < s.actionStates.length; i++) s.actionStates[i] = createIdleAction();
          resetAfterResult(s);

          if (lbResult.isOffenseRecovery) {
            s.onBallEntityIdx = lbResult.recoveredEntityIdx;
            s.cooldown = 1.5;
            for (let i = 0; i < s.offenseInTransit.length; i++) s.offenseInTransit[i] = true;
            this.intentManager.reset();
          } else {
            s.score.steal++;
            s.onBallEntityIdx = 0;
            s.cooldown = 1.5;
            resetOffenseToBackcourt(s);
            this.intentManager.reset();
          }
        }
      } else if (s.interceptPt) {
        // === NORMAL PASS FLIGHT ===
        s.preFire = null;

        this.ball.update(dt);
        s.ballAge += dt;

        const ballPos = this.ball.getPosition();

        this.ballTrailPositions.push(ballPos.clone());
        if (this.ballTrailPositions.length > TrackingSimulation3D.BALL_TRAIL_MAX) {
          this.ballTrailPositions.shift();
        }

        const allMovers = [s.launcher, ...s.targets, ...s.obstacles];
        const allHands = this.vis.getHandWorldPositions(allMovers);
        const pfResult = updatePassFlight(s, ballPos, this.ball.isInFlight(), dt, allHands);

        if (pfResult.deflectedToLoose) {
          this.ball.applyImpulse(pfResult.deflectImpulse!);
          s.looseBall = true;
        } else if (pfResult.completed) {
          deactivateBall(s, this.ball, this.ballTrailPositions);
          s.score[pfResult.result as keyof TrackingSimScore]++;

          if (pfResult.result === 'hit') {
            s.actionStates[pfResult.hitReceiverEntityIdx] = startAction('catch', CATCH_TIMING);
            this.catchHoldInfo = { entityIdx: pfResult.hitReceiverEntityIdx };
          }
          if (pfResult.result === 'miss') {
            s.onBallEntityIdx = 0;
          }

          for (let i = 1; i < s.actionStates.length; i++) {
            if (s.actionStates[i].type === 'catch') continue;
            if (s.actionStates[i].phase !== 'idle') {
              s.actionStates[i] = forceRecovery(s.actionStates[i]);
            }
          }
          for (let i = 0; i < s.moveDistAccum.length; i++) s.moveDistAccum[i] = 0;
          resetAfterResult(s);

          if (pfResult.result !== 'hit') {
            resetOffenseToBackcourt(s);
            this.intentManager.reset();
          }
        }
      } else {
        // === SHOT FLIGHT (interceptPt === null) ===
        s.preFire = null;

        this.ball.update(dt);
        s.ballAge += dt;

        const ballPos = this.ball.getPosition();

        this.ballTrailPositions.push(ballPos.clone());
        if (this.ballTrailPositions.length > TrackingSimulation3D.BALL_TRAIL_MAX) {
          this.ballTrailPositions.shift();
        }

        // allHands を計算してブロック判定に渡す
        const allMoversSF = [s.launcher, ...s.targets, ...s.obstacles];
        const allHandsSF = this.vis.getHandWorldPositions(allMoversSF);
        const sfResult = updateShotFlight(s, ballPos, this.ball.isInFlight(), dt, allHandsSF);

        if (sfResult.blocked && sfResult.blockDirection) {
          // ショットブロック成功 → ルーズボール遷移
          this.ball.startFlight();
          this.ball.applyImpulse(sfResult.blockDirection.scale(DEFLECT_IMPULSE));
          s.looseBall = true;
          s.interceptPt = null;
          for (let i = 0; i < s.actionStates.length; i++) s.actionStates[i] = createIdleAction();
          for (let i = 0; i < s.moveDistAccum.length; i++) s.moveDistAccum[i] = 0;
        } else if (sfResult.completed) {
          deactivateBall(s, this.ball, this.ballTrailPositions);
          if (sfResult.scored) {
            s.score.goal++;
          } else {
            s.score.shotMiss++;
          }
          for (let i = 0; i < s.actionStates.length; i++) s.actionStates[i] = createIdleAction();
          for (let i = 0; i < s.moveDistAccum.length; i++) s.moveDistAccum[i] = 0;
          resetAfterResult(s);
          resetOffenseToBackcourt(s);
          this.intentManager.reset();
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

    // === Jump physics tick (all entities) ===
    const allMoversForJump = [s.launcher, ...s.targets, ...s.obstacles];
    for (const mover of allMoversForJump) {
      tickJumpPhysics(mover, dt);
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
