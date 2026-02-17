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

interface BoneOffset {
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
