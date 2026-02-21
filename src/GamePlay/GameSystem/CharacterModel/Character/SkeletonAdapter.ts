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

  /**
   * X軸ミラー検出フラグ。
   * GLTF ローダーは __root__ に RotY(180°) + Scale(1,1,-1) を設定する。
   * 合成効果は X 軸ミラーで、Y/Z 回転方向が反転する。
   * FK オフセットの Y/Z を反転して補正する。
   */
  private _mirrorYZ: boolean;

  constructor(skeleton: Skeleton, mesh: Mesh) {
    this.skeleton = skeleton;
    this.mesh = mesh;
    this.rigType = detectRigType(skeleton);

    // X-mirror detection: GLTF loader sets Scale(1,1,-1) on rootMesh
    this._mirrorYZ = mesh.scaling.z < 0;

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
   *
   * 肩ジョイントの X 符号規約: 正 = 腕を上げる、負 = 腕を下げる。
   * ボーンのローカル軸では逆方向のため、肩の X を反転してから適用する。
   *
   * X軸ミラー下では Y/Z 回転方向が反転するが、
   * 右側ボーンはローカル軸が左の鏡像のため反転不要。
   */
  applyFKRotationByJoint(jointName: string, offsetEulerRad: Vector3): void {
    const logicalName = JOINT_TO_LOGICAL[jointName];
    if (!logicalName) return;
    const bone = this.findBone(logicalName);
    if (!bone) return;

    // 肩の X 符号反転（正=上、負=下 の規約に統一）
    const isShoulder = jointName === "leftShoulder" || jointName === "rightShoulder";
    const xVal = isShoulder ? -offsetEulerRad.x : offsetEulerRad.x;

    if (this._mirrorYZ) {
      const isRight = jointName.startsWith("right");
      const isArm = jointName.endsWith("Shoulder") || jointName.endsWith("Elbow");
      const ySign = isRight ? 1 : -1;
      const zSign = isArm ? 1 : ySign;
      const corrected = new Vector3(
        xVal,
        offsetEulerRad.y * ySign,
        offsetEulerRad.z * zSign,
      );
      this.applyFKRotation(bone, corrected);
    } else {
      this.applyFKRotation(bone, new Vector3(xVal, offsetEulerRad.y, offsetEulerRad.z));
    }
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

  /** X軸ミラーが有効かどうか（GLTF ハンドネス変換による Y/Z 回転反転） */
  get isXMirrored(): boolean {
    return this._mirrorYZ;
  }

  /**
   * ボーンのワールド座標を取得する。
   * GLB（TransformNode あり）: node.absolutePosition を使用。
   * Procedural: bone.getAbsolutePosition(mesh) を使用。
   */
  getBoneWorldPosition(bone: Bone): Vector3 {
    const node = bone.getTransformNode();
    if (node) return node.absolutePosition.clone();
    return bone.getAbsolutePosition(this.mesh);
  }

  /**
   * ボーンワールド座標クエリ前に呼ぶ。
   * GLB: rootMesh + 全 TransformNode のワールド行列を再計算。
   * Procedural: skeleton の絶対行列を再計算。
   * 両方とも全行を実行して問題ない（TransformNode なしの場合ループは空振り）。
   */
  forceWorldMatrixUpdate(): void {
    this.mesh.computeWorldMatrix(true);
    for (const bone of this.skeleton.bones) {
      const node = bone.getTransformNode();
      if (node) node.computeWorldMatrix(true);
    }
    this.skeleton.computeAbsoluteMatrices(true);
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
