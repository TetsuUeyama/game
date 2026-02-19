/**
 * character-motion 用モーションデータ型定義
 *
 * character-move/motion と同じパターン:
 * - 角度: 度（°）で記述（直感的に調整可能）
 * - 時間: 秒で記述
 * - 値: 直立姿勢からのオフセット（0° = 自然な直立姿勢）
 *   ※ STANDING_POSE_OFFSETS が motionToEulerKeys() で自動加算される
 */

/** 時間(秒) → 角度(度) のキーフレーム */
export type JointKeyframes = Record<number, number>;

/**
 * 関節名+軸 → キーフレーム
 * 例: "leftShoulderX", "hipsY", "leftKneeX"
 */
export interface MotionJointData {
  [jointAxis: string]: JointKeyframes;
}

/**
 * モーション定義
 */
export interface MotionDefinition {
  name: string;
  /** 1サイクルの長さ（秒） */
  duration: number;
  /** 関節アニメーションデータ（全リグ共通のオフセット） */
  joints: MotionJointData;
  /**
   * Rigify T-pose 用の静的オフセット（度）
   * 例: 腕を下ろす、前腕を軽く曲げる等
   * 指定された関節+軸の全キーフレームに加算される
   */
  rigifyAdjustments?: Record<string, number>;
  /**
   * true の場合、このモーションは idle に対する差分として扱われる。
   * 値は「idle の上に加算される追加回転（度）」を意味する。
   * PoseBlender: idle * Slerp(Identity, delta, weight)
   * MotionPlayer: idle ポーズ + delta を合成して再生
   */
  isDelta?: boolean;
}
