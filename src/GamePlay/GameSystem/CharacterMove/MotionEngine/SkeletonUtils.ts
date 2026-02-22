/**
 * SkeletonUtils — スケルトン構造のクエリ機能
 *
 * ボーン検索・リグ判別など、アニメーション変換と無関係なスケルトン構造の
 * クエリ機能を提供する。SkeletonAdapter, IKSystem, GLBAnimationLoader が
 * AnimationFactory 経由でなく直接使える。
 */
import { Skeleton, Bone } from "@babylonjs/core";
import {
  MIXAMO_BONE_NAMES,
  RIGIFY_BONE_NAMES,
  LogicalBoneName,
} from "@/GamePlay/GameSystem/CharacterModel/Types/CharacterMotionConfig";

/** ボーン検索結果（hips/spine は Rigify では null になる場合がある） */
export interface FoundBones {
  hips: Bone | null;
  spine: Bone | null;
  spine2: Bone | null;
  head: Bone | null;
  lUpLeg: Bone | null;
  rUpLeg: Bone | null;
  lLeg: Bone | null;
  rLeg: Bone | null;
  lFoot: Bone | null;
  rFoot: Bone | null;
  lArm: Bone | null;
  rArm: Bone | null;
  lForeArm: Bone | null;
  rForeArm: Bone | null;
}

/** リグの種類 */
export type RigType = "mixamo" | "rigify" | "unknown";

export function detectRigType(skeleton: Skeleton): RigType {
  if (skeleton.bones.some((b) => b.name.includes("mixamorig:"))) return "mixamo";
  if (skeleton.bones.some((b) => b.name.startsWith("DEF-"))) return "rigify";
  return "unknown";
}

/**
 * Rigify の非 DEF ボーンをフォールバック検索する。
 * findSkeletonBone は DEF- プレフィックスのないボーンを拒否するため、
 * spine2 (tweak_spine.004) や head などの非 DEF ボーンはこの関数で検索する。
 */
function findRigifyBone(skeleton: Skeleton, logicalName: LogicalBoneName): Bone | null {
  const rigifyName = RIGIFY_BONE_NAMES[logicalName];
  if (!rigifyName) return null;
  return skeleton.bones.find((b) =>
    b.name === rigifyName ||
    (b.name.startsWith(rigifyName + "_") &&
      !b.name.startsWith(rigifyName + "."))
  ) ?? null;
}

/**
 * 全ボーンを検索して FoundBones を返す。
 * 有効なボーンが1つもなければ null。
 */
export function findAllBones(skeleton: Skeleton, rigType: RigType): FoundBones | null {
  const hips =
    rigType === "rigify" ? null : findSkeletonBone(skeleton, "hips", rigType);
  const spine =
    rigType === "rigify" ? null : findSkeletonBone(skeleton, "spine", rigType);

  if (rigType !== "rigify" && !hips) return null;

  const bones: FoundBones = {
    hips,
    spine,
    spine2: findSkeletonBone(skeleton, "spine2", rigType)
      ?? (rigType === "rigify" ? findRigifyBone(skeleton, "spine2") : null),
    head: findSkeletonBone(skeleton, "head", rigType)
      ?? (rigType === "rigify" ? findRigifyBone(skeleton, "head") : null),
    lUpLeg: findSkeletonBone(skeleton, "leftUpLeg", rigType),
    rUpLeg: findSkeletonBone(skeleton, "rightUpLeg", rigType),
    lLeg: findSkeletonBone(skeleton, "leftLeg", rigType),
    rLeg: findSkeletonBone(skeleton, "rightLeg", rigType),
    lFoot: findSkeletonBone(skeleton, "leftFoot", rigType),
    rFoot: findSkeletonBone(skeleton, "rightFoot", rigType),
    lArm: findSkeletonBone(skeleton, "leftArm", rigType),
    rArm: findSkeletonBone(skeleton, "rightArm", rigType),
    lForeArm: findSkeletonBone(skeleton, "leftForeArm", rigType),
    rForeArm: findSkeletonBone(skeleton, "rightForeArm", rigType),
  };

  if (!Object.values(bones).some((b) => b !== null)) return null;

  return bones;
}

/**
 * スケルトンからボーンを論理名で検索する。
 * AnimationFactory / IKSystem 共用。
 */
export function findSkeletonBone(
  skeleton: Skeleton,
  logicalName: LogicalBoneName,
  rigType?: RigType
): Bone | null {
  const mixamoName = MIXAMO_BONE_NAMES[logicalName];
  const rigifyPattern = RIGIFY_BONE_NAMES[logicalName];
  const rig = rigType ?? detectRigType(skeleton);

  if (rig === "rigify") {
    if (!rigifyPattern || !rigifyPattern.startsWith("DEF-")) return null;
    return (
      skeleton.bones.find(
        (b) =>
          b.name === rigifyPattern ||
          (b.name.startsWith(rigifyPattern + "_") &&
            !b.name.startsWith(rigifyPattern + "."))
      ) ?? null
    );
  }

  const exact = skeleton.bones.find((b) => b.name === mixamoName);
  if (exact) return exact;

  const genericName = mixamoName.replace("mixamorig:", "");
  const generic = skeleton.bones.find((b) => b.name === genericName);
  if (generic) return generic;

  const lower = genericName.toLowerCase();
  const fuzzy = skeleton.bones.find((b) =>
    b.name.toLowerCase().includes(lower)
  );
  return fuzzy ?? null;
}
