import {
  Scene,
  Skeleton,
  Bone,
  Matrix,
  Space,
  Mesh,
  AbstractMesh,
  Quaternion,
  Vector3,
} from "@babylonjs/core";
import { MIXAMO_BONE_NAMES } from "@/GamePlay/GameSystem/CharacterModel/Types/CharacterMotionConfig";
import { BONE_OFFSETS, computeBoneRestQuat, worldToParentLocal } from "@/GamePlay/GameSystem/CharacterModel/Character/SkeletonConfig";
import { JOINT_TO_BONE } from "@/GamePlay/GameSystem/CharacterModel/Character/JointBoneMapping";

const B = MIXAMO_BONE_NAMES;

/**
 * Mixamoボーン名 → BONE_OFFSETS/BONE_PRIMARY_CHILD の論理キー 逆引きマップ
 */
const MIXAMO_TO_LOGICAL: Map<string, string> = new Map();
for (const [logical, mixamo] of Object.entries(MIXAMO_BONE_NAMES)) {
  MIXAMO_TO_LOGICAL.set(mixamo, logical);
}

/**
 * CharacterBodyBuilder（Mesh階層）と Skeleton（Bone階層）を橋渡しする。
 *
 * 用途:
 * - IKSystem は Skeleton + Bone を必要とする
 * - ゲームのキャラクターは Mesh 階層（CharacterBodyBuilder）で描画
 *
 * ボーン構造:
 * - GLBモデルと同じ構造: レスト回転がボーンのレストマトリクスに含まれる
 * - Matrix.Compose(scale, restQuat, parentLocalOffset) でボーン作成
 * - captureRestPoses() で正しいレスト回転が取得できる
 *
 * フロー（一方向）:
 * 1. MotionController が setBoneAnimationRotation() で FK 回転をボーンに書き込み（レスト回転合成済み）
 * 2. IKSystem.update() がボーン上で IK 解決
 * 3. syncSkeletonToMesh() でボーン→メッシュ（レスト回転を除去してビジュアルのみ）
 */
export class CharacterSkeletonBridge {
  public readonly skeleton: Skeleton;
  private boneMap: Map<string, Bone> = new Map();

  /** ボーン名（Mixamo名）→ 親ローカルのレスト回転マップ */
  private restQuatMap: Map<string, Quaternion> = new Map();

  /** ジョイント名→ {bone, mesh, restQuat} のペアマップ */
  private syncPairs: { jointName: string; bone: Bone; mesh: Mesh; restQuat: Quaternion }[] = [];

  private constructor(skeleton: Skeleton) {
    this.skeleton = skeleton;
  }

  /**
   * BONE_OFFSETS に基づいてスケルトンを生成し、ジョイント↔ボーン同期を設定する。
   * GLBモデルと同一構造: ボーンのレストマトリクスにレスト回転を含む。
   */
  static create(
    scene: Scene,
    rootMesh: AbstractMesh,
    getJoint: (name: string) => Mesh | null,
  ): CharacterSkeletonBridge {
    const skeleton = new Skeleton("char_skeleton", "char_skeleton", scene);
    (rootMesh as Mesh).skeleton = skeleton;

    const boneMap = new Map<string, Bone>();
    const restQuatMap = new Map<string, Quaternion>();

    /**
     * ボーンを作成する。
     * @param mixamoName Mixamoボーン名（B.hips等）
     * @param logicalName 論理名（"hips"等）— BONE_OFFSETS/computeBoneRestQuat用
     * @param parent 親ボーン
     * @param parentAbsRot 親の累積絶対回転
     * @returns { bone, absRot } 作成されたボーンとこのボーンの絶対回転
     */
    function createBone(
      mixamoName: string,
      logicalName: string,
      parent: Bone | null,
      parentAbsRot: Quaternion,
    ): { bone: Bone; absRot: Quaternion } {
      // ワールド空間オフセットを親ローカルに変換
      const offset = BONE_OFFSETS[logicalName];
      const localOffset = offset
        ? worldToParentLocal(offset, parentAbsRot)
        : Vector3.Zero();

      // 親ローカルでのレスト回転と累積絶対回転
      const { restQuat, absRot } = computeBoneRestQuat(logicalName, parentAbsRot);

      // GLBと同じ構造: Matrix.Compose(scale, restQuat, localOffset)
      const restMatrix = Matrix.Compose(Vector3.One(), restQuat, localOffset);
      const bone = new Bone(mixamoName, skeleton, parent, restMatrix);
      boneMap.set(mixamoName, bone);
      restQuatMap.set(mixamoName, restQuat);

      return { bone, absRot };
    }

    // Root
    const rootAbsRot = Quaternion.Identity();
    restQuatMap.set("Root", Quaternion.Identity());
    const root = new Bone("Root", skeleton, null, Matrix.Identity());
    boneMap.set("Root", root);

    // Hips
    const { bone: hips, absRot: hipsAbs } = createBone(B.hips, "hips", root, rootAbsRot);

    // Spine chain
    const { bone: spine, absRot: spineAbs } = createBone(B.spine, "spine", hips, hipsAbs);
    const { bone: spine1, absRot: spine1Abs } = createBone(B.spine1, "spine1", spine, spineAbs);
    const { bone: spine2, absRot: spine2Abs } = createBone(B.spine2, "spine2", spine1, spine1Abs);
    const { bone: neck, absRot: neckAbs } = createBone(B.neck, "neck", spine2, spine2Abs);
    createBone(B.head, "head", neck, neckAbs);

    // Left arm
    const { bone: lShoulder, absRot: lShoulderAbs } = createBone(B.leftShoulder, "leftShoulder", spine2, spine2Abs);
    const { bone: lArm, absRot: lArmAbs } = createBone(B.leftArm, "leftArm", lShoulder, lShoulderAbs);
    const { bone: lForeArm, absRot: lForeArmAbs } = createBone(B.leftForeArm, "leftForeArm", lArm, lArmAbs);
    createBone(B.leftHand, "leftHand", lForeArm, lForeArmAbs);

    // Right arm
    const { bone: rShoulder, absRot: rShoulderAbs } = createBone(B.rightShoulder, "rightShoulder", spine2, spine2Abs);
    const { bone: rArm, absRot: rArmAbs } = createBone(B.rightArm, "rightArm", rShoulder, rShoulderAbs);
    const { bone: rForeArm, absRot: rForeArmAbs } = createBone(B.rightForeArm, "rightForeArm", rArm, rArmAbs);
    createBone(B.rightHand, "rightHand", rForeArm, rForeArmAbs);

    // Left leg
    const { bone: lUpLeg, absRot: lUpLegAbs } = createBone(B.leftUpLeg, "leftUpLeg", hips, hipsAbs);
    const { bone: lLeg, absRot: lLegAbs } = createBone(B.leftLeg, "leftLeg", lUpLeg, lUpLegAbs);
    const { bone: lFoot, absRot: lFootAbs } = createBone(B.leftFoot, "leftFoot", lLeg, lLegAbs);
    createBone(B.leftToeBase, "leftToeBase", lFoot, lFootAbs);

    // Right leg
    const { bone: rUpLeg, absRot: rUpLegAbs } = createBone(B.rightUpLeg, "rightUpLeg", hips, hipsAbs);
    const { bone: rLeg, absRot: rLegAbs } = createBone(B.rightLeg, "rightLeg", rUpLeg, rUpLegAbs);
    const { bone: rFoot, absRot: rFootAbs } = createBone(B.rightFoot, "rightFoot", rLeg, rLegAbs);
    createBone(B.rightToeBase, "rightToeBase", rFoot, rFootAbs);

    const bridge = new CharacterSkeletonBridge(skeleton);
    bridge.boneMap = boneMap;
    bridge.restQuatMap = restQuatMap;

    // 同期ペアを構築
    for (const [jointName, boneName] of Object.entries(JOINT_TO_BONE)) {
      const bone = boneMap.get(boneName);
      const mesh = getJoint(jointName);
      const restQuat = restQuatMap.get(boneName) ?? Quaternion.Identity();
      if (bone && mesh) {
        bridge.syncPairs.push({ jointName, bone, mesh, restQuat });
      }
    }

    return bridge;
  }

  /**
   * スケルトンボーンの回転をメッシュにコピーする。
   * IKSystem.update() 後に呼ぶ。
   * レスト回転を除去し、アニメーション回転のみをメッシュに適用。
   */
  syncSkeletonToMesh(): void {
    for (const { bone, mesh, restQuat } of this.syncPairs) {
      // ボーンのフルローカル回転を取得
      const fullQuat = bone.getRotationQuaternion(Space.LOCAL)
        ?? Quaternion.Identity();
      // レスト回転を除去して、アニメーション回転のみを抽出
      const restInv = Quaternion.Inverse(restQuat);
      const animQuat = restInv.multiply(fullQuat);
      // Euler角に変換してメッシュに適用
      const euler = animQuat.toEulerAngles();
      mesh.rotation.x = euler.x;
      mesh.rotation.y = euler.y;
      mesh.rotation.z = euler.z;
    }
  }

  /**
   * FK回転（アニメーション回転）をボーンに書き込む。
   * レスト回転と合成: fullQuat = restQuat * animQuat
   */
  setBoneAnimationRotation(jointName: string, animEuler: Vector3): void {
    const boneName = JOINT_TO_BONE[jointName];
    if (!boneName) return;
    const bone = this.boneMap.get(boneName);
    const restQuat = this.restQuatMap.get(boneName);
    if (!bone || !restQuat) return;

    const animQuat = Quaternion.FromEulerAngles(animEuler.x, animEuler.y, animEuler.z);
    const fullQuat = restQuat.multiply(animQuat);
    bone.setRotationQuaternion(fullQuat, Space.LOCAL);
  }

  /**
   * ボーン名でボーンを取得
   */
  getBone(name: string): Bone | null {
    return this.boneMap.get(name) ?? null;
  }

  /**
   * ジョイント名に対応するボーンを取得
   */
  getBoneForJoint(jointName: string): Bone | null {
    const boneName = JOINT_TO_BONE[jointName];
    if (!boneName) return null;
    return this.boneMap.get(boneName) ?? null;
  }

  /**
   * ボーン名に対応するレスト回転を取得
   */
  getRestQuat(boneName: string): Quaternion | null {
    return this.restQuatMap.get(boneName) ?? null;
  }

  dispose(): void {
    this.syncPairs = [];
    this.boneMap.clear();
    this.restQuatMap.clear();
    this.skeleton.dispose();
  }
}
