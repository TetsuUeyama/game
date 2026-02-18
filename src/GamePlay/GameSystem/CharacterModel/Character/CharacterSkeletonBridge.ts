import {
  Scene,
  Skeleton,
  Bone,
  Matrix,
  Space,
  Mesh,
  AbstractMesh,
} from "@babylonjs/core";
import { MIXAMO_BONE_NAMES } from "@/GamePlay/GameSystem/CharacterModel/Types/CharacterMotionConfig";
import { BONE_OFFSETS } from "@/GamePlay/GameSystem/CharacterModel/Character/SkeletonConfig";

const B = MIXAMO_BONE_NAMES;
const O = BONE_OFFSETS;

/**
 * ゲームのキャラクター（CharacterBodyBuilder）用ジョイント名 ↔ ボーン名マッピング
 *
 * CharacterBodyBuilder の getJoint() 名 → Skeleton のボーン名（MIXAMO_BONE_NAMES）
 */
const JOINT_TO_BONE: Record<string, string> = {
  upperBody:     B.spine2,       // waistJoint → Spine2
  lowerBody:     B.hips,         // lowerBodyConnection → Hips
  head:          B.head,
  leftShoulder:  B.leftArm,      // leftShoulder joint → LeftArm bone
  rightShoulder: B.rightArm,
  leftElbow:     B.leftForeArm,  // leftElbow joint → LeftForeArm bone
  rightElbow:    B.rightForeArm,
  leftHip:       B.leftUpLeg,    // leftHip joint → LeftUpLeg bone
  rightHip:      B.rightUpLeg,
  leftKnee:      B.leftLeg,      // leftKnee joint → LeftLeg bone
  rightKnee:     B.rightLeg,
};

/**
 * CharacterBodyBuilder（Mesh階層）と Skeleton（Bone階層）を橋渡しする。
 *
 * 用途:
 * - IKSystem は Skeleton + Bone を必要とする
 * - ゲームのキャラクターは Mesh 階層（CharacterBodyBuilder）で描画
 *
 * フロー（一方向）:
 * 1. MotionController が FK 回転をボーンに直接書き込み
 * 2. IKSystem.update() がボーン上で IK 解決
 * 3. syncSkeletonToMesh() でボーン→メッシュ（ビジュアルのみ）
 */
export class CharacterSkeletonBridge {
  public readonly skeleton: Skeleton;
  private boneMap: Map<string, Bone> = new Map();

  /** ジョイント名→ {bone, mesh} のペアマップ */
  private syncPairs: { jointName: string; bone: Bone; mesh: Mesh }[] = [];

  private constructor(skeleton: Skeleton) {
    this.skeleton = skeleton;
  }

  /**
   * BONE_OFFSETS に基づいてスケルトンを生成し、ジョイント↔ボーン同期を設定する。
   *
   * @param scene Babylon.js シーン
   * @param rootMesh キャラクターのルートメッシュ
   * @param getJoint ジョイント名からメッシュを取得する関数
   */
  static create(
    scene: Scene,
    rootMesh: AbstractMesh,
    getJoint: (name: string) => Mesh | null,
  ): CharacterSkeletonBridge {
    const skeleton = new Skeleton("char_skeleton", "char_skeleton", scene);
    (rootMesh as Mesh).skeleton = skeleton;

    const boneMap = new Map<string, Bone>();

    function makeBone(name: string, parent: Bone | null, x: number, y: number, z: number): Bone {
      const bone = new Bone(name, skeleton, parent, Matrix.Translation(x, y, z));
      boneMap.set(name, bone);
      return bone;
    }

    // BONE_OFFSETS と同じ階層でボーンを作成
    const root = makeBone("Root", null, 0, 0, 0);
    const hips = makeBone(B.hips, root, O.hips.x, O.hips.y, O.hips.z);
    const spine = makeBone(B.spine, hips, O.spine.x, O.spine.y, O.spine.z);
    const spine1 = makeBone(B.spine1, spine, O.spine1.x, O.spine1.y, O.spine1.z);
    const spine2 = makeBone(B.spine2, spine1, O.spine2.x, O.spine2.y, O.spine2.z);
    const neck = makeBone(B.neck, spine2, O.neck.x, O.neck.y, O.neck.z);
    makeBone(B.head, neck, O.head.x, O.head.y, O.head.z);

    const lShoulder = makeBone(B.leftShoulder, spine2, O.leftShoulder.x, O.leftShoulder.y, O.leftShoulder.z);
    const lArm = makeBone(B.leftArm, lShoulder, O.leftArm.x, O.leftArm.y, O.leftArm.z);
    const lForeArm = makeBone(B.leftForeArm, lArm, O.leftForeArm.x, O.leftForeArm.y, O.leftForeArm.z);
    makeBone(B.leftHand, lForeArm, O.leftHand.x, O.leftHand.y, O.leftHand.z);

    const rShoulder = makeBone(B.rightShoulder, spine2, O.rightShoulder.x, O.rightShoulder.y, O.rightShoulder.z);
    const rArm = makeBone(B.rightArm, rShoulder, O.rightArm.x, O.rightArm.y, O.rightArm.z);
    const rForeArm = makeBone(B.rightForeArm, rArm, O.rightForeArm.x, O.rightForeArm.y, O.rightForeArm.z);
    makeBone(B.rightHand, rForeArm, O.rightHand.x, O.rightHand.y, O.rightHand.z);

    const lUpLeg = makeBone(B.leftUpLeg, hips, O.leftUpLeg.x, O.leftUpLeg.y, O.leftUpLeg.z);
    const lLeg = makeBone(B.leftLeg, lUpLeg, O.leftLeg.x, O.leftLeg.y, O.leftLeg.z);
    const lFoot = makeBone(B.leftFoot, lLeg, O.leftFoot.x, O.leftFoot.y, O.leftFoot.z);
    makeBone(B.leftToeBase, lFoot, O.leftToeBase.x, O.leftToeBase.y, O.leftToeBase.z);

    const rUpLeg = makeBone(B.rightUpLeg, hips, O.rightUpLeg.x, O.rightUpLeg.y, O.rightUpLeg.z);
    const rLeg = makeBone(B.rightLeg, rUpLeg, O.rightLeg.x, O.rightLeg.y, O.rightLeg.z);
    const rFoot = makeBone(B.rightFoot, rLeg, O.rightFoot.x, O.rightFoot.y, O.rightFoot.z);
    makeBone(B.rightToeBase, rFoot, O.rightToeBase.x, O.rightToeBase.y, O.rightToeBase.z);

    const bridge = new CharacterSkeletonBridge(skeleton);
    bridge.boneMap = boneMap;

    // 同期ペアを構築
    for (const [jointName, boneName] of Object.entries(JOINT_TO_BONE)) {
      const bone = boneMap.get(boneName);
      const mesh = getJoint(jointName);
      if (bone && mesh) {
        bridge.syncPairs.push({ jointName, bone, mesh });
      }
    }

    return bridge;
  }

  /**
   * スケルトンボーンの回転をメッシュにコピーする。
   * IKSystem.update() 後に呼ぶ。
   */
  syncSkeletonToMesh(): void {
    for (const { bone, mesh } of this.syncPairs) {
      const rot = bone.getRotation(Space.LOCAL);
      mesh.rotation.x = rot.x;
      mesh.rotation.y = rot.y;
      mesh.rotation.z = rot.z;
    }
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

  dispose(): void {
    this.syncPairs = [];
    this.boneMap.clear();
    this.skeleton.dispose();
  }
}
