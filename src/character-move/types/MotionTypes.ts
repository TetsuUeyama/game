/**
 * モーション関連の型定義
 */

/**
 * 関節の回転データ（度数法）
 */
export interface JointRotation {
  x: number; // X軸回転（度）
  y: number; // Y軸回転（度）
  z: number; // Z軸回転（度）
}

/**
 * 位置オフセット（メートル）
 */
export interface PositionOffset {
  x: number; // X軸方向のオフセット
  y: number; // Y軸方向のオフセット（ジャンプの高さなど）
  z: number; // Z軸方向のオフセット
}

/**
 * キーフレーム内の各関節の状態
 */
export interface KeyframeJoints {
  // 上半身
  upperBody?: JointRotation;
  lowerBody?: JointRotation;
  head?: JointRotation;

  // 腕
  leftShoulder?: JointRotation;
  rightShoulder?: JointRotation;
  leftElbow?: JointRotation;
  rightElbow?: JointRotation;

  // 脚
  leftHip?: JointRotation;
  rightHip?: JointRotation;
  leftKnee?: JointRotation;
  rightKnee?: JointRotation;
}

/**
 * キーフレームデータ
 */
export interface Keyframe {
  time: number; // このキーフレームの時間（秒）
  joints: KeyframeJoints; // 各関節の状態
  position?: PositionOffset; // 位置オフセット（オプション、ジャンプなど）
}

/**
 * 部位の優先度設定
 */
export interface JointPriority {
  jointName: keyof KeyframeJoints;
  priority: number; // 値が大きいほど優先度が高い
}

/**
 * モーションデータ
 */
export interface MotionData {
  name: string; // モーション名
  duration: number; // 全体の再生時間（秒）
  loop: boolean; // ループ再生するか
  keyframes: Keyframe[]; // キーフレームの配列
  priorities?: JointPriority[]; // 部位の優先度（オプション）
}

/**
 * モーション設定（拡張版）
 */
export interface MotionConfig {
  motionData: MotionData; // モーションデータ
  isDefault?: boolean; // デフォルトモーション（停止時に自動的に戻る）
  blendDuration?: number; // ブレンド時間（秒、デフォルト: 0.3）
  priority?: number; // 優先度（値が大きいほど優先、デフォルト: 0）
  interruptible?: boolean; // 他のモーションで中断可能か（デフォルト: true）
}

/**
 * モーション再生状態
 */
export interface MotionState {
  isPlaying: boolean; // 再生中か
  currentTime: number; // 現在の再生時間
  currentMotion: MotionData | null; // 現在のモーション
  speed: number; // 再生速度（1.0が標準）
  // ブレンディング情報
  isBlending: boolean; // ブレンド中か
  blendTime: number; // ブレンド経過時間
  blendDuration: number; // ブレンド時間（秒）
  previousJoints: KeyframeJoints | null; // 前のモーションの関節状態
  previousPosition: PositionOffset | null; // 前のモーションの位置
  nextMotion: MotionData | null; // 次のモーション（ブレンド先）
  // 位置オフセット追跡
  lastAppliedPosition: PositionOffset | null; // 最後に適用した位置オフセット
  basePosition: PositionOffset | null; // モーション開始時の基準位置
  positionScale: number; // 位置オフセットのスケール（1.0が標準）
}
