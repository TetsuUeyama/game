/**
 * PossessionHelper - 攻守交替ヘルパー関数
 *
 * switchPossession: possession切替、launcher/targets/obstacles再代入、ゴール方向反転
 * mirrorZ / mirrorZone: ゾーン座標のミラーリング
 */

import type { SimState } from "../Types/TrackingSimTypes";
import type { SimZone } from "../Config/FieldConfig";
import {
  GOAL1_RIM_X,
  GOAL1_RIM_Z,
  GOAL2_RIM_X,
  GOAL2_RIM_Z,
} from "../Config/GoalConfig";
import { setShootGoal } from "../Action/ShootAction";

/**
 * possession を切り替え、launcher/targets/obstacles エイリアスを再代入し、
 * ゴール方向・ゾーンミラーリングを反転する。
 */
export function switchPossession(state: SimState): void {
  state.possession = state.possession === 0 ? 1 : 0;
  applyPossessionAliases(state);
}

/**
 * possession に基づいて launcher/targets/obstacles エイリアスとゴール情報を設定する。
 * initState と switchPossession の両方から呼ばれる。
 */
export function applyPossessionAliases(state: SimState): void {
  if (state.possession === 0) {
    // チームA (0-4) がオフェンス
    state.offenseBase = 0;
    state.defenseBase = 5;
    state.attackGoalX = GOAL1_RIM_X;
    state.attackGoalZ = GOAL1_RIM_Z;
    state.defendGoalZ = GOAL2_RIM_Z;
    state.zSign = 1;
  } else {
    // チームB (5-9) がオフェンス
    state.offenseBase = 5;
    state.defenseBase = 0;
    state.attackGoalX = GOAL2_RIM_X;
    state.attackGoalZ = GOAL2_RIM_Z;
    state.defendGoalZ = GOAL1_RIM_Z;
    state.zSign = -1;
  }

  // ShootAction のグローバルゴール座標を更新
  setShootGoal(state.attackGoalX, state.attackGoalZ, state.zSign);

  // launcher = offenseBase[0], targets = offenseBase[1-4], obstacles = defenseBase[0-4]
  state.launcher = state.allPlayers[state.offenseBase];
  state.targets = [
    state.allPlayers[state.offenseBase + 1],
    state.allPlayers[state.offenseBase + 2],
    state.allPlayers[state.offenseBase + 3],
    state.allPlayers[state.offenseBase + 4],
  ];
  state.obstacles = [
    state.allPlayers[state.defenseBase],
    state.allPlayers[state.defenseBase + 1],
    state.allPlayers[state.defenseBase + 2],
    state.allPlayers[state.defenseBase + 3],
    state.allPlayers[state.defenseBase + 4],
  ];
}

/** オフェンス相対インデックス (0-4) → 絶対インデックス (0-9) */
export function getAbsOffenseIdx(state: SimState, relIdx: number): number {
  return state.offenseBase + relIdx;
}

/** ディフェンス相対インデックス (0-4) → 絶対インデックス (0-9) */
export function getAbsDefenseIdx(state: SimState, relIdx: number): number {
  return state.defenseBase + relIdx;
}

/** Z座標をミラーリング */
export function mirrorZ(z: number, zSign: 1 | -1): number {
  return z * zSign;
}

/** SimZone 全体をミラーリング（zSign=-1 の場合、zMin/zMax を反転） */
export function mirrorZone(zone: SimZone, zSign: 1 | -1): SimZone {
  if (zSign === 1) return zone;
  return {
    xMin: zone.xMin,
    xMax: zone.xMax,
    zMin: -zone.zMax,
    zMax: -zone.zMin,
  };
}
