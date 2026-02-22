/**
 * MotionData → MotionDefinition 変換ユーティリティ
 *
 * MotionData（ゲームモード）:
 *   keyframes: [{ time, joints: { leftShoulder: {x,y,z}, ... }, position? }]
 *   角度は度、時間は秒
 *
 * MotionDefinition（テストシーン / MotionPlayer）:
 *   joints: { "leftShoulderX": { 0: 0, 0.5: -30 }, ... }
 *   角度は度、時間は秒
 *
 * 変換することで、ゲームのモーションデータをテストシーンの MotionPlayer で
 * プレビューしたり、createSingleMotionPoseData() でクォータニオン変換できる。
 *
 * ジョイント名は MotionData のまま出力される（upperBody, lowerBody, head 等）。
 * AnimationFactory の JOINT_TO_BONE にこれらのエントリが追加されているため、
 * createSingleMotionPoseData() で正しく spine2, hips, head ボーンに変換される。
 */
import {
  MotionData,
  KeyframeJoints,
  JointRotation,
} from "@/GamePlay/GameSystem/CharacterMove/Types/MotionTypes";
import {
  MotionDefinition,
  MotionJointData,
  JointKeyframes,
} from "@/GamePlay/GameSystem/CharacterMove/MotionEngine/MotionDefinitionTypes";
import { STANDING_POSE_OFFSETS } from "@/GamePlay/GameSystem/CharacterMove/MotionEngine/AnimationFactory";

/** KeyframeJoints の全ジョイント名 */
const ALL_JOINT_NAMES: (keyof KeyframeJoints)[] = [
  "upperBody", "lowerBody", "head",
  "leftShoulder", "rightShoulder", "leftElbow", "rightElbow",
  "leftHip", "rightHip", "leftKnee", "rightKnee",
  "leftFoot", "rightFoot",
];

/**
 * MotionData → MotionDefinition に変換する。
 *
 * ゲームモードの KeyframeJoints（時間×ジョイント行列）を
 * MotionDefinition のジョイント+軸ごとのキーフレーム形式に変換する。
 * 全キーフレームで値が 0 の軸は省略される。
 *
 * MotionData の角度はレスト姿勢基準（直立オフセット込み）。
 * MotionDefinition の角度は直立姿勢基準（0° = 直立）。
 * → 変換時に STANDING_POSE_OFFSETS を減算する。
 *
 * 注: position データは MotionDefinition に含まれない（FK のみ）。
 */
export function motionDataToDefinition(data: MotionData): MotionDefinition {
  const joints: MotionJointData = {};
  const axisCollector = new Map<string, Map<number, number>>();

  for (const keyframe of data.keyframes) {
    for (const jointName of ALL_JOINT_NAMES) {
      const rotation = keyframe.joints[jointName];
      if (!rotation) continue;

      const standing = STANDING_POSE_OFFSETS[jointName];
      for (const axis of ["X", "Y", "Z"] as const) {
        const key = `${jointName}${axis}`;
        if (!axisCollector.has(key)) axisCollector.set(key, new Map());
        const value = rotation[axis.toLowerCase() as keyof JointRotation];
        const standingValue = standing?.[axis.toLowerCase() as "x" | "y" | "z"] ?? 0;
        axisCollector.get(key)!.set(keyframe.time, value - standingValue);
      }
    }
  }

  for (const [key, timeValues] of axisCollector) {
    const hasNonZero = Array.from(timeValues.values()).some((v) => v !== 0);
    if (!hasNonZero) continue;

    const kf: JointKeyframes = {};
    for (const [time, value] of timeValues) {
      kf[time] = value;
    }
    joints[key] = kf;
  }

  return {
    name: data.name,
    duration: data.duration,
    joints,
  };
}

