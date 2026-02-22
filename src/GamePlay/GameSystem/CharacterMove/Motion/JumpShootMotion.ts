import { MotionData, MotionConfig } from "@/GamePlay/GameSystem/CharacterMove/Types/MotionTypes";
import { buildKeyframes } from "@/GamePlay/GameSystem/CharacterMove/MotionEngine/MotionUtils";

/**
 * ジャンプシュートモーション
 *
 * ドライブ中のジャンプ頂点付近からシュートモーションを開始する複合モーション。
 * JumpMotionの頂点以降のY軸 + シュートの上半身アニメーションを1つにまとめたもの。
 *
 * 3種類:
 * - jump_shoot_layup: レイアップ（片手リリース）
 * - jump_shoot_dunk: ダンク（叩きつけ）
 * - jump_shoot_mid: ジャンプシュート（ミドルレンジ）
 */

// ==============================
// ジャンプシュート レイアップ
// ==============================

/**
 * ジャンプシュート レイアップモーション
 *
 * Y: 1.0m → 0.8m → 0.0m（頂点から着地まで）
 * 上半身: 片手でリリース
 *
 * タイミング:
 * - startupTime: 100ms = 0.1秒（シュート準備）
 * - activeTime: 200ms = 0.2秒（ボールリリース）
 * - recovery: 0.25秒（着地）
 */
const JS_LAYUP_T0 = 0.0;
const JS_LAYUP_T1 = 0.1;   // startupTime = シュート準備完了
const JS_LAYUP_T2 = 0.3;   // activeTime終了 = リリース完了
const JS_LAYUP_T3 = 0.55;  // 着地

const JUMP_SHOOT_LAYUP_JOINT_ANIMATIONS: Record<string, Record<number, number>> = {
  // 上半身: やや後傾→前傾でリリース
  upperBodyX: {[JS_LAYUP_T0]: -5, [JS_LAYUP_T1]: -10, [JS_LAYUP_T2]: 5, [JS_LAYUP_T3]: 0},
  upperBodyY: {[JS_LAYUP_T0]: 0, [JS_LAYUP_T1]: 0, [JS_LAYUP_T2]: 0, [JS_LAYUP_T3]: 0},
  upperBodyZ: {[JS_LAYUP_T0]: 0, [JS_LAYUP_T1]: 0, [JS_LAYUP_T2]: 0, [JS_LAYUP_T3]: 0},

  // 下半身: 固定
  lowerBodyX: {[JS_LAYUP_T0]: 0, [JS_LAYUP_T1]: 0, [JS_LAYUP_T2]: 0, [JS_LAYUP_T3]: 0},
  lowerBodyY: {[JS_LAYUP_T0]: 0, [JS_LAYUP_T1]: 0, [JS_LAYUP_T2]: 0, [JS_LAYUP_T3]: 0},
  lowerBodyZ: {[JS_LAYUP_T0]: 0, [JS_LAYUP_T1]: 0, [JS_LAYUP_T2]: 0, [JS_LAYUP_T3]: 0},

  // 頭: ゴールを見上げる
  headX: {[JS_LAYUP_T0]: -15, [JS_LAYUP_T1]: -20, [JS_LAYUP_T2]: -10, [JS_LAYUP_T3]: 0},
  headY: {[JS_LAYUP_T0]: 0, [JS_LAYUP_T1]: 0, [JS_LAYUP_T2]: 0, [JS_LAYUP_T3]: 0},
  headZ: {[JS_LAYUP_T0]: 0, [JS_LAYUP_T1]: 0, [JS_LAYUP_T2]: 0, [JS_LAYUP_T3]: 0},

  // 右腕: 片手で高く伸ばしてリリース
  rightShoulderX: {[JS_LAYUP_T0]: -150, [JS_LAYUP_T1]: -175, [JS_LAYUP_T2]: -160, [JS_LAYUP_T3]: -45},
  rightShoulderY: {[JS_LAYUP_T0]: 0, [JS_LAYUP_T1]: 0, [JS_LAYUP_T2]: 0, [JS_LAYUP_T3]: 0},
  rightShoulderZ: {[JS_LAYUP_T0]: 0, [JS_LAYUP_T1]: 0, [JS_LAYUP_T2]: 0, [JS_LAYUP_T3]: 0},

  rightElbowX: {[JS_LAYUP_T0]: -40, [JS_LAYUP_T1]: -20, [JS_LAYUP_T2]: -10, [JS_LAYUP_T3]: -45},
  rightElbowY: {[JS_LAYUP_T0]: 0, [JS_LAYUP_T1]: 0, [JS_LAYUP_T2]: 0, [JS_LAYUP_T3]: 0},
  rightElbowZ: {[JS_LAYUP_T0]: 0, [JS_LAYUP_T1]: 0, [JS_LAYUP_T2]: 0, [JS_LAYUP_T3]: 0},

  // 左腕: 補助→下ろす
  leftShoulderX: {[JS_LAYUP_T0]: -100, [JS_LAYUP_T1]: -110, [JS_LAYUP_T2]: -60, [JS_LAYUP_T3]: -30},
  leftShoulderY: {[JS_LAYUP_T0]: 15, [JS_LAYUP_T1]: 20, [JS_LAYUP_T2]: 10, [JS_LAYUP_T3]: 0},
  leftShoulderZ: {[JS_LAYUP_T0]: 0, [JS_LAYUP_T1]: 0, [JS_LAYUP_T2]: 0, [JS_LAYUP_T3]: 0},

  leftElbowX: {[JS_LAYUP_T0]: -50, [JS_LAYUP_T1]: -60, [JS_LAYUP_T2]: -40, [JS_LAYUP_T3]: -30},
  leftElbowY: {[JS_LAYUP_T0]: 0, [JS_LAYUP_T1]: 0, [JS_LAYUP_T2]: 0, [JS_LAYUP_T3]: 0},
  leftElbowZ: {[JS_LAYUP_T0]: 0, [JS_LAYUP_T1]: 0, [JS_LAYUP_T2]: 0, [JS_LAYUP_T3]: 0},

  // 脚: 空中→着地
  leftHipX: {[JS_LAYUP_T0]: -30, [JS_LAYUP_T1]: -20, [JS_LAYUP_T2]: -30, [JS_LAYUP_T3]: -30},
  leftHipY: {[JS_LAYUP_T0]: 0, [JS_LAYUP_T1]: 0, [JS_LAYUP_T2]: 0, [JS_LAYUP_T3]: 0},
  leftHipZ: {[JS_LAYUP_T0]: 0, [JS_LAYUP_T1]: 0, [JS_LAYUP_T2]: 0, [JS_LAYUP_T3]: 0},

  rightHipX: {[JS_LAYUP_T0]: -60, [JS_LAYUP_T1]: -70, [JS_LAYUP_T2]: -50, [JS_LAYUP_T3]: -30},
  rightHipY: {[JS_LAYUP_T0]: 0, [JS_LAYUP_T1]: 0, [JS_LAYUP_T2]: 0, [JS_LAYUP_T3]: 0},
  rightHipZ: {[JS_LAYUP_T0]: 0, [JS_LAYUP_T1]: 0, [JS_LAYUP_T2]: 0, [JS_LAYUP_T3]: 0},

  leftKneeX: {[JS_LAYUP_T0]: 20, [JS_LAYUP_T1]: 15, [JS_LAYUP_T2]: 30, [JS_LAYUP_T3]: 50},
  leftKneeY: {[JS_LAYUP_T0]: 0, [JS_LAYUP_T1]: 0, [JS_LAYUP_T2]: 0, [JS_LAYUP_T3]: 0},
  leftKneeZ: {[JS_LAYUP_T0]: 0, [JS_LAYUP_T1]: 0, [JS_LAYUP_T2]: 0, [JS_LAYUP_T3]: 0},

  rightKneeX: {[JS_LAYUP_T0]: 80, [JS_LAYUP_T1]: 85, [JS_LAYUP_T2]: 60, [JS_LAYUP_T3]: 50},
  rightKneeY: {[JS_LAYUP_T0]: 0, [JS_LAYUP_T1]: 0, [JS_LAYUP_T2]: 0, [JS_LAYUP_T3]: 0},
  rightKneeZ: {[JS_LAYUP_T0]: 0, [JS_LAYUP_T1]: 0, [JS_LAYUP_T2]: 0, [JS_LAYUP_T3]: 0},
};

const JUMP_SHOOT_LAYUP_POSITION_ANIMATIONS: Record<string, Record<number, number>> = {
  x: {[JS_LAYUP_T0]: 0, [JS_LAYUP_T1]: 0, [JS_LAYUP_T2]: 0, [JS_LAYUP_T3]: 0},
  y: {[JS_LAYUP_T0]: 1.0, [JS_LAYUP_T1]: 0.8, [JS_LAYUP_T2]: 0.4, [JS_LAYUP_T3]: 0},
  z: {[JS_LAYUP_T0]: 0, [JS_LAYUP_T1]: 0, [JS_LAYUP_T2]: 0, [JS_LAYUP_T3]: 0},
};

export const JUMP_SHOOT_LAYUP_MOTION: MotionData = {
  name: "jump_shoot_layup",
  duration: JS_LAYUP_T3,
  loop: false,
  keyframes: buildKeyframes(JUMP_SHOOT_LAYUP_JOINT_ANIMATIONS, JUMP_SHOOT_LAYUP_POSITION_ANIMATIONS),
  jumpPhysics: {
    liftoffTime: 0.0,
    peakTime: 0.0,       // 頂点から開始（下降のみ）
    landingTime: 0.55,
    peakHeight: 1.0,
    hangTime: 0.12,      // startup中は頂点に滞空 → ボールリリースは頂点で
  },
};

export const JUMP_SHOOT_LAYUP_MOTION_CONFIG: MotionConfig = {
  motionData: JUMP_SHOOT_LAYUP_MOTION,
  isDefault: false,
  blendDuration: 0.1,
  priority: 45,
  interruptible: false,
};

// ==============================
// ジャンプシュート ダンク
// ==============================

/**
 * ジャンプシュート ダンクモーション
 *
 * Y: 1.5m → 1.2m → 0.0m（頂点から着地まで）
 * 上半身: 叩きつけ
 *
 * タイミング:
 * - startupTime: 100ms = 0.1秒
 * - activeTime: 200ms = 0.2秒
 * - recovery: 0.3秒
 */
const JS_DUNK_T0 = 0.0;
const JS_DUNK_T1 = 0.1;   // startupTime
const JS_DUNK_T2 = 0.3;   // activeTime終了
const JS_DUNK_T3 = 0.6;   // 着地

const JUMP_SHOOT_DUNK_JOINT_ANIMATIONS: Record<string, Record<number, number>> = {
  // 上半身: 後傾→叩きつけで大きく前傾
  upperBodyX: {[JS_DUNK_T0]: -15, [JS_DUNK_T1]: -10, [JS_DUNK_T2]: 35, [JS_DUNK_T3]: 5},
  upperBodyY: {[JS_DUNK_T0]: 0, [JS_DUNK_T1]: 0, [JS_DUNK_T2]: 0, [JS_DUNK_T3]: 0},
  upperBodyZ: {[JS_DUNK_T0]: 0, [JS_DUNK_T1]: 0, [JS_DUNK_T2]: 0, [JS_DUNK_T3]: 0},

  lowerBodyX: {[JS_DUNK_T0]: 0, [JS_DUNK_T1]: 0, [JS_DUNK_T2]: 0, [JS_DUNK_T3]: 0},
  lowerBodyY: {[JS_DUNK_T0]: 0, [JS_DUNK_T1]: 0, [JS_DUNK_T2]: 0, [JS_DUNK_T3]: 0},
  lowerBodyZ: {[JS_DUNK_T0]: 0, [JS_DUNK_T1]: 0, [JS_DUNK_T2]: 0, [JS_DUNK_T3]: 0},

  // 頭: リムを見る→叩きつけ時に下を見る
  headX: {[JS_DUNK_T0]: -25, [JS_DUNK_T1]: -20, [JS_DUNK_T2]: 20, [JS_DUNK_T3]: 0},
  headY: {[JS_DUNK_T0]: 0, [JS_DUNK_T1]: 0, [JS_DUNK_T2]: 0, [JS_DUNK_T3]: 0},
  headZ: {[JS_DUNK_T0]: 0, [JS_DUNK_T1]: 0, [JS_DUNK_T2]: 0, [JS_DUNK_T3]: 0},

  // 右腕: 振り上げ→力強く叩きつけ
  rightShoulderX: {[JS_DUNK_T0]: -180, [JS_DUNK_T1]: -175, [JS_DUNK_T2]: -70, [JS_DUNK_T3]: -45},
  rightShoulderY: {[JS_DUNK_T0]: 0, [JS_DUNK_T1]: 0, [JS_DUNK_T2]: 0, [JS_DUNK_T3]: 0},
  rightShoulderZ: {[JS_DUNK_T0]: -15, [JS_DUNK_T1]: -10, [JS_DUNK_T2]: 10, [JS_DUNK_T3]: 0},

  rightElbowX: {[JS_DUNK_T0]: -20, [JS_DUNK_T1]: -15, [JS_DUNK_T2]: -40, [JS_DUNK_T3]: -45},
  rightElbowY: {[JS_DUNK_T0]: 0, [JS_DUNK_T1]: 0, [JS_DUNK_T2]: 0, [JS_DUNK_T3]: 0},
  rightElbowZ: {[JS_DUNK_T0]: 0, [JS_DUNK_T1]: 0, [JS_DUNK_T2]: 0, [JS_DUNK_T3]: 0},

  // 左腕: 補助→叩きつけ
  leftShoulderX: {[JS_DUNK_T0]: -170, [JS_DUNK_T1]: -165, [JS_DUNK_T2]: -60, [JS_DUNK_T3]: -45},
  leftShoulderY: {[JS_DUNK_T0]: 0, [JS_DUNK_T1]: 0, [JS_DUNK_T2]: 0, [JS_DUNK_T3]: 0},
  leftShoulderZ: {[JS_DUNK_T0]: 15, [JS_DUNK_T1]: 10, [JS_DUNK_T2]: -10, [JS_DUNK_T3]: 0},

  leftElbowX: {[JS_DUNK_T0]: -25, [JS_DUNK_T1]: -20, [JS_DUNK_T2]: -35, [JS_DUNK_T3]: -45},
  leftElbowY: {[JS_DUNK_T0]: 0, [JS_DUNK_T1]: 0, [JS_DUNK_T2]: 0, [JS_DUNK_T3]: 0},
  leftElbowZ: {[JS_DUNK_T0]: 0, [JS_DUNK_T1]: 0, [JS_DUNK_T2]: 0, [JS_DUNK_T3]: 0},

  // 脚: 空中で膝を曲げる→着地
  leftHipX: {[JS_DUNK_T0]: -40, [JS_DUNK_T1]: -35, [JS_DUNK_T2]: -45, [JS_DUNK_T3]: -30},
  leftHipY: {[JS_DUNK_T0]: 0, [JS_DUNK_T1]: 0, [JS_DUNK_T2]: 0, [JS_DUNK_T3]: 0},
  leftHipZ: {[JS_DUNK_T0]: 0, [JS_DUNK_T1]: 0, [JS_DUNK_T2]: 0, [JS_DUNK_T3]: 0},

  rightHipX: {[JS_DUNK_T0]: -65, [JS_DUNK_T1]: -60, [JS_DUNK_T2]: -50, [JS_DUNK_T3]: -30},
  rightHipY: {[JS_DUNK_T0]: 0, [JS_DUNK_T1]: 0, [JS_DUNK_T2]: 0, [JS_DUNK_T3]: 0},
  rightHipZ: {[JS_DUNK_T0]: 0, [JS_DUNK_T1]: 0, [JS_DUNK_T2]: 0, [JS_DUNK_T3]: 0},

  leftKneeX: {[JS_DUNK_T0]: 50, [JS_DUNK_T1]: 45, [JS_DUNK_T2]: 60, [JS_DUNK_T3]: 50},
  leftKneeY: {[JS_DUNK_T0]: 0, [JS_DUNK_T1]: 0, [JS_DUNK_T2]: 0, [JS_DUNK_T3]: 0},
  leftKneeZ: {[JS_DUNK_T0]: 0, [JS_DUNK_T1]: 0, [JS_DUNK_T2]: 0, [JS_DUNK_T3]: 0},

  rightKneeX: {[JS_DUNK_T0]: 85, [JS_DUNK_T1]: 80, [JS_DUNK_T2]: 70, [JS_DUNK_T3]: 50},
  rightKneeY: {[JS_DUNK_T0]: 0, [JS_DUNK_T1]: 0, [JS_DUNK_T2]: 0, [JS_DUNK_T3]: 0},
  rightKneeZ: {[JS_DUNK_T0]: 0, [JS_DUNK_T1]: 0, [JS_DUNK_T2]: 0, [JS_DUNK_T3]: 0},
};

const JUMP_SHOOT_DUNK_POSITION_ANIMATIONS: Record<string, Record<number, number>> = {
  x: {[JS_DUNK_T0]: 0, [JS_DUNK_T1]: 0, [JS_DUNK_T2]: 0, [JS_DUNK_T3]: 0},
  y: {[JS_DUNK_T0]: 1.5, [JS_DUNK_T1]: 1.2, [JS_DUNK_T2]: 0.5, [JS_DUNK_T3]: 0},
  z: {[JS_DUNK_T0]: 0, [JS_DUNK_T1]: 0, [JS_DUNK_T2]: 0, [JS_DUNK_T3]: 0},
};

export const JUMP_SHOOT_DUNK_MOTION: MotionData = {
  name: "jump_shoot_dunk",
  duration: JS_DUNK_T3,
  loop: false,
  keyframes: buildKeyframes(JUMP_SHOOT_DUNK_JOINT_ANIMATIONS, JUMP_SHOOT_DUNK_POSITION_ANIMATIONS),
  jumpPhysics: {
    liftoffTime: 0.0,
    peakTime: 0.0,       // 頂点から開始（下降のみ）
    landingTime: 0.6,
    peakHeight: 1.5,
    hangTime: 0.12,      // startup中は頂点に滞空 → ボールリリースは頂点で
  },
};

export const JUMP_SHOOT_DUNK_MOTION_CONFIG: MotionConfig = {
  motionData: JUMP_SHOOT_DUNK_MOTION,
  isDefault: false,
  blendDuration: 0.1,
  priority: 45,
  interruptible: false,
};

// ==============================
// ジャンプシュート ミドル
// ==============================

/**
 * ジャンプシュート ミドルモーション
 *
 * Y: 0.8m → 0.5m → 0.0m（頂点から着地まで）
 * 上半身: 通常のジャンプシュートフォーム
 *
 * タイミング:
 * - startupTime: 100ms = 0.1秒
 * - activeTime: 200ms = 0.2秒
 * - recovery: 0.2秒
 */
const JS_MID_T0 = 0.0;
const JS_MID_T1 = 0.1;   // startupTime
const JS_MID_T2 = 0.3;   // activeTime終了
const JS_MID_T3 = 0.5;   // 着地

const JUMP_SHOOT_MID_JOINT_ANIMATIONS: Record<string, Record<number, number>> = {
  // 上半身: やや後傾からフォロースルー
  upperBodyX: {[JS_MID_T0]: -10, [JS_MID_T1]: -15, [JS_MID_T2]: 5, [JS_MID_T3]: 0},
  upperBodyY: {[JS_MID_T0]: 0, [JS_MID_T1]: 0, [JS_MID_T2]: 0, [JS_MID_T3]: 0},
  upperBodyZ: {[JS_MID_T0]: 0, [JS_MID_T1]: 0, [JS_MID_T2]: 0, [JS_MID_T3]: 0},

  lowerBodyX: {[JS_MID_T0]: 0, [JS_MID_T1]: 0, [JS_MID_T2]: 0, [JS_MID_T3]: 0},
  lowerBodyY: {[JS_MID_T0]: 0, [JS_MID_T1]: 0, [JS_MID_T2]: 0, [JS_MID_T3]: 0},
  lowerBodyZ: {[JS_MID_T0]: 0, [JS_MID_T1]: 0, [JS_MID_T2]: 0, [JS_MID_T3]: 0},

  // 頭: ゴールを見る
  headX: {[JS_MID_T0]: -10, [JS_MID_T1]: -15, [JS_MID_T2]: -5, [JS_MID_T3]: 0},
  headY: {[JS_MID_T0]: 0, [JS_MID_T1]: 0, [JS_MID_T2]: 0, [JS_MID_T3]: 0},
  headZ: {[JS_MID_T0]: 0, [JS_MID_T1]: 0, [JS_MID_T2]: 0, [JS_MID_T3]: 0},

  // 右腕: シュートフォーム→リリース→フォロースルー
  rightShoulderX: {[JS_MID_T0]: -140, [JS_MID_T1]: -165, [JS_MID_T2]: -170, [JS_MID_T3]: -30},
  rightShoulderY: {[JS_MID_T0]: 0, [JS_MID_T1]: 0, [JS_MID_T2]: 0, [JS_MID_T3]: 0},
  rightShoulderZ: {[JS_MID_T0]: 0, [JS_MID_T1]: 0, [JS_MID_T2]: 0, [JS_MID_T3]: 0},

  rightElbowX: {[JS_MID_T0]: -90, [JS_MID_T1]: -100, [JS_MID_T2]: -15, [JS_MID_T3]: -30},
  rightElbowY: {[JS_MID_T0]: 0, [JS_MID_T1]: 0, [JS_MID_T2]: 0, [JS_MID_T3]: 0},
  rightElbowZ: {[JS_MID_T0]: 0, [JS_MID_T1]: 0, [JS_MID_T2]: 0, [JS_MID_T3]: 0},

  // 左腕: ガイドハンド
  leftShoulderX: {[JS_MID_T0]: -100, [JS_MID_T1]: -115, [JS_MID_T2]: -50, [JS_MID_T3]: -30},
  leftShoulderY: {[JS_MID_T0]: 20, [JS_MID_T1]: 25, [JS_MID_T2]: 10, [JS_MID_T3]: 0},
  leftShoulderZ: {[JS_MID_T0]: 0, [JS_MID_T1]: 0, [JS_MID_T2]: 0, [JS_MID_T3]: 0},

  leftElbowX: {[JS_MID_T0]: -60, [JS_MID_T1]: -70, [JS_MID_T2]: -35, [JS_MID_T3]: -30},
  leftElbowY: {[JS_MID_T0]: 0, [JS_MID_T1]: 0, [JS_MID_T2]: 0, [JS_MID_T3]: 0},
  leftElbowZ: {[JS_MID_T0]: 0, [JS_MID_T1]: 0, [JS_MID_T2]: 0, [JS_MID_T3]: 0},

  // 脚: 空中→着地
  leftHipX: {[JS_MID_T0]: -15, [JS_MID_T1]: -10, [JS_MID_T2]: -20, [JS_MID_T3]: -30},
  leftHipY: {[JS_MID_T0]: 0, [JS_MID_T1]: 0, [JS_MID_T2]: 0, [JS_MID_T3]: 0},
  leftHipZ: {[JS_MID_T0]: 0, [JS_MID_T1]: 0, [JS_MID_T2]: 0, [JS_MID_T3]: 0},

  rightHipX: {[JS_MID_T0]: -15, [JS_MID_T1]: -10, [JS_MID_T2]: -20, [JS_MID_T3]: -30},
  rightHipY: {[JS_MID_T0]: 0, [JS_MID_T1]: 0, [JS_MID_T2]: 0, [JS_MID_T3]: 0},
  rightHipZ: {[JS_MID_T0]: 0, [JS_MID_T1]: 0, [JS_MID_T2]: 0, [JS_MID_T3]: 0},

  leftKneeX: {[JS_MID_T0]: 20, [JS_MID_T1]: 15, [JS_MID_T2]: 35, [JS_MID_T3]: 50},
  leftKneeY: {[JS_MID_T0]: 0, [JS_MID_T1]: 0, [JS_MID_T2]: 0, [JS_MID_T3]: 0},
  leftKneeZ: {[JS_MID_T0]: 0, [JS_MID_T1]: 0, [JS_MID_T2]: 0, [JS_MID_T3]: 0},

  rightKneeX: {[JS_MID_T0]: 20, [JS_MID_T1]: 15, [JS_MID_T2]: 35, [JS_MID_T3]: 50},
  rightKneeY: {[JS_MID_T0]: 0, [JS_MID_T1]: 0, [JS_MID_T2]: 0, [JS_MID_T3]: 0},
  rightKneeZ: {[JS_MID_T0]: 0, [JS_MID_T1]: 0, [JS_MID_T2]: 0, [JS_MID_T3]: 0},
};

const JUMP_SHOOT_MID_POSITION_ANIMATIONS: Record<string, Record<number, number>> = {
  x: {[JS_MID_T0]: 0, [JS_MID_T1]: 0, [JS_MID_T2]: 0, [JS_MID_T3]: 0},
  y: {[JS_MID_T0]: 0.8, [JS_MID_T1]: 0.5, [JS_MID_T2]: 0.2, [JS_MID_T3]: 0},
  z: {[JS_MID_T0]: 0, [JS_MID_T1]: 0, [JS_MID_T2]: 0, [JS_MID_T3]: 0},
};

export const JUMP_SHOOT_MID_MOTION: MotionData = {
  name: "jump_shoot_mid",
  duration: JS_MID_T3,
  loop: false,
  keyframes: buildKeyframes(JUMP_SHOOT_MID_JOINT_ANIMATIONS, JUMP_SHOOT_MID_POSITION_ANIMATIONS),
  jumpPhysics: {
    liftoffTime: 0.0,
    peakTime: 0.0,       // 頂点から開始（下降のみ）
    landingTime: 0.5,
    peakHeight: 0.8,
    hangTime: 0.12,      // startup中は頂点に滞空 → ボールリリースは頂点で
  },
};

export const JUMP_SHOOT_MID_MOTION_CONFIG: MotionConfig = {
  motionData: JUMP_SHOOT_MID_MOTION,
  isDefault: false,
  blendDuration: 0.1,
  priority: 45,
  interruptible: false,
};

// ==============================
// エクスポート
// ==============================

export const JUMP_SHOOT_MOTIONS = {
  jump_shoot_layup: JUMP_SHOOT_LAYUP_MOTION,
  jump_shoot_dunk: JUMP_SHOOT_DUNK_MOTION,
  jump_shoot_mid: JUMP_SHOOT_MID_MOTION,
};
