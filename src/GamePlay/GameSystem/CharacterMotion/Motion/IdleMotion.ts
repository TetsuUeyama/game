import { MotionDefinition } from "@/GamePlay/GameSystem/CharacterMotion/Motion/MotionTypes";

/**
 * アイドル（呼吸）モーション
 *
 * 3秒サイクル（90フレーム @ 30fps）
 * 微かな呼吸の動きと体の揺れを表現する。
 *
 * 値はレスト姿勢からのオフセット（度）:
 *   0° = レスト姿勢のまま
 *   正の値 = 各軸の正方向に回転
 *
 * 時間(秒): 0 → 0.733 → 1.5 → 2.233 → 3.0
 * フレーム: 0 →  22   →  45  →   67   →  90
 */

export const IDLE_MOTION: MotionDefinition = {
  name: "idle",
  duration: 3.0,
  joints: {
    // ── Hips: 左右に微かな揺れ（Y軸） ──
    hipsY: { 0: 0, 0.733: 5, 1.5: 0, 2.233: -5, 3.0: 0 },

    // ── Spine: 呼吸による微かな前傾（X）と左右揺れ（Z） ──
    spineX: { 0: 0, 0.733: 2, 1.5: 0, 2.233: 2, 3.0: 0 },
    spineZ: { 0: 0, 0.733: 0.57, 1.5: 0, 2.233: -0.57, 3.0: 0 },

    // ── 脚: レスト姿勢（オフセットなし） ──
    // 明示的に 0 を記述（motionToPoseKeys が処理する）

    // ── 左上腕: 呼吸に合わせた前後揺れ（X軸） ──
    leftShoulderX: { 0: 0, 0.733: 5, 1.5: 0, 2.233: -5, 3.0: 0 },

    // ── 右上腕: 左と逆位相の揺れ ──
    rightShoulderX: { 0: 0, 0.733: -5, 1.5: 0, 2.233: 5, 3.0: 0 },
  },

  // Rigify T-pose → 自然な立ち姿勢への静的オフセット
  // 腕を下ろす（Z軸）、前腕を軽く曲げる（X軸）
  rigifyAdjustments: {
    leftShoulderZ: -28.78,   // 左腕を真下に下ろす
    rightShoulderZ: 28.78,   // 右腕を真下に下ろす
    leftElbowX: -8.59,        // 左前腕を軽く曲げる
    rightElbowX: -8.59,       // 右前腕を軽く曲げる
  },
};
