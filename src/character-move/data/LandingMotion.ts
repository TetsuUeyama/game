import {MotionData, MotionConfig} from "../types/MotionTypes";

/**
 * 着地硬直モーション
 * ジャンプの着地後の硬直を表現するモーション
 */
export const LANDING_MOTION: MotionData = {
  name: "landing",
  duration: 0.3, // デフォルトの硬直時間（中ジャンプ用）
  loop: false,
  keyframes: [
    {
      time: 0.0,
      joints: {
        // 着地直後: 膝を曲げて衝撃を吸収
        upperBody: {x: 5, y: 0, z: 0}, // やや前傾
        lowerBody: {x: -5, y: 0, z: 0}, // やや後傾でバランス
        head: {x: 0, y: 0, z: 0},

        // 腕は着地の衝撃でやや広がる
        leftShoulder: {x: 0, y: -15, z: -20},
        rightShoulder: {x: 0, y: 15, z: 20},
        leftElbow: {x: 0, y: 0, z: -30},
        rightElbow: {x: 0, y: 0, z: 30},

        // 脚は深く曲げる
        leftHip: {x: -60, y: 0, z: 0},
        rightHip: {x: -60, y: 0, z: 0},
        leftKnee: {x: 70, y: 0, z: 0},
        rightKnee: {x: 70, y: 0, z: 0},
      },
      position: {x: 0, y: -0.3, z: 0}, // 着地時に少し沈む
    },
    {
      time: 0.15,
      joints: {
        // 硬直中: まだ膝が曲がった状態
        upperBody: {x: 3, y: 0, z: 0},
        lowerBody: {x: -3, y: 0, z: 0},
        head: {x: 0, y: 0, z: 0},

        leftShoulder: {x: 0, y: -10, z: -15},
        rightShoulder: {x: 0, y: 10, z: 15},
        leftElbow: {x: 0, y: 0, z: -20},
        rightElbow: {x: 0, y: 0, z: 20},

        leftHip: {x: -40, y: 0, z: 0},
        rightHip: {x: -40, y: 0, z: 0},
        leftKnee: {x: 50, y: 0, z: 0},
        rightKnee: {x: 50, y: 0, z: 0},
      },
      position: {x: 0, y: -0.15, z: 0}, // 徐々に立ち上がる
    },
    {
      time: 0.3,
      joints: {
        // 硬直解除: アイドルポーズに戻る
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
      position: {x: 0, y: 0, z: 0}, // 完全に立ち上がる
    },
  ],
};

/**
 * 着地硬直モーション設定
 */
export const LANDING_MOTION_CONFIG: MotionConfig = {
  motionData: LANDING_MOTION,
  isDefault: false,
  blendDuration: 0.1, // 短いブレンド時間
  priority: 5, // ジャンプより低い優先度
  interruptible: false, // 硬直中は中断不可
};

/**
 * 小ジャンプ用の短い着地硬直モーション
 */
export const LANDING_SMALL_MOTION: MotionData = {
  name: "landing_small",
  duration: 0.1,
  loop: false,
  keyframes: [
    {
      time: 0.0,
      joints: {
        upperBody: {x: 3, y: 0, z: 0},
        lowerBody: {x: -3, y: 0, z: 0},
        head: {x: 0, y: 0, z: 0},

        leftShoulder: {x: 0, y: -10, z: -15},
        rightShoulder: {x: 0, y: 10, z: 15},
        leftElbow: {x: 0, y: 0, z: -20},
        rightElbow: {x: 0, y: 0, z: 20},

        leftHip: {x: -40, y: 0, z: 0},
        rightHip: {x: -40, y: 0, z: 0},
        leftKnee: {x: 50, y: 0, z: 0},
        rightKnee: {x: 50, y: 0, z: 0},
      },
      position: {x: 0, y: -0.15, z: 0},
    },
    {
      time: 0.1,
      joints: {
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
  ],
};

export const LANDING_SMALL_MOTION_CONFIG: MotionConfig = {
  motionData: LANDING_SMALL_MOTION,
  isDefault: false,
  blendDuration: 0.05,
  priority: 5,
  interruptible: false,
};

/**
 * 大ジャンプ用の長い着地硬直モーション
 */
export const LANDING_LARGE_MOTION: MotionData = {
  name: "landing_large",
  duration: 0.3,
  loop: false,
  keyframes: [
    {
      time: 0.0,
      joints: {
        // 大きな衝撃で深く沈む
        upperBody: {x: 10, y: 0, z: 0},
        lowerBody: {x: -10, y: 0, z: 0},
        head: {x: 5, y: 0, z: 0},

        leftShoulder: {x: 0, y: -20, z: -25},
        rightShoulder: {x: 0, y: 20, z: 25},
        leftElbow: {x: 0, y: 0, z: -40},
        rightElbow: {x: 0, y: 0, z: 40},

        leftHip: {x: -70, y: 0, z: 0},
        rightHip: {x: -70, y: 0, z: 0},
        leftKnee: {x: 80, y: 0, z: 0},
        rightKnee: {x: 80, y: 0, z: 0},
      },
      position: {x: 0, y: -0.5, z: 0}, // 深く沈む
    },
    {
      time: 0.1,
      joints: {
        upperBody: {x: 8, y: 0, z: 0},
        lowerBody: {x: -8, y: 0, z: 0},
        head: {x: 3, y: 0, z: 0},

        leftShoulder: {x: 0, y: -15, z: -20},
        rightShoulder: {x: 0, y: 15, z: 20},
        leftElbow: {x: 0, y: 0, z: -30},
        rightElbow: {x: 0, y: 0, z: 30},

        leftHip: {x: -60, y: 0, z: 0},
        rightHip: {x: -60, y: 0, z: 0},
        leftKnee: {x: 70, y: 0, z: 0},
        rightKnee: {x: 70, y: 0, z: 0},
      },
      position: {x: 0, y: -0.3, z: 0},
    },
    {
      time: 0.2,
      joints: {
        upperBody: {x: 3, y: 0, z: 0},
        lowerBody: {x: -3, y: 0, z: 0},
        head: {x: 0, y: 0, z: 0},

        leftShoulder: {x: 0, y: -10, z: -15},
        rightShoulder: {x: 0, y: 10, z: 15},
        leftElbow: {x: 0, y: 0, z: -20},
        rightElbow: {x: 0, y: 0, z: 20},

        leftHip: {x: -40, y: 0, z: 0},
        rightHip: {x: -40, y: 0, z: 0},
        leftKnee: {x: 50, y: 0, z: 0},
        rightKnee: {x: 50, y: 0, z: 0},
      },
      position: {x: 0, y: -0.15, z: 0},
    },
    {
      time: 0.3,
      joints: {
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
  ],
};

export const LANDING_LARGE_MOTION_CONFIG: MotionConfig = {
  motionData: LANDING_LARGE_MOTION,
  isDefault: false,
  blendDuration: 0.1,
  priority: 5,
  interruptible: false,
};
