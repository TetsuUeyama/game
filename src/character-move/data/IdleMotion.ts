import { MotionData, MotionConfig } from "../types/MotionTypes";

/**
 * アイドル（直立）モーション
 *
 * キーフレーム構成：
 * - 0.0秒: 直立姿勢
 * - 1.0秒: 直立姿勢（わずかな呼吸の動き）
 * - 2.0秒: 直立姿勢（元に戻る）
 */
export const IDLE_MOTION: MotionData = {
  name: "idle",
  duration: 2.0, // 1サイクル2秒
  loop: true,
  keyframes: [
    // 開始姿勢（直立）
    {
      time: 0.0,
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
        leftKnee: { x: 5, y: 0, z: 5 },
        rightKnee: { x: 5, y: 0, z: -5 },
      },
    },
    // 中間: わずかに呼吸で上半身が動く
    {
      time: 1.0,
      joints: {
        upperBody: { x: 2, y: 0, z: 0 }, // わずかに前傾
        lowerBody: { x: 0, y: 0, z: 0 },
        head: { x: -1, y: 0, z: 0 }, // 頭は水平を保つ
        leftShoulder: { x: 0, y: 0, z: 0 },
        rightShoulder: { x: 0, y: 0, z: 0 },
        leftElbow: { x: 0, y: 0, z: 0 },
        rightElbow: { x: 0, y: 0, z: 0 },
        leftHip: { x: 0, y: 0, z: 0 },
        rightHip: { x: 0, y: 0, z: 0 },
        leftKnee: { x: 5, y: 0, z: 5 },
        rightKnee: { x: 5, y: 0, z: -5 },
      },
    },
    // 終了姿勢（直立に戻る）
    {
      time: 2.0,
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
        leftKnee: { x: 5, y: 0, z: 5 },
        rightKnee: { x: 5, y: 0, z: -5 },
      },
    },
  ],
  // 優先度設定（全体的に低め）
  priorities: [
    { jointName: "upperBody", priority: 5 },
    { jointName: "head", priority: 4 },
    { jointName: "lowerBody", priority: 3 },
  ],
};

/**
 * アイドルモーションの設定
 */
export const IDLE_MOTION_CONFIG: MotionConfig = {
  motionData: IDLE_MOTION,
  isDefault: true, // デフォルトモーション
  blendDuration: 0.3, // 0.3秒でブレンド
  priority: 0, // 最低優先度
  interruptible: true, // 中断可能
};
