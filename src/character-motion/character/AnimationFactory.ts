import {
  Skeleton,
  Bone,
  Vector3,
  Quaternion,
  Scene,
  Animation,
  AnimationGroup,
} from "@babylonjs/core";
import {
  MIXAMO_BONE_NAMES,
  RIGIFY_BONE_NAMES,
  LogicalBoneName,
} from "../types/CharacterMotionConfig";
import { PoseData, PoseBoneData } from "./PoseBlender";
import { SingleMotionPoseData } from "./MotionPlayer";
import { MotionDefinition } from "../motion/MotionTypes";
import { IDLE_MOTION } from "../motion/IdleMotion";
import { WALK_MOTION } from "../motion/WalkMotion";

/** ボーン検索結果（hips/spine は Rigify では null になる場合がある） */
interface FoundBones {
  hips: Bone | null;
  spine: Bone | null;
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
type RigType = "mixamo" | "rigify" | "unknown";

function detectRigType(skeleton: Skeleton): RigType {
  if (skeleton.bones.some((b) => b.name.includes("mixamorig:"))) return "mixamo";
  if (skeleton.bones.some((b) => b.name.startsWith("DEF-"))) return "rigify";
  return "unknown";
}

/** モーション関節名 → FoundBones キー */
const JOINT_TO_BONE: Record<string, keyof FoundBones> = {
  hips: "hips",
  spine: "spine",
  leftShoulder: "lArm",
  rightShoulder: "rArm",
  leftElbow: "lForeArm",
  rightElbow: "rForeArm",
  leftHip: "lUpLeg",
  rightHip: "rUpLeg",
  leftKnee: "lLeg",
  rightKnee: "rLeg",
  leftFoot: "lFoot",
  rightFoot: "rFoot",
};

const DEG_TO_RAD = Math.PI / 180;
const FPS = 30;

/** ボーンのレスト姿勢キャッシュ（初期化時に取得し、後で再利用） */
export type RestPoseCache = Map<Bone, Vector3>;

// ─── Public API ─────────────────────────────────────────────

/**
 * スケルトンの全対象ボーンのレスト姿勢を取得・キャッシュする。
 * GLBロード直後（PoseBlender 適用前）に呼び出すこと。
 * 後から createSingleMotionPoseData に渡して正しい基準回転を使う。
 */
export function captureRestPoses(skeleton: Skeleton): RestPoseCache | null {
  const rigType = detectRigType(skeleton);
  const bones = findAllBones(skeleton, rigType);
  if (!bones) return null;

  const cache: RestPoseCache = new Map();
  for (const bone of Object.values(bones)) {
    if (bone) {
      cache.set(bone, restRot(bone).clone());
    }
  }
  return cache;
}

/**
 * スケルトンに対して Idle / Walk のポーズデータを生成する。
 *
 * AnimationGroup ではなく、PoseBlender 用の Quaternion キーフレームデータを返す。
 * PoseBlender が毎フレーム直接ボーンの rotationQuaternion を設定する。
 */
export function createPoseData(
  skeleton: Skeleton
): PoseData | null {
  const rigType = detectRigType(skeleton);
  const bones = findAllBones(skeleton, rigType);
  if (!bones) return null;

  const isRigify = rigType === "rigify";

  const idleEntries = motionToEulerKeys(IDLE_MOTION, bones, isRigify);
  const walkEntries = motionToEulerKeys(WALK_MOTION, bones, isRigify, undefined, WALK_MOTION.isDelta);

  // Idle / Walk の Euler キーを Quaternion に変換して PoseBoneData に統合
  const boneMap = new Map<Bone, PoseBoneData>();

  for (const { bone, keys } of idleEntries) {
    if (!boneMap.has(bone)) {
      boneMap.set(bone, { bone, idleKeys: [], walkKeys: [] });
    }
    boneMap.get(bone)!.idleKeys = keys.map((k) => ({
      frame: k.frame,
      quat: eq(k.value),
    }));
  }

  for (const { bone, keys } of walkEntries) {
    if (!boneMap.has(bone)) {
      boneMap.set(bone, { bone, idleKeys: [], walkKeys: [] });
    }
    boneMap.get(bone)!.walkKeys = keys.map((k) => ({
      frame: k.frame,
      quat: eq(k.value),
    }));
  }

  return {
    bones: Array.from(boneMap.values()),
    idleFrameCount: Math.round(IDLE_MOTION.duration * FPS),
    walkFrameCount: Math.round(WALK_MOTION.duration * FPS),
  };
}

/**
 * プロシージャルスケルトン用: AnimationGroup ベースの Idle/Walk アニメーションを生成。
 * rotation (Euler) プロパティをターゲットにする。
 * GLB ボーンには使用しないこと（rotationQuaternion が優先されるため効かない）。
 */
export function createAnimationsForSkeleton(
  scene: Scene,
  skeleton: Skeleton
): { idle: AnimationGroup; walk: AnimationGroup } | null {
  const rigType = detectRigType(skeleton);
  const bones = findAllBones(skeleton, rigType);
  if (!bones) return null;

  const isRigify = rigType === "rigify";

  const idleEntries = motionToEulerKeys(IDLE_MOTION, bones, isRigify);
  const walkEntries = motionToEulerKeys(WALK_MOTION, bones, isRigify, undefined, WALK_MOTION.isDelta);

  const idleGroup = new AnimationGroup("idle", scene);
  for (const { bone, keys } of idleEntries) {
    const anim = new Animation(
      `idle_${bone.name}`, "rotation", FPS,
      Animation.ANIMATIONTYPE_VECTOR3,
      Animation.ANIMATIONLOOPMODE_CYCLE
    );
    anim.setKeys(keys.map((k) => ({ frame: k.frame, value: k.value })));
    idleGroup.addTargetedAnimation(anim, bone);
  }

  const walkGroup = new AnimationGroup("walk", scene);
  for (const { bone, keys } of walkEntries) {
    const anim = new Animation(
      `walk_${bone.name}`, "rotation", FPS,
      Animation.ANIMATIONTYPE_VECTOR3,
      Animation.ANIMATIONLOOPMODE_CYCLE
    );
    anim.setKeys(keys.map((k) => ({ frame: k.frame, value: k.value })));
    walkGroup.addTargetedAnimation(anim, bone);
  }

  return { idle: idleGroup, walk: walkGroup };
}

// ─── Bone Finder ───────────────────────────────────────────

/**
 * 全ボーンを検索して FoundBones を返す。
 * 有効なボーンが1つもなければ null。
 */
function findAllBones(skeleton: Skeleton, rigType: RigType): FoundBones | null {
  const hips =
    rigType === "rigify" ? null : findSkeletonBone(skeleton, "hips", rigType);
  const spine =
    rigType === "rigify" ? null : findSkeletonBone(skeleton, "spine", rigType);

  if (rigType !== "rigify" && !hips) return null;

  const bones: FoundBones = {
    hips,
    spine,
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

// ─── Rest Pose ────────────────────────────────────────────

const _tmpScale = new Vector3();
const _tmpQuat = new Quaternion();
const _tmpPos = new Vector3();

function restRot(bone: Bone): Vector3 {
  bone.getLocalMatrix().decompose(_tmpScale, _tmpQuat, _tmpPos);
  return _tmpQuat.toEulerAngles();
}

// ─── Helpers ───────────────────────────────────────────────

/** Euler (YXZ) → Quaternion 変換 */
function eq(euler: Vector3): Quaternion {
  return Quaternion.RotationYawPitchRoll(euler.y, euler.x, euler.z);
}

// ─── Motion → Euler Keys 変換 ─────────────────────────────
//
// MotionDefinition の度数データを各ボーンの Euler キーフレームに変換する。
// 変換ルール: 最終オイラー = restRot(bone) + (度数 × π/180)

function motionToEulerKeys(
  motion: MotionDefinition,
  bones: FoundBones,
  isRigify: boolean,
  restPoses?: RestPoseCache,
  isDelta?: boolean,
): { bone: Bone; keys: { frame: number; value: Vector3 }[] }[] {
  const results: { bone: Bone; keys: { frame: number; value: Vector3 }[] }[] = [];
  const processedBones = new Set<Bone>();
  const totalFrames = Math.round(motion.duration * FPS);

  // 関節軸をジョイント名ごとにグループ化
  // 例: { "leftShoulder" → { "X" → {...}, "Z" → {...} } }
  const jointAxes = new Map<string, Map<string, Record<number, number>>>();
  for (const [key, keyframes] of Object.entries(motion.joints)) {
    const axis = key.slice(-1); // "X", "Y", "Z"
    const jointName = key.slice(0, -1);
    if (!jointAxes.has(jointName)) {
      jointAxes.set(jointName, new Map());
    }
    jointAxes.get(jointName)!.set(axis, keyframes);
  }

  // アニメーションデータのある関節を処理
  for (const [jointName, axes] of jointAxes) {
    const boneKey = JOINT_TO_BONE[jointName];
    if (!boneKey) continue;
    const bone = bones[boneKey];
    if (!bone) continue;

    processedBones.add(bone);

    // 全軸のユニークな時間ポイントを収集
    const timesSet = new Set<number>();
    for (const kf of axes.values()) {
      for (const t of Object.keys(kf)) timesSet.add(parseFloat(t));
    }
    const times = Array.from(timesSet).sort((a, b) => a - b);

    const adjX = isRigify ? (motion.rigifyAdjustments?.[jointName + "X"] ?? 0) : 0;
    const adjY = isRigify ? (motion.rigifyAdjustments?.[jointName + "Y"] ?? 0) : 0;
    const adjZ = isRigify ? (motion.rigifyAdjustments?.[jointName + "Z"] ?? 0) : 0;

    if (isDelta) {
      // デルタモード: レスト姿勢を加算しない（idle との差分のみ）
      const keys = times.map((time) => ({
        frame: Math.round(time * FPS),
        value: new Vector3(
          ((axes.get("X")?.[time] ?? 0) + adjX) * DEG_TO_RAD,
          ((axes.get("Y")?.[time] ?? 0) + adjY) * DEG_TO_RAD,
          ((axes.get("Z")?.[time] ?? 0) + adjZ) * DEG_TO_RAD,
        ),
      }));
      results.push({ bone, keys });
    } else {
      // 絶対モード: レスト姿勢 + オフセット
      const rest = restPoses?.get(bone) ?? restRot(bone);
      const keys = times.map((time) => ({
        frame: Math.round(time * FPS),
        value: new Vector3(
          rest.x + ((axes.get("X")?.[time] ?? 0) + adjX) * DEG_TO_RAD,
          rest.y + ((axes.get("Y")?.[time] ?? 0) + adjY) * DEG_TO_RAD,
          rest.z + ((axes.get("Z")?.[time] ?? 0) + adjZ) * DEG_TO_RAD,
        ),
      }));
      results.push({ bone, keys });
    }
  }

  // Rigify 調整のみ（アニメーションデータなし）の関節を処理
  if (isRigify && motion.rigifyAdjustments) {
    const adjJoints = new Set<string>();
    for (const key of Object.keys(motion.rigifyAdjustments)) {
      adjJoints.add(key.slice(0, -1));
    }
    for (const jointName of adjJoints) {
      const boneKey = JOINT_TO_BONE[jointName];
      if (!boneKey) continue;
      const bone = bones[boneKey];
      if (!bone || processedBones.has(bone)) continue;

      processedBones.add(bone);
      const adjX = motion.rigifyAdjustments[jointName + "X"] ?? 0;
      const adjY = motion.rigifyAdjustments[jointName + "Y"] ?? 0;
      const adjZ = motion.rigifyAdjustments[jointName + "Z"] ?? 0;

      if (isDelta) {
        // デルタモード: 調整値のみ
        const value = new Vector3(
          adjX * DEG_TO_RAD,
          adjY * DEG_TO_RAD,
          adjZ * DEG_TO_RAD,
        );
        results.push({
          bone,
          keys: [
            { frame: 0, value: value.clone() },
            { frame: totalFrames, value: value.clone() },
          ],
        });
      } else {
        // 絶対モード: レスト + 調整値
        const rest = restPoses?.get(bone) ?? restRot(bone);
        const value = new Vector3(
          rest.x + adjX * DEG_TO_RAD,
          rest.y + adjY * DEG_TO_RAD,
          rest.z + adjZ * DEG_TO_RAD,
        );
        results.push({
          bone,
          keys: [
            { frame: 0, value: value.clone() },
            { frame: totalFrames, value: value.clone() },
          ],
        });
      }
    }
  }

  // 残りのボーン
  for (const bone of Object.values(bones)) {
    if (!bone || processedBones.has(bone)) continue;
    processedBones.add(bone);

    if (isDelta) {
      // デルタモード: ゼロ（Identity）= 追加回転なし
      const zero = Vector3.Zero();
      results.push({
        bone,
        keys: [
          { frame: 0, value: zero.clone() },
          { frame: totalFrames, value: zero.clone() },
        ],
      });
    } else {
      // 絶対モード: レスト姿勢キーフレーム
      const rest = restPoses?.get(bone) ?? restRot(bone);
      results.push({
        bone,
        keys: [
          { frame: 0, value: rest.clone() },
          { frame: totalFrames, value: rest.clone() },
        ],
      });
    }
  }

  return results;
}

// ─── Single Motion Pose Data ────────────────────────────────

/**
 * スケルトンと MotionDefinition から、MotionPlayer 用のデータを生成する。
 * キーフレーム編集時にも呼び出され、ホットスワップに使用される。
 *
 * @param restPoses 初期化時に captureRestPoses() で取得したキャッシュ。
 *                  PoseBlender がボーン回転を変更した後でも正しいレスト姿勢を参照できる。
 */
export function createSingleMotionPoseData(
  skeleton: Skeleton,
  motion: MotionDefinition,
  restPoses?: RestPoseCache,
): SingleMotionPoseData | null {
  const rigType = detectRigType(skeleton);
  const bones = findAllBones(skeleton, rigType);
  if (!bones) return null;

  const isRigify = rigType === "rigify";
  const entries = motionToEulerKeys(motion, bones, isRigify, restPoses, motion.isDelta);

  return {
    bones: entries.map(({ bone, keys }) => ({
      bone,
      keys: keys.map((k) => ({ frame: k.frame, quat: eq(k.value) })),
    })),
    frameCount: Math.round(motion.duration * FPS),
    duration: motion.duration,
  };
}
