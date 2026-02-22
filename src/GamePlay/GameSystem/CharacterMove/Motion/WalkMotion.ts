import { MotionData, MotionConfig } from "@/GamePlay/GameSystem/CharacterMove/Types/MotionTypes";
import { buildKeyframes, createDerivedMotion } from "@/GamePlay/GameSystem/CharacterMove/MotionEngine/MotionUtils";
import { IDLE_JOINT_ANIMATIONS, T0 as IDLE_T0, T1 as IDLE_T1, T2 as IDLE_T2, T3 as IDLE_T3, T4 as IDLE_T4 } from "@/GamePlay/GameSystem/CharacterMove/Motion/IdleMotion";

/**
 * 歩行モーション（全8方向）
 *
 * IDLE_JOINT_ANIMATIONS をベースに、各方向の追加値（ADDITIONS）を加算して生成。
 * 斜め方向は前後＋左右のブレンドで自動生成。
 *
 * キーフレーム構成（前進の場合）：
 * - T0: ニュートラル（直立）
 * - T1: 左足前・右腕前（コンタクト）
 * - T2: 通過姿勢（ニュートラル）
 * - T3: 右足前・左腕前（コンタクト）
 * - T4: ニュートラル（ループ開始地点）
 */

const IDLE_TIMES = [IDLE_T0, IDLE_T1, IDLE_T2, IDLE_T3, IDLE_T4];

/** 2つの ADDITIONS を指定ウェイトでブレンドする */
function blendAdditions(
  a: Record<string, number[]>,
  b: Record<string, number[]>,
  wA: number,
  wB: number
): Record<string, number[]> {
  const result: Record<string, number[]> = {};
  const allKeys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const key of allKeys) {
    const va = a[key] ?? [0, 0, 0, 0, 0];
    const vb = b[key] ?? [0, 0, 0, 0, 0];
    result[key] = va.map((v, i) => Math.round((v * wA + vb[i] * wB) * 10) / 10);
  }
  return result;
}

// ============================================================
// WALK_FORWARD
// ============================================================
export const WF_T0 = 0.0;
export const WF_T1 = 0.25;
export const WF_T2 = 0.5;
export const WF_T3 = 0.75;
export const WF_T4 = 1.0;

const WF_TIMES = [WF_T0, WF_T1, WF_T2, WF_T3, WF_T4];

// アイドル姿勢からの追加値（自然な歩行サイクル）
// T1: 左足前・右腕前  T3: 右足前・左腕前
// hipX: 負=屈曲(太もも前)、正=伸展(太もも後)
const WF_ADDITIONS: Record<string, number[]> = {
  // 上半身：わずかな前傾（太ももが主動力）
  upperBodyX: [2, 3, 2, 3, 2],
  upperBodyY: [0, -8, 0, 8, 0],
  upperBodyZ: [0, 2, 0, -2, 0],

  lowerBodyX: [0, 0, 0, 0, 0],
  lowerBodyY: [0, 5, 0, -5, 0],
  lowerBodyZ: [0, 0, 0, 0, 0],

  headX: [-1, -2, -1, -2, -1],
  headY: [0, 6, 0, -6, 0],
  headZ: [0, 0, 0, 0, 0],

  // 腕振り（対側: 左足前→右腕前）
  leftShoulderX: [0, 25, 0, -25, 0],
  leftShoulderY: [0, 0, 0, 0, 0],
  leftShoulderZ: [0, 0, 0, 0, 0],

  rightShoulderX: [0, -25, 0, 25, 0],
  rightShoulderY: [0, 0, 0, 0, 0],
  rightShoulderZ: [0, 0, 0, 0, 0],

  leftElbowX: [0, 5, 0, -15, 0],
  leftElbowY: [0, 0, 0, 0, 0],
  leftElbowZ: [0, 0, 0, 0, 0],

  rightElbowX: [0, -15, 0, 5, 0],
  rightElbowY: [0, 0, 0, 0, 0],
  rightElbowZ: [0, 0, 0, 0, 0],

  // 脚（太ももで前進を駆動: 負=前、正=後）
  leftHipX: [0, -25, 0, 18, 0],
  leftHipY: [0, 0, 0, 0, 0],
  leftHipZ: [0, 0, 0, 0, 0],

  rightHipX: [0, 18, 0, -25, 0],
  rightHipY: [0, 0, 0, 0, 0],
  rightHipZ: [0, 0, 0, 0, 0],

  // 膝：スイングフェーズで曲げる（正=屈曲）
  leftKneeX: [0, 5, 0, 25, 0],
  leftKneeY: [0, 0, 0, 0, 0],
  leftKneeZ: [0, 0, 0, 0, 0],

  rightKneeX: [0, 25, 0, 5, 0],
  rightKneeY: [0, 0, 0, 0, 0],
  rightKneeZ: [0, 0, 0, 0, 0],

  // 足首（背屈=負: 踵着地、底屈=正: 蹴り出し）
  leftFootX: [0, -10, 0, 12, 0],
  leftFootY: [0, 0, 0, 0, 0],
  leftFootZ: [0, 0, 0, 0, 0],

  rightFootX: [0, 12, 0, -10, 0],
  rightFootY: [0, 0, 0, 0, 0],
  rightFootZ: [0, 0, 0, 0, 0],
};

export const WF_JOINT_ANIMATIONS: Record<string, Record<number, number>> = createDerivedMotion(
  IDLE_JOINT_ANIMATIONS, IDLE_TIMES, WF_TIMES, WF_ADDITIONS
);

const WF_POSITION_ANIMATIONS: Record<string, Record<number, number>> = {
  y: {[WF_T0]: 0, [WF_T1]: 0, [WF_T2]: 0, [WF_T3]: 0, [WF_T4]: 0},
};

export const WALK_FORWARD_MOTION: MotionData = {
  name: "walk_forward",
  duration: WF_T4,
  loop: true,
  keyframes: buildKeyframes(WF_JOINT_ANIMATIONS, WF_POSITION_ANIMATIONS),
};

export const WALK_FORWARD_MOTION_CONFIG: MotionConfig = {
  motionData: WALK_FORWARD_MOTION,
  isDefault: false,
  blendDuration: 0.2,
  priority: 10,
  interruptible: true,
};

// ============================================================
// WALK_BACKWARD
// ============================================================
export const WB_T0 = 0.0;
export const WB_T1 = 0.25;
export const WB_T2 = 0.5;
export const WB_T3 = 0.75;
export const WB_T4 = 1.0;

const WB_TIMES = [WB_T0, WB_T1, WB_T2, WB_T3, WB_T4];

// T1: 左足後退  T3: 右足後退
// hipX: 正=伸展(太もも後=後退ステップ)、負=屈曲(太もも前=復帰)
const WB_ADDITIONS: Record<string, number[]> = {
  upperBodyX: [-2, -3, -2, -3, -2],
  upperBodyY: [0, 6, 0, -6, 0],
  upperBodyZ: [0, -2, 0, 2, 0],

  lowerBodyX: [0, 0, 0, 0, 0],
  lowerBodyY: [0, -4, 0, 4, 0],
  lowerBodyZ: [0, 0, 0, 0, 0],

  headX: [1, 2, 1, 2, 1],
  headY: [0, -5, 0, 5, 0],
  headZ: [0, 0, 0, 0, 0],

  // 腕振り（対側: 左足後退→左腕前）
  leftShoulderX: [0, -18, 0, 18, 0],
  leftShoulderY: [0, 0, 0, 0, 0],
  leftShoulderZ: [0, 0, 0, 0, 0],

  rightShoulderX: [0, 18, 0, -18, 0],
  rightShoulderY: [0, 0, 0, 0, 0],
  rightShoulderZ: [0, 0, 0, 0, 0],

  leftElbowX: [0, -12, 0, 5, 0],
  leftElbowY: [0, 0, 0, 0, 0],
  leftElbowZ: [0, 0, 0, 0, 0],

  rightElbowX: [0, 5, 0, -12, 0],
  rightElbowY: [0, 0, 0, 0, 0],
  rightElbowZ: [0, 0, 0, 0, 0],

  // 脚（太ももで後退: 正=後、負=前）
  leftHipX: [0, 18, 0, -15, 0],
  leftHipY: [0, 0, 0, 0, 0],
  leftHipZ: [0, 0, 0, 0, 0],

  rightHipX: [0, -15, 0, 18, 0],
  rightHipY: [0, 0, 0, 0, 0],
  rightHipZ: [0, 0, 0, 0, 0],

  // 膝：スイングフェーズで曲げる（正=屈曲）
  leftKneeX: [0, 25, 0, 5, 0],
  leftKneeY: [0, 0, 0, 0, 0],
  leftKneeZ: [0, 0, 0, 0, 0],

  rightKneeX: [0, 5, 0, 25, 0],
  rightKneeY: [0, 0, 0, 0, 0],
  rightKneeZ: [0, 0, 0, 0, 0],

  // 後退は逆: つま先着地（底屈）、踵蹴り出し（背屈）
  leftFootX: [0, 10, 0, -8, 0],
  leftFootY: [0, 0, 0, 0, 0],
  leftFootZ: [0, 0, 0, 0, 0],

  rightFootX: [0, -8, 0, 10, 0],
  rightFootY: [0, 0, 0, 0, 0],
  rightFootZ: [0, 0, 0, 0, 0],
};

export const WB_JOINT_ANIMATIONS: Record<string, Record<number, number>> = createDerivedMotion(
  IDLE_JOINT_ANIMATIONS, IDLE_TIMES, WB_TIMES, WB_ADDITIONS
);

const WB_POSITION_ANIMATIONS: Record<string, Record<number, number>> = {
  y: {[WB_T0]: 0, [WB_T1]: 0, [WB_T2]: 0, [WB_T3]: 0, [WB_T4]: 0},
};

export const WALK_BACKWARD_MOTION: MotionData = {
  name: "walk_backward",
  duration: WB_T4,
  loop: true,
  keyframes: buildKeyframes(WB_JOINT_ANIMATIONS, WB_POSITION_ANIMATIONS),
};

export const WALK_BACKWARD_MOTION_CONFIG: MotionConfig = {
  motionData: WALK_BACKWARD_MOTION,
  isDefault: false,
  blendDuration: 0.2,
  priority: 10,
  interruptible: true,
};

// ============================================================
// WALK_LEFT（横歩き）
// ============================================================
export const WL_T0 = 0.0;
export const WL_T1 = 0.25;
export const WL_T2 = 0.5;
export const WL_T3 = 0.75;
export const WL_T4 = 1.0;

const WL_TIMES = [WL_T0, WL_T1, WL_T2, WL_T3, WL_T4];

// 左方向への横移動。体をやや左へ向け、脚を横に踏み出す。
const WL_ADDITIONS: Record<string, number[]> = {
  upperBodyX: [0, 0, 0, 0, 0],
  upperBodyY: [8, 8, 8, 8, 8],
  upperBodyZ: [-2, -4, -2, -4, -2],

  lowerBodyX: [0, 0, 0, 0, 0],
  lowerBodyY: [15, 15, 15, 15, 15],
  lowerBodyZ: [2, 3, 2, 3, 2],

  headX: [0, 0, 0, 0, 0],
  headY: [-8, -8, -8, -8, -8],
  headZ: [2, 4, 2, 4, 2],

  leftShoulderX: [0, 0, 0, 0, 0],
  leftShoulderY: [0, 0, 0, 0, 0],
  leftShoulderZ: [0, -5, 0, 5, 0],

  rightShoulderX: [0, 0, 0, 0, 0],
  rightShoulderY: [0, 0, 0, 0, 0],
  rightShoulderZ: [0, 5, 0, -5, 0],

  leftElbowX: [0, -3, 0, -3, 0],
  leftElbowY: [0, 0, 0, 0, 0],
  leftElbowZ: [0, 5, 0, 5, 0],

  rightElbowX: [0, -3, 0, -3, 0],
  rightElbowY: [0, 0, 0, 0, 0],
  rightElbowZ: [0, -5, 0, -5, 0],

  leftHipX: [0, -10, 0, 5, 0],
  leftHipY: [0, 0, 0, 0, 0],
  leftHipZ: [0, -10, 0, 5, 0],

  rightHipX: [0, 5, 0, -10, 0],
  rightHipY: [0, 0, 0, 0, 0],
  rightHipZ: [0, -5, 0, -10, 0],

  // 膝：横移動のスイングフェーズで曲げる（正=屈曲）
  leftKneeX: [0, 15, 0, 5, 0],
  leftKneeY: [0, 0, 0, 0, 0],
  leftKneeZ: [0, 0, 0, 0, 0],

  rightKneeX: [0, 5, 0, 15, 0],
  rightKneeY: [0, 0, 0, 0, 0],
  rightKneeZ: [0, 0, 0, 0, 0],

  leftFootX: [0, -5, 0, 5, 0],
  leftFootY: [0, 0, 0, 0, 0],
  leftFootZ: [0, 0, 0, 0, 0],

  rightFootX: [0, 5, 0, -5, 0],
  rightFootY: [0, 0, 0, 0, 0],
  rightFootZ: [0, 0, 0, 0, 0],
};

export const WL_JOINT_ANIMATIONS: Record<string, Record<number, number>> = createDerivedMotion(
  IDLE_JOINT_ANIMATIONS, IDLE_TIMES, WL_TIMES, WL_ADDITIONS
);

const WL_POSITION_ANIMATIONS: Record<string, Record<number, number>> = {
  y: {[WL_T0]: 0, [WL_T1]: 0, [WL_T2]: 0, [WL_T3]: 0, [WL_T4]: 0},
};

export const WALK_LEFT_MOTION: MotionData = {
  name: "walk_left",
  duration: WL_T4,
  loop: true,
  keyframes: buildKeyframes(WL_JOINT_ANIMATIONS, WL_POSITION_ANIMATIONS),
};

export const WALK_LEFT_MOTION_CONFIG: MotionConfig = {
  motionData: WALK_LEFT_MOTION,
  isDefault: false,
  blendDuration: 0.2,
  priority: 10,
  interruptible: true,
};

// ============================================================
// WALK_RIGHT（横歩き・左のミラー）
// ============================================================
export const WR_T0 = 0.0;
export const WR_T1 = 0.25;
export const WR_T2 = 0.5;
export const WR_T3 = 0.75;
export const WR_T4 = 1.0;

const WR_TIMES = [WR_T0, WR_T1, WR_T2, WR_T3, WR_T4];

// 右方向への横移動（WALK_LEFT のミラー）
const WR_ADDITIONS: Record<string, number[]> = {
  upperBodyX: [0, 0, 0, 0, 0],
  upperBodyY: [-8, -8, -8, -8, -8],
  upperBodyZ: [2, 4, 2, 4, 2],

  lowerBodyX: [0, 0, 0, 0, 0],
  lowerBodyY: [-15, -15, -15, -15, -15],
  lowerBodyZ: [-2, -3, -2, -3, -2],

  headX: [0, 0, 0, 0, 0],
  headY: [8, 8, 8, 8, 8],
  headZ: [-2, -4, -2, -4, -2],

  leftShoulderX: [0, 0, 0, 0, 0],
  leftShoulderY: [0, 0, 0, 0, 0],
  leftShoulderZ: [0, 5, 0, -5, 0],

  rightShoulderX: [0, 0, 0, 0, 0],
  rightShoulderY: [0, 0, 0, 0, 0],
  rightShoulderZ: [0, -5, 0, 5, 0],

  leftElbowX: [0, -3, 0, -3, 0],
  leftElbowY: [0, 0, 0, 0, 0],
  leftElbowZ: [0, -5, 0, -5, 0],

  rightElbowX: [0, -3, 0, -3, 0],
  rightElbowY: [0, 0, 0, 0, 0],
  rightElbowZ: [0, 5, 0, 5, 0],

  leftHipX: [0, 5, 0, -10, 0],
  leftHipY: [0, 0, 0, 0, 0],
  leftHipZ: [0, 5, 0, 10, 0],

  rightHipX: [0, -10, 0, 5, 0],
  rightHipY: [0, 0, 0, 0, 0],
  rightHipZ: [0, 10, 0, -5, 0],

  // 膝：横移動のスイングフェーズで曲げる（正=屈曲）
  leftKneeX: [0, 5, 0, 15, 0],
  leftKneeY: [0, 0, 0, 0, 0],
  leftKneeZ: [0, 0, 0, 0, 0],

  rightKneeX: [0, 15, 0, 5, 0],
  rightKneeY: [0, 0, 0, 0, 0],
  rightKneeZ: [0, 0, 0, 0, 0],

  leftFootX: [0, 5, 0, -5, 0],
  leftFootY: [0, 0, 0, 0, 0],
  leftFootZ: [0, 0, 0, 0, 0],

  rightFootX: [0, -5, 0, 5, 0],
  rightFootY: [0, 0, 0, 0, 0],
  rightFootZ: [0, 0, 0, 0, 0],
};

export const WR_JOINT_ANIMATIONS: Record<string, Record<number, number>> = createDerivedMotion(
  IDLE_JOINT_ANIMATIONS, IDLE_TIMES, WR_TIMES, WR_ADDITIONS
);

const WR_POSITION_ANIMATIONS: Record<string, Record<number, number>> = {
  y: {[WR_T0]: 0, [WR_T1]: 0, [WR_T2]: 0, [WR_T3]: 0, [WR_T4]: 0},
};

export const WALK_RIGHT_MOTION: MotionData = {
  name: "walk_right",
  duration: WR_T4,
  loop: true,
  keyframes: buildKeyframes(WR_JOINT_ANIMATIONS, WR_POSITION_ANIMATIONS),
};

export const WALK_RIGHT_MOTION_CONFIG: MotionConfig = {
  motionData: WALK_RIGHT_MOTION,
  isDefault: false,
  blendDuration: 0.2,
  priority: 10,
  interruptible: true,
};

// ============================================================
// 斜め方向（前後 × 左右 のブレンドで自動生成）
// cos(45°) ≈ 0.7 を各成分のウェイトに使用
// ============================================================
const DIAG_W = 0.7;

// ============================================================
// WALK_FORWARD_LEFT
// ============================================================
export const WFL_T0 = 0.0;
export const WFL_T1 = 0.25;
export const WFL_T2 = 0.5;
export const WFL_T3 = 0.75;
export const WFL_T4 = 1.0;

const WFL_TIMES = [WFL_T0, WFL_T1, WFL_T2, WFL_T3, WFL_T4];

const WFL_ADDITIONS = blendAdditions(WF_ADDITIONS, WL_ADDITIONS, DIAG_W, DIAG_W);

export const WFL_JOINT_ANIMATIONS: Record<string, Record<number, number>> = createDerivedMotion(
  IDLE_JOINT_ANIMATIONS, IDLE_TIMES, WFL_TIMES, WFL_ADDITIONS
);

const WFL_POSITION_ANIMATIONS: Record<string, Record<number, number>> = {
  y: {[WFL_T0]: 0, [WFL_T1]: 0, [WFL_T2]: 0, [WFL_T3]: 0, [WFL_T4]: 0},
};

export const WALK_FORWARD_LEFT_MOTION: MotionData = {
  name: "walk_forward_left",
  duration: WFL_T4,
  loop: true,
  keyframes: buildKeyframes(WFL_JOINT_ANIMATIONS, WFL_POSITION_ANIMATIONS),
};

export const WALK_FORWARD_LEFT_MOTION_CONFIG: MotionConfig = {
  motionData: WALK_FORWARD_LEFT_MOTION,
  isDefault: false,
  blendDuration: 0.2,
  priority: 10,
  interruptible: true,
};

// ============================================================
// WALK_FORWARD_RIGHT
// ============================================================
export const WFR_T0 = 0.0;
export const WFR_T1 = 0.25;
export const WFR_T2 = 0.5;
export const WFR_T3 = 0.75;
export const WFR_T4 = 1.0;

const WFR_TIMES = [WFR_T0, WFR_T1, WFR_T2, WFR_T3, WFR_T4];

const WFR_ADDITIONS = blendAdditions(WF_ADDITIONS, WR_ADDITIONS, DIAG_W, DIAG_W);

export const WFR_JOINT_ANIMATIONS: Record<string, Record<number, number>> = createDerivedMotion(
  IDLE_JOINT_ANIMATIONS, IDLE_TIMES, WFR_TIMES, WFR_ADDITIONS
);

const WFR_POSITION_ANIMATIONS: Record<string, Record<number, number>> = {
  y: {[WFR_T0]: 0, [WFR_T1]: 0, [WFR_T2]: 0, [WFR_T3]: 0, [WFR_T4]: 0},
};

export const WALK_FORWARD_RIGHT_MOTION: MotionData = {
  name: "walk_forward_right",
  duration: WFR_T4,
  loop: true,
  keyframes: buildKeyframes(WFR_JOINT_ANIMATIONS, WFR_POSITION_ANIMATIONS),
};

export const WALK_FORWARD_RIGHT_MOTION_CONFIG: MotionConfig = {
  motionData: WALK_FORWARD_RIGHT_MOTION,
  isDefault: false,
  blendDuration: 0.2,
  priority: 10,
  interruptible: true,
};

// ============================================================
// WALK_BACKWARD_LEFT
// ============================================================
export const WBL_T0 = 0.0;
export const WBL_T1 = 0.25;
export const WBL_T2 = 0.5;
export const WBL_T3 = 0.75;
export const WBL_T4 = 1.0;

const WBL_TIMES = [WBL_T0, WBL_T1, WBL_T2, WBL_T3, WBL_T4];

const WBL_ADDITIONS = blendAdditions(WB_ADDITIONS, WL_ADDITIONS, DIAG_W, DIAG_W);

export const WBL_JOINT_ANIMATIONS: Record<string, Record<number, number>> = createDerivedMotion(
  IDLE_JOINT_ANIMATIONS, IDLE_TIMES, WBL_TIMES, WBL_ADDITIONS
);

const WBL_POSITION_ANIMATIONS: Record<string, Record<number, number>> = {
  y: {[WBL_T0]: 0, [WBL_T1]: 0, [WBL_T2]: 0, [WBL_T3]: 0, [WBL_T4]: 0},
};

export const WALK_BACKWARD_LEFT_MOTION: MotionData = {
  name: "walk_backward_left",
  duration: WBL_T4,
  loop: true,
  keyframes: buildKeyframes(WBL_JOINT_ANIMATIONS, WBL_POSITION_ANIMATIONS),
};

export const WALK_BACKWARD_LEFT_MOTION_CONFIG: MotionConfig = {
  motionData: WALK_BACKWARD_LEFT_MOTION,
  isDefault: false,
  blendDuration: 0.2,
  priority: 10,
  interruptible: true,
};

// ============================================================
// WALK_BACKWARD_RIGHT
// ============================================================
export const WBR_T0 = 0.0;
export const WBR_T1 = 0.25;
export const WBR_T2 = 0.5;
export const WBR_T3 = 0.75;
export const WBR_T4 = 1.0;

const WBR_TIMES = [WBR_T0, WBR_T1, WBR_T2, WBR_T3, WBR_T4];

const WBR_ADDITIONS = blendAdditions(WB_ADDITIONS, WR_ADDITIONS, DIAG_W, DIAG_W);

export const WBR_JOINT_ANIMATIONS: Record<string, Record<number, number>> = createDerivedMotion(
  IDLE_JOINT_ANIMATIONS, IDLE_TIMES, WBR_TIMES, WBR_ADDITIONS
);

const WBR_POSITION_ANIMATIONS: Record<string, Record<number, number>> = {
  y: {[WBR_T0]: 0, [WBR_T1]: 0, [WBR_T2]: 0, [WBR_T3]: 0, [WBR_T4]: 0},
};

export const WALK_BACKWARD_RIGHT_MOTION: MotionData = {
  name: "walk_backward_right",
  duration: WBR_T4,
  loop: true,
  keyframes: buildKeyframes(WBR_JOINT_ANIMATIONS, WBR_POSITION_ANIMATIONS),
};

export const WALK_BACKWARD_RIGHT_MOTION_CONFIG: MotionConfig = {
  motionData: WALK_BACKWARD_RIGHT_MOTION,
  isDefault: false,
  blendDuration: 0.2,
  priority: 10,
  interruptible: true,
};
