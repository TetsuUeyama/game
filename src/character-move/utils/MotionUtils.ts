import { Keyframe, KeyframeJoints, PositionOffset } from "../types/MotionTypes";

/**
 * アニメーションデータからキーフレーム配列を生成する共通関数
 * @param jointAnimations 関節のアニメーションデータ (軸ごとの時間-値マップ)
 * @param positionAnimations 位置のアニメーションデータ (オプショナル)
 * @returns キーフレーム配列
 */
export function buildKeyframes(
  jointAnimations: Record<string, Record<number, number>>,
  positionAnimations?: Record<string, Record<number, number>>
): Keyframe[] {
  // 全てのタイムスタンプを収集
  const times = new Set<number>();
  Object.values(jointAnimations).forEach((timeline) => {
    Object.keys(timeline).forEach((time) => times.add(parseFloat(time)));
  });

  // タイムスタンプをソート
  const sortedTimes = Array.from(times).sort((a, b) => a - b);

  // 各タイムスタンプに対してキーフレームを生成
  return sortedTimes.map((time) => {
    const joints: KeyframeJoints = {
      upperBody: {
        x: jointAnimations.upperBodyX?.[time] ?? 0,
        y: jointAnimations.upperBodyY?.[time] ?? 0,
        z: jointAnimations.upperBodyZ?.[time] ?? 0,
      },
      lowerBody: {
        x: jointAnimations.lowerBodyX?.[time] ?? 0,
        y: jointAnimations.lowerBodyY?.[time] ?? 0,
        z: jointAnimations.lowerBodyZ?.[time] ?? 0,
      },
      head: {
        x: jointAnimations.headX?.[time] ?? 0,
        y: jointAnimations.headY?.[time] ?? 0,
        z: jointAnimations.headZ?.[time] ?? 0,
      },
      leftShoulder: {
        x: jointAnimations.leftShoulderX?.[time] ?? 0,
        y: jointAnimations.leftShoulderY?.[time] ?? 0,
        z: jointAnimations.leftShoulderZ?.[time] ?? 0,
      },
      rightShoulder: {
        x: jointAnimations.rightShoulderX?.[time] ?? 0,
        y: jointAnimations.rightShoulderY?.[time] ?? 0,
        z: jointAnimations.rightShoulderZ?.[time] ?? 0,
      },
      leftElbow: {
        x: jointAnimations.leftElbowX?.[time] ?? 0,
        y: jointAnimations.leftElbowY?.[time] ?? 0,
        z: jointAnimations.leftElbowZ?.[time] ?? 0,
      },
      rightElbow: {
        x: jointAnimations.rightElbowX?.[time] ?? 0,
        y: jointAnimations.rightElbowY?.[time] ?? 0,
        z: jointAnimations.rightElbowZ?.[time] ?? 0,
      },
      leftHip: {
        x: jointAnimations.leftHipX?.[time] ?? 0,
        y: jointAnimations.leftHipY?.[time] ?? 0,
        z: jointAnimations.leftHipZ?.[time] ?? 0,
      },
      rightHip: {
        x: jointAnimations.rightHipX?.[time] ?? 0,
        y: jointAnimations.rightHipY?.[time] ?? 0,
        z: jointAnimations.rightHipZ?.[time] ?? 0,
      },
      leftKnee: {
        x: jointAnimations.leftKneeX?.[time] ?? 0,
        y: jointAnimations.leftKneeY?.[time] ?? 0,
        z: jointAnimations.leftKneeZ?.[time] ?? 0,
      },
      rightKnee: {
        x: jointAnimations.rightKneeX?.[time] ?? 0,
        y: jointAnimations.rightKneeY?.[time] ?? 0,
        z: jointAnimations.rightKneeZ?.[time] ?? 0,
      },
    };

    // 位置アニメーションがある場合は追加
    const position: PositionOffset | undefined = positionAnimations
      ? {
          x: positionAnimations.x?.[time] ?? 0,
          y: positionAnimations.y?.[time] ?? 0,
          z: positionAnimations.z?.[time] ?? 0,
        }
      : undefined;

    return position ? { time, joints, position } : { time, joints };
  });
}
