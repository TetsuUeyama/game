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
 *      STANDING_POSE_OFFSETS を加算し、0° = 直立姿勢とする。
 *
 *   3. eulerKeysToQuatKeys()    ← オフセット Euler → 最終 Quaternion
 *      Q_rest × eq(offset) でクォータニオン合成。
 *      旧実装の eq(rest_euler + offset_euler) は数学的に不正確だったため廃止。
 *
 *   4. MotionPlayer             ← bone.rotationQuaternion に書き込み
 *      Quaternion Slerp で毎フレーム補間適用。
 *
 * 重要な注意点:
 *   - バインドポーズは getRestPose() から取得（不変）
 *   - getLocalMatrix() は使用禁止（アニメーション状態で変わる）
 *   - IKSystem は MotionPlayer の後に実行（FK を上書きするため）
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
import { SingleMotionPoseData } from "./MotionPlayer";
import { FoundBones, detectRigType, findAllBones } from "./SkeletonUtils";
import { MotionDefinition } from "./MotionDefinitionTypes";
import { IDLE_MOTION } from "./ViewerIdleMotion";
import { WALK_MOTION } from "./ViewerWalkMotion";
import { clampJointDegrees } from "@/GamePlay/GameSystem/CharacterMove/Config/JointLimitsConfig";

// Re-export skeleton utilities for backward compatibility
export { detectRigType, findAllBones, findSkeletonBone } from "./SkeletonUtils";
export type { FoundBones, RigType } from "./SkeletonUtils";

/** モーション関節名 → FoundBones キー */
const JOINT_TO_BONE: Record<string, keyof FoundBones> = {
  hips: "hips",
  spine: "spine",
  upperBody: "spine2",
  lowerBody: "hips",
  head: "head",
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

/**
 * 自然な直立姿勢のオフセット（度）。
 *
 * レスト姿勢（T/A ポーズ）から自然な直立姿勢への補正値。
 * ゲーム IdleMotion の全キーフレーム共通定数から抽出。
 *
 * パイプライン適用:
 *   motionToEulerKeys(): MotionDefinition の値に加算 → ボーンへの最終オフセット
 *   motionDataToDefinition(): MotionData の値から減算 → MotionDefinition の値
 *   motionDefinitionToData(): MotionDefinition の値に加算 → MotionData の値
 *
 * 結果: offset=0 が「自然な直立姿勢」を意味するようになる。
 */
export const STANDING_POSE_OFFSETS: Record<string, { x?: number; y?: number; z?: number }> = {
  leftShoulder:  { z: -6 },
  rightShoulder: { z: 6 },
  leftElbow:     { x: -10, z: 6 },
  rightElbow:    { x: -10, z: -6 },
  leftHip:       { y: -15, z: -8 },
  rightHip:      { y: 15, z: 8 },
  leftKnee:      { x: 5, z: 5 },
  rightKnee:     { x: 5, z: -5 },
};

/**
 * FoundBones キー → 直立オフセット（JOINT_TO_BONE 経由の逆引き）。
 * motionToEulerKeys() の「残りのボーン」セクションで使用。
 */
const BONE_STANDING_OFFSETS: Partial<Record<keyof FoundBones, { x: number; y: number; z: number }>> = {};
for (const [jointName, offsets] of Object.entries(STANDING_POSE_OFFSETS)) {
  const boneKey = JOINT_TO_BONE[jointName];
  if (boneKey) {
    BONE_STANDING_OFFSETS[boneKey] = {
      x: offsets.x ?? 0,
      y: offsets.y ?? 0,
      z: offsets.z ?? 0,
    };
  }
}

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
 * プロシージャルスケルトン用: AnimationGroup ベースの Idle/Walk アニメーションを生成。
 * rotationQuaternion プロパティをターゲットにし、Q_rest × eq(offset) でクォータニオン合成。
 * GLBモデルと同一の変換パイプラインを使用。
 *
 * @param restPoses プロシージャルスケルトンの場合、bone.getRestPose() は Translation-only
 *                  なのでレスト回転を含まない。外部で計算した RestPoseCache を渡すことで
 *                  GLBモデルと同等の Q_rest × eq(offset) パイプラインが動作する。
 */
export function createAnimationsForSkeleton(
  scene: Scene,
  skeleton: Skeleton,
  restPoses?: RestPoseCache,
): { idle: AnimationGroup; walk: AnimationGroup } | null {
  const rigType = detectRigType(skeleton);
  const bones = findAllBones(skeleton, rigType);
  if (!bones) return null;

  const isRigify = rigType === "rigify";
  const corrections = computeCorrections(bones, restPoses);

  const idleEntries = motionToEulerKeys(IDLE_MOTION, bones, isRigify);
  const walkEntries = motionToEulerKeys(WALK_MOTION, bones, isRigify);

  // Quaternionアニメーション: Q_rest × eq(offset)（GLBモデルと同一パイプライン）
  const idleGroup = new AnimationGroup("idle", scene);
  for (const { bone, keys } of idleEntries) {
    const quatKeys = eulerKeysToQuatKeys(keys, bone, corrections, restPoses, false);
    const anim = new Animation(
      `idle_${bone.name}`, "rotationQuaternion", FPS,
      Animation.ANIMATIONTYPE_QUATERNION,
      Animation.ANIMATIONLOOPMODE_CYCLE
    );
    anim.setKeys(quatKeys.map((k) => ({
      frame: k.frame,
      value: k.quat,
    })));
    idleGroup.addTargetedAnimation(anim, bone);
  }

  const walkGroup = new AnimationGroup("walk", scene);
  for (const { bone, keys } of walkEntries) {
    const quatKeys = eulerKeysToQuatKeys(keys, bone, corrections, restPoses, false);
    const anim = new Animation(
      `walk_${bone.name}`, "rotationQuaternion", FPS,
      Animation.ANIMATIONTYPE_QUATERNION,
      Animation.ANIMATIONLOOPMODE_CYCLE
    );
    anim.setKeys(quatKeys.map((k) => ({
      frame: k.frame,
      value: k.quat,
    })));
    walkGroup.addTargetedAnimation(anim, bone);
  }

  return { idle: idleGroup, walk: walkGroup };
}

// ─── Rest Pose ────────────────────────────────────────────
//
// バインドポーズ（レスト姿勢）の取得方法:
//   bone.getRestPose() を使う。これは GLTF ロード時に確定する不変の行列。
//   bone.getLocalMatrix() は絶対NG — アニメーション適用後に値が変わるため、
//   PoseBlender がボーン回転を書き換えた後は正しいバインドポーズを返さない。

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
export function computeCorrections(
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

// ─── Motion → Offset Euler Keys 変換 ──────────────────────
//
// パイプラインの第1段: MotionDefinition の度数データ → 純粋なオフセット Euler (rad)
//
// MotionDefinition.joints のフォーマット:
//   "leftShoulderX": { 0: 0, 0.733: 5, 1.5: 0, ... }  ← 度数、時間→値のマップ
//   0° = 自然な直立姿勢（STANDING_POSE_OFFSETS がベースレイヤーとして加算される）
//
// 出力: 各ボーンに対して { frame: number, value: Vector3 } の配列
//   value は純粋なオフセット（レスト姿勢は含まない、直立オフセットは含む）。
//   後段の eulerKeysToQuatKeys() で Q_rest × eq(offset) として合成する。
//
// 加算される補正:
//   非Rigify: STANDING_POSE_OFFSETS でレスト姿勢→直立姿勢への変換
//   Rigify: rigifyAdjustments のみ（STANDING_POSE_OFFSETS はスキップ）
//           STANDING_POSE_OFFSETS は Mixamo 系リグ用のため Rigify には適用しない

function motionToEulerKeys(
  motion: MotionDefinition,
  bones: FoundBones,
  isRigify: boolean,
  mirrorYZ?: boolean,
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

    // 直立オフセット: MotionDefinition の 0° を自然な直立姿勢にする
    // Rigify: rigifyAdjustments が Rigify 固有の補正を担当 → STANDING_POSE_OFFSETS スキップ
    // 非Rigify: STANDING_POSE_OFFSETS でレスト→直立変換
    const standing = isRigify ? undefined : STANDING_POSE_OFFSETS[jointName];
    const stdX = standing?.x ?? 0;
    const stdY = standing?.y ?? 0;
    const stdZ = standing?.z ?? 0;

    // X-mirror 補正:
    //   Y: 左/センター反転、右そのまま（左右ボーンの Y 軸がミラー）
    //   Z: 腕ジョイントは左右とも反転（Z 軸が非ミラー）、それ以外は Y と同じ
    // 関節軸方向の補正（ボーンローカル軸と規約の不一致を吸収）
    const isShoulder = jointName === "leftShoulder" || jointName === "rightShoulder";
    const isHip = jointName === "leftHip" || jointName === "rightHip";
    const isFoot = jointName === "leftFoot" || jointName === "rightFoot";
    const xS = isShoulder ? -1 : 1;
    const yFootS = isFoot ? -1 : 1;
    const zJointS = (isHip || isFoot) ? -1 : 1;

    const isRight = jointName.startsWith("right");
    const yS = (mirrorYZ && !isRight) ? -1 : 1;
    const isArm = jointName.endsWith("Shoulder") || jointName.endsWith("Elbow");
    const zS = isArm ? 1 : yS;

    // 純粋なオフセットのみ出力（直立オフセット + Rigify調整 + 軸符号補正 → クランプ → ラジアン変換）
    // クランプは軸符号補正後の最終度数値に適用（リミット値 = 最終ボーン角度の制限）
    // レスト姿勢(Q_rest)は含めない。eulerKeysToQuatKeys で Q_rest × eq(offset) として合成する。
    const keys = times.map((time) => {
      const combinedX = ((axes.get("X")?.[time] ?? 0) + stdX + adjX) * xS;
      const combinedY = ((axes.get("Y")?.[time] ?? 0) + stdY + adjY) * yS * yFootS;
      const combinedZ = ((axes.get("Z")?.[time] ?? 0) + stdZ + adjZ) * zS * zJointS;
      return {
        frame: Math.round(time * FPS),
        value: new Vector3(
          clampJointDegrees(jointName, "X", combinedX) * DEG_TO_RAD,
          clampJointDegrees(jointName, "Y", combinedY) * DEG_TO_RAD,
          clampJointDegrees(jointName, "Z", combinedZ) * DEG_TO_RAD,
        ),
      };
    });
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

      const isShoulder = jointName === "leftShoulder" || jointName === "rightShoulder";
      const isHip = jointName === "leftHip" || jointName === "rightHip";
      const isFoot = jointName === "leftFoot" || jointName === "rightFoot";
      const xS = isShoulder ? -1 : 1;
      const yFootS = isFoot ? -1 : 1;
      const zJointS = (isHip || isFoot) ? -1 : 1;
      const isRight = jointName.startsWith("right");
      const yS = (mirrorYZ && !isRight) ? -1 : 1;
      const isArm = jointName.endsWith("Shoulder") || jointName.endsWith("Elbow");
      const zS = isArm ? 1 : yS;
      const value = new Vector3(
        clampJointDegrees(jointName, "X", adjX * xS) * DEG_TO_RAD,
        clampJointDegrees(jointName, "Y", adjY * yS * yFootS) * DEG_TO_RAD,
        clampJointDegrees(jointName, "Z", adjZ * zS * zJointS) * DEG_TO_RAD,
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

  // 残りのボーン: 非Rigify は直立オフセット適用、Rigify はゼロ（レスト姿勢維持）
  for (const [key, bone] of Object.entries(bones)) {
    if (!bone || processedBones.has(bone)) continue;
    processedBones.add(bone);

    const standing = isRigify ? undefined : BONE_STANDING_OFFSETS[key as keyof FoundBones];
    const isRight = key.startsWith("r");
    const yS = (mirrorYZ && !isRight) ? -1 : 1;
    const isArm = key.includes("Arm");
    const zS = isArm ? 1 : yS;
    const offset = standing
      ? new Vector3(standing.x * DEG_TO_RAD, standing.y * DEG_TO_RAD * yS, standing.z * DEG_TO_RAD * zS)
      : Vector3.Zero();
    results.push({
      bone,
      keys: [
        { frame: 0, value: offset.clone() },
        { frame: totalFrames, value: offset.clone() },
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
  mirrorYZ?: boolean,
): SingleMotionPoseData | null {
  const rigType = detectRigType(skeleton);
  const bones = findAllBones(skeleton, rigType);
  if (!bones) return null;

  const isRigify = rigType === "rigify";
  const corrections = computeCorrections(bones, restPoses);
  const entries = motionToEulerKeys(motion, bones, isRigify, mirrorYZ);

  return {
    bones: entries.map(({ bone, keys }) => ({
      bone,
      keys: eulerKeysToQuatKeys(keys, bone, corrections, restPoses, motion.isDelta ?? false),
    })),
    frameCount: Math.round(motion.duration * FPS),
    duration: motion.duration,
  };
}
