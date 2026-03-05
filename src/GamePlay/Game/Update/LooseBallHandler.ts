/**
 * LooseBallHandler - ルーズボール時の全エンティティ移動 + 回収判定
 * TrackingSimulation3D.ts から抽出。
 */

import { Vector3 } from "@babylonjs/core";

import type { SimState, SimMover } from "../Types/TrackingSimTypes";
import {
  setChaserVelocity,
  moveWithFacing,
  dist2d,
} from "../Movement/MovementCore";
import {
  BALL_DIAMETER,
  SIM_FIELD_X_HALF,
  SIM_FIELD_Z_HALF,
  SIM_MARGIN,
} from "../Config/FieldConfig";
import { HAND_CATCH_RADIUS } from "../Config/CollisionConfig";
import {
  BALL_TIMEOUT,
  LOOSE_BALL_PICKUP_RADIUS,
  LOOSE_BALL_GRACE_PERIOD,
  LOOSE_BALL_GIVE_UP_MARGIN,
} from "../Config/BallTimingConfig";
import { DEFENSE_GOAL_OFFSET } from "../Config/DefenseConfig";
// state.attackGoalX/Z は state.attackGoalX/Z 経由で動的取得
import {
  TARGET_RANDOM_SPEED,
  TARGET_INTERCEPT_SPEED,
  INIT_LAUNCHER,
  INIT_TARGETS,
} from "../Config/EntityConfig";
import { OB_CONFIGS } from "../Decision/ObstacleRoleAssignment";

export interface LooseBallResult {
  recovered: boolean;
  isOffenseRecovery: boolean;
  recoveredEntityIdx: number;
}

/**
 * ルーズボール時の全エンティティ移動 + 回収判定
 */
export function updateLooseBall(
  state: SimState,
  ballPos: Vector3,
  ballInFlight: boolean,
  dt: number,
  handPositions: { left: Vector3; right: Vector3 }[],
): LooseBallResult {
  // 弾きクールダウン減算
  for (let oi = 0; oi < state.obstacleDeflectCooldowns.length; oi++) {
    if (state.obstacleDeflectCooldowns[oi] > 0) {
      state.obstacleDeflectCooldowns[oi] = Math.max(0, state.obstacleDeflectCooldowns[oi] - dt);
    }
  }

  // ルーズボール: 到達時間ベースの判断
  const allMovers = [state.launcher, ...state.targets, ...state.obstacles];
  const offenseCount = 1 + state.targets.length;  // 5
  const allOffense: SimMover[] = [state.launcher, ...state.targets];

  // 各エンティティの到達時間を計算
  const arrivalTimes: number[] = [];
  for (let ei = 0; ei < allMovers.length; ei++) {
    const d = dist2d(allMovers[ei].x, allMovers[ei].z, ballPos.x, ballPos.z);
    const spd = ei < offenseCount
      ? TARGET_INTERCEPT_SPEED
      : OB_CONFIGS[ei - offenseCount].interceptSpeed;
    arrivalTimes.push(spd > 0 ? d / spd : Infinity);
  }

  // 最速到達者を特定
  let fastestTime = Infinity;
  let fastestIdx = 0;
  for (let ei = 0; ei < arrivalTimes.length; ei++) {
    if (arrivalTimes[ei] < fastestTime) {
      fastestTime = arrivalTimes[ei];
      fastestIdx = ei;
    }
  }
  const offenseLikelyRecovers = fastestIdx < offenseCount;

  for (let ei = 0; ei < allMovers.length; ei++) {
    const mover = allMovers[ei];
    const isOffense = ei < offenseCount;
    const shouldChase = arrivalTimes[ei] <= fastestTime + LOOSE_BALL_GIVE_UP_MARGIN;

    if (shouldChase) {
      // 到達可能 → ボールを追跡
      const chaseSpeed = isOffense
        ? TARGET_INTERCEPT_SPEED
        : OB_CONFIGS[ei - offenseCount].interceptSpeed;
      setChaserVelocity(mover, ballPos.x, ballPos.z, chaseSpeed, 0.1, dt);
      moveWithFacing(mover, chaseSpeed, dt);
    } else if (isOffense) {
      // オフェンス: 追跡を諦める
      if (offenseLikelyRecovers) {
        // 自チーム回収見込み → オフェンスのホームポジションへ移動
        const home = ei === 0 ? INIT_LAUNCHER : INIT_TARGETS[ei - 1];
        setChaserVelocity(mover, home.x, home.z, TARGET_RANDOM_SPEED, 0.5, dt);
        moveWithFacing(mover, TARGET_RANDOM_SPEED, dt);
      }
      // 相手チーム回収見込み → 待機（回収後バックコートにリセットされるため）
    } else {
      // ディフェンス: 追跡を諦める → マーク対象とゴールの間にポジショニング
      const oi = ei - offenseCount;
      const cfg = OB_CONFIGS[oi];
      const markTarget = allOffense[cfg.markTargetEntityIdx];
      const toGoalX = state.attackGoalX - markTarget.x;
      const toGoalZ = state.attackGoalZ - markTarget.z;
      const toGoalDist = Math.sqrt(toGoalX * toGoalX + toGoalZ * toGoalZ);
      let defX: number, defZ: number;
      if (toGoalDist > 0.5) {
        defX = markTarget.x + (toGoalX / toGoalDist) * DEFENSE_GOAL_OFFSET;
        defZ = markTarget.z + (toGoalZ / toGoalDist) * DEFENSE_GOAL_OFFSET;
      } else {
        defX = markTarget.x;
        defZ = markTarget.z;
      }
      setChaserVelocity(mover, defX, defZ, cfg.idleSpeed, cfg.hoverRadius, dt);
      moveWithFacing(mover, cfg.idleSpeed, dt);
    }
  }

  // 回収判定（grace period 中はスキップ — ボールが離れる時間を確保）
  const ballR = BALL_DIAMETER / 2;
  const handCatchDist = HAND_CATCH_RADIUS + ballR;
  let recoveredIdx = -1;
  const pastGrace = state.ballAge > LOOSE_BALL_GRACE_PERIOD;

  if (pastGrace && ballInFlight) {
    // ボール飛行中: 全エンティティの手で3D距離チェック
    let minHandDist = Infinity;
    for (let ei = 0; ei < allMovers.length; ei++) {
      const hands = handPositions[ei];
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
    for (let ei = 0; ei < allMovers.length; ei++) {
      const d = dist2d(allMovers[ei].x, allMovers[ei].z, ballPos.x, ballPos.z);
      if (d < LOOSE_BALL_PICKUP_RADIUS && d < minBodyDist) {
        minBodyDist = d;
        recoveredIdx = ei;
      }
    }
  }

  // OOB/タイムアウト: 最寄りエンティティが自動回収
  const isOOB = Math.abs(ballPos.x) > SIM_FIELD_X_HALF + SIM_MARGIN
             || Math.abs(ballPos.z) > SIM_FIELD_Z_HALF + SIM_MARGIN;
  if (recoveredIdx < 0 && (isOOB || state.ballAge > BALL_TIMEOUT)) {
    let minDist2 = Infinity;
    for (let ei = 0; ei < allMovers.length; ei++) {
      const d = dist2d(allMovers[ei].x, allMovers[ei].z, ballPos.x, ballPos.z);
      if (d < minDist2) { minDist2 = d; recoveredIdx = ei; }
    }
  }

  if (recoveredIdx >= 0) {
    return {
      recovered: true,
      isOffenseRecovery: recoveredIdx < offenseCount,
      recoveredEntityIdx: recoveredIdx,
    };
  }

  return { recovered: false, isOffenseRecovery: false, recoveredEntityIdx: -1 };
}
