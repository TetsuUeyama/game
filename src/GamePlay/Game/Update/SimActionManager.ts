/**
 * SimActionManager - アクション状態の tick/遷移ロジック
 * TrackingSimulation3D から抽出。
 */

import type { SimState, SimMover, ActionState } from "../Types/TrackingSimTypes";
import {
  tickActionState,
  forceRecovery,
  startAction,
} from "../Action/ActionCore";
import { MOVE_TIMING, computeMoveRecovery } from "../Action/MoveAction";

/** エンティティが移動可能かチェック（idle or move-active、block中は移動不可） */
export function canEntityMove(actionStates: ActionState[], entityIdx: number): boolean {
  const s = actionStates[entityIdx];
  if (s.type === 'block') return false;
  return s.phase === 'idle' || (s.type === 'move' && s.phase === 'active');
}

/** 移動アクション管理: 移動関数実行後に呼ぶ */
export function applyMoveAction(state: SimState, entityIdx: number, entity: SimMover, _dt: number): void {
  const actionState = state.actionStates[entityIdx];

  if (actionState.phase === 'idle') {
    // idle & 速度あり → 移動アクション開始（startup → 次フレームから移動）
    if (Math.abs(entity.vx) > 0.01 || Math.abs(entity.vz) > 0.01) {
      state.actionStates[entityIdx] = startAction('move', MOVE_TIMING);
      entity.vx = 0;
      entity.vz = 0;
    }
  } else if (actionState.type === 'move' && actionState.phase === 'active') {
    // 速度がほぼ0（目的地到達）→ lastSpeed ベースのリカバリーへ
    const speed = Math.sqrt(entity.vx * entity.vx + entity.vz * entity.vz);
    if (speed < 0.01) {
      state.actionStates[entityIdx] = forceRecovery(
        actionState, computeMoveRecovery(entity.lastSpeed),
      );
    }
  } else {
    // startup, recovery, or 非moveアクション → 移動不可
    entity.vx = 0;
    entity.vz = 0;
  }
}

/** tickAndTransitionActions の返り値 */
export interface ActionTransitionResult {
  shouldFireBall: boolean;
  shouldShootBall: boolean;
  /** シュート charge→startup 遷移が発生（ジャンプ開始タイミング） */
  shooterStartedStartup: boolean;
}

/**
 * 全アクション状態を dt 分 tick し、遷移を処理する。
 * @returns shouldFireBall/shouldShootBall - pass/shoot の startup→active 遷移が発生した場合 true
 */
export function tickAndTransitionActions(state: SimState, dt: number): ActionTransitionResult {
  const prevStates = state.actionStates.map(s => ({ phase: s.phase, type: s.type }));

  // Tick all action states
  for (let i = 0; i < state.actionStates.length; i++) {
    state.actionStates[i] = tickActionState(state.actionStates[i], dt);
  }

  // Move active → recovery: 速度に応じたリカバリー時間を設定
  const allMovers = [state.launcher, ...state.targets, ...state.obstacles];
  for (let i = 0; i < 6; i++) {
    if (prevStates[i].type === 'move' && prevStates[i].phase === 'active'
        && state.actionStates[i].phase === 'recovery') {
      const mover = allMovers[i];
      state.actionStates[i] = forceRecovery(
        state.actionStates[i], computeMoveRecovery(mover.lastSpeed),
      );
    }
  }

  const onBall = state.onBallEntityIdx;
  let shouldFireBall = false;
  let shouldShootBall = false;
  let shooterStartedStartup = false;

  // Shooter shoot: charge → startup → ジャンプ開始タイミング
  if (prevStates[onBall].type === 'shoot' && prevStates[onBall].phase === 'charge'
      && state.actionStates[onBall].phase === 'startup') {
    shooterStartedStartup = true;
  }

  // Passer pass: startup → active → fire ball
  if (prevStates[onBall].type === 'pass' && prevStates[onBall].phase === 'startup'
      && state.actionStates[onBall].phase === 'active') {
    shouldFireBall = true;
  }

  // Shooter shoot: startup → active → shoot ball
  if (prevStates[onBall].type === 'shoot' && prevStates[onBall].phase === 'startup'
      && state.actionStates[onBall].phase === 'active') {
    shouldShootBall = true;
  }

  // Passer pass: recovery → idle → set cooldown
  if (prevStates[onBall].type === 'pass' && prevStates[onBall].phase === 'recovery'
      && state.actionStates[onBall].phase === 'idle') {
    state.cooldown = state.pendingCooldown;
  }

  // Shooter shoot: recovery → idle → set cooldown
  if (prevStates[onBall].type === 'shoot' && prevStates[onBall].phase === 'recovery'
      && state.actionStates[onBall].phase === 'idle') {
    state.cooldown = state.pendingCooldown;
  }

  // Block: active中に着地 → forceRecovery
  for (let i = 0; i < state.actionStates.length; i++) {
    const as = state.actionStates[i];
    if (as.type === 'block' && as.phase === 'active') {
      const moverIdx = i;
      // SimState の全 movers にアクセスするため、entityIdx からmoverを取得
      const allMovers = [state.launcher, ...state.targets, ...state.obstacles];
      if (moverIdx < allMovers.length) {
        const mover = allMovers[moverIdx];
        if (mover.y <= 0 && mover.vy <= 0) {
          state.actionStates[i] = forceRecovery(as);
        }
      }
    }
  }

  return { shouldFireBall, shouldShootBall, shooterStartedStartup };
}
