/**
 * AnimationFactory — モーション変換パイプライン
 *
 * 全体の流れ:
 *
 *   1. captureRestPoses()       ← GLBロード直後に1回呼ぶ
 *      bone.getRestPose() からバインドポーズ Quaternion を取得してキャッシュ。
 *      BIND_POSE_CORRECTIONS の補正も適用済み。
 *
 *   2. motionToEulerKeys()      ← 度数 → 純粋オフセット Euler (rad)
 *      MotionDefinition の度数データを、レスト姿勢を含まないオフセットに変換。
 *
 *   3. eulerKeysToQuatKeys()    ← オフセット Euler → 最終 Quaternion
 *      Q_rest × eq(offset) でクォータニオン合成。
 *      旧実装の eq(rest_euler + offset_euler) は数学的に不正確だったため廃止。
 *
 *   4. PoseBlender              ← bone.rotationQuaternion に書き込み
 *      idle/walk を速度比でブレンドして毎フレーム適用。
 *
 * 重要な注意点:
 *   - バインドポーズは getRestPose() から取得（不変）
 *   - getLocalMatrix() は使用禁止（アニメーション状態で変わる）
 *   - IKSystem は PoseBlender の後に実行（FK を上書きするため）
 */
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
} from "@/GamePlay/GameSystem/CharacterMotion/Types/CharacterMotionConfig";
import { PoseData, PoseBoneData } from "@/GamePlay/GameSystem/CharacterMotion/Character/PoseBlender";
import { SingleMotionPoseData } from "@/GamePlay/GameSystem/CharacterMotion/Character/MotionPlayer";
import { MotionDefinition } from "@/GamePlay/GameSystem/CharacterMotion/Motion/MotionTypes";
import { IDLE_MOTION } from "@/GamePlay/GameSystem/CharacterMotion/Motion/IdleMotion";
import { WALK_MOTION } from "@/GamePlay/GameSystem/CharacterMotion/Motion/WalkMotion";

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

/** FoundBones キー → LogicalBoneName（ボーン検索用） */
const FOUND_TO_LOGICAL: Record<keyof FoundBones, LogicalBoneName> = {
  hips: "hips",
  spine: "spine",
  lUpLeg: "leftUpLeg",
  rUpLeg: "rightUpLeg",
  lLeg: "leftLeg",
  rLeg: "rightLeg",
  lFoot: "leftFoot",
  rFoot: "rightFoot",
  lArm: "leftArm",
  rArm: "rightArm",
  lForeArm: "leftForeArm",
  rForeArm: "rightForeArm",
};

const DEG_TO_RAD = Math.PI / 180;
const FPS = 30;

/** ボーンのレスト姿勢キャッシュ（Quaternion で保持） */
export type RestPoseCache = Map<Bone, Quaternion>;

/**
 * バインドポーズの静的補正（度）。
 *
 * 問題: 一部のリグ（Rigify 等）では、右膝(rLeg) のバインドポーズが
 *       左膝と比べて Y 軸方向に約45° ズレており、左右非対称になる。
 *       そのままだと、モーションで Y=0° を指定しても膝が斜めを向く。
 *
 * 解決: captureRestPoses() でレスト姿勢をキャッシュする際に、
 *       ここで指定した度数を Q_rest に乗算して「補正済みレスト姿勢」にする。
 *       → モーションのオフセット 0° で正面を向くようになる。
 *
 * 適用箇所: captureRestPoses() 内で Q_rest = Q_rest × Q_correction
 */
const BIND_POSE_CORRECTIONS: Partial<Record<keyof FoundBones, { x?: number; y?: number; z?: number }>> = {
  rLeg: { y: 45 },
};

// ─── Public API ─────────────────────────────────────────────

/**
 * スケルトンの全対象ボーンのレスト姿勢を取得・キャッシュする。
 * GLBロード直後（PoseBlender 適用前）に1回だけ呼び出すこと。
 *
 * ここでキャッシュした Quaternion が、以降すべての変換の基準（Q_rest）になる。
 * キャッシュする理由: PoseBlender が bone.rotationQuaternion を毎フレーム上書きするため、
 * getLocalMatrix() からは正しいバインドポーズを取れなくなる。
 * getRestPose() は不変だが、BIND_POSE_CORRECTIONS の適用結果も含めて保持したいのでキャッシュする。
 */
export function captureRestPoses(skeleton: Skeleton): RestPoseCache | null {
  const rigType = detectRigType(skeleton);
  const bones = findAllBones(skeleton, rigType);
  if (!bones) return null;

  const cache: RestPoseCache = new Map();
  for (const [key, bone] of Object.entries(bones)) {
    if (bone) {
      // Step 1: bone.getRestPose() から不変のバインドポーズ Quaternion を取得
      let q = restRotQuat(bone);

      // Step 2: BIND_POSE_CORRECTIONS に定義があれば、レスト姿勢自体を補正
      //         Rigify専用: Mixamoリグは左右対称なので補正不要
      if (rigType === "rigify") {
        const corr = BIND_POSE_CORRECTIONS[key as keyof FoundBones];
        if (corr) {
          const corrQ = Quaternion.RotationYawPitchRoll(
            (corr.y ?? 0) * DEG_TO_RAD,
            (corr.x ?? 0) * DEG_TO_RAD,
            (corr.z ?? 0) * DEG_TO_RAD,
          );
          q = q.multiply(corrQ);
        }
      }
      cache.set(bone, q);
    }
  }
  return cache;
}

/**
 * モーション関節名（"leftShoulder" 等）からスケルトンのボーンを取得する。
 * UI でジョイントハイライト表示に使用。
 *
 * findSkeletonBone は Rigify で DEF- プレフィックス以外のボーン（hips="torso",
 * spine="ORG-spine.003"）を返さないため、フォールバックで直接検索する。
 */
export function findBoneForJoint(
  skeleton: Skeleton,
  jointName: string,
): Bone | null {
  const foundKey = JOINT_TO_BONE[jointName];
  if (!foundKey) return null;
  const logicalName = FOUND_TO_LOGICAL[foundKey];
  if (!logicalName) return null;

  // 通常検索（Mixamo / unknown）
  const bone = findSkeletonBone(skeleton, logicalName);
  if (bone) return bone;

  // フォールバック: Rigify の非 DEF ボーン（torso, ORG-spine 等）を直接検索
  const rigifyName = RIGIFY_BONE_NAMES[logicalName];
  if (rigifyName) {
    return skeleton.bones.find((b) =>
      b.name === rigifyName ||
      b.name.startsWith(rigifyName + "_")
    ) ?? null;
  }

  return null;
}

/**
 * スケルトンに対して Idle / Walk のポーズデータを生成する。
 *
 * AnimationGroup ではなく、PoseBlender 用の Quaternion キーフレームデータを返す。
 * PoseBlender が毎フレーム直接ボーンの rotationQuaternion を設定する。
 *
 * 変換パイプライン:
 *   MotionDefinition (度数)
 *     → motionToEulerKeys(): 純粋なオフセット Euler (rad)
 *       → eulerKeysToQuatKeys(): Q_rest × eq(offset) → 最終 Quaternion
 *         → PoseBlender: bone.rotationQuaternion に書き込み
 */
export function createPoseData(
  skeleton: Skeleton,
  restPoses?: RestPoseCache,
): PoseData | null {
  const rigType = detectRigType(skeleton);
  const bones = findAllBones(skeleton, rigType);
  if (!bones) return null;

  const isRigify = rigType === "rigify";

  // 左右対称補正: 右ボーンのレスト姿勢が左のミラーと一致しない場合の補正
  const corrections = computeCorrections(bones, restPoses);

  // Step 1: MotionDefinition → 純粋なオフセット Euler キーフレーム
  //         レスト姿勢は含まない（後段で Quaternion 合成する）
  const idleEntries = motionToEulerKeys(IDLE_MOTION, bones, isRigify);
  const walkEntries = motionToEulerKeys(WALK_MOTION, bones, isRigify);

  const boneMap = new Map<Bone, PoseBoneData>();

  // Step 2: オフセット Euler → 最終 Quaternion
  //         idle は絶対モード: Q_rest × eq(offset)
  for (const { bone, keys } of idleEntries) {
    if (!boneMap.has(bone)) {
      boneMap.set(bone, { bone, idleKeys: [], walkKeys: [] });
    }
    boneMap.get(bone)!.idleKeys = eulerKeysToQuatKeys(keys, bone, corrections, restPoses, false);
  }

  //         walk は isDelta=true なので: eq(offset) のみ（PoseBlender が idle に加算）
  for (const { bone, keys } of walkEntries) {
    if (!boneMap.has(bone)) {
      boneMap.set(bone, { bone, idleKeys: [], walkKeys: [] });
    }
    boneMap.get(bone)!.walkKeys = eulerKeysToQuatKeys(keys, bone, corrections, restPoses, WALK_MOTION.isDelta ?? false);
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
  const walkEntries = motionToEulerKeys(WALK_MOTION, bones, isRigify);

  // プロシージャルスケルトン用: Euler Animation API なので rest + offset に戻す
  const idleGroup = new AnimationGroup("idle", scene);
  for (const { bone, keys } of idleEntries) {
    const rest = restRot(bone);
    const anim = new Animation(
      `idle_${bone.name}`, "rotation", FPS,
      Animation.ANIMATIONTYPE_VECTOR3,
      Animation.ANIMATIONLOOPMODE_CYCLE
    );
    anim.setKeys(keys.map((k) => ({
      frame: k.frame,
      value: new Vector3(rest.x + k.value.x, rest.y + k.value.y, rest.z + k.value.z),
    })));
    idleGroup.addTargetedAnimation(anim, bone);
  }

  const walkGroup = new AnimationGroup("walk", scene);
  for (const { bone, keys } of walkEntries) {
    const rest = restRot(bone);
    const anim = new Animation(
      `walk_${bone.name}`, "rotation", FPS,
      Animation.ANIMATIONTYPE_VECTOR3,
      Animation.ANIMATIONLOOPMODE_CYCLE
    );
    anim.setKeys(keys.map((k) => ({
      frame: k.frame,
      value: new Vector3(rest.x + k.value.x, rest.y + k.value.y, rest.z + k.value.z),
    })));
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
//
// バインドポーズ（レスト姿勢）の取得方法:
//   bone.getRestPose() を使う。これは GLTF ロード時に確定する不変の行列。
//   bone.getLocalMatrix() は絶対NG — アニメーション適用後に値が変わるため、
//   PoseBlender がボーン回転を書き換えた後は正しいバインドポーズを返さない。

/** ボーンのバインドポーズを Euler で取得（プロシージャルスケルトン用） */
function restRot(bone: Bone): Vector3 {
  const q = new Quaternion();
  bone.getRestPose().decompose(undefined, q, undefined);
  return q.toEulerAngles();
}

/** ボーンのバインドポーズを Quaternion で取得（不変、アニメーション状態に依存しない） */
function restRotQuat(bone: Bone): Quaternion {
  const q = new Quaternion();
  // getRestPose() = GLTF の TRS から構築された不変行列（_restMatrix）
  // getLocalMatrix() とは異なり、ランタイムの回転状態に影響されない
  bone.getRestPose().decompose(undefined, q, undefined);
  return q;
}

/** Euler(Vector3) → Quaternion 変換（YawPitchRoll 順序） */
function eq(euler: Vector3): Quaternion {
  return Quaternion.RotationYawPitchRoll(euler.y, euler.x, euler.z);
}

// ─── 左右対称補正 ──────────────────────────────────────────
//
// Rigify リグでは右側ボーン（rUpLeg, rArm）のレスト姿勢が
// 左側のミラーと一致しない場合がある（例: rightHip が Y 軸 45° ズレ）。
// 補正は Euler→Quaternion 変換ステップでのみ適用し、
// motionToEulerKeys（オイラー加算）はそのまま維持する。

/** 補正対象の右→左ペア（全右側ボーン） */
const CORRECTED_PAIRS: [keyof FoundBones, keyof FoundBones][] = [
  ["rUpLeg", "lUpLeg"],
  ["rLeg", "lLeg"],
  ["rFoot", "lFoot"],
  ["rArm", "lArm"],
  ["rForeArm", "lForeArm"],
];

/** クォータニオンを YZ 平面でミラー（Y,Z 成分を反転） */
function mirrorQuatYZ(q: Quaternion): Quaternion {
  return new Quaternion(q.x, -q.y, -q.z, q.w);
}

/**
 * 右側ボーンの対称補正クォータニオンを計算する。
 *
 * 問題: 一部のリグでは右ボーンのレスト姿勢が左のミラーと一致しない。
 *       例: 左膝が前向き、右膝が45°ズレている → 同じオフセットでも見た目が非対称。
 *
 * 計算: Q_corr = Q_rest_R⁻¹ × mirror(Q_rest_L)
 *       → 右レストを左のミラーに変換する回転差分
 *
 * 使い方: eulerKeysToQuatKeys() で
 *   Q_rest × Q_corr × eq(offset) × Q_corr⁻¹
 *   とサンドイッチ適用することで、オフセットが左右対称に効く。
 *
 * ゼロオフセット時は Q_rest がそのまま保持される（スキニング安全）。
 */
function computeCorrections(
  bones: FoundBones,
  restPoses?: RestPoseCache,
): Map<Bone, Quaternion> {
  const corrections = new Map<Bone, Quaternion>();

  for (const [rightKey, leftKey] of CORRECTED_PAIRS) {
    const rightBone = bones[rightKey];
    const leftBone = bones[leftKey];
    if (!rightBone || !leftBone) continue;

    const rightRestQ = restPoses?.get(rightBone) ?? restRotQuat(rightBone);
    const leftRestQ = restPoses?.get(leftBone) ?? restRotQuat(leftBone);
    const idealRightQ = mirrorQuatYZ(leftRestQ);

    const corr = Quaternion.Inverse(rightRestQ).multiply(idealRightQ);

    // Identity に近ければスキップ（すでに対称なリグ）
    if (Math.abs(corr.w) < 0.9999) {
      corrections.set(rightBone, corr);
    }
  }

  return corrections;
}

/**
 * オフセット Euler キーフレーム → Quaternion キーフレームに変換する。
 *
 * これがパイプラインの核心。旧実装では eq(rest_euler + offset_euler) としていたが、
 * オイラー角の加算はクォータニオン積と等価ではない（非可換・ジンバルロック）。
 * 正しくは Q_rest × eq(offset) のクォータニオン積で合成する。
 *
 * keys の value は純粋なオフセット（レスト姿勢は含まない）。
 * restPoses キャッシュの Q_rest には BIND_POSE_CORRECTIONS が反映済み。
 *
 * 4パターン:
 *   絶対モード:         Q_rest × eq(offset)         ... idle 等
 *   絶対モード(補正有): Q_rest × Q_corr × eq(offset) × Q_corr⁻¹
 *   デルタモード:       eq(offset)                   ... walk (idle に加算)
 *   デルタモード(補正有): Q_corr × eq(offset) × Q_corr⁻¹
 */
function eulerKeysToQuatKeys(
  keys: { frame: number; value: Vector3 }[],
  bone: Bone,
  corrections: Map<Bone, Quaternion>,
  restPoses: RestPoseCache | undefined,
  isDelta: boolean,
): { frame: number; quat: Quaternion }[] {
  const corr = corrections.get(bone);
  // restPoses キャッシュがあればそちらを使う（BIND_POSE_CORRECTIONS 反映済み）
  // なければ bone.getRestPose() から直接取得（補正なし）
  const restQ = restPoses?.get(bone) ?? restRotQuat(bone);

  // デルタモード: レスト姿勢は含まない（PoseBlender が idle の上に乗算する）
  if (isDelta) {
    if (!corr) {
      // 補正なし: 純粋なオフセット回転のみ
      return keys.map((k) => ({ frame: k.frame, quat: eq(k.value) }));
    }
    // 補正あり: 左右対称補正フレームでオフセットを適用
    const corrInv = Quaternion.Inverse(corr);
    return keys.map((k) => ({
      frame: k.frame,
      quat: corr.multiply(eq(k.value)).multiply(corrInv),
    }));
  }

  // 絶対モード: Q_rest × eq(offset)
  // → offset=0 なら Q_rest そのもの（= バインドポーズ維持）
  // → offset≠0 なら バインドポーズ基準で相対回転
  if (!corr) {
    return keys.map((k) => ({
      frame: k.frame,
      quat: restQ.multiply(eq(k.value)),
    }));
  }

  // 絶対モード(補正有): Q_rest × Q_corr × eq(offset) × Q_corr⁻¹
  // Q_corr で補正フレームに変換 → オフセット適用 → 元に戻す
  const corrInv = Quaternion.Inverse(corr);
  return keys.map((k) => ({
    frame: k.frame,
    quat: restQ.multiply(corr).multiply(eq(k.value)).multiply(corrInv),
  }));
}

/**
 * 指定ジョイントの補正クォータニオンを取得する。
 * インジケータ矢印の軸補正に使用。補正不要なら null。
 */
export function getJointCorrection(
  skeleton: Skeleton,
  jointName: string,
  restPoses?: RestPoseCache,
): Quaternion | null {
  const rigType = detectRigType(skeleton);
  const bones = findAllBones(skeleton, rigType);
  if (!bones) return null;

  const boneKey = JOINT_TO_BONE[jointName];
  if (!boneKey) return null;

  const bone = bones[boneKey];
  if (!bone) return null;

  const corrections = computeCorrections(bones, restPoses);
  return corrections.get(bone) ?? null;
}

// ─── Motion → Offset Euler Keys 変換 ──────────────────────
//
// パイプラインの第1段: MotionDefinition の度数データ → 純粋なオフセット Euler (rad)
//
// MotionDefinition.joints のフォーマット:
//   "leftShoulderX": { 0: 0, 0.733: 5, 1.5: 0, ... }  ← 度数、時間→値のマップ
//
// 出力: 各ボーンに対して { frame: number, value: Vector3 } の配列
//   value は純粋なオフセット（レスト姿勢は含まない）。
//   後段の eulerKeysToQuatKeys() で Q_rest × eq(offset) として合成する。
//
// Rigify の場合: rigifyAdjustments のオフセット（腕を下ろす等）も加算する。

function motionToEulerKeys(
  motion: MotionDefinition,
  bones: FoundBones,
  isRigify: boolean,
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

    // 純粋なオフセットのみ出力（度→ラジアン変換 + Rigify調整を加算）
    // レスト姿勢(Q_rest)は含めない。eulerKeysToQuatKeys で Q_rest × eq(offset) として合成する。
    const keys = times.map((time) => ({
      frame: Math.round(time * FPS),
      value: new Vector3(
        ((axes.get("X")?.[time] ?? 0) + adjX) * DEG_TO_RAD,
        ((axes.get("Y")?.[time] ?? 0) + adjY) * DEG_TO_RAD,
        ((axes.get("Z")?.[time] ?? 0) + adjZ) * DEG_TO_RAD,
      ),
    }));
    results.push({ bone, keys });
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
    }
  }

  // 残りのボーン: ゼロオフセット（= レスト姿勢維持）
  // offset=0 なので eulerKeysToQuatKeys で Q_rest × eq(0) = Q_rest になる
  for (const bone of Object.values(bones)) {
    if (!bone || processedBones.has(bone)) continue;
    processedBones.add(bone);

    const zero = Vector3.Zero();
    results.push({
      bone,
      keys: [
        { frame: 0, value: zero.clone() },
        { frame: totalFrames, value: zero.clone() },
      ],
    });
  }

  return results;
}

// ─── Single Motion Pose Data ────────────────────────────────

/**
 * スケルトンと MotionDefinition から、MotionPlayer 用のデータを生成する。
 * キーフレーム編集時にも呼び出され、ホットスワップに使用される。
 *
 * 変換は createPoseData と同じパイプライン:
 *   MotionDefinition → motionToEulerKeys() → eulerKeysToQuatKeys() → Quaternion キーフレーム
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
  const corrections = computeCorrections(bones, restPoses);
  const entries = motionToEulerKeys(motion, bones, isRigify);

  return {
    bones: entries.map(({ bone, keys }) => ({
      bone,
      keys: eulerKeysToQuatKeys(keys, bone, corrections, restPoses, motion.isDelta ?? false),
    })),
    frameCount: Math.round(motion.duration * FPS),
    duration: motion.duration,
  };
}
