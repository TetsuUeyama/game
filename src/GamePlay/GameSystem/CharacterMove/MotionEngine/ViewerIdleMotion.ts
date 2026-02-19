import { MotionDefinition } from "./MotionDefinitionTypes";

/**
 * アイドル（呼吸）モーション
 *
 * ゲームの IdleMotion.ts と同じ呼吸パターン。
 * 2秒サイクル（60フレーム @ 30fps）
 *
 * 値は直立姿勢からのオフセット（度）:
 *   0° = 自然な直立姿勢（STANDING_POSE_OFFSETS が自動適用される）
 *   正の値 = 各軸の正方向に回転
 *
 * ゲーム IdleMotion を motionDataToDefinition() で変換した結果と同一。
 * STANDING_POSE_OFFSETS に含まれる定数値（腕・脚の角度）は
 * パイプラインで自動加算されるため、ここには呼吸アニメーションのみ記述。
 *
 * 時間(秒): 0 → 0.5 → 1.0 → 1.5 → 2.0
 * フレーム: 0 →  15  →  30  →  45  →  60
 */

export const IDLE_MOTION: MotionDefinition = {
  name: "idle",
  duration: 2.0,
  joints: {
    // ── 上半身: 呼吸による微かな前傾（X軸） ──
    upperBodyX: { 0: 0, 0.5: 2, 1.0: 0, 1.5: 0, 2.0: 0 },

    // ── 下半身(Hips): 左右に微かな揺れ（Y軸） ──
    lowerBodyY: { 0: 0, 0.5: 5, 1.0: 0, 1.5: -5, 2.0: 0 },

    // ── 頭: 微かなうなずき（X軸） ──
    headX: { 0: 0, 0.5: -1, 1.0: 0, 1.5: 0, 2.0: 0 },

    // ── 左上腕: 呼吸に合わせた前後揺れ（X軸） ──
    leftShoulderX: { 0: 0, 0.5: 5, 1.0: 0, 1.5: -5, 2.0: 0 },

    // ── 右上腕: 左と逆位相の揺れ ──
    rightShoulderX: { 0: 0, 0.5: -5, 1.0: 0, 1.5: 5, 2.0: 0 },
  },

  // Rigify T-pose → 自然な立ち姿勢への静的オフセット
  // 診断テスト: 極端な値で PoseBlender の動作確認
  rigifyAdjustments: {
    leftShoulderZ: -90,      // テスト: 極端な値（T-pose から腕を真下まで回転）
    rightShoulderZ: 90,      // テスト: 極端な値
    leftElbowX: -45,          // テスト: 極端な値
    rightElbowX: -45,         // テスト: 極端な値
  },
};
