/**
 * スケルトンのボーンローカルオフセット設定
 *
 * ProceduralHumanoid の makeBone() で使用するローカルオフセット値。
 * GLBモデルから抽出した値に差し替えることで、
 * プロシージャルボディとGLBモデルの関節位置を一致させる。
 *
 * 使い方:
 * 1. テストシーンを実行し、コンソールの GLB_BONE_OFFSETS 出力をコピー
 * 2. 以下の BONE_OFFSETS の値を差し替え
 */

import { Quaternion, Vector3 } from "@babylonjs/core";

export interface BoneOffset {
  x: number;
  y: number;
  z: number;
}

/**
 * 各ボーンの親からのローカルオフセット (メートル)
 *
 * TODO: テストシーンで logBoneOffsetsForProcedural() を実行し、
 *       seconf.glb から抽出した値に差し替えること。
 *       現在の値は ProceduralHumanoid のオリジナル値。
 */
export const BONE_OFFSETS: Record<string, BoneOffset> = {
  // Root → Hips
  hips:           { x:  0,      y:  0.95,  z: 0 },

  // Spine chain (Hips → Spine → Spine1 → Spine2 → Neck → Head)
  spine:          { x:  0,      y:  0.12,  z: 0 },
  spine1:         { x:  0,      y:  0.12,  z: 0 },
  spine2:         { x:  0,      y:  0.12,  z: 0 },
  neck:           { x:  0,      y:  0.10,  z: 0 },
  head:           { x:  0,      y:  0.15,  z: 0 },

  // Left arm (Spine2 → LeftShoulder → LeftArm → LeftForeArm → LeftHand)
  leftShoulder:   { x: -0.10,   y:  0.06,  z: 0 },
  leftArm:        { x: -0.04,   y: -0.12,  z: 0 },
  leftForeArm:    { x:  0,      y: -0.26,  z: 0 },
  leftHand:       { x:  0,      y: -0.20,  z: 0 },

  // Right arm (Spine2 → RightShoulder → RightArm → RightForeArm → RightHand)
  rightShoulder:  { x:  0.10,   y:  0.06,  z: 0 },
  rightArm:       { x:  0.04,   y: -0.12,  z: 0 },
  rightForeArm:   { x:  0,      y: -0.26,  z: 0 },
  rightHand:      { x:  0,      y: -0.20,  z: 0 },

  // Left leg (Hips → LeftUpLeg → LeftLeg → LeftFoot → LeftToeBase)
  leftUpLeg:      { x: -0.12,   y: -0.04,  z: 0 },
  leftLeg:        { x:  0,      y: -0.42,  z: 0 },
  leftFoot:       { x:  0,      y: -0.42,  z: 0 },
  leftToeBase:    { x:  0,      y: -0.09,  z: 0.12 },

  // Right leg (Hips → RightUpLeg → RightLeg → RightFoot → RightToeBase)
  rightUpLeg:     { x:  0.12,   y: -0.04,  z: 0 },
  rightLeg:       { x:  0,      y: -0.42,  z: 0 },
  rightFoot:      { x:  0,      y: -0.42,  z: 0 },
  rightToeBase:   { x:  0,      y: -0.09,  z: 0.12 },
};

/**
 * 各ボーンの主要子ボーン名。
 * レスト回転計算に使用: Y軸がこの子ボーンの方向を向く。
 * null = 末端ボーン（親と同じ方向を使用）
 */
const BONE_PRIMARY_CHILD: Record<string, string | null> = {
  hips:           'spine',
  spine:          'spine1',
  spine1:         'spine2',
  spine2:         'neck',
  neck:           'head',
  head:           null,

  leftShoulder:   'leftArm',
  leftArm:        'leftForeArm',
  leftForeArm:    'leftHand',
  leftHand:       null,

  rightShoulder:  'rightArm',
  rightArm:       'rightForeArm',
  rightForeArm:   'rightHand',
  rightHand:      null,

  leftUpLeg:      'leftLeg',
  leftLeg:        'leftFoot',
  leftFoot:       'leftToeBase',
  leftToeBase:    null,

  rightUpLeg:     'rightLeg',
  rightLeg:       'rightFoot',
  rightFoot:      'rightToeBase',
  rightToeBase:   null,
};

/**
 * Y軸(0,1,0)を指定方向に回転するQuaternionを計算。
 * ボーンのレスト回転: ローカルY軸が子ボーン方向を向く。
 *
 * 注意: directionは親ボーンのローカル空間での方向を渡すこと。
 * ワールド空間の方向を渡すと累積回転が不正になる。
 */
function computeRestQuaternion(childOffset: BoneOffset): Quaternion {
  const dir = new Vector3(childOffset.x, childOffset.y, childOffset.z);
  const len = dir.length();
  if (len < 1e-6) return Quaternion.Identity();
  dir.scaleInPlace(1 / len);

  const up = Vector3.Up(); // (0, 1, 0)
  const dot = Vector3.Dot(up, dir);

  // ほぼ同一方向 → 回転不要
  if (dot > 0.9999) return Quaternion.Identity();
  // ほぼ逆方向 → 180° around Z
  if (dot < -0.9999) return new Quaternion(0, 0, 1, 0);

  const axis = Vector3.Cross(up, dir).normalize();
  const angle = Math.acos(Math.max(-1, Math.min(1, dot)));
  return Quaternion.RotationAxis(axis, angle);
}

/**
 * ワールド空間のオフセットを親の回転済みローカル空間に変換する。
 */
export function worldToParentLocal(worldOffset: BoneOffset, parentAbsRot: Quaternion): Vector3 {
  const w = new Vector3(worldOffset.x, worldOffset.y, worldOffset.z);
  const parentInv = Quaternion.Inverse(parentAbsRot);
  const local = new Vector3();
  w.rotateByQuaternionToRef(parentInv, local);
  return local;
}

/**
 * ボーンの親ローカル空間でのレスト回転と累積絶対回転を計算する。
 * GLBモデルと同じ構造: 各ボーンのY軸が子ボーン方向を向く。
 *
 * @param logicalBoneName BONE_OFFSETS/BONE_PRIMARY_CHILD のキー（例: "hips", "leftLeg"）
 * @param parentAbsRot 親ボーンの絶対回転（累積レスト回転）
 * @returns restQuat: 親ローカルのレスト回転, absRot: このボーンの絶対回転
 */
export function computeBoneRestQuat(
  logicalBoneName: string,
  parentAbsRot: Quaternion,
): { restQuat: Quaternion; absRot: Quaternion } {
  const childName = BONE_PRIMARY_CHILD[logicalBoneName];
  if (!childName || !BONE_OFFSETS[childName]) {
    // 末端ボーン: 親ローカルで Identity（親と同じ方向を維持）
    return { restQuat: Quaternion.Identity(), absRot: parentAbsRot.clone() };
  }

  // 子ボーンのワールド空間オフセットを親ローカルに変換
  const childLocalDir = worldToParentLocal(BONE_OFFSETS[childName], parentAbsRot);

  // Y軸を親ローカルでの子方向に回転するクォータニオン
  const restQuat = computeRestQuaternion({ x: childLocalDir.x, y: childLocalDir.y, z: childLocalDir.z });

  // このボーンの絶対回転 = restQuat * parentAbsRot（Babylon.js matrix chain）
  const absRot = restQuat.multiply(parentAbsRot);

  return { restQuat, absRot };
}
