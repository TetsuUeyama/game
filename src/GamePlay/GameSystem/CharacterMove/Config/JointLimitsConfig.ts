/**
 * JointLimitsConfig — ジョイントごとの角度制限（度数）
 *
 * 各ジョイント × 各軸に min/max を定義し、モーションデータの値が
 * 範囲外の場合は自動的に範囲内にクランプする。
 *
 * 適用箇所:
 *   - AnimationFactory.motionToEulerKeys(): モーション度数値をクランプ（STANDING_POSE_OFFSETS 加算前）
 *   - SkeletonAdapter.applyFKRotationByJoint(): ラジアンオフセットを度数変換→クランプ→ラジアン戻し
 *
 * 未定義の軸は制限なし。値は仮値で、後で調整する前提。
 */

interface AxisLimits {
  min: number;
  max: number;
}

interface JointLimits {
  x?: AxisLimits;
  y?: AxisLimits;
  z?: AxisLimits;
}

export const JOINT_ANGLE_LIMITS: Record<string, JointLimits> = {
  // ── 肩 ──
  leftShoulder:  { x: { min: -80, max: 90 }, y: { min: -90, max: 90 }, z: { min: -90, max: 90 } },
  rightShoulder: { x: { min: -80, max: 90 }, y: { min: -90, max: 90 }, z: { min: -90, max: 90 } },

  // ── 肘 ──
  leftElbow:  { x: { min: -150, max: 0 }, y: { min: -90, max: 90 }, z: { min: -90, max: 90 } },
  rightElbow: { x: { min: -150, max: 0 }, y: { min: -90, max: 90 }, z: { min: -90, max: 90 } },

  // ── 股関節 ──
  leftHip:  { x: { min: -30, max: 120 }, y: { min: -45, max: 45 }, z: { min: -45, max: 45 } },
  rightHip: { x: { min: -30, max: 120 }, y: { min: -45, max: 45 }, z: { min: -45, max: 45 } },

  // ── 膝 ──
  leftKnee:  { x: { min: -50, max: 0 }, y: { min: -30, max: 30 }, z: { min: -30, max: 30 } },
  rightKnee: { x: { min: -50, max: 0 }, y: { min: -30, max: 30 }, z: { min: -30, max: 30 } },

  // ── 足首 ──
  leftFoot:  { x: { min: -45, max: 45 }, y: { min: -30, max: 30 }, z: { min: -30, max: 30 } },
  rightFoot: { x: { min: -45, max: 45 }, y: { min: -30, max: 30 }, z: { min: -30, max: 30 } },

  // ── 上半身 ──
  upperBody: { x: { min: -45, max: 45 }, y: { min: -60, max: 60 }, z: { min: -45, max: 45 } },
  head:      { x: { min: -45, max: 45 }, y: { min: -60, max: 60 }, z: { min: -45, max: 45 } },

  // ── 体幹 ──
  hips:      { x: { min: -45, max: 45 }, y: { min: -45, max: 45 }, z: { min: -30, max: 30 } },
  spine:     { x: { min: -45, max: 45 }, y: { min: -45, max: 45 }, z: { min: -30, max: 30 } },
  lowerBody: { x: { min: -45, max: 45 }, y: { min: -45, max: 45 }, z: { min: -30, max: 30 } },
};

/**
 * ジョイントの角度値を制限範囲内にクランプする。
 *
 * @param jointName ジョイント名（"leftShoulder", "rightKnee" 等）
 * @param axis 軸（"X", "Y", "Z"）
 * @param degrees 角度値（度数）
 * @returns クランプ後の角度値（度数）。制限未定義なら元の値をそのまま返す。
 */
export function clampJointDegrees(jointName: string, axis: "X" | "Y" | "Z", degrees: number): number {
  const limits = JOINT_ANGLE_LIMITS[jointName]?.[axis.toLowerCase() as "x" | "y" | "z"];
  if (!limits) return degrees;
  return Math.max(limits.min, Math.min(limits.max, degrees));
}
