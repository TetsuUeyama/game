import {MotionData, MotionConfig} from "../types/MotionTypes";
import {buildKeyframes} from "../utils/MotionUtils";

/**
 * ダッシュ停止モーション
 * 速度に応じて動的に生成される
 *
 * ダッシュ加速度（0～1.0）に応じて、停止硬直の長さとポーズの深さが変化
 * - 低速（0.0～0.3）: 0.15秒の軽い硬直
 * - 中速（0.3～0.7）: 0.3秒の中程度の硬直
 * - 高速（0.7～1.0）: 0.5秒の長い硬直
 */

/**
 * ダッシュ停止モーションを動的に生成
 * @param accelerationRatio ダッシュ加速度（0.0～1.0）
 * @returns ダッシュ停止モーションデータ
 */
export function createDashStopMotion(accelerationRatio: number): MotionData {
  // 加速度に応じて硬直時間を決定
  let duration: number;
  let intensityMultiplier: number; // ポーズの強度倍率

  if (accelerationRatio < 0.3) {
    // 低速停止
    duration = 0.15;
    intensityMultiplier = 0.5;
  } else if (accelerationRatio < 0.7) {
    // 中速停止
    duration = 0.3;
    intensityMultiplier = 0.75;
  } else {
    // 高速停止
    duration = 0.5;
    intensityMultiplier = 1.0;
  }

  const T0 = 0.0;
  const T1 = duration * 0.3; // 最大硬直姿勢
  const T2 = duration * 0.7; // 回復中
  const T3 = duration; // 終了

  // スライディング停止のような姿勢（速度が高いほど深く）
  const JOINT_ANIMATIONS: Record<string, Record<number, number>> = {
    upperBodyX: {
      [T0]: 15 * intensityMultiplier,
      [T1]: 12 * intensityMultiplier,
      [T2]: 5 * intensityMultiplier,
      [T3]: 0,
    },
    upperBodyY: {[T0]: 0, [T1]: 0, [T2]: 0, [T3]: 0},
    upperBodyZ: {[T0]: 0, [T1]: 0, [T2]: 0, [T3]: 0},

    lowerBodyX: {
      [T0]: -8 * intensityMultiplier,
      [T1]: -6 * intensityMultiplier,
      [T2]: -3 * intensityMultiplier,
      [T3]: 0,
    },
    lowerBodyY: {[T0]: 0, [T1]: 0, [T2]: 0, [T3]: 0},
    lowerBodyZ: {[T0]: 0, [T1]: 0, [T2]: 0, [T3]: 0},

    headX: {
      [T0]: 3 * intensityMultiplier,
      [T1]: 2 * intensityMultiplier,
      [T2]: 1 * intensityMultiplier,
      [T3]: 0,
    },
    headY: {[T0]: 0, [T1]: 0, [T2]: 0, [T3]: 0},
    headZ: {[T0]: 0, [T1]: 0, [T2]: 0, [T3]: 0},

    leftShoulderX: {[T0]: 0, [T1]: 0, [T2]: 0, [T3]: 0},
    leftShoulderY: {
      [T0]: -10 * intensityMultiplier,
      [T1]: -8 * intensityMultiplier,
      [T2]: -3 * intensityMultiplier,
      [T3]: 0,
    },
    leftShoulderZ: {
      [T0]: -15 * intensityMultiplier,
      [T1]: -12 * intensityMultiplier,
      [T2]: -8 * intensityMultiplier,
      [T3]: -6,
    },

    rightShoulderX: {[T0]: 0, [T1]: 0, [T2]: 0, [T3]: 0},
    rightShoulderY: {
      [T0]: 10 * intensityMultiplier,
      [T1]: 8 * intensityMultiplier,
      [T2]: 3 * intensityMultiplier,
      [T3]: 0,
    },
    rightShoulderZ: {
      [T0]: 15 * intensityMultiplier,
      [T1]: 12 * intensityMultiplier,
      [T2]: 8 * intensityMultiplier,
      [T3]: 6,
    },

    leftElbowX: {[T0]: 0, [T1]: 0, [T2]: 0, [T3]: 0},
    leftElbowY: {[T0]: 0, [T1]: 0, [T2]: 0, [T3]: 0},
    leftElbowZ: {
      [T0]: -20 * intensityMultiplier,
      [T1]: -15 * intensityMultiplier,
      [T2]: -8 * intensityMultiplier,
      [T3]: 6,
    },

    rightElbowX: {[T0]: 0, [T1]: 0, [T2]: 0, [T3]: 0},
    rightElbowY: {[T0]: 0, [T1]: 0, [T2]: 0, [T3]: 0},
    rightElbowZ: {
      [T0]: 20 * intensityMultiplier,
      [T1]: 15 * intensityMultiplier,
      [T2]: 8 * intensityMultiplier,
      [T3]: -6,
    },

    leftHipX: {
      [T0]: -50 * intensityMultiplier,
      [T1]: -40 * intensityMultiplier,
      [T2]: -20 * intensityMultiplier,
      [T3]: 0,
    },
    leftHipY: {[T0]: -15, [T1]: -15, [T2]: -15, [T3]: -15},
    leftHipZ: {[T0]: -8, [T1]: -8, [T2]: -8, [T3]: -8},

    rightHipX: {
      [T0]: -50 * intensityMultiplier,
      [T1]: -40 * intensityMultiplier,
      [T2]: -20 * intensityMultiplier,
      [T3]: 0,
    },
    rightHipY: {[T0]: 15, [T1]: 15, [T2]: 15, [T3]: 15},
    rightHipZ: {[T0]: 8, [T1]: 8, [T2]: 8, [T3]: 8},

    leftKneeX: {
      [T0]: 60 * intensityMultiplier,
      [T1]: 50 * intensityMultiplier,
      [T2]: 25 * intensityMultiplier,
      [T3]: 5,
    },
    leftKneeY: {[T0]: 0, [T1]: 0, [T2]: 0, [T3]: 0},
    leftKneeZ: {[T0]: 5, [T1]: 5, [T2]: 5, [T3]: 5},

    rightKneeX: {
      [T0]: 60 * intensityMultiplier,
      [T1]: 50 * intensityMultiplier,
      [T2]: 25 * intensityMultiplier,
      [T3]: 5,
    },
    rightKneeY: {[T0]: 0, [T1]: 0, [T2]: 0, [T3]: 0},
    rightKneeZ: {[T0]: -5, [T1]: -5, [T2]: -5, [T3]: -5},
  };

  const POSITION_ANIMATIONS: Record<string, Record<number, number>> = {
    x: {[T0]: 0, [T1]: 0, [T2]: 0, [T3]: 0},
    y: {
      [T0]: -0.25 * intensityMultiplier,
      [T1]: -0.15 * intensityMultiplier,
      [T2]: -0.05 * intensityMultiplier,
      [T3]: 0,
    },
    z: {[T0]: 0, [T1]: 0, [T2]: 0, [T3]: 0},
  };

  return {
    name: "dash_stop",
    duration: duration,
    loop: false,
    keyframes: buildKeyframes(JOINT_ANIMATIONS, POSITION_ANIMATIONS),
  };
}

// デフォルトのダッシュ停止モーション（中速）
export const DASH_STOP_MOTION: MotionData = createDashStopMotion(0.5);

export const DASH_STOP_MOTION_CONFIG: MotionConfig = {
  motionData: DASH_STOP_MOTION,
  isDefault: false,
  blendDuration: 0.05,
  priority: 20,
  interruptible: false,
};
