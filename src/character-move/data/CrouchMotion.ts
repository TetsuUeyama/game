import {MotionData, MotionConfig} from "../types/MotionTypes";

/**
 * しゃがみ込みモーション
 * ジャンプ前の溜めモーションとして使用
 * 押下時間が長いほど深くしゃがむ
 */
export const CROUCH_MOTION: MotionData = {
  name: "crouch",
  duration: 0.3, // 最大溜め時間（0.3秒でmax）
  loop: false,
  keyframes: [
    {
      time: 0.0,
      joints: {
        // 開始: 立ち姿勢（アイドル）
        upperBody: {x: 0, y: 0, z: 0},
        lowerBody: {x: 0, y: 0, z: 0},
        head: {x: 0, y: 0, z: 0},

        leftShoulder: {x: 0, y: 0, z: -10},
        rightShoulder: {x: 0, y: 0, z: 10},
        leftElbow: {x: 0, y: 0, z: -10},
        rightElbow: {x: 0, y: 0, z: 10},

        leftHip: {x: -5, y: 0, z: 0},
        rightHip: {x: -5, y: 0, z: 0},
        leftKnee: {x: 10, y: 0, z: 0},
        rightKnee: {x: 10, y: 0, z: 0},
      },
      position: {x: 0, y: 0, z: 0},
    },
    {
      time: 0.05,
      joints: {
        // 浅いしゃがみ（小ジャンプ用）
        upperBody: {x: 5, y: 0, z: 0},
        lowerBody: {x: -5, y: 0, z: 0},
        head: {x: 0, y: 0, z: 0},

        leftShoulder: {x: 0, y: -5, z: -15},
        rightShoulder: {x: 0, y: 5, z: 15},
        leftElbow: {x: 0, y: 0, z: -20},
        rightElbow: {x: 0, y: 0, z: 20},

        leftHip: {x: -30, y: 0, z: 0},
        rightHip: {x: -30, y: 0, z: 0},
        leftKnee: {x: 40, y: 0, z: 0},
        rightKnee: {x: 40, y: 0, z: 0},
      },
      position: {x: 0, y: -0.2, z: 0},
    },
    {
      time: 0.15,
      joints: {
        // 中程度のしゃがみ（中ジャンプ用）
        upperBody: {x: 10, y: 0, z: 0},
        lowerBody: {x: -10, y: 0, z: 0},
        head: {x: 0, y: 0, z: 0},

        leftShoulder: {x: 0, y: -10, z: -20},
        rightShoulder: {x: 0, y: 10, z: 20},
        leftElbow: {x: 0, y: 0, z: -30},
        rightElbow: {x: 0, y: 0, z: 30},

        leftHip: {x: -50, y: 0, z: 0},
        rightHip: {x: -50, y: 0, z: 0},
        leftKnee: {x: 60, y: 0, z: 0},
        rightKnee: {x: 60, y: 0, z: 0},
      },
      position: {x: 0, y: -0.4, z: 0},
    },
    {
      time: 0.3,
      joints: {
        // 深いしゃがみ（大ジャンプ用）
        upperBody: {x: 15, y: 0, z: 0},
        lowerBody: {x: -15, y: 0, z: 0},
        head: {x: 5, y: 0, z: 0},

        leftShoulder: {x: 0, y: -15, z: -25},
        rightShoulder: {x: 0, y: 15, z: 25},
        leftElbow: {x: 0, y: 0, z: -40},
        rightElbow: {x: 0, y: 0, z: 40},

        leftHip: {x: -70, y: 0, z: 0},
        rightHip: {x: -70, y: 0, z: 0},
        leftKnee: {x: 80, y: 0, z: 0},
        rightKnee: {x: 80, y: 0, z: 0},
      },
      position: {x: 0, y: -0.6, z: 0}, // 最大で0.6m沈む
    },
  ],
};

/**
 * しゃがみ込みモーション設定
 */
export const CROUCH_MOTION_CONFIG: MotionConfig = {
  motionData: CROUCH_MOTION,
  isDefault: false,
  blendDuration: 0.0, // 即座に切り替え
  priority: 25, // ダッシュより高優先度
  interruptible: true, // ボタンを離したらすぐジャンプできる
};
