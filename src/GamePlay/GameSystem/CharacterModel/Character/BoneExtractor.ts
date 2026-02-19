import { Quaternion, Skeleton, Vector3 } from "@babylonjs/core";
import { MIXAMO_BONE_NAMES } from "@/GamePlay/GameSystem/CharacterModel/Types/CharacterMotionConfig";

/**
 * 各ボーンのローカルオフセット（親ボーンからの相対位置）+ レスト回転
 */
export interface BoneLocalOffset {
  name: string;
  parentName: string | null;
  x: number;
  y: number;
  z: number;
  /** レスト回転（Quaternion: x, y, z, w） */
  restQuat: { x: number; y: number; z: number; w: number };
}

/**
 * スケルトンから全ボーンのローカルオフセットとレスト回転を抽出する。
 * テストシーンでGLBモデルをロードした後に呼び出し、
 * ProceduralHumanoidの makeBone() 引数として使える値を出力する。
 *
 * @param skeleton ロード済みのスケルトン
 * @returns 各ボーンのローカルオフセット配列（レスト回転含む）
 */
export function extractBoneLocalOffsets(skeleton: Skeleton): BoneLocalOffset[] {
  const offsets: BoneLocalOffset[] = [];

  for (const bone of skeleton.bones) {
    const restPose = bone.getRestPose();
    const translation = new Vector3();
    const rotation = new Quaternion();
    restPose.decompose(undefined, rotation, translation);

    const parent = bone.getParent();
    offsets.push({
      name: bone.name,
      parentName: parent ? parent.name : null,
      x: translation.x,
      y: translation.y,
      z: translation.z,
      restQuat: { x: rotation.x, y: rotation.y, z: rotation.z, w: rotation.w },
    });
  }

  return offsets;
}

/**
 * 抽出結果をコンソールに見やすく出力する。
 * SkeletonConfig の BONE_OFFSETS 形式と、レスト回転の情報を出力。
 */
export function logBoneOffsetsForProcedural(skeleton: Skeleton): void {
  const offsets = extractBoneLocalOffsets(skeleton);
  const B = MIXAMO_BONE_NAMES;

  // Mixamoボーン名→論理名の逆引きマップ
  const reverseMap = new Map<string, string>();
  for (const [logical, mixamo] of Object.entries(B)) {
    reverseMap.set(mixamo, logical);
  }

  console.log("=== GLB Bone Local Offsets (for SkeletonConfig) ===");

  // BONE_OFFSETS 形式で出力（オフセットのみ）
  console.log("\n=== BONE_OFFSETS format ===");
  console.log("export const GLB_BONE_OFFSETS = {");
  for (const offset of offsets) {
    const logical = reverseMap.get(offset.name);
    if (!logical) continue;
    console.log(`  ${logical}: { x: ${offset.x.toFixed(4)}, y: ${offset.y.toFixed(4)}, z: ${offset.z.toFixed(4)} },`);
  }
  console.log("};");

  // レスト回転を出力
  console.log("\n=== Rest Quaternions ===");
  for (const offset of offsets) {
    const logical = reverseMap.get(offset.name);
    if (!logical) continue;
    const q = offset.restQuat;
    console.log(`  ${logical}: Quaternion(${q.x.toFixed(4)}, ${q.y.toFixed(4)}, ${q.z.toFixed(4)}, ${q.w.toFixed(4)})`);
  }

  // makeBone() 呼び出し形式で出力
  console.log("\n=== makeBone() calls ===");
  for (const offset of offsets) {
    const logical = reverseMap.get(offset.name) ?? offset.name;
    const parentLogical = offset.parentName ? (reverseMap.get(offset.parentName) ?? offset.parentName) : "null";
    const x = offset.x.toFixed(4);
    const y = offset.y.toFixed(4);
    const z = offset.z.toFixed(4);
    const q = offset.restQuat;
    console.log(
      `makeBone(B.${logical}, ${parentLogical}, ` +
      `{ x: ${x}, y: ${y}, z: ${z} }, ` +
      `new Quaternion(${q.x.toFixed(4)}, ${q.y.toFixed(4)}, ${q.z.toFixed(4)}, ${q.w.toFixed(4)}));`
    );
  }
}
