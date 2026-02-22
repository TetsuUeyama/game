/**
 * モーションチェック UI 用の共有型定義
 */

import { MotionDefinition } from "@/GamePlay/GameSystem/CharacterMove/MotionEngine/MotionDefinitionTypes";

/** MotionDefinition → TypeScript コード文字列 */
export function motionToCode(motion: MotionDefinition): string {
  const jointsStr = Object.entries(motion.joints)
    .map(([key, kf]) => {
      const entries = Object.entries(kf)
        .map(([t, v]) => `${t}: ${v}`)
        .join(", ");
      return `    ${key}: { ${entries} },`;
    })
    .join("\n");

  let code = `export const CUSTOM_MOTION: MotionDefinition = {\n`;
  code += `  name: "${motion.name}",\n`;
  code += `  duration: ${motion.duration},\n`;
  code += `  joints: {\n`;
  code += jointsStr + "\n";
  code += `  },\n`;

  if (motion.rigifyAdjustments && Object.keys(motion.rigifyAdjustments).length > 0) {
    const adjStr = Object.entries(motion.rigifyAdjustments)
      .map(([k, v]) => `    ${k}: ${v},`)
      .join("\n");
    code += `  rigifyAdjustments: {\n${adjStr}\n  },\n`;
  }

  code += `};\n`;
  return code;
}

/** JOINT_TO_BONE のジョイント名一覧（UIで使用） */
export const JOINT_NAMES = [
  // Viewer 形式 (hips/spine) と Game 形式 (lowerBody/upperBody/head) の両方を含む
  "hips", "spine",
  "upperBody", "lowerBody", "head",
  "leftShoulder", "rightShoulder",
  "leftElbow", "rightElbow",
  "leftHip", "rightHip",
  "leftKnee", "rightKnee",
  "leftFoot", "rightFoot",
] as const;

export const AXES = ["X", "Y", "Z"] as const;
