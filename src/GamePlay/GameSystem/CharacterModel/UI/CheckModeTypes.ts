/**
 * フェイスチェック & モーションチェック UI 用の共有型定義
 */

import { MotionDefinition } from "@/GamePlay/GameSystem/CharacterMove/MotionEngine/MotionDefinitionTypes";

// ── CheckMode ─────────────────────────────────────────────
export type CheckMode = "face" | "motion";

// ── 顔パーツプリセット型定義 ──────────────────────────────
export interface EyePreset {
  diameter: number;
  scaleX: number;
  scaleY: number;
  spacing: number;
  y: number;
  z: number;
  angle: number;
  pupilRatio: number;
  pupilOffsetY: number;
}

export interface NosePreset {
  shape: "box" | "wedge" | "halfCone";
  width: number;
  height: number;
  depth: number;
  y: number;
  z: number;
  topRatio?: number;
}

export interface MouthPreset {
  halfWidth: number;
  height: number;
  depth: number;
  y: number;
  z: number;
  angle: number;
}

export interface EyebrowPreset {
  width: number;
  height: number;
  depth: number;
  spacing: number;
  y: number;
  z: number;
  angle: number;
}

export interface FaceConfig {
  eyes: string;
  eyebrows: string;
  nose: string;
  mouth: string;
}

/** 全パーツの数値パラメータをフラットに保持 */
export interface FaceParams {
  eye: EyePreset;
  eyebrow: EyebrowPreset;
  nose: NosePreset;
  mouth: MouthPreset;
}

// ── プリセットデータ ──────────────────────────────────────

export const EYE_PRESETS: Record<string, EyePreset> = {
  round:  { diameter: 0.025, scaleX: 1.0, scaleY: 1.0, spacing: 0.03,  y: 1.63, z: 0.12, angle: 0,    pupilRatio: 0.7, pupilOffsetY: 0.003 },
  narrow: { diameter: 0.022, scaleX: 1.4, scaleY: 0.6, spacing: 0.03,  y: 1.63, z: 0.12, angle: 0,    pupilRatio: 0.75, pupilOffsetY: 0.002 },
  large:  { diameter: 0.035, scaleX: 1.0, scaleY: 1.0, spacing: 0.035, y: 1.63, z: 0.12, angle: 0,    pupilRatio: 0.65, pupilOffsetY: 0.004 },
  angry:  { diameter: 0.024, scaleX: 1.3, scaleY: 0.7, spacing: 0.03,  y: 1.63, z: 0.12, angle: -0.2, pupilRatio: 0.75, pupilOffsetY: 0.002 },
  sad:    { diameter: 0.024, scaleX: 1.3, scaleY: 0.7, spacing: 0.03,  y: 1.63, z: 0.12, angle: 0.2,  pupilRatio: 0.75, pupilOffsetY: 0.002 },
};

export const NOSE_PRESETS: Record<string, NosePreset> = {
  normal:       { shape: "box",      width: 0.015, height: 0.025, depth: 0.02,  y: 1.59, z: 0.13 },
  pointed:      { shape: "wedge",    width: 0.02, height: 0.03 * Math.sqrt(3), depth: 0.03, y: 1.59, z: 0.13 },
  halfCone:     { shape: "halfCone", width: 0.025, height: 0.04,  depth: 0.025, y: 1.59, z: 0.12, topRatio: 0 },
  halfConeTrunc:{ shape: "halfCone", width: 0.025, height: 0.04,  depth: 0.025, y: 1.59, z: 0.12, topRatio: 0.4 },
  flat:         { shape: "box",      width: 0.025, height: 0.015, depth: 0.015, y: 1.59, z: 0.13 },
};

export const MOUTH_PRESETS: Record<string, MouthPreset> = {
  normal: { halfWidth: 0.02,  height: 0.008, depth: 0.01,  y: 1.55, z: 0.12, angle: 0 },
  smile:  { halfWidth: 0.02,  height: 0.008, depth: 0.01,  y: 1.55, z: 0.12, angle: 0.3 },
  frown:  { halfWidth: 0.02,  height: 0.008, depth: 0.01,  y: 1.55, z: 0.12, angle: -0.3 },
  wide:   { halfWidth: 0.03,  height: 0.008, depth: 0.01,  y: 1.55, z: 0.12, angle: 0 },
  small:  { halfWidth: 0.012, height: 0.006, depth: 0.008, y: 1.55, z: 0.12, angle: 0 },
};

export const EYEBROW_PRESETS: Record<string, EyebrowPreset> = {
  normal: { width: 0.025, height: 0.004, depth: 0.006, spacing: 0.03,  y: 1.655, z: 0.115, angle: 0 },
  angry:  { width: 0.028, height: 0.005, depth: 0.006, spacing: 0.028, y: 1.655, z: 0.115, angle: -0.25 },
  sad:    { width: 0.025, height: 0.004, depth: 0.006, spacing: 0.03,  y: 1.655, z: 0.115, angle: 0.25 },
  thick:  { width: 0.03,  height: 0.007, depth: 0.006, spacing: 0.028, y: 1.655, z: 0.115, angle: 0 },
  thin:   { width: 0.025, height: 0.003, depth: 0.005, spacing: 0.03,  y: 1.655, z: 0.115, angle: 0 },
};

export const FACE_CONFIGS: FaceConfig[] = [
  { eyes: "round", eyebrows: "normal", nose: "normal",        mouth: "normal" },
  { eyes: "angry", eyebrows: "angry",  nose: "halfConeTrunc", mouth: "smile" },
];

// ── ユーティリティ ────────────────────────────────────────

/** FaceConfig(プリセット名) → FaceParams(数値) に変換 */
export function faceConfigToParams(config: FaceConfig): FaceParams {
  return {
    eye: { ...(EYE_PRESETS[config.eyes] ?? EYE_PRESETS.round) },
    eyebrow: { ...(EYEBROW_PRESETS[config.eyebrows] ?? EYEBROW_PRESETS.normal) },
    nose: { ...(NOSE_PRESETS[config.nose] ?? NOSE_PRESETS.normal) },
    mouth: { ...(MOUTH_PRESETS[config.mouth] ?? MOUTH_PRESETS.normal) },
  };
}

/** 各プリセットタイプのキー名一覧 */
export const EYE_PRESET_NAMES = Object.keys(EYE_PRESETS);
export const NOSE_PRESET_NAMES = Object.keys(NOSE_PRESETS);
export const MOUTH_PRESET_NAMES = Object.keys(MOUTH_PRESETS);
export const EYEBROW_PRESET_NAMES = Object.keys(EYEBROW_PRESETS);

// ── スライダー範囲定義 ────────────────────────────────────

export interface SliderDef {
  key: string;
  label: string;
  min: number;
  max: number;
  step: number;
}

export const EYE_SLIDERS: SliderDef[] = [
  { key: "diameter",     label: "diameter",     min: 0.01,  max: 0.06,  step: 0.001 },
  { key: "scaleX",       label: "scaleX",       min: 0.3,   max: 2.0,   step: 0.05 },
  { key: "scaleY",       label: "scaleY",       min: 0.3,   max: 2.0,   step: 0.05 },
  { key: "spacing",      label: "spacing",      min: 0.01,  max: 0.06,  step: 0.001 },
  { key: "y",            label: "y",            min: 1.5,   max: 1.75,  step: 0.005 },
  { key: "z",            label: "z",            min: 0.05,  max: 0.2,   step: 0.005 },
  { key: "angle",        label: "angle",        min: -0.5,  max: 0.5,   step: 0.01 },
  { key: "pupilRatio",   label: "pupilRatio",   min: 0.3,   max: 1.2,   step: 0.05 },
  { key: "pupilOffsetY", label: "pupilOffsetY", min: -0.01, max: 0.01,  step: 0.001 },
];

export const EYEBROW_SLIDERS: SliderDef[] = [
  { key: "width",   label: "width",   min: 0.01,  max: 0.05,  step: 0.001 },
  { key: "height",  label: "height",  min: 0.001, max: 0.015, step: 0.001 },
  { key: "depth",   label: "depth",   min: 0.002, max: 0.015, step: 0.001 },
  { key: "spacing", label: "spacing", min: 0.01,  max: 0.06,  step: 0.001 },
  { key: "y",       label: "y",       min: 1.6,   max: 1.75,  step: 0.005 },
  { key: "z",       label: "z",       min: 0.05,  max: 0.2,   step: 0.005 },
  { key: "angle",   label: "angle",   min: -0.5,  max: 0.5,   step: 0.01 },
];

export const NOSE_SLIDERS: SliderDef[] = [
  { key: "width",    label: "width",    min: 0.005, max: 0.05,  step: 0.001 },
  { key: "height",   label: "height",   min: 0.005, max: 0.08,  step: 0.001 },
  { key: "depth",    label: "depth",    min: 0.005, max: 0.05,  step: 0.001 },
  { key: "y",        label: "y",        min: 1.5,   max: 1.7,   step: 0.005 },
  { key: "z",        label: "z",        min: 0.05,  max: 0.2,   step: 0.005 },
  { key: "topRatio", label: "topRatio", min: 0,     max: 1.0,   step: 0.05 },
];

export const MOUTH_SLIDERS: SliderDef[] = [
  { key: "halfWidth", label: "halfWidth", min: 0.005, max: 0.05,  step: 0.001 },
  { key: "height",    label: "height",    min: 0.002, max: 0.02,  step: 0.001 },
  { key: "depth",     label: "depth",     min: 0.003, max: 0.02,  step: 0.001 },
  { key: "y",         label: "y",         min: 1.45,  max: 1.6,   step: 0.005 },
  { key: "z",         label: "z",         min: 0.05,  max: 0.2,   step: 0.005 },
  { key: "angle",     label: "angle",     min: -0.5,  max: 0.5,   step: 0.01 },
];

export const NOSE_SHAPES: NosePreset["shape"][] = ["box", "wedge", "halfCone"];

// ── コード書き出し ────────────────────────────────────────

/** FaceParams → TypeScript コード文字列 */
export function faceParamsToCode(params: FaceParams[]): string {
  const lines: string[] = ["// ── Face Config (Generated) ──"];

  for (let i = 0; i < params.length; i++) {
    const p = params[i];
    lines.push("");
    lines.push(`// Character ${i}`);
    lines.push(`const CUSTOM_EYE_${i}: EyePreset = ${JSON.stringify(p.eye, null, 2)};`);
    lines.push(`const CUSTOM_EYEBROW_${i}: EyebrowPreset = ${JSON.stringify(p.eyebrow, null, 2)};`);
    lines.push(`const CUSTOM_NOSE_${i}: NosePreset = ${JSON.stringify(p.nose, null, 2)};`);
    lines.push(`const CUSTOM_MOUTH_${i}: MouthPreset = ${JSON.stringify(p.mouth, null, 2)};`);
  }

  return lines.join("\n");
}

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
  "hips", "spine",
  "leftShoulder", "rightShoulder",
  "leftElbow", "rightElbow",
  "leftHip", "rightHip",
  "leftKnee", "rightKnee",
  "leftFoot", "rightFoot",
] as const;

export const AXES = ["X", "Y", "Z"] as const;
