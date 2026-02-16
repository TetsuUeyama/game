/**
 * コートゾーン × ショットクロック判断設定
 *
 * 2軸（コートゾーン × ショットクロック残り時間）で
 * オフェンス判断を構造化するための設定
 */

import { FIELD_CONFIG, GOAL_CONFIG } from "@/GamePlay/GameSystem/CharacterMove/Config/GameConfig";
import { isInPaintArea } from "@/GamePlay/GameSystem/CharacterMove/Config/TacticalZoneConfig";

// ==============================
// Enums
// ==============================

/**
 * コートゾーン（5ゾーン）
 */
export enum CourtZone {
  /** センターライン未通過 */
  BACKCOURT = "BACKCOURT",
  /** フロントコート、3Pアーク外 */
  FRONTCOURT_OUTSIDE_3P = "FRONTCOURT_OUTSIDE_3P",
  /** 3Pアーク内、ペイントエリア外 */
  INSIDE_3P = "INSIDE_3P",
  /** ペイントエリア内 */
  PAINT_AREA = "PAINT_AREA",
  /** ゴール裏 */
  BEHIND_GOAL = "BEHIND_GOAL",
}

/**
 * ショットクロックフェーズ（4段階）
 */
export enum ShotClockPhase {
  /** 余裕あり */
  EARLY = "EARLY",
  /** 攻撃組立 */
  MID = "MID",
  /** 急ぐべき */
  LATE = "LATE",
  /** 即行動 */
  CRITICAL = "CRITICAL",
}

// ==============================
// ゾーン別ショットクロック閾値
// ==============================

/**
 * ゾーン別ショットクロック閾値（秒以下で遷移）
 * MID / LATE / CRITICAL の順
 */
const ZONE_SHOT_CLOCK_THRESHOLDS: Record<CourtZone, { mid: number; late: number; critical: number }> = {
  [CourtZone.BACKCOURT]:              { mid: 18, late: 12, critical: 7 },
  [CourtZone.FRONTCOURT_OUTSIDE_3P]:  { mid: 15, late: 10, critical: 5 },
  [CourtZone.INSIDE_3P]:              { mid: 12, late: 8,  critical: 3 },
  [CourtZone.PAINT_AREA]:             { mid: 10, late: 6,  critical: 2 },
  [CourtZone.BEHIND_GOAL]:            { mid: 10, late: 6,  critical: 2 },
};

// ==============================
// 定数
// ==============================

/** 3Pアーク半径 */
const THREE_POINT_ARC_RADIUS = 7.24;

/** ゴール裏判定のZ閾値 */
const BEHIND_GOAL_Z_THRESHOLD = 14.0;

// ==============================
// 判定関数
// ==============================

/**
 * ゴール中心のZ座標を取得
 */
function getGoalCenterZ(isAllyTeam: boolean): number {
  const fieldHalfLength = FIELD_CONFIG.length / 2;
  const goalZ = fieldHalfLength - GOAL_CONFIG.backboardDistance - GOAL_CONFIG.rimOffset;
  return isAllyTeam ? goalZ : -goalZ;
}

/**
 * プレイヤーの位置からコートゾーンを判定
 *
 * 判定順: BEHIND_GOAL → BACKCOURT → PAINT_AREA → INSIDE_3P → FRONTCOURT_OUTSIDE_3P
 *
 * @param position プレイヤーの位置
 * @param team チーム（"ally" | "enemy"）
 * @returns CourtZone
 */
export function detectCourtZone(
  position: { x: number; z: number },
  team: "ally" | "enemy"
): CourtZone {
  const isAlly = team === "ally";

  // 1. BEHIND_GOAL: ゴール裏
  if (isAlly) {
    if (position.z >= BEHIND_GOAL_Z_THRESHOLD) {
      return CourtZone.BEHIND_GOAL;
    }
  } else {
    if (position.z <= -BEHIND_GOAL_Z_THRESHOLD) {
      return CourtZone.BEHIND_GOAL;
    }
  }

  // 2. BACKCOURT: センターライン未通過
  if (isAlly) {
    if (position.z <= 0) {
      return CourtZone.BACKCOURT;
    }
  } else {
    if (position.z >= 0) {
      return CourtZone.BACKCOURT;
    }
  }

  // 3. PAINT_AREA: ペイントエリア内
  const isAttackingPositiveZ = isAlly;
  if (isInPaintArea(position, isAttackingPositiveZ)) {
    return CourtZone.PAINT_AREA;
  }

  // 4. INSIDE_3P: 3Pアーク内（ゴールまでの距離 ≤ 7.24m）
  const goalCenterZ = getGoalCenterZ(isAlly);
  const dx = position.x;
  const dz = position.z - goalCenterZ;
  const distanceToGoalCenter = Math.sqrt(dx * dx + dz * dz);

  if (distanceToGoalCenter <= THREE_POINT_ARC_RADIUS) {
    return CourtZone.INSIDE_3P;
  }

  // 5. FRONTCOURT_OUTSIDE_3P: 残り全て
  return CourtZone.FRONTCOURT_OUTSIDE_3P;
}

/**
 * ゾーンとショットクロック残り時間からフェーズを判定
 *
 * @param zone コートゾーン
 * @param remainingSeconds ショットクロック残り時間（秒）
 * @returns ShotClockPhase
 */
export function getShotClockPhase(
  zone: CourtZone,
  remainingSeconds: number
): ShotClockPhase {
  const thresholds = ZONE_SHOT_CLOCK_THRESHOLDS[zone];

  if (remainingSeconds <= thresholds.critical) {
    return ShotClockPhase.CRITICAL;
  }
  if (remainingSeconds <= thresholds.late) {
    return ShotClockPhase.LATE;
  }
  if (remainingSeconds <= thresholds.mid) {
    return ShotClockPhase.MID;
  }
  return ShotClockPhase.EARLY;
}
