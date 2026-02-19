/**
 * MotionData ↔ MotionDefinition 変換ユーティリティ
 *
 * MotionData（ゲームモード）:
 *   keyframes: [{ time, joints: { leftShoulder: {x,y,z}, ... }, position? }]
 *   角度は度、時間は秒
 *
 * MotionDefinition（テストシーン / MotionPlayer）:
 *   joints: { "leftShoulderX": { 0: 0, 0.5: -30 }, ... }
 *   角度は度、時間は秒
 *
 * 変換することで、ゲームのモーションデータをテストシーンの MotionPlayer で
 * プレビューしたり、createSingleMotionPoseData() でクォータニオン変換できる。
 *
 * ジョイント名は MotionData のまま出力される（upperBody, lowerBody, head 等）。
 * AnimationFactory の JOINT_TO_BONE にこれらのエントリが追加されているため、
 * createSingleMotionPoseData() で正しく spine2, hips, head ボーンに変換される。
 */
import {
  MotionData,
  KeyframeJoints,
  JointRotation,
} from "@/GamePlay/GameSystem/CharacterMove/Types/MotionTypes";
import {
  MotionDefinition,
  MotionJointData,
  JointKeyframes,
} from "@/GamePlay/GameSystem/CharacterMove/MotionEngine/MotionDefinitionTypes";
import { STANDING_POSE_OFFSETS } from "@/GamePlay/GameSystem/CharacterMove/MotionEngine/AnimationFactory";

/** KeyframeJoints の全ジョイント名 */
const ALL_JOINT_NAMES: (keyof KeyframeJoints)[] = [
  "upperBody", "lowerBody", "head",
  "leftShoulder", "rightShoulder", "leftElbow", "rightElbow",
  "leftHip", "rightHip", "leftKnee", "rightKnee",
];

/**
 * MotionData → MotionDefinition に変換する。
 *
 * ゲームモードの KeyframeJoints（時間×ジョイント行列）を
 * MotionDefinition のジョイント+軸ごとのキーフレーム形式に変換する。
 * 全キーフレームで値が 0 の軸は省略される。
 *
 * MotionData の角度はレスト姿勢基準（直立オフセット込み）。
 * MotionDefinition の角度は直立姿勢基準（0° = 直立）。
 * → 変換時に STANDING_POSE_OFFSETS を減算する。
 *
 * 注: position データは MotionDefinition に含まれない（FK のみ）。
 */
export function motionDataToDefinition(data: MotionData): MotionDefinition {
  const joints: MotionJointData = {};
  const axisCollector = new Map<string, Map<number, number>>();

  for (const keyframe of data.keyframes) {
    for (const jointName of ALL_JOINT_NAMES) {
      const rotation = keyframe.joints[jointName];
      if (!rotation) continue;

      const standing = STANDING_POSE_OFFSETS[jointName];
      for (const axis of ["X", "Y", "Z"] as const) {
        const key = `${jointName}${axis}`;
        if (!axisCollector.has(key)) axisCollector.set(key, new Map());
        const value = rotation[axis.toLowerCase() as keyof JointRotation];
        const standingValue = standing?.[axis.toLowerCase() as "x" | "y" | "z"] ?? 0;
        axisCollector.get(key)!.set(keyframe.time, value - standingValue);
      }
    }
  }

  for (const [key, timeValues] of axisCollector) {
    const hasNonZero = Array.from(timeValues.values()).some((v) => v !== 0);
    if (!hasNonZero) continue;

    const kf: JointKeyframes = {};
    for (const [time, value] of timeValues) {
      kf[time] = value;
    }
    joints[key] = kf;
  }

  return {
    name: data.name,
    duration: data.duration,
    joints,
  };
}

/**
 * MotionDefinition → MotionData に変換する。
 *
 * テストシーンのモーション定義をゲームモードで使用する場合の変換。
 * MotionDefinition の全キーフレーム時刻を統合し、各時刻で全軸を補間する。
 *
 * MotionDefinition の角度は直立姿勢基準（0° = 直立）。
 * MotionData の角度はレスト姿勢基準（直立オフセット込み）。
 * → 変換時に STANDING_POSE_OFFSETS を加算する。
 *
 * 注: position データは生成されない（MotionDefinition に含まれないため）。
 */
export function motionDefinitionToData(
  def: MotionDefinition,
  loop: boolean = true,
): MotionData {
  const timesSet = new Set<number>();
  for (const keyframes of Object.values(def.joints)) {
    for (const t of Object.keys(keyframes)) {
      timesSet.add(parseFloat(t));
    }
  }
  const times = Array.from(timesSet).sort((a, b) => a - b);

  // ジョイント名をグループ化
  const jointAxes = new Map<string, Map<string, JointKeyframes>>();
  for (const [key, keyframes] of Object.entries(def.joints)) {
    const axis = key.slice(-1); // "X", "Y", "Z"
    const jointName = key.slice(0, -1);
    if (!jointAxes.has(jointName)) jointAxes.set(jointName, new Map());
    jointAxes.get(jointName)!.set(axis, keyframes);
  }

  const keyframes = times.map((time) => {
    const joints: KeyframeJoints = {};

    for (const [jointName, axes] of jointAxes) {
      if (!ALL_JOINT_NAMES.includes(jointName as keyof KeyframeJoints)) continue;

      const standing = STANDING_POSE_OFFSETS[jointName];
      const rotation: JointRotation = {
        x: interpolateAtTime(axes.get("X"), time) + (standing?.x ?? 0),
        y: interpolateAtTime(axes.get("Y"), time) + (standing?.y ?? 0),
        z: interpolateAtTime(axes.get("Z"), time) + (standing?.z ?? 0),
      };
      joints[jointName as keyof KeyframeJoints] = rotation;
    }

    return { time, joints };
  });

  return {
    name: def.name,
    duration: def.duration,
    loop,
    keyframes,
  };
}

/** 指定時刻での値を線形補間で取得する */
function interpolateAtTime(
  keyframes: JointKeyframes | undefined,
  time: number,
): number {
  if (!keyframes) return 0;

  const entries = Object.entries(keyframes)
    .map(([t, v]) => ({ t: parseFloat(t), v }))
    .sort((a, b) => a.t - b.t);

  if (entries.length === 0) return 0;
  if (entries.length === 1) return entries[0].v;

  if (time <= entries[0].t) return entries[0].v;
  if (time >= entries[entries.length - 1].t) return entries[entries.length - 1].v;

  for (let i = 0; i < entries.length - 1; i++) {
    if (entries[i].t <= time && time <= entries[i + 1].t) {
      const span = entries[i + 1].t - entries[i].t;
      const ratio = span > 0 ? (time - entries[i].t) / span : 0;
      return entries[i].v + (entries[i + 1].v - entries[i].v) * ratio;
    }
  }

  return entries[entries.length - 1].v;
}
