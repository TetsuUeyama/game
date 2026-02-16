/**
 * キャラクターモーション設定
 *
 * walkSpeed: 移動速度 (units/sec)
 * turnSpeed: 旋回速度 (rad/sec)
 * blendSharpness: ブレンド遷移速度 (高い=即座に切替)
 * ikWeight: IK影響度 (0=純アニメ, 1=完全IK補正)
 * stepHeight: 足のレイキャスト高さオフセット
 */
export interface CharacterMotionConfig {
  walkSpeed: number;
  turnSpeed: number;
  blendSharpness: number;
  ikWeight: number;
  stepHeight: number;
}

export const DEFAULT_MOTION_CONFIG: CharacterMotionConfig = {
  walkSpeed: 3.0,
  turnSpeed: 2.5,
  blendSharpness: 5.0,
  ikWeight: 1.0,
  stepHeight: 0.5,
};

/**
 * Mixamo標準ボーン名マッピング
 * GLBエクスポート時に "mixamorig:" プレフィックスが付く場合がある
 */
export const MIXAMO_BONE_NAMES = {
  hips: "mixamorig:Hips",
  spine: "mixamorig:Spine",
  spine1: "mixamorig:Spine1",
  spine2: "mixamorig:Spine2",
  neck: "mixamorig:Neck",
  head: "mixamorig:Head",

  leftUpLeg: "mixamorig:LeftUpLeg",
  leftLeg: "mixamorig:LeftLeg",
  leftFoot: "mixamorig:LeftFoot",
  leftToeBase: "mixamorig:LeftToeBase",

  rightUpLeg: "mixamorig:RightUpLeg",
  rightLeg: "mixamorig:RightLeg",
  rightFoot: "mixamorig:RightFoot",
  rightToeBase: "mixamorig:RightToeBase",

  leftShoulder: "mixamorig:LeftShoulder",
  leftArm: "mixamorig:LeftArm",
  leftForeArm: "mixamorig:LeftForeArm",
  leftHand: "mixamorig:LeftHand",

  rightShoulder: "mixamorig:RightShoulder",
  rightArm: "mixamorig:RightArm",
  rightForeArm: "mixamorig:RightForeArm",
  rightHand: "mixamorig:RightHand",
} as const;

/**
 * Blender Rigify ボーン名パターン（数値サフィックス無し）
 *
 * Rigifyリグは DEF- プレフィックスが変形ボーン、ORG- がオリジナル。
 * GLBエクスポート時にノードインデックスが _NNN で付加される
 * （例: "DEF-thigh.L" → "DEF-thigh.L_076"）ため、プレフィックス一致で検索する。
 *
 * 階層:
 *   _rootJoint → root_09 → DEF-spine chain（胴体変形）
 *   _rootJoint → MCH-torso.parent → torso_022
 *     → MCH-spine.001 → ... → ORG-spine_030（脚DEFボーンの親）
 *     → MCH-spine.002 → ... → ORG-spine.003（腕DEFボーンの親）
 */
export const RIGIFY_BONE_NAMES = {
  hips: "torso",
  spine: "ORG-spine.003",
  spine1: "tweak_spine.003",
  spine2: "tweak_spine.004",
  neck: "neck",
  head: "head",

  leftUpLeg: "DEF-thigh.L",
  leftLeg: "DEF-shin.L",
  leftFoot: "DEF-foot.L",
  leftToeBase: "DEF-toe.L",

  rightUpLeg: "DEF-thigh.R",
  rightLeg: "DEF-shin.R",
  rightFoot: "DEF-foot.R",
  rightToeBase: "DEF-toe.R",

  leftShoulder: "DEF-shoulder.L",
  leftArm: "DEF-upper_arm.L",
  leftForeArm: "DEF-forearm.L",
  leftHand: "DEF-hand.L",

  rightShoulder: "DEF-shoulder.R",
  rightArm: "DEF-upper_arm.R",
  rightForeArm: "DEF-forearm.R",
  rightHand: "DEF-hand.R",
} as const;

/** ボーン名マッピングの論理名 */
export type LogicalBoneName = keyof typeof MIXAMO_BONE_NAMES;

/**
 * BlendController への入力
 * speed: 0..1 (0=停止, 1=全力歩行)
 * turnRate: -1..1 (負=左旋回, 正=右旋回)
 */
export interface BlendInput {
  speed: number;
  turnRate: number;
}

/**
 * TargetPose 用のボーン情報
 */
export interface BoneTarget {
  name: string;
  worldPosition: { x: number; y: number; z: number };
  worldRotation: { x: number; y: number; z: number; w: number };
}
