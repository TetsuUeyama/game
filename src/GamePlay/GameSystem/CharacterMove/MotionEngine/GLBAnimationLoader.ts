/**
 * GLB ファイルからアニメーションを読み込み、MotionDefinition に変換するローダー。
 *
 * 用途: Mixamo 等から取得した FBX を Blender で GLB にエクスポートし、
 *       モーションチェックモードでプレビューする。
 *
 * 変換パイプライン:
 *   GLB AnimationGroup → ボーン回転キーフレーム抽出
 *   → restQ⁻¹ × animQ → Euler(度) → STANDING_POSE_OFFSETS 減算
 *   → MotionDefinition
 *
 * 制約:
 *   - 左右対称補正（corrections）は無視（概算値）
 *   - Mixamo リグを前提（detectRigType → findAllBones で自動判別）
 *   - 位置アニメーションは無視（FK 回転のみ）
 */
import { Scene, Bone, Quaternion } from "@babylonjs/core";
import { SceneLoader } from "@babylonjs/core/Loading/sceneLoader";
import "@babylonjs/loaders/glTF";
import { MotionDefinition, MotionJointData } from "@/GamePlay/GameSystem/CharacterMove/MotionEngine/MotionDefinitionTypes";
import {
  FoundBones,
  detectRigType,
  findAllBones,
  STANDING_POSE_OFFSETS,
} from "@/GamePlay/GameSystem/CharacterMove/MotionEngine/AnimationFactory";

const RAD_TO_DEG = 180 / Math.PI;

/**
 * FoundBones のキー → MotionDefinition のジョイント名
 * (JOINT_TO_BONE の逆引き、1対1 で使うもののみ)
 */
const BONE_KEY_TO_JOINT: Partial<Record<keyof FoundBones, string>> = {
  hips: "lowerBody",
  spine2: "upperBody",
  head: "head",
  lArm: "leftShoulder",
  rArm: "rightShoulder",
  lForeArm: "leftElbow",
  rForeArm: "rightElbow",
  lUpLeg: "leftHip",
  rUpLeg: "rightHip",
  lLeg: "leftKnee",
  rLeg: "rightKnee",
};

/**
 * GLB ファイルからアニメーションを読み込み MotionDefinition に変換する。
 *
 * @param url  GLB ファイルの URL（例: "/Dribble.glb"）
 * @param scene  Babylon.js シーン（アセットコンテナのロードに使用）
 * @param name  MotionDefinition の名前
 * @returns 変換された MotionDefinition。失敗時は null。
 */
export async function loadGLBAnimation(
  url: string,
  scene: Scene,
  name: string,
): Promise<MotionDefinition | null> {
  const container = await SceneLoader.LoadAssetContainerAsync("", url, scene, undefined, ".glb");

  try {
    const animGroup = container.animationGroups[0];
    const skeleton = container.skeletons[0];
    if (!animGroup || !skeleton) return null;

    // GLB スケルトンのリグ判別 & ボーン検索
    const rigType = detectRigType(skeleton);
    const foundBones = findAllBones(skeleton, rigType);
    if (!foundBones) return null;

    // TransformNode → Bone のマッピング
    const nodeToBone = new Map<object, Bone>();
    for (const bone of skeleton.bones) {
      const node = bone.getTransformNode();
      if (node) nodeToBone.set(node, bone);
    }

    // Bone → ジョイント名のマッピング（FoundBones 経由）
    const boneToJoint = new Map<Bone, string>();
    for (const [boneKey, bone] of Object.entries(foundBones)) {
      if (!bone) continue;
      const jointName = BONE_KEY_TO_JOINT[boneKey as keyof FoundBones];
      if (jointName) boneToJoint.set(bone, jointName);
    }

    // 各ボーンのレスト姿勢を取得（getRestPose から decompose）
    const restPoses = new Map<Bone, Quaternion>();
    for (const bone of skeleton.bones) {
      const q = new Quaternion();
      bone.getRestPose().decompose(undefined, q, undefined);
      restPoses.set(bone, q);
    }

    // AnimationGroup からキーフレームを抽出
    const frameRate = animGroup.targetedAnimations[0]?.animation.framePerSecond ?? 30;
    const duration = Math.round(((animGroup.to - animGroup.from) / frameRate) * 1000) / 1000;
    const joints: MotionJointData = {};

    for (const ta of animGroup.targetedAnimations) {
      // 回転アニメーションのみ処理
      if (ta.animation.targetProperty !== "rotationQuaternion") continue;

      const bone = nodeToBone.get(ta.target);
      if (!bone) continue;

      const jointName = boneToJoint.get(bone);
      if (!jointName) continue;

      const restQ = restPoses.get(bone);
      if (!restQ) continue;

      const restQInv = Quaternion.Inverse(restQ);
      const standing = STANDING_POSE_OFFSETS[jointName];

      const xKey = jointName + "X";
      const yKey = jointName + "Y";
      const zKey = jointName + "Z";

      for (const key of ta.animation.getKeys()) {
        const time = Math.round(((key.frame - animGroup.from) / frameRate) * 1000) / 1000;
        const animQ = key.value as Quaternion;

        // restQ⁻¹ × animQ → Euler offset (radians) → degrees
        const offsetQ = restQInv.multiply(animQ);
        const euler = offsetQ.toEulerAngles();

        const xDeg = Math.round((euler.x * RAD_TO_DEG - (standing?.x ?? 0)) * 10) / 10;
        const yDeg = Math.round((euler.y * RAD_TO_DEG - (standing?.y ?? 0)) * 10) / 10;
        const zDeg = Math.round((euler.z * RAD_TO_DEG - (standing?.z ?? 0)) * 10) / 10;

        if (!joints[xKey]) joints[xKey] = {};
        if (!joints[yKey]) joints[yKey] = {};
        if (!joints[zKey]) joints[zKey] = {};
        joints[xKey][time] = xDeg;
        joints[yKey][time] = yDeg;
        joints[zKey][time] = zDeg;
      }
    }

    // 全キーフレームが0の軸を削除（MotionDefinition の慣例）
    for (const [key, kf] of Object.entries(joints)) {
      const allZero = Object.values(kf).every(v => v === 0);
      if (allZero) delete joints[key];
    }

    return { name, duration, joints };
  } finally {
    container.dispose();
  }
}
