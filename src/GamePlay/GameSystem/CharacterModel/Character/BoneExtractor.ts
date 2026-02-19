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

/**
 * 2つのスケルトン（GLBモデルと簡易モデル）のレスト回転とボーンオフセットの差異を比較出力する。
 * 差異があるボーンのみ出力。
 */
export function compareSkeletonRestPoses(
  glbSkeleton: Skeleton,
  procSkeleton: Skeleton,
): void {
  const B = MIXAMO_BONE_NAMES;
  const reverseMap = new Map<string, string>();
  for (const [logical, mixamo] of Object.entries(B)) {
    reverseMap.set(mixamo, logical);
  }

  const glbOffsets = extractBoneLocalOffsets(glbSkeleton);
  const procOffsets = extractBoneLocalOffsets(procSkeleton);

  // 簡易モデルのボーンを名前で検索用マップ
  const procMap = new Map<string, BoneLocalOffset>();
  for (const o of procOffsets) procMap.set(o.name, o);

  console.log("=== GLB vs Procedural: Rest Pose Comparison ===");
  console.log("(差異があるボーンのみ表示)");

  let diffCount = 0;
  for (const glb of glbOffsets) {
    const logical = reverseMap.get(glb.name);
    if (!logical) continue;

    const proc = procMap.get(glb.name);
    if (!proc) {
      console.log(`  ${logical}: GLBにのみ存在`);
      diffCount++;
      continue;
    }

    // オフセット差異
    const dx = Math.abs(glb.x - proc.x);
    const dy = Math.abs(glb.y - proc.y);
    const dz = Math.abs(glb.z - proc.z);
    const posDiff = dx > 0.001 || dy > 0.001 || dz > 0.001;

    // レスト回転差異（dot product: 1.0 = 同一, < 1.0 = 差異あり）
    const dot = Math.abs(
      glb.restQuat.x * proc.restQuat.x +
      glb.restQuat.y * proc.restQuat.y +
      glb.restQuat.z * proc.restQuat.z +
      glb.restQuat.w * proc.restQuat.w
    );
    const angleDeg = Math.acos(Math.min(dot, 1.0)) * 2 * (180 / Math.PI);
    const rotDiff = angleDeg > 0.5; // 0.5度以上の差異

    if (posDiff || rotDiff) {
      diffCount++;
      const parts: string[] = [`  ${logical}:`];
      if (posDiff) {
        parts.push(`    offset: GLB(${glb.x.toFixed(4)}, ${glb.y.toFixed(4)}, ${glb.z.toFixed(4)}) vs Proc(${proc.x.toFixed(4)}, ${proc.y.toFixed(4)}, ${proc.z.toFixed(4)})`);
      }
      if (rotDiff) {
        parts.push(`    restQ:  GLB(${glb.restQuat.x.toFixed(4)}, ${glb.restQuat.y.toFixed(4)}, ${glb.restQuat.z.toFixed(4)}, ${glb.restQuat.w.toFixed(4)}) vs Proc(${proc.restQuat.x.toFixed(4)}, ${proc.restQuat.y.toFixed(4)}, ${proc.restQuat.z.toFixed(4)}, ${proc.restQuat.w.toFixed(4)}) [${angleDeg.toFixed(1)}°]`);
      }
      console.log(parts.join("\n"));
    }
  }

  if (diffCount === 0) {
    console.log("  差異なし（完全一致）");
  } else {
    console.log(`\n合計 ${diffCount} ボーンに差異あり`);
  }
}
