/**
 * PassFlightHandler - パス飛行中の更新: レシーバー移動 + DF弾き + 到達判定
 * TrackingSimulation3D.ts から抽出。
 */

import { Vector3 } from "@babylonjs/core";

import type { SimState, BallResultType } from "../Types/TrackingSimTypes";
import {
  moveWithFacing,
} from "../Movement/MovementCore";
import { TARGET_STOP_DIST } from "../Config/FieldConfig";
import {
  DEFLECT_IMPULSE,
  DEFLECT_COOLDOWN,
} from "../Config/DefenseConfig";
import {
  TARGET_INTERCEPT_SPEED,
} from "../Config/EntityConfig";
import { checkObstacleDeflection, detectBallResult } from "./BallCollision";
import { canEntityMove, applyMoveAction } from "./SimActionManager";
import { createIdleAction } from "../Action/ActionCore";
import { updateTargetRoleMovements } from "./SimEntityUpdate";

export interface PassFlightResult {
  /** パスが完了（キャッチ/ミス/ブロック）したか */
  completed: boolean;
  /** 完了結果の種類 */
  result: BallResultType;
  /** DF弾きでルーズボールに移行したか */
  deflectedToLoose: boolean;
  /** 弾きインパルス（deflectedToLoose 時のみ有効） */
  deflectImpulse: Vector3 | null;
  /** hitした場合、最も近いレシーバーの entityIdx */
  hitReceiverEntityIdx: number;
}

/** エンティティインデックスからオフェンス mover を取得 */
function getOffenseMover(state: SimState, entityIdx: number) {
  return entityIdx === 0 ? state.launcher : state.targets[entityIdx - 1];
}

/** 現在のパッサー以外のオフェンスをレシーバーとして返す */
function getReceiverEntityIndices(state: SimState): number[] {
  const count = 1 + state.targets.length;
  const indices: number[] = [];
  for (let i = 0; i < count; i++) {
    if (i !== state.onBallEntityIdx) indices.push(i);
  }
  return indices;
}

/**
 * パス飛行中の更新: レシーバー移動 + DF弾き + 到達判定
 */
export function updatePassFlight(
  state: SimState,
  ballPos: Vector3,
  ballInFlight: boolean,
  dt: number,
  allHands: { left: Vector3; right: Vector3 }[],
): PassFlightResult {
  const noResult: PassFlightResult = {
    completed: false, result: 'none', deflectedToLoose: false,
    deflectImpulse: null, hitReceiverEntityIdx: -1,
  };

  // Selected receiver: move toward intercept point
  const selReceiverIdx = state.selectedReceiverEntityIdx;
  const selReceiverAbsIdx = state.offenseBase + selReceiverIdx;
  const selTgt = getOffenseMover(state, selReceiverIdx);
  if (canEntityMove(state.actionStates, selReceiverAbsIdx)) {
    if (state.interceptPt) {
      const ipDx = state.interceptPt.x - selTgt.x;
      const ipDz = state.interceptPt.z - selTgt.z;
      if (Math.sqrt(ipDx * ipDx + ipDz * ipDz) > TARGET_STOP_DIST) {
        moveWithFacing(selTgt, TARGET_INTERCEPT_SPEED, dt);
      } else {
        selTgt.vx = 0;
        selTgt.vz = 0;
      }
    }
  }
  applyMoveAction(state, selReceiverAbsIdx, selTgt, dt);

  // Other targets continue role-based movement during ball flight
  const skipTargetIdx = selReceiverIdx > 0 ? selReceiverIdx - 1 : -1;
  updateTargetRoleMovements(state, dt, skipTargetIdx);

  // 障害物の手座標を取得
  const obStartIdx = 1 + state.targets.length;
  const obstacleHands = allHands.slice(obStartIdx, obStartIdx + state.obstacles.length);

  // レシーバーの手座標を取得
  const receiverEntityIndices = getReceiverEntityIndices(state);
  const receiverHands = receiverEntityIndices.map(ei => allHands[ei]);

  // ① 弾きクールダウン更新
  for (let oi = 0; oi < state.obstacleDeflectCooldowns.length; oi++) {
    if (state.obstacleDeflectCooldowns[oi] > 0) {
      state.obstacleDeflectCooldowns[oi] = Math.max(0, state.obstacleDeflectCooldowns[oi] - dt);
    }
  }

  // ② 障害物の手によるボール弾き判定
  const deflection = checkObstacleDeflection(
    ballPos.x, ballPos.y, ballPos.z,
    obstacleHands, state.obstacleDeflectCooldowns,
  );
  if (deflection.deflected) {
    state.obstacleDeflectCooldowns[deflection.obstacleIdx] = DEFLECT_COOLDOWN;

    // ルーズボール突入準備
    state.ballAge = 0;  // grace period 用にリセット
    state.interceptPt = null;
    for (let i = 0; i < state.actionStates.length; i++) state.actionStates[i] = createIdleAction();
    for (let i = 0; i < state.moveDistAccum.length; i++) state.moveDistAccum[i] = 0;

    return {
      completed: false,
      result: 'none',
      deflectedToLoose: true,
      deflectImpulse: deflection.direction.scale(DEFLECT_IMPULSE),
      hitReceiverEntityIdx: -1,
    };
  }

  // ③ Ball result detection — レシーバーの手で判定
  const detection = detectBallResult(
    ballPos.x, ballPos.y, ballPos.z,
    ballInFlight, state.ballAge,
    receiverHands,
  );
  if (detection.result === 'landed') {
    // ボール着地 → ルーズボールに移行（即時攻守交替ではない）
    state.ballAge = 0;  // grace period 用にリセット
    state.interceptPt = null;
    for (let i = 0; i < state.actionStates.length; i++) state.actionStates[i] = createIdleAction();
    for (let i = 0; i < state.moveDistAccum.length; i++) state.moveDistAccum[i] = 0;

    return {
      completed: false,
      result: 'none',
      deflectedToLoose: true,
      deflectImpulse: null,
      hitReceiverEntityIdx: -1,
    };
  }

  if (detection.result !== 'none') {
    let hitEntityIdx = -1;
    if (detection.result === 'hit') {
      // Hit → 最も近い手を持つレシーバーを特定
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
      hitEntityIdx = receiverEntityIndices[hitReceiverArrayIdx];
    }

    return {
      completed: true,
      result: detection.result,
      deflectedToLoose: false,
      deflectImpulse: null,
      hitReceiverEntityIdx: hitEntityIdx,
    };
  }

  return noResult;
}
