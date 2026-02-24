/**
 * ActionCore - アクション状態管理の共通ユーティリティ
 * すべてのアクション（Pass, Move, Catch, ObstacleReact）で共有する基本関数。
 */

import type {
  ActionType,
  ActionTiming,
  ActionState,
} from "../Types/TrackingSimTypes";

/** アクションなし（アイドル状態） */
export function createIdleAction(): ActionState {
  return { type: 'idle', phase: 'idle', elapsed: 0, timing: null };
}

/** 新しいアクションを開始 */
export function startAction(type: ActionType, timing: ActionTiming): ActionState {
  if (timing.startup > 0) return { type, phase: 'startup', elapsed: 0, timing };
  if (timing.active > 0) return { type, phase: 'active', elapsed: 0, timing };
  if (timing.recovery > 0) return { type, phase: 'recovery', elapsed: 0, timing };
  return createIdleAction();
}

/**
 * アクション状態を dt 分進める
 * - startup → active: 自動遷移（タイマー）
 * - active → recovery: 自動遷移（タイマー、fixedの場合）
 * - recovery → idle: 自動遷移（タイマー）
 */
export function tickActionState(state: ActionState, dt: number): ActionState {
  if (state.phase === 'idle' || !state.timing) return state;

  const t = state.timing;
  let phase = state.phase;
  let elapsed = state.elapsed + dt;

  // startup → active（自動遷移）
  if (phase === 'startup' && elapsed >= t.startup) {
    elapsed -= t.startup;
    phase = 'active';
  }
  // active → recovery（自動遷移）
  if (phase === 'active' && t.active > 0 && elapsed >= t.active) {
    elapsed -= t.active;
    phase = 'recovery';
  }
  // recovery → idle（自動遷移）
  if (phase === 'recovery' && elapsed >= t.recovery) {
    return createIdleAction();
  }

  return { type: state.type, phase, elapsed, timing: t };
}

/** 強制的にリカバリーフェーズへ遷移 */
export function forceRecovery(state: ActionState, recoveryDuration?: number): ActionState {
  if (!state.timing) return createIdleAction();
  const timing = recoveryDuration !== undefined
    ? { ...state.timing, recovery: recoveryDuration }
    : state.timing;
  return { type: state.type, phase: 'recovery', elapsed: 0, timing };
}
