/**
 * MotionData（ゲーム形式）→ MotionDefinition（Viewer形式）変換
 *
 * ゲームモーション（CharacterMove/Motion/*.ts）を
 * CharacterMotion Viewer の MotionDefinition 形式に変換し、
 * モーションプレビューページで GLB + ProceduralHumanoid 両方で再生可能にする。
 */
import { MotionData, KeyframeJoints } from "@/GamePlay/GameSystem/CharacterMove/Types/MotionTypes";
import { MotionDefinition, MotionJointData } from "@/GamePlay/GameSystem/CharacterMove/MotionEngine/MotionDefinitionTypes";

/** ゲーム形式の関節名 → Viewer形式の関節名 */
const JOINT_NAME_MAP: Record<keyof KeyframeJoints, string> = {
  upperBody: "spine",
  lowerBody: "hips",
  head: "head",
  leftShoulder: "leftShoulder",
  rightShoulder: "rightShoulder",
  leftElbow: "leftElbow",
  rightElbow: "rightElbow",
  leftHip: "leftHip",
  rightHip: "rightHip",
  leftKnee: "leftKnee",
  rightKnee: "rightKnee",
};

/**
 * MotionData（ゲーム形式）を MotionDefinition（Viewer形式）に変換する。
 * 位置オフセット（ジャンプ高さ等）は MotionDefinition 形式に存在しないため無視される。
 */
export function motionDataToDefinition(motionData: MotionData): MotionDefinition {
  const allJointData: Record<string, Record<number, number>> = {};

  for (const kf of motionData.keyframes) {
    for (const [mdName, defName] of Object.entries(JOINT_NAME_MAP)) {
      const joint = kf.joints[mdName as keyof KeyframeJoints];
      if (!joint) continue;
      for (const axis of ["x", "y", "z"] as const) {
        const key = `${defName}${axis.toUpperCase()}`;
        if (!allJointData[key]) allJointData[key] = {};
        allJointData[key][kf.time] = joint[axis];
      }
    }
  }

  // 全キーフレームでゼロのエントリを除外
  const joints: MotionJointData = {};
  for (const [key, data] of Object.entries(allJointData)) {
    if (Object.values(data).some(v => v !== 0)) {
      joints[key] = data;
    }
  }

  return { name: motionData.name, duration: motionData.duration, joints };
}
