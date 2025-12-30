
import { MotionData, MotionConfig } from "../types/MotionTypes";

/**
 * 前進ダッシュモーション
 */
export const DASH_FORWARD_MOTION: MotionData = {
  name: "dash_forward",
  duration: 0.4,
  loop: false,
  keyframes: [
    {
      time: 0.0,
      joints: {
        // ダッシュ開始：前傾姿勢
        upperBody: { x: 30, y: 0, z: 0 },
        lowerBody: { x: -10, y: 0, z: 0 },
        head: { x: -10, y: 0, z: 0 },

        // 腕を大きく振る準備
        leftShoulder: { x: -40, y: 0, z: -30 },
        rightShoulder: { x: 40, y: 0, z: 20 },
        leftElbow: { x: 60, y: 0, z: -20 },
        rightElbow: { x: 60, y: 0, z: 20 },

        // 脚を大きく踏み込む
        leftHip: { x: -50, y: 0, z: 0 },
        rightHip: { x: 10, y: 0, z: 0 },
        leftKnee: { x: 70, y: 0, z: 0 },
        rightKnee: { x: 20, y: 0, z: 0 },
      },
      position: { x: 0, y: 0, z: 0.5 },
    },
    {
      time: 0.2,
      joints: {
        // ダッシュ中間：さらに前傾
        upperBody: { x: 35, y: 0, z: 0 },
        lowerBody: { x: -15, y: 0, z: 0 },
        head: { x: -15, y: 0, z: 0 },

        // 腕を逆に振る
        leftShoulder: { x: 40, y: 0, z: -20 },
        rightShoulder: { x: -40, y: 0, z: 30 },
        leftElbow: { x: 60, y: 0, z: -20 },
        rightElbow: { x: 60, y: 0, z: 20 },

        // 脚を入れ替え
        leftHip: { x: 10, y: 0, z: 0 },
        rightHip: { x: -50, y: 0, z: 0 },
        leftKnee: { x: 20, y: 0, z: 0 },
        rightKnee: { x: 70, y: 0, z: 0 },
      },
      position: { x: 0, y: 0, z: 1.5 },
    },
    {
      time: 0.4,
      joints: {
        // ダッシュ終了：通常の歩行姿勢に戻る
        upperBody: { x: 10, y: 0, z: 0 },
        lowerBody: { x: -5, y: 0, z: 0 },
        head: { x: 0, y: 0, z: 0 },

        leftShoulder: { x: -20, y: 0, z: -15 },
        rightShoulder: { x: 20, y: 0, z: 15 },
        leftElbow: { x: 30, y: 0, z: -10 },
        rightElbow: { x: 30, y: 0, z: 10 },

        leftHip: { x: -20, y: 0, z: 0 },
        rightHip: { x: -5, y: 0, z: 0 },
        leftKnee: { x: 30, y: 0, z: 0 },
        rightKnee: { x: 10, y: 0, z: 0 },
      },
      position: { x: 0, y: 0, z: 3.0 },
    },
  ],
};

export const DASH_FORWARD_MOTION_CONFIG: MotionConfig = {
  motionData: DASH_FORWARD_MOTION,
  isDefault: false,
  blendDuration: 0.0,
  priority: 15,
  interruptible: true,
};

/**
 * 後退ダッシュモーション
 */
export const DASH_BACKWARD_MOTION: MotionData = {
  name: "dash_backward",
  duration: 0.4,
  loop: false,
  keyframes: [
    {
      time: 0.0,
      joints: {
        // 後退ダッシュ開始：やや後傾
        upperBody: { x: -10, y: 0, z: 0 },
        lowerBody: { x: 5, y: 0, z: 0 },
        head: { x: 5, y: 0, z: 0 },

        leftShoulder: { x: -30, y: 0, z: -20 },
        rightShoulder: { x: -30, y: 0, z: 20 },
        leftElbow: { x: 40, y: 0, z: -15 },
        rightElbow: { x: 40, y: 0, z: 15 },

        leftHip: { x: -30, y: 0, z: 0 },
        rightHip: { x: -10, y: 0, z: 0 },
        leftKnee: { x: 40, y: 0, z: 0 },
        rightKnee: { x: 15, y: 0, z: 0 },
      },
      position: { x: 0, y: 0, z: -0.5 },
    },
    {
      time: 0.2,
      joints: {
        upperBody: { x: -15, y: 0, z: 0 },
        lowerBody: { x: 10, y: 0, z: 0 },
        head: { x: 10, y: 0, z: 0 },

        leftShoulder: { x: -30, y: 0, z: -20 },
        rightShoulder: { x: -30, y: 0, z: 20 },
        leftElbow: { x: 40, y: 0, z: -15 },
        rightElbow: { x: 40, y: 0, z: 15 },

        leftHip: { x: -10, y: 0, z: 0 },
        rightHip: { x: -30, y: 0, z: 0 },
        leftKnee: { x: 15, y: 0, z: 0 },
        rightKnee: { x: 40, y: 0, z: 0 },
      },
      position: { x: 0, y: 0, z: -1.5 },
    },
    {
      time: 0.4,
      joints: {
        upperBody: { x: -5, y: 0, z: 0 },
        lowerBody: { x: 0, y: 0, z: 0 },
        head: { x: 0, y: 0, z: 0 },

        leftShoulder: { x: -15, y: 0, z: -10 },
        rightShoulder: { x: -15, y: 0, z: 10 },
        leftElbow: { x: 20, y: 0, z: -10 },
        rightElbow: { x: 20, y: 0, z: 10 },

        leftHip: { x: -5, y: 0, z: 0 },
        rightHip: { x: -10, y: 0, z: 0 },
        leftKnee: { x: 10, y: 0, z: 0 },
        rightKnee: { x: 15, y: 0, z: 0 },
      },
      position: { x: 0, y: 0, z: -3.0 },
    },
  ],
};

export const DASH_BACKWARD_MOTION_CONFIG: MotionConfig = {
  motionData: DASH_BACKWARD_MOTION,
  isDefault: false,
  blendDuration: 0.0,
  priority: 15,
  interruptible: true,
};

/**
 * 左ダッシュモーション
 */
export const DASH_LEFT_MOTION: MotionData = {
  name: "dash_left",
  duration: 0.4,
  loop: false,
  keyframes: [
    {
      time: 0.0,
      joints: {
        // 左ダッシュ開始：左に傾く
        upperBody: { x: 5, y: 0, z: -20 },
        lowerBody: { x: 0, y: 0, z: 10 },
        head: { x: 0, y: 0, z: 10 },

        leftShoulder: { x: -20, y: -20, z: -25 },
        rightShoulder: { x: -10, y: 20, z: 20 },
        leftElbow: { x: 50, y: 0, z: -20 },
        rightElbow: { x: 30, y: 0, z: 15 },

        leftHip: { x: -40, y: 0, z: 0 },
        rightHip: { x: -10, y: 0, z: 0 },
        leftKnee: { x: 50, y: 0, z: 0 },
        rightKnee: { x: 20, y: 0, z: 0 },
      },
      position: { x: -0.5, y: 0, z: 0 },
    },
    {
      time: 0.2,
      joints: {
        upperBody: { x: 5, y: 0, z: -25 },
        lowerBody: { x: 0, y: 0, z: 15 },
        head: { x: 0, y: 0, z: 15 },

        leftShoulder: { x: -10, y: -20, z: -20 },
        rightShoulder: { x: -20, y: 20, z: 25 },
        leftElbow: { x: 30, y: 0, z: -15 },
        rightElbow: { x: 50, y: 0, z: 20 },

        leftHip: { x: -10, y: 0, z: 0 },
        rightHip: { x: -40, y: 0, z: 0 },
        leftKnee: { x: 20, y: 0, z: 0 },
        rightKnee: { x: 50, y: 0, z: 0 },
      },
      position: { x: -1.5, y: 0, z: 0 },
    },
    {
      time: 0.4,
      joints: {
        upperBody: { x: 0, y: 0, z: -10 },
        lowerBody: { x: 0, y: 0, z: 5 },
        head: { x: 0, y: 0, z: 5 },

        leftShoulder: { x: 0, y: -10, z: -15 },
        rightShoulder: { x: 0, y: 10, z: 15 },
        leftElbow: { x: 10, y: 0, z: -10 },
        rightElbow: { x: 10, y: 0, z: 10 },

        leftHip: { x: -10, y: 0, z: 0 },
        rightHip: { x: -5, y: 0, z: 0 },
        leftKnee: { x: 20, y: 0, z: 0 },
        rightKnee: { x: 10, y: 0, z: 0 },
      },
      position: { x: -3.0, y: 0, z: 0 },
    },
  ],
};

export const DASH_LEFT_MOTION_CONFIG: MotionConfig = {
  motionData: DASH_LEFT_MOTION,
  isDefault: false,
  blendDuration: 0.0,
  priority: 15,
  interruptible: true,
};

/**
 * 右ダッシュモーション
 */
export const DASH_RIGHT_MOTION: MotionData = {
  name: "dash_right",
  duration: 0.4,
  loop: false,
  keyframes: [
    {
      time: 0.0,
      joints: {
        // 右ダッシュ開始：右に傾く
        upperBody: { x: 5, y: 0, z: 20 },
        lowerBody: { x: 0, y: 0, z: -10 },
        head: { x: 0, y: 0, z: -10 },

        leftShoulder: { x: -10, y: -20, z: -20 },
        rightShoulder: { x: -20, y: 20, z: 25 },
        leftElbow: { x: 30, y: 0, z: -15 },
        rightElbow: { x: 50, y: 0, z: 20 },

        leftHip: { x: -10, y: 0, z: 0 },
        rightHip: { x: -40, y: 0, z: 0 },
        leftKnee: { x: 20, y: 0, z: 0 },
        rightKnee: { x: 50, y: 0, z: 0 },
      },
      position: { x: 0.5, y: 0, z: 0 },
    },
    {
      time: 0.2,
      joints: {
        upperBody: { x: 5, y: 0, z: 25 },
        lowerBody: { x: 0, y: 0, z: -15 },
        head: { x: 0, y: 0, z: -15 },

        leftShoulder: { x: -20, y: -20, z: -25 },
        rightShoulder: { x: -10, y: 20, z: 20 },
        leftElbow: { x: 50, y: 0, z: -20 },
        rightElbow: { x: 30, y: 0, z: 15 },

        leftHip: { x: -40, y: 0, z: 0 },
        rightHip: { x: -10, y: 0, z: 0 },
        leftKnee: { x: 50, y: 0, z: 0 },
        rightKnee: { x: 20, y: 0, z: 0 },
      },
      position: { x: 1.5, y: 0, z: 0 },
    },
    {
      time: 0.4,
      joints: {
        upperBody: { x: 0, y: 0, z: 10 },
        lowerBody: { x: 0, y: 0, z: -5 },
        head: { x: 0, y: 0, z: -5 },

        leftShoulder: { x: 0, y: -10, z: -15 },
        rightShoulder: { x: 0, y: 10, z: 15 },
        leftElbow: { x: 10, y: 0, z: -10 },
        rightElbow: { x: 10, y: 0, z: 10 },

        leftHip: { x: -5, y: 0, z: 0 },
        rightHip: { x: -10, y: 0, z: 0 },
        leftKnee: { x: 10, y: 0, z: 0 },
        rightKnee: { x: 20, y: 0, z: 0 },
      },
      position: { x: 3.0, y: 0, z: 0 },
    },
  ],
};

export const DASH_RIGHT_MOTION_CONFIG: MotionConfig = {
  motionData: DASH_RIGHT_MOTION,
  isDefault: false,
  blendDuration: 0.0,
  priority: 15,
  interruptible: true,
};
