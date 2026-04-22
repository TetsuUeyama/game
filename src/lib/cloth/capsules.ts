import type { CapsuleDef } from './types';

/**
 * 人体ボーン名一覧 (Mixamo 互換)。pin 候補の絞り込みに使う。
 */
export const HUMANOID_BONES: readonly string[] = [
  'Hips', 'Spine', 'Spine1', 'Spine2', 'Neck', 'Head',
  'LeftShoulder', 'LeftArm', 'LeftForeArm', 'LeftHand',
  'RightShoulder', 'RightArm', 'RightForeArm', 'RightHand',
  'LeftUpLeg', 'LeftLeg', 'LeftFoot',
  'RightUpLeg', 'RightLeg', 'RightFoot',
];

/**
 * 布の上端 pin で使うデフォルトの胴体系ボーン。
 * 脚・腕は含めない → 脚腕の動きで布が引きずられる事を防ぐ。
 */
export const DEFAULT_ANCHOR_BONES: readonly string[] = [
  'Hips', 'Spine', 'Spine1', 'Spine2', 'Neck', 'Head',
  'LeftShoulder', 'RightShoulder',
];

/**
 * Mixamo 互換スケルトン向け人体カプセル定義（QM body 近似）。
 * 半径はワールド単位（m）。キャラに合わせてカスタマイズ可。
 */
export const MIXAMO_HUMANOID_CAPSULES: CapsuleDef[] = [
  // 胴体
  { startBone: 'Hips', endBone: 'Spine', radius: 0.11 },
  { startBone: 'Spine', endBone: 'Spine1', radius: 0.10 },
  { startBone: 'Spine1', endBone: 'Spine2', radius: 0.11 },
  { startBone: 'Spine2', endBone: 'Neck', radius: 0.09 },
  { startBone: 'Neck', endBone: 'Head', radius: 0.09 },
  // 肩から腕
  { startBone: 'Spine2', endBone: 'LeftShoulder', radius: 0.07 },
  { startBone: 'Spine2', endBone: 'RightShoulder', radius: 0.07 },
  { startBone: 'LeftShoulder', endBone: 'LeftArm', radius: 0.055 },
  { startBone: 'LeftArm', endBone: 'LeftForeArm', radius: 0.045 },
  { startBone: 'LeftForeArm', endBone: 'LeftHand', radius: 0.04 },
  { startBone: 'RightShoulder', endBone: 'RightArm', radius: 0.055 },
  { startBone: 'RightArm', endBone: 'RightForeArm', radius: 0.045 },
  { startBone: 'RightForeArm', endBone: 'RightHand', radius: 0.04 },
  // 腰から脚
  { startBone: 'Hips', endBone: 'LeftUpLeg', radius: 0.09 },
  { startBone: 'LeftUpLeg', endBone: 'LeftLeg', radius: 0.075 },
  { startBone: 'LeftLeg', endBone: 'LeftFoot', radius: 0.055 },
  { startBone: 'Hips', endBone: 'RightUpLeg', radius: 0.09 },
  { startBone: 'RightUpLeg', endBone: 'RightLeg', radius: 0.075 },
  { startBone: 'RightLeg', endBone: 'RightFoot', radius: 0.055 },
];
