import { Skeleton, Bone, Vector3, Quaternion } from "@babylonjs/core";
import { BoneTarget } from "../types/CharacterMotionConfig";

/**
 * Blend + IK 後の最終ポーズをスナップショットとして保持する。
 *
 * Phase 1: 読み取り専用（デバッグ・可視化用）
 * 将来: Active Ragdoll の PD コントローラーにフィードするためのインターフェース
 */
export class TargetPose {
  private _bones: BoneTarget[] = [];
  private _skeleton: Skeleton | null = null;

  /** スケルトンを設定 */
  initialize(skeleton: Skeleton): void {
    this._skeleton = skeleton;
    this._bones = [];
  }

  /**
   * 現在のスケルトン状態をキャプチャする。
   * BlendController.update() → IKSystem.update() の後に呼ぶこと。
   */
  capture(): void {
    if (!this._skeleton) return;

    const bones = this._skeleton.bones;
    this._bones = bones.map((bone: Bone) => {
      const pos = bone.getAbsolutePosition();
      const rot = bone.getRotationQuaternion(0) ?? Quaternion.Identity();
      return {
        name: bone.name,
        worldPosition: { x: pos.x, y: pos.y, z: pos.z },
        worldRotation: { x: rot.x, y: rot.y, z: rot.z, w: rot.w },
      };
    });
  }

  /** 最終ポーズのスナップショット（読み取り専用） */
  get bones(): ReadonlyArray<BoneTarget> {
    return this._bones;
  }

  /** 指定ボーンのワールド位置を取得 */
  getBonePosition(name: string): Vector3 | null {
    const bone = this._bones.find((b) => b.name === name);
    if (!bone) return null;
    return new Vector3(
      bone.worldPosition.x,
      bone.worldPosition.y,
      bone.worldPosition.z
    );
  }

  dispose(): void {
    this._skeleton = null;
    this._bones = [];
  }
}
