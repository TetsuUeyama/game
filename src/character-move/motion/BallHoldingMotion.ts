import { MotionData, MotionConfig } from "../types/MotionTypes";
import { buildKeyframes } from "../utils/MotionUtils";
import { DominantHand } from "../config/BallHoldingConfig";

/**
 * ボール保持モーション
 *
 * 各保持方向（0,1,2,6,7）ごとの腕のポーズを定義
 * - 方向0: 正面 → 利き腕で保持
 * - 方向1: 右前 → 右手で保持
 * - 方向2: 右 → 右手で保持
 * - 方向6: 左 → 左手で保持
 * - 方向7: 左前 → 左手で保持
 *
 * ボールは腰の高さで保持する
 */

// 時間定義（静的ポーズなのでT0のみ）
const T0 = 0.0;
const T1 = 0.1; // ブレンド用の終了時間

/**
 * 腕のポーズ定義
 * - shoulderX: 肩のX軸回転（負=前方へ、腕を下げる）
 * - shoulderY: 肩のY軸回転（負=右へ、正=左へ）
 * - shoulderZ: 肩のZ軸回転（体から離す）
 * - elbowX: 肘のX軸回転（負=曲げる）
 */
interface ArmPose {
  shoulderX: number;
  shoulderY: number;
  shoulderZ: number;
  elbowX: number;
  elbowY: number;
  elbowZ: number;
}

// 右手で持つときの各方向のポーズ（右利き用）
const RIGHT_HAND_POSES: Record<number, ArmPose> = {
  // 方向0: 正面 - 右腕を正面に
  0: { shoulderX: -35, shoulderY: 0, shoulderZ: 15, elbowX: -60, elbowY: 0, elbowZ: -10 },
  // 方向1: 右前 - 右腕を右斜め前に
  1: { shoulderX: -35, shoulderY: -25, shoulderZ: 20, elbowX: -55, elbowY: 0, elbowZ: -15 },
  // 方向2: 右 - 右腕を右側に
  2: { shoulderX: -30, shoulderY: -50, shoulderZ: 25, elbowX: -50, elbowY: 0, elbowZ: -20 },
};

// 左手で持つときの各方向のポーズ（右利き用）
const LEFT_HAND_POSES: Record<number, ArmPose> = {
  // 方向6: 左 - 左腕を左側に
  6: { shoulderX: -30, shoulderY: 50, shoulderZ: -25, elbowX: -50, elbowY: 0, elbowZ: 20 },
  // 方向7: 左前 - 左腕を左斜め前に
  7: { shoulderX: -35, shoulderY: 25, shoulderZ: -20, elbowX: -55, elbowY: 0, elbowZ: 15 },
};

// ボールを持たない方の腕（リラックス状態）
const RELAXED_ARM_POSE: ArmPose = {
  shoulderX: -5,
  shoulderY: 0,
  shoulderZ: 8,
  elbowX: -15,
  elbowY: 0,
  elbowZ: 0,
};

/**
 * キーフレームアニメーションを生成
 */
function createBallHoldingJointAnimations(
  rightArmPose: ArmPose,
  leftArmPose: ArmPose
): Record<string, Record<number, number>> {
  return {
    // 上半身・下半身・頭は変更なし（他のモーションに任せる）
    upperBodyX: { [T0]: 0, [T1]: 0 },
    upperBodyY: { [T0]: 0, [T1]: 0 },
    upperBodyZ: { [T0]: 0, [T1]: 0 },
    lowerBodyX: { [T0]: 0, [T1]: 0 },
    lowerBodyY: { [T0]: 0, [T1]: 0 },
    lowerBodyZ: { [T0]: 0, [T1]: 0 },
    headX: { [T0]: 0, [T1]: 0 },
    headY: { [T0]: 0, [T1]: 0 },
    headZ: { [T0]: 0, [T1]: 0 },

    // 右腕
    rightShoulderX: { [T0]: rightArmPose.shoulderX, [T1]: rightArmPose.shoulderX },
    rightShoulderY: { [T0]: rightArmPose.shoulderY, [T1]: rightArmPose.shoulderY },
    rightShoulderZ: { [T0]: rightArmPose.shoulderZ, [T1]: rightArmPose.shoulderZ },
    rightElbowX: { [T0]: rightArmPose.elbowX, [T1]: rightArmPose.elbowX },
    rightElbowY: { [T0]: rightArmPose.elbowY, [T1]: rightArmPose.elbowY },
    rightElbowZ: { [T0]: rightArmPose.elbowZ, [T1]: rightArmPose.elbowZ },

    // 左腕
    leftShoulderX: { [T0]: leftArmPose.shoulderX, [T1]: leftArmPose.shoulderX },
    leftShoulderY: { [T0]: leftArmPose.shoulderY, [T1]: leftArmPose.shoulderY },
    leftShoulderZ: { [T0]: leftArmPose.shoulderZ, [T1]: leftArmPose.shoulderZ },
    leftElbowX: { [T0]: leftArmPose.elbowX, [T1]: leftArmPose.elbowX },
    leftElbowY: { [T0]: leftArmPose.elbowY, [T1]: leftArmPose.elbowY },
    leftElbowZ: { [T0]: leftArmPose.elbowZ, [T1]: leftArmPose.elbowZ },

    // 脚は変更なし
    leftHipX: { [T0]: 0, [T1]: 0 },
    leftHipY: { [T0]: 0, [T1]: 0 },
    leftHipZ: { [T0]: 0, [T1]: 0 },
    rightHipX: { [T0]: 0, [T1]: 0 },
    rightHipY: { [T0]: 0, [T1]: 0 },
    rightHipZ: { [T0]: 0, [T1]: 0 },
    leftKneeX: { [T0]: 0, [T1]: 0 },
    leftKneeY: { [T0]: 0, [T1]: 0 },
    leftKneeZ: { [T0]: 0, [T1]: 0 },
    rightKneeX: { [T0]: 0, [T1]: 0 },
    rightKneeY: { [T0]: 0, [T1]: 0 },
    rightKneeZ: { [T0]: 0, [T1]: 0 },
  };
}

/**
 * 右利き用のボール保持モーションを生成
 */
function createRightHandedMotion(faceIndex: number): MotionData {
  let rightArmPose: ArmPose;
  let leftArmPose: ArmPose;

  if (faceIndex in RIGHT_HAND_POSES) {
    // 右手で持つ（方向0, 1, 2）
    rightArmPose = RIGHT_HAND_POSES[faceIndex];
    leftArmPose = RELAXED_ARM_POSE;
  } else if (faceIndex in LEFT_HAND_POSES) {
    // 左手で持つ（方向6, 7）
    rightArmPose = RELAXED_ARM_POSE;
    leftArmPose = LEFT_HAND_POSES[faceIndex];
  } else {
    // デフォルト（正面）
    rightArmPose = RIGHT_HAND_POSES[0];
    leftArmPose = RELAXED_ARM_POSE;
  }

  const jointAnimations = createBallHoldingJointAnimations(rightArmPose, leftArmPose);

  return {
    name: `ball_holding_right_${faceIndex}`,
    duration: T1,
    loop: false,
    keyframes: buildKeyframes(jointAnimations),
    priorities: [
      { jointName: "rightShoulder", priority: 6 },
      { jointName: "rightElbow", priority: 6 },
      { jointName: "leftShoulder", priority: 6 },
      { jointName: "leftElbow", priority: 6 },
    ],
  };
}

/**
 * 左利き用のボール保持モーションを生成（右利きの反転）
 */
function createLeftHandedMotion(faceIndex: number): MotionData {
  let rightArmPose: ArmPose;
  let leftArmPose: ArmPose;

  // 左利きの場合、方向のマッピングが逆になる
  // 方向0: 左手（利き腕）で持つ
  // 方向1, 2: 右手（非利き腕）で持つ
  // 方向6, 7: 左手（利き腕）で持つ
  if (faceIndex === 0) {
    // 正面 - 左腕を正面に
    rightArmPose = RELAXED_ARM_POSE;
    leftArmPose = { shoulderX: -35, shoulderY: 0, shoulderZ: -15, elbowX: -60, elbowY: 0, elbowZ: 10 };
  } else if (faceIndex === 1) {
    // 右前 - 右手（非利き腕）で持つ
    rightArmPose = RIGHT_HAND_POSES[1];
    leftArmPose = RELAXED_ARM_POSE;
  } else if (faceIndex === 2) {
    // 右 - 右手（非利き腕）で持つ
    rightArmPose = RIGHT_HAND_POSES[2];
    leftArmPose = RELAXED_ARM_POSE;
  } else if (faceIndex === 6) {
    // 左 - 左手（利き腕）で持つ
    rightArmPose = RELAXED_ARM_POSE;
    leftArmPose = LEFT_HAND_POSES[6];
  } else if (faceIndex === 7) {
    // 左前 - 左手（利き腕）で持つ
    rightArmPose = RELAXED_ARM_POSE;
    leftArmPose = LEFT_HAND_POSES[7];
  } else {
    // デフォルト
    rightArmPose = RELAXED_ARM_POSE;
    leftArmPose = { shoulderX: -35, shoulderY: 0, shoulderZ: -15, elbowX: -60, elbowY: 0, elbowZ: 10 };
  }

  const jointAnimations = createBallHoldingJointAnimations(rightArmPose, leftArmPose);

  return {
    name: `ball_holding_left_${faceIndex}`,
    duration: T1,
    loop: false,
    keyframes: buildKeyframes(jointAnimations),
    priorities: [
      { jointName: "rightShoulder", priority: 6 },
      { jointName: "rightElbow", priority: 6 },
      { jointName: "leftShoulder", priority: 6 },
      { jointName: "leftElbow", priority: 6 },
    ],
  };
}

// 右利き用モーション（各方向）
export const BALL_HOLDING_MOTIONS_RIGHT: Record<number, MotionData> = {
  0: createRightHandedMotion(0),
  1: createRightHandedMotion(1),
  2: createRightHandedMotion(2),
  6: createRightHandedMotion(6),
  7: createRightHandedMotion(7),
};

// 左利き用モーション（各方向）
export const BALL_HOLDING_MOTIONS_LEFT: Record<number, MotionData> = {
  0: createLeftHandedMotion(0),
  1: createLeftHandedMotion(1),
  2: createLeftHandedMotion(2),
  6: createLeftHandedMotion(6),
  7: createLeftHandedMotion(7),
};

/**
 * 利き腕と方向からボール保持モーションを取得
 * @param dominantHand 利き腕
 * @param faceIndex 保持方向（面番号）
 * @returns ボール保持モーション
 */
export function getBallHoldingMotion(dominantHand: DominantHand, faceIndex: number): MotionData {
  const motions = dominantHand === 'right' ? BALL_HOLDING_MOTIONS_RIGHT : BALL_HOLDING_MOTIONS_LEFT;
  return motions[faceIndex] ?? motions[0];
}

/**
 * ボール保持モーションの設定
 */
export const BALL_HOLDING_MOTION_CONFIG: MotionConfig = {
  motionData: BALL_HOLDING_MOTIONS_RIGHT[0], // デフォルト（右利き、正面）
  isDefault: false,
  blendDuration: 0.2, // 0.2秒でブレンド（仕様通り）
  priority: 5, // IdleMotionより高い優先度
  interruptible: true,
};

/**
 * ボール保持モーションマップ
 */
export const BALL_HOLDING_MOTIONS = {
  // 右利き
  ball_holding_right_0: BALL_HOLDING_MOTIONS_RIGHT[0],
  ball_holding_right_1: BALL_HOLDING_MOTIONS_RIGHT[1],
  ball_holding_right_2: BALL_HOLDING_MOTIONS_RIGHT[2],
  ball_holding_right_6: BALL_HOLDING_MOTIONS_RIGHT[6],
  ball_holding_right_7: BALL_HOLDING_MOTIONS_RIGHT[7],
  // 左利き
  ball_holding_left_0: BALL_HOLDING_MOTIONS_LEFT[0],
  ball_holding_left_1: BALL_HOLDING_MOTIONS_LEFT[1],
  ball_holding_left_2: BALL_HOLDING_MOTIONS_LEFT[2],
  ball_holding_left_6: BALL_HOLDING_MOTIONS_LEFT[6],
  ball_holding_left_7: BALL_HOLDING_MOTIONS_LEFT[7],
};
