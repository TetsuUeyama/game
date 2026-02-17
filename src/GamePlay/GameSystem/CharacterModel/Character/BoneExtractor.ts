import { Skeleton, Vector3 } from "@babylonjs/core";
import { MIXAMO_BONE_NAMES } from "@/GamePlay/GameSystem/CharacterModel/Types/CharacterMotionConfig";

/**
 * 各ボーンのローカルオフセット（親ボーンからの相対位置）
 */
export interface BoneLocalOffset {
  name: string;
  parentName: string | null;
  x: number;
  y: number;
  z: number;
}

/**
 * スケルトンから全ボーンのローカルオフセットを抽出する。
 * テストシーンでGLBモデルをロードした後に呼び出し、
 * ProceduralHumanoidの makeBone() 引数として使える値を出力する。
 *
 * @param skeleton ロード済みのスケルトン
 * @returns 各ボーンのローカルオフセット配列
 */
export function extractBoneLocalOffsets(skeleton: Skeleton): BoneLocalOffset[] {
  const offsets: BoneLocalOffset[] = [];

  for (const bone of skeleton.bones) {
    const restPose = bone.getRestPose();
    const localPos = new Vector3();
    restPose.decompose(undefined, undefined, undefined);
    // getRestPose() は Translation 成分にローカルオフセットを持つ
    const translation = restPose.getTranslation();
    localPos.copyFrom(translation);

    const parent = bone.getParent();
    offsets.push({
      name: bone.name,
      parentName: parent ? parent.name : null,
      x: localPos.x,
      y: localPos.y,
      z: localPos.z,
    });
  }

  return offsets;
}

/**
 * 抽出結果をコンソールに見やすく出力する。
 * ProceduralHumanoidのmakeBone()呼び出しとして使える形式で出力。
 */
export function logBoneOffsetsForProcedural(skeleton: Skeleton): void {
  const offsets = extractBoneLocalOffsets(skeleton);
  const B = MIXAMO_BONE_NAMES;

  // Mixamoボーン名→論理名の逆引きマップ
  const reverseMap = new Map<string, string>();
  for (const [logical, mixamo] of Object.entries(B)) {
    reverseMap.set(mixamo, logical);
  }

  console.log("=== GLB Bone Local Offsets (for ProceduralHumanoid) ===");
  console.log("// makeBone(name, parent, x, y, z)");

  for (const offset of offsets) {
    const logical = reverseMap.get(offset.name) ?? offset.name;
    const parentLogical = offset.parentName ? (reverseMap.get(offset.parentName) ?? offset.parentName) : "null";
    const x = offset.x.toFixed(4);
    const y = offset.y.toFixed(4);
    const z = offset.z.toFixed(4);
    console.log(`makeBone(B.${logical}, ${parentLogical}, ${x}, ${y}, ${z});`);
  }

  // ProceduralHumanoidで使用するボーンのみ抽出して定数形式で出力
  console.log("\n=== SKELETON_CONFIG format ===");
  console.log("export const GLB_BONE_OFFSETS = {");
  for (const offset of offsets) {
    const logical = reverseMap.get(offset.name);
    if (!logical) continue; // Mixamo以外のボーンはスキップ
    console.log(`  ${logical}: { x: ${offset.x.toFixed(4)}, y: ${offset.y.toFixed(4)}, z: ${offset.z.toFixed(4)} },`);
  }
  console.log("};");
}
