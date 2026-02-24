/**
 * SimActionManager - アクション状態の tick/遷移ロジック
 * TrackingSimulation3D から抽出。
 */

import type { SimState, ActionState } from "../Types/TrackingSimTypes";
import {
  tickActionState,
  forceRecovery,
  startAction,
} from "../Action/ActionCore";
import { MOVE_TIMING, computeMoveRecovery } from "../Action/MoveAction";

/** エンティティが移動可能かチェック（idle or move-active） */
export function canEntityMove(actionStates: ActionState[], entityIdx: number): boolean {
  const s = actionStates[entityIdx];
  return s.phase === 'idle' || (s.type === 'move' && s.phase === 'active');
}

/** 移動アクション管理: 移動関数実行後に呼ぶ */
export function applyMoveAction(state: SimState, entityIdx: number, entity: { vx: number; vz: number }, dt: number): void {
  const actionState = state.actionStates[entityIdx];

  if (actionState.phase === 'idle') {
    // idle & 速度あり → 移動アクション開始（startup → 次フレームから移動）
    if (Math.abs(entity.vx) > 0.01 || Math.abs(entity.vz) > 0.01) {
      state.actionStates[entityIdx] = startAction('move', MOVE_TIMING);
      state.moveDistAccum[entityIdx] = 0;
      entity.vx = 0;
      entity.vz = 0;
    }
  } else if (actionState.type === 'move' && actionState.phase === 'active') {
    // 移動中 → 距離を蓄積
    const speed = Math.sqrt(entity.vx * entity.vx + entity.vz * entity.vz);
    state.moveDistAccum[entityIdx] += speed * dt;
    // 速度がほぼ0（目的地到達）→ リカバリーへ
    if (speed < 0.01) {
      state.actionStates[entityIdx] = forceRecovery(
        actionState, computeMoveRecovery(state.moveDistAccum[entityIdx]),
      );
      state.moveDistAccum[entityIdx] = 0;
    }
  } else {
    // startup, recovery, or 非moveアクション → 移動不可
    entity.vx = 0;
    entity.vz = 0;
  }
}

/**
 * 全アクション状態を dt 分 tick し、遷移を処理する。
 * @returns shouldFireBall - launcher の pass startup→active 遷移が発生した場合 true
 */
export function tickAndTransitionActions(state: SimState, dt: number): boolean {
  const prevStates = state.actionStates.map(s => ({ phase: s.phase, type: s.type }));

  // Tick all action states
  for (let i = 0; i < state.actionStates.length; i++) {
    state.actionStates[i] = tickActionState(state.actionStates[i], dt);
  }

  // Move active → recovery: 距離に応じたリカバリー時間を設定
  for (let i = 0; i < 6; i++) {
    if (prevStates[i].type === 'move' && prevStates[i].phase === 'active'
        && state.actionStates[i].phase === 'recovery') {
      state.actionStates[i] = forceRecovery(
        state.actionStates[i], computeMoveRecovery(state.moveDistAccum[i]),
      );
      state.moveDistAccum[i] = 0;
    }
  }

  // Launcher pass: startup → active → fire ball
  let shouldFireBall = false;
  if (prevStates[0].type === 'pass' && prevStates[0].phase === 'startup'
      && state.actionStates[0].phase === 'active') {
    shouldFireBall = true;
  }

  // Launcher pass: recovery → idle → set cooldown
  if (prevStates[0].type === 'pass' && prevStates[0].phase === 'recovery'
      && state.actionStates[0].phase === 'idle') {
    state.cooldown = state.pendingCooldown;
  }

  return shouldFireBall;
}
