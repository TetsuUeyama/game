import { MotionData, MotionConfig } from "../types/MotionTypes";

/**
 * ジャンプモーション
 *
 * キーフレーム構成：
 * - 0.0秒: しゃがむ姿勢（準備）
 * - 0.15秒: ジャンプ開始（腕を振り上げる）
 * - 0.3秒: 空中姿勢（ピーク）
 * - 0.45秒: 着地準備
 * - 0.6秒: 着地完了
 */
export const JUMP_MOTION: MotionData = {
  name: "jump",
  duration: 0.6, // 1サイクル0.6秒
  loop: false, // ジャンプは1回きり
  keyframes: [
    // 開始姿勢: しゃがむ
    {
      time: 0.0,
      joints: {
        upperBody: { x: 20, y: 0, z: 0 }, // 前傾
        lowerBody: { x: 0, y: 0, z: 0 },
        head: { x: -10, y: 0, z: 0 }, // 頭は水平を保つ
        leftShoulder: { x: -20, y: 0, z: 0 }, // 腕を後ろに
        rightShoulder: { x: -20, y: 0, z: 0 },
        leftElbow: { x: 10, y: 0, z: 0 },
        rightElbow: { x: 10, y: 0, z: 0 },
        leftHip: { x: -70, y: 0, z: 0 }, // 深くしゃがむ
        rightHip: { x: -70, y: 0, z: 0 },
        leftKnee: { x: 100, y: 0, z: 0 }, // 膝を大きく曲げる
        rightKnee: { x: 100, y: 0, z: 0 },
      },
      position: { x: 0, y: -0.6, z: 0 }, // しゃがんで沈み込む
    },
    // ジャンプ開始: 腕を振り上げる
    {
      time: 0.15,
      joints: {
        upperBody: { x: -10, y: 0, z: 0 }, // 後傾（反動）
        lowerBody: { x: 0, y: 0, z: 0 },
        head: { x: 5, y: 0, z: 0 },
        leftShoulder: { x: -120, y: 0, z: -20 }, // 腕を大きく振り上げる
        rightShoulder: { x: -120, y: 0, z: 20 },
        leftElbow: { x: 30, y: 0, z: 0 },
        rightElbow: { x: 30, y: 0, z: 0 },
        leftHip: { x: -20, y: 0, z: 0 }, // 脚を伸ばす
        rightHip: { x: -20, y: 0, z: 0 },
        leftKnee: { x: 30, y: 0, z: 0 },
        rightKnee: { x: 30, y: 0, z: 0 },
      },
      position: { x: 0, y: 0.5, z: 0 }, // 少し浮き始める
    },
    // 空中姿勢（ピーク）
    {
      time: 0.3,
      joints: {
        upperBody: { x: 0, y: 0, z: 0 }, // まっすぐ
        lowerBody: { x: 0, y: 0, z: 0 },
        head: { x: 0, y: 0, z: 0 },
        leftShoulder: { x: -130, y: 0, z: -30 }, // 腕を上に
        rightShoulder: { x: -130, y: 0, z: 30 },
        leftElbow: { x: 20, y: 0, z: 0 },
        rightElbow: { x: 20, y: 0, z: 0 },
        leftHip: { x: 10, y: 0, z: 0 }, // 脚をやや曲げる
        rightHip: { x: 10, y: 0, z: 0 },
        leftKnee: { x: 40, y: 0, z: 0 },
        rightKnee: { x: 40, y: 0, z: 0 },
      },
      position: { x: 0, y: 1.5, z: 0 }, // 最高地点（1.5メートル上）
    },
    // 着地準備
    {
      time: 0.45,
      joints: {
        upperBody: { x: 15, y: 0, z: 0 }, // 前傾
        lowerBody: { x: 0, y: 0, z: 0 },
        head: { x: -10, y: 0, z: 0 },
        leftShoulder: { x: -40, y: 0, z: -20 }, // 腕を下げる
        rightShoulder: { x: -40, y: 0, z: 20 },
        leftElbow: { x: 30, y: 0, z: 0 },
        rightElbow: { x: 30, y: 0, z: 0 },
        leftHip: { x: -40, y: 0, z: 0 }, // 着地に備えて膝を曲げる
        rightHip: { x: -40, y: 0, z: 0 },
        leftKnee: { x: 70, y: 0, z: 0 },
        rightKnee: { x: 70, y: 0, z: 0 },
      },
      position: {
        x: 0, y: 0.5, z: 0
      }, // 下降中
    },
    // 着地完了
    {
      time: 0.6,
      joints: {
        upperBody: { x: 10, y: 0, z: 0 }, // やや前傾
        lowerBody: { x: 0, y: 0, z: 0 },
        head: { x: -5, y: 0, z: 0 },
        leftShoulder: { x: 0, y: 0, z: 0 }, // 腕を戻す
        rightShoulder: { x: 0, y: 0, z: 0 },
        leftElbow: { x: 0, y: 0, z: 0 },
        rightElbow: { x: 0, y: 0, z: 0 },
        leftHip: { x: -30, y: 0, z: 0 }, // 着地の衝撃吸収
        rightHip: { x: -30, y: 0, z: 0 },
        leftKnee: { x: 50, y: 0, z: 0 },
        rightKnee: { x: 50, y: 0, z: 0 },
      },
      position: { x: 0, y: 0, z: 0 }, // 地面に戻る
    },
  ],
  // 優先度設定（全身を使うので高優先度）
  priorities: [
    { jointName: "leftHip", priority: 10 },
    { jointName: "rightHip", priority: 10 },
    { jointName: "leftKnee", priority: 10 },
    { jointName: "rightKnee", priority: 10 },
    { jointName: "leftShoulder", priority: 9 },
    { jointName: "rightShoulder", priority: 9 },
    { jointName: "leftElbow", priority: 8 },
    { jointName: "rightElbow", priority: 8 },
    { jointName: "upperBody", priority: 7 },
    { jointName: "lowerBody", priority: 6 },
    { jointName: "head", priority: 5 },
  ],
};

/**
 * ジャンプモーションの設定
 */
export const JUMP_MOTION_CONFIG: MotionConfig = {
  motionData: JUMP_MOTION,
  isDefault: false, // デフォルトモーションではない
  blendDuration: 0.1, // 0.1秒でブレンド（素早く切り替え）
  priority: 30, // 歩行・走行より高優先度
  interruptible: false, // ジャンプ中は中断不可
};
