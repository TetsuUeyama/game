import { MIXAMO_BONE_NAMES } from "@/GamePlay/GameSystem/CharacterModel/Types/CharacterMotionConfig";

const B = MIXAMO_BONE_NAMES;

/**
 * ゲームのキャラクター（CharacterBodyBuilder）用ジョイント名 ↔ ボーン名マッピング
 *
 * CharacterBodyBuilder の getJoint() 名 → Skeleton のボーン名（MIXAMO_BONE_NAMES）
 */
export const JOINT_TO_BONE: Record<string, string> = {
  upperBody:     B.spine2,       // waistJoint → Spine2
  lowerBody:     B.hips,         // lowerBodyConnection → Hips
  head:          B.head,
  leftShoulder:  B.leftArm,       // leftShoulder joint → LeftArm bone（テストシーンと同じマッピング）
  rightShoulder: B.rightArm,
  leftElbow:     B.leftForeArm,  // leftElbow joint → LeftForeArm bone
  rightElbow:    B.rightForeArm,
  leftHip:       B.leftUpLeg,    // leftHip joint → LeftUpLeg bone
  rightHip:      B.rightUpLeg,
  leftKnee:      B.leftLeg,      // leftKnee joint → LeftLeg bone
  rightKnee:     B.rightLeg,
};
