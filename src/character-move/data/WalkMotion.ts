import { MotionData, MotionConfig } from "../types/MotionTypes";

/**
 * 前進（歩行）モーション
 *
 * キーフレーム構成：
 * - 0.0秒: 開始姿勢（直立）
 * - 0.25秒: 左足前、右腕前
 * - 0.5秒: 両足揃う（中間姿勢）
 * - 0.75秒: 右足前、左腕前
 * - 1.0秒: 両足揃う（ループ開始地点）
 */
export const WALK_FORWARD_MOTION: MotionData = {
  name: "walk_forward",
  duration: 1.0, // 1サイクル1秒
  loop: true,
  keyframes: [
    // 開始姿勢（直立）
    {
      time: 0.0,
      joints: {
        upperBody: { x: 2.5, y: 0, z: 0 },
        lowerBody: { x: 0, y: 0, z: 0 },
        head: { x: -1.5, y: 0, z: 0 },
        leftShoulder: { x: 0, y: 0, z: 0 },
        rightShoulder: { x: -17.5, y: 0, z: 0 },
        leftElbow: { x: 0, y: 0, z: 0 },
        rightElbow: { x: 0, y: 0, z: 0 },
        leftHip: { x: -17.5, y: 0, z: 0 },
        rightHip: { x: 0, y: 0, z: 0 },
        leftKnee: { x: 2.5, y: 0, z: 0 },
        rightKnee: { x: 0, y: 0, z: 0 },
      },
    },
    // 中間1: 左足前、右腕前
    {
      time: 0.25,
      joints: {
        upperBody: { x: 5, y: 0, z: 0 }, // わずかに前傾
        lowerBody: { x: 0, y: 0, z: 0 },
        head: { x: -3, y: 0, z: 0 }, // 頭は水平を保つため少し後ろ
        // 左足を前に出す
        leftHip: { x: -35, y: 0, z: 0 }, // 股関節を前に振る
        leftKnee: { x: 10, y: 0, z: 0 }, // 膝を少し曲げる
        // 右足は後ろ
        rightHip: { x: 25, y: 0, z: 0 }, // 股関節を後ろに振る
        rightKnee: { x: 5, y: 0, z: 0 }, // 膝を少し曲げる
        // 右腕を前に出す（足と逆）
        leftShoulder: { x: 35, y: 0, z: 0 }, // 左腕は後ろ
        leftElbow: { x: 0, y: 0, z: 0 },
        rightShoulder: { x: -35, y: 0, z: 0 }, // 右腕は前
        rightElbow: { x: 0, y: 0, z: 0 },
      },
    },
    // 中間2: 両足揃う
    {
      time: 0.5,
      joints: {
        upperBody: { x: 0, y: 0, z: 0 },
        lowerBody: { x: 0, y: 0, z: 0 },
        head: { x: 0, y: 0, z: 0 },
        leftShoulder: { x: 0, y: 0, z: 0 },
        rightShoulder: { x: 0, y: 0, z: 0 },
        leftElbow: { x: 0, y: 0, z: 0 },
        rightElbow: { x: 0, y: 0, z: 0 },
        leftHip: { x: 0, y: 0, z: 0 },
        rightHip: { x: 0, y: 0, z: 0 },
        leftKnee: { x: 0, y: 0, z: 0 },
        rightKnee: { x: 0, y: 0, z: 0 },
      },
    },
    // 中間3: 右足前、左腕前
    {
      time: 0.75,
      joints: {
        upperBody: { x: 5, y: 0, z: 0 }, // わずかに前傾
        lowerBody: { x: 0, y: 0, z: 0 },
        head: { x: -3, y: 0, z: 0 },
        // 右足を前に出す
        rightHip: { x: -35, y: 0, z: 0 },
        rightKnee: { x: 10, y: 0, z: 0 },
        // 左足は後ろ
        leftHip: { x: 25, y: 0, z: 0 },
        leftKnee: { x: 5, y: 0, z: 0 },
        // 左腕を前に出す（足と逆）
        rightShoulder: { x: 35, y: 0, z: 0 }, // 右腕は後ろ
        rightElbow: { x: 0, y: 0, z: 0 },
        leftShoulder: { x: -35, y: 0, z: 0 }, // 左腕は前
        leftElbow: { x: 0, y: 0, z: 0 },
      },
    },
    // 終了姿勢（直立）- ループのため開始と同じ
    {
      time: 1.0,
      joints: {
        upperBody: { x: 0, y: 0, z: 0 },
        lowerBody: { x: 0, y: 0, z: 0 },
        head: { x: 0, y: 0, z: 0 },
        leftShoulder: { x: 0, y: 0, z: 0 },
        rightShoulder: { x: 0, y: 0, z: 0 },
        leftElbow: { x: 0, y: 0, z: 0 },
        rightElbow: { x: 0, y: 0, z: 0 },
        leftHip: { x: 0, y: 0, z: 0 },
        rightHip: { x: 0, y: 0, z: 0 },
        leftKnee: { x: 0, y: 0, z: 0 },
        rightKnee: { x: 0, y: 0, z: 0 },
      },
    },
  ],
  // 優先度設定（値が大きいほど優先）
  priorities: [
    // 脚の動きが最優先（歩行の基本）
    { jointName: "leftHip", priority: 10 },
    { jointName: "rightHip", priority: 10 },
    { jointName: "leftKnee", priority: 9 },
    { jointName: "rightKnee", priority: 9 },
    // 腕の動き
    { jointName: "leftShoulder", priority: 8 },
    { jointName: "rightShoulder", priority: 8 },
    { jointName: "leftElbow", priority: 7 },
    { jointName: "rightElbow", priority: 7 },
    // 胴体
    { jointName: "upperBody", priority: 6 },
    { jointName: "lowerBody", priority: 5 },
    // 頭
    { jointName: "head", priority: 4 },
  ],
};

/**
 * 前進歩行モーションの設定
 */
export const WALK_FORWARD_MOTION_CONFIG: MotionConfig = {
  motionData: WALK_FORWARD_MOTION,
  isDefault: false,
  blendDuration: 0.2,
  priority: 10,
  interruptible: true,
};

/**
 * 後退（歩行）モーション
 */
export const WALK_BACKWARD_MOTION: MotionData = {
  name: "walk_backward",
  duration: 1.0,
  loop: true,
  keyframes: [
    {
      time: 0.0,
      joints: {
        upperBody: { x: -5, y: 0, z: 0 }, // 後ろに傾ける
        lowerBody: { x: 0, y: 0, z: 0 },
        head: { x: 3, y: 0, z: 0 },
        leftShoulder: { x: 0, y: 0, z: 0 },
        rightShoulder: { x: 0, y: 0, z: 0 },
        leftElbow: { x: 0, y: 0, z: 0 },
        rightElbow: { x: 0, y: 0, z: 0 },
        leftHip: { x: 0, y: 0, z: 0 },
        rightHip: { x: 0, y: 0, z: 0 },
        leftKnee: { x: 0, y: 0, z: 0 },
        rightKnee: { x: 0, y: 0, z: 0 },
      },
    },
    {
      time: 0.25,
      joints: {
        upperBody: { x: -5, y: 0, z: 0 },
        lowerBody: { x: 0, y: 0, z: 0 },
        head: { x: 3, y: 0, z: 0 },
        // 後退は前進の逆: 右足後ろ、左腕後ろ
        rightHip: { x: 25, y: 0, z: 0 },
        rightKnee: { x: 5, y: 0, z: 0 },
        leftHip: { x: -15, y: 0, z: 0 },
        leftKnee: { x: 5, y: 0, z: 0 },
        rightShoulder: { x: 25, y: 0, z: 0 },
        rightElbow: { x: 0, y: 0, z: 0 },
        leftShoulder: { x: -25, y: 0, z: 0 },
        leftElbow: { x: 0, y: 0, z: 0 },
      },
    },
    {
      time: 0.5,
      joints: {
        upperBody: { x: -5, y: 0, z: 0 },
        lowerBody: { x: 0, y: 0, z: 0 },
        head: { x: 3, y: 0, z: 0 },
        leftShoulder: { x: 0, y: 0, z: 0 },
        rightShoulder: { x: 0, y: 0, z: 0 },
        leftElbow: { x: 0, y: 0, z: 0 },
        rightElbow: { x: 0, y: 0, z: 0 },
        leftHip: { x: 0, y: 0, z: 0 },
        rightHip: { x: 0, y: 0, z: 0 },
        leftKnee: { x: 0, y: 0, z: 0 },
        rightKnee: { x: 0, y: 0, z: 0 },
      },
    },
    {
      time: 0.75,
      joints: {
        upperBody: { x: -5, y: 0, z: 0 },
        lowerBody: { x: 0, y: 0, z: 0 },
        head: { x: 3, y: 0, z: 0 },
        leftHip: { x: 25, y: 0, z: 0 },
        leftKnee: { x: 5, y: 0, z: 0 },
        rightHip: { x: -15, y: 0, z: 0 },
        rightKnee: { x: 5, y: 0, z: 0 },
        leftShoulder: { x: 25, y: 0, z: 0 },
        leftElbow: { x: 0, y: 0, z: 0 },
        rightShoulder: { x: -25, y: 0, z: 0 },
        rightElbow: { x: 0, y: 0, z: 0 },
      },
    },
    {
      time: 1.0,
      joints: {
        upperBody: { x: -5, y: 0, z: 0 },
        lowerBody: { x: 0, y: 0, z: 0 },
        head: { x: 3, y: 0, z: 0 },
        leftShoulder: { x: 0, y: 0, z: 0 },
        rightShoulder: { x: 0, y: 0, z: 0 },
        leftElbow: { x: 0, y: 0, z: 0 },
        rightElbow: { x: 0, y: 0, z: 0 },
        leftHip: { x: 0, y: 0, z: 0 },
        rightHip: { x: 0, y: 0, z: 0 },
        leftKnee: { x: 0, y: 0, z: 0 },
        rightKnee: { x: 0, y: 0, z: 0 },
      },
    },
  ],
  priorities: [
    { jointName: "leftHip", priority: 10 },
    { jointName: "rightHip", priority: 10 },
    { jointName: "leftKnee", priority: 9 },
    { jointName: "rightKnee", priority: 9 },
    { jointName: "leftShoulder", priority: 8 },
    { jointName: "rightShoulder", priority: 8 },
    { jointName: "upperBody", priority: 6 },
    { jointName: "head", priority: 4 },
  ],
};

export const WALK_BACKWARD_MOTION_CONFIG: MotionConfig = {
  motionData: WALK_BACKWARD_MOTION,
  isDefault: false,
  blendDuration: 0.2,
  priority: 10,
  interruptible: true,
};

/**
 * 左移動（歩行）モーション
 */
export const WALK_LEFT_MOTION: MotionData = {
  name: "walk_left",
  duration: 1.0,
  loop: true,
  keyframes: [
    {
      time: 0.0,
      joints: {
        upperBody: { x: 0, y: 0, z: -5 }, // 左に傾ける
        lowerBody: { x: 0, y: 0, z: 0 },
        head: { x: 0, y: 0, z: 3 },
        leftShoulder: { x: 0, y: 0, z: 0 },
        rightShoulder: { x: 0, y: 0, z: 0 },
        leftElbow: { x: 0, y: 0, z: 0 },
        rightElbow: { x: 0, y: 0, z: 0 },
        leftHip: { x: 0, y: 0, z: 0 },
        rightHip: { x: 0, y: 0, z: 0 },
        leftKnee: { x: 0, y: 0, z: 0 },
        rightKnee: { x: 0, y: 0, z: 0 },
      },
    },
    {
      time: 0.5,
      joints: {
        upperBody: { x: 0, y: 0, z: -8 },
        lowerBody: { x: 0, y: 0, z: 0 },
        head: { x: 0, y: 0, z: 5 },
        leftHip: { x: 0, y: -15, z: 0 },
        leftKnee: { x: 5, y: 0, z: 0 },
        rightHip: { x: 0, y: 10, z: 0 },
        rightKnee: { x: 0, y: 0, z: 0 },
        leftShoulder: { x: 0, y: 0, z: 10 },
        rightShoulder: { x: 0, y: 0, z: -10 },
        leftElbow: { x: 0, y: 0, z: 0 },
        rightElbow: { x: 0, y: 0, z: 0 },
      },
    },
    {
      time: 1.0,
      joints: {
        upperBody: { x: 0, y: 0, z: -5 },
        lowerBody: { x: 0, y: 0, z: 0 },
        head: { x: 0, y: 0, z: 3 },
        leftShoulder: { x: 0, y: 0, z: 0 },
        rightShoulder: { x: 0, y: 0, z: 0 },
        leftElbow: { x: 0, y: 0, z: 0 },
        rightElbow: { x: 0, y: 0, z: 0 },
        leftHip: { x: 0, y: 0, z: 0 },
        rightHip: { x: 0, y: 0, z: 0 },
        leftKnee: { x: 0, y: 0, z: 0 },
        rightKnee: { x: 0, y: 0, z: 0 },
      },
    },
  ],
  priorities: [
    { jointName: "leftHip", priority: 10 },
    { jointName: "rightHip", priority: 10 },
    { jointName: "leftKnee", priority: 9 },
    { jointName: "rightKnee", priority: 9 },
    { jointName: "upperBody", priority: 6 },
    { jointName: "head", priority: 4 },
  ],
};

export const WALK_LEFT_MOTION_CONFIG: MotionConfig = {
  motionData: WALK_LEFT_MOTION,
  isDefault: false,
  blendDuration: 0.2,
  priority: 10,
  interruptible: true,
};

/**
 * 右移動（歩行）モーション
 */
export const WALK_RIGHT_MOTION: MotionData = {
  name: "walk_right",
  duration: 1.0,
  loop: true,
  keyframes: [
    {
      time: 0.0,
      joints: {
        upperBody: { x: 0, y: 0, z: 5 }, // 右に傾ける
        lowerBody: { x: 0, y: 0, z: 0 },
        head: { x: 0, y: 0, z: -3 },
        leftShoulder: { x: 0, y: 0, z: 0 },
        rightShoulder: { x: 0, y: 0, z: 0 },
        leftElbow: { x: 0, y: 0, z: 0 },
        rightElbow: { x: 0, y: 0, z: 0 },
        leftHip: { x: 0, y: 0, z: 0 },
        rightHip: { x: 0, y: 0, z: 0 },
        leftKnee: { x: 0, y: 0, z: 0 },
        rightKnee: { x: 0, y: 0, z: 0 },
      },
    },
    {
      time: 0.5,
      joints: {
        upperBody: { x: 0, y: 0, z: 8 },
        lowerBody: { x: 0, y: 0, z: 0 },
        head: { x: 0, y: 0, z: -5 },
        rightHip: { x: 0, y: 15, z: 0 },
        rightKnee: { x: 5, y: 0, z: 0 },
        leftHip: { x: 0, y: -10, z: 0 },
        leftKnee: { x: 0, y: 0, z: 0 },
        rightShoulder: { x: 0, y: 0, z: -10 },
        leftShoulder: { x: 0, y: 0, z: 10 },
        leftElbow: { x: 0, y: 0, z: 0 },
        rightElbow: { x: 0, y: 0, z: 0 },
      },
    },
    {
      time: 1.0,
      joints: {
        upperBody: { x: 0, y: 0, z: 5 },
        lowerBody: { x: 0, y: 0, z: 0 },
        head: { x: 0, y: 0, z: -3 },
        leftShoulder: { x: 0, y: 0, z: 0 },
        rightShoulder: { x: 0, y: 0, z: 0 },
        leftElbow: { x: 0, y: 0, z: 0 },
        rightElbow: { x: 0, y: 0, z: 0 },
        leftHip: { x: 0, y: 0, z: 0 },
        rightHip: { x: 0, y: 0, z: 0 },
        leftKnee: { x: 0, y: 0, z: 0 },
        rightKnee: { x: 0, y: 0, z: 0 },
      },
    },
  ],
  priorities: [
    { jointName: "leftHip", priority: 10 },
    { jointName: "rightHip", priority: 10 },
    { jointName: "leftKnee", priority: 9 },
    { jointName: "rightKnee", priority: 9 },
    { jointName: "upperBody", priority: 6 },
    { jointName: "head", priority: 4 },
  ],
};

export const WALK_RIGHT_MOTION_CONFIG: MotionConfig = {
  motionData: WALK_RIGHT_MOTION,
  isDefault: false,
  blendDuration: 0.2,
  priority: 10,
  interruptible: true,
};
