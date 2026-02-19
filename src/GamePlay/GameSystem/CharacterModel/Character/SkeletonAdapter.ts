/**
 * SkeletonAdapter — 任意のスケルトン（GLB / ProceduralHumanoid）を統一的に扱うアダプター。
 *
 * 責務:
 * - 実行時にレスト回転をキャプチャ（唯一の正解）
 * - リグ種別を自動判別（Mixamo / Rigify / unknown）
 * - 左右対称補正を計算（非対称リグ対応）
 * - 論理名によるボーン検索
 * - FK 書き込み（restQ × correction × eq(offset) × correction⁻¹）
 *
 * AnimationFactory の変換パイプライン（テストシーン）と同一の数学を使用するため、
 * テストシーンと試合モードで同じモーション結果が保証される。
 */
import { Skeleton, Bone, Mesh, Quaternion, Space, Vector3 } from "@babylonjs/core";
import {
  captureRestPoses,
  RestPoseCache,
  findSkeletonBone,
  detectRigType,
  findAllBones,
  computeCorrections,
  RigType,
  FoundBones,
} from "@/GamePlay/GameSystem/CharacterMove/MotionEngine/AnimationFactory";
import { LogicalBoneName } from "@/GamePlay/GameSystem/CharacterModel/Types/CharacterMotionConfig";

/**
 * ジョイント名 → LogicalBoneName の統一マッピング。
 * ゲームモード（KeyframeJoints）とテストシーン（MotionDefinition）の両方をサポート。
 */
const JOINT_TO_LOGICAL: Record<string, LogicalBoneName> = {
  // ゲームモード（KeyframeJoints / MotionController）
  upperBody: "spine2",
  lowerBody: "hips",
  head: "head",
  leftShoulder: "leftArm",
  rightShoulder: "rightArm",
  leftElbow: "leftForeArm",
  rightElbow: "rightForeArm",
  leftHip: "leftUpLeg",
  rightHip: "rightUpLeg",
  leftKnee: "leftLeg",
  rightKnee: "rightLeg",
  // MotionDefinition 追加ジョイント
  hips: "hips",
  spine: "spine",
  leftFoot: "leftFoot",
  rightFoot: "rightFoot",
};

export class SkeletonAdapter {
  readonly skeleton: Skeleton;
  readonly mesh: Mesh;
  readonly rigType: RigType;

  /** 全ボーンのレスト回転（bone初期化用） */
  private _allRestQuats: Map<Bone, Quaternion> = new Map();

  /** FK対象ボーンのレスト回転（BIND_POSE_CORRECTIONS 反映済み） */
  private _fkRestCache: RestPoseCache;

  /** 左右対称補正マップ */
  private _corrections: Map<Bone, Quaternion>;

  /** FK対象ボーン（AnimationFactory 互換） */
  private _foundBones: FoundBones | null;

  constructor(skeleton: Skeleton, mesh: Mesh) {
    this.skeleton = skeleton;
    this.mesh = mesh;
    this.rigType = detectRigType(skeleton);

    // 全ボーンのレスト回転をキャプチャ（bone.getRestPose() は不変）
    for (const bone of skeleton.bones) {
      const q = new Quaternion();
      bone.getRestPose().decompose(undefined, q, undefined);
      this._allRestQuats.set(bone, q);
    }

    // FK対象ボーンのレスト回転（captureRestPoses は BIND_POSE_CORRECTIONS を反映）
    this._fkRestCache = captureRestPoses(skeleton) ?? new Map();

    // 左右対称補正を計算
    this._foundBones = findAllBones(skeleton, this.rigType);
    this._corrections = this._foundBones
      ? computeCorrections(this._foundBones, this._fkRestCache)
      : new Map();
  }

  /**
   * 全ボーンの TRS を初期化する（非FK駆動ボーン含む）。
   * Bone コンストラクタは _localMatrix にレスト行列を格納するが、
   * 内部の _localRotation は未初期化。setRotationQuaternion() で強制初期化する。
   */
  initializeAllBones(): void {
    for (const [bone, restQ] of this._allRestQuats) {
      bone.setRotationQuaternion(restQ, Space.LOCAL);
    }
  }

  /**
   * 論理名でボーンを検索。
   * Mixamo / Rigify / unknown いずれのリグでも自動的に正しいボーンを返す。
   */
  findBone(logicalName: LogicalBoneName): Bone | null {
    return findSkeletonBone(this.skeleton, logicalName, this.rigType);
  }

  /**
   * FK回転をボーンに適用。
   * AnimationFactory の eulerKeysToQuatKeys() と同一の数学:
   *   補正なし: restQ × eq(offset)
   *   補正あり: restQ × corrQ × eq(offset) × corrQ⁻¹
   */
  applyFKRotation(bone: Bone, offsetEulerRad: Vector3): void {
    const restQ = this._fkRestCache.get(bone) ?? this._allRestQuats.get(bone);
    if (!restQ) return;

    const offsetQ = Quaternion.FromEulerAngles(
      offsetEulerRad.x, offsetEulerRad.y, offsetEulerRad.z,
    );

    const corrQ = this._corrections.get(bone);
    let finalQ: Quaternion;
    if (corrQ) {
      finalQ = restQ.multiply(corrQ).multiply(offsetQ).multiply(Quaternion.Inverse(corrQ));
    } else {
      finalQ = restQ.multiply(offsetQ);
    }

    bone.setRotationQuaternion(finalQ, Space.LOCAL);
  }

  /**
   * ジョイント名でFK回転を適用。
   * ゲームモードの MotionController から呼ばれる。
   */
  applyFKRotationByJoint(jointName: string, offsetEulerRad: Vector3): void {
    const logicalName = JOINT_TO_LOGICAL[jointName];
    if (!logicalName) return;
    const bone = this.findBone(logicalName);
    if (!bone) return;
    this.applyFKRotation(bone, offsetEulerRad);
  }

  /** ボーンのレスト回転を取得（FK対象はBIND_POSE_CORRECTIONS反映済み） */
  getRestQuaternion(bone: Bone): Quaternion | undefined {
    return this._fkRestCache.get(bone) ?? this._allRestQuats.get(bone);
  }

  /**
   * ジョイント名でボーンを検索（JOINT_TO_LOGICAL マッピング経由）。
   * ゲームモードの joint 名（"upperBody", "leftShoulder" 等）に対応。
   */
  findBoneByJointName(jointName: string): Bone | null {
    const logicalName = JOINT_TO_LOGICAL[jointName];
    if (!logicalName) return null;
    return this.findBone(logicalName);
  }

  /** FK レスト回転キャッシュ（createSingleMotionPoseData 互換） */
  getRestPoseCache(): RestPoseCache {
    return this._fkRestCache;
  }

  /** FK対象ボーンマップ（AnimationFactory 互換） */
  getFoundBones(): FoundBones | null {
    return this._foundBones;
  }
}
